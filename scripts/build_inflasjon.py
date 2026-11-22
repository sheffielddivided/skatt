#!/usr/bin/env python3
"""Inflasjon i verden: prisvekst i nesten alle land fra 1960, sammenholdt med rente, pengemengde,
statsfinanser, valutakurs, økonomisk vekst, arbeidsledighet og oljepris.

Kilder:
  Verdensbanken (WDI)  FP.CPI.TOTL.ZG  inflasjon, konsumpriser (% årlig)
                       FM.LBL.BMNY.ZG  vekst i bred pengemengde (M2/M3, %)
                       FR.INR.LEND     utlånsrente i bankene (%)
                       FR.INR.RINR     realrente (utlånsrente justert for BNP-deflator, %)
                       PA.NUS.FCRF     offisiell valutakurs (lokal valuta per USD, årssnitt)
                       NY.GDP.MKTP.KD.ZG  BNP-vekst (%)
                       NE.TRD.GNFS.ZS  handel (eksport + import) i % av BNP
                       GC.NLD.TOTL.GD.ZS  statens (sentralforvaltningens) netto finansieringsoverskudd, % av BNP
                       GC.DOD.TOTL.GD.ZS  statsgjeld (sentralforvaltningen), % av BNP
                       SL.UEM.TOTL.ZS  arbeidsledighet (ILO-anslag, % av arbeidsstyrken)
                       BN.CAB.XOKA.GD.ZS  driftsbalansen overfor utlandet, % av BNP
  BIS                  WS_CBPOL        sentralbankenes styringsrenter (måned)
                       WS_LONG_CPI     konsumprisvekst siste 12 måneder (måned)
  FRED                 WTISPLC         oljepris (WTI, USD per fat, måned); reserve: IMF PCPS (via DBnomics)
Skriver data/inflasjon.json.
"""
from __future__ import annotations

import csv
import io
import json
import math
import os
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
UA = {"User-Agent": "norge-asa-visualisering/1.0"}
FIRST = 1960
LAST = int(time.strftime("%Y")) - 1          # siste hele år
MFIRST = 1950                                # månedstall fra BIS

WB = "https://api.worldbank.org/v2/country/all/indicator/{}?format=json&per_page=20000&date={}:{}"
BIS = "https://stats.bis.org/api/v2/data/dataflow/BIS/{}/1.0/{}?format=csv"
FRED = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={}"
DBN = "https://api.db.nomics.world/v22/series/IMF/PCPS/A.W00.POILAPSP.USD?observations=1"

WB_VARS = {
    "infl": "FP.CPI.TOTL.ZG",
    "money": "FM.LBL.BMNY.ZG",
    "lend": "FR.INR.LEND",
    "real": "FR.INR.RINR",
    "fxlvl": "PA.NUS.FCRF",
    "gdp": "NY.GDP.MKTP.KD.ZG",
    "trade": "NE.TRD.GNFS.ZS",
    "fiscal": "GC.NLD.TOTL.GD.ZS",
    "debt": "GC.DOD.TOTL.GD.ZS",
    "unemp": "SL.UEM.TOTL.ZS",
    "ca": "BN.CAB.XOKA.GD.ZS",
}
# Euroland: ECBs rente gjelder fra landet tok i bruk euro (BIS har nasjonale styringsrenter fram til da)
EURO = {"AUT": 1999, "BEL": 1999, "DEU": 1999, "ESP": 1999, "FIN": 1999, "FRA": 1999, "IRL": 1999, "ITA": 1999,
        "LUX": 1999, "NLD": 1999, "PRT": 1999, "GRC": 2001, "SVN": 2007, "CYP": 2008, "MLT": 2008, "SVK": 2009,
        "EST": 2011, "LVA": 2014, "LTU": 2015, "HRV": 2023}
AGGS = {"WLD": "Verden", "EMU": "Euroområdet", "OED": "OECD-landene"}

