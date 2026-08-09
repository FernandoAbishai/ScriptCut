"""Startup and optional-capability isolation smoke checks."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
OPTIONAL_MODULES = (
    "whisperx",
    "nemo",
    "pyannote",
    "pyannote.audio",
    "df",
    "mediapipe",
    "cv2",
    "openai",
    "anthropic",
)
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
WHISPER_TEST_STATE = "t.WHISPER_AVAILABLE=True; t.whisper=object(); "


def run_probe(source: str) -> dict:
    environment = {
        **os.environ,
        "PYTHONPATH": str(BACKEND_ROOT),
        "SCRIPTCUT_API_TOKEN": "scriptcut-optional-capability-smoke-token",
        "SCRIPTCUT_RUNTIME_MODE": "packaged-bundled",
    }
    environment.pop("SCRIPTCUT_ALLOW_TOKENLESS_DEV", None)
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            f"{TORCH_STUB_PRELUDE}\n"
            f"for _optional_name in {OPTIONAL_MODULES!r}: sys.modules.pop(_optional_name, None)\n"
            f"{source}",
        ],
        cwd=BACKEND_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout.strip().splitlines()[-1])


class OptionalCapabilitySmokeTests(unittest.TestCase):
    def test_import_main_does_not_import_optional_stacks(self) -> None:
        result = run_probe(
            "import json, sys; import main; print(json.dumps({name: name in sys.modules for name in %r}))"
            % (OPTIONAL_MODULES,)
        )
        self.assertEqual(result, {name: False for name in OPTIONAL_MODULES})

    def test_auto_uses_whisper_when_optional_capabilities_are_absent(self) -> None:
        result = run_probe(
            "import json; from services import transcription as t; "
            + WHISPER_TEST_STATE
            + "t.NEMO_AVAILABLE=False; t.WHISPERX_AVAILABLE=False; "
            "print(json.dumps({'engine': t._resolve_engine('auto'), 'status': t.get_transcription_engine_status()['default_engine']}))"
        )
        self.assertEqual(result, {"engine": "whisper", "status": "whisper"})

    def test_auto_falls_through_broken_nemo(self) -> None:
        result = run_probe(
            "import json; from services import transcription as t; "
            + WHISPER_TEST_STATE
            + "t.NEMO_AVAILABLE=True; t.WHISPERX_AVAILABLE=False; "
            "t._optional_failures.clear(); t.importlib.import_module=lambda name: (_ for _ in ()).throw(ImportError('fake NeMo failure')); "
            "print(json.dumps({'engine': t._resolve_engine('auto'), 'error': 'nemo.collections.asr' in t._optional_failures}))"
        )
        self.assertEqual(result, {"engine": "whisper", "error": True})

    def test_auto_falls_through_broken_whisperx(self) -> None:
        result = run_probe(
            "import json; from services import transcription as t; "
            + WHISPER_TEST_STATE
            + "t.NEMO_AVAILABLE=False; t.WHISPERX_AVAILABLE=True; "
            "t._optional_failures.clear(); t.importlib.import_module=lambda name: (_ for _ in ()).throw(ImportError('fake WhisperX failure')); "
            "print(json.dumps({'engine': t._resolve_engine('auto'), 'error': 'whisperx' in t._optional_failures}))"
        )
        self.assertEqual(result, {"engine": "whisper", "error": True})

    def test_explicit_optional_engines_fail_as_capabilities(self) -> None:
        result = run_probe(
            "import json; from services import transcription as t; "
            + WHISPER_TEST_STATE
            + "t.NEMO_AVAILABLE=False; t.WHISPERX_AVAILABLE=False; "
            "errors=[]; "
            "\nfor engine in ('parakeet', 'whisperx'):\n"
            "  try: t._resolve_engine(engine)\n"
            "  except RuntimeError as exc: errors.append(str(exc))\n"
            "print(json.dumps({'count': len(errors), 'pip': any('pip install' in error for error in errors), 'errors': errors}))"
        )
        self.assertEqual(result["count"], 2)
        self.assertFalse(result["pip"])

    def test_background_and_audio_status_do_not_initialize_optional_modules(self) -> None:
        result = run_probe(
            "import json, sys; from services import background_removal as b; from services import audio_cleaner as a; "
            "print(json.dumps({'modules': {name: name in sys.modules for name in %r}, 'background': b.capabilities()['available'], 'audio': a.is_deepfilter_available()}))"
            % (OPTIONAL_MODULES,)
        )
        self.assertEqual(result["modules"], {name: False for name in OPTIONAL_MODULES})
        self.assertIsInstance(result["background"], bool)
        self.assertIsInstance(result["audio"], bool)

    def test_deepfilter_import_failure_falls_back_to_ffmpeg(self) -> None:
        result = run_probe(
            "import json\nfrom unittest.mock import patch\nfrom services import audio_cleaner as a\n"
            "a.DEEPFILTER_AVAILABLE=True\na.enhance=None\n"
            "with patch.object(a.importlib, 'import_module', side_effect=ImportError('fake df failure')), patch.object(a, '_clean_with_ffmpeg', return_value='fallback.wav'):\n"
            "    value=a.clean_audio('input.wav', 'output.wav')\n"
            "print(json.dumps({'value': value, 'available': a.is_deepfilter_available()}))"
        )
        self.assertEqual(result, {"value": "fallback.wav", "available": False})

    def test_background_selected_failure_is_clean(self) -> None:
        result = run_probe(
            "import json\nfrom unittest.mock import patch\nfrom services import background_removal as b\n"
            "b.MEDIAPIPE_AVAILABLE=True\nb.CV2_AVAILABLE=True\n"
            "with patch.object(b.importlib, 'import_module', side_effect=ImportError('fake background failure')):\n"
            "    try: b.remove_background_on_export('input.mp4', 'output.mp4')\n"
            "    except RuntimeError as exc: value=str(exc)\n"
            "print(json.dumps({'pip': 'pip install' in value, 'message': value}))"
        )
        self.assertFalse(result["pip"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
