"""FFmpeg binary resolution for local and packaged ScriptCut builds."""

import os
import subprocess


def _binary_ok(command: str) -> bool:
    try:
        subprocess.run([command, "-version"], capture_output=True, check=True)
        return True
    except (FileNotFoundError, PermissionError, subprocess.CalledProcessError):
        return False


def find_ffmpeg() -> str:
    explicit = os.environ.get("SCRIPTCUT_FFMPEG_PATH")
    if explicit and _binary_ok(explicit):
        return explicit

    for cmd in ["ffmpeg", "ffmpeg.exe"]:
        if _binary_ok(cmd):
            return cmd

    raise RuntimeError("FFmpeg not found. Install it, add it to PATH, or use a ScriptCut build with bundled FFmpeg.")


def find_ffprobe() -> str:
    explicit = os.environ.get("SCRIPTCUT_FFPROBE_PATH")
    if explicit and _binary_ok(explicit):
        return explicit

    ffmpeg = find_ffmpeg()
    candidates = [ffmpeg.replace("ffmpeg", "ffprobe"), "ffprobe", "ffprobe.exe"]
    for cmd in candidates:
        if _binary_ok(cmd):
            return cmd

    raise RuntimeError("FFprobe not found. Install FFmpeg with ffprobe, add it to PATH, or use a ScriptCut build with bundled FFmpeg.")
