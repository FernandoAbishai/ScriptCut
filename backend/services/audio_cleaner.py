"""
Audio noise reduction using DeepFilterNet.
Falls back to a basic FFmpeg noise filter if DeepFilterNet is not installed.
"""

import logging
import importlib
import importlib.util
import subprocess
from pathlib import Path

from utils.ffmpeg import find_ffmpeg

logger = logging.getLogger(__name__)

def _module_available(module_name: str) -> bool:
    try:
        return importlib.util.find_spec(module_name) is not None
    except (ImportError, AttributeError, ValueError):
        return False


DEEPFILTER_AVAILABLE = _module_available("df")
_deepfilter_failure: Exception | None = None
enhance = init_df = load_audio = save_audio = None


_df_model = None
_df_state = None


def _init_deepfilter():
    global _df_model, _df_state, DEEPFILTER_AVAILABLE, _deepfilter_failure
    _load_deepfilter()
    if _df_model is None:
        logger.info("Initializing DeepFilterNet model")
        _df_model, _df_state, _ = init_df()
    return _df_model, _df_state


def _load_deepfilter() -> None:
    global enhance, init_df, load_audio, save_audio, DEEPFILTER_AVAILABLE, _deepfilter_failure
    if not DEEPFILTER_AVAILABLE:
        raise RuntimeError("DeepFilterNet capability is unavailable in this build")
    if enhance is not None:
        return
    try:
        module = importlib.import_module("df.enhance")
        enhance = module.enhance
        init_df = module.init_df
        load_audio = module.load_audio
        save_audio = module.save_audio
    except Exception as exc:
        _deepfilter_failure = exc
        DEEPFILTER_AVAILABLE = False
        raise RuntimeError("DeepFilterNet capability could not be loaded") from exc


def clean_audio(
    input_path: str,
    output_path: str = "",
) -> str:
    """
    Apply noise reduction to an audio file.

    If DeepFilterNet is available, uses it for high-quality results.
    Otherwise falls back to FFmpeg's anlmdn filter.

    Returns: path to the cleaned audio file.
    """
    input_path = Path(input_path)
    if not output_path:
        output_path = str(input_path.with_stem(input_path.stem + "_clean"))

    if DEEPFILTER_AVAILABLE:
        try:
            return _clean_with_deepfilter(str(input_path), output_path)
        except Exception as exc:
            logger.warning("DeepFilterNet unavailable; using FFmpeg fallback: %s", exc)
    return _clean_with_ffmpeg(str(input_path), output_path)


def _clean_with_deepfilter(input_path: str, output_path: str) -> str:
    model, state = _init_deepfilter()
    audio, info = load_audio(input_path, sr=state.sr())
    enhanced = enhance(model, state, audio)
    save_audio(output_path, enhanced, sr=state.sr())
    logger.info(f"DeepFilterNet cleaned audio saved to {output_path}")
    return output_path


def _clean_with_ffmpeg(input_path: str, output_path: str) -> str:
    """Fallback: basic noise reduction using FFmpeg's anlmdn filter."""
    cmd = [
        find_ffmpeg(), "-y",
        "-i", input_path,
        "-af", "anlmdn=s=7:p=0.002:r=0.002:m=15",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg audio cleaning failed: {result.stderr[-300:]}")
    logger.info(f"FFmpeg cleaned audio saved to {output_path}")
    return output_path


def is_deepfilter_available() -> bool:
    return DEEPFILTER_AVAILABLE
