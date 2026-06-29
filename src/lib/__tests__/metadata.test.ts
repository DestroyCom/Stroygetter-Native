import { resolveLibraryReadyMetadata, searchItunesCover } from "../metadata";

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

describe("searchItunesCover", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns mapped results on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            trackName: "Song A",
            artistName: "Artist A",
            collectionName: "Album A",
            artworkUrl100: "https://example.com/100x100bb",
          },
        ],
      }),
    });

    const results = await searchItunesCover("Artist A Song A");
    expect(results).toHaveLength(1);
    expect(results[0].artworkUrl).toBe("https://example.com/1000x1000bb");
    expect(results[0].trackName).toBe("Song A");
  });

  it("returns [] on fetch error", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network"));
    const results = await searchItunesCover("anything");
    expect(results).toEqual([]);
  });
});
