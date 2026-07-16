# Platform Support

This page describes the current ScriptCut alpha support boundary. It is intentionally specific so creators can choose the right download before spending time on setup.

| Platform | Current status | Distribution | Notes |
| --- | --- | --- | --- |
| macOS Apple Silicon (arm64) | Verified alpha path | GitHub Release DMG | Portable FFmpeg/FFprobe is bundled and verified inside the packaged app. A local Python 3.10-3.12 runtime is still needed for the backend. |
| macOS Intel (x64) | Preparation supported, release not yet published | Source / maintainer build | Build and validate on a native Intel Mac with a matching x64 FFmpeg bundle before publishing an Intel DMG. |
| Windows | Source development only | No public installer | Do not treat the current NSIS config as a supported release until packaging, FFmpeg, and export have been verified on Windows. |
| Linux | Source development only | No public installer | Do not treat the current AppImage config as a supported release until packaging, FFmpeg, and export have been verified on Linux. |
| Browser at `localhost:5173` | Development and testing only | Local dev server | Browser mode can upload media and download exports, but it does not provide the desktop app's native file access or autosave workflow. |

## What The Desktop Alpha Includes

- Electron desktop application.
- Local FastAPI backend source.
- Portable FFmpeg and FFprobe for the matching macOS architecture.
- Export preflight and a caption capability check.

## Current Alpha Prerequisite

The desktop alpha does not yet bundle a complete Python runtime and machine-learning dependency set. It uses a compatible local Python 3.10-3.12 runtime to run transcription and editing. Python 3.11 is the recommended option.

The first-run setup assistant checks this requirement and links to a recovery path. This is a release constraint, not an optional feature.

## Caption Delivery

Each release records whether its FFmpeg bundle can render ASS subtitles. When it can, creator captions are burned into the exported video. When it cannot, ScriptCut uses the tested video plus `.srt` sidecar fallback. The export panel shows the actual behavior before export.

## Maintainer Release Check

Run this on the target Mac before creating a public alpha:

```bash
npm run release:ffmpeg
npm run release:platform
```

The release flow then packages the matching architecture, verifies the FFmpeg bundle inside the Electron app, and records architecture and caption capability in the release manifest.
