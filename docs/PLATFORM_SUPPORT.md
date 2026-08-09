# Platform Support

This page describes the ScriptCut support boundary and how to identify a qualifying self-contained public alpha. It is intentionally specific so creators can choose the right download before spending time on setup.

| Platform | Current status | Distribution | Notes |
| --- | --- | --- | --- |
| macOS Apple Silicon (arm64) | Supported self-contained public-alpha path when identified by release notes | GitHub prerelease DMG | Qualifying releases bundle portable Python/core runtime and FFmpeg/FFprobe and record that truth in the manifest. The baseline model is app-managed; no system Python is required. The app uses an ad-hoc code signature but is not signed with Apple Developer ID or notarized, so first-launch approval may be required. |
| macOS Intel (x64) | Preparation supported, release not yet published | Source / maintainer build | Build and validate on a native Intel Mac with a matching x64 FFmpeg bundle before publishing an Intel DMG. |
| Windows | Source development only | No public installer | Do not treat the current NSIS config as a supported release until packaging, FFmpeg, and export have been verified on Windows. |
| Linux | Source development only | No public installer | Do not treat the current AppImage config as a supported release until packaging, FFmpeg, and export have been verified on Linux. |
| Browser at `localhost:5173` | Development and testing only | Local dev server | Browser mode can upload media and download exports, but it does not provide the desktop app's native file access or autosave workflow. |

## What A Qualifying Public Desktop Alpha Includes

- Electron desktop application.
- Bundled portable Python and the pinned core runtime for the packaged baseline path.
- Portable FFmpeg and FFprobe for the matching macOS architecture.
- App-managed baseline Whisper model download and verification on first transcription.
- Export preflight and a caption capability check.
- Public ad-hoc code-signature, Apple Developer ID, and notarization status is recorded in the release manifest and notes.

Creators do not install system Python, pip, FFmpeg, or a virtual environment for a qualifying packaged arm64 alpha. Download only from the official [ScriptCut Releases feed](https://github.com/FernandoAbishai/ScriptCut/releases), and confirm the release notes and manifest identify the self-contained path. Older alpha releases may predate it. If macOS blocks the ad-hoc-signed first launch, use **System Settings → Privacy & Security → Open Anyway**; never disable Gatekeeper or remove quarantine attributes.

## Maintainer Release Check

Run this on the target Mac before creating a public alpha:

```bash
npm run release:ffmpeg
npm run release:platform
```

The release flow then packages the matching architecture, verifies the FFmpeg bundle inside the Electron app, and records architecture and caption capability in the release manifest.

## Maintainer/source development

Source development remains separate from the packaged creator path and requires local Python 3.10-3.12, with Python 3.11 recommended, plus the development dependencies described in [Install ScriptCut](./INSTALL.md).

## Caption Delivery

Each release records whether its FFmpeg bundle can render ASS subtitles. When it can, creator captions are burned into the exported video. When it cannot, ScriptCut uses the tested video plus `.srt` sidecar fallback. The export panel shows the actual behavior before export.
