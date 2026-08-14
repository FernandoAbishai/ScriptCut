# Engineering commands

| Command | Scope | Status on context setup |
| --- | --- | --- |
| `npm run smoke:bundle-size` | Deterministic bundle-size fixture contract | verified during this change |
| `npm run smoke:release-metadata` | Candidate manifest and artifact fixture | verified baseline |
| `npm run smoke:public-release` | Public manifest/notes/workflow fixture | verified baseline |
| `npm run smoke:release-workflow` | Workflow structure and permission contract | verified baseline |
| `npm run smoke:runtime-contract` | Packaged runtime path contract | verified baseline |
| `npm run lint` | Frontend lint | run as delivery validation |
| `npm run build:frontend` | Frontend production build | run as delivery validation |
| `npm run release:rc:arm64` | Native macOS arm64 candidate | requires native arm64 and network prerequisites |

The authoritative candidate output is under `dist/release-candidate/`.
Publication is owned by `.github/workflows/release-unsigned.yml`; do not
publish or create tags from local validation.
