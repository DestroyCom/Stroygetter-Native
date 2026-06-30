use crate::commands::settings::{build_common_args, build_youtube_args, DownloadSettingsState};
use crate::db::{self, DbConn, DownloadRecord};
use crate::sidecar;
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::mpsc;
use uuid::Uuid;

#[derive(Serialize, Clone)]
pub struct ProgressPayload {
    pub phase: String,
    pub percent: f64,
}

fn now_ts() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

pub fn effective_dir(custom: Option<&str>) -> std::path::PathBuf {
    if let Some(dir) = custom.filter(|s| !s.is_empty()) {
        let p = std::path::PathBuf::from(dir);
        if p.is_dir() {
            return p;
        }
    }
    dirs::download_dir().unwrap_or_else(|| std::path::PathBuf::from("."))
}

fn unique_path(base: &std::path::Path) -> std::path::PathBuf {
    if !base.exists() {
        return base.to_path_buf();
    }
    let stem = base.file_stem().unwrap_or_default().to_string_lossy().to_string();
    let ext = base.extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    let dir = base.parent().unwrap_or(std::path::Path::new("."));
    let mut i = 1u32;
    loop {
        let candidate = dir.join(format!("{} ({}){}", stem, i, ext));
        if !candidate.exists() {
            return candidate;
        }
        i += 1;
    }
}

fn sanitize(title: &str) -> String {
    title
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { '_' })
        .collect::<String>()
        .trim()
        .to_string()
}

pub fn validate_url(url: &str) -> Result<(), String> {
    if url.starts_with("https://") || url.starts_with("http://") {
        Ok(())
    } else {
        Err(format!("Invalid URL scheme — only http/https are allowed"))
    }
}

fn validate_format_id(format_id: &str) -> Result<(), String> {
    // Reject entries that start with a dash (command-line flag injection)
    if format_id.starts_with('-') {
        return Err(format!("Invalid format_id — cannot start with dash"));
    }
    // Reject entries containing semicolons or ampersands (command injection)
    if format_id.contains(';') || format_id.contains('&') || format_id.contains('|') {
        return Err(format!("Invalid format_id — contains disallowed characters"));
    }
    // Ensure only alphanumeric + safe special chars are used
    let valid = format_id.chars().all(|c| c.is_alphanumeric() || matches!(c, '+' | '-' | '_' | '.' | '/' | '@' | '[' | ']' | ',' | ' '));
    if valid {
        Ok(())
    } else {
        Err(format!("Invalid format_id — contains disallowed characters"))
    }
}

/// Returns the path to a Tauri sidecar binary (e.g. "ffmpeg") on disk.
/// Tauri names sidecars with the target triple suffix (e.g. "ffmpeg-aarch64-apple-darwin").
pub fn get_sidecar_exe(name: &str) -> Option<String> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    let os_part = match std::env::consts::OS {
        "macos"   => "apple-darwin",
        "linux"   => "unknown-linux-gnu",
        "windows" => "pc-windows-msvc",
        other     => other,
    };
    let triple = format!("{}-{}", std::env::consts::ARCH, os_part);
    #[cfg(target_os = "windows")]
    let candidates = [
        dir.join(format!("{name}-{triple}.exe")),
        dir.join(format!("{name}.exe")),
    ];
    #[cfg(not(target_os = "windows"))]
    let candidates = [
        dir.join(format!("{name}-{triple}")),
        dir.join(name),
    ];
    candidates.into_iter().find(|p| p.exists()).map(|p| p.to_string_lossy().to_string())
}

fn parse_percent(line: &str) -> Option<f64> {
    // yt-dlp outputs: [download]  42.5% of ...
    if line.contains("[download]") {
        let parts: Vec<&str> = line.split_whitespace().collect();
        for part in parts {
            if part.ends_with('%') {
                return part.trim_end_matches('%').parse().ok();
            }
        }
    }
    None
}

