"""Small, dependency-light helpers for packaged local API authentication."""

from __future__ import annotations

import secrets


def validate_local_api_startup(token: str | None, allow_tokenless_dev: bool = False) -> bool:
    """Require a worker token unless an explicit source-development override is set."""
    if (token or '').strip():
        return True
    if allow_tokenless_dev:
        return False
    raise RuntimeError(
        'SCRIPTCUT_API_TOKEN is required. Set SCRIPTCUT_ALLOW_TOKENLESS_DEV=1 only for explicit source development.'
    )


def is_authorized_local_api_request(expected_token: str, received_token: str | None) -> bool:
    """Return true when the packaged backend token matches the incoming request."""
    if not expected_token:
        return True
    return secrets.compare_digest(received_token or "", expected_token)
