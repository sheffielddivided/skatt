#!/usr/bin/env python3
"""Henter data fra SSB og bygger de statiske JSON-filene som nettstedet bruker.

Kilder (alle åpne, CC BY 4.0):
  * SSB 07022  Skatteregnskap, akkumulerte tall etter region og skatteart (mill. kr)
  * SSB 07391  Innbetalt og fordelt skatt etter ordning og art (mill. kr)
  * SSB 11342  Areal og befolkning i kommuner og fylker
  * SSB 03014  Konsumprisindeks, årsgjennomsnitt
  * SSB Klass 131  Endringer i kommuneinndelingen (for harmonisering)

Alle kommunetall harmoniseres til dagens kommuneinndeling (2024-) slik at
ett og samme kart kan brukes for alle år, og tidsserier blir sammenlignbare.
Sammenslåinger summeres; ved delinger fordeles tallene etter folketallet i de
nye kommunene det året delingen skjedde.

Kjøres med:  python3 scripts/build_data.py
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
API = "https://data.ssb.no/api/v0/no/table/"
KLASS = "https://data.ssb.no/api/klass/v1/classifications/131/changes?from=2000-01-01&to=2100-01-01"


def get_json(url: str, body: dict | None = None):
    headers = {"Accept": "application/json", "User-Agent": "skatt-visualisering/1.0"}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))


def query(table: str, selections: dict[str, list[str] | str]):
    q = []
    for code, sel in selections.items():
        if sel == "*":
            q.append({"code": code, "selection": {"filter": "all", "values": ["*"]}})
        else:
            q.append({"code": code, "selection": {"filter": "item", "values": sel}})
    return get_json(API + table, {"query": q, "response": {"format": "json-stat2"}})


class Cube:
    """Liten hjelper for json-stat2."""

    def __init__(self, js):
        self.js = js
        self.ids = js["id"]
        self.size = js["size"]
        self.index = {d: js["dimension"][d]["category"]["index"] for d in self.ids}
        self.label = {d: js["dimension"][d]["category"].get("label", {}) for d in self.ids}
        self.values = js["value"]
        if isinstance(self.values, dict):  # sparse format
            n = 1
            for s in self.size:
                n *= s
            arr = [None] * n
            for k, v in self.values.items():
                arr[int(k)] = v
            self.values = arr
        self.updated = js.get("updated")

    def get(self, **coords):
        pos = 0
        for d, s in zip(self.ids, self.size):
            pos = pos * s + self.index[d][coords[d]]
        return self.values[pos]

    def cats(self, dim):
        return list(self.index[dim].keys())


def r1(x):
    return None if x is None else round(x, 1)


def main():
    os.makedirs(DATA, exist_ok=True)

    # ---------------------------------------------------------------- metadata
    meta07022 = get_json(API + "07022")
    tids = [v for v in meta07022["variables"] if v["code"] == "Tid"][0]["values"]
    latest = tids[-1]
    latest_year = int(latest[:4])
    latest_month = int(latest[5:])
    periods = [t for t in tids if t.endswith("M12")]
    if latest_month != 12:
        periods.append(latest)
    years = [int(p[:4]) for p in periods]
    # For et ufullstendig år hentes også samme periode året før (sammenlignbar endring)
    prev_ytd = f"{latest_year - 1}M{latest_month:02d}" if latest_month != 12 else None
    calc_periods = periods + ([prev_ytd] if prev_ytd else [])
    calc_years = years + ([latest_year - 1] if prev_ytd else [])
    print("07022 perioder:", periods[0], "…", periods[-1], file=sys.stderr)

    # ------------------------------------------------------------- befolkning
    pop_js = Cube(query("11342", {"Region": "*", "ContentsCode": ["Folkemengde", "LandArealKm2"], "Tid": "*"}))
    pop_years = [int(y) for y in pop_js.cats("Tid")]

    def pop(code, year):
        y = str(min(year, max(pop_years)))
        try:
            return pop_js.get(Region=code, ContentsCode="Folkemengde", Tid=y)
        except KeyError:
            return None

    def area(code, year):
        try:
            return pop_js.get(Region=code, ContentsCode="LandArealKm2", Tid=str(min(year, max(pop_years))))
        except KeyError:
            return None

    # ------------------------------------------------------- harmonisering
    changes = get_json(KLASS)["codeChanges"]
    by_date = defaultdict(lambda: defaultdict(set))
    for c in changes:
        by_date[c["changeOccurred"]][c["oldCode"]].add(c["newCode"])
    dates = sorted(by_date)

    def harmonize_code(code: str, year: int) -> dict[str, float]:
        """Returnerer {dagens kode: vekt} for en kode gyldig i `year`."""
        cur = {code: 1.0}
        for d in dates:
            if d <= f"{year}-01-01":
                continue
            step = by_date[d]
            nxt: dict[str, float] = defaultdict(float)
            cy = int(d[:4])
            for c, w in cur.items():
                targets = step.get(c)
                if not targets:
                    nxt[c] += w
                    continue
                if c in targets:  # grensejustering – beholder koden
                    nxt[c] += w
                    continue
                if len(targets) == 1:
                    nxt[next(iter(targets))] += w
                    continue
                pops = {t: (pop(t, cy) or 0) for t in targets}
                tot = sum(pops.values()) or len(pops)
                for t in targets:
                    nxt[t] += w * ((pops[t] / tot) if sum(pops.values()) else 1 / len(pops))
            cur = dict(nxt)
        return cur

    # ---------------------------------------------------- skatt per region
    tax = Cube(query("07022", {"Region": "*", "Skatteart": "*", "ContentsCode": "*", "Tid": calc_periods}))
    arts = tax.cats("Skatteart")
    art_labels = tax.label["Skatteart"]
    reg_labels = tax.label["Region"]

    # Dagens kommuner og fylker = kodene med data i siste periode
    cur_k = [r for r in tax.cats("Region") if len(r) == 4 and tax.get(Region=r, Skatteart="00", ContentsCode="Skatt", Tid=latest) is not None]
    cur_f = [r for r in tax.cats("Region") if len(r) == 2 and tax.get(Region=r, Skatteart="00", ContentsCode="Skatt", Tid=latest) is not None]
    special = ["21", "23", "24"]  # Svalbard, Kontinentalsokkelen, kildeskatt mv.
    kommuner = [k for k in cur_k if k[:2] not in special]
    fylker = [f for f in cur_f if f not in special]

    def clean_name(n):
        return n.split(" (")[0]

    nY, nA = len(years), len(arts)
    nC = len(calc_periods)
    kom = {k: [[0.0] * nC for _ in arts] for k in kommuner}
    kpop = {k: [0.0] * nC for k in kommuner}

    for yi, (per, y) in enumerate(zip(calc_periods, calc_years)):
        for r in tax.cats("Region"):
            if len(r) != 4 or r[:2] in special:
                continue
            vals = [tax.get(Region=r, Skatteart=a, ContentsCode="Skatt", Tid=per) for a in arts]
            if all(v is None for v in vals):
                continue
            hm = harmonize_code(r, y)
            for t, w in hm.items():
                if t not in kom:
                    print(f"  advarsel: {r} ({y}) -> {t} finnes ikke i dag", file=sys.stderr)
                    continue
                for ai, v in enumerate(vals):
                    if v is not None:
                        kom[t][ai][yi] += v * w
        # befolkning per 1.1. – harmoniseres på samme måte
        py = min(y, max(pop_years))
        for r in pop_js.cats("Region"):
            if len(r) != 4:
                continue
            p = pop(r, py)
            if not p:
                continue
            for t, w in harmonize_code(r, py).items():
                if t in kpop:
                    kpop[t][yi] += p * w

    def fylke_of(k):
        return k[:2]

    fyl = {f: [[0.0] * nC for _ in arts] for f in fylker}
    fpop = {f: [0.0] * nC for f in fylker}
    for k in kommuner:
        f = fylke_of(k)
        for ai in range(nA):
            for yi in range(nC):
                fyl[f][ai][yi] += kom[k][ai][yi]
        for yi in range(nC):
            fpop[f][yi] += kpop[k][yi]

    other = {}
    for s in special:
        other[s] = {
            "name": clean_name(reg_labels[s]),
            "v": [[r1(tax.get(Region=s, Skatteart=a, ContentsCode="Skatt", Tid=p)) for p in periods] for a in arts],
        }
        if prev_ytd:
            other[s]["ytdPrev"] = [r1(tax.get(Region=s, Skatteart=a, ContentsCode="Skatt", Tid=prev_ytd)) for a in arts]

    def region_out(name, rows, pops, ar, extra=None):
        o = {
            "name": name,
            "v": [[r1(x) for x in row[:nY]] for row in rows],
            "pop": [round(p) for p in pops[:nY]],
            "area": r1(ar),
        }
        if prev_ytd:
            o["ytdPrev"] = [r1(row[nY]) for row in rows]
        if extra:
            o.update(extra)
        return o

    out = {
        "source": "SSB tabell 07022 og 11342",
        "updated": tax.updated,
        "periods": periods,
        "years": years,
        "partial": {"year": latest_year, "month": latest_month} if latest_month != 12 else None,
        "arts": [{"code": a, "name": art_labels[a]} for a in arts],
        "prevYtdPeriod": prev_ytd,
        "kommuner": {
            k: region_out(clean_name(reg_labels[k]), kom[k], kpop[k], area(k, latest_year), {"f": fylke_of(k)})
            for k in kommuner
        },
        "fylker": {
            f: region_out(clean_name(reg_labels[f]), fyl[f], fpop[f], area(f, latest_year))
            for f in fylker
        },
        "other": other,
    }
    with open(os.path.join(DATA, "skatt-regioner.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print("skrev data/skatt-regioner.json", file=sys.stderr)

    # ------------------------------------------------------------ 07391
    c = Cube(query("07391", {"Ordning": "*", "Art": "*", "ContentsCode": "*", "Tid": "*"}))
    t_all = c.cats("Tid")
    series = {}
    for o in c.cats("Ordning"):
        for a in c.cats("Art"):
            vals = [c.get(Ordning=o, Art=a, ContentsCode="Skatterekneskap", Tid=t) for t in t_all]
            if any(v is not None for v in vals):
                series[f"{o}:{a}"] = vals
    kpi = Cube(query("03014", {"Konsumgrp": ["TOTAL"], "ContentsCode": ["KpiAar"], "Tid": "*"}))
    kpi_map = {int(t): kpi.get(Konsumgrp="TOTAL", ContentsCode="KpiAar", Tid=t) for t in kpi.cats("Tid")}
    kpi_map = {y: v for y, v in kpi_map.items() if v is not None and y >= 1979}
    out2 = {
        "source": "SSB tabell 07391 og 03014",
        "updated": c.updated,
        "months": t_all,
        "ordning": c.label["Ordning"],
        "art": c.label["Art"],
        "series": series,
        "kpi": kpi_map,
    }
    with open(os.path.join(DATA, "skatt-ordning.json"), "w", encoding="utf-8") as fh:
        json.dump(out2, fh, ensure_ascii=False, separators=(",", ":"))
    print("skrev data/skatt-ordning.json", file=sys.stderr)

    build_formue(harmonize_code, kommuner, pop, [r for r in pop_js.cats("Region") if len(r) == 4],
                 {k: clean_name(reg_labels[k]) for k in kommuner}, {f: clean_name(reg_labels[f]) for f in fylker})


def build_formue(harmonize_code, kommuner, pop, pop_codes, kom_names, fylke_names):
    """Formuesskatt (10333, 08231) og utvandring av norske statsborgere (09201)."""
    # ---- formuesskatt per region og år ----
    c = Cube(query("10333", {"Region": "*", "ContentsCode": "*", "Tid": "*"}))
    years = [int(t) for t in c.cats("Tid")]
    contents = ["Personer", "FormuesskattKomm", "FormuesskattStat", "SkatteplNettoformue"]

    def g(r, k, y):
        try:
            return c.get(Region=r, ContentsCode=k, Tid=str(y))
        except KeyError:
            return None

    national = {k: [g("0", k, y) for y in years] for k in contents}
    kyears = [y for y in years if y >= 2007]
    agg = {k: {ct: [0.0] * len(kyears) for ct in contents} for k in kommuner}
    kpop = {k: [0.0] * len(kyears) for k in kommuner}
    for yi, y in enumerate(kyears):
        for r in c.cats("Region"):
            if len(r) != 4 or r.endswith("99") or r[:2] in ("21", "23", "24"):
                continue
            vals = {ct: g(r, ct, y) for ct in contents}
            if all(v in (None, 0) for v in vals.values()):
                continue
            for t, w in harmonize_code(r, y).items():
                if t not in agg:
                    continue
                for ct, v in vals.items():
                    if v is not None:
                        agg[t][ct][yi] += v * w
    # Folketall per 1.1. året etter (formuen måles 31.12. i inntektsåret),
    # harmonisert til dagens kommuner på samme måte som skattetallene.
    for yi, y in enumerate(kyears):
        py = y + 1
        for r in pop_codes:
            p = pop(r, py)
            if not p:
                continue
            for t, w in harmonize_code(r, py).items():
                if t in kpop:
                    kpop[t][yi] += p * w
    kom_out = {}
    for k in kommuner:
        a = agg[k]
        kom_out[k] = {
            "name": kom_names[k],
            "f": k[:2],
            "n": [round(x) for x in a["Personer"]],
            # 1 000 kr -> mill. kr
            "kom": [round(x / 1000, 2) for x in a["FormuesskattKomm"]],
            "stat": [round(x / 1000, 2) for x in a["FormuesskattStat"]],
            "formue": [round(x / 1000) for x in a["SkatteplNettoformue"]],
            "pop": [round(x) for x in kpop[k]],
        }

    # ---- fordeling etter størrelse på formuesskatten ----
    b = Cube(query("08231", {"FormuesSkatt1": "*", "ContentsCode": ["AntallPers", "GjennomsnittFormSkat"], "Tid": "*"}))
    byears = [int(t) for t in b.cats("Tid")]
    brackets = []
    for code in b.cats("FormuesSkatt1"):
        if code in ("01", "02"):
            continue
        brackets.append({
            "code": code,
            "name": b.label["FormuesSkatt1"][code],
            "n": [b.get(FormuesSkatt1=code, ContentsCode="AntallPers", Tid=str(y)) for y in byears],
            "avg": [b.get(FormuesSkatt1=code, ContentsCode="GjennomsnittFormSkat", Tid=str(y)) for y in byears],
        })

    # ---- utvandring av norske statsborgere etter land ----
    e = Cube(query("09201", {"Land": "*", "Statsbrgskap": ["000"], "ContentsCode": ["Utvandring"], "Tid": "*"}))
    eyears = [int(t) for t in e.cats("Tid")]
    countries = {}
    total = [0] * len(eyears)
    for land in e.cats("Land"):
        vals = [e.get(Land=land, Statsbrgskap="000", ContentsCode="Utvandring", Tid=str(y)) or 0 for y in eyears]
        total = [a + v for a, v in zip(total, vals)]
        if sum(vals) >= 150 and land not in ("990",):
            countries[land] = {"name": e.label["Land"][land], "v": vals}

    out = {
        "source": "SSB tabell 10333, 08231 og 09201",
        "updated": max(filter(None, [c.updated, b.updated, e.updated])),
        "years": years,
        "national": {
            "n": national["Personer"],
            "kom": [None if v is None else round(v / 1000, 1) for v in national["FormuesskattKomm"]],
            "stat": [None if v is None else round(v / 1000, 1) for v in national["FormuesskattStat"]],
            "formue": [None if v is None else round(v / 1000) for v in national["SkatteplNettoformue"]],
        },
        "kyears": kyears,
        "kommuner": kom_out,
        "fylker": fylke_names,
        "byears": byears,
        "brackets": brackets,
        "eyears": eyears,
        "emigration": {"total": total, "countries": countries},
    }
    with open(os.path.join(DATA, "formue.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print("skrev data/formue.json", file=sys.stderr)


if __name__ == "__main__":
    main()
