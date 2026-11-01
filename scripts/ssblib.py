"""Felles hjelpefunksjoner for å hente data fra SSB (og FHI) og harmonisere kommunekoder."""
from __future__ import annotations

import json
import sys
import time
import urllib.request
from collections import defaultdict

API = "https://data.ssb.no/api/v0/no/table/"
KLASS = "https://data.ssb.no/api/klass/v1/classifications/131/changes?from=1980-01-01&to=2100-01-01"
FHI = "https://statistikk-data.fhi.no/api/open/v1/nokkel/Table/"


def get_json(url: str, body: dict | None = None, tries: int = 4):
    headers = {"Accept": "application/json", "User-Agent": "skatt-visualisering/1.0"}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=headers)
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            if attempt == tries - 1:
                raise
            print(f"  feil ({e}), prøver igjen …", file=sys.stderr)
            time.sleep(2 ** (attempt + 1))


def query(table: str, selections: dict):
    q = []
    for code, sel in selections.items():
        if sel == "*":
            q.append({"code": code, "selection": {"filter": "all", "values": ["*"]}})
        else:
            q.append({"code": code, "selection": {"filter": "item", "values": sel}})
    return get_json(API + table, {"query": q, "response": {"format": "json-stat2"}})


def meta(table: str):
    return get_json(API + table)


def fhi_query(table_id: int, dims: dict):
    body = {"dimensions": [], "response": {"format": "json-stat2", "maxRowCount": 500000}}
    for code, sel in dims.items():
        if sel == "*":
            body["dimensions"].append({"code": code, "filter": "all", "values": ["*"]})
        elif isinstance(sel, tuple) and sel[0] == "bottom":
            body["dimensions"].append({"code": code, "filter": "bottom", "values": [str(sel[1])]})
        else:
            body["dimensions"].append({"code": code, "filter": "item", "values": sel})
    return get_json(f"{FHI}{table_id}/data", body)


class Cube:
    """Liten hjelper for json-stat2 (SSB og FHI)."""

    def __init__(self, js):
        self.ids = js["id"]
        self.size = js["size"]
        self.index = {}
        self.label = {}
        for d in self.ids:
            cat = js["dimension"][d]["category"]
            idx = cat["index"]
            if isinstance(idx, list):
                idx = {k: i for i, k in enumerate(idx)}
            self.index[d] = idx
            self.label[d] = cat.get("label", {})
        vals = js["value"]
        if isinstance(vals, dict):
            n = 1
            for s in self.size:
                n *= s
            arr = [None] * n
            for k, v in vals.items():
                arr[int(k)] = v
            vals = arr
        self.values = vals
        self.updated = js.get("updated")

    def get(self, **coords):
        pos = 0
        for d, s in zip(self.ids, self.size):
            pos = pos * s + self.index[d][coords[d]]
        return self.values[pos]

    def cats(self, dim):
        return list(self.index[dim].keys())


class Harmonizer:
    """Mapper kommunekoder fra et gitt år til dagens inndeling.

    Sammenslåinger summeres. Ved delinger fordeles verdien etter folketallet
    i de nye kommunene det året delingen skjedde (pop_fn(kode, år))."""

    def __init__(self, pop_fn):
        changes = get_json(KLASS)["codeChanges"]
        self.by_date = defaultdict(lambda: defaultdict(set))
        for c in changes:
            self.by_date[c["changeOccurred"]][c["oldCode"]].add(c["newCode"])
        self.dates = sorted(self.by_date)
        self.pop_fn = pop_fn
        self._cache = {}

    def __call__(self, code: str, year: int) -> dict[str, float]:
        key = (code, year)
        if key in self._cache:
            return self._cache[key]
        cur = {code: 1.0}
        for d in self.dates:
            if d <= f"{year}-01-01":
                continue
            step = self.by_date[d]
            cy = int(d[:4])
            nxt: dict[str, float] = defaultdict(float)
            for c, w in cur.items():
                targets = step.get(c)
                if not targets or c in targets:
                    nxt[c] += w
                elif len(targets) == 1:
                    nxt[next(iter(targets))] += w
                else:
                    pops = {t: (self.pop_fn(t, cy) or 0) for t in targets}
                    tot = sum(pops.values())
                    for t in targets:
                        nxt[t] += w * (pops[t] / tot if tot else 1 / len(targets))
            cur = dict(nxt)
        self._cache[key] = cur
        return cur
