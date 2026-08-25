# Your First ScriptCut Export with v0.1.0-alpha.5

This guide is for creators using the packaged ScriptCut desktop alpha. It does not require GitHub or developer tools.

## Before You Start

- Use a macOS Apple Silicon Mac (M1 or newer).
- [Download ScriptCut-v0.1.0-alpha.5-arm64.dmg](https://github.com/FernandoAbishai/ScriptCut/releases/download/v0.1.0-alpha.5/ScriptCut-v0.1.0-alpha.5-arm64.dmg), open the DMG, and move ScriptCut to Applications.
- For release notes and verification, see the [v0.1.0-alpha.5 release page](https://github.com/FernandoAbishai/ScriptCut/releases/tag/v0.1.0-alpha.5).
- If macOS blocks the first launch, use **System Settings → Privacy & Security → Open Anyway** for the official download.

The packaged app includes its application runtime, Python runtime, core dependencies, FFmpeg, and FFprobe. You do not install Python or FFmpeg for this supported path. Before the first transcription, ScriptCut downloads and verifies the baseline transcription model; later baseline transcriptions can reuse that verified local model. An AI provider is not required for core transcript editing or export.

## Edit a Video

1. Click **Edit a Video**.
2. Choose a local video or audio file.
3. Wait for transcription and any required model preparation to finish.
4. Select unwanted words and press Delete.
5. Press Space to preview the edited playback.
6. Open **Export**.
7. Check the export preflight, then click **Export**.
8. When it completes, use **Reveal in Finder** to find the finished file.

## Create Clips

1. Click **Create Clips**.
2. Choose a local video file and wait for transcription and any required model preparation to finish.
3. In **Find**, click **Find moments with AI**, or select transcript words yourself and choose **Draft clip**. Manual clips can move directly into **Prepare**; an AI provider is optional for manual drafting.
4. In **Review**, use **Preview**, then **Approve** the AI suggestions worth preparing. Select **Prepare approved clips** when the review is complete.
5. In **Prepare**, adjust the clip range, use **Preview**, choose the frame/reframe, and choose captions. **Publishing copy — optional** is not required to export.
6. Use **Advanced export settings** only when needed for resolution, format, enhance audio, or background removal.
7. Click **Export**. A successful result is shown as **Clip ready**; in the desktop app, use **Reveal in Finder** to locate it.

## Captions

ScriptCut checks caption support before export. When burn-in captions are available, they are rendered directly into the video. When burn-in is unavailable, ScriptCut can export the video plus a matching `.srt` caption sidecar. The export result and preflight show which result you will get.

## When Export Is Blocked

1. Read the export preflight or readiness message first. It identifies what needs attention.
2. Adjust the source, clip range, destination, or selected export option it names.
3. Retry the export. If the issue continues, use **Settings → Copy report** to create a redacted support report.
