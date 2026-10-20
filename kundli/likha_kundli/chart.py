"""Birth chart: NASA JPL positions, sidereal (Lahiri), mean node, whole-sign houses, Vimshottari dasha, Manglik."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from . import rules as R
from .astro import EPHEMERIS, ayanamsa_ut, sidereal_positions

ENGINE_VERSION = "likha-kundli-2.0"
NAK_SPAN = 360 / 27
PADA_SPAN = 360 / 108
YEAR_DAYS = 365.25                     # Vimshottari year used by most Indian software

class BirthTimeError(ValueError):
    pass


@dataclass(frozen=True)
class Birth:
    birth_date: date
    birth_time: time
    lat: float
    lng: float
    tz_name: str                       # IANA name from Google Time Zone API, e.g. Asia/Kolkata


def to_utc(b: Birth) -> tuple[datetime, dict]:
    """Local clock time -> UTC, using the offset that was really in force that day
    (India's 1942-45 war time, DST abroad). Flags clock times that are skipped or repeated."""
    tz = ZoneInfo(b.tz_name)
    naive = datetime.combine(b.birth_date, b.birth_time)
    early = naive.replace(tzinfo=tz, fold=0)
    late = naive.replace(tzinfo=tz, fold=1)
    flags = {}
    if early.utcoffset() != late.utcoffset():
        # either repeated (fall back) or skipped (spring forward)
        round_trip = early.astimezone(timezone.utc).astimezone(tz).replace(tzinfo=None)
        flags["clock"] = "repeated" if round_trip == naive else "skipped"
    if flags.get("clock") == "skipped":
        raise BirthTimeError("This clock time did not exist in that place (clocks moved forward). Please check the time.")
    utc = early.astimezone(timezone.utc)
    flags["utc_offset_minutes"] = int(early.utcoffset().total_seconds() // 60)
    return utc, flags


def julian_day(utc: datetime) -> float:
    return 2440587.5 + utc.timestamp() / 86400.0


def _point(lon: float) -> dict:
    lon %= 360
    nak = int(lon // NAK_SPAN)
    pada = int((lon % NAK_SPAN) // PADA_SPAN) + 1
    sign = int(lon // 30)
    return {"lon": round(lon, 6), "sign": sign, "sign_name": R.SIGNS[sign], "deg": round(lon - sign * 30, 4),
            "nakshatra": nak, "nakshatra_name": R.NAKSHATRAS[nak], "pada": pada}


def positions(jd: float, lat: float, lng: float) -> dict:
    raw = sidereal_positions(jd, lat, lng)
    out = {}
    for name in ("Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu"):
        lon, speed = raw[name]
        p = _point(lon)
        p["retro"] = speed < 0
        out[name] = p
    k = _point(out["Rahu"]["lon"] + 180)
    k["retro"] = True
    out["Ketu"] = k
    out["Lagna"] = _point(raw["Lagna"][0])
    return out


def whole_sign_houses(pos: dict) -> dict:
    lagna = pos["Lagna"]["sign"]
    houses = {str(h): {"sign": (lagna + h - 1) % 12, "sign_name": R.SIGNS[(lagna + h - 1) % 12], "planets": []}
              for h in range(1, 13)}
    for name, p in pos.items():
        if name == "Lagna":
            continue
        h = (p["sign"] - lagna) % 12 + 1
        p["house"] = h
        houses[str(h)]["planets"].append(name)
    return houses


def vimshottari(moon_lon: float, birth_utc: datetime, now: datetime | None = None, years: int = 120) -> dict:
    nak = int(moon_lon // NAK_SPAN)
    frac_done = (moon_lon % NAK_SPAN) / NAK_SPAN
    start_lord = nak % 9
    seq = []
    t = birth_utc - timedelta(days=frac_done * R.DASHA_YEARS[R.DASHA_ORDER[start_lord]] * YEAR_DAYS)
    i = 0
    while t < birth_utc + timedelta(days=years * YEAR_DAYS):
        lord = R.DASHA_ORDER[(start_lord + i) % 9]
        end = t + timedelta(days=R.DASHA_YEARS[lord] * YEAR_DAYS)
        antar, at = [], t
        for j in range(9):
            al = R.DASHA_ORDER[(start_lord + i + j) % 9]
            aend = at + timedelta(days=R.DASHA_YEARS[lord] * R.DASHA_YEARS[al] / 120 * YEAR_DAYS)
            antar.append({"lord": al, "start": at.date().isoformat(), "end": aend.date().isoformat()})
            at = aend
        seq.append({"lord": lord, "start": t.date().isoformat(), "end": end.date().isoformat(), "antar": antar})
        t, i = end, i + 1
    now = now or datetime.now(timezone.utc)
    today = now.date().isoformat()
    cur = next((m for m in seq if m["start"] <= today < m["end"]), None)
    cur_antar = next((a for a in cur["antar"] if a["start"] <= today < a["end"]), None) if cur else None
    return {"balance_years_at_birth": round((1 - frac_done) * R.DASHA_YEARS[R.DASHA_ORDER[start_lord]], 4),
            "mahadashas": seq,
            "current": {"maha": cur and cur["lord"], "antar": cur_antar and cur_antar["lord"],
                        "antar_end": cur_antar and cur_antar["end"]}}


def manglik(pos: dict) -> dict:
    mars = pos["Mars"]
    from_lagna = (mars["sign"] - pos["Lagna"]["sign"]) % 12 + 1
    from_moon = (mars["sign"] - pos["Moon"]["sign"]) % 12 + 1
    hit_l, hit_m = from_lagna in R.MANGLIK_HOUSES, from_moon in R.MANGLIK_HOUSES
    present = hit_l
    cancel = None
    if present:
        mars_from_jup = (mars["sign"] - pos["Jupiter"]["sign"]) % 12 + 1   # Mars counted from Jupiter
        if mars["sign"] in R.MANGLIK_OWN_OR_EXALTED:
            cancel = f"Mars in {R.SIGNS[mars['sign']]}"
        elif mars["sign"] in R.MANGLIK_HOUSE_SIGN_EXCEPTIONS.get(from_lagna, set()):
            cancel = f"Mars in house {from_lagna} in {R.SIGNS[mars['sign']]}"
        elif mars_from_jup in R.JUPITER_ASPECTS:
            cancel = "Jupiter with or aspecting Mars" if mars_from_jup != 1 else "Mars with Jupiter"
        elif pos["Lagna"]["sign"] in R.MANGLIK_YOGAKARAKA_LAGNA:
            cancel = f"{R.SIGNS[pos['Lagna']['sign']]} Lagna (Mars is yogakaraka)"
    strength = "none" if not present else ("high" if hit_m else "mild")
    effective = present and cancel is None
    reason = None
    if present:
        reason = f"Mars in house {from_lagna} from Lagna" + (f" and {from_moon} from Moon" if hit_m else "")
    return {"present": present, "effective": effective, "strength": strength, "from_lagna": from_lagna,
            "from_moon": from_moon, "cancelled_by": cancel, "reason": reason}


def _core(b: Birth, shift_minutes: float = 0) -> dict:
    utc, _ = to_utc(b)
    utc = utc + timedelta(minutes=shift_minutes)
    return positions(julian_day(utc), b.lat, b.lng)


def borderline(b: Birth, minutes: float = 5) -> dict:
    """Would a clock error of +/- minutes change anything we use for matching?"""
    base = _core(b)
    changes = set()
    for m in (-minutes, minutes):
        p = _core(b, m)
        if p["Moon"]["nakshatra"] != base["Moon"]["nakshatra"]:
            changes.add("moon_nakshatra")
        if p["Moon"]["pada"] != base["Moon"]["pada"]:
            changes.add("moon_pada")
        if p["Moon"]["sign"] != base["Moon"]["sign"]:
            changes.add("moon_sign")
        if p["Lagna"]["sign"] != base["Lagna"]["sign"]:
            changes.add("lagna")
        if manglik(p)["effective"] != manglik(base)["effective"]:
            changes.add("manglik")
    alt = None
    if {"moon_nakshatra", "moon_pada"} & changes:
        alt = sorted({(q["Moon"]["nakshatra"], q["Moon"]["pada"])
                      for q in (_core(b, -minutes), base, _core(b, minutes))})
    return {"borderline": bool(changes), "changes": sorted(changes), "window_minutes": minutes,
            "moon_points": alt}


def compute_chart(b: Birth, now: datetime | None = None, borderline_minutes: float = 5) -> dict:
    utc, flags = to_utc(b)
    if not 1900 <= utc.year <= 2049:
        raise BirthTimeError("Birth year must be between 1900 and 2049.")      # range of NASA JPL DE421
    jd = julian_day(utc)
    pos = positions(jd, b.lat, b.lng)
    houses = whole_sign_houses(pos)
    dashas = vimshottari(pos["Moon"]["lon"], utc, now)
    mg = manglik(pos)
    bl = borderline(b, borderline_minutes)
    ayan = ayanamsa_ut(jd)
    moon = pos["Moon"]
    summary = {
        "lagna": pos["Lagna"]["sign_name"], "moon_sign": moon["sign_name"],
        "nakshatra": moon["nakshatra_name"], "pada": moon["pada"], "nakshatra_index": moon["nakshatra"],
        "venus_sign": pos["Venus"]["sign"], "moon_sign_index": moon["sign"],
        "manglik": mg["effective"], "manglik_reason": mg["reason"] if mg["effective"] else (
            f"{mg['reason']}, cancelled: {mg['cancelled_by']}" if mg["present"] else None),
        "borderline": bl["borderline"], "current_dasha": dashas["current"]["maha"] and
            f"{dashas['current']['maha']}–{dashas['current']['antar']}",
        "engine_version": ENGINE_VERSION,
    }
    return {
        "summary": summary,
        "planets": [{"planet": k, **v} for k, v in pos.items()],
        "houses": houses, "dashas": dashas, "manglik": mg, "borderline": bl,
        "meta": {"engine_version": ENGINE_VERSION, "ayanamsa": "lahiri", "ayanamsa_deg": round(ayan, 6),
                 "node_type": "mean", "house_system": "whole_sign", "utc": utc.isoformat(), "jd_ut": jd,
                 "ephemeris": EPHEMERIS, **flags},
    }
