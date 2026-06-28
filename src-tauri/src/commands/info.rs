use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use crate::sidecar;

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
    height: Option<u32>,
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
    webpage_url: Option<String>,
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

fn parse_youtube_formats(formats: &[YtDlpFormat]) -> Vec<FormatEntry> {
    let mut seen = std::collections::HashSet::new();
    let mut result = formats
        .iter()
        .filter(|f| {
            f.vcodec.as_deref() != Some("none")
                && f.height.map(|h| h >= 360).unwrap_or(false)
        })
        .filter_map(|f| {
            let h = f.height?;
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
        .collect::<Vec<_>>();
    result.sort_by(|a, b| {
        let ha: u32 = a.quality_label.as_deref().unwrap_or("0").trim_end_matches('p').parse().unwrap_or(0);
        let hb: u32 = b.quality_label.as_deref().unwrap_or("0").trim_end_matches('p').parse().unwrap_or(0);
        hb.cmp(&ha)
    });
    result
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
pub async fn fetch_video_info(app: AppHandle, url: String) -> Result<VideoInfo, String> {
    let output = sidecar::run_sidecar(&app, "yt-dlp", &["--dump-json", "--no-playlist", &url], None).await?;

    let info: YtDlpInfo = serde_json::from_str(output.stdout.trim())
        .map_err(|e| format!("failed to parse yt-dlp output: {}", e))?;

    let source = detect_source(&url);
    let formats = match source {
        "youtube" => info.formats.as_deref().map(parse_youtube_formats).unwrap_or_default(),
        "twitch" => info.formats.as_deref().map(parse_twitch_formats).unwrap_or_default(),
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

    #[test]
    fn parse_youtube_formats_filters_audio_only() {
        let formats = vec![
            YtDlpFormat { format_id: Some("137".to_string()), height: Some(1080), vcodec: Some("avc1".to_string()), acodec: Some("none".to_string()), format_note: None },
            YtDlpFormat { format_id: Some("140".to_string()), height: None, vcodec: Some("none".to_string()), acodec: Some("mp4a".to_string()), format_note: None },
        ];
        let result = parse_youtube_formats(&formats);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].itag.as_deref(), Some("137"));
    }
}
