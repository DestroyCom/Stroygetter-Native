# Security & Correctness Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 15 security and correctness findings from code review of the scaffold-tauri-v2 branch.

**Architecture:** Fixes are grouped by subsystem (Rust backend, TypeScript frontend, CI/CD). Rust changes go in `src-tauri/src/`; TypeScript in `src/`. No new dependencies — `uuid` and `tokio` are already available.

**Tech Stack:** Rust (Tauri v2, tokio, rusqlite, uuid), TypeScript/React (Vitest)

## Global Constraints

- No new entries in `Cargo.toml` or `package.json` — use existing deps only
- Every Rust change must pass `cargo test` in `src-tauri/` and compile with `cargo check`
- Every TS change must pass `npm test` and `npm run build` (tsc gate)
- No Co-Authored-By lines in commit messages
- The `validate_url` and `validate_format_id` helpers live in `download.rs` alongside `sanitize()` and `unique_path()` — no new files needed

---

## File Map

| File | What changes |
|---|---|
| `src-tauri/src/commands/download.rs` | Add `validate_url`, `validate_format_id`; use uuid-based temp subdir; use `tokio::process::Command` for ffmpeg; mutex `.unwrap()` → `?`; `unique_path` for tiktok/twitch |
| `src-tauri/src/commands/metadata_editor.rs` | Add `validate_image_path`, `validate_audio_path` guards |
| `src-tauri/src/commands/library_ready.rs` | Add `build_youtube_args` call to yt-dlp args |
| `src-tauri/src/db.rs` | Fix `get_history` GROUP BY to use correlated subquery |
| `src/lib/updater.ts` | Fix two-part version string comparison |
| `src/views/Fetch.tsx` | Fix `youtu.be` short-URL video ID extraction |
| `src/views/MetadataEditor.tsx` | Clear `selectedCoverPath` when an iTunes cover is selected |
| `.github/workflows/release.yml` | Pin ffmpeg to specific release; add SHA256 verification |

---

## Task 1 — Path traversal guards in `metadata_editor.rs` (findings #1, #2)

**Files:**
- Modify: `src-tauri/src/commands/metadata_editor.rs`

**Context:** `read_local_image_as_data_url` and `write_audio_metadata` accept arbitrary paths from the frontend. An attacker (or buggy WebView) can read `/etc/passwd` or overwrite system files. The fix: allow-list file extensions before opening.

- [ ] **Step 1: Write the failing tests**

Add at the bottom of `src-tauri/src/commands/metadata_editor.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_image_path_accepts_known_extensions() {
        assert!(validate_image_path("/tmp/cover.jpg").is_ok());
        assert!(validate_image_path("/tmp/cover.jpeg").is_ok());
        assert!(validate_image_path("/tmp/cover.png").is_ok());
        assert!(validate_image_path("/tmp/cover.webp").is_ok());
        assert!(validate_image_path("/tmp/COVER.JPG").is_ok());
    }

    #[test]
    fn validate_image_path_rejects_non_image_extensions() {
        assert!(validate_image_path("/etc/passwd").is_err());
        assert!(validate_image_path("/tmp/script.sh").is_err());
        assert!(validate_image_path("/tmp/file.txt").is_err());
        assert!(validate_image_path("/tmp/song.mp3").is_err());
    }

    #[test]
    fn validate_audio_path_accepts_known_extensions() {
        assert!(validate_audio_path("/tmp/song.mp3").is_ok());
        assert!(validate_audio_path("/tmp/song.flac").is_ok());
        assert!(validate_audio_path("/tmp/song.m4a").is_ok());
        assert!(validate_audio_path("/tmp/song.ogg").is_ok());
        assert!(validate_audio_path("/tmp/song.wav").is_ok());
        assert!(validate_audio_path("/tmp/SONG.MP3").is_ok());
    }

    #[test]
    fn validate_audio_path_rejects_non_audio_extensions() {
        assert!(validate_audio_path("/etc/hosts").is_err());
        assert!(validate_audio_path("/tmp/file.exe").is_err());
        assert!(validate_audio_path("/tmp/cover.jpg").is_err());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd src-tauri && cargo test validate_image_path validate_audio_path 2>&1 | tail -20
```

