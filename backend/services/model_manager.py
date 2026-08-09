"""Application-managed, verified model storage for the baseline Whisper model."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import shutil
import socket
import subprocess
import tempfile
import time
import threading
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

from services.job_manager import JobCanceled

logger = logging.getLogger(__name__)

MODEL_MANIFEST_SCHEMA = "scriptcut.model.v1"
MODEL_STATE_SCHEMA = "scriptcut.model-state.v1"
BASELINE_MODEL_ID = "whisper-base"
BASELINE_ENGINE = "whisper"
BASELINE_MODEL = "base"
_SHA256_RE = re.compile(r"^[a-f0-9]{64}$")
_SAFE_REVISION_RE = re.compile(r"^[a-f0-9]{64}$")
_MAX_REDIRECTS = 5
_MODEL_LOCKS: dict[str, threading.Lock] = {}
_MODEL_LOCKS_GUARD = threading.Lock()


class ModelManagerError(RuntimeError):
    """Safe, creator-facing model-management failure."""


class ModelDownloadError(ModelManagerError):
    """A recoverable download failure with no URL or local path in its message."""


def _default_manifest_path() -> Path:
    return Path(__file__).resolve().parents[2] / "runtime" / "models" / "whisper-base.json"


def _default_model_root() -> Path:
    configured = os.environ.get("SCRIPTCUT_MODEL_ROOT", "").strip()
    if configured:
        return Path(configured).expanduser()
    if sys_platform_is_macos():
        return Path.home() / "Library" / "Application Support" / "ScriptCut" / "models"
    return Path.home() / ".local" / "share" / "ScriptCut" / "models"


def sys_platform_is_macos() -> bool:
    return os.environ.get("SCRIPTCUT_RUNTIME_TARGET", "").startswith("darwin-") or os.sys.platform == "darwin"


def _safe_relative_filename(filename: Any) -> str:
    if not isinstance(filename, str) or not filename or Path(filename).name != filename:
        raise ModelManagerError("Trusted transcription model manifest has an unsafe filename")
    if filename in {".", ".."} or "/" in filename or "\\" in filename:
        raise ModelManagerError("Trusted transcription model manifest has an unsafe filename")
    return filename


def validate_model_manifest(manifest: Any, *, allow_http_for_tests: bool = False) -> dict[str, Any]:
    """Validate the narrow, committed baseline model definition."""
    if not isinstance(manifest, dict) or manifest.get("schema") != MODEL_MANIFEST_SCHEMA:
        raise ModelManagerError(f"Model manifest schema must be {MODEL_MANIFEST_SCHEMA}")
    required = ("id", "engine", "model", "revision", "filename", "sourceUrl", "sha256", "expectedBytes", "license", "sourceProject", "codeVersion")
    if any(not manifest.get(key) for key in required):
        raise ModelManagerError("Model manifest is incomplete")
    if manifest["id"] != BASELINE_MODEL_ID or manifest["engine"] != BASELINE_ENGINE or manifest["model"] != BASELINE_MODEL:
        raise ModelManagerError("Only the trusted Whisper base model is supported")
    revision = manifest["revision"]
    if not isinstance(revision, str) or not _SAFE_REVISION_RE.fullmatch(revision):
        raise ModelManagerError("Model manifest revision is not immutable")
    filename = _safe_relative_filename(manifest["filename"])
    source = urllib.parse.urlsplit(str(manifest["sourceUrl"]))
    if source.scheme != "https" and not (allow_http_for_tests and source.scheme == "http" and source.hostname in {"127.0.0.1", "localhost"}):
        raise ModelManagerError("Model manifest source must use HTTPS")
    sha256 = manifest["sha256"]
    if not isinstance(sha256, str) or not _SHA256_RE.fullmatch(sha256) or sha256 != revision:
        raise ModelManagerError("Model manifest SHA-256 is invalid")
    expected_bytes = manifest["expectedBytes"]
    if not isinstance(expected_bytes, int) or expected_bytes <= 0:
        raise ModelManagerError("Model manifest expected byte size is invalid")
    return {
        "schema": MODEL_MANIFEST_SCHEMA,
        "id": BASELINE_MODEL_ID,
        "engine": BASELINE_ENGINE,
        "model": BASELINE_MODEL,
        "revision": revision,
        "filename": filename,
        "sourceUrl": str(manifest["sourceUrl"]),
        "sha256": sha256,
        "expectedBytes": expected_bytes,
        "license": str(manifest["license"]),
        "sourceProject": str(manifest["sourceProject"]),
        "codeVersion": str(manifest["codeVersion"]),
    }


def _path_inside(root: Path, candidate: Path) -> Path:
    root_resolved = root.resolve()
    candidate_resolved = candidate.resolve()
    try:
        candidate_resolved.relative_to(root_resolved)
    except ValueError as exc:
        raise ModelManagerError("Model storage path escapes the application-managed model root") from exc
    return candidate_resolved


def _atomic_json_write(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(payload, output, indent=2, sort_keys=True)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary_name, path)
        try:
            directory_fd = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        except OSError:
            pass
    finally:
        Path(temporary_name).unlink(missing_ok=True)


def _file_sha256(path: Path, *, progress: Callable[[int], None] | None = None) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
            if progress:
                progress(len(chunk))
    return digest.hexdigest()


class _DownloadRedirectError(ModelManagerError):
    pass


def _validate_download_url(url: str, *, allow_http_for_tests: bool) -> str:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme == "https":
        return url
    if allow_http_for_tests and parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost"}:
        return url
    raise _DownloadRedirectError("The trusted transcription model source must remain HTTPS")


class _HttpsOnlyRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Follow only validated HTTPS redirects, with a strict redirect bound."""

    def __init__(self, *, allow_http_for_tests: bool) -> None:
        super().__init__()
        self.allow_http_for_tests = allow_http_for_tests

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: N802
        redirect_count = int(getattr(req, "_scriptcut_redirect_count", 0))
        if redirect_count >= _MAX_REDIRECTS:
            raise _DownloadRedirectError("The trusted transcription model source redirected too many times")
        target = urllib.parse.urljoin(req.full_url, str(newurl))
        _validate_download_url(target, allow_http_for_tests=self.allow_http_for_tests)
        redirected = super().redirect_request(req, fp, code, msg, headers, target)
        if redirected is None:
            raise _DownloadRedirectError("The trusted transcription model redirect could not be followed safely")
        redirected._scriptcut_redirect_count = redirect_count + 1
        return redirected


