# Release QA Gate Lifecycle

This document is the durable release QA contract for ScriptCut. It separates
source correctness, packaged candidate behavior, public artifact verification,
manual product qualification, publication, and post-publication checks.

The identity contract is intentionally unchanged:

- `productVersion` is `0.1.0` and the implemented public channel is `alpha`.
- The installed app uses `productVersion`; the public release uses
  `releaseTag` (`v0.1.0-alpha.<n>`).
- `npm run release:rc:arm64` is the authoritative native candidate command.
- GitHub Actions → **Release unsigned alpha** is the authoritative public
  release path.
- A developer build, candidate, dry-run, qualified public artifact, and
  published release are different states.

## Gate matrix

| Gate | Owner stage | Runner | What it proves | Required | Conditional | Network / model download | Can mutate GitHub |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Frontend lint and build | SOURCE / PR | `ubuntu-latest` | Source-level frontend lint and compilation/build correctness | Yes for PR CI | No | CI dependency install uses the network; no model download | No |
| Backend smoke and compile | SOURCE / PR | `ubuntu-latest` | Backend source behavior and Python syntax without the packaged runtime | Yes for PR CI | No | CI dependency install uses the network; no model download | No |
| Release identity, metadata, public fixture, workflow, runtime contract, and renderer policy smokes | SOURCE / PR | `ubuntu-latest` | Stable release identity, metadata, public documentation fixture, workflow structure, runtime contract, and renderer policy | Yes for PR CI | No | No model download | No |
| Deterministic model-manager smoke | SOURCE / PR | `ubuntu-latest` | Managed model storage, resume, cancellation, integrity, redirect policy, and path safety against a local fixture server | Yes for PR CI | No | Loopback fixture only; no real model download | No |
| Native candidate build | CANDIDATE | `macos-14` arm64 | The requested commit produces the self-contained native macOS arm64 candidate | Yes before public qualification | No | Package prerequisites use the network; real model is optional for a candidate invocation | No |
| Packaged candidate gates | CANDIDATE | `macos-14` arm64 | Packaged runtime, bundled backend, Electron-like startup, renderer transport/CSP, optional-capability isolation, FFmpeg, transcription, icon, DMG, metadata, identity, and signing readiness | Yes for a candidate | No | No model download unless the candidate is invoked with `--real-model` | No |
| Candidate real-model gate | CANDIDATE | `macos-14` arm64 | First acquisition, verified model, real transcription, offline reuse, repair, and reacquisition when explicitly requested | No for every candidate | Yes: `--real-model` or an implementation change to real-model orchestration | Downloads the real model when enabled; hosted execution is CPU-only | No |
| Public build, stage, and attestation | PUBLIC DRY-RUN | `macos-14` arm64 | One built candidate is transformed into the exact public bundle, with checksums, manifest, DMG and manifest attestations, and no rebuild after staging | Yes for a public dry-run or publication | `workflow_dispatch`; `publish=false` is the non-publishing mode | Network required for actions, GitHub attestations, and `real_model=true` validation | Attestation and workflow-artifact records only; `publish=false` cannot create a tag, release, commit, or main mutation |
| Transferred public bundle checksum, manifest, DMG, and attestation verification | CLEAN ARTIFACT | `macos-14` arm64 | The exact transferred public bundle still has the expected shape, bytes, provenance, and native DMG validity | Yes for a public dry-run or publication | No once the public workflow is run | Network required for GitHub attestation verification; no model download | No |
| Mounted exact-DMG packaged identity proof | CLEAN ARTIFACT | `macos-14` arm64 | `ScriptCut.app` inside the exact mounted public DMG reports the canonical packaged identity | Yes for a public dry-run or publication | No once the public workflow is run | No model download | No |
| Mounted exact-DMG bundled backend startup proof | CLEAN ARTIFACT | `macos-14` arm64 | The exact mounted app starts its bundled local backend and passes the bounded authenticated health/diagnostics checks under a Finder-like environment | Yes for a public dry-run or publication | No once the public workflow is run | No model download; system/developer Python is not accepted | No |
| Gatekeeper assessment diagnostic | CLEAN ARTIFACT | `macos-14` arm64 | The trust state is reported honestly for the unsigned alpha without disabling Gatekeeper or changing xattrs | Yes for a public dry-run or publication | No once the public workflow is run | No model download | No |
| Physical MPS qualification | MANUAL QUALIFICATION | Physical Apple Silicon Mac | Actual MPS behavior for changes touching Torch/MPS selection, Whisper timing, GPU execution, or native GPU dependencies | No for unrelated changes | Yes when an MPS-sensitive surface changes | May use the real model; use the release-specific test procedure | No |
| Physical creator qualification | MANUAL QUALIFICATION | Physical Mac with the installed candidate/public DMG | Installer/layout, trust behavior, first-use model flow, video open/preview, transcription, renderer transport/CSP, backend startup, and core export behavior | No for release-system-only changes | Yes for the current alpha when those creator-facing surfaces change | May require first-use model download and creator media | No |
| Publication gate and exact prerelease creation | PUBLISH | `macos-14` | Current-main binding, explicit confirmation, `real_model=true`, monotonic unused tag, exact verified artifact, no rebuild, and prerelease semantics | No for a dry-run | Yes only when `publish=true` is explicitly dispatched | GitHub API/tag/release access and real-model proof are required | Yes: creates the GitHub prerelease and tag only after all gates pass |
| Published tag, prerelease, asset-set, and digest verification | POST-PUBLISH | `macos-14` | The published GitHub prerelease points at the dispatched commit and contains the exact expected assets and digest | Yes after publication | No when publication occurred | GitHub API and tag access; no model download | No |

