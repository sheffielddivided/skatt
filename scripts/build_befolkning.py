#!/usr/bin/env python3
"""Befolkningsutvikling: fødsler, dødsfall, inn- og utvandring (etter land) og
kommunevis dekomponering av befolkningsveksten.

Kilder:
  * SSB 05803  Endringer i befolkningen, hele landet (1735–)
  * SSB 05476  Inn- og utvandring etter statsborgerskap (2003–)
  * SSB 07822  Inn- og utvandring etter fra-/tilflyttingsland (1967–)
  * SSB 06913  Befolkning og endringer per kommune (fødte, døde, nettoinnflytting)
  * SSB 13256  Inn- og utvandringer per kommune (2010–)
Skriver data/befolkning.json. Forutsetter data/skatt-regioner.json (kommuneliste).
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ssblib import Cube, Harmonizer, meta, query  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
FIRST_NATIONAL = 1900
FIRST_KOMMUNE = 2010


def region_of(code: str) -> str:
    """Grupperer SSBs tresifrede landkoder i verdensdeler."""
    if code == "000":
        return "norge"
    if code in ("101", "102", "103", "104", "105", "106"):
        return "norden"
    c = code[0]
    return {"1": "europa", "2": "afrika", "3": "afrika", "4": "asia", "5": "asia", "6": "amerika", "7": "amerika"}.get(c, "ovrige")


def tids(table):
    return [v for v in meta(table)["variables"] if v["code"] == "Tid"][0]["values"]


def countries(table, dim):
    c = Cube(query(table, {dim: "*", "ContentsCode": ["Innvandring", "Utvandring"], "Tid": "*"}))
    years = [int(t) for t in c.cats("Tid")]
    out = {}
    for code in c.cats(dim):
        inn = [c.get(**{dim: code, "ContentsCode": "Innvandring", "Tid": str(y)}) or 0 for y in years]
        ut = [c.get(**{dim: code, "ContentsCode": "Utvandring", "Tid": str(y)}) or 0 for y in years]
        if sum(inn) + sum(ut) == 0:
            continue
        out[code] = {"name": c.label[dim][code], "r": region_of(code), "inn": inn, "ut": ut}
    return {"years": years, "countries": out}


def main():
    reg = json.load(open(os.path.join(DATA, "skatt-regioner.json"), encoding="utf-8"))
    kommuner = list(reg["kommuner"].keys())

    # ---------------- hele landet ----------------
    t = [x for x in tids("05803") if int(x) >= FIRST_NATIONAL]
    c = Cube(query("05803", {"ContentsCode": ["Personer", "Levendefodte", "Dode", "Innflyttinger", "Utflyttinger"], "Tid": t}))
    g = lambda k, y: c.get(ContentsCode=k, Tid=y)  # noqa: E731
    national = {
        "years": [int(y) for y in t],
        "pop": [g("Personer", y) for y in t],
        "born": [g("Levendefodte", y) for y in t],
        "dead": [g("Dode", y) for y in t],
        "inn": [g("Innflyttinger", y) for y in t],
        "ut": [g("Utflyttinger", y) for y in t],
    }
    print("05803:", t[0], "–", t[-1], file=sys.stderr)

    # ---------------- etter land ----------------
    by_citizenship = countries("05476", "Statsbrgskap")
    by_country = countries("07822", "Land")
    print("05476:", len(by_citizenship["countries"]), "land · 07822:", len(by_country["countries"]), "land", file=sys.stderr)

    # ---------------- kommunene ----------------
    ty = [y for y in tids("06913") if int(y) >= FIRST_KOMMUNE]
    tm = [y for y in tids("13256") if int(y) >= FIRST_KOMMUNE]
    years = sorted(set(int(y) for y in ty) & set(int(y) for y in tm))
    k1 = Cube(query("06913", {"Region": "*", "ContentsCode": ["Folkemengde", "Levende", "Dode", "Nettoinnflytting"], "Tid": [str(y) for y in years]}))
    k2 = Cube(query("13256", {"Region": "*", "Alder": ["999A"], "ContentsCode": ["Innvandring", "Utvandring"], "Tid": [str(y) for y in years]}))

    def v1(r, k, y):
        return k1.get(Region=r, ContentsCode=k, Tid=str(y)) if r in k1.index["Region"] else None

    def v2(r, k, y):
        return k2.get(Region=r, Alder="999A", ContentsCode=k, Tid=str(y)) if r in k2.index["Region"] else None

    harm = Harmonizer(lambda code, y: v1(code, "Folkemengde", y))
    keys = ["pop", "born", "dead", "netmig", "inn", "ut"]
    K = {k: {key: [0.0] * len(years) for key in keys} for k in kommuner}
    codes = sorted(set(r for r in k1.cats("Region") if len(r) == 4) | set(r for r in k2.cats("Region") if len(r) == 4))
    for yi, y in enumerate(years):
        for r in codes:
            vals = {
                "pop": v1(r, "Folkemengde", y), "born": v1(r, "Levende", y), "dead": v1(r, "Dode", y),
                "netmig": v1(r, "Nettoinnflytting", y), "inn": v2(r, "Innvandring", y), "ut": v2(r, "Utvandring", y),
            }
            if all(v in (None, 0) for v in vals.values()):
                continue
            for tcode, w in harm(r, y).items():
                if tcode not in K:
                    continue
                for key, v in vals.items():
                    if v is not None:
                        K[tcode][key][yi] += v * w
    kom_out = {}
    for k in kommuner:
        a = K[k]
        ni = [a["inn"][i] - a["ut"][i] for i in range(len(years))]
        kom_out[k] = {
            "name": reg["kommuner"][k]["name"], "f": k[:2],
            "pop": [round(x) for x in a["pop"]],
            "fo": [round(a["born"][i] - a["dead"][i]) for i in range(len(years))],   # fødselsoverskudd
            "ni": [round(x) for x in ni],                                              # nettoinnvandring
            "nf": [round(a["netmig"][i] - ni[i]) for i in range(len(years))],          # netto innenlandsk flytting
            "born": [round(x) for x in a["born"]], "dead": [round(x) for x in a["dead"]],
            "inn": [round(x) for x in a["inn"]], "ut": [round(x) for x in a["ut"]],
        }
    out = {
        "source": "SSB tabell 05803, 05476, 07822, 06913 og 13256",
        "updated": max(filter(None, [c.updated, k1.updated, k2.updated])),
        "national": national,
        "citizenship": by_citizenship,
        "country": by_country,
        "kyears": years,
        "kommuner": kom_out,
        "fylker": {f: v["name"] for f, v in reg["fylker"].items()},
    }
    with open(os.path.join(DATA, "befolkning.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print("skrev data/befolkning.json", file=sys.stderr)


if __name__ == "__main__":
    main()
