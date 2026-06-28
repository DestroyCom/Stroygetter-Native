# Metadata Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/metadata-editor` page that lets users read and edit ID3 tags (title, artist, album, year, cover art via iTunes search, plain lyrics USLT, synced lyrics SYLT) on any local MP3 file.

**Architecture:** Two new Tauri Rust commands (`read_audio_metadata`, `write_audio_metadata`) backed by the `id3` crate read/write ID3 tags. A new React view `MetadataEditor.tsx` uses `@tauri-apps/plugin-dialog` to pick a file, pre-fills the form from existing tags, auto-searches iTunes for cover art, and saves via the write command.

**Tech Stack:** Rust `id3 = "1"`, `base64 = "0.22"`, React 18 + TypeScript, shadcn/ui Textarea, lucide-react Tag icon, iTunes Search API, `@tauri-apps/plugin-dialog` (already declared).

## Global Constraints

- Tauri v2, React 18, TypeScript strict, Tailwind CSS v4 (`@import "tailwindcss"`)
- shadcn/ui "new-york" style — follow existing component patterns in `src/components/ui/`
- Only MP3 files in scope — no FLAC, M4A, OGG
- Rust: `edition = "2021"`, all new code in `src-tauri/src/commands/metadata_editor.rs`
- No Co-Authored-By in commits
- i18n: 4 locale files — `en.json`, `fr-FR.json`, `es-419.json`, `pt-BR.json` — must all be updated together
- Design colors: `stroy-500`, `stroy-800`, `stroy-950` (already defined in `globals.css`)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src-tauri/Cargo.toml` | Add `id3 = "1"` and `base64 = "0.22"` |
| Create | `src-tauri/src/commands/metadata_editor.rs` | `read_audio_metadata`, `write_audio_metadata`, `parse_lrc_line` |
| Modify | `src-tauri/src/commands/mod.rs` | Expose new module |
| Modify | `src-tauri/src/lib.rs` | Register new commands in invoke_handler |
| Modify | `src/lib/types.ts` | Add `AudioMetadata`, `WriteMetadataArgs`, `ItunesCoverResult` |
| Modify | `src/lib/metadata.ts` | Export `searchItunesCover(query)` returning up to 5 results |
| Modify | `src/lib/commands.ts` | Add `readAudioMetadata`, `writeAudioMetadata` wrappers |
| Create | `src/components/ui/textarea.tsx` | shadcn Textarea component |
| Create | `src/views/MetadataEditor.tsx` | Full editor view |
| Modify | `src/App.tsx` | Add `/metadata-editor` route |
| Modify | `src/components/custom/Sidebar.tsx` | Add nav entry + edit icon on MP3 history items |
| Modify | `src/components/custom/BottomNav.tsx` | Add Metadata tab |
| Modify | `src/locales/en.json` | Add `sidebar.metadata` + `metadataEditor.*` keys |
| Modify | `src/locales/fr-FR.json` | Same keys in French |
| Modify | `src/locales/es-419.json` | Same keys in Spanish |
| Modify | `src/locales/pt-BR.json` | Same keys in Portuguese |
| Modify | `docs/ai-context.md` | Document new feature + commands |

---

## Task 1: Rust backend — `metadata_editor.rs`

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/commands/metadata_editor.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `read_audio_metadata(path: String) -> Result<AudioMetadata, String>` and `write_audio_metadata(path, title, artist, album, year, cover_url: Option<String>, lyrics_plain, lyrics_lrc) -> Result<(), String>` as Tauri commands

---

- [ ] **Step 1: Write failing unit tests for `parse_lrc_line`**

Create `src-tauri/src/commands/metadata_editor.rs` with just the helper and its tests:

```rust
use base64::Engine;
use id3::frame::{Lyrics, Picture, PictureType, SynchronisedLyrics, SynchronisedLyricsType, TimestampFormat};
use id3::{Tag, TagLike, Version};
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct AudioMetadata {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<String>,
    pub cover_base64: Option<String>,
    pub lyrics_plain: Option<String>,
    pub lyrics_lrc: Option<String>,
}

