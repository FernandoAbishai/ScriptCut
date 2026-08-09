# Your First ScriptCut Export

This guide is for a creator using a self-contained ScriptCut desktop alpha explicitly identified in its release notes, not for contributors building from source.

## Before You Start

- Use a macOS Apple Silicon Mac (M1 or newer).
- Download a self-contained macOS arm64 DMG from the official [ScriptCut Releases feed](https://github.com/FernandoAbishai/ScriptCut/releases), as identified by that release's notes and manifest, then open ScriptCut and select a video.
- If macOS blocks the first launch, use **System Settings → Privacy & Security → Open Anyway** for the official download.

A qualifying public alpha bundles portable Python, the pinned core runtime, FFmpeg, and FFprobe for the supported baseline path. On the first transcription, ScriptCut downloads and verifies the baseline model with progress, then stores it in app-managed local storage for later offline reuse. No system Python or separate FFmpeg installation is required for that packaged app. Older alpha releases may predate this self-contained path.

## Edit A Full Video

1. Click **Edit full video**.
2. Choose a local video or audio file.
3. Wait for the transcript to finish.
4. Select unwanted words and press Delete.
5. Press Space to preview the edited playback.
6. Open **Export**.
7. Check the compact export preflight. It should show a source, destination, renderer, and caption delivery method.
8. Click **Export**, then use **Reveal in Finder** when it completes.

## Create A Short

1. Click **Create a short**.
2. Choose a local video file and wait for the transcript.
3. Open **AI**, then **Clips**.
4. Create or draft the moment you want to review.
5. Trim the in/out times, preview it, approve it, and package its title and caption.
6. Export the approved draft. Batch export only runs approved drafts, so one failed clip does not stop the rest.

## Captions

ScriptCut checks caption support before export. When burn-in captions are available, they are rendered directly into the video. When this alpha's FFmpeg build cannot render them, ScriptCut exports the video plus a matching `.srt` caption file. The export panel tells you which result you will get before you start.

## When Export Is Blocked

1. Read the Export preflight message first. It identifies whether the source, destination, renderer, or caption setting needs attention.
2. Open **Settings** and choose **Copy report** to create a redacted support report.
3. Open **Bug form**, paste the report, and include the steps that caused the problem and a screenshot when useful.

The report removes local file paths and credential-like values before it is copied.
