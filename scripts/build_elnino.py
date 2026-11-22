#!/usr/bin/env python3
"""El Niño: havtemperaturen i Stillehavet og hva den betyr for været i verden og i Europa.

Kilder (alle åpne, uten nøkkel):
  NOAA CPC   Oceanic Niño Index (ONI), tremåneders glidende snitt av Niño 3.4-avviket
  NOAA CPC   Månedlige havtemperaturer i Niño-regionene (ERSST v5, avvik mot 1991–2020)
  NOAA CPC   Den nordatlantiske oscillasjonen (NAO), månedlig indeks
  NASA GISS  GISTEMP v4, global middeltemperatur (avvik mot 1951–1980)
  NOAA NCEI  Climate at a Glance, temperatur over land i Europa (avvik mot 1901–2000)
  Copernicus ERA5 via Our World in Data: månedlig temperaturavvik og årsnedbør per land
Skriver data/elnino.json.
"""
from __future__ import annotations

import csv
import io
import json
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
START = 1950
UA = {"User-Agent": "norge-asa-visualisering/1.0"}

URL = {
    "oni": "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt",
    "nino": "https://www.cpc.ncep.noaa.gov/data/indices/ersst5.nino.mth.91-20.ascii",
    "oisst": "https://www.cpc.ncep.noaa.gov/data/indices/sstoi.indices",
    "week": "https://www.cpc.ncep.noaa.gov/data/indices/wksst9120.for",
    "nao": "https://www.cpc.ncep.noaa.gov/products/precip/CWlink/pna/norm.nao.monthly.b5001.current.ascii",
    "gis": "https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv",
    "eur": "https://www.ncei.noaa.gov/access/monitoring/climate-at-a-glance/global/time-series/europe/land/1/0/{a}-{b}/data.csv",
    "tmp": "https://ourworldindata.org/grapher/monthly-temperature-anomalies.csv?v=1&csvType=full&useColumnShortNames=true",
    "pre": "https://ourworldindata.org/grapher/average-precipitation-per-year.csv?v=1&csvType=full&useColumnShortNames=true",
}
SEAS = ["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"]


def get(url, tries=4):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=300) as r:
                return r.read().decode("utf-8-sig")
        except Exception as e:  # noqa: BLE001
            if k == tries - 1:
                raise
            print("  feil:", e, "– prøver igjen", file=sys.stderr)
            time.sleep(5 * (k + 1))


def put(arr, y, m, v):
    """Legg verdi for år y, måned m (1–12) inn i en månedsliste som starter i januar START."""
    i = (y - START) * 12 + (m - 1)
    if i < 0:
        return
    while len(arr) <= i:
        arr.append(None)
    arr[i] = None if v is None else round(v, 3)


def trim(arr):
    while arr and arr[-1] is None:
        arr.pop()
    return arr


