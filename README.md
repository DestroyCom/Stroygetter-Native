# StroyGetter Native

> Desktop client for [StroyGetter](https://stroygetter.fr) — download from YouTube, TikTok and Twitch directly on your computer, no server required.

[![Latest release](https://img.shields.io/github/v/release/DestroyCom/Stroygetter-Native?style=flat-square&color=6d28d9)](https://github.com/DestroyCom/Stroygetter-Native/releases/latest)
[![Check](https://img.shields.io/github/actions/workflow/status/DestroyCom/Stroygetter-Native/check.yml?label=checks&style=flat-square)](https://github.com/DestroyCom/Stroygetter-Native/actions/workflows/check.yml)
[![License](https://img.shields.io/github/license/DestroyCom/Stroygetter-Native?style=flat-square)](LICENSE)

---

## Features

- **YouTube** — multi-quality video or audio only (MP3 192K)
- **TikTok** — video with or without watermark, or audio
- **Twitch** — clips
- **Library Ready** — audio download with full metadata: title, artist, high-res artwork (iTunes), synced lyrics (LRClib), embedded ID3 tags
- Local download history (SQLite)
- In-app update notifications
- 4 languages: English, Français, Español, Português

---

## Download

| Platform | Architecture | Status |
| -------- | ------------ | ------ |
| macOS | Apple Silicon | ✅ Available |
| macOS | Intel (x86_64) | ⚠️ Deprecated (Rosetta) |
| Windows | x64 | ✅ Available |
| Linux | x64 | ✅ Available |

→ **[Download latest release](https://github.com/DestroyCom/Stroygetter-Native/releases/latest)**

**Android** — StroyGetter Native is desktop-only. For Android, these open-source alternatives are recommended:

- [YTDLnis](https://github.com/deniscerri/ytdlnis) — feature-rich, supports many platforms
- [Seal](https://github.com/junkfood02/Seal) — clean UI, yt-dlp powered

> **macOS**: if macOS blocks the app ("unidentified developer"), right-click → Open, or run in terminal:

```bash
xattr -d com.apple.quarantine /Applications/StroyGetter.app
```

---

## Verifying binaries

All executables are built via GitHub Actions from this repository — the source code is exactly what you see here.

### SHA-256 checksums

Each release includes a `SHA256SUMS.txt` file. Verify with:

```bash
# macOS / Linux
shasum -a 256 -c SHA256SUMS.txt

# Windows (PowerShell)
Get-FileHash StroyGetter_x64-setup.exe -Algorithm SHA256
```

### GitHub Attestations (SLSA provenance)

Every artifact is cryptographically attested via [GitHub Attestations](https://docs.github.com/en/actions/security-guides/using-artifact-attestations), proving it was produced by this repo's CI from a specific commit.

```bash
# Requires GitHub CLI
gh attestation verify <downloaded-file> --repo DestroyCom/Stroygetter-Native
```

---

## Tech stack

| Layer    | Technology                             |
| -------- | -------------------------------------- |
| Shell    | Tauri v2 (~20 MB bundle, not Electron) |
| Backend  | Rust                                   |
| Frontend | React 18 + Vite 5 + TypeScript         |
| UI       | shadcn/ui + Tailwind CSS v4            |
| Local DB | SQLite (rusqlite bundled)              |
| Download | yt-dlp + ffmpeg (bundled sidecars)     |
| Metadata | iTunes Search API + LRClib             |

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org) 20+
- [Rust](https://rustup.rs) stable
- Sidecar binaries in `src-tauri/binaries/` (see below)

### Get sidecars (macOS Apple Silicon)

```bash
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos \
  -o src-tauri/binaries/yt-dlp-aarch64-apple-darwin
chmod +x src-tauri/binaries/yt-dlp-aarch64-apple-darwin

brew install ffmpeg
cp $(which ffmpeg) src-tauri/binaries/ffmpeg-aarch64-apple-darwin
```

### Run in dev

```bash
npm install
npm run tauri dev
```

### Production build

```bash
npm run tauri build
```

---

## Releasing

Releases are fully managed through GitHub Actions.

1. Go to **Actions → Bump version** → click "Run workflow"
2. Pick `patch` / `minor` / `major` and an optional prerelease suffix (e.g. `beta.1`)
3. The tag is created → 4-platform build triggers automatically → a draft release is created on GitHub
4. Review the artifacts then publish the release manually

---

## Links

- Website: [stroygetter.fr](https://stroygetter.fr)
- Portfolio: [portfolio.stroyco.eu](https://portfolio.stroyco.eu)
- Bug reports: [Issues](https://github.com/DestroyCom/Stroygetter-Native/issues)
