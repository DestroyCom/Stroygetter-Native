# Security & Binary Verification

## How releases are verified

Every release artifact goes through four layers of verification:

| Method | What it proves | Cost |
|--------|---------------|------|
| SHA-256 checksums | File was not corrupted in transit | Free |
| GitHub Attestations (SLSA) | Binary was built by this repo's CI from a specific commit | Free |
| GPG signature | Maintainer personally signed the release | Free |
| VirusTotal scan | 70+ antivirus engines found nothing malicious | Free |

---

## Verifying a download

### 1. SHA-256 checksum

Download `SHA256SUMS-<platform>.txt` from the release page alongside the installer.

```bash
# macOS / Linux
shasum -a 256 -c SHA256SUMS-aarch64-apple-darwin.txt

# Windows (PowerShell)
Get-FileHash StroyGetter_aarch64-setup.exe -Algorithm SHA256
# Compare the hash to the value in SHA256SUMS-x86_64-pc-windows-msvc.txt
```

### 2. GitHub Attestation

Requires the [GitHub CLI](https://cli.github.com).

```bash
gh attestation verify StroyGetter.dmg --repo DestroyCom/Stroygetter-Native
```

A valid attestation confirms the file was produced by this repo's Actions workflow, tied to a specific commit SHA.

### 3. GPG signature

Download the `.asc` file alongside the installer from the release page.

```bash
# Import the public key (one-time setup) — pick any of these:
curl https://github.com/DestroyCom.gpg | gpg --import
# or from the repo:
curl https://raw.githubusercontent.com/DestroyCom/Stroygetter-Native/main/docs/stroygetter-releases.asc | gpg --import
# or from keyserver (after upload):
gpg --keyserver keys.openpgp.org --recv-keys 6C1D622641F44493

# Verify the signature
gpg --verify StroyGetter.dmg.asc StroyGetter.dmg
```

---

## GPG key setup (maintainers only)

Run this once locally to generate and export the signing key.

```bash
# Generate a dedicated signing key (no expiry for a project key is fine,
# or set one and rotate — your call)
gpg --full-generate-key
# Choose: (1) RSA and RSA, 4096 bits, 0 = no expiration
# Name: StroyGetter Releases
# Email: your-email@example.com

# Key ID: 6C1D622641F44493

# Export private key (base64 — goes into GitHub secret GPG_PRIVATE_KEY)
gpg --export-secret-keys --armor 6C1D622641F44493 | base64

# Public key is committed at docs/stroygetter-releases.asc
# Also upload to keyserver:
gpg --keyserver keys.openpgp.org --send-keys 6C1D622641F44493
```

### GitHub secrets to configure

Go to **Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Value |
|-------------|-------|
| `RELEASE_TOKEN` | Personal Access Token with `contents: write` (needed by bump workflow) |
| `GPG_PRIVATE_KEY` | Base64 output of `gpg --export-secret-keys --armor \| base64` |
| `GPG_PASSPHRASE` | Passphrase you set when generating the key |
| `VT_API_KEY` | VirusTotal API key (free at virustotal.com, no credit card) |

`GPG_PRIVATE_KEY` and `VT_API_KEY` are optional — the release workflow still runs without them (checksums and GitHub Attestations always run).

---

## Reporting a vulnerability

Open a [GitHub Issue](https://github.com/DestroyCom/Stroygetter-Native/issues) marked **[SECURITY]**.
For sensitive disclosures, contact via the portfolio: [portfolio.stroyco.eu](https://portfolio.stroyco.eu).
