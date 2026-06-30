# Context : stroygetter-native

> Ce document décrit l'état **réel implémenté** du projet.
> Il est destiné à être lu par Claude Code pour obtenir le contexte complet sans accès au repo web.

---

## Qu'est-ce que ce projet ?

`stroygetter-native` est une application desktop/mobile **Tauri v2** basée sur StroyGetter, le
downloader web (YouTube + TikTok) disponible sur [stroygetter.stroyco.eu](https://stroygetter.stroyco.eu).

L'objectif : permettre aux utilisateurs de télécharger des vidéos **sans dépendre du serveur**,
via un installeur natif Windows / macOS / Linux.

> **Android** — abandonné. Alternatives recommandées : [YTDLnis](https://github.com/deniscerri/ytdlnis) et [Seal](https://github.com/junkfood02/Seal).

---

## Stack implémentée

| Couche        | Choix                                      | Raison                                                            |
| ------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| Shell natif   | **Tauri v2**                               | WebView OS → bundle ~20 MB vs 300 MB Electron                     |
| Backend       | **Rust** (src-tauri/)                      | Inclus dans Tauri, typé, compile ou crash                         |
| Frontend      | **React 18 + Vite 5 + TypeScript**         | Réutilise les composants du projet web                            |
| UI            | **shadcn/ui (new-york) + Tailwind CSS v4** | `@import "tailwindcss"`, pas de `tailwind.config.js`              |
| Routing       | **react-router-dom v6**                    | Routes : `/`, `/fetch`, `/settings`                               |
| i18n          | **react-i18next** — 4 locales              | en, fr-FR, es-419, pt-BR — détection via localStorage + navigator |
| DB            | **SQLite via rusqlite** (bundled 0.31)     | Cache local des fichiers téléchargés                              |
| Observabilité | **Umami + GlitchTip**                      | Analytics anonymes + rapport de crash                             |

---

## MVP 1 — scope figé

- YouTube : vidéo (multi-qualité) + audio seul
- TikTok : vidéo (avec et sans watermark) + audio
- **Twitch : clips uniquement** (VODs désactivés) — inclus contrairement à la spec initiale
- Cache local SQLite (éviter de re-télécharger)
- Plateformes : Windows, macOS (Apple Silicon), Linux

**Exclus du MVP 1 :**

- TikTok photos
- Twitch VODs
- Auto-update (notifications de mise à jour en place, pas de mise à jour automatique)

---

## Structure du projet

```
src/
  assets/          logo.svg, logo-white.svg
  locales/         en.json, fr-FR.json, es-419.json, pt-BR.json
  components/
    ui/            composants shadcn (accordion, progress, select, separator, skeleton)
    custom/        GetterInput, VideoSelect, VideoLoading, Sidebar, BottomNav
  views/           Home.tsx, Fetch.tsx, Settings.tsx, MetadataEditor.tsx
  lib/
    types.ts       VideoInfo, DownloadRecord, DownloadFormat, DownloadProgress
    commands.ts    wrappers invoke() vers tous les Tauri commands
    i18n.ts        setup react-i18next + SUPPORTED_LANGS
    metadata.ts    resolveLibraryReadyMetadata (stub YouTube Music + LRClib)
    utils.ts       cn()
  App.tsx          BrowserRouter + layout sidebar
  main.tsx         point d'entrée
  globals.css      Tailwind v4 + tokens design stroy-*
src-tauri/
  src/
    db.rs          schéma rusqlite + insert/get_history
    sidecar.rs     runner sidecar async
    commands/
      info.rs      fetch_video_info (yt-dlp --dump-json)
      download.rs  download_video, download_audio, download_tiktok, download_twitch
      library_ready.rs  download_library_ready (pipeline yt-dlp → ffmpeg)
    lib.rs         builder Tauri, tous les commands enregistrés
    main.rs        point d'entrée
  binaries/        yt-dlp-{target}, ffmpeg-{target}, bgutil-pot-{target} (sidecars par target triple)
  tauri.conf.json  identifier: eu.stroyco.stroygetter-native
  Cargo.toml       tauri 2, tauri-plugin-shell 2, rusqlite bundled 0.31, etc.
```

---

## Architecture Tauri : commands implémentés

```
Frontend (React/Vite)
  └─ invoke("fetch_video_info", { url })    ← Tauri IPC
       └─ src-tauri/src/commands/info.rs
            └─ spawn yt-dlp --dump-json {url}
            └─ retourne VideoInfo struct → JSON → frontend

  └─ invoke("download_video", { url, itag, title })
  └─ invoke("download_audio", { url, title })
  └─ invoke("download_tiktok", { url, itag, title })
  └─ invoke("download_twitch", { url, title })
       └─ src-tauri/src/commands/download.rs

  └─ invoke("download_library_ready", { url, title })
       └─ src-tauri/src/commands/library_ready.rs
            └─ pipeline yt-dlp → ffmpeg (tags + artwork)

  └─ invoke("get_history")
       └─ src-tauri/src/db.rs → table downloads

  └─ invoke("read_audio_metadata", { path })
       └─ src-tauri/src/commands/metadata_editor.rs
            └─ lire les tags ID3 (id3 crate) → AudioMetadata struct

  └─ invoke("write_audio_metadata", { path, title, artist, album, year, coverUrl?, lyricsPlain, lyricsLrc })
       └─ src-tauri/src/commands/metadata_editor.rs
            └─ écrire tags ID3 (USLT, SYLT, APIC) via id3 crate
```

Chaque action utilisateur passe par un **Tauri command** en Rust.
Le frontend ne fait que de l'affichage et des appels `invoke()`.

---

## Logique métier

> La plupart de cette logique est déjà implémentée en Rust dans `src-tauri/src/commands/`.

### 1. Validation d'URL

Patterns supportés :

```
YouTube  : https://... (youtube.com/watch?v=, youtu.be/, /shorts/, /embed/, /live/)
TikTok   : https://www.tiktok.com/@user/(video|photo)/ID
           https://vm.tiktok.com/XXXX/
           https://www.tiktok.com/t/XXXX/
Twitch   : https://www.twitch.tv/videos/ID  (clips, pas VODs)
```

Fonction `detectSource(url)` → retourne `"youtube" | "tiktok" | "twitch" | null`.

### 2. Métadonnées

**yt-dlp --dump-json** est utilisé pour YouTube, TikTok et Twitch.

Commande spawned :

```
yt-dlp --dump-json --no-warnings --no-playlist {url}
```

Champs utilisés dans le JSON :

- `title` → titre de la vidéo
- `uploader` → nom de l'auteur
- `duration` → durée en secondes (float)
- `thumbnail` → URL de la miniature
- `formats[]` → liste des formats disponibles

### 3. Filtrage des formats YouTube

Ne garder que les formats avec `vcodec` commençant par `"avc"` et `acodec == "none"` (streams vidéo seuls).
Trier par `height` décroissant. Dédupliquer par `format_note` (label qualité : "1080p", "720p", etc.).
Ajouter un format synthétique "Audio only (MP3)" avec itag fixe `140`.

### 4. Formats TikTok

Formats fixes (pas de sélection dynamique) :

```rust
// itag 301 = vidéo avec watermark
// itag 302 = vidéo sans watermark
// itag 303 = audio MP3
```

### 5. Sanitize filename

Logique implémentée en Rust :

1. NFD normalize
2. Strip diacritics
3. Garder ASCII printable seulement
4. Remplacer `< > : " / \ | ? * #` par `_`
5. Spaces → `_`
6. Collapse `__` → `_`
7. Trim `_` en début/fin
8. Truncate à 80 chars

---

## Types TypeScript du frontend (`src/lib/types.ts`)

```typescript
export interface VideoInfo {
  title: string;
  uploader: string;
  duration: number;
  thumbnail: string;
  formats: DownloadFormat[];
  source: "youtube" | "tiktok" | "twitch";
}

export interface DownloadFormat {
  itag: number;
  qualityLabel: string;
}

export interface DownloadRecord {
  id: number;
  url: string;
  title: string;
  source: string;
  downloaded_at: string;
}

export interface DownloadProgress {
  percent: number;
  speed: string;
  eta: string;
}
```

---

## Gestion des binaires (yt-dlp, ffmpeg, bgutil-pot)

- Stockés dans `src-tauri/binaries/` avec suffixe target-triple (ex: `yt-dlp-aarch64-apple-darwin`)
- Trois sidecars : `yt-dlp`, `ffmpeg`, `bgutil-pot` (provider de tokens pour les vidéos YouTube protégées)
- Déclarés dans `tauri.conf.json` → `bundle.externalBin`
- Accessibles via `tauri-plugin-shell` → `Command::sidecar()`
- Téléchargés automatiquement au build CI (workflow `release.yml`), cachés mensuellement
- `tauri.conf.json` `bundle.targets` : `["nsis", "dmg", "appimage", "deb"]` — MSI exclu (incompatible avec les versions pré-release alpha/beta)

---

## Répertoire de téléchargement

- Par défaut : dossier `Downloads` de l'utilisateur via `app_data_dir()` Tauri
- Le répertoire personnalisé dans Settings.tsx est **UI-only pour l'instant** — non transmis au backend Rust

---

## Known stubs / À compléter

| Élément | Fichier | Statut |
|---------|---------|--------|
| `fetchYouTubeMusicMetadata` | `src/lib/metadata.ts` | Stub — à porter depuis le web (`youtubei.js` → yt-dlp) |
| `searchItunesCover` | `src/lib/metadata.ts` | Exportée publiquement — retourne jusqu'à 5 résultats |
| `downloadDir` personnalisé | `src/views/Settings.tsx` | UI uniquement, non passé aux commands Rust |
| Refresh sidebar après download | `src/components/custom/Sidebar.tsx` | Event-based partiel — pas systématique sur tous les paths |
| Version hardcodée | `src/views/Settings.tsx` | Lire depuis `tauri.conf.json` dynamiquement |
| Twitch VODs | `src-tauri/src/commands/download.rs` | Désactivé intentionnellement en MVP 1 |

---

## Comment lancer le projet (dev)

Voir le `Makefile` à la racine :

```bash
make install   # npm install + cargo fetch
make dev       # npm run tauri dev
make build     # npm run tauri build
make test      # npm test + cargo test
make lint      # tsc --noEmit
```

---

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

### Logs fichier (tauri-plugin-log)

`tauri-plugin-log v2` + crate `log 0.4`. Initialisé dans `lib.rs` → `init_logger()` appelé dans `.setup()`.

**Fichier** : `{app_log_dir}/stroygetter.log` (macOS : `~/Library/Logs/eu.stroyco.stroygetter-native/`, Windows : `%APPDATA%\eu.stroyco.stroygetter-native\logs\`). Rotation automatique à 5 MB (`RotationStrategy::KeepOne` = garde 1 backup → ~10 MB max).

**Niveau** : `Debug` en dev, `Info` en prod.

**Points de log Rust** :

- `lib.rs` — démarrage app (version, data dir)
- `sidecar.rs` — chaque invocation yt-dlp/ffmpeg (args en debug, stderr en warn, exit code)
- `info.rs` — fetch_video_info (source détectée, nb formats DASH/fallback)
- `download.rs` — début/fin/erreur de chaque download (url, format, path)

**Frontend** : `src/lib/logger.ts` appelle `attachConsole()` au démarrage (`main.tsx`). Redirige automatiquement tous les `console.log/warn/error` React vers le fichier de log.

**Settings** : section "Journaux de débogage" — affiche le path du dossier + bouton "Ouvrir le dossier" (ouvre dans Finder/Explorer via `shell:allow-open`). Command Rust : `get_log_dir` dans `settings.rs`.

---

## Ce qui N'est PAS à porter

- Tout ce qui concerne `prisma` / LibSQL / `@prisma/adapter-libsql` → remplacé par rusqlite
- `next-intl` → remplacé par `react-i18next`
- `ffmpeg-static` npm → binaire bundlé Tauri sidecar
- `youtube-dl-exec` npm → spawn Rust natif via `tauri-plugin-shell`
- Les API routes Next.js → Tauri commands Rust
- `pino` logger → `tracing` crate Rust côté backend, `console.*` côté frontend
