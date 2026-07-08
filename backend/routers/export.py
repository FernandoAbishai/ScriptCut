"""Export endpoint for video cutting and rendering."""

import logging
import tempfile
import os
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.video_editor import export_stream_copy, export_reencode, export_reencode_with_subs
from services.audio_cleaner import clean_audio
from services.caption_generator import generate_srt, generate_ass, save_captions
from services.background_removal import remove_background_on_export
from utils.ffmpeg import find_ffmpeg

logger = logging.getLogger(__name__)
router = APIRouter()


def _remove_if_exists(path: Optional[str]) -> None:
    if not path or not os.path.exists(path):
        return
    try:
        os.remove(path)
    except OSError as e:
        logger.warning(f"Failed to remove temporary export file {path}: {e}")


class SegmentModel(BaseModel):
    start: float
    end: float


class AudioEditRangeModel(SegmentModel):
    kind: str = "mute"


class ExportWordModel(BaseModel):
    word: str
    start: float
    end: float
    confidence: float = 0.0


class CaptionStyleModel(BaseModel):
    fontName: str = "Arial"
    fontSize: int = 48
    fontColor: str = "#ffffff"
    backgroundColor: str = "#000000"
    position: str = "bottom"
    bold: bool = True
    preset: Optional[str] = None
    highlightColor: Optional[str] = None
    wordsPerLine: int = 8


class BackgroundRemovalModel(BaseModel):
    enabled: bool = False
    replacement: str = "blur"
    color: str = "#111827"
    imagePath: Optional[str] = None


class ReframeModel(BaseModel):
    x: float = Field(default=50, ge=0, le=100)
    y: float = Field(default=50, ge=0, le=100)


class ExportRequest(BaseModel):
    input_path: str
    output_path: Optional[str] = None
    keep_segments: List[SegmentModel]
    muted_ranges: List[AudioEditRangeModel] = Field(default_factory=list)
    mode: str = "fast"
    resolution: str = "1080p"
    aspectRatio: str = "source"
    reframe: Optional[ReframeModel] = None
    format: str = "mp4"
    enhanceAudio: bool = False
    captions: str = "none"
    captionStyle: Optional[CaptionStyleModel] = None
    backgroundRemoval: Optional[BackgroundRemovalModel] = None
    words: Optional[List[ExportWordModel]] = None
    deleted_indices: Optional[List[int]] = None


def _default_export_path(input_path: str, format_hint: str) -> str:
    suffix = f".{format_hint if format_hint in {'mp4', 'mov', 'webm'} else 'mp4'}"
    temp_dir = os.path.join(tempfile.gettempdir(), "scriptcut_exports")
    os.makedirs(temp_dir, exist_ok=True)
    stem = os.path.splitext(os.path.basename(input_path))[0] or "scriptcut_export"
    safe_stem = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in stem).strip("_")
    output = tempfile.NamedTemporaryFile(
        prefix=f"{safe_stem or 'scriptcut_export'}_",
        suffix=suffix,
        dir=temp_dir,
        delete=False,
    )
    output.close()
    return output.name


def _mux_audio(video_path: str, audio_path: str, output_path: str) -> str:
    """Replace video's audio track with cleaned audio using FFmpeg."""
    import subprocess
    cmd = [
        find_ffmpeg(), "-y",
        "-i", video_path,
        "-i", audio_path,
        "-c:v", "copy",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-shortest",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Audio mux failed: {result.stderr[-300:]}")
    return output_path


