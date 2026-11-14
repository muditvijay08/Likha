"""Demo-mode data computed by the real engine, so the demo can never show a score the engine wouldn't.

Writes app/src/lib/api/samples.generated.json:
  member: the demo member's chart, for one example birth (14 Mar 1999, 06:42, Jaipur), shown as "Sample chart"
  samples: each sample profile gets a real birth (searched so the ranking stays the same), and its Moon, Gunas,
           kootas, doshas and Jodi Score against that member come straight from ashtakoota() and jodi_score().

    python -m tools.gen_demo_samples
"""
from __future__ import annotations

import datetime as dt
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from likha_kundli import Birth, compute_chart  # noqa: E402
from likha_kundli.milan import MoonPoint, jodi_score, manglik_fit, match_people, moon_venus_fit  # noqa: E402
from likha_kundli.rules import JODI_DEFAULTS  # noqa: E402

JAIPUR = dict(lat=26.9124, lng=75.7873, tz_name="Asia/Kolkata")
MEMBER = dict(birth_date=dt.date(1999, 3, 14), birth_time=dt.time(6, 42), **JAIPUR)
TODAY = dt.date(2026, 11, 14)

# id, gender, name, age, target Jodi (ranking order the demo and its tests rely on)
SAMPLES = [
    ("s-ishita", "woman", "Ishita", 27, 92), ("s-riya", "woman", "Riya", 26, 88), ("s-sanya", "woman", "Sanya", 24, 84),
    ("s-meera", "woman", "Meera", 25, 79), ("s-nidhi", "woman", "Nidhi", 31, 72), ("s-tanvi", "woman", "Tanvi", 34, 64),
    ("s-aarav", "man", "Aarav", 27, 91), ("s-kabir", "man", "Kabir", 33, 87), ("s-dev", "man", "Dev", 29, 82),
    ("s-rohan", "man", "Rohan", 36, 75), ("s-arjun", "man", "Arjun", 30, 66),
]
KOOTA_LINE = {
    "nadi": "Different Nadi: the full 8 points, the koota families check first.",
    "bhakoot": "Your Moon signs sit well with each other.",
    "graha_maitri": "Your Moon sign lords are friends, so talks come easy.",
    "gana": "Same temperament (Gana): you'll get each other's moods.",
    "yoni": "A strong Yoni match: natural comfort with each other.",
    "tara": "Your birth stars support each other (Tara).",
    "vashya": "A good Vashya match: you'll influence each other gently.",
    "varna": "Similar outlook on work and duty (Varna).",
}
MAX = {"varna": 1, "vashya": 2, "tara": 3, "yoni": 4, "graha_maitri": 5, "gana": 6, "bhakoot": 7, "nadi": 8}


def chart(b: dict):
    return compute_chart(Birth(**b))


def pair(member, m_gender, other, o_gender):
    sa, sb = member["summary"], other["summary"]
    m = match_people(MoonPoint(sa["nakshatra_index"], sa["pada"]), m_gender, MoonPoint(sb["nakshatra_index"], sb["pada"]), o_gender)
    j = jodi_score(m, manglik_fit(member["manglik"], other["manglik"], JODI_DEFAULTS),
                   moon_venus_fit(sa["venus_sign"], sb["moon_sign_index"], sb["venus_sign"], sa["moon_sign_index"]), JODI_DEFAULTS)
    return m, j


def summary_line(kootas: dict) -> str:
    best = max(kootas, key=lambda k: (kootas[k] / MAX[k], MAX[k]))
    return KOOTA_LINE[best]


def doshas(m) -> dict:
    out = {}
    for k in ("bhakoot", "gana", "nadi"):
        d = m.doshas.get(k) if isinstance(m.doshas, dict) else None
        if d and d.get("present"):
            out[k] = {"present": True, "cancelled": bool(d.get("cancelled")), "reason": d.get("reason")}
    return out


def member_chart(c) -> dict:
    s = c["summary"]
    now = TODAY.isoformat()
    md = c["dashas"]["mahadashas"]
    cur = next((x for x in md if x["start"] <= now < x["end"]), md[-1])
    ant = next((x for x in cur.get("antar", []) if x["start"] <= now < x["end"]), None)
    return {
        "summary": {"lagna": s["lagna"], "moon_sign": s["moon_sign"], "nakshatra": s["nakshatra"], "pada": s["pada"],
                    "manglik": s["manglik"], "manglik_reason": s["manglik_reason"], "current_dasha": s["current_dasha"], "borderline": s["borderline"]},
        "planets": [{"planet": p["planet"], "sign": p["sign"], "sign_name": p["sign_name"], "house": p["house"], "retro": bool(p["retro"]),
                     "nakshatra": p["nakshatra_name"]} for p in c["planets"] if p["planet"] in
                    ("Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu")],
        "dasha": {"maha": cur["lord"], "antar": ant["lord"] if ant else cur["lord"], "antar_end": ant["end"] if ant else cur["end"]},
        "mahadashas": [{"lord": x["lord"], "start": x["start"], "end": x["end"]} for x in md if x["end"] > "1990"][:6],
        "birth": {"date": MEMBER["birth_date"].isoformat(), "time": MEMBER["birth_time"].strftime("%H:%M"), "place": "Jaipur"},
    }


def main():
    rnd = random.Random(20261114)
    member = chart(MEMBER)
    out = {"engine": member["summary"]["engine_version"], "member": member_chart(member), "samples": []}
    used_moons = {"woman": set(), "man": set()}
    for sid, gender, name, age, target in SAMPLES:
        m_gender = "man" if gender == "woman" else "woman"      # the demo member is the opposite gender
        best = None
        for _ in range(450):
            y = TODAY.year - age - (1 if rnd.random() < 0.5 else 0)
            d = dt.date(y, 1, 1) + dt.timedelta(days=rnd.randrange(365))
            t = dt.time(rnd.randrange(24), rnd.randrange(60))
            try:
                c = chart(dict(birth_date=d, birth_time=t, **JAIPUR))
            except Exception:
                continue
            if c["summary"]["borderline"] or c["summary"]["moon_sign"] in used_moons[gender]:
                continue
            m, j = pair(member, m_gender, c, gender)
            gap = abs(j - target)
            if best is None or gap < best[0]:
                best = (gap, d, t, c, m, j)
            if gap <= 1:
                break
        _, d, t, c, m, j = best
        used_moons[gender].add(c["summary"]["moon_sign"])
        s = c["summary"]
        kootas = {k: float(v) for k, v in m.kootas.items()}
        out["samples"].append({
            "id": sid, "gender": gender, "first_name": name, "age": age,
            "birth": {"date": d.isoformat(), "time": t.strftime("%H:%M"), "place": "Jaipur"},
            "moon_sign": s["moon_sign"], "nakshatra": s["nakshatra"], "pada": s["pada"], "lagna": s["lagna"], "manglik": s["manglik"],
            "gunas": float(m.total), "adjusted_gunas": float(m.adjusted_total), "jodi_score": j,
            "kootas": kootas, "doshas": {**doshas(m), "manglik_match": member["manglik"]["effective"] == c["manglik"]["effective"]},
            "summary": summary_line(kootas),
        })
        print(f"{name:7} {gender:5} jodi {j:3} (target {target})  gunas {m.total:>4}  {s['moon_sign']:11} {s['nakshatra']}")
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "app/src/lib/api/samples.generated.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print("wrote", path)


if __name__ == "__main__":
    main()
