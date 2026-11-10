#!/usr/bin/env python3
"""Legemeldt sykefravær i kommunene, 2015–.

Kilde: FHIs folkehelsestatistikk, tabell SYKEFRAV_SSB (826), med grunnlagstall fra SSB:
sykefraværsdagsverk i prosent av avtalte dagsverk for lønnstakere 20–66 år, etter bosted,
kjønn og alder. Også standardisert for alder og kjønn. Kommuneinndeling per 1.1.2025.
Skriver data/sykefravaer.json. Forutsetter data/skatt-regioner.json.
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ssblib import Cube, fhi_query  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
AGES = ["20_66", "20_29", "30_44", "45_54", "55_66"]
MEAS = {"RATE": "rate", "MEIS": "std", "SMR": "smr"}


def main():
    reg = json.load(open(os.path.join(DATA, "skatt-regioner.json"), encoding="utf-8"))
    K = list(reg["kommuner"].keys())
    c = Cube(fhi_query(826, {"GEO": "*", "AAR": "*", "KJONN": ["0", "1", "2"], "ALDER": AGES, "MEASURE_TYPE": list(MEAS) + ["TELLER"]}))
    years = sorted(c.cats("AAR"))
    geos = c.cats("GEO")

    def ser(geo, kj, alder, m):
        out = []
        for y in years:
            v = c.get(GEO=geo, AAR=y, KJONN=kj, ALDER=alder, MEASURE_TYPE=m)
            try:
                out.append(round(float(v), 2))
            except (TypeError, ValueError):  # ":" = skjult av personvernhensyn
                out.append(None)
        return out

    def block(geo, full=True):
        """Alle mål for 20–66 år og aldersgrupper (bare rå andel) for begge kjønn."""
        b = {}
        for kj in ("0", "1", "2"):
            for m, key in MEAS.items():
                b[f"{key}_{kj}"] = ser(geo, kj, "20_66", m)
            if full:
                for a in AGES[1:]:
                    b[f"rate_{kj}_{a}"] = ser(geo, kj, a, "RATE")
        b["dagsverk"] = ser(geo, "0", "20_66", "TELLER")
        return b

    kommuner = {}
    for k in K:
        if k not in geos:
            print("  mangler", k, reg["kommuner"][k]["name"], file=sys.stderr)
            continue
        kommuner[k] = {"name": reg["kommuner"][k]["name"], "f": reg["kommuner"][k]["f"], **block(k)}
    fylker = {f: {"name": v["name"], **block(f)} for f, v in reg["fylker"].items() if f in geos}
    out = {
        "source": "FHI folkehelsestatistikk (SYKEFRAV_SSB), grunnlagstall fra SSB",
        "fetched": time.strftime("%Y-%m-%d"),
        "years": [int(y[:4]) for y in years],
        "norge": block("0"),
        "fylker": fylker,
        "kommuner": kommuner,
    }
    with open(os.path.join(DATA, "sykefravaer.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"skrev data/sykefravaer.json ({len(kommuner)} kommuner, {out['years'][0]}–{out['years'][-1]})", file=sys.stderr)


if __name__ == "__main__":
    main()
