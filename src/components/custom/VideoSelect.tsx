import { Disc3, Download, Film, Music } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { VideoInfo, DownloadFormat } from "@/lib/types";

interface Props {
  info: VideoInfo;
  onDownload: (fmt: DownloadFormat, quality: string) => Promise<void>;
  isDownloading: boolean;
  progress: number;
  downloadError: string | null;
}

type TabDef = { id: DownloadFormat; label: string; sub: string; Icon: typeof Film };

export function VideoSelect({ info, onDownload, isDownloading, progress, downloadError }: Props) {
  const { t } = useTranslation();

  const YOUTUBE_TABS: TabDef[] = [
    { id: "library-ready", label: t("videoSelect.formatLibraryReady"), sub: t("videoSelect.formatLibraryReadySub"), Icon: Disc3 },
    { id: "mp4", label: t("videoSelect.formatMp4"), sub: t("videoSelect.formatMp4Sub"), Icon: Film },
    { id: "mp3", label: t("videoSelect.formatMp3"), sub: t("videoSelect.formatMp3Sub"), Icon: Music },
  ];

  const TIKTOK_TABS: TabDef[] = [
    { id: "tiktok-no-watermark", label: t("videoSelect.formatTiktokNoWatermark"), sub: t("videoSelect.formatTiktokNoWatermarkSub"), Icon: Film },
    { id: "tiktok-watermark", label: t("videoSelect.formatTiktokWatermark"), sub: t("videoSelect.formatTiktokWatermarkSub"), Icon: Film },
    { id: "tiktok-audio", label: t("videoSelect.formatTiktokAudio"), sub: t("videoSelect.formatTiktokAudioSub"), Icon: Music },
  ];

  const TWITCH_TABS: TabDef[] = [
    { id: "twitch-video", label: t("videoSelect.formatTwitchVideo"), sub: t("videoSelect.formatTwitchVideoSub"), Icon: Film },
    { id: "twitch-audio", label: t("videoSelect.formatTwitchAudio"), sub: t("videoSelect.formatTwitchAudioSub"), Icon: Music },
  ];

  const TABS = info.source === "tiktok" ? TIKTOK_TABS : info.source === "twitch" ? TWITCH_TABS : YOUTUBE_TABS;
  const defaultFmt: DownloadFormat = info.source === "tiktok" ? "tiktok-no-watermark" : info.source === "twitch" ? "twitch-video" : "library-ready";

  const [fmt, setFmt] = useState<DownloadFormat>(defaultFmt);
  const [selectedQuality, setSelectedQuality] = useState<string>(info.formats[0]?.itag ?? info.formats[0]?.formatId ?? "");

  const currentTab = TABS.find((t) => t.id === fmt) ?? TABS[0];

  return (
    <div className="mx-auto max-w-270">
      <div className="overflow-hidden rounded-2xl border border-white/6 bg-stroy-800 md:grid md:grid-cols-[440px_1fr]">
        {/* Thumbnail */}
        <div className="relative flex min-h-70 items-center justify-center bg-stroy-900">
          <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.025)_0_14px,transparent_14px_28px)]" />
          {info.thumbnail ? (
            <img
              src={info.thumbnail}
              alt={t("videoSelect.thumbnailAlt", { title: info.title })}
              referrerPolicy="no-referrer"
              className="relative z-10 h-full w-full object-cover"
            />
          ) : (
            <Film size={48} className="relative z-10 text-stroy-400" />
          )}
          {info.author && (
            <div className="absolute left-3.5 top-3.5 z-20 flex items-center gap-2 rounded-full bg-black/55 px-2.5 py-1.5 text-[11px]">
              <span className="size-4.5 rounded-full bg-white/20" />
              <span>{info.author}</span>
            </div>
          )}
          {info.duration && (
            <div className="absolute bottom-3.5 right-3.5 z-20 rounded bg-black/70 px-2 py-1 font-mono text-xs tracking-wider">
              {info.duration}s
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex flex-col gap-6 p-8">
          <div>
            <h2 className="mb-2 text-xl font-bold leading-snug tracking-tight line-clamp-2">{info.title}</h2>
            <p className="text-sm font-medium text-white/60">{info.author}</p>
          </div>

          <div className="h-px bg-white/8" />

          {/* Format tabs */}
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-white/50">
              {t("videoSelect.chooseFormat")}
            </p>
            <div className="flex gap-2 rounded-2xl border border-white/6 bg-stroy-950 p-1.5">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFmt(tab.id)}
                  className={cn(
                    "flex flex-1 flex-col items-start justify-center gap-1 rounded-xl px-2 py-2.5 text-left transition-all sm:px-3.5 sm:py-3",
                    fmt === tab.id ? "bg-stroy-500 text-white" : "text-white/65 hover:bg-white/4 hover:text-white"
                  )}
                >
                  <span className="flex items-center gap-1.5 text-[12px] font-bold sm:gap-2 sm:text-[13px]">
                    <tab.Icon size={13} />
                    {tab.label}
                  </span>
                  <span className="hidden font-mono text-[11px] opacity-75 sm:block">{tab.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quality selector — YouTube MP4 */}
          {fmt === "mp4" && info.formats.length > 0 && (
            <Select value={selectedQuality} onValueChange={setSelectedQuality} disabled={isDownloading}>
              <SelectTrigger className="w-full border-white/10 bg-stroy-950 text-white">
                <SelectValue placeholder={t("videoSelect.selectQuality")} />
              </SelectTrigger>
              <SelectContent>
                {info.formats.filter((f) => f.itag && f.qualityLabel).map((f) => (
                  <SelectItem key={f.itag} value={f.itag!}>{f.qualityLabel}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Quality selector — Twitch */}
          {fmt === "twitch-video" && info.formats.length > 0 && (
            <Select value={selectedQuality} onValueChange={setSelectedQuality} disabled={isDownloading}>
              <SelectTrigger className="w-full border-white/10 bg-stroy-950 text-white">
                <SelectValue placeholder={t("videoSelect.selectQuality")} />
              </SelectTrigger>
              <SelectContent>
                {info.formats.filter((f) => f.formatId && f.qualityLabel).map((f) => (
                  <SelectItem key={f.formatId} value={f.formatId!}>{f.qualityLabel}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Library Ready callout */}
          {fmt === "library-ready" && (
            <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-stroy-700 p-4 sm:grid sm:grid-cols-[56px_1fr_auto] sm:items-center sm:gap-4">
              <div className="hidden size-14 items-center justify-center rounded-lg border border-white/10 bg-stroy-900 text-2xl text-white/40 sm:flex">♪</div>
              <div>
                <p className="mb-1 text-sm font-bold">{t("videoSelect.libraryReadyCalloutTitle")}</p>
                <p className="text-xs leading-snug text-white/70">{t("videoSelect.libraryReadyCalloutDesc")}</p>
              </div>
              <div className="flex flex-row gap-3 font-mono text-[10px] text-white/55 sm:flex-col sm:gap-1 sm:whitespace-nowrap">
                <span className="before:mr-1 before:text-stroy-200 before:content-['✓']">{t("videoSelect.libraryReadyCoverArt")}</span>
                <span className="before:mr-1 before:text-stroy-200 before:content-['✓']">{t("videoSelect.libraryReadyId3")}</span>
                <span className="before:mr-1 before:text-stroy-200 before:content-['✓']">{t("videoSelect.libraryReadyLyrics")}</span>
              </div>
            </div>
          )}

          {/* Download button / progress */}
          {isDownloading ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Progress value={progress} className="h-2 flex-1" />
                <span className="w-10 text-right font-mono text-xs text-white/55">{Math.round(progress)}%</span>
              </div>
              <p className="text-center text-xs italic text-white/55">
                {progress < 100 ? t("videoSelect.converting") : t("videoSelect.saving")}
              </p>
            </div>
          ) : downloadError ? (
            <div className="flex flex-col gap-3">
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-white/90">{downloadError}</p>
              <button
                type="button"
                onClick={() => onDownload(fmt, selectedQuality)}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/6 px-6 py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-white/10"
              >
                <Download size={18} />
                {t("videoSelect.retryButton", { format: currentTab.label })}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onDownload(fmt, selectedQuality)}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-stroy-500 px-6 py-4 text-[15px] font-bold text-white transition-colors hover:bg-stroy-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            >
              <Download size={18} />
              {t("videoSelect.downloadButton", { format: currentTab.label })}
            </button>
          )}

          <p className="text-center text-xs italic text-white/50">{t("videoSelect.disclaimer")}</p>
        </div>
      </div>
    </div>
  );
}
