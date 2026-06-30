# Install ScriptCut

ScriptCut is a local-first Electron app with a React frontend and FastAPI backend.

## Requirements

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

macOS:

```bash
brew install ffmpeg
```

Linux:

```bash
sudo apt install ffmpeg
```

Windows users should install FFmpeg and ensure `ffmpeg.exe` is available in `PATH`.
