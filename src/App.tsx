import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { getVersion } from "@tauri-apps/api/app";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { BottomNav } from "@/components/custom/BottomNav";
import { Sidebar } from "@/components/custom/Sidebar";
import { trackPageView } from "@/lib/analytics";
import { checkForUpdate, RELEASES_PAGE } from "@/lib/updater";
import { Fetch } from "@/views/Fetch";
import { Home } from "@/views/Home";
import { MetadataEditor } from "@/views/MetadataEditor";
import { Settings } from "@/views/Settings";
import { Updates } from "@/views/Updates";

function NavigationTracker() {
  const location = useLocation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on route change
  useEffect(() => {
    trackPageView();
  }, [location.pathname]);
  return null;
}

function UpdateBanner({ version, url, onDismiss }: { version: string; url: string; onDismiss: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 bg-stroy-500/15 border-b border-stroy-500/30 px-4 py-2.5 text-sm">
      <span className="text-white/80">
        Mise à jour disponible — <span className="font-semibold text-white">v{version}</span>
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => openUrl(url)}
          className="rounded-lg bg-stroy-500 px-3 py-1 text-xs font-bold text-white hover:bg-stroy-600 transition-colors"
        >
          Télécharger
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-white/40 hover:text-white/70 transition-colors"
          aria-label="Fermer"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function App() {
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateUrl, setUpdateUrl] = useState(RELEASES_PAGE);

  useEffect(() => {
    (async () => {
      try {
        const current = await getVersion();
        const info = await checkForUpdate(current);
        if (info?.isNewer) {
          setUpdateVersion(info.latestVersion);
          setUpdateUrl(info.releaseUrl);
        }
      } catch {
        // non-fatal — update check failure silently ignored
      }
    })();
  }, []);

  return (
    <BrowserRouter>
      <NavigationTracker />
      <div className="flex h-screen flex-col overflow-hidden bg-stroy-950 text-white">
        {updateVersion && (
          <UpdateBanner
            version={updateVersion}
            url={updateUrl}
            onDismiss={() => setUpdateVersion(null)}
          />
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar desktop uniquement */}
          <div className="hidden md:flex">
            <Sidebar />
          </div>

          {/* Main content */}
          <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/fetch" element={<Fetch />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/metadata-editor" element={<MetadataEditor />} />
              <Route path="/updates" element={<Updates />} />
            </Routes>
          </main>

          {/* Bottom nav mobile uniquement */}
          <BottomNav />
        </div>
      </div>
    </BrowserRouter>
  );
}
