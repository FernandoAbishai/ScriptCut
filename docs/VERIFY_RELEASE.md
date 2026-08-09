# Verify a ScriptCut public release

Use the files from the official [ScriptCut Releases feed](https://github.com/FernandoAbishai/ScriptCut/releases). The public alpha is unsigned and not notarized; verification confirms the file and its build provenance, not that the software is bug-free or vulnerability-free.

## Basic checksum

Keep the DMG, `SHA256SUMS.txt`, `release-manifest.json`, and release notes in one directory, then run:

```bash
shasum -a 256 -c SHA256SUMS.txt
```

The manifest records the exact release tag, commit, DMG filename, byte count, and SHA-256. The checksum must match the DMG with the tag in its filename.

## Advanced provenance verification

With GitHub CLI installed, verify the DMG and manifest against the official repository and workflow:

```bash
gh attestation verify ScriptCut-v0.1.0-alpha.3-arm64.dmg \
  -R FernandoAbishai/ScriptCut \
  --signer-repo FernandoAbishai/ScriptCut \
  --signer-workflow FernandoAbishai/ScriptCut/.github/workflows/release-unsigned.yml \
  --source-digest <commit-sha>

gh attestation verify release-manifest.json \
  -R FernandoAbishai/ScriptCut \
  --signer-repo FernandoAbishai/ScriptCut \
  --signer-workflow FernandoAbishai/ScriptCut/.github/workflows/release-unsigned.yml \
  --source-digest <commit-sha>
```

Replace the example DMG name and `<commit-sha>` with the values in `release-manifest.json`. The expected signer repository, workflow, source commit, and Sigstore-backed attestation references are also recorded in the manifest. Attestation verifies published build provenance and does not prove that the application is free of bugs or vulnerabilities.

## First launch

Because the public alpha is unsigned and not notarized, macOS may block it. For a DMG downloaded from the official Releases feed, use **System Settings → Privacy & Security → Open Anyway** and confirm the prompt. Do not disable Gatekeeper or remove quarantine attributes.
