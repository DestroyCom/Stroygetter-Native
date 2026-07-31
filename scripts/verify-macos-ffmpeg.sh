#!/usr/bin/env bash
set -euo pipefail

ffmpeg_bin="${1:?usage: verify-macos-ffmpeg.sh PATH_TO_FFMPEG}"

if [[ ! -x "$ffmpeg_bin" ]]; then
  echo "FFmpeg sidecar is missing or not executable: $ffmpeg_bin" >&2
  exit 1
fi

echo "Checking FFmpeg sidecar: $ffmpeg_bin"
"$ffmpeg_bin" -hide_banner -version >/dev/null

# A Homebrew build is not portable: its load commands point to the build
# machine's /opt/homebrew/Cellar path. Tauri copies the executable, not the
# Homebrew dependency tree, so accepting one here would ship an app that
# fails before FFmpeg can process its first argument.
if otool -L "$ffmpeg_bin" | grep -Eq '/opt/homebrew/|/usr/local/|/Cellar/'; then
  echo "FFmpeg sidecar contains a machine-local package-manager dependency:" >&2
  otool -L "$ffmpeg_bin" >&2
  exit 1
fi

echo "FFmpeg sidecar is executable and self-contained enough for packaging."
