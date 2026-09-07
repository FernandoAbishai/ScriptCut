# Desktop QA Checklist

Use this checklist when manual physical creator qualification is required for a
release candidate or public alpha. It is required for changes to installer or
DMG layout, signing/trust behavior, runtime packaging, backend startup,
renderer transport/CSP, model first-use flow, video open/preview,
transcription, or core export. Release-system-only changes that do not alter
the public artifact or creator runtime may mark it not required. See
[Release QA](./RELEASE_QA.md) for the full gate lifecycle.

## Automated Gate

Run the standard desktop QA gate:

```bash
npm run qa:desktop
```

That command runs the environment doctor, frontend lint/build, backend smoke tests, the consolidated golden creator-path source/persistence gate, additional frontend workflow smokes, and backend Python compilation.

When validating packaging changes, run the slower packaged-app developer gate:

```bash
npm run qa:desktop:package
```

That includes the standard gate and then builds an unpacked Electron app with `npm run dist:dir`. It is useful before release qualification, but it is not a substitute for testing the exact release-candidate DMG.

## Manual Creator Workflow

Run these checks on a physical supported Mac against the exact release-candidate or public DMG being qualified, not `npm run dev`, an unpacked development build, or the browser-only Vite tab.

1. Record the exact commit SHA and candidate/release identity, then open the DMG and move ScriptCut to Applications.
2. Launch the installed app. Record Gatekeeper/Open Anyway behavior without disabling macOS protections.
3. Confirm the first-use readiness experience reaches a creator-usable state without requiring a separately installed Python or FFmpeg.
4. Open a short local spoken recording with the native file picker.
5. Transcribe with the default local engine. If the baseline model is not installed, observe the first-use download/verification flow, then confirm word-level transcript timing appears.
6. Delete or mute a few words and confirm edited preview playback skips or mutes the expected ranges.
7. Search/select transcript text without losing playback sync.
8. Create a clip **manually** from a transcript selection using `Draft clip`. This provider-independent path is required; AI clip discovery is optional qualification coverage.
9. Review/prepare the manual clip, adjust an in/out point or another creator-facing setting, and confirm its preview remains bounded to that clip.
10. Export the manual clip, reveal it in Finder, and confirm the output is non-empty, playable, and useful. If captions are exercised, confirm the visible result or honest sidecar fallback.
11. Save a `.scriptcut` project and note the saved location.
12. Close ScriptCut completely, relaunch the installed app, reopen that project, and confirm transcript edits, manual clip state, export-relevant settings, and other useful project state are restored.
13. When the release specifically changes full-video export, captions, batch export, AI discovery, or another optional capability, exercise that surface as additional qualification rather than replacing steps 4–12.

The automated candidate gates prove packaging/runtime contracts and the golden creator-path source/persistence smoke proves code-level invariants. They do not prove Finder reveal, Gatekeeper UX, edited-playback correctness, visual framing/caption quality, or that an exported video is useful to a creator; those remain physical observations.

## Browser Mode Limits

Browser mode at `localhost:5173` is useful for frontend development. It cannot offer the same local file picker, persistent export folders, packaged runtime/trust behavior, or Finder reveal behavior as the installed desktop app. Use the exact installed candidate/public DMG for physical release qualification.

## Release Evidence

For each release candidate, keep these notes in the release issue or PR:

- Commit SHA tested.
- Exact candidate/public DMG filename or release tag tested, plus its recorded digest when available.
- macOS version and machine type.
- Transcription engine used.
- Source media type and duration.
- Export presets tested.
- Manual transcript-selection clip result and exported file observation.
- Save/close/reopen result.
- Whether founder assistance was required.
- Any failed checks and their resolution.
