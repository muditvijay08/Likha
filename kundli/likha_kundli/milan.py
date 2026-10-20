"""Ashtakoota Guna Milan (36 points) + dosha cancellations + Jodi Score."""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

from . import rules as R


@dataclass(frozen=True)
class MoonPoint:
    """The only inputs Guna Milan needs: Moon nakshatra + pada (sign follows from them)."""
    nakshatra: int        # 0..26
    pada: int             # 1..4

    @property
    def pada_index(self) -> int:          # 0..107
        return self.nakshatra * 4 + (self.pada - 1)

    @property
    def sign(self) -> int:                # 0..11
        return self.pada_index // 9

    @property
    def deg_in_sign(self) -> float:       # pada midpoint, so tables never depend on exact degrees
        start = self.pada_index * (360 / 108)
        return (start + 360 / 216) - self.sign * 30


def _tara_good(from_nak: int, to_nak: int) -> bool:
    count = (to_nak - from_nak) % 27 + 1
    return (count % 9) not in R.BAD_TARA


def _friends(a: str, b: str) -> bool:
    return a == b or (R.RELATION[a].get(b) == "F" and R.RELATION[b].get(a) == "F")


def _maitri(lord_boy: str, lord_girl: str) -> float:
    if lord_boy == lord_girl:
        return 5.0
    return R.MAITRI_SCORE[(R.RELATION[lord_boy][lord_girl], R.RELATION[lord_girl][lord_boy])]


@dataclass
class MilanResult:
    kootas: dict
    total: float
    doshas: dict
    adjusted_total: float            # total with cancelled doshas restored (used for Jodi Score only)
    details: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {"kootas": self.kootas, "total": self.total, "doshas": self.doshas,
                "adjusted_total": self.adjusted_total, "details": self.details,
                "rules_version": R.RULES_VERSION}


