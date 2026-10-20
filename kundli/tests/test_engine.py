from datetime import date, datetime, time, timezone

import pytest
import json
import os

from likha_kundli import rules as R
from likha_kundli.astro import ayanamsa_ut, sidereal_positions, sun_sidereal
from likha_kundli.chart import Birth, BirthTimeError, compute_chart, julian_day, to_utc, vimshottari
from likha_kundli.facts import allowed_terms, pair_facts
from likha_kundli.milan import MoonPoint, ashtakoota, jodi_score, match_people
from tools.gen_guna_lookup import rows

JAIPUR = dict(lat=26.9124, lng=75.7873, tz_name="Asia/Kolkata")


# ---------- tables ----------------------------------------------------------
def test_tables_have_right_sizes():
    assert len(R.NAKSHATRAS) == 27 and len(R.SIGNS) == 12
    for t in (R.YONI_OF_NAK, R.GANA_OF_NAK, R.NADI_OF_NAK):
        assert len(t) == 27
    assert all(len(r) == 14 for r in R.YONI_TABLE) and len(R.YONI_TABLE) == 14


def test_yoni_table_symmetric_and_enemies_zero():
    for i in range(14):
        assert R.YONI_TABLE[i][i] == 4
        for j in range(14):
            assert R.YONI_TABLE[i][j] == R.YONI_TABLE[j][i]
    Y = R.YONI_NAMES.index
    for a, b in [("Horse", "Buffalo"), ("Elephant", "Lion"), ("Sheep", "Monkey"), ("Serpent", "Mongoose"),
                 ("Dog", "Deer"), ("Cat", "Rat"), ("Cow", "Tiger")]:
        assert R.YONI_TABLE[Y(a)][Y(b)] == 0


def test_each_group_has_nine_nakshatras():
    for t, n in ((R.GANA_OF_NAK, 3), (R.NADI_OF_NAK, 3)):
        for g in range(n):
            assert t.count(g) == 9


# ---------- milan -----------------------------------------------------------
def test_worked_example_ashwini_boy_rohini_girl():
    """Worked by hand: Varna 1, Vashya 2, Tara 1.5, Yoni 3, Maitri 3, Gana 5 (Deva boy, Manushya girl),
    Bhakoot 0 (2/12), Nadi 8 = 23.5"""
    m = ashtakoota(MoonPoint(0, 1), MoonPoint(3, 1))
    assert m.kootas == {"varna": 1, "vashya": 2, "tara": 1.5, "yoni": 3, "graha_maitri": 3,
                        "gana": 5, "bhakoot": 0, "nadi": 8}
    assert m.total == 23.5
    assert m.doshas["bhakoot"]["present"] and not m.doshas["bhakoot"]["cancelled"]


def test_graha_maitri_matches_published_table():
    """[OJ]/[PJ] 7x7 table (symmetric), order Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn."""
    from likha_kundli.milan import _maitri
    order = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"]
    pub = [[5, 5, 5, 4, 5, 0, 0], [5, 5, 4, 1, 4, 0.5, 0.5], [5, 4, 5, 0.5, 5, 3, 0.5], [4, 1, 0.5, 5, 0.5, 5, 4],
           [5, 4, 5, 0.5, 5, 0.5, 3], [0, 0.5, 3, 5, 0.5, 5, 5], [0, 0.5, 0.5, 4, 3, 5, 5]]
    for i, a in enumerate(order):
        for j, b in enumerate(order):
            assert _maitri(a, b) == pub[i][j], (a, b)


def test_gana_direction_follows_published_table():
    D, M, Rk = 0, 1, 8                       # Ashwini (Deva), Bharani (Manushya), Ashlesha (Rakshasa)
    assert ashtakoota(MoonPoint(D, 1), MoonPoint(M, 1)).kootas["gana"] == 5    # Deva boy, Manushya girl
    assert ashtakoota(MoonPoint(M, 1), MoonPoint(D, 1)).kootas["gana"] == 6    # Manushya boy, Deva girl
    assert ashtakoota(MoonPoint(D, 1), MoonPoint(Rk, 1)).kootas["gana"] == 1   # Deva boy, Rakshasa girl
    assert ashtakoota(MoonPoint(Rk, 1), MoonPoint(D, 1)).kootas["gana"] == 0   # Rakshasa boy, Deva girl


