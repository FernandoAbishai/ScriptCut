"""System readiness checks for first-run onboarding."""

import shutil
import subprocess
import sys

from fastapi import APIRouter

from services.audio_cleaner import is_deepfilter_available
from services.background_removal import capabilities as background_capabilities

router = APIRouter()


def _first_line(value: str) -> str:
    return (value or "").strip().splitlines()[0] if (value or "").strip() else ""


def _ffmpeg_status() -> dict:
    path = shutil.which("ffmpeg")
    if not path:
        return {
            "ok": False,
            "label": "FFmpeg",
            "detail": "Install FFmpeg and make sure it is available in PATH.",
        }

    result = subprocess.run([path, "-version"], capture_output=True, text=True, check=False)
    return {
        "ok": result.returncode == 0,
        "label": "FFmpeg",
        "detail": _first_line(result.stdout or result.stderr) or path,
    }


def _transcription_status() -> dict:
    try:
        from services.transcription import get_transcription_engine_status

        return get_transcription_engine_status()
    except ModuleNotFoundError as e:
        return {
            "default_engine": None,
            "default_model": "",
            "engines": {},
            "error": f"Missing transcription dependency: {e.name}",
        }


@router.get("/system/checks")
async def system_checks():
    transcription = _transcription_status()
    default_engine = transcription.get("default_engine")
    background = background_capabilities()
    return {
        "status": "ok",
        "checks": {
            "backend": {
                "ok": True,
                "label": "Local backend",
                "detail": "Ready",
            },
            "python": {
                "ok": sys.version_info >= (3, 10) and sys.version_info < (3, 13),
                "label": "Python",
                "detail": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
            },
            "ffmpeg": _ffmpeg_status(),
            "transcription": {
                "ok": bool(default_engine),
                "label": "Transcription",
                "detail": transcription.get("error") or f"{default_engine or 'No engine'} selected by default",
                "engines": transcription.get("engines", {}),
            },
            "audio": {
                "ok": True,
                "label": "Studio Sound",
                "detail": "DeepFilterNet ready" if is_deepfilter_available() else "FFmpeg fallback available",
            },
            "background": {
                "ok": bool(background.get("available")),
                "label": "Background removal",
                "detail": "Ready" if background.get("available") else "Optional: install MediaPipe and OpenCV",
            },
        },
    }
