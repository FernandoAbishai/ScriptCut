# Contributing to ScriptCut

Thanks for helping improve ScriptCut. The best contributions are small, tested, and tied to creator workflows.

## Start Here

```bash
npm run setup
npm run doctor
npm run dev
```

Before opening a pull request, run:

```bash
npm run lint
npm run build
npm run smoke:backend
python -m compileall -q backend
```

ScriptCut supports Python 3.10 through 3.12. Python 3.11 is recommended on Apple Silicon macOS.

The full app runs with:

```bash
npm run dev
```

That starts the backend, Vite frontend, and Electron shell. The backend should be available at `http://127.0.0.1:8642/health`.

## Good First Areas

- Documentation and troubleshooting improvements
- Caption style presets
- Export preset polish
- Backend smoke tests
- Small UI accessibility fixes
- Provider setup documentation

## Pull Request Guidelines

- Keep the PR focused on one feature or fix.
- Include screenshots or a short recording for UI changes.
- Update docs when commands, setup, project format, or visible behavior changes.
- Avoid committing large media files. Document how to generate small fixtures instead.
- Preserve support for legacy project files such as `.aive` and `.cutscript`.
- Do not remove original-project attribution from the license or acknowledgements.

## Licensing contributions

Public contributions are expected to be compatible with `AGPL-3.0-or-later`. Contributors must have the right to submit their work and must preserve applicable third-party notices and licenses.

ScriptCut intends to preserve the ability to offer alternative commercial licensing for rights controlled by the ScriptCut licensor. AGPL-compatible public contributions do not automatically grant commercial relicensing rights. This guidance does not create a copyright assignment or contributor license agreement.

An external contribution may require a separate, reviewed contributor agreement before merge if rights beyond AGPL-3.0-or-later are needed for that contribution, including inclusion in an alternatively licensed distribution. Before accepting external code that ScriptCut expects to include in an alternatively licensed distribution, the required contributor rights must be resolved explicitly. No separate CLA currently exists, and none is being created by this phase.

## Report Bugs

When filing an issue, include:

- OS and CPU architecture
- Node.js and Python versions
- Electron or browser mode
- media format involved
- `npm run doctor` output when setup or runtime behavior is involved
- console/backend logs when available
- clear reproduction steps

## Local-First Principle

ScriptCut should make local/offline paths clear and keep raw media on the user's machine unless the user explicitly chooses an external provider.
