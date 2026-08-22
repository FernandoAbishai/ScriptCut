"""Normalization for provider-generated clip publishing copy."""

from __future__ import annotations

from typing import Any


def normalize_clip_metadata(value: Any) -> dict[str, Any]:
    """Return bounded, useful publishing copy or raise a controlled error.

    Provider output is untrusted data. The normalizer intentionally accepts
    only the small set of shapes the UI can use and never performs I/O.
    """
    if not isinstance(value, dict):
        raise ValueError("Clip metadata provider returned a non-object result.")

    normalized: dict[str, Any] = {}
    hook = _normalize_text(value.get("hook"))
    if hook:
        normalized["hook"] = hook

    titles = _normalize_list(value.get("titles"), limit=3)
    if titles:
        normalized["titles"] = titles

    description = _normalize_text(value.get("description"))
    if description:
        normalized["description"] = description

    caption = _normalize_text(value.get("caption"))
    if caption:
        normalized["caption"] = caption

    hashtags = _normalize_list(value.get("hashtags"), limit=8, strip_prefix="#")
    if hashtags:
        normalized["hashtags"] = hashtags

    if not normalized:
        raise ValueError("Clip metadata provider returned no usable publishing copy.")
    return normalized


def _normalize_text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _normalize_list(value: Any, *, limit: int, strip_prefix: str = "") -> list[str]:
    if isinstance(value, str):
        values = value.replace(",", " ").split() if strip_prefix else [value]
    elif isinstance(value, list):
        values = value
    else:
        return []

    result: list[str] = []
    seen: set[str] = set()
    for item in values:
        if not isinstance(item, str):
            continue
        normalized = item.strip()
        if strip_prefix:
            normalized = normalized.lstrip(strip_prefix).strip()
        if not normalized:
            continue
        key = normalized.casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(normalized)
        if len(result) >= limit:
            break
    return result
