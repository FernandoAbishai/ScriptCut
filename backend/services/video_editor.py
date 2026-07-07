"""
FFmpeg-based video cutting engine.
Uses stream copy for fast, lossless cuts and falls back to re-encode when needed.
"""

import logging
import subprocess
import tempfile
import os
import json
from pathlib import Path
from typing import List

logger = logging.getLogger(__name__)


def _find_ffmpeg() -> str:
    """Locate ffmpeg binary."""
    for cmd in ["ffmpeg", "ffmpeg.exe"]:
        try:
            subprocess.run([cmd, "-version"], capture_output=True, check=True)
            return cmd
        except (FileNotFoundError, subprocess.CalledProcessError):
            continue
    raise RuntimeError("FFmpeg not found. Install it or add it to PATH.")


def _find_ffprobe() -> str:
    ffmpeg = _find_ffmpeg()
    candidates = [ffmpeg.replace("ffmpeg", "ffprobe"), "ffprobe", "ffprobe.exe"]
    for cmd in candidates:
        try:
            subprocess.run([cmd, "-version"], capture_output=True, check=True)
            return cmd
        except (FileNotFoundError, subprocess.CalledProcessError):
            continue
    raise RuntimeError("FFprobe not found. Install FFmpeg with ffprobe or add it to PATH.")


def _has_audio_stream(input_path: str) -> bool:
    cmd = [
        _find_ffprobe(),
        "-v", "quiet",
        "-print_format", "json",
        "-show_streams",
        str(input_path),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout or "{}")
    except Exception as e:
        logger.warning(f"Could not inspect audio streams for {input_path}: {e}")
        return True
    return any(stream.get("codec_type") == "audio" for stream in data.get("streams", []))


def _container_args(format_hint: str) -> list[str]:
    return ["-movflags", "+faststart"] if format_hint in {"mp4", "mov"} else []


def export_stream_copy(
    input_path: str,
    output_path: str,
    keep_segments: List[dict],
    progress_callback=None,
) -> str:
    """
    Export video using FFmpeg concat demuxer with stream copy.
    ~100x faster than re-encoding. No quality loss.

    Args:
        input_path: source video file
        output_path: destination file
        keep_segments: list of {"start": float, "end": float} to keep

    Returns:
        output_path on success
    """
    ffmpeg = _find_ffmpeg()
    input_path = str(Path(input_path).resolve())
    output_path = str(Path(output_path).resolve())

    if not keep_segments:
        raise ValueError("No segments to export")

    temp_dir = tempfile.mkdtemp(prefix="scriptcut_export_")

    try:
        segment_files = []
        for i, seg in enumerate(keep_segments):
            _check_canceled(progress_callback)
            seg_file = os.path.join(temp_dir, f"seg_{i:04d}.ts")
            cmd = [
                ffmpeg, "-y",
                "-ss", str(seg["start"]),
                "-to", str(seg["end"]),
                "-i", input_path,
                "-c", "copy",
                "-avoid_negative_ts", "make_zero",
                "-f", "mpegts",
                seg_file,
            ]
            logger.info(f"Extracting segment {i}: {seg['start']:.2f}s - {seg['end']:.2f}s")
            result = _run_ffmpeg(cmd, progress_callback)
            if result.returncode != 0:
                logger.warning(f"Stream copy segment {i} failed, will try re-encode: {result.stderr[-200:]}")
                return export_reencode(input_path, output_path, keep_segments, progress_callback=progress_callback)
            segment_files.append(seg_file)

        concat_str = "|".join(segment_files)
        cmd = [
            ffmpeg, "-y",
            "-i", f"concat:{concat_str}",
            "-c", "copy",
            *_container_args(Path(output_path).suffix.lower().lstrip(".")),
            output_path,
        ]
        logger.info(f"Concatenating {len(segment_files)} segments -> {output_path}")
        result = _run_ffmpeg(cmd, progress_callback)
        if result.returncode != 0:
            logger.warning(f"Concat failed, falling back to re-encode: {result.stderr[-200:]}")
            return export_reencode(input_path, output_path, keep_segments, progress_callback=progress_callback)

        return output_path

    finally:
        for f in os.listdir(temp_dir):
            try:
                os.remove(os.path.join(temp_dir, f))
            except OSError:
                pass
        try:
            os.rmdir(temp_dir)
        except OSError:
            pass


