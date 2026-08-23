"""Deterministic subprocess-isolated compatibility smokes for diarization."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]

TORCH_STUB_PRELUDE = r"""
import sys
import types

torch = types.ModuleType("torch")


class FakeDevice:
    def __init__(self, value="cpu"):
        self.type = str(value).split(":", 1)[0]

    def __str__(self):
        return self.type


torch.device = FakeDevice
torch.cuda = types.SimpleNamespace(is_available=lambda: False, device_count=lambda: 0)
torch.backends = types.SimpleNamespace(
    mps=types.SimpleNamespace(is_available=lambda: False),
    cudnn=types.SimpleNamespace(),
)
torch.set_grad_enabled = lambda *args, **kwargs: None
sys.modules["torch"] = torch
"""

PROBE_COMMON = r"""
import json
import logging
import sys
import types
from types import SimpleNamespace

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

    def __call__(self, audio_path, num_speakers=None):
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
    pyannote_module = types.ModuleType("pyannote")
    audio_module = types.ModuleType("pyannote.audio")
    audio_module.Pipeline = pipeline_class
    pyannote_module.audio = audio_module
    sys.modules["pyannote"] = pyannote_module
    sys.modules["pyannote.audio"] = audio_module


def speaker_tracks():
    return [
        (SimpleNamespace(start=0.0, end=1.0), None, "SPEAKER_00"),
        (SimpleNamespace(start=1.0, end=2.0), None, "SPEAKER_01"),
    ]


