# ScriptCut User Guide

This guide is for creators using the ScriptCut desktop app.

## What ScriptCut Does

ScriptCut lets you edit spoken video by editing the transcript. Delete words to cut the video, review playback, create social-ready clips, and export files from your own computer.

## Install the App

1. Use a macOS Apple Silicon Mac (M1 or newer).
2. [Download the official v0.1.0-alpha.5 Apple Silicon DMG](https://github.com/FernandoAbishai/ScriptCut/releases/download/v0.1.0-alpha.5/ScriptCut-v0.1.0-alpha.5-arm64.dmg).
3. Open the DMG and move ScriptCut to Applications.
4. Launch ScriptCut. If macOS blocks the first launch, use **System Settings → Privacy & Security → Open Anyway** after confirming you downloaded the official file.

The supported self-contained public-alpha path includes the application runtime, Python runtime, core dependencies, FFmpeg, and FFprobe. The published v0.1.0-alpha.5 installer is for macOS Apple Silicon / arm64, is ad-hoc signed, and is not notarized. Older alpha releases may predate this self-contained path; check their release notes before using an older build. ScriptCut downloads and verifies the baseline transcription model on first transcription, then can reuse that verified local model.

## First Launch

Choose one of the current Home actions:

- **Edit a Video** — Edit spoken video by editing the transcript.
- **Create Clips** — Find, review and export social-ready moments.
- **Open Project** — Reopen an existing ScriptCut project.

ScriptCut checks the packaged baseline readiness before you edit. Green checks mean the core workflow is ready; background removal is optional. An AI provider is not required for core transcript editing or export.

## Make Your First Edit

1. From Home, click **Edit a Video**.
2. Choose a video or audio file.
3. Wait for transcription to finish.
4. Select words in the transcript.
5. Press Delete to cut selected words from the edit.
6. Press Space to preview playback.
7. Open **Export**, review the preflight, and click **Export**.
8. Use **Reveal in Finder** or **Open file** to find the finished file.

## Create Clips

Create Clips follows **Find → Review → Prepare → Export**.

### Find

1. From Home, click **Create Clips**.
2. Choose a local video file and wait for transcription.
3. In the **Find** stage, click **Find moments with AI**, or select transcript words and choose **Draft clip** yourself. Manual clips do not require an AI provider.

### Review

Use **Preview** for each suggested moment. Choose **Approve** for moments worth preparing or **Skip** for moments you do not want. When the review is complete, choose **Prepare approved clips**.

### Prepare

For each clip, use the current controls to:

- adjust the **In** and **Out** range;
- choose the **Frame** and adjust **Reframe** when using a social aspect ratio;
- use **Preview**;
- choose **Captions** and a caption **Style**;
- optionally open **Publishing copy — optional** for hook, description, caption, hashtags, or title suggestions;
- optionally open **Advanced export settings** for **Resolution**, **Format**, **Enhance audio**, or **Background removal**.

Publishing copy is optional and is not required to export the clip.

### Export

Choose **Export** when the clip is ready. The result shows **Clip ready** and the output file. In the desktop app, choose **Reveal in Finder** to locate the video. If burn-in captions are unavailable, the result can include a matching `.srt` sidecar.

## Save Projects

Use **Save Project** to create a `.scriptcut` project file. Project files preserve transcript edits, clip drafts, settings, and optional publishing copy.

ScriptCut also uses desktop autosave when available, so interrupted work can be recovered the next time the same media is opened.

## Browser Mode

The browser page at `localhost:5173` is for development and quick testing. Use the desktop app for real editing because it has native file access, export folders, autosave, and Finder reveal actions.

## Common Fixes

If transcription is unavailable, wait for the baseline model preparation to finish and check the first-launch readiness messages. If AI discovery does nothing, check that an AI provider is configured; local Ollama and configured cloud providers are optional helpers, not requirements for manual transcript editing or manual clip drafting.

For more details, see [Troubleshooting](./TROUBLESHOOTING.md).
