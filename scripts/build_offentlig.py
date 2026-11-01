#!/usr/bin/env python3
"""Offentlige utgifter etter formål og statens oljepenger.

Kilder (SSB):
  * 14669  Offentlig forvaltnings utgifter etter sektor, art og formål (COFOG), 1995–
  * 14668  Offentlig forvaltnings inntekter og utgifter etter art og sektor, 1995–
  * 14722  Utvalgte størrelser fra Statens pensjonsfond utland (renter og utbytte), 1997–
  * 07511  Offentlig forvaltnings fordringer og gjeld (statens nettofordringer), 1995–
  * 09189  Makroøkonomiske hovedstørrelser (BNP Fastlands-Norge), 1970–
  * 10486  Statsregnskapet (overskudd og netto avsetning til SPU), 1985–
  * 05803  Folkemengde 1. januar
Skriver data/utgifter.json og data/oljepenger.json.
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ssblib import Cube, meta, query  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")


def tids(table, first=None):
    t = [v for v in meta(table)["variables"] if v["code"] == "Tid"][0]["values"]
    return [x for x in t if first is None or int(x[:4]) >= first]


def r0(v):
    return None if v is None else round(v)


def main():
    # ---------------- befolkning ----------------
    p = Cube(query("05803", {"ContentsCode": ["Personer"], "Tid": tids("05803", 1985)}))
    pop = {int(t): p.get(ContentsCode="Personer", Tid=t) for t in p.cats("Tid")}

    # ---------------- COFOG ----------------
    t = tids("14669")
    c = Cube(query("14669", {"Sektor": "*", "Art": "*", "Formaal": "*", "ContentsCode": "*", "Tid": t}))
    years = [int(y) for y in t]
    formaal = c.cats("Formaal")
    arts = c.cats("Art")
    g = lambda s, a, f, y: c.get(Sektor=s, Art=a, Formaal=f, ContentsCode="Belop", Tid=str(y))  # noqa: E731
    F = []
    for f in formaal:
        F.append({
            "code": f, "name": c.label["Formaal"][f],
            "parent": None if f == "0" else ("0" if len(f) == 2 else f[:2] if len(f) == 3 else f[:3]),
            "off": [r0(g("C_OFF", "E", f, y)) for y in years],
            "stat": [r0(g("6100", "E", f, y)) for y in years],
            "komm": [r0(g("6500", "E", f, y)) for y in years],
            # fordeling på art for offentlig forvaltning samlet, siste og første år + hele serien for hovedformål
            "art": {a: [r0(g("C_OFF", a, f, y)) for y in years] for a in arts if a != "E"} if len(f) <= 2 else None,
        })
    ut = {
        "source": "SSB tabell 14669",
        "updated": c.updated,
        "years": years,
        "pop": [pop.get(y) for y in years],
        "arts": [{"code": a, "name": c.label["Art"][a]} for a in arts if a != "E"],
        "formaal": F,
    }

    # ---------------- oljepenger ----------------
    t2 = tids("14668")
    n = Cube(query("14668", {"Art": ["A", "A12", "A23", "A522", "A531", "A5511", "A51", "A521", "E", "F", "B6", "B812"], "Sektor": ["6100"], "ContentsCode": "*", "Tid": t2}))
    ny = [int(y) for y in t2]
    na = lambda a, y: n.get(Art=a, Sektor="6100", ContentsCode="Belop", Tid=str(y))  # noqa: E731
    spu = Cube(query("14722", {"Art": "*", "ContentsCode": "*", "Tid": "*"}))
    arts_spu = spu.cats("Art")
    spu_years = [int(y) for y in spu.cats("Tid")]

    def spu_get(label_part, y):
        for a in arts_spu:
            if label_part.lower() in spu.label["Art"][a].lower():
                return spu.get(Art=a, ContentsCode=spu.cats("ContentsCode")[0], Tid=str(y))
        return None
    f = Cube(query("07511", {"Sektor": ["110"], "FinansObjekt": ["46"], "ContentsCode": ["Behold"], "Tid": tids("07511")}))
    netfor = {int(y): f.get(Sektor="110", FinansObjekt="46", ContentsCode="Behold", Tid=y) for y in f.cats("Tid")}
    b = Cube(query("09189", {"Makrost": ["bnpb.nr23_9fn"], "ContentsCode": ["Priser"], "Tid": tids("09189", 1985)}))
    bnp = {int(y): b.get(Makrost="bnpb.nr23_9fn", ContentsCode="Priser", Tid=y) for y in b.cats("Tid")}
    s = Cube(query("10486", {"Hovedpost": ["OF_PETROL_FOND", "PETROL_FOND", "UTG.IALT", "INNT.IALT"], "ContentsCode": "*", "Tid": tids("10486")}))
    sr = {int(y): {k: s.get(Hovedpost=k, ContentsCode="Belop", Tid=y) for k in s.cats("Hovedpost")} for y in s.cats("Tid")}

    olje = {
        "source": "SSB tabell 14668, 14722, 07511, 09189, 10486 og 05803",
        "updated": max(filter(None, [n.updated, spu.updated, f.updated, b.updated, s.updated])),
        "years": ny,
        "petro_skatt": [na("A12", y) for y in ny],
        "petro_avgift": [(na("A23", y) or 0) + (na("A5511", y) or 0) for y in ny],
        "equinor": [na("A522", y) for y in ny],
        "sdoe": [na("A531", y) for y in ny],
        "renter": [na("A51", y) for y in ny],
        "utbytte_ellers": [na("A521", y) for y in ny],
        "inntekter": [na("A", y) for y in ny],
        "utgifter": [na("E", y) for y in ny],
        "overskudd": [na("F", y) for y in ny],
        "trygd": [na("B6", y) for y in ny],
        "til_kommuner": [na("B812", y) for y in ny],
        "spu_renter": [spu_get("Renteinntekter", y) if y in spu_years else None for y in ny],
        "spu_utbytte": [spu_get("Utbytte", y) if y in spu_years else None for y in ny],
        "nettofordringer": [netfor.get(y) for y in ny],
        "bnp_fastland": [bnp.get(y) for y in ny],
        "pop": [pop.get(y) for y in ny],
        "statsregnskap": {"years": sorted(sr), "overskudd_for_spu": [sr[y]["OF_PETROL_FOND"] for y in sorted(sr)], "avsetning_spu": [sr[y]["PETROL_FOND"] for y in sorted(sr)]},
    }
    for name, obj in (("utgifter.json", ut), ("oljepenger.json", olje)):
        with open(os.path.join(DATA, name), "w", encoding="utf-8") as fh:
            json.dump(obj, fh, ensure_ascii=False, separators=(",", ":"))
        print("skrev data/" + name, file=sys.stderr)


if __name__ == "__main__":
    main()
