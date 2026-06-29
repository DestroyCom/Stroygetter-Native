import { getVersion } from "@tauri-apps/api/app";
import { loadDownloadSettings } from "./settings";

declare global {
  interface Window {
    umami?: {
      track: (event?: string | Record<string, unknown>, data?: Record<string, unknown>) => Promise<string>;
    };
  }
}

function isAnalyticsEnabled(): boolean {
  return (
    loadDownloadSettings().analyticsEnabled &&
    !!import.meta.env.VITE_UMAMI_WEBSITE_ID
  );
}

function detectOs(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("linux")) return "linux";
  if (ua.includes("android")) return "android";
  return "unknown";
}

export function trackEvent(event: string, data?: Record<string, unknown>): void {
  if (!isAnalyticsEnabled()) return;
  window.umami?.track(event, data);
}

export function trackPageView(): void {
  if (!isAnalyticsEnabled()) return;
  window.umami?.track();
}

export async function trackAppStarted(): Promise<void> {
  if (!isAnalyticsEnabled()) return;
  const version = await getVersion().catch(() => "unknown");
  const locale = localStorage.getItem("stroygetter-lang") ?? navigator.language;
  trackEvent("app_started", { version, os: detectOs(), locale });
}
