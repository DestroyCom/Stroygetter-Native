import { useTranslation } from "react-i18next";
import { GetterInput } from "@/components/custom/GetterInput";

export function Home() {
  const { t } = useTranslation();

  const BADGES = [
    t("home.heroBadge1"),
    t("home.heroBadge2"),
    t("home.heroBadge3"),
    t("home.heroBadge4"),
  ];

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-16">
      {/* Hero */}
      <div className="mb-10 text-center">
        <h1 className="mb-4 text-4xl font-extrabold leading-tight tracking-tight text-white md:text-5xl">
          {t("home.heroTitle")}
        </h1>
        <p className="mb-6 text-xl font-light italic text-white/60">
          {t("home.heroSubtitle")}
        </p>
        <p className="mx-auto mb-8 max-w-xl text-sm leading-relaxed text-white/70">
          {t("home.heroDesc", {
            libraryReady: (chunks: string) => chunks,
          })}
        </p>
      </div>

      {/* Input */}
      <div className="w-full max-w-2xl">
        <GetterInput />
      </div>

      {/* Badges */}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {BADGES.map((b) => (
          <span
            key={b}
            className="flex items-center gap-1.5 text-xs text-white/60 before:text-stroy-400 before:content-['✓']"
          >
            {b}
          </span>
        ))}
      </div>

      {/* Disclaimer */}
      <p className="mt-4 text-center text-xs italic text-white/35">
        {t("home.heroDisclaimer")}
      </p>
    </div>
  );
}