async fn run_with_progress(
    app: &AppHandle,
    sidecar_name: &str,
    args: Vec<String>,
    phase: &str,
    dl_settings: &crate::commands::settings::DownloadSettings,
) -> Result<sidecar::SidecarOutput, String> {
    let (tx, mut rx) = mpsc::channel::<String>(100);

    let app_emit = app.clone();
    let phase_emit = phase.to_string();
    tokio::spawn(async move {
        while let Some(line) = rx.recv().await {
            if let Some(pct) = parse_percent(&line) {
                let _ = app_emit.emit(
                    "download://progress",
                    ProgressPayload { phase: phase_emit.clone(), percent: pct },
                );
            }
        }
    });

    // Prepend common args (cookies only — YouTube-specific headers added separately).
    let mut all_args = build_common_args(dl_settings);
    all_args.extend(args);

    let args_ref: Vec<&str> = all_args.iter().map(|s| s.as_str()).collect();
    sidecar::run_sidecar(app, sidecar_name, &args_ref, Some(tx)).await
}

fn record_from(url: &str, title: &str, author: &str, thumbnail: Option<&str>, fmt: &str, path: &str) -> DownloadRecord {
    DownloadRecord {
        id: uuid::Uuid::new_v4().to_string(),
        url: url.to_string(),
        title: title.to_string(),
        author: Some(author.to_string()),
        thumbnail_url: thumbnail.map(|s| s.to_string()),
        format: fmt.to_string(),
        file_path: path.to_string(),
        created_at: now_ts(),
    }
}

#[tauri::command]
pub async fn download_video(
    app: AppHandle,
    dl_settings: State<'_, DownloadSettingsState>,
    url: String,
    itag: String,
    title: String,
    author: String,
    thumbnail: Option<String>,
) -> Result<String, String> {
    let settings = dl_settings.0.lock().map_err(|e| e.to_string())?.clone();
    validate_url(&url)?;
    let safe = sanitize(&title);
    let out = unique_path(&effective_dir(settings.download_dir.as_deref()).join(format!("{}.mp4", safe)));
    let out_str = out.to_string_lossy().to_string();

    let tmp_id = Uuid::new_v4().simple().to_string();
    let tmp_subdir = std::env::temp_dir().join(format!("stroygetter_{}", tmp_id));
    std::fs::create_dir_all(&tmp_subdir).map_err(|e| e.to_string())?;
    let video_tmp = tmp_subdir.join(format!("{}_video.mp4", safe));
    let audio_tmp = tmp_subdir.join(format!("{}_audio.m4a", safe));
    let video_tmp_str = video_tmp.to_string_lossy().to_string();
    let audio_tmp_str = audio_tmp.to_string_lossy().to_string();

    // PO token fetched once, reused for both streams
    let token = if crate::pot::is_youtube_url(&url) {
        crate::pot::get_po_token(&app, &url).await
    } else {
        None
    };

    let mut video_args = build_youtube_args();
    video_args.extend(["-f".to_string(), itag.clone()]);
    if let Some(ref t) = token { video_args.extend(crate::pot::build_pot_args(t)); }
    video_args.extend(["-o".to_string(), video_tmp_str.clone(), url.clone()]);

    let mut audio_args = build_youtube_args();
    audio_args.extend(["-f".to_string(), "ba[ext=m4a]/ba[acodec^=mp4a]/ba".to_string()]);
    if let Some(ref t) = token { audio_args.extend(crate::pot::build_pot_args(t)); }
    audio_args.extend(["-o".to_string(), audio_tmp_str.clone(), url.clone()]);

    log::info!("download_video: start parallel url={url} itag={itag} title={title:?}");

    let app2 = app.clone();
    let settings2 = settings.clone();
    let (video_result, audio_result) = tokio::join!(
        run_with_progress(&app,  "yt-dlp", video_args, "video", &settings),
        run_with_progress(&app2, "yt-dlp", audio_args, "audio", &settings2),
    );

    let cleanup = || {
        let _ = std::fs::remove_dir_all(&tmp_subdir);
    };
    if let Err(e) = video_result { cleanup(); log::error!("download_video: video stream failed — {e}"); return Err(e); }
    if let Err(e) = audio_result { cleanup(); log::error!("download_video: audio stream failed — {e}"); return Err(e); }

    let ffmpeg = get_sidecar_exe("ffmpeg").ok_or_else(|| { cleanup(); "ffmpeg not found".to_string() })?;
    log::debug!("download_video: merging → {out_str}");
    let merge = tokio::process::Command::new(&ffmpeg)
        .args(["-i", &video_tmp_str, "-i", &audio_tmp_str,
               "-map", "0:v", "-map", "1:a", "-c", "copy", "-y", &out_str])
        .output()
        .await
        .map_err(|e| { cleanup(); e.to_string() })?;
    cleanup();

    if !merge.status.success() {
        let err = String::from_utf8_lossy(&merge.stderr).to_string();
        log::error!("download_video: ffmpeg merge failed — {err}");
        return Err(format!("ffmpeg merge failed: {err}"));
    }

    log::info!("download_video: complete → {out_str}");
    let db = app.state::<DbConn>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::insert(&conn, &record_from(&url, &title, &author, thumbnail.as_deref(), "mp4", &out_str))
        .map_err(|e| e.to_string())?;

    Ok(out_str)
}

