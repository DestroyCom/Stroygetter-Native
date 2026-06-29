use base64::Engine;
use id3::frame::{Lyrics, Picture, PictureType, SynchronisedLyrics, SynchronisedLyricsType, TimestampFormat};
use id3::{Tag, TagLike, Version};
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct AudioMetadata {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<String>,
    pub cover_base64: Option<String>,
    pub lyrics_plain: Option<String>,
    pub lyrics_lrc: Option<String>,
}

/// Parses a single LRC line "[mm:ss.xx] text" → (milliseconds, text).
/// Handles 2-digit centiseconds and 3-digit milliseconds.
pub(crate) fn parse_lrc_line(line: &str) -> Option<(u32, String)> {
    let line = line.trim();
    if !line.starts_with('[') {
        return None;
    }
    let close = line.find(']')?;
    let ts = &line[1..close];
    let text = line[close + 1..].trim().to_string();

    let colon = ts.find(':')?;
    let mins: u32 = ts[..colon].parse().ok()?;
    let rest = &ts[colon + 1..];

    let (secs_str, frac_str) = if let Some(dot) = rest.find('.') {
        (&rest[..dot], &rest[dot + 1..])
    } else {
        (rest, "")
    };

    let secs: u32 = secs_str.parse().ok()?;
    let ms_frac: u32 = match frac_str.len() {
        0 => 0,
        1 => frac_str.parse::<u32>().ok()? * 100,
        2 => frac_str.parse::<u32>().ok()? * 10,
        _ => frac_str[..3].parse::<u32>().ok()?,
    };

    let ms = (mins * 60 + secs) * 1000 + ms_frac;
    Some((ms, text))
}

#[tauri::command]
pub fn read_local_image_as_data_url(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let mime = mime_from_extension(&path);
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

#[tauri::command]
pub async fn read_audio_metadata(path: String) -> Result<AudioMetadata, String> {
    let tag = match Tag::read_from_path(&path) {
        Ok(t) => t,
        Err(e) if matches!(e.kind, id3::ErrorKind::NoTag) => Tag::new(),
        Err(e) => return Err(e.to_string()),
    };

    let title = tag.title().map(|s| s.to_string());
    let artist = tag.artist().map(|s| s.to_string());
    let album = tag.album().map(|s| s.to_string());
    let year = tag.year().map(|y| y.to_string());

    // Prefer CoverFront APIC frame; fall back to first picture found
    let cover_base64 = tag
        .pictures()
        .find(|p| p.picture_type == PictureType::CoverFront)
        .or_else(|| tag.pictures().next())
        .map(|pic| {
            let b64 = base64::engine::general_purpose::STANDARD.encode(&pic.data);
            format!("data:{};base64,{}", pic.mime_type, b64)
        });

    // USLT frame — plain lyrics
    let lyrics_plain = tag.lyrics().next().map(|l| l.text.clone());

    // SYLT frame — reconstruct as LRC text
    let lyrics_lrc = tag.synchronised_lyrics().next().map(|sylt| {
        sylt.content
            .iter()
            .map(|(ms, text)| {
                let total_secs = ms / 1000;
                let mins = total_secs / 60;
                let secs = total_secs % 60;
                let centis = (ms % 1000) / 10;
                format!("[{:02}:{:02}.{:02}] {}", mins, secs, centis, text)
            })
            .collect::<Vec<_>>()
            .join("\n")
    });

    Ok(AudioMetadata { title, artist, album, year, cover_base64, lyrics_plain, lyrics_lrc })
}

async fn fetch_cover_bytes(url: &str) -> Option<(Vec<u8>, String)> {
    let res = reqwest::Client::new()
        .get(url)
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .ok()?;
    if !res.status().is_success() {
        return None;
    }
    let mime = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(';').next())
        .filter(|s| s.starts_with("image/"))
        .unwrap_or("image/jpeg")
        .to_string();
    let bytes = res.bytes().await.ok()?;
    if bytes.is_empty() { None } else { Some((bytes.to_vec(), mime)) }
}

const COVER_SIZE: u32 = 1024;

