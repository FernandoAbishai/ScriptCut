# External beta qualification record

Use one copy of this template per external-beta run. Keep the record focused
on the one golden journey in [EXTERNAL_BETA.md](./EXTERNAL_BETA.md). Use
`PASS`, `FAIL`, or `NOT RUN` for each observed result, and add a short note
where it helps reproduce the outcome.

## Run metadata

| Field | Value |
| --- | --- |
| Run date | <!-- YYYY-MM-DD --> |
| ScriptCut release/tag | <!-- exact GitHub Release tag --> |
| macOS version | <!-- e.g. 15.x --> |
| Mac model / Apple Silicon generation | <!-- e.g. MacBook Pro, M1 Pro --> |
| Fixture or recording | <!-- fixture name or creator-supplied recording; do not attach source media --> |

## Outcome summary

| Metric | Result |
| --- | --- |
| Install result | `PASS` / `FAIL` / `NOT RUN` |
| Transcription result | `PASS` / `FAIL` / `NOT RUN` |
| Export result | `PASS` / `FAIL` / `NOT RUN` |
| Save/reopen result | `PASS` / `FAIL` / `NOT RUN` |
| First useful export success | `PASS` / `FAIL` / `NOT RUN` |
| Founder-assistance-free success | `PASS` / `FAIL` / `NOT RUN` |
| P0 count | <!-- integer --> |
| P1 count | <!-- integer --> |
| Overall golden journey | `PASS` / `FAIL` |

`First useful export success` is `PASS` only when the exported file was
revealed and was useful/playable. `Founder-assistance-free success` is `PASS`
only when the complete golden journey finished without founder intervention.
These fields are deliberately manual metrics, not analytics.

For manual aggregation, calculate each failure rate as the number of records
with that component marked `FAIL` divided by the number of records that were
attempted (`PASS` or `FAIL`). Calculate first useful export success and
founder-assistance-free success the same way from their corresponding result
fields. Sum P0 and P1 counts across records; do not count `NOT RUN` as success.

## Golden journey evidence

| Step | Result | Short observation or evidence |
| --- | --- | --- |
| Download from official GitHub Releases feed | `PASS` / `FAIL` / `NOT RUN` | |
| Install DMG to Applications | `PASS` / `FAIL` / `NOT RUN` | |
| Launch | `PASS` / `FAIL` / `NOT RUN` | |
| Gatekeeper behavior / Open Anyway if shown | `PASS` / `FAIL` / `NOT RUN` | |
| Import recording | `PASS` / `FAIL` / `NOT RUN` | |
| Model download and verification | `PASS` / `FAIL` / `NOT RUN` | |
| Transcribe | `PASS` / `FAIL` / `NOT RUN` | |
| Remove transcript words | `PASS` / `FAIL` / `NOT RUN` | |
| Preview edited result | `PASS` / `FAIL` / `NOT RUN` | |
| Manual clip | `PASS` / `FAIL` / `NOT RUN` | Create one clip manually from the edited transcript selection. |
| Prepare clip | `PASS` / `FAIL` / `NOT RUN` | |
| Export clip | `PASS` / `FAIL` / `NOT RUN` | |
| Reveal exported file | `PASS` / `FAIL` / `NOT RUN` | |
| Save project | `PASS` / `FAIL` / `NOT RUN` | |
| Close ScriptCut | `PASS` / `FAIL` / `NOT RUN` | |
| Reopen project | `PASS` / `FAIL` / `NOT RUN` | |
| Confirm useful state restored | `PASS` / `FAIL` / `NOT RUN` | |

## Founder assistance

**Founder assistance required:** `No` / `Yes`

If yes, where was assistance required?

<!-- Describe the point of confusion or intervention. Do not infer that a technically successful export was founder-assistance-free. -->

## Failure and support evidence

- Support report captured if failure: `Yes` / `No` / `Not applicable`
- Redacted support report or issue link: <!-- optional; never paste API keys or other secrets -->
- Observed blocker severity: `P0` / `P1` / `P2` / `P3` / `None`
- Short failure summary: <!-- no source media or full transcript needed -->

## Severity contract

- **P0** — data loss, security/privacy issue, unusable installation, or
  systematic export corruption.
- **P1** — the golden journey cannot complete.
- **P2** — a significant problem with a workaround.
- **P3** — cosmetic, minor, or non-blocking.

Investigate P0/P1 before broader beta expansion. P2/P3 may remain during the
beta when the workaround is clear. Record every failure separately; do not
turn a skipped step into a pass.

## Data minimization

Do not collect API keys, source media, full transcripts unless the creator
intentionally provides them, or unnecessary personal information. Use the
redacted ScriptCut support report only when it helps explain a failure.
