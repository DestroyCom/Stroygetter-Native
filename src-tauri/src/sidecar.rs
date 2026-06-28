use tauri::AppHandle;
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
    let mut cmd = app
        .shell()
        .sidecar(name)
        .map_err(|e| format!("sidecar '{}' not found: {}", name, e))?;

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
                eprint!("[{name}] {text}");
                if let Some(tx) = &progress_tx {
                    let _ = tx.send(text.clone()).await;
                }
                stderr.push_str(&text);
                stderr.push('\n');
            }
            CommandEvent::Error(e) => return Err(e),
            CommandEvent::Terminated(status) => {
                if status.code != Some(0) {
                    return Err(format!("process exited with error: {}", stderr));
                }
                break;
            }
            _ => {}
        }
    }

    Ok(SidecarOutput { stdout, stderr })
}