def ashtakoota(boy: MoonPoint, girl: MoonPoint) -> MilanResult:
    bs, gs = boy.sign, girl.sign
    lb, lg = R.SIGN_LORD[bs], R.SIGN_LORD[gs]

    varna = 1.0 if R.VARNA_OF_SIGN[bs] >= R.VARNA_OF_SIGN[gs] else 0.0

    vb, vg = R.vashya_group(bs, boy.deg_in_sign), R.vashya_group(gs, girl.deg_in_sign)
    vashya = R.VASHYA_TABLE[vb][vg]

    t1, t2 = _tara_good(girl.nakshatra, boy.nakshatra), _tara_good(boy.nakshatra, girl.nakshatra)
    tara = 1.5 * t1 + 1.5 * t2

    yb, yg = R.YONI_OF_NAK[boy.nakshatra], R.YONI_OF_NAK[girl.nakshatra]
    yoni = float(R.YONI_TABLE[yb][yg])

    maitri = _maitri(lb, lg)

    gb, gg = R.GANA_OF_NAK[boy.nakshatra], R.GANA_OF_NAK[girl.nakshatra]
    gana = float(R.GANA_TABLE[gb][gg])

    d1 = (bs - gs) % 12 + 1          # girl's sign -> boy's sign
    d2 = (gs - bs) % 12 + 1
    bhakoot_bad = (d1, d2) in R.BAD_BHAKOOT
    bhakoot = 0.0 if bhakoot_bad else 7.0

    nb, ng = R.NADI_OF_NAK[boy.nakshatra], R.NADI_OF_NAK[girl.nakshatra]
    nadi_bad = nb == ng
    nadi = 0.0 if nadi_bad else 8.0

    kootas = {"varna": varna, "vashya": vashya, "tara": tara, "yoni": yoni,
              "graha_maitri": maitri, "gana": gana, "bhakoot": bhakoot, "nadi": nadi}
    total = sum(kootas.values())

    # ---- doshas and their classical cancellations ----
    doshas: dict = {}
    restored = 0.0
    if nadi_bad:
        reason = None
        if boy.nakshatra == girl.nakshatra and bs != gs:
            reason = "same nakshatra, different Moon sign"
        elif bs == gs and boy.nakshatra != girl.nakshatra:
            reason = "same Moon sign, different nakshatra"
        elif boy.nakshatra == girl.nakshatra and boy.pada != girl.pada:
            reason = "same nakshatra, different pada"
        doshas["nadi"] = {"present": True, "cancelled": reason is not None, "reason": reason}
        if reason:
            restored += 8.0
    if bhakoot_bad:
        reason = None
        if lb == lg:
            reason = f"both Moon signs ruled by {lb}"
        elif _friends(lb, lg):
            reason = f"Moon sign lords {lb} and {lg} are friends"
        doshas["bhakoot"] = {"present": True, "cancelled": reason is not None, "reason": reason,
                             "pair": f"{min(d1, d2)}/{max(d1, d2)}"}
        if reason:
            restored += 7.0
    if gana == 0.0:
        reason = None
        if lb == lg or _friends(lb, lg):
            reason = "Moon sign lords are the same or friends"
        doshas["gana"] = {"present": True, "cancelled": reason is not None, "reason": reason}

    details = {
        "boy": {"sign": R.SIGNS[bs], "nakshatra": R.NAKSHATRAS[boy.nakshatra], "pada": boy.pada,
                "varna": R.VARNA_NAMES[R.VARNA_OF_SIGN[bs]], "vashya": R.VASHYA_NAMES[vb],
                "yoni": R.YONI_NAMES[yb], "sign_lord": lb, "gana": R.GANA_NAMES[gb], "nadi": R.NADI_NAMES[nb]},
        "girl": {"sign": R.SIGNS[gs], "nakshatra": R.NAKSHATRAS[girl.nakshatra], "pada": girl.pada,
                 "varna": R.VARNA_NAMES[R.VARNA_OF_SIGN[gs]], "vashya": R.VASHYA_NAMES[vg],
                 "yoni": R.YONI_NAMES[yg], "sign_lord": lg, "gana": R.GANA_NAMES[gg], "nadi": R.NADI_NAMES[ng]},
    }
    return MilanResult(kootas, total, doshas, min(36.0, total + restored), details)


def manglik_fit(a: dict | None, b: dict | None, cfg: dict = R.JODI_DEFAULTS) -> float:
    """a/b are manglik() results. Both or neither (after cancellations) = 1.0."""
    if not a or not b:
        return 1.0
    return 1.0 if a["effective"] == b["effective"] else cfg["one_sided_manglik"]


def moon_venus_fit(venus_a: int, moon_b: int, venus_b: int, moon_a: int) -> float:
    d1 = (moon_b - venus_a) % 12 + 1
    d2 = (moon_a - venus_b) % 12 + 1
    return (R.MOON_VENUS_FIT[d1] + R.MOON_VENUS_FIT[d2]) / 2


def jodi_score(m: MilanResult, mfit: float, mvfit: float, cfg: dict = R.JODI_DEFAULTS) -> int:
    """Exact decimal maths and half-up rounding, so it always equals private.jodi_from() in Postgres."""
    D = lambda x: Decimal(str(x))
    score = D(cfg["gunas"]) * D(m.adjusted_total) / D(36) + D(cfg["manglik"]) * D(mfit) + D(cfg["moon_venus"]) * D(mvfit)
    return max(0, min(100, int(score.quantize(Decimal("1"), rounding=ROUND_HALF_UP))))


def match_people(a: MoonPoint, a_gender: str, b: MoonPoint, b_gender: str) -> MilanResult:
    """Classical tables are written boy -> girl. For two people of the same gender
    we score both directions and keep the lower, so nobody is shown a flattering number."""
    if a_gender == "man" and b_gender == "woman":
        return ashtakoota(a, b)
    if a_gender == "woman" and b_gender == "man":
        return ashtakoota(b, a)
    x, y = ashtakoota(a, b), ashtakoota(b, a)
    return x if x.total <= y.total else y
