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


if __name__ == "__main__":
    unittest.main(verbosity=2)
