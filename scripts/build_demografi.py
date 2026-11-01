#!/usr/bin/env python3
"""Aldersfordeling per kommune (SSB 07459), harmonisert til dagens kommuner.

Skriver data/alder/index.json (indikatorer for alle kommuner + pyramider for
Norge og fylker) og data/alder/<fylkesnr>.json (pyramider for kommunene).
Forutsetter at data/skatt-regioner.json finnes (kommuneliste og navn).
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ssblib import Cube, Harmonizer, meta, query  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(DATA, "alder")
NAGES = 106  # 0 … 105+
GROUPS = [(a, a + 4) for a in range(0, 90, 5)] + [(90, 105)]
GROUP_LABELS = [f"{a}–{b}" for a, b in GROUPS[:-1]] + ["90+"]


def indicators(m, f):
    tot = [a + b for a, b in zip(m, f)]
    n = sum(tot)
    if n <= 0:
        return None
    s = lambda lo, hi: sum(tot[lo:hi + 1])  # noqa: E731
    working = s(20, 66)
    # median alder med lineær interpolasjon innen ettårig alder
    half, cum, med = n / 2, 0.0, None
    for age, x in enumerate(tot):
        if cum + x >= half and x > 0:
            med = age + (half - cum) / x
            break
        cum += x
    return {
        "pop": round(n),
        "a0_19": round(100 * s(0, 19) / n, 2),
        "a20_66": round(100 * working / n, 2),
        "a67": round(100 * s(67, NAGES - 1) / n, 2),
        "a80": round(100 * s(80, NAGES - 1) / n, 2),
        "fb": round(100 * s(67, NAGES - 1) / working, 1) if working else None,
        "med": round(med, 1) if med is not None else None,
    }


def group(arr):
    return [round(sum(arr[a:b + 1])) for a, b in GROUPS]


def main():
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(DATA, "skatt-regioner.json"), encoding="utf-8") as fh:
        reg = json.load(fh)
    kommuner = list(reg["kommuner"].keys())
    fylker = reg["fylker"]

    md = meta("07459")
    tids = [v for v in md["variables"] if v["code"] == "Tid"][0]["values"]
    regions = [v for v in md["variables"] if v["code"] == "Region"][0]["values"]
    codes4 = [r for r in regions if len(r) == 4]
    years = [int(t) for t in tids]
    print(f"07459: {years[0]}–{years[-1]}, {len(codes4)} kommunekoder", file=sys.stderr)

    raw = {}  # (kode, år) -> (menn[106], kvinner[106])
    chunk = 3
    for i in range(0, len(tids), chunk):
        part = tids[i:i + chunk]
        print("  henter", part[0], "–", part[-1], file=sys.stderr)
        c = Cube(query("07459", {"Region": codes4, "Kjonn": ["1", "2"], "Alder": "*", "ContentsCode": "*", "Tid": part}))
        ages = c.cats("Alder")
        cc = c.cats("ContentsCode")[0]
        for r in c.cats("Region"):
            for t in part:
                m = [c.get(Region=r, Kjonn="1", Alder=a, ContentsCode=cc, Tid=t) or 0 for a in ages]
                f = [c.get(Region=r, Kjonn="2", Alder=a, ContentsCode=cc, Tid=t) or 0 for a in ages]
                if sum(m) + sum(f) > 0:
                    raw[(r, int(t))] = (m, f)

    totals = {k: sum(v[0]) + sum(v[1]) for k, v in raw.items()}
    harm = Harmonizer(lambda code, y: totals.get((code, y)))

    nY = len(years)
    km = {k: [[0.0] * NAGES for _ in range(nY)] for k in kommuner}
    kf = {k: [[0.0] * NAGES for _ in range(nY)] for k in kommuner}
    for (r, y), (m, f) in raw.items():
        yi = years.index(y)
        for t, w in harm(r, y).items():
            if t not in km:
                continue
            row_m, row_f = km[t][yi], kf[t][yi]
            for a in range(NAGES):
                row_m[a] += m[a] * w
                row_f[a] += f[a] * w

    def series(mm, ff):
        inds = [indicators(mm[yi], ff[yi]) for yi in range(nY)]
        keys = ["pop", "a0_19", "a20_66", "a67", "a80", "fb", "med"]
        return {k: [None if i is None else i[k] for i in inds] for k in keys}

    def pyramids(mm, ff):
        return [[group(mm[yi]), group(ff[yi])] for yi in range(nY)]

    # fylker og Norge
    fm = {f: [[0.0] * NAGES for _ in range(nY)] for f in fylker}
    ff_ = {f: [[0.0] * NAGES for _ in range(nY)] for f in fylker}
    nm = [[0.0] * NAGES for _ in range(nY)]
    nf = [[0.0] * NAGES for _ in range(nY)]
    for k in kommuner:
        f = k[:2]
        for yi in range(nY):
            for a in range(NAGES):
                fm[f][yi][a] += km[k][yi][a]
                ff_[f][yi][a] += kf[k][yi][a]
                nm[yi][a] += km[k][yi][a]
                nf[yi][a] += kf[k][yi][a]

    index = {
        "source": "SSB tabell 07459",
        "updated": md.get("updated"),
        "years": years,
        "groups": GROUP_LABELS,
        "norge": {"name": "Norge", "ind": series(nm, nf), "pyr": pyramids(nm, nf)},
        "fylker": {f: {"name": fylker[f]["name"], "ind": series(fm[f], ff_[f]), "pyr": pyramids(fm[f], ff_[f])} for f in fylker},
        "kommuner": {k: {"name": reg["kommuner"][k]["name"], "f": k[:2], "ind": series(km[k], kf[k])} for k in kommuner},
    }
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, separators=(",", ":"))
    for f in fylker:
        part = {k: pyramids(km[k], kf[k]) for k in kommuner if k[:2] == f}
        with open(os.path.join(OUT, f"{f}.json"), "w", encoding="utf-8") as fh:
            json.dump(part, fh, ensure_ascii=False, separators=(",", ":"))
    print("skrev data/alder/", file=sys.stderr)


if __name__ == "__main__":
    main()
