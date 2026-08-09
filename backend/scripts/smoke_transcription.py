"""Focused normalization and baseline-engine contract smoke tests."""

from __future__ import annotations

import math
import unittest

try:
    from services import transcription
    TRANSCRIPTION_IMPORT_ERROR = ""
except ModuleNotFoundError as exc:
    transcription = None
    TRANSCRIPTION_IMPORT_ERROR = str(exc)


class FakeWhisperModel:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def transcribe(self, audio_path, **options):
        self.calls.append((audio_path, options))
        return self.result


@unittest.skipIf(transcription is None, f"transcription stack unavailable: {TRANSCRIPTION_IMPORT_ERROR}")
class TranscriptionSmokeTests(unittest.TestCase):
    def test_real_word_timestamps_are_used_and_sorted(self):
        model = FakeWhisperModel({
            "language": "es",
            "segments": [{
                "start": 0,
                "end": 2,
                "text": "hola mundo",
                "words": [
                    {"word": " mundo", "start": 1.1, "end": 1.8, "probability": 0.91},
                    {"word": "hola ", "start": 0.1, "end": 0.8, "probability": 0.87},
                ],
            }],
        })
        result = transcription._transcribe_standard(model, "fixture.wav", None)

        self.assertEqual(model.calls[0][1]["word_timestamps"], True)
        self.assertEqual(result["language"], "es")
        self.assertEqual(result["words"], result["segments"][0]["words"])
        self.assertEqual([word["word"] for word in result["words"]], ["hola", "mundo"])
        self.assertEqual(result["words"][0]["start"], 0.1)
        self.assertEqual(result["words"][1]["confidence"], 0.91)

    def test_missing_word_timing_uses_existing_segment_synthesis(self):
        model = FakeWhisperModel({
            "language": "en",
            "segments": [{"start": 1, "end": 3, "text": "one two", "words": []}],
        })
        result = transcription._transcribe_standard(model, "fixture.wav", None)

        self.assertEqual([(word["start"], word["end"]) for word in result["words"]], [(1.0, 2.0), (2.0, 3.0)])
        self.assertEqual(result["segments"][0]["words"], result["words"])
        self.assertEqual(result["segments"][0]["text"], "one two")

    def test_normalized_words_are_finite_and_ordered(self):
        model = FakeWhisperModel({
            "language": "en",
            "segments": [{
                "start": 0,
                "end": 1,
                "text": "valid invalid",
                "words": [
                    {"word": "valid", "start": 0.2, "end": 0.4, "probability": 2},
                    {"word": "", "start": 0.5, "end": 0.6},
                    {"word": "invalid", "start": "bad", "end": 0.8},
                ],
            }],
        })
        result = transcription._transcribe_standard(model, "fixture.wav", None)
        for word in result["words"]:
            self.assertTrue(word["word"])
            self.assertTrue(math.isfinite(word["start"]))
            self.assertTrue(math.isfinite(word["end"]))
            self.assertGreaterEqual(word["start"], 0)
            self.assertGreaterEqual(word["end"], word["start"])
            self.assertGreaterEqual(word["confidence"], 0)
            self.assertLessEqual(word["confidence"], 1)

    def test_packaged_auto_preserves_engine_contract(self):
        original = transcription.NEMO_AVAILABLE, transcription.WHISPERX_AVAILABLE, transcription.WHISPER_AVAILABLE
        try:
            transcription.NEMO_AVAILABLE = False
            transcription.WHISPERX_AVAILABLE = False
            transcription.WHISPER_AVAILABLE = True
            self.assertEqual(transcription._resolve_engine("auto"), "whisper")
            self.assertEqual(transcription._normalize_model_for_engine("base", "whisper"), "base")
        finally:
            transcription.NEMO_AVAILABLE, transcription.WHISPERX_AVAILABLE, transcription.WHISPER_AVAILABLE = original


if __name__ == "__main__":
    unittest.main()
