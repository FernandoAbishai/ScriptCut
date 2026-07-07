# Desktop QA Checklist

Use this checklist before publishing a desktop build or handing a build to creators.

## Automated Gate

Run the standard desktop QA gate:

```bash
npm run qa:desktop
```

That command runs the environment doctor, frontend lint/build, backend smoke tests, frontend workflow smoke tests, and backend Python compilation.

When validating packaging changes, run the slower packaged-app gate:

```bash
npm run qa:desktop:package
```

That includes the standard gate and then builds an unpacked Electron app with `npm run dist:dir`.

## Manual Creator Workflow

Run these checks in the Electron desktop app, not the browser-only Vite tab.

1. Start the app with `npm run dev`.
2. Confirm the first-run checklist loads and clearly reports FFmpeg, Python, backend, and transcription engine status.
3. Open a local MP4, MOV, WebM, MKV, M4A, or AVI file with the file picker.
4. Transcribe with the default engine and confirm word-level transcript timing appears.
5. Delete or mute a few words and confirm edited preview playback skips or mutes the expected ranges.
6. Search the transcript and select text ranges without losing playback sync.
7. Export a source-frame MP4 and reveal it in Finder.
8. Export a vertical shorts MP4 with creator captions and reveal it in Finder.
9. Generate AI clip suggestions, approve at least one draft, edit its in/out points, package metadata, and export it.
10. Force or simulate one failed clip export, then confirm batch export continues and retry updates the draft status.
11. Save a `.scriptcut` project, reopen it, and confirm transcript edits, clip package metadata, export status, and settings persist.

## Browser Mode Limits

Browser mode at `localhost:5173` is useful for frontend development. It cannot offer the same local file picker, persistent export folders, or Finder reveal behavior as the desktop app. Use Electron for final creator workflow QA.

## Release Evidence

For each release candidate, keep these notes in the release issue or PR:

- Commit SHA tested.
- macOS version and machine type.
- Transcription engine used.
- Source media type and duration.
- Export presets tested.
- Any failed checks and their resolution.