/// Parses a single LRC line "[mm:ss.xx] text" → (milliseconds, text).
/// Handles 2-digit centiseconds and 3-digit milliseconds.
pub(crate) fn parse_lrc_line(line: &str) -> Option<(u32, String)> {
    let line = line.trim();
    if !line.starts_with('[') {
        return None;
    }
    let close = line.find(']')?;
    let ts = &line[1..close];
    let text = line[close + 1..].trim().to_string();

    let colon = ts.find(':')?;
    let mins: u32 = ts[..colon].parse().ok()?;
    let rest = &ts[colon + 1..];

    let (secs_str, frac_str) = if let Some(dot) = rest.find('.') {
        (&rest[..dot], &rest[dot + 1..])
    } else {
        (rest, "")
    };

    let secs: u32 = secs_str.parse().ok()?;
    let ms_frac: u32 = match frac_str.len() {
        0 => 0,
        1 => frac_str.parse::<u32>().ok()? * 100,
        2 => frac_str.parse::<u32>().ok()? * 10,
        _ => frac_str[..3].parse::<u32>().ok()?,
    };

    let ms = (mins * 60 + secs) * 1000 + ms_frac;
    Some((ms, text))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_lrc_standard_centiseconds() {
        let (ms, text) = parse_lrc_line("[01:23.45] Hello world").unwrap();
        assert_eq!(ms, (60 + 23) * 1000 + 450);
        assert_eq!(text, "Hello world");
    }

    #[test]
    fn parse_lrc_milliseconds() {
        let (ms, text) = parse_lrc_line("[00:05.123] Line").unwrap();
        assert_eq!(ms, 5123);
        assert_eq!(text, "Line");
    }

    #[test]
    fn parse_lrc_no_frac() {
        let (ms, text) = parse_lrc_line("[02:00] Chorus").unwrap();
        assert_eq!(ms, 120_000);
        assert_eq!(text, "Chorus");
    }

    #[test]
    fn parse_lrc_rejects_non_lrc() {
        assert!(parse_lrc_line("plain text").is_none());
        assert!(parse_lrc_line("").is_none());
    }

    #[test]
    fn parse_lrc_strips_whitespace_from_text() {
        let (_, text) = parse_lrc_line("[00:01.00]   spaced  ").unwrap();
        assert_eq!(text, "spaced");
    }
}
```

- [ ] **Step 2: Run tests — expect them to FAIL (module not yet in mod.rs)**

```bash
cd /path/to/project/src-tauri && cargo test parse_lrc 2>&1 | head -20
```

Expected: compile error about missing module — confirms the test file is not yet wired up.

- [ ] **Step 3: Add `id3` and `base64` to `Cargo.toml`**

In `src-tauri/Cargo.toml`, add after the `dirs = "5"` line:
```toml
id3 = "1"
base64 = "0.22"
```

- [ ] **Step 4: Add module to `mod.rs`**

Edit `src-tauri/src/commands/mod.rs` — append:
```rust
pub mod metadata_editor;
```

File after edit:
```rust
pub mod download;
pub mod info;
pub mod library_ready;
pub mod metadata_editor;
pub mod settings;
```

- [ ] **Step 5: Run tests — expect them to PASS**

```bash
cd src-tauri && cargo test parse_lrc
```

Expected output: `test commands::metadata_editor::tests::parse_lrc_standard_centiseconds ... ok` (× 5 tests)

- [ ] **Step 6: Implement `read_audio_metadata`**

Append to `src-tauri/src/commands/metadata_editor.rs` after the `parse_lrc_line` function:

```rust
#[tauri::command]
pub async fn read_audio_metadata(path: String) -> Result<AudioMetadata, String> {
    let tag = Tag::read_from_path(&path).unwrap_or_else(|_| Tag::new());

    let title = tag.title().map(|s| s.to_string());
    let artist = tag.artist().map(|s| s.to_string());
    let album = tag.album().map(|s| s.to_string());
    let year = tag.year().map(|y| y.to_string());

    // Prefer CoverFront APIC frame; fall back to first picture found
    let cover_base64 = tag
        .pictures()
        .find(|p| p.picture_type == PictureType::CoverFront)
        .or_else(|| tag.pictures().next())
        .map(|pic| {
            let b64 = base64::engine::general_purpose::STANDARD.encode(&pic.data);
            format!("data:{};base64,{}", pic.mime_type, b64)
        });

    // USLT frame — plain lyrics
    let lyrics_plain = tag.lyrics().next().map(|l| l.text.clone());

    // SYLT frame — reconstruct as LRC text
    let lyrics_lrc = tag.synchronised_lyrics().next().map(|sylt| {
        sylt.content
            .iter()
            .map(|(ms, text)| {
                let total_secs = ms / 1000;
                let mins = total_secs / 60;
                let secs = total_secs % 60;
                let centis = (ms % 1000) / 10;
                format!("[{:02}:{:02}.{:02}] {}", mins, secs, centis, text)
            })
            .collect::<Vec<_>>()
            .join("\n")
    });

    Ok(AudioMetadata { title, artist, album, year, cover_base64, lyrics_plain, lyrics_lrc })
}
```

- [ ] **Step 7: Implement `write_audio_metadata`**

Append to `src-tauri/src/commands/metadata_editor.rs`:

```rust
async fn fetch_cover_bytes(url: &str) -> Option<Vec<u8>> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(5))
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .ok()?;
    let res = client.get(url).send().await.ok()?;
    if !res.status().is_success() {
        return None;
    }
    let bytes = res.bytes().await.ok()?;
    if bytes.is_empty() { None } else { Some(bytes.to_vec()) }
}

