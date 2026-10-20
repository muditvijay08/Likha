"""Likha Ashtakoota rules (North Indian, Moon-based). FINAL rule set "ak-2.0" (20 Oct 2026).

How each table was settled: where sources disagree we took the version backed by a classical verse or by the
majority of established implementations, and wrote down the reason. Sources compared:
  [OJ]  onlinejyotish.com marriage-matching articles (quotes Muhurta Chintamani, Jyotirnibandha, Vasistha/Narada Samhita)
  [PJ]  PyJHora (open-source Jagannatha Hora port; Gana/Vashya tables from saravali.de)
  [MT]  Maitreya (open-source Vedic software) Yoni matrix
  [AY]  AstroYogi Vashya table
  [RX]  RoxyAPI published Gun Milan algorithm (dosha cancellations)
  [BVR] B.V. Raman's Manglik exceptions (as listed in PyJHora dosha.py)
Change a table here -> bump RULES_VERSION -> regenerate guna_lookup.sql.
Sign index 0 = Aries ... 11 = Pisces. Nakshatra index 0 = Ashwini ... 26 = Revati.
"""

RULES_VERSION = "ak-2.0"

SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
         "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"]
SIGNS_HI = ["Mesh", "Vrishabh", "Mithun", "Kark", "Simha", "Kanya",
            "Tula", "Vrishchik", "Dhanu", "Makar", "Kumbh", "Meen"]

NAKSHATRAS = ["Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
              "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni",
              "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha",
              "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha",
              "Purva Bhadrapada", "Uttara Bhadrapada", "Revati"]

PLANETS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"]

SIGN_LORD = ["Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury",
             "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter"]

# Vimshottari: lord of nakshatra n is DASHA_ORDER[n % 9]
DASHA_ORDER = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"]
DASHA_YEARS = {"Ketu": 7, "Venus": 20, "Sun": 6, "Moon": 10, "Mars": 7,
               "Rahu": 18, "Jupiter": 16, "Saturn": 19, "Mercury": 17}

# ---- 1. Varna (max 1) ------------------------------------------------------
# [OJ]: Brahmin Cancer/Scorpio/Pisces, Kshatriya Aries/Leo/Sag, Vaishya Taurus/Virgo/Cap, Shudra Gemini/Libra/Aquarius.
# 1 point when the groom's varna is equal or higher. (PyJHora swaps Vaishya/Shudra signs; [OJ] matches North Indian almanacs.)
# 3 Brahmin, 2 Kshatriya, 1 Vaishya, 0 Shudra  (by Moon sign)
VARNA_NAMES = ["Shudra", "Vaishya", "Kshatriya", "Brahmin"]
VARNA_OF_SIGN = [2, 1, 0, 3, 2, 1, 0, 3, 2, 1, 0, 3]

# ---- 2. Vashya (max 2) -----------------------------------------------------
VASHYA_NAMES = ["Chatushpada", "Manava", "Jalachara", "Vanachara", "Keeta"]
# Sagittarius: first half Manava, second half Chatushpada.
# Capricorn: first half Chatushpada, second half Jalachara.
# The classical half is 15 deg. We decide by the pada's midpoint so the 108x108 table and live charts agree.
# Two padas straddle 15 deg exactly (Purva Ashadha 1, Shravana 2); their midpoint is 15 deg and we count them in
# the first half. ([PJ] approximates halves as whole padas 1-2 / 3-4; we keep the classical 15 deg.)
def vashya_group(sign: int, deg_in_sign: float) -> int:
    first_half = round(deg_in_sign, 6) <= 15
    if sign == 8:
        return 1 if first_half else 0
    if sign == 9:
        return 0 if first_half else 2
    return [0, 0, 1, 2, 3, 1, 1, 4, None, None, 1, 2][sign]

# Three published tables disagree on 4 cells ([OJ], [AY], common North Indian table). Each cell below is the
# majority of the three; where all three differ (Chatushpada-Vanachara) we follow [OJ] (0: the lion preys on
# quadrupeds, which is the classical "bhakshya" relation). The result is symmetric.
# rows = boy group, cols = girl group
VASHYA_TABLE = [
    # Cha  Man  Jal  Van  Kee
    [2.0, 1.0, 1.0, 0.0, 1.0],   # Chatushpada
    [1.0, 2.0, 0.5, 0.0, 1.0],   # Manava
    [1.0, 0.5, 2.0, 1.0, 1.0],   # Jalachara
    [0.0, 0.0, 1.0, 2.0, 0.0],   # Vanachara
    [1.0, 1.0, 1.0, 0.0, 2.0],   # Keeta
]

