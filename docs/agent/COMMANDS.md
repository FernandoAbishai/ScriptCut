# ScriptCut Commands

Commands are run from `/Users/fm/ScriptCut`.

| Command | Scope | Status on Phase 4B baseline |
|---|---|---|
| `npm run smoke:release-identity` | canonical package/renderer/tag contract | added by Phase 4B; targeted verification |
| `npm run smoke:release-metadata` | candidate manifest/checksum/provenance | verified passing before edits |
| `npm run smoke:public-release` | public manifest/tag/notes/docs fixtures | verified passing before edits |
| `npm run smoke:release-workflow` | guarded workflow structure/permissions | verified passing before edits |
| `npm run smoke:runtime-contract` | packaged/runtime contract source checks | verified passing before edits |
| `npm run smoke:renderer-policy` | built renderer CSP/asset policy | verified passing before edits |
| `npm run lint` | frontend ESLint | verified passing before edits |
| `npm run build:frontend` | TypeScript/Vite renderer build | required after source edits |
| `npm run smoke:backend` | backend Python smoke suite | required after source edits |
| `python -m compileall -q backend` | Python syntax compilation | required after source edits |
| `npm run release:rc:arm64` | native arm64 candidate; packages and runs release gates | Phase 4B candidate evidence; `real_model=false` |

The native candidate requires macOS arm64, packaged runtime inputs, and local release build dependencies. It is configured for `--publish never`; Phase 4B does not publish, tag, or merge.
