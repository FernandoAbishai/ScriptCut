# Install ScriptCut

ScriptCut is a local-first Electron app with a React frontend and FastAPI backend.

## Recommended Alpha Install

For non-technical use, install the desktop app from the official [GitHub Releases feed](https://github.com/FernandoAbishai/ScriptCut/releases):

1. Open the official ScriptCut Releases feed and choose a prerelease explicitly identified as self-contained for macOS Apple Silicon.
2. Download that tagged **macOS Apple Silicon (arm64)** `.dmg`.
3. Open the DMG, open ScriptCut, and select a video when the app is ready.
4. If macOS blocks the first launch, use **System Settings → Privacy & Security → Open Anyway** after confirming that the DMG came from the official ScriptCut Releases feed.

The supported self-contained public-alpha path bundles portable Python, the pinned core runtime, FFmpeg, and FFprobe. ScriptCut manages the baseline transcription model on first use; creators do not install system Python, pip, FFmpeg, or a virtual environment for a qualifying packaged release. The app uses an ad-hoc code signature for package integrity, but is not signed with Apple Developer ID or notarized, so the macOS approval step above may be required. Older alpha releases may predate this runtime; check the individual release notes and manifest.

Read [Platform Support](./PLATFORM_SUPPORT.md) before downloading. If no qualifying self-contained release is attached yet, use the source setup below.

## Source Development Requirements

- Node.js 18 or newer
- Python 3.10, 3.11, or 3.12
- FFmpeg available in `PATH`
- Optional: Ollama for local AI features

Python 3.11 is the recommended development runtime. Python 3.13 is not supported by the current transcription dependency stack.

## Quick Setup

```bash
npm run setup
npm run doctor
npm run dev
```

`npm run setup` installs root and frontend Node dependencies, creates a local Python virtualenv when needed, and installs backend Python dependencies.

`npm run doctor` checks the local environment without changing it.

## Manual Setup

```bash
npm install
npm install --prefix frontend
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
```

Then run:

```bash
npm run dev
```

## Runtime Selection

The backend launcher searches for a compatible Python runtime in local virtualenvs and common Python commands. To force a runtime:

```bash
export SCRIPTCUT_PYTHON_PATH=/absolute/path/to/python
```

## FFmpeg

ScriptCut desktop releases are intended to include FFmpeg so non-technical users can export without installing command-line tools. If you run from source, install FFmpeg or prepare the local bundle before packaging.

macOS:

```bash
brew install ffmpeg
```

Linux:

```bash
sudo apt install ffmpeg
```

Windows users should install FFmpeg and ensure `ffmpeg.exe` is available in `PATH`.

Release maintainers can create and verify a portable FFmpeg/FFprobe bundle in `build/bin/<platform>-<arch>/` with:

```bash
npm run release:ffmpeg
```