def export_reencode(
    input_path: str,
    output_path: str,
    keep_segments: List[dict],
    resolution: str = "1080p",
    format_hint: str = "mp4",
    aspect_ratio: str = "source",
    reframe: dict | None = None,
    muted_ranges: List[dict] | None = None,
    progress_callback=None,
) -> str:
    """
    Export video with full re-encode. Slower but supports resolution changes,
    format conversion, and avoids stream-copy edge cases.
    """
    ffmpeg = _find_ffmpeg()
    input_path = str(Path(input_path).resolve())
    output_path = str(Path(output_path).resolve())

    if not keep_segments:
        raise ValueError("No segments to export")

    muted_ranges = muted_ranges or []
    has_audio = _has_audio_stream(input_path)
    filter_parts = []
    for i, seg in enumerate(keep_segments):
        audio_label = _build_audio_trim_filter(i, seg, muted_ranges) if has_audio else ""
        filter_parts.append(
            f"[0:v]trim=start={seg['start']}:end={seg['end']},setpts=PTS-STARTPTS[v{i}];"
            f"{audio_label}"
        )

    n = len(keep_segments)
    if has_audio:
        concat_inputs = "".join(f"[v{i}][a{i}]" for i in range(n))
        filter_parts.append(f"{concat_inputs}concat=n={n}:v=1:a=1[outv][outa]")
    else:
        concat_inputs = "".join(f"[v{i}]" for i in range(n))
        filter_parts.append(f"{concat_inputs}concat=n={n}:v=1:a=0[outv]")

    filter_complex = "".join(filter_parts)

    video_filter = _build_video_filter(resolution, aspect_ratio, reframe)
    if video_filter:
        filter_complex += f";[outv]{video_filter}[outv_scaled]"
        video_map = "[outv_scaled]"
    else:
        video_map = "[outv]"

    codec_args = ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "192k"]
    if format_hint == "webm":
        codec_args = ["-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", "-c:a", "libopus"]

    cmd = [
        ffmpeg, "-y",
        "-i", input_path,
        "-filter_complex", filter_complex,
        "-map", video_map,
        *codec_args,
        *_container_args(format_hint),
        output_path,
    ]
    if has_audio:
        cmd = [
            ffmpeg, "-y",
            "-i", input_path,
            "-filter_complex", filter_complex,
            "-map", video_map,
            "-map", "[outa]",
            *codec_args,
            *_container_args(format_hint),
            output_path,
        ]

    logger.info(f"Re-encoding {n} segments -> {output_path} ({resolution}, {aspect_ratio})")
    result = _run_ffmpeg(cmd, progress_callback)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg re-encode failed: {result.stderr[-500:]}")

    return output_path


def export_reencode_with_subs(
    input_path: str,
    output_path: str,
    keep_segments: List[dict],
    subtitle_path: str,
    resolution: str = "1080p",
    format_hint: str = "mp4",
    aspect_ratio: str = "source",
    reframe: dict | None = None,
    muted_ranges: List[dict] | None = None,
    progress_callback=None,
) -> str:
    """
    Export video with re-encode and burn-in subtitles (ASS format).
    Applies trim+concat first, then overlays the subtitle file.
    """
    ffmpeg = _find_ffmpeg()
    input_path = str(Path(input_path).resolve())
    output_path = str(Path(output_path).resolve())
    subtitle_path = str(Path(subtitle_path).resolve())

    if not keep_segments:
        raise ValueError("No segments to export")

    muted_ranges = muted_ranges or []
    has_audio = _has_audio_stream(input_path)
    filter_parts = []
    for i, seg in enumerate(keep_segments):
        audio_label = _build_audio_trim_filter(i, seg, muted_ranges) if has_audio else ""
        filter_parts.append(
            f"[0:v]trim=start={seg['start']}:end={seg['end']},setpts=PTS-STARTPTS[v{i}];"
            f"{audio_label}"
        )

    n = len(keep_segments)
    if has_audio:
        concat_inputs = "".join(f"[v{i}][a{i}]" for i in range(n))
        filter_parts.append(f"{concat_inputs}concat=n={n}:v=1:a=1[outv][outa]")
    else:
        concat_inputs = "".join(f"[v{i}]" for i in range(n))
        filter_parts.append(f"{concat_inputs}concat=n={n}:v=1:a=0[outv]")

    filter_complex = "".join(filter_parts)

    # Escape path for FFmpeg subtitle filter (Windows backslashes need escaping)
    escaped_sub = subtitle_path.replace("\\", "/").replace(":", "\\:")

    video_filter = _build_video_filter(resolution, aspect_ratio, reframe)
    if video_filter:
        filter_complex += f";[outv]{video_filter},ass='{escaped_sub}'[outv_final]"
    else:
        filter_complex += f";[outv]ass='{escaped_sub}'[outv_final]"
    video_map = "[outv_final]"

    codec_args = ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "192k"]
    if format_hint == "webm":
        codec_args = ["-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", "-c:a", "libopus"]

    cmd = [
        ffmpeg, "-y",
        "-i", input_path,
        "-filter_complex", filter_complex,
        "-map", video_map,
        *codec_args,
        *_container_args(format_hint),
        output_path,
    ]
    if has_audio:
        cmd = [
            ffmpeg, "-y",
            "-i", input_path,
            "-filter_complex", filter_complex,
            "-map", video_map,
            "-map", "[outa]",
            *codec_args,
            *_container_args(format_hint),
            output_path,
        ]

    logger.info(f"Re-encoding {n} segments with subtitles -> {output_path} ({resolution}, {aspect_ratio})")
    result = _run_ffmpeg(cmd, progress_callback)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg re-encode with subs failed: {result.stderr[-500:]}")

    return output_path


