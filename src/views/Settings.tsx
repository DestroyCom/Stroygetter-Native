import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import i18n from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGS } from "@/lib/i18n";

export function Settings() {
  const { t } = useTranslation();
  const [downloadDir, setDownloadDir] = useState<string>(
    localStorage.getItem("stroygetter-download-dir") ?? ""
  );

  const handleLangChange = (code: string) => {
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
