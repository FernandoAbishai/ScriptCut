"""Transcription service with normalized word-level output."""

import logging
import math
import os
import threading
from pathlib import Path
from typing import Literal, Optional

import torch

from utils.gpu_utils import get_optimal_device, configure_gpu
from utils.audio_processing import extract_audio
from utils.cache import load_from_cache, save_to_cache
from services.model_manager import ModelManagerError, get_model_manager

logger = logging.getLogger(__name__)

_model_cache: dict = {}
_model_cache_lock = threading.Lock()
TranscriptionEngine = Literal["whisperx", "whisper", "parakeet", "auto"]
PARAKEET_DEFAULT_MODEL = "nvidia/parakeet-tdt-0.6b-v3"
WHISPER_MODEL_NAMES = {"tiny", "base", "small", "medium", "large"}

try:
    import whisperx
    WHISPERX_AVAILABLE = True
except ImportError:
    whisperx = None
    WHISPERX_AVAILABLE = False

try:
    import whisper
    WHISPER_AVAILABLE = True
except ImportError:
    whisper = None
    WHISPER_AVAILABLE = False

try:
    import nemo.collections.asr as nemo_asr
    NEMO_AVAILABLE = True
except ImportError:
    nemo_asr = None
    NEMO_AVAILABLE = False

try:
    HF_TOKEN = None
    import os
    HF_TOKEN = os.environ.get("HF_TOKEN")
except Exception:
    pass


def _get_device(use_gpu: bool = True) -> torch.device:
    if use_gpu:
        return get_optimal_device()
    return torch.device("cpu")


def _load_model(
    model_name: str,
    device: torch.device,
    engine: TranscriptionEngine,
    progress_callback=None,
):
    model_path = None
    model_revision = "unmanaged"
    if engine == "whisper":
        manager = get_model_manager()
        try:
            model_path = manager.ensure_model(model_name, progress_callback)
            model_revision = manager.manifest["revision"]
        except ModelManagerError:
            raise

    model_stamp = model_path.stat().st_mtime_ns if model_path else "static"
    cache_key = f"{engine}_{model_name}_{model_revision}_{model_stamp}_{device}"
    with _model_cache_lock:
        if cache_key in _model_cache:
            return _model_cache[cache_key]

        logger.info("Loading %s model: %s on %s", engine, model_name, device)
        if engine == "parakeet":
            model = _load_parakeet_model(model_name, device)
        elif engine == "whisperx" and WHISPERX_AVAILABLE:
            compute_type = "float16" if device.type == "cuda" else "int8"
            model = whisperx.load_model(
                model_name,
                device=str(device),
                compute_type=compute_type,
            )
        elif engine == "whisper" and WHISPER_AVAILABLE:
            if progress_callback:
                progress_callback(35, "Loading transcription model")
            model = whisper.load_model(str(model_path), device=device)
        else:
            raise RuntimeError(_missing_engine_message())

        _model_cache[cache_key] = model
        return model


def _missing_engine_message(engine: str | None = None) -> str:
    packaged = os.environ.get("SCRIPTCUT_RUNTIME_MODE") == "packaged-bundled"
    if packaged:
        return "Packaged baseline transcription capability is incomplete. Reinstall ScriptCut to repair it."
    if engine == "whisper":
        return "OpenAI Whisper is not installed. Install openai-whisper or choose another transcription engine."
    return "No requested transcription backend is installed. Install whisperx, openai-whisper, or Parakeet dependencies."


def _resolve_engine(engine: TranscriptionEngine) -> TranscriptionEngine:
    if engine != "auto":
        if engine not in {"whisperx", "whisper", "parakeet"}:
            raise RuntimeError(f"Unknown transcription engine: {engine}")
        if engine == "parakeet" and not NEMO_AVAILABLE:
            raise RuntimeError(
                "Parakeet TDT v3 is not available. Install NVIDIA NeMo ASR dependencies or choose WhisperX/Whisper."
            )
        if engine == "whisperx" and not WHISPERX_AVAILABLE:
            raise RuntimeError("WhisperX is not installed. Install whisperx or choose another transcription engine.")
        if engine == "whisper" and not WHISPER_AVAILABLE:
            raise RuntimeError(_missing_engine_message("whisper"))
        return engine
    if NEMO_AVAILABLE:
        return "parakeet"
    if WHISPERX_AVAILABLE:
        return "whisperx"
    if WHISPER_AVAILABLE:
        return "whisper"
    raise RuntimeError("No transcription backend is installed. Install NVIDIA NeMo ASR, whisperx, or openai-whisper.")


def _load_parakeet_model(model_name: str, device: torch.device):
    if NEMO_AVAILABLE:
        model = nemo_asr.models.ASRModel.from_pretrained(model_name=model_name)
        if hasattr(model, "to"):
            model = model.to(device)
        if hasattr(model, "eval"):
            model.eval()
        return ("nemo", model)

    raise RuntimeError(
        "Parakeet TDT v3 is selected but NVIDIA NeMo ASR is not installed. "
        "Install them with `pip install -U nemo_toolkit['asr']`."
    )


