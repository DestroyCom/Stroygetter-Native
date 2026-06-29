use crate::commands::settings::{build_common_args, DownloadSettingsState};
use crate::sidecar;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

#[derive(Debug, Serialize, Deserialize)]
pub struct FormatEntry {
    pub itag: Option<String>,
    #[serde(rename = "formatId")]
    pub format_id: Option<String>,
    #[serde(rename = "qualityLabel")]
    pub quality_label: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VideoInfo {
    pub title: String,
    pub author: String,
    pub thumbnail: Option<String>,
    pub duration: Option<f64>,
    pub source: String,
    pub formats: Vec<FormatEntry>,
}

#[derive(Deserialize)]
struct YtDlpFormat {
    format_id: Option<String>,
    height: Option<f64>,
    vcodec: Option<String>,
    acodec: Option<String>,
    format_note: Option<String>,
}

#[derive(Deserialize)]
struct YtDlpInfo {
    title: Option<String>,
    uploader: Option<String>,
    channel: Option<String>,
    thumbnail: Option<String>,
    duration: Option<f64>,
    formats: Option<Vec<YtDlpFormat>>,
}

fn detect_source(url: &str) -> &'static str {
    if url.contains("youtube.com") || url.contains("youtu.be") {
        "youtube"
    } else if url.contains("tiktok.com") {
        "tiktok"
    } else if url.contains("twitch.tv") || url.contains("clips.twitch.tv") {
        "twitch"
    } else {
        "unknown"
    }
}

fn collect_formats_by_filter<F>(formats: &[YtDlpFormat], predicate: F) -> Vec<FormatEntry>
where
    F: Fn(&YtDlpFormat) -> bool,
{
    let mut seen = std::collections::HashSet::new();
    let mut result: Vec<FormatEntry> = formats
        .iter()
        .filter(|f| predicate(f) && f.height.map(|h| h >= 144.0).unwrap_or(false))
        .filter_map(|f| {
            let h = f.height? as u32;
            if seen.insert(h) {
                Some(FormatEntry {
                    itag: f.format_id.clone(),
                    format_id: None,
                    quality_label: Some(format!("{}p", h)),
                })
            } else {
                None
            }
        })
        .collect();
    result.sort_by(|a, b| {
        let ha: u32 = a.quality_label.as_deref().unwrap_or("0").trim_end_matches('p').parse().unwrap_or(0);
        let hb: u32 = b.quality_label.as_deref().unwrap_or("0").trim_end_matches('p').parse().unwrap_or(0);
        hb.cmp(&ha)
    });
    result
}

fn parse_youtube_formats(formats: &[YtDlpFormat]) -> Vec<FormatEntry> {
    let dash = collect_formats_by_filter(formats, |f| {
        f.vcodec.as_deref().map(|v| v.starts_with("avc")).unwrap_or(false)
            && f.acodec.as_deref() == Some("none")
    });
    if !dash.is_empty() {
        log::debug!("parse_youtube_formats: DASH path ({} formats)", dash.len());
        return dash;
    }
    log::debug!("parse_youtube_formats: DASH unavailable, using muxed fallback");
    collect_formats_by_filter(formats, |f| f.vcodec.as_deref() != Some("none"))
}

fn parse_twitch_formats(formats: &[YtDlpFormat]) -> Vec<FormatEntry> {
    formats
        .iter()
        .filter(|f| f.vcodec.as_deref() != Some("none"))
        .map(|f| FormatEntry {
            itag: None,
            format_id: f.format_id.clone(),
            quality_label: f.format_note.clone().or_else(|| f.height.map(|h| format!("{}p", h))),
        })
        .collect()
}

