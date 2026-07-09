"""Small, dependency-light helpers for packaged local API authentication."""

from __future__ import annotations

import secrets


def is_authorized_local_api_request(expected_token: str, received_token: str | None) -> bool:
    """Return true when the packaged backend token matches the incoming request."""
    if not expected_token:
        return True
    return secrets.compare_digest(received_token or "", expected_token)
