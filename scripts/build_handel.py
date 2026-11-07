#!/usr/bin/env python3
"""Utenrikshandel: Norges eksport og import av varer per land, med og uten olje og gass,
samt EUs avhengighet av Norge.

Kilder:
  SSB 08804  Utenrikshandel med varer, hovedtall, etter land (1988–)
  SSB 08809  Utenrikshandel med varer, etter varegruppe (SITC) og land
  SSB 09189  BNP
  Eurostat   ext_st_eu27_2020sitc (EUs handel med Norge og alle land utenfor EU),
             nrg_ti_gas / nrg_cb_gas / nrg_ti_oil (gass og råolje), nama_10_gdp
Skriver data/handel.json.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ssblib import Cube, meta, query  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
EUROSTAT = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"

EU27 = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT",
        "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"]
REGIONS = {"10": "Europa", "20": "Afrika", "40": "Asia", "60": "Nord- og Mellom-Amerika", "70": "Sør-Amerika", "80": "Oseania"}
FLOWS = {"ex": "Etot", "exf": "Etotusorn", "og": "Eoljegass", "im": "Itot", "imf": "Itotuso"}
# Varegrupper (SITC) – bygget av en- og tosifrede koder
GROUPS = [
    ("fisk", "Fisk og sjømat", ["03"], []),
    ("mat", "Annen mat, drikke og fett", ["0", "1", "4"], ["03"]),
    ("ravarer", "Råvarer (tre, malm, mineraler)", ["2"], []),
    ("olje", "Råolje og oljeprodukter", ["33"], []),
    ("gass", "Naturgass", ["34"], []),
    ("strom", "Elektrisk strøm", ["35"], []),
    ("kull", "Kull og annen energi", ["3"], ["33", "34", "35"]),
    ("kjemi", "Kjemiske produkter og legemidler", ["5"], []),
    ("metall", "Metaller (aluminium, jern, stål m.m.)", ["67", "68"], []),
    ("industri", "Andre bearbeidde varer og ferdigvarer", ["6", "8"], ["67", "68"]),
    ("maskiner", "Maskiner og transportmidler", ["7"], []),
    ("annet", "Annet", ["9"], []),
]
SITC_SINCE = 2005


def get(url, tries=4):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "norge-asa-visualisering/1.0"})
            with urllib.request.urlopen(req, timeout=240) as r:
                return json.loads(r.read())
        except Exception as e:  # noqa: BLE001
            if k == tries - 1:
                raise
            print("  feil:", e, "– prøver igjen", file=sys.stderr)
            time.sleep(4 * (k + 1))


def eurostat(ds, params):
    """Returnerer {(dim1, dim2, …, tid): verdi} for alle dimensjoner med mer enn én verdi."""
    q = [("format", "JSON"), ("lang", "EN")]
    for k, v in params.items():
        for x in (v if isinstance(v, list) else [v]):
            q.append((k, x))
    d = get(EUROSTAT + ds + "?" + urllib.parse.urlencode(q))
    ids, size = d["id"], d["size"]
    inv = {i: {v: k for k, v in d["dimension"][i]["category"]["index"].items()} for i in ids}
    out = {}
    for pos, v in d["value"].items():
        pos = int(pos)
        coords = {}
        for i, s in reversed(list(zip(ids, size))):
            coords[i] = inv[i][pos % s]
            pos //= s
        out[tuple(coords[i] for i in ids if i in params and isinstance(params[i], list)) + (coords["time"],)] = v
    return out


def r1(v):
    return None if v is None else round(v, 1)


def main():
    m = meta("08804")
    lands = dict(zip(m["variables"][1]["values"], m["variables"][1]["valueTexts"]))
    years = [y for y in m["variables"][3]["values"]]
    print("SSB 08804 …", file=sys.stderr)
    c = Cube(query("08804", {"HovedVareStrommer": list(FLOWS.values()), "Land": "*", "ContentsCode": ["Verdi"], "Tid": "*"}))
    years = c.cats("Tid")
    flows = {k: {} for k in FLOWS}
    for k, code in FLOWS.items():
        for land in c.cats("Land"):
            ser = [c.get(HovedVareStrommer=code, Land=land, ContentsCode="Verdi", Tid=y) for y in years]
            if not any(ser):
                continue
            key = "ALL" if land == "00" else ("R" + land if land in REGIONS else land)
            if land.isdigit() and land not in REGIONS and land != "00":
                continue
            flows[k][key] = [r1(v) for v in ser]
    # EU27 (dagens medlemmer) og «resten av Europa» summert fra land, så serien er sammenlignbar over tid
    for k in flows:
        eu = [0.0] * len(years)
        for cc in EU27:
            for i, v in enumerate(flows[k].get(cc, [])):
                eu[i] += v or 0
        flows[k]["EU"] = [r1(v) for v in eu]
        if "R10" in flows[k]:
            flows[k]["REUR"] = [r1((a or 0) - b - ((flows[k].get("GB") or [0] * len(years))[i] or 0)) for i, (a, b) in enumerate(zip(flows[k]["R10"], eu))]
    countries = {cc: lands[cc] for cc in flows["ex"].keys() | flows["im"].keys() if cc in lands}

    # Varegrupper per land
    print("SSB 08809 …", file=sys.stderr)
    codes = sorted({x for g in GROUPS for x in g[2] + g[3]})
    syears = [y for y in years if int(y) >= SITC_SINCE]
    sitc = {"ex": {}, "im": {}}
    for chunk in [syears[i:i + 6] for i in range(0, len(syears), 6)]:
        cs = Cube(query("08809", {"ImpEks": ["1", "2"], "Land": "*", "SITC": codes, "ContentsCode": ["Verdi"], "Tid": chunk}))
        for land in cs.cats("Land"):
            if land.isdigit() and land != "00":
                continue
            key = "ALL" if land == "00" else land
            for ie, fk in (("2", "ex"), ("1", "im")):
                for y in chunk:
                    yi = syears.index(y)
                    for gk, _, plus, minus in GROUPS:
                        v = sum((cs.get(ImpEks=ie, Land=land, SITC=s, ContentsCode="Verdi", Tid=y) or 0) for s in plus) \
                            - sum((cs.get(ImpEks=ie, Land=land, SITC=s, ContentsCode="Verdi", Tid=y) or 0) for s in minus)
                        if abs(v) < 50:  # under 50 000 kr
                            continue
                        sitc[fk].setdefault(key, {}).setdefault(gk, [None] * len(syears))[yi] = r1(v / 1000)
    for fk in sitc:  # EU27 summert
        eu = {}
        for cc in EU27:
            for gk, ser in sitc[fk].get(cc, {}).items():
                acc = eu.setdefault(gk, [0.0] * len(syears))
                for i, v in enumerate(ser):
                    acc[i] += v or 0
        sitc[fk]["EU"] = {gk: [r1(v) for v in ser] for gk, ser in eu.items()}

    # BNP Norge
    g = Cube(query("09189", {"Makrost": ["bnpb.nr23_9", "bnpb.nr23_9fn"], "ContentsCode": ["Priser"], "Tid": years}))
    gdp = {"bnp": [g.get(Makrost="bnpb.nr23_9", ContentsCode="Priser", Tid=y) for y in years],
           "bnpf": [g.get(Makrost="bnpb.nr23_9fn", ContentsCode="Priser", Tid=y) for y in years]}

    # ---------------- EU-siden (Eurostat)
    print("Eurostat …", file=sys.stderr)
    tr = eurostat("ext_st_eu27_2020sitc", {"freq": "M", "geo": "EU27_2020", "indic_et": "TRD_VAL", "stk_flow": ["IMP", "EXP"],
                                           "partner": ["NO", "EXT_EU27_2020"], "sitc06": ["TOTAL", "SITC3", "SITC0"], "sinceTimePeriod": "2002-01"})
    agg, months = {}, {}
    for (flow, partner, s, t), v in tr.items():
        y = t[:4]
        agg[(flow, partner, s, y)] = agg.get((flow, partner, s, y), 0) + v
        months.setdefault((flow, partner, s, y), set()).add(t)
    eyears = sorted({k[3] for k, ms in months.items() if len(ms) == 12})
    eu = {"years": eyears}
    for flow in ("IMP", "EXP"):
        for partner in ("NO", "EXT_EU27_2020"):
            for s in ("TOTAL", "SITC3", "SITC0"):
                eu[f"{flow}_{'no' if partner == 'NO' else 'ext'}_{s}".lower()] = [r1(agg.get((flow, partner, s, y))) for y in eyears]
    # Norges plass blant EUs handelspartnere siste hele år
    ly = eyears[-1]
    rank = {}
    for flow in ("IMP", "EXP"):
        d = get(EUROSTAT + "ext_st_eu27_2020sitc?" + urllib.parse.urlencode(
            [("format", "JSON"), ("freq", "M"), ("geo", "EU27_2020"), ("indic_et", "TRD_VAL"), ("stk_flow", flow), ("sitc06", "TOTAL")]
            + [("time", f"{ly}-{mm:02d}") for mm in range(1, 13)]))
        pidx = d["dimension"]["partner"]["category"]["index"]
        plab = d["dimension"]["partner"]["category"]["label"]
        inv = {v: k for k, v in pidx.items()}
        ids, size = d["id"], d["size"]
        tot = {}
        for pos, v in d["value"].items():
            pos = int(pos)
            coords = {}
            for i, s in reversed(list(zip(ids, size))):
                coords[i] = pos % s
                pos //= s
            p = inv[coords["partner"]]
            tot[p] = tot.get(p, 0) + v
        single = {p: v for p, v in tot.items() if (len(p) == 2 and p.isalpha() and not p.startswith("Q") and p not in ("EU", "EA", "XX")) or p == "CN_X_HK"}
        order = sorted(single, key=lambda p: -single[p])
        rank[flow.lower()] = {"year": ly, "rank": order.index("NO") + 1, "top": [[p, plab[p], r1(single[p])] for p in order[:10]]}
    eu["rank"] = rank

    def nrg(ds, siec, unit, extra=None):
        p = {"geo": "EU27_2020", "siec": siec, "unit": unit, "sinceTimePeriod": "2000"}
        p.update(extra or {})
        return eurostat(ds, p)
    gas = nrg("nrg_ti_gas", "G3000", "TJ_GCV", {"partner": ["NO", "TOTAL", "RU", "US", "DZ", "QA"]})
    gc = nrg("nrg_cb_gas", "G3000", "TJ_GCV", {"nrg_bal": ["IC_OBS"]})
    oil = nrg("nrg_ti_oil", "O4100_TOT", "THS_T", {"partner": ["NO", "TOTAL", "RU", "US", "KZ", "LY", "IQ", "SA"]})
    nyears = sorted({k[-1] for k in gas})
    eu["energy_years"] = nyears
    eu["gas_imp"] = {p: [r1(gas.get((p, y))) for y in nyears] for p in ("NO", "TOTAL", "RU", "US", "DZ", "QA")}
    eu["gas_cons"] = [r1(gc.get(("IC_OBS", y))) for y in nyears]
    eu["oil_imp"] = {p: [r1(oil.get((p, y))) for y in nyears] for p in ("NO", "TOTAL", "RU", "US", "KZ", "LY", "IQ", "SA")}
    gd = eurostat("nama_10_gdp", {"geo": "EU27_2020", "na_item": "B1GQ", "unit": "CP_MEUR", "sinceTimePeriod": "2002"})
    eu["gdp"] = [r1(gd.get((y,))) for y in eyears]

    out = {
        "source": "SSB (tabell 08804, 08809, 09189) og Eurostat",
        "fetched": time.strftime("%Y-%m-%d"),
        "years": years,
        "countries": countries,
        "eu27": EU27,
        "regions": {"R" + k: v for k, v in REGIONS.items()},
        "flows": flows,
        "groups": [[g[0], g[1]] for g in GROUPS],
        "sitc_years": syears,
        "sitc": sitc,
        "gdp": gdp,
        "eu": eu,
    }
    with open(os.path.join(DATA, "handel.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"skrev data/handel.json ({len(countries)} land, {years[0]}–{years[-1]}, EU {eyears[0]}–{eyears[-1]})", file=sys.stderr)


if __name__ == "__main__":
    main()
