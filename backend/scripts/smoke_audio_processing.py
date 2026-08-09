"""Deterministic FFmpeg/FFprobe audio-processing smoke checks."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
import unittest
import wave
from pathlib import Path

from utils.audio_processing import cleanup_temp_audio, extract_audio, get_video_duration
from utils.ffmpeg import find_ffmpeg


class AudioProcessingSmokeTests(unittest.TestCase):
    def test_extract_duration_and_per_job_cleanup(self) -> None:
        ffmpeg = find_ffmpeg()
        with tempfile.TemporaryDirectory(prefix="scriptcut-audio-smoke-") as temp:
            root = Path(temp)
            fixture = root / "fixture.mp4"
            command = [
                ffmpeg, "-y",
                "-f", "lavfi", "-i", "color=c=black:s=160x90:r=10",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=0.4",
                "-t", "0.4", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-shortest", str(fixture),
            ]
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            if result.returncode != 0:
                self.fail(f"could not create FFmpeg fixture: {result.stderr[-500:]}")

            duration = get_video_duration(fixture)
            self.assertIsNotNone(duration)
            self.assertGreater(duration, 0)

            first = extract_audio(fixture)
            second = extract_audio(fixture)
            self.assertTrue(first.is_file())
            self.assertTrue(second.is_file())
            with wave.open(str(first), "rb") as audio:
                self.assertGreater(audio.getnframes(), 0)
                self.assertEqual(audio.getnchannels(), 1)

            self.assertEqual(cleanup_temp_audio(first), 1)
            self.assertFalse(first.exists())
            self.assertTrue(second.exists())
            self.assertEqual(cleanup_temp_audio(second), 1)
            self.assertFalse(second.exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
