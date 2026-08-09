# ScriptCut Release Guide

This guide is for preparing a desktop release from the repository.

## Current Release Status

Phase 3B.5A prepares an internal, unsigned, self-contained macOS arm64 release candidate. It does not create a tag, GitHub Release, signed artifact, or notarized distribution. Source development is still supported with:

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
npm run release:ffmpeg
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

Check unsigned candidate readiness:

```bash
npm run release:trust:candidate
```

Credentialed signed-mode checks are reserved for Phase 3B.5B and fail closed when credentials are absent:

```bash
npm run release:trust:signed
```

Then verify the creator workflow manually:

- Open the Electron desktop app with `npm run dev`.
- Open a local video file.
- Transcribe with the selected engine.
- Delete a few words and preview edited playback.
- Export a source-frame MP4.
- Export a vertical shorts MP4 with captions. Confirm the setup check and release manifest agree on whether captions are burned in or delivered as a sidecar `.srt` file.
- Create at least one clip draft and export it.
- Save a `.scriptcut` project and reopen it.

Use the detailed checklist in [Desktop QA](./DESKTOP_QA.md) for release candidates.

## macOS DMG Build

Prepare the self-contained arm64 release candidate:

```bash
npm run release:rc:arm64
```

That command prepares portable Python, the pinned core pack, bundled FFmpeg/FFprobe, the frontend, and the release-configured Electron app. It runs the packaged runtime, backend, optional-capability, DMG, signing-readiness, and release-metadata gates, then writes `dist/release-candidate/SHA256SUMS.txt`, `dist/release-candidate/release-manifest.json`, and `dist/release-candidate/RELEASE_NOTES.md`.

Run the extended native model gate explicitly when requested:

```bash
npm run release:rc:arm64 -- --real-model
```

The release-candidate command supports exactly native macOS arm64. It disables certificate auto-discovery and removes signing/notarization credentials from its build environment, so a local Apple Development certificate cannot be selected accidentally. The candidate is unsigned and not suitable for public distribution.

Build a local macOS DMG:

```bash
npm run dist:mac
```

The generated installer will be written under `dist/`.

Use `npm run dist:dir` when you only need an unpacked app bundle for local QA.

## Future GitHub Release

The candidate phase does not create or mutate a GitHub Release. A future signed/notarized alpha should be explicitly approved as a prerelease and must use the credentialed 3B.5B flow.

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
- Burn in creator captions when the bundled FFmpeg supports ASS subtitles; otherwise export a matching `.srt` caption file
- Package clip titles, captions, descriptions, hashtags, and hook frames
- Use optional AI helpers while keeping media local

Install:
1. Download the macOS Apple Silicon (arm64) DMG attached to this release.
2. Open ScriptCut.
3. Run the first-launch checks and follow any dependency prompts.

Status:
This is an alpha build. Keep original media and project backups.
```

Attach:

- macOS `.dmg`
- `dist/release-candidate/SHA256SUMS.txt`
- `dist/release-candidate/release-manifest.json`
- short demo video or screenshot, when available

## Signing And Notarization

Candidate mode requires no Apple credentials. It validates explicit Hardened Runtime configuration, minimal entitlements, and native Mach-O inventory without signing or contacting Apple.

Run:

```bash
npm run release:trust:candidate
```

Expected candidate results:

- App icon and package metadata should be `OK`.
- Developer ID and notarization state are reported as safe booleans and are not required.

Signed mode:

```bash
npm run release:trust:signed
```

Signed mode hard-fails without Developer ID and notarization credentials. The signed packaging path is reserved for Phase 3B.5B.

Supported signing inputs:

- `CSC_LINK` and `CSC_KEY_PASSWORD` for a certificate file.
- `CSC_NAME` when the certificate is already installed in the signing keychain.

Supported notarization inputs:

- `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`.
- Or `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`.

## Notes

- Python 3.11 is the recommended runtime for local development.
- The supported arm64 release-candidate path includes its application runtime, core Python pack, and FFmpeg/FFprobe; creators do not install Python, pip, FFmpeg, or a virtual environment for that path.
- Baseline transcription is included and the verified Whisper base model downloads into app-managed storage on first transcription. Once installed, baseline transcription can run without model-network access.
- Optional capabilities may not be included. Do not claim all AI is offline or that all capabilities are bundled.
- Candidate metadata records that transitive runtime wheel hashes are not fully locked; 3B.5A does not claim fully reproducible builds.
- `npm run release:ffmpeg` verifies that FFmpeg/FFprobe execute from the release bundle and packages non-system macOS dylibs. Do not manually copy host FFmpeg executables into a release.
- The bundle manifest records whether the selected FFmpeg supports ASS burn-in captions. Releases without that filter use the tested sidecar `.srt` fallback and must state that in their notes.
- Parakeet TDT v3 requires optional NVIDIA NeMo ASR dependencies.
- Browser mode at `localhost:5173` is for development. The desktop app is the intended user version.
- Public macOS releases should be signed and notarized with Apple Developer credentials.
