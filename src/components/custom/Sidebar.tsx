import { useEffect, useState } from "react";
import { Film, Plus, Settings, Tag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import logoWhite from "@/assets/logo-white.svg";
import { getHistory } from "@/lib/commands";
import type { DownloadRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [history, setHistory] = useState<DownloadRecord[]>([]);

  useEffect(() => {
    getHistory().then(setHistory).catch(() => {});
  }, []); // Load once on mount

  return (
    <aside className="flex h-screen w-[220px] shrink-0 flex-col border-r border-white/8 bg-stroy-900">
      {/* Logo */}
      <div className="flex items-center gap-2.5 border-b border-white/8 px-5 py-5">
        <img src={logoWhite} alt="StroyGetter" className="h-6" />
        <span className="font-bold tracking-tight text-white">StroyGetter</span>
      </div>

      {/* New */}
      <div className="px-3 pt-4">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/6 hover:text-white"
        >
          <Plus size={15} />
          {t("sidebar.newDownload", "New download")}
        </button>
      </div>

      {/* History */}
      <div className="flex-1 overflow-y-auto px-3 pt-4">
        <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-white/30">
          {t("sidebar.history", "History")}
        </p>
        {history.length === 0 && (
          <p className="px-3 text-xs text-white/25">{t("sidebar.noDownloads", "No downloads")}</p>
        )}
        {history.slice(0, 15).map((item) => (
          <div key={item.id} className="group relative flex items-center">
            <button
              type="button"
              onClick={() => navigate(`/fetch?url=${encodeURIComponent(item.url)}`)}
              className="flex flex-1 items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/6 pr-8"
            >
              {item.thumbnailUrl ? (
                <img src={item.thumbnailUrl} alt="" className="size-8 shrink-0 rounded object-cover" />
              ) : (
                <div className="flex size-8 shrink-0 items-center justify-center rounded bg-stroy-800">
                  <Film size={12} className="text-white/30" />
                </div>
              )}
              <span className="truncate text-xs text-white/70">{item.title}</span>
            </button>
            {item.filePath?.endsWith(".mp3") && (
              <button
                type="button"
                onClick={() =>
                  navigate(`/metadata-editor?path=${encodeURIComponent(item.filePath)}`)
                }
                title={t("sidebar.editMetadata", "Edit metadata")}
                className="absolute right-2 hidden group-hover:flex items-center justify-center rounded p-1 text-white/30 hover:text-white transition-colors"
              >
                <Tag size={12} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Metadata + Settings */}
      <div className="border-t border-white/8 px-3 py-3 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => navigate("/metadata-editor")}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
            location.pathname === "/metadata-editor"
              ? "bg-white/8 text-white"
              : "text-white/60 hover:bg-white/6 hover:text-white"
          )}
        >
          <Tag size={15} />
          {t("sidebar.metadata", "Metadata")}
        </button>
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
            location.pathname === "/settings"
              ? "bg-white/8 text-white"
              : "text-white/60 hover:bg-white/6 hover:text-white"
          )}
        >
          <Settings size={15} />
          {t("sidebar.settings", "Settings")}
        </button>
      </div>
    </aside>
  );
}
