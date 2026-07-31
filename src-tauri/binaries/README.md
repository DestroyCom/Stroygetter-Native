# Place yt-dlp, ffmpeg and bgutil-pot sidecars here

Non versionnés (voir `.gitignore`) — téléchargés automatiquement par le CI (`.github/workflows/release.yml`).
Pour un build local sur Apple Silicon :

```bash
# Run this block from the repository root.
curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos \
  -o src-tauri/binaries/yt-dlp-aarch64-apple-darwin
chmod +x src-tauri/binaries/yt-dlp-aarch64-apple-darwin

npm ci
TAURI_TARGET=aarch64-apple-darwin node scripts/copy-verified-ffmpeg.cjs \
  src-tauri/binaries/ffmpeg-aarch64-apple-darwin
bash scripts/verify-macos-ffmpeg.sh \
  src-tauri/binaries/ffmpeg-aarch64-apple-darwin

curl -fsSL https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs/releases/latest/download/bgutil-pot-macos-aarch64 \
  -o src-tauri/binaries/bgutil-pot-aarch64-apple-darwin
chmod +x src-tauri/binaries/bgutil-pot-aarch64-apple-darwin
```
