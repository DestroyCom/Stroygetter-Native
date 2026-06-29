export interface FormatEntry {
  itag?: string;
  formatId?: string;
  qualityLabel?: string;
}

export interface VideoInfo {
  title: string;
  author: string;
  thumbnail?: string;
  duration?: number;
  source: "youtube" | "tiktok" | "twitch" | "unknown";
  formats: FormatEntry[];
}

export interface DownloadRecord {
  id: string;
  url: string;
  title: string;
  author?: string;
  thumbnailUrl?: string;
  format: string;
  filePath: string;
  createdAt: number;
}

export type DownloadFormat =
  | "mp4"
  | "mp3"
  | "library-ready"
  | "tiktok-no-watermark"
  | "tiktok-watermark"
  | "tiktok-audio"
  | "twitch-video"
  | "twitch-audio";

export interface DownloadProgress {
  phase: "downloading" | "fetching_cover" | "embedding";
  percent: number;
}

export interface AudioMetadata {
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
  coverBase64?: string;
  lyricsPlain?: string;
  lyricsLrc?: string;
}

export interface WriteMetadataArgs {
  path: string;
  title: string;
  artist: string;
  album: string;
  year: string;
  coverUrl?: string;
  coverPath?: string;
  lyricsPlain: string;
  lyricsLrc: string;
}

export interface ItunesCoverResult {
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl: string;
}
