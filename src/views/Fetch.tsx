import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { GetterInput } from "@/components/custom/GetterInput";
import { VideoSelect } from "@/components/custom/VideoSelect";
import { VideoLoading } from "@/components/custom/VideoLoading";
import { fetchVideoInfo } from "@/lib/commands";
import type { VideoInfo, DownloadFormat } from "@/lib/types";

export function Fetch() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const url = searchParams.get("url") ?? "";

  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isDownloading, _setIsDownloading] = useState(false);
  const [progress, _setProgress] = useState(0);
  const [downloadError, _setDownloadError] = useState<string | null>(null);

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

  const handleDownload = async (_fmt: DownloadFormat, _quality: string) => {
    // Wired in Task 10
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
