"""Background job endpoints for long-running local operations."""

from fastapi import APIRouter, HTTPException

from routers.ai import (
    ClipMetadataRequest,
    ClipRequest,
    FillerRequest,
    run_clip_metadata,
    run_create_clip,
    run_filler_removal,
)
from routers.export import ExportRequest, run_export
from routers.transcribe import TranscribeRequest, run_transcription
from services.job_manager import job_manager

router = APIRouter()


@router.post("/jobs/export")
async def create_export_job(req: ExportRequest):
    job_id = job_manager.create("export", lambda progress: run_export(req, progress))
    return {"job_id": job_id}


@router.post("/jobs/transcribe")
async def create_transcription_job(req: TranscribeRequest):
    job_id = job_manager.create("transcribe", lambda progress: run_transcription(req, progress))
    return {"job_id": job_id}


@router.post("/jobs/ai/filler-removal")
async def create_filler_removal_job(req: FillerRequest):
    job_id = job_manager.create("ai:filler-removal", lambda progress: run_filler_removal(req, progress))
    return {"job_id": job_id}


@router.post("/jobs/ai/create-clip")
async def create_clip_job(req: ClipRequest):
    job_id = job_manager.create("ai:create-clip", lambda progress: run_create_clip(req, progress))
    return {"job_id": job_id}


@router.post("/jobs/ai/clip-metadata")
async def create_clip_metadata_job(req: ClipMetadataRequest):
    job_id = job_manager.create("ai:clip-metadata", lambda progress: run_clip_metadata(req, progress))
    return {"job_id": job_id}


@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    job = job_manager.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    job = job_manager.cancel(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/jobs/{job_id}/retry")
async def retry_job(job_id: str):
    job = job_manager.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") not in {"failed", "canceled"}:
        raise HTTPException(status_code=409, detail="Only failed or canceled jobs can be retried")

    retry_job_id = job_manager.retry(job_id)
    if not retry_job_id:
        raise HTTPException(status_code=409, detail="Job cannot be retried")
    return {"job_id": retry_job_id}
