# ScriptCut Engineering Context

ScriptCut is an Electron desktop video editor with a React/Vite renderer and a FastAPI local backend. The creator workflow is local-first: the Electron main process starts the backend, exposes a narrow context-isolated preload API, and packages bundled runtime resources for native macOS candidates.

## Architecture map

- `electron/`: main process, preload bridge, backend startup, runtime contract.
- `frontend/`: React/Vite renderer and user-facing editor/support UI.
- `backend/`: local FastAPI services and Python smoke tests.
- `scripts/`: packaging, provenance, release metadata, and smoke gates.
- `.github/workflows/`: normal CI plus guarded native arm64 release workflow.
- `docs/`: product, installation, QA, and release contracts.

## Trust boundaries

Renderer code is sandboxed with context isolation, no Node integration, and a constrained preload bridge. Release publication is workflow-dispatch-only and separate from candidate builds. Do not place credentials in manifests or broaden candidate work into publication/Production without explicit authorization.

## Release identity terms

`productVersion` is the core package/app version (`0.1.0`). The public alpha `releaseTag` is derived separately (`v0.1.0-alpha.N`). Candidate manifests intentionally have no public tag.
