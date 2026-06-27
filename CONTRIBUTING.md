# Contributing

Thanks for helping improve ScriptCut. Keep changes focused, test locally where practical, and preserve compatibility with existing project files.

## Install Dependencies

```bash
npm install
cd frontend && npm install && cd ..

python3.11 -m venv .venv
source .venv/bin/activate
cd backend && python -m pip install -r requirements.txt && cd ..
```

ScriptCut supports Python 3.10 through 3.12. Python 3.11 is recommended on Apple Silicon macOS.

## Run The Frontend

```bash
npm run dev:frontend
```

## Run The Backend

```bash
npm run dev:backend
```

The backend should be available at `http://127.0.0.1:8642/health`.

## Run The Full App

```bash
npm run dev
```

This starts the backend, Vite frontend, and Electron shell.

## Report Bugs

When filing an issue, include:

- your OS and CPU architecture
- Node.js and Python versions
- whether you are using Electron or browser mode
- the media format involved
- console/backend logs when available
- clear reproduction steps

## Contribute Safely

- Keep pull requests small and scoped.
- Do not remove original-project attribution from the license or acknowledgements.
- Preserve support for legacy project files such as `.aive` and `.cutscript`.
- Run `npm run lint` and `npm run build` before submitting UI changes.
- For backend changes, run at least `python3 -m py_compile` on changed Python files.
