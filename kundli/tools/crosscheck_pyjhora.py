"""Cross-check Likha's Guna Milan (rules ak-2.0) against PyJHora, an independent open-source port of Jagannatha Hora.

Every boy x girl Moon position (27 nakshatras x 4 padas each way = 11,664 pairs), koota by koota. Where the two disagree,
the difference must be one of the known, documented table choices below; the check re-scores our side with PyJHora's
choice and requires an exact match. Anything left over is a bug in one of the two engines and fails the check.

    pip install -r requirements-dev.txt
    python -m tools.crosscheck_pyjhora            # prints the summary, writes CROSSCHECK.md
"""
from __future__ import annotations

import collections
import contextlib
import io
import os
import sys
import warnings

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from likha_kundli import rules as R  # noqa: E402
from likha_kundli.milan import MoonPoint, ashtakoota  # noqa: E402

KOOTAS = ["varna", "vashya", "tara", "yoni", "graha_maitri", "gana", "bhakoot", "nadi"]
# PyJHora's compatibility_score() order: varna, vasiya, gana, dina(tara), yoni, raasi_adhipathi(maitri), raasi(bhakoot), naadi
PJ_ORDER = ["varna", "vashya", "gana", "tara", "yoni", "graha_maitri", "bhakoot", "nadi"]


def load_pyjhora():
    warnings.filterwarnings("ignore")
    with contextlib.redirect_stdout(io.StringIO()):          # PyJHora prints its path setup on import
        from jhora.horoscope.match import compatibility as C
    return C


# ---------------------------------------------------------------- PyJHora's choices, applied to our side
# Each returns what PyJHora scores for that koota, computed from OUR inputs with PyJHora's documented rule.
def pj_varna(C, bs: int, gs: int) -> float:
    """PyJHora maps signs to varna with Vaishya and Shudra swapped for earth/air signs (vasiya_raasi_list)."""
    return float(C.VarnaArray[C.vasiya_raasi_list[gs]][C.vasiya_raasi_list[bs]])


def pj_vashya_group(sign: int, pada: int) -> int:
    """PyJHora decides the halves of Sagittarius and Capricorn by pada number (1-2 / 3-4), not by 15 degrees."""
    r = sign + 1
    if r in (1, 2) or (r == 9 and pada in (3, 4)) or (r == 10 and pada in (1, 2)):
        return 0
    if r in (3, 6, 7, 11) or (r == 9 and pada in (1, 2)):
        return 1
    if r in (4, 12) or (r == 10 and pada in (3, 4)):
        return 2
    if r == 5:
        return 3
    return 4


def pj_vashya(C, boy: MoonPoint, girl: MoonPoint) -> float:
    """...and uses the saravali.de table (VasiyaArray), girl row x boy column."""
    return float(C.VasiyaArray[pj_vashya_group(girl.sign, girl.pada)][pj_vashya_group(boy.sign, boy.pada)])


def pj_tara(boy: MoonPoint, girl: MoonPoint) -> float:
    """PyJHora's North Tara adds 1.5 only for each direction that lands on Kshema, Sadhaka or Mitra (4th, 6th, 8th).
    Janma, Sampat and Ati-Mitra (1st, 2nd, 9th), favourable in the classical scheme, score 0 there."""
    res = 0.0
    for a, b in ((girl.nakshatra, boy.nakshatra), (boy.nakshatra, girl.nakshatra)):
        if ((b - a) % 27) % 9 in (3, 5, 7):          # PyJHora counts from 0, so its 3/5/7 are classical 4/6/8
            res += 1.5
    return res


def pj_bhakoot(C, bs: int, gs: int) -> float:
    """PyJHora's raasi_array scores 6/8 as 0 in both directions for every pair except girl Aquarius / boy Cancer (7)."""
    return float(C.raasi_array[gs][bs])


# ---------------------------------------------------------------- independent classical checks of our own side
def classical_tara(boy: MoonPoint, girl: MoonPoint) -> float:
    """Written from the rule, not from our code: count inclusively, remainder by 9, 3/5/7 unfavourable."""
    res = 0.0
    for a, b in ((girl.nakshatra, boy.nakshatra), (boy.nakshatra, girl.nakshatra)):
        rem = ((b - a) % 27 + 1) % 9 or 9
        res += 0.0 if rem in (3, 5, 7) else 1.5
    return res


EXPLAIN = {
    "varna": ("PyJHora assigns Taurus, Virgo and Capricorn to Shudra and Gemini, Libra and Aquarius to Vaishya. "
              "North Indian almanacs and onlinejyotish (Muhurta Chintamani) have it the other way round, as we do."),
    "vashya": ("PyJHora splits Sagittarius and Capricorn by pada number instead of at 15 degrees (its own code notes "
               "this is an approximation), and uses the saravali.de table. Ours takes the majority cell of three "
               "published tables and the classical 15 degree split."),
    "tara": ("PyJHora's North Tara credits only Kshema, Sadhaka and Mitra (4th, 6th, 8th) and gives nothing for "
             "Janma, Sampat and Ati-Mitra (1st, 2nd, 9th), which the classical rule counts as favourable. So the same "
             "nakshatra scores 0 there and 3 here. Our Tara matches the classical rule on all 11,664 pairs."),
    "bhakoot": ("PyJHora's Bhakoot table scores 7 for one direction of one 6/8 pair (girl Aquarius, boy Cancer) and "
                "0 for every other 6/8 in both directions. That single cell looks like a typo; we score all 6/8 the same."),
}


