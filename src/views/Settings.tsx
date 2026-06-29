import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import i18n from "i18next";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { trackEvent } from "@/lib/analytics";
import { detectAvailableBrowsers, getLogDir, setLogLevel, updateDownloadSettings } from "@/lib/commands";
import { SUPPORTED_LANGS } from "@/lib/i18n";
import { loadDownloadSettings, saveDownloadSettings, type LogLevel } from "@/lib/settings";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const BROWSER_LABELS: Record<string, string> = {
  safari: "Safari",
  chrome: "Google Chrome",
  firefox: "Mozilla Firefox",
  edge: "Microsoft Edge",
  brave: "Brave",
  arc: "Arc",
  opera: "Opera",
  chromium: "Chromium",
};

export function Settings() {
  const { t } = useTranslation();
  const [downloadDir, setDownloadDir] = useState<string>(
    localStorage.getItem("stroygetter-download-dir") ?? ""
  );

  const initial = loadDownloadSettings();
  const [useCookies, setUseCookies] = useState(initial.useCookies);
  const [cookiesBrowser, setCookiesBrowser] = useState(initial.cookiesBrowser);
  const [availableBrowsers, setAvailableBrowsers] = useState<string[]>([]);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(initial.analyticsEnabled);
  const [errorReportingEnabled, setErrorReportingEnabled] = useState(initial.errorReportingEnabled);
  const [logDir, setLogDir] = useState<string>("");
  const [logLevel, setLogLevelState] = useState<LogLevel>(initial.logLevel);

  useEffect(() => {
    getLogDir().then(setLogDir).catch(() => {});
    detectAvailableBrowsers().then((browsers) => {
      setAvailableBrowsers(browsers);
      setCookiesBrowser((prev) => (browsers.length > 0 && !browsers.includes(prev) ? browsers[0] : prev));
    });
  }, []);

  const handleCookiesToggle = (enabled: boolean) => {
    trackEvent("cookies_toggled", { enabled });
    setUseCookies(enabled);
    const saved = saveDownloadSettings({ useCookies: enabled, cookiesBrowser });
    updateDownloadSettings(saved);
  };

  const handleBrowserChange = (browser: string) => {
    setCookiesBrowser(browser);
    const saved = saveDownloadSettings({ useCookies, cookiesBrowser: browser });
    updateDownloadSettings(saved);
  };

  const handleAnalyticsToggle = (enabled: boolean) => {
    trackEvent("analytics_toggled", { enabled });
    setAnalyticsEnabled(enabled);
    saveDownloadSettings({ analyticsEnabled: enabled });
  };

  const handleErrorReportingToggle = (enabled: boolean) => {
    trackEvent("error_reporting_toggled", { enabled });
    setErrorReportingEnabled(enabled);
    saveDownloadSettings({ errorReportingEnabled: enabled });
  };

  const handleLogLevelChange = (level: LogLevel) => {
    setLogLevelState(level);
    saveDownloadSettings({ logLevel: level });
    setLogLevel(level);
  };

  const handleLangChange = (code: string) => {
    trackEvent("language_changed", { locale: code });
    i18n.changeLanguage(code);
    localStorage.setItem("stroygetter-lang", code);
  };

  const handlePickDir = async () => {
    const selected = await openDialog({ directory: true, multiple: false });
    if (typeof selected === "string") {
      setDownloadDir(selected);
      localStorage.setItem("stroygetter-download-dir", selected);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <h1 className="mb-8 text-2xl font-bold text-white">{t("settings.title", "Paramètres")}</h1>

      {/* Language */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-white/40">
          {t("settings.language", "Langue")}
        </h2>
        <div className="flex flex-col gap-2">
          {SUPPORTED_LANGS.map(({ code, label }) => (
            <button
              key={code}
              type="button"
              onClick={() => handleLangChange(code)}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                i18n.language === code
                  ? "border-stroy-500 bg-stroy-500/20 text-white"
                  : "border-white/10 bg-white/4 text-white/70 hover:border-white/20 hover:text-white"
              }`}
            >
              {label}
              {i18n.language === code && <span className="text-stroy-300">✓</span>}
            </button>
          ))}
        </div>
      </section>

      {/* Download folder */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-white/40">
          {t("settings.downloadFolder", "Dossier de téléchargement")}
        </h2>
        <div className="flex flex-col gap-2">
          {downloadDir && (
            <p className="rounded-xl border border-white/10 bg-white/4 px-4 py-3 font-mono text-xs text-white/70 break-all">
              {downloadDir}
            </p>
          )}
          <button
            type="button"
            onClick={handlePickDir}
            className="rounded-xl border border-white/10 bg-white/6 px-4 py-3 text-sm font-medium text-white/70 transition-colors hover:border-white/20 hover:text-white"
          >
            {downloadDir
              ? t("settings.changeFolder", "Changer le dossier")
              : t("settings.chooseFolder", "Choisir un dossier")}
          </button>
          <p className="text-xs text-white/35">
            {t("settings.defaultFolder", "Par défaut : dossier Téléchargements du système.")}
          </p>
        </div>
      </section>

      {/* Cookies */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-white/40">
          {t("settings.performance", "Performance")}
        </h2>
        <div className="flex flex-col gap-3">
          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-white/4 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">
                {t("settings.useCookies", "Utiliser les cookies du navigateur")}
              </p>
              <p className="mt-0.5 text-xs text-white/35">
                {t("settings.useCookiesDesc", "Réduit le throttling YouTube. Cookies lus localement, jamais transmis ailleurs.")}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={useCookies}
              aria-label={t("settings.useCookies", "Utiliser les cookies du navigateur")}
              onClick={() => handleCookiesToggle(!useCookies)}
              className={`relative ml-4 h-6 w-11 shrink-0 rounded-full transition-colors ${
                useCookies ? "bg-stroy-500" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  useCookies ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </label>

          {useCookies && availableBrowsers.length > 0 && (
            <div className="flex flex-col gap-2 pl-1">
              <p className="text-xs font-medium text-white/50">
                {t("settings.browserSource", "Navigateur source")}
              </p>
              <div className="flex flex-wrap gap-2">
                {availableBrowsers.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => handleBrowserChange(b)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      cookiesBrowser === b
                        ? "border-stroy-500 bg-stroy-500/20 text-white"
                        : "border-white/10 bg-white/4 text-white/60 hover:border-white/20 hover:text-white"
                    }`}
                  >
                    {BROWSER_LABELS[b] ?? b}
                  </button>
                ))}
              </div>
            </div>
          )}

          {useCookies && availableBrowsers.length === 0 && (
            <p className="text-xs text-white/35 pl-1">
              {t("settings.noBrowserFound", "Aucun navigateur compatible détecté.")}
            </p>
          )}

          {useCookies && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3">
              <p className="text-xs font-semibold text-amber-400 mb-1">
                ⚠ {t("settings.cookiesWarningTitle", "Option avancée — dernier recours")}
              </p>
              <p className="text-xs leading-relaxed text-amber-300/70">
                {t(
                  "settings.cookiesWarningBody",
                  "Cette option lit les cookies de session de votre navigateur pour contourner les restrictions YouTube. Elle ne doit être activée qu'en cas de problèmes persistants de téléchargement. L'utilisation se fait à vos risques et périls. Les développeurs de StroyGetter ne peuvent être tenus responsables d'une suspension de compte ou de tout autre conséquence liée à l'activation de cette option."
                )}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Privacy */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-white/40">
          {t("settings.privacy", "Confidentialité")}
        </h2>
        <div className="flex flex-col gap-3">
          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-white/4 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">
                {t("settings.analytics", "Analytics d'utilisation")}
              </p>
              <p className="mt-0.5 text-xs text-white/35">
                {t("settings.analyticsDesc", "Envoyer des données d'utilisation anonymes pour améliorer l'app")}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={analyticsEnabled}
              aria-label={t("settings.analytics", "Analytics d'utilisation")}
              onClick={() => handleAnalyticsToggle(!analyticsEnabled)}
              className={`relative ml-4 h-6 w-11 shrink-0 rounded-full transition-colors ${
                analyticsEnabled ? "bg-stroy-500" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  analyticsEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </label>

          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-white/4 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">
                {t("settings.errorReporting", "Rapport de crash")}
              </p>
              <p className="mt-0.5 text-xs text-white/35">
                {t("settings.errorReportingDesc", "Envoyer automatiquement les rapports de crash")}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={errorReportingEnabled}
              aria-label={t("settings.errorReporting", "Rapport de crash")}
              onClick={() => handleErrorReportingToggle(!errorReportingEnabled)}
              className={`relative ml-4 h-6 w-11 shrink-0 rounded-full transition-colors ${
                errorReportingEnabled ? "bg-stroy-500" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  errorReportingEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </label>
        </div>
      </section>

      {/* Debug logs */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-white/40">
          {t("settings.debugLogs", "Journaux de débogage")}
        </h2>
        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-2 text-xs font-medium text-white/50">
              {t("settings.logLevel", "Niveau de log")}
            </p>
            <Tabs
              value={logLevel}
              onValueChange={(v) => handleLogLevelChange(v as LogLevel)}
            >
              <TabsList className="w-full">
                <TabsTrigger value="debug" className="flex-1">Debug</TabsTrigger>
                <TabsTrigger value="info" className="flex-1">Info</TabsTrigger>
                <TabsTrigger value="warn" className="flex-1">Warn</TabsTrigger>
                <TabsTrigger value="error" className="flex-1">Error</TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="mt-1.5 text-xs text-white/35">
              {t("settings.logLevelDesc", "Debug : tout logger. Info : opérations normales. Warn/Error : problèmes uniquement.")}
            </p>
          </div>
          {logDir && (
            <p className="rounded-xl border border-white/10 bg-white/4 px-4 py-3 font-mono text-xs text-white/70 break-all">
              {logDir}
            </p>
          )}
          <button
            type="button"
            onClick={() => logDir && openUrl(logDir)}
            disabled={!logDir}
            className="rounded-xl border border-white/10 bg-white/6 px-4 py-3 text-sm font-medium text-white/70 transition-colors hover:border-white/20 hover:text-white disabled:opacity-40"
          >
            {t("settings.openLogFolder", "Ouvrir le dossier de logs")}
          </button>
          <p className="text-xs text-white/35">
            {t("settings.debugLogsDesc", "Fichiers stroygetter.log — rotation automatique à 5 MB.")}
          </p>
        </div>
      </section>

      {/* App version */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-white/40">
          {t("settings.version", "Version")}
        </h2>
        <p className="text-sm text-white/50">StroyGetter Native — 0.1.0</p>
        <p className="text-xs text-white/25 mt-1">Tauri v2 · React 18 · Vite 5</p>
        <button
          type="button"
          onClick={() => openUrl("https://github.com/DestroyCom/Stroygetter-Native/releases")}
          className="mt-3 rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm font-medium text-white/70 transition-colors hover:border-white/20 hover:text-white"
        >
          {t("settings.checkUpdates", "Vérifier les mises à jour")}
        </button>
      </section>

      {/* About */}
      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-white/40">
          {t("settings.about", "À propos")}
        </h2>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => openUrl("https://stroygetter.fr")}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white/70 transition-colors hover:border-white/20 hover:text-white"
          >
            <span>stroygetter.fr</span>
            <span className="text-xs text-white/30">↗</span>
          </button>
          <button
            type="button"
            onClick={() => openUrl("https://github.com/DestroyCom/StroyGetter")}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white/70 transition-colors hover:border-white/20 hover:text-white"
          >
            <span>GitHub — DestroyCom/StroyGetter</span>
            <span className="text-xs text-white/30">↗</span>
          </button>
          <p className="pt-2 text-xs leading-relaxed text-white/25">
            StroyGetter Native est le client bureau de StroyGetter, développé par{" "}
            <button
              type="button"
              className="underline decoration-white/20 hover:text-white/50"
              onClick={() => openUrl("https://portfolio.stroyco.eu")}
            >
              StroyCo
            </button>
            . L'application utilise yt-dlp et ffmpeg pour le téléchargement et la conversion.
          </p>
        </div>
      </section>
    </div>
  );
}
