# ScriptCut User Guide

This guide is for creators using the ScriptCut desktop app.

## What ScriptCut Does

ScriptCut lets you edit spoken video by editing the transcript. Delete words to cut the video, review playback, package shorts, and export social-ready files from your own computer.

## Install the App

1. Go to the official [ScriptCut Releases feed](https://github.com/FernandoAbishai/ScriptCut/releases) and choose a prerelease explicitly identified as self-contained for macOS Apple Silicon.
2. Download that tagged macOS Apple Silicon (arm64) `.dmg`.
3. Open the DMG and launch ScriptCut.
4. If macOS blocks the unsigned first launch, use **System Settings → Privacy & Security → Open Anyway** after confirming the download came from the official Releases feed.

The supported self-contained public-alpha path bundles portable Python, the pinned core runtime, FFmpeg, and FFprobe. ScriptCut downloads and verifies the baseline transcription model on first use; creators do not install system Python or FFmpeg for a qualifying packaged app. Older alpha releases may predate this path; check the individual release notes and manifest. If there is no qualifying public release yet, use the repository setup in [Install ScriptCut](./INSTALL.md).

## First Launch

ScriptCut checks the packaged baseline readiness before you edit:

- Desktop app access for opening and saving local files.
- Local backend for transcription and exports.
- Bundled Python runtime for the backend.
- Bundled FFmpeg for video export.
- Transcription engine availability.

Green checks mean the core workflow is ready. Background removal is optional.

## Make Your First Edit

1. Click **Open Video File**.
2. Choose a video or audio file.
3. Wait for transcription to finish.
4. Select words in the transcript.
5. Press Delete to cut selected words from the edit.
6. Press Space to preview playback.
7. Open **Export**.
8. Choose a creator template such as **Shorts Batch**, **Caption Review**, or **Podcast Clip**.
9. Click **Export**.
10. Use **Reveal in Finder** or **Open** to find the finished file.

## Make Shorts

1. Open the **AI** panel.
2. Open the **Clips** tab.
3. Click **Find Best Clips**.
4. Draft the suggestions you want to review.
5. Adjust the in/out times.
6. Package metadata for hook, title, caption, description, hashtags, and hook frames.
7. Use the readiness score to fix missing captions, metadata, or export settings.
8. Export one draft or use **Export Approved** for a batch.

AI helps find and package clips, but exporting still uses the local media and local backend.

## Save Projects

Use **Save Project** to create a `.scriptcut` project file. Project files preserve transcript edits, clip drafts, settings, and package metadata.

ScriptCut also uses desktop autosave when available, so interrupted work can be recovered the next time the same media is opened.

## Browser Mode

The browser page at `localhost:5173` is for development and quick testing. Use the desktop app for real editing because it has native file access, export folders, autosave, and Finder reveal actions.

## Common Fixes

If export is unavailable in a desktop release, choose the intended prerelease from the official Releases feed and run the first-launch checks again. If you run from source, install FFmpeg or run `npm run release:ffmpeg` before packaging.

If transcription is unavailable, choose Auto or Whisper fallback, or install the optional Parakeet dependencies shown by the first-run setup assistant.

If AI actions do nothing, open Settings and choose a configured AI provider. Ollama can run locally; cloud providers require API keys.

For more details, see [Troubleshooting](./TROUBLESHOOTING.md).
