#!/usr/bin/env python3
"""Inntektsulikhet i kommunene.

Kilder:
  * SSB 07756  Ulikhetsmål for hele landet (Gini, P90/P10, S80/S20), 1986–
  * FHI 366    Gini og P90/P10 per kommune (dagens inndeling), 2009–
  * FHI 583    Vedvarende lavinntekt (EU60, nasjonal median), alle og 0–17 år, treårsperioder
  * SSB 12558  Husholdninger etter nasjonale inntektsdesiler, per kommune (antall harmoniseres)
  * SSB 06944  Median inntekt etter skatt for husholdninger, siste år
Skriver data/ulikhet.json. Forutsetter data/skatt-regioner.json og data/alder/index.json.
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ssblib import Cube, Harmonizer, fhi_query, meta, query  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")


def num(v):
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def main():
    reg = json.load(open(os.path.join(DATA, "skatt-regioner.json"), encoding="utf-8"))
    alder = json.load(open(os.path.join(DATA, "alder", "index.json"), encoding="utf-8"))
    kommuner = list(reg["kommuner"].keys())
    K = set(kommuner)

    # ---------------- hele landet ----------------
    c = Cube(query("07756", {"Forbruksenhet2": ["01"], "ContentsCode": ["Ginikoeffisient", "P90P10", "S80S20"], "Tid": "*"}))
    ny = c.cats("Tid")
    national = {"years": [int(y) for y in ny]}
    for k, key in [("Ginikoeffisient", "gini"), ("P90P10", "p9010"), ("S80S20", "s8020")]:
        national[key] = [num(c.get(Forbruksenhet2="01", ContentsCode=k, Tid=y)) for y in ny]
    print("07756:", ny[0], "–", ny[-1], file=sys.stderr)

    # ---------------- Gini og P90/P10 per kommune (FHI 366) ----------------
    g = Cube(fhi_query(366, {"GEO": "*", "AAR": "*", "MEASURE_TYPE": ["GINI", "MALTALL"]}))
    gyears = g.cats("AAR")
    gy = [int(g.label["AAR"].get(a, a)[:4]) for a in gyears]

    def gser(geo, m):
        if geo not in g.index["GEO"]:
            return [None] * len(gyears)
        return [num(g.get(GEO=geo, AAR=a, MEASURE_TYPE=m)) for a in gyears]
    print("FHI 366:", gy[0], "–", gy[-1], file=sys.stderr)

    # ---------------- Vedvarende lavinntekt (FHI 583) ----------------
    lw = Cube(fhi_query(583, {"GEO": "*", "AAR": "*", "ALDER": ["0_120", "0_17"], "INNVKAT": ["0"], "MAAL": ["ant_eu60"], "MEASURE_TYPE": ["RATE"]}))
    lyears = lw.cats("AAR")
    ly = [lw.label["AAR"].get(a, a) for a in lyears]

    def lser(geo, alder_):
        if geo not in lw.index["GEO"]:
            return [None] * len(lyears)
        vals = [num(lw.get(GEO=geo, AAR=a, ALDER=alder_, INNVKAT="0", MAAL="ant_eu60", MEASURE_TYPE="RATE")) for a in lyears]
        return [None if v is None else round(v, 1) for v in vals]
    print("FHI 583:", ly[0], "–", ly[-1], file=sys.stderr)

    # ---------------- Desilfordeling (SSB 12558), harmonisert via antall ----------------
    t = [v for v in meta("12558")["variables"] if v["code"] == "Tid"][0]["values"]
    d = Cube(query("12558", {"Region": "*", "InntektSkatt": ["00S"], "Desiler": "*", "ContentsCode": ["AntHush"], "Tid": t}))
    dec = d.cats("Desiler")
    dyears = [int(y) for y in t]
    tot = {}
    for r in d.cats("Region"):
        for y in t:
            s = sum((d.get(Region=r, InntektSkatt="00S", Desiler=q, ContentsCode="AntHush", Tid=y) or 0) for q in dec)
            if s:
                tot[(r, int(y))] = s
    harm = Harmonizer(lambda code, y: tot.get((code, y)))
    cnt = {k: [[0.0] * 10 for _ in dyears] for k in kommuner}
    for r in d.cats("Region"):
        if len(r) != 4:
            continue
        for yi, y in enumerate(t):
            vals = [d.get(Region=r, InntektSkatt="00S", Desiler=q, ContentsCode="AntHush", Tid=y) or 0 for q in dec]
            if not sum(vals):
                continue
            for tc, w in harm(r, int(y)).items():
                if tc in cnt:
                    for qi in range(10):
                        cnt[tc][yi][qi] += vals[qi] * w

    def shares(rows):
        out = []
        for row in rows:
            s = sum(row)
            out.append([round(100 * v / s, 1) for v in row] if s else None)
        return out
    print("12558:", t[0], "–", t[-1], file=sys.stderr)

    # ---------------- Median inntekt etter skatt (SSB 06944) ----------------
    tm = [v for v in meta("06944")["variables"] if v["code"] == "Tid"][0]["values"][-1]
    m = Cube(query("06944", {"Region": "*", "HusholdType": ["0000", "0001", "0002", "0003", "0004"], "ContentsCode": ["InntSkatt"], "Tid": [tm]}))
    htypes = {"0000": "alle", "0001": "aleneboende", "0002": "par_uten", "0003": "par_med", "0004": "enslig_forsorger"}

    def med(r):
        if r not in m.index["Region"]:
            return {}
        return {name: m.get(Region=r, HusholdType=h, ContentsCode="InntSkatt", Tid=tm) for h, name in htypes.items()}

    ay = len(alder["years"]) - 1
    out = {
        "source": "SSB 07756, 12558, 06944 og FHI 366, 583",
        "updated": max(filter(None, [c.updated, d.updated, m.updated, g.updated, lw.updated])),
        "national": national,
        "gyears": gy, "lyears": ly, "dyears": dyears, "medYear": int(tm),
        "norge": {"gini": gser("0", "GINI"), "p9010": gser("0", "MALTALL"), "low": lser("0", "0_120"), "lowc": lser("0", "0_17"), "med": med("0")},
        "fylker": {f: {"name": v["name"], "gini": gser(f, "GINI"), "p9010": gser(f, "MALTALL"), "low": lser(f, "0_120"), "lowc": lser(f, "0_17")} for f, v in reg["fylker"].items()},
        "kommuner": {
            k: {
                "name": reg["kommuner"][k]["name"], "f": k[:2], "pop": alder["kommuner"][k]["ind"]["pop"][ay],
                "gini": gser(k, "GINI"), "p9010": gser(k, "MALTALL"),
                "low": lser(k, "0_120"), "lowc": lser(k, "0_17"),
                "dec": shares(cnt[k]), "med": med(k),
            } for k in kommuner
        },
    }
    with open(os.path.join(DATA, "ulikhet.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print("skrev data/ulikhet.json", file=sys.stderr)


if __name__ == "__main__":
    main()
