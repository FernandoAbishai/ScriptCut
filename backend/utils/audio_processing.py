"""FFmpeg-backed audio extraction and duration helpers."""

import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

from utils.ffmpeg import find_ffmpeg, find_ffprobe

logger = logging.getLogger(__name__)


def extract_audio(video_path: Path) -> Path:
    """Extract the primary audio stream to a private, per-call WAV file."""
    source = Path(video_path).expanduser()
    try:
        source = source.resolve(strict=True)
    except FileNotFoundError as exc:
        raise RuntimeError(f"Audio extraction input was not found: {video_path}") from exc
    if not source.is_file():
        raise RuntimeError(f"Audio extraction input is not a file: {video_path}")

    temp_dir = Path(tempfile.mkdtemp(prefix="scriptcut-audio-"))
    output = temp_dir / f"{source.stem}_audio.wav"
    try:
        command = [
            find_ffmpeg(),
            "-y",
            "-i", str(source),
            "-map", "0:a:0",
            "-vn",
            "-acodec", "pcm_s16le",
            "-f", "wav",
            str(output),
        ]
        result = subprocess.run(command, capture_output=True, text=True, check=False)
    except (OSError, RuntimeError) as exc:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise RuntimeError(f"Audio extraction could not start FFmpeg: {exc}") from exc
    if result.returncode != 0 or not output.is_file():
        shutil.rmtree(temp_dir, ignore_errors=True)
        detail = (result.stderr or result.stdout or "FFmpeg did not create an audio file").strip()
        raise RuntimeError(f"Audio extraction failed: {detail[-500:]}")
    return output


def cleanup_temp_audio(audio_path: Path | str | None = None) -> int:
    """Remove one extraction result and its private directory, if empty."""
    if audio_path is None:
        return 0
    path = Path(audio_path)
    if not path.exists():
        return 0
    try:
        path.unlink()
        parent = path.parent
        if parent.name.startswith("scriptcut-audio-"):
            parent.rmdir()
        return 1
    except OSError as exc:
        logger.warning("Could not remove temporary audio file %s: %s", path, exc)
        return 0


def get_video_duration(video_path: Path) -> float | None:
    """Read media duration through the selected FFprobe binary."""
    source = Path(video_path).expanduser()
    if not source.is_file():
        return None
    try:
        command = [
            find_ffprobe(),
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(source.resolve()),
        ]
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            return None
        duration = float((result.stdout or "").strip())
        return duration if duration >= 0 else None
    except (OSError, ValueError, RuntimeError):
        return None
