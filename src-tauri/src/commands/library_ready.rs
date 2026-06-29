use crate::commands::download::{get_sidecar_exe, validate_url};
use crate::commands::settings::{build_common_args, build_youtube_args, DownloadSettingsState};
use crate::db::{self, DbConn, DownloadRecord};
use crate::sidecar;
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::mpsc;

#[derive(Serialize, Clone)]
struct ProgressPayload {
    phase: String,
    percent: f64,
}

fn emit_progress(app: &AppHandle, phase: &str, percent: f64) {
    let _ = app.emit("download://progress", ProgressPayload { phase: phase.to_string(), percent });
}

fn now_ts() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64
}

fn sanitize(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' { c } else { '_' })
        .collect::<String>()
        .trim()
        .to_string()
}

// Downloads a URL and returns the body bytes.
// Returns None on network error, non-2xx status, or empty body.
async fn try_fetch_cover(url: &str) -> Option<Vec<u8>> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(5))
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .ok()?;
    let res = client.get(url).send().await.ok()?;
    if !res.status().is_success() {
        return None;
    }
    let bytes = res.bytes().await.ok()?;
    if bytes.is_empty() { None } else { Some(bytes.to_vec()) }
}

#[tauri::command]
pub async fn download_library_ready(
    app: AppHandle,
    dl_settings: State<'_, DownloadSettingsState>,
    url: String,
    title: String,
    artist: String,
    album: String,
    year: String,
    cover_url: String,
    cover_url_fallback: Option<String>,
    lyrics_lrc: String,
    thumbnail: Option<String>,
) -> Result<String, String> {
    let settings = dl_settings.0.lock().map_err(|e| e.to_string())?.clone();
    validate_url(&url)?;
    let safe = sanitize(&title);
    let tmp_id = uuid::Uuid::new_v4().simple().to_string();
    let tmp_audio = std::env::temp_dir().join(format!("stroygetter_{}_{}_audio.mp3", tmp_id, safe));
    let tmp_cover = std::env::temp_dir().join(format!("stroygetter_{}_{}_cover.jpg", tmp_id, safe));
    let out = dirs::download_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join(format!("{}.mp3", safe));

    // Phase 1: download audio via yt-dlp
    emit_progress(&app, "downloading", 0.0);

    let (tx, mut rx) = mpsc::channel::<String>(100);
    let app_clone = app.clone();
    tokio::spawn(async move {
        while let Some(line) = rx.recv().await {
            if line.contains("[download]") {
                if let Some(pct) = line.split_whitespace()
                    .find(|p| p.ends_with('%'))
                    .and_then(|p| p.trim_end_matches('%').parse::<f64>().ok())
                {
                    let _ = app_clone.emit("download://progress", ProgressPayload {
                        phase: "downloading".to_string(),
                        percent: pct,
                    });
                }
            }
        }
    });

    let ffmpeg_opt = get_sidecar_exe("ffmpeg");
    let tmp_audio_str = tmp_audio.to_string_lossy().to_string();

    let mut ytdlp_args = build_youtube_args();
    ytdlp_args.extend(build_common_args(&settings));
    ytdlp_args.extend([
        "-x".to_string(), "--audio-format".to_string(), "mp3".to_string(),
        "--audio-quality".to_string(), "192K".to_string(),
    ]);
    if let Some(ref ffmpeg) = ffmpeg_opt {
        ytdlp_args.extend(["--ffmpeg-location".to_string(), ffmpeg.clone()]);
    }
    ytdlp_args.extend(["-o".to_string(), tmp_audio_str.clone(), url.clone()]);

    let ytdlp_args_ref: Vec<&str> = ytdlp_args.iter().map(|s| s.as_str()).collect();
    sidecar::run_sidecar(&app, "yt-dlp", &ytdlp_args_ref, Some(tx)).await?;

    // Phase 2: download cover image — try primary URL, fall back, proceed without on failure
    emit_progress(&app, "fetching_cover", 0.0);

    let cover_bytes: Option<Vec<u8>> = if !cover_url.is_empty() && validate_url(&cover_url).is_ok() {
        let mut bytes = try_fetch_cover(&cover_url).await;
        if bytes.is_none() {
            if let Some(ref fallback) = cover_url_fallback {
                if validate_url(fallback).is_ok() {
                    bytes = try_fetch_cover(fallback).await;
                }
            }
        }
        bytes
    } else {
        None
    };

    let has_cover = if let Some(ref bytes) = cover_bytes {
        std::fs::write(&tmp_cover, bytes).map_err(|e| e.to_string())?;
        true
    } else {
        false
    };

    emit_progress(&app, "fetching_cover", 100.0);

    // Phase 3: embed metadata with ffmpeg
    emit_progress(&app, "embedding", 0.0);

    let mut ffmpeg_args: Vec<String> = vec![
        "-y".to_string(),
        "-i".to_string(), tmp_audio.to_string_lossy().to_string(),
    ];

    if has_cover {
        ffmpeg_args.extend(["-i".to_string(), tmp_cover.to_string_lossy().to_string()]);
    }

    ffmpeg_args.extend([
        "-map".to_string(), "0:a".to_string(),
        "-c:a".to_string(), "copy".to_string(),
    ]);

    if has_cover {
        ffmpeg_args.extend([
            "-map".to_string(), "1:v".to_string(),
            "-c:v".to_string(), "copy".to_string(),
            "-id3v2_version".to_string(), "3".to_string(),
            "-metadata:s:v".to_string(), "title=Album cover".to_string(),
            "-metadata:s:v".to_string(), "comment=Cover (front)".to_string(),
        ]);
    }

    ffmpeg_args.extend([
        "-metadata".to_string(), format!("title={}", title),
        "-metadata".to_string(), format!("artist={}", artist),
        "-metadata".to_string(), format!("album={}", album),
        "-metadata".to_string(), format!("date={}", year),
    ]);

    if !lyrics_lrc.is_empty() {
        ffmpeg_args.extend([
            "-metadata".to_string(), format!("lyrics={}", lyrics_lrc),
        ]);
    }

    ffmpeg_args.push(out.to_string_lossy().to_string());

    let args_ref: Vec<&str> = ffmpeg_args.iter().map(|s| s.as_str()).collect();
    sidecar::run_sidecar(&app, "ffmpeg", &args_ref, None).await?;

    emit_progress(&app, "embedding", 100.0);

    let _ = std::fs::remove_file(&tmp_audio);
    let _ = std::fs::remove_file(&tmp_cover);

    let out_str = out.to_string_lossy().to_string();

    let db = app.state::<DbConn>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::insert(
        &conn,
        &DownloadRecord {
            id: uuid::Uuid::new_v4().to_string(),
            url: url.clone(),
            title: title.clone(),
            author: Some(artist.clone()),
            thumbnail_url: thumbnail,
            format: "library-ready".to_string(),
            file_path: out_str.clone(),
            created_at: now_ts(),
        },
    )
    .map_err(|e| e.to_string())?;

    Ok(out_str)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_title() {
        assert_eq!(sanitize("My Song: The Best! (2024)"), "My Song_ The Best_ _2024_");
    }
}