def main():
    out = {"source": "NOAA CPC, NASA GISS, NOAA NCEI, Copernicus ERA5 (via Our World in Data)",
           "fetched": time.strftime("%Y-%m-%d"), "start": START}

    print("ONI …", file=sys.stderr)
    oni = []
    for line in get(URL["oni"]).splitlines()[1:]:
        p = line.split()
        if len(p) == 4 and p[0] in SEAS:
            put(oni, int(p[1]), SEAS.index(p[0]) + 1, float(p[3]))  # sesongen er sentrert på måned nr. index+1
    out["oni"] = trim(oni)

    print("Niño-regioner …", file=sys.stderr)
    n12, n3, n34, n4 = [], [], [], []
    for line in get(URL["nino"]).splitlines()[1:]:
        p = line.split()
        if len(p) == 10:
            y, m = int(p[0]), int(p[1])
            put(n12, y, m, float(p[3])); put(n3, y, m, float(p[5])); put(n34, y, m, float(p[9])); put(n4, y, m, float(p[7]))
    trim(n12); trim(n3); trim(n34); trim(n4)
    # ERSST kommer ofte noen måneder etter. Fyll på med OISST (samme normalperiode 1991–2020) for de siste månedene.
    ersst_end = len(n34)
    for line in get(URL["oisst"]).splitlines()[1:]:
        p = line.split()
        if len(p) == 10:
            y, m = int(p[0]), int(p[1])
            if (y - START) * 12 + m - 1 >= ersst_end:
                put(n12, y, m, float(p[3])); put(n3, y, m, float(p[5])); put(n34, y, m, float(p[9])); put(n4, y, m, float(p[7]))
    out["nino12"], out["nino3"], out["nino34"], out["nino4"] = trim(n12), trim(n3), trim(n34), trim(n4)
    out["ersst_end"] = ersst_end  # indeks for første måned fra OISST
    week = []
    for line in get(URL["week"]).splitlines():
        # fast bredde: negative avvik står klistret inntil temperaturen («20.6-0.1»)
        p = line.split(None, 1)
        if len(p) == 2 and p[0][:2].isdigit():
            v = re.findall(r"-?\d+\.\d", p[1])
            if len(v) == 8:
                t = time.strptime(p[0].title(), "%d%b%Y")
                week.append([time.strftime("%Y-%m-%d", t), float(v[1]), float(v[5])])  # dato, Niño 1+2, Niño 3.4
    out["week"] = week[-104:]

    print("NAO …", file=sys.stderr)
    nao = []
    for line in get(URL["nao"]).splitlines():
        p = line.split()
        if len(p) == 3:
            try:
                put(nao, int(p[0]), int(p[1]), float(p[2]))
            except ValueError:
                pass
    out["nao"] = trim(nao)

    print("GISTEMP …", file=sys.stderr)
    gis = []
    for r in csv.reader(io.StringIO(get(URL["gis"]))):
        if r and r[0].isdigit() and int(r[0]) >= START:
            for m in range(1, 13):
                v = r[m].strip()
                if v and "*" not in v:
                    put(gis, int(r[0]), m, float(v))
    out["glob"] = trim(gis)

    print("Europa (NCEI) …", file=sys.stderr)
    eur = []
    for line in get(URL["eur"].format(a=START, b=time.gmtime().tm_year)).splitlines():
        p = line.split(",")
        if len(p) == 2 and p[0].isdigit() and len(p[0]) == 6:
            put(eur, int(p[0][:4]), int(p[0][4:]), float(p[1]))
    out["eur"] = trim(eur)

    print("ERA5 per land (OWID) …", file=sys.stderr)
    mon, names = {}, {}
    for r in csv.DictReader(io.StringIO(get(URL["tmp"]))):
        c = r["code"]
        if not (len(c) == 3 or c == "OWID_WRL") or not r["temperature_anomaly"]:
            continue
        y, m = int(r["month"][:4]), int(r["month"][5:7])
        if y < START - 1:
            continue
        names[c] = r["entity"]
        mon.setdefault(c, {})[(y, m)] = float(r["temperature_anomaly"])
    last_year = max(y for d in mon.values() for (y, _m) in d)
    years = list(range(START, last_year + 1))
    groups = {"DJF": [(-1, 12), (0, 1), (0, 2)], "MAM": [(0, 3), (0, 4), (0, 5)], "JJA": [(0, 6), (0, 7), (0, 8)], "SON": [(0, 9), (0, 10), (0, 11)]}
    countries = {}
    for c, d in mon.items():
        s = {}
        for g, ms in groups.items():
            row = []
            for y in years:
                v = [d.get((y + dy, m)) for dy, m in ms]
                row.append(round(sum(v) / 3, 2) if all(x is not None for x in v) else None)
            s[g] = trim(row)
        countries[c] = {"n": names[c], "t": s}
        # månedlige verdier for Norge, til «hva nå?»-delen
        if c == "NOR":
            nm = []
            for (y, m), v in d.items():
                if y >= START:
                    put(nm, y, m, v)
            out["nor_month"] = trim(nm)

    pre = {}
    for r in csv.DictReader(io.StringIO(get(URL["pre"]))):
        c = r["code"]
        if c in countries and r["total_precipitation"] and int(r["year"]) >= START:
            pre.setdefault(c, {})[int(r["year"])] = float(r["total_precipitation"])
    for c, d in pre.items():
        countries[c]["p"] = trim([round(d[y]) if y in d else None for y in years])

    out["years"] = years
    out["countries"] = countries
    with open(os.path.join(DATA, "elnino.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    n = len(out["oni"])
    print(f"skrev data/elnino.json (ONI {START}–{START + (n - 1) // 12}, {len(countries)} land, ERA5 til {last_year})", file=sys.stderr)


if __name__ == "__main__":
    main()
