#!/usr/bin/env python3
"""WJP Rule of Law Index: samlet poengsum, 8 faktorer og 44 underfaktorer for
opptil 143 land, 2015–i dag.

Kilde: World Justice Project (worldjusticeproject.org/rule-of-law-index),
de samme CSV-filene som WJPs egen nettside bruker. Skriver data/rettsstat.json.
"""
from __future__ import annotations

import csv
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
BASE = "https://worldjusticeproject.org/rule-of-law-index/data/{}.csv"

FACTORS_NB = {
    "f1": "Begrensning av myndighetenes makt", "f2": "Fravær av korrupsjon", "f3": "Åpen forvaltning",
    "f4": "Grunnleggende rettigheter", "f5": "Orden og sikkerhet", "f6": "Håndheving av regelverk",
    "f7": "Sivil rettspleie", "f8": "Strafferettspleie",
}
SUB_NB = {
    "1.1": "Nasjonalforsamlingen begrenser regjeringens makt", "1.2": "Domstolene begrenser regjeringens makt",
    "1.3": "Uavhengig revisjon begrenser regjeringens makt", "1.4": "Tjenestemenn straffes for maktmisbruk",
    "1.5": "Kontroll fra presse og sivilsamfunn", "1.6": "Maktskifte skjer i tråd med loven",
    "2.1": "Ingen korrupsjon i regjering og forvaltning", "2.2": "Ingen korrupsjon i domstolene",
    "2.3": "Ingen korrupsjon i politi og forsvar", "2.4": "Ingen korrupsjon i nasjonalforsamlingen",
    "3.1": "Lover og offentlige data er tilgjengelige", "3.2": "Rett til innsyn", "3.3": "Borgerdeltakelse", "3.4": "Klageordninger",
    "4.1": "Likebehandling og fravær av diskriminering", "4.2": "Rett til liv og personlig sikkerhet",
    "4.3": "Rettssikkerhet for siktede", "4.4": "Ytringsfrihet", "4.5": "Tros- og religionsfrihet",
    "4.6": "Vern mot vilkårlige inngrep i privatlivet", "4.7": "Forsamlings- og organisasjonsfrihet",
    "4.8": "Grunnleggende arbeidstakerrettigheter",
    "5.1": "Kriminaliteten er under kontroll", "5.2": "Ingen væpnet konflikt", "5.3": "Folk tyr ikke til vold for å løse konflikter",
    "6.1": "Regelverk håndheves effektivt", "6.2": "Regelverk håndheves uten utilbørlig påvirkning",
    "6.3": "Forvaltningen arbeider uten urimelig forsinkelse", "6.4": "Rettssikkerhet i forvaltningssaker",
    "6.5": "Ingen ekspropriasjon uten lov og erstatning",
    "7.1": "Folk har tilgang til og råd til sivil rettshjelp", "7.2": "Sivil rettspleie uten diskriminering",
    "7.3": "Sivil rettspleie uten korrupsjon", "7.4": "Sivil rettspleie uten utilbørlig statlig påvirkning",
    "7.5": "Sivil rettspleie uten urimelig forsinkelse", "7.6": "Sivile avgjørelser håndheves effektivt",
    "7.7": "Mekling og alternativ tvisteløsning fungerer",
    "8.1": "Etterforskningen er effektiv", "8.2": "Straffesaker avgjøres raskt og effektivt",
    "8.3": "Kriminalomsorgen reduserer ny kriminalitet", "8.4": "Strafferettspleien er upartisk",
    "8.5": "Strafferettspleie uten korrupsjon", "8.6": "Strafferettspleie uten utilbørlig statlig påvirkning",
    "8.7": "Rettssikkerhet for siktede (strafferett)",
}
REGION_NB = {
    "EU, EFTA, and North America": "EU, EFTA og Nord-Amerika", "East Asia and Pacific": "Øst-Asia og Stillehavet",
    "Eastern Europe and Central Asia": "Øst-Europa og Sentral-Asia", "Latin America and Caribbean": "Latin-Amerika og Karibia",
    "Middle East and North Africa": "Midtøsten og Nord-Afrika", "South Asia": "Sør-Asia", "Sub-Saharan Africa": "Afrika sør for Sahara",
}
INCOME_NB = {"High": "Høy inntekt", "Upper-middle": "Øvre mellominntekt", "Lower-middle": "Nedre mellominntekt", "Low": "Lav inntekt"}


