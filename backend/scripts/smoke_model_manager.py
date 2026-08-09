"""Deterministic local-server coverage for managed Whisper model storage."""

from __future__ import annotations

import hashlib
import io
import json
import shutil
import threading
import time
import unittest
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from urllib.parse import urlsplit

from services.job_manager import JobCanceled
from services.model_manager import (
    BASELINE_MODEL_ID,
    _DownloadRedirectError,
    _HttpsOnlyRedirectHandler,
    ModelDownloadError,
    ModelManager,
    ModelManagerError,
    validate_model_manifest,
)


FIXTURE = (b"scriptcut-whisper-fixture-" * 4096) + b"end"


class FixtureState:
    def __init__(self, payload: bytes = FIXTURE, *, ranges: bool = True, interrupt_once: bool = False) -> None:
        self.payload = payload
        self.ranges = ranges
        self.requests: list[dict[str, str]] = []
        self.interrupt_once = interrupt_once
        self._interrupted = False


class FixtureHandler(BaseHTTPRequestHandler):
    state: FixtureState

    def do_GET(self):  # noqa: N802
        if urlsplit(self.path).path != "/model.bin":
            self.send_error(404)
            return
        state = self.state
        range_header = self.headers.get("Range", "")
        state.requests.append({"range": range_header})
        start = 0
        status = 200
        if range_header and state.ranges:
            start = int(range_header.split("=", 1)[1].split("-", 1)[0])
            if start >= len(state.payload):
                self.send_response(416)
                self.end_headers()
                return
            status = 206
        body = state.payload[start:]
        self.send_response(status)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Accept-Ranges", "bytes")
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{len(state.payload) - 1}/{len(state.payload)}")
        self.end_headers()
        if state.interrupt_once and not state._interrupted:
            state._interrupted = True
            self.wfile.write(body[: max(1, len(body) // 2)])
            self.wfile.flush()
            self.close_connection = True
            return
        self.wfile.write(body)

    def log_message(self, *_args):
        return


class FixtureServer:
    def __init__(self, state: FixtureState):
        self.state = state
        handler = type("BoundFixtureHandler", (FixtureHandler,), {"state": state})
        self.server = HTTPServer(("127.0.0.1", 0), handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.server.server_port}/model.bin"

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)


class RedirectResponse:
    def __init__(self, url: str, *, status: int = 200, location: str | None = None):
        self.url = url
        self.status = status
        self.headers = {"Location": location} if location else {}
        self.closed = False

    def getcode(self):
        return self.status

    def geturl(self):
        return self.url

    def close(self):
        self.closed = True


class RedirectOpener:
    def __init__(self, responses: list[RedirectResponse]):
        self.responses = responses
        self.requests: list[str] = []

    def __call__(self, request, _timeout):
        self.requests.append(request.full_url)
        return self.responses.pop(0)


class FakeCurlProcess:
    def __init__(self, command: list[str], payload: bytes, *, initial_bytes: int):
        self.command = command
        self.output_path = Path(command[command.index("--output") + 1])
        self.headers_path = Path(command[command.index("--dump-header") + 1])
        self.payload = payload
        self.initial_bytes = initial_bytes
        self.poll_count = 0
        self.returncode = None
        self.stderr = io.StringIO()
        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        self.headers_path.write_text(
            "HTTP/1.1 206 Partial Content\r\n"
            f"Content-Range: bytes {initial_bytes}-{initial_bytes + len(payload) - 1}/{initial_bytes + len(payload)}\r\n"
            f"Content-Length: {len(payload)}\r\n\r\n",
            encoding="iso-8859-1",
        )

    def poll(self):
        if self.returncode is not None:
            return self.returncode
        self.poll_count += 1
        first_cut = max(1, len(self.payload) // 3)
        second_cut = max(first_cut + 1, (len(self.payload) * 2) // 3)
        if self.poll_count == 1:
            self.output_path.write_bytes(self.payload[:first_cut])
        elif self.poll_count == 2:
            with self.output_path.open("ab") as output:
                output.write(self.payload[first_cut:second_cut])
        elif self.poll_count == 3:
            with self.output_path.open("ab") as output:
                output.write(self.payload[second_cut:])
        elif self.poll_count >= 4:
            self.returncode = 0
        return self.returncode

    def kill(self):
        self.returncode = -9

    def wait(self):
        return self.returncode


def manifest_for(url: str, payload: bytes = FIXTURE, *, expected_bytes: int | None = None, digest: str | None = None) -> dict:
    sha256 = digest or hashlib.sha256(payload).hexdigest()
    return {
        "schema": "scriptcut.model.v1",
        "id": "whisper-base",
        "engine": "whisper",
        "model": "base",
        "revision": sha256,
        "filename": "base.pt",
        "sourceUrl": url,
        "sha256": sha256,
        "expectedBytes": expected_bytes if expected_bytes is not None else len(payload),
        "license": "MIT",
        "sourceProject": "openai/whisper",
        "codeVersion": "20250625",
    }


class ModelManagerSmokeTests(unittest.TestCase):
    def write_manifest(self, directory: Path, payload: dict) -> Path:
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / "model-manifest.json"
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def manager(self, root: Path, manifest: dict) -> ModelManager:
        manifest_path = self.write_manifest(root / "resources", manifest)
        return ModelManager(
            manifest_path=manifest_path,
            model_root=root / "models",
            allow_http_for_tests=True,
        )

    def test_https_only_redirect_policy_and_bounds(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            handler = _HttpsOnlyRedirectHandler(allow_http_for_tests=False)
            request = urllib.request.Request("https://source.test/model.bin")
            redirected = handler.redirect_request(request, None, 302, "Found", {}, "https://cdn.test/model.bin")
            self.assertEqual(redirected.full_url, "https://cdn.test/model.bin")
            with self.assertRaises(_DownloadRedirectError):
                handler.redirect_request(request, None, 302, "Found", {}, "ftp://cdn.test/model.bin")

            opener = RedirectOpener([
                RedirectResponse("https://source.test/model.bin", status=302, location="https://cdn.test/model.bin"),
                RedirectResponse("https://cdn.test/model.bin"),
            ])
            response = ModelManager(model_root=root / "https", opener=opener)._open_response("https://source.test/model.bin", {})
            self.assertEqual(response.geturl(), "https://cdn.test/model.bin")
            self.assertEqual(opener.requests, ["https://source.test/model.bin", "https://cdn.test/model.bin"])

            relative_opener = RedirectOpener([
                RedirectResponse("https://source.test/path", status=302, location="/model.bin"),
                RedirectResponse("https://source.test/model.bin"),
            ])
            response = ModelManager(model_root=root / "relative", opener=relative_opener)._open_response("https://source.test/path", {})
            self.assertEqual(response.geturl(), "https://source.test/model.bin")

            for location in ("http://localhost/model.bin", "ftp://cdn.test/model.bin"):
                opener = RedirectOpener([
                    RedirectResponse("https://source.test/model.bin", status=302, location=location),
                ])
                with self.assertRaises(_DownloadRedirectError):
                    ModelManager(model_root=root / "rejected", opener=opener)._open_response("https://source.test/model.bin", {})

            too_many = RedirectOpener([
                RedirectResponse(f"https://source.test/{index}", status=302, location=f"https://source.test/{index + 1}")
                for index in range(6)
            ])
            with self.assertRaisesRegex(_DownloadRedirectError, "too many"):
                ModelManager(model_root=root / "bounded", opener=too_many)._open_response("https://source.test/0", {})

            local_opener = RedirectOpener([RedirectResponse("http://127.0.0.1/model.bin")])
            response = ModelManager(model_root=root / "local", opener=local_opener, allow_http_for_tests=True)._open_response("http://127.0.0.1/model.bin", {})
            self.assertEqual(response.geturl(), "http://127.0.0.1/model.bin")
            with self.assertRaises(_DownloadRedirectError):
                ModelManager(model_root=root / "production", opener=local_opener)._open_response("http://127.0.0.1/model.bin", {})

    def test_curl_progress_resume_and_cancellation(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            manager = self.manager(root, manifest_for("https://source.test/model.bin"))
            manager.downloads_directory.mkdir(parents=True, exist_ok=True)
            initial_bytes = 100
            manager.partial_path.write_bytes(FIXTURE[:initial_bytes])
            payload = FIXTURE[initial_bytes:]
            processes = []

            def fake_popen(command, **_kwargs):
                process = FakeCurlProcess(command, payload, initial_bytes=initial_bytes)
                processes.append(process)
                return process

            events = []
            with patch("services.model_manager.shutil.which", return_value="/usr/bin/curl"), patch("services.model_manager.subprocess.Popen", side_effect=fake_popen):
                manager._download_with_curl(initial_bytes, True, lambda percent, message: events.append((percent, message, processes[0].returncode is None)))
            downloading = [(percent, active) for percent, message, active in events if message == "Downloading transcription model"]
            self.assertTrue(downloading)
            self.assertTrue(any(active and percent > 5 for percent, active in downloading))
            self.assertEqual([percent for percent, _active in downloading], sorted(percent for percent, _active in downloading))
            self.assertEqual(manager.partial_path.read_bytes(), FIXTURE)
            self.assertIn(f"{initial_bytes}-", processes[0].command)

            cancel_root = Path(directory) / "cancel"
            cancel_manager = self.manager(cancel_root, manifest_for("https://source.test/model.bin"))
            cancel_manager.downloads_directory.mkdir(parents=True, exist_ok=True)
            cancel_manager.partial_path.write_bytes(FIXTURE[:initial_bytes])
            cancel_processes = []

            def cancel_popen(command, **_kwargs):
                process = FakeCurlProcess(command, payload, initial_bytes=initial_bytes)
                cancel_processes.append(process)
                return process

            def cancel_progress(percent, message):
                if message == "Downloading transcription model" and percent > 5:
                    raise JobCanceled("canceled")

            with patch("services.model_manager.shutil.which", return_value="/usr/bin/curl"), patch("services.model_manager.subprocess.Popen", side_effect=cancel_popen):
                with self.assertRaises(JobCanceled):
                    cancel_manager._download_with_curl(initial_bytes, True, cancel_progress)
            self.assertGreater(cancel_manager.partial_path.stat().st_size, initial_bytes)
            self.assertLess(cancel_manager.partial_path.stat().st_size, len(FIXTURE))
            self.assertFalse(cancel_manager.active_path.exists())

    def test_manifest_and_path_safety(self):
        with self.assertRaisesRegex(ModelManagerError, "HTTPS"):
            validate_model_manifest(manifest_for("http://127.0.0.1/model.bin"))
        with TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ModelManagerError, "Unknown"):
                ModelManager(model_root=directory).delete("../outside")
        with self.assertRaisesRegex(ModelManagerError, "trusted Whisper"):
            validate_model_manifest({**manifest_for("https://example.test/model.bin"), "id": "arbitrary"})

    def test_fresh_download_resume_and_delete(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            state = FixtureState()
            server = FixtureServer(state)
            try:
                manager = self.manager(root, manifest_for(server.url))
                self.assertFalse(manager.status()["installed"])
                events = []
                model_path = manager.ensure_model(progress=lambda percent, message: events.append((percent, message)))
                self.assertEqual(model_path.read_bytes(), FIXTURE)
                self.assertTrue(manager.status()["verified"])
                self.assertEqual(json.loads(manager.active_path.read_text())["revision"], manager.manifest["revision"])
                self.assertNotIn("/", json.loads(manager.active_path.read_text())["filename"])
                self.assertTrue(any("Downloading" in message for _, message in events))
                self.assertEqual(manager.delete(BASELINE_MODEL_ID)["installed"], False)
                self.assertFalse(manager.model_directory.exists())
            finally:
                server.close()

    def test_resume_range_and_server_ignoring_range(self):
        for ranges in (True, False):
            with self.subTest(ranges=ranges), TemporaryDirectory() as directory:
                root = Path(directory)
                state = FixtureState(ranges=ranges)
                server = FixtureServer(state)
                try:
                    manager = self.manager(root, manifest_for(server.url))
                    manager.downloads_directory.mkdir(parents=True, exist_ok=True)
                    manager.partial_path.write_bytes(FIXTURE[:10000])
                    manager.ensure_model()
                    self.assertTrue(manager.status()["verified"])
                    self.assertTrue(state.requests[0]["range"] == "bytes=10000-")
                    if not ranges:
                        self.assertEqual(state.requests[1]["range"], "")
                finally:
                    server.close()

    def test_interrupt_cancel_retry_hash_and_size_failures(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            interrupted = FixtureState(interrupt_once=True)
            server = FixtureServer(interrupted)
            try:
                manager = self.manager(root, manifest_for(server.url))
                with self.assertRaises(ModelDownloadError):
                    manager.ensure_model()
                self.assertGreater(manager.partial_path.stat().st_size, 0)
                manager.ensure_model()
                self.assertTrue(manager.status()["verified"])
            finally:
                server.close()

        for mode in ("hash", "size"):
            with self.subTest(mode=mode), TemporaryDirectory() as directory:
                root = Path(directory)
                state = FixtureState()
                server = FixtureServer(state)
                try:
                    wrong_digest = hashlib.sha256(b"wrong").hexdigest()
                    manifest = manifest_for(
                        server.url,
                        expected_bytes=len(FIXTURE) + (1 if mode == "size" else 0),
                        digest=wrong_digest if mode == "hash" else None,
                    )
                    manager = self.manager(root, manifest)
                    with self.assertRaises(ModelDownloadError):
                        manager.ensure_model()
                    self.assertFalse(manager.status()["installed"])
                    self.assertFalse(manager.active_path.exists())
                    self.assertFalse(manager.partial_path.exists())
                finally:
                    server.close()

    def test_cancellation_preserves_partial_and_concurrent_requests_share_lock(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            state = FixtureState()
            server = FixtureServer(state)
            try:
                manager = self.manager(root, manifest_for(server.url))

                class CancelAfterFirst:
                    def __init__(self):
                        self.calls = 0

                    def __call__(self, *_args):
                        if len(_args) > 1 and "Downloading" in str(_args[1]):
                            raise JobCanceled("canceled")
                        return None

                    def check_canceled(self):
                        self.calls += 1

                callback = CancelAfterFirst()
                with self.assertRaises(JobCanceled):
                    manager.ensure_model(progress=callback)
                self.assertGreater(manager.partial_path.stat().st_size, 0)
                manager.ensure_model()

                manager.delete()
                state.requests.clear()
                results = []
                errors = []

                def install():
                    try:
                        results.append(manager.ensure_model())
                    except Exception as error:  # pragma: no cover - assertion below reports it
                        errors.append(error)

                threads = [threading.Thread(target=install) for _ in range(2)]
                for thread in threads:
                    thread.start()
                for thread in threads:
                    thread.join(timeout=5)
                self.assertFalse(errors)
                self.assertEqual(len(results), 2)
                self.assertEqual(len(state.requests), 1)
            finally:
                server.close()

    def test_previous_active_revision_survives_failed_new_revision(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            first_state = FixtureState(payload=FIXTURE)
            first_server = FixtureServer(first_state)
            try:
                first_manager = self.manager(root, manifest_for(first_server.url))
                first_manager.ensure_model()
                previous_revision = first_manager.manifest["revision"]
            finally:
                first_server.close()

            replacement_payload = b"replacement-model" * 100
            second_state = FixtureState(payload=replacement_payload)
            second_server = FixtureServer(second_state)
            try:
                wrong_manifest = manifest_for(second_server.url, replacement_payload, digest=hashlib.sha256(b"not-this").hexdigest())
                second_manager = self.manager(root, wrong_manifest)
                with self.assertRaises(ModelDownloadError):
                    second_manager.ensure_model()
                active = json.loads(second_manager.active_path.read_text(encoding="utf-8"))
                self.assertEqual(active["revision"], previous_revision)
                self.assertTrue(first_manager.model_path.exists())
            finally:
                second_server.close()


if __name__ == "__main__":
    unittest.main()