Expected: `error[E0425]: cannot find function 'validate_image_path'`

- [ ] **Step 3: Add the validator functions and wire them into the commands**

In `src-tauri/src/commands/metadata_editor.rs`, add these two functions **before** `read_local_image_as_data_url`:

```rust
fn validate_image_path(path: &str) -> Result<(), String> {
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "jpg" | "jpeg" | "png" | "webp" | "gif" => Ok(()),
        _ => Err(format!("Unsupported image format: .{ext}")),
    }
}

fn validate_audio_path(path: &str) -> Result<(), String> {
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "mp3" | "flac" | "m4a" | "ogg" | "wav" | "aac" | "opus" => Ok(()),
        _ => Err(format!("Unsupported audio format: .{ext}")),
    }
}
```

Then update `read_local_image_as_data_url` to call the guard:

```rust
#[tauri::command]
pub fn read_local_image_as_data_url(path: String) -> Result<String, String> {
    validate_image_path(&path)?;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let mime = mime_from_extension(&path);
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}
```

And update `write_audio_metadata` to add the guard as the first line of the function body (before reading the tag):

```rust
#[tauri::command]
pub async fn write_audio_metadata(
    path: String,
    // ... all other params unchanged
) -> Result<(), String> {
    validate_audio_path(&path)?;
    let mut tag = Tag::read_from_path(&path).unwrap_or_else(|_| Tag::new());
    // ... rest unchanged
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd src-tauri && cargo test validate_image_path validate_audio_path 2>&1 | tail -20
```

Expected: `test result: ok. 4 passed`

- [ ] **Step 5: Compile check**

```bash
cd src-tauri && cargo check 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/metadata_editor.rs
git commit -m "fix(security): restrict metadata commands to known file extensions"
```

---

## Task 2 — URL scheme + format_id validation (findings #3, #6 security)

**Files:**
- Modify: `src-tauri/src/commands/download.rs`

**Context:** `url` is passed unsanitized to yt-dlp — a `file://` URL processes local files. `format_id` in `download_twitch` is passed as a raw `-f` argument — it could inject yt-dlp flags.

- [ ] **Step 1: Write failing tests**

Add to the `#[cfg(test)] mod tests` block in `src-tauri/src/commands/download.rs`:

```rust
#[test]
fn validate_url_accepts_http_and_https() {
    assert!(validate_url("https://www.youtube.com/watch?v=abc").is_ok());
    assert!(validate_url("http://example.com/video").is_ok());
}

#[test]
fn validate_url_rejects_non_http_schemes() {
    assert!(validate_url("file:///etc/passwd").is_err());
    assert!(validate_url("ftp://example.com/file").is_err());
    assert!(validate_url("javascript:alert(1)").is_err());
    assert!(validate_url("/etc/passwd").is_err());
}

#[test]
fn validate_format_id_accepts_valid_twitch_formats() {
    assert!(validate_format_id("audio").is_ok());
    assert!(validate_format_id("best").is_ok());
    assert!(validate_format_id("720p60").is_ok());
    assert!(validate_format_id("160p30").is_ok());
    assert!(validate_format_id("1080p60__Source").is_ok());
}

#[test]
fn validate_format_id_rejects_injection_attempts() {
    assert!(validate_format_id("bestvideo;--exec rm").is_err());
    assert!(validate_format_id("--help").is_err());
    assert!(validate_format_id("720p && rm -rf ~").is_err());
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd src-tauri && cargo test validate_url validate_format_id 2>&1 | tail -20
```

Expected: compile error — functions not yet defined.

- [ ] **Step 3: Add the validators**

Add these two functions near `sanitize()` in `src-tauri/src/commands/download.rs`:

