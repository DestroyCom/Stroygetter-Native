# Analytics & Error Reporting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Intégrer Umami (analytics) et GlitchTip (rapport d'erreurs) dans l'app native Tauri, avec deux toggles indépendants dans Settings (activés par défaut).

**Architecture:** Le frontend utilise le script Umami avec `data-auto-track="false"` (tracking manuel via `window.umami?.track()`) et `@sentry/react` pour GlitchTip. Le backend Rust utilise le crate `sentry` pour capturer les panics. Les toggles utilisateur sont stockés dans `localStorage` via le système de settings existant. Toutes les variables de config sont en variables d'environnement (vides en dev = aucun tracking).

**Tech Stack:** Umami self-hosted (`analytics.stroyco.eu`), GlitchTip self-hosted Sentry-compatible (`errors.stroyco.eu`), `@sentry/react`, crate Rust `sentry = "0.34"`, Vite env vars `VITE_UMAMI_WEBSITE_ID` et `VITE_GLITCHTIP_DSN`, variable de build Rust `GLITCHTIP_DSN`.

## Global Constraints

- `analyticsEnabled` et `errorReportingEnabled` sont `true` par défaut dans DEFAULTS.
- Aucune donnée personnelle dans les events : pas d'URL de fichier, pas de titre de vidéo, pas de contenu de lyrics.
- Si `VITE_UMAMI_WEBSITE_ID` est vide → `isAnalyticsEnabled()` retourne `false`, aucun appel Umami.
- Si `VITE_GLITCHTIP_DSN` est vide → Sentry non initialisé, aucun envoi.
- Le toggle utilisateur est effectif au prochain lancement (pas de réinit à chaud).
- Rust panic reporting : `option_env!("GLITCHTIP_DSN")` est évalué à la **compilation** — absent si non défini au build.
- Pas de Co-Authored-By dans les commits.
- Suivre le pattern de toggle switch existant dans Settings.tsx (role="switch", aria-checked, classes Tailwind stroy-500).

---

## File Map

| Fichier | Action | Rôle |
|---------|--------|------|
| `src/lib/settings.ts` | Modifier | Ajouter `analyticsEnabled` + `errorReportingEnabled` |
| `src/lib/analytics.ts` | Créer | Helpers Umami : `trackEvent`, `trackPageView`, `trackAppStarted` |
| `src/lib/__tests__/analytics.test.ts` | Créer | Tests unitaires analytics.ts |
| `src/lib/__tests__/settings.test.ts` | Créer | Tests migration settings |
| `index.html` | Modifier | Injecter script Umami |
| `src/main.tsx` | Modifier | Init Sentry conditionnel + `<ErrorBoundary>` + appel `trackAppStarted` |
| `src/lib/commands.ts` | Modifier | Ajouter `captureIfEnabled` + `.catch()` sur chaque invoke |
| `src/views/Settings.tsx` | Modifier | Section "Confidentialité" avec 2 toggles |
| `src/App.tsx` | Modifier | `useLocation` pour tracking navigation |
| `src/views/Fetch.tsx` | Modifier | Events download_started/completed/failed |
| `src/views/MetadataEditor.tsx` | Modifier | Events metadata_opened_from/saved/itunes_* |
| `src/locales/en.json` | Modifier | Clés i18n privacy section |
| `src/locales/fr-FR.json` | Modifier | Clés i18n privacy section |
| `src/locales/es-419.json` | Modifier | Clés i18n privacy section |
| `src/locales/pt-BR.json` | Modifier | Clés i18n privacy section |
| `src-tauri/Cargo.toml` | Modifier | Ajouter crate `sentry` |
| `src-tauri/src/lib.rs` | Modifier | `init_sentry()` + guard en vie pendant run() |
| `src-tauri/tauri.conf.json` | Modifier | CSP : ajouter `analytics.stroyco.eu` et `errors.stroyco.eu` |
| `.env.example` | Créer | Template des variables d'environnement |
| `.github/workflows/release.yml` | Modifier | Passer `GLITCHTIP_DSN` au build Tauri |
| `docs/ai-context.md` | Modifier | Documenter les nouveaux systèmes |

---

## Task 1 — Settings model

**Files:**
- Modify: `src/lib/settings.ts`
- Create: `src/lib/__tests__/settings.test.ts`

**Interfaces:**
- Consumes: rien
- Produces:
  ```typescript
  // dans settings.ts
  interface DownloadSettings {
    useCookies: boolean;
    cookiesBrowser: string;
    analyticsEnabled: boolean;
    errorReportingEnabled: boolean;
  }
  // DEFAULTS.analyticsEnabled = true
  // DEFAULTS.errorReportingEnabled = true
  ```

- [ ] **Step 1: Écrire le test de migration**

Créer `src/lib/__tests__/settings.test.ts` :

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadDownloadSettings, saveDownloadSettings } from "../settings";

