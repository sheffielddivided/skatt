# Skatt i tall

Interaktive visualiseringer av norsk skatt basert på åpne data fra Statistisk sentralbyrå (SSB).
Statisk nettsted for GitHub Pages – ingen byggesteg.

## Studier

| Side | Innhold | Kilder |
| --- | --- | --- |
| `index.html` | Landingsside med nøkkeltall og oversikt over studier | – |
| `kart.html` | **Skattekartet** – zoombart kart over kommuner/fylker, totalt, per innbygger eller endring, valgfrie skattearter, filter per fylke (zoomer inn), detaljpanel med tidsserie | SSB 07022, 11342, Klass 131, Kartverket |
| `utgifter.html` | **Hvor går skattepengene?** – skattekvittering, flisekart over offentlige utgifter etter formål, utvikling, stat mot kommune og type utgift | SSB 14669 |
| `oljepenger.html` | **Oljepengene** – petroleumsinntekter inn, oljepengebruk ut, andel av fastlands-BNP og statens utgifter, fondets avkastning og statens finansformue | SSB 14668, 14722, 07511, 09189, 10486 |
| `petroleum.html` | **Petroleumsskatten** – ordinær skatt + særskatt over tid, andel av upersonlige skattytere og av all skatt, løpende/faste kroner | SSB 07391, 03014 |
| `eiendomsskatt.html` | **Eiendomsskatten** – inntekter fra bolig, fritid, kraft og næring siden 2007, ordninger, satser og enebolig-eksempel per kommune | SSB 14674, 14155 |
| `naering.html` | **Næringslivet** – sysselsatte etter næring per kommune 2008–, spesialisering, pendling og sammenheng med skatt | SSB 13470 |
| `profil.html` | **Kommuneprofilen** – punktdiagram med to valgfrie indikatorer (skatt, inntekt, utdanning, alder, sysselsetting, trygd), kart og full profil per kommune | SSB 07459, 06944, 05671, 12558, 06445, 09429 m.fl., FHI (NAV-data) |
| `alder.html` | **Aldersbølgen** – animerte befolkningspyramider 1986–i dag for Norge, fylker og kommuner, eldreandel og forsørgerbrøk | SSB 07459 |
| `befolkning.html` | **Befolkningsutviklingen** – fødselsoverskudd og nettoinnvandring siden 1900, inn-/utvandring etter statsborgerskap og land, kommunevis dekomponering av veksten | SSB 05803, 05476, 07822, 06913, 13256 |
| `ulikhet.html` | **Inntektsulikhet** – Gini og P90/P10 for landet siden 1986 og per kommune, inntektsprofil (nasjonale tideler), vedvarende lavinntekt for alle og barn, median inntekt | SSB 07756, 12558, 06944, FHI |
| `formue.html` | **Formuesskatt og utflytting** – formuesskatt over tid, hvem som betaler, utvandring av norske statsborgere etter land (Sveits), formuesskatt per kommune | SSB 10333, 08231, 09201, 03014 |

## Data

`scripts/build_data.py` henter alt fra SSBs åpne API (kun Python-standardbibliotek) og skriver
`data/skatt-regioner.json`, `data/skatt-ordning.json` og `data/formue.json`:

```bash
python3 scripts/build_data.py        # skatt, petroleum, formuesskatt
python3 scripts/build_demografi.py   # aldersfordeling (data/alder/)
python3 scripts/build_profil.py      # kommuneprofil (SSB + FHI)
python3 scripts/build_befolkning.py  # befolkningsendringer og flytting etter land
python3 scripts/build_ulikhet.py     # inntektsulikhet (SSB + FHI)
python3 scripts/build_eiendom.py     # eiendomsskatt (KOSTRA)
python3 scripts/build_naering.py     # sysselsatte etter næring
python3 scripts/build_offentlig.py   # offentlige utgifter og oljepenger
```

Skriptene kjøres i denne rekkefølgen fordi de senere bruker filene fra de første.
Felles kode for SSB-/FHI-uthenting og harmonisering av kommunekoder ligger i `scripts/ssblib.py`.

GitHub Actions-arbeidsflyten `.github/workflows/oppdater-data.yml` kjører skriptet hver uke og committer nye tall.

* Årstall er akkumulerte tall per desember. Inneværende år vises som «hittil i år», og endring sammenlignes med samme periode året før.
* Alle år er harmonisert til dagens kommuneinndeling (357 kommuner, 15 fylker) ved hjelp av SSBs endringskatalog (Klass 131).
  Sammenslåinger summeres; ved delinger fordeles tallene etter folketall.
* Fylker = sum av kommunene. Kontinentalsokkelen, Svalbard og kildeskatt vises separat.

Kartgrunnlaget `data/norge-2024.topo.json` er forenklet fra Kartverkets kommunegrenser
(via [robhop/fylker-og-kommuner](https://github.com/robhop/fylker-og-kommuner), CC BY 4.0) med mapshaper.

## Legge til en ny studie

1. Lag en ny HTML-side med samme topplinje (kopier fra en eksisterende side). Menyen bygges automatisk fra listen `STUDIES` i `assets/common.js` – legg den nye siden til der.
2. Utvid `scripts/build_data.py` med datauttrekket.
3. Legg til et kort i `index.html`.

Felles stil ligger i `assets/style.css`, felles hjelpefunksjoner (tallformat, tooltip, tabell, CSV, tema) i `assets/common.js`.
