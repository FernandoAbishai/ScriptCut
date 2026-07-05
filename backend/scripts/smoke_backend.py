"""Fast backend smoke checks for export, captions, and job lifecycle behavior."""

from __future__ import annotations

import time
import unittest
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from routers import export as export_router
from services import ai_provider
from services.caption_generator import generate_srt
from services.job_manager import JobManager


class BackendSmokeTests(unittest.TestCase):
    def test_sidecar_export_uses_caption_line_length(self) -> None:
        captured: dict[str, str] = {}

        def fake_stream_copy(input_path, output_path, segments, progress_callback=None):
            Path(output_path).write_text("video", encoding="utf-8")
            return output_path

        def fake_save_captions(content: str, output_path: str):
            captured["content"] = content
            Path(output_path).write_text(content, encoding="utf-8")
            return output_path

        with TemporaryDirectory() as tmp:
            output_path = str(Path(tmp) / "edited.mp4")
            request = export_router.ExportRequest(
                input_path=str(Path(tmp) / "input.mp4"),
                output_path=output_path,
                keep_segments=[export_router.SegmentModel(start=0, end=4)],
                captions="sidecar",
                captionStyle=export_router.CaptionStyleModel(wordsPerLine=2),
                words=[
                    export_router.ExportWordModel(word="one", start=0, end=0.5),
                    export_router.ExportWordModel(word="two", start=0.5, end=1),
                    export_router.ExportWordModel(word="three", start=1, end=1.5),
                ],
            )

            with (
                patch.object(export_router, "export_stream_copy", fake_stream_copy),
                patch.object(export_router, "save_captions", fake_save_captions),
            ):
                result = export_router.run_export(request)

        self.assertTrue(result["srt_path"].endswith(".srt"))
        self.assertIn("one two", captured["content"])
        self.assertIn("three", captured["content"])
        self.assertEqual(captured["content"].count("-->"), 2)

    def test_captions_hide_deleted_words(self) -> None:
        srt = generate_srt(
            [
                {"word": "keep", "start": 0, "end": 0.5},
                {"word": "hide", "start": 0.5, "end": 1},
                {"word": "also-keep", "start": 1, "end": 1.5},
            ],
            deleted_indices={1},
            words_per_line=8,
        )

        self.assertIn("keep also-keep", srt)
        self.assertNotIn("hide", srt)

    def test_parakeet_timestamps_normalize_to_editor_contract(self) -> None:
        transcription = self._load_transcription_service_or_skip()
        words = [
            {"word": "Hello", "start": 0, "end": 0.4, "score": 0.92},
            {"word": "world", "start": 0.4, "end": 0.9},
        ]
        segments = [
            {"segment": "Hello world", "start": 0, "end": 0.9},
        ]

        normalized_words = [transcription._normalize_parakeet_word(stamp) for stamp in words]
        normalized_segments = transcription._normalize_parakeet_segments(segments, normalized_words, "Hello world")

        self.assertEqual(
            normalized_words,
            [
                {"word": "Hello", "start": 0.0, "end": 0.4, "confidence": 0.92},
                {"word": "world", "start": 0.4, "end": 0.9, "confidence": 0.9},
            ],
        )
        self.assertEqual(normalized_segments[0]["words"], normalized_words)
        self.assertEqual(normalized_segments[0]["text"], "Hello world")

    def test_unknown_transcription_engine_fails_clearly(self) -> None:
        transcription = self._load_transcription_service_or_skip()
        with self.assertRaisesRegex(RuntimeError, "Unknown transcription engine"):
            transcription._resolve_engine("not-real")

    def _load_transcription_service_or_skip(self):
        try:
            from services import transcription
            return transcription
        except ModuleNotFoundError as exc:
            self.skipTest(f"transcription stack unavailable in lean smoke environment: {exc}")

    def test_canceling_job_finalizes_as_canceled(self) -> None:
        manager = JobManager()

        def target(progress):
            time.sleep(0.05)
            progress(50, "halfway")

        job_id = manager.create("smoke", target)
        time.sleep(0.01)
        cancel_response = manager.cancel(job_id)
        self.assertIsNotNone(cancel_response)
        self.assertEqual(cancel_response["status"], "canceling")

        time.sleep(0.12)
        final = manager.get(job_id)
        self.assertIsNotNone(final)
        self.assertEqual(final["status"], "canceled")

    def test_retry_failed_job_tracks_original_and_attempt(self) -> None:
        manager = JobManager()

        def target(progress):
            progress(20, "about to fail")
            raise RuntimeError("expected failure")

        job_id = manager.create("smoke", target)
        time.sleep(0.08)
        failed = manager.get(job_id)
        self.assertIsNotNone(failed)
        self.assertEqual(failed["status"], "failed")

        retry_job_id = manager.retry(job_id)
        self.assertIsNotNone(retry_job_id)
        time.sleep(0.08)
        retried = manager.get(retry_job_id)
        self.assertIsNotNone(retried)
        self.assertEqual(retried["status"], "failed")
        self.assertEqual(retried["originalJobId"], job_id)
        self.assertEqual(retried["attempt"], 2)

    def test_background_failure_cleans_temporary_export_artifact(self) -> None:
        def fake_stream_copy(input_path, output_path, segments, progress_callback=None):
            Path(output_path).write_text("video", encoding="utf-8")
            return output_path

        def fake_remove_background(input_path, output_path, replacement, replacement_value, progress_callback=None):
            Path(output_path).write_text("partial background render", encoding="utf-8")
            raise RuntimeError("background removal failed")

        with TemporaryDirectory() as tmp:
            output_path = str(Path(tmp) / "edited.mp4")
            background_path = output_path + ".bg.mp4"
            request = export_router.ExportRequest(
                input_path=str(Path(tmp) / "input.mp4"),
                output_path=output_path,
                keep_segments=[export_router.SegmentModel(start=0, end=4)],
                backgroundRemoval=export_router.BackgroundRemovalModel(enabled=True),
            )

            with (
                patch.object(export_router, "export_stream_copy", fake_stream_copy),
                patch.object(export_router, "remove_background_on_export", fake_remove_background),
            ):
                with self.assertRaises(RuntimeError):
                    export_router.run_export(request)

        self.assertFalse(Path(background_path).exists())

    def test_audio_enhancement_failure_cleans_temporary_mux_artifact(self) -> None:
        def fake_stream_copy(input_path, output_path, segments, progress_callback=None):
            Path(output_path).write_text("video", encoding="utf-8")
            return output_path

        def fake_clean_audio(input_path, output_path):
            Path(output_path).write_text("audio", encoding="utf-8")

        def fake_mux_audio(video_path, audio_path, output_path):
            Path(output_path).write_text("partial mux", encoding="utf-8")
            raise RuntimeError("mux failed")

        with TemporaryDirectory() as tmp:
            output_path = str(Path(tmp) / "edited.mp4")
            muxed_path = output_path + ".muxed.mp4"
            request = export_router.ExportRequest(
                input_path=str(Path(tmp) / "input.mp4"),
                output_path=output_path,
                keep_segments=[export_router.SegmentModel(start=0, end=4)],
                enhanceAudio=True,
            )

            with (
                patch.object(export_router, "export_stream_copy", fake_stream_copy),
                patch.object(export_router, "clean_audio", fake_clean_audio),
                patch.object(export_router, "_mux_audio", fake_mux_audio),
            ):
                result = export_router.run_export(request)

        self.assertEqual(result["status"], "ok")
        self.assertIn("warnings", result)
        self.assertFalse(Path(muxed_path).exists())

    def test_edit_plan_normalizes_safe_delete_ranges(self) -> None:
        words = [
            {"index": 0, "word": "Well", "start": 0.0, "end": 0.2},
            {"index": 1, "word": "I", "start": 0.2, "end": 0.4},
            {"index": 2, "word": "think", "start": 0.4, "end": 0.8},
        ]
        response = """
        {
          "summary": "Tighten the opening.",
          "suggestions": [
            {"action": "delete", "startWordIndex": 0, "endWordIndex": 0, "reason": "Filler opener", "confidence": 0.91},
            {"action": "replace", "startWordIndex": 1, "endWordIndex": 2, "reason": "Unsupported action", "confidence": 0.8},
            {"action": "delete", "startWordIndex": 9, "endWordIndex": 10, "reason": "Out of range", "confidence": 0.8}
          ]
        }
        """

        with patch.object(ai_provider.AIProvider, "complete", return_value=response):
            result = ai_provider.create_edit_plan(
                instruction="Make this tighter",
                transcript="Well I think",
                words=words,
            )

        self.assertEqual(result["summary"], "Tighten the opening.")
        self.assertEqual(len(result["suggestions"]), 1)
        suggestion = result["suggestions"][0]
        self.assertEqual(suggestion["action"], "delete")
        self.assertEqual(suggestion["startWordIndex"], 0)
        self.assertEqual(suggestion["endWordIndex"], 0)
        self.assertEqual(suggestion["startTime"], 0.0)
        self.assertEqual(suggestion["endTime"], 0.2)
        self.assertEqual(suggestion["text"], "Well")


if __name__ == "__main__":
    unittest.main(verbosity=2)
