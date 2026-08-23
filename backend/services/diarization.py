"""
Speaker diarization service using pyannote.audio.
Refactored from the original repo -- removed Streamlit dependency.
"""

import inspect
import logging
import os
from pathlib import Path
from typing import Optional

import torch

from utils.audio_processing import cleanup_temp_audio, extract_audio
from utils.gpu_utils import get_optimal_device

logger = logging.getLogger(__name__)

_pipeline_cache = {}
_DIARIZATION_MODEL = "pyannote/speaker-diarization-3.0"
_VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}


def _redact_error(error: Exception, secret: Optional[str]) -> str:
    message = str(error)
    return message.replace(secret, "[REDACTED]") if secret else message


def _load_pipeline(Pipeline, hf_token: str):
    """Load the diarization pipeline across pyannote.audio API generations."""
    from_pretrained = Pipeline.from_pretrained
    parameters = inspect.signature(from_pretrained).parameters
    if "token" in parameters:
        auth_argument = "token"
    elif "use_auth_token" in parameters:
        auth_argument = "use_auth_token"
    else:
        raise TypeError(
            "Unsupported pyannote Pipeline.from_pretrained API: "
            "expected token or use_auth_token"
        )

    return from_pretrained(_DIARIZATION_MODEL, **{auth_argument: hf_token})


def _normalize_diarization_result(result):
    """Return the regular Annotation for pyannote 3.x and 4.x results."""
    diarization = getattr(result, "speaker_diarization", None)
    return diarization if diarization is not None else result


def _get_pipeline(hf_token: str, device: torch.device):
    cache_key = str(device)
    if cache_key in _pipeline_cache:
        return _pipeline_cache[cache_key]

    try:
        from pyannote.audio import Pipeline

        pipeline = _load_pipeline(Pipeline, hf_token)
        if device.type == "cuda":
            pipeline = pipeline.to(device)

        _pipeline_cache[cache_key] = pipeline
        return pipeline
    except Exception as e:
        logger.error(
            "Failed to load diarization pipeline: %s",
            _redact_error(e, hf_token),
        )
        return None


def diarize_and_label(
    transcription_result: dict,
    audio_path: str,
    hf_token: Optional[str] = None,
    num_speakers: Optional[int] = None,
    use_gpu: bool = True,
) -> dict:
    """
    Apply speaker diarization to an existing transcription result.
    Adds 'speaker' field to each word and segment.

    Returns the mutated transcription_result with speaker labels.
    """
    hf_token = hf_token or os.environ.get("HF_TOKEN")
    if not hf_token:
        logger.warning("No HuggingFace token provided; skipping diarization")
        return transcription_result

    source_path = Path(audio_path)
    temporary_audio_path = None
    try:
        if source_path.suffix.lower() in _VIDEO_EXTENSIONS:
            try:
                temporary_audio_path = extract_audio(source_path)
                diarization_audio_path = temporary_audio_path
            except Exception as e:
                logger.error(
                    "Diarization audio normalization failed: %s",
                    _redact_error(e, hf_token),
                )
                return transcription_result
        else:
            diarization_audio_path = source_path

        device = get_optimal_device() if use_gpu else torch.device("cpu")
        pipeline = _get_pipeline(hf_token, device)
        if pipeline is None:
            return transcription_result

        logger.info("Running diarization on %s", source_path)
        result = pipeline(str(diarization_audio_path), num_speakers=num_speakers)
        diarization = _normalize_diarization_result(result)
        speaker_map = [
            (turn.start, turn.end, speaker)
            for turn, _, speaker in diarization.itertracks(yield_label=True)
        ]

        def _find_speaker(start: float, end: float) -> str:
            best_overlap = 0
            best_speaker = "UNKNOWN"
            for s_start, s_end, speaker in speaker_map:
                overlap_start = max(start, s_start)
                overlap_end = min(end, s_end)
                overlap = max(0, overlap_end - overlap_start)
                if overlap > best_overlap:
                    best_overlap = overlap
                    best_speaker = speaker
            return best_speaker

        for word in transcription_result.get("words", []):
            word["speaker"] = _find_speaker(word["start"], word["end"])

        for segment in transcription_result.get("segments", []):
            segment["speaker"] = _find_speaker(segment["start"], segment["end"])
            for w in segment.get("words", []):
                w["speaker"] = _find_speaker(w["start"], w["end"])

        return transcription_result
    except Exception as e:
        logger.error(
            "Diarization execution failed: %s",
            _redact_error(e, hf_token),
        )
        return transcription_result
    finally:
        cleanup_temp_audio(temporary_audio_path)
