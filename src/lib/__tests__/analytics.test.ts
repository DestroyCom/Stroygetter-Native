import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { trackEvent, trackPageView, trackAppStarted } from "../analytics";
import { getVersion } from "@tauri-apps/api/app";

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(),
}));

const mockUmami = { track: vi.fn() };

describe("trackEvent", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("umami", mockUmami);
    // VITE_UMAMI_WEBSITE_ID est non défini dans les tests → isAnalyticsEnabled = false
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("does not call umami when VITE_UMAMI_WEBSITE_ID is not set", () => {
    vi.stubEnv("VITE_UMAMI_WEBSITE_ID", "");
    trackEvent("test_event", { foo: "bar" });
    expect(mockUmami.track).not.toHaveBeenCalled();
  });

  it("does not call umami when analyticsEnabled is false", () => {
    // Simuler VITE_UMAMI_WEBSITE_ID défini
    vi.stubEnv("VITE_UMAMI_WEBSITE_ID", "test-id");
    localStorage.setItem(
      "stroygetter-dl-settings",
      JSON.stringify({ analyticsEnabled: false })
    );
    trackEvent("test_event");
    expect(mockUmami.track).not.toHaveBeenCalled();
  });

  it("calls umami.track when analytics is enabled and env is set", () => {
    vi.stubEnv("VITE_UMAMI_WEBSITE_ID", "test-id");
    localStorage.setItem("stroygetter-dl-settings", JSON.stringify({ analyticsEnabled: true }));
    trackEvent("download_started", { source: "youtube" });
    expect(mockUmami.track).toHaveBeenCalledWith("download_started", { source: "youtube" });
  });
});

describe("trackPageView", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("umami", mockUmami);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("does not call umami when disabled", () => {
    // Ensure VITE_UMAMI_WEBSITE_ID is explicitly undefined
    vi.stubEnv("VITE_UMAMI_WEBSITE_ID", "");
    trackPageView();
    expect(mockUmami.track).not.toHaveBeenCalled();
  });

  it("calls umami.track() with no args when enabled", () => {
    vi.stubEnv("VITE_UMAMI_WEBSITE_ID", "test-id");
    trackPageView();
    expect(mockUmami.track).toHaveBeenCalledWith();
  });
});

describe("trackAppStarted", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("umami", mockUmami);
    vi.clearAllMocks();
    (getVersion as Mock).mockResolvedValue("1.0.0");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("does not call umami when analytics is disabled", async () => {
    // VITE_UMAMI_WEBSITE_ID not set → isAnalyticsEnabled returns false
    vi.stubEnv("VITE_UMAMI_WEBSITE_ID", "");
    await trackAppStarted();
    expect(mockUmami.track).not.toHaveBeenCalled();
  });

  it("calls umami.track with app_started event when analytics is enabled", async () => {
    vi.stubEnv("VITE_UMAMI_WEBSITE_ID", "test-id");
    localStorage.setItem("stroygetter-dl-settings", JSON.stringify({ analyticsEnabled: true }));
    (getVersion as Mock).mockResolvedValue("1.0.0");

    await trackAppStarted();

    expect(mockUmami.track).toHaveBeenCalledWith("app_started", expect.objectContaining({
      version: "1.0.0",
      os: expect.any(String),
      locale: expect.any(String),
    }));
  });

  it("handles getVersion rejection gracefully and uses 'unknown' as version", async () => {
    vi.stubEnv("VITE_UMAMI_WEBSITE_ID", "test-id");
    localStorage.setItem("stroygetter-dl-settings", JSON.stringify({ analyticsEnabled: true }));
    (getVersion as Mock).mockRejectedValue(new Error("Version fetch failed"));

    await trackAppStarted();

    expect(mockUmami.track).toHaveBeenCalledWith("app_started", expect.objectContaining({
      version: "unknown",
      os: expect.any(String),
      locale: expect.any(String),
    }));
  });
});
