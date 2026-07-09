import logging
import os
import secrets
import stat
import tempfile
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Query, Request, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from routers import transcribe, export, ai, captions, audio, jobs, background, system

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("ScriptCut backend starting up")
    yield
    logger.info("ScriptCut backend shutting down")


app = FastAPI(
    title="ScriptCut Backend",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
)

LOCAL_API_TOKEN = os.getenv("SCRIPTCUT_API_TOKEN", "")


@app.middleware("http")
async def require_local_api_token(request: Request, call_next):
    """Protect packaged local APIs from other processes on the same machine."""
    if (
        LOCAL_API_TOKEN
        and request.method != "OPTIONS"
        and request.url.path != "/health"
        and not secrets.compare_digest(request.headers.get("X-ScriptCut-Token", ""), LOCAL_API_TOKEN)
    ):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized local API request"})
    return await call_next(request)

app.include_router(transcribe.router)
app.include_router(export.router)
app.include_router(ai.router)
app.include_router(captions.router)
app.include_router(audio.router)
app.include_router(jobs.router)
app.include_router(background.router)
app.include_router(system.router)


MIME_MAP = {
    ".mp4": "video/mp4",
    ".mkv": "video/x-matroska",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".webm": "video/webm",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".flac": "audio/flac",
}

UPLOAD_DIR = Path(tempfile.gettempdir()) / "scriptcut_uploads"
SUPPORTED_UPLOAD_EXTENSIONS = set(MIME_MAP)


@app.post("/media/upload")
async def upload_media(file: UploadFile = File(...)):
    """Accept browser-selected media and return a local backend path."""
    source_name = Path(file.filename or "upload").name
    suffix = Path(source_name).suffix.lower()
    if suffix not in SUPPORTED_UPLOAD_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported media type: {suffix or 'unknown'}")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    upload_path = UPLOAD_DIR / f"{uuid.uuid4().hex}{suffix}"
    size = 0

    try:
        with open(upload_path, "wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                output.write(chunk)
    except Exception:
        upload_path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    return {
        "path": str(upload_path),
        "filename": source_name,
        "size": size,
    }


@app.get("/file")
async def serve_local_file(request: Request, path: str = Query(...)):
    """Stream a local file with HTTP Range support (required for video seeking)."""
    file_path = Path(path)
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")

    file_size = file_path.stat().st_size
    content_type = MIME_MAP.get(file_path.suffix.lower(), "application/octet-stream")

    range_header = request.headers.get("range")
    if range_header:
        range_spec = range_header.replace("bytes=", "")
        range_start_str, range_end_str = range_spec.split("-")
        range_start = int(range_start_str) if range_start_str else 0
        range_end = int(range_end_str) if range_end_str else file_size - 1
        range_end = min(range_end, file_size - 1)
        content_length = range_end - range_start + 1

        def iter_range():
            with open(file_path, "rb") as f:
                f.seek(range_start)
                remaining = content_length
                while remaining > 0:
                    chunk = f.read(min(65536, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        return StreamingResponse(
            iter_range(),
            status_code=206,
            media_type=content_type,
            headers={
                "Content-Range": f"bytes {range_start}-{range_end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(content_length),
            },
        )

    def iter_file():
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                yield chunk

    return StreamingResponse(
        iter_file(),
        media_type=content_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
        },
    )


@app.get("/health")
async def health():
    return {"status": "ok"}
