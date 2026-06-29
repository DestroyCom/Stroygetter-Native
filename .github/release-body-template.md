## Verification

Built from commit `$SHORT_SHA` via [GitHub Actions]($RUN_URL).

| Method | How to verify |
|--------|---------------|
| SHA-256 | Download `SHA256SUMS-<platform>.txt` from this release, run `shasum -a 256 -c` |
| SLSA provenance | `gh attestation verify <file> --repo $REPO` |
| GPG signature | Download `.asc` file, run `gpg --verify <file>.asc <file>` |
| VirusTotal | See scan links below |

See [SECURITY.md](https://github.com/$REPO/blob/main/SECURITY.md) for full instructions.
