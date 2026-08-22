"""Deterministic smoke checks for optional clip publishing-copy generation."""

from __future__ import annotations

import json
import logging
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from services import ai_provider
from services.clip_metadata import normalize_clip_metadata


class ClipMetadataSmokeTests(unittest.TestCase):
    def test_valid_metadata_is_trimmed_bounded_and_deduplicated(self) -> None:
        result = normalize_clip_metadata(
            {
                "hook": "  A useful hook  ",
                "titles": ["  First title ", "first TITLE", "Second", "Third", "Fourth"],
                "description": "  A description.  ",
                "caption": "  Watch this.  ",
                "hashtags": ["#AI", " ai ", "#Video", "#Creator", "#One", "#Two", "#Three", "#Four", "#Five", "#Six"],
            }
        )
        self.assertEqual(
            result,
            {
                "hook": "A useful hook",
                "titles": ["First title", "Second", "Third"],
                "description": "A description.",
                "caption": "Watch this.",
                "hashtags": ["AI", "Video", "Creator", "One", "Two", "Three", "Four", "Five"],
            },
        )

    def test_string_title_and_partial_metadata_are_supported(self) -> None:
        self.assertEqual(
            normalize_clip_metadata({"titles": "  One title  ", "hashtags": "#ai #video"}),
            {"titles": ["One title"], "hashtags": ["ai", "video"]},
        )
        self.assertEqual(
            normalize_clip_metadata({"caption": "  Useful caption  ", "hashtags": ["#ai"]}),
            {"caption": "Useful caption", "hashtags": ["ai"]},
        )

    def test_complete_top_level_object_and_partial_provider_results_succeed(self) -> None:
        with patch.object(ai_provider.AIProvider, "complete", return_value='{"hook":"Valid hook"}'):
            self.assertEqual(ai_provider.create_clip_metadata("transcript"), {"hook": "Valid hook"})

        with patch.object(ai_provider.AIProvider, "complete", return_value='{"caption":"Useful partial copy"}'):
            self.assertEqual(
                ai_provider.create_clip_metadata("transcript"),
                {"caption": "Useful partial copy"},
            )

    def test_empty_or_malformed_metadata_fails_without_raw_output_logging(self) -> None:
        for value in (None, [], {}, {"hook": " ", "titles": [], "hashtags": []}, {"hook": 42}):
            with self.assertRaisesRegex(ValueError, "publishing copy|non-object"):
                normalize_clip_metadata(value)

        raw_provider_output = '{"hook":"transcript-derived private copy"'
        with self.assertLogs(ai_provider.logger, level=logging.WARNING) as captured:
            with patch.object(ai_provider.AIProvider, "complete", return_value=raw_provider_output):
                with self.assertRaisesRegex(ValueError, "invalid JSON"):
                    ai_provider.create_clip_metadata("private transcript")
        self.assertTrue(captured.output)
        self.assertNotIn(raw_provider_output, "\n".join(captured.output))

    def test_non_object_or_empty_provider_results_fail(self) -> None:
        for provider_output in (
            json.dumps([]),
            json.dumps([{"hook": "Valid-looking copy"}]),
            json.dumps(None),
            json.dumps("scalar"),
            json.dumps(42),
            '{"hook":"broken"',
            json.dumps({}),
            json.dumps({"hook": "", "titles": [" "]}),
        ):
            with patch.object(ai_provider.AIProvider, "complete", return_value=provider_output):
                with self.assertRaises(ValueError):
                    ai_provider.create_clip_metadata("transcript")

    def test_provider_exception_propagates(self) -> None:
        provider_error = RuntimeError("provider unavailable")
        with patch.object(ai_provider.AIProvider, "complete", side_effect=provider_error):
            with self.assertRaises(RuntimeError) as captured:
                ai_provider.create_clip_metadata("transcript")
        self.assertIs(captured.exception, provider_error)

    def test_malformed_result_cannot_become_empty_success(self) -> None:
        with patch.object(ai_provider.AIProvider, "complete", return_value="not json"):
            with self.assertRaisesRegex(ValueError, "invalid JSON"):
                ai_provider.create_clip_metadata("transcript")


if __name__ == "__main__":
    unittest.main()
