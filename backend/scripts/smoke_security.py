from __future__ import annotations

import ipaddress
import os
import socket
import subprocess
import sys
import threading
import time
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from pydantic import ValidationError

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from local_api_auth import is_authorized_local_api_request, validate_local_api_startup
from file_access import authorize_file_capability, issue_file_capability, sign_file_capability
from network_security import validate_provider_url
from routers.captions import CaptionRequest
from services.job_manager import JobManager


class SecuritySmokeTests(unittest.TestCase):
    def test_tokenless_startup_requires_explicit_development_override(self):
        with self.assertRaisesRegex(RuntimeError, "SCRIPTCUT_API_TOKEN is required"):
            validate_local_api_startup(None, False)
        self.assertFalse(validate_local_api_startup(None, True))
        self.assertTrue(validate_local_api_startup("session-secret", False))

    def test_backend_module_rejects_unconfigured_tokenless_startup(self):
        environment = os.environ.copy()
        environment.pop("SCRIPTCUT_API_TOKEN", None)
        environment.pop("SCRIPTCUT_ALLOW_TOKENLESS_DEV", None)
        result = subprocess.run(
            [sys.executable, "-c", "import main"],
            cwd=BACKEND_ROOT,
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("SCRIPTCUT_API_TOKEN is required", result.stderr)

    def test_local_api_token_rejects_missing_and_wrong_values(self):
        self.assertFalse(is_authorized_local_api_request("session-secret", None))
        self.assertFalse(is_authorized_local_api_request("session-secret", "wrong"))
        self.assertTrue(is_authorized_local_api_request("session-secret", "session-secret"))

    def test_provider_url_allows_loopback_http(self):
        with patch("socket.getaddrinfo", return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 11434))]):
            self.assertEqual(validate_provider_url("http://localhost:11434"), "http://localhost:11434")

    def test_provider_url_rejects_private_remote_target(self):
        private = str(ipaddress.ip_address("10.0.0.8"))
        with patch("socket.getaddrinfo", return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", (private, 443))]):
            with self.assertRaisesRegex(ValueError, "blocked network"):
                validate_provider_url("https://internal.example")

    def test_provider_url_rejects_cleartext_remote_target(self):
        with self.assertRaisesRegex(ValueError, "must use HTTPS"):
            validate_provider_url("http://example.com")

    def test_job_queue_applies_backpressure(self):
        release = threading.Event()
        manager = JobManager(max_workers=1, max_pending_jobs=1)

        def blocked(progress):
            progress(10, "blocked")
            release.wait(timeout=1)

        manager.create("first", blocked)
        time.sleep(0.03)
        with self.assertRaisesRegex(RuntimeError, "queue is full"):
            manager.create("second", blocked)
        release.set()

    def test_local_file_capability_is_exact_and_media_scoped(self):
        self.assertEqual(
            sign_file_capability("/tmp/example.mp4", b"scriptcut-test-secret"),
            "ee2e8d32cb960a352d3c0c1d628b5ecd494c0848ba36d9a3b41239d96ae0fd68",
        )
        with TemporaryDirectory() as tmp:
            allowed = Path(tmp) / "creator.mp4"
            other = Path(tmp) / "other.mp4"
            text = Path(tmp) / "secret.txt"
            allowed.write_bytes(b"creator-media")
            other.write_bytes(b"other-media")
            text.write_text("not media", encoding="utf-8")

            canonical, capability = issue_file_capability(str(allowed))
            self.assertEqual(authorize_file_capability(canonical, capability), allowed.resolve())
            with self.assertRaises(PermissionError):
                authorize_file_capability(str(other), capability)
            with self.assertRaises(PermissionError):
                authorize_file_capability(canonical, "wrong-capability")
            with self.assertRaisesRegex(ValueError, "File type"):
                issue_file_capability(str(text))

    def test_caption_endpoint_model_rejects_output_path_authority(self):
        with self.assertRaises(ValidationError):
            CaptionRequest(words=[], output_path="/tmp/should-not-be-written.srt")


if __name__ == "__main__":
    unittest.main(verbosity=2)
