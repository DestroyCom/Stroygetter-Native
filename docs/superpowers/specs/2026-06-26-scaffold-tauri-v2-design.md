# Design — Scaffold Tauri v2 stroygetter-native

**Date :** 2026-06-26  
**Scope :** MVP 1 — Windows, macOS, Android  
**Plateformes cibles :** YouTube (vidéo + audio + Library Ready) + TikTok vidéo (no-watermark / watermark / audio)  
**Exclu MVP :** TikTok photos (gallery-dl indisponible Android)

---

## 1. Stack technique

| Couche | Technologie |
|--------|-------------|
| Shell natif | Tauri v2 |
| Frontend | React 18 + Vite 5 |
| Routing | react-router v6 |
| i18n | react-i18next (JSON existants réutilisés) |
| UI | shadcn/ui + Tailwind CSS v4 (design system existant) |
| Backend | Rust (src-tauri/) |
| DB locale | rusqlite (SQLite, pas de Prisma) |
| Binaires externes | yt-dlp + ffmpeg (sidecars Tauri par plateforme) |

---

## 2. Structure du projet

```
stroygetter-native/
├── src/
│   ├── components/
│   │   ├── ui/            # shadcn — déplacé depuis components/ui/
│   │   └── custom/        # réécrits sans next/* ni next-intl
│   ├── views/
│   │   ├── Home.tsx        # hero + GetterInput
│   │   ├── Fetch.tsx       # VideoSelect adapté Tauri
│   │   └── Settings.tsx    # langue + dossier de téléchargement
│   ├── lib/
│   │   ├── types.ts        # VideoInfo, HistoryItem, formats
│   │   ├── utils.ts        # cn(), helpers
│   │   ├── i18n.ts         # setup react-i18next
│   │   └── metadata.ts     # fetch YouTube Music API + LRClib (TypeScript)
│   ├── locales/            # messages/ renommé + adapté react-i18next
│   │   ├── en.json
│   │   ├── fr-FR.json
│   │   ├── es-419.json
│   │   └── pt-BR.json
│   ├── main.tsx
│   └── App.tsx             # layout sidebar + router
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs          # register_commands()
│   │   ├── commands/
│   │   │   ├── info.rs     # fetch_video_info
│   │   │   ├── download.rs # download_video, download_audio, download_tiktok
│   │   │   └── library_ready.rs  # download_library_ready
│   │   ├── db.rs           # rusqlite schema + queries historique
│   │   └── sidecar.rs      # résolution chemin yt-dlp / ffmpeg
│   ├── binaries/           # sidecars par plateforme (voir section 4)
│   ├── icons/
│   └── tauri.conf.json
├── globals.css             # → déplacé dans src/
├── components.json         # mis à jour (aliases src/)
└── schema.prisma           # conservé comme référence, non utilisé en runtime
```

---

## 3. Layout & navigation

### Desktop (Windows / macOS)

```
┌──────────┬──────────────────────────────────────────┐
│ Sidebar  │  Main content                            │
│ 220px    │  (visuellement identique au web)         │
│──────────│                                          │
│ S Logo   │  <Home />   hero + GetterInput           │
│          │  <Fetch />  VideoSelect + progress       │
│ + Nouveau│  <Settings /> langue + dossier DL        │
│          │                                          │
│ Historique                                          │
│ · vid 1  │                                          │
│ · vid 2  │                                          │
│          │                                          │
│──────────│                                          │
│ ⚙ Params │                                          │
└──────────┴──────────────────────────────────────────┘
```

- Sidebar non-collapsible pour le MVP
- Clic sur un item historique → navigue vers `/fetch?url=...` avec données pré-chargées
- "Nouveau" → `/` (input vide)

### Android

- Pas de sidebar
- Bottom navigation : Accueil / Historique / Paramètres
- Contenu full-width — même rendu que le mobile web actuel

---

## 4. Sidecars (binaires bundlés)

Tauri `externalBin` dans `tauri.conf.json` — résolution automatique par plateforme :

| Binaire | Plateforme |
|---------|-----------|
| `yt-dlp-x86_64-pc-windows-msvc.exe` | Windows x64 |
| `yt-dlp-x86_64-apple-darwin` | macOS Intel |
| `yt-dlp-aarch64-apple-darwin` | macOS Apple Silicon |
| `yt-dlp-aarch64-linux-android` | Android |
| `ffmpeg-x86_64-pc-windows-msvc.exe` | Windows x64 |
| `ffmpeg-x86_64-apple-darwin` | macOS Intel |
| `ffmpeg-aarch64-apple-darwin` | macOS Apple Silicon |
| `ffmpeg-aarch64-linux-android` | Android |

---

## 5. Commandes Tauri (contrat JS ↔ Rust)

