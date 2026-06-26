import { invoke } from "@tauri-apps/api/core";
import type { VideoInfo, DownloadRecord } from "./types";

export const fetchVideoInfo = (url: string): Promise<VideoInfo> =>
  invoke("fetch_video_info", { url });

export const getHistory = (): Promise<DownloadRecord[]> =>
  invoke("get_history");
