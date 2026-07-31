# Place yt-dlp, ffmpeg and bgutil-pot sidecars here

Non versionnés (voir `.gitignore`) — téléchargés automatiquement par le CI (`.github/workflows/release.yml`).
Pour un build local sur Apple Silicon :

```bash
curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos \
  -o yt-dlp-aarch64-apple-darwin && chmod +x yt-dlp-aarch64-apple-darwin

npm ci
cp "$(node -e "process.stdout.write(require('ffmpeg-static'))")" \
  ffmpeg-aarch64-apple-darwin
chmod +x ffmpeg-aarch64-apple-darwin
bash scripts/verify-macos-ffmpeg.sh ffmpeg-aarch64-apple-darwin

curl -fsSL https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs/releases/latest/download/bgutil-pot-macos-aarch64 \
  -o bgutil-pot-aarch64-apple-darwin && chmod +x bgutil-pot-aarch64-apple-darwin
```
