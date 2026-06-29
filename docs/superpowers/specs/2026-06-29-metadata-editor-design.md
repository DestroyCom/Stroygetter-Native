# Metadata Editor — Design Spec

Date: 2026-06-29

## Overview

A new page in the StroyGetter Native app that lets users view and edit ID3 metadata on any MP3 file on disk: title, artist, album, year, cover art (with iTunes search), plain lyrics (USLT), and synchronized lyrics (SYLT in LRC format).

---

## Architecture

### Backend — Rust (`src-tauri/src/commands/metadata_editor.rs`)

New dependency in `Cargo.toml`:
```toml
id3 = "1"
```

Two new Tauri commands:

#### `read_audio_metadata(path: String) -> Result<AudioMetadata, String>`

Reads ID3 tags from a local MP3 file using the `id3` crate.

Returns:
```rust
#[derive(Serialize)]
struct AudioMetadata {
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    year: Option<String>,
    cover_base64: Option<String>,  // APIC frame → base64-encoded JPEG/PNG bytes
    lyrics_plain: Option<String>,  // USLT frame
    lyrics_lrc: Option<String>,    // SYLT frame → reconstructed as LRC text
}
```

The cover is returned as a `data:image/...;base64,...` string so the frontend can use it directly in `<img src>`. If multiple APIC frames exist, the one with picture type `CoverFront` is preferred.

SYLT frames are reconstructed into LRC format (`[mm:ss.xx] text\n`) so the frontend can display them in the same textarea as LRC input.

#### `write_audio_metadata(path, title, artist, album, year, cover_url: Option<String>, lyrics_plain: String, lyrics_lrc: String) -> Result<(), String>`

Writes all tags to the MP3 file in-place using the `id3` crate:

- Text tags: TIT2 (title), TPE1 (artist), TALB (album), TDRC (year)
- Cover: if `cover_url` is `Some(url)`, fetch bytes (reuse `try_fetch_cover` logic from `library_ready.rs`), write as APIC frame with type `CoverFront`. If `None`, the existing APIC frame is left untouched.
- `lyrics_plain` (non-empty): write USLT frame, language `"eng"`
- `lyrics_lrc` (non-empty): parse LRC lines → write SYLT frame with `TimestampFormat::Milliseconds` and `SynchronisedLyricsType::Lyrics`, language `"eng"`

LRC parsing: each line matching `^\[(\d{2}):(\d{2})\.(\d{2})\]\s*(.*)$` → timestamp in ms, text. Lines not matching that pattern are skipped.

Both commands are registered in `commands/mod.rs` and `lib.rs`.

---

### Frontend

#### New view — `src/views/MetadataEditor.tsx`

State:
- `filePath: string | null` — path of the file being edited
- `form: AudioMetadata` — current field values
- `coverUrl: string | null` — URL of the newly chosen iTunes cover (if changed)
- `itunesResults: ItunesResult[]` — up to 5 results from search
- `isSearching: boolean`
- `isSaving: boolean`
- `saveError: string | null`
- `saveSuccess: boolean`

On mount:
1. If `?path=` query param is present, load file directly
2. Otherwise open native file picker (`open()` from `@tauri-apps/plugin-dialog`, filter `*.mp3`)
3. Call `read_audio_metadata(path)` → fill `form`
4. If `form.title` and `form.artist` are non-empty, auto-trigger iTunes search

UI layout:
```
┌─────────────────────────────────────────┐
│ [← Back]         Metadata Editor        │
├──────────────┬──────────────────────────┤
│              │  Title   [____________]  │
│  [Cover art] │  Artist  [____________]  │
│  (120×120)   │  Album   [____________]  │
│              │  Year    [____]          │
├──────────────┴──────────────────────────┤
│ iTunes cover search                     │
│ [search term___________] [Search]       │
│ [img] [img] [img] [img] [img]  ← grid  │
├─────────────────────────────────────────┤
│ Lyrics (plain text)                     │
│ [                        textarea      ]│
├─────────────────────────────────────────┤
│ Synchronized Lyrics — LRC format        │
│ [00:01.23] Line one                     │
│ [                        textarea      ]│
├─────────────────────────────────────────┤
│                         [Save]          │
└─────────────────────────────────────────┘
```

#### iTunes search

Export `searchItunes` from `metadata.ts` and update its signature to return up to 5 results:
```ts
export async function searchItunesCover(
  query: string
): Promise<ItunesResult[]>
```

New function (not the existing one-result internal function) that takes a free-text query string and returns up to 5 results. Used both for auto-search (artist + title) and manual search.

#### New Tauri command wrappers in `src/lib/commands.ts`

```ts
export async function readAudioMetadata(path: string): Promise<AudioMetadata>
export async function writeAudioMetadata(args: WriteMetadataArgs): Promise<void>
```

#### New shadcn component

```bash
npx shadcn@latest add textarea
```

Adds `src/components/ui/textarea.tsx`.

#### Navigation

Add a 4th entry to both `Sidebar.tsx` and `BottomNav.tsx`:
- Label: "Metadata" (i18n key: `nav.metadata`)
- Icon: `Tag` from `lucide-react`
- Route: `/metadata-editor`

Add route in `App.tsx`:
```tsx
<Route path="/metadata-editor" element={<MetadataEditor />} />
```

#### History shortcut

In `src/components/custom/Sidebar.tsx` (the download history list), add an edit icon button on each entry that navigates to `/metadata-editor?path=<encodeURIComponent(record.file_path)>`. Only show the button if `record.file_path` ends with `.mp3`.

---

## i18n

Add keys to all 4 locale files (`en.json`, `fr-FR.json`, `es-419.json`, `pt-BR.json`):

```
nav.metadata
metadataEditor.title
metadataEditor.filePicker
metadataEditor.fields.title
metadataEditor.fields.artist
metadataEditor.fields.album
metadataEditor.fields.year
metadataEditor.cover.search
metadataEditor.cover.searchPlaceholder
metadataEditor.lyrics.plain
metadataEditor.lyrics.lrc
metadataEditor.save
metadataEditor.saveSuccess
metadataEditor.saveError
```

---

## Out of scope

- Formats other than MP3 (FLAC, M4A, OGG)
- Batch editing (multiple files)
- In-editor audio preview
- Auto-fetch lyrics (LRClib) — user pastes manually

---

## Tauri permissions

`tauri-plugin-dialog` is already declared in `Cargo.toml` and `dialog:allow-open` is already in `capabilities/default.json`. No additional permissions needed — `id3` reads/writes files directly via Rust std fs, not through Tauri FS plugin.
