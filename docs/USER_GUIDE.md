# ScriptCut User Guide

This guide is for creators using the ScriptCut desktop app.

## What ScriptCut Does

ScriptCut lets you edit spoken video by editing the transcript. Delete words to cut the video, review playback, package shorts, and export social-ready files from your own computer.

## Install the App

1. Go to the [latest ScriptCut release](https://github.com/FernandoAbishai/ScriptCut/releases/latest).
2. Download the macOS `.dmg`.
3. Open the DMG and launch ScriptCut.
4. If macOS warns that the app is from an unidentified developer during alpha testing, open it from System Settings after confirming you trust the downloaded release.

If there is no release download yet, use the repository setup in [Install ScriptCut](./INSTALL.md).

## First Launch

ScriptCut checks the local tools it needs before you edit:

- Desktop app access for opening and saving local files.
- Local backend for transcription and exports.
- Python runtime for the backend.
- FFmpeg for video export.
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
8. Choose **Source** for the original frame or **Shorts** for a vertical clip.
9. Click **Export**.
10. Use **Reveal in Finder** to find the finished file.

## Make Shorts

1. Open the **AI** panel.
2. Open the **Clips** tab.
3. Click **Find Best Clips**.
4. Draft the suggestions you want to review.
5. Adjust the in/out times.
6. Package metadata for hook, title, caption, description, hashtags, and hook frames.
7. Export one draft or use **Export Approved** for a batch.

AI helps find and package clips, but exporting still uses the local media and local backend.

## Save Projects

Use **Save Project** to create a `.scriptcut` project file. Project files preserve transcript edits, clip drafts, settings, and package metadata.

ScriptCut also uses desktop autosave when available, so interrupted work can be recovered the next time the same media is opened.

## Browser Mode

The browser page at `localhost:5173` is for development and quick testing. Use the desktop app for real editing because it has native file access, export folders, autosave, and Finder reveal actions.

## Common Fixes

If export is unavailable, install FFmpeg and restart ScriptCut.

If transcription is unavailable, choose Auto or Whisper fallback, or install the optional Parakeet dependencies shown by the first-run setup assistant.

If AI actions do nothing, open Settings and choose a configured AI provider. Ollama can run locally; cloud providers require API keys.

For more details, see [Troubleshooting](./TROUBLESHOOTING.md).
