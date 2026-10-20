import os

os.environ["LIKHA_KUNDLI_KEY"] = "test-key"
from fastapi.testclient import TestClient  # noqa: E402

from app import app  # noqa: E402

c = TestClient(app)
H = {"X-Likha-Key": "test-key"}
B = {"birth_date": "1997-08-14", "birth_time": "21:10", "lat": 26.9124, "lng": 75.7873, "tz_name": "Asia/Kolkata"}


def test_auth_required():
    assert c.post("/v1/chart", json=B).status_code == 401
    assert c.post("/v1/chart", json=B, headers={"X-Likha-Key": "wrong"}).status_code == 401


def test_chart():
    r = c.post("/v1/chart", json=B, headers=H)
    assert r.status_code == 200
    j = r.json()
    assert set(j["summary"]) >= {"lagna", "moon_sign", "nakshatra", "pada", "manglik", "borderline"}
    assert j["facts"]["label"] == "you"


def test_pair():
    b2 = {**B, "birth_date": "1998-03-02", "birth_time": "07:05", "lat": 19.076, "lng": 72.8777}
    r = c.post("/v1/pair", json={"a": {"label": "Aarav", "gender": "man", "birth": B},
                                 "b": {"label": "Meera", "gender": "woman", "birth": b2}}, headers=H)
    assert r.status_code == 200
    j = r.json()
    assert 0 <= j["milan"]["total"] <= 36 and 0 <= j["jodi_score"] <= 100
    assert j["facts"]["pair"]["gunas"].endswith("/36")
    assert str(j["jodi_score"]) in j["allowed"]["numbers"]


def test_bad_time_rejected():
    r = c.post("/v1/chart", json={**B, "birth_date": "2021-03-14", "birth_time": "02:30",
                                  "tz_name": "America/New_York", "lat": 40.7, "lng": -74}, headers=H)
    assert r.status_code == 422


def test_lookup_sql():
    r = c.get("/v1/guna-lookup.sql", headers=H)
    assert r.status_code == 200 and r.text.count("(") > 11664
