import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadDownloadSettings, saveDownloadSettings } from "../settings";

describe("loadDownloadSettings", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("returns defaults when localStorage is empty", () => {
    const s = loadDownloadSettings();
    expect(s.analyticsEnabled).toBe(true);
    expect(s.errorReportingEnabled).toBe(true);
    expect(s.useCookies).toBe(false);
  });

  it("migrates old settings without analytics fields", () => {
    localStorage.setItem(
      "stroygetter-dl-settings",
      JSON.stringify({ useCookies: true, cookiesBrowser: "chrome" })
    );
    const s = loadDownloadSettings();
    expect(s.useCookies).toBe(true);
    expect(s.analyticsEnabled).toBe(true);
    expect(s.errorReportingEnabled).toBe(true);
  });

  it("preserves saved false values", () => {
    saveDownloadSettings({ analyticsEnabled: false, errorReportingEnabled: false });
    const s = loadDownloadSettings();
    expect(s.analyticsEnabled).toBe(false);
    expect(s.errorReportingEnabled).toBe(false);
  });
});
