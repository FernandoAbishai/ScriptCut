# Creator workspace qualification

Local run on November 26, 2026 on an Apple M1 Pro MacBook Pro with macOS 27.2.1. The `0.1.0` ARM64 candidate was built from the `codex/creator-interface-refresh` working tree based on `12c6fe4`. This candidate has an ad-hoc signature.

- Artifact `ScriptCut-0.1.0-arm64.dmg`
- SHA-256 `7cdfaf0d64a26cff79ed7168626e01f475fa2ddf68f4827e4faada95c71c4b9d`

The run mounted the DMG read-only, copied the app into an isolated Applications folder and launched it with fresh profiles. DMG checksum verification, deep code signature checks and the packaged runtime check passed. The test drove the installed Electron interface and supplied paths to its file dialogs.

| Workflow | Result |
| --- | --- |
| First export with a cold model cache | The packaged app downloaded and verified all 145,262,807 bytes of Whisper Base. Transcription took 9.59 s after choosing the fixture. The first export finished and decoded 15.63 s after launch. |
| Warm cache and saved project | The saved cut and its waveform overlay reappeared after relaunch. Preview source played the removed range. A second import transcribed in 5.33 s and reused the same verified model file. The warm export finished and decoded 13.19 s after launch, including the project reopen. |
| Cut preview and export agreement | Arrow keys selected two words and Shift extended the selection. A cut at the start appeared once on the waveform. The 7.54 s encoded output matched the 7.56 s edited preview within one frame of the 24 fps source. |
| Practice project | A fresh profile opened the included transcript without downloading a model. Cut, restore, undo and start over worked. The sample’s edited video exported and decoded 2.33 s after choosing the sample. |
| Draft handoff and project persistence | Draft clip focused the exact selected moment in Prepare. The draft’s 3.26–4.80 s source range, square framing and SRT setting survived Save Project and reopen. |
| Isolated batch retry | One output path was deliberately blocked. The other clip exported. After clearing the blocked path, Retry export rendered just the failed clip and left the successful file’s modification time unchanged. |

All five exported videos played through macOS AVFoundation. The desktop QA suite passed, including 125 backend tests. The timing values are automated measurements from this run. Public download, Gatekeeper approval, and an unassisted walkthrough with an external creator remain pending. Use the beta checklist to record the first point at which a tester needs help. [External beta qualification checklist](BETA_QUALIFICATION.md)

## Gatekeeper diagnostics

On the test Mac, `spctl --status` reported `assessments disabled`. Its acceptance result included `override=security disabled`. Apple’s distribution assessment independently reported an ad-hoc signature and a missing notarization ticket. The public alpha workflow records that expected trust state. The first-launch approval path still needs to be observed on a physical Apple Silicon Mac with assessments enabled. [Apple’s Open Anyway instructions](https://support.apple.com/en-us/102445)