#[tauri::command]
pub async fn download_audio(
    app: AppHandle,
    dl_settings: State<'_, DownloadSettingsState>,
    url: String,
    title: String,
    author: String,
    thumbnail: Option<String>,
) -> Result<String, String> {
    let settings = dl_settings.0.lock().map_err(|e| e.to_string())?.clone();
    validate_url(&url)?;
    let safe = sanitize(&title);
    let out = unique_path(&effective_dir(settings.download_dir.as_deref()).join(format!("{}.mp3", safe)));
    let out_str = out.to_string_lossy().to_string();

    let mut args = build_youtube_args();
    args.extend([
        "-x".to_string(),
        "--audio-format".to_string(), "mp3".to_string(),
        "--audio-quality".to_string(), "192K".to_string(),
    ]);
    if crate::pot::is_youtube_url(&url) {
        if let Some(token) = crate::pot::get_po_token(&app, &url).await {
            args.extend(crate::pot::build_pot_args(&token));
        }
    }
    if let Some(ffmpeg) = get_sidecar_exe("ffmpeg") {
        args.push("--ffmpeg-location".to_string());
        args.push(ffmpeg);
    }
    args.extend(["-o".to_string(), out_str.clone(), url.clone()]);

    log::info!("download_audio: start url={url} title={title:?}");
    let result = run_with_progress(&app, "yt-dlp", args, "downloading", &settings).await;
    if let Err(ref e) = result {
        log::error!("download_audio: failed — {e}");
        return Err(e.clone());
    }
    log::info!("download_audio: complete → {out_str}");

    let db = app.state::<DbConn>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::insert(&conn, &record_from(&url, &title, &author, thumbnail.as_deref(), "mp3", &out_str))
        .map_err(|e| e.to_string())?;

    Ok(out_str)
}

#[tauri::command]
pub async fn download_tiktok(
    app: AppHandle,
    dl_settings: State<'_, DownloadSettingsState>,
    url: String,
    watermark: bool,
    audio_only: bool,
    title: String,
    author: String,
    thumbnail: Option<String>,
) -> Result<String, String> {
    let settings = dl_settings.0.lock().map_err(|e| e.to_string())?.clone();
    validate_url(&url)?;
    let safe = sanitize(&title);
    let ext = if audio_only { "mp3" } else { "mp4" };
    let out = unique_path(&effective_dir(settings.download_dir.as_deref()).join(format!("{}.{}", safe, ext)));
    let out_str = out.to_string_lossy().to_string();

    let mut args = vec![
        "--no-check-certificates".to_string(),
        "--no-warnings".to_string(),
        "--no-playlist".to_string(),
    ];

    if audio_only {
        args.extend([
            "-f".to_string(),
            "bestaudio[acodec!=none]/best[acodec!=none][format_id!=download]".to_string(),
            "-x".to_string(),
            "--audio-format".to_string(), "mp3".to_string(),
            "--audio-quality".to_string(), "192K".to_string(),
        ]);
        if let Some(ffmpeg) = get_sidecar_exe("ffmpeg") {
            args.push("--ffmpeg-location".to_string());
            args.push(ffmpeg);
        }
    } else if watermark {
        args.extend(["-f".to_string(), "download".to_string()]);
    } else {
        args.extend(["-f".to_string(), "best[vcodec^=h264][format_id!=download]".to_string()]);
    }

    args.extend(["-o".to_string(), out_str.clone(), url.clone()]);

    log::info!("download_tiktok: start url={url} audio_only={audio_only} watermark={watermark}");
    let result = run_with_progress(&app, "yt-dlp", args, "downloading", &settings).await;
    if let Err(ref e) = result {
        log::error!("download_tiktok: failed — {e}");
        return Err(e.clone());
    }
    log::info!("download_tiktok: complete → {out_str}");

    let fmt = if audio_only { "tiktok-audio" } else if watermark { "tiktok-watermark" } else { "tiktok-no-watermark" };
    let db = app.state::<DbConn>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::insert(&conn, &record_from(&url, &title, &author, thumbnail.as_deref(), fmt, &out_str))
        .map_err(|e| e.to_string())?;

    Ok(out_str)
}

