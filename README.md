# stroygetter-native

A Tauri v2 desktop/mobile app for downloading videos from YouTube, TikTok, and Twitch (clips). Built with React 18 + Vite on the frontend and Rust on the backend, using yt-dlp and ffmpeg as bundled sidecars. Targets Windows, macOS, and Android.

---

## Prerequisites

- **Rust** (stable, via rustup) — https://rustup.rs
- **Node.js** >= 18
- **Tauri CLI v2** — `cargo install tauri-cli --version "^2"`
- **yt-dlp** and **ffmpeg** binaries placed in `src-tauri/binaries/` with target-triple suffix
  - Example: `yt-dlp-aarch64-apple-darwin`, `ffmpeg-aarch64-apple-darwin`
  - See [Tauri sidecar docs](https://tauri.app/v2/guides/distribution/sidecar/) for naming conventions

---

## Install

```bash
make install
# or manually:
npm install
cd src-tauri && cargo fetch
```

---

## Run (dev)

```bash
make dev
# or:
npm run tauri dev
```

---

## Test

```bash
make test           # frontend + rust
make test-frontend  # npm test only
make test-rust      # cargo test only
```

---

## Build

```bash
make build
# or:
npm run tauri build
```

---

## Project structure

```
src/              React frontend (views, components, i18n, lib)
src-tauri/        Rust backend (Tauri commands, SQLite, sidecar runners)
docs/ai-context.md  Full architecture and design context
Makefile          Dev workflow shortcuts
```

See [`docs/ai-context.md`](docs/ai-context.md) for the full architecture, command list, type definitions, and known stubs.

---

## Known limitations (MVP 1)

- YouTube Music metadata (`fetchYouTubeMusicMetadata`) is a stub — not yet ported
- Custom download directory in Settings is UI-only — not passed to the Rust backend
- Sidebar history does not refresh automatically on all download paths
- App version is hardcoded in Settings.tsx
- Twitch VODs are disabled; clips only
- TikTok photo galleries are not supported (no gallery-dl binary for Android)