The clean artifact stage is intentionally bounded. It does not repeat the
candidate's full transcription, optional-capability, icon-generation, runtime
preparation, or physical MPS matrix. Its functional question is only whether
the exact verified public DMG exposes the packaged identity and starts its
bundled local backend on a fresh native runner.

## Source and candidate ownership

Source / PR gates are cheap, deterministic checks of source and contract
regressions. A candidate is expected to originate from a commit that passed
source CI; candidate gates prove packaged behavior and do not replace source
CI.

The native candidate command is:

```bash
npm run release:rc:arm64
```

Use `npm run release:rc:arm64 -- --real-model` only when the extended model
gate is required. Hosted runners may prove the CPU real-model baseline and a
deterministic or simulated MPS compatibility branch; they must not claim
physical MPS qualification.

## Manual qualification triggers

For the current alpha lifecycle, manual physical creator qualification is
required when a release changes installer or DMG layout, signing/trust
behavior, runtime packaging, backend startup, renderer transport/CSP, model
first-use flow, video open/preview, transcription, or the core export path.
Release-system-only changes that do not alter the public artifact or creator
runtime may mark creator qualification as not required.

Physical MPS validation is required only when the change touches Torch/MPS
device behavior, Whisper MPS timing compatibility, GPU execution selection,
MPS-specific transcription code, or native GPU dependency/runtime behavior.
It is not a standing gate for unrelated releases, and existing
`--require-mps` semantics remain unchanged.

## Command classification

These commands are useful developer or QA paths, but they do not create public
release artifacts:

```text
npm run dist
npm run dist:mac
npm run dist:mac:arm64
npm run dist:mac:arm64:self-contained
npm run qa:desktop:package
```

The compatibility aliases remain available:

- `release:alpha` invokes the same candidate orchestrator as
  `release:rc:arm64`.
- `release:trust` and `release:trust:candidate` invoke the same candidate
  signing-readiness check.
- `release:trust:signed` is the separate credentialed future signed-mode
  check; it is not the public unsigned-alpha publisher.

There is no public npm publisher. Publication remains exclusively owned by
`.github/workflows/release-unsigned.yml`, which builds once, stages exact
candidate bytes, attests them, verifies them on a clean native runner, and
publishes only the already verified artifact.

## Trust and mutation invariants

The public path remains current-main-only and requires
`confirmation=PUBLISH_UNSIGNED_ALPHA` plus `real_model=true`. It verifies the
source commit, SHA-256, GitHub artifact provenance, native DMG, and ad-hoc
signing state. Developer ID signing, notarization, and Hardened Runtime remain
false for the current public path. Gatekeeper output is diagnostic only; no
xattr mutation or Gatekeeper disabling is permitted, and secrets must not enter
manifests or logs.
