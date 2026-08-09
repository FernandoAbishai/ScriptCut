"""Transcription endpoints."""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.model_manager import BASELINE_MODEL_ID, ModelManagerError, get_model_manager
from services.transcription import evict_model_cache, get_transcription_engine_status, transcribe_audio
from services.diarization import diarize_and_label

logger = logging.getLogger(__name__)
router = APIRouter()


class TranscribeRequest(BaseModel):
    file_path: str
    model: str = "base"
    engine: str = "auto"
    language: Optional[str] = None
    use_gpu: bool = True
    use_cache: bool = True
    diarize: bool = False
    hf_token: Optional[str] = None
    num_speakers: Optional[int] = None


@router.get("/transcription/engines")
async def transcription_engines():
    return get_transcription_engine_status()


@router.get("/transcription/models")
async def transcription_models():
    return {"models": [get_model_manager().status()]}


@router.delete("/transcription/models/{model_id}")
async def delete_transcription_model(model_id: str):
    if model_id != BASELINE_MODEL_ID:
        raise HTTPException(status_code=404, detail="Unknown transcription model")
    try:
        result = get_model_manager().delete(model_id)
        evict_model_cache("whisper", "base")
        return result
    except ModelManagerError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def run_transcription(req: TranscribeRequest, progress_callback=None):
    last_progress = 0

    def progress(percent: int, message: str):
        nonlocal last_progress
        last_progress = max(last_progress, min(100, int(percent)))
        if progress_callback:
            progress_callback(last_progress, message)

    try:
        progress(5, "Preparing transcription")
        result = transcribe_audio(
            file_path=req.file_path,
            model_name=req.model,
            engine=req.engine,
            use_gpu=req.use_gpu,
            use_cache=req.use_cache,
            language=req.language,
            progress_callback=progress,
        )

        if req.diarize and req.hf_token:
            progress(96, "Labeling speakers")
            result = diarize_and_label(
                transcription_result=result,
                audio_path=req.file_path,
                hf_token=req.hf_token,
                num_speakers=req.num_speakers,
                use_gpu=req.use_gpu,
            )

        progress(100, "Transcription complete")
        return result

    except FileNotFoundError:
        raise
    except Exception:
        raise


@router.post("/transcribe")
async def transcribe(req: TranscribeRequest):
    try:
        return run_transcription(req)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not found: {req.file_path}")
    except Exception as e:
        logger.error(f"Transcription failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
