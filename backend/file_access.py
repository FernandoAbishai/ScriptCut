"""Per-session capabilities for serving local files through the loopback API."""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from pathlib import Path


SERVABLE_EXTENSIONS = {
    ".mp4",
    ".mkv",
    ".mov",
    ".avi",
    ".webm",
    ".m4a",
    ".wav",
    ".mp3",
    ".flac",
    ".srt",
    ".vtt",
    ".ass",
}


def _capability_secret() -> bytes:
    configured = os.getenv("SCRIPTCUT_FILE_TOKEN_SECRET", "").strip()
    if configured:
        return configured.encode("utf-8")
    # Explicit tokenless development still gets a process-local file authority.
    # It is intentionally never returned by the API.
    return secrets.token_bytes(32)


FILE_CAPABILITY_SECRET = _capability_secret()


def canonical_servable_file(path: str) -> Path:
    if not isinstance(path, str) or not path.strip():
        raise ValueError("File path is required")
    try:
        resolved = Path(path).expanduser().resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise ValueError("File is unavailable") from exc
    if not resolved.is_file():
        raise ValueError("File is unavailable")
    if resolved.suffix.lower() not in SERVABLE_EXTENSIONS:
        raise ValueError("File type is not available through the local media endpoint")
    return resolved


def sign_file_capability(canonical_path: str, secret: bytes | None = None) -> str:
    authority = secret or FILE_CAPABILITY_SECRET
    return hmac.new(
        authority,
        canonical_path.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def issue_file_capability(path: str) -> tuple[str, str]:
    """Return the canonical path and a session-bound read capability for it."""
    resolved = canonical_servable_file(path)
    canonical = str(resolved)
    capability = sign_file_capability(canonical)
    return canonical, capability


def authorize_file_capability(path: str, capability: str | None) -> Path:
    resolved = canonical_servable_file(path)
    canonical = str(resolved)
    expected = sign_file_capability(canonical)
    if not capability or not hmac.compare_digest(capability, expected):
        raise PermissionError("Invalid local file capability")
    return resolved