def get_transcription_engine_status() -> dict:
    model_status = get_model_manager().status() if WHISPER_AVAILABLE else {
        "installed": False,
        "verified": False,
        "active": False,
    }
    whisper_status = {
        "available": WHISPER_AVAILABLE,
        "default_model": "base",
        "label": "Whisper baseline",
        "first_class": True,
        "model": model_status,
    }
    if WHISPER_AVAILABLE and os.environ.get("SCRIPTCUT_RUNTIME_MODE") != "packaged-bundled":
        whisper_status["install_hint"] = "Install the managed baseline model on first use."
    return {
        "default_engine": "parakeet" if NEMO_AVAILABLE else "whisperx" if WHISPERX_AVAILABLE else "whisper" if WHISPER_AVAILABLE else None,
        "default_model": PARAKEET_DEFAULT_MODEL if NEMO_AVAILABLE else "base",
        "engines": {
            "parakeet": {
                "available": NEMO_AVAILABLE,
                "default_model": PARAKEET_DEFAULT_MODEL,
                "label": "Parakeet TDT v3 multilingual",
                "first_class": True,
                "languages": 25,
                "install_hint": "pip install -U nemo_toolkit['asr']",
            },
            "whisperx": {
                "available": WHISPERX_AVAILABLE,
                "default_model": "base",
                "label": "WhisperX aligned",
                "first_class": True,
            },
            "whisper": whisper_status,
        },
    }


def _normalize_model_for_engine(model_name: str, engine: TranscriptionEngine) -> str:
    if engine == "parakeet" and model_name in WHISPER_MODEL_NAMES:
        return PARAKEET_DEFAULT_MODEL
    return model_name


def transcribe_audio(
    file_path: str,
    model_name: str = "base",
    engine: TranscriptionEngine = "auto",
    use_gpu: bool = True,
    use_cache: bool = True,
    language: Optional[str] = None,
    progress_callback=None,
) -> dict:
    """
    Transcribe audio/video file and return word-level timestamps.

    Returns:
        dict with keys: words, segments, language
    """
    file_path = Path(file_path)
    if not file_path.exists():
        raise FileNotFoundError(str(file_path))

    resolved_engine = _resolve_engine(engine)
    model_name = _normalize_model_for_engine(model_name, resolved_engine)
    cache_operation = f"transcribe_{resolved_engine}"

    if use_cache:
        cached = load_from_cache(file_path, model_name, cache_operation)
        if cached:
            logger.info("Using cached transcription")
            return cached

    video_extensions = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
    if file_path.suffix.lower() in video_extensions:
        audio_path = extract_audio(file_path)
    else:
        audio_path = file_path

    device = _get_device(use_gpu)
    model = _load_model(model_name, device, resolved_engine, progress_callback)
    if progress_callback:
        progress_callback(45, "Transcribing locally")

    logger.info(f"Transcribing with {resolved_engine}: {file_path}")

    if resolved_engine == "parakeet":
        result = _transcribe_parakeet(model, str(audio_path))
    elif resolved_engine == "whisperx":
        result = _transcribe_whisperx(model, str(audio_path), device, language)
    else:
        result = _transcribe_standard(model, str(audio_path), language)

    result["engine"] = resolved_engine
    result["model"] = model_name

    if progress_callback:
        progress_callback(95, "Finalizing transcript")

    if use_cache:
        save_to_cache(file_path, result, model_name, cache_operation)

    return result


def evict_model_cache(engine: str = "whisper", model_name: str = "base") -> None:
    with _model_cache_lock:
        for key in list(_model_cache):
            if key.startswith(f"{engine}_{model_name}_"):
                _model_cache.pop(key, None)


def _transcribe_parakeet(model_bundle, audio_path: str) -> dict:
    backend = model_bundle[0]
    if backend == "nemo":
        asr_model = model_bundle[1]
        output = asr_model.transcribe([audio_path], timestamps=True)[0]
        if isinstance(output, dict):
            text = output.get("text", "") or ""
            timestamp = output.get("timestamp", {}) or {}
        else:
            text = getattr(output, "text", "") or ""
            timestamp = getattr(output, "timestamp", {}) or {}
        word_stamps = timestamp.get("word") or []
        segment_stamps = timestamp.get("segment") or []
    words = [_normalize_parakeet_word(stamp) for stamp in word_stamps]
    words = [word for word in words if word["word"] and word["end"] >= word["start"]]
    segments = _normalize_parakeet_segments(segment_stamps, words, text)
    return {
        "words": words,
        "segments": segments,
        "language": "auto",
    }


def _normalize_parakeet_word(stamp: dict) -> dict:
    word = stamp.get("word") or stamp.get("text") or stamp.get("segment") or ""
    return {
        "word": str(word).strip(),
        "start": round(float(stamp.get("start", 0) or 0), 3),
        "end": round(float(stamp.get("end", 0) or 0), 3),
        "confidence": round(float(stamp.get("confidence", stamp.get("score", 0.9)) or 0.9), 3),
    }


