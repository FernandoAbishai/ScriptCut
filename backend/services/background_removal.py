"""Export-time background removal using optional local segmentation backends."""

import logging
import importlib
import importlib.util
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from utils.ffmpeg import find_ffmpeg

logger = logging.getLogger(__name__)

def _module_available(module_name: str) -> bool:
    try:
        return importlib.util.find_spec(module_name) is not None
    except (ImportError, AttributeError, ValueError):
        return False


MEDIAPIPE_AVAILABLE = _module_available("mediapipe")
RVM_AVAILABLE = False
CV2_AVAILABLE = _module_available("cv2")
mp = None
cv2 = None
np = None


def is_available() -> bool:
    return (MEDIAPIPE_AVAILABLE and CV2_AVAILABLE) or RVM_AVAILABLE


def capabilities() -> dict:
    """Return discoverable support without importing optional modules."""
    return {
        "available": is_available(),
        "mediapipe": MEDIAPIPE_AVAILABLE,
        "opencv": CV2_AVAILABLE,
        "rvm": RVM_AVAILABLE,
        "replacements": ["blur", "color", "image"],
    }


def _load_mediapipe_backends() -> None:
    global MEDIAPIPE_AVAILABLE, CV2_AVAILABLE, mp, cv2, np
    if not MEDIAPIPE_AVAILABLE or not CV2_AVAILABLE:
        raise RuntimeError("Background removal capability is unavailable in this build")
    if mp is not None and cv2 is not None and np is not None:
        return
    try:
        mp = importlib.import_module("mediapipe")
        cv2 = importlib.import_module("cv2")
        np = importlib.import_module("numpy")
    except Exception as exc:
        MEDIAPIPE_AVAILABLE = False
        CV2_AVAILABLE = False
        raise RuntimeError("Background removal capability could not be loaded") from exc


def _missing_capability_message() -> str:
    if os.environ.get("SCRIPTCUT_RUNTIME_MODE") == "packaged-bundled":
        return "Background removal is not included in this ScriptCut build."
    return "Background removal requires local MediaPipe and OpenCV. Install mediapipe and opencv-python for source development."


def remove_background_on_export(
    input_path: str,
    output_path: str,
    replacement: str = "blur",
    replacement_value: str = "",
    progress_callback=None,
) -> str:
    """
    Process video frame-by-frame to remove/replace background.
    Only runs during export (not real-time).

    Args:
        input_path: source video
        output_path: destination
        replacement: 'blur', 'color', 'image', or 'video'
        replacement_value: hex color, image path, or video path

    Returns:
        output_path
    """
    if not is_available():
        raise RuntimeError(_missing_capability_message())

    if replacement not in {"blur", "color", "image"}:
        raise ValueError("Background replacement must be blur, color, or image")

    _check_canceled(progress_callback)

    try:
        _load_mediapipe_backends()
        return _remove_with_mediapipe(input_path, output_path, replacement, replacement_value, progress_callback)
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError("Background removal failed while loading its optional capability") from exc

def _remove_with_mediapipe(
    input_path: str,
    output_path: str,
    replacement: str,
    replacement_value: str,
    progress_callback=None,
) -> str:
    assert cv2 is not None
    assert np is not None
    assert mp is not None

    input_path = str(Path(input_path).resolve())
    output_path = str(Path(output_path).resolve())
    temp_dir = tempfile.mkdtemp(prefix="scriptcut_bg_")
    silent_output = os.path.join(temp_dir, "video_no_audio.mp4")

    capture = cv2.VideoCapture(input_path)
    if not capture.isOpened():
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise RuntimeError(f"Could not open video for background removal: {input_path}")

    fps = capture.get(cv2.CAP_PROP_FPS) or 30
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    writer = cv2.VideoWriter(silent_output, cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
    if not writer.isOpened():
        capture.release()
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise RuntimeError("Could not create temporary background-removal video")

    background_image = _load_background_image(replacement_value, width, height) if replacement == "image" else None

    try:
        with mp.solutions.selfie_segmentation.SelfieSegmentation(model_selection=1) as segmenter:
            frame_index = 0
            while True:
                _check_canceled(progress_callback)
                ok, frame = capture.read()
                if not ok:
                    break

                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                result = segmenter.process(rgb)
                mask = result.segmentation_mask
                mask = cv2.GaussianBlur(mask, (11, 11), 0)
                mask_3 = np.stack((mask,) * 3, axis=-1)

                background = _make_background(frame, replacement, replacement_value, background_image)
                composed = (mask_3 * frame + (1 - mask_3) * background).astype(np.uint8)
                writer.write(composed)

                frame_index += 1
                if progress_callback and total_frames and frame_index % 15 == 0:
                    progress_callback(min(99, int(frame_index / total_frames * 100)))
    finally:
        capture.release()
        writer.release()

    try:
        _check_canceled(progress_callback)
        _mux_original_audio(silent_output, input_path, output_path)
        return output_path
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def _make_background(frame, replacement: str, replacement_value: str, background_image):
    if replacement == "blur":
        return cv2.GaussianBlur(frame, (61, 61), 0)

    if replacement == "image":
        if background_image is None:
            raise RuntimeError("Background image path is missing or invalid")
        return background_image

    color = _parse_hex_color(replacement_value or "#111827")
    return np.full_like(frame, color)


def _load_background_image(path: str, width: int, height: int):
    if not path:
        return None
    image = cv2.imread(path)
    if image is None:
        return None
    return cv2.resize(image, (width, height), interpolation=cv2.INTER_AREA)


def _parse_hex_color(value: str):
    color = value.strip().lstrip("#")
    if len(color) != 6:
        color = "111827"
    try:
        red = int(color[0:2], 16)
        green = int(color[2:4], 16)
        blue = int(color[4:6], 16)
    except ValueError:
        red, green, blue = 17, 24, 39
    return [blue, green, red]


def _check_canceled(progress_callback=None) -> None:
    check = getattr(progress_callback, "check_canceled", None)
    if callable(check):
        check()


def _mux_original_audio(video_path: str, source_audio_path: str, output_path: str) -> None:
    cmd = [
        find_ffmpeg(), "-y",
        "-i", video_path,
        "-i", source_audio_path,
        "-map", "0:v:0",
        "-map", "1:a:0?",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "18",
        "-c:a", "aac",
        "-shortest",
        "-movflags", "+faststart",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Background-removal audio mux failed: {result.stderr[-500:]}")
