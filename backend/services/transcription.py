"""Transcription service with normalized word-level output."""

import logging
from pathlib import Path
from typing import Literal, Optional

import torch

from utils.gpu_utils import get_optimal_device, configure_gpu
from utils.audio_processing import extract_audio
from utils.cache import load_from_cache, save_to_cache

logger = logging.getLogger(__name__)

_model_cache: dict = {}
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


def _load_model(model_name: str, device: torch.device, engine: TranscriptionEngine):
    cache_key = f"{engine}_{model_name}_{device}"
    if cache_key in _model_cache:
        return _model_cache[cache_key]

    logger.info(f"Loading {engine} model: {model_name} on {device}")
    if engine == "parakeet":
        model = _load_parakeet_model(model_name, device)
    elif engine == "whisperx" and WHISPERX_AVAILABLE:
        compute_type = "float16" if device.type == "cuda" else "int8"
        model = whisperx.load_model(
            model_name,
            device=str(device),
            compute_type=compute_type,
        )
    elif engine in {"whisper", "auto"} and WHISPER_AVAILABLE:
        model = whisper.load_model(model_name, device=device)
    else:
        raise RuntimeError(
            "No requested transcription backend is installed. Install whisperx, openai-whisper, or Parakeet dependencies."
        )

    _model_cache[cache_key] = model
    return model


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
            raise RuntimeError("OpenAI Whisper is not installed. Install openai-whisper or choose another transcription engine.")
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
            "whisper": {
                "available": WHISPER_AVAILABLE,
                "default_model": "base",
                "label": "Whisper fallback",
                "first_class": True,
            },
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
    model = _load_model(model_name, device, resolved_engine)

    logger.info(f"Transcribing with {resolved_engine}: {file_path}")

    if resolved_engine == "parakeet":
        result = _transcribe_parakeet(model, str(audio_path))
    elif resolved_engine == "whisperx":
        result = _transcribe_whisperx(model, str(audio_path), device, language)
    else:
        result = _transcribe_standard(model, str(audio_path), language)

    result["engine"] = resolved_engine
    result["model"] = model_name

    if use_cache:
        save_to_cache(file_path, result, model_name, cache_operation)

    return result


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


def _transcribe_standard(model, audio_path: str, language: Optional[str]) -> dict:
    """Fallback: standard Whisper (segment-level only, synthesized word timestamps)."""
    opts = {}
    if language:
        opts["language"] = language

    result = model.transcribe(audio_path, **opts)
    detected_language = result.get("language", "en")

    words = []
    segments = []

    for i, seg in enumerate(result.get("segments", [])):
        text = seg.get("text", "").strip()
        seg_start = seg.get("start", 0)
        seg_end = seg.get("end", 0)
        seg_words_text = text.split()
        duration = seg_end - seg_start

        seg_words = []
        for j, w_text in enumerate(seg_words_text):
            w_start = seg_start + (j / max(len(seg_words_text), 1)) * duration
            w_end = seg_start + ((j + 1) / max(len(seg_words_text), 1)) * duration
            word_obj = {
                "word": w_text,
                "start": round(w_start, 3),
                "end": round(w_end, 3),
                "confidence": 0.5,
            }
            words.append(word_obj)
            seg_words.append(word_obj)

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
