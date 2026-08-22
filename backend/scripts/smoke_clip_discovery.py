"""Deterministic smoke coverage for the Phase 5B.1 clip discovery contract."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from routers import ai as ai_router
from services import ai_provider
from services.clip_discovery import (
    normalize_clip_discovery,
)


def words_for_ranges(ranges: list[tuple[int, int, float, float]]) -> list[dict[str, object]]:
    words: list[dict[str, object]] = []
    for start_index, end_index, start_time, end_time in ranges:
        words.extend(
            [
                {"index": start_index, "word": "opening", "start": start_time, "end": start_time + 0.5},
                {"index": end_index, "word": "payoff", "start": end_time - 0.5, "end": end_time},
            ]
        )
    return words


def candidate(start_index: object, end_index: object, title: object = "Moment", reason: object = "Useful") -> dict[str, object]:
    return {
        "title": title,
        "startWordIndex": start_index,
        "endWordIndex": end_index,
        "startTime": 999,
        "endTime": 1000,
        "reason": reason,
    }


class ClipDiscoverySmokeTests(unittest.TestCase):
    def test_five_valid_candidates_return_five(self) -> None:
        ranges = [(index * 2, index * 2 + 1, index * 20, index * 20 + 15) for index in range(5)]
        result = normalize_clip_discovery(
            {"clips": [candidate(start, end, f"Moment {rank}", f"Reason {rank}") for rank, (start, end, _, _) in enumerate(ranges, 1)]},
            words_for_ranges(ranges),
        )

        self.assertEqual(result["returnedCount"], 5)
        self.assertEqual(result["shortfall"], 0)
        self.assertEqual(result["rejectedCount"], 0)
        self.assertEqual([clip["rank"] for clip in result["clips"]], [1, 2, 3, 4, 5])

    def test_eight_valid_candidates_keep_best_five(self) -> None:
        ranges = [(index * 2, index * 2 + 1, index * 20, index * 20 + 15) for index in range(8)]
        result = normalize_clip_discovery(
            {"clips": [candidate(start, end) for start, end, _, _ in ranges]},
            words_for_ranges(ranges),
        )

        self.assertEqual(len(result["clips"]), 5)
        self.assertEqual(result["returnedCount"], 5)
        self.assertEqual(result["rejectedCount"], 3)

    def test_provider_timestamps_are_ignored_and_transcript_times_are_authoritative(self) -> None:
        result = normalize_clip_discovery(
            {"clips": [candidate(0, 1)]},
            words_for_ranges([(0, 1, 31.42, 74.18)]),
        )
        clip = result["clips"][0]

        self.assertEqual(clip["startTime"], 31.42)
        self.assertEqual(clip["endTime"], 74.18)
        self.assertAlmostEqual(clip["duration"], 42.76)

    def test_invalid_start_index_is_rejected(self) -> None:
        result = normalize_clip_discovery({"clips": [candidate(99, 1)]}, words_for_ranges([(0, 1, 0, 15)]))
        self.assertEqual(result["returnedCount"], 0)

    def test_invalid_end_index_is_rejected(self) -> None:
        result = normalize_clip_discovery({"clips": [candidate(0, 99)]}, words_for_ranges([(0, 1, 0, 15)]))
        self.assertEqual(result["returnedCount"], 0)

    def test_reversed_indices_are_rejected(self) -> None:
        result = normalize_clip_discovery({"clips": [candidate(1, 0)]}, words_for_ranges([(0, 1, 0, 15)]))
        self.assertEqual(result["returnedCount"], 0)

    def test_non_integer_index_is_rejected(self) -> None:
        result = normalize_clip_discovery({"clips": [candidate("0", 1)]}, words_for_ranges([(0, 1, 0, 15)]))
        self.assertEqual(result["returnedCount"], 0)

    def test_duration_below_minimum_is_rejected(self) -> None:
        result = normalize_clip_discovery({"clips": [candidate(0, 1)]}, words_for_ranges([(0, 1, 0, 14.99)]))
        self.assertEqual(result["returnedCount"], 0)

    def test_duration_above_maximum_is_rejected(self) -> None:
        result = normalize_clip_discovery({"clips": [candidate(0, 1)]}, words_for_ranges([(0, 1, 0, 60.01)]))
        self.assertEqual(result["returnedCount"], 0)

    def test_empty_title_is_rejected(self) -> None:
        result = normalize_clip_discovery({"clips": [candidate(0, 1, "   ")]}, words_for_ranges([(0, 1, 0, 15)]))
        self.assertEqual(result["returnedCount"], 0)

    def test_empty_reason_is_rejected(self) -> None:
        result = normalize_clip_discovery({"clips": [candidate(0, 1, reason="\t")]}, words_for_ranges([(0, 1, 0, 15)]))
        self.assertEqual(result["returnedCount"], 0)

    def test_exact_duplicate_range_keeps_earliest_candidate(self) -> None:
        result = normalize_clip_discovery(
            {"clips": [candidate(0, 1, "First", "First reason"), candidate(0, 1, "Second", "Second reason")]},
            words_for_ranges([(0, 1, 0, 15)]),
        )
        self.assertEqual(result["returnedCount"], 1)
        self.assertEqual(result["clips"][0]["title"], "First")
        self.assertEqual(result["rejectedCount"], 1)

    def test_overlap_below_threshold_is_accepted(self) -> None:
        ranges = [(0, 1, 10, 55), (2, 3, 40, 80)]
        result = normalize_clip_discovery(
            {"clips": [candidate(0, 1), candidate(2, 3)]},
            words_for_ranges(ranges),
        )
        self.assertEqual(result["returnedCount"], 2)

    def test_overlap_at_threshold_is_rejected(self) -> None:
        ranges = [(0, 1, 0, 45), (2, 3, 18, 63)]
        result = normalize_clip_discovery(
            {"clips": [candidate(0, 1), candidate(2, 3)]},
            words_for_ranges(ranges),
        )
        self.assertEqual(result["returnedCount"], 1)
        self.assertEqual(result["rejectedCount"], 1)

    def test_provider_order_is_preserved_after_filtering(self) -> None:
        ranges = [(0, 1, 0, 15), (2, 3, 20, 35), (4, 5, 40, 55)]
        result = normalize_clip_discovery(
            {"clips": [candidate(2, 3, "Second"), candidate(0, 1, "First"), candidate(4, 5, "Third")]},
            words_for_ranges(ranges),
        )
        self.assertEqual([clip["title"] for clip in result["clips"]], ["Second", "First", "Third"])

    def test_rank_is_contiguous_and_id_is_stable(self) -> None:
        raw = {"clips": [candidate(0, 1), candidate(2, 3)]}
        words = words_for_ranges([(0, 1, 0, 15), (2, 3, 20, 35)])
        first = normalize_clip_discovery(raw, words)
        second = normalize_clip_discovery(raw, words)
        self.assertEqual([clip["rank"] for clip in first["clips"]], [1, 2])
        self.assertEqual([clip["id"] for clip in first["clips"]], ["clip-0-1", "clip-2-3"])
        self.assertEqual(first, second)

    def test_three_valid_candidates_expose_shortfall(self) -> None:
        ranges = [(0, 1, 0, 15), (2, 3, 20, 35), (4, 5, 40, 55)]
        result = normalize_clip_discovery(
            {"clips": [candidate(start, end) for start, end, _, _ in ranges]},
            words_for_ranges(ranges),
        )
        self.assertEqual(result["returnedCount"], 3)
        self.assertEqual(result["shortfall"], 2)

    def test_zero_valid_candidates_expose_full_shortfall(self) -> None:
        result = normalize_clip_discovery({"clips": [candidate(99, 100)]}, words_for_ranges([(0, 1, 0, 15)]))
        self.assertEqual(result["returnedCount"], 0)
        self.assertEqual(result["shortfall"], 5)

    def test_malformed_provider_structure_cannot_create_a_clip(self) -> None:
        for raw_provider in (None, [], {"clips": {}}, {"clips": [None, "not an object"]}):
            with self.subTest(raw_provider=raw_provider):
                result = normalize_clip_discovery(raw_provider, words_for_ranges([(0, 1, 0, 15)]))
                self.assertEqual(result["clips"], [])

    def test_no_candidate_is_fabricated_to_reach_five(self) -> None:
        result = normalize_clip_discovery({"clips": []}, words_for_ranges([]))
        self.assertEqual(result["clips"], [])
        self.assertEqual(result["returnedCount"], 0)
        self.assertEqual(result["shortfall"], 5)

    def test_request_defaults_and_invalid_combinations(self) -> None:
        request = ai_router.ClipRequest(transcript="", words=[])
        self.assertEqual(request.target_duration, 45)
        self.assertEqual(request.min_duration, 15)
        self.assertEqual(request.max_duration, 60)
        self.assertEqual(request.desired_count, 5)
        with self.assertRaises(ValueError):
            ai_router.ClipRequest(transcript="", words=[], desired_count=0)
        with self.assertRaises(ValueError):
            ai_router.ClipRequest(transcript="", words=[], min_duration=60, max_duration=15)
        with self.assertRaises(ValueError):
            ai_router.ClipRequest(transcript="", words=[], target_duration=10)

    def test_provider_prompt_requests_eight_best_first_candidates(self) -> None:
        captured: dict[str, str] = {}

        def fake_complete(**kwargs):
            captured["prompt"] = kwargs["prompt"]
            return '{"clips": []}'

        with patch.object(ai_provider.AIProvider, "complete", side_effect=fake_complete):
            ai_provider.create_clip_suggestion("hello", [{"index": 0, "word": "hello", "start": 0, "end": 15}])

        self.assertIn("8 ranked candidates", captured["prompt"])
        self.assertIn("15-60 seconds", captured["prompt"])
        self.assertIn("best candidate first", captured["prompt"])
        self.assertIn("Avoid substantially overlapping", captured["prompt"])
        self.assertNotIn("Suggest 1-3 clips", captured["prompt"])

    def test_run_create_clip_exposes_normalized_boundary_result(self) -> None:
        request = ai_router.ClipRequest(
            transcript="opening payoff",
            words=[
                ai_router.WordInfo(index=0, word="opening", start=31.42, end=31.9),
                ai_router.WordInfo(index=1, word="payoff", start=73.7, end=74.18),
            ],
        )
        raw = {"clips": [candidate(0, 1)]}

        with patch.object(ai_router, "create_clip_suggestion", return_value=raw) as provider_call:
            result = ai_router.run_create_clip(request)

        provider_call.assert_called_once()
        self.assertEqual(result["requestedCount"], 5)
        self.assertEqual(result["returnedCount"], 1)
        self.assertEqual(result["shortfall"], 4)
        self.assertEqual(result["clips"][0]["startTime"], 31.42)
        self.assertEqual(result["clips"][0]["endTime"], 74.18)
        self.assertNotEqual(result["clips"][0]["startTime"], raw["clips"][0]["startTime"])
        self.assertEqual(provider_call.call_args.kwargs["candidate_count"], 8)


if __name__ == "__main__":
    unittest.main()
