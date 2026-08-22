# Changelog

## Unreleased

### Added

- Canonical release-note and post-publication closure verification for the public alpha workflow.
- Machine-readable bundle-size attribution and release size evidence for candidate and public workflow review.

### Changed

- Publishing copy is now optional and resilient; AI copy generation no longer controls clip export readiness.
- Clip discovery now validates and ranks distinct transcript-grounded suggestions and targets a five-clip review queue.
- Clip review now previews exact clip ranges and preserves Approve/Skip decisions.
- Release qualification now separates product identity, public release identity, and maintainer evidence.
- Public release preparation can use curated, creator-oriented changes without duplicating them in generator code.

### Fixed

- Post-publication release verification now has an explicit reusable check of the live GitHub release state.

## v0.1.0-alpha.3

- First qualified self-contained public macOS Apple Silicon alpha with local baseline Whisper transcription, bundled runtime and FFmpeg, and verifiable GitHub release provenance.