# ---- 3. Tara (max 3) -------------------------------------------------------
# Count inclusively both ways (girl->boy and boy->girl), remainder by 9. 3,5,7 (Vipat, Pratyari, Vadha/Naidhana)
# are unfavourable; 1.5 points for each favourable direction. [OJ][RX] and the classical Tara scheme.
BAD_TARA = {3, 5, 7}             # Vipat, Pratyari, Vadha

# ---- 4. Yoni (max 4) -------------------------------------------------------
# Same as [PJ] and [MT] in every cell except Horse-Deer, where we follow 3 of the 4 published directions (1 point).
# Sworn enemies (0): Horse-Buffalo, Elephant-Lion, Sheep-Monkey, Serpent-Mongoose, Dog-Deer, Cat-Rat, Cow-Tiger.
YONI_NAMES = ["Horse", "Elephant", "Sheep", "Serpent", "Dog", "Cat", "Rat",
              "Cow", "Buffalo", "Tiger", "Deer", "Monkey", "Mongoose", "Lion"]
YONI_OF_NAK = [0, 1, 2, 3, 3, 4, 5, 2, 5, 6, 6, 7, 8, 9, 8, 9, 10, 10,
               4, 11, 12, 11, 13, 0, 13, 7, 1]
YONI_TABLE = [
    #Ho El Sh Se Do Ca Ra Co Bu Ti De Mo Mg Li
    [4, 2, 2, 3, 2, 2, 2, 1, 0, 1, 1, 3, 2, 1],  # Horse
    [2, 4, 3, 3, 2, 2, 2, 2, 3, 1, 2, 3, 2, 0],  # Elephant
    [2, 3, 4, 2, 1, 2, 1, 3, 3, 1, 2, 0, 3, 1],  # Sheep
    [3, 3, 2, 4, 2, 1, 1, 1, 1, 2, 2, 2, 0, 2],  # Serpent
    [2, 2, 1, 2, 4, 2, 1, 2, 2, 1, 0, 2, 1, 1],  # Dog
    [2, 2, 2, 1, 2, 4, 0, 2, 2, 1, 3, 3, 2, 1],  # Cat
    [2, 2, 1, 1, 1, 0, 4, 2, 2, 2, 2, 2, 1, 2],  # Rat
    [1, 2, 3, 1, 2, 2, 2, 4, 3, 0, 3, 2, 2, 1],  # Cow
    [0, 3, 3, 1, 2, 2, 2, 3, 4, 1, 2, 2, 2, 1],  # Buffalo
    [1, 1, 1, 2, 1, 1, 2, 0, 1, 4, 1, 1, 2, 1],  # Tiger
    [1, 2, 2, 2, 0, 3, 2, 3, 2, 1, 4, 2, 2, 1],  # Deer
    [3, 3, 0, 2, 2, 3, 2, 2, 2, 1, 2, 4, 3, 2],  # Monkey
    [2, 2, 3, 0, 1, 2, 1, 2, 2, 2, 2, 3, 4, 2],  # Mongoose
    [1, 0, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 2, 4],  # Lion
]

# ---- 5. Graha Maitri (max 5) ----------------------------------------------
# Parashara's natural friendships. The scores this produces match the published 7x7 table in [OJ] and [PJ]
# cell for cell (checked in tests).
# Natural friendship: F friend, N neutral, E enemy.  RELATION[a][b] = how a sees b.
_F, _N, _E = "F", "N", "E"
RELATION = {
    "Sun":     {"Moon": _F, "Mars": _F, "Jupiter": _F, "Mercury": _N, "Venus": _E, "Saturn": _E},
    "Moon":    {"Sun": _F, "Mercury": _F, "Mars": _N, "Jupiter": _N, "Venus": _N, "Saturn": _N},
    "Mars":    {"Sun": _F, "Moon": _F, "Jupiter": _F, "Venus": _N, "Saturn": _N, "Mercury": _E},
    "Mercury": {"Sun": _F, "Venus": _F, "Mars": _N, "Jupiter": _N, "Saturn": _N, "Moon": _E},
    "Jupiter": {"Sun": _F, "Moon": _F, "Mars": _F, "Saturn": _N, "Mercury": _E, "Venus": _E},
    "Venus":   {"Mercury": _F, "Saturn": _F, "Mars": _N, "Jupiter": _N, "Sun": _E, "Moon": _E},
    "Saturn":  {"Mercury": _F, "Venus": _F, "Jupiter": _N, "Sun": _E, "Moon": _E, "Mars": _E},
}
MAITRI_SCORE = {
    ("F", "F"): 5.0, ("F", "N"): 4.0, ("N", "F"): 4.0, ("N", "N"): 3.0,
    ("F", "E"): 1.0, ("E", "F"): 1.0, ("N", "E"): 0.5, ("E", "N"): 0.5, ("E", "E"): 0.0,
}