#[tauri::command]
pub async fn fetch_video_info(
    app: AppHandle,
    dl_settings: State<'_, DownloadSettingsState>,
    url: String,
) -> Result<VideoInfo, String> {
    let settings = dl_settings.0.lock().unwrap().clone();
    let mut args = build_common_args(&settings);
    args.extend([
        "--add-header".to_string(), "referer:youtube.com".to_string(),
        "--add-header".to_string(), "user-agent:googlebot".to_string(),
        "--dump-json".to_string(),
        "--no-playlist".to_string(),
        url.clone(),
    ]);
    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = sidecar::run_sidecar(&app, "yt-dlp", &args_ref, None).await?;

    let info: YtDlpInfo = serde_json::from_str(output.stdout.trim())
        .map_err(|e| {
            log::error!("fetch_video_info: failed to parse yt-dlp output for {url}: {e}");
            format!("failed to parse yt-dlp output: {}", e)
        })?;

    let source = detect_source(&url);
    log::info!("fetch_video_info: source={source} url={url}");

    let formats = match source {
        "youtube" => {
            let f = info.formats.as_deref().map(parse_youtube_formats).unwrap_or_default();
            log::info!("fetch_video_info: {} youtube formats resolved", f.len());
            f
        }
        "twitch" => {
            let f = info.formats.as_deref().map(parse_twitch_formats).unwrap_or_default();
            log::info!("fetch_video_info: {} twitch formats resolved", f.len());
            f
        }
        _ => vec![],
    };

    Ok(VideoInfo {
        title: info.title.unwrap_or_else(|| "Unknown".to_string()),
        author: info
            .channel
            .or(info.uploader)
            .unwrap_or_else(|| "Unknown".to_string()),
        thumbnail: info.thumbnail,
        duration: info.duration,
        source: source.to_string(),
        formats,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_source_youtube() {
        assert_eq!(detect_source("https://www.youtube.com/watch?v=abc"), "youtube");
    }

    #[test]
    fn detect_source_tiktok() {
        assert_eq!(detect_source("https://www.tiktok.com/@user/video/123"), "tiktok");
    }

    #[test]
    fn detect_source_twitch() {
        assert_eq!(detect_source("https://clips.twitch.tv/abc"), "twitch");
    }

    fn fmt(id: &str, h: Option<f64>, vcodec: &str, acodec: Option<&str>) -> YtDlpFormat {
        YtDlpFormat {
            format_id: Some(id.to_string()),
            height: h,
            vcodec: Some(vcodec.to_string()),
            acodec: acodec.map(|s| s.to_string()),
            format_note: None,
        }
    }

    #[test]
    fn parse_youtube_formats_prefers_dash_video_only() {
        // 137/136 are DASH video-only (acodec="none"), 18 is muxed progressive
        let formats = vec![
            fmt("137", Some(1080.0), "avc1.640028", Some("none")),
            fmt("136", Some(720.0),  "avc1.4d401f", Some("none")),
            fmt("18",  Some(360.0),  "avc1.42001E", Some("mp4a.40.2")),
            fmt("140", None,         "none",         Some("mp4a.40.2")),
        ];
        let result = parse_youtube_formats(&formats);
        // DASH path: 1080p and 720p, muxed 360p excluded because DASH path was taken
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].quality_label.as_deref(), Some("1080p"));
        assert_eq!(result[1].quality_label.as_deref(), Some("720p"));
    }

    #[test]
    fn parse_youtube_formats_fallback_when_no_dash() {
        // Only muxed progressive formats available (e.g. YouTube restricts DASH)
        let formats = vec![
            fmt("18",  Some(360.0), "avc1.42001E", Some("mp4a.40.2")),
            fmt("133", Some(240.0), "avc1.42001E", Some("mp4a.40.2")),
            fmt("160", Some(144.0), "avc1.42001E", Some("mp4a.40.2")),
        ];
        let result = parse_youtube_formats(&formats);
        assert_eq!(result.len(), 3);
        assert_eq!(result[0].quality_label.as_deref(), Some("360p"));
        assert_eq!(result[1].quality_label.as_deref(), Some("240p"));
        assert_eq!(result[2].quality_label.as_deref(), Some("144p"));
    }

    #[test]
    fn parse_youtube_formats_handles_float_height() {
        let formats = vec![
            fmt("137", Some(1080.0), "avc1.640028", Some("none")),
            fmt("136", Some(720.0),  "avc1.4d401f", Some("none")),
        ];
        let result = parse_youtube_formats(&formats);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].quality_label.as_deref(), Some("1080p"));
        assert_eq!(result[1].quality_label.as_deref(), Some("720p"));
    }
}
