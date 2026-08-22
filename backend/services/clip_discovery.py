"""Deterministic, transcript-grounded normalization for AI clip discovery."""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Mapping


DISCOVERY_TARGET_COUNT = 5
PROVIDER_CANDIDATE_POOL = 8
DISCOVERY_TARGET_DURATION = 45
DISCOVERY_MIN_DURATION = 15
DISCOVERY_MAX_DURATION = 60
DISCOVERY_OVERLAP_THRESHOLD = 0.60
MAX_DISCOVERY_COUNT = 20


@dataclass(frozen=True)
class DiscoveryPolicy:
    """The request-level policy used to normalize one provider response."""

    target_duration: int = DISCOVERY_TARGET_DURATION
    min_duration: int = DISCOVERY_MIN_DURATION
    max_duration: int = DISCOVERY_MAX_DURATION
    desired_count: int = DISCOVERY_TARGET_COUNT
    provider_candidate_pool: int = PROVIDER_CANDIDATE_POOL
    overlap_threshold: float = DISCOVERY_OVERLAP_THRESHOLD

    def __post_init__(self) -> None:
        if self.desired_count <= 0 or self.desired_count > MAX_DISCOVERY_COUNT:
            raise ValueError(f"desired_count must be between 1 and {MAX_DISCOVERY_COUNT}")
        if self.min_duration <= 0:
            raise ValueError("min_duration must be greater than zero")
        if self.max_duration < self.min_duration:
            raise ValueError("max_duration must be greater than or equal to min_duration")
        if not self.min_duration <= self.target_duration <= self.max_duration:
            raise ValueError("target_duration must be between min_duration and max_duration")
        if self.provider_candidate_pool <= 0:
            raise ValueError("provider_candidate_pool must be greater than zero")
        if not 0 < self.overlap_threshold <= 1:
            raise ValueError("overlap_threshold must be greater than zero and at most one")


DEFAULT_DISCOVERY_POLICY = DiscoveryPolicy()


def normalize_clip_discovery(
    raw_provider: object,
    transcript_words: list[Mapping[str, object]],
    policy: DiscoveryPolicy = DEFAULT_DISCOVERY_POLICY,
) -> dict[str, object]:
    """Normalize untrusted provider candidates into the public discovery contract.

    Provider order is the only quality ordering used here. Candidate indices and
    timestamps are validated against transcript words, and the latter are always
    derived from the authoritative transcript before overlap filtering.
    """

    raw_candidates = _raw_candidates(raw_provider)
    candidates = raw_candidates[: policy.provider_candidate_pool]
    rejected_count = max(0, len(raw_candidates) - len(candidates))
    word_by_index = _word_lookup(transcript_words)
    accepted: list[dict[str, object]] = []
    accepted_ranges: set[tuple[int, int]] = set()

    for candidate in candidates:
        normalized = _normalize_candidate(candidate, word_by_index, policy)
        if normalized is None:
            rejected_count += 1
            continue

        range_key = (normalized["startWordIndex"], normalized["endWordIndex"])
        if range_key in accepted_ranges:
            rejected_count += 1
            continue

        if any(
            _overlap_coefficient(normalized, previous) >= policy.overlap_threshold
            for previous in accepted
        ):
            rejected_count += 1
            continue

        if len(accepted) >= policy.desired_count:
            rejected_count += 1
            continue

        accepted_ranges.add(range_key)
        accepted.append(normalized)

    for rank, clip in enumerate(accepted, start=1):
        clip["rank"] = rank

    returned_count = len(accepted)
    return {
        "clips": accepted,
        "requestedCount": policy.desired_count,
        "returnedCount": returned_count,
        "shortfall": max(0, policy.desired_count - returned_count),
        "rejectedCount": rejected_count,
    }


def _raw_candidates(raw_provider: object) -> list[object]:
    if not isinstance(raw_provider, Mapping):
        return []
    candidates = raw_provider.get("clips")
    return candidates if isinstance(candidates, list) else []


def _word_lookup(words: list[Mapping[str, object]]) -> dict[int, Mapping[str, object]]:
    lookup: dict[int, Mapping[str, object]] = {}
    for word in words:
        index = word.get("index")
        if _is_integer(index) and index not in lookup:
            lookup[index] = word
    return lookup


def _normalize_candidate(
    candidate: object,
    word_by_index: dict[int, Mapping[str, object]],
    policy: DiscoveryPolicy,
) -> dict[str, object] | None:
    if not isinstance(candidate, Mapping):
        return None

    start_index = candidate.get("startWordIndex")
    end_index = candidate.get("endWordIndex")
    if (
        not _is_integer(start_index)
        or not _is_integer(end_index)
        or start_index not in word_by_index
        or end_index not in word_by_index
        or start_index > end_index
    ):
        return None

    title = _meaningful_text(candidate.get("title"))
    reason = _meaningful_text(candidate.get("reason"))
    if title is None or reason is None:
        return None

    start_time = _finite_number(word_by_index[start_index].get("start"))
    end_time = _finite_number(word_by_index[end_index].get("end"))
    if start_time is None or end_time is None or end_time <= start_time:
        return None

    duration = end_time - start_time
    if duration < policy.min_duration or duration > policy.max_duration:
        return None

    return {
        "id": f"clip-{start_index}-{end_index}",
        "title": title,
        "startWordIndex": start_index,
        "endWordIndex": end_index,
        "startTime": start_time,
        "endTime": end_time,
        "duration": duration,
        "reason": reason,
    }


def _overlap_coefficient(left: Mapping[str, object], right: Mapping[str, object]) -> float:
    left_start = left["startTime"]
    left_end = left["endTime"]
    right_start = right["startTime"]
    right_end = right["endTime"]
    intersection = max(0.0, min(left_end, right_end) - max(left_start, right_start))
    shortest_duration = min(left["duration"], right["duration"])
    return intersection / shortest_duration


def _is_integer(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _finite_number(value: object) -> float | int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value):
        return None
    return value


def _meaningful_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    return text or None