# År landet innførte inflasjonsmål (fullt inflasjonsmålstyringsregime). Kilde: Hammond (2012), «State of the art of
# inflation targeting», Bank of England CCBS Handbook 29, oppdatert med IMF AREAER. Land som senere gikk inn i
# euroen (Finland, Spania, Slovakia) er utelatt fordi regimet varte kort.
TARGETS = {
    "NZL": 1990, "CAN": 1991, "GBR": 1992, "SWE": 1993, "AUS": 1993, "ISR": 1997, "CZE": 1998, "KOR": 1998,
    "POL": 1998, "BRA": 1999, "CHL": 1999, "COL": 1999, "ZAF": 2000, "THA": 2000, "MEX": 2001, "ISL": 2001,
    "NOR": 2001, "HUN": 2001, "PER": 2002, "PHL": 2002, "GTM": 2005, "IDN": 2005, "ROU": 2005, "TUR": 2006,
    "ARM": 2006, "SRB": 2006, "GHA": 2007, "URY": 2007, "ALB": 2009, "GEO": 2009, "MDA": 2010, "PRY": 2011,
    "UGA": 2011, "DOM": 2012, "USA": 2012, "JPN": 2013, "RUS": 2015, "KAZ": 2015, "IND": 2016, "UKR": 2016,
}


def get(url, tries=5):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if k == tries - 1:
                raise
            print("  feil:", e, "– prøver igjen", file=sys.stderr)
            time.sleep(5 * (k + 1))


def oil_prices():
    """Oljepris (USD per fat, årssnitt). FRED (WTI fra 1946) først, IMFs råvareprisindeks via DBnomics som reserve."""
    try:
        print("FRED oljepris …", file=sys.stderr)
        by = {}
        for r in csv.DictReader(io.StringIO(get(FRED.format("WTISPLC"), tries=2).decode("utf-8-sig"))):
            v = r.get("WTISPLC")
            if v not in (None, "", "."):
                by.setdefault(int(r["observation_date"][:4]), []).append(float(v))
        return {y: sum(v) / 12 for y, v in by.items() if len(v) == 12}
    except Exception as e:  # noqa: BLE001
        print("  FRED feilet:", e, "– bruker IMF (DBnomics)", file=sys.stderr)
    try:
        d = json.loads(get(DBN, tries=2))["series"]["docs"][0]
        return {int(p): v for p, v in zip(d["period"], d["value"]) if isinstance(v, (int, float)) and int(p) <= LAST}
    except Exception as e:  # noqa: BLE001
        print("  ingen oljepris:", e, file=sys.stderr)
        return {}


def r2(v):
    return None if v is None or not math.isfinite(v) else round(v, 2)


