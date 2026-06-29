import * as Sentry from "@sentry/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { DownloadSettings } from "./settings";
import { loadDownloadSettings } from "./settings";
import type { AudioMetadata, DownloadProgress, DownloadRecord, VideoInfo, WriteMetadataArgs } from "./types";

function captureIfEnabled(err: unknown, context?: Record<string, unknown>): void {
  if (!loadDownloadSettings().errorReportingEnabled) return;
  if (!import.meta.env.VITE_GLITCHTIP_DSN) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export const fetchVideoInfo = (url: string): Promise<VideoInfo> =>
  invoke<VideoInfo>("fetch_video_info", { url }).catch((e) => {
    captureIfEnabled(e, { command: "fetch_video_info" });
    throw e;
  });

export const getHistory = (): Promise<DownloadRecord[]> =>
  invoke<DownloadRecord[]>("get_history").catch((e) => {
    captureIfEnabled(e, { command: "get_history" });
    throw e;
  });

export const clearHistory = (): Promise<void> =>
  invoke<void>("clear_history").catch((e) => {
    captureIfEnabled(e, { command: "clear_history" });
    throw e;
  });

export const downloadVideo = (
  url: string, itag: string, title: string, author: string, thumbnail?: string
): Promise<string> =>
  invoke<string>("download_video", { url, itag, title, author, thumbnail }).catch((e) => {
    captureIfEnabled(e, { command: "download_video" });
    throw e;
  });

export const downloadAudio = (
  url: string, title: string, author: string, thumbnail?: string
): Promise<string> =>
  invoke<string>("download_audio", { url, title, author, thumbnail }).catch((e) => {
    captureIfEnabled(e, { command: "download_audio" });
    throw e;
  });

export const downloadTiktok = (
  url: string, watermark: boolean, audioOnly: boolean, title: string, author: string, thumbnail?: string
): Promise<string> =>
  invoke<string>("download_tiktok", { url, watermark, audioOnly, title, author, thumbnail }).catch((e) => {
    captureIfEnabled(e, { command: "download_tiktok" });
    throw e;
  });

export const downloadTwitch = (
  url: string, formatId: string, title: string, author: string, thumbnail?: string
): Promise<string> =>
  invoke<string>("download_twitch", { url, formatId, title, author, thumbnail }).catch((e) => {
    captureIfEnabled(e, { command: "download_twitch" });
    throw e;
  });

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
  invoke<string>("download_library_ready", {
    url: params.url,
    title: params.title,
    artist: params.artist,
    album: params.album,
    year: params.year,
    coverUrl: params.coverUrl,
    coverUrlFallback: params.coverUrlFallback,
    lyricsLrc: params.lyricsLrc,
    thumbnail: params.thumbnail,
  }).catch((e) => {
    captureIfEnabled(e, { command: "download_library_ready" });
    throw e;
  });

export const onDownloadProgress = (cb: (p: DownloadProgress) => void) =>
  listen<DownloadProgress>("download://progress", (e) => cb(e.payload));

export const detectAvailableBrowsers = (): Promise<string[]> =>
  invoke<string[]>("detect_available_browsers").catch((e) => {
    captureIfEnabled(e, { command: "detect_available_browsers" });
    throw e;
  });

export const updateDownloadSettings = (settings: DownloadSettings): Promise<void> =>
  invoke<void>("update_download_settings", {
    useCookies: settings.useCookies,
    cookiesBrowser: settings.cookiesBrowser,
  }).catch((e) => {
    captureIfEnabled(e, { command: "update_download_settings" });
    throw e;
  });

export const getDownloadSettings = (): Promise<DownloadSettings> =>
  invoke<DownloadSettings>("get_download_settings").catch((e) => {
    captureIfEnabled(e, { command: "get_download_settings" });
    throw e;
  });

export const readAudioMetadata = (path: string): Promise<AudioMetadata> =>
  invoke<AudioMetadata>("read_audio_metadata", { path }).catch((e) => {
    captureIfEnabled(e, { command: "read_audio_metadata" });
    throw e;
  });

export const getLogDir = (): Promise<string> =>
  invoke<string>("get_log_dir").catch((e) => {
    captureIfEnabled(e, { command: "get_log_dir" });
    throw e;
  });

export const openLogDir = (): Promise<void> =>
  invoke<void>("open_log_dir").catch((e) => {
    captureIfEnabled(e, { command: "open_log_dir" });
    throw e;
  });

export const setLogLevel = (level: string): Promise<void> =>
  invoke<void>("set_log_level", { level }).catch((e) => {
    captureIfEnabled(e, { command: "set_log_level" });
    throw e;
  });

export const writeAudioMetadata = (args: WriteMetadataArgs): Promise<void> =>
  invoke<void>("write_audio_metadata", {
    path: args.path,
    title: args.title,
    artist: args.artist,
    album: args.album,
    year: args.year,
    coverUrl: args.coverUrl,
    lyricsPlain: args.lyricsPlain,
    lyricsLrc: args.lyricsLrc,
  }).catch((e) => {
    captureIfEnabled(e, { command: "write_audio_metadata" });
    throw e;
  });
