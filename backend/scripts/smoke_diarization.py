"""Deterministic compatibility and failure-path smokes for diarization."""

from __future__ import annotations

import os
import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from services import diarization


class FakeAnnotation:
    def __init__(self, tracks):
        self.tracks = tracks

    def itertracks(self, yield_label=False):
        if not yield_label:
            raise AssertionError("speaker mapping must request labels")
        yield from self.tracks


class FakePipeline:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls = []

    def __call__(self, audio_path, num_speakers=None):
        self.calls.append((audio_path, num_speakers))
        if self.error:
            raise self.error
        return self.result


class Pyannote3Pipeline:
    pipeline = None
    calls = []

    @classmethod
    def from_pretrained(cls, checkpoint, use_auth_token=None):
        cls.calls.append((checkpoint, use_auth_token))
        return cls.pipeline


class Pyannote4Pipeline:
    pipeline = None
    calls = []

    @classmethod
    def from_pretrained(cls, checkpoint, *, token=None):
        cls.calls.append((checkpoint, token))
        return cls.pipeline


def install_pyannote_stub(pipeline_class):
    audio_module = types.ModuleType("pyannote.audio")
    audio_module.Pipeline = pipeline_class
    return patch.dict(
        sys.modules,
        {
            "pyannote": types.ModuleType("pyannote"),
            "pyannote.audio": audio_module,
        },
    )


class DiarizationCompatibilitySmokeTests(unittest.TestCase):
    def setUp(self):
        diarization._pipeline_cache.clear()
        Pyannote3Pipeline.calls = []
        Pyannote4Pipeline.calls = []

    def tearDown(self):
        diarization._pipeline_cache.clear()

    def _load_with(self, pipeline_class, token="hf-secret"):
        with install_pyannote_stub(pipeline_class):
            return diarization._get_pipeline(token, diarization.torch.device("cpu"))

    def test_pyannote_3_authentication_uses_use_auth_token(self):
        expected = FakePipeline()
        Pyannote3Pipeline.pipeline = expected

        result = self._load_with(Pyannote3Pipeline)

        self.assertIs(result, expected)
        self.assertEqual(
            Pyannote3Pipeline.calls,
            [("pyannote/speaker-diarization-3.0", "hf-secret")],
        )

    def test_pyannote_4_authentication_uses_token(self):
        expected = FakePipeline()
        Pyannote4Pipeline.pipeline = expected

        result = self._load_with(Pyannote4Pipeline)

        self.assertIs(result, expected)
        self.assertEqual(
            Pyannote4Pipeline.calls,
            [("pyannote/speaker-diarization-3.0", "hf-secret")],
        )

    def test_pyannote_3_annotation_maps_words_segments_and_segment_words(self):
        result = self._run_mapping(
            Pyannote3Pipeline,
            FakeAnnotation(self._speaker_tracks()),
        )

        self._assert_mapping(result)

    def test_pyannote_4_diarize_output_maps_words_segments_and_segment_words(self):
        result = self._run_mapping(
            Pyannote4Pipeline,
            SimpleNamespace(
                speaker_diarization=FakeAnnotation(self._speaker_tracks())
            ),
        )

        self._assert_mapping(result)

    def test_no_token_returns_unchanged_transcription(self):
        transcription = {"words": [{"word": "hello", "start": 0, "end": 1}]}
        with patch.dict(os.environ, {}, clear=True), patch.object(
            diarization, "_get_pipeline", side_effect=AssertionError("not called")
        ):
            result = diarization.diarize_and_label(
                transcription, "input.wav", hf_token=None, use_gpu=False
            )

        self.assertIs(result, transcription)
        self.assertNotIn("speaker", transcription["words"][0])

    def test_model_loading_failure_is_graceful_and_secret_safe(self):
        class FailingPipeline:
            @classmethod
            def from_pretrained(cls, checkpoint, *, token=None):
                raise RuntimeError(f"model rejected {token}")

        with install_pyannote_stub(FailingPipeline), self.assertLogs(
            diarization.logger, level="ERROR"
        ) as captured:
            result = diarization.diarize_and_label(
                {"words": []}, "input.wav", hf_token="hf-secret", use_gpu=False
            )

        self.assertEqual(result, {"words": []})
        self.assertNotIn("hf-secret", "\n".join(captured.output))
        self.assertIn("[REDACTED]", "\n".join(captured.output))

    def test_pipeline_execution_failure_is_graceful_and_secret_safe(self):
        pipeline = FakePipeline(error=RuntimeError("execution leaked hf-secret"))
        Pyannote4Pipeline.pipeline = pipeline
        transcription = {"words": []}

        with install_pyannote_stub(Pyannote4Pipeline), self.assertLogs(
            diarization.logger, level="ERROR"
        ) as captured:
            result = diarization.diarize_and_label(
                transcription, "input.wav", hf_token="hf-secret", use_gpu=False
            )

        self.assertIs(result, transcription)
        self.assertNotIn("hf-secret", "\n".join(captured.output))
        self.assertIn("[REDACTED]", "\n".join(captured.output))

    def _run_mapping(self, pipeline_class, output):
        pipeline_class.pipeline = FakePipeline(result=output)
        transcription = {
            "words": [
                {"word": "first", "start": 0.1, "end": 0.4},
                {"word": "second", "start": 1.1, "end": 1.4},
                {"word": "none", "start": 3.0, "end": 3.2},
            ],
            "segments": [
                {
                    "start": 0.0,
                    "end": 0.9,
                    "words": [{"word": "segment-first", "start": 0.2, "end": 0.5}],
                },
                {
                    "start": 1.0,
                    "end": 1.9,
                    "words": [{"word": "segment-second", "start": 1.2, "end": 1.5}],
                },
                {
                    "start": 3.0,
                    "end": 3.2,
                    "words": [{"word": "segment-none", "start": 3.0, "end": 3.2}],
                },
            ],
        }
        with install_pyannote_stub(pipeline_class):
            return diarization.diarize_and_label(
                transcription, "input.wav", hf_token="hf-secret", use_gpu=False
            )

    @staticmethod
    def _speaker_tracks():
        return [
            (SimpleNamespace(start=0.0, end=1.0), None, "SPEAKER_00"),
            (SimpleNamespace(start=1.0, end=2.0), None, "SPEAKER_01"),
        ]

    def _assert_mapping(self, result):
        self.assertEqual(result["words"][0]["speaker"], "SPEAKER_00")
        self.assertEqual(result["words"][1]["speaker"], "SPEAKER_01")
        self.assertEqual(result["words"][2]["speaker"], "UNKNOWN")
        self.assertEqual(result["segments"][0]["speaker"], "SPEAKER_00")
        self.assertEqual(result["segments"][1]["speaker"], "SPEAKER_01")
        self.assertEqual(result["segments"][2]["speaker"], "UNKNOWN")
        self.assertEqual(
            result["segments"][0]["words"][0]["speaker"], "SPEAKER_00"
        )
        self.assertEqual(
            result["segments"][1]["words"][0]["speaker"], "SPEAKER_01"
        )
        self.assertEqual(
            result["segments"][2]["words"][0]["speaker"], "UNKNOWN"
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
