# Install ScriptCut

ScriptCut is a local-first Electron app with a React frontend and FastAPI backend.

## Recommended Alpha Install

For non-technical use, install the desktop app from the latest GitHub Release:

1. Open the [latest release](https://github.com/FernandoAbishai/ScriptCut/releases/latest).
2. Download the **macOS Apple Silicon (arm64)** `.dmg`.
3. Open ScriptCut and follow the first-run setup assistant.

The desktop alpha includes portable FFmpeg and FFprobe for export. It still uses a compatible local Python 3.10-3.12 runtime and ScriptCut backend dependency set for editing, so the first-run assistant may ask you to install Python once. Use the [First Export Guide](./FIRST_EXPORT.md) for the shortest path, or install Python from [python.org for macOS](https://www.python.org/downloads/macos/).

Read [Platform Support](./PLATFORM_SUPPORT.md) before downloading. If a DMG is not attached yet, use the source setup below.

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
