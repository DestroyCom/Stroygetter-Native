#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const checksums = require("./ffmpeg-static-sha256.json");
const outputPath = process.argv[2];
const target = process.env.TAURI_TARGET;
const release = "b6.1.1";

if (!target || !outputPath) {
  console.error("Usage: TAURI_TARGET=<target> node scripts/copy-verified-ffmpeg.cjs <output>");
  process.exit(1);
}

const expected = checksums[release]?.[target];
if (!expected) {
  console.error(`No committed ffmpeg checksum exists for ${target} (release ${release})`);
  process.exit(1);
}

const sourcePath = require("ffmpeg-static");
const actual = crypto.createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex");

if (actual !== expected) {
  console.error(`ffmpeg SHA-256 mismatch for ${target}: expected ${expected}, got ${actual}`);
  process.exit(1);
}

fs.copyFileSync(sourcePath, outputPath);
fs.chmodSync(outputPath, 0o755);
console.log(`Copied verified ffmpeg ${release} for ${target} to ${path.resolve(outputPath)}`);
