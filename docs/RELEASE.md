# ScriptCut Release Guide

This guide is for preparing a desktop release from the repository.

## Current Release Status

ScriptCut is currently distributed from source. The supported user path is:

```bash
npm run setup
npm run doctor
npm run dev
```

That starts the local backend, frontend, and Electron desktop app.

## Release Checklist

Run these checks before creating a release:

```bash
npm run doctor
npm run lint
npm run build:frontend
npm run smoke:backend
python -m compileall -q backend
```

For a fuller desktop gate, run:

```bash
npm run qa:desktop
```

When packaging changes are included, run:

```bash
npm run qa:desktop:package
```

Check app identity, icon, signing, and notarization readiness:

```bash
npm run release:trust
```

Use strict mode on the machine that will publish the final public release:

```bash
npm run release:trust -- --strict
```

Then verify the creator workflow manually:

- Open the Electron desktop app with `npm run dev`.
- Open a local video file.
- Transcribe with the selected engine.
- Delete a few words and preview edited playback.
- Export a source-frame MP4.
- Export a vertical shorts MP4 with captions.
- Create at least one clip draft and export it.
- Save a `.scriptcut` project and reopen it.

Use the detailed checklist in [Desktop QA](./DESKTOP_QA.md) for release candidates.

## macOS DMG Build

Prepare a local alpha release package:

```bash
npm run release:alpha
```

That command runs desktop package QA, builds the macOS DMG, writes `dist/release-alpha/SHA256SUMS.txt`, and writes `dist/release-alpha/RELEASE_NOTES.md`.

The command also runs `npm run release:trust`. Missing signing or notarization credentials are warnings for local alpha drafts, but should be resolved before publishing broadly.

Build a local macOS DMG:

```bash
npm run dist:mac
```

The generated installer will be written under `dist/`.

Use `npm run dist:dir` when you only need an unpacked app bundle for local QA.

## GitHub Release Draft

Use this format for the first public alpha release:

Title:

```text
ScriptCut v0.1.0-alpha
```

Description:

```text
ScriptCut is an open-source, local-first desktop video editor for creators.

Highlights:
- Edit video by editing transcript text
- Export source, square, and vertical shorts clips
- Burn in creator captions
- Package clip titles, captions, descriptions, hashtags, and hook frames
- Use optional AI helpers while keeping media local

Install:
1. Download the macOS DMG attached to this release.
2. Open ScriptCut.
3. Run the first-launch checks and follow any dependency prompts.

Status:
This is an alpha build. Keep original media and project backups.
```

Attach:

- macOS `.dmg`
- `dist/release-alpha/SHA256SUMS.txt`
- short demo video or screenshot, when available

After `npm run release:alpha`, the script prints a `gh release create ... --draft` command. Review the generated release notes before publishing.

## Signing And Notarization

The alpha release flow can prepare a draft DMG without Apple credentials, but public macOS distribution should be signed and notarized.

Run:

```bash
npm run release:trust
```

Expected alpha-draft results:

- App icon and package metadata should be `OK`.
- Developer ID, signing certificate, and notarization entries may be `WARN` on machines without Apple Developer credentials.

Expected public-release results:

```bash
npm run release:trust -- --strict
```

Strict mode should pass on the release machine before publishing broadly.

Supported signing inputs:

- `CSC_LINK` and `CSC_KEY_PASSWORD` for a certificate file.
- `CSC_NAME` when the certificate is already installed in the signing keychain.

Supported notarization inputs:

- `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`.
- Or `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`.

## Notes

- Python 3.11 is the recommended runtime for local development.
- FFmpeg must be available for exports.
- Parakeet TDT v3 requires optional NVIDIA NeMo ASR dependencies.
- Browser mode at `localhost:5173` is for development. The desktop app is the intended user version.
- Public macOS releases should be signed and notarized with Apple Developer credentials.
