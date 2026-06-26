import { resolveLibraryReadyMetadata } from "../metadata";

// Mock fetch so LRClib network call fails silently (as per implementation)
// without hanging the test runner in jsdom.
globalThis.fetch = async () => new Response(null, { status: 404 });

describe("resolveLibraryReadyMetadata", () => {
  it("returns a TrackMetadata object with required fields", async () => {
    const result = await resolveLibraryReadyMetadata("Test Song", "dQw4w9WgXcQ");
    expect(result).toHaveProperty("title");
    expect(result).toHaveProperty("artist");
    expect(result).toHaveProperty("album");
    expect(result).toHaveProperty("year");
    expect(result).toHaveProperty("coverUrl");
    expect(result).toHaveProperty("lyricsLrc");
    expect(typeof result.lyricsLrc).toBe("string");
  });
});
