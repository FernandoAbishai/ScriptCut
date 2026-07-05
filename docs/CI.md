# Continuous Integration

The recommended GitHub Actions checks for ScriptCut are:

```bash
npm install --package-lock=false --no-audit --no-fund
npm ci --prefix frontend
python -m pip install fastapi pydantic python-multipart requests
npm run lint
npm run build --prefix frontend
npm run smoke:backend
python -m compileall -q backend
```

The backend smoke checks intentionally use minimal Python dependencies so CI does not need to install the full transcription and ML stack for every pull request.

When repository automation has permission to create workflow files, add a GitHub Actions workflow that runs the commands above on pushes to `main` and on pull requests.