def run_export(req: ExportRequest, progress_callback=None):
    def progress(percent: int, message: str):
        if progress_callback:
            progress_callback(percent, message)

    try:
        progress(5, "Preparing export")
        if not req.output_path:
            req.output_path = _default_export_path(req.input_path, req.format)
        segments = [{"start": s.start, "end": s.end} for s in req.keep_segments]
        warnings = []

        if not segments:
            raise ValueError("No segments to export")

        use_stream_copy = req.mode == "fast" and len(segments) == 1
        needs_reencode_for_subs = req.captions == "burn-in"
        needs_reencode_for_aspect = req.aspectRatio != "source"
        needs_reencode_for_mutes = bool(req.muted_ranges)

        # Burn-in captions, social aspect transforms, and mute layers require re-encode
        if needs_reencode_for_subs or needs_reencode_for_aspect or needs_reencode_for_mutes:
            use_stream_copy = False

        words_dicts = [w.model_dump() for w in req.words] if req.words else []
        deleted_set = set(req.deleted_indices or [])
        muted_ranges = [{"start": r.start, "end": r.end, "kind": r.kind} for r in req.muted_ranges]

        # Generate ASS file for burn-in
        ass_path = None
        if req.captions == "burn-in" and words_dicts:
            progress(15, "Generating captions")
            caption_style = req.captionStyle.model_dump() if req.captionStyle else None
            words_per_line = req.captionStyle.wordsPerLine if req.captionStyle else 8
            ass_content = generate_ass(words_dicts, deleted_set, words_per_line=words_per_line, style=caption_style)
            tmp = tempfile.NamedTemporaryFile(suffix=".ass", delete=False, mode="w", encoding="utf-8")
            tmp.write(ass_content)
            tmp.close()
            ass_path = tmp.name

        try:
            progress(25, "Rendering video")
            if use_stream_copy:
                output = export_stream_copy(req.input_path, req.output_path, segments, progress_callback=progress_callback)
            elif ass_path:
                output = export_reencode_with_subs(
                    req.input_path,
                    req.output_path,
                    segments,
                    ass_path,
                    resolution=req.resolution,
                    format_hint=req.format,
                    aspect_ratio=req.aspectRatio,
                    reframe=req.reframe.model_dump() if req.reframe else None,
                    muted_ranges=muted_ranges,
                    progress_callback=progress_callback,
                )
            else:
                output = export_reencode(
                    req.input_path,
                    req.output_path,
                    segments,
                    resolution=req.resolution,
                    format_hint=req.format,
                    aspect_ratio=req.aspectRatio,
                    reframe=req.reframe.model_dump() if req.reframe else None,
                    muted_ranges=muted_ranges,
                    progress_callback=progress_callback,
                )
        finally:
            if ass_path and os.path.exists(ass_path):
                os.unlink(ass_path)

        # Background removal runs after the edited render so cuts, crops, captions, and mutes are preserved.
        if req.backgroundRemoval and req.backgroundRemoval.enabled:
            progress(72, "Removing background")
            background_output = output + ".bg.mp4"
            replacement_value = req.backgroundRemoval.imagePath or req.backgroundRemoval.color

            def background_progress(percent: int):
                progress(72 + int(percent * 0.08), "Removing background")

            if progress_callback:
                background_progress.check_canceled = getattr(progress_callback, "check_canceled", None)  # type: ignore[attr-defined]
                background_progress.is_cancel_requested = getattr(progress_callback, "is_cancel_requested", None)  # type: ignore[attr-defined]

            try:
                remove_background_on_export(
                    output,
                    background_output,
                    replacement=req.backgroundRemoval.replacement,
                    replacement_value=replacement_value or "",
                    progress_callback=background_progress,
                )
                os.replace(background_output, output)
                background_output = None
            finally:
                _remove_if_exists(background_output)

        # Audio enhancement: clean, then mux back into the exported video
        if req.enhanceAudio:
            tmp_dir = None
            cleaned_audio = None
            muxed_path = None
            try:
                progress(80, "Enhancing audio")
                tmp_dir = tempfile.mkdtemp(prefix="scriptcut_audio_")
                cleaned_audio = os.path.join(tmp_dir, "cleaned.wav")
                clean_audio(output, cleaned_audio)

                muxed_path = output + ".muxed.mp4"
                _mux_audio(output, cleaned_audio, muxed_path)

                os.replace(muxed_path, output)
                muxed_path = None
                logger.info(f"Audio enhanced and muxed into {output}")
            except Exception as e:
                logger.warning(f"Audio enhancement failed (non-fatal): {e}")
                warnings.append(f"Audio enhancement failed: {e}")
            finally:
                _remove_if_exists(muxed_path)
                _remove_if_exists(cleaned_audio)
                if tmp_dir:
                    try:
                        os.rmdir(tmp_dir)
                    except OSError:
                        pass

        # Sidecar SRT: generate and save alongside video
        srt_path = None
        if req.captions == "sidecar" and words_dicts:
            progress(88, "Writing sidecar captions")
            words_per_line = req.captionStyle.wordsPerLine if req.captionStyle else 8
            srt_content = generate_srt(words_dicts, deleted_set, words_per_line=words_per_line)
            srt_path = req.output_path.rsplit(".", 1)[0] + ".srt"
            save_captions(srt_content, srt_path)
            logger.info(f"Sidecar SRT saved to {srt_path}")

        result = {"status": "ok", "output_path": output}
        if srt_path:
            result["srt_path"] = srt_path
        if warnings:
            result["warnings"] = warnings
        progress(100, "Export complete")
        return result

    except Exception:
        raise


@router.post("/export")
async def export_video(req: ExportRequest):
    try:
        return run_export(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        logger.error(f"Export failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Export error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
