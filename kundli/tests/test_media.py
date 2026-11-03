"""Social video endpoint: PNG in, playable vertical MP4 out; rejects anything else."""
import shutil
import subprocess

import pytest
from fastapi.testclient import TestClient

import app as service

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
KEY = "k" * 40


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("LIKHA_KUNDLI_KEY", KEY)
    return TestClient(service.app)


def card_png(tmp_path) -> bytes:
    out = tmp_path / "card.png"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x1B1533:s=1080x1350", "-frames:v", "1", str(out)], check=True)
    return out.read_bytes()


def test_short_is_a_vertical_mp4_with_audio(client, tmp_path):
    r = client.post("/v1/media/short?seconds=6", content=card_png(tmp_path), headers={"x-likha-key": KEY, "content-type": "image/png"})
    assert r.status_code == 200 and r.headers["content-type"] == "video/mp4"
    mp4 = tmp_path / "s.mp4"
    mp4.write_bytes(r.content)
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height", "-show_entries", "format=duration",
                            "-of", "csv=p=0", str(mp4)], capture_output=True, text=True, check=True).stdout
    assert "video,1080,1920" in probe.replace(" ", "") or "1080,1920,video" in probe.replace(" ", "")
    assert "audio" in probe
    duration = float([l for l in probe.splitlines() if l and l.replace(".", "").isdigit()][0])
    assert 5.5 <= duration <= 6.5


def test_needs_the_key_and_a_png(client):
    assert client.post("/v1/media/short", content=b"\x89PNG\r\n\x1a\nxx").status_code == 401
    r = client.post("/v1/media/short", content=b"not an image", headers={"x-likha-key": KEY})
    assert r.status_code == 400


def test_jpeg_from_png(client, tmp_path):
    r = client.post("/v1/media/jpeg", content=card_png(tmp_path), headers={"x-likha-key": KEY})
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert r.content[:2] == b"\xff\xd8" and len(r.content) > 1000
