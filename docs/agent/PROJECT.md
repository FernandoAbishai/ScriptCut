# ScriptCut engineering context

ScriptCut is a local-first Electron desktop video editor with a React/Vite
frontend, a FastAPI backend, bundled FFmpeg, and an optional app-managed
Whisper model. Release packaging is macOS arm64, ad-hoc signed, and
self-contained for the current alpha path.

Key boundaries:

- `frontend/`: renderer UI and frontend build/lint.
- `backend/`: local media/transcription services and Python smoke tests.
- `electron/`: desktop process and runtime contract.
- `scripts/`: release orchestration, packaged gates, and deterministic smokes.
- `.github/workflows/`: source CI, candidate build, and public release authority.

The release candidate is maintainer evidence, not a public release. The public
workflow owns the exact six GitHub Release assets and publication gates.