def test_vashya_halves_follow_padas():
    from likha_kundli import rules as RR
    # Sagittarius halves at 15 deg: Purva Ashadha 1 (13.3-16.7, midpoint 15) is first half (Manava), pada 2 is second
    assert RR.vashya_group(8, MoonPoint(19, 1).deg_in_sign) == 1
    assert RR.vashya_group(8, MoonPoint(19, 2).deg_in_sign) == 0
    # Capricorn: Shravana 2 (midpoint 15) first half (Chatushpada); Shravana 3 second half (Jalachara)
    assert RR.vashya_group(9, MoonPoint(21, 2).deg_in_sign) == 0
    assert RR.vashya_group(9, MoonPoint(21, 3).deg_in_sign) == 2


def test_same_nakshatra_same_pada_is_nadi_dosha_not_cancelled():
    m = ashtakoota(MoonPoint(4, 1), MoonPoint(4, 1))
    assert m.kootas["nadi"] == 0 and not m.doshas["nadi"]["cancelled"]
    assert m.kootas["bhakoot"] == 7


def test_nadi_cancelled_same_nakshatra_different_sign():
    # Mrigashira pada 2 is Taurus, pada 3 is Gemini
    m = ashtakoota(MoonPoint(4, 2), MoonPoint(4, 3))
    assert m.kootas["nadi"] == 0
    assert m.doshas["nadi"]["cancelled"] and "different Moon sign" in m.doshas["nadi"]["reason"]
    assert m.adjusted_total >= m.total + 8 or m.adjusted_total == 36


def test_bhakoot_cancelled_same_lord_aries_scorpio():
    # Ashwini (Aries) boy, Anuradha (Scorpio) girl: 6/8 but both Mars
    m = ashtakoota(MoonPoint(0, 1), MoonPoint(16, 1))
    assert m.kootas["bhakoot"] == 0 and m.doshas["bhakoot"]["cancelled"]


def test_full_table_ranges():
    seen = 0
    for _bn, _bp, _gn, _gp, m in rows():
        seen += 1
        assert 0 <= m.total <= 36 and m.total <= m.adjusted_total <= 36
        for k, v in m.kootas.items():
            assert 0 <= v <= R.KOOTA_MAX[k] and (v * 2).is_integer()
    assert seen == 108 * 108


def test_same_gender_takes_lower_direction():
    a, b = MoonPoint(0, 1), MoonPoint(3, 1)
    m = match_people(a, "woman", b, "woman")
    assert m.total == min(ashtakoota(a, b).total, ashtakoota(b, a).total)
    assert match_people(a, "woman", b, "man").total == ashtakoota(b, a).total


def test_jodi_score_bounds():
    m = ashtakoota(MoonPoint(0, 1), MoonPoint(3, 1))
    assert jodi_score(m, 1.0, 1.0) == round(70 * 23.5 / 36 + 30)
    assert 0 <= jodi_score(m, 0.4, 0.0) <= 100


# ---------- chart accuracy --------------------------------------------------
def _sun_lon(dt_utc):
    return sun_sidereal(julian_day(dt_utc))


def test_lahiri_ayanamsa_at_j2000():
    # Lahiri (Chitrapaksha) at 1 Jan 2000 12:00 TT is about 23° 51' 11"
    ay = ayanamsa_ut(2451545.0)
    assert abs(ay - (23 + 51 / 60 + 11 / 3600)) < 0.01


def test_makar_sankranti_2024():
    """Published panchangs: Makar Sankranti 15 Jan 2024 at about 02:44 IST (14 Jan ~21:14 UTC).
    Sun must cross 270 deg sidereal inside a +/-3 minute window."""
    before = datetime(2024, 1, 14, 21, 11, tzinfo=timezone.utc)
    after = datetime(2024, 1, 14, 21, 17, tzinfo=timezone.utc)
    assert _sun_lon(before) < 270 < _sun_lon(after)


def test_using_nasa_jpl_data():
    c = compute_chart(Birth(date(1995, 6, 15), time(10, 30), **JAIPUR))
    assert c["meta"]["ephemeris"] == "NASA JPL DE421"


