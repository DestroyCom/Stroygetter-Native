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
  source: "youtube" | "tiktok" | "twitch";
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
