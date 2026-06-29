import { attachConsole, debug, error, info, trace, warn } from "@tauri-apps/plugin-log";

let attached = false;

export async function initLogger(): Promise<void> {
  if (attached) return;
  attached = true;
  // Redirects all console.log/warn/error to the Tauri log plugin (→ file)
  await attachConsole();
  info("Frontend logger attached");
}

export { trace, debug, info, warn, error };
