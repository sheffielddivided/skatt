#!/usr/bin/env python3
"""Hverdagen i Europa: leger, sykepleiere, lærere, barnehage, biler, våpen m.m.

Samme land og format som build_europa.py (Norge i Europa). Kilder: Eurostat og
Small Arms Survey (våpen, fast datafil data/vapen-sas-2017.json).
Skriver data/hverdag.json.
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_europa import COUNTRIES, EU, NORDIC, eurostat  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

# key, navn, gruppe, enhet, desimaler, høyt er, datasett, filtre, omregning, beskrivelse
IND = [
    ("leger", "Leger", "Helse", "per 1 000 innb.", 1, None, "hlth_rs_prs2",
     {"med_spec": "PHYS", "wstatus": "PRACT", "unit": "P_HTHAB"}, "per1000", "Praktiserende leger per 1 000 innbyggere."),
    ("sykepl", "Sykepleiere", "Helse", "per 1 000 innb.", 1, None, "hlth_rs_prs2",
     {"med_spec": "NRS", "wstatus": "PRACT", "unit": "P_HTHAB"}, "per1000", "Praktiserende sykepleiere per 1 000 innbyggere."),
    ("tannl", "Tannleger", "Helse", "per 1 000 innb.", 2, None, "hlth_rs_prs2",
     {"med_spec": "DENT", "wstatus": "PRACT", "unit": "P_HTHAB"}, "per1000", "Praktiserende tannleger per 1 000 innbyggere."),
    ("senger", "Sykehussenger", "Helse", "per 1 000 innb.", 1, None, "hlth_rs_bds1",
     {"facility": "HBEDT", "hlthcare": "TOTAL", "unit": "P_HTHAB"}, "per1000", "Sykehussenger i alt per 1 000 innbyggere."),
    ("overvekt", "Fedme (KMI over 30)", "Helse", "% av voksne", 1, "bad", "hlth_ehis_bm1e",
     {"bmi": "BMI_GE30", "sex": "T", "age": "TOTAL", "isced11": "TOTAL"}, None, "Andel voksne med kroppsmasseindeks 30 eller høyere (egenrapportert, helseundersøkelsen EHIS)."),
    ("elevlaerer", "Elever per lærer, barneskolen", "Skole og familie", "elever", 1, None, "educ_uoe_perp04",
     {"isced11": "ED1"}, None, "Antall elever per lærer på barnetrinnet (ISCED 1)."),
    ("barnehage", "Barn under 3 år i barnehage", "Skole og familie", "%", 1, None, "ilc_caindformal",
     {"age": "Y_LT3", "duration": "H0", "unit": "PC"}, "hundredminus", "Andel barn under 3 år i formell barnepass (barnehage o.l.) minst én time i uken."),
    ("mormalder", "Mors alder ved første barn", "Skole og familie", "år", 1, None, "demo_find",
     {"indic_de": "AGEMOTH1"}, None, "Gjennomsnittsalder for kvinner når de får sitt første barn."),
    ("flytte", "Alder når man flytter hjemmefra", "Skole og familie", "år", 1, None, "yth_demo_030",
     {"sex": "T"}, None, "Anslått gjennomsnittsalder når unge flytter ut av foreldrehjemmet."),
    ("skilsmisse", "Skilsmisser", "Skole og familie", "per 1 000 innb.", 1, None, "demo_ndivind",
     {"indic_de": "GDIVRT"}, None, "Skilsmisser per 1 000 innbyggere."),
    ("biler", "Personbiler", "Bil og hjem", "per 1 000 innb.", 0, None, "road_eqs_carhab",
     {}, None, "Registrerte personbiler per 1 000 innbyggere."),
    ("elbil", "Elbilandel av nye biler", "Bil og hjem", "%", 1, None, "road_eqr_carpda",
     {"unit": "NR"}, "elshare", "Andel helelektriske biler blant nyregistrerte personbiler."),
    ("trafikkdod", "Drepte i trafikken", "Bil og hjem", "per million innb.", 0, "bad", "tran_sf_roadus",
     {"sex": "T", "age": "TOTAL", "pers_cat": "TOTAL", "unit": "P_MHAB"}, None, "Personer drept i trafikkulykker per million innbyggere."),
    ("rom", "Rom per person", "Bil og hjem", "rom", 1, None, "ilc_lvho03",
     {"building": "TOTAL", "tenure": "TOTAL", "unit": "AVG"}, None, "Gjennomsnittlig antall rom per person i boligen."),
    ("strom", "Strømpris for husholdninger", "Bil og hjem", "euro per kWh", 2, "bad", "nrg_pc_204",
     {"siec": "E7000", "nrg_cons": "KWH2500-4999", "tax": "I_TAX", "currency": "EUR", "unit": "KWH"}, None,
     "Strømpris inkludert skatter og avgifter for en husholdning med middels forbruk (2 500–5 000 kWh), siste halvår."),
    ("klima", "Klimagassutslipp", "Bil og hjem", "tonn per innb.", 1, "bad", "env_air_gge",
     {"airpol": "GHG", "src_crf": "TOTX4_MEMO", "unit": "THS_T"}, "tonnperinnb", "Klimagassutslipp per innbygger (CO₂-ekvivalenter), uten skog og arealbruk."),
    ("turisme", "Hotellovernattinger", "Bil og hjem", "per innb.", 1, None, "tour_occ_ninat",
     {"c_resid": "TOTAL", "nace_r2": "I551-I553", "unit": "P_THAB"}, "perinnb_fra1000", "Overnattinger på hoteller, campingplasser m.m. per innbygger per år."),
    ("politi", "Politifolk", "Trygghet", "per 100 000 innb.", 0, None, "crim_just_job",
     {"isco08": "OC5412", "sex": "T", "unit": "P_HTHAB"}, None, "Polititjenestemenn per 100 000 innbyggere."),
    ("fengsel", "Innsatte i fengsel", "Trygghet", "per 100 000 innb.", 0, None, "crim_pris_cap",
     {"indic_cr": "PRIS_ACT_CAP", "unit": "P_HTHAB"}, None, "Personer i fengsel per 100 000 innbyggere."),
    ("drap", "Drap", "Trygghet", "per 100 000 innb.", 2, "bad", "crim_off_cat",
     {"iccs": "ICCS0101", "unit": "P_HTHAB"}, None, "Registrerte forsettlige drap per 100 000 innbyggere."),
    ("vapen", "Sivile våpen", "Trygghet", "per 100 innb.", 1, None, None, None, None,
     "Anslått antall skytevåpen i sivil eie per 100 innbyggere i 2017 (Small Arms Survey). Til sammenligning: USA 120,5."),
]

PRESETS = [
    {"l": "Leger og sykepleiere", "x": "leger", "y": "sykepl"},
    {"l": "Våpen og drap", "x": "vapen", "y": "drap"},
    {"l": "Biler og trafikkdød", "x": "biler", "y": "trafikkdod"},
    {"l": "Barnehage og mors alder", "x": "barnehage", "y": "mormalder"},
    {"l": "Politi og fengsel", "x": "politi", "y": "fengsel"},
    {"l": "Strømpris og elbiler", "x": "strom", "y": "elbil"},
]


def main():
    pop, _ = eurostat("tps00001", {})
    indicators, updated = [], []
    for key, name, group, unit, dec, better, ds, filt, conv, desc in IND:
        print(" ", key, ds or "SAS", file=sys.stderr)
        if key == "vapen":
            with open(os.path.join(DATA, "vapen-sas-2017.json"), encoding="utf-8") as fh:
                vals = {g: {"2017": v} for g, v in json.load(fh).items()}
            src = "Small Arms Survey (2018)"
        elif conv == "elshare":
            el, up = eurostat(ds, {**filt, "mot_nrg": "ELC"})
            tot, _ = eurostat(ds, {**filt, "mot_nrg": "TOTAL"})
            vals = {g: {y: 100 * v / tot[g][y] for y, v in s.items() if tot.get(g, {}).get(y)} for g, s in el.items()}
            updated.append(up)
            src = f"Eurostat {ds}"
        else:
            vals, up = eurostat(ds, filt)
            updated.append(up)
            src = f"Eurostat {ds}"
        if conv == "per1000":
            vals = {g: {y: v / 100 for y, v in s.items()} for g, s in vals.items()}
        elif conv == "hundredminus":  # tabellen gir andel med 0 timer
            vals = {g: {y: 100 - v for y, v in s.items()} for g, s in vals.items()}
        elif conv == "perinnb_fra1000":
            vals = {g: {y: v / 1000 for y, v in s.items()} for g, s in vals.items()}
        elif conv == "tonnperinnb":
            vals = {g: {y: 1000 * v / pop[g][y] for y, v in s.items() if pop.get(g, {}).get(y)} for g, s in vals.items()}
        clean = {g: {y: round(v, 3) for y, v in sorted(s.items()) if v is not None} for g, s in vals.items() if g in COUNTRIES or g == EU}
        print(f"    {len(clean)} land, Norge: {len(clean.get('NO', {}))} år", file=sys.stderr)
        indicators.append({"key": key, "name": name, "group": group, "unit": unit, "dec": dec, "better": better, "source": src, "desc": desc, "values": clean})
    out = {
        "source": "Eurostat og Small Arms Survey",
        "updated": max(filter(None, updated)) if updated else None,
        "countries": COUNTRIES, "nordic": NORDIC, "eu": EU,
        "presets": PRESETS, "defaults": {"ind": "leger", "sx": "leger", "sy": "sykepl"},
        "extra": {"US": {"vapen": 120.5}},
        "indicators": indicators,
    }
    with open(os.path.join(DATA, "hverdag.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print("skrev data/hverdag.json", file=sys.stderr)


if __name__ == "__main__":
    main()
