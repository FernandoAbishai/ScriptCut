"""Fast backend smoke checks for export, captions, and job lifecycle behavior."""

from __future__ import annotations

import time
import unittest
import subprocess
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from routers import export as export_router
from routers import ai as ai_router
from routers import system as system_router
from local_api_auth import is_authorized_local_api_request
from services import video_editor
from services import ai_provider
from services.caption_generator import generate_srt
from services.job_manager import JobManager


class BackendSmokeTests(unittest.TestCase):
    def test_packaged_backend_requires_local_api_token(self) -> None:
        self.assertTrue(is_authorized_local_api_request("", None))
        self.assertFalse(is_authorized_local_api_request("smoke-token", None))
        self.assertFalse(is_authorized_local_api_request("smoke-token", "wrong-token"))
        self.assertTrue(is_authorized_local_api_request("smoke-token", "smoke-token"))

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
            input_path = Path(tmp) / "input.mp4"
            input_path.write_text("placeholder", encoding="utf-8")
            output_path = str(Path(tmp) / "edited.mp4")
            request = export_router.ExportRequest(
                input_path=str(input_path),
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

    def test_burn_in_caption_falls_back_to_sidecar_without_ass_filter(self) -> None:
        captured: dict[str, str] = {}

        def fake_reencode(input_path, output_path, segments, **_kwargs):
            Path(output_path).write_text("video", encoding="utf-8")
            return output_path

        def fake_save_captions(content: str, output_path: str):
            captured["content"] = content
            Path(output_path).write_text(content, encoding="utf-8")
            return output_path

        with TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "input.mp4"
            input_path.write_text("placeholder", encoding="utf-8")
            output_path = str(Path(tmp) / "clip.mp4")
            request = export_router.ExportRequest(
                input_path=str(input_path),
                output_path=output_path,
                keep_segments=[export_router.SegmentModel(start=0, end=4)],
                aspectRatio="vertical",
                captions="burn-in",
                words=[export_router.ExportWordModel(word="caption", start=0, end=0.5)],
            )

            with (
                patch.object(export_router, "supports_ass_subtitles", return_value=False),
                patch.object(export_router, "export_reencode", fake_reencode),
                patch.object(export_router, "save_captions", fake_save_captions),
            ):
                result = export_router.run_export(request)

        self.assertTrue(result["srt_path"].endswith(".srt"))
        self.assertIn("Burn-in captions are unavailable", result["warnings"][0])
        self.assertIn("caption", captured["content"])

    def test_export_without_output_path_uses_backend_temp_file(self) -> None:
        captured: dict[str, str] = {}

        def fake_stream_copy(input_path, output_path, segments, progress_callback=None):
            captured["output_path"] = output_path
            Path(output_path).write_text("video", encoding="utf-8")
            return output_path

        with TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "input clip.mp4"
            input_path.write_text("placeholder", encoding="utf-8")
            request = export_router.ExportRequest(
                input_path=str(input_path),
                keep_segments=[export_router.SegmentModel(start=0, end=4)],
                format="mp4",
            )

            with patch.object(export_router, "export_stream_copy", fake_stream_copy):
                result = export_router.run_export(request)

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["output_path"], captured["output_path"])
        self.assertTrue(result["output_path"].endswith(".mp4"))
        self.assertIn("scriptcut_exports", result["output_path"])

    def test_export_preflight_rejects_missing_input_file(self) -> None:
        with TemporaryDirectory() as tmp:
            request = export_router.ExportRequest(
                input_path=str(Path(tmp) / "missing.mp4"),
                output_path=str(Path(tmp) / "edited.mp4"),
                keep_segments=[export_router.SegmentModel(start=0, end=4)],
            )

            with self.assertRaisesRegex(ValueError, "Input media file was not found"):
                export_router.run_export(request)

    def test_export_preflight_rejects_bad_destination_folder(self) -> None:
        with TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "input.mp4"
            input_path.write_text("placeholder", encoding="utf-8")
            request = export_router.ExportRequest(
                input_path=str(input_path),
                output_path=str(Path(tmp) / "missing-folder" / "edited.mp4"),
                keep_segments=[export_router.SegmentModel(start=0, end=4)],
            )

            with self.assertRaisesRegex(ValueError, "Export destination folder does not exist"):
                export_router.run_export(request)

    def test_export_preflight_rejects_source_overwrite(self) -> None:
        with TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "input.mp4"
            input_path.write_text("placeholder", encoding="utf-8")
            request = export_router.ExportRequest(
                input_path=str(input_path),
                output_path=str(input_path),
                keep_segments=[export_router.SegmentModel(start=0, end=4)],
            )

            with self.assertRaisesRegex(ValueError, "cannot overwrite"):
                export_router.run_export(request)

    def test_reencode_video_only_does_not_map_audio(self) -> None:
        captured: dict[str, list[str]] = {}

        def fake_run_ffmpeg(cmd, progress_callback=None):
            captured["cmd"] = cmd
            return subprocess.CompletedProcess(cmd, 0, "", "")

        with TemporaryDirectory() as tmp:
            input_path = str(Path(tmp) / "input.mp4")
            output_path = str(Path(tmp) / "output.mp4")
            Path(input_path).write_text("placeholder", encoding="utf-8")

            with (
                patch.object(video_editor, "_find_ffmpeg", return_value="ffmpeg"),
                patch.object(video_editor, "_has_audio_stream", return_value=False),
                patch.object(video_editor, "_run_ffmpeg", fake_run_ffmpeg),
            ):
                result = video_editor.export_reencode(
                    input_path,
                    output_path,
                    [{"start": 0, "end": 2}],
                )

        self.assertEqual(Path(result).resolve(), Path(output_path).resolve())
        command_text = " ".join(captured["cmd"])
        self.assertNotIn("[outa]", command_text)
        self.assertIn("concat=n=1:v=1:a=0[outv]", command_text)

    def test_subtitle_export_uses_explicit_ass_filename_option(self) -> None:
        captured: dict[str, list[str]] = {}

        def fake_run_ffmpeg(cmd, progress_callback=None):
            captured["cmd"] = cmd
            return subprocess.CompletedProcess(cmd, 0, "", "")

        with TemporaryDirectory() as tmp:
            input_path = str(Path(tmp) / "input.mp4")
            output_path = str(Path(tmp) / "output.mp4")
            subtitle_path = str(Path(tmp) / "captions.ass")
            Path(input_path).write_text("placeholder", encoding="utf-8")
            Path(subtitle_path).write_text("[Script Info]", encoding="utf-8")

            with (
                patch.object(video_editor, "_find_ffmpeg", return_value="ffmpeg"),
                patch.object(video_editor, "_has_audio_stream", return_value=False),
                patch.object(video_editor, "_run_ffmpeg", fake_run_ffmpeg),
            ):
                video_editor.export_reencode_with_subs(
                    input_path,
                    output_path,
                    [{"start": 0, "end": 2}],
                    subtitle_path,
                )

        filter_complex = captured["cmd"][captured["cmd"].index("-filter_complex") + 1]
        self.assertIn("ass=filename='", filter_complex)
        self.assertNotIn("ass='/", filter_complex)

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

    def test_parakeet_auto_resolution_and_model_normalization(self) -> None:
        transcription = self._load_transcription_service_or_skip()
        original_nemo = transcription.NEMO_AVAILABLE
        original_whisperx = transcription.WHISPERX_AVAILABLE
        try:
            transcription.NEMO_AVAILABLE = True
            transcription.WHISPERX_AVAILABLE = True
            self.assertEqual(transcription._resolve_engine("auto"), "parakeet")
            self.assertEqual(
                transcription._normalize_model_for_engine("base", "parakeet"),
                transcription.PARAKEET_DEFAULT_MODEL,
            )
            self.assertEqual(
                transcription._normalize_model_for_engine(transcription.PARAKEET_DEFAULT_MODEL, "parakeet"),
                transcription.PARAKEET_DEFAULT_MODEL,
            )
        finally:
            transcription.NEMO_AVAILABLE = original_nemo
            transcription.WHISPERX_AVAILABLE = original_whisperx

    def test_transcription_engine_status_includes_parakeet(self) -> None:
        transcription = self._load_transcription_service_or_skip()
        status = transcription.get_transcription_engine_status()
        self.assertIn("parakeet", status["engines"])
        self.assertTrue(status["engines"]["parakeet"]["first_class"])
        self.assertEqual(status["engines"]["parakeet"]["default_model"], transcription.PARAKEET_DEFAULT_MODEL)

    def test_system_checks_payload_covers_onboarding_requirements(self) -> None:
        import asyncio

        result = asyncio.run(system_router.system_checks())
        self.assertEqual(result["status"], "ok")
        for key in ("backend", "python", "ffmpeg", "transcription", "audio", "background"):
            self.assertIn(key, result["checks"])
            self.assertIn("ok", result["checks"][key])
            self.assertIn("detail", result["checks"][key])

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
            input_path = Path(tmp) / "input.mp4"
            input_path.write_text("placeholder", encoding="utf-8")
            output_path = str(Path(tmp) / "edited.mp4")
            background_path = output_path + ".bg.mp4"
            request = export_router.ExportRequest(
                input_path=str(input_path),
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
            input_path = Path(tmp) / "input.mp4"
            input_path.write_text("placeholder", encoding="utf-8")
            output_path = str(Path(tmp) / "edited.mp4")
            muxed_path = output_path + ".muxed.mp4"
            request = export_router.ExportRequest(
                input_path=str(input_path),
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

    def test_clip_request_includes_shorts_platform_guidance(self) -> None:
        captured: dict[str, str] = {}

        def fake_complete(**kwargs):
            captured["prompt"] = kwargs["prompt"]
            return """
            {
              "clips": [
                {
                  "title": "Strong opener",
                  "startWordIndex": 0,
                  "endWordIndex": 1,
                  "startTime": 0,
                  "endTime": 31,
                  "reason": "Clear hook"
                }
              ]
            }
            """

        request = ai_router.ClipRequest(
            transcript="hello world",
            words=[
                ai_router.WordInfo(index=0, word="hello", start=0, end=0.5),
                ai_router.WordInfo(index=1, word="world", start=30.5, end=31),
            ],
            target_duration=60,
            platform="shorts",
            instruction="favor surprising hooks",
            min_duration=30,
            max_duration=90,
        )

        with patch.object(ai_provider.AIProvider, "complete", side_effect=fake_complete):
            result = ai_router.run_create_clip(request)

        self.assertEqual(len(result["clips"]), 1)
        self.assertIn("shorts", captured["prompt"])
        self.assertIn("30-90 seconds", captured["prompt"])
        self.assertIn("favor surprising hooks", captured["prompt"])

    def test_director_edit_plan_returns_clip_package(self) -> None:
        captured: dict[str, str] = {}

        def fake_complete(**kwargs):
            captured["prompt"] = kwargs["prompt"]
            return """
            {
              "summary": "Make a short from the strongest hook.",
              "suggestions": [
                {"action": "delete", "startWordIndex": 0, "endWordIndex": 0, "reason": "Slow start", "confidence": 0.9}
              ],
              "directorClip": {
                "title": "Best moment",
                "startWordIndex": 1,
                "endWordIndex": 2,
                "reason": "Strong payoff"
              },
              "directorPackage": {
                "hook": "This changed everything",
                "title": "Best moment",
                "caption": "Watch the shift",
                "description": "A concise social package",
                "hashtags": ["shorts", "#podcast"]
              },
              "directorNotes": ["Use creator captions"]
            }
            """

        request = ai_router.EditPlanRequest(
            instruction="make a 60 second short",
            transcript="well this changed everything",
            words=[
                ai_router.WordInfo(index=0, word="well", start=0, end=0.2),
                ai_router.WordInfo(index=1, word="this", start=0.2, end=0.5),
                ai_router.WordInfo(index=2, word="changed", start=0.5, end=1.0),
            ],
            mode="director",
            platform="shorts",
            target_duration=60,
        )

        with patch.object(ai_provider.AIProvider, "complete", side_effect=fake_complete):
            result = ai_router.run_edit_plan(request)

        self.assertIn("Target platform: shorts", captured["prompt"])
        self.assertIn("directorClip", captured["prompt"])
        self.assertEqual(result["directorClip"]["startTime"], 0.2)
        self.assertEqual(result["directorClip"]["endTime"], 1.0)
        self.assertEqual(result["directorPackage"]["hashtags"], ["shorts", "podcast"])
        self.assertEqual(result["directorNotes"], ["Use creator captions"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
