#!/usr/bin/env python3
"""Kommune-Norge i tall: leger, sykepleiere, barnehage, skole, biler, snøscootere,
traktorer, hytter, jegere, kirke, kino, bibliotek og lovbrudd per kommune.

Samme format som data/kommuneprofil.json, slik at Kommuneprofilen-motoren kan
gjenbrukes. Siste tilgjengelige år, dagens kommuneinndeling. Skriver
data/kommunehverdag.json. Forutsetter data/skatt-regioner.json og data/alder/index.json.
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ssblib import Cube, meta, query  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")


def num(v):
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def last_tid(table):
    return [v for v in meta(table)["variables"] if v["code"] == "Tid"][0]["values"][-1]


def main():
    reg = json.load(open(os.path.join(DATA, "skatt-regioner.json"), encoding="utf-8"))
    alder = json.load(open(os.path.join(DATA, "alder", "index.json"), encoding="utf-8"))
    K = list(reg["kommuner"].keys())
    ay = alder["years"]

    def pop(k, year):
        """Folketall 1.1. året etter (bestandstall per 31.12.), ellers nærmeste år."""
        y = min(int(year) + 1, ay[-1])
        src = alder["norge"] if k == "NO" else alder["kommuner"][k]
        return src["ind"]["pop"][ay.index(y)]

    ind = []

    def add(key, name, group, unit, year, source, values, national, desc, digits=1, log=False):
        vals = {k: (None if num(values.get(k)) is None else round(num(values[k]), digits)) for k in K}
        print(f"  {key}: {sum(v is not None for v in vals.values())} kommuner, {year}", file=sys.stderr)
        ind.append({"key": key, "name": name, "group": group, "unit": unit, "year": str(year), "source": source, "desc": desc,
                    "national": None if num(national) is None else round(num(national), digits), "values": vals, "log": log})

    # ---------- Befolkning (for prikkstørrelse) ----------
    add("pop", "Folketall", "Befolkning", "antall", ay[-1], "SSB 07459", {k: alder["kommuner"][k]["ind"]["pop"][-1] for k in K},
        alder["norge"]["ind"]["pop"][-1], "Folketall per 1. januar.", 0, log=True)

    # ---------- Helse og omsorg (KOSTRA) ----------
    t = last_tid("11996")
    c = Cube(query("11996", {"KOKavtaleform0000": ["sum"], "KOKfunksjon0000": ["FGK10"], "KOKkommuneregion0000": "*", "ContentsCode": ["KOSlegeprtitus0000"], "Tid": [t]}))
    g = lambda r: c.get(KOKavtaleform0000="sum", KOKfunksjon0000="FGK10", KOKkommuneregion0000=r, ContentsCode="KOSlegeprtitus0000", Tid=t) if r in c.index["KOKkommuneregion0000"] else None  # noqa: E731
    add("leger", "Legeårsverk", "Helse og omsorg", "per 10 000 innb.", t, "SSB 11996", {k: g(k) for k in K}, g("EAK"),
        "Avtalte legeårsverk i kommunens helse- og omsorgstjenester (fastleger, legevakt, sykehjem, helsestasjon m.m.) per 10 000 innbyggere.")
    t = last_tid("14533")
    c = Cube(query("14533", {"KOKkommuneregion0000": "*", "KOKyrker0000": ["TOT", "01", "02"], "ContentsCode": ["KOSaarsvprtitus0000"], "Tid": [t]}))
    g2 = lambda r, y: c.get(KOKkommuneregion0000=r, KOKyrker0000=y, ContentsCode="KOSaarsvprtitus0000", Tid=t) if r in c.index["KOKkommuneregion0000"] else None  # noqa: E731
    syk = lambda r: None if num(g2(r, "01")) is None else num(g2(r, "01")) + (num(g2(r, "02")) or 0)  # noqa: E731
    add("sykepl", "Sykepleierårsverk i omsorgstjenestene", "Helse og omsorg", "per 10 000 innb.", t, "SSB 14533", {k: syk(k) for k in K}, syk("EAK"),
        "Avtalte årsverk for sykepleiere og spesialsykepleiere i kommunale omsorgstjenester (sykehjem, hjemmetjenester) per 10 000 innbyggere.")
    add("omsorg", "Årsverk i omsorgstjenestene", "Helse og omsorg", "per 10 000 innb.", t, "SSB 14533", {k: g2(k, "TOT") for k in K}, g2("EAK", "TOT"),
        "Alle avtalte årsverk i kommunale omsorgstjenester per 10 000 innbyggere.", 0)

    # ---------- Barnehage og skole (KOSTRA) ----------
    t = last_tid("13502")
    c = Cube(query("13502", {"KOKkommuneregion0000": "*", "ContentsCode": ["KOSandel150000", "KOSbarnaav0000"], "Tid": [t]}))
    g3 = lambda r, cc: c.get(KOKkommuneregion0000=r, ContentsCode=cc, Tid=t) if r in c.index["KOKkommuneregion0000"] else None  # noqa: E731
    add("barnehage", "Barn 1–5 år i barnehage", "Barnehage og skole", "%", t, "SSB 13502", {k: g3(k, "KOSandel150000") for k in K}, g3("EAK", "KOSandel150000"),
        "Andel barn 1–5 år med barnehageplass.")
    add("bhgbemanning", "Barn per ansatt i barnehagen", "Barnehage og skole", "barn", t, "SSB 13502", {k: g3(k, "KOSbarnaav0000") for k in K}, g3("EAK", "KOSbarnaav0000"),
        "Antall barn (korrigert for alder og oppholdstid) per årsverk til grunnbemanning.")
    t = last_tid("12255")
    c = Cube(query("12255", {"KOKkommuneregion0000": "*", "ContentsCode": ["KOSgrstr20000", "KOSgrunnskolepoe0000"], "Tid": [t]}))
    g4 = lambda r, cc: c.get(KOKkommuneregion0000=r, ContentsCode=cc, Tid=t) if r in c.index["KOKkommuneregion0000"] else None  # noqa: E731
    add("gruppe", "Elever per lærer (gruppestørrelse)", "Barnehage og skole", "elever", t, "SSB 12255", {k: g4(k, "KOSgrstr20000") for k in K}, g4("EAK", "KOSgrstr20000"),
        "Gruppestørrelse 2: antall elever per lærer i ordinær undervisning, 1.–10. trinn.")
    add("grunnskolepoeng", "Grunnskolepoeng", "Barnehage og skole", "poeng", t, "SSB 12255", {k: g4(k, "KOSgrunnskolepoe0000") for k in K}, g4("EAK", "KOSgrunnskolepoe0000"),
        "Gjennomsnittlig grunnskolepoeng for elevene som gikk ut av 10. trinn.")

    # ---------- Kjøretøy (SSB 07849) ----------
    t = last_tid("07849")
    c = Cube(query("07849", {"Region": "*", "KjoringensArt": "*", "DrivstoffType": "*", "ContentsCode": ["Personbil1", "Traktor", "Belte", "TungMot"], "Tid": [t]}))

    def veh(r, cc, fuel=None):
        if r not in c.index["Region"]:
            return None
        s = 0
        for a in c.cats("KjoringensArt"):
            for f in c.cats("DrivstoffType"):
                if fuel and f != fuel:
                    continue
                s += c.get(Region=r, KjoringensArt=a, DrivstoffType=f, ContentsCode=cc, Tid=t) or 0
        return s
    per1000 = lambda r, cc: (lambda v: None if v is None else 1000 * v / pop(r if r != "0" else "NO", t))(veh(r, cc))  # noqa: E731
    add("biler", "Personbiler", "Kjøretøy", "per 1 000 innb.", t, "SSB 07849", {k: per1000(k, "Personbil1") for k in K}, per1000("0", "Personbil1"),
        "Registrerte personbiler per 1 000 innbyggere ved utgangen av året. Kommuner der store leasing- eller utleieselskaper har registrert bilene sine, får svært høye tall.", 0)
    elandel = lambda r: (lambda tot, el: None if not tot else 100 * el / tot)(veh(r, "Personbil1"), veh(r, "Personbil1", "5"))  # noqa: E731
    add("elbil", "Elbilandel av personbilene", "Kjøretøy", "%", t, "SSB 07849", {k: elandel(k) for k in K}, elandel("0"),
        "Andel av alle registrerte personbiler som går på strøm.")
    add("traktor", "Traktorer", "Kjøretøy", "per 1 000 innb.", t, "SSB 07849", {k: per1000(k, "Traktor") for k in K}, per1000("0", "Traktor"),
        "Registrerte traktorer per 1 000 innbyggere.", 0, log=True)
    add("snoscooter", "Snøscootere", "Kjøretøy", "per 1 000 innb.", t, "SSB 07849", {k: per1000(k, "Belte") for k in K}, per1000("0", "Belte"),
        "Registrerte snøscootere per 1 000 innbyggere.", 1, log=True)
    add("mc", "Tunge motorsykler", "Kjøretøy", "per 1 000 innb.", t, "SSB 07849", {k: per1000(k, "TungMot") for k in K}, per1000("0", "TungMot"),
        "Registrerte tunge motorsykler per 1 000 innbyggere.", 1)

    # ---------- Fritid og kultur ----------
    t = last_tid("05467")
    c = Cube(query("05467", {"Region": "*", "ContentsCode": ["Fribygg"], "Tid": [t]}))
    hyt = lambda r: (lambda v: None if v is None else 1000 * v / pop(r if r != "0" else "NO", int(t) - 1))(c.get(Region=r, ContentsCode="Fribygg", Tid=t) if r in c.index["Region"] else None)  # noqa: E731
    add("hytter", "Hytter og fritidsboliger", "Fritid og kultur", "per 1 000 innb.", t, "SSB 05467", {k: hyt(k) for k in K}, hyt("0"),
        "Fritidsbygninger i kommunen per 1 000 innbyggere (hyttene ligger i kommunen, eierne kan bo andre steder).", 0, log=True)
    t = last_tid("07709")
    c = Cube(query("07709", {"Region": "*", "Kjonn": "*", "Jakt": ["00"], "ContentsCode": ["Jegere"], "Tid": [t]}))
    yr = int(t[-4:])

    def jeg(r):
        if r not in c.index["Region"]:
            return None
        v = sum((c.get(Region=r, Kjonn=s, Jakt="00", ContentsCode="Jegere", Tid=t) or 0) for s in c.cats("Kjonn"))
        return 1000 * v / pop(r if r != "0" else "NO", yr - 1)
    jvals = {k: jeg(k) for k in K}
    jnat = jeg("0")
    if jnat is None:  # landstall mangler i tabellen – summer kommunene
        jnat = 1000 * sum(v * pop(k, yr - 1) / 1000 for k, v in jvals.items() if v is not None) / pop("NO", yr - 1)
    add("jegere", "Aktive jegere", "Fritid og kultur", "per 1 000 innb.", t, "SSB 07709", jvals, jnat,
        "Personer som jaktet småvilt eller hjortevilt i jaktåret, etter bostedskommune, per 1 000 innbyggere. De fleste har våpen.", 0)
    t = last_tid("11817")
    c = Cube(query("11817", {"KOKkommuneregion0000": "*", "ContentsCode": ["KOSbesokkinosaml0000"], "Tid": [t]}))
    kino = lambda r: (lambda v: None if v is None else v / pop(r if r != "EAK" else "NO", int(t) - 1))(c.get(KOKkommuneregion0000=r, ContentsCode="KOSbesokkinosaml0000", Tid=t) if r in c.index["KOKkommuneregion0000"] else None)  # noqa: E731
    add("kino", "Kinobesøk", "Fritid og kultur", "per innb.", t, "SSB 11817", {k: kino(k) for k in K}, kino("EAK"),
        "Solgte kinobilletter i kommunen per innbygger. Kommuner uten kino mangler tall.", 1)
    t = last_tid("11758")
    c = Cube(query("11758", {"KOKkommuneregion0000": "*", "ContentsCode": ["KOSbesoktotalt0000"], "Tid": [t]}))
    bib = lambda r: (lambda v: None if v is None else v / pop(r if r != "EAK" else "NO", int(t) - 1))(c.get(KOKkommuneregion0000=r, ContentsCode="KOSbesoktotalt0000", Tid=t) if r in c.index["KOKkommuneregion0000"] else None)  # noqa: E731
    add("bibliotek", "Bibliotekbesøk", "Fritid og kultur", "per innb.", t, "SSB 11758", {k: bib(k) for k in K}, bib("EAK"),
        "Fysiske besøk i folkebibliotekene per innbygger.", 1)

    # ---------- Tro ----------
    t = last_tid("12025")
    c = Cube(query("12025", {"KOKkommuneregion0000": "*", "ContentsCode": ["KOSmedldnkinnb0000", "KOSkonfirm15aar0000", "KOSdoeptefoedte0000"], "Tid": [t]}))
    g5 = lambda r, cc: c.get(KOKkommuneregion0000=r, ContentsCode=cc, Tid=t) if r in c.index["KOKkommuneregion0000"] else None  # noqa: E731
    add("kirke", "Medlemmer i Den norske kirke", "Tro og tradisjon", "%", t, "SSB 12025", {k: g5(k, "KOSmedldnkinnb0000") for k in K}, g5("EAK", "KOSmedldnkinnb0000"),
        "Medlemmer og tilhørige i Den norske kirke i prosent av innbyggerne.")
    add("konfirm", "Konfirmerte i kirken", "Tro og tradisjon", "% av 15-åringer", t, "SSB 12025", {k: g5(k, "KOSkonfirm15aar0000") for k in K}, g5("EAK", "KOSkonfirm15aar0000"),
        "Konfirmerte i Den norske kirke i prosent av 15-åringene.")
    add("dap", "Døpte", "Tro og tradisjon", "% av fødte", t, "SSB 12025", {k: g5(k, "KOSdoeptefoedte0000") for k in K}, g5("EAK", "KOSdoeptefoedte0000"),
        "Døpte i Den norske kirke i prosent av antall fødte.")

    # ---------- Lovbrudd ----------
    t = last_tid("08487")
    c = Cube(query("08487", {"Gjerningssted": "*", "LovbruddKrim": ["1AAAAA-9ZZZZz", "4AAAAA-4ZZZZz"], "ContentsCode": ["AnmLovbrPer1000"], "Tid": [t]}))
    g6 = lambda r, l: c.get(Gjerningssted=r, LovbruddKrim=l, ContentsCode="AnmLovbrPer1000", Tid=t) if r in c.index["Gjerningssted"] else None  # noqa: E731
    add("lovbrudd", "Anmeldte lovbrudd", "Trygghet", "per 1 000 innb.", t, "SSB 08487", {k: g6(k, "1AAAAA-9ZZZZz") for k in K}, g6("0", "1AAAAA-9ZZZZz"),
        "Anmeldte lovbrudd med gjerningssted i kommunen per 1 000 innbyggere, årlig snitt for perioden.")
    add("vold", "Anmeldt vold og mishandling", "Trygghet", "per 1 000 innb.", t, "SSB 08487", {k: g6(k, "4AAAAA-4ZZZZz") for k in K}, g6("0", "4AAAAA-4ZZZZz"),
        "Anmeldt vold og mishandling med gjerningssted i kommunen per 1 000 innbyggere, årlig snitt.")

    out = {
        "kommuner": {k: {"name": reg["kommuner"][k]["name"], "f": reg["kommuner"][k]["f"]} for k in K},
        "fylker": {f: v["name"] for f, v in reg["fylker"].items()},
        "indicators": ind,
        "defaults": {"x": "leger", "y": "sykepl"},
        "presets": [
            {"id": "lege", "label": "Leger og sykepleiere", "x": "leger", "y": "sykepl"},
            {"id": "scooter", "label": "Snøscootere og jegere", "x": "jegere", "y": "snoscooter"},
            {"id": "el", "label": "Biler og elbiler", "x": "biler", "y": "elbil"},
            {"id": "kirke", "label": "Kirke og konfirmasjon", "x": "kirke", "y": "konfirm"},
            {"id": "hytter", "label": "Hytter og folketall", "x": "pop", "y": "hytter"},
            {"id": "skole", "label": "Elever per lærer og grunnskolepoeng", "x": "gruppe", "y": "grunnskolepoeng"},
        ],
    }
    with open(os.path.join(DATA, "kommunehverdag.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print("skrev data/kommunehverdag.json", file=sys.stderr)


if __name__ == "__main__":
    main()
