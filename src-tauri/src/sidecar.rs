use tauri::AppHandle;
#[cfg(target_os = "linux")]
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use tokio::sync::mpsc;

#[allow(dead_code)]
pub struct SidecarOutput {
    pub stdout: String,
    pub stderr: String,
}

pub async fn run_sidecar(
    app: &AppHandle,
    name: &str,
    args: &[&str],
    progress_tx: Option<mpsc::Sender<String>>,
) -> Result<SidecarOutput, String> {
    log::debug!("[sidecar] {} {}", name, args.join(" "));

    let mut cmd = app
        .shell()
        .sidecar(name)
        .map_err(|e| format!("sidecar '{}' not found: {}", name, e))?;

    // bgutil-pot's upstream Linux release links dynamically against libssl.so.3/libcrypto.so.3
    // (OpenSSL 3.x), absent on distros still on OpenSSL 1.1 (e.g. Ubuntu 20.04). CI bundles
    // those .so files as a resource under bgutil-pot-libs/ (see tauri.linux.conf.json) — point
    // the sidecar's loader at them via LD_LIBRARY_PATH so it doesn't depend on the host's OpenSSL.
    #[cfg(target_os = "linux")]
    if name == "bgutil-pot" {
        match app
            .path()
            .resolve("bgutil-pot-libs", tauri::path::BaseDirectory::Resource)
        {
            Ok(libs_dir) => cmd = cmd.env("LD_LIBRARY_PATH", libs_dir),
            Err(e) => log::warn!(
                "[sidecar] could not resolve bgutil-pot-libs resource dir: {e} — \
                 bgutil-pot may fail to load its bundled OpenSSL libs"
            ),
        }
    }

    for arg in args {
        cmd = cmd.arg(*arg);
    }

    let (mut rx, _child) = cmd.spawn().map_err(|e| format!("spawn error: {}", e))?;

    let mut stdout = String::new();
    let mut stderr = String::new();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let text = String::from_utf8_lossy(&line).to_string();
                if let Some(tx) = &progress_tx {
                    let _ = tx.send(text.clone()).await;
                }
                stdout.push_str(&text);
                stdout.push('\n');
            }
            CommandEvent::Stderr(line) => {
                let text = String::from_utf8_lossy(&line).to_string();
                if text.trim_start().starts_with("ERROR:") {
                    log::error!("[{name}] {text}");
                } else {
                    log::debug!("[{name}] {text}");
                }
                if let Some(tx) = &progress_tx {
                    let _ = tx.send(text.clone()).await;
                }
                stderr.push_str(&text);
                stderr.push('\n');
            }
            CommandEvent::Error(e) => {
                log::error!("[sidecar/{name}] process error: {e}");
                return Err(e);
            }
            CommandEvent::Terminated(status) => {
                let code = status.code.unwrap_or(-1);
                if code != 0 {
                    log::error!("[sidecar/{name}] exited with code {code}: {stderr}");
                    return Err(format!("process exited with error: {}", stderr));
                }
                log::debug!("[sidecar/{name}] exited successfully");
                break;
            }
            _ => {}
        }
    }

    Ok(SidecarOutput { stdout, stderr })
}
