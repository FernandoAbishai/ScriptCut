"""Small in-memory job registry for long-running local backend tasks."""

from __future__ import annotations

import threading
import traceback
from datetime import datetime, timedelta, timezone
from typing import Any, Callable
from uuid import uuid4

TERMINAL_STATUSES = {"succeeded", "failed", "canceled"}
RETRYABLE_STATUSES = {"failed", "canceled"}
MAX_RETAINED_JOBS = 100
TERMINAL_JOB_TTL = timedelta(hours=6)


class JobCanceled(RuntimeError):
    """Raised by cooperative job tasks when cancellation is requested."""


class JobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()

    def create(
        self,
        kind: str,
        target: Callable[[Callable[[int, str], None]], Any],
        *,
        original_job_id: str | None = None,
        attempt: int = 1,
    ) -> str:
        job_id = uuid4().hex
        now = _now()
        with self._lock:
            self._prune_locked()
            self._jobs[job_id] = {
                "id": job_id,
                "kind": kind,
                "attempt": attempt,
                "originalJobId": original_job_id,
                "status": "queued",
                "progress": 0,
                "message": "Queued",
                "logs": [],
                "result": None,
                "error": None,
                "cancelRequested": False,
                "createdAt": now,
                "updatedAt": now,
                "_target": target,
            }

        thread = threading.Thread(target=self._run, args=(job_id, target), daemon=True)
        thread.start()
        return job_id

    def get(self, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            self._prune_locked()
            job = self._jobs.get(job_id)
            return self._public_job(job) if job else None

    def retry(self, job_id: str) -> str | None:
        with self._lock:
            self._prune_locked()
            job = self._jobs.get(job_id)
            if not job:
                return None
            if job.get("status") not in RETRYABLE_STATUSES:
                return None
            target = job.get("_target")
            if not target:
                return None
            original_job_id = job.get("originalJobId") or job["id"]
            attempt = int(job.get("attempt") or 1) + 1

        return self.create(job["kind"], target, original_job_id=original_job_id, attempt=attempt)

    def cancel(self, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            self._prune_locked()
            job = self._jobs.get(job_id)
            if not job:
                return None
            if job["status"] in TERMINAL_STATUSES:
                return self._public_job(job)
            job["cancelRequested"] = True
            job["status"] = "canceled"
            job["message"] = "Cancel requested"
            job["updatedAt"] = _now()
            job["logs"].append({"time": job["updatedAt"], "message": "Cancel requested"})
            return self._public_job(job)

    def _run(self, job_id: str, target: Callable[[Callable[[int, str], None]], Any]) -> None:
        self._update(job_id, status="running", progress=1, message="Started")

        def progress(percent: int, message: str) -> None:
            self._raise_if_canceled(job_id)
            self._update(job_id, progress=percent, message=message)

        progress.is_cancel_requested = lambda: self._is_cancel_requested(job_id)  # type: ignore[attr-defined]
        progress.check_canceled = lambda: self._raise_if_canceled(job_id)  # type: ignore[attr-defined]

        try:
            result = target(progress)
            job = self.get(job_id)
            if job and job.get("cancelRequested"):
                self._update(job_id, status="canceled", message="Canceled")
                return
            self._update(job_id, status="succeeded", progress=100, message="Complete", result=result)
        except JobCanceled:
            self._update(job_id, status="canceled", message="Canceled")
        except Exception as exc:
            job = self.get(job_id)
            if job and job.get("cancelRequested"):
                self._update(job_id, status="canceled", message="Canceled")
                return
            self._update(
                job_id,
                status="failed",
                message=str(exc),
                error=str(exc),
                log=traceback.format_exc(limit=4),
            )

    def _update(self, job_id: str, **patch: Any) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            previous_status = job.get("status")
            now = _now()
            job.update({key: value for key, value in patch.items() if key != "log"})
            job["updatedAt"] = now
            if previous_status not in TERMINAL_STATUSES and job.get("status") in TERMINAL_STATUSES:
                job["completedAt"] = now
            message = patch.get("message")
            log = patch.get("log")
            if message:
                job["logs"].append({"time": now, "message": message})
            if log:
                job["logs"].append({"time": now, "message": log})

    @staticmethod
    def _public_job(job: dict[str, Any]) -> dict[str, Any]:
        return {key: value for key, value in job.items() if not key.startswith("_")}

    def _is_cancel_requested(self, job_id: str) -> bool:
        with self._lock:
            return bool(self._jobs.get(job_id, {}).get("cancelRequested"))

    def _raise_if_canceled(self, job_id: str) -> None:
        if self._is_cancel_requested(job_id):
            raise JobCanceled("Job was canceled")

    def _prune_locked(self) -> None:
        now = datetime.now(timezone.utc)
        expired_ids = [
            job_id
            for job_id, job in self._jobs.items()
            if job.get("status") in TERMINAL_STATUSES and _parse_time(job.get("completedAt") or job.get("updatedAt")) < now - TERMINAL_JOB_TTL
        ]
        for job_id in expired_ids:
            self._jobs.pop(job_id, None)

        overflow = len(self._jobs) - MAX_RETAINED_JOBS
        if overflow <= 0:
            return

        removable = sorted(
            (
                (job_id, _parse_time(job.get("completedAt") or job.get("updatedAt")))
                for job_id, job in self._jobs.items()
                if job.get("status") in TERMINAL_STATUSES
            ),
            key=lambda item: item[1],
        )
        for job_id, _ in removable[:overflow]:
            self._jobs.pop(job_id, None)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_time(value: Any) -> datetime:
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return datetime.now(timezone.utc)


job_manager = JobManager()