def run(C=None):
    C = C or load_pyjhora()
    pairs = 0
    agree = collections.Counter()
    differ = collections.Counter()
    explained = collections.Counter()
    unexplained: list[tuple] = []
    total_same = 0
    tara_classical_ok = 0
    examples: dict[str, tuple] = {}
    for bn in range(27):
        for bp in range(1, 5):
            for gn in range(27):
                for gp in range(1, 5):
                    boy, girl = MoonPoint(bn, bp), MoonPoint(gn, gp)
                    ours = ashtakoota(boy, girl).kootas
                    theirs = dict(zip(PJ_ORDER, (float(x) for x in C.Ashtakoota(bn + 1, bp, gn + 1, gp, "North").compatibility_score()[:8])))
                    pairs += 1
                    tara_classical_ok += ours["tara"] == classical_tara(boy, girl)
                    if abs(sum(ours.values()) - sum(theirs.values())) < 1e-9:
                        total_same += 1
                    for k in KOOTAS:
                        if abs(ours[k] - theirs[k]) < 1e-9:
                            agree[k] += 1
                            continue
                        differ[k] += 1
                        predicted = {
                            "varna": lambda: pj_varna(C, boy.sign, girl.sign),
                            "vashya": lambda: pj_vashya(C, boy, girl),
                            "tara": lambda: pj_tara(boy, girl),
                            "bhakoot": lambda: pj_bhakoot(C, boy.sign, girl.sign),
                        }.get(k)
                        if predicted and abs(predicted() - theirs[k]) < 1e-9:
                            explained[k] += 1
                            examples.setdefault(k, (R.NAKSHATRAS[bn], bp, R.NAKSHATRAS[gn], gp, ours[k], theirs[k]))
                        else:
                            unexplained.append((k, bn, bp, gn, gp, ours[k], theirs[k]))
    return {"pairs": pairs, "agree": agree, "differ": differ, "explained": explained, "unexplained": unexplained,
            "total_same": total_same, "tara_classical_ok": tara_classical_ok, "examples": examples}


def report(r) -> str:
    n = r["pairs"]
    lines = ["# Guna Milan cross-check: Likha vs PyJHora", "",
             f"Rules `{R.RULES_VERSION}` against PyJHora (open-source Jagannatha Hora port), North Indian Ashtakoota, "
             f"all {n:,} boy x girl Moon positions (27 nakshatras x 4 padas each way). Generated by "
             "`python -m tools.crosscheck_pyjhora`.", "",
             "| Koota | Max | Same | Different | Explained by a documented table choice |",
             "| --- | --- | --- | --- | --- |"]
    maxes = {"varna": 1, "vashya": 2, "tara": 3, "yoni": 4, "graha_maitri": 5, "gana": 6, "bhakoot": 7, "nadi": 8}
    for k in KOOTAS:
        d = r["differ"][k]
        lines.append(f"| {k.replace('_', ' ').title()} | {maxes[k]} | {r['agree'][k]:,} ({100 * r['agree'][k] / n:.1f}%) | {d:,} | "
                     f"{'n/a' if d == 0 else f'{r['explained'][k]:,} of {d:,}'} |")
    lines += ["", f"- Identical total: {r['total_same']:,} of {n:,} pairs ({100 * r['total_same'] / n:.1f}%).",
              f"- Our Tara equals the classical rule (written separately in this tool) on {r['tara_classical_ok']:,} of {n:,} pairs.",
              f"- **Unexplained differences: {len(r['unexplained'])}.** "
              + ("Every difference is one of the choices below." if not r["unexplained"] else "Investigate these: they are bugs in one engine."),
              "", "## Why the engines differ", ""]
    for k, why in EXPLAIN.items():
        if r["differ"][k]:
            ex = r["examples"].get(k)
            eg = f" Example: boy {ex[0]} pada {ex[1]}, girl {ex[2]} pada {ex[3]}: Likha {ex[4]:g}, PyJHora {ex[5]:g}." if ex else ""
            lines.append(f"- **{k.replace('_', ' ').title()}** ({r['differ'][k]:,} pairs). {why}{eg}")
    lines += ["", "Yoni, Graha Maitri, Gana and Nadi agree on every pair. Rules and sources for every table: "
              "`likha_kundli/rules.py`.", ""]
    return "\n".join(lines)


if __name__ == "__main__":
    res = run()
    text = report(res)
    print(text)
    with open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "CROSSCHECK.md"), "w") as f:
        f.write(text)
    sys.exit(1 if res["unexplained"] else 0)