def mapping_input():
    return {
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


class Capture(logging.Handler):
    def __init__(self):
        super().__init__()
        self.messages = []

    def emit(self, record):
        self.messages.append(record.getMessage())


def captured_call(callback):
    capture = Capture()
    logger = diarization.logger
    logger.addHandler(capture)
    previous_level = logger.level
    logger.setLevel(logging.ERROR)
    try:
        result = callback()
    finally:
        logger.setLevel(previous_level)
        logger.removeHandler(capture)
    return result, capture.messages
"""


def run_probe(source: str) -> dict:
    environment = {
        **os.environ,
        "PYTHONPATH": str(BACKEND_ROOT),
    }
    environment.pop("HF_TOKEN", None)
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            f"{TORCH_STUB_PRELUDE}\n{PROBE_COMMON}\n{source}",
        ],
        cwd=BACKEND_ROOT,
        env=environment,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise AssertionError(
            "diarization probe failed\n"
            f"stdout:\n{result.stdout}\n"
            f"stderr:\n{result.stderr}"
        )
    try:
        return json.loads(result.stdout.strip().splitlines()[-1])
    except (IndexError, json.JSONDecodeError) as error:
        raise AssertionError(
            "diarization probe did not emit JSON\n"
            f"stdout:\n{result.stdout}\n"
            f"stderr:\n{result.stderr}"
        ) from error


class DiarizationCompatibilitySmokeTests(unittest.TestCase):
    def test_pyannote_3_authentication_uses_use_auth_token(self):
        result = run_probe(
            r"""
expected = FakePipeline()
Pyannote3Pipeline.pipeline = expected
install_pyannote_stub(Pyannote3Pipeline)
loaded = diarization._get_pipeline("hf-secret", torch.device("cpu"))
print(json.dumps({"same": loaded is expected, "calls": Pyannote3Pipeline.calls}))
"""
        )

        self.assertEqual(
            result,
            {
                "same": True,
                "calls": [["pyannote/speaker-diarization-3.0", "hf-secret"]],
            },
        )

    def test_pyannote_4_authentication_uses_token(self):
        result = run_probe(
            r"""
expected = FakePipeline()
Pyannote4Pipeline.pipeline = expected
install_pyannote_stub(Pyannote4Pipeline)
loaded = diarization._get_pipeline("hf-secret", torch.device("cpu"))
print(json.dumps({"same": loaded is expected, "calls": Pyannote4Pipeline.calls}))
"""
        )

        self.assertEqual(
            result,
            {
                "same": True,
                "calls": [["pyannote/speaker-diarization-3.0", "hf-secret"]],
            },
        )

    def test_pyannote_3_annotation_maps_words_segments_and_segment_words(self):
        result = run_probe(
            r"""
Pyannote3Pipeline.pipeline = FakePipeline(
    result=FakeAnnotation(speaker_tracks())
)
install_pyannote_stub(Pyannote3Pipeline)
transcription = mapping_input()
diarization.diarize_and_label(transcription, "input.wav", hf_token="hf-secret", use_gpu=False)
print(json.dumps({
    "words": [word["speaker"] for word in transcription["words"]],
    "segments": [segment["speaker"] for segment in transcription["segments"]],
    "segment_words": [segment["words"][0]["speaker"] for segment in transcription["segments"]],
}))
"""
        )

        self.assertEqual(
            result,
            {
                "words": ["SPEAKER_00", "SPEAKER_01", "UNKNOWN"],
                "segments": ["SPEAKER_00", "SPEAKER_01", "UNKNOWN"],
                "segment_words": ["SPEAKER_00", "SPEAKER_01", "UNKNOWN"],
            },
        )

    def test_pyannote_4_diarize_output_maps_words_segments_and_segment_words(self):
        result = run_probe(
            r"""
Pyannote4Pipeline.pipeline = FakePipeline(
    result=types.SimpleNamespace(
        speaker_diarization=FakeAnnotation(speaker_tracks())
    )
)
install_pyannote_stub(Pyannote4Pipeline)
transcription = mapping_input()
diarization.diarize_and_label(transcription, "input.wav", hf_token="hf-secret", use_gpu=False)
print(json.dumps({
    "words": [word["speaker"] for word in transcription["words"]],
    "segments": [segment["speaker"] for segment in transcription["segments"]],
    "segment_words": [segment["words"][0]["speaker"] for segment in transcription["segments"]],
}))
"""
        )

        self.assertEqual(
            result,
            {
                "words": ["SPEAKER_00", "SPEAKER_01", "UNKNOWN"],
                "segments": ["SPEAKER_00", "SPEAKER_01", "UNKNOWN"],
                "segment_words": ["SPEAKER_00", "SPEAKER_01", "UNKNOWN"],
            },
        )

    def test_no_token_returns_unchanged_transcription(self):
        result = run_probe(
            r"""
transcription = {"words": [{"word": "hello", "start": 0, "end": 1}]}
returned = diarization.diarize_and_label(
    transcription, "input.wav", hf_token=None, use_gpu=False
)
print(json.dumps({
    "same": returned is transcription,
    "speaker": transcription["words"][0].get("speaker"),
}))
"""
        )

        self.assertEqual(result, {"same": True, "speaker": None})

    def test_model_loading_failure_is_graceful_and_secret_safe(self):
        result = run_probe(
            r"""
class FailingPipeline:
    @classmethod
    def from_pretrained(cls, checkpoint, *, token=None):
        raise RuntimeError(f"model rejected {token}")

install_pyannote_stub(FailingPipeline)
transcription = {"words": []}
returned, logs = captured_call(
    lambda: diarization.diarize_and_label(
        transcription, "input.wav", hf_token="hf-secret", use_gpu=False
    )
)
print(json.dumps({"same": returned is transcription, "logs": logs}))
"""
        )

        self.assertTrue(result["same"])
        emitted = "\n".join(result["logs"])
        self.assertNotIn("hf-secret", emitted)
        self.assertIn("[REDACTED]", emitted)

    def test_pipeline_execution_failure_is_graceful_and_secret_safe(self):
        result = run_probe(
            r"""
Pyannote4Pipeline.pipeline = FakePipeline(
    error=RuntimeError("execution leaked hf-secret")
)
install_pyannote_stub(Pyannote4Pipeline)
transcription = {"words": []}
returned, logs = captured_call(
    lambda: diarization.diarize_and_label(
        transcription, "input.wav", hf_token="hf-secret", use_gpu=False
    )
)
print(json.dumps({"same": returned is transcription, "logs": logs}))
"""
        )

        self.assertTrue(result["same"])
        emitted = "\n".join(result["logs"])
        self.assertNotIn("hf-secret", emitted)
        self.assertIn("[REDACTED]", emitted)


if __name__ == "__main__":
    unittest.main(verbosity=2)
