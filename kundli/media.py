"""Social videos: one card image in, a short vertical video out (Instagram Reels, YouTube Shorts, Facebook).

Lives in this service only because it is our one Python container; it does no astrology and knows nothing about members.
A slow push-in on the card with a soft fade, H.264 + silent AAC (platforms reject some files with no audio track).
"""
from __future__ import annotations

import os
import subprocess
import tempfile

MAX_PNG_BYTES = 8 * 1024 * 1024
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def short_from_png(png: bytes, seconds: int = 10) -> bytes:
    if not png.startswith(PNG_MAGIC):
        raise ValueError("expected a PNG image")
    if len(png) > MAX_PNG_BYTES:
        raise ValueError("image too large")
    seconds = max(5, min(30, int(seconds)))
    frames = seconds * 30
    with tempfile.TemporaryDirectory(dir=os.environ.get("TMPDIR", "/tmp")) as d:
        src, out = os.path.join(d, "card.png"), os.path.join(d, "short.mp4")
        with open(src, "wb") as f:
            f.write(png)
        vf = (
            "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x1B1533,"
            f"zoompan=z='min(zoom+0.0004,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s=1080x1920:fps=30,"
            f"fade=t=in:st=0:d=0.6,fade=t=out:st={seconds - 0.6}:d=0.6,format=yuv420p"
        )
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", src,
               "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
               "-vf", vf, "-t", str(seconds), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-profile:v", "high",
               "-c:a", "aac", "-b:a", "64k", "-shortest", "-movflags", "+faststart", "-threads", "2", out]
        subprocess.run(cmd, check=True, timeout=120, capture_output=True)
        with open(out, "rb") as f:
            return f.read()


def jpeg_from_png(png: bytes, quality: int = 3) -> bytes:
    """Instagram takes JPEG only: the card PNG as a high-quality JPEG (ffmpeg -q:v 2-4)."""
    if not png.startswith(PNG_MAGIC):
        raise ValueError("expected a PNG image")
    if len(png) > MAX_PNG_BYTES:
        raise ValueError("image too large")
    with tempfile.TemporaryDirectory(dir=os.environ.get("TMPDIR", "/tmp")) as d:
        src, out = os.path.join(d, "card.png"), os.path.join(d, "card.jpg")
        with open(src, "wb") as f:
            f.write(png)
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-q:v", str(max(2, min(6, quality))),
                        "-pix_fmt", "yuvj420p", out], check=True, timeout=30, capture_output=True)
        with open(out, "rb") as f:
            return f.read()
