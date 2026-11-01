#!/usr/bin/env python3
"""Eiendomsskatt (SSB 14674 per kommune og 14155 for landet).

Beløp harmoniseres til dagens kommuner (summeres). Satser, ordninger og
fritak hentes for siste år, der kodene er dagens. Skriver data/eiendomsskatt.json.
Forutsetter data/skatt-regioner.json og data/alder/index.json.
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ssblib import Cube, Harmonizer, meta, query  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

AMOUNTS = {  # kode -> nøkkel (1000 kr)
    "KOSEiendomsskatt0000": "tot",
    "KOSeiendomsskatt0007": "boligfritid",
    "KOSEiendomsskatt0002": "annen",
    "KOSeiendomsskatt0008": "bolig",
    "KOSeiendomsskatt0009": "fritid",
    "KOSeiendomsskatt0006": "vann",
    "KOSeiendomsskatt0004": "vind",
    "KOSeiendomsskatt0003": "petro",
    "KOSeiendomsskatt0005": "naering",
}
POLICY = {
    "KOShareskatt0000": "har",
    "KOShelekommunen0000": "t_hele",
    "KOShelekommunenu0000": "t_heleun",
    "KOSbyallnaering0000": "t_byalle",
    "KOSbyverkogbruk0000": "t_byverk",
    "KOSbareby0000": "t_by",
    "KOSbareallnaerin0000": "t_naering",
    "KOSbareverkogbru0000": "t_verk",
    "KOSgenskatt0000": "sats",
    "KOSdiffskatt0000": "satsbolig",
    "KOSharbunnfradra0000": "harbunn",
    "KOSbunnfradrag0000": "bunn",
    "KOSfritak0000": "fritaknye",
    "KOSfritakfribo0000": "fritakfritid",
    "KOSskattformue0000": "formuesgrunnlag",
    "KOSgjsnittskattb0000": "snittbolig",
    "KOSskattenebolig0000": "enebolig",
    "KOSaarikraft0000": "takstaar",
}
NATIONAL = {
    "Variabel1": "kommuner", "Variabel4": "t_hele", "Variabel4unaer": "t_heleun", "Variabel3neb": "t_byalle", "Variabel3": "t_byverk",
    "Variabel3by": "t_by", "Variabel3ne": "t_naering", "Variabel2": "t_verk",
    "Variabel5": "sats", "Variabel5bo": "satsbolig", "Variabel9": "enebolig", "Variabel9gjsnbo": "snittbolig",
    "Variabel10": "tot", "Variabelny": "boligfritid", "Variabel11": "annen", "VariabelnyBolig": "bolig", "VariabelnyFritidsbol": "fritid", "Variabel11vann": "vann",
    "Variabel11vind": "vind", "Variabel11petrol": "petro", "Variabel11nearingmm": "naering", "Variabel14": "andel_drift",
}


def num(v):
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def main():
    reg = json.load(open(os.path.join(DATA, "skatt-regioner.json"), encoding="utf-8"))
    alder = json.load(open(os.path.join(DATA, "alder", "index.json"), encoding="utf-8"))
    kommuner = list(reg["kommuner"].keys())

    # ---------------- landet ----------------
    n = Cube(query("14155", {"ContentsCode": list(NATIONAL), "Tid": "*"}))
    ny = n.cats("Tid")
    national = {"years": [int(y) for y in ny]}
    for code, key in NATIONAL.items():
        national[key] = [num(n.get(ContentsCode=code, Tid=y)) for y in ny]

    # ---------------- kommuner ----------------
    md = meta("14674")
    rdim = [v for v in md["variables"] if v["code"] == "KOKkommuneregion0000"][0]
    codes4 = [c for c in rdim["values"] if len(c) == 4 and c.isdigit()]
    tids = [v for v in md["variables"] if v["code"] == "Tid"][0]["values"]
    c = Cube(query("14674", {"KOKkommuneregion0000": codes4, "ContentsCode": list(AMOUNTS) + list(POLICY), "Tid": tids}))
    years = [int(y) for y in tids]
    g = lambda r, k, y: num(c.get(KOKkommuneregion0000=r, ContentsCode=k, Tid=str(y)))  # noqa: E731

    apop = dict(zip(alder["years"], range(len(alder["years"]))))

    def pop_raw(code, y):
        k = alder["kommuner"].get(code)
        return k["ind"]["pop"][apop[y]] if k and y in apop else None
    harm = Harmonizer(pop_raw)

    amt = {k: {key: [0.0] * len(years) for key in AMOUNTS.values()} for k in kommuner}
    has = {k: [False] * len(years) for k in kommuner}
    for yi, y in enumerate(years):
        for r in c.cats("KOKkommuneregion0000"):
            vals = {key: g(r, code, y) for code, key in AMOUNTS.items()}
            if all(v is None for v in vals.values()):
                continue
            for t, w in harm(r, y).items():
                if t not in amt:
                    continue
                has[t][yi] = True
                for key, v in vals.items():
                    if v is not None:
                        amt[t][key][yi] += v * w
    # siste år med beløp
    amount_years = [y for yi, y in enumerate(years) if sum(amt[k]["tot"][yi] for k in kommuner) > 0]
    policy_year = years[-1]

    kom_out = {}
    for k in kommuner:
        # siste år med verdi for hver ordning (noen variabler publiseres senere enn andre)
        pol, pol_year = {}, {}
        if k in c.index["KOKkommuneregion0000"]:
            for code, key in POLICY.items():
                for y in reversed(years[-3:]):
                    v = g(k, code, y)
                    if v is not None:
                        pol[key], pol_year[key] = v, y
                        break
        kom_out[k] = {
            "name": reg["kommuner"][k]["name"], "f": k[:2],
            "pop": [alder["kommuner"][k]["ind"]["pop"][apop[y]] if y in apop else None for y in years],
            "a": {key: [round(v) if has[k][i] else None for i, v in enumerate(arr)] for key, arr in amt[k].items()},
            "p": pol, "py": pol_year,
        }
    out = {
        "source": "SSB tabell 14674 og 14155",
        "updated": max(filter(None, [c.updated, n.updated])),
        "years": years, "amountYears": amount_years, "policyYear": policy_year,
        "national": national,
        "kommuner": kom_out,
        "fylker": {f: v["name"] for f, v in reg["fylker"].items()},
    }
    with open(os.path.join(DATA, "eiendomsskatt.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"skrev data/eiendomsskatt.json (beløp {amount_years[0]}–{amount_years[-1]}, ordninger {policy_year})", file=sys.stderr)


if __name__ == "__main__":
    main()