#[tauri::command]
pub async fn download_twitch(
    app: AppHandle,
    dl_settings: State<'_, DownloadSettingsState>,
    url: String,
    format_id: String,
    title: String,
    author: String,
    thumbnail: Option<String>,
) -> Result<String, String> {
    let settings = dl_settings.0.lock().map_err(|e| e.to_string())?.clone();
    validate_url(&url)?;
    validate_format_id(&format_id)?;
    let safe = sanitize(&title);
    let is_audio = format_id == "audio";
    let ext = if is_audio { "mp3" } else { "mp4" };
    let out = unique_path(&effective_dir(settings.download_dir.as_deref()).join(format!("{}.{}", safe, ext)));
    let out_str = out.to_string_lossy().to_string();

    let mut args = vec![];
    if is_audio {
        args.extend(["-x".to_string(), "--audio-format".to_string(), "mp3".to_string()]);
        if let Some(ffmpeg) = get_sidecar_exe("ffmpeg") {
            args.push("--ffmpeg-location".to_string());
            args.push(ffmpeg);
        }
    } else {
        args.extend(["-f".to_string(), format_id.clone()]);
    }
    args.extend(["-o".to_string(), out_str.clone(), url.clone()]);

    log::info!("download_twitch: start url={url} format_id={format_id}");
    let result = run_with_progress(&app, "yt-dlp", args, "downloading", &settings).await;
    if let Err(ref e) = result {
        log::error!("download_twitch: failed — {e}");
        return Err(e.clone());
    }
    log::info!("download_twitch: complete → {out_str}");

    let fmt = if is_audio { "twitch-audio" } else { "twitch-video" };
    let db = app.state::<DbConn>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::insert(&conn, &record_from(&url, &title, &author, thumbnail.as_deref(), fmt, &out_str))
        .map_err(|e| e.to_string())?;

    Ok(out_str)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_removes_special_chars() {
        assert_eq!(sanitize("Hello: World! (2024)"), "Hello_ World_ _2024_");
    }

    #[test]
    fn parse_percent_extracts_value() {
        assert_eq!(parse_percent("[download]  42.5% of 10.00MiB"), Some(42.5));
        assert_eq!(parse_percent("[download] 100% of 10.00MiB"), Some(100.0));
        assert_eq!(parse_percent("[info] Writing video"), None);
    }

    #[test]
    fn validate_url_accepts_http_and_https() {
        assert!(validate_url("https://www.youtube.com/watch?v=abc").is_ok());
        assert!(validate_url("http://example.com/video").is_ok());
    }

    #[test]
    fn validate_url_rejects_non_http_schemes() {
        assert!(validate_url("file:///etc/passwd").is_err());
        assert!(validate_url("ftp://example.com/file").is_err());
        assert!(validate_url("javascript:alert(1)").is_err());
        assert!(validate_url("/etc/passwd").is_err());
    }

    #[test]
    fn validate_format_id_accepts_valid_twitch_formats() {
        assert!(validate_format_id("audio").is_ok());
        assert!(validate_format_id("best").is_ok());
        assert!(validate_format_id("720p60").is_ok());
        assert!(validate_format_id("160p30").is_ok());
        assert!(validate_format_id("1080p60__Source").is_ok());
    }

    #[test]
    fn validate_format_id_rejects_injection_attempts() {
        assert!(validate_format_id("bestvideo;--exec rm").is_err());
        assert!(validate_format_id("--help").is_err());
        assert!(validate_format_id("720p && rm -rf ~").is_err());
    }

    #[test]
    fn temp_subdir_names_are_unique() {
        let a = format!("{}", Uuid::new_v4().simple());
        let b = format!("{}", Uuid::new_v4().simple());
        assert_ne!(a, b);
    }
}
