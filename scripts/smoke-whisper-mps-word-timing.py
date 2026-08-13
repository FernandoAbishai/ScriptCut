#!/usr/bin/env python3
"""Exercise ScriptCut's pinned-Whisper MPS DTW compatibility path."""

from __future__ import annotations

import argparse
import math
import os
import sys
from types import SimpleNamespace
from pathlib import Path

import numpy as np
import torch


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
PACKAGED_BACKEND_ROOT = os.environ.get("SCRIPTCUT_PACKAGED_BACKEND_ROOT")
sys.path.insert(0, PACKAGED_BACKEND_ROOT or str(REPOSITORY_ROOT / "backend"))

from services import transcription  # noqa: E402


def fail(message: str) -> None:
    raise RuntimeError(f"Whisper MPS word-timing smoke failed: {message}")


def assert_valid_dtw(result: np.ndarray, label: str) -> None:
    if not isinstance(result, np.ndarray) or result.ndim != 2 or result.shape[0] != 2 or result.shape[1] == 0:
        fail(f"{label} returned an invalid DTW result: {type(result).__name__} {getattr(result, 'shape', None)}")
    if not np.issubdtype(result.dtype, np.integer):
        fail(f"{label} returned a non-integer DTW path: {result.dtype}")
    if not np.isfinite(result).all():
        fail(f"{label} returned non-finite values")


class SimulatedMpsTensor:
    """Rejects any attempted .double() while exercising the MPS branch on hosts without MPS."""

    device = SimpleNamespace(type="mps")
    dtype = torch.float32

    def __init__(self, values: np.ndarray):
        self.values = values

    def detach(self):
        return self

    def to(self, *, device, dtype):
        if device != "cpu" or dtype is not torch.float32:
            fail(f"compatibility path requested {device}/{dtype}; expected CPU float32")
        return self

    def numpy(self):
        return self.values


def run_cpu_and_simulated_mps_smoke() -> None:
    if not transcription.WHISPER_AVAILABLE or transcription.whisper is None:
        fail("pinned Whisper package is unavailable")
    timing = transcription.whisper.timing
    values = np.array(
        [[0.1, 1.2, 0.4, 1.0], [1.1, 0.2, 0.8, 0.3], [0.6, 0.7, 0.1, 1.4]],
        dtype=np.float32,
    )
    cpu_matrix = torch.from_numpy(values.copy())
    original_dtw = timing.dtw
    cpu_before = original_dtw(cpu_matrix)
    assert_valid_dtw(cpu_before, "CPU baseline")
    if not transcription._ensure_whisper_mps_word_timing_compat():
        fail("compatibility layer was not installed")
    patched_dtw = timing.dtw
    if not transcription._ensure_whisper_mps_word_timing_compat() or timing.dtw is not patched_dtw:
        fail("compatibility installation was not idempotent")
    cpu_after = timing.dtw(cpu_matrix)
    assert_valid_dtw(cpu_after, "CPU compatibility path")
    if not np.array_equal(cpu_before, cpu_after):
        fail("CPU DTW output changed after installing the MPS-only wrapper")
    simulated = SimulatedMpsTensor(values.copy())
    first = timing.dtw(simulated)
    second = timing.dtw(simulated)
    assert_valid_dtw(first, "simulated MPS compatibility path")
    if not np.array_equal(first, second):
        fail("simulated MPS DTW output was not deterministic")
    if simulated.device.type != "mps" or simulated.dtype is not torch.float32:
        fail("simulated MPS tensor changed device or dtype")
    print("CPU DTW baseline: PASS")
    print("ScriptCut MPS wrapper: installed")
    print("CPU DTW behavior: unchanged")
    print("Simulated MPS branch CPU float32 request: PASS")
    print("DTW compatibility idempotence: PASS")
    print("Hosted deterministic MPS compatibility: PASS")
    print("Hosted real MPS: NOT RUN")
    print("Real MPS execution: NOT RUN")


