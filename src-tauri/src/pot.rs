use crate::sidecar;
use serde::Deserialize;
use tauri::AppHandle;

#[derive(Deserialize)]
struct PotResponse {
    #[serde(rename = "poToken")]
    po_token: String,
}

pub fn is_youtube_url(url: &str) -> bool {
    url.contains("youtube.com") || url.contains("youtu.be")
}

fn video_id_from_url(url: &str) -> &str {
    if let Some(idx) = url.find("v=") {
        url[idx + 2..].split(['&', '#']).next().unwrap_or(url)
    } else if let Some(idx) = url.find("youtu.be/") {
        url[idx + 9..].split(['?', '#']).next().unwrap_or(url)
    } else {
        url
    }
}

/// Calls bgutil-pot to generate a YouTube PO Token for the given URL.
/// Returns None silently on failure so callers can degrade gracefully.
pub async fn get_po_token(app: &AppHandle, url: &str) -> Option<String> {
    let binding = video_id_from_url(url);
    let output = sidecar::run_sidecar(app, "bgutil-pot", &["--content-binding", binding], None)
        .await
        .map_err(|e| log::warn!("pot: bgutil-pot sidecar failed: {e}"))
        .ok()?;

    let resp: PotResponse = serde_json::from_str(output.stdout.trim())
        .map_err(|e| log::warn!("pot: failed to parse output: {e}"))
        .ok()?;

    log::debug!("pot: PO token acquired (binding={binding})");
    Some(resp.po_token)
}

pub fn build_pot_args(token: &str) -> Vec<String> {
    vec![
        "--extractor-args".to_string(),
        format!("youtube:po_token=web.gvs+{token}"),
    ]
}
