"""Produksjonshistorikken på norsk sokkel fra Sokkeldirektoratet (Sodir).

Henter årlig produksjon per felt (lag 7300), feltfakta og midtpunkt (lag 7100)
og reserver per felt (lag 7113) fra Sodirs åpne FactMaps-API og skriver
data/sokkel.json. Kun Python-standardbiblioteket.

    python3 scripts/build_sokkel.py
"""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
from ssblib import get_json  # noqa: E402

BASE = "https://factmaps.sodir.no/api/rest/services/DataService/Data/FeatureServer"
PROD_LAYER, FIELD_LAYER, RES_LAYER = 7300, 7100, 7113
PAGE = 2000
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "sokkel.json")


def layer(lay: int, fields: str, where: str = "1=1", extra: dict | None = None):
    """Alle rader fra et lag, sidevis og sortert på OBJECTID så ingen rader faller ut."""
    rows, offset = [], 0
    while True:
        params = {"f": "json", "where": where, "outFields": fields, "returnGeometry": "false",
                  "orderByFields": "OBJECTID ASC", "resultOffset": offset, "resultRecordCount": PAGE}
        params.update(extra or {})
        data = get_json(f"{BASE}/{lay}/query?" + urllib.parse.urlencode(params))
        if "error" in data:
            raise RuntimeError(data["error"])
        feats = data.get("features", [])
        rows.extend(feats)
        offset += len(feats)
        if not feats or not data.get("exceededTransferLimit"):
            return rows


def num(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def title(name: str) -> str:
    """EKOFISK → Ekofisk, JOHAN SVERDRUP → Johan Sverdrup, 15/9-F → 15/9-F."""
    return " ".join(w if any(c.isdigit() for c in w) else w.capitalize() for w in name.split())


def main():
    print("Sodir: felt …", file=sys.stderr)
    meta = {}
    for f in layer(FIELD_LAYER, "fldNpdidField,fldName,fldCurrentActivitySatus,fldDiscoveryYear,"
                                "fldHcType,fldMainArea,cmpLongName",
                   extra={"returnCentroid": "true", "outSR": "4326"}):
        a, c = f["attributes"], f.get("centroid") or {}
        meta[a["fldNpdidField"]] = {
            "name": title(a["fldName"]), "status": a.get("fldCurrentActivitySatus"),
            "disc": a.get("fldDiscoveryYear"), "hc": a.get("fldHcType"), "area": a.get("fldMainArea"),
            "op": a.get("cmpLongName"),
            "lon": round(c["x"], 3) if "x" in c else None, "lat": round(c["y"], 3) if "y" in c else None,
        }

    print("Sodir: reserver …", file=sys.stderr)
    res = {}
    for f in layer(RES_LAYER, "fldNpdidField,fldRecoverableOE,fldRemainingOE"):
        a = f["attributes"]
        res[a["fldNpdidField"]] = (num(a.get("fldRecoverableOE")), num(a.get("fldRemainingOE")))

    print("Sodir: produksjon …", file=sys.stderr)
    cols = ("prfPrdOilNetMillSm3", "prfPrdGasNetBillSm3", "prfPrdNGLNetMillSm3",
            "prfPrdCondensateNetMillSm3", "prfPrdOeNetMillSm3")
    prod = layer(PROD_LAYER, "prfNpdidInformationCarrier,prfYear,prfMonth," + ",".join(cols),
                 "prfInformationCarrierKind='FIELD'")

    # Inneværende år er ufullstendig: finn siste måned med rapportert produksjon.
    now = datetime.now(timezone.utc).year
    months = {}
    for f in prod:
        a = f["attributes"]
        if a["prfMonth"] and a["prfYear"] <= now and num(a["prfPrdOeNetMillSm3"]) > 0:
            months[a["prfYear"]] = max(months.get(a["prfYear"], 0), a["prfMonth"])
    last = max(months)
    partial = {"year": last, "months": months[last]} if months[last] < 12 else None

    per = {}
    for f in prod:
        a = f["attributes"]
        y = a["prfYear"]
        if a["prfMonth"] != 0 or y > last:   # årsrader; Sodir har nullrader langt fram i tid
            continue
        per.setdefault(a["prfNpdidInformationCarrier"], {})[y] = [num(a[c]) for c in cols]

    first = min(y for s in per.values() for y, v in s.items() if v[4] > 0)
    years = list(range(first, last + 1))
    totals = {k: [0.0] * len(years) for k in ("oil", "gas", "ngl", "cond", "oe")}
    fields = []
    for fid, s in per.items():
        oe = [s.get(y, [0] * 5)[4] for y in years]
        if sum(oe) <= 0:
            continue
        for i, y in enumerate(years):
            for k, v in zip(totals, s.get(y, [0] * 5)):
                totals[k][i] += v
        nz = [i for i, v in enumerate(oe) if v > 0]
        m = meta.get(fid, {"name": str(fid)})
        rec, rem = res.get(fid, (None, None))
        fields.append({"id": fid, **m, "start": years[nz[0]], "end": years[nz[-1]],
                       "rec": rec, "rem": rem, "y0": years[nz[0]],
                       "oe": [round(v, 3) for v in oe[nz[0]: nz[-1] + 1]]})
    fields.sort(key=lambda f: -sum(f["oe"]))

    out = {
        "source": "Sokkeldirektoratet (Sodir), FactPages/FactMaps – NLOD 2.0",
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "units": "oe/olje/NGL/kondensat i mill. Sm³, gass i mrd. Sm³",
        "years": years, "partial": partial,
        "totals": {k: [round(v, 3) for v in arr] for k, arr in totals.items()},
        "fields": fields,
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    tot = sum(out["totals"]["oe"])
    print(f"Skrev {OUT}: {len(fields)} felt, {years[0]}–{years[-1]}, {tot:,.0f} mill. Sm³ o.e.", file=sys.stderr)


if __name__ == "__main__":
    main()
