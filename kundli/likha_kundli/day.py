"""Today's facts for the Daily Kick: where the Moon is, and what it means for each person (Tara bala, Chandrashtama).
Scores are rules, not AI: the writer only puts them into words."""
from __future__ import annotations

from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

from . import rules as R
from .astro import sidereal_positions
from .chart import julian_day

TARA_NAMES = {1: "Janma", 2: "Sampat", 3: "Vipat", 4: "Kshema", 5: "Pratyari", 6: "Sadhaka", 7: "Naidhana", 8: "Mitra", 9: "Parama Mitra"}
TARA_VIBE = {1: 6, 2: 8, 3: 4, 4: 7, 5: 4, 6: 8, 7: 3, 8: 7, 9: 9}
GOOD_FOR_LOVE = {5, 7, 11}          # Moon passing these houses from your natal Moon favours romance


def transit_moon(on: date, tz_name: str, lat: float, lng: float, hour: int = 6) -> dict:
    local = datetime.combine(on, time(hour, 0), tzinfo=ZoneInfo(tz_name))
    lon = sidereal_positions(julian_day(local.astimezone(timezone.utc)), lat, lng)["Moon"][0]
    nak = int(lon // (360 / 27))
    return {"lon": round(lon, 4), "nakshatra": nak, "nakshatra_name": R.NAKSHATRAS[nak], "sign": int(lon // 30), "sign_name": R.SIGNS[int(lon // 30)]}


def person_day(birth_nak: int, birth_moon_sign: int, moon: dict) -> dict:
    count = (moon["nakshatra"] - birth_nak) % 27 + 1
    tara = count % 9 or 9
    house = (moon["sign"] - birth_moon_sign) % 12 + 1
    chandrashtama = house == 8
    vibe = TARA_VIBE[tara] - (2 if chandrashtama else 0)
    date_score = vibe + (1 if house in GOOD_FOR_LOVE else 0) - (1 if tara in (3, 5, 7) else 0)
    clamp = lambda x: max(1, min(10, x))
    return {"tara": tara, "tara_name": TARA_NAMES[tara], "moon_house_from_moon": house, "chandrashtama": chandrashtama,
            "vibe": clamp(vibe), "date_score": clamp(date_score)}