def main():
    years = list(range(FIRST, LAST + 1))
    print("Verdensbanken: land …", file=sys.stderr)
    meta = json.loads(get("https://api.worldbank.org/v2/country?format=json&per_page=400"))[1]
    countries, iso2 = {}, {}
    for c in meta:
        if c["region"]["value"] == "Aggregates":
            continue
        countries[c["id"]] = {"n": c["name"], "a": c["iso2Code"], "r": c["region"]["id"], "i": c["incomeLevel"]["id"]}
        iso2[c["iso2Code"]] = c["id"]
    keep = set(countries) | set(AGGS)

    raw = {}
    for k, ind in WB_VARS.items():
        print(f"Verdensbanken {ind} …", file=sys.stderr)
        js = json.loads(get(WB.format(ind, FIRST, LAST)))
        for o in js[1] or []:
            c = o["countryiso3code"]
            if c in keep and o["value"] is not None:
                raw.setdefault(k, {}).setdefault(c, {})[int(o["date"])] = float(o["value"])

    # Valutakurs: prosentvis endring i prisen på en dollar (positiv = svekket valuta)
    fx = {}
    for c, ser in raw.pop("fxlvl").items():
        out = {}
        for y, v in ser.items():
            p = ser.get(y - 1)
            if p and v and p > 0 and v > 0:
                out[y] = 100 * (v / p - 1)
        if out and max(abs(x) for x in out.values()) > 1e-9:   # USA og land med fast dollarkurs uten bevegelse
            fx[c] = out
    raw["fx"] = fx

    print("BIS styringsrenter …", file=sys.stderr)
    monthly = {"pol": {}, "cpi": {}}
    for r in csv.DictReader(io.StringIO(get(BIS.format("WS_CBPOL", "M")).decode("utf-8-sig"))):
        if r["OBS_VALUE"] not in ("", "NaN"):
            monthly["pol"].setdefault(r["REF_AREA"], {})[r["TIME_PERIOD"]] = float(r["OBS_VALUE"])
    print("BIS konsumpriser …", file=sys.stderr)
    for r in csv.DictReader(io.StringIO(get(BIS.format("WS_LONG_CPI", "M..771")).decode("utf-8-sig"))):
        if r["OBS_VALUE"] not in ("", "NaN"):
            monthly["cpi"].setdefault(r["REF_AREA"], {})[r["TIME_PERIOD"]] = float(r["OBS_VALUE"])
    to3 = lambda a: "EMU" if a == "XM" else iso2.get(a)  # noqa: E731
    ecb = monthly["pol"].get("XM", {})
    for c, y0 in EURO.items():
        a = countries[c]["a"]
        own = monthly["pol"].setdefault(a, {})
        for m, v in ecb.items():
            if int(m[:4]) >= y0:
                own[m] = v

    # Årssnitt av styringsrenten
    pol = {}
    for a, ser in monthly["pol"].items():
        c = to3(a)
        if not c:
            continue
        by = {}
        for m, v in ser.items():
            by.setdefault(int(m[:4]), []).append(v)
        pol[c] = {y: sum(v) / len(v) for y, v in by.items() if FIRST <= y <= LAST and len(v) >= 6}
    raw["policy"] = pol

    oil_by = oil_prices()
    oil = [r2(oil_by.get(y)) for y in years]

    # Månedsserier fra BIS
    last_m = max(max(s) for s in monthly["cpi"].values())
    months = []
    y, mo = MFIRST, 1
    while f"{y}-{mo:02d}" <= last_m:
        months.append(f"{y}-{mo:02d}")
        mo += 1
        if mo > 12:
            y, mo = y + 1, 1
    mout = {"months": months, "cpi": {}, "pol": {}}
    for k in ("cpi", "pol"):
        for a, ser in monthly[k].items():
            c = to3(a)
            if c:
                s = [r2(ser.get(m)) for m in months]
                if any(v is not None for v in s):
                    mout[k][c] = s
    # Norge fra 1900 (BIS har lange serier)
    no_first = min(monthly["cpi"]["NO"])
    nohist = {"start": no_first, "cpi": [], "pol": []}
    y, mo = int(no_first[:4]), int(no_first[5:])
    while f"{y}-{mo:02d}" < f"{MFIRST}-01":
        m = f"{y}-{mo:02d}"
        nohist["cpi"].append(r2(monthly["cpi"]["NO"].get(m)))
        nohist["pol"].append(r2(monthly["pol"].get("NO", {}).get(m)))
        mo += 1
        if mo > 12:
            y, mo = y + 1, 1

    # Fyll hull i årsinflasjonen (typisk siste år) med snittet av BIS' tolvmånedersvekst når alle tolv måneder finnes
    for a, ser in monthly["cpi"].items():
        c = to3(a)
        if not c:
            continue
        tgt = raw["infl"].setdefault(c, {})
        for y in years:
            if y not in tgt:
                v = [ser.get(f"{y}-{m:02d}") for m in range(1, 13)]
                if all(x is not None for x in v):
                    tgt[y] = sum(v) / 12

    vars_out = {}
    for k, d in raw.items():
        vars_out[k] = {}
        for c, ser in d.items():
            s = [r2(ser.get(y)) for y in years]
            if any(v is not None for v in s):
                vars_out[k][c] = s
    used = set().union(*[set(d) for d in vars_out.values()])
    names = {c: countries[c] for c in countries if c in used}
    out = {
        "source": "Verdensbanken (WDI), BIS og FRED",
        "fetched": time.strftime("%Y-%m-%d"),
        "years": years,
        "countries": names,
        "aggs": AGGS,
        "vars": vars_out,
        "oil": oil,
        "targets": TARGETS,
        "euro": EURO,
        "monthly": mout,
        "nohist": nohist,
    }
    with open(os.path.join(DATA, "inflasjon.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"skrev data/inflasjon.json ({len(names)} land, {FIRST}–{LAST}; måned {months[0]}–{months[-1]}; "
          + ", ".join(f"{k}:{len(v)}" for k, v in vars_out.items()) + ")", file=sys.stderr)


if __name__ == "__main__":
    main()
