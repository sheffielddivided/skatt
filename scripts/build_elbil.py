#!/usr/bin/env python3
"""Elbiler i verden: andel av nybilsalg og bilpark per land, Europa etter drivstoff,
og Norge måned for måned.

Kilder:
  IEA Global EV Outlook (via Our World in Data, CC BY 4.0): andel elbiler (BEV + PHEV)
      av nye biler og av bilparken, antall solgt og antall i bruk
  Eurostat road_eqr_carpda / road_eqs_carpda: nye biler og bilpark etter drivstoff (Europa)
  SSB 14020: førstegangsregistrerte kjøretøy etter drivstofftype, måned
Skriver data/elbil.json.
"""
from __future__ import annotations

import csv
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ssblib import Cube, query  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OWID = "https://ourworldindata.org/grapher/{}.csv?v=1&csvType=full&useColumnShortNames=true"
EUROSTAT = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"
UA = {"User-Agent": "norge-asa-visualisering/1.0"}

AGG = {"World": "WLD", "European Union (27)": "EU27", "Europe": "EUR", "Rest of World": None}
# Eurostat bruker ISO2 (med EL for Hellas og UK for Storbritannia)
ISO2_3 = {
    "AT": "AUT", "BE": "BEL", "BG": "BGR", "CY": "CYP", "CZ": "CZE", "DE": "DEU", "DK": "DNK", "EE": "EST", "EL": "GRC",
    "ES": "ESP", "FI": "FIN", "FR": "FRA", "HR": "HRV", "HU": "HUN", "IE": "IRL", "IT": "ITA", "LT": "LTU", "LU": "LUX",
    "LV": "LVA", "MT": "MLT", "NL": "NLD", "PL": "POL", "PT": "PRT", "RO": "ROU", "SE": "SWE", "SI": "SVN", "SK": "SVK",
    "NO": "NOR", "IS": "ISL", "CH": "CHE", "LI": "LIE", "UK": "GBR", "TR": "TUR", "ME": "MNE", "MK": "MKD", "AL": "ALB",
    "RS": "SRB", "BA": "BIH", "XK": "XKX", "MD": "MDA", "UA": "UKR", "GE": "GEO", "EU27_2020": "EU27",
}
FUELS = {  # Eurostat mot_nrg → våre grupper
    "bev": ["ELC"], "phev": ["ELC_PET_PI", "ELC_DIE_PI"], "hev": ["ELC_PET_HYB", "ELC_DIE_HYB"],
    "bensin": ["PET_X_HYB"], "diesel": ["DIE_X_HYB"], "total": ["TOTAL"],
}


def get(url, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if k == tries - 1:
                raise
            print("  feil:", e, "– prøver igjen", file=sys.stderr)
            time.sleep(4 * (k + 1))


def owid(slug, col):
    out, names = {}, {}
    for r in csv.DictReader(io.StringIO(get(OWID.format(slug)).decode("utf-8"))):
        code = AGG.get(r["entity"], r["code"]) if r["entity"] in AGG else r["code"]
        if not code or code.startswith("OWID"):
            continue
        try:
            v = float(r[col])
        except (ValueError, KeyError):
            continue
        out.setdefault(code, {})[r["year"]] = v
        names[code] = r["entity"]
    return out, names


def eurostat(ds, extra):
    q = [("format", "JSON"), ("lang", "EN"), ("unit", "NR"), ("sinceTimePeriod", "2013")]
    q += [("mot_nrg", c) for cs in FUELS.values() for c in cs] + list(extra.items())
    d = json.loads(get(EUROSTAT + ds + "?" + urllib.parse.urlencode(q)))
    ids, size = d["id"], d["size"]
    inv = {i: {v: k for k, v in d["dimension"][i]["category"]["index"].items()} for i in ids}
    raw = {}
    for pos, v in d["value"].items():
        pos = int(pos)
        c = {}
        for i, s in reversed(list(zip(ids, size))):
            c[i] = inv[i][pos % s]
            pos //= s
        raw[(c["geo"], c["mot_nrg"], c["time"])] = v
    years = sorted({k[2] for k in raw})
    out = {}
    for geo in {k[0] for k in raw}:
        g3 = ISO2_3.get(geo)
        if not g3:
            continue
        rec = {}
        for grp, codes in FUELS.items():
            ser = []
            for y in years:
                vals = [raw.get((geo, c, y)) for c in codes]
                ser.append(None if all(x is None for x in vals) else sum(x or 0 for x in vals))
            rec[grp] = ser
        if any(rec["total"]):
            out[g3] = rec
    return years, out


def main():
    print("IEA via Our World in Data …", file=sys.stderr)
    sales_share, names = owid("electric-car-sales-share", "ev_sales_share")
    stock_share, n2 = owid("share-car-stocks-electric", "ev_stock_share")
    sales, n3 = owid("electric-car-sales", "ev_sales")
    stock, n4 = owid("electric-car-stocks", "ev_stock")
    for n in (n2, n3, n4):
        names.update(n)
    years = sorted({y for s in (sales_share, stock_share) for c in s.values() for y in c})
    iea = {}
    for key, src in (("sales_share", sales_share), ("stock_share", stock_share), ("sales", sales), ("stock", stock)):
        iea[key] = {c: [ser.get(y) for y in years] for c, ser in src.items()}

    print("Eurostat …", file=sys.stderr)
    eyears, new = eurostat("road_eqr_carpda", {})
    syears, fleet = eurostat("road_eqs_carpda", {"leg_form": "TOTAL"})

    print("SSB 14020 …", file=sys.stderr)
    c = Cube(query("14020", {"TypeRegistrering": ["N", "B"], "DrivstoffType": "*", "ContentsCode": ["Personbiler", "VareCampBiler"], "Tid": "*"}))
    months = c.cats("Tid")
    no = {}
    for reg in ("N", "B"):
        for cont in ("Personbiler", "VareCampBiler"):
            if reg == "B" and cont == "VareCampBiler":
                continue
            k = ("ny" if reg == "N" else "brukt") + ("" if cont == "Personbiler" else "_vare")
            no[k] = {f: [c.get(TypeRegistrering=reg, DrivstoffType=code, ContentsCode=cont, Tid=m) for m in months]
                     for f, code in (("el", "19"), ("fossil", "20"), ("hybrid", "21"), ("annet", "6"))}

    out = {
        "source": "IEA Global EV Outlook (via Our World in Data), Eurostat og SSB",
        "fetched": time.strftime("%Y-%m-%d"),
        "names": names,
        "years": years,
        "iea": iea,
        "eurostat": {"new_years": eyears, "new": new, "fleet_years": syears, "fleet": fleet},
        "norge": {"months": months, **no},
    }
    with open(os.path.join(DATA, "elbil.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"skrev data/elbil.json ({len(iea['sales_share'])} land i IEA {years[0]}–{years[-1]}, {len(new)} i Eurostat {eyears[0]}–{eyears[-1]}, SSB {months[0]}–{months[-1]})", file=sys.stderr)


if __name__ == "__main__":
    main()
