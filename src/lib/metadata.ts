export interface TrackMetadata {
  title: string;
  artist: string;
  album: string;
  year: string;
  coverUrl: string;
  lyricsLrc: string;
  coverUrlFallback?: string;
}

function stripNoise(s: string): string {
  let out = s.replace(/\s*\|.*$/, "").trim();
  let prev = "";
  while (prev !== out) {
    prev = out;
    out = out
      // Japanese noise suffixes
      .replace(/[\s　]*(?:リリックビデオ|ミュージックビデオ|公式MV|MVフル|フルMV|ビデオクリップ|ライブビデオ|オフィシャルビデオ)\s*$/g, "")
      // Bare dash-prefixed noise suffix
      .replace(/\s*[-–—]\s*(?:official|officiel|lyrics?|audio|video|music|visualizer|mv|clip|live|performance|remaster(?:ed)?).*/gi, "")
      // Bare MV / M/V at end
      .replace(/\s*(?:(?:official|special)\s+)?M\/?V\s*$/i, "")
      // Bare noise keywords at end
      .replace(/\s*(?:official\s+)?(?:music\s+video|lyric(?:s)?\s+video|audio|video|clip|visualizer)\s*$/i, "")
      .replace(/\s*official\s*$/i, "")
      // Parenthesised/bracketed noise block at end
      .replace(/\s*[(\[][^)\]]*\b(?:official|officiel|lyrics?|audio|video|music|hd|hq|mv|4k|8k|clip|visualizer|live|remaster(?:ed)?|version|edit|performance|acoustic)\b[^)\]]*[)\]]\s*$/gi, "")
      // Trailing bare dash
      .replace(/\s*[-–—]\s*$/, "")
      .trim();
  }
  return out;
}

// Strips "(parenthetical native-script)" blocks before API queries.
// "FIFTY FIFTY (피프티피프티)" -> "FIFTY FIFTY"
// -￿ = all non-ASCII printable chars (avoids \x00 control-char linter error)
function stripNativeScript(s: string): string {
  return s.replace(/\s*\([-￿]+\)/g, "").trim() || s;
}

// All special quote chars as \uNNNN to avoid file-encoding issues:
// " (U+0022)  ' (U+0027)  ' (U+2018)  ' (U+2019)  " (U+201C)  " (U+201D)
const QUOTE = "[\\u0022\\u0027\\u2018\\u2019\\u201C\\u201D]";
const DASH  = "[-\\u2013\\u2014]";

// Pattern 1: Artist - "Title"
const DASH_QUOTED_RE = new RegExp(`^(.+?)\\s*${DASH}\\s*${QUOTE}(.+?)${QUOTE}\\s*$`);
// Pattern 2: Artist "Title" (K-pop: TWICE "ONE SPARK", FIFTY FIFTY 'Like a Bubble')
const SPACE_QUOTED_RE = new RegExp(`^(.+?)\\s+${QUOTE}(.+?)${QUOTE}\\s*$`);
// Pattern 3: Japanese anime — 【Context】...『SongTitle』（Artist）
const JP_ANIME_RE = /[『【](.+?)[』】][^『【]*[『](.+?)[』][\s　]*[（(]([^）)]+)[）)]/;
// Pattern 4: Artist『Title』 (Japanese/Korean corner brackets)
const CORNER_RE = /^(.+?)\s*[『「](.+?)[』」]\s*$/;
// Pattern 5: Artist - Title
const DASH_RE = new RegExp(`^(.+?)\\s*${DASH}\\s*(.+?)\\s*$`);

function parseTitleArtist(ytTitle: string): { artist: string; title: string } | null {
  const cleaned = stripNoise(ytTitle);
  if (!cleaned) return null;

  const m1 = cleaned.match(DASH_QUOTED_RE);
  if (m1) return { artist: m1[1].trim(), title: m1[2].trim() };

  const m2 = cleaned.match(SPACE_QUOTED_RE);
  if (m2) return { artist: m2[1].trim(), title: m2[2].trim() };

  const m3 = cleaned.match(JP_ANIME_RE);
  if (m3) return { artist: m3[3].trim(), title: m3[2].trim() };

  const m4 = cleaned.match(CORNER_RE);
  if (m4) return { artist: m4[1].trim(), title: m4[2].trim() };

  const m5 = cleaned.match(DASH_RE);
  if (m5?.[2]?.trim()) return { artist: m5[1].trim(), title: m5[2].trim() };

  return null;
}

// ── Providers ─────────────────────────────────────────────────────────────────

interface MbRecording {
  title?: string;
  "artist-credit"?: Array<{ artist?: { name?: string } }>;
  releases?: Array<{
    id?: string;
    title?: string;
    date?: string;
  }>;
}

