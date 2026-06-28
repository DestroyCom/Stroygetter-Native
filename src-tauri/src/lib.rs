mod commands;
mod db;
mod sidecar;

use commands::settings::DownloadSettingsState;
use db::DbConn;
use tauri::Manager;

#[tauri::command]
fn get_history(db: tauri::State<DbConn>) -> Result<Vec<db::DownloadRecord>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::get_history(&conn).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            let conn = db::open_or_memory(&app_data_dir);
            app.manage(DbConn(std::sync::Mutex::new(conn)));
            app.manage(DownloadSettingsState(std::sync::Mutex::new(
                commands::settings::DownloadSettings::default(),
            )));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_history,
            commands::info::fetch_video_info,
            commands::download::download_video,
            commands::download::download_audio,
            commands::download::download_tiktok,
            commands::download::download_twitch,
            commands::library_ready::download_library_ready,
            commands::settings::detect_available_browsers,
            commands::settings::update_download_settings,
            commands::settings::get_download_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
