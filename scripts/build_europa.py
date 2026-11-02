#!/usr/bin/env python3
"""Norge i Europa: sammenlignbare indikatorer for EU-landene, Norge, Island og Sveits.

Kilder: Eurostat (åpent API, JSON-stat) og OECD (sykefravær, SDMX).
Skriver data/europa.json.
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

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
EUROSTAT = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"
OECD_SICK = ("https://sdmx.oecd.org/public/rest/data/OECD.ELS.HD,DSD_HEALTH_STAT@DF_AWDI,/all"
             "?startPeriod=2005&dimensionAtObservation=AllDimensions&format=csvfilewithlabels")
SINCE = "2005"

COUNTRIES = {
    "NO": "Norge", "SE": "Sverige", "DK": "Danmark", "FI": "Finland", "IS": "Island",
    "DE": "Tyskland", "FR": "Frankrike", "NL": "Nederland", "BE": "Belgia", "LU": "Luxembourg", "AT": "Østerrike",
    "CH": "Sveits", "IE": "Irland", "IT": "Italia", "ES": "Spania", "PT": "Portugal", "EL": "Hellas", "MT": "Malta",
    "CY": "Kypros", "PL": "Polen", "CZ": "Tsjekkia", "SK": "Slovakia", "HU": "Ungarn", "SI": "Slovenia", "HR": "Kroatia",
    "RO": "Romania", "BG": "Bulgaria", "EE": "Estland", "LV": "Latvia", "LT": "Litauen",
}
NORDIC = ["NO", "SE", "DK", "FI", "IS"]
EU = "EU27_2020"
ISO3 = {"AUT": "AT", "BEL": "BE", "BGR": "BG", "CHE": "CH", "CZE": "CZ", "DEU": "DE", "DNK": "DK", "ESP": "ES", "EST": "EE",
        "FIN": "FI", "FRA": "FR", "GRC": "EL", "HRV": "HR", "HUN": "HU", "IRL": "IE", "ISL": "IS", "ITA": "IT", "LTU": "LT",
        "LUX": "LU", "LVA": "LV", "NLD": "NL", "NOR": "NO", "POL": "PL", "PRT": "PT", "ROU": "RO", "SVK": "SK", "SVN": "SI",
        "SWE": "SE", "CYP": "CY", "MLT": "MT"}

# key, navn, gruppe, enhet, desimaler, «høyt er» (good/bad/None), datasett, filtre, beskrivelse
IND = [
    ("skatt", "Skatter og avgifter", "Skatt og offentlig sektor", "% av BNP", 1, None, "gov_10a_taxag",
     {"na_item": "D2_D5_D91_D61_M_D995", "sector": "S13_S212", "unit": "PC_GDP"},
     "Samlede skatter, avgifter og trygdeavgifter i prosent av BNP. For Norge trekker høy BNP fra olje og gass andelen ned."),
    ("utgifter", "Offentlige utgifter", "Skatt og offentlig sektor", "% av BNP", 1, None, "gov_10a_main",
     {"na_item": "TE", "sector": "S13", "unit": "PC_GDP"}, "Offentlig forvaltnings samlede utgifter i prosent av BNP."),
    ("konsum", "Offentlig konsum", "Skatt og offentlig sektor", "% av BNP", 1, None, "gov_10a_main",
     {"na_item": "P3", "sector": "S13", "unit": "PC_GDP"}, "Offentlig forvaltnings konsum (tjenester som skole, helse, forsvar) i prosent av BNP."),
    ("formue", "Offentlig netto finansformue", "Skatt og offentlig sektor", "% av BNP", 0, "good", "gov_10a_ggfa",
     {"na_item": "BF90", "sector": "S13", "sector2": "S1_S2", "finpos": "LIAB", "co_nco": "CO", "unit": "PC_GDP", "stk_flow": "STK"},
     "Offentlig forvaltnings finansielle eiendeler minus gjeld, i prosent av BNP. Negativt tall betyr netto gjeld. For Norge inngår oljefondet."),
    ("sosial", "Utgifter til sosial beskyttelse", "Velferd og arbeid", "% av BNP", 1, None, "tps00098",
     {"unit": "PC_GDP", "spdeps": "TOTAL"}, "Utgifter til pensjoner, trygder, helse, familieytelser m.m. i prosent av BNP."),
    ("pensjon", "Utgifter til alderspensjon mv.", "Velferd og arbeid", "% av BNP", 1, None, "spr_exp_func",
     {"spfunc": "OLD", "unit": "PC_GDP", "spdeps": "SPR"}, "Sosiale ytelser knyttet til alderdom i prosent av BNP."),
    ("ufore", "Utgifter til uføreytelser", "Velferd og arbeid", "% av BNP", 1, None, "spr_exp_func",
     {"spfunc": "DIS", "unit": "PC_GDP", "spdeps": "SPR"}, "Sosiale ytelser ved uførhet i prosent av BNP."),
    ("syss", "Sysselsetting 20–64 år", "Velferd og arbeid", "%", 1, "good", "lfsi_emp_a",
     {"indic_em": "EMP_LFS", "age": "Y20-64", "sex": "T", "unit": "PC_POP"}, "Andel av befolkningen 20–64 år som er sysselsatt (arbeidskraftundersøkelsen)."),
    ("ledig", "Arbeidsledighet", "Velferd og arbeid", "%", 1, "bad", "une_rt_a",
     {"age": "Y15-74", "sex": "T", "unit": "PC_ACT"}, "Arbeidsledige i prosent av arbeidsstyrken 15–74 år."),
    ("syk", "Sykefravær", "Velferd og arbeid", "uker per år", 1, "bad", None, None,
     "Gjennomsnittlig sykefravær for heltidsansatte arbeidstakere, uker per år (OECD)."),
    ("bnp", "BNP per innbygger", "Inntekt og husholdninger", "EU = 100", 0, "good", "tec00114",
     {}, "BNP per innbygger i kjøpekraftsjusterte enheter, EU = 100. Norges tall er høyt delvis på grunn av petroleumssektoren."),
    ("inntekt", "Median disponibel inntekt", "Inntekt og husholdninger", "PPS", 0, "good", "ilc_di03",
     {"statinfo": "MED_EI", "unit": "PPS", "age": "TOTAL", "sex": "T"}, "Median ekvivalentinntekt etter skatt, justert for prisnivå (kjøpekraftsenheter, PPS)."),
    ("sparing", "Husholdningenes sparerate", "Inntekt og husholdninger", "%", 1, None, None, None,
     "Husholdningenes nettosparing i prosent av disponibel inntekt (OECD; Norge fra SSB tabell 12880)."),
    ("eie", "Andel som eier boligen", "Inntekt og husholdninger", "%", 1, None, "ilc_lvho02",
     {"tenure": "OWN", "hhcomp": "TOTAL", "rskpovth": "TOTAL", "unit": "PC"}, "Andel av befolkningen som bor i eid bolig (med eller uten lån)."),
    ("gini", "Gini-koeffisient", "Inntekt og husholdninger", "indeks 0–100", 1, "bad", "ilc_di12",
     {}, "Inntektsulikhet for disponibel ekvivalentinntekt (0 = helt likt, 100 = helt ulikt)."),
    ("fattig", "Under fattigdomsgrensen", "Inntekt og husholdninger", "%", 1, "bad", "ilc_li02",
     {"rskpovth": "B_60", "statinfo": "MED_EI", "age": "TOTAL", "sex": "T", "unit": "PC"}, "Andel med inntekt under 60 % av landets median (relativ fattigdom)."),
    ("innv", "Innvandring", "Befolkning og innvandring", "per 1 000 innb.", 1, None, "tps00176",
     {}, "Antall innvandrede per 1 000 innbyggere."),
    ("asyl", "Asylsøkere", "Befolkning og innvandring", "per 100 000 innb.", 0, None, "migr_asyappctza",
     {"applicant": "FRST", "citizen": "TOTAL", "sex": "T", "age": "TOTAL", "unit": "PER"}, "Førstegangs asylsøkere per 100 000 innbyggere."),
    ("utlfodt", "Født i utlandet", "Befolkning og innvandring", "% av befolkningen", 1, None, "migr_pop3ctb",
     {"c_birth": "FOR", "age": "TOTAL", "sex": "T", "unit": "NR"}, "Andel av befolkningen som er født i et annet land."),
    ("fruktb", "Samlet fruktbarhet", "Befolkning og innvandring", "barn per kvinne", 2, None, "demo_find",
     {"indic_de": "TOTFERRT"}, "Gjennomsnittlig antall barn per kvinne gitt årets fruktbarhetsmønster."),
    ("leveald", "Forventet levealder", "Befolkning og innvandring", "år", 1, "good", "demo_mlexpec",
     {"age": "Y_LT1", "sex": "T", "unit": "YR"}, "Forventet levealder ved fødsel."),
    ("hoyutd", "Høyere utdanning 25–34 år", "Befolkning og innvandring", "%", 1, "good", "edat_lfse_03",
     {"isced11": "ED5-8", "age": "Y25-34", "sex": "T", "unit": "PC"}, "Andel 25–34-åringer med høyere utdanning (ISCED 5–8)."),
]


def get(url, tries=4):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "skatt-visualisering/1.0"})
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if k == tries - 1:
                raise
            print("  feil:", e, "– prøver igjen", file=sys.stderr)
            time.sleep(3 * (k + 1))


def eurostat(ds, filters):
    q = [("format", "JSON"), ("lang", "EN"), ("sinceTimePeriod", SINCE)] + [("geo", g) for g in list(COUNTRIES) + [EU]]
    q += [(k, v) for k, v in filters.items()]
    d = json.loads(get(EUROSTAT + ds + "?" + urllib.parse.urlencode(q)))
    ids, size = d["id"], d["size"]
    idx = {i: d["dimension"][i]["category"]["index"] for i in ids}
    for i, s in zip(ids, size):
        if s > 1 and i not in ("geo", "time"):
            print(f"  merk: {ds} har {s} verdier i '{i}', bruker første", file=sys.stderr)
    out = {}
    inv = {i: {v: k for k, v in idx[i].items()} for i in ids}
    for pos, v in d["value"].items():
        pos = int(pos)
        coords = {}
        for i, s in reversed(list(zip(ids, size))):
            coords[i] = pos % s
            pos //= s
        if any(coords[i] != 0 for i, s in zip(ids, size) if s > 1 and i not in ("geo", "time")):
            continue
        g, t = inv["geo"][coords["geo"]], inv["time"][coords["time"]]
        out.setdefault(g, {})[t[:4]] = v
    return out, d.get("updated")


def oecd_sick():
    rows = csv.DictReader(io.StringIO(get(OECD_SICK).decode("utf-8-sig")))
    out = {}
    for r in rows:
        g = ISO3.get(r["REF_AREA"])
        if g and r["OBS_VALUE"]:
            out.setdefault(g, {})[r["TIME_PERIOD"][:4]] = float(r["OBS_VALUE"])
    return out


OECD_SAVING = ("https://sdmx.oecd.org/public/rest/data/OECD.SDD.NAD,DSD_NAAG@DF_NAAG_V,/A.{areas}.B8NS1M......"
               "?startPeriod=2005&dimensionAtObservation=AllDimensions&format=csvfilewithlabels")


def oecd_saving():
    url = OECD_SAVING.format(areas="+".join(ISO3))
    rows = csv.DictReader(io.StringIO(get(url).decode("utf-8-sig")))
    out = {}
    for r in rows:
        g = ISO3.get(r["REF_AREA"])
        if g and r["OBS_VALUE"] and r.get("MEASURE") == "B8NS1M":
            out.setdefault(g, {})[r["TIME_PERIOD"][:4]] = float(r["OBS_VALUE"])
    # Norge mangler hos OECD – bruk SSBs sparerate (samme definisjon: netto sparing / disponibel inntekt)
    q = {"query": [{"code": "ContentsCode", "selection": {"filter": "item", "values": ["HusholdSpare"]}}], "response": {"format": "json-stat2"}}
    req = urllib.request.Request("https://data.ssb.no/api/v0/no/table/12880", data=json.dumps(q).encode(), headers={"Content-Type": "application/json"})
    d = json.loads(urllib.request.urlopen(req, timeout=120).read())
    years = list(d["dimension"]["Tid"]["category"]["index"])
    last_actual = time.localtime().tm_year - 1  # tabellen inneholder også prognoser
    for y, v in zip(years, d["value"]):
        if v is not None and int(y) <= last_actual and int(y) >= int(SINCE):
            out.setdefault("NO", {})[y] = v
    return out


def main():
    pop, _ = eurostat("tps00001", {})
    indicators, updated = [], []
    for key, name, group, unit, dec, better, ds, filt, desc in IND:
        print(" ", key, ds or "OECD", file=sys.stderr)
        if key == "syk":
            vals, src = oecd_sick(), "OECD"
        elif key == "sparing":
            vals, src = oecd_saving(), "OECD og SSB"
        else:
            vals, up = eurostat(ds, filt)
            updated.append(up)
            src = f"Eurostat {ds}"
        # omregninger
        if key in ("innv", "asyl", "utlfodt"):
            per = {"innv": 1000, "asyl": 100000, "utlfodt": 100}[key]
            conv = {}
            for g, ser in vals.items():
                for y, v in ser.items():
                    p = pop.get(g, {}).get(y)
                    if p and v is not None:
                        conv.setdefault(g, {})[y] = per * v / p
            vals = conv
        clean = {g: {y: round(v, 3) for y, v in sorted(ser.items()) if v is not None} for g, ser in vals.items() if g in COUNTRIES or g == EU}
        n_no = len(clean.get("NO", {}))
        print(f"    {len(clean)} land, Norge: {n_no} år", file=sys.stderr)
        indicators.append({"key": key, "name": name, "group": group, "unit": unit, "dec": dec, "better": better, "source": src, "desc": desc, "values": clean})
    # For omregning av «% av BNP» til per innbygger: BNP per innbygger i euro og prisnivåindeks (EU = 100)
    gdp_pc, _ = eurostat("nama_10_pc", {"na_item": "B1GQ", "unit": "CP_EUR_HAB"})
    pli, _ = eurostat("prc_ppp_ind", {"na_item": "PLI_EU27_2020", "ppp_cat": "GDP"})
    out = {
        "source": "Eurostat og OECD",
        "gdp_pc_eur": gdp_pc,
        "pli": pli,
        "updated": max(filter(None, updated)) if updated else None,
        "countries": COUNTRIES, "nordic": NORDIC, "eu": EU,
        "indicators": indicators,
    }
    with open(os.path.join(DATA, "europa.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print("skrev data/europa.json", file=sys.stderr)


if __name__ == "__main__":
    main()
