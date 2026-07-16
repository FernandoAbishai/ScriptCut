# Your First ScriptCut Export

This guide is for a creator using the ScriptCut desktop alpha, not for contributors building from source.

## Before You Start

- Use a macOS Apple Silicon Mac (M1 or newer) for the current downloadable alpha.
- Open ScriptCut from the DMG and wait for the setup assistant.
- Green checks for the local backend, Python, and FFmpeg mean you can edit and export.
- If Python is marked as missing, use the **Install Python for macOS** link in the app, restart ScriptCut, and press the refresh button in the setup assistant.

The alpha includes FFmpeg for export. It still uses a local Python runtime and ScriptCut backend dependencies for transcription and editing, so the setup assistant is the source of truth for readiness on your Mac.

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
