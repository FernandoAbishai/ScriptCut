# Changelog

## Unreleased

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