describe("loadDownloadSettings", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("returns defaults when localStorage is empty", () => {
    const s = loadDownloadSettings();
    expect(s.analyticsEnabled).toBe(true);
    expect(s.errorReportingEnabled).toBe(true);
    expect(s.useCookies).toBe(false);
  });

  it("migrates old settings without analytics fields", () => {
    localStorage.setItem(
      "stroygetter-dl-settings",
      JSON.stringify({ useCookies: true, cookiesBrowser: "chrome" })
    );
    const s = loadDownloadSettings();
    expect(s.useCookies).toBe(true);
    expect(s.analyticsEnabled).toBe(true);
    expect(s.errorReportingEnabled).toBe(true);
  });

  it("preserves saved false values", () => {
    saveDownloadSettings({ analyticsEnabled: false, errorReportingEnabled: false });
    const s = loadDownloadSettings();
    expect(s.analyticsEnabled).toBe(false);
    expect(s.errorReportingEnabled).toBe(false);
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue**

```bash
cd /path/to/stroygetter-native && npm test -- --reporter=verbose 2>&1 | grep -E "settings|FAIL|PASS"
```

Expected: FAIL — les champs `analyticsEnabled` et `errorReportingEnabled` n'existent pas encore.

- [ ] **Step 3: Modifier `src/lib/settings.ts`**

```typescript
export interface DownloadSettings {
  useCookies: boolean;
  cookiesBrowser: string;
  analyticsEnabled: boolean;
  errorReportingEnabled: boolean;
}

const KEY = "stroygetter-dl-settings";

const DEFAULTS: DownloadSettings = {
  useCookies: false,
  cookiesBrowser: "",
  analyticsEnabled: true,
  errorReportingEnabled: true,
};

export function loadDownloadSettings(): DownloadSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveDownloadSettings(patch: Partial<DownloadSettings>): DownloadSettings {
  const next = { ...loadDownloadSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
```

- [ ] **Step 4: Vérifier que le test passe**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "settings|FAIL|PASS"
```

Expected: PASS — 3 tests verts.

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings.ts src/lib/__tests__/settings.test.ts
git commit -m "feat(settings): add analyticsEnabled and errorReportingEnabled fields"
```

---

## Task 2 — Umami analytics module

**Files:**
- Create: `src/lib/analytics.ts`
- Create: `src/lib/__tests__/analytics.test.ts`
- Modify: `index.html`

**Interfaces:**
- Consumes: `loadDownloadSettings()` de `src/lib/settings.ts`
- Produces:
  ```typescript
  export function trackEvent(event: string, data?: Record<string, unknown>): void
  export function trackPageView(): void
  export async function trackAppStarted(): Promise<void>
  ```

- [ ] **Step 1: Écrire les tests**

Créer `src/lib/__tests__/analytics.test.ts` :

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { trackEvent, trackPageView } from "../analytics";

const mockUmami = { track: vi.fn() };

describe("trackEvent", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("umami", mockUmami);
    // VITE_UMAMI_WEBSITE_ID est non défini dans les tests → isAnalyticsEnabled = false
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("does not call umami when VITE_UMAMI_WEBSITE_ID is not set", () => {
    trackEvent("test_event", { foo: "bar" });
    expect(mockUmami.track).not.toHaveBeenCalled();
  });

  it("does not call umami when analyticsEnabled is false", () => {
    // Simuler VITE_UMAMI_WEBSITE_ID défini
    vi.stubEnv("VITE_UMAMI_WEBSITE_ID", "test-id");
    localStorage.setItem(
      "stroygetter-dl-settings",
      JSON.stringify({ analyticsEnabled: false })
    );
    trackEvent("test_event");
    expect(mockUmami.track).not.toHaveBeenCalled();
  });

  it("calls umami.track when analytics is enabled and env is set", () => {
    vi.stubEnv("VITE_UMAMI_WEBSITE_ID", "test-id");
    trackEvent("download_started", { source: "youtube" });
    expect(mockUmami.track).toHaveBeenCalledWith("download_started", { source: "youtube" });
  });
});

describe("trackPageView", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("umami", mockUmami);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("does not call umami when disabled", () => {
    trackPageView();
    expect(mockUmami.track).not.toHaveBeenCalled();
  });

  it("calls umami.track() with no args when enabled", () => {
    vi.stubEnv("VITE_UMAMI_WEBSITE_ID", "test-id");
    trackPageView();
    expect(mockUmami.track).toHaveBeenCalledWith();
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "analytics|FAIL|PASS"
```

Expected: FAIL — `analytics` module n'existe pas.

- [ ] **Step 3: Créer `src/lib/analytics.ts`**

```typescript
import { getVersion } from "@tauri-apps/api/app";
import { loadDownloadSettings } from "./settings";

declare global {
  interface Window {
    umami?: {
      track: (event?: string | Record<string, unknown>, data?: Record<string, unknown>) => Promise<string>;
    };
  }
}

function isAnalyticsEnabled(): boolean {
  return (
    loadDownloadSettings().analyticsEnabled &&
    !!import.meta.env.VITE_UMAMI_WEBSITE_ID
  );
}

function detectOs(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("linux")) return "linux";
  if (ua.includes("android")) return "android";
  return "unknown";
}

export function trackEvent(event: string, data?: Record<string, unknown>): void {
  if (!isAnalyticsEnabled()) return;
  window.umami?.track(event, data);
}

export function trackPageView(): void {
  if (!isAnalyticsEnabled()) return;
  window.umami?.track();
}

export async function trackAppStarted(): Promise<void> {
  if (!isAnalyticsEnabled()) return;
  const version = await getVersion().catch(() => "unknown");
  const locale = localStorage.getItem("stroygetter-lang") ?? navigator.language;
  trackEvent("app_started", { version, os: detectOs(), locale });
}
```

- [ ] **Step 4: Modifier `index.html`**

Ajouter le script Umami dans `<head>`, après le tag `<title>` :

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>StroyGetter</title>
    <script
      async
      src="https://analytics.stroyco.eu/script.js"
      data-website-id="%VITE_UMAMI_WEBSITE_ID%"
      data-do-not-track="true"
      data-auto-track="false"
    ></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Note : `%VITE_UMAMI_WEBSITE_ID%` est remplacé par Vite au build. En dev sans `.env.local`, le website ID est vide et Umami ne tracke rien.

- [ ] **Step 5: Vérifier que les tests passent**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "analytics|settings|FAIL|PASS"
```

Expected: tous PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics.ts src/lib/__tests__/analytics.test.ts index.html
git commit -m "feat(analytics): add Umami analytics module with trackEvent/trackPageView/trackAppStarted"
```

---

## Task 3 — GlitchTip frontend

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `src/main.tsx`
- Modify: `src/lib/commands.ts`

**Interfaces:**
- Consumes: `loadDownloadSettings().errorReportingEnabled`, `import.meta.env.VITE_GLITCHTIP_DSN`
- Produces: Sentry initialisé dans `main.tsx`, `captureIfEnabled(err, context?)` disponible dans `commands.ts`

- [ ] **Step 1: Installer @sentry/react**

```bash
npm install @sentry/react
```

Expected: `@sentry/react` apparaît dans `package.json` dependencies.

- [ ] **Step 2: Modifier `src/main.tsx`**

```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import "./globals.css";
import "./lib/i18n";
import { App } from "./App";
import { loadDownloadSettings } from "./lib/settings";
import { trackAppStarted } from "./lib/analytics";

const settings = loadDownloadSettings();

if (settings.errorReportingEnabled && import.meta.env.VITE_GLITCHTIP_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_GLITCHTIP_DSN,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
  });
}

trackAppStarted();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<p className="p-8 text-white">Une erreur inattendue est survenue.</p>}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
```

- [ ] **Step 3: Modifier `src/lib/commands.ts`**

Ajouter `captureIfEnabled` et les `.catch()` sur chaque invoke. Remplacer le fichier complet :

```typescript
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import * as Sentry from "@sentry/react";
import type { DownloadSettings } from "./settings";
import { loadDownloadSettings } from "./settings";
import type { VideoInfo, DownloadRecord, DownloadProgress, AudioMetadata, WriteMetadataArgs } from "./types";

function captureIfEnabled(err: unknown, context?: Record<string, unknown>): void {
  if (!loadDownloadSettings().errorReportingEnabled) return;
  if (!import.meta.env.VITE_GLITCHTIP_DSN) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export const fetchVideoInfo = (url: string): Promise<VideoInfo> =>
  invoke<VideoInfo>("fetch_video_info", { url }).catch((e) => {
    captureIfEnabled(e, { command: "fetch_video_info" });
    throw e;
  });

export const getHistory = (): Promise<DownloadRecord[]> =>
  invoke<DownloadRecord[]>("get_history").catch((e) => {
    captureIfEnabled(e, { command: "get_history" });
    throw e;
  });

export const downloadVideo = (
  url: string, itag: string, title: string, author: string, thumbnail?: string
): Promise<string> =>
  invoke<string>("download_video", { url, itag, title, author, thumbnail }).catch((e) => {
    captureIfEnabled(e, { command: "download_video" });
    throw e;
  });

export const downloadAudio = (
  url: string, title: string, author: string, thumbnail?: string
): Promise<string> =>
  invoke<string>("download_audio", { url, title, author, thumbnail }).catch((e) => {
    captureIfEnabled(e, { command: "download_audio" });
    throw e;
  });

export const downloadTiktok = (
  url: string, watermark: boolean, audioOnly: boolean, title: string, author: string, thumbnail?: string
): Promise<string> =>
  invoke<string>("download_tiktok", { url, watermark, audioOnly, title, author, thumbnail }).catch((e) => {
    captureIfEnabled(e, { command: "download_tiktok" });
    throw e;
  });

export const downloadTwitch = (
  url: string, formatId: string, title: string, author: string, thumbnail?: string
): Promise<string> =>
  invoke<string>("download_twitch", { url, formatId, title, author, thumbnail }).catch((e) => {
    captureIfEnabled(e, { command: "download_twitch" });
    throw e;
  });

export const downloadLibraryReady = (params: {
  url: string;
  title: string;
  artist: string;
  album: string;
  year: string;
  coverUrl: string;
  coverUrlFallback?: string;
  lyricsLrc: string;
  thumbnail?: string;
}): Promise<string> =>
  invoke<string>("download_library_ready", {
    url: params.url,
    title: params.title,
    artist: params.artist,
    album: params.album,
    year: params.year,
    coverUrl: params.coverUrl,
    coverUrlFallback: params.coverUrlFallback,
    lyricsLrc: params.lyricsLrc,
    thumbnail: params.thumbnail,
  }).catch((e) => {
    captureIfEnabled(e, { command: "download_library_ready" });
    throw e;
  });

export const onDownloadProgress = (cb: (p: DownloadProgress) => void) =>
  listen<DownloadProgress>("download://progress", (e) => cb(e.payload));

export const detectAvailableBrowsers = (): Promise<string[]> =>
  invoke<string[]>("detect_available_browsers").catch((e) => {
    captureIfEnabled(e, { command: "detect_available_browsers" });
    throw e;
  });

export const updateDownloadSettings = (settings: DownloadSettings): Promise<void> =>
  invoke<void>("update_download_settings", {
    useCookies: settings.useCookies,
    cookiesBrowser: settings.cookiesBrowser,
  }).catch((e) => {
    captureIfEnabled(e, { command: "update_download_settings" });
    throw e;
  });

export const getDownloadSettings = (): Promise<DownloadSettings> =>
  invoke<DownloadSettings>("get_download_settings").catch((e) => {
    captureIfEnabled(e, { command: "get_download_settings" });
    throw e;
  });

export const readAudioMetadata = (path: string): Promise<AudioMetadata> =>
  invoke<AudioMetadata>("read_audio_metadata", { path }).catch((e) => {
    captureIfEnabled(e, { command: "read_audio_metadata" });
    throw e;
  });

export const writeAudioMetadata = (args: WriteMetadataArgs): Promise<void> =>
  invoke<void>("write_audio_metadata", {
    path: args.path,
    title: args.title,
    artist: args.artist,
    album: args.album,
    year: args.year,
    coverUrl: args.coverUrl,
    lyricsPlain: args.lyricsPlain,
    lyricsLrc: args.lyricsLrc,
  }).catch((e) => {
    captureIfEnabled(e, { command: "write_audio_metadata" });
    throw e;
  });
```

- [ ] **Step 4: Vérifier la compilation TypeScript**

```bash
npx tsc --noEmit
```

Expected: aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/main.tsx src/lib/commands.ts
git commit -m "feat(error-reporting): add GlitchTip via @sentry/react with captureIfEnabled in commands"
```

---

## Task 4 — Settings UI — section Confidentialité

**Files:**
- Modify: `src/views/Settings.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/fr-FR.json`
- Modify: `src/locales/es-419.json`
- Modify: `src/locales/pt-BR.json`

**Interfaces:**
- Consumes: `analyticsEnabled`, `errorReportingEnabled` depuis `loadDownloadSettings()`, `saveDownloadSettings()`
- Consumes: `trackEvent` depuis `analytics.ts`
- Produces: toggles UI qui sauvegardent en localStorage

- [ ] **Step 1: Ajouter les clés i18n dans `src/locales/en.json`**

Dans la section `"settings"` existante, ajouter :

```json
"privacy": "Privacy",
"analytics": "Usage Analytics",
"analyticsDesc": "Send anonymous usage data to improve the app",
"errorReporting": "Crash Reporting",
"errorReportingDesc": "Automatically send crash reports"
```

- [ ] **Step 2: Ajouter les clés i18n dans `src/locales/fr-FR.json`**

Dans la section `"settings"` :

```json
"privacy": "Confidentialité",
"analytics": "Analytics d'utilisation",
"analyticsDesc": "Envoyer des données d'utilisation anonymes pour améliorer l'app",
"errorReporting": "Rapport de crash",
"errorReportingDesc": "Envoyer automatiquement les rapports de crash"
```

- [ ] **Step 3: Ajouter les clés i18n dans `src/locales/es-419.json`**

Dans la section `"settings"` :

```json
"privacy": "Privacidad",
"analytics": "Analíticas de uso",
"analyticsDesc": "Enviar datos de uso anónimos para mejorar la app",
"errorReporting": "Reporte de errores",
"errorReportingDesc": "Enviar informes de fallos automáticamente"
```

- [ ] **Step 4: Ajouter les clés i18n dans `src/locales/pt-BR.json`**

Dans la section `"settings"` :

```json
"privacy": "Privacidade",
"analytics": "Análise de uso",
"analyticsDesc": "Enviar dados de uso anônimos para melhorar o app",
"errorReporting": "Relatório de erros",
"errorReportingDesc": "Enviar relatórios de falhas automaticamente"
```

- [ ] **Step 5: Modifier `src/views/Settings.tsx`**

Ajouter les imports en tête de fichier (après les imports existants) :

```typescript
import { trackEvent } from "@/lib/analytics";
```

Ajouter les states dans le composant `Settings`, après `const [availableBrowsers, setAvailableBrowsers] = useState<string[]>([])` :

```typescript
const [analyticsEnabled, setAnalyticsEnabled] = useState(initial.analyticsEnabled);
const [errorReportingEnabled, setErrorReportingEnabled] = useState(initial.errorReportingEnabled);
```

Ajouter les handlers après `handleBrowserChange` :

```typescript
const handleAnalyticsToggle = (enabled: boolean) => {
  // Track avant de sauvegarder pour capter l'event de désactivation
  trackEvent("analytics_toggled", { enabled });
  setAnalyticsEnabled(enabled);
  saveDownloadSettings({ analyticsEnabled: enabled });
};

const handleErrorReportingToggle = (enabled: boolean) => {
  trackEvent("error_reporting_toggled", { enabled });
  setErrorReportingEnabled(enabled);
  saveDownloadSettings({ errorReportingEnabled: enabled });
};
```

Ajouter une section avant la section `{/* App version */}` dans le JSX :

```tsx
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
        aria-checked={analyticsEnabled ? "true" : "false"}
        aria-label={t("settings.analytics", "Analytics d'utilisation")}
        onClick={() => handleAnalyticsToggle(!analyticsEnabled)}
        className={`relative ml-4 h-6 w-11 shrink-0 rounded-full transition-colors ${
          analyticsEnabled ? "bg-stroy-500" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            analyticsEnabled ? "translate-x-5" : "translate-x-0.5"
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
        aria-checked={errorReportingEnabled ? "true" : "false"}
        aria-label={t("settings.errorReporting", "Rapport de crash")}
        onClick={() => handleErrorReportingToggle(!errorReportingEnabled)}
        className={`relative ml-4 h-6 w-11 shrink-0 rounded-full transition-colors ${
          errorReportingEnabled ? "bg-stroy-500" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            errorReportingEnabled ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  </div>
</section>
```

- [ ] **Step 6: Vérifier la compilation**

```bash
npx tsc --noEmit
```

Expected: aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add src/views/Settings.tsx src/locales/en.json src/locales/fr-FR.json src/locales/es-419.json src/locales/pt-BR.json
git commit -m "feat(settings): add privacy section with analytics and error reporting toggles"
```

---

## Task 5 — Navigation tracking + app_started

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `trackPageView()` de `analytics.ts`
- Produces: page view trackée à chaque changement de route

Note : `trackAppStarted()` est déjà appelé dans `main.tsx` (Task 3). Cette task ajoute uniquement le tracking de navigation.

- [ ] **Step 1: Modifier `src/App.tsx`**

Ajouter l'import de `trackPageView` et `useLocation` :

```typescript
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { getVersion } from "@tauri-apps/api/app";
import { Sidebar } from "@/components/custom/Sidebar";
import { BottomNav } from "@/components/custom/BottomNav";
import { Home } from "@/views/Home";
import { Fetch } from "@/views/Fetch";
import { Settings } from "@/views/Settings";
import { MetadataEditor } from "@/views/MetadataEditor";
import { checkForUpdate, RELEASES_PAGE } from "@/lib/updater";
import { trackPageView } from "@/lib/analytics";
```

Créer un composant `NavigationTracker` qui track les changements de route, à insérer juste après les imports :

```typescript
function NavigationTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPageView();
  }, [location.pathname]);
  return null;
}
```

Dans le JSX de `App`, ajouter `<NavigationTracker />` comme premier enfant de `<BrowserRouter>` :

```tsx
return (
  <BrowserRouter>
    <NavigationTracker />
    <div className="flex h-screen flex-col overflow-hidden bg-stroy-950 text-white">
      {/* ... reste du JSX inchangé */}
    </div>
  </BrowserRouter>
);
```

- [ ] **Step 2: Vérifier la compilation**

```bash
npx tsc --noEmit
```

Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(analytics): track page navigation and app start events"
```

---

## Task 6 — Download events dans Fetch.tsx

**Files:**
- Modify: `src/views/Fetch.tsx`

**Interfaces:**
- Consumes: `trackEvent(event, data)` de `analytics.ts`
- Produces: events `download_started`, `download_completed`, `download_failed`

**Payloads :**
- `download_started` → `{ source: "youtube"|"tiktok"|"twitch", format: "video"|"audio"|"library_ready" }`
- `download_completed` → `{ source, format, duration_ms: number }`
- `download_failed` → `{ source, format, error: string }`

- [ ] **Step 1: Modifier `src/views/Fetch.tsx`**

Ajouter l'import :

```typescript
import { trackEvent } from "@/lib/analytics";
```

Ajouter un ref pour le timing, après les autres refs :

```typescript
const downloadStartRef = useRef<number>(0);
```

Remplacer `handleDownload` entièrement :

```typescript
const handleDownload = async (fmt: DownloadFormat, quality: string) => {
  if (!info) return;
  setDownloadError(null);
  setIsDownloading(true);
  setProgress(0);

  const source = info.source;
  const format: "video" | "audio" | "library_ready" =
    fmt === "mp3" || fmt === "tiktok-audio" || fmt === "twitch-audio"
      ? "audio"
      : fmt === "library-ready"
      ? "library_ready"
      : "video";

  trackEvent("download_started", { source, format });
  downloadStartRef.current = Date.now();

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
        coverUrlFallback: meta.coverUrlFallback,
        lyricsLrc: meta.lyricsLrc,
        thumbnail: info.thumbnail,
      });
    }
    trackEvent("download_completed", {
      source,
      format,
      duration_ms: Date.now() - downloadStartRef.current,
    });
    window.dispatchEvent(new Event("download-complete"));
  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : t("videoSelect.errorDownload");
    trackEvent("download_failed", { source, format, error: errorMsg });
    setDownloadError(errorMsg);
  } finally {
    setIsDownloading(false);
  }
};
```

Ajouter `useRef` à l'import React déjà existant si ce n'est pas le cas (il l'est déjà : `const unlistenRef = useRef`).

- [ ] **Step 2: Vérifier la compilation**

```bash
npx tsc --noEmit
```

Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add src/views/Fetch.tsx
git commit -m "feat(analytics): track download_started, download_completed, download_failed events"
```

---

## Task 7 — Metadata events dans MetadataEditor.tsx

**Files:**
- Modify: `src/views/MetadataEditor.tsx`

**Interfaces:**
- Consumes: `trackEvent(event, data)` de `analytics.ts`
- Produces: events `metadata_opened_from`, `metadata_saved`, `itunes_cover_searched`, `itunes_cover_selected`

- [ ] **Step 1: Modifier `src/views/MetadataEditor.tsx`**

Ajouter l'import :

```typescript
import { trackEvent } from "@/lib/analytics";
```

**Event `metadata_opened_from`** — dans le `useEffect` initial, détecter la source :

Remplacer le `useEffect` initial :

```typescript
useEffect(() => {
  const path = searchParams.get("path");
  if (path) {
    trackEvent("metadata_opened_from", { from: "sidebar" });
    handleLoadFile(decodeURIComponent(path));
  } else {
    trackEvent("metadata_opened_from", { from: "file_picker" });
    handleOpenPicker();
  }
}, []);
```

**Event `itunes_cover_searched`** — dans `runItunesSearch`, après `setIsSearching(true)` :

```typescript
async function runItunesSearch(query: string) {
  if (!query.trim()) return;
  setIsSearching(true);
  trackEvent("itunes_cover_searched");
  try {
    const results = await searchItunesCover(query);
    setItunesResults(results);
  } finally {
    setIsSearching(false);
  }
}
```

**Event `itunes_cover_selected`** — dans le handler de sélection de cover. Chercher dans le JSX le `onClick` qui sélectionne une cover (le clic sur une cover iTunes) et ajouter :

```typescript
onClick={() => {
  trackEvent("itunes_cover_selected", { result_position: index });
  setSelectedCoverUrl(result.artworkUrl);
}}
```

(où `index` est le position dans le tableau `itunesResults.map((result, index) => ...)`)

**Event `metadata_saved`** — dans `handleSave`, dans le `.then()` / après `await writeAudioMetadata(args)` succès :

```typescript
async function handleSave() {
  if (!filePath) return;
  setSaveError(null);
  setSaveSuccess(false);
  setIsSaving(true);
  try {
    const args: WriteMetadataArgs = {
      path: filePath,
      title: form.title,
      artist: form.artist,
      album: form.album,
      year: form.year,
      coverUrl: selectedCoverUrl ?? undefined,
      lyricsPlain: form.lyricsPlain,
      lyricsLrc: form.lyricsLrc,
    };
    await writeAudioMetadata(args);
    trackEvent("metadata_saved", {
      has_cover: selectedCoverUrl !== null,
      has_lyrics_plain: form.lyricsPlain.trim().length > 0,
      has_lyrics_lrc: form.lyricsLrc.trim().length > 0,
      has_year: form.year.trim().length > 0,
      cover_source: selectedCoverUrl ? "itunes" : "none",
    });
    setSaveSuccess(true);
  } catch (e) {
    setSaveError(e instanceof Error ? e.message : t("metadataEditor.saveError"));
  } finally {
    setIsSaving(false);
  }
}
```

- [ ] **Step 2: Vérifier la compilation**

```bash
npx tsc --noEmit
```

Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add src/views/MetadataEditor.tsx
git commit -m "feat(analytics): track metadata editor events (opened_from, saved, itunes_cover)"
```

---

## Task 8 — Settings events dans Settings.tsx

**Files:**
- Modify: `src/views/Settings.tsx`

**Interfaces:**
- Consumes: `trackEvent` de `analytics.ts` (déjà importé en Task 4)
- Produces: events `language_changed`, `cookies_toggled`

Note : `analytics_toggled` et `error_reporting_toggled` sont déjà trackés dans `handleAnalyticsToggle` et `handleErrorReportingToggle` (Task 4).

- [ ] **Step 1: Modifier `handleLangChange` dans `src/views/Settings.tsx`**

```typescript
const handleLangChange = (code: string) => {
  trackEvent("language_changed", { locale: code });
  i18n.changeLanguage(code);
  localStorage.setItem("stroygetter-lang", code);
};
```

- [ ] **Step 2: Modifier `handleCookiesToggle` dans `src/views/Settings.tsx`**

```typescript
const handleCookiesToggle = (enabled: boolean) => {
  trackEvent("cookies_toggled", { enabled });
  setUseCookies(enabled);
  const saved = saveDownloadSettings({ useCookies: enabled, cookiesBrowser });
  updateDownloadSettings(saved);
};
```

- [ ] **Step 3: Vérifier la compilation**

```bash
npx tsc --noEmit
```

Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add src/views/Settings.tsx
git commit -m "feat(analytics): track language_changed and cookies_toggled events in Settings"
```

---

## Task 9 — GlitchTip Rust (crate sentry)

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: variable d'environnement `GLITCHTIP_DSN` au **moment du build** via `option_env!()`
- Produces: panic hook installé automatiquement par le crate sentry si DSN défini

- [ ] **Step 1: Ajouter le crate sentry dans `src-tauri/Cargo.toml`**

Dans la section `[dependencies]`, ajouter :

```toml
sentry = { version = "0.34", default-features = false, features = ["backtrace", "contexts", "panic", "reqwest", "rustls"] }
```

- [ ] **Step 2: Modifier `src-tauri/src/lib.rs`**

Ajouter `init_sentry()` et appeler depuis `run()`. Remplacer le fichier complet :

```rust
mod commands;
mod db;
mod sidecar;

use commands::settings::DownloadSettingsState;
use db::DbConn;
use tauri::Manager;

fn init_sentry() -> Option<sentry::ClientInitGuard> {
    let dsn = option_env!("GLITCHTIP_DSN")?;
    if dsn.is_empty() {
        return None;
    }
    Some(sentry::init((
        dsn,
        sentry::ClientOptions {
            release: sentry::release_name!(),
            ..Default::default()
        },
    )))
}

#[tauri::command]
fn get_history(db: tauri::State<DbConn>) -> Result<Vec<db::DownloadRecord>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::get_history(&conn).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _sentry = init_sentry();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            let conn = db::open_or_memory(&app_data_dir);
            app.manage(DbConn(std::sync::Mutex::new(conn)));
            app.manage(DownloadSettingsState(std::sync::Mutex::new(
                commands::settings::DownloadSettings::default(),
            )));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_history,
            commands::info::fetch_video_info,
            commands::download::download_video,
            commands::download::download_audio,
            commands::download::download_tiktok,
            commands::download::download_twitch,
            commands::library_ready::download_library_ready,
            commands::metadata_editor::read_audio_metadata,
            commands::metadata_editor::write_audio_metadata,
            commands::settings::detect_available_browsers,
            commands::settings::update_download_settings,
            commands::settings::get_download_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Note : `let _sentry = init_sentry();` — le underscore-bind garde le guard `ClientInitGuard` en vie pendant toute la durée de `run()`. Si `init_sentry()` retourne `None` (DSN absent), aucun panic hook n'est installé et rien ne change.

- [ ] **Step 3: Vérifier que Rust compile**

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: compilation réussie (peut prendre 1-2 minutes pour télécharger le crate sentry).

- [ ] **Step 4: Lancer les tests Rust**

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: tous les tests passent (les 5 tests parse_lrc_line existants).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/Cargo.lock
git commit -m "feat(rust): add sentry crate for GlitchTip panic reporting"
```

---

## Task 10 — CSP, .env.example, CI, docs

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Create: `.env.example`
- Modify: `.github/workflows/release.yml`
- Modify: `docs/ai-context.md`

**Interfaces:**
- Consumes: tout ce qui précède
- Produces: app deployable avec tracking en prod

- [ ] **Step 1: Modifier le CSP dans `src-tauri/tauri.conf.json`**

La valeur actuelle du CSP :
```
"default-src 'self' tauri: asset:; img-src 'self' tauri: asset: data: https://img.youtube.com https://i.ytimg.com https://p16-sign-va.tiktokcdn.com https://*.tiktokcdn.com https://*.tiktokcdn-eu.com https://clips.twitch.tv https://*.jtvnw.net https://*.dzcdn.net https://*.mzstatic.com; connect-src 'self' tauri: asset: https://lrclib.net https://itunes.apple.com https://api.github.com https://musicbrainz.org https://coverartarchive.org https://api.deezer.com; style-src 'self' 'unsafe-inline'"
```

Nouvelle valeur — ajouter `https://analytics.stroyco.eu` dans `connect-src` et `script-src`, et `https://errors.stroyco.eu` dans `connect-src` :

```
"default-src 'self' tauri: asset:; script-src 'self' https://analytics.stroyco.eu; img-src 'self' tauri: asset: data: https://img.youtube.com https://i.ytimg.com https://p16-sign-va.tiktokcdn.com https://*.tiktokcdn.com https://*.tiktokcdn-eu.com https://clips.twitch.tv https://*.jtvnw.net https://*.dzcdn.net https://*.mzstatic.com; connect-src 'self' tauri: asset: https://lrclib.net https://itunes.apple.com https://api.github.com https://musicbrainz.org https://coverartarchive.org https://api.deezer.com https://analytics.stroyco.eu https://errors.stroyco.eu; style-src 'self' 'unsafe-inline'"
```

- [ ] **Step 2: Créer `.env.example`**

```
# Copier ce fichier en .env.local et remplir les valeurs pour activer analytics/crash reporting en dev.
# .env.local est ignoré par git.

# Umami website ID (https://analytics.stroyco.eu)
VITE_UMAMI_WEBSITE_ID=

# GlitchTip DSN (https://errors.stroyco.eu)
VITE_GLITCHTIP_DSN=
```

- [ ] **Step 3: Modifier `.github/workflows/release.yml`**

Le step `tauri-apps/tauri-action@v0` a déjà une section `env:`. Ajouter `GLITCHTIP_DSN` :

```yaml
- uses: tauri-apps/tauri-action@v0
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    GLITCHTIP_DSN: ${{ secrets.GLITCHTIP_DSN }}
  with:
    tagName: ${{ github.ref_name }}
    releaseName: "StroyGetter ${{ github.ref_name }}"
    releaseBody: ""
    releaseDraft: true
    prerelease: ${{ contains(github.ref_name, '-') }}
    args: --target ${{ matrix.rust-target }}
```

Note : si `secrets.GLITCHTIP_DSN` n'est pas défini dans GitHub, la variable sera vide et `option_env!("GLITCHTIP_DSN")` retournera une chaîne vide → `init_sentry()` retourne `None` proprement.

- [ ] **Step 4: Mettre à jour `docs/ai-context.md`**

Dans la section "Stack implémentée", ajouter une ligne dans le tableau :

```
| Observabilité | Umami + GlitchTip | Analytics anonymes + rapport de crash |
```

Dans la section "Known stubs / À compléter", supprimer aucune entrée (ces stubs sont inchangés).

Ajouter une section après "Architecture Tauri : commands implémentés" :

```markdown
## Observabilité

### Analytics (Umami)

`src/lib/analytics.ts` expose trois fonctions :

- `trackEvent(event, data?)` — event custom Umami, no-op si analytics désactivé ou VITE_UMAMI_WEBSITE_ID vide
- `trackPageView()` — appelle `window.umami?.track()` sans arg (capte la route courante)
- `trackAppStarted()` — async, envoie `app_started` avec version/os/locale

Events trackés : `app_started`, navigation (`page_view`), `download_started/completed/failed`, `metadata_opened_from`, `metadata_saved`, `itunes_cover_searched/selected`, `language_changed`, `analytics_toggled`, `error_reporting_toggled`, `cookies_toggled`.

Config : `VITE_UMAMI_WEBSITE_ID` (Vite env var). Désactivable via toggle Settings → `analyticsEnabled` dans localStorage.

### Error Reporting (GlitchTip)

**Frontend** : `@sentry/react` initialisé dans `src/main.tsx` si `VITE_GLITCHTIP_DSN` défini. `<Sentry.ErrorBoundary>` wraps `<App>`. Chaque invoke() dans `commands.ts` appelle `captureIfEnabled()` dans son `.catch()`.

**Rust** : crate `sentry 0.34` dans `Cargo.toml`. `init_sentry()` dans `lib.rs` utilise `option_env!("GLITCHTIP_DSN")` (évalué à la compilation). Installe automatiquement un panic hook.

Config Rust : variable d'environnement `GLITCHTIP_DSN` au moment du build (définie dans `release.yml` via `secrets.GLITCHTIP_DSN`). Désactivable via toggle Settings → `errorReportingEnabled` dans localStorage (effectif au prochain lancement).
```

- [ ] **Step 5: Vérifier les tests complets**

```bash
npm test && cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: tous PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/tauri.conf.json .env.example .github/workflows/release.yml docs/ai-context.md
git commit -m "feat(config): add CSP rules, .env.example, CI secret for analytics and error reporting"
```

---

## Self-Review

**Spec coverage :**
- ✅ Section 1 (Settings) → Tasks 1 + 4
- ✅ Section 2 (Umami) → Tasks 2 + 5 + 6 + 7 + 8 (tous les events de la table)
- ✅ Section 3 (GlitchTip frontend) → Task 3
- ✅ Section 4 (GlitchTip Rust) → Task 9
- ✅ Section 5 (Variables d'environnement) → Task 10
- ✅ Section 6 (i18n) → Task 4
- ✅ CSP → Task 10
- ✅ Tous les events du tableau des payloads couverts

**Placeholder scan :** aucun TBD/TODO dans le plan.

**Type consistency :** `trackEvent`, `trackPageView`, `trackAppStarted` nommés identiquement dans tous les tasks qui les utilisent. `captureIfEnabled` dans commands.ts utilisé uniformément. `analyticsEnabled`/`errorReportingEnabled` cohérents entre settings.ts, Settings.tsx, analytics.ts, main.tsx.