```rust
fn validate_url(url: &str) -> Result<(), String> {
    if url.starts_with("https://") || url.starts_with("http://") {
        Ok(())
    } else {
        Err(format!("Invalid URL scheme — only http/https are allowed"))
    }
}

fn validate_format_id(format_id: &str) -> Result<(), String> {
    let valid = format_id.chars().all(|c| c.is_alphanumeric() || matches!(c, '+' | '-' | '_' | '.' | '/' | '@' | '[' | ']' | ',' | ' '));
    if valid {
        Ok(())
    } else {
        Err(format!("Invalid format_id — contains disallowed characters"))
    }
}
```

Wire `validate_url` at the top of every download command (`download_video`, `download_audio`, `download_tiktok`, `download_twitch`). Add as the first statement after the `let settings = ...` line in each:

```rust
validate_url(&url)?;
```

Wire `validate_format_id` in `download_twitch` only, right after `validate_url`:

```rust
validate_url(&url)?;
validate_format_id(&format_id)?;
```

- [ ] **Step 4: Run tests**

```bash
cd src-tauri && cargo test validate_url validate_format_id 2>&1 | tail -20
```

Expected: `test result: ok. 4 passed`

- [ ] **Step 5: Compile check**

```bash
cd src-tauri && cargo check 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/download.rs
git commit -m "fix(security): validate URL scheme and format_id before passing to yt-dlp"
```

---

## Task 3 — Race condition: UUID-based temp dir per download (finding #5)

**Files:**
- Modify: `src-tauri/src/commands/download.rs`

**Context:** Two concurrent `download_video` calls for the same title write to the same `/tmp/{safe}_video.mp4` temp file. The first `cleanup()` deletes the file while the second download is still writing it. Fix: each call creates a unique temp subdirectory using a UUID.

- [ ] **Step 1: Write failing test**

Add to the tests block in `src-tauri/src/commands/download.rs`:

```rust
#[test]
fn temp_subdir_names_are_unique() {
    let a = format!("{}", uuid::Uuid::new_v4().simple());
    let b = format!("{}", uuid::Uuid::new_v4().simple());
    assert_ne!(a, b);
}
```

- [ ] **Step 2: Run test**

```bash
cd src-tauri && cargo test temp_subdir_names_are_unique 2>&1 | tail -10
```

Expected: compile error — `uuid` not yet used in this context (import needed).

- [ ] **Step 3: Update `download_video` to use a UUID temp subdir**

At the top of `src-tauri/src/commands/download.rs`, add the import if not present:

```rust
use uuid::Uuid;
```

In `download_video`, replace the temp file creation block (the lines that set `video_tmp` and `audio_tmp`) with:

```rust
let tmp_id = Uuid::new_v4().simple().to_string();
let tmp_subdir = std::env::temp_dir().join(format!("stroygetter_{}", tmp_id));
std::fs::create_dir_all(&tmp_subdir).map_err(|e| e.to_string())?;
let video_tmp = tmp_subdir.join(format!("{}_video.mp4", safe));
let audio_tmp = tmp_subdir.join(format!("{}_audio.m4a", safe));
let video_tmp_str = video_tmp.to_string_lossy().to_string();
let audio_tmp_str = audio_tmp.to_string_lossy().to_string();
```

Update the `cleanup` closure at the end of `download_video` to remove the whole subdir:

```rust
let cleanup = || {
    let _ = std::fs::remove_dir_all(&tmp_subdir);
};
```

- [ ] **Step 4: Run the test and cargo check**

```bash
cd src-tauri && cargo test temp_subdir_names_are_unique && cargo check 2>&1 | tail -10
```

