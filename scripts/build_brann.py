#!/usr/bin/env python3
"""Boligbranner i kommunene, sammenholdt med boligpriser og flytting.

Samme format som data/kommuneprofil.json, slik at Kommuneprofilen-motoren kan
gjenbrukes. Alle tall er regnet om til dagens kommuneinndeling.

Kilder:
  SSB 12058  KOSTRA brann- og ulykkesvern (boligbranner, bygningsbranner, erstatning, piper), 2015–
  SSB 06035  Selveierboliger: kvadratmeterpris og antall omsetninger etter boligtype
  SSB 06913  Befolkning og endringer (folkemengde, nettoinnflytting)
  data/alder/index.json (folketall og alder, dagens inndeling)
Skriver data/brann.json. Forutsetter data/skatt-regioner.json og data/alder/index.json.
"""
from __future__ import annotations

import json
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ssblib import Cube, Harmonizer, meta, query  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
FIRST = 2015
PRICE_YEARS = 10  # antall år som slås sammen for boligpris


def num(v):
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def tids(table):
    return [v for v in meta(table)["variables"] if v["code"] == "Tid"][0]["values"]


def main():
    reg = json.load(open(os.path.join(DATA, "skatt-regioner.json"), encoding="utf-8"))
    alder = json.load(open(os.path.join(DATA, "alder", "index.json"), encoding="utf-8"))
    K = list(reg["kommuner"].keys())
    ay = alder["years"]

    def pop(k, y):
        src = alder["norge"] if k == "NO" else alder["kommuner"][k]
        y = min(max(int(y), ay[0]), ay[-1])
        return src["ind"]["pop"][ay.index(y)]

    # ---------- Befolkning og flytting (06913) – også folketall for deling av kommuner
    fy = [y for y in tids("06913") if int(y) >= FIRST - 1]
    b = Cube(query("06913", {"Region": "*", "ContentsCode": ["Folkemengde", "Nettoinnflytting"], "Tid": fy}))
    v1 = lambda r, c, y: b.get(Region=r, ContentsCode=c, Tid=str(y)) if r in b.index["Region"] and str(y) in b.index["Tid"] else None  # noqa: E731
    harm = Harmonizer(lambda code, y: v1(code, "Folkemengde", y))

    def harmonized(get, codes, years):
        """Summerer get(kode, år) over år, fordelt til dagens kommuner."""
        out = defaultdict(float)
        for y in years:
            for r in codes:
                v = num(get(r, y))
                if v is None:
                    continue
                for t, w in harm(r, int(y)).items():
                    out[t] += v * w
        return out

    ind = []

    def add(key, name, group, unit, year, source, values, national, desc, digits=1, log=False):
        vals = {k: (None if num(values.get(k)) is None else round(num(values[k]), digits)) for k in K}
        print(f"  {key}: {sum(v is not None for v in vals.values())} kommuner, {year}", file=sys.stderr)
        ind.append({"key": key, "name": name, "group": group, "unit": unit, "year": str(year), "source": source, "desc": desc,
                    "national": None if num(national) is None else round(num(national), digits), "values": vals, "log": log,
                    **({"dec": 2} if digits == 2 else {})})

    # ---------- Brann (KOSTRA 12058)
    by = [y for y in tids("12058") if int(y) >= FIRST]
    c = Cube(query("12058", {"KOKkommuneregion0000": "*", "ContentsCode": ["KOSboligbranner0000", "KOSbygningsbrann0000", "KOSerstatnbygnin0000", "KOSpiper0000"], "Tid": by}))
    kcodes = [r for r in c.cats("KOKkommuneregion0000") if r.isdigit() and len(r) == 4]
    g = lambda cc: (lambda r, y: c.get(KOKkommuneregion0000=r, ContentsCode=cc, Tid=str(y)))  # noqa: E731
    popyears = lambda k, ys: sum(pop(k, int(y) + 1) for y in ys)  # noqa: E731  folketall ved utgangen av hvert år
    period = f"{by[0]}–{by[-1]}"

    def rate(cc, ys, per=1000):
        tot = harmonized(g(cc), kcodes, ys)
        vals = {k: (per * tot[k] / popyears(k, ys) if k in tot and popyears(k, ys) else None) for k in K}
        nat = per * sum(tot[k] for k in K if k in tot) / popyears("NO", ys)
        return vals, nat, tot

    v, n, tot_bolig = rate("KOSboligbranner0000", by)
    add("brann", "Boligbranner", "Brann", "per 1 000 innb.", period, "SSB 12058 (KOSTRA)", v, n,
        f"Boligbranner per 1 000 innbyggere per år, snitt for {period}. Mange år er slått sammen fordi tallene svinger mye i små kommuner.", 2)
    last5 = by[-5:]
    v, n, _ = rate("KOSboligbranner0000", last5)
    add("brann5", "Boligbranner siste fem år", "Brann", "per 1 000 innb.", f"{last5[0]}–{last5[-1]}", "SSB 12058 (KOSTRA)", v, n,
        f"Boligbranner per 1 000 innbyggere per år, snitt for {last5[0]}–{last5[-1]}.", 2)
    v, n, _ = rate("KOSbygningsbrann0000", by)
    add("bygbrann", "Bygningsbranner", "Brann", "per 1 000 innb.", period, "SSB 12058 (KOSTRA)", v, n,
        f"Alle bygningsbranner (boliger, næringsbygg, landbruksbygg m.m.) per 1 000 innbyggere per år, snitt for {period}.", 2)
    v, n, _ = rate("KOSerstatnbygnin0000", by, per=1)
    add("erstatning", "Brannskader (anslått erstatning)", "Brann", "kr", period, "SSB 12058 (KOSTRA)", v, n,
        f"Anslått erstatning etter bygningsbranner, kroner per innbygger per år, snitt for {period}.", 0, log=True)
    ly = by[-1]
    tot = harmonized(g("KOSpiper0000"), kcodes, [ly])
    add("piper", "Piper (ildsteder)", "Brann", "per 1 000 innb.", ly, "SSB 12058 (KOSTRA)",
        {k: (1000 * tot[k] / pop(k, int(ly) + 1) if tot.get(k) else None) for k in K}, 1000 * sum(tot.values()) / pop("NO", int(ly) + 1),
        "Registrerte piper (skorsteiner) per 1 000 innbyggere – et mål på hvor vanlig vedfyring er.", 0)

    # ---------- Boligpris (06035), justert for boligtype
    py = tids("06035")[-PRICE_YEARS:]
    p = Cube(query("06035", {"Region": "*", "Boligtype": ["01", "02", "03"], "ContentsCode": ["KvPris", "Omsetninger"], "Tid": py}))
    pcodes = [r for r in p.cats("Region") if r.isdigit() and len(r) == 4]
    nat_pp = {}  # landspris per boligtype og år
    for bt in ("01", "02", "03"):
        for y in py:
            pr = num(p.get(Region="0", Boligtype=bt, ContentsCode="KvPris", Tid=y))
            if pr:
                nat_pp[(bt, y)] = pr
    rel_num, rel_den = defaultdict(float), defaultdict(float)  # sum(antall × kommunepris/landspris), sum(antall)
    for y in py:
        for r in pcodes:
            for bt in ("01", "02", "03"):
                pr, cnt = num(p.get(Region=r, Boligtype=bt, ContentsCode="KvPris", Tid=y)), num(p.get(Region=r, Boligtype=bt, ContentsCode="Omsetninger", Tid=y))
                if not pr or not cnt or (bt, y) not in nat_pp:
                    continue
                for t, w in harm(r, int(y)).items():
                    rel_num[t] += w * cnt * pr / nat_pp[(bt, y)]
                    rel_den[t] += w * cnt
    add("boligpris", "Boligpris mot landet", "Bolig og befolkning", "landet = 100", f"{py[0]}–{py[-1]}", "SSB 06035",
        {k: (100 * rel_num[k] / rel_den[k] if rel_den.get(k, 0) >= 10 else None) for k in K}, 100,
        f"Kvadratmeterpris for brukte selveierboliger sammenlignet med landet (= 100), justert for fordelingen mellom eneboliger, småhus og blokkleiligheter. Snitt for {py[0]}–{py[-1]}. Hvert år er sammenlignet med landsprisen samme år. SSB oppgir ikke pris i kommuner med svært få salg, og kommuner med færre enn 10 salg i perioden mangler.", 0)

    # ---------- Flytting og befolkning
    my = [y for y in fy if FIRST <= int(y) <= int(by[-1])]
    net = harmonized(lambda r, y: v1(r, "Nettoinnflytting", y), [r for r in b.cats("Region") if r.isdigit() and len(r) == 4], my)
    mper = f"{my[0]}–{my[-1]}"
    add("flytting", "Netto innflytting", "Bolig og befolkning", "per 1 000 innb.", mper, "SSB 06913",
        {k: 1000 * net[k] / popyears(k, my) if k in net else None for k in K}, 1000 * sum(net[k] for k in K if k in net) / popyears("NO", my),
        f"Innflyttinger minus utflyttinger (både innenlands og fra utlandet) per 1 000 innbyggere per år, snitt for {mper}. Negative tall betyr at flere flytter ut enn inn.", 1)
    y0, y1 = FIRST, ay[-1]
    add("vekst", "Befolkningsendring", "Bolig og befolkning", "%", f"{y0}–{y1}", "SSB 07459",
        {k: 100 * pop(k, y1) / pop(k, y0) - 100 for k in K}, 100 * pop("NO", y1) / pop("NO", y0) - 100,
        f"Endring i folketallet fra 1. januar {y0} til 1. januar {y1}.", 1)
    ai = ay.index(y1)
    add("eldre", "Andel 67 år og eldre", "Bolig og befolkning", "%", y1, "SSB 07459",
        {k: alder["kommuner"][k]["ind"]["a67"][ai] for k in K}, alder["norge"]["ind"]["a67"][ai], "Andel av befolkningen som er 67 år eller eldre.", 1)
    add("pop", "Folketall", "Bolig og befolkning", "antall", y1, "SSB 07459", {k: pop(k, y1) for k in K}, pop("NO", y1), "Folketall per 1. januar.", 0, log=True)

    out = {
        "kommuner": {k: {"name": reg["kommuner"][k]["name"], "f": reg["kommuner"][k]["f"]} for k in K},
        "fylker": {f: v["name"] for f, v in reg["fylker"].items()},
        "indicators": ind,
        "defaults": {"x": "boligpris", "y": "brann"},
        "presets": [
            {"id": "pris", "label": "Boligpris og boligbranner", "x": "boligpris", "y": "brann"},
            {"id": "flytt", "label": "Flytting og boligbranner", "x": "flytting", "y": "brann"},
            {"id": "vekst", "label": "Befolkningsendring og boligbranner", "x": "vekst", "y": "brann"},
            {"id": "eldre", "label": "Eldre og boligbranner", "x": "eldre", "y": "brann"},
            {"id": "piper", "label": "Piper og boligbranner", "x": "piper", "y": "brann"},
            {"id": "prisflytt", "label": "Flytting og boligpris", "x": "flytting", "y": "boligpris"},
        ],
        "branner_totalt": round(sum(tot_bolig.values())),
    }
    with open(os.path.join(DATA, "brann.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print("skrev data/brann.json", file=sys.stderr)


if __name__ == "__main__":
    main()
