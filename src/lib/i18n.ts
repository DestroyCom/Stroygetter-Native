import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "../locales/en.json";
import frFR from "../locales/fr-FR.json";
import es419 from "../locales/es-419.json";
import ptBR from "../locales/pt-BR.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      "fr-FR": { translation: frFR },
      "es-419": { translation: es419 },
      "pt-BR": { translation: ptBR },
    },
    fallbackLng: "en",
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "stroygetter-lang",
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;

export const SUPPORTED_LANGS = [
  { code: "en", label: "English" },
  { code: "fr-FR", label: "Français" },
  { code: "es-419", label: "Español" },
  { code: "pt-BR", label: "Português" },
] as const;
