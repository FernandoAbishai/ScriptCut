# ScriptCut User Guide

This guide covers the ScriptCut desktop workspace in the current source tree. Features in a published build are listed in its release notes.

## What ScriptCut Does

ScriptCut lets you edit spoken video by editing the transcript. Delete words to cut the video, review playback, create social-ready clips, and export files from your own computer.

## Install the App

1. Use a macOS Apple Silicon Mac (M1 or newer).
2. [Find the official Apple Silicon DMG and its release notes](https://github.com/FernandoAbishai/ScriptCut/releases).
3. Open the DMG and move ScriptCut to Applications.
4. Launch ScriptCut. If macOS blocks the first launch, use **System Settings → Privacy & Security → Open Anyway** after confirming you downloaded the official file.

The supported self-contained public-alpha path includes the application runtime, Python runtime, core dependencies, FFmpeg, and FFprobe. Check the release notes for the installer’s platform support, signing and runtime details. ScriptCut downloads and verifies the baseline transcription model on first transcription, then can reuse that verified local model.

## First Launch

Choose one of the current Home actions:

- **Edit a Video** — Edit spoken video by editing the transcript.
- **Create Clips** — Find, review and export social-ready moments.
- **Open Project** reopens an existing ScriptCut project.
- **Try sample project** opens a short practice recording with its transcript already loaded.

ScriptCut checks the packaged baseline readiness before you edit. Green checks mean the core workflow is ready; background removal is optional. An AI provider is not required for core transcript editing or export.

## Try the Sample Project

Choose **Try sample project** on Home. Select **Well,** in the transcript and choose **Cut**. Use **Review cuts** to preview or restore it. Play the edited preview, then choose **Export** to save a video. The sample’s transcript ships with the app, so this walkthrough can run before the first model download.

## Make Your First Edit

1. From Home, click **Edit a Video**.
2. Choose a video or audio file.
3. Wait for transcription to finish.
4. Select words with the mouse, or Tab to **Transcript words**, use the arrow keys to move the selection and hold Shift to extend it.
5. Press Delete to cut selected words from the edit.
6. Press Space to preview playback.
7. Open **Export**, review the preflight, and click **Export**.
8. Use **Reveal in Finder** or **Open file** to find the finished file.

Open **Review cuts** to see removed words and their source times. **Preview source** plays just the removed range, and **Restore cut** puts that range back in the edit.

## Create Clips

Create Clips follows **Find → Review → Prepare → Export**. To start from the full-video editor, select transcript words and choose **Draft clip**. ScriptCut opens that draft in **Prepare**.

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
