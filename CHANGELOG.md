# Changelog

## Unreleased

## v0.1.0-alpha.5

### Added

- Create Clips is now a clearer first-class workflow, with full-video editing and clip export easier to distinguish.
- Clip preparation keeps framing and captions close at hand, with resolution, format, audio enhancement, and background-removal controls under Advanced export settings.
- Successful clip exports surface the video output and, when caption burn-in is unavailable, a matching `.srt` sidecar directly.

### Changed

- Transcript-selected clips move directly into Prepare, and newly created manual clips become the active clip immediately.
- Clip queues distinguish Prepare, Exporting, retry/failure, and Exported states; successful exports show a clearer result while batch retry and recovery remain available.
- Publishing copy is clearly optional and does not block clip export.
- Installation and first-export guidance now follows the current alpha4+ desktop workflow.

### Fixed

- Opening new media clears media-specific AI and clip state while preserving reusable provider and preference settings; reopened projects restore relevant Clips context.
- Stale AI and transcription work can no longer attach results or UI state from old media or projects to the current workspace.

### Current alpha notes

- Product version remains `0.1.0`; this release identity is `v0.1.0-alpha.5`.
- The public build remains macOS Apple Silicon (arm64) only, ad-hoc signed, and not notarized; macOS **Open Anyway** approval may be required. There is no Windows/Linux public build or social publishing API.
- Publishing copy remains optional, and caption burn-in may fall back to a real `.srt` sidecar.

## v0.1.0-alpha.4

### Added

- Clip discovery validates, ranks, bounds, and diversifies transcript-grounded suggestions, targeting a small review queue of useful moments.
- Clip review provides bounded preview with recoverable Approve and Skip decisions.
- Crop/framing and caption composition can be previewed before export.

### Changed

- Publishing copy is optional and resilient, so AI copy generation does not block clip export.
- Batch export preserves completed clips and supports recovery and continuation after interruption or failure.

### Fixed

- Diarization compatibility is restored across supported pyannote APIs, with source video audio normalized where required.
- Exported caption timestamps align with the trimmed and concatenated output timeline, with honest sidecar SRT fallback when burn-in is unavailable.
- Release notes, public release identity, post-publication verification, and bundle-size evidence now have canonical validation and attribution.

## v0.1.0-alpha.3

- First qualified self-contained public macOS Apple Silicon alpha with local baseline Whisper transcription, bundled runtime and FFmpeg, and verifiable GitHub release provenance.
