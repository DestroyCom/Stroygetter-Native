# Analytics & Error Reporting — Design Spec

## Objectif

Intégrer Umami (analytics) et GlitchTip (rapport d'erreurs) dans l'app native Tauri. Les deux sont activés par défaut, désactivables indépendamment via un toggle dans Settings. Les analytics trackent la navigation, les téléchargements, le metadata editor et les actions settings. GlitchTip capture les erreurs React, les erreurs Rust retournées par les commandes, et les panics Rust.

## Architecture

```
Frontend
  ├── src/lib/analytics.ts       init Umami + helpers trackEvent()
  ├── src/lib/settings.ts        ajout de analyticsEnabled + errorReportingEnabled
  ├── src/views/Settings.tsx     section "Confidentialité" avec 2 toggles
  ├── src/main.tsx               init Sentry conditionnel + <ErrorBoundary>
  ├── src/App.tsx                tracking navigation (route changes)
  ├── src/lib/commands.ts        wrapping invoke() pour events + captureException
  ├── src/views/Fetch.tsx        events download_started/completed/failed
  └── src/views/MetadataEditor.tsx  events metadata_*
  index.html                     script Umami avec data-do-not-track

Rust (src-tauri/)
  ├── Cargo.toml                 ajout crate sentry
  └── src/lib.rs                 sentry::init() conditionnel sur GLITCHTIP_DSN
```

## Stack technique

- **Umami** : script `https://analytics.stroyco.eu/script.js` + `window.umami?.track()`
- **GlitchTip frontend** : `@sentry/react` (Sentry-compatible)
- **GlitchTip Rust** : crate `sentry` (panic hook automatique)
- **Config** : variables d'environnement Vite (`VITE_UMAMI_WEBSITE_ID`, `VITE_GLITCHTIP_DSN`)

---

## Global Constraints

- Les deux toggles sont indépendants : désactiver analytics n'affecte pas le error reporting et inversement.
- Activés par défaut (`true`).
- Aucune donnée personnelle dans les events : pas d'URL de fichier, pas de titre de vidéo, pas de contenu de lyrics.
- Toggle utilisateur respecté dès le prochain lancement (pas de reload nécessaire pour la désactivation — Sentry et Umami ne sont pas réinitialisés à chaud).
- Désactivé automatiquement si les variables d'environnement ne sont pas définies (mode dev sans config).
- Rust panic reporting : conditionnel sur `GLITCHTIP_DSN` non vide au moment du build.

---

## 1. Settings — Consentement

### Modifications de `src/lib/settings.ts`

Ajouter deux champs à l'interface `DownloadSettings` :

```typescript
export interface DownloadSettings {
  useCookies: boolean;
  cookiesBrowser: string;
  analyticsEnabled: boolean;
  errorReportingEnabled: boolean;
}

const DEFAULTS: DownloadSettings = {
  useCookies: false,
  cookiesBrowser: "",
  analyticsEnabled: true,
  errorReportingEnabled: true,
};
```

Clés localStorage inchangées — le spread `{ ...DEFAULTS, ...JSON.parse(raw) }` gère la migration sans code supplémentaire.

### Modifications de `src/views/Settings.tsx`

Nouvelle section "Confidentialité" avec deux toggles (composant `Switch` shadcn) :

- **Analytics** : "Envoyer des données d'utilisation anonymes pour améliorer l'app"
- **Rapport d'erreurs** : "Envoyer les rapports de crash automatiquement"

Les toggles appellent `saveDownloadSettings()` et mettent à jour le state local. Pas de rechargement requis — le changement est pris en compte au prochain lancement.

---

## 2. Umami Analytics

### `index.html`

```html
<script
  async
  src="https://analytics.stroyco.eu/script.js"
  data-website-id="%VITE_UMAMI_WEBSITE_ID%"
  data-do-not-track="true"
  data-auto-track="false"
></script>
```

- `data-do-not-track="true"` : désactive le tracking DNS DNT automatique (on gère nous-mêmes)
- `data-auto-track="false"` : désactive le tracking de page automatique (on track manuellement)

Le script ne s'exécute pas si `VITE_UMAMI_WEBSITE_ID` est vide (le tag reste dans le HTML mais sans website ID valide, Umami ne trackera rien).

### `src/lib/analytics.ts` (nouveau fichier)

```typescript
import { loadDownloadSettings } from "./settings";
import { getVersion } from "@tauri-apps/api/app";
import { platform } from "@tauri-apps/plugin-os";

declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, unknown>) => void };
  }
}

function isAnalyticsEnabled(): boolean {
  return loadDownloadSettings().analyticsEnabled && !!import.meta.env.VITE_UMAMI_WEBSITE_ID;
}

export function trackEvent(event: string, data?: Record<string, unknown>): void {
  if (!isAnalyticsEnabled()) return;
  window.umami?.track(event, data);
}

export function trackPageView(path: string): void {
  if (!isAnalyticsEnabled()) return;
  window.umami?.track(path);
}

export async function trackAppStarted(): Promise<void> {
  if (!isAnalyticsEnabled()) return;
  const [version, os] = await Promise.all([getVersion(), platform()]);
  const locale = localStorage.getItem("stroygetter-lang") ?? navigator.language;
  trackEvent("app_started", { version, os, locale });
}
```

### Events trackés — localisation dans le code

| Event | Fichier | Déclencheur |
|-------|---------|------------|
| `app_started` | `src/main.tsx` | Au montage initial |
| `page_view` (path) | `src/App.tsx` | `useEffect` sur `location.pathname` |
| `download_started` | `src/views/Fetch.tsx` | Avant `invoke()` download |
| `download_completed` | `src/views/Fetch.tsx` | `.then()` du download |
| `download_failed` | `src/views/Fetch.tsx` | `.catch()` du download |
| `metadata_opened_from` | `src/views/MetadataEditor.tsx` | Détection `?path=` au mount |
| `metadata_saved` | `src/views/MetadataEditor.tsx` | `.then()` de `writeAudioMetadata` |
| `itunes_cover_searched` | `src/views/MetadataEditor.tsx` | Après `searchItunesCover()` |
| `itunes_cover_selected` | `src/views/MetadataEditor.tsx` | Clic sur un résultat cover |
| `language_changed` | `src/views/Settings.tsx` | `handleLangChange` |
| `analytics_toggled` | `src/views/Settings.tsx` | Toggle analytics |
| `error_reporting_toggled` | `src/views/Settings.tsx` | Toggle error reporting |
| `cookies_toggled` | `src/views/Settings.tsx` | `handleCookiesToggle` |

#### Payloads détaillés

```typescript
// download_started / download_completed / download_failed
{ source: "youtube" | "tiktok" | "twitch", format: "video" | "audio" | "library_ready" }
// download_completed uniquement
{ ..., duration_ms: number }
// download_failed uniquement
{ ..., error: string }

// metadata_saved
{ has_cover: boolean, has_lyrics_plain: boolean, has_lyrics_lrc: boolean, has_year: boolean, cover_source: "itunes" | "none" }

// itunes_cover_selected
{ result_position: number }

// metadata_opened_from
{ from: "sidebar" | "file_picker" }

// language_changed
{ locale: string }

// analytics_toggled / error_reporting_toggled / cookies_toggled
{ enabled: boolean }
```

### CSP (`tauri.conf.json`)

Ajouter dans `connect-src` et `script-src` :
```
https://analytics.stroyco.eu
```

---

## 3. GlitchTip — Frontend (`@sentry/react`)

### `src/main.tsx`

```typescript
import * as Sentry from "@sentry/react";
import { loadDownloadSettings } from "./lib/settings";

const settings = loadDownloadSettings();
if (settings.errorReportingEnabled && import.meta.env.VITE_GLITCHTIP_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_GLITCHTIP_DSN,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<p>Une erreur est survenue.</p>}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
```

### `src/lib/commands.ts`

Chaque `invoke()` existant obtient un `.catch()` qui capture l'erreur dans GlitchTip si activé :

```typescript
import * as Sentry from "@sentry/react";
import { loadDownloadSettings } from "./settings";

function captureIfEnabled(err: unknown, context?: Record<string, unknown>): void {
  if (!loadDownloadSettings().errorReportingEnabled) return;
  if (!import.meta.env.VITE_GLITCHTIP_DSN) return;
  Sentry.captureException(err, { extra: context });
}
```

Chaque command wrapper (ex: `downloadVideo`, `readAudioMetadata`, etc.) appelle `captureIfEnabled` dans son `.catch()` avant de re-throw.

### CSP (`tauri.conf.json`)

Ajouter dans `connect-src` :
```
https://errors.stroyco.eu
```

---

## 4. GlitchTip — Rust (`sentry` crate)

### `src-tauri/Cargo.toml`

```toml
sentry = { version = "0.34", default-features = false, features = ["backtrace", "contexts", "panic", "reqwest", "rustls"] }
```

Features choisies : panic hook, contexte OS/app, transport reqwest avec TLS rustls (pas d'OpenSSL).

### `src-tauri/src/lib.rs`

```rust
fn init_sentry() -> Option<sentry::ClientInitGuard> {
    let dsn = option_env!("GLITCHTIP_DSN")?;
    if dsn.is_empty() {
        return None;
    }
    Some(sentry::init((dsn, sentry::ClientOptions {
        release: sentry::release_name!(),
        ..Default::default()
    })))
}
```

`init_sentry()` est appelé au début de `run()` et le guard retourné est gardé en vie pendant toute l'exécution.

`option_env!("GLITCHTIP_DSN")` est évalué **à la compilation** — si la variable n'est pas définie au build, la feature est absente du binaire.

Le crate `sentry` installe automatiquement un `std::panic::set_hook` qui envoie les panics à GlitchTip avant de terminer le processus.

### Toggle utilisateur côté Rust

Le toggle utilisateur (true/false) n'est pas reflété dans Rust en runtime — `sentry::init()` n'est appelé qu'une fois au démarrage et ne peut pas être désactivé à chaud. La désactivation Rust est effective au **prochain lancement** de l'app (cohérent avec le comportement frontend).

---

## 5. Variables d'environnement

Fichier `.env.local` (non commité, à créer manuellement) :

```
VITE_UMAMI_WEBSITE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
VITE_GLITCHTIP_DSN=https://key@errors.stroyco.eu/N
```

Variable Rust au build (dans CI `release.yml`) :

```yaml
env:
  GLITCHTIP_DSN: ${{ secrets.GLITCHTIP_DSN }}
```

En dev local sans `.env.local` : aucun tracking ne se produit (les checks `import.meta.env.VITE_*` sont falsy).

---

## 6. i18n

Clés à ajouter dans les 4 locales (`en`, `fr-FR`, `es-419`, `pt-BR`) :

```json
"settings": {
  "privacy": "Privacy",
  "analytics": "Usage Analytics",
  "analyticsDescription": "Send anonymous usage data to improve the app",
  "errorReporting": "Crash Reporting",
  "errorReportingDescription": "Automatically send crash reports"
}
```
