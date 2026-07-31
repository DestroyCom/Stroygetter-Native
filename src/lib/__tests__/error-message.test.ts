import { describe, expect, it } from "vitest";
import { getErrorMessage } from "@/lib/error-message";

describe("getErrorMessage", () => {
  it("preserves Tauri string errors", () => {
    expect(getErrorMessage("ffmpeg exited with error: dyld", "Download failed")).toBe(
      "ffmpeg exited with error: dyld",
    );
  });

  it("preserves Error messages", () => {
    expect(getErrorMessage(new Error("network unavailable"), "Download failed")).toBe(
      "network unavailable",
    );
  });

  it("normalizes multiline errors and applies a display limit", () => {
    expect(getErrorMessage("line one\nline two", "Download failed")).toBe("line one line two");
    expect(getErrorMessage("123456", "Download failed", 5)).toBe("1234…");
  });

  it("uses the fallback for empty or unknown errors", () => {
    expect(getErrorMessage("  ", "Download failed")).toBe("Download failed");
    expect(getErrorMessage({ reason: "unknown" }, "Download failed")).toBe("Download failed");
  });
});
