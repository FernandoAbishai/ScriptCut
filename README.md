# ScriptCut

Open-source local-first AI video editor. Edit videos by editing the transcript.

[![Electron](https://img.shields.io/badge/Electron-desktop-47848F)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-UI-61DAFB)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-backend-009688)](https://fastapi.tiangolo.com/)
[![WhisperX](https://img.shields.io/badge/WhisperX-transcription-7057ff)](https://github.com/m-bain/whisperX)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-video-007808)](https://ffmpeg.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

ScriptCut is a maintained fork of CutScript focused on Apple Silicon reliability, 9Router support, and creator-first local workflows.

Turn raw recordings into clean clips:

- delete words -> cut the video
- remove filler words -> tighten the edit
- generate captions -> export social-ready clips
- use local or cloud AI -> keep control of your workflow

Built with Electron, React, FastAPI, WhisperX, FFmpeg, and local/cloud LLM integrations.

<img width="1034" height="661" alt="ScriptCut screenshot" src="https://github.com/user-attachments/assets/b1ed9505-792e-42ca-bb73-85458d0f02a5" />

## Why ScriptCut

Most video editors force creators to scrub timelines. ScriptCut starts from the transcript, so podcasts, interviews, tutorials, and Shorts edits feel closer to editing text.

- **Text-based cuts:** select transcript words and remove the matching video segment.
- **AI cleanup:** detect filler words and verbal hesitations.
- **Clip discovery:** ask AI to suggest promising short-form segments.
- **Caption export:** generate word-level captions for polished clips.
- **Local-first workflow:** run the editor and backend on your machine.
- **Flexible AI providers:** use Ollama, OpenAI, Claude, or 9Router.

## Best For

- podcast editing
- YouTube Shorts and TikTok clips
- interview cleanup
- tutorial trimming
- captioned social video
- creators who want a local-first Descript alternative

## Keywords

`video-editor` `ai-video-editor` `text-based-video-editing` `descript-alternative` `whisperx` `ffmpeg` `electron` `react` `fastapi` `local-first` `creator-tools` `captions` `podcast-editing` `shorts-editor`

## Relationship to CutScript

ScriptCut began as a fork/continuation of DataAnts-AI/CutScript.

This version focuses on:

- Apple Silicon macOS setup
- Python 3.10-3.12 compatibility
- 9Router support
- improved backend startup
- creator-oriented local-first workflows

## Architecture

- **Electron + React** desktop app with Tailwind CSS
- **FastAPI** Python backend
- **WhisperX / Whisper** transcription pipeline
- **FFmpeg** for video and audio processing
- **Ollama / OpenAI / Claude / 9router** for AI features

## Apple Silicon Status

This version has been verified on Apple Silicon macOS for:

- backend startup via `npm run dev:backend`
- frontend production build
- health checks on `http://127.0.0.1:8642/health`
- transcription requests on both CPU and MPS paths

Important runtime notes:

- Use Python `3.10` to `3.12`
- Python `3.11` is the recommended Apple Silicon setup
- Python `3.13` is not a supported runtime for the current transcription dependency stack
- The backend launcher now auto-selects a compatible local virtualenv or interpreter

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.10 to 3.12
- FFmpeg in `PATH`
- Optional: Ollama for local AI features

### macOS Setup

```bash
brew install ffmpeg
python3.11 -m venv .venv
source .venv/bin/activate
```

If you want to force a specific interpreter, set:

```bash
export SCRIPTCUT_PYTHON_PATH=/absolute/path/to/python
```

`CUTSCRIPT_PYTHON_PATH` is still supported for legacy setups, but `SCRIPTCUT_PYTHON_PATH` is preferred.

### Install

```bash
# Root dependencies
npm install

# Frontend dependencies
cd frontend && npm install && cd ..

# Backend dependencies
source .venv/bin/activate
cd backend && python -m pip install -r requirements.txt && cd ..
```

### Run

```bash
npm run dev
```

That starts backend, frontend, and Electron together.

If you want to verify the backend separately:

```bash
npm run dev:backend
curl -s http://127.0.0.1:8642/health
```

Expected response:

```json
{"status":"ok"}
```

## Project Structure

```text
scriptcut/
├── electron/
├── frontend/
├── backend/
└── shared/
```

## Features

| Feature | Status |
|---------|--------|
| Word-level transcription | Done |
| Text-based video editing | Done |
| Undo/redo | Done |
| Waveform timeline | Done |
| FFmpeg stream-copy export | Done |
| FFmpeg re-encode export | Done |
| AI filler word removal | Done |
| AI clip creation | Done |
| Ollama + OpenAI + Claude + 9router | Done |
| Word-level captions | Done |
| Caption burn-in on export | Done |
| Studio Sound | Done |
| Speaker diarization | Done |
| Project save/load (`.scriptcut`, legacy `.aive`/`.cutscript`) | Done |
| AI background removal | Planned |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Play / Pause |
| J / K / L | Reverse / Pause / Forward |
| ← / → | Seek ±5 seconds |
| Delete | Delete selected words |
| Ctrl+Z / Cmd+Z | Undo |
| Ctrl+Shift+Z / Cmd+Shift+Z | Redo |
| Ctrl+S / Cmd+S | Save project |
| Ctrl+E / Cmd+E | Export |
| ? | Shortcut cheatsheet |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/transcribe` | Transcribe media |
| POST | `/export` | Export edited video |
| POST | `/ai/filler-removal` | Detect filler words |
| POST | `/ai/create-clip` | Suggest clips |
| GET | `/ai/ollama-models` | List local Ollama models |
| POST | `/ai/9router-models` | List models exposed by 9Router |
| POST | `/captions` | Generate captions |
| POST | `/audio/clean` | Noise reduction |
| GET | `/audio/capabilities` | Audio processing availability |

## License

MIT License. See [LICENSE](LICENSE).

See [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md) for original CutScript attribution.
