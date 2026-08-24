# Your First ScriptCut Export with v0.1.0-alpha.4

This guide matches the verified v0.1.0-alpha.4 ScriptCut desktop alpha. It is for creators using the packaged app, not contributors building from source.

## Before You Start

- Use a macOS Apple Silicon Mac (M1 or newer).
- [Download ScriptCut-v0.1.0-alpha.4-arm64.dmg](https://github.com/FernandoAbishai/ScriptCut/releases/download/v0.1.0-alpha.4/ScriptCut-v0.1.0-alpha.4-arm64.dmg), then open the DMG and install ScriptCut.
- For release notes, checksums, the manifest, and attestations, see the [v0.1.0-alpha.4 release page](https://github.com/FernandoAbishai/ScriptCut/releases/tag/v0.1.0-alpha.4).
- If macOS blocks the first launch, use **System Settings → Privacy & Security → Open Anyway** for the official download.

A qualifying public alpha bundles portable Python, the pinned core runtime, FFmpeg, and FFprobe for the supported baseline path. On the first transcription, ScriptCut downloads and verifies the baseline model with progress, then stores it in app-managed local storage for later offline reuse. No system Python or separate FFmpeg installation is required for this packaged release. Older alpha releases may predate this self-contained path.

## Edit a Video

1. Click **Edit a Video**.
2. Choose a local video or audio file.
3. Wait for transcription and any required model preparation to finish.
4. Select unwanted words and press Delete.
5. Press Space to preview the edited playback.
6. Open **Export**.
7. Check the compact export preflight. It should show a source, destination, renderer, and caption delivery method.
8. Click **Export**, then use **Reveal in Finder** when it completes.

## Create Clips

1. Click **Create Clips**.
2. Choose a local video file and wait for transcription and any required model preparation to finish. ScriptCut opens the Create Clips workspace after transcription.
3. Find moments with AI, or select transcript words and choose **Draft clip** yourself. An AI provider is optional for manual drafting.
4. Review the draft, trim it, and set its frame and captions.
5. Approve the prepared clip.
6. Export the approved draft. Batch export only runs approved drafts, so one failed clip does not stop the rest.

## Captions

ScriptCut checks caption support before export. When burn-in captions are available, they are rendered directly into the video. When the packaged FFmpeg build cannot render them, ScriptCut exports the video plus a matching `.srt` caption file. The export preflight tells you which result you will get before you start, including **Video + .srt sidecar** when that fallback applies.

## When Export Is Blocked

1. Read the Export preflight message first. It identifies whether the source, destination, renderer, or caption setting needs attention.
2. Open **Settings** and choose **Copy report** to create a redacted support report.
3. Open **Bug form**, paste the report, and include the steps that caused the problem and a screenshot when useful.

The report removes local file paths and credential-like values before it is copied.
