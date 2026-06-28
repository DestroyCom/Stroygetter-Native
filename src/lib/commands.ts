import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { VideoInfo, DownloadRecord, DownloadProgress } from "./types";

export const fetchVideoInfo = (url: string): Promise<VideoInfo> =>
  invoke("fetch_video_info", { url });

export const getHistory = (): Promise<DownloadRecord[]> =>
  invoke("get_history");

export const downloadVideo = (
  url: string, itag: string, title: string, author: string, thumbnail?: string
): Promise<string> =>
  invoke("download_video", { url, itag, title, author, thumbnail });

export const downloadAudio = (
  url: string, title: string, author: string, thumbnail?: string
): Promise<string> =>
  invoke("download_audio", { url, title, author, thumbnail });

export const downloadTiktok = (
  url: string, watermark: boolean, audioOnly: boolean, title: string, author: string, thumbnail?: string
): Promise<string> =>
  invoke("download_tiktok", { url, watermark, audioOnly, title, author, thumbnail });

export const downloadTwitch = (
  url: string, formatId: string, title: string, author: string, thumbnail?: string
): Promise<string> =>
  invoke("download_twitch", { url, formatId, title, author, thumbnail });

export const downloadLibraryReady = (params: {
  url: string;
  title: string;
  artist: string;
  album: string;
  year: string;
  coverUrl: string;
  coverUrlFallback?: string;
  lyricsLrc: string;
  thumbnail?: string;
}): Promise<string> =>
  invoke("download_library_ready", {
    url: params.url,
    title: params.title,
    artist: params.artist,
    album: params.album,
    year: params.year,
    coverUrl: params.coverUrl,
    coverUrlFallback: params.coverUrlFallback,
    lyricsLrc: params.lyricsLrc,
    thumbnail: params.thumbnail,
  });

export const onDownloadProgress = (cb: (p: DownloadProgress) => void) =>
  listen<DownloadProgress>("download://progress", (e) => cb(e.payload));
