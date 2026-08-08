# ScriptCut

<p align="center">
  <img src="frontend/public/brand/scriptcut-wordmark.svg" width="360" alt="ScriptCut" />
</p>

> Edit videos like documents. Turn long-form recordings into polished videos and social clips, locally on your machine.

ScriptCut is an open-source, local-first desktop video production tool for YouTube creators, podcasters, educators, founders, interview creators, streamers, and anyone repurposing spoken recordings.

Its creator workflow is simple:

```text
Choose a video → edit the transcript → review → export
```

ScriptCut is different from a cloud-first editor because local processing is the default path, AI helpers are optional, and project files stay creator-owned. The current product is a desktop alpha: it already supports the core editing and export workflow, while installation and platform support continue to mature.

See [the Product Vision](docs/PRODUCT_VISION.md) for the canonical product direction.

<img width="1034" height="661" alt="ScriptCut screenshot" src="https://github.com/user-attachments/assets/b1ed9505-792e-42ca-bb73-85458d0f02a5" />

## Start Here

The intended creator path is the **ScriptCut desktop app**:

1. Download the [latest GitHub Release](https://github.com/FernandoAbishai/ScriptCut/releases/latest).
2. Download the macOS Apple Silicon `.dmg`.
3. Launch ScriptCut and follow the first-run setup assistant.
4. Choose **Edit full video** or **Create a short**, then select local media.
5. Review the transcript and export when the preflight panel is ready.

For a short, non-technical walkthrough, read the [First Export Guide](docs/FIRST_EXPORT.md).

If a release asset is not available, ScriptCut can be run from source using the contributor setup below. The complete release process is documented in [docs/RELEASE.md](docs/RELEASE.md).

## The two primary workflows

### Edit a Video

Open a video or audio file, transcribe it locally, edit the word-level transcript, preview the result, and export. You can delete, restore, mute, or hide selected words from captions. AI edit plans and filler-word suggestions are reviewable helpers; they do not replace editorial approval.

See [docs/USER_GUIDE.md](docs/USER_GUIDE.md) for the detailed creator walkthrough.

### Create Clips

Open a long-form recording, find or create candidate moments, review and trim drafts, package metadata and hook-frame notes, then export approved clips. The current app supports AI clip suggestions, editable drafts, social metadata, vertical/square output, captions, readiness checks, and batch export. Discovery and packaging still depend on review, local setup, and—when selected—an available AI provider.

## Current alpha support

The current downloadable alpha is verified for **macOS Apple Silicon (arm64)**. A matching desktop release includes portable FFmpeg/FFprobe for local export.

This is not yet a fully self-contained installer: editing and transcription still use a compatible local Python 3.10–3.12 runtime and the ScriptCut backend dependency set. Python 3.11 is the recommended option on Apple Silicon. The setup assistant reports missing requirements at launch.

See [Platform Support](docs/PLATFORM_SUPPORT.md) for the current support matrix. macOS Intel preparation is available for maintainers, while Windows and Linux are source-development paths rather than verified public installers. The browser page at `localhost:5173` is for development and testing; it does not provide the desktop app’s native file access or the same autosave workflow.

In browser mode, media is uploaded to the local backend for transcription and export, and finished files are offered as downloads. Use the desktop app for native file access, persistent export folders, autosave, and Finder reveal actions.

## What is available today

- Word-level transcription through Parakeet TDT v3, WhisperX, or Whisper when the selected local engine is installed.
- Transcript-based editing with edited playback, undo/redo, waveform/timeline synchronization, and speaker-aware operations when speaker labels are available.
- AI-assisted edit plans, filler-word detection with review decisions, clip suggestions, editable clip drafts, clip readiness scoring, and generated clip metadata.
- Source, vertical, and square exports with creator presets, reframe controls, optional Studio Sound audio cleanup, and optional background removal.
- Word-level captions with caption styling. Depending on the FFmpeg build, captions are burned into the video or delivered as a matching `.srt` sidecar file; the export preflight shows the actual result.
- Approved-clip batch export with per-draft progress, retry state, and a batch manifest in the desktop workflow.
- `.scriptcut` project save/load, recent projects, autosave, recovery snapshots, and compatibility with legacy `.aive` and `.cutscript` files.

Some capabilities depend on optional local packages, model downloads, provider configuration, or the capabilities of the packaged FFmpeg build. The setup assistant and export preflight are the source of truth for a particular machine.

## Local-first and AI behavior

The desktop app runs an Electron shell with a local React interface, a local FastAPI backend, and FFmpeg for media work. Transcription and export use local tools by default where available.

AI features can use local Ollama or configured OpenAI, Claude, or 9Router providers. Selecting an external provider can send the requested transcript or prompt context to that provider. ScriptCut does not require AI for core transcript editing or export, and this README does not make a blanket privacy claim beyond the configured workflow.

## Contributor quick start

These steps are for running ScriptCut from the repository.

### Prerequisites

- Node.js 18+
- Python 3.10 to 3.12
- FFmpeg in `PATH` for source development. Desktop release builds include a bundled FFmpeg when prepared with `npm run release:ffmpeg`.
- Optional: Ollama for local AI features

Python 3.11 is recommended on Apple Silicon. Python 3.13 is not supported by the current transcription dependency stack.

### macOS setup

```bash
brew install ffmpeg
python3.11 -m venv .venv
source .venv/bin/activate
```

To force a specific interpreter:

```bash
export SCRIPTCUT_PYTHON_PATH=/absolute/path/to/python
```

`CUTSCRIPT_PYTHON_PATH` is still supported for legacy setups, but `SCRIPTCUT_PYTHON_PATH` is preferred.

### Install and run

```bash
npm run setup
npm run doctor
npm run dev
```

This starts the local backend, Vite frontend, and Electron desktop app together. For local desktop packaging, run:

```bash
npm run dist:mac
```

That creates a macOS DMG under `dist/`. See [docs/INSTALL.md](docs/INSTALL.md), [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), and [CONTRIBUTING.md](CONTRIBUTING.md) for technical setup and contribution guidance.

To verify the backend separately:

```bash
npm run dev:backend
curl -s http://127.0.0.1:8642/health
```

Expected response:

```json
{"status":"ok"}
```

## Project structure and technical reference

```text
scriptcut/
├── electron/   # desktop shell, IPC, and local backend lifecycle
├── frontend/   # React/Vite creator interface
├── backend/    # FastAPI transcription, AI, caption, audio, and export services
└── shared/     # project schema and shared contracts
```

The main technical pieces are Electron + React, a local FastAPI backend, Parakeet/WhisperX/Whisper transcription, and FFmpeg export. The local API includes health, transcription, export, job lifecycle, AI helper, caption, audio, and background-capability endpoints. See the backend routers for the current endpoint contract.

Project files are canonical JSON with `schema: "scriptcut.project.v1"` and `version: 1`. Manual saves and autosaves use the same serializer, with compatibility for legacy `.aive` and `.cutscript` files.

### Local API surface

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/transcribe` | Transcribe media |
| POST | `/jobs/transcribe` | Start a transcription job |
| POST | `/export` | Export edited video |
| POST | `/jobs/export` | Start an export job |
| GET | `/jobs/{job_id}` | Read job progress, logs, result, or error |
| POST | `/jobs/{job_id}/cancel` | Request job cancellation |
| POST | `/jobs/{job_id}/retry` | Retry a failed or canceled job |
| POST | `/ai/filler-removal` | Detect filler words |
| POST | `/ai/create-clip` | Suggest clips |
| POST | `/ai/clip-metadata` | Suggest title, hook, caption, and hashtags |
| POST | `/ai/edit-plan` | Create a reviewable AI edit plan |
| GET | `/ai/ollama-models` | List local Ollama models |
| POST | `/ai/9router-models` | List models exposed by 9Router |
| POST | `/captions` | Generate captions |
| POST | `/audio/clean` | Noise reduction |
| GET | `/audio/capabilities` | Audio processing availability |
| GET | `/background/capabilities` | Background removal availability |

Long-running jobs use `queued`, `running`, `canceling`, `succeeded`, `failed`, and `canceled` states. A canceled job is retryable after it reaches final `canceled` state.

## Keyboard shortcuts

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

## Quality checks

For release-oriented changes, run the checks appropriate to the affected area:

```bash
npm run lint
npm run build
npm run smoke:backend
python -m compileall -q backend
```

Use [docs/DESKTOP_QA.md](docs/DESKTOP_QA.md) for the creator workflow checklist and [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) when setup or runtime checks fail.

## Contributing

Start with [docs/INSTALL.md](docs/INSTALL.md), [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), and [CONTRIBUTING.md](CONTRIBUTING.md). Keep changes focused on creator workflows, preserve support for legacy project files, and retain the original CutScript attribution.

## License and attribution

ScriptCut is released under the MIT License. See [LICENSE](LICENSE).

ScriptCut began as a fork and continuation of [DataAnts-AI/CutScript](https://github.com/DataAnts-AI/CutScript). See [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md) for the original-project attribution.
