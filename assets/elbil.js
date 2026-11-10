/* Studie 17 – Elbiler i verden */
(async function () {
  const S = window.Skatt;
  const tip = S.tooltip();
  const [d, topo] = await Promise.all([
    fetch("data/elbil.json").then((r) => r.json()),
    fetch("data/verden.topo.json").then((r) => r.json()),
  ]);
  const land = topojson.feature(topo, topo.objects.land).features;
  const Y = d.years, I = d.iea, ES = d.eurostat;
  const AGG = { WLD: "Verden", EU27: "EU-27", EUR: "Europa" };
  const NORD = new Set(["DNK", "SWE", "FIN", "ISL"]);

  // Norske landnavn
  const ISO2 = { XKX: "XK", SGP: "SG", SYC: "SC", LIE: "LI", MLT: "MT", LUX: "LU", HKG: "HK" };
  land.forEach((f) => { ISO2[f.properties.id] = { EL: "GR", UK: "GB" }[f.properties.iso2] || f.properties.iso2; });
  let dn = null;
  try { dn = new Intl.DisplayNames(["nb"], { type: "region" }); } catch (e) { /* */ }
  const name = (c) => { if (AGG[c]) return AGG[c]; try { const n = dn && ISO2[c] ? dn.of(ISO2[c]) : null; if (n && n !== ISO2[c]) return n; } catch (e) { /* */ } return d.names[c] || c; };

  // ---------------------------------------------------------------- indikatorer
  const esShare = (src, grp) => (c, yi) => { const r = src[c]; if (!r || r.total[yi] == null || !r.total[yi] || r[grp][yi] == null) return null; return (100 * r[grp][yi]) / r.total[yi]; };
  const IND = {
    nysalg: { nb: "Elbiler og ladbare hybrider, andel av nye biler", short: "Andel av nye biler", years: Y, get: (c, yi) => I.sales_share[c]?.[yi] ?? null, keys: Object.keys(I.sales_share),
      note: "IEA. Elbiler og ladbare hybrider som andel av alle nye personbiler." },
    park: { nb: "Elbiler og ladbare hybrider, andel av bilparken", short: "Andel av bilparken", years: Y, get: (c, yi) => I.stock_share[c]?.[yi] ?? null, keys: Object.keys(I.stock_share),
      note: "IEA. Elbiler og ladbare hybrider som andel av alle personbiler i bruk." },
    bev_ny: { nb: "Helelektriske biler, andel av nye biler (Europa)", short: "Helelektriske, nye", years: ES.new_years, get: esShare(ES.new, "bev"), keys: Object.keys(ES.new),
      note: "Eurostat. Bare biler som går på strøm alene, uten ladbare hybrider. Bare europeiske land." },
    phev_ny: { nb: "Ladbare hybrider, andel av nye biler (Europa)", short: "Ladbare hybrider, nye", years: ES.new_years, get: esShare(ES.new, "phev"), keys: Object.keys(ES.new),
      note: "Eurostat. Ladbare hybrider (bensin eller diesel) som andel av nye personbiler. Bare europeiske land." },
    bev_park: { nb: "Helelektriske biler, andel av bilparken (Europa)", short: "Helelektriske, bilpark", years: ES.fleet_years, get: esShare(ES.fleet, "bev"), keys: Object.keys(ES.fleet),
      note: "Eurostat. Helelektriske biler som andel av alle registrerte personbiler. Bare europeiske land." },
  };
  const isAgg = (c) => !!AGG[c];
  const lastIdx = (ind) => { for (let k = ind.years.length - 1; k >= 0; k--) if (ind.keys.filter((c) => !isAgg(c) && ind.get(c, k) != null).length >= ind.keys.length * 0.5) return k; return ind.years.length - 1; };
  const f1 = (v) => (v == null ? "–" : S.pct(v, v < 10 ? 1 : 0));
  const ranked = (ind, yi) => ind.keys.filter((c) => !isAgg(c) && ind.get(c, yi) != null).sort((a, b) => ind.get(b, yi) - ind.get(a, yi));

  // ---------------------------------------------------------------- hendelser (forenklet)
  const NO_EVENTS = [
    [1990, "Elbiler fritas for engangsavgift (først midlertidig, permanent fra 1996)."],
    [1997, "Elbiler fritas for bompenger."],
    [1999, "Gratis parkering på kommunale plasser."],
    [2001, "Fritak for merverdiavgift ved kjøp av elbil."],
    [2005, "Elbiler får kjøre i kollektivfeltet (først i Oslo-området fra 2003)."],
    [2017, "Lokale fordeler begrenses. Kommunene får ta betalt for parkering, og fra 2019 kan elbiler måtte betale inntil halv pris i bomringer og på ferjer."],
    [2021.17, "Elbiler må betale trafikkforsikringsavgift."],
    [2023, "Mva-fritaket gjelder bare de første 500 000 kronene, og elbiler får vektavgift ved registrering."],
    [2025, "Målåret: Alle nye personbiler skal være nullutslippsbiler (Nasjonal transportplan 2018–2029)."],
  ];
  const EVENTS = [
    ...NO_EVENTS.filter((e) => e[0] >= 2001).map(([x, t]) => ["NOR", x, t]),
    ["DNK", 2016, "Registreringsavgiften på elbiler innføres gradvis igjen, og salget stopper nesten opp."],
    ["DNK", 2020.95, "Ny avtale gir lav registreringsavgift for elbiler, med gradvis opptrapping mot 2035."],
    ["SWE", 2018.5, "Bonus–malus: Elbiler får kjøpsbonus, og biler med høye utslipp får høyere avgift."],
    ["SWE", 2022.85, "Klimabonusen for nye elbiler avvikles."],
    ["DEU", 2016.5, "Kjøpstilskuddet Umweltbonus innføres."],
    ["DEU", 2020.5, "Tilskuddet økes kraftig som del av koronapakken."],
    ["DEU", 2023.95, "Tilskuddet stoppes brått i desember 2023."],
    ["NLD", 2020.5, "Kjøpstilskudd for privatpersoner (SEPP) innføres."],
    ["NLD", 2025, "Elbiler begynner å betale registrerings- og årsavgift, med redusert sats."],
    ["GBR", 2022.45, "Kjøpstilskuddet Plug-in Car Grant avvikles."],
    ["GBR", 2024, "ZEV-mandat: Bilprodusentene må selge en minsteandel nullutslippsbiler (22 % i 2024)."],
    ["GBR", 2025.25, "Elbiler må betale årsavgift (VED)."],
    ["FRA", 2008, "Bonus–malus-systemet innføres, med kjøpsbonus for biler med lave utslipp."],
    ["FRA", 2024, "Bonusen knyttes til en miljøscore som utelukker de fleste bilene laget i Kina."],
    ["CHN", 2014.7, "Elbiler og ladbare hybrider fritas for kjøpsavgift."],
    ["CHN", 2026, "Fritaket for kjøpsavgift halveres (gjelder 2026–2027)."],
    ["USA", 2023, "Nytt føderalt skattefradrag på inntil 7 500 dollar (Inflation Reduction Act)."],
    ["USA", 2025.75, "Det føderale skattefradraget avvikles 30. september 2025."],
  ];

  // ---------------------------------------------------------------- tilstand og kontroller
  const st = { ind: "nysalg", yi: null, chips: ["DNK", "SWE", "CHN", "DEU", "USA", "WLD"], mix: "new", noper: 2012 };
  (function readHash() { const h = new URLSearchParams(location.hash.slice(1)); if (IND[h.get("i")]) st.ind = h.get("i"); })();
  const indSel = document.getElementById("ind"), yrSel = document.getElementById("yr");
  indSel.innerHTML = `<optgroup label="Alle land (IEA)"><option value="nysalg">${IND.nysalg.nb}</option><option value="park">${IND.park.nb}</option></optgroup>`
    + `<optgroup label="Europa (Eurostat)"><option value="bev_ny">${IND.bev_ny.nb}</option><option value="phev_ny">${IND.phev_ny.nb}</option><option value="bev_park">${IND.bev_park.nb}</option></optgroup>`;
  indSel.value = st.ind;
  function fillYears() {
    const ind = IND[st.ind];
    yrSel.innerHTML = ind.years.map((y, k) => `<option value="${k}">${y}</option>`).reverse().join("");
    st.yi = lastIdx(ind); yrSel.value = st.yi;
  }
  fillYears();
  indSel.onchange = () => { st.ind = indSel.value; fillYears(); render(); };
  yrSel.onchange = () => { st.yi = +yrSel.value; render(); };
  const allKeys = [...new Set([...Object.keys(I.sales_share), ...Object.keys(ES.new)])];
  const sortedC = allKeys.filter((c) => c !== "NOR").sort((a, b) => name(a).localeCompare(name(b), "nb"));
  document.getElementById("clist").innerHTML = sortedC.map((c) => `<option value="${S.escapeHtml(name(c))}">`).join("");
  const addc = document.getElementById("addc");
  addc.onchange = () => { const c = sortedC.find((x) => name(x).toLowerCase() === addc.value.trim().toLowerCase()); if (c) { addChip(c); addc.value = ""; } };
  function addChip(c, scroll) {
    if (c !== "NOR" && !st.chips.includes(c)) { st.chips.push(c); if (st.chips.length > 7) st.chips.shift(); }
    series(); rank();
    if (scroll) document.getElementById("t-title").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function seg(id, cb) {
    const el = document.getElementById(id);
    el.querySelectorAll("button").forEach((b) => (b.onclick = () => { el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); cb(b.dataset.v); }));
  }
  seg("mixk", (v) => { st.mix = v; mix(); });
  seg("noper", (v) => { st.noper = +v; noArea(); });

  // ---------------------------------------------------------------- KPI
  function kpis() {
    const L = Y.length - 1, ind = IND.nysalg, r = ranked(ind, L);
    const m = d.norge.months, n = d.norge.ny, lastM = m[m.length - 1], yr = lastM.slice(0, 4);
    const ytd = m.map((x, k) => (x.startsWith(yr) ? k : -1)).filter((k) => k >= 0);
    const sum = (arr) => d3.sum(ytd, (k) => arr[k] || 0);
    const tot = sum(n.el) + sum(n.fossil) + sum(n.hybrid) + sum(n.annet);
    const nf = ES.fleet.NOR, fy = nf.total.length - 1;
    const cards = [
      { l: `Elbiler av nye biler, Norge ${yr}`, v: S.pct((100 * sum(n.el)) / tot, 1), s: `Hittil i år, til og med ${S.MONTHS[+lastM.slice(5) - 1]} (SSB). Helelektriske.` },
      { l: `Norges plass ${Y[L]}`, v: `${r.indexOf("NOR") + 1}. av ${r.length}`, s: `Foran ${r.slice(1, 3).map(name).join(" og ")} · ${f1(ind.get("NOR", L))} med ladbare hybrider` },
      { l: `Helelektriske i bilparken ${ES.fleet_years[fy]}`, v: S.pct((100 * nf.bev[fy]) / nf.total[fy], 0), s: `${S.int(nf.bev[fy])} av ${S.int(nf.total[fy])} personbiler i Norge` },
      { l: `Verden ${Y[L]}`, v: f1(I.sales_share.WLD[L]), s: `av nye biler var elbiler · ${f1(I.sales_share.WLD[L - 4])} i ${Y[L - 4]}` },
    ];
    document.getElementById("kpis").innerHTML = cards.map((c) => `<div class="card kpi"><div class="l">${c.l}</div><div class="v">${c.v}</div><div class="s">${c.s}</div></div>`).join("");
  }

  // ---------------------------------------------------------------- kart
  function wmap() {
    const ind = IND[st.ind], yi = st.yi, el = document.getElementById("map");
    const europe = st.ind !== "nysalg" && st.ind !== "park";
    document.getElementById("m-title").textContent = `${ind.short}, ${ind.years[yi]}`;
    const w = Math.max(300, el.clientWidth || 700), h = Math.round(w * (europe ? 0.78 : 0.56));
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    svg.append("clipPath").attr("id", "eclip").append("rect").attr("width", w).attr("height", h - 44);
    const proj = europe
      ? d3.geoConicConformal().rotate([-12, 0]).parallels([40, 68]).fitExtent([[4, 4], [w - 4, h - 46]], { type: "Feature", geometry: { type: "Polygon", coordinates: [[[-11, 35], [-11, 71], [40, 71], [40, 35], [-11, 35]]] } })
      : d3.geoEqualEarth().fitExtent([[4, 4], [w - 4, h - 46]], { type: "FeatureCollection", features: land });
    const path = d3.geoPath(proj);
    const dark = S.isDark();
    const ramp = dark ? ["#0d366b", "#104281", "#1c5cab", "#2a78d6", "#5598e7", "#86b6ef", "#b7d3f6"] : ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
    const vals = ind.keys.filter((c) => !isAgg(c)).map((c) => ind.get(c, yi)).filter((v) => v != null);
    const mx = Math.max(10, d3.max(vals) || 10);
    const TH = mx > 60 ? [2, 5, 10, 20, 40, 70] : mx > 25 ? [1, 2, 5, 10, 20, 30] : [0.5, 1, 2, 5, 10, 15];
    const sc = d3.scaleThreshold(TH, ramp);
    svg.append("g").attr("clip-path", "url(#eclip)").selectAll("path").data(land).join("path").attr("d", path)
      .attr("class", (f) => (ind.get(f.properties.id, yi) == null ? "na" : "c"))
      .attr("fill", (f) => { const v = ind.get(f.properties.id, yi); return v == null ? null : sc(v); })
      .on("mousemove", (e, f) => {
        const c = f.properties.id, v = ind.get(c, yi);
        const r = ranked(ind, yi);
        tip.show(`<div class="tt-title">${S.escapeHtml(name(c))}</div>${v == null ? '<div class="tt-row"><span>Ingen tall</span></div>' : `<div class="tt-row"><span>${ind.short}</span><b>${f1(v)}</b></div><div class="tt-row"><span>Plass</span><b>${r.indexOf(c) + 1} av ${r.length}</b></div>`}`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => tip.hide())
      .on("click", (e, f) => { if (ind.get(f.properties.id, yi) != null) addChip(f.properties.id, true); });
    const nof = land.find((f) => f.properties.id === "NOR");
    if (nof) svg.append("path").attr("class", "sel").attr("clip-path", "url(#eclip)").attr("d", path(nof));
    const lg = svg.append("g").attr("class", "lg").attr("transform", `translate(8,${h - 36})`);
    const bw = Math.min(46, (w - 60) / ramp.length);
    ramp.forEach((c, k) => lg.append("rect").attr("x", k * bw).attr("y", 0).attr("width", bw - 2).attr("height", 10).attr("rx", 2).attr("fill", c));
    TH.forEach((t, k) => lg.append("text").attr("x", (k + 1) * bw - 1).attr("y", 26).attr("text-anchor", "middle").text(S.nf0.format(t)));
    lg.append("text").attr("x", ramp.length * bw + 6).attr("y", 9).text("%");
  }

  // ---------------------------------------------------------------- rangering
  function rank() {
    const ind = IND[st.ind], yi = st.yi, el = document.getElementById("rank");
    const r = ranked(ind, yi);
    const aggs = ["WLD", "EU27", "EUR"].filter((c) => ind.get(c, yi) != null);
    document.getElementById("r-sub").textContent = `${r.length} land i ${ind.years[yi]}. Norge er nr. ${r.indexOf("NOR") + 1 || "–"}. Kursiv: gjennomsnitt for flere land.`;
    const rows = [...r.map((c) => ({ c, v: ind.get(c, yi) })), ...aggs.map((c) => ({ c, v: ind.get(c, yi), agg: true }))].sort((a, b) => b.v - a.v);
    let k = 0;
    el.innerHTML = rows.map((x) => {
      const i = x.agg ? "" : ++k;
      return `<div class="r ${x.c === "NOR" ? "no" : ""} ${NORD.has(x.c) ? "nord" : ""} ${x.agg ? "agg" : ""} ${st.chips.includes(x.c) ? "pick" : ""}" data-c="${x.c}" title="Legg til i sammenligningen"><span class="i">${i}</span><span>${S.escapeHtml(name(x.c))}</span><div><div class="b" style="width:${Math.max(0.5, x.v).toFixed(1)}%"></div></div><span class="v">${f1(x.v)}</span></div>`;
    }).join("");
    el.querySelectorAll(".r").forEach((row) => (row.onclick = () => addChip(row.dataset.c, true)));
  }

  // ---------------------------------------------------------------- tidsserie
  const PAL = ["var(--series-1)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)", "var(--series-7)", "var(--text-2)"];
  function series() {
    const ind = IND[st.ind], el = document.getElementById("ts");
    document.getElementById("t-title").textContent = `${ind.short} over tid`;
    const ser = [{ c: "NOR", color: "var(--series-2)", w: 3 }, ...st.chips.map((c, k) => ({ c, color: c === "WLD" ? "var(--text-2)" : PAL[k % (PAL.length - 1)], dash: isAgg(c) }))];
    document.getElementById("chips").innerHTML = ser.map((s) => `<span class="chip"><span class="sw" style="background:${s.color}"></span>${S.escapeHtml(name(s.c))}${s.c === "NOR" ? '<span style="width:6px"></span>' : `<button data-c="${s.c}" aria-label="Fjern ${S.escapeHtml(name(s.c))}">×</button>`}</span>`).join("");
    document.querySelectorAll("#chips button").forEach((b) => (b.onclick = () => { st.chips = st.chips.filter((c) => c !== b.dataset.c); series(); rank(); }));
    const yrs = ind.years.map(Number);
    const w = Math.max(320, el.clientWidth || 900), h = 340, m = { t: 14, r: w < 560 ? 76 : 120, b: 28, l: 44 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear([yrs[0], yrs[yrs.length - 1]], [m.l, w - m.r]);
    const all = ser.flatMap((s) => ind.years.map((_, k) => ind.get(s.c, k))).filter((v) => v != null);
    const y = d3.scaleLinear([0, Math.min(100, d3.max(all) * 1.05)], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => v + " %").tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(Math.min(12, w / 70)).tickFormat(d3.format("d")).tickSizeOuter(0));
    const labs = [];
    ser.slice().reverse().forEach((s) => {
      const pts = yrs.map((yy, k) => [yy, ind.get(s.c, k)]).filter((p) => p[1] != null);
      if (!pts.length) return;
      const line = d3.line().x((p) => x(p[0])).y((p) => y(p[1]));
      svg.append("path").datum(pts).attr("fill", "none").attr("stroke", s.color).attr("stroke-width", s.w || 2).attr("stroke-dasharray", s.dash ? "5 4" : null).attr("d", line);
      const lp = pts[pts.length - 1];
      labs.push({ t: name(s.c), x: x(lp[0]) + 8, y: y(lp[1]) + 4, no: s.c === "NOR" });
      // hendelser: plasser prikken på kurven (interpolert)
      EVENTS.filter((e) => e[0] === s.c && e[1] >= yrs[0] && e[1] <= yrs[yrs.length - 1]).forEach((e) => {
        const a = pts.filter((p) => p[0] <= e[1]).pop(), b = pts.find((p) => p[0] >= e[1]);
        if (!a || !b) return;
        const vy = a[0] === b[0] ? a[1] : a[1] + ((b[1] - a[1]) * (e[1] - a[0])) / (b[0] - a[0]);
        svg.append("circle").attr("class", "ev").attr("cx", x(e[1])).attr("cy", y(vy)).attr("r", 5.5).attr("fill", "var(--surface)").attr("stroke", s.color).attr("stroke-width", 2.5)
          .on("mousemove", (ev) => tip.show(`<div class="tt-title">${S.escapeHtml(name(s.c))} · ${Math.floor(e[1])}</div><div style="max-width:260px">${S.escapeHtml(e[2])}</div>`, ev.clientX, ev.clientY))
          .on("mouseleave", () => tip.hide());
      });
    });
    labs.sort((a, b) => a.y - b.y);
    for (let k = 1; k < labs.length; k++) if (labs[k].y - labs[k - 1].y < 13) labs[k].y = labs[k - 1].y + 13;
    labs.forEach((l) => svg.append("text").attr("x", l.x).attr("y", l.y).attr("fill", "var(--text-2)").attr("font-size", 11.5).attr("font-weight", l.no ? 700 : 500).text(l.t.length > 14 && w < 560 ? l.t.slice(0, 12) + "…" : l.t));
    const cross = svg.insert("line", ":first-child").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--border-strong)").style("display", "none");
    svg.insert("rect", ".ev").attr("x", m.l).attr("width", w - m.l - m.r).attr("height", h - m.b).attr("fill", "transparent")
      .on("mousemove", (e) => {
        const yy = Math.round(x.invert(d3.pointer(e)[0])), k = yrs.indexOf(yy);
        if (k < 0) return;
        cross.style("display", null).attr("x1", x(yy)).attr("x2", x(yy));
        const rows = ser.map((s) => ({ s, v: ind.get(s.c, k) })).sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
        tip.show(`<div class="tt-title">${yy}</div>${rows.map(({ s, v }) => `<div class="tt-row"><span><span class="key" style="background:${s.color}"></span>${S.escapeHtml(name(s.c))}</span><b>${f1(v)}</b></div>`).join("")}`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => { tip.hide(); cross.style("display", "none"); });
  }

  // ---------------------------------------------------------------- spredningsplott
  function scatter() {
    const el = document.getElementById("scatter"), L = Y.length - 1;
    const yi = IND.park.keys.filter((c) => I.stock_share[c]?.[L] != null).length > 10 ? L : L - 1;
    const pts = Object.keys(I.sales_share).filter((c) => !isAgg(c) && I.sales_share[c][yi] != null && I.stock_share[c]?.[yi] != null)
      .map((c) => ({ c, x: I.sales_share[c][yi], y: I.stock_share[c][yi], n: I.stock[c]?.[yi] || 0 }));
    document.getElementById("sc-sub").textContent = `${Y[yi]}. Bilparken fornyes sakte, så andelen i bilparken henger mange år etter nybilsalget. Størrelsen på sirkelen viser hvor mange elbiler landet har.`;
    const w = Math.max(300, el.clientWidth || 600), h = Math.min(460, Math.max(320, w * 0.42)), m = { t: 12, r: 16, b: 40, l: 46 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear([0, 100], [m.l, w - m.r]);
    const y = d3.scaleLinear([0, Math.max(10, d3.max(pts, (p) => p.y) * 1.08)], [h - m.b, m.t]).nice();
    const r = d3.scaleSqrt([0, d3.max(pts, (p) => p.n)], [3, 26]);
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => v + " %").tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat((v) => v + " %").tickSizeOuter(0));
    svg.append("text").attr("x", w - m.r).attr("y", h - 6).attr("text-anchor", "end").attr("fill", "var(--text-3)").attr("font-size", 11.5).text("Andel av nye biler →");
    svg.append("text").attr("x", m.l + 4).attr("y", m.t + 10).attr("fill", "var(--text-3)").attr("font-size", 11.5).text("↑ Andel av bilparken");
    const col = (c) => (c === "NOR" ? "var(--series-2)" : NORD.has(c) ? "var(--series-1)" : c === "CHN" ? "var(--series-4)" : "var(--neutral-mark)");
    svg.append("g").selectAll("circle").data(pts.sort((a, b) => b.n - a.n)).join("circle")
      .attr("cx", (p) => x(p.x)).attr("cy", (p) => y(p.y)).attr("r", (p) => r(p.n)).attr("fill", (p) => col(p.c)).attr("fill-opacity", 0.75).attr("stroke", "var(--surface)")
      .style("cursor", "pointer")
      .on("mousemove", (e, p) => tip.show(`<div class="tt-title">${S.escapeHtml(name(p.c))}</div><div class="tt-row"><span>Andel av nye biler</span><b>${f1(p.x)}</b></div><div class="tt-row"><span>Andel av bilparken</span><b>${f1(p.y)}</b></div><div class="tt-row"><span>Elbiler i bruk</span><b>${S.int(p.n)}</b></div>`, e.clientX, e.clientY))
      .on("mouseleave", () => tip.hide())
      .on("click", (e, p) => addChip(p.c, true));
    const lab = new Set(["NOR", "CHN", "USA", "DNK", "ISL", "SWE", "DEU", "NLD", "GBR", "FIN", "VNM"]);
    pts.filter((p) => lab.has(p.c)).forEach((p) => svg.append("text").attr("x", x(p.x) + r(p.n) + 3).attr("y", y(p.y) + 4).attr("fill", "var(--text-2)").attr("font-size", 11).attr("font-weight", p.c === "NOR" ? 700 : 500).text(name(p.c)));
  }

  // ---------------------------------------------------------------- drivstoffmiks i Europa
  const MIX = [["bev", "Helelektrisk", "var(--series-1)"], ["phev", "Ladbar hybrid", "#7fb2ee"], ["hev", "Vanlig hybrid", "var(--series-3)"], ["bensin", "Bensin", "var(--series-4)"], ["diesel", "Diesel", "var(--neutral-mark)"], ["annet", "Annet (gass m.m.)", "var(--border-strong)"]];
  function mix() {
    const src = st.mix === "new" ? ES.new : ES.fleet, years = st.mix === "new" ? ES.new_years : ES.fleet_years, el = document.getElementById("mix");
    const L = years.length - 1;
    const rows = Object.keys(src).map((c) => {
      const r = src[c];
      let k = L; while (k >= 0 && !(r.total[k] > 0 && r.bev[k] != null)) k--;
      if (k < 0 || r.total[k] < 1000) return null;
      const o = { c, yr: years[k], tot: r.total[k] };
      let s = 0;
      MIX.slice(0, 5).forEach(([g]) => { o[g] = (r[g][k] || 0) / r.total[k]; s += o[g]; });
      o.annet = Math.max(0, 1 - s);
      return o;
    }).filter(Boolean).sort((a, b) => b.bev - a.bev);
    const ly = years[L];
    document.getElementById("mix-title").textContent = st.mix === "new" ? "Hva slags nye biler kjøper europeerne?" : "Hva slags biler står i bilparken?";
    document.getElementById("mix-sub").textContent = `Andel av ${st.mix === "new" ? "nye personbiler" : "alle registrerte personbiler"} etter drivstoff, ${ly}. Sortert etter helelektriske. Land med eldre tall er merket med årstall.`;
    document.getElementById("mix-legend").innerHTML = MIX.map(([, n, c]) => `<span class="item"><span class="sw" style="background:${c}"></span>${n}</span>`).join("");
    const w = Math.max(300, el.clientWidth || 600), rowH = 20, m = { t: 4, r: 8, b: 4, l: 130 };
    const h = m.t + m.b + rowH * rows.length;
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear([0, 1], [m.l, w - m.r]);
    rows.forEach((r, i) => {
      const yy = m.t + i * rowH;
      const g = svg.append("g").on("mousemove", (e) => tip.show(`<div class="tt-title">${S.escapeHtml(name(r.c))} · ${r.yr}</div>${MIX.map(([k, n, c]) => `<div class="tt-row"><span><span class="key" style="background:${c}"></span>${n}</span><b>${S.pct(100 * r[k], 1)}</b></div>`).join("")}<div class="tt-row"><span>Biler i alt</span><b>${S.int(r.tot)}</b></div>`, e.clientX, e.clientY)).on("mouseleave", () => tip.hide());
      g.append("text").attr("x", m.l - 8).attr("y", yy + 14).attr("text-anchor", "end").attr("fill", "var(--text-2)").attr("font-size", 11.5).attr("font-weight", r.c === "NOR" ? 700 : r.c === "EU27" ? 600 : 400)
        .text(`${name(r.c)}${r.yr !== ly ? ` (${r.yr})` : ""}`);
      let x0 = 0;
      MIX.forEach(([k, , c]) => { g.append("rect").attr("x", x(x0)).attr("y", yy + 3).attr("height", rowH - 6).attr("width", Math.max(0, x(x0 + r[k]) - x(x0))).attr("fill", c); x0 += r[k]; });
      if (x(r.bev) - m.l > 36) g.append("text").attr("x", x(r.bev) - 4).attr("y", yy + 14).attr("text-anchor", "end").attr("fill", "#fff").attr("font-size", 10.5).attr("font-weight", 600).text(S.nf0.format(100 * r.bev) + " %");
    });
  }

  // ---------------------------------------------------------------- Norge måned for måned
  const NOM = d.norge.months, NON = d.norge.ny;
  const mnum = (s) => +s.slice(0, 4) + (+s.slice(5) - 1) / 12;
  function noArea() {
    const el = document.getElementById("noarea");
    const ks = NOM.map((m, k) => k).filter((k) => mnum(NOM[k]) >= st.noper);
    const G = [["el", "Elektrisk", "var(--series-1)"], ["hybrid", "Hybrid (også ladbar)", "var(--series-3)"], ["fossil", "Bensin og diesel", "var(--series-4)"], ["annet", "Annet", "var(--border-strong)"]];
    document.getElementById("no-legend").innerHTML = G.map(([, n, c]) => `<span class="item"><span class="sw" style="background:${c}"></span>${n}</span>`).join("");
    const rows = ks.map((k) => { const tot = G.reduce((s, [g]) => s + (NON[g][k] || 0), 0); const o = { t: mnum(NOM[k]), m: NOM[k], tot }; G.forEach(([g]) => (o[g] = tot ? (NON[g][k] || 0) / tot : 0)); return o; });
    const last = rows[rows.length - 1];
    document.getElementById("no-sub").textContent = `Andel av førstegangsregistrerte nye personbiler hver måned. I ${S.MONTHS[+last.m.slice(5) - 1]} ${last.m.slice(0, 4)} var ${S.pct(100 * last.el, 1)} elektriske.`;
    const w = Math.max(320, el.clientWidth || 900), h = 340, m = { t: 26, r: 14, b: 28, l: 44 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear([rows[0].t, last.t + 1 / 12], [m.l, w - m.r]);
    const y = d3.scaleLinear([0, 1], [h - m.b, m.t]);
    const stack = d3.stack().keys(G.map((g) => g[0]))(rows);
    svg.append("g").selectAll("path").data(stack).join("path").attr("fill", (s, i) => G[i][2]).attr("d", d3.area().curve(d3.curveStepAfter).x((p) => x(p.data.t)).y0((p) => y(p[0])).y1((p) => y(p[1])));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => Math.round(v * 100) + " %").tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(Math.min(14, w / 60)).tickFormat(d3.format("d")).tickSizeOuter(0));
    NO_EVENTS.forEach(([t], i) => {
      if (t < rows[0].t) return;
      const xx = x(t);
      svg.append("line").attr("x1", xx).attr("x2", xx).attr("y1", m.t - 4).attr("y2", h - m.b).attr("stroke", "var(--text)").attr("stroke-dasharray", "3 3").attr("opacity", 0.55);
      const g = svg.append("g").attr("class", "ev").on("mousemove", (e) => tip.show(`<div class="tt-title">${Math.floor(t)}</div><div style="max-width:260px">${S.escapeHtml(NO_EVENTS[i][1])}</div>`, e.clientX, e.clientY)).on("mouseleave", () => tip.hide());
      g.append("circle").attr("cx", xx).attr("cy", m.t - 13).attr("r", 9).attr("fill", "var(--text)");
      g.append("text").attr("x", xx).attr("y", m.t - 9).attr("text-anchor", "middle").attr("fill", "var(--surface)").attr("font-size", 10.5).attr("font-weight", 700).text(i + 1);
    });
    const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--text)").style("display", "none");
    svg.insert("rect", ".ev").attr("x", m.l).attr("y", m.t).attr("width", w - m.l - m.r).attr("height", h - m.b - m.t).attr("fill", "transparent")
      .on("mousemove", (e) => {
        const t = x.invert(d3.pointer(e)[0]); const r = rows.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
        cross.style("display", null).attr("x1", x(r.t)).attr("x2", x(r.t));
        tip.show(`<div class="tt-title">${S.MONTHS[+r.m.slice(5) - 1]} ${r.m.slice(0, 4)}</div>${G.map(([g, n, c]) => `<div class="tt-row"><span><span class="key" style="background:${c}"></span>${n}</span><b>${S.pct(100 * r[g], 1)}</b></div>`).join("")}<div class="tt-row"><span>Nye biler i alt</span><b>${S.int(r.tot)}</b></div>`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => { tip.hide(); cross.style("display", "none"); });
    document.getElementById("no-events").innerHTML = NO_EVENTS.map(([t, txt], i) => `<li><span class="n">${i + 1}</span><b>${Math.floor(t)}</b><span>${S.escapeHtml(txt)}</span></li>`).join("");
  }
  function noLine() {
    const el = document.getElementById("noline");
    const yrs = [...new Set(NOM.map((m) => +m.slice(0, 4)))].filter((y) => y >= 2008);
    const share = (src) => yrs.map((y) => { let el2 = 0, tot = 0; NOM.forEach((m, k) => { if (+m.slice(0, 4) === y) { el2 += src.el[k] || 0; tot += (src.el[k] || 0) + (src.fossil[k] || 0) + (src.hybrid[k] || 0) + (src.annet[k] || 0); } }); return tot ? (100 * el2) / tot : null; });
    const ser = [
      { n: "Nye personbiler", v: share(d.norge.ny), c: "var(--series-2)", w: 3 },
      { n: "Bruktimporterte personbiler", v: share(d.norge.brukt), c: "var(--series-1)" },
      { n: "Nye vare- og campingbiler", v: share(d.norge.ny_vare), c: "var(--series-3)" },
    ];
    document.getElementById("no2-legend").innerHTML = ser.map((s) => `<span class="item"><span class="sw line" style="background:${s.c}"></span>${s.n}</span>`).join("");
    const w = Math.max(320, el.clientWidth || 900), h = 280, m = { t: 12, r: 14, b: 28, l: 44 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear(d3.extent(yrs), [m.l, w - m.r]), y = d3.scaleLinear([0, 100], [h - m.b, m.t]);
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => v + " %").tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(Math.min(10, w / 70)).tickFormat(d3.format("d")).tickSizeOuter(0));
    ser.forEach((s) => svg.append("path").datum(yrs.map((yy, k) => [yy, s.v[k]]).filter((p) => p[1] != null)).attr("fill", "none").attr("stroke", s.c).attr("stroke-width", s.w || 2).attr("d", d3.line().x((p) => x(p[0])).y((p) => y(p[1]))));
    const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--border-strong)").style("display", "none");
    svg.append("rect").attr("x", m.l).attr("width", w - m.l - m.r).attr("height", h - m.b).attr("fill", "transparent")
      .on("mousemove", (e) => { const yy = Math.round(x.invert(d3.pointer(e)[0])), k = yrs.indexOf(yy); if (k < 0) return; cross.style("display", null).attr("x1", x(yy)).attr("x2", x(yy));
        tip.show(`<div class="tt-title">${yy}${k === yrs.length - 1 ? " (hittil i år)" : ""}</div>${ser.map((s) => `<div class="tt-row"><span><span class="key" style="background:${s.c}"></span>${s.n}</span><b>${f1(s.v[k])}</b></div>`).join("")}`, e.clientX, e.clientY); })
      .on("mouseleave", () => { tip.hide(); cross.style("display", "none"); });
  }

  // ---------------------------------------------------------------- incentivtabell
  function itab() {
    const rows = EVENTS.filter((e) => e[0] !== "NOR").map(([c, t, txt], i) => ({ id: c, land: name(c), aar: Math.floor(t), txt }));
    S.sortableTable(document.getElementById("itab"), [
      { key: "land", label: "Land", text: true }, { key: "aar", label: "År", fmt: (v) => v }, { key: "txt", label: "Endring", text: true },
    ], rows, { sortKey: "land", dir: 1, onRow: (c) => addChip(c, true) });
    document.querySelector("#itab table").classList.add("itab");
  }

  // ---------------------------------------------------------------- tabell
  function table() {
    const L = Y.length - 1, eL = ES.new_years.length - 1, fL = ES.fleet_years.length - 1;
    const back = Math.max(0, L - 5);
    const rows = allKeys.filter((c) => !isAgg(c)).map((c) => ({
      id: c, name: name(c), ny: IND.nysalg.get(c, L), park: IND.park.get(c, L), bev: IND.bev_ny.get(c, eL), bevp: IND.bev_park.get(c, fL),
      chg: IND.nysalg.get(c, L) != null && IND.nysalg.get(c, back) != null ? IND.nysalg.get(c, L) - IND.nysalg.get(c, back) : null, stock: I.stock[c]?.[L] ?? null,
    })).filter((r) => r.ny != null || r.bev != null);
    document.getElementById("tbl-sub").textContent = `IEA ${Y[L]} (elbiler og ladbare hybrider) og Eurostat ${ES.new_years[eL]} (helelektriske). Klikk på et land for å se det i grafen.`;
    S.sortableTable(document.getElementById("table"), [
      { key: "name", label: "Land", text: true }, { key: "ny", label: `Andel nye ${Y[L]}`, fmt: f1 }, { key: "chg", label: `Endring siden ${Y[back]}`, fmt: (v) => (v == null ? "–" : S.signed(S.nf0.format(v) + " pp.", v)) },
      { key: "park", label: "Andel bilpark", fmt: f1 }, { key: "bev", label: "Helelektriske, nye", fmt: f1 }, { key: "bevp", label: "Helelektriske, bilpark", fmt: f1 }, { key: "stock", label: "Elbiler i bruk", fmt: (v) => S.int(v) },
    ], rows, { sortKey: "ny", dir: -1, onRow: (c) => addChip(c, true) });
    const dec = (v) => (v == null ? "" : v.toFixed(1).replace(".", ","));
    document.getElementById("csv").onclick = () => S.downloadCsv("elbiler.csv", [["Land", "ISO3", `Andel av nye biler ${Y[L]} (%)`, `Andel av bilparken ${Y[L]} (%)`, `Helelektriske, andel av nye ${ES.new_years[eL]} (%)`, `Helelektriske, andel av bilparken ${ES.fleet_years[fL]} (%)`, `Elbiler i bruk ${Y[L]}`],
      ...rows.sort((a, b) => (b.ny ?? -1) - (a.ny ?? -1)).map((r) => [r.name, r.id, dec(r.ny), dec(r.park), dec(r.bev), dec(r.bevp), r.stock ?? ""])]);
  }

  function render() {
    document.getElementById("ind-note").textContent = IND[st.ind].note;
    history.replaceState(null, "", st.ind === "nysalg" ? location.pathname : `#i=${st.ind}`);
    wmap(); rank(); series();
  }
  kpis(); render(); scatter(); mix(); noArea(); noLine(); itab(); table();
  document.getElementById("updated").textContent = `Data hentet ${d.fetched}`;
  S.onThemeChange(() => wmap());
  let rt, lastW = innerWidth;
  window.addEventListener("resize", () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rt); rt = setTimeout(() => { render(); scatter(); mix(); noArea(); noLine(); }, 200); });
})();
