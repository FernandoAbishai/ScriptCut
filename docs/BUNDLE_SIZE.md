# Bundle-size measurement

ScriptCut release candidates produce `dist/release-candidate/bundle-size-report.json`
with schema `scriptcut.bundle-size.v1`. It is maintainer evidence for comparing
the exact packaged `.app` and DMG; it is not a creator-facing artifact or an
optimization recommendation.

## Canonical measurement

The canonical uncompressed value is logical file bytes: the sum of
`fs.lstatSync(path).size` for regular files while recursively walking the
`.app`. Symlink targets are never followed or recursively counted. A symlink
may be recorded diagnostically, but its target is counted only at its real
directory entry. This avoids double-counting macOS Framework `Versions/Current`
layouts. Filesystem allocated blocks and Finder-reported sizes are not the
machine contract.

Hard links are diagnosed by device and inode when the platform exposes them.
`logicalBytes` remains the cross-run comparison metric; `uniqueInodeBytes` is
diagnostic and must not be used as a release threshold.

The DMG value is the exact `fs.statSync(dmgPath).size`. The report's
`compressionRatio` is `dmgBytes / appLogicalBytes`; it is a ratio, not a
percentage. A compressed DMG is a different representation, so its bytes are
not expected to reconcile with the `.app` bytes.

## Attribution boundaries

Primary categories are disjoint and must reconcile exactly to
`appLogicalBytes`: Electron Frameworks, macOS executables, `app.asar`, backend,
`Resources/bin`, portable Python, the Python core pack, manifests, licenses and
notices, other Resources, and other app Contents. Runtime roots come from
`Contents/Resources/manifests/runtime-manifest.json` using the same safe
relative-path validation as the packaged runtime contract.

Python distribution and Torch breakdowns are secondary diagnostics. They use
installed `*.dist-info/RECORD` files, assign a claimed file to only one
deterministic owner, and record ownership conflicts. Shared files, generated
caches, namespace packages, and unowned files mean distribution totals may not
reconcile to the core pack; the report exposes attributed and unattributed
bytes separately.

## Usage and comparison

```bash
node scripts/measure-bundle-size.js \
  --app <ScriptCut.app> \
  --dmg <candidate.dmg> \
  --output bundle-size-report.json

node scripts/measure-bundle-size.js \
  --app <new/ScriptCut.app> \
  --dmg <new/candidate.dmg> \
  --output new-bundle-size-report.json \
  --baseline previous-bundle-size-report.json
```

Baseline comparison is informational. It reports byte and percentage deltas
for app bytes, DMG bytes, and categories where present. It rejects an
incompatible schema, platform, or architecture, but it does not fail when a
size increases and implements no budget or regression threshold.

The baseline Whisper model is app-managed and external to the package:
`embeddedModelWeights` is `false`, and `baselineModelExpectedBytes` comes from
the model manifest. The model is not downloaded or added to app totals during
measurement.