class ModelManager:
    """Own the trusted Whisper model definition and its writable revisions."""

    def __init__(
        self,
        *,
        manifest_path: str | Path | None = None,
        model_root: str | Path | None = None,
        opener: Callable[[urllib.request.Request, float], Any] | None = None,
        allow_http_for_tests: bool = False,
        disk_usage: Callable[[str | bytes | os.PathLike[str]], Any] | None = None,
    ) -> None:
        self.manifest_path = Path(manifest_path or os.environ.get("SCRIPTCUT_MODEL_MANIFEST_PATH", "") or _default_manifest_path()).expanduser()
        self.model_root = Path(model_root or _default_model_root()).expanduser()
        self._opener = opener
        self._allow_http_for_tests = allow_http_for_tests
        self._disk_usage = disk_usage or shutil.disk_usage
        self._urllib_opener = urllib.request.build_opener(
            _HttpsOnlyRedirectHandler(allow_http_for_tests=allow_http_for_tests),
        )
        self._manifest: dict[str, Any] | None = None

    @property
    def manifest(self) -> dict[str, Any]:
        if self._manifest is None:
            try:
                payload = json.loads(self.manifest_path.read_text(encoding="utf-8"))
            except OSError as exc:
                raise ModelManagerError("The trusted transcription model manifest is unavailable") from exc
            except json.JSONDecodeError as exc:
                raise ModelManagerError("The trusted transcription model manifest is invalid") from exc
            self._manifest = validate_model_manifest(payload, allow_http_for_tests=self._allow_http_for_tests)
        return self._manifest

    @property
    def model_directory(self) -> Path:
        return _path_inside(self.model_root, self.model_root / "whisper" / "base")

    @property
    def revision_directory(self) -> Path:
        return _path_inside(self.model_directory, self.model_directory / self.manifest["revision"])

    @property
    def model_path(self) -> Path:
        return _path_inside(self.revision_directory, self.revision_directory / self.manifest["filename"])

    @property
    def active_path(self) -> Path:
        return _path_inside(self.model_directory, self.model_directory / "active.json")

    @property
    def downloads_directory(self) -> Path:
        return _path_inside(self.model_directory, self.model_directory / "downloads")

    @property
    def partial_path(self) -> Path:
        return _path_inside(self.downloads_directory, self.downloads_directory / f"{self.manifest['revision']}.partial")

    @property
    def lock(self) -> threading.Lock:
        key = str(self.model_root.resolve()) + ":" + self.manifest["id"]
        with _MODEL_LOCKS_GUARD:
            return _MODEL_LOCKS.setdefault(key, threading.Lock())

    def _active_revision(self) -> str | None:
        try:
            payload = json.loads(self.active_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        revision = payload.get("revision") if isinstance(payload, dict) else None
        return revision if isinstance(revision, str) and _SAFE_REVISION_RE.fullmatch(revision) else None

    def _verified_path(self) -> Path | None:
        if self._active_revision() != self.manifest["revision"] or not self.model_path.is_file():
            return None
        try:
            if self.model_path.stat().st_size != self.manifest["expectedBytes"]:
                return None
            if _file_sha256(self.model_path) != self.manifest["sha256"]:
                return None
        except OSError:
            return None
        return self.model_path

    def status(self) -> dict[str, Any]:
        try:
            manifest = self.manifest
            verified_path = self._verified_path()
            partial_bytes = self.partial_path.stat().st_size if self.partial_path.is_file() else 0
            return {
                "id": manifest["id"],
                "engine": manifest["engine"],
                "model": manifest["model"],
                "revision": manifest["revision"],
                "installed": verified_path is not None,
                "verified": verified_path is not None,
                "bytes": manifest["expectedBytes"] if verified_path else 0,
                "active": verified_path is not None,
                "partial": partial_bytes > 0,
                "partialBytes": partial_bytes,
            }
        except ModelManagerError:
            return {
                "id": BASELINE_MODEL_ID,
                "engine": BASELINE_ENGINE,
                "model": BASELINE_MODEL,
                "revision": None,
                "installed": False,
                "verified": False,
                "bytes": 0,
                "active": False,
                "partial": False,
                "partialBytes": 0,
            }

    def ensure_model(self, model_name: str = BASELINE_MODEL, progress: Callable[[int, str], None] | None = None) -> Path:
        if model_name != BASELINE_MODEL:
            raise ModelManagerError("Only the Whisper base model is available in this release")
        with self.lock:
            verified = self._verified_path()
            if verified:
                if progress:
                    progress(35, "Transcription model ready")
                return verified
            self.model_directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            self.downloads_directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            self._download_partial(progress)
            self._verify_partial(progress)
            self._activate_verified_partial()
            if progress:
                progress(35, "Transcription model ready")
            return self.model_path

    def _check_canceled(self, progress: Callable[[int, str], None] | None) -> None:
        checker = getattr(progress, "check_canceled", None)
        if checker:
            checker()

    def _download_partial(self, progress: Callable[[int, str], None] | None) -> None:
        expected = self.manifest["expectedBytes"]
        partial_size = self.partial_path.stat().st_size if self.partial_path.is_file() else 0
        if partial_size > expected:
            self.partial_path.unlink(missing_ok=True)
            partial_size = 0
        free_bytes = int(self._disk_usage(str(self.model_root)).free)
        required = max(1, expected - partial_size) + 16 * 1024 * 1024
        if free_bytes < required:
            raise ModelDownloadError("Not enough free space to prepare the transcription model")
        if os.environ.get("SCRIPTCUT_MODEL_NETWORK_DISABLED") == "1":
            raise ModelDownloadError("The transcription model is not installed and network access is unavailable")

        if progress:
            progress(5, "Preparing transcription model")
        current_size = partial_size
        attempted_resume = partial_size > 0
        while True:
            self._check_canceled(progress)
            headers = {"User-Agent": "ScriptCut/3B.3", "Accept-Encoding": "identity"}
            if attempted_resume and current_size:
                headers["Range"] = f"bytes={current_size}-"
            try:
                response = self._open_response(self.manifest["sourceUrl"], headers)
                status = int(getattr(response, "status", None) or response.getcode() or 0)
                content_range = str(response.headers.get("Content-Range") or "")
                response_length = int(response.headers.get("Content-Length") or 0)
                append = bool(attempted_resume and current_size and status == 206 and content_range.startswith(f"bytes {current_size}-"))
                if attempted_resume and current_size and not append:
                    response.close()
                    self.partial_path.unlink(missing_ok=True)
                    current_size = 0
                    attempted_resume = False
                    continue
                mode = "ab" if append else "wb"
                response_bytes = 0
                with self.partial_path.open(mode) as output:
                    while chunk := response.read(1024 * 1024):
                        self._check_canceled(progress)
                        output.write(chunk)
                        current_size += len(chunk)
                        response_bytes += len(chunk)
                        if progress:
                            percent = 5 + min(30, int(current_size * 30 / expected))
                            progress(percent, "Downloading transcription model")
                    output.flush()
                    os.fsync(output.fileno())
                response.close()
                if response_length and response_bytes != response_length:
                    raise ModelDownloadError("ScriptCut couldn't finish downloading the transcription model. Check your connection and try again. The partial download can resume.")
                return
            except JobCanceled:
                raise
            except urllib.error.HTTPError as exc:
                if attempted_resume and exc.code == 416:
                    self.partial_path.unlink(missing_ok=True)
                    current_size = 0
                    attempted_resume = False
                    continue
                logger.warning("Whisper model download HTTP failure: %s", exc.code)
                raise ModelDownloadError("ScriptCut couldn't finish downloading the transcription model. Check your connection and try again. The partial download can resume.") from exc
            except (OSError, urllib.error.URLError, TimeoutError, _DownloadRedirectError) as exc:
                if isinstance(exc, urllib.error.URLError) and isinstance(getattr(exc, "reason", None), socket.gaierror) and os.sys.platform == "darwin":
                    self._download_with_curl(current_size, attempted_resume, progress)
                    return
                logger.warning("Whisper model download failed: %s", exc)
                raise ModelDownloadError("ScriptCut couldn't finish downloading the transcription model. Check your connection and try again. The partial download can resume.") from exc

    def _download_with_curl(self, current_size: int, attempted_resume: bool, progress: Callable[[int, str], None] | None) -> None:
        """Use macOS's system curl only when portable-Python DNS cannot resolve the host."""
        curl = shutil.which("curl")
        if not curl:
            raise ModelDownloadError("ScriptCut couldn't finish downloading the transcription model. Check your connection and try again. The partial download can resume.")
        response_path = self.downloads_directory / f".{self.manifest['revision']}.curl-{uuid4().hex}.partial"
        headers_path = self.downloads_directory / f".{self.manifest['revision']}.curl-{uuid4().hex}.headers"
        command = [
            curl,
            "--fail", "--silent", "--show-error", "--location",
            "--max-redirs", "5", "--connect-timeout", "30", "--max-time", "3600",
            "--proto", "=https", "--proto-redir", "=https",
            "--dump-header", str(headers_path), "--output", str(response_path),
        ]
        if attempted_resume and current_size:
            command.extend(["--range", f"{current_size}-"])
        command.append(self.manifest["sourceUrl"])
        process = None
        initial_partial_bytes = current_size
        last_progress = 5
        try:
            process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
            if progress:
                progress(last_progress, "Downloading transcription model")
            while process.poll() is None:
                self._check_canceled(progress)
                curl_bytes = response_path.stat().st_size if response_path.is_file() else 0
                response_mode = self._curl_response_mode(headers_path, initial_partial_bytes)
                total_downloaded = curl_bytes + (initial_partial_bytes if response_mode == "append" else 0)
                if progress:
                    last_progress = max(
                        last_progress,
                        5 + min(30, int(total_downloaded * 30 / self.manifest["expectedBytes"])),
                    )
                    progress(last_progress, "Downloading transcription model")
                time.sleep(0.1)
            stderr = (process.stderr.read() if process.stderr else "").strip()
            if process.returncode != 0:
                logger.warning("Whisper model curl download failed: %s", stderr[-300:])
                raise ModelDownloadError("ScriptCut couldn't finish downloading the transcription model. Check your connection and try again. The partial download can resume.")

            status, content_range, content_length = self._read_curl_headers(headers_path)
            append = bool(attempted_resume and current_size and status == 206 and content_range.startswith(f"bytes {current_size}-"))
            if attempted_resume and current_size and status not in {200, 206}:
                raise ModelDownloadError("ScriptCut couldn't finish downloading the transcription model. Check your connection and try again. The partial download can resume.")
            if attempted_resume and current_size and not append:
                self.partial_path.unlink(missing_ok=True)
                current_size = 0
            mode = "ab" if append else "wb"
            response_bytes = 0
            with response_path.open("rb") as source, self.partial_path.open(mode) as output:
                while chunk := source.read(1024 * 1024):
                    self._check_canceled(progress)
                    output.write(chunk)
                    response_bytes += len(chunk)
                    current_size += len(chunk)
                    if progress:
                        progress(5 + min(30, int(current_size * 30 / self.manifest["expectedBytes"])), "Downloading transcription model")
                output.flush()
                os.fsync(output.fileno())
            if content_length and response_bytes != content_length:
                raise ModelDownloadError("ScriptCut couldn't finish downloading the transcription model. Check your connection and try again. The partial download can resume.")
        except JobCanceled:
            if process and process.poll() is None:
                process.kill()
                process.wait()
            if response_path.exists() and response_path.stat().st_size:
                response_mode = self._curl_response_mode(headers_path, initial_partial_bytes)
                mode = "ab" if response_mode == "append" else "wb" if response_mode == "restart" else None
                if mode is None:
                    response_path.unlink(missing_ok=True)
                    raise
                with response_path.open("rb") as source, self.partial_path.open(mode) as output:
                    shutil.copyfileobj(source, output, length=1024 * 1024)
                    output.flush()
                    os.fsync(output.fileno())
            raise
        except ModelManagerError:
            raise
        except (OSError, subprocess.SubprocessError) as exc:
            raise ModelDownloadError("ScriptCut couldn't finish downloading the transcription model. Check your connection and try again. The partial download can resume.") from exc
        finally:
            response_path.unlink(missing_ok=True)
            headers_path.unlink(missing_ok=True)

    @staticmethod
    def _curl_response_metadata(headers_path: Path) -> tuple[int, str, int] | None:
        try:
            text = headers_path.read_text(encoding="iso-8859-1")
        except OSError:
            return None
        blocks = text.replace("\r\n", "\n").split("\n\n")
        block = next((candidate for candidate in reversed(blocks) if candidate.startswith("HTTP/")), "")
        lines = block.splitlines()
        try:
            status = int(lines[0].split()[1])
        except (IndexError, ValueError):
            return None
        values = {}
        for line in lines[1:]:
            if ":" in line:
                name, value = line.split(":", 1)
                values[name.lower().strip()] = value.strip()
        try:
            content_length = int(values.get("content-length", "0"))
        except ValueError:
            content_length = 0
        return status, values.get("content-range", ""), content_length

    @classmethod
    def _curl_response_mode(cls, headers_path: Path, initial_partial_bytes: int) -> str | None:
        if initial_partial_bytes == 0:
            return "restart"
        metadata = cls._curl_response_metadata(headers_path)
        if not metadata:
            return None
        status, content_range, _content_length = metadata
        if status == 206 and content_range.startswith(f"bytes {initial_partial_bytes}-"):
            return "append"
        if status == 200:
            return "restart"
        return None

    @classmethod
    def _read_curl_headers(cls, headers_path: Path) -> tuple[int, str, int]:
        metadata = cls._curl_response_metadata(headers_path)
        if metadata is None:
            raise ModelDownloadError("ScriptCut couldn't finish downloading the transcription model. Check your connection and try again. The partial download can resume.")
        return metadata

    def _open_response(self, url: str, headers: dict[str, str]) -> Any:
        _validate_download_url(url, allow_http_for_tests=self._allow_http_for_tests)
        if self._opener:
            current = url
            for redirect_count in range(_MAX_REDIRECTS + 1):
                request = urllib.request.Request(current, headers=headers)
                response = self._opener(request, 30)
                final_url = response.geturl() if hasattr(response, "geturl") else None
                if final_url:
                    _validate_download_url(str(final_url), allow_http_for_tests=self._allow_http_for_tests)
                status = int(getattr(response, "status", None) or response.getcode() or 0)
                if status not in {301, 302, 303, 307, 308}:
                    return response
                if redirect_count >= _MAX_REDIRECTS:
                    response.close()
                    raise _DownloadRedirectError("The trusted transcription model source redirected too many times")
                location = response.headers.get("Location")
                response.close()
                if not location:
                    raise _DownloadRedirectError("The trusted transcription model redirect had no location")
                current = urllib.parse.urljoin(current, location)
                _validate_download_url(current, allow_http_for_tests=self._allow_http_for_tests)
            raise _DownloadRedirectError("The trusted transcription model source redirected too many times")

        request = urllib.request.Request(url, headers=headers)
        request._scriptcut_redirect_count = 0
        response = self._urllib_opener.open(request, timeout=30)
        final_url = response.geturl() if hasattr(response, "geturl") else None
        if final_url:
            _validate_download_url(str(final_url), allow_http_for_tests=self._allow_http_for_tests)
        return response

    def _verify_partial(self, progress: Callable[[int, str], None] | None = None) -> None:
        if progress:
            progress(35, "Verifying transcription model")
        expected = self.manifest["expectedBytes"]
        try:
            actual_size = self.partial_path.stat().st_size
        except OSError as exc:
            raise ModelDownloadError("The transcription model download is incomplete. Retry to continue.") from exc
        if actual_size != expected:
            self.partial_path.unlink(missing_ok=True)
            raise ModelDownloadError("The transcription model download was incomplete. Retry to download it again.")
        if _file_sha256(self.partial_path) != self.manifest["sha256"]:
            self.partial_path.unlink(missing_ok=True)
            raise ModelDownloadError("The transcription model integrity check failed. Retry to repair it.")

    def _activate_verified_partial(self) -> None:
        revision_directory = self.revision_directory
        staging_directory = self.model_directory / f".{self.manifest['revision']}.staging-{uuid4().hex}"
        staging_directory.mkdir(parents=True, mode=0o700)
        try:
            staged_model = staging_directory / self.manifest["filename"]
            os.replace(self.partial_path, staged_model)
            _atomic_json_write(staging_directory / "model.json", {
                "schema": MODEL_STATE_SCHEMA,
                "id": self.manifest["id"],
                "revision": self.manifest["revision"],
                "filename": self.manifest["filename"],
                "bytes": self.manifest["expectedBytes"],
                "sha256": self.manifest["sha256"],
                "verified": True,
            })
            if revision_directory.exists():
                shutil.rmtree(revision_directory)
            os.replace(staging_directory, revision_directory)
            _atomic_json_write(self.active_path, {
                "schema": MODEL_STATE_SCHEMA,
                "id": self.manifest["id"],
                "revision": self.manifest["revision"],
                "filename": self.manifest["filename"],
                "bytes": self.manifest["expectedBytes"],
                "sha256": self.manifest["sha256"],
                "verified": True,
            })
        except Exception:
            if staging_directory.exists():
                shutil.rmtree(staging_directory, ignore_errors=True)
            raise

    def delete(self, model_id: str = BASELINE_MODEL_ID) -> dict[str, Any]:
        if model_id != BASELINE_MODEL_ID:
            raise ModelManagerError("Unknown transcription model")
        with self.lock:
            if self.model_directory.exists():
                shutil.rmtree(self.model_directory)
        return self.status()


_manager: ModelManager | None = None
_manager_guard = threading.Lock()


def get_model_manager() -> ModelManager:
    global _manager
    with _manager_guard:
        if _manager is None:
            _manager = ModelManager()
        return _manager


def reset_model_manager_for_tests() -> None:
    global _manager
    with _manager_guard:
        _manager = None
