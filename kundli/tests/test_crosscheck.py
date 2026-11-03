"""Guard: every Guna Milan difference from PyJHora must be a documented table choice (see CROSSCHECK.md)."""
import pytest

pytest.importorskip("jhora", reason="pip install -r requirements-dev.txt")

from tools.crosscheck_pyjhora import run  # noqa: E402


def test_no_unexplained_differences():
    r = run()
    assert r["pairs"] == 11664
    assert r["unexplained"] == [], r["unexplained"][:10]
    assert r["tara_classical_ok"] == 11664
    for k in ("yoni", "graha_maitri", "gana", "nadi"):
        assert r["differ"][k] == 0, k