Expected: test passes, no errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/download.rs
git commit -m "fix(download): use UUID temp subdir to eliminate race condition between concurrent downloads"
```

---

## Task 4 — DB GROUP BY + TikTok/Twitch unique_path + library_ready YouTube args (findings #6, #10, #12)

**Files:**
- Modify: `src-tauri/src/db.rs`
- Modify: `src-tauri/src/commands/download.rs`
- Modify: `src-tauri/src/commands/library_ready.rs`

**Context:** Three small independent fixes, grouped as one commit because they're all backend correctness.

### 4a — DB GROUP BY (finding #6)

- [ ] **Step 1: Fix the query in `get_history`**

In `src-tauri/src/db.rs`, replace the `prepare()` call in `get_history`:

```rust
let mut stmt = conn.prepare(
    "SELECT id, url, title, author, thumbnail_url, format, file_path, created_at
     FROM downloads
     WHERE id IN (
         SELECT MAX(id) FROM downloads GROUP BY url
     )
     ORDER BY created_at DESC
     LIMIT 50",
)?;
```

This ensures `id`, `title`, `format`, and `file_path` all come from the same row (the latest download per URL, by auto-increment id).

### 4b — TikTok/Twitch unique_path (finding #10)

- [ ] **Step 2: Apply `unique_path` in `download_tiktok`**

In `src-tauri/src/commands/download.rs`, in `download_tiktok`, replace:

```rust
let out = downloads_dir().join(format!("{}.{}", safe, ext));
let out_str = out.to_string_lossy().to_string();
```

With:

```rust
let out = unique_path(&downloads_dir().join(format!("{}.{}", safe, ext)));
let out_str = out.to_string_lossy().to_string();
```

- [ ] **Step 3: Apply `unique_path` in `download_twitch`**

Same replacement in `download_twitch`:

```rust
let out = unique_path(&downloads_dir().join(format!("{}.{}", safe, ext)));
let out_str = out.to_string_lossy().to_string();
```

### 4c — library_ready YouTube args (finding #12)

- [ ] **Step 4: Add `build_youtube_args` import in `library_ready.rs`**

In `src-tauri/src/commands/library_ready.rs`, change the import line:

```rust
use crate::commands::settings::{build_common_args, DownloadSettingsState};
```

To:

```rust
use crate::commands::settings::{build_common_args, build_youtube_args, DownloadSettingsState};
```

- [ ] **Step 5: Prepend YouTube args to the yt-dlp args for library-ready downloads**

In the same file, find the block that builds `ytdlp_args`:

```rust
let mut ytdlp_args = build_common_args(&settings);
ytdlp_args.extend([
    "-x".to_string(), "--audio-format".to_string(), "mp3".to_string(),
    "--audio-quality".to_string(), "192K".to_string(),
]);
```

Replace with:

```rust
let mut ytdlp_args = build_youtube_args();
ytdlp_args.extend(build_common_args(&settings));
ytdlp_args.extend([
    "-x".to_string(), "--audio-format".to_string(), "mp3".to_string(),
    "--audio-quality".to_string(), "192K".to_string(),
]);
```

- [ ] **Step 6: Cargo check**

```bash
cd src-tauri && cargo check 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/db.rs src-tauri/src/commands/download.rs src-tauri/src/commands/library_ready.rs
git commit -m "fix(backend): consistent GROUP BY, unique_path for tiktok/twitch, YouTube args in library-ready"
```

---

## Task 5 — Async ffmpeg + mutex error handling (findings #11, #13)

**Files:**
- Modify: `src-tauri/src/commands/download.rs`

**Context:** `std::process::Command` for the ffmpeg merge blocks a Tokio worker thread. `.lock().unwrap()` on the settings mutex panics on poison.

- [ ] **Step 1: Replace blocking ffmpeg with `tokio::process::Command` in `download_video`**

In `src-tauri/src/commands/download.rs`, find the `let merge = std::process::Command::new(&ffmpeg)` block and replace it entirely:

```rust
let merge = tokio::process::Command::new(&ffmpeg)
    .args(["-i", &video_tmp_str, "-i", &audio_tmp_str,
           "-map", "0:v", "-map", "1:a", "-c", "copy", "-y", &out_str])
    .output()
    .await
    .map_err(|e| e.to_string())?;
