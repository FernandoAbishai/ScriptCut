# Engineering decisions

- `productVersion` remains `0.1.0`; public identity remains `v0.1.0-alpha.<n>`.
- `scriptcut.release.v1` is the candidate manifest and `scriptcut.release.v2`
  is the public manifest; bundle size is an optional concise field, not a new
  manifest schema.
- Bundle-size `logicalBytes` uses regular-file `lstat` sizes and skips symlink
  targets. It is measurement evidence only: no optimization, budget, or
  publication gate is derived from it.
- The baseline Whisper model is external/app-managed and is never embedded in
  the package or counted in bundle totals.
