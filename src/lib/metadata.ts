export interface TrackMetadata {
  title: string;
  artist: string;
  album: string;
  year: string;
  coverUrl: string;
  lyricsLrc: string;
}

// Port of stripNoise from web project — removes "(Official Music Video)", "- Lyrics", etc.
function stripNoise(s: string): string {
  let out = s.replace(/\s*\|.*$/, "").trim();
  let prev = "";
  while (prev !== out) {
    prev = out;
    out = out
      .replace(/\s*[-–—]\s*(?:official|officiel|lyrics?|audio|video|music|visualizer|mv|clip|live|performance|remaster(?:ed)?).*/gi, "")
      .replace(/\s*(?:(?:official|special)\s+)?M\/?V\s*$/i, "")
      .replace(/\s*(?:official\s+)?(?:music\s+video|lyric(?:s)?\s+video|audio|video|clip|visualizer)\s*$/i, "")
      .replace(/\s*official\s*$/i, "")
      .replace(/\s*[([[][^\])[]*\b(?:official|officiel|lyrics?|audio|video|music|hd|hq|mv|4k|8k|clip|visualizer|live|remaster(?:ed)?|version|edit|performance|acoustic)\b[^\])[]*[\])][\s]*$/gi, "")
      .replace(/\s*[-–—]\s*$/, "")
      .trim();
  }
  return out;
}

// Port of parseTitleArtist — splits "Artist - Title" and similar patterns
function parseTitleArtist(ytTitle: string): { artist: string; title: string } | null {
  const cleaned = stripNoise(ytTitle);
  if (!cleaned) return null;

  // "Artist - 'Title'" quoted pattern
  const m1 = cleaned.match(/^(.+?)\s*[-–—]\s*["'"‘’“”](.+?)["'"‘’“”]\s*$/);
  if (m1) return { artist: m1[1].trim(), title: m1[2].trim() };

  // Standard dash: "Artist - Title"
  const m2 = cleaned.match(/^(.+?)\s*[-–—]\s*(.+?)\s*$/);
  if (m2?.[2]?.trim()) return { artist: m2[1].trim(), title: m2[2].trim() };

  return null;
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
    const term = encodeURIComponent(`${artist} ${title}`);
    const res = await fetch(`https://itunes.apple.com/search?term=${term}&media=music&limit=5`);
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: ItunesResult[] };
    const hit = data.results?.[0];
    if (!hit) return null;
    return {
      title: hit.trackName,
      artist: hit.artistName,
      album: hit.collectionName,
      year: hit.releaseDate?.substring(0, 4),
      // iTunes returns 100x100 artwork — upgrade to 1000x1000
      coverUrl: hit.artworkUrl100?.replace("100x100bb", "1000x1000bb"),
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

export async function resolveLibraryReadyMetadata(
  videoTitle: string,
  videoId: string,
): Promise<TrackMetadata> {
  // Parse "Olivia Rodrigo - stupid song (Official MV)" → { artist, title }
  const parsed = parseTitleArtist(videoTitle);
  const artist = parsed?.artist ?? "Unknown Artist";
  const cleanTitle = parsed?.title ?? (stripNoise(videoTitle) || videoTitle);

  // Fetch iTunes metadata + lyrics in parallel
  const [itunesMeta, lyricsLrc] = await Promise.all([
    parsed ? searchItunes(artist, cleanTitle) : Promise.resolve(null),
    fetchLrcLibLyrics(cleanTitle, artist),
  ]);

  const ytCover = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

  return {
    title: itunesMeta?.title ?? cleanTitle,
    artist: itunesMeta?.artist ?? artist,
    album: itunesMeta?.album ?? cleanTitle,
    year: itunesMeta?.year ?? new Date().getFullYear().toString(),
    coverUrl: itunesMeta?.coverUrl ?? ytCover,
    lyricsLrc,
  };
}