#[tauri::command]
pub async fn write_audio_metadata(
    path: String,
    title: String,
    artist: String,
    album: String,
    year: String,
    cover_url: Option<String>,
    lyrics_plain: String,
    lyrics_lrc: String,
) -> Result<(), String> {
    let mut tag = Tag::read_from_path(&path).unwrap_or_else(|_| Tag::new());

    tag.set_title(&title);
    tag.set_artist(&artist);
    tag.set_album(&album);
    if let Ok(y) = year.parse::<i32>() {
        tag.set_year(y);
    }

    // Cover: only replace if a new URL was provided
    if let Some(ref url) = cover_url {
        if let Some(bytes) = fetch_cover_bytes(url).await {
            tag.remove_picture_by_type(PictureType::CoverFront);
            tag.add_frame(Picture {
                mime_type: "image/jpeg".to_string(),
                picture_type: PictureType::CoverFront,
                description: "Cover".to_string(),
                data: bytes,
            });
        }
    }

    // USLT — plain lyrics (replace all existing)
    tag.remove_all_lyrics();
    if !lyrics_plain.is_empty() {
        tag.add_frame(Lyrics {
            lang: "eng".to_string(),
            description: String::new(),
            text: lyrics_plain,
        });
    }

    // SYLT — synchronized lyrics (replace all existing)
    tag.remove_all_synchronised_lyrics();
    if !lyrics_lrc.is_empty() {
        let content: Vec<(u32, String)> = lyrics_lrc
            .lines()
            .filter_map(parse_lrc_line)
            .collect();
        if !content.is_empty() {
            tag.add_frame(SynchronisedLyrics {
                lang: "eng".to_string(),
                timestamp_format: TimestampFormat::Ms,
                content_type: SynchronisedLyricsType::Lyrics,
                description: String::new(),
                content,
            });
        }
    }

    tag.write_to_path(&path, Version::Id3v24).map_err(|e| e.to_string())
}
```

- [ ] **Step 8: Register commands in `lib.rs`**

In `src-tauri/src/lib.rs`, add to the `invoke_handler!` macro:
```rust
commands::metadata_editor::read_audio_metadata,
commands::metadata_editor::write_audio_metadata,
```

Full invoke_handler block after edit:
```rust
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
```

- [ ] **Step 9: Verify compilation**

```bash
cd src-tauri && cargo check 2>&1 | tail -5
```

Expected: `warning: ...` lines only, no `error:` lines.

- [ ] **Step 10: Run all Rust tests**

```bash
cd src-tauri && cargo test 2>&1 | tail -10
```

Expected: all tests pass including the 5 `parse_lrc_*` tests.

- [ ] **Step 11: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/commands/metadata_editor.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(rust): add read_audio_metadata and write_audio_metadata commands"
```

---

## Task 2: Frontend types + command wrappers + `searchItunesCover`

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/metadata.ts`
- Modify: `src/lib/commands.ts`

**Interfaces:**
- Consumes: Tauri commands `read_audio_metadata`, `write_audio_metadata` from Task 1
- Produces:
  - `AudioMetadata` type (from `types.ts`)
  - `WriteMetadataArgs` type (from `types.ts`)
  - `ItunesCoverResult` type (from `types.ts`)
  - `readAudioMetadata(path: string): Promise<AudioMetadata>` (from `commands.ts`)
  - `writeAudioMetadata(args: WriteMetadataArgs): Promise<void>` (from `commands.ts`)
  - `searchItunesCover(query: string): Promise<ItunesCoverResult[]>` (from `metadata.ts`)

---

- [ ] **Step 1: Write failing test for `searchItunesCover`**

Open `src/lib/__tests__/metadata.test.ts` and append:

```typescript
import { searchItunesCover } from "../metadata";