# ---- 6. Gana (max 6) -------------------------------------------------------
GANA_NAMES = ["Deva", "Manushya", "Rakshasa"]
GANA_OF_NAK = [0, 1, 2, 1, 0, 1, 0, 0, 2, 2, 1, 1, 0, 2, 0, 2, 0, 2,
               2, 1, 1, 0, 2, 2, 1, 1, 0]
# [OJ] and [PJ] publish the same directional table (bride rows x groom cols: D[6,6,0] M[5,6,0] R[1,0,6]).
# Written here as boy rows x girl cols:
GANA_TABLE = [   # rows boy, cols girl
    [6, 5, 1],   # Deva boy:     Deva girl 6, Manushya girl 5, Rakshasa girl 1
    [6, 6, 0],   # Manushya boy: Deva girl 6, Manushya girl 6, Rakshasa girl 0
    [0, 0, 6],   # Rakshasa boy: Deva girl 0, Manushya girl 0, Rakshasa girl 6
]

# ---- 7. Bhakoot (max 7) ----------------------------------------------------
# 2/12, 5/9, 6/8 score 0. Cancelled when both Moon signs share a lord or the lords are mutual friends [RX].
# distance counted inclusively from one Moon sign to the other (1..12)
BAD_BHAKOOT = {(2, 12), (12, 2), (5, 9), (9, 5), (6, 8), (8, 6)}

# ---- 8. Nadi (max 8) -------------------------------------------------------
# Same Nadi scores 0. Cancelled (Jyotirnibandha, quoted in [OJ]; also [RX]) when:
#   same nakshatra but different Moon sign; same Moon sign but different nakshatra; same nakshatra, different pada.
# NOT applied: special-nakshatra lists (the verses quoted disagree with each other) and Moon-lord friendship
# (Muhurta Ganapati) - shown to the member as a softening note only.
NADI_NAMES = ["Adi", "Madhya", "Antya"]
NADI_OF_NAK = [0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0,
               0, 1, 2, 2, 1, 0, 0, 1, 2]

KOOTA_MAX = {"varna": 1, "vashya": 2, "tara": 3, "yoni": 4,
             "graha_maitri": 5, "gana": 6, "bhakoot": 7, "nadi": 8}

# ---- Manglik ---------------------------------------------------------------
# Mars in 1, 2, 4, 7, 8 or 12 counted from Lagna (house 2 as in South India and most apps; [PJ] default).
# Also checked from the Moon: present from both = "high", from Lagna only = "mild".
# Cancellations from [BVR], the ones that are unambiguous to compute:
#   Mars in own sign or exalted (Aries, Scorpio, Capricorn); Mars in Leo or Aquarius;
#   the house+sign pairs below; Mars with Jupiter or aspected by Jupiter (5th, 7th, 9th);
#   Lagna in Cancer or Leo (Mars is yogakaraka).  Both partners Manglik also cancels for the pair.
MANGLIK_HOUSES = {1, 2, 4, 7, 8, 12}
MANGLIK_OWN_OR_EXALTED = {0, 7, 9, 4, 10}    # Aries, Scorpio, Capricorn (own/exalted) + Leo, Aquarius [BVR]
MANGLIK_YOGAKARAKA_LAGNA = {3, 4}            # Cancer, Leo
JUPITER_ASPECTS = {1, 5, 7, 9}               # same sign + whole-sign aspects
MANGLIK_HOUSE_SIGN_EXCEPTIONS = {
    2: {2, 5},        # 2nd house in Gemini or Virgo
    4: {0, 7},        # 4th in Aries or Scorpio
    7: {3, 9},        # 7th in Cancer or Capricorn
    8: {8, 11},       # 8th in Sagittarius or Pisces
    12: {1, 6},       # 12th in Taurus or Libra
}

# ---- Jodi Score (0-100) ----------------------------------------------------
# Kundli-only. Weights live in app_settings.matching.jodi_weights (must add up to 100).
JODI_DEFAULTS = {
    "gunas": 70,                 # Guna Milan, with cancelled Nadi/Bhakoot doshas given their points back
    "manglik": 15,               # Manglik match (both, or neither, after cancellations)
    "moon_venus": 15,            # each person's Venus sign against the other's Moon sign
    "one_sided_manglik": 0.4,    # manglik fit when only one partner is Manglik
}
# sign distance (1..12) of Venus -> other person's Moon
MOON_VENUS_FIT = {1: 1.0, 7: 1.0, 5: 1.0, 9: 1.0, 4: 1.0, 10: 1.0, 3: 1.0, 11: 1.0,
                  2: 0.5, 12: 0.5, 6: 0.0, 8: 0.0}
