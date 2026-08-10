# Troubleshooting

Run this first:

```bash
npm run doctor
```

## Python Not Found

Use Python 3.10, 3.11, or 3.12. Python 3.11 is recommended.

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
```

To force a specific interpreter:

```bash
export SCRIPTCUT_PYTHON_PATH=/absolute/path/to/python
```

## FFmpeg Missing

If you installed ScriptCut from a desktop release, use the first-run checks or choose a release from the official [ScriptCut Releases feed](https://github.com/FernandoAbishai/ScriptCut/releases). Public macOS arm64 alpha builds bundle the supported runtime and FFmpeg for export. For checksum and provenance checks, see [Verify a public release](./VERIFY_RELEASE.md).

## Ad-hoc public alpha first launch

The public macOS arm64 alpha uses an ad-hoc code signature for package integrity but is not signed with Apple Developer ID or notarized. If macOS blocks a DMG downloaded from the official Releases feed, use **System Settings → Privacy & Security → Open Anyway** and confirm the prompt. Do not run `xattr` quarantine removal, disable Gatekeeper, or use an unofficial download.

If you run ScriptCut from source, install FFmpeg and ensure it is available in `PATH`:

```bash
ffmpeg -version
```

Release maintainers can also prepare the local bundle before packaging:

```bash
npm run release:ffmpeg
```

## Backend Will Not Start

Run:

```bash
npm run dev:backend
```

Then check:

```bash
curl -s http://127.0.0.1:8642/health
```

Expected response:

```json
{"status":"ok"}
```

## AI Features Do Not Work

Local AI features require Ollama to be running, or a configured cloud provider key in Settings.

```bash
ollama list
```

Cloud providers require valid API keys. ScriptCut keeps provider settings local.

## Background Removal Is Disabled

Background removal requires optional Python packages such as MediaPipe and OpenCV. Check availability in the export panel or by running:

```bash
curl -s http://127.0.0.1:8642/background/capabilities
```
