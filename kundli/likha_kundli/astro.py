"""Planet positions from NASA JPL ephemeris DE421 (via Skyfield, MIT licence; JPL data is public domain).

Sidereal longitude = apparent tropical longitude (true equinox of date)
                     - nutation in longitude          (back to the mean equinox)
                     - Lahiri ayanamsa (mean)
Lahiri ayanamsa = 23.8570923° at J2000.0 + IAU 2006 general precession in longitude.
This reproduces the Indian standard (Lahiri / Chitrapaksha, as used by Rashtriya Panchang software)
to better than 1 arc-second for 1925-2045. Rahu is the mean lunar node (Meeus), Ketu = Rahu + 180°.
"""
from __future__ import annotations

import math
import os
import warnings

from skyfield.api import Loader, load
from skyfield.framelib import ecliptic_frame

warnings.filterwarnings("ignore", module="skyfield_data")

LAHIRI_J2000 = 23.8570923                    # degrees, mean ayanamsa at 2000-01-01 12:00 TT

_DATA = os.environ.get("JPL_DATA_DIR")
if not _DATA:
    import skyfield_data
    _DATA = skyfield_data.get_skyfield_data_path()
_ts = load.timescale(builtin=True)           # built-in leap seconds and Delta T, no downloads
_eph = Loader(_DATA)("de421.bsp")            # JPL DE421: 1900-2050
_earth = _eph["earth"]
_BODIES = {"Sun": "sun", "Moon": "moon", "Mars": "mars", "Mercury": "mercury",
           "Jupiter": "jupiter barycenter", "Venus": "venus", "Saturn": "saturn barycenter"}
EPHEMERIS = "NASA JPL DE421"


def _T(t) -> float:
    return (t.tt - 2451545.0) / 36525.0


def lahiri_ayanamsa(t) -> float:
    T = _T(t)
    p_a = (5028.796195 * T + 1.1054348 * T ** 2 + 0.00007964 * T ** 3 - 0.000023857 * T ** 4) / 3600.0
    return LAHIRI_J2000 + p_a


def _nutation_lon_deg(t) -> float:
    dpsi, _ = t._nutation_angles_radians
    return math.degrees(dpsi)


def _tropical_true(t, body: str) -> float:
    _lat, lon, _d = _earth.at(t).observe(_eph[body]).apparent().frame_latlon(ecliptic_frame)
    return lon.degrees


def mean_node_tropical(t) -> float:
    """Mean ascending node of the Moon, mean equinox of date (Meeus, Astronomical Algorithms 47.7)."""
    T = _T(t)
    return (125.0445479 - 1934.1362891 * T + 0.0020754 * T ** 2 + T ** 3 / 467441 - T ** 4 / 60616000) % 360


def sidereal_positions(jd_ut: float, lat: float, lng: float) -> dict:
    """{planet: (sidereal longitude °, speed °/day)} plus 'Lagna': (longitude, 0)."""
    t = _ts.ut1_jd(jd_ut)
    ay = lahiri_ayanamsa(t)
    nut = _nutation_lon_deg(t)
    out = {}
    t0, t1 = _ts.ut1_jd(jd_ut - 0.5), _ts.ut1_jd(jd_ut + 0.5)
    for name, body in _BODIES.items():
        lon = (_tropical_true(t, body) - nut - ay) % 360
        speed = ((_tropical_true(t1, body) - _tropical_true(t0, body) + 540) % 360) - 180
        out[name] = (float(lon), float(speed))
    out["Rahu"] = (float((mean_node_tropical(t) - ay) % 360), -0.0529539)
    # Ascendant from apparent sidereal time and true obliquity
    _dpsi, deps = t._nutation_angles_radians
    eps = t._mean_obliquity_radians + deps
    ramc = math.radians((t.gast * 15 + lng) % 360)
    phi = math.radians(lat)
    asc = math.degrees(math.atan2(math.cos(ramc), -(math.sin(ramc) * math.cos(eps) + math.tan(phi) * math.sin(eps))))
    out["Lagna"] = (float((asc - nut - ay) % 360), 0.0)
    return out


def ayanamsa_ut(jd_ut: float) -> float:
    return lahiri_ayanamsa(_ts.ut1_jd(jd_ut))


def sun_sidereal(jd_ut: float) -> float:
    t = _ts.ut1_jd(jd_ut)
    return (_tropical_true(t, "sun") - _nutation_lon_deg(t) - lahiri_ayanamsa(t)) % 360
