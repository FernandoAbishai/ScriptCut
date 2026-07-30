from __future__ import annotations

import ipaddress
import socket
import sys
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from local_api_auth import is_authorized_local_api_request
from network_security import validate_provider_url
from services.job_manager import JobManager


class SecuritySmokeTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main(verbosity=2)
