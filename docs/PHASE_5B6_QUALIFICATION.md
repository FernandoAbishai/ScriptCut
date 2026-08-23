# Phase 5B.6 creator qualification protocol

This document defines the qualification evidence protocol introduced in Phase 5B.6A. It is qualification infrastructure only; it does not claim that the real-media qualification is complete. The final creator-facing run is Phase 5B.6B and must include a human visual check before Phase 5 can close.

## North-star journey

For each real spoken-content fixture, qualify the creator path end to end:

`source/media → transcription → discovery or honest fallback → review → preparation/presentation → optional publishing copy → individual/batch export → failure/retry → save → reopen/recovery → output inspection`

The local AI provider is useful but never a prerequisite for a valid manually selected clip. Publishing copy is optional and must not be treated as an export gate.

## Evidence format and runner

The checker consumes a JSON artifact with format `scriptcut.qualification.phase-5b.v1`. This is separate from the persisted project contract `scriptcut.project.v1`; do not put qualification fields into a project file and do not bump the project schema for this work.

Use external/local media paths. Do not add media binaries to the repository. A template can be produced from the exported `createQualificationEvidenceTemplate()` helper, then filled with actual fixture paths and evidence. Validate an artifact with:

```sh
node scripts/qualification/phase-5b6a-qualification.mjs /absolute/path/qualification.json
```

The command validates the artifact contract and prints stage/scenario summaries. A valid `NOT RUN` artifact is not a qualification pass. The runner never executes transcription, discovery, export, or media inspection; those checks remain owned by the existing product smokes and the Phase 5B.6B fixture run.

Each evidence check records:

```json
{
  "id": "a-individual-export-file",
  "scenario": "A",
  "stage": "individual-batch-export",
  "kind": "automated",
  "required": true,
  "status": "PASS",
  "fixtureIds": ["fixture-a"],
  "evidence": "Output exists, is non-empty, and is listed in the manifest."
}
```

Allowed statuses are `PASS`, `FAIL`, `NOT RUN`, and `NOT APPLICABLE`. The matrix fixes each check’s stage, kind, and required/optional status. Unknown fields, unknown checks, missing checks, invalid fixture references, contradictory statuses, and a claimed overall `PASS` with a mandatory `FAIL` or `NOT RUN` are rejected. Optional `NOT APPLICABLE` checks do not block qualification. A mandatory check may not be `NOT APPLICABLE`.

The derived overall result is:

- `FAIL` when any mandatory check is `FAIL`;
- `NOT RUN` when no mandatory check fails but at least one mandatory check is `NOT RUN`;
- `PASS` only when every mandatory check is `PASS`.

## Required scenarios

| Scenario | Fixture requirement | Required coverage |
| --- | --- | --- |
| A — Short single-speaker | Approximately 10 minutes, clean spoken content, local AI available | Normal discovery, mixed review decisions, deleted-range handling, captions, real individual export, and human usefulness/boundary/context/caption/parity checks |
| B — Interview | Approximately 30 minutes, diarized interview content | Multiple suggestions, crop/presentation inspection, captions, serial batch export, and human crop/readability/parity checks |
| C — Long-form | Approximately 60 minutes, realistic spoken recording | Discovery completes or reports honest shortfall/failure, valid boundaries, no silent corruption, and playback inspection |
| D — Provider unavailable | Spoken-content fixture with provider unavailable | Manual clip path remains usable, publishing copy is optional, valid clip exports; generated copy is optional and may be `NOT APPLICABLE` |
| E — Persistence/recovery | Fixture used through save/reopen | Review decisions, settings, exported state, interrupted recovery, failed retry, and unchanged project schema |
| F — Batch partial failure | Multiple eligible clips with one controlled failure | Successful items remain successful, failed item is understandable/retryable, serial exports, and finish-current-then-stop |
| G — Caption fallback | Fixture where caption delivery mode can be inspected | Honest burn-in/fallback representation, inspectable delivery mode, no false burn-in claim, readability, and safe-area checks |

The runner requires every matrix check, including every `manual` check. Manual checks cannot be omitted or inferred from source strings. They must contain an explicit human observation in the evidence field.

## Stages

The summary includes these stages even when an individual scenario does not exercise every one:

1. Source/media
2. Transcription
3. Discovery
4. Review
5. Preparation/presentation
6. Publishing-copy optionality
7. Individual/batch export
8. Failure/retry behavior
9. Project persistence
10. Reopen/recovery
11. Output inspection
12. Overall qualification result

Automated evidence may include existing frontend/backend smokes, discovery counts and validity metadata, export state transitions, serial batch observations, output/manifest paths and sizes, reopen state, caption delivery metadata, and project schema checks. Human evidence must cover useful moments, natural boundaries, understandable context, crop/framing, caption readability and safe area, preview/export parity, and publishable playback.

## Running and interpreting qualification

Phase 5B.6A does not run the final real-media qualification. For 5B.6B, keep the media outside the repository, record the paths in the fixture entries, run the existing relevant checks, perform the manual creator-facing checks, and then run the checker against the completed JSON artifact.

`PASS` means the artifact is internally consistent and every mandatory automated and human check passed. `FAIL` or `NOT RUN` blocks Phase 5B.6 completion. `NOT APPLICABLE` is valid only for an explicitly optional check. A valid artifact with overall `NOT RUN` is evidence that qualification remains outstanding, not evidence of success.

Do not fix defects discovered during qualification in the qualification PR. Record each finding for a subsequent narrowly scoped corrective PR:

- **BLOCKER** — the workflow cannot be completed.
- **P0** — output/state can become incorrect or unusable.
- **P1** — the workflow completes but creator-facing behavior materially violates the Phase 5 contract.
- **P2** — polish/future enhancement; it does not block Phase 5 completion.

Phase 5B.6A does not change discovery policy, ranking/diversity, review, publishing copy, framing, captions, export/recovery, batch policy, project schema, backend production code, Electron runtime, packaging, release workflows, release identity, or public assets.
