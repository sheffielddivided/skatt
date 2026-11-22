#!/usr/bin/env python3
"""Vindkraft i Europa: installert kapasitet, produksjon, andeler, land- og havvind, sesongmønster
og norske vindkraftverk.

Kilder:
  Ember        Yearly electricity data (CC BY 4.0): produksjon (TWh), kapasitet (GW) og etterspørsel per
               kraftkilde og land, 1990–i fjor
  Eurostat     nrg_inf_epcrw: kapasitet for landvind (RA310) og havvind (RA320), MW
               nrg_cb_pem: månedlig nettoproduksjon, vind (RA300) og totalt
  Verdensbanken SP.POP.TOTL (folketall) og AG.LND.TOTL.K2 (landareal)
  NVE          Vindkraftverk i drift (api.nve.no)
  SSB          08307 Produksjon og forbruk av elektrisk kraft (vindkraft fra 1990-tallet)
Støtteordningene (data/vind-stotte.json) er satt sammen for hånd fra CEERs «Status Review of Renewable
Support Schemes in Europe for 2022 and 2023» (2025) og offentlige auksjonsresultater.
Skriver data/vind.json.
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
UA = {"User-Agent": "norge-asa-visualisering/1.0"}
EMBER = "https://files.ember-energy.org/public-downloads/generation/outputs/release_generation_yearly_global.csv"
EUROSTAT = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"
WB = "https://api.worldbank.org/v2/country/{}/indicator/{}?format=json&per_page=20000&date=1990:2025"
NVE = "https://api.nve.no/web/WindPowerplant/GetWindPowerPlantsInOperation"
SOURCES = ["Wind", "Solar", "Hydro", "Nuclear", "Gas", "Coal", "Bioenergy", "Other fossil", "Other renewables", "Total generation", "Demand"]
# Eurostat bruker ISO2 (EL = Hellas, UK = Storbritannia)
ISO2 = {
    "AL": "ALB", "AT": "AUT", "BA": "BIH", "BE": "BEL", "BG": "BGR", "CH": "CHE", "CY": "CYP", "CZ": "CZE", "DE": "DEU",
    "DK": "DNK", "EE": "EST", "EL": "GRC", "ES": "ESP", "FI": "FIN", "FR": "FRA", "GE": "GEO", "HR": "HRV", "HU": "HUN",
    "IE": "IRL", "IS": "ISL", "IT": "ITA", "LT": "LTU", "LU": "LUX", "LV": "LVA", "MD": "MDA", "ME": "MNE", "MK": "MKD",
    "MT": "MLT", "NL": "NLD", "NO": "NOR", "PL": "POL", "PT": "PRT", "RO": "ROU", "RS": "SRB", "SE": "SWE", "SI": "SVN",
    "SK": "SVK", "TR": "TUR", "UA": "UKR", "UK": "GBR", "XK": "XKX", "EU27_2020": "EU",
}


def get(url, tries=4, timeout=300):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if k == tries - 1:
                raise
            print("  feil:", e, "– prøver igjen", file=sys.stderr)
            time.sleep(5 * (k + 1))


def eurostat(table, params):
    js = json.loads(get(EUROSTAT + table + "?" + params))
    dims = js["id"]
    sizes = js["size"]
    cats = [sorted(js["dimension"][d]["category"]["index"].items(), key=lambda kv: kv[1]) for d in dims]
    out = []
    for flat, v in js["value"].items():
        i, coord = int(flat), {}
        for d, n, c in zip(reversed(dims), reversed(sizes), reversed(cats)):
            coord[d] = c[i % n][0]
            i //= n
        out.append((coord, v))
    return out


def r3(v):
    return None if v is None else round(v, 3)


def main():
    print("Ember …", file=sys.stderr)
    rows = csv.DictReader(io.StringIO(get(EMBER).decode("utf-8-sig")))
    gen, cap, names, years = {}, {}, {}, set()
    for r in rows:
        if r["Continent"] != "Europe" and r["Area"] not in ("EU", "Europe"):
            continue
        if r["Area"] in ("Russia", "Belarus", "Faroe Islands"):
            continue
        src = r["Electricity source"]
        if src not in SOURCES:
            continue
        c = {"EU": "EU", "Europe": "EUR"}.get(r["Area"], r["ISO 3 code"])
        if not c:
            continue
        names[c] = r["Area"]
        y = int(r["Year"])
        years.add(y)
        if r["Generation (TWh)"]:
            gen.setdefault(src, {}).setdefault(c, {})[y] = float(r["Generation (TWh)"])
        if r["Capacity (GW)"]:
            cap.setdefault(src, {}).setdefault(c, {})[y] = float(r["Capacity (GW)"])
    years = list(range(min(years), max(years) + 1))
    ser = lambda d: [r3(d.get(y)) for y in years]  # noqa: E731
    ember = {
        "gen": {s.lower().replace(" ", "_"): {c: ser(v) for c, v in d.items()} for s, d in gen.items()},
        "cap": {s.lower().replace(" ", "_"): {c: ser(v) for c, v in d.items()} for s, d in cap.items()},
    }

    print("Eurostat land-/havvind …", file=sys.stderr)
    onoff, oyears = {}, set()
    for coord, v in eurostat("nrg_inf_epcrw", "siec=RA310&siec=RA320&unit=MW&plant_tec=CAP_NET_ELC"):
        c = ISO2.get(coord["geo"])
        if c:
            onoff.setdefault(coord["siec"], {}).setdefault(c, {})[int(coord["time"])] = v
            oyears.add(int(coord["time"]))
    oyears = list(range(min(oyears), max(oyears) + 1))
    onoff = {{"RA310": "on", "RA320": "off"}[k]: {c: [r3(s.get(y)) for y in oyears] for c, s in d.items()} for k, d in onoff.items()}

    print("Eurostat månedstall …", file=sys.stderr)
    mon, months = {}, set()
    for coord, v in eurostat("nrg_cb_pem", "siec=RA300&siec=TOTAL&unit=GWH&sinceTimePeriod=2016-01"):
        c = ISO2.get(coord["geo"])
        if c:
            mon.setdefault(coord["siec"], {}).setdefault(c, {})[coord["time"]] = v
            months.add(coord["time"])
    months = sorted(months)
    monthly = {"months": months, "wind": {}, "total": {}}
    for k, key in (("RA300", "wind"), ("TOTAL", "total")):
        for c, s in mon.get(k, {}).items():
            monthly[key][c] = [r3(s.get(m)) for m in months]

    print("Verdensbanken folketall og areal …", file=sys.stderr)
    iso = ";".join(c for c in names if len(c) == 3 and c != "EUR")
    wb = {}
    for k, ind in (("pop", "SP.POP.TOTL"), ("area", "AG.LND.TOTL.K2")):
        js = json.loads(get(WB.format(iso, ind)))
        if len(js) < 2:
            raise RuntimeError(f"Verdensbanken: {js}")
        for o in js[1] or []:
            if o["value"] is not None:
                wb.setdefault(k, {}).setdefault(o["countryiso3code"], {})[int(o["date"])] = o["value"]
    pop = {c: [wb["pop"].get(c, {}).get(y) for y in years] for c in wb.get("pop", {})}
    for c in pop:  # fyll siste år med forrige verdi
        for i in range(1, len(years)):
            if pop[c][i] is None:
                pop[c][i] = pop[c][i - 1]
    area = {c: max(s.items())[1] for c, s in wb.get("area", {}).items()}

    print("NVE vindkraftverk …", file=sys.stderr)
    reg = json.load(open(os.path.join(DATA, "skatt-regioner.json"), encoding="utf-8"))
    fylkenavn = {f: v["name"].lower() for f, v in reg["fylker"].items()}
    byname = {}
    for code, k in reg["kommuner"].items():
        for part in k["name"].replace("–", "-").split(" - "):
            byname.setdefault(part.strip().lower(), []).append(code)

    def knr(kommune, fylke):
        """Kommunenummer for (første) vertskommune. Navn som «Våler (Innlandet)» avgjøres av fylket."""
        n = (kommune or "").split(",")[0].replace("–", "-").split(" - ")[0].split("(")[0].strip().lower()
        cands = byname.get(n, [])
        if len(cands) > 1:
            cands = [c for c in cands if fylkenavn.get(c[:2], "").startswith((fylke or "").lower()[:5])] or cands
        return cands[0] if cands else None
    plants = []
    for p in json.loads(get(NVE)):
        tur = p.get("Turbiner") or []
        first = min((t["DatoIdriftsatt"] for t in tur if t.get("DatoIdriftsatt")), default=p.get("IdriftsettelseForsteByggetrinn"))
        plants.append({
            "navn": p["Navn"], "mw": p["InstallertEffekt_MW"], "gwh": p["NormalAArsproduksjon_GWh"],
            "fylke": p["Fylke"], "kommune": p["Kommune"], "knr": knr(p["Kommune"], p["Fylke"]),
            "eier": p["HovedEierNavn"], "omr": p["ElspotomraadeNummer"], "start": (first or "")[:10],
            "turbiner": p.get("AntallOperativeTurbiner"), "kw": p.get("GjsnittGeneratorytelse"),
            "nav": p.get("GjsnittNavhoeyde"), "rotor": p.get("GjsnittRotordiameter"),
            "prod": sorted({t["TurbinProdusent"] for t in tur if t.get("TurbinProdusent")}),
        })
    plants.sort(key=lambda p: -(p["mw"] or 0))
    missing = [p["kommune"] for p in plants if not p["knr"]]
    if missing:
        print("  fant ikke kommunenummer for:", missing, file=sys.stderr)

    print("SSB 08307 …", file=sys.stderr)
    c = Cube(query("08307", {"ContentsCode": ["ProdTotal", "VindKraft"], "Tid": "*"}))
    ssb = {"years": [int(t) for t in c.cats("Tid")],
           "total": [c.get(ContentsCode="ProdTotal", Tid=t) for t in c.cats("Tid")],
           "wind": [c.get(ContentsCode="VindKraft", Tid=t) for t in c.cats("Tid")]}

    out = {
        "source": "Ember, Eurostat, Verdensbanken, NVE og SSB",
        "fetched": time.strftime("%Y-%m-%d"),
        "years": years,
        "names": names,
        "ember": ember,
        "pop": pop,
        "area": area,
        "onoff": {"years": oyears, **onoff},
        "monthly": monthly,
        "nve": plants,
        "ssb": ssb,
    }
    with open(os.path.join(DATA, "vind.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"skrev data/vind.json ({len(names)} land, {years[0]}–{years[-1]}, land/hav {oyears[0]}–{oyears[-1]}, "
          f"måned {months[0]}–{months[-1]}, {len(plants)} norske vindkraftverk)", file=sys.stderr)


if __name__ == "__main__":
    main()
