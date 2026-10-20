"""Fact sheets: the only astrology the writer is allowed to talk about.

The writer (Claude) never calculates anything. It receives these facts, and the gateway
checks every number and astrology name in its answer against `allowed`.
"""
from __future__ import annotations

from . import rules as R


def _fmt(x: float) -> str:
    return str(int(x)) if float(x).is_integer() else f"{x:.1f}"


def person_facts(label: str, chart: dict) -> dict:
    s = chart["summary"]
    planets = {p["planet"]: {"sign": p["sign_name"], "house": p.get("house"), "nakshatra": p["nakshatra_name"]}
               for p in chart["planets"] if p["planet"] != "Lagna"}
    d = chart["dashas"]["current"]
    return {"label": label, "lagna": s["lagna"], "moon_sign": s["moon_sign"], "nakshatra": s["nakshatra"],
            "pada": s["pada"], "manglik": s["manglik"], "manglik_note": s["manglik_reason"],
            "dasha_now": {"maha": d["maha"], "antar": d["antar"], "antar_ends": d["antar_end"]},
            "planets": planets, "birth_time_borderline": s["borderline"]}


def pair_facts(milan: dict, jodi: int, a_label: str, b_label: str) -> dict:
    k = milan["kootas"]
    return {
        "people": [a_label, b_label],
        "gunas": f"{_fmt(milan['total'])}/36",
        "jodi_score": f"{jodi}/100",
        "kootas": {name: f"{_fmt(v)}/{R.KOOTA_MAX[name]}" for name, v in k.items()},
        "doshas": milan["doshas"],
        "details": milan["details"],
    }


def allowed_terms(*sheets: dict) -> dict:
    """Numbers and astrology words the answer may contain."""
    nums: set[str] = {"1", "2", "3", "4", "5", "6", "7", "8", "9", "12", "27", "36", "100", "108"}  # counts we explain
    words: set[str] = set()

    def walk(v):
        if isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, (list, tuple)):
            for x in v:
                walk(x)
        elif isinstance(v, bool) or v is None:
            return
        elif isinstance(v, (int, float)):
            nums.add(_fmt(v))
        elif isinstance(v, str):
            for part in v.replace("–", " ").replace("/", " ").replace(",", " ").split():
                p = part.strip(".():")
                if p.replace(".", "", 1).isdigit():
                    nums.add(p)
            words.add(v)

    for s in sheets:
        walk(s)
    present = {w for w in R.SIGNS + R.SIGNS_HI + R.NAKSHATRAS + R.PLANETS if any(w in x for x in words)}
    return {"numbers": sorted(nums, key=lambda n: float(n)), "astro_words": sorted(present)}