### `fetch_video_info`
```rust
#[tauri::command]
async fn fetch_video_info(url: String) -> Result<VideoInfo, String>
```
- Spawn yt-dlp `--dump-json`
- Parse stdout JSON → `VideoInfo { title, author, thumbnail, duration, formats }`
- Formats : liste de `{ itag, qualityLabel }` (YouTube) ou `{ formatId, qualityLabel }` (Twitch)

### `download_video`
```rust
#[tauri::command]
async fn download_video(
    app: AppHandle, url: String, itag: String, title: String
) -> Result<String, String>
```
- Spawn yt-dlp avec format sélectionné
- Parse stdout `[download] X%` → `app.emit("download://progress", { percent })`
- Retourne le chemin du fichier sauvegardé

### `download_audio`
```rust
#[tauri::command]
async fn download_audio(
    app: AppHandle, url: String, title: String
) -> Result<String, String>
```
- Spawn yt-dlp `-x --audio-format mp3 --audio-quality 190K`
- Progress events identiques

### `download_library_ready`
```rust
#[tauri::command]
async fn download_library_ready(
    app: AppHandle,
    url: String,
    title: String,
    artist: String,
    album: String,
    year: String,
    cover_url: String,
    lyrics_lrc: String,
) -> Result<String, String>
```
- Les métadonnées sont résolues côté TypeScript avant l'appel (YouTube Music API + LRClib)
- Rust : spawn yt-dlp → audio temp, download cover, spawn ffmpeg embed (APIC + ID3 + SYLT)
- Progress events en 3 phases : `{ phase: "downloading" | "fetching_cover" | "embedding", percent }`
- Retourne chemin fichier final

### `download_tiktok`
```rust
#[tauri::command]
async fn download_tiktok(
    app: AppHandle,
    url: String,
    watermark: bool,
    audio_only: bool,
    title: String,
) -> Result<String, String>
```
- Format selector yt-dlp : no-watermark = flux H264 original, watermark = standard, audio_only = `-x --audio-format mp3`

### `download_twitch`
```rust
#[tauri::command]
async fn download_twitch(
    app: AppHandle,
    url: String,
    format_id: String,  // "source" | "720p60" | "audio"
    title: String,
) -> Result<String, String>
```
- Clips uniquement (VOD désactivé, identique au web)
- `format_id == "audio"` → yt-dlp `-x --audio-format mp3`
- Sinon → yt-dlp avec `--format format_id`

### `get_history`
```rust
#[tauri::command]
fn get_history(db: State<DbConn>) -> Result<Vec<HistoryItem>, String>
```

---

## 6. Base de données locale (rusqlite)

Schema SQL (créé au démarrage de l'app) :

```sql
CREATE TABLE IF NOT EXISTS downloads (
    id          TEXT PRIMARY KEY,
    url         TEXT NOT NULL,
    title       TEXT NOT NULL,
    author      TEXT,
    thumbnail_url TEXT,
    format      TEXT NOT NULL,
    file_path   TEXT NOT NULL,
    created_at  INTEGER NOT NULL
);
```

- Inséré après chaque téléchargement réussi
- Affiché dans la sidebar (10 derniers items)
- Clic → recharge la vue Fetch avec l'URL

---

## 7. i18n

- `react-i18next` avec les fichiers JSON existants dans `src/locales/`
- Langue par défaut : locale système (`navigator.language`)
- Changement de langue dans Settings → persisté dans `localStorage`
- Namespaces : `getterInput`, `videoSelect`, `common`, etc. (structure existante conservée)

---

## 8. Flow de téléchargement (Fetch view)

```
User colle URL → Home
  → navigate /fetch?url=...
  → invoke fetch_video_info(url)
  → affiche VideoSelect (titre, thumbnail, formats)

User choisit format + clique Télécharger
  → si Library Ready :
      TypeScript fetch YouTube Music API → métadonnées
      TypeScript fetch LRClib → lyrics
      invoke download_library_ready(...toutes métadonnées)
  → sinon :
      invoke download_video / download_audio / download_tiktok

listen("download://progress") → Progress bar temps réel
  → succès : toast "Téléchargé" + save to DB + ouvrir dossier
  → erreur : message d'erreur + bouton Réessayer
```

---

## 9. Ce qui est réutilisé sans modification

- `components/ui/` — shadcn, zéro dépendance Next.js
- `globals.css` — variables CSS, couleurs `stroy-*`
- `messages/*.json` → `src/locales/*.json` (reshape minimal pour react-i18next)
- Design visual : couleurs, typographie, composants identiques au web

## 10. Ce qui est réécrit

- `GetterInput.tsx` — supprime `next/navigation`, `next-intl`, `useRouter`, analytics
- `VideoSelect.tsx` — remplace les appels `/api/download/*` par `invoke()` Tauri, remplace `useTranslations` par `useTranslation`
- `FetchPageShell.tsx` — remplacé par un contexte React simple (plus de Next.js shell)
- `SiteHeader.tsx` / `SiteFooter.tsx` — non utilisés (remplacés par sidebar + bottom nav)
