# Development

## Common Commands

```bash
npm run setup
npm run doctor
npm run dev
npm run lint
npm run smoke:backend
npm run build
python -m compileall -q backend
```

## App Layout

- `electron/` starts the desktop shell and Python backend.
- `frontend/` contains the React editor UI.
- `backend/` contains FastAPI routes and media/AI services.
- `backend/scripts/smoke_backend.py` contains fast backend smoke checks.

## Local Workflow

1. Run `npm run doctor` before making changes.
2. Keep changes scoped to one feature or fix.
3. Run `npm run lint`, `npm run build`, `npm run smoke:backend`, and `python -m compileall -q backend`.
4. Update docs when commands, setup, or user-visible behavior changes.

## Backend Notes

The backend is launched from `electron/run-backend.js`, which uses `electron/python-runtime.js` to find Python 3.10-3.12.

Prefer adding fast smoke coverage for backend behavior that can be tested without large media fixtures. Use small mocked route/service tests for export options, job lifecycle, and caption behavior.

## Frontend Notes

The frontend is a Vite React app with Zustand stores. Keep UI behavior close to the existing editor surfaces rather than adding standalone marketing screens inside the product.
