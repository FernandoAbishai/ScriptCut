"""Focused regressions for caption timestamps on the exported timeline."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from routers import export as export_router
from services.caption_generator import project_words_to_export_timeline


class CaptionTimelineSmokeTests(unittest.TestCase):
    def test_single_offset_segment_projects_to_zero(self) -> None:
        projected = project_words_to_export_timeline(
            [
                {"word": "A", "start": 100.0, "end": 101.0, "confidence": 0.9},
                {"word": "B", "start": 101.0, "end": 102.0, "confidence": 0.8},
            ],
            [{"start": 100.0, "end": 110.0}],
        )

        self.assertEqual(
            projected,
            [
                {"word": "A", "start": 0.0, "end": 1.0, "confidence": 0.9},
                {"word": "B", "start": 1.0, "end": 2.0, "confidence": 0.8},
            ],
        )

    def test_non_contiguous_segments_use_cumulative_export_offsets(self) -> None:
        projected = project_words_to_export_timeline(
            [
                {"word": "first", "start": 100.0, "end": 101.0},
                {"word": "second", "start": 200.0, "end": 201.0},
            ],
            [
                {"start": 100.0, "end": 110.0},
                {"start": 200.0, "end": 210.0},
            ],
        )

        self.assertEqual(
            [(word["word"], word["start"], word["end"]) for word in projected],
            [("first", 0.0, 1.0), ("second", 10.0, 11.0)],
        )

    def test_boundary_crossing_word_is_clamped_to_kept_segment(self) -> None:
        projected = project_words_to_export_timeline(
            [
                {"word": "start-boundary", "start": 99.8, "end": 100.4},
                {"word": "end-boundary", "start": 109.8, "end": 110.4},
            ],
            [{"start": 100.0, "end": 110.0}],
        )

        self.assertEqual(
            projected,
            [
                {"word": "start-boundary", "start": 0.0, "end": 0.4},
                {"word": "end-boundary", "start": 9.8, "end": 10.0},
            ],
        )

    def test_word_without_positive_overlap_is_excluded(self) -> None:
        projected = project_words_to_export_timeline(
            [
                {"word": "before", "start": 99.0, "end": 100.0},
                {"word": "after", "start": 110.0, "end": 111.0},
            ],
            [{"start": 100.0, "end": 110.0}],
        )

        self.assertEqual(projected, [])

    def test_deleted_source_index_is_excluded_before_projection(self) -> None:
        projected = project_words_to_export_timeline(
            [
                {"word": "keep", "start": 100.0, "end": 101.0},
                {"word": "delete", "start": 101.0, "end": 102.0},
                {"word": "also-keep", "start": 102.0, "end": 103.0},
            ],
            [{"start": 100.0, "end": 110.0}],
            {1},
        )

        self.assertEqual(
            [(word["word"], word["start"], word["end"]) for word in projected],
            [("keep", 0.0, 1.0), ("also-keep", 2.0, 3.0)],
        )

    def test_segment_order_and_actual_durations_define_cumulative_timing(self) -> None:
        projected = project_words_to_export_timeline(
            [
                {"word": "earlier-source", "start": 100.0, "end": 101.0},
                {"word": "later-source", "start": 200.0, "end": 201.0},
            ],
            [
                {"start": 200.0, "end": 203.0},
                {"start": 100.0, "end": 105.0},
            ],
        )

        self.assertEqual(
            [(word["word"], word["start"], word["end"]) for word in projected],
            [("later-source", 0.0, 1.0), ("earlier-source", 3.0, 4.0)],
        )

    def test_burn_in_ass_uses_export_timeline_for_offset_segment(self) -> None:
        captured: dict[str, str] = {}

        def fake_reencode_with_subs(
            input_path,
            output_path,
            segments,
            subtitle_path,
            **_kwargs,
        ):
            captured["ass"] = Path(subtitle_path).read_text(encoding="utf-8")
            Path(output_path).write_text("video", encoding="utf-8")
            return output_path

        with TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "input.mp4"
            input_path.write_text("placeholder", encoding="utf-8")
            request = export_router.ExportRequest(
                input_path=str(input_path),
                output_path=str(Path(tmp) / "clip.mp4"),
                keep_segments=[export_router.SegmentModel(start=600, end=645)],
                captions="burn-in",
                words=[export_router.ExportWordModel(word="burn-in", start=600, end=601)],
            )

            with (
                patch.object(export_router, "supports_ass_subtitles", return_value=True),
                patch.object(export_router, "export_reencode_with_subs", fake_reencode_with_subs),
            ):
                export_router.run_export(request)

        self.assertIn("Dialogue: 0,0:00:00.00,0:00:01.00", captured["ass"])
        self.assertNotIn("0:10:00", captured["ass"])

    def test_captions_none_preserves_export_without_caption_artifacts(self) -> None:
        def fake_stream_copy(input_path, output_path, segments, progress_callback=None):
            Path(output_path).write_text("video", encoding="utf-8")
            return output_path

        with TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "input.mp4"
            input_path.write_text("placeholder", encoding="utf-8")
            output_path = str(Path(tmp) / "clip.mp4")
            request = export_router.ExportRequest(
                input_path=str(input_path),
                output_path=output_path,
                keep_segments=[export_router.SegmentModel(start=100, end=110)],
                captions="none",
                words=[export_router.ExportWordModel(word="unused", start=100, end=101)],
            )

            with patch.object(export_router, "export_stream_copy", fake_stream_copy):
                result = export_router.run_export(request)

            self.assertEqual(result, {"status": "ok", "output_path": output_path})
            self.assertFalse(Path(output_path).with_suffix(".srt").exists())

    def test_declared_export_timeline_words_remain_supported(self) -> None:
        captured: dict[str, str] = {}

        def fake_stream_copy(input_path, output_path, segments, progress_callback=None):
            Path(output_path).write_text("video", encoding="utf-8")
            return output_path

        def fake_save_captions(content: str, output_path: str):
            captured["content"] = content
            return output_path

        with TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "input.mp4"
            input_path.write_text("placeholder", encoding="utf-8")
            request = export_router.ExportRequest(
                input_path=str(input_path),
                output_path=str(Path(tmp) / "clip.mp4"),
                keep_segments=[export_router.SegmentModel(start=600, end=620)],
                captions="sidecar",
                word_timeline="export",
                words=[export_router.ExportWordModel(word="local", start=0, end=1)],
            )

            with (
                patch.object(export_router, "export_stream_copy", fake_stream_copy),
                patch.object(export_router, "save_captions", fake_save_captions),
            ):
                export_router.run_export(request)

        self.assertIn("00:00:00,000 --> 00:00:01,000", captured["content"])

    def test_export_timeline_preserves_early_clip_words_that_overlap_source_time(self) -> None:
        captured: dict[str, str] = {}

        def fake_stream_copy(input_path, output_path, segments, progress_callback=None):
            Path(output_path).write_text("video", encoding="utf-8")
            return output_path

        def fake_save_captions(content: str, output_path: str):
            captured["content"] = content
            return output_path

        with TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "input.mp4"
            input_path.write_text("placeholder", encoding="utf-8")
            request = export_router.ExportRequest(
                input_path=str(input_path),
                output_path=str(Path(tmp) / "clip.mp4"),
                keep_segments=[export_router.SegmentModel(start=5, end=25)],
                captions="sidecar",
                captionStyle=export_router.CaptionStyleModel(wordsPerLine=1),
                word_timeline="export",
                words=[
                    export_router.ExportWordModel(word="early", start=0.5, end=1.0),
                    export_router.ExportWordModel(word="collision", start=6.0, end=7.0),
                    export_router.ExportWordModel(word="late", start=19.0, end=20.0),
                ],
            )

            with (
                patch.object(export_router, "export_stream_copy", fake_stream_copy),
                patch.object(export_router, "save_captions", fake_save_captions),
            ):
                export_router.run_export(request)

        self.assertIn("00:00:00,500 --> 00:00:01,000", captured["content"])
        self.assertIn("00:00:06,000 --> 00:00:07,000", captured["content"])
        self.assertIn("00:00:19,000 --> 00:00:20,000", captured["content"])

    def test_source_timeline_default_projects_identical_numbers(self) -> None:
        captured: dict[str, str] = {}

        def fake_stream_copy(input_path, output_path, segments, progress_callback=None):
            Path(output_path).write_text("video", encoding="utf-8")
            return output_path

        def fake_save_captions(content: str, output_path: str):
            captured["content"] = content
            return output_path

        with TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "input.mp4"
            input_path.write_text("placeholder", encoding="utf-8")
            request = export_router.ExportRequest(
                input_path=str(input_path),
                output_path=str(Path(tmp) / "clip.mp4"),
                keep_segments=[export_router.SegmentModel(start=5, end=25)],
                captions="sidecar",
                words=[export_router.ExportWordModel(word="source", start=6, end=7)],
            )

            self.assertEqual(request.word_timeline, "source")

            with (
                patch.object(export_router, "export_stream_copy", fake_stream_copy),
                patch.object(export_router, "save_captions", fake_save_captions),
            ):
                export_router.run_export(request)

        self.assertIn("00:00:01,000 --> 00:00:02,000", captured["content"])
        self.assertNotIn("00:00:06,000 --> 00:00:07,000", captured["content"])

    def test_burn_in_respects_declared_export_timeline(self) -> None:
        captured: dict[str, str] = {}

        def fake_reencode_with_subs(
            input_path,
            output_path,
            segments,
            subtitle_path,
            **_kwargs,
        ):
            captured["ass"] = Path(subtitle_path).read_text(encoding="utf-8")
            Path(output_path).write_text("video", encoding="utf-8")
            return output_path

        with TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "input.mp4"
            input_path.write_text("placeholder", encoding="utf-8")
            request = export_router.ExportRequest(
                input_path=str(input_path),
                output_path=str(Path(tmp) / "clip.mp4"),
                keep_segments=[export_router.SegmentModel(start=5, end=25)],
                captions="burn-in",
                captionStyle=export_router.CaptionStyleModel(wordsPerLine=1),
                word_timeline="export",
                words=[
                    export_router.ExportWordModel(word="early", start=0.5, end=1.0),
                    export_router.ExportWordModel(word="collision", start=6.0, end=7.0),
                    export_router.ExportWordModel(word="late", start=19.0, end=20.0),
                ],
            )

            with (
                patch.object(export_router, "supports_ass_subtitles", return_value=True),
                patch.object(export_router, "export_reencode_with_subs", fake_reencode_with_subs),
            ):
                export_router.run_export(request)

        self.assertIn("Dialogue: 0,0:00:00.50,0:00:01.00", captured["ass"])
        self.assertIn("Dialogue: 0,0:00:06.00,0:00:07.00", captured["ass"])
        self.assertIn("Dialogue: 0,0:00:19.00,0:00:20.00", captured["ass"])
        self.assertNotIn("Dialogue: 0,0:00:01.00,0:00:02.00", captured["ass"])

    def test_export_timeline_deletes_indices_from_supplied_word_array(self) -> None:
        captured: dict[str, str] = {}

        def fake_stream_copy(input_path, output_path, segments, progress_callback=None):
            Path(output_path).write_text("video", encoding="utf-8")
            return output_path

        def fake_save_captions(content: str, output_path: str):
            captured["content"] = content
            return output_path

        with TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "input.mp4"
            input_path.write_text("placeholder", encoding="utf-8")
            request = export_router.ExportRequest(
                input_path=str(input_path),
                output_path=str(Path(tmp) / "clip.mp4"),
                keep_segments=[export_router.SegmentModel(start=5, end=25)],
                captions="sidecar",
                captionStyle=export_router.CaptionStyleModel(wordsPerLine=1),
                word_timeline="export",
                words=[
                    export_router.ExportWordModel(word="keep-early", start=0.5, end=1.0),
                    export_router.ExportWordModel(word="delete", start=6.0, end=7.0),
                    export_router.ExportWordModel(word="keep-late", start=19.0, end=20.0),
                ],
                deleted_indices=[1],
            )

            with (
                patch.object(export_router, "export_stream_copy", fake_stream_copy),
                patch.object(export_router, "save_captions", fake_save_captions),
            ):
                export_router.run_export(request)

        self.assertIn("00:00:00,500 --> 00:00:01,000", captured["content"])
        self.assertIn("00:00:19,000 --> 00:00:20,000", captured["content"])
        self.assertNotIn("delete", captured["content"])

    def test_deleted_source_word_does_not_trigger_clip_local_fallback(self) -> None:
        def fake_stream_copy(input_path, output_path, segments, progress_callback=None):
            Path(output_path).write_text("video", encoding="utf-8")
            return output_path

        def unexpected_save_captions(content: str, output_path: str):
            self.fail("outside source word was incorrectly treated as export-local")

        with TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "input.mp4"
            input_path.write_text("placeholder", encoding="utf-8")
            request = export_router.ExportRequest(
                input_path=str(input_path),
                output_path=str(Path(tmp) / "clip.mp4"),
                keep_segments=[export_router.SegmentModel(start=100, end=110)],
                captions="sidecar",
                words=[
                    export_router.ExportWordModel(word="outside", start=0, end=1),
                    export_router.ExportWordModel(word="deleted", start=100, end=101),
                ],
                deleted_indices=[1],
            )

            with (
                patch.object(export_router, "export_stream_copy", fake_stream_copy),
                patch.object(export_router, "save_captions", unexpected_save_captions),
            ):
                result = export_router.run_export(request)

        self.assertNotIn("srt_path", result)

    def test_sidecar_caption_uses_export_timeline_for_offset_segment(self) -> None:
        captured: dict[str, str] = {}

        def fake_stream_copy(input_path, output_path, segments, progress_callback=None):
            Path(output_path).write_text("video", encoding="utf-8")
            return output_path

        def fake_save_captions(content: str, output_path: str):
            captured["content"] = content
            return output_path

        with TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "input.mp4"
            input_path.write_text("placeholder", encoding="utf-8")
            request = export_router.ExportRequest(
                input_path=str(input_path),
                output_path=str(Path(tmp) / "clip.mp4"),
                keep_segments=[export_router.SegmentModel(start=100, end=110)],
                captions="sidecar",
                words=[export_router.ExportWordModel(word="offset", start=100, end=101)],
            )

            with (
                patch.object(export_router, "export_stream_copy", fake_stream_copy),
                patch.object(export_router, "save_captions", fake_save_captions),
            ):
                export_router.run_export(request)

        self.assertIn("00:00:00,000 --> 00:00:01,000", captured["content"])

    def test_sidecar_uses_cumulative_timing_and_original_deleted_indices(self) -> None:
        captured: dict[str, str] = {}

        def fake_reencode(input_path, output_path, segments, **_kwargs):
            Path(output_path).write_text("video", encoding="utf-8")
            return output_path

        def fake_save_captions(content: str, output_path: str):
            captured["content"] = content
            return output_path

        with TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "input.mp4"
            input_path.write_text("placeholder", encoding="utf-8")
            request = export_router.ExportRequest(
                input_path=str(input_path),
                output_path=str(Path(tmp) / "clip.mp4"),
                keep_segments=[
                    export_router.SegmentModel(start=100, end=110),
                    export_router.SegmentModel(start=200, end=210),
                ],
                captions="sidecar",
                captionStyle=export_router.CaptionStyleModel(wordsPerLine=1),
                words=[
                    export_router.ExportWordModel(word="first", start=100, end=101),
                    export_router.ExportWordModel(word="deleted", start=101, end=102),
                    export_router.ExportWordModel(word="second", start=200, end=201),
                ],
                deleted_indices=[1],
            )

            with (
                patch.object(export_router, "export_reencode", fake_reencode),
                patch.object(export_router, "save_captions", fake_save_captions),
            ):
                export_router.run_export(request)

        self.assertIn("00:00:00,000 --> 00:00:01,000", captured["content"])
        self.assertIn("00:00:10,000 --> 00:00:11,000", captured["content"])
        self.assertNotIn("deleted", captured["content"])


if __name__ == "__main__":
    unittest.main()