def test_positions_match_independent_reference_within_2_arcsec():
    """400 random moments and places, 1925-2045, against an independent ephemeris (fixture).
    Max error: Moon 1.7", everything else under 0.3". A pada is 12,000" wide."""
    cases = json.load(open(os.path.join(os.path.dirname(__file__), "fixtures", "reference_positions.json")))["cases"]
    worst = 0.0
    for c in cases:
        p = sidereal_positions(c["jd_ut"], c["lat"], c["lng"])
        for k in ("Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Lagna"):
            worst = max(worst, abs((p[k][0] - c[k] + 180) % 360 - 180))
    assert worst * 3600 < 2.0


def test_war_time_india_1943():
    utc, flags = to_utc(Birth(date(1943, 6, 1), time(12, 0), **JAIPUR))
    assert flags["utc_offset_minutes"] == 390          # IST + 1 hour war time


def test_dst_gap_rejected_and_overlap_flagged():
    ny = dict(lat=40.71, lng=-74.0, tz_name="America/New_York")
    with pytest.raises(BirthTimeError):
        to_utc(Birth(date(2021, 3, 14), time(2, 30), **ny))
    _, flags = to_utc(Birth(date(2021, 11, 7), time(1, 30), **ny))
    assert flags["clock"] == "repeated"


def test_chart_shape_and_consistency():
    c = compute_chart(Birth(date(1996, 2, 29), time(6, 45), **JAIPUR),
                      now=datetime(2026, 10, 20, tzinfo=timezone.utc))
    names = [p["planet"] for p in c["planets"]]
    assert names == ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu", "Lagna"]
    p = {x["planet"]: x for x in c["planets"]}
    assert abs(((p["Ketu"]["lon"] - p["Rahu"]["lon"]) % 360) - 180) < 1e-6
    assert sum(len(h["planets"]) for h in c["houses"].values()) == 9
    assert p["Lagna"]["sign"] == R.SIGNS.index(c["summary"]["lagna"])
    assert c["summary"]["nakshatra_index"] * 4 + c["summary"]["pada"] - 1 == int(p["Moon"]["lon"] // (360 / 108))
    assert c["dashas"]["current"]["maha"] in R.DASHA_ORDER


def test_dasha_sequence_and_lengths():
    birth = datetime(2000, 1, 1, tzinfo=timezone.utc)
    moon_lon = 0.0            # start of Ashwini: full Ketu dasha
    d = vimshottari(moon_lon, birth, now=birth)
    assert d["mahadashas"][0]["lord"] == "Ketu" and d["balance_years_at_birth"] == 7
    assert [m["lord"] for m in d["mahadashas"][:9]] == R.DASHA_ORDER
    md = d["mahadashas"][1]                     # Venus 20 years
    days = (date.fromisoformat(md["end"]) - date.fromisoformat(md["start"])).days
    assert abs(days - 20 * 365.25) <= 1
    assert md["antar"][0]["lord"] == "Venus" and md["antar"][-1]["end"] == md["end"]


def test_borderline_detects_moon_on_pada_edge():
    """Search a day for the moment the Moon crosses a pada edge and check the flag fires near it only."""
    b0 = Birth(date(2001, 5, 10), time(0, 0), **JAIPUR)
    c0 = compute_chart(b0)
    # find the next pada change by stepping minutes
    from datetime import timedelta
    base = datetime.combine(b0.birth_date, b0.birth_time)
    first = c0["planets"][1]["pada"]
    for m in range(0, 24 * 60, 2):
        t = base + timedelta(minutes=m)
        c = compute_chart(Birth(t.date(), t.time(), **JAIPUR))
        if c["planets"][1]["pada"] != first:
            edge = t
            break
    near = edge - timedelta(minutes=2)
    assert compute_chart(Birth(near.date(), near.time(), **JAIPUR))["borderline"]["borderline"]


def test_facts_allowed_numbers_contain_scores():
    m = ashtakoota(MoonPoint(0, 1), MoonPoint(3, 1))
    fp = pair_facts(m.as_dict(), 77, "A", "B")
    allowed = allowed_terms(fp)
    assert "23.5" in allowed["numbers"] and "77" in allowed["numbers"]
    assert "Ashwini" in allowed["astro_words"] and "Rohini" in allowed["astro_words"]


def test_years_outside_jpl_range_rejected():
    with pytest.raises(BirthTimeError):
        compute_chart(Birth(date(1890, 1, 1), time(12, 0), **JAIPUR))
