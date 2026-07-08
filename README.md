# ScriptCut

ScriptCut is an open-source, local-first video editor for creators. It lets you edit a video by editing the transcript, then package clips for Shorts, TikTok, Reels, podcasts, and social posts.

Think of it as a creator-owned, Descript-style workflow:

- delete words in the transcript to cut the video
- remove filler words and awkward pauses
- search, trim, and review clips from the transcript
- design captions and export vertical shorts
- package each clip with titles, captions, descriptions, hashtags, and hook-frame notes
- use AI helpers when you want them, but still edit and export without AI

ScriptCut runs best as the desktop app. The browser page at `localhost:5173` is the development frontend; it is useful for testing, but it does not have the same native file access as the desktop app.

<img width="1034" height="661" alt="ScriptCut screenshot" src="https://github.com/user-attachments/assets/b1ed9505-792e-42ca-bb73-85458d0f02a5" />

## Download ScriptCut

The intended user version is the **ScriptCut desktop app**.

For the public alpha:

1. Open the [latest GitHub Release](https://github.com/FernandoAbishai/ScriptCut/releases/latest).
2. Download the macOS `.dmg`.
3. Open the DMG and launch ScriptCut.
4. Let the first-run setup assistant check your local tools.
5. Open a video and start editing from the transcript.

If no release asset is available yet, ScriptCut can still be run from source using the contributor setup below. The release flow is documented in [docs/RELEASE.md](docs/RELEASE.md).

## Which Version Should I Use?

Use the **desktop app** for real editing work. It gives ScriptCut direct access to local files, native open/save dialogs, project autosave, and the bundled local backend.

Use the **browser version** only for development or quick testing. Browser mode can upload media to the local backend and download exports, but the desktop app is the intended user experience.

Use the **source/dev setup** only if you are contributing, testing unreleased changes, or building a release candidate.

## What You Can Do

- Open a video or audio file and get a word-level transcript.
- Edit the video by deleting, restoring, muting, or caption-hiding transcript words.
- Preview edited playback before exporting.
- Generate AI edit plans, filler-word suggestions, and short clip drafts.
- Review clip drafts, package social metadata, choose hook frames, and batch export.
- Export source, square, or vertical videos with optional burned-in captions.
- Work locally first, with optional providers like Ollama, OpenAI, Claude, and 9Router.

## Relationship to CutScript

ScriptCut began as a fork/continuation of DataAnts-AI/CutScript.

This version focuses on:

- Apple Silicon macOS setup
- Python 3.10-3.12 compatibility
- 9Router support
- improved backend startup
- creator-oriented local-first workflows

## First Edit

Goal: get from a local video to a finished export in a few minutes.

1. Download and open the desktop app from the latest release.
2. Open a local video or audio file.
3. Choose the transcription engine. Auto/Parakeet is recommended when available.
4. Wait for the word-level transcript.
5. Delete transcript words to cut the video, or mute/hide words when needed.
6. Preview the edited playback.
7. Choose a creator export template such as Shorts Batch or Podcast Clip.
8. Export a source-frame video or a vertical Short.

See [docs/USER_GUIDE.md](docs/USER_GUIDE.md) for a creator-focused walkthrough.

## Shorts Workflow

Use the Clips tab when you want ScriptCut to work like a shorts production queue:

1. Click **Find Best Clips**.
2. Approve the suggestions worth reviewing.
3. Trim in/out points and preview each draft.
4. Package hook, title, caption, description, hashtags, and hook-frame notes.
5. Export approved drafts as a batch.

Each draft keeps its status, export path, and retry state so one failed clip does not block the rest of the batch.

## Contributor Quick Start

These steps are for running ScriptCut from the repository.

### Prerequisites

- Node.js 18+
- Python 3.10 to 3.12
- FFmpeg in `PATH` for source development. Desktop release builds include a bundled FFmpeg when prepared with `npm run release:ffmpeg`.
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

### Install Dependencies

```bash
npm run setup
npm run doctor
```

Release maintainers can prepare local FFmpeg binaries for packaging with:

```bash
npm run release:ffmpeg
```

### Run the Desktop App

```bash
npm run dev
```

That starts the local backend, the frontend, and the Electron desktop app together.

### Build a Desktop App

For local desktop packaging:

```bash
npm run dist:mac
```

That creates a macOS DMG under `dist/`. See [docs/RELEASE.md](docs/RELEASE.md) for the full release checklist.

If you want to verify the backend separately:

```bash
npm run dev:backend
curl -s http://127.0.0.1:8642/health
```

Expected response:

```json
{"status":"ok"}
```

## Browser Mode

If you open `http://localhost:5173` directly, you are using the development browser frontend. Browser mode can select files, transcribe, and export through the local backend, but exported files are saved in a backend temp folder and then offered as downloads.

For the normal creator workflow, use the Electron desktop window opened by `npm run dev`.

## Apple Silicon Notes

This version has been verified on Apple Silicon macOS for backend startup, frontend builds, health checks, exports, and transcription requests on CPU/MPS paths.

Important runtime notes:

- Use Python `3.10` to `3.12`.
- Python `3.11` is the recommended Apple Silicon setup.
- Python `3.13` is not a supported runtime for the current transcription dependency stack.
- The backend launcher auto-selects a compatible local virtualenv or interpreter.

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
| Clip readiness scoring | Done |
| Creator export templates | Done |
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

## How It Works

- **Desktop app:** Electron + React.
- **Local backend:** FastAPI.
- **Transcription:** Parakeet TDT v3, WhisperX, or Whisper.
- **Export engine:** FFmpeg.
- **Optional AI:** Ollama, OpenAI, Claude, or 9Router.

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
