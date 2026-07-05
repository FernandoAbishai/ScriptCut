# ScriptCut

ScriptCut is a maintained fork of CutScript focused on Apple Silicon reliability, 9Router support, and local-first creator workflows.

Edit videos by editing the transcript:

- delete words -> cut video
- remove filler words -> clean edit
- generate captions -> export clip

Built with Electron, React, FastAPI, WhisperX, FFmpeg, and local/cloud LLM integrations.

<img width="1034" height="661" alt="ScriptCut screenshot" src="https://github.com/user-attachments/assets/b1ed9505-792e-42ca-bb73-85458d0f02a5" />

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
npm run setup
npm run doctor
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
| Edited playback preview | Done |
| Project autosave and startup recovery | Done |
| Non-destructive edit layers | Done |
| FFmpeg stream-copy export | Done |
| FFmpeg re-encode export | Done |
| Job progress, cancellation, logs, retry | Done |
| AI edit plans with review/apply queue | Done |
| AI filler review queue | Done |
| Editable AI clip drafts | Done |
| Ollama + OpenAI + Claude + 9router | Done |
| Word-level captions | Done |
| Caption designer and burn-in export | Done |
| Social presets and reframe controls | Done |
| Studio Sound | Done |
| Speaker diarization | Done |
| Speaker-aware transcript editing | Done |
| Project save/load (`.scriptcut`, legacy `.aive`/`.cutscript`) | Done |
| AI background removal | Done |

Project files are canonical JSON with `schema: "scriptcut.project.v1"` and `version: 1`. Manual saves and autosaves use the same serializer so recovery files are deterministic and migration-ready.

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
| POST | `/jobs/transcribe` | Start transcription job |
| POST | `/export` | Export edited video |
| POST | `/jobs/export` | Start export job |
| GET | `/jobs/{job_id}` | Read job progress, logs, result, or error |
| POST | `/jobs/{job_id}/cancel` | Request job cancellation |
| POST | `/jobs/{job_id}/retry` | Retry a failed or canceled job |
| POST | `/ai/filler-removal` | Detect filler words |
| POST | `/jobs/ai/filler-removal` | Detect filler words as a job |
| POST | `/ai/create-clip` | Suggest clips |
| POST | `/jobs/ai/create-clip` | Suggest clips as a job |
| POST | `/ai/clip-metadata` | Suggest title, hook, caption, and hashtags |
| POST | `/jobs/ai/clip-metadata` | Suggest clip metadata as a job |
| POST | `/ai/edit-plan` | Create a reviewable AI edit plan from an instruction |
| POST | `/jobs/ai/edit-plan` | Create an AI edit plan as a job |
| GET | `/ai/ollama-models` | List local Ollama models |
| POST | `/ai/9router-models` | List models exposed by 9Router |
| POST | `/captions` | Generate captions |
| POST | `/audio/clean` | Noise reduction |
| GET | `/audio/capabilities` | Audio processing availability |
| GET | `/background/capabilities` | Background removal availability |

Job statuses are `queued`, `running`, `canceling`, `succeeded`, `failed`, and `canceled`. A canceled job is retryable only after it leaves `canceling` and reaches final `canceled`.

## QA

Run `npm run smoke:backend` for fast backend smoke checks covering sidecar caption export settings, deleted-word caption filtering, and job cancellation lifecycle behavior. Run it alongside `npm run lint`, `npm run build`, and `python -m compileall -q backend` before release-oriented changes.

## Contributing

Start with [docs/INSTALL.md](docs/INSTALL.md), [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), and [CONTRIBUTING.md](CONTRIBUTING.md). Use [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) when setup or runtime checks fail.

## License

MIT License. See [LICENSE](LICENSE).

See [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md) for original CutScript attribution.
