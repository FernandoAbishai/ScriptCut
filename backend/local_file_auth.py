"""Ephemeral authorization for streaming local files through the backend."""

from __future__ import annotations

import hashlib
import hmac
import tempfile
from pathlib import Path


def normalize_local_path(file_path: str | Path) -> str:
    """Return a stable absolute path representation used by both runtimes."""
    return str(Path(file_path).expanduser().resolve())


def create_local_file_token(secret: str, file_path: str | Path) -> str:
    """Create a per-launch HMAC proving Electron authorized this path."""
    if not secret:
        return ""
    normalized = normalize_local_path(file_path)
    return hmac.new(secret.encode("utf-8"), normalized.encode("utf-8"), hashlib.sha256).hexdigest()


def is_authorized_local_file(secret: str, file_path: str | Path, received_token: str | None) -> bool:
    """Return true only when the supplied token matches the resolved path."""
    if not secret or not received_token:
        return False
    expected = create_local_file_token(secret, file_path)
    return hmac.compare_digest(expected, received_token)


def is_backend_managed_path(file_path: str | Path) -> bool:
    """Allow backend-created upload/export files without an Electron capability."""
    candidate = Path(normalize_local_path(file_path))
    roots = (
        Path(tempfile.gettempdir()) / "scriptcut_uploads",
        Path(tempfile.gettempdir()) / "scriptcut_exports",
    )
    return any(_is_within(candidate, root.resolve()) for root in roots)


def _is_within(candidate: Path, root: Path) -> bool:
    try:
        candidate.relative_to(root)
        return True
    except ValueError:
        return False