describe("searchItunesCover", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns mapped results on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            trackName: "Song A",
            artistName: "Artist A",
            collectionName: "Album A",
            artworkUrl100: "https://example.com/100x100bb",
          },
        ],
      }),
    });

    const results = await searchItunesCover("Artist A Song A");
    expect(results).toHaveLength(1);
    expect(results[0].artworkUrl).toBe("https://example.com/1000x1000bb");
    expect(results[0].trackName).toBe("Song A");
  });

  it("returns [] on fetch error", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network"));
    const results = await searchItunesCover("anything");
    expect(results).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test — expect it to FAIL**

```bash
npm test -- --testPathPattern=metadata 2>&1 | tail -15
```

Expected: `searchItunesCover is not a function` or similar.

- [ ] **Step 3: Add types to `types.ts`**

Append to `src/lib/types.ts`:

```typescript
export interface AudioMetadata {
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
  coverBase64?: string;
  lyricsPlain?: string;
  lyricsLrc?: string;
}

export interface WriteMetadataArgs {
  path: string;
  title: string;
  artist: string;
  album: string;
  year: string;
  coverUrl?: string;
  lyricsPlain: string;
  lyricsLrc: string;
}

export interface ItunesCoverResult {
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl: string;
}
```

- [ ] **Step 4: Export `searchItunesCover` from `metadata.ts`**

Append to `src/lib/metadata.ts` (after the existing private `searchItunes` function):

```typescript
export async function searchItunesCover(query: string): Promise<ItunesCoverResult[]> {
  try {
    const term = encodeURIComponent(query.trim());
    const res = await fetch(
      `https://itunes.apple.com/search?term=${term}&media=music&limit=5`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: ItunesResult[] };
    return (data.results ?? [])
      .filter((r) => !!r.artworkUrl100)
      .map((r) => ({
        trackName: r.trackName ?? "",
        artistName: r.artistName ?? "",
        collectionName: r.collectionName ?? "",
        artworkUrl: r.artworkUrl100!.replace("100x100bb", "1000x1000bb"),
      }));
  } catch {
    return [];
  }
}
```

Also add the import at the top of `metadata.ts` — add `ItunesCoverResult` to the import from types (add a new import line):

```typescript
import type { ItunesCoverResult } from "./types";
```

- [ ] **Step 5: Add command wrappers to `commands.ts`**

Append to `src/lib/commands.ts`:

```typescript
import type { AudioMetadata, WriteMetadataArgs } from "./types";

export const readAudioMetadata = (path: string): Promise<AudioMetadata> =>
  invoke("read_audio_metadata", { path });

export const writeAudioMetadata = (args: WriteMetadataArgs): Promise<void> =>
  invoke("write_audio_metadata", {
    path: args.path,
    title: args.title,
    artist: args.artist,
    album: args.album,
    year: args.year,
    coverUrl: args.coverUrl,
    lyricsPlain: args.lyricsPlain,
    lyricsLrc: args.lyricsLrc,
  });
```

(The `invoke` import is already at the top of `commands.ts`.)

- [ ] **Step 6: Run TypeScript type check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 7: Run metadata tests — expect them to PASS**

```bash
npm test -- --testPathPattern=metadata 2>&1 | tail -15
```

Expected: all tests pass including the 2 new `searchItunesCover` tests.

- [ ] **Step 8: Commit**

```bash
git add src/lib/types.ts src/lib/metadata.ts src/lib/commands.ts src/lib/__tests__/metadata.test.ts
git commit -m "feat(frontend): add AudioMetadata types, searchItunesCover, and command wrappers"
```

---

## Task 3: shadcn Textarea component + MetadataEditor view

**Files:**
- Create: `src/components/ui/textarea.tsx`
- Create: `src/views/MetadataEditor.tsx`

**Interfaces:**
- Consumes: `readAudioMetadata`, `writeAudioMetadata` from `commands.ts` (Task 2); `searchItunesCover` from `metadata.ts` (Task 2); `AudioMetadata`, `WriteMetadataArgs`, `ItunesCoverResult` from `types.ts` (Task 2)
- Produces: `MetadataEditor` React component exported from `src/views/MetadataEditor.tsx`

---

- [ ] **Step 1: Create the Textarea component**

Create `src/components/ui/textarea.tsx`:

```tsx
import * as React from "react"
import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-white/10 bg-stroy-800 px-3 py-2 text-sm text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stroy-500 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
```

- [ ] **Step 2: Create `MetadataEditor.tsx`**

Create `src/views/MetadataEditor.tsx`:

```tsx
import { open } from "@tauri-apps/plugin-dialog";
import { Tag } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Textarea } from "@/components/ui/textarea";
import { readAudioMetadata, writeAudioMetadata } from "@/lib/commands";
import { searchItunesCover } from "@/lib/metadata";
import type { ItunesCoverResult, WriteMetadataArgs } from "@/lib/types";
import { cn } from "@/lib/utils";