async function searchMusicBrainz(artist: string, title: string): Promise<Partial<TrackMetadata> | null> {
  try {
    const cleanArtist = stripNativeScript(artist);
    const query = encodeURIComponent(`recording:"${title}" AND artist:"${cleanArtist}"`);
    const res = await fetch(
      `https://musicbrainz.org/ws/2/recording?query=${query}&fmt=json&limit=5`,
      {
        headers: { "User-Agent": "StroyGetter-Native/1.0 (github.com/DestroyCom/Stroygetter-Native)" },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { recordings?: MbRecording[] };
    const recording = data.recordings?.[0];
    if (!recording) return null;

    const release = recording.releases?.[0];
    return {
      title: recording.title,
      artist: recording["artist-credit"]?.[0]?.artist?.name,
      album: release?.title,
      year: release?.date?.substring(0, 4),
      // CAA URL; Rust backend follows the redirect
      coverUrl: release?.id ? `https://coverartarchive.org/release/${release.id}/front` : undefined,
    };
  } catch {
    return null;
  }
}

interface ItunesResult {
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  releaseDate?: string;
  artworkUrl100?: string;
}

async function searchItunes(artist: string, title: string): Promise<Partial<TrackMetadata> | null> {
  try {
    const cleanArtist = stripNativeScript(artist);
    const term = encodeURIComponent(`${cleanArtist} ${title}`);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${term}&media=music&limit=5`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: ItunesResult[] };
    const hit = data.results?.[0];
    if (!hit) return null;
    return {
      title: hit.trackName,
      artist: hit.artistName,
      album: hit.collectionName,
      year: hit.releaseDate?.substring(0, 4),
      // iTunes 100x100 → upgrade to 1000x1000
      coverUrl: hit.artworkUrl100?.replace("100x100bb", "1000x1000bb"),
    };
  } catch {
    return null;
  }
}

interface DeezerTrack {
  title?: string;
  artist?: { name?: string };
  album?: { title?: string; cover_xl?: string; cover_big?: string };
}

async function searchDeezer(artist: string, title: string): Promise<Partial<TrackMetadata> | null> {
  try {
    const cleanArtist = stripNativeScript(artist);
    const q = encodeURIComponent(`${cleanArtist} ${title}`);
    const res = await fetch(`https://api.deezer.com/search?q=${q}&limit=5`);
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: DeezerTrack[] };
    const track = data.data?.[0];
    if (!track) return null;
    return {
      title: track.title,
      artist: track.artist?.name,
      album: track.album?.title,
      coverUrl: track.album?.cover_xl ?? track.album?.cover_big,
    };
  } catch {
    return null;
  }
}

async function fetchLrcLibLyrics(title: string, artist: string): Promise<string> {
  try {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    const res = await fetch(`https://lrclib.net/api/get?${params}`);
    if (!res.ok) return "";
    const data = (await res.json()) as { syncedLyrics?: string };
    return data.syncedLyrics ?? "";
  } catch {
    return "";
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function resolveLibraryReadyMetadata(
  videoTitle: string,
  videoId: string,
): Promise<TrackMetadata> {
  const parsed = parseTitleArtist(videoTitle);
  const artist = parsed?.artist ?? "Unknown Artist";
  const cleanTitle = parsed?.title ?? (stripNoise(videoTitle) || videoTitle);

  const [mbMeta, itunesMeta, deezerMeta, lyricsLrc] = await Promise.all([
    parsed ? searchMusicBrainz(artist, cleanTitle) : Promise.resolve(null),
    parsed ? searchItunes(artist, cleanTitle) : Promise.resolve(null),
    parsed ? searchDeezer(artist, cleanTitle) : Promise.resolve(null),
    fetchLrcLibLyrics(cleanTitle, artist),
  ]);

  // Text metadata: MusicBrainz (most authoritative) → iTunes → Deezer
  // Cover art: iTunes (1000x1000) → Deezer → MusicBrainz (CAA) → YouTube thumbnail
  const resolvedTitle  = mbMeta?.title   ?? itunesMeta?.title   ?? deezerMeta?.title   ?? cleanTitle;
  const resolvedArtist = mbMeta?.artist  ?? itunesMeta?.artist  ?? deezerMeta?.artist  ?? artist;
  const resolvedAlbum  = mbMeta?.album   ?? itunesMeta?.album   ?? deezerMeta?.album   ?? cleanTitle;
  const resolvedYear   = mbMeta?.year    ?? itunesMeta?.year    ?? deezerMeta?.year    ?? new Date().getFullYear().toString();
  const resolvedCover  = itunesMeta?.coverUrl ?? deezerMeta?.coverUrl ?? mbMeta?.coverUrl
    ?? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

  return {
    title:   resolvedTitle,
    artist:  resolvedArtist,
    album:   resolvedAlbum,
    year:    resolvedYear,
    coverUrl: resolvedCover,
    lyricsLrc,
    // hqdefault always exists — used by Rust backend if primary cover 404s
    coverUrlFallback: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  };
}