/// Centre-crop to square then resize to COVER_SIZE×COVER_SIZE, returning JPEG bytes.
fn resize_cover(bytes: &[u8]) -> Option<Vec<u8>> {
    let img = image::load_from_memory(bytes).ok()?;
    let (w, h) = (img.width(), img.height());
    let side = w.min(h);
    let cropped = img.crop_imm((w - side) / 2, (h - side) / 2, side, side);
    let resized = cropped.resize_exact(COVER_SIZE, COVER_SIZE, image::imageops::FilterType::Lanczos3);
    let mut out = std::io::Cursor::new(Vec::new());
    resized.write_to(&mut out, image::ImageFormat::Jpeg).ok()?;
    Some(out.into_inner())
}

fn mime_from_extension(path: &str) -> &'static str {
    match path.rsplit('.').next().map(|e| e.to_lowercase()).as_deref() {
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        _ => "image/jpeg",
    }
}

#[tauri::command]
pub async fn write_audio_metadata(
    path: String,
    title: String,
    artist: String,
    album: String,
    year: String,
    cover_url: Option<String>,
    cover_path: Option<String>,
    lyrics_plain: String,
    lyrics_lrc: String,
) -> Result<(), String> {
    let mut tag = Tag::read_from_path(&path).unwrap_or_else(|_| Tag::new());

    tag.set_title(&title);
    tag.set_artist(&artist);
    tag.set_album(&album);
    if let Ok(y) = year.parse::<i32>() {
        tag.set_year(y);
    }

    // Cover: local file takes priority over remote URL
    if let Some(ref local) = cover_path {
        match std::fs::read(local) {
            Ok(raw) => {
                let (data, mime) = match resize_cover(&raw) {
                    Some(jpeg) => (jpeg, "image/jpeg".to_string()),
                    None => (raw, mime_from_extension(local).to_string()),
                };
                tag.remove_picture_by_type(PictureType::CoverFront);
                tag.add_frame(Picture {
                    mime_type: mime,
                    picture_type: PictureType::CoverFront,
                    description: "Cover".to_string(),
                    data,
                });
            }
            Err(e) => log::warn!("write_audio_metadata: could not read cover file {local}: {e}"),
        }
    } else if let Some(ref url) = cover_url {
        if let Some((data, mime)) = fetch_cover_bytes(url).await {
            tag.remove_picture_by_type(PictureType::CoverFront);
            tag.add_frame(Picture {
                mime_type: mime,
                picture_type: PictureType::CoverFront,
                description: "Cover".to_string(),
                data,
            });
        }
    }

    // USLT — plain lyrics (replace all existing)
    tag.remove_all_lyrics();
    if !lyrics_plain.is_empty() {
        tag.add_frame(Lyrics {
            lang: "eng".to_string(),
            description: String::new(),
            text: lyrics_plain,
        });
    }

    // SYLT — synchronized lyrics (replace all existing)
    tag.remove_all_synchronised_lyrics();
    if !lyrics_lrc.is_empty() {
        let content: Vec<(u32, String)> = lyrics_lrc
            .lines()
            .filter_map(parse_lrc_line)
            .collect();
        if !content.is_empty() {
            tag.add_frame(SynchronisedLyrics {
                lang: "eng".to_string(),
                timestamp_format: TimestampFormat::Ms,
                content_type: SynchronisedLyricsType::Lyrics,
                description: String::new(),
                content,
            });
        }
    }

    tag.write_to_path(&path, Version::Id3v24).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_lrc_standard_centiseconds() {
        let (ms, text) = parse_lrc_line("[01:23.45] Hello world").unwrap();
        assert_eq!(ms, (60 + 23) * 1000 + 450);
        assert_eq!(text, "Hello world");
    }

    #[test]
    fn parse_lrc_milliseconds() {
        let (ms, text) = parse_lrc_line("[00:05.123] Line").unwrap();
        assert_eq!(ms, 5123);
        assert_eq!(text, "Line");
    }

    #[test]
    fn parse_lrc_no_frac() {
        let (ms, text) = parse_lrc_line("[02:00] Chorus").unwrap();
        assert_eq!(ms, 120_000);
        assert_eq!(text, "Chorus");
    }

    #[test]
    fn parse_lrc_rejects_non_lrc() {
        assert!(parse_lrc_line("plain text").is_none());
        assert!(parse_lrc_line("").is_none());
    }

    #[test]
    fn parse_lrc_strips_whitespace_from_text() {
        let (_, text) = parse_lrc_line("[00:01.00]   spaced  ").unwrap();
        assert_eq!(text, "spaced");
    }
}
