#!/usr/bin/env python3
"""Næringsstruktur: sysselsatte etter næring per kommune (SSB 13470), etter
arbeidssted og bosted, harmonisert til dagens kommuner (antall summeres).

Skriver data/naering.json. Forutsetter data/skatt-regioner.json.
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ssblib import Cube, Harmonizer, meta, query  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

# Hovednæringer (summerer seg til alle næringer) og utvalgte bransjer
SECTIONS = ["01-03", "05-09", "10-33", "35-39", "41-43", "45-47", "49-53", "55-56", "58-63", "64-66",
            "68-75", "77-82", "84", "85", "86-88", "90-99", "00"]
DETAIL = ["01", "03.1", "03.2", "06", "09.1", "10.2", "24", "30.1", "35.1", "50", "55", "62"]
SHORT = {
    "01-03": "Jordbruk, skogbruk og fiske", "05-09": "Bergverk og utvinning", "10-33": "Industri",
    "35-39": "Kraft, vann og renovasjon", "41-43": "Bygg og anlegg", "45-47": "Varehandel",
    "49-53": "Transport og lagring", "55-56": "Overnatting og servering", "58-63": "Informasjon og kommunikasjon",
    "64-66": "Finans og forsikring", "68-75": "Eiendom og teknisk tjenesteyting", "77-82": "Forretningsmessig tjenesteyting",
    "84": "Offentlig administrasjon og forsvar", "85": "Undervisning", "86-88": "Helse- og sosialtjenester",
    "90-99": "Personlig tjenesteyting", "00": "Uoppgitt",
    "01": "Jordbruk", "03.1": "Fiske og fangst", "03.2": "Akvakultur (havbruk)", "06": "Utvinning av olje og gass",
    "09.1": "Tjenester til olje og gass", "10.2": "Fiskeforedling", "24": "Metallindustri", "30.1": "Skips- og båtbygging",
    "35.1": "Kraftproduksjon og -nett", "50": "Sjøfart", "55": "Overnatting", "62": "IT-tjenester",
}


def main():
    reg = json.load(open(os.path.join(DATA, "skatt-regioner.json"), encoding="utf-8"))
    kommuner = list(reg["kommuner"].keys())
    md = meta("13470")
    tids = [v for v in md["variables"] if v["code"] == "Tid"][0]["values"]
    regions = [v for v in md["variables"] if v["code"] == "Region"][0]["values"]
    codes4 = [r for r in regions if len(r) == 4 and r != "9999"]
    nace = ["00-99"] + SECTIONS + DETAIL
    years = [int(t) for t in tids]

    raw = {}
    for t in tids:
        print("  13470", t, file=sys.stderr)
        c = Cube(query("13470", {"Region": ["0"] + codes4, "NACE2007": nace, "ContentsCode": ["Sysselsatte", "SysselsatteArb"], "Tid": [t]}))
        for r in c.cats("Region"):
            for cc in ("Sysselsatte", "SysselsatteArb"):
                vals = [c.get(Region=r, NACE2007=n, ContentsCode=cc, Tid=t) or 0 for n in nace]
                if vals[0]:
                    raw[(r, int(t), cc)] = vals
        updated = c.updated
    totals = {(r, y): v[0] for (r, y, cc), v in raw.items() if cc == "Sysselsatte"}
    harm = Harmonizer(lambda code, y: totals.get((code, y)))

    out_k = {k: {"bo": [[0.0] * len(nace) for _ in years], "arb": [[0.0] * len(nace) for _ in years]} for k in kommuner}
    for (r, y, cc), vals in raw.items():
        if r == "0":
            continue
        yi = years.index(y)
        key = "bo" if cc == "Sysselsatte" else "arb"
        for t, w in harm(r, y).items():
            if t in out_k:
                row = out_k[t][key][yi]
                for i, v in enumerate(vals):
                    row[i] += v * w
    nat = {key: [raw.get(("0", y, cc), [None] * len(nace)) for y in years] for key, cc in (("bo", "Sysselsatte"), ("arb", "SysselsatteArb"))}
    out = {
        "source": "SSB tabell 13470",
        "updated": updated,
        "years": years,
        "nace": [{"code": n, "name": SHORT.get(n, n), "level": "total" if n == "00-99" else "section" if n in SECTIONS else "detail"} for n in nace],
        "national": nat,
        "kommuner": {k: {"name": reg["kommuner"][k]["name"], "f": k[:2],
                         "bo": [round(row[0]) for row in out_k[k]["bo"]],  # sysselsatte bosatt i kommunen (alle næringer)
                         "arb": [[round(v) for v in row] for row in out_k[k]["arb"]]} for k in kommuner},
        "fylker": {f: v["name"] for f, v in reg["fylker"].items()},
    }
    with open(os.path.join(DATA, "naering.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print("skrev data/naering.json", file=sys.stderr)


if __name__ == "__main__":
    main()
