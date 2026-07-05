"""AI feature endpoints: filler word detection, clip creation, and model listing."""

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.ai_provider import AIProvider, detect_filler_words, create_clip_suggestion, create_clip_metadata, create_edit_plan

logger = logging.getLogger(__name__)
router = APIRouter()


class WordInfo(BaseModel):
    index: int
    word: str
    start: Optional[float] = None
    end: Optional[float] = None


class FillerRequest(BaseModel):
    transcript: str
    words: List[WordInfo]
    provider: str = "ollama"
    model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    custom_filler_words: Optional[str] = None


class ClipRequest(BaseModel):
    transcript: str
    words: List[WordInfo]
    provider: str = "ollama"
    model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    target_duration: int = 60


class ClipMetadataRequest(BaseModel):
    transcript: str
    provider: str = "ollama"
    model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None


class EditPlanRequest(BaseModel):
    instruction: str
    transcript: str
    words: List[WordInfo]
    provider: str = "ollama"
    model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None


class ModelListRequest(BaseModel):
    base_url: Optional[str] = None
    api_key: Optional[str] = None


@router.post("/ai/filler-removal")
async def filler_removal(req: FillerRequest):
    try:
        return run_filler_removal(req)
    except Exception as e:
        logger.error(f"Filler detection failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai/create-clip")
async def create_clip(req: ClipRequest):
    try:
        return run_create_clip(req)
    except Exception as e:
        logger.error(f"Clip creation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai/clip-metadata")
async def clip_metadata(req: ClipMetadataRequest):
    try:
        return run_clip_metadata(req)
    except Exception as e:
        logger.error(f"Clip metadata failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai/edit-plan")
async def edit_plan(req: EditPlanRequest):
    try:
        return run_edit_plan(req)
    except Exception as e:
        logger.error(f"Edit plan failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def run_filler_removal(req: FillerRequest, progress_callback=None):
    _progress(progress_callback, 10, "Preparing filler detection")
    words_dicts = [w.model_dump() for w in req.words]
    _progress(progress_callback, 35, "Calling AI provider")
    result = detect_filler_words(
        transcript=req.transcript,
        words=words_dicts,
        provider=req.provider,
        model=req.model,
        api_key=req.api_key,
        base_url=req.base_url,
        custom_filler_words=req.custom_filler_words,
    )
    _progress(progress_callback, 100, "Filler detection complete")
    return result


def run_create_clip(req: ClipRequest, progress_callback=None):
    _progress(progress_callback, 10, "Preparing clip discovery")
    words_dicts = [w.model_dump() for w in req.words]
    _progress(progress_callback, 35, "Calling AI provider")
    result = create_clip_suggestion(
        transcript=req.transcript,
        words=words_dicts,
        target_duration=req.target_duration,
        provider=req.provider,
        model=req.model,
        api_key=req.api_key,
        base_url=req.base_url,
    )
    _progress(progress_callback, 100, "Clip discovery complete")
    return result


def run_clip_metadata(req: ClipMetadataRequest, progress_callback=None):
    _progress(progress_callback, 10, "Preparing clip package")
    _progress(progress_callback, 35, "Calling AI provider")
    result = create_clip_metadata(
        transcript=req.transcript,
        provider=req.provider,
        model=req.model,
        api_key=req.api_key,
        base_url=req.base_url,
    )
    _progress(progress_callback, 100, "Clip package complete")
    return result


def run_edit_plan(req: EditPlanRequest, progress_callback=None):
    _progress(progress_callback, 10, "Preparing edit plan")
    words_dicts = [w.model_dump() for w in req.words]
    _progress(progress_callback, 35, "Calling AI editor")
    result = create_edit_plan(
        instruction=req.instruction,
        transcript=req.transcript,
        words=words_dicts,
        provider=req.provider,
        model=req.model,
        api_key=req.api_key,
        base_url=req.base_url,
    )
    _progress(progress_callback, 100, "Edit plan ready")
    return result


def _progress(progress_callback, percent: int, message: str):
    if progress_callback:
        progress_callback(percent, message)


@router.get("/ai/ollama-models")
async def ollama_models(base_url: str = "http://localhost:11434"):
    models = AIProvider.list_ollama_models(base_url)
    return {"models": models}


@router.get("/ai/ollama-status")
async def ollama_status(base_url: str = "http://localhost:11434"):
    return AIProvider.check_ollama(base_url)


@router.post("/ai/9router-models")
async def nine_router_models(req: ModelListRequest):
    models = AIProvider.list_9router_models(req.base_url or "http://localhost:20128/v1", req.api_key)
    return {"models": models}