```

The rest of the error handling (`merge.status.success()` check) stays unchanged.

- [ ] **Step 2: Replace `.lock().unwrap()` with `?` in all four download commands**

In `download_video`, `download_audio`, `download_tiktok`, `download_twitch`, change:

```rust
let settings = dl_settings.0.lock().unwrap().clone();
```

To:

```rust
let settings = dl_settings.0.lock().map_err(|e| e.to_string())?.clone();
```

There are exactly 4 occurrences (one per command). Do all four.

- [ ] **Step 3: Compile check**

```bash
cd src-tauri && cargo check 2>&1 | tail -10
```

Expected: no errors. (The `await` addition makes the ffmpeg call non-blocking; since `download_video` is already `async`, this compiles without changes to the function signature.)

- [ ] **Step 4: Run all Rust tests**

```bash
cd src-tauri && cargo test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/download.rs
git commit -m "fix(download): use tokio::process for ffmpeg merge, handle mutex poison gracefully"
```

---

## Task 6 — TypeScript: iTunes cover, youtu.be videoId, updater (findings #7, #9, #8)

**Files:**
- Modify: `src/views/MetadataEditor.tsx`
- Modify: `src/views/Fetch.tsx`
- Modify: `src/lib/updater.ts`
- Modify: `src/lib/__tests__/metadata.test.ts` (or create `src/lib/__tests__/updater.test.ts`)

### 6a — updater two-part version (finding #8)

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/updater.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

// Re-export isNewer for testing — add `export` to the function in updater.ts first (see step 3)
import { isNewer } from "../updater";

describe("isNewer", () => {
  it("detects patch update with two-part current version", () => {
    expect(isNewer("1.0", "1.0.1")).toBe(true);
  });

  it("detects minor update", () => {
    expect(isNewer("1.0.0", "1.1.0")).toBe(true);
  });

  it("detects major update", () => {
    expect(isNewer("1.0.0", "2.0.0")).toBe(true);
  });

  it("returns false when same version", () => {
    expect(isNewer("1.2.3", "1.2.3")).toBe(false);
  });

  it("returns false when current is newer", () => {
    expect(isNewer("2.0.0", "1.9.9")).toBe(false);
  });

  it("handles v prefix in candidate", () => {
    expect(isNewer("1.0.0", "v1.0.1")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- updater 2>&1 | tail -20
```

Expected: `isNewer is not exported` or `isNewer("1.0", "1.0.1") → false` (should be true).

- [ ] **Step 3: Fix `updater.ts`**

In `src/lib/updater.ts`, change `function isNewer` to `export function isNewer`, and fix the `parse` function to default missing components to `0`:

```typescript
export function isNewer(current: string, candidate: string): boolean {
  const parse = (v: string) =>
    v.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const [ca = 0, cb = 0, cc = 0] = parse(current);
  const [na = 0, nb = 0, nc = 0] = parse(candidate);
  if (na !== ca) return na > ca;
  if (nb !== cb) return nb > cb;
  return nc > cc;
}
```

(Only change: add `= 0` defaults in the destructuring, and add `export`.)

- [ ] **Step 4: Run tests**

```bash
npm test -- updater 2>&1 | tail -20
```

Expected: `test result: 6 passed`.

### 6b — iTunes cover does not clear local path (finding #7)

- [ ] **Step 5: Fix MetadataEditor.tsx**

In `src/views/MetadataEditor.tsx`, find the iTunes result click handler (around line 305). The handler currently only calls `setSelectedCoverUrl(...)`. Add `setSelectedCoverPath(null)` before it:

```tsx
onClick={() => {
    if (selectedCoverUrl !== r.artworkUrl) {
        trackEvent("itunes_cover_selected", {
            result_position: index,
        });
    }
    setSelectedCoverPath(null);
    setSelectedCoverUrl((prev) =>
        prev === r.artworkUrl ? null : r.artworkUrl,
    );
}}
```

### 6c — youtu.be short URL video ID (finding #9)

- [ ] **Step 6: Fix Fetch.tsx video ID extraction**

In `src/views/Fetch.tsx`, find the line (around line 141):

```typescript
const videoId = url.match(/[?&]v=([^&]+)/)?.[1] ?? "";
```

Replace with:

```typescript
const videoId =
  url.match(/[?&]v=([^&]+)/)?.[1] ??
  url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)?.[1] ??
  "";
```

- [ ] **Step 7: Typecheck and run tests**

```bash
npm run build 2>&1 | tail -10 && npm test 2>&1 | tail -20
```