def _build_audio_trim_filter(index: int, segment: dict, muted_ranges: List[dict]) -> str:
    segment_duration = max(0, segment["end"] - segment["start"])
    chain = (
        f"[0:a]atrim=start={segment['start']}:end={segment['end']},"
        f"asetpts=PTS-STARTPTS[a{index}base];"
    )
    current_label = f"a{index}base"
    step = 0

    for muted in muted_ranges:
        start = max(segment["start"], muted["start"])
        end = min(segment["end"], muted["end"])
        if end <= start:
            continue

        local_start = max(0, start - segment["start"])
        local_end = max(local_start, end - segment["start"])
        next_label = f"a{index}m{step}"
        chain += (
            f"[{current_label}]volume=0:enable='between(t,{local_start:.3f},{local_end:.3f})'"
            f"[{next_label}];"
        )
        current_label = next_label

        if muted.get("kind") == "room-tone" and segment_duration > 0:
            noise_label = f"a{index}n{step}"
            mixed_label = f"a{index}r{step}"
            chain += (
                f"anoisesrc=color=pink:duration={segment_duration:.3f}:amplitude=0.006,"
                f"volume='if(between(t,{local_start:.3f},{local_end:.3f}),1,0)':eval=frame"
                f"[{noise_label}];"
                f"[{current_label}][{noise_label}]amix=inputs=2:duration=first:normalize=0"
                f"[{mixed_label}];"
            )
            current_label = mixed_label

        step += 1

    if current_label != f"a{index}":
        chain += f"[{current_label}]anull[a{index}];"
    return chain


def _build_video_filter(resolution: str, aspect_ratio: str, reframe: dict | None = None) -> str:
    source_height = {
        "720p": 720,
        "1080p": 1080,
        "4k": 2160,
    }.get(resolution)

    if not source_height:
        return ""

    x = _clamp_percent((reframe or {}).get("x", 50)) / 100
    y = _clamp_percent((reframe or {}).get("y", 50)) / 100
    crop_x = f"(iw-ow)*{x:.4f}"
    crop_y = f"(ih-oh)*{y:.4f}"

    if aspect_ratio == "vertical":
        width = source_height
        height = int(source_height * 16 / 9)
        return (
            f"scale={width}:{height}:force_original_aspect_ratio=increase,"
            f"crop={width}:{height}:{crop_x}:{crop_y}"
        )

    if aspect_ratio == "square":
        return (
            f"scale={source_height}:{source_height}:force_original_aspect_ratio=increase,"
            f"crop={source_height}:{source_height}:{crop_x}:{crop_y}"
        )

    return f"scale=-2:{source_height}"


def _clamp_percent(value: object) -> float:
    try:
        percent = float(value)
    except (TypeError, ValueError):
        return 50.0
    return max(0.0, min(100.0, percent))


def _check_canceled(progress_callback=None) -> None:
    check = getattr(progress_callback, "check_canceled", None)
    if callable(check):
        check()


def _run_ffmpeg(cmd: list[str], progress_callback=None) -> subprocess.CompletedProcess[str]:
    process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    while process.poll() is None:
        try:
            _check_canceled(progress_callback)
        except Exception:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            raise

        try:
            process.wait(timeout=0.25)
        except subprocess.TimeoutExpired:
            continue

    stdout, stderr = process.communicate()
    return subprocess.CompletedProcess(cmd, process.returncode, stdout, stderr)


def get_video_info(input_path: str) -> dict:
    """Get basic video metadata using ffprobe."""
    ffprobe = _find_ffprobe()

    cmd = [
        ffprobe, "-v", "quiet",
        "-print_format", "json",
        "-show_format", "-show_streams",
        str(input_path),
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
        fmt = data.get("format", {})
        video_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})

        return {
            "duration": float(fmt.get("duration", 0)),
            "size": int(fmt.get("size", 0)),
            "format": fmt.get("format_name", ""),
            "width": int(video_stream.get("width", 0)),
            "height": int(video_stream.get("height", 0)),
            "codec": video_stream.get("codec_name", ""),
            "fps": eval(video_stream.get("r_frame_rate", "0/1")) if "/" in video_stream.get("r_frame_rate", "") else 0,
        }
    except Exception as e:
        logger.error(f"Failed to get video info: {e}")
        return {}
