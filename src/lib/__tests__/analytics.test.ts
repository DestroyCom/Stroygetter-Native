import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { trackEvent, trackPageView } from "../analytics";

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