def run_real_mps_smoke() -> None:
    if not transcription.WHISPER_AVAILABLE or transcription.whisper is None:
        fail("pinned Whisper package is unavailable")

    timing = transcription.whisper.timing
    cpu_matrix = torch.tensor(
        [[0.1, 1.2, 0.4, 1.0], [1.1, 0.2, 0.8, 0.3], [0.6, 0.7, 0.1, 1.4]],
        dtype=torch.float32,
    )
    original_dtw = timing.dtw
    cpu_before = original_dtw(cpu_matrix)
    assert_valid_dtw(cpu_before, "CPU baseline")

    if not transcription._ensure_whisper_mps_word_timing_compat():
        fail("compatibility layer was not installed")
    patched_dtw = timing.dtw
    if not getattr(patched_dtw, "_scriptcut_mps_word_timing_compat", False):
        fail("DTW wrapper was not marked as ScriptCut-owned")
    if not transcription._ensure_whisper_mps_word_timing_compat() or timing.dtw is not patched_dtw:
        fail("compatibility installation was not idempotent")

    cpu_after = timing.dtw(cpu_matrix)
    assert_valid_dtw(cpu_after, "CPU compatibility path")
    if not np.array_equal(cpu_before, cpu_after):
        fail("CPU DTW output changed after installing the MPS-only wrapper")

    # This is intentionally a real allocation. Any hosted-runner MPS failure
    # must propagate instead of being hidden by a CPU substitute.
    mps_matrix = torch.tensor(
        [[0.1, 1.2, 0.4, 1.0], [1.1, 0.2, 0.8, 0.3], [0.6, 0.7, 0.1, 1.4]],
        dtype=torch.float32,
        device="mps",
    )
    if mps_matrix.device.type != "mps" or mps_matrix.dtype is not torch.float32:
        fail("real MPS tensor was not allocated as MPS float32")
    mps_snapshot = mps_matrix.detach().to(device="cpu", dtype=torch.float32)
    try:
        mps_first = timing.dtw(mps_matrix)
        mps_second = timing.dtw(mps_matrix)
    except TypeError as exc:
        if "float64" in str(exc) or "MPS" in str(exc):
            fail(f"MPS DTW attempted an unsupported conversion: {exc}")
        raise
    assert_valid_dtw(mps_first, "MPS compatibility path")
    if not np.array_equal(mps_first, mps_second):
        fail("MPS DTW output was not deterministic")
    if mps_matrix.device.type != "mps" or mps_matrix.dtype is not torch.float32:
        fail("MPS input tensor changed device or dtype")
    if not torch.equal(mps_matrix.detach().to(device="cpu", dtype=torch.float32), mps_snapshot):
        fail("MPS input tensor values changed")
    if not math.isfinite(float(mps_snapshot.mean())):
        fail("MPS input snapshot was invalid")

    print("Hosted deterministic MPS compatibility: NOT RUN (--require-mps)")
    print("Hosted real MPS: NOT RUN (--require-mps selects the physical authority)")
    print("Real MPS execution: PASS")
    print(f"Physical Mac real MPS: PASS (selected device={mps_matrix.device.type})")
    print(f"MPS DTW result: deterministic (path shape={mps_first.shape})")
    print("Original MPS tensor: preserved as mps/torch.float32")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--require-mps", action="store_true")
    args = parser.parse_args()

    mps_built = bool(torch.backends.mps.is_built())
    mps_available = bool(torch.backends.mps.is_available())
    print(f"MPS built: {mps_built}")
    print(f"MPS available: {mps_available}")
    if args.require_mps:
        if not mps_built:
            fail("MPS was explicitly required but was not built")
        if not mps_available:
            fail("MPS was explicitly required but is unavailable")
        run_real_mps_smoke()
    else:
        run_cpu_and_simulated_mps_smoke()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        if "--require-mps" in sys.argv:
            print("Physical Mac real MPS: FAIL", file=sys.stderr)
        print(exc, file=sys.stderr)
        raise SystemExit(1)
