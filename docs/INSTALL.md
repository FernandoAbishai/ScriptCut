# Install ScriptCut

ScriptCut is a local-first Electron app with a React frontend and FastAPI backend.

## Recommended public beta install

For external beta use, choose the intended public prerelease from the official
[ScriptCut Releases feed](https://github.com/FernandoAbishai/ScriptCut/releases).
Record the exact release/tag you use in the [beta qualification record](./BETA_QUALIFICATION.md).

1. Choose the intended published prerelease from the official feed and download its macOS Apple Silicon (arm64) DMG.
2. Open the DMG, install ScriptCut, and select a workflow when the app is ready.
3. If macOS blocks the first launch, use **System Settings → Privacy & Security → Open Anyway** after confirming that the DMG came from the official ScriptCut Releases feed.

Use the selected release page for its notes, checksums, manifest, and attestations. The feed's published release state is the authority for which public alpha is current. The [external beta contract](./EXTERNAL_BETA.md) defines the supported environment and the [First Export Guide](./FIRST_EXPORT.md) shows the creator workflow.

The supported self-contained public-alpha path bundles portable Python, the pinned core runtime, FFmpeg, and FFprobe. ScriptCut manages the baseline transcription model on first use; creators do not install system Python, pip, FFmpeg, or a virtual environment for a qualifying packaged release. The app uses an ad-hoc code signature for package integrity, but is not signed with Apple Developer ID or notarized, so the macOS approval step above may be required. Older alpha releases may predate this runtime; check the individual release notes and manifest.

An AI provider is not required for the core transcript editing, manual clip, or export path.

Read [Platform Support](./PLATFORM_SUPPORT.md) for the current support matrix. For source development, use the setup below.

## Source Development Requirements

The remaining sections are for contributors running ScriptCut from source; they
are not part of the supported external-beta installation path and do not imply
public Windows, Linux, or Intel Mac distribution.

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
