"""Likha kundli service.  Internal only: called by Supabase Edge Functions, never by the app.

Run:   LIKHA_KUNDLI_KEY=... uvicorn app:app --host 0.0.0.0 --port 8080
Host:  Mumbai region (Fly.io bom / Railway / AWS ap-south-1), 1 small instance is plenty.
"""
from __future__ import annotations

import hmac
import os
from datetime import date, time

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from likha_kundli import ENGINE_VERSION, RULES_VERSION, Birth, BirthTimeError, compute_chart
from likha_kundli.facts import allowed_terms, pair_facts, person_facts
from likha_kundli.milan import MoonPoint, jodi_score, manglik_fit, match_people, moon_venus_fit
from tools.gen_guna_lookup import build_sql

app = FastAPI(title="Likha Kundli", version=ENGINE_VERSION, docs_url=None, redoc_url=None)


def auth(x_likha_key: str = Header(default="")):
    key = os.environ.get("LIKHA_KUNDLI_KEY", "")
    if not key or not hmac.compare_digest(x_likha_key, key):
        raise HTTPException(status_code=401, detail="unauthorised")


class BirthIn(BaseModel):
    birth_date: date
    birth_time: time
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    tz_name: str


class ChartIn(BirthIn):
    borderline_minutes: float = Field(default=5, ge=0, le=30)


class PersonIn(BaseModel):
    label: str = Field(max_length=40)
    gender: str = Field(pattern="^(woman|man|other)$")
    birth: BirthIn


class PairIn(BaseModel):
    a: PersonIn
    b: PersonIn
    jodi_weights: dict | None = None


@app.get("/health")
def health():
    return {"ok": True, "engine": ENGINE_VERSION, "rules": RULES_VERSION}


@app.post("/v1/chart", dependencies=[Depends(auth)])
def chart(body: ChartIn):
    try:
        b = Birth(body.birth_date, body.birth_time, body.lat, body.lng, body.tz_name)
        c = compute_chart(b, borderline_minutes=body.borderline_minutes)
    except BirthTimeError as e:
        raise HTTPException(status_code=422, detail=str(e))
    c["facts"] = person_facts("you", c)
    return c


@app.post("/v1/pair", dependencies=[Depends(auth)])
def pair(body: PairIn):
    """For people not on Likha (Check With Anyone, Gift, Why It Didn't Work). Nothing is stored here."""
    try:
        ca = compute_chart(Birth(**body.a.birth.model_dump()))
        cb = compute_chart(Birth(**body.b.birth.model_dump()))
    except BirthTimeError as e:
        raise HTTPException(status_code=422, detail=str(e))
    sa, sb = ca["summary"], cb["summary"]
    m = match_people(MoonPoint(sa["nakshatra_index"], sa["pada"]), body.a.gender,
                     MoonPoint(sb["nakshatra_index"], sb["pada"]), body.b.gender)
    from likha_kundli.rules import JODI_DEFAULTS
    cfg = {**JODI_DEFAULTS, **(body.jodi_weights or {})}
    j = jodi_score(m, manglik_fit(ca["manglik"], cb["manglik"], cfg),
                   moon_venus_fit(sa["venus_sign"], sb["moon_sign_index"], sb["venus_sign"], sa["moon_sign_index"]), cfg)
    fa, fb = person_facts(body.a.label, ca), person_facts(body.b.label, cb)
    fp = pair_facts(m.as_dict(), j, body.a.label, body.b.label)
    return {"milan": m.as_dict(), "jodi_score": j, "facts": {"a": fa, "b": fb, "pair": fp},
            "allowed": allowed_terms(fa, fb, fp),
            "borderline": sa["borderline"] or sb["borderline"]}


class DayPerson(BaseModel):
    id: str
    nakshatra_index: int = Field(ge=0, le=26)
    moon_sign_index: int = Field(ge=0, le=11)


class DayIn(BaseModel):
    date: date
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    tz_name: str
    people: list[DayPerson] = Field(max_length=5000)


@app.post("/v1/day", dependencies=[Depends(auth)])
def day(body: DayIn):
    """Daily Kick facts for one city and many people: the Moon at 6 AM local, then each person's Tara and scores."""
    from likha_kundli.day import person_day, transit_moon
    moon = transit_moon(body.date, body.tz_name, body.lat, body.lng)
    return {"date": body.date.isoformat(), "moon": moon,
            "people": [{"id": p.id, **person_day(p.nakshatra_index, p.moon_sign_index, moon)} for p in body.people]}


@app.get("/v1/guna-lookup.sql", dependencies=[Depends(auth)], response_class=PlainTextResponse)
def lookup_sql():
    return build_sql()
