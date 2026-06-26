import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";

import { GetterInput } from "@/components/custom/GetterInput";
import { VideoLoading } from "@/components/custom/VideoLoading";
import { VideoSelect } from "@/components/custom/VideoSelect";
import {
  downloadAudio,
  downloadLibraryReady,
  downloadTiktok,
  downloadTwitch,
  downloadVideo,
  fetchVideoInfo,
  onDownloadProgress,
} from "@/lib/commands";
import { resolveLibraryReadyMetadata } from "@/lib/metadata";
import type { DownloadFormat, VideoInfo } from "@/lib/types";

export function Fetch() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const url = searchParams.get("url") ?? "";

  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const unlistenRef = useRef<Promise<() => void> | null>(null);

  useEffect(() => {
    if (!url) { navigate("/"); return; }
    setIsLoading(true);
    setFetchError(null);
    setInfo(null);
    fetchVideoInfo(url)
      .then(setInfo)
      .catch((e: unknown) => setFetchError(e instanceof Error ? e.message : String(e)))
      .finally(() => setIsLoading(false));
  }, [url, navigate]);

  useEffect(() => {
    const p = onDownloadProgress((p) => setProgress(p.percent));
    unlistenRef.current = p;
    return () => {
      p.then((unlisten) => unlisten());
    };
  }, []);

  const handleDownload = async (fmt: DownloadFormat, quality: string) => {
    if (!info) return;
    setDownloadError(null);
    setIsDownloading(true);
    setProgress(0);

    try {
      if (fmt === "mp4") {
        await downloadVideo(url, quality, info.title, info.author, info.thumbnail);
      } else if (fmt === "mp3") {
        await downloadAudio(url, info.title, info.author, info.thumbnail);
      } else if (fmt === "tiktok-no-watermark") {
        await downloadTiktok(url, false, false, info.title, info.author, info.thumbnail);
      } else if (fmt === "tiktok-watermark") {
        await downloadTiktok(url, true, false, info.title, info.author, info.thumbnail);
      } else if (fmt === "tiktok-audio") {
        await downloadTiktok(url, false, true, info.title, info.author, info.thumbnail);
      } else if (fmt === "twitch-video") {
        await downloadTwitch(url, quality, info.title, info.author, info.thumbnail);
      } else if (fmt === "twitch-audio") {
        await downloadTwitch(url, "audio", info.title, info.author, info.thumbnail);
      } else if (fmt === "library-ready") {
        const videoId = url.match(/[?&]v=([^&]+)/)?.[1] ?? "";
        const meta = await resolveLibraryReadyMetadata(info.title, videoId);
        await downloadLibraryReady({
          url,
          title: meta.title,
          artist: meta.artist,
          album: meta.album,
          year: meta.year,
          coverUrl: meta.coverUrl,
          lyricsLrc: meta.lyricsLrc,
          thumbnail: info.thumbnail,
        });
      }
      window.dispatchEvent(new Event("download-complete"));
    } catch (e: unknown) {
      setDownloadError(e instanceof Error ? e.message : t("videoSelect.errorDownload"));
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 px-6 py-8">
      <GetterInput initialUrl={url} />
      {isLoading && <VideoLoading />}
      {fetchError && (
        <div className="mx-auto flex min-h-48 w-full max-w-5xl items-center justify-center rounded-2xl border-2 border-dashed border-stroy-800">
          <p className="text-center font-bold text-white">{fetchError}</p>
        </div>
      )}
      {info && (
        <VideoSelect
          info={info}
          onDownload={handleDownload}
          isDownloading={isDownloading}
          progress={progress}
          downloadError={downloadError}
        />
      )}
    </div>
  );
}
