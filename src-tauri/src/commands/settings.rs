use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

#[derive(Clone, Serialize, Deserialize)]
pub struct DownloadSettings {
    pub use_cookies: bool,
    pub cookies_browser: String,
}

impl Default for DownloadSettings {
    fn default() -> Self {
        Self { use_cookies: false, cookies_browser: String::new() }
    }
}

pub struct DownloadSettingsState(pub std::sync::Mutex<DownloadSettings>);

fn find_in_path(bin: &str) -> Option<std::path::PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    let extensions: Vec<String> = if cfg!(windows) {
        std::env::var("PATHEXT")
            .unwrap_or_default()
            .split(';')
            .map(|e| e.to_lowercase())
            .collect()
    } else {
        vec![String::new()]
    };
    for dir in std::env::split_paths(&path_var) {
        for ext in &extensions {
            let candidate = dir.join(format!("{}{}", bin, ext));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn detect_js_runtime() -> Option<(&'static str, String)> {
    let candidates: &[(&str, &[&str])] = &[
        ("deno", &["deno"]),
        ("node", &["node", "nodejs"]),
        ("quickjs", &["qjs"]),
    ];
    for (runtime, bins) in candidates {
        for bin in *bins {
            if let Some(path) = find_in_path(bin) {
                return Some((runtime, path.to_string_lossy().into_owned()));
            }
        }
    }
    None
}

/// Args applicable to every yt-dlp call regardless of source (cookies only).
pub fn build_common_args(settings: &DownloadSettings) -> Vec<String> {
    let mut args = vec![];
    if settings.use_cookies && !settings.cookies_browser.is_empty() {
        args.extend([
            "--cookies-from-browser".to_string(),
            settings.cookies_browser.clone(),
        ]);
    }
    args
}

/// Extra args for YouTube only: spoofed headers + JS runtime for challenge solving.
pub fn build_youtube_args() -> Vec<String> {
    let mut args = vec![
        "--add-header".to_string(), "referer:youtube.com".to_string(),
        "--add-header".to_string(), "user-agent:googlebot".to_string(),
    ];
    match detect_js_runtime() {
        Some((runtime, path)) => {
            args.extend([
                "--js-runtimes".to_string(),
                format!("{}:{}", runtime, path),
            ]);
        }
        None => {
            args.extend([
                "--remote-components".to_string(),
                "ejs:github".to_string(),
            ]);
        }
    }
    args
}

#[tauri::command]
pub fn detect_available_browsers() -> Vec<String> {
    let mut found = vec![];

    #[cfg(target_os = "macos")]
    {
        let candidates = [
            ("safari",   "/Applications/Safari.app"),
            ("chrome",   "/Applications/Google Chrome.app"),
            ("firefox",  "/Applications/Firefox.app"),
            ("edge",     "/Applications/Microsoft Edge.app"),
            ("brave",    "/Applications/Brave Browser.app"),
            ("arc",      "/Applications/Arc.app"),
            ("opera",    "/Applications/Opera.app"),
            ("chromium", "/Applications/Chromium.app"),
        ];
        for (name, path) in candidates {
            if std::path::Path::new(path).exists() {
                found.push(name.to_string());
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let prog  = std::env::var("PROGRAMFILES").unwrap_or_default();
        let prog86 = std::env::var("PROGRAMFILES(X86)").unwrap_or_default();
        let candidates = [
            ("chrome",  format!("{local}\\Google\\Chrome\\Application\\chrome.exe")),
            ("firefox", format!("{prog}\\Mozilla Firefox\\firefox.exe")),
            ("firefox", format!("{prog86}\\Mozilla Firefox\\firefox.exe")),
            ("edge",    format!("{local}\\Microsoft\\Edge\\Application\\msedge.exe")),
            ("brave",   format!("{local}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe")),
            ("opera",   format!("{local}\\Programs\\Opera\\opera.exe")),
        ];
        for (name, path) in candidates {
            if std::path::Path::new(&path).exists() {
                if !found.contains(&name.to_string()) {
                    found.push(name.to_string());
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let bins = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser",
                    "firefox", "brave-browser", "microsoft-edge", "opera"];
        for bin in bins {
            if which_bin(bin) {
                let canonical = match bin {
                    "google-chrome" | "google-chrome-stable" => "chrome",
                    "chromium" | "chromium-browser" => "chromium",
                    "microsoft-edge" => "edge",
                    other => other,
                };
                if !found.contains(&canonical.to_string()) {
                    found.push(canonical.to_string());
                }
            }
        }
    }

    found
}

#[cfg(target_os = "linux")]
fn which_bin(name: &str) -> bool {
    std::process::Command::new("which")
        .arg(name)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[tauri::command]
pub fn update_download_settings(
    state: State<'_, DownloadSettingsState>,
    use_cookies: bool,
    cookies_browser: String,
) {
    let mut s = state.0.lock().unwrap();
    s.use_cookies = use_cookies;
    s.cookies_browser = cookies_browser;
}

#[tauri::command]
pub fn get_download_settings(
    state: State<'_, DownloadSettingsState>,
) -> DownloadSettings {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
pub fn get_log_dir(app: AppHandle) -> String {
    app.path()
        .app_log_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}

#[tauri::command]
pub fn open_log_dir(app: AppHandle) -> Result<(), String> {
    let log_dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    app.opener()
        .open_path(log_dir.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_log_level(level: String) {
    let filter = match level.as_str() {
        "debug" => log::LevelFilter::Debug,
        "warn"  => log::LevelFilter::Warn,
        "error" => log::LevelFilter::Error,
        _       => log::LevelFilter::Info,
    };
    log::set_max_level(filter);
    log::info!("log level set to {level}");
}
