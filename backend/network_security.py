"""Validation for user-configurable AI provider endpoints."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse


def validate_provider_url(value: str | None, *, allow_loopback: bool = True) -> str | None:
    if value is None:
        return None
    url = value.strip().rstrip("/")
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Provider URL must be a plain HTTP(S) origin without credentials")
    if parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("Non-local provider URLs must use HTTPS")

    try:
        addresses = {
            ipaddress.ip_address(item[4][0])
            for item in socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
        }
    except socket.gaierror as exc:
        raise ValueError("Provider hostname could not be resolved") from exc

    for address in addresses:
        if address.is_loopback and allow_loopback:
            continue
        if address.is_private or address.is_link_local or address.is_multicast or address.is_reserved or address.is_unspecified:
            raise ValueError("Provider URL resolves to a blocked network address")
    return url
