use crate::db::{self, DbConn, DownloadRecord};
use crate::sidecar;
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc;

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

fn downloads_dir() -> std::path::PathBuf {
    dirs::download_dir().unwrap_or_else(|| std::path::PathBuf::from("."))
}

fn sanitize(title: &str) -> String {
    title
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { '_' })
        .collect::<String>()
        .trim()
        .to_string()
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
) -> Result<sidecar::SidecarOutput, String> {
    let app_clone = app.clone();
    let phase_str = phase.to_string();

    let (tx, mut rx) = mpsc::channel::<String>(100);

    let app_emit = app_clone.clone();
    let phase_emit = phase_str.clone();
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

    // YouTube player_client arg is scoped to the youtube extractor; ignored for TikTok/Twitch.
    // Prevents "No JS runtime" warnings introduced in yt-dlp ≥ 2025.x.
    let mut all_args: Vec<String> = vec![
        "--extractor-args".to_string(),
        "youtube:player_client=android,web".to_string(),
    ];
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
    url: String,
    itag: String,
    title: String,
    author: String,
    thumbnail: Option<String>,
) -> Result<String, String> {
    let safe = sanitize(&title);
    let out = downloads_dir().join(format!("{}.mp4", safe));
    let out_str = out.to_string_lossy().to_string();

    // YouTube video format IDs are video-only; pair with best audio so yt-dlp can mux them.
    let format_str = format!("{}+bestaudio[ext=m4a]/{}+bestaudio", itag, itag);
    let mut args = vec![
        "-f".to_string(), format_str,
        "--merge-output-format".to_string(), "mp4".to_string(),
    ];
    if let Some(ffmpeg) = get_sidecar_exe("ffmpeg") {
        args.push("--ffmpeg-location".to_string());
        args.push(ffmpeg);
    }
    args.extend(["-o".to_string(), out_str.clone(), url.clone()]);

    run_with_progress(&app, "yt-dlp", args, "downloading").await?;

    let db = app.state::<DbConn>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::insert(&conn, &record_from(&url, &title, &author, thumbnail.as_deref(), "mp4", &out_str))
        .map_err(|e| e.to_string())?;

    Ok(out_str)
}

#[tauri::command]
pub async fn download_audio(
    app: AppHandle,
    url: String,
    title: String,
    author: String,
    thumbnail: Option<String>,
) -> Result<String, String> {
    let safe = sanitize(&title);
    let out = downloads_dir().join(format!("{}.mp3", safe));
    let out_str = out.to_string_lossy().to_string();

    let mut args = vec![
        "-x".to_string(),
        "--audio-format".to_string(), "mp3".to_string(),
        "--audio-quality".to_string(), "192K".to_string(),
    ];
    if let Some(ffmpeg) = get_sidecar_exe("ffmpeg") {
        args.push("--ffmpeg-location".to_string());
        args.push(ffmpeg);
    }
    args.extend(["-o".to_string(), out_str.clone(), url.clone()]);

    run_with_progress(&app, "yt-dlp", args, "downloading").await?;

    let db = app.state::<DbConn>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::insert(&conn, &record_from(&url, &title, &author, thumbnail.as_deref(), "mp3", &out_str))
        .map_err(|e| e.to_string())?;

    Ok(out_str)
}

#[tauri::command]
pub async fn download_tiktok(
    app: AppHandle,
    url: String,
    watermark: bool,
    audio_only: bool,
    title: String,
    author: String,
    thumbnail: Option<String>,
) -> Result<String, String> {
    let safe = sanitize(&title);
    let ext = if audio_only { "mp3" } else { "mp4" };
    let out = downloads_dir().join(format!("{}.{}", safe, ext));
    let out_str = out.to_string_lossy().to_string();

    let mut args = vec![];

    if audio_only {
        args.extend(["-x".to_string(), "--audio-format".to_string(), "mp3".to_string()]);
    } else if !watermark {
        // no-watermark: select the format without the TikTok watermark overlay
        args.extend(["-f".to_string(), "download_addr-0".to_string()]);
    }
    // watermark = default yt-dlp selection

    args.extend(["-o".to_string(), out_str.clone(), url.clone()]);

    run_with_progress(&app, "yt-dlp", args, "downloading").await?;

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
    url: String,
    format_id: String,
    title: String,
    author: String,
    thumbnail: Option<String>,
) -> Result<String, String> {
    let safe = sanitize(&title);
    let is_audio = format_id == "audio";
    let ext = if is_audio { "mp3" } else { "mp4" };
    let out = downloads_dir().join(format!("{}.{}", safe, ext));
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

    run_with_progress(&app, "yt-dlp", args, "downloading").await?;

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
}
