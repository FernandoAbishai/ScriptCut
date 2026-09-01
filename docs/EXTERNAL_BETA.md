# ScriptCut external beta contract

ScriptCut is an open-source desktop alpha. This contract describes the narrow
public beta path we want an external creator to try and the evidence we record
when that path succeeds or fails. It is not a stability guarantee and does not
make ScriptCut a stable product.

## Supported public path

Use the intended public prerelease from the official
[ScriptCut GitHub Releases feed](https://github.com/FernandoAbishai/ScriptCut/releases).
Record the exact release/tag in the qualification record.

The supported packaged beta environment is deliberately narrow:

- macOS on Apple Silicon only (M1 or newer);
- the official GitHub Releases download, as identified by its release notes and
  manifest;
- an ad-hoc-signed macOS arm64 DMG, not signed with Apple Developer ID and not
  notarized;
- a self-contained packaged Python/runtime and FFmpeg/FFprobe, so the core
  packaged workflow does not require a separate Python or FFmpeg installation;
- a baseline Whisper model download and verification on first transcription;
- raw source media kept local for the core workflow;
- no AI provider required for manual transcript editing or manual clip export;
- optional external AI actions may send the required transcript or prompt
  context to the provider selected by the creator.

macOS may therefore block the first launch. If it does, use:

`System Settings → Privacy & Security → Open Anyway`

This approval path is for the official ScriptCut release download only. Do not
disable Gatekeeper globally or remove macOS security protections.

This beta contract does not claim support for Intel Macs, Windows, Linux, or a
stable release.

## The one golden beta journey

This is the only required external-beta journey. It deliberately uses the
manual/core path and does not require OpenAI, Claude, Ollama, or another AI
provider.

1. Download the intended public prerelease from the official Releases feed.
2. Install ScriptCut by opening the DMG and moving ScriptCut to Applications.
3. Launch ScriptCut, completing the Open Anyway approval if macOS asks for it.
4. Import a short spoken recording.
5. Transcribe it and wait for any first-use baseline model download to finish.
6. Remove words from the transcript.
7. Preview the edited result.
8. Create one clip manually from the edited transcript selection.
9. Prepare the clip.
10. Export the clip.
11. Reveal the exported file and confirm it is useful/playable.
12. Save the project.
13. Close ScriptCut.
14. Reopen the saved project.
15. Confirm the useful transcript edits, clip state, and project settings are restored.

The qualification record is the evidence of whether this journey completed and
whether the creator needed founder assistance. AI moment discovery, publishing
copy, background removal, MPS, and other optional capabilities are not required
for this journey.

## Small beta fixture

The repository includes a short original spoken script and a macOS-only
generator for a small qualification fixture. It creates a local, mono 16 kHz
WAV under `dist/fixtures/`; the generated file is ignored build output and is
not committed to Git history.

From a repository checkout on a supported Mac:

```bash
npm run beta:fixture
```

The fixed sentence is intentionally ordinary and contains no personal or
sensitive content. The fixture is suitable for deterministic transcript-word
editing and export checks; record the generated path in the qualification
record. A tester may use another short spoken recording instead.

## Qualification and feedback

Use the [beta qualification record](./BETA_QUALIFICATION.md) for each run. If
the journey fails, open the focused
[Beta feedback / bug report](https://github.com/FernandoAbishai/ScriptCut/issues/new?template=beta_feedback.yml)
form and attach only a redacted ScriptCut support report when it is relevant.
Do not send source media, full transcripts unless intentionally provided, API
keys, or other secrets.

## Provisional beta exit signals

Before considering a broad v1 launch, we want product-validation evidence
approximately equivalent to:

- 10–20 external testers, with multiple Apple Silicon generations where
  possible;
- at least two relevant macOS versions where possible;
- at least 85% complete a first useful export without founder intervention;
- zero unresolved P0 issues;
- no systematic P1 failure in the golden journey.

These are provisional, non-binding heuristics. They are calculated manually
from qualification records and issues; they are not release automation or a
guarantee.