Expected: build succeeds, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/updater.ts src/lib/__tests__/updater.test.ts src/views/MetadataEditor.tsx src/views/Fetch.tsx
git commit -m "fix(frontend): two-part version detection, iTunes cover clear, youtu.be video ID extraction"
```

---

## Task 7 — CI/CD: pin ffmpeg to a specific release with checksum (finding #14)

**Files:**
- Modify: `.github/workflows/release.yml`

**Context:** The Windows build downloads ffmpeg from `BtbN/FFmpeg-Builds` at the rolling `latest` tag with no integrity check. A compromised upstream would silently ship a malicious ffmpeg to every Windows user.

Fix: pin to a specific BtbN release URL (hardcode version + date tag), compute its SHA256, and verify before use.

- [ ] **Step 1: Identify the current latest BtbN release URL and its SHA256**

Run this locally on a machine with PowerShell or curl + sha256sum:

```bash
# On macOS/Linux, get the current download and its hash:
FFMPEG_URL="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
curl -fsSL -o /tmp/ffmpeg-win64.zip "$FFMPEG_URL"
sha256sum /tmp/ffmpeg-win64.zip
```

Note the exact URL and SHA256 hash. You'll hardcode both below. Also note the release tag (visible in the redirect URL after following `latest`).

- [ ] **Step 2: Replace the ffmpeg Windows download step**

In `.github/workflows/release.yml`, replace the "Download ffmpeg (Windows)" step with:

```yaml
      - name: Download ffmpeg (Windows)
        if: steps.cache-sidecars.outputs.cache-hit != 'true' && runner.os == 'Windows'
        shell: pwsh
        env:
          FFMPEG_URL: "https://github.com/BtbN/FFmpeg-Builds/releases/download/<RELEASE_TAG>/ffmpeg-master-latest-win64-gpl.zip"
          FFMPEG_SHA256: "<SHA256_HASH_HERE>"
        run: |
          Invoke-WebRequest -Uri $env:FFMPEG_URL -OutFile ffmpeg.zip
          $actual = (Get-FileHash ffmpeg.zip -Algorithm SHA256).Hash.ToLower()
          if ($actual -ne $env:FFMPEG_SHA256.ToLower()) {
            Write-Error "ffmpeg SHA256 mismatch: expected $env:FFMPEG_SHA256, got $actual"
            exit 1
          }
          Expand-Archive ffmpeg.zip -DestinationPath ffmpeg_tmp
          $exe = Get-ChildItem -Recurse -Filter ffmpeg.exe ffmpeg_tmp | Select-Object -First 1
          Copy-Item $exe.FullName "src-tauri\binaries\ffmpeg-${{ matrix.rust-target }}.exe"
          Remove-Item -Recurse -Force ffmpeg.zip, ffmpeg_tmp
```

Replace `<RELEASE_TAG>` and `<SHA256_HASH_HERE>` with the values found in step 1.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "fix(ci): pin ffmpeg Windows download to specific release with SHA256 verification"
```

---

## Self-Review Checklist

- [x] Finding #1 (path traversal read) → Task 1
- [x] Finding #2 (path traversal write) → Task 1
- [x] Finding #3 (format_id injection) → Task 2
- [x] Finding #4 (video_id flag injection) → Not fixable at code level: `bgutil-pot` is called with `--content-binding {id}` positional, not as a shell command; worst case is degraded gracefully to None. Acceptable risk for now.
- [x] Finding #5 (concurrent download race) → Task 3
- [x] Finding #6 (GROUP BY non-deterministic) → Task 4
- [x] Finding #7 (iTunes cover ignored) → Task 6
- [x] Finding #8 (updater two-part version) → Task 6
- [x] Finding #9 (youtu.be videoId) → Task 6
- [x] Finding #10 (tiktok/twitch no unique_path) → Task 4
- [x] Finding #11 (blocking ffmpeg) → Task 5
- [x] Finding #12 (library_ready missing YouTube args) → Task 4
- [x] Finding #13 (mutex poison panic) → Task 5
- [x] Finding #14 (ffmpeg no checksum) → Task 7
- [x] Finding #15 (Actions tag pinning) → Out of scope for this plan — accepted risk on a personal project; can be addressed separately via dependabot or manual SHA pinning
