#!/usr/bin/env python3
"""Kommuneprofil: et tverrsnitt av indikatorer per kommune (siste tilgjengelige år).

Kilder: SSB (06944, 05671, 09429, 06445, 12558) og FHI Folkehelsestatistikk
(stønad til livsopphold, uføretrygd, sosialhjelp), i tillegg til tall som allerede
er bygget av build_data.py (skatt, formuesskatt) og build_demografi.py (alder).
Skriver data/kommuneprofil.json.
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ssblib import Cube, fhi_query, meta, query  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as fh:
        return json.load(fh)


def latest_year(table):
    return [v for v in meta(table)["variables"] if v["code"] == "Tid"][0]["values"][-1]


def main():
    reg = load("skatt-regioner.json")
    formue = load("formue.json")
    alder = load("alder/index.json")
    kommuner = list(reg["kommuner"].keys())
    K = set(kommuner)
    ind = []

    def num(v):
        if v is None:
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None  # skjermet/manglende verdi (f.eks. ":" fra FHI)

    def add(key, name, group, unit, year, source, values, national, desc, digits=0):
        vals = {k: (None if num(values.get(k)) is None else round(num(values[k]), digits)) for k in kommuner}
        national = num(national)
        n_ok = sum(v is not None for v in vals.values())
        print(f"  {key}: {n_ok} kommuner, {year}", file=sys.stderr)
        ind.append({"key": key, "name": name, "group": group, "unit": unit, "year": str(year), "source": source,
                    "desc": desc, "national": None if national is None else round(national, digits), "values": vals})

    # ---------------- Befolkning (fra alder/index.json) ----------------
    ay = alder["years"]
    yi, yi10 = len(ay) - 1, ay.index(ay[-1] - 10)
    A = alder["kommuner"]
    N = alder["norge"]["ind"]
    add("pop", "Folketall", "Befolkning", "antall", ay[yi], "SSB 07459", {k: A[k]["ind"]["pop"][yi] for k in K}, N["pop"][yi], "Folketall per 1. januar.")
    add("vekst", f"Befolkningsvekst siste 10 år", "Befolkning", "%", f"{ay[yi10]}–{ay[yi]}", "SSB 07459",
        {k: 100 * (A[k]["ind"]["pop"][yi] / A[k]["ind"]["pop"][yi10] - 1) for k in K if A[k]["ind"]["pop"][yi10]},
        100 * (N["pop"][yi] / N["pop"][yi10] - 1), "Endring i folketall siste ti år, dagens kommunegrenser.", 1)
    for key, name, desc in [
        ("a0_19", "Andel 0–19 år", "Andel av befolkningen som er 0–19 år."),
        ("a67", "Andel 67 år og eldre", "Andel av befolkningen som er 67 år eller eldre."),
        ("a80", "Andel 80 år og eldre", "Andel av befolkningen som er 80 år eller eldre."),
    ]:
        add(key, name, "Befolkning", "%", ay[yi], "SSB 07459", {k: A[k]["ind"][key][yi] for k in K}, N[key][yi], desc, 1)
    add("fb", "Eldre per 100 i arbeidsfør alder", "Befolkning", "antall", ay[yi], "SSB 07459", {k: A[k]["ind"]["fb"][yi] for k in K}, N["fb"][yi],
        "Personer 67+ per 100 personer 20–66 år (forsørgerbrøk for eldre).", 1)
    add("med", "Medianalder", "Befolkning", "år", ay[yi], "SSB 07459", {k: A[k]["ind"]["med"][yi] for k in K}, N["med"][yi], "Halvparten av innbyggerne er yngre enn dette.", 1)

    # ---------------- Skatt (fra egne filer) ----------------
    ry = reg["years"]
    ryi = len(ry) - 1 - (1 if reg.get("partial") else 0)
    i00 = [a["code"] for a in reg["arts"]].index("00")
    tot = sum(reg["kommuner"][k]["v"][i00][ryi] for k in K)
    popsum = sum(reg["kommuner"][k]["pop"][ryi] for k in K)
    add("skatt", "Skatteinngang per innbygger", "Skatt og inntekt", "kr", ry[ryi], "SSB 07022",
        {k: reg["kommuner"][k]["v"][i00][ryi] * 1e6 / reg["kommuner"][k]["pop"][ryi] for k in K}, tot * 1e6 / popsum,
        "All skatt og avgift fordelt til kommunen, delt på folketallet.")
    fy = formue["kyears"]
    fi = len(fy) - 1
    F = formue["kommuner"]
    ftot = sum(F[k]["kom"][fi] + F[k]["stat"][fi] for k in K)
    fpop = sum(F[k]["pop"][fi] for k in K)
    add("formue", "Formuesskatt per innbygger", "Skatt og inntekt", "kr", fy[fi], "SSB 10333",
        {k: (F[k]["kom"][fi] + F[k]["stat"][fi]) * 1e6 / F[k]["pop"][fi] for k in K if F[k]["pop"][fi]}, ftot * 1e6 / fpop,
        "Formuesskatt til kommune og stat, delt på folketallet.")

    # ---------------- Inntekt (SSB) ----------------
    t = latest_year("06944")
    c = Cube(query("06944", {"Region": "*", "HusholdType": ["0000"], "ContentsCode": ["InntSkatt"], "Tid": [t]}))
    g = lambda r: c.get(Region=r, HusholdType="0000", ContentsCode="InntSkatt", Tid=t) if r in c.index["Region"] else None  # noqa: E731
    add("inntekt", "Median inntekt etter skatt, husholdninger", "Skatt og inntekt", "kr", t, "SSB 06944", {k: g(k) for k in K}, g("0"),
        "Median inntekt etter skatt for alle husholdninger.")

    t = latest_year("05671")
    c = Cube(query("05671", {"Region": "*", "ContentsCode": ["Bruttoinnt", "UtliknSkatt"], "Tid": [t]}))
    g2 = lambda r, cc: c.get(Region=r, ContentsCode=cc, Tid=t) if r in c.index["Region"] else None  # noqa: E731
    add("brutto", "Median bruttoinntekt per person", "Skatt og inntekt", "kr", t, "SSB 05671", {k: g2(k, "Bruttoinnt") for k in K}, g2("0", "Bruttoinnt"),
        "Median bruttoinntekt for bosatte 17 år og eldre.")
    add("medskatt", "Median fastsatt skatt per person", "Skatt og inntekt", "kr", t, "SSB 05671", {k: g2(k, "UtliknSkatt") for k in K}, g2("0", "UtliknSkatt"),
        "Median fastsatt skatt for bosatte 17 år og eldre.")

    t = latest_year("12558")
    c = Cube(query("12558", {"Region": "*", "InntektSkatt": ["00S"], "Desiler": ["01", "10"], "ContentsCode": ["AndelHush"], "Tid": [t]}))
    g3 = lambda r, d: c.get(Region=r, InntektSkatt="00S", Desiler=d, ContentsCode="AndelHush", Tid=t) if r in c.index["Region"] else None  # noqa: E731
    add("desil1", "Andel husholdninger med lavest inntekt", "Skatt og inntekt", "%", t, "SSB 12558", {k: g3(k, "01") for k in K}, 10,
        "Andel husholdninger i laveste nasjonale tidel (desil 1) for inntekt etter skatt. Landet = 10 %.", 1)
    add("desil10", "Andel husholdninger med høyest inntekt", "Skatt og inntekt", "%", t, "SSB 12558", {k: g3(k, "10") for k in K}, 10,
        "Andel husholdninger i høyeste nasjonale tidel (desil 10) for inntekt etter skatt. Landet = 10 %.", 1)

    # ---------------- Arbeid og trygd ----------------
    t = latest_year("06445")
    c = Cube(query("06445", {"Region": "*", "Kjonn": ["0"], "Alder": ["15-74"], "ContentsCode": "*", "Tid": [t]}))
    cc = c.cats("ContentsCode")[0]
    g4 = lambda r: c.get(Region=r, Kjonn="0", Alder="15-74", ContentsCode=cc, Tid=t) if r in c.index["Region"] else None  # noqa: E731
    add("syss", "Andel sysselsatte 15–74 år", "Arbeid og trygd", "%", t, "SSB 06445", {k: g4(k) for k in K}, g4("0"),
        "Sysselsatte i prosent av befolkningen 15–74 år, 4. kvartal.", 1)

    def fhi(table_id, dims, key, name, desc):
        c = Cube(fhi_query(table_id, dims))
        aar = c.cats("AAR")[0]
        label = c.label["AAR"].get(aar, aar)
        coords = {d: c.cats(d)[0] for d in c.ids}

        def val(r):
            if r not in c.index["GEO"]:
                return None
            return c.get(**{**coords, "GEO": r, "MEASURE_TYPE": "RATE"})
        add(key, name, "Arbeid og trygd", "%", label, f"FHI {table_id}", {k: val(k) for k in K}, val("0"), desc, 1)

    fhi(392, {"GEO": "*", "AAR": ("bottom", 1), "KJONN": ["0"], "ALDER": ["20_66"], "MEASURE_TYPE": ["RATE"]},
        "stonad", "Andel 20–66 år på stønad til livsopphold",
        "Mottakere av uføretrygd, arbeidsavklaringspenger, dagpenger, overgangsstønad m.m. i prosent av befolkningen 20–66 år (FHI/NAV).")
    fhi(787, {"GEO": "*", "AAR": ("bottom", 1), "KJONN": ["0"], "ALDER": ["20_66"], "UTDANN": ["0"], "YTELSE": ["varig"], "MEASURE_TYPE": ["RATE"]},
        "ufore", "Andel 20–66 år med uføretrygd", "Uføretrygdede i prosent av befolkningen 20–66 år (FHI/NAV).")
    fhi(664, {"GEO": "*", "AAR": ("bottom", 1), "KJONN": ["0"], "ALDER": ["18_66"], "INNVKAT": ["0"], "STONADSLENGDE": ["Minst_en_gang"], "MEASURE_TYPE": ["RATE"]},
        "sosial", "Andel 18–66 år med sosialhjelp", "Mottakere av økonomisk sosialhjelp i løpet av året, prosent av befolkningen 18–66 år, treårig snitt (FHI).")

    # ---------------- Utdanning ----------------
    t = latest_year("09429")
    c = Cube(query("09429", {"Region": "*", "Nivaa": ["01", "03a", "04a"], "Kjonn": ["0"], "ContentsCode": ["PersonerProsent"], "Tid": [t]}))
    g5 = lambda r, n: c.get(Region=r, Nivaa=n, Kjonn="0", ContentsCode="PersonerProsent", Tid=t) if r in c.index["Region"] else None  # noqa: E731
    hoy = lambda r: None if g5(r, "03a") is None else g5(r, "03a") + (g5(r, "04a") or 0)  # noqa: E731
    add("hoyutd", "Andel med høyere utdanning", "Utdanning", "%", t, "SSB 09429", {k: hoy(k) for k in K}, hoy("0"),
        "Andel 16 år og eldre med universitets- eller høgskoleutdanning (kort eller lang).", 1)
    add("langutd", "Andel med lang høyere utdanning", "Utdanning", "%", t, "SSB 09429", {k: g5(k, "04a") for k in K}, g5("0", "04a"),
        "Andel 16 år og eldre med mer enn fire års universitets- eller høgskoleutdanning.", 1)
    add("grunnskole", "Andel med bare grunnskole", "Utdanning", "%", t, "SSB 09429", {k: g5(k, "01") for k in K}, g5("0", "01"),
        "Andel 16 år og eldre med grunnskole som høyeste fullførte utdanning.", 1)

    out = {
        "kommuner": {k: {"name": reg["kommuner"][k]["name"], "f": reg["kommuner"][k]["f"]} for k in kommuner},
        "fylker": {f: v["name"] for f, v in reg["fylker"].items()},
        "indicators": ind,
    }
    with open(os.path.join(DATA, "kommuneprofil.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print("skrev data/kommuneprofil.json", file=sys.stderr)


if __name__ == "__main__":
    main()
