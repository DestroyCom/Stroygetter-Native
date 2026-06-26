export interface TrackMetadata {
  title: string;
  artist: string;
  album: string;
  year: string;
  coverUrl: string;
  lyricsLrc: string;
}

async function fetchYouTubeMusicMetadata(videoTitle: string, videoId: string): Promise<Partial<TrackMetadata>> {
  // PORT FROM WEB: Reproduire l'appel à l'API YouTube Music depuis
  // le repo web StroyGetter (route /api/download/audio-library-ready).
  // L'API YouTube Music (youtubei/v1/search) permet de récupérer
  // title, artist, album, year, coverUrl depuis l'ID YouTube.
  //
  // Implémentation minimale en attendant le port :
  return {
    title: videoTitle,
    artist: "Unknown Artist",
    album: videoTitle,
    year: new Date().getFullYear().toString(),
    coverUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
  };
}

async function fetchLrcLibLyrics(title: string, artist: string): Promise<string> {
  try {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    const res = await fetch(`https://lrclib.net/api/get?${params}`);
    if (!res.ok) return "";
    const data = await res.json() as { syncedLyrics?: string };
    return data.syncedLyrics ?? "";
  } catch {
    return "";
  }
}

export async function resolveLibraryReadyMetadata(
  videoTitle: string,
  videoId: string
): Promise<TrackMetadata> {
  const meta = await fetchYouTubeMusicMetadata(videoTitle, videoId);
  const title = meta.title ?? videoTitle;
  const artist = meta.artist ?? "Unknown Artist";
  const lyricsLrc = await fetchLrcLibLyrics(title, artist);

  return {
    title,
    artist,
    album: meta.album ?? title,
    year: meta.year ?? new Date().getFullYear().toString(),
    coverUrl: meta.coverUrl ?? "",
    lyricsLrc,
  };
}
