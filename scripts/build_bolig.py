#!/usr/bin/env python3
"""Boligpriser i verden: OECDs analytiske boligprisindikatorer (kvartal, ca. 50 land fra 1970)
og SSBs boligprisindeks for norske regioner.

Kilder:
  OECD  DF_HOUSE_PRICES (Analytical house price indicators): nominelle og reelle boligpriser,
        husleie, pris mot inntekt og pris mot husleie (også som prosent av langtidssnittet)
  SSB   07221 Prisindeks for brukte boliger, etter region og boligtype
Skriver data/bolig.json.
"""
from __future__ import annotations

import csv
import io
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ssblib import Cube, query  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OECD = ("https://sdmx.oecd.org/public/rest/data/OECD.ECO.MPD,DSD_AN_HOUSE_PRICES@DF_HOUSE_PRICES,/all"
        "?startPeriod=1970-Q1&dimensionAtObservation=AllDimensions&format=csvfilewithlabels")
MEASURES = {"HPI": "nom", "RHP": "real", "RPI": "rent", "HPI_YDH": "pti", "HPI_RPI": "ptr", "HPI_YDH_AVG": "pti_avg", "HPI_RPI_AVG": "ptr_avg"}
AGG = {"OECD": "OECD", "EA": "EA"}


def get(url, tries=4):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "norge-asa-visualisering/1.0"})
            with urllib.request.urlopen(req, timeout=300) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if k == tries - 1:
                raise
            print("  feil:", e, "– prøver igjen", file=sys.stderr)
            time.sleep(5 * (k + 1))


def main():
    print("OECD …", file=sys.stderr)
    rows = csv.DictReader(io.StringIO(get(OECD).decode("utf-8-sig")))
    raw, names, quarters = {}, {}, set()
    for r in rows:
        if r["FREQ"] != "Q" or r["MEASURE"] not in MEASURES or not r["OBS_VALUE"]:
            continue
        area = r["REF_AREA"]
        if area == "EA17":
            continue
        names[area] = r["Reference area"]
        q = r["TIME_PERIOD"]
        quarters.add(q)
        raw.setdefault(MEASURES[r["MEASURE"]], {}).setdefault(area, {})[q] = round(float(r["OBS_VALUE"]), 2)
    quarters = sorted(quarters)
    oecd = {m: {a: [ser.get(q) for q in quarters] for a, ser in d.items()} for m, d in raw.items()}
    # Kutt innledende tomme kvartaler globalt
    first = min(min((i for i, v in enumerate(s) if v is not None), default=len(quarters)) for d in oecd.values() for s in d.values())
    quarters = quarters[first:]
    oecd = {m: {a: s[first:] for a, s in d.items()} for m, d in oecd.items()}

    print("SSB 07221 …", file=sys.stderr)
    c = Cube(query("07221", {"Region": "*", "Boligtype": "*", "ContentsCode": ["Boligindeks"], "Tid": "*"}))
    regions = c.cats("Region")
    ssb = {"quarters": [t.replace("K", "-Q") for t in c.cats("Tid")], "regions": {r: c.label["Region"][r] for r in regions},
           "types": {b: c.label["Boligtype"][b] for b in c.cats("Boligtype")}, "values": {}}
    for b in c.cats("Boligtype"):
        for r in regions:
            ssb["values"].setdefault(b, {})[r] = [c.get(Region=r, Boligtype=b, ContentsCode="Boligindeks", Tid=t) for t in c.cats("Tid")]

    out = {
        "source": "OECD Analytical house price indicators og SSB",
        "fetched": time.strftime("%Y-%m-%d"),
        "names": names,
        "quarters": quarters,
        "oecd": oecd,
        "ssb": ssb,
    }
    with open(os.path.join(DATA, "bolig.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"skrev data/bolig.json ({len(names)} land, {quarters[0]}–{quarters[-1]}, SSB {ssb['quarters'][0]}–{ssb['quarters'][-1]})", file=sys.stderr)


if __name__ == "__main__":
    main()
