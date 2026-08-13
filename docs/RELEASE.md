# ScriptCut Release Guide

This guide is for preparing a desktop release from the repository.

## Current Release Status

Phase 4B establishes the explicit release identity contract while preserving the controlled public ad-hoc-signed macOS arm64 distribution path. This guide describes how qualifying public alphas are produced; it does not assert that every historical alpha already has the self-contained runtime. Inspect each release's notes and manifest. The workflow creates no tag or GitHub Release unless explicitly dispatched with publication gates. Apple Developer membership, Developer ID signing, and notarization are optional future enhancements, not prerequisites for the public ad-hoc alpha path. Source development is still supported with:

```bash
npm run setup
npm run doctor
npm run dev
```

That starts the local backend, frontend, and Electron desktop app.

## Current release identity

The current product version is `0.1.0`. The supported public release channel in this implementation is alpha only; the current public prerelease is `v0.1.0-alpha.3`.

The installed application and the public release are intentionally separate identities:

- `package.json.version`, Electron `app.getVersion()`, `CFBundleShortVersionString`, and the renderer product version all represent `productVersion` (`0.1.0`).
- The GitHub tag and public DMG filename represent `releaseTag` (`v0.1.0-alpha.<n>` and `ScriptCut-v0.1.0-alpha.<n>-arm64.dmg`).
- `sourceCommit` is the full 40-character Git SHA recorded in release metadata. Artifact identity is the exact filename, byte count, and SHA-256.

The prerelease tag must not be placed in the package version or macOS short version. `CFBundleVersion` remains the exact Electron Builder-emitted value recorded from each native candidate; Phase 4B does not add a new build counter. Beta, RC, and stable validators/publication are not currently supported; their naming can remain future-compatible.

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

Check ad-hoc candidate readiness:

```bash
npm run release:trust:candidate
```

Credentialed signed-mode checks remain preserved as a future trust path and fail closed when credentials are absent:

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

The release-candidate command supports exactly native macOS arm64. It disables certificate auto-discovery and removes signing/notarization credentials from its build environment, so a local Apple Development certificate cannot be selected accidentally. The candidate uses an ad-hoc code signature for package integrity and is not signed with Apple Developer ID or notarized; it is suitable for the controlled public alpha path after all launchability and provenance gates pass.

Build a local macOS DMG:

```bash
npm run dist:mac
```

The generated installer will be written under `dist/`.

Use `npm run dist:dir` when you only need an unpacked app bundle for local QA.

## Public ad-hoc GitHub prerelease

The dedicated `.github/workflows/release-unsigned.yml` workflow is `workflow_dispatch` only. It builds on a native `macos-14` arm64 runner using the existing `npm run release:rc:arm64` candidate machinery, then stages the exact public DMG, public manifest, notes, checksum, and Sigstore attestation bundles. The resulting app uses an ad-hoc code signature for package integrity; the workflow name and input identifiers retain their existing compatibility names.

Required inputs are `release_tag`, `publish`, `real_model`, and `confirmation`. The tag must be `v<package.version>-alpha.<positive integer>` and must be greater than every existing alpha tag. `publish=false` is the safe dry-run mode: it may create attestations and a workflow artifact whose name includes `dry-run`, but it cannot create a tag, release, commit, or mutate `main`. Publication additionally requires `publish=true`, `real_model=true`, `confirmation=PUBLISH_UNSIGNED_ALPHA`, the workflow ref to be `main`, and a current `origin/main` equal to the dispatched commit. The publish job has contents write permission only, downloads the already verified artifact, creates a GitHub prerelease with `--prerelease --latest=false`, and verifies the exact tag, asset set, and digest after creation. It never rebuilds during publication.

The post-merge closure procedure is a `publish=false` dry-run from current `main`. It is required before any separately authorized public publication and is not performed by this implementation PR.

Title:

```text
ScriptCut v0.1.0-alpha.<n>
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
1. Download the macOS Apple Silicon (arm64) DMG from the official ScriptCut Releases feed.
2. If macOS blocks the ad-hoc-signed first launch, use System Settings → Privacy & Security → Open Anyway.
3. Open ScriptCut and select a video; the baseline model is app-managed and downloaded on first transcription.

Status:
This is an ad-hoc-signed prerelease alpha that is not signed with Apple Developer ID or notarized. Keep original media and project backups.
```

Attach:

- `dist/public-release/ScriptCut-v<version>-alpha.<n>-arm64.dmg`
- `dist/public-release/SHA256SUMS.txt`
- `dist/public-release/release-manifest.json`
- `dist/public-release/RELEASE_NOTES.md`
- `dist/public-release/ScriptCut-v<version>-alpha.<n>-arm64.dmg.sigstore.json`
- `dist/public-release/release-manifest.sigstore.json`

The public release manifest uses schema `scriptcut.release.v2` and records the ad-hoc structural signature, Apple Developer ID, and notarization truth, bundled runtime/core/FFmpeg/model provenance, final DMG SHA-256, release tag, source commit, and the DMG attestation reference. The DMG and manifest are each attested with the official GitHub artifact-attestation action; the workflow artifact bundles are retained for independent verification.

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

Signed mode hard-fails without Developer ID and notarization credentials. The signed packaging path remains a future optional enhancement; this phase does not add credentials, signing keys, or notarization.

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
- Public ad-hoc alpha releases are not signed with Apple Developer ID or notarized. Apple trust may be added later without changing the public provenance and verification contract.