def _normalize_parakeet_segments(segment_stamps: list, words: list, fallback_text: str) -> list:
    if not segment_stamps:
        return [{
            "id": 0,
            "start": words[0]["start"] if words else 0,
            "end": words[-1]["end"] if words else 0,
            "text": fallback_text,
            "words": words,
        }]

    segments = []
    for i, stamp in enumerate(segment_stamps):
        start = float(stamp.get("start", 0) or 0)
        end = float(stamp.get("end", start) or start)
        segment_words = [word for word in words if word["start"] >= start and word["end"] <= end]
        segments.append({
            "id": i,
            "start": round(start, 3),
            "end": round(end, 3),
            "text": str(stamp.get("segment") or stamp.get("text") or " ".join(word["word"] for word in segment_words)).strip(),
            "words": segment_words,
        })
    return segments


def _transcribe_whisperx(model, audio_path: str, device: torch.device, language: Optional[str]) -> dict:
    audio = whisperx.load_audio(audio_path)
    transcribe_opts = {}
    if language:
        transcribe_opts["language"] = language

    result = model.transcribe(audio, batch_size=16, **transcribe_opts)
    detected_language = result.get("language", "en")

    align_model, align_metadata = whisperx.load_align_model(
        language_code=detected_language,
        device=str(device),
    )
    aligned = whisperx.align(
        result["segments"],
        align_model,
        align_metadata,
        audio,
        str(device),
        return_char_alignments=False,
    )

    words = []
    for seg in aligned.get("segments", []):
        for w in seg.get("words", []):
            words.append({
                "word": w.get("word", ""),
                "start": round(w.get("start", 0), 3),
                "end": round(w.get("end", 0), 3),
                "confidence": round(w.get("score", 0), 3),
            })

    segments = []
    for i, seg in enumerate(aligned.get("segments", [])):
        seg_words = []
        for w in seg.get("words", []):
            seg_words.append({
                "word": w.get("word", ""),
                "start": round(w.get("start", 0), 3),
                "end": round(w.get("end", 0), 3),
                "confidence": round(w.get("score", 0), 3),
            })
        segments.append({
            "id": i,
            "start": round(seg.get("start", 0), 3),
            "end": round(seg.get("end", 0), 3),
            "text": seg.get("text", "").strip(),
            "words": seg_words,
        })

    return {
        "words": words,
        "segments": segments,
        "language": detected_language,
    }


def _normalize_whisper_word(word: dict) -> dict | None:
    text = str(word.get("word") or "").strip()
    try:
        start = float(word.get("start"))
        end = float(word.get("end"))
    except (TypeError, ValueError):
        return None
    if not text or not math.isfinite(start) or not math.isfinite(end) or start < 0 or end < start:
        return None
    confidence_value = word.get("probability", word.get("score", word.get("confidence", 0.5)))
    try:
        confidence = float(confidence_value)
    except (TypeError, ValueError):
        confidence = 0.5
    if not math.isfinite(confidence):
        confidence = 0.5
    return {
        "word": text,
        "start": round(start, 3),
        "end": round(end, 3),
        "confidence": round(max(0.0, min(1.0, confidence)), 3),
    }


def _synthesize_segment_words(text: str, seg_start: float, seg_end: float) -> list[dict]:
    seg_words_text = text.split()
    duration = max(0.0, seg_end - seg_start)
    words = []
    for index, word_text in enumerate(seg_words_text):
        word_start = seg_start + (index / max(len(seg_words_text), 1)) * duration
        word_end = seg_start + ((index + 1) / max(len(seg_words_text), 1)) * duration
        words.append({
            "word": word_text,
            "start": round(max(0.0, word_start), 3),
            "end": round(max(word_start, word_end), 3),
            "confidence": 0.5,
        })
    return words


def _transcribe_standard(model, audio_path: str, language: Optional[str]) -> dict:
    """Use Whisper word timing when present and synthesize only missing segment timing."""
    opts = {}
    if language:
        opts["language"] = language

    result = model.transcribe(audio_path, word_timestamps=True, **opts)
    detected_language = result.get("language", "en")

    words = []
    segments = []

    for i, seg in enumerate(result.get("segments", [])):
        text = seg.get("text", "").strip()
        try:
            seg_start = max(0.0, float(seg.get("start", 0) or 0))
            seg_end = max(seg_start, float(seg.get("end", seg_start) or seg_start))
        except (TypeError, ValueError):
            seg_start = 0.0
            seg_end = 0.0

        real_words = []
        for raw_word in seg.get("words", []) or []:
            if isinstance(raw_word, dict):
                normalized = _normalize_whisper_word(raw_word)
                if normalized:
                    real_words.append(normalized)
        seg_words = sorted(real_words, key=lambda word: (word["start"], word["end"])) or _synthesize_segment_words(text, seg_start, seg_end)
        words.extend(seg_words)

        segments.append({
            "id": i,
            "start": round(seg_start, 3),
            "end": round(seg_end, 3),
            "text": text,
            "words": seg_words,
        })

    return {
        "words": words,
        "segments": segments,
        "language": detected_language,
    }
