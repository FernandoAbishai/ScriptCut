# Continuous Integration

Pull requests and pushes to `main` run the `checks` job in
`.github/workflows/ci.yml`. The source-level release and product checks include:

```bash
npm ci --no-audit --no-fund
npm ci --prefix frontend
python -m pip install fastapi pydantic python-multipart requests
npm run lint
npm run build --prefix frontend
npm run smoke:model-manager
npm run smoke:backend
python -m compileall -q backend
```

The workflow also runs the external-beta contract, release identity, metadata,
public fixture, workflow-structure, runtime-contract, renderer-policy, brand,
and frontend workflow smokes. The model-manager smoke uses a deterministic
loopback fixture; it does not download a real model. Backend smoke checks
intentionally use minimal Python dependencies so CI does not need to install the full
transcription and ML stack for every pull request.

The manually dispatched `release_candidate` path builds the native arm64
candidate. Public dry-runs and publication are governed separately by
[Release QA](./RELEASE_QA.md) and
`.github/workflows/release-unsigned.yml`.
