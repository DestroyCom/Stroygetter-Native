mod commands;
mod db;
mod sidecar;

use commands::settings::DownloadSettingsState;
use db::DbConn;
use tauri::Manager;

fn init_logger(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let log_dir = app.path().app_log_dir()?;
    std::fs::create_dir_all(&log_dir)?;

    let log_level = if cfg!(debug_assertions) {
        log::LevelFilter::Debug
    } else {
        log::LevelFilter::Info
    };

    let file_target = tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Folder {
        path: log_dir,
        file_name: Some("stroygetter".to_string()),
    });
    let stdout_target = tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout);

    app.handle()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([file_target, stdout_target])
                .level(log_level)
                .max_file_size(5_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .build(),
        )
        .map_err(|e| format!("failed to init logger: {e}"))?;

    Ok(())
}

fn init_sentry() -> Option<sentry::ClientInitGuard> {
    let dsn = option_env!("GLITCHTIP_DSN")?;
    if dsn.is_empty() {
        return None;
    }
    Some(sentry::init((
        dsn,
        sentry::ClientOptions {
            release: sentry::release_name!(),
            ..Default::default()
        },
    )))
}

#[tauri::command]
fn get_history(db: tauri::State<DbConn>) -> Result<Vec<db::DownloadRecord>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::get_history(&conn).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _sentry = init_sentry();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let _ = init_logger(app);

            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            let conn = db::open_or_memory(&app_data_dir);
            app.manage(DbConn(std::sync::Mutex::new(conn)));
            app.manage(DownloadSettingsState(std::sync::Mutex::new(
                commands::settings::DownloadSettings::default(),
            )));

            log::info!(
                "StroyGetter {} started — data dir: {}",
                env!("CARGO_PKG_VERSION"),
                app_data_dir.display()
            );

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
            commands::metadata_editor::read_audio_metadata,
            commands::metadata_editor::write_audio_metadata,
            commands::settings::detect_available_browsers,
            commands::settings::update_download_settings,
            commands::settings::get_download_settings,
            commands::settings::get_log_dir,
            commands::settings::open_log_dir,
            commands::settings::set_log_level,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