def fetch(label):
    url = BASE.format(label)
    for k in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "norge-asa-visualisering/1.0"})
            with urllib.request.urlopen(req, timeout=120) as r:
                txt = r.read().decode("utf-8-sig")
                # Ukjente år gir nettsidens HTML i stedet for 404
                return txt if txt.startswith("Country") else None
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if k == 2:
                raise
        except Exception:  # noqa: BLE001
            if k == 2:
                raise
        time.sleep(3 * (k + 1))


def key_of(label):
    if label.startswith("WJP Rule of Law Index"):
        return "overall"
    m = re.match(r"Factor (\d):", label)
    if m:
        return "f" + m.group(1)
    m = re.match(r"(\d\.\d)\.?\s", label)
    return m.group(1) if m else None


def main():
    labels = ["2015", "2016", "2017-18"] + [str(y) for y in range(2019, time.localtime().tm_year + 2)]
    years, tables = [], []
    for lab in labels:
        txt = fetch(lab)
        if not txt:
            continue
        years.append(lab)
        tables.append(list(csv.reader(io.StringIO(txt))))
        print(" ", lab, len(tables[-1][0]) - 1, "land", file=sys.stderr)
    countries, names_en = {}, {}
    values = {}
    for yi, rows in enumerate(tables):
        head = {r[0].strip().lower(): r[1:] for r in rows[:4]}
        codes = head["country code"]
        for j, code in enumerate(codes):
            c = countries.setdefault(code, {})
            c["en"] = head["country"][j]
            reg = head.get("region", [""] * len(codes))[j]
            inc = head.get("income group", [""] * len(codes))[j]
            if reg:
                c["region"] = REGION_NB.get(reg, reg)
            if inc:
                c["income"] = INCOME_NB.get(inc, inc)
        for r in rows[4:]:
            k = key_of(r[0])
            if not k:
                continue
            names_en[k] = re.sub(r"^(Factor \d: |\d\.\d\.? )", "", r[0]).replace("WJP Rule of Law Index: ", "")
            for j, code in enumerate(codes):
                try:
                    v = round(float(r[j + 1]), 3)
                except (ValueError, IndexError):
                    continue
                values.setdefault(k, {}).setdefault(code, [None] * len(labels))[yi] = v
    n = len(years)
    for k in values:
        for code in values[k]:
            values[k][code] = values[k][code][:n]
    keys = ["overall"] + [f"f{i}" for i in range(1, 9)] + sorted([k for k in values if "." in k], key=lambda s: (int(s[0]), int(s[2:])))
    inds = []
    for k in keys:
        nb = "Samlet rettsstatsindeks" if k == "overall" else FACTORS_NB.get(k) or SUB_NB.get(k, names_en[k])
        inds.append({"key": k, "level": "overall" if k == "overall" else "factor" if k.startswith("f") else "sub",
                     "factor": None if k == "overall" else (k[1] if k.startswith("f") else k[0]), "nb": nb, "en": names_en[k]})
    out = {
        "source": "World Justice Project Rule of Law Index",
        "fetched": time.strftime("%Y-%m-%d"),
        "years": years,
        "countries": countries,
        "indicators": inds,
        "values": {k: values[k] for k in keys},
    }
    with open(os.path.join(DATA, "rettsstat.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"skrev data/rettsstat.json ({len(countries)} land, {len(keys)} indikatorer, {years[0]}–{years[-1]})", file=sys.stderr)


if __name__ == "__main__":
    main()
