"""Python engine and Postgres must give identical Gunas and Jodi Scores.
Needs the local test database (tools/runtests.sh builds it). Skipped when it is not running."""
import random
import shutil
import subprocess

import pytest

from likha_kundli import rules as R
from likha_kundli.milan import MoonPoint, ashtakoota, jodi_score, manglik_fit, moon_venus_fit

PSQL = ["psql", "-h", "/tmp", "-p", "5433", "-U", "postgres", "-d", "tt", "-At", "-F", "|"]


def q(sql):
    return subprocess.run(PSQL + ["-c", sql], capture_output=True, text=True, check=True).stdout.strip().splitlines()


def _db_up():
    if not shutil.which("psql"):
        return False
    try:
        return q("select count(*) from public.guna_lookup")[0] == "11664"
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _db_up(), reason="local test DB not running")


def test_lookup_rows_equal_python():
    rows = q("select boy_nakshatra,boy_pada,girl_nakshatra,girl_pada,total,adjusted_total from public.guna_lookup")
    assert len(rows) == 11664
    for r in rows:
        bn, bp, gn, gp, total, adj = r.split("|")
        m = ashtakoota(MoonPoint(int(bn), int(bp)), MoonPoint(int(gn), int(gp)))
        assert float(total) == m.total and float(adj) == m.adjusted_total


def test_jodi_formula_equal_python():
    rnd = random.Random(7)
    cases = []
    for _ in range(400):
        b, g = MoonPoint(rnd.randrange(27), rnd.randint(1, 4)), MoonPoint(rnd.randrange(27), rnd.randint(1, 4))
        ma, mb = rnd.random() < 0.3, rnd.random() < 0.3
        va, vb = rnd.randrange(12), rnd.randrange(12)
        m = ashtakoota(b, g)
        py = jodi_score(m, manglik_fit({"effective": ma}, {"effective": mb}), moon_venus_fit(va, g.sign, vb, b.sign))
        cases.append((m.adjusted_total, ma, mb, va, b.sign, vb, g.sign, py))
    values = ",".join(f"({a},{str(ma).lower()},{str(mb).lower()},{va},{moa},{vb},{mob},{py})" for a, ma, mb, va, moa, vb, mob, py in cases)
    bad = q(f"select count(*) from (values {values}) v(a,ma,mb,va,moa,vb,mob,py) "
            f"where private.jodi_from(a,ma,mb,va,moa,vb,mob) <> py")
    assert bad == ["0"]