interface FormState {
  title: string;
  artist: string;
  album: string;
  year: string;
  lyricsPlain: string;
  lyricsLrc: string;
}

export function MetadataEditor() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [filePath, setFilePath] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    title: "", artist: "", album: "", year: "", lyricsPlain: "", lyricsLrc: "",
  });
  const [currentCoverDataUrl, setCurrentCoverDataUrl] = useState<string | null>(null);
  const [selectedCoverUrl, setSelectedCoverUrl] = useState<string | null>(null);
  const [itunesResults, setItunesResults] = useState<ItunesCoverResult[]>([]);
  const [itunesQuery, setItunesQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const path = searchParams.get("path");
    if (path) {
      handleLoadFile(decodeURIComponent(path));
    } else {
      handleOpenPicker();
    }
  }, []);

  async function handleOpenPicker() {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Audio", extensions: ["mp3"] }],
      });
      if (selected && typeof selected === "string") {
        handleLoadFile(selected);
      } else {
        navigate(-1);
      }
    } catch {
      navigate(-1);
    }
  }

  async function handleLoadFile(path: string) {
    setIsLoading(true);
    setLoadError(null);
    try {
      const meta = await readAudioMetadata(path);
      setFilePath(path);
      setForm({
        title: meta.title ?? "",
        artist: meta.artist ?? "",
        album: meta.album ?? "",
        year: meta.year ?? "",
        lyricsPlain: meta.lyricsPlain ?? "",
        lyricsLrc: meta.lyricsLrc ?? "",
      });
      setCurrentCoverDataUrl(meta.coverBase64 ?? null);
      if (meta.title && meta.artist) {
        const q = `${meta.artist} ${meta.title}`;
        setItunesQuery(q);
        runItunesSearch(q);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to read file");
    } finally {
      setIsLoading(false);
    }
  }

  async function runItunesSearch(query: string) {
    if (!query.trim()) return;
    setIsSearching(true);
    try {
      const results = await searchItunesCover(query);
      setItunesResults(results);
    } finally {
      setIsSearching(false);
    }
  }

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
      setSaveSuccess(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t("metadataEditor.saveError"));
    } finally {
      setIsSaving(false);
    }
  }

  const displayCover = selectedCoverUrl ?? currentCoverDataUrl;

  if (isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <p className="text-sm text-white/40">Loading…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-4 px-6 py-8">
        <p className="text-sm text-red-400">{loadError}</p>
        <button
          type="button"
          onClick={handleOpenPicker}
          className="self-start rounded-lg bg-stroy-500 px-4 py-2 text-sm font-semibold text-white hover:bg-stroy-600 transition-colors"
        >
          {t("metadataEditor.pickFile")}
        </button>
      </div>
    );
  }

  if (!filePath) return null;

  return (
    <div className="flex flex-col gap-6 px-6 py-8 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-white">{t("metadataEditor.title")}</h1>
      <p className="text-xs text-white/30 truncate">{filePath}</p>

      {/* Cover + text fields */}
      <div className="flex gap-4">
        <div className="shrink-0">
          {displayCover ? (
            <img
              src={displayCover}
              alt="Cover"
              className="size-28 rounded-xl object-cover"
            />
          ) : (
            <div className="flex size-28 items-center justify-center rounded-xl bg-stroy-800">
              <Tag size={24} className="text-white/20" />
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          {(["title", "artist", "album"] as const).map((field) => (
            <input
              key={field}
              type="text"
              placeholder={t(`metadataEditor.fields.${field}`)}
              value={form[field]}
              onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
              className="w-full rounded-lg bg-stroy-800 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-stroy-500"
            />
          ))}
          <input
            type="text"
            placeholder={t("metadataEditor.fields.year")}
            value={form.year}
            onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
            className="w-24 rounded-lg bg-stroy-800 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-stroy-500"
          />
        </div>
      </div>

      {/* iTunes cover search */}
      <div className="flex flex-col gap-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">
          {t("metadataEditor.cover.search")}
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder={t("metadataEditor.cover.searchPlaceholder")}
            value={itunesQuery}
            onChange={(e) => setItunesQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runItunesSearch(itunesQuery)}
            className="flex-1 rounded-lg bg-stroy-800 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-stroy-500"
          />
          <button
            type="button"
            onClick={() => runItunesSearch(itunesQuery)}
            disabled={isSearching}
            className="rounded-lg bg-stroy-500 px-4 py-2 text-sm font-semibold text-white hover:bg-stroy-600 disabled:opacity-50 transition-colors"
          >
            {isSearching ? "…" : t("metadataEditor.cover.searchButton")}
          </button>
        </div>
        {itunesResults.length > 0 && (
          <div className="flex gap-2">
            {itunesResults.map((r) => (
              <button
                key={r.artworkUrl}
                type="button"
                onClick={() =>
                  setSelectedCoverUrl((prev) =>
                    prev === r.artworkUrl ? null : r.artworkUrl
                  )
                }
                title={`${r.artistName} — ${r.collectionName}`}
                className={cn(
                  "size-16 shrink-0 overflow-hidden rounded-lg border-2 transition-all",
                  selectedCoverUrl === r.artworkUrl
                    ? "border-stroy-500 scale-105"
                    : "border-transparent opacity-70 hover:opacity-100"
                )}
              >
                <img src={r.artworkUrl} alt={r.collectionName} className="size-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Plain lyrics */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-white/30">
          {t("metadataEditor.lyrics.plain")}
        </label>
        <Textarea
          value={form.lyricsPlain}
          onChange={(e) => setForm((f) => ({ ...f, lyricsPlain: e.target.value }))}
          rows={6}
          placeholder={"Verse 1\nLine one\nLine two"}
          className="resize-y"
        />
      </div>

      {/* LRC lyrics */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-white/30">
          {t("metadataEditor.lyrics.lrc")}
        </label>
        <Textarea
          value={form.lyricsLrc}
          onChange={(e) => setForm((f) => ({ ...f, lyricsLrc: e.target.value }))}
          rows={6}
          placeholder={"[00:01.00] Line one\n[00:05.50] Line two"}
          className="resize-y font-mono"
        />
      </div>

      {/* Status + Save */}
      <div className="flex items-center justify-between">
        <div>
          {saveSuccess && (
            <p className="text-sm font-medium text-green-400">
              {t("metadataEditor.saveSuccess")}
            </p>
          )}
          {saveError && (
            <p className="text-sm font-medium text-red-400">{saveError}</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-xl bg-stroy-500 px-6 py-2.5 text-sm font-bold text-white hover:bg-stroy-600 disabled:opacity-50 transition-colors"
        >
          {isSaving ? "…" : t("metadataEditor.save")}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run TypeScript type check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/textarea.tsx src/views/MetadataEditor.tsx
git commit -m "feat(ui): add Textarea component and MetadataEditor view"
```

---

## Task 4: Navigation — route, Sidebar, BottomNav

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/custom/Sidebar.tsx`
- Modify: `src/components/custom/BottomNav.tsx`

**Interfaces:**
- Consumes: `MetadataEditor` component from Task 3; `DownloadRecord.filePath` field (already in `types.ts`)
- Produces: `/metadata-editor` route accessible from nav and from history items

---

- [ ] **Step 1: Add route in `App.tsx`**

In `src/App.tsx`, add the import:
```tsx
import { MetadataEditor } from "@/views/MetadataEditor";
```

And add the route inside `<Routes>`:
```tsx
<Route path="/metadata-editor" element={<MetadataEditor />} />
```

Full `<Routes>` block after edit:
```tsx
<Routes>
  <Route path="/" element={<Home />} />
  <Route path="/fetch" element={<Fetch />} />
  <Route path="/settings" element={<Settings />} />
  <Route path="/metadata-editor" element={<MetadataEditor />} />
</Routes>
```

- [ ] **Step 2: Update `Sidebar.tsx`**

Add `Tag` to the lucide-react import:
```tsx
import { Film, Plus, Settings, Tag } from "lucide-react";
```

Replace the history items rendering block (the `.map()` call) to wrap each button in a group div and add the edit icon:

```tsx
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
```

Add the Metadata nav entry in the bottom settings section. Replace the bottom `<div>` containing the Settings button with:

```tsx
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
```

- [ ] **Step 3: Update `BottomNav.tsx`**

Add `Tag` to the lucide-react import:
```tsx
import { Home, Clock, Settings, Tag } from "lucide-react";
```

Replace the `TABS` constant:
```tsx
const TABS = [
  { path: "/", icon: Home, label: "Accueil" },
  { path: "/", icon: Clock, label: "Historique" },
  { path: "/metadata-editor", icon: Tag, label: "Metadata" },
  { path: "/settings", icon: Settings, label: "Paramètres" },
];
```

- [ ] **Step 4: Run TypeScript type check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/custom/Sidebar.tsx src/components/custom/BottomNav.tsx
git commit -m "feat(nav): add metadata editor route, sidebar entry, and bottom nav tab"
```

---

## Task 5: i18n — all 4 locale files

**Files:**
- Modify: `src/locales/en.json`
- Modify: `src/locales/fr-FR.json`
- Modify: `src/locales/es-419.json`
- Modify: `src/locales/pt-BR.json`

**Interfaces:**
- Produces: translation keys consumed by `Sidebar.tsx` and `MetadataEditor.tsx`

---

- [ ] **Step 1: Add keys to `en.json`**

In the `"sidebar"` object, add `"metadata"` key:
```json
"sidebar": {
  "newDownload": "New download",
  "history": "History",
  "noDownloads": "No downloads",
  "settings": "Settings",
  "metadata": "Metadata",
  "editMetadata": "Edit metadata"
}
```

Add new top-level `"metadataEditor"` object (before the closing `}` of the file):
```json
"metadataEditor": {
  "title": "Metadata Editor",
  "pickFile": "Choose an MP3 file",
  "fields": {
    "title": "Title",
    "artist": "Artist",
    "album": "Album",
    "year": "Year"
  },
  "cover": {
    "search": "Cover art — iTunes search",
    "searchPlaceholder": "Artist + title",
    "searchButton": "Search"
  },
  "lyrics": {
    "plain": "Lyrics (plain text)",
    "lrc": "Synchronized lyrics — LRC format"
  },
  "save": "Save",
  "saveSuccess": "Saved successfully",
  "saveError": "Save failed"
}
```

- [ ] **Step 2: Add keys to `fr-FR.json`**

In the `"sidebar"` object:
```json
"metadata": "Métadonnées",
"editMetadata": "Modifier les métadonnées"
```

Add `"metadataEditor"` object:
```json
"metadataEditor": {
  "title": "Éditeur de métadonnées",
  "pickFile": "Choisir un fichier MP3",
  "fields": {
    "title": "Titre",
    "artist": "Artiste",
    "album": "Album",
    "year": "Année"
  },
  "cover": {
    "search": "Pochette — recherche iTunes",
    "searchPlaceholder": "Artiste + titre",
    "searchButton": "Chercher"
  },
  "lyrics": {
    "plain": "Paroles (texte brut)",
    "lrc": "Paroles synchronisées — format LRC"
  },
  "save": "Enregistrer",
  "saveSuccess": "Enregistré avec succès",
  "saveError": "Échec de l'enregistrement"
}
```

- [ ] **Step 3: Add keys to `es-419.json`**

In the `"sidebar"` object:
```json
"metadata": "Metadatos",
"editMetadata": "Editar metadatos"
```

Add `"metadataEditor"` object:
```json
"metadataEditor": {
  "title": "Editor de metadatos",
  "pickFile": "Elegir un archivo MP3",
  "fields": {
    "title": "Título",
    "artist": "Artista",
    "album": "Álbum",
    "year": "Año"
  },
  "cover": {
    "search": "Portada — búsqueda en iTunes",
    "searchPlaceholder": "Artista + título",
    "searchButton": "Buscar"
  },
  "lyrics": {
    "plain": "Letras (texto plano)",
    "lrc": "Letras sincronizadas — formato LRC"
  },
  "save": "Guardar",
  "saveSuccess": "Guardado correctamente",
  "saveError": "Error al guardar"
}
```

- [ ] **Step 4: Add keys to `pt-BR.json`**

In the `"sidebar"` object:
```json
"metadata": "Metadados",
"editMetadata": "Editar metadados"
```

Add `"metadataEditor"` object:
```json
"metadataEditor": {
  "title": "Editor de metadados",
  "pickFile": "Escolher um arquivo MP3",
  "fields": {
    "title": "Título",
    "artist": "Artista",
    "album": "Álbum",
    "year": "Ano"
  },
  "cover": {
    "search": "Capa — busca no iTunes",
    "searchPlaceholder": "Artista + título",
    "searchButton": "Buscar"
  },
  "lyrics": {
    "plain": "Letras (texto simples)",
    "lrc": "Letras sincronizadas — formato LRC"
  },
  "save": "Salvar",
  "saveSuccess": "Salvo com sucesso",
  "saveError": "Falha ao salvar"
}
```

- [ ] **Step 5: Run TypeScript type check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/locales/en.json src/locales/fr-FR.json src/locales/es-419.json src/locales/pt-BR.json
git commit -m "feat(i18n): add metadata editor translation keys to all 4 locales"
```

---

## Task 6: Update docs

**Files:**
- Modify: `docs/ai-context.md`

---

- [ ] **Step 1: Update `docs/ai-context.md`**

In the `## Structure du projet` section, add `MetadataEditor.tsx` under `views/`:
```
  views/           Home.tsx, Fetch.tsx, Settings.tsx, MetadataEditor.tsx
```

In the `## Architecture Tauri : commands implémentés` section, add:
```
  └─ invoke("read_audio_metadata", { path })
       └─ src-tauri/src/commands/metadata_editor.rs
            └─ lire les tags ID3 (id3 crate) → AudioMetadata struct

  └─ invoke("write_audio_metadata", { path, title, artist, album, year, coverUrl?, lyricsPlain, lyricsLrc })
       └─ src-tauri/src/commands/metadata_editor.rs
            └─ écrire tags ID3 (USLT, SYLT, APIC) via id3 crate
```

In the `## Known stubs / À compléter` table, the `fetchYouTubeMusicMetadata` row already references `metadata.ts`. Note that `searchItunesCover` is now a public export from that file returning up to 5 results.

- [ ] **Step 2: Commit**

```bash
git add docs/ai-context.md
git commit -m "docs: update ai-context with metadata editor commands and view"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by task |
|---|---|
| New route `/metadata-editor` | Task 4 |
| File picker (any MP3) | Task 3 (`handleOpenPicker`) |
| Shortcut from history (MP3 only) | Task 4 (Sidebar edit button) |
| Read existing ID3 tags to pre-fill | Task 1 (`read_audio_metadata`) + Task 3 (`handleLoadFile`) |
| Fields: title, artist, album, year | Task 3 (form inputs) |
| Cover display | Task 3 (`displayCover`) |
| iTunes auto-search on load | Task 3 (`handleLoadFile` triggers `runItunesSearch`) |
| iTunes manual search | Task 3 (search input + button) |
| Up to 5 iTunes results as grid | Task 3 (results grid) + Task 2 (`searchItunesCover` limit=5) |
| Plain lyrics (USLT) via textarea | Task 1 (write USLT) + Task 3 (Textarea) |
| SYLT via LRC paste | Task 1 (`parse_lrc_line` + write SYLT) + Task 3 (Textarea) |
| `cover_url: None` = keep existing APIC | Task 1 (`write_audio_metadata` only replaces on `Some`) |
| Sidebar nav entry | Task 4 |
| BottomNav entry | Task 4 |
| i18n 4 locales | Task 5 |
| `id3` crate approach | Task 1 |
| Unit tests for LRC parsing | Task 1 |
| Docs updated | Task 6 |

**Type consistency check:** `AudioMetadata` defined in Task 2 (`types.ts`) and used in Task 3 (`MetadataEditor.tsx`) — both use `coverBase64`, `lyricsPlain`, `lyricsLrc` (camelCase, matching Tauri's snake_case → camelCase auto-conversion). `WriteMetadataArgs` fields `coverUrl`, `lyricsPlain`, `lyricsLrc` match the `write_audio_metadata` Rust command parameter names after Tauri conversion. ✓

**Placeholder scan:** No TBD, no "similar to task N", all code blocks are complete. ✓
