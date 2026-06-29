import { describe, it, expect } from "vitest";

// Re-export isNewer for testing — add `export` to the function in updater.ts first (see step 3)
import { isNewer } from "../updater";

describe("isNewer", () => {
  it("detects patch update with two-part current version", () => {
    expect(isNewer("1.0", "1.0.1")).toBe(true);
  });

  it("detects minor update", () => {
    expect(isNewer("1.0.0", "1.1.0")).toBe(true);
  });

  it("detects major update", () => {
    expect(isNewer("1.0.0", "2.0.0")).toBe(true);
  });

  it("returns false when same version", () => {
    expect(isNewer("1.2.3", "1.2.3")).toBe(false);
  });

  it("returns false when current is newer", () => {
    expect(isNewer("2.0.0", "1.9.9")).toBe(false);
  });

  it("handles v prefix in candidate", () => {
    expect(isNewer("1.0.0", "v1.0.1")).toBe(true);
  });
});
