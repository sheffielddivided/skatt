/* Studie 21 – Inflasjon i verden */
(async function () {
  const S = window.Skatt;
  const tip = S.tooltip();
  const { signif, ibeta } = S.stats;
  const fp = S.stats.fmtP;
  const [d, topo] = await Promise.all([
    fetch("data/inflasjon.json").then((r) => r.json()),
    fetch("data/verden.topo.json").then((r) => r.json()),
  ]);
  const land = topojson.feature(topo, topo.objects.land).features;
  const Y = d.years, V = d.vars, Y0 = Y[0], LAST = Y[Y.length - 1];
  const C = d.countries, AGG = d.aggs;
  const NORD = new Set(["DNK", "SWE", "FIN", "ISL"]);
  const EUROJ = d.euro || {};
  let dn = null;
  try { dn = new Intl.DisplayNames(["nb"], { type: "region" }); } catch (e) { /* */ }
  const NAME_FIX = { DOM: "Dominikanske rep.", XKX: "Kosovo", PSE: "Palestina", HKG: "Hongkong", MAC: "Macao", TWN: "Taiwan" };
  const name = (c) => {
    if (AGG[c]) return AGG[c];
    if (NAME_FIX[c]) return NAME_FIX[c];
    const a = C[c]?.a;
    try { const n = dn && a ? dn.of(a) : null; if (n && n !== a) return n; } catch (e) { /* */ }
    return C[c]?.n || c;
  };
  const REGION = { ECS: "Europa og Sentral-Asia", NAC: "Nord-Amerika", LCN: "Latin-Amerika", EAS: "Øst-Asia og Stillehavet", SAS: "Sør-Asia", MEA: "Midtøsten og Nord-Afrika", SSF: "Afrika sør for Sahara" };
  const RCOL = { ECS: "var(--series-1)", NAC: "var(--series-7)", LCN: "var(--series-3)", EAS: "var(--series-4)", SAS: "var(--series-6)", MEA: "var(--series-5)", SSF: "var(--neutral-mark)" };

  // ---------------------------------------------------------------- tall og hjelpere
  const f1 = (v) => (v == null || !isFinite(v) ? "–" : S.nf1.format(v).replace("-", "−"));
  const f0 = (v) => (v == null || !isFinite(v) ? "–" : S.nf0.format(v).replace("-", "−"));
  const pc = (v) => (v == null || !isFinite(v) ? "–" : (Math.abs(v) >= 100 ? f0(v) : f1(v)) + " %");
  const pp = (v) => (v == null || !isFinite(v) ? "–" : (v > 0 ? "+" : "") + f1(v) + " pp");
  const fr = (r) => (r == null || !isFinite(r) ? "–" : r.toFixed(2).replace(".", ",").replace("-", "−"));
  const sl = (v) => Math.sign(v) * Math.log1p(Math.abs(v)); // komprimert skala (symmetrisk logaritme)
  const yi = (y) => y - Y0;
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const median = (a) => (a.length ? d3.median(a) : null);

  // oljepris: prosentvis endring fra året før (lik for alle land)
  const oilCh = Y.map((y, i) => (i && d.oil[i] != null && d.oil[i - 1] ? 100 * (d.oil[i] / d.oil[i - 1] - 1) : null));
  function val(k, c, y) {
    const i = yi(y); if (i < 0 || i >= Y.length) return null;
    if (k === "oil") return oilCh[i];
    const s = V[k]?.[c]; return s ? s[i] : null;
  }

  const F = {
    money: { nb: "Vekst i pengemengden", unit: "%", log: true, hint: "Bred pengemengde (M2/M3), vekst fra året før." },
    policy: { nb: "Styringsrente", unit: "%", log: true, hint: "Sentralbankens rente, årssnitt (BIS, 49 land). Euroland har ECBs rente." },
    lend: { nb: "Utlånsrente i bankene", unit: "%", log: true, hint: "Bankenes gjennomsnittlige utlånsrente." },
    real: { nb: "Realrente", unit: "%", log: true, mech: true, hint: "Utlånsrente minus prisvekst (BNP-deflator). Henger mekanisk sammen med inflasjonen, og svinger mye i land der oljeprisen påvirker deflatoren (som Norge)." },
    fiscal: { nb: "Statsbudsjettets balanse", unit: "% av BNP", hint: "Statens (sentralforvaltningens) overskudd (+) eller underskudd (−). For Norge inngår oljeinntektene." },
    debt: { nb: "Statsgjeld", unit: "% av BNP", hint: "Statens bruttogjeld. Mange hull i tallene." },
    fx: { nb: "Valutasvekkelse mot dollar", unit: "%", log: true, hint: "Endring i prisen på én amerikansk dollar i lokal valuta. Positivt tall = valutaen er svekket." },
    gdp: { nb: "BNP-vekst", unit: "%", hint: "Vekst i bruttonasjonalproduktet, faste priser." },
    unemp: { nb: "Arbeidsledighet", unit: "%", hint: "Andel av arbeidsstyrken (ILO-anslag fra 1991)." },
    ca: { nb: "Driftsbalansen mot utlandet", unit: "% av BNP", hint: "Overskudd (+) eller underskudd (−) i handelen med varer, tjenester og kapitalinntekter." },
    trade: { nb: "Åpenhet for handel", unit: "% av BNP", hint: "Eksport pluss import i prosent av BNP." },
    oil: { nb: "Oljepris, endring", unit: "%", log: false, global: true, hint: "Prosentvis endring i oljeprisen (USD) fra året før. Lik for alle land." },
  };
  const FK = Object.keys(F);
  const tf = (k, v) => (v == null ? null : k === "infl" || F[k]?.log ? sl(v) : v);

  const COUNTRIES = Object.keys(C).filter((c) => V.infl[c]).sort((a, b) => name(a).localeCompare(name(b), "nb"));
  const ALLC = [...COUNTRIES, ...Object.keys(AGG).filter((a) => V.infl[a])];

  // ---------------------------------------------------------------- statistikk
  function ranks(a) {
    const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Array(a.length);
    for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const rr = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = rr; i = j + 1; }
    return r;
  }
  function pearson(x, y) {
    const n = x.length; if (n < 3) return null;
    const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }
  const spearman = (x, y) => pearson(ranks(x), ranks(y));
  // tosidig fortegnstest: er andelen positive korrelasjoner forskjellig fra 50 %?
  function signTest(k, n) {
    if (!n) return null;
    const lo = ibeta(n - k, k + 1, 0.5), hi = k ? ibeta(k, n - k + 1, 0.5) : 1;
    return Math.min(1, 2 * Math.min(lo, hi));
  }

  // mellom land: snitt per land over perioden
  function between(k, p0, p1) {
    const rows = [];
    for (const c of COUNTRIES) {
      const xs = [], ys = [];
      for (let y = p0; y <= p1; y++) { const a = val(k, c, y), b = val("infl", c, y); if (a != null && b != null) { xs.push(a); ys.push(b); } }
      if (xs.length >= Math.max(3, Math.ceil(0.4 * (p1 - p0 + 1)))) rows.push({ c, x: mean(xs), y: mean(ys), n: xs.length });
    }
    if (rows.length < 5) return { rows, n: rows.length };
    const rs = spearman(rows.map((r) => r.x), rows.map((r) => r.y));
    const rp = pearson(rows.map((r) => tf(k, r.x)), rows.map((r) => tf("infl", r.y)));
    return { rows, n: rows.length, r: rs, ...signif(rs, rows.length, 1.06), rp, pp: signif(rp, rows.length).p };
  }
  // innen land: korrelasjon over tid i hvert land (faktoren forskjøvet lag år; negativt lag = faktoren kommer før)
  function withinC(k, c, p0, p1, lag = 0, minN = 8) {
    const xs = [], ys = [];
    for (let y = p0; y <= p1; y++) { const a = val(k, c, y + lag), b = val("infl", c, y); if (a != null && b != null) { xs.push(tf(k, a)); ys.push(tf("infl", b)); } }
    if (xs.length < minN) return null;
    const r = pearson(xs, ys);
    return r == null ? null : { r, n: xs.length };
  }
  function within(k, p0, p1, lag = 0) {
    const per = COUNTRIES.map((c) => ({ c, w: withinC(k, c, p0, p1, lag) })).filter((x) => x.w).map((x) => ({ c: x.c, r: x.w.r, n: x.w.n }));
    const rs = per.map((x) => x.r).sort(d3.ascending);
    const pos = rs.filter((r) => r > 0).length;
    return { per, n: per.length, med: median(rs), q1: d3.quantile(rs, 0.25), q3: d3.quantile(rs, 0.75), pos, p: signTest(pos, per.length) };
  }
  // global faktor (oljepris): verdens medianinflasjon år for år
  const worldMed = Y.map((y) => median(COUNTRIES.map((c) => val("infl", c, y)).filter((v) => v != null)));
  function globalCorr(k, p0, p1) {
    const xs = [], ys = [], rows = [];
    for (let y = p0; y <= p1; y++) { const a = val(k, null, y), b = worldMed[yi(y)]; if (a != null && b != null) { xs.push(a); ys.push(b); rows.push({ c: String(y), y: b, x: a, year: y }); } }
    if (xs.length < 5) return { rows, n: xs.length };
    const r = spearman(xs, ys);
    return { rows, n: xs.length, r, ...signif(r, xs.length, 1.06) };
  }

  // ---------------------------------------------------------------- tilstand
  const st = { year: LAST, zoom: "verden", chips: ["SWE", "USA", "GBR", "EMU", "WLD"], tscale: "lin", tfrom: 1970, p0: 1990, p1: LAST, cmode: "between", sx: "money", smode: "avg", cc: "NOR", cf: "policy", mc: "NOR", mfrom: 2000, noper: 1920 };
  (function readHash() { const h = new URLSearchParams(location.hash.slice(1)); if (F[h.get("x")]) st.sx = h.get("x"); if (C[h.get("c")]) st.cc = h.get("c"); })();
  function seg(id, cb) { const el = document.getElementById(id); el.querySelectorAll("button").forEach((b) => (b.onclick = () => { el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); cb(b.dataset.v); })); }
  const opts = (arr, cur) => arr.map(([v, t]) => `<option value="${v}"${String(v) === String(cur) ? " selected" : ""}>${S.escapeHtml(t)}</option>`).join("");
  const yearsDesc = Y.slice(1).reverse();

  const yearSel = document.getElementById("year");
  yearSel.innerHTML = opts(yearsDesc.map((y) => [y, y]), st.year);
  yearSel.onchange = () => { st.year = +yearSel.value; wmap(); rank(); };
  seg("zoom", (v) => { st.zoom = v; wmap(); });
  seg("tscale", (v) => { st.tscale = v; series(); });
  const tfrom = document.getElementById("tfrom");
  tfrom.innerHTML = opts([1960, 1970, 1980, 1990, 2000, 2010, 2015].map((y) => [y, y]), st.tfrom);
  tfrom.onchange = () => { st.tfrom = +tfrom.value; series(); };
  const pfrom = document.getElementById("pfrom"), pto = document.getElementById("pto");
  pfrom.innerHTML = opts(Y.filter((y) => y <= LAST - 5).map((y) => [y, y]), st.p0);
  pto.innerHTML = opts(Y.filter((y) => y >= Y0 + 5).reverse().map((y) => [y, y]), st.p1);
  pfrom.onchange = () => { st.p0 = Math.min(+pfrom.value, st.p1 - 5); pfrom.value = st.p0; analysis(); };
  pto.onchange = () => { st.p1 = Math.max(+pto.value, st.p0 + 5); pto.value = st.p1; analysis(); };
  seg("cmode", (v) => { st.cmode = v; corr(); });
  const sx = document.getElementById("sx");
  sx.innerHTML = opts(FK.map((k) => [k, F[k].nb]), st.sx);
  sx.onchange = () => { st.sx = sx.value; scatter(); lagChart(); };
  seg("smode", (v) => { st.smode = v; scatter(); });

  const addc = document.getElementById("addc");
  document.getElementById("clist").innerHTML = ALLC.filter((c) => c !== "NOR").map((c) => `<option value="${S.escapeHtml(name(c))}">`).join("");
  addc.onchange = () => { const c = ALLC.find((x) => name(x).toLowerCase() === addc.value.trim().toLowerCase()); if (c) { addChip(c); addc.value = ""; } };
  function addChip(c, scroll) {
    if (c !== "NOR" && !st.chips.includes(c)) { st.chips.push(c); if (st.chips.length > 7) st.chips.shift(); }
    series(); rank();
    if (scroll) document.getElementById("t-sub").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ---------------------------------------------------------------- KPI
  function kpis() {
    const ly = [...Y].reverse().find((y) => COUNTRIES.filter((c) => val("infl", c, y) != null).length > 100) || LAST;
    const vals = COUNTRIES.map((c) => ({ c, v: val("infl", c, ly) })).filter((x) => x.v != null).sort((a, b) => a.v - b.v);
    const no = val("infl", "NOR", ly), pos = vals.findIndex((x) => x.c === "NOR") + 1;
    const over10 = vals.filter((x) => x.v > 10);
    const top = vals[vals.length - 1];
    const M = d.monthly, mi = lastIdx(M.cpi.NOR), mcpi = M.cpi.NOR[mi], mpol = polAt("NOR", mi);
    const b = between("money", 1990, LAST);
    const cards = [
      { l: `Inflasjon i Norge ${ly}`, v: pc(no), s: `Nr. ${vals.length - pos + 1} av ${vals.length} land (høyest først) · verdensmedianen ${pc(worldMed[yi(ly)])}` },
      { l: `Norge, ${monthLab(M.months[mi])}`, v: pc(mcpi), s: `Siste 12 måneder · styringsrenten ${pc(mpol)}, realrente ${pp(mpol - mcpi).replace(" pp", " %-poeng")}` },
      { l: `Land med over 10 % inflasjon i ${ly}`, v: `${over10.length} av ${vals.length}`, s: `Høyest: ${S.escapeHtml(name(top.c))} (${pc(top.v)})` },
      { l: "Pengemengde og inflasjon, 1990–" + LAST, v: `r = ${fr(b.r)}`, s: `Rangkorrelasjon mellom ${b.n} land, ${fp(b.p)}: Mer penger, høyere priser` },
    ];
    document.getElementById("kpis").innerHTML = cards.map((c) => `<div class="card kpi"><div class="l">${c.l}</div><div class="v">${c.v}</div><div class="s">${c.s}</div></div>`).join("");
  }

  // ---------------------------------------------------------------- farger
  const BINS = [0, 2, 4, 6, 10, 20, 50];
  function ramp() {
    const dark = S.isDark();
    return dark
      ? { neg: "#3987e5", seq: ["#3d2a1d", "#5e3620", "#874424", "#b4532a", "#d96d3a", "#ee9a5c", "#f7c58f"] }
      : { neg: "#2a78d6", seq: ["#fbe7c6", "#f6c98e", "#efa35f", "#e27a3c", "#c8522a", "#9c301c", "#661a10"] };
  }
  function colOf(v) { if (v == null) return null; const R = ramp(); if (v < 0) return R.neg; let k = 0; while (k < BINS.length - 1 && v >= BINS[k + 1]) k++; return R.seq[k]; }

  // ---------------------------------------------------------------- kart
  function wmap() {
    const el = document.getElementById("map"), y = st.year;
    const n = COUNTRIES.filter((c) => val("infl", c, y) != null).length;
    document.getElementById("m-title").textContent = `Inflasjon ${y}`;
    document.getElementById("m-sub").textContent = `${n} land med tall. Klikk på et land for å se det over tid.`;
    const w = Math.max(300, el.clientWidth || 700), h = Math.round(w * (st.zoom === "europa" ? 0.78 : 0.52));
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    svg.append("clipPath").attr("id", "iclip").append("rect").attr("width", w).attr("height", h - 44);
    const proj = st.zoom === "europa"
      ? d3.geoConicConformal().rotate([-12, 0]).parallels([40, 68]).fitExtent([[4, 4], [w - 4, h - 46]], { type: "Feature", geometry: { type: "Polygon", coordinates: [[[-11, 35], [-11, 71], [40, 71], [40, 35], [-11, 35]]] } })
      : d3.geoEqualEarth().fitExtent([[4, 4], [w - 4, h - 46]], { type: "FeatureCollection", features: land });
    const path = d3.geoPath(proj);
    svg.append("g").attr("clip-path", "url(#iclip)").selectAll("path").data(land).join("path").attr("d", path)
      .attr("class", (f) => (val("infl", f.properties.id, y) == null ? "na" : "c"))
      .attr("fill", (f) => colOf(val("infl", f.properties.id, y)))
      .on("mousemove", (e, f) => {
        const c = f.properties.id, v = val("infl", c, y);
        tip.show(`<div class="tt-title">${S.escapeHtml(name(c))}</div>${v != null ? `<div class="tt-row"><span>Inflasjon ${y}</span><b>${pc(v)}</b></div>${[["policy", "Styringsrente"], ["money", "Pengemengdevekst"], ["fx", "Valutasvekkelse mot USD"], ["fiscal", "Statsbudsjett, % av BNP"]].map(([k, t]) => (val(k, c, y) != null ? `<div class="tt-row"><span>${t}</span><b>${k === "fiscal" ? f1(val(k, c, y)) : pc(val(k, c, y))}</b></div>` : "")).join("")}` : '<div class="tt-row"><span>Ingen tall</span></div>'}`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => tip.hide())
      .on("click", (e, f) => { if (V.infl[f.properties.id]) addChip(f.properties.id, true); });
    const nof = land.find((f) => f.properties.id === "NOR");
    if (nof) svg.append("path").attr("class", "sel").attr("clip-path", "url(#iclip)").attr("d", path(nof));
    const R = ramp(), cols = [R.neg, ...R.seq], labs = ["0", "2", "4", "6", "10", "20", "50"];
    const lg = svg.append("g").attr("class", "lg").attr("transform", `translate(8,${h - 36})`), bw = Math.min(40, (w - 40) / cols.length);
    cols.forEach((c, k) => lg.append("rect").attr("x", k * bw).attr("y", 0).attr("width", bw - 2).attr("height", 10).attr("rx", 2).attr("fill", c));
    labs.forEach((t, k) => lg.append("text").attr("x", (k + 1) * bw - 1).attr("y", 26).attr("text-anchor", "middle").text(t));
    lg.append("text").attr("x", cols.length * bw + 6).attr("y", 9).text("%");
  }

  // ---------------------------------------------------------------- rangering
  function rank() {
    const y = st.year, el = document.getElementById("rank");
    const rows = ALLC.map((c) => ({ c, v: val("infl", c, y) })).filter((x) => x.v != null).sort((a, b) => b.v - a.v);
    const nc = rows.filter((r) => !AGG[r.c]);
    const pos = nc.findIndex((r) => r.c === "NOR") + 1;
    document.getElementById("r-sub").textContent = `${nc.length} land, høyest først. Norge er nr. ${pos || "–"}. Søylene er komprimert slik at hyperinflasjon ikke skjuler resten.`;
    const mx = sl(Math.max(1, d3.max(rows, (r) => r.v))), mn = sl(Math.min(0, d3.min(rows, (r) => r.v)));
    const x = (v) => (100 * (sl(v) - mn)) / (mx - mn || 1);
    let k = 0;
    el.innerHTML = rows.map((r) => {
      const i = AGG[r.c] ? "" : ++k, a = Math.min(x(0), x(r.v)), b = Math.abs(x(r.v) - x(0));
      return `<div class="r ${r.c === "NOR" ? "no" : ""} ${NORD.has(r.c) ? "nord" : ""} ${AGG[r.c] ? "agg" : ""} ${st.chips.includes(r.c) ? "pick" : ""}" data-c="${r.c}"><span class="i">${i}</span><span>${S.escapeHtml(name(r.c))}</span><div class="bw"><div class="z" style="left:${x(0).toFixed(1)}%"></div><div class="b" style="left:${a.toFixed(1)}%;width:${Math.max(0.6, b).toFixed(1)}%;${r.c === "NOR" || NORD.has(r.c) ? "" : `background:${colOf(r.v)}`}"></div></div><span class="v">${pc(r.v)}</span></div>`;
    }).join("");
    el.querySelectorAll(".r").forEach((row) => (row.onclick = () => addChip(row.dataset.c, true)));
  }

  // ---------------------------------------------------------------- generelt linjediagram
  const SYM_TICKS = [-1000, -100, -50, -20, -10, -5, -2, 0, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 1e4, 1e5, 1e6, 1e7];
  function yScale(lo, hi, range, log) {
    if (log) {
      const s = d3.scaleSymlog().constant(1).domain([Math.min(0, lo), Math.max(10, hi)]).range(range);
      let last = null;
      s.myTicks = SYM_TICKS.filter((t) => t >= s.domain()[0] && t <= s.domain()[1]).filter((t) => { const ok = last == null || Math.abs(s(t) - s(last)) >= 18; if (ok) last = t; return ok; });
      return s;
    }
    const s = d3.scaleLinear([Math.min(0, lo), hi], range).nice();
    s.myTicks = s.ticks(6);
    return s;
  }
  const tickFmt = (t) => (Math.abs(t) >= 1e4 ? d3.format("~s")(t).replace("k", " k").replace("M", " mill.") : S.nf0.format(t)).replace("-", "−");

  /** o: {series:[{label,color,w,dash,pts:[[x,y]],right}], log, h, xfmt, vfmt, area, annots, refs, endLabels, y2label} */
  function lineChart(el, o) {
    const w = Math.max(300, el.clientWidth || 800), h = o.h || 340, narrow = w < 560;
    const hasR = o.series.some((s) => s.right);
    const m = { t: o.annots ? 30 : 12, r: (o.endLabels ? (narrow ? 70 : 110) : 12) + (hasR ? 40 : 0), b: 28, l: 46 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const allPts = o.series.flatMap((s) => s.pts);
    if (!allPts.length) { svg.append("text").attr("x", w / 2).attr("y", h / 2).attr("text-anchor", "middle").attr("fill", "var(--text-3)").text("Ingen tall for dette valget"); return; }
    const x = d3.scaleLinear(o.xdom || d3.extent(allPts, (p) => p[0]), [m.l, w - m.r]);
    const L = o.series.filter((s) => !s.right).flatMap((s) => s.pts.map((p) => p[1])).concat(o.area ? o.area.map((p) => p[1]) : []);
    const y = yScale(d3.min(L) ?? 0, d3.max(L) ?? 10, [h - m.b, m.t], o.log);
    let y2 = null;
    if (hasR) { const Rv = o.series.filter((s) => s.right).flatMap((s) => s.pts.map((p) => p[1])); y2 = yScale(d3.min(Rv), d3.max(Rv), [h - m.b, m.t], false); }
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(y.myTicks).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(y.myTicks).tickFormat(tickFmt).tickPadding(6));
    if (y2) {
      svg.append("g").attr("class", "axis y").attr("transform", `translate(${w - m.r},0)`).call(d3.axisRight(y2).tickValues(y2.myTicks).tickFormat(tickFmt).tickPadding(6)).selectAll("text").attr("fill", o.series.find((s) => s.right).color);
      if (o.y2label) svg.append("text").attr("x", w - m.r + 4).attr("y", m.t - 2).attr("class", "sm").attr("font-size", 11).attr("fill", "var(--text-3)").text(o.y2label);
    }
    const x0 = x.domain()[0], x1 = x.domain()[1];
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(Math.min(12, w / 70)).tickFormat(d3.format("d")).tickSizeOuter(0));
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "var(--text-3)");
    (o.refs || []).forEach((r) => {
      svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(r.y)).attr("y2", y(r.y)).attr("stroke", "var(--text-3)").attr("stroke-dasharray", "3 4");
      svg.append("text").attr("x", m.l + 4).attr("y", y(r.y) - 4).attr("font-size", 11).attr("fill", "var(--text-3)").text(r.t);
    });
    if (o.area && o.area.length) {
      svg.append("path").datum(o.area).attr("fill", o.areaColor || "var(--series-1)").attr("opacity", 0.18)
        .attr("d", d3.area().defined((p) => p[1] != null).x((p) => x(p[0])).y0(y(0)).y1((p) => y(p[1])));
    }
    (o.annots || []).filter((a) => a.x >= x0 && a.x <= x1).forEach((a, k) => {
      const g = svg.append("g").attr("class", "annot");
      g.append("line").attr("x1", x(a.x)).attr("x2", x(a.x)).attr("y1", m.t - 4).attr("y2", h - m.b);
      g.append("text").attr("x", x(a.x) + 3).attr("y", m.t - 8 - (k % 2) * 11 + 11).text(a.t);
    });
    const labs = [];
    o.series.slice().reverse().forEach((s) => {
      if (!s.pts.length) return;
      const yy = s.right ? y2 : y;
      svg.append("path").datum(s.pts).attr("fill", "none").attr("stroke", s.color).attr("stroke-width", s.w || 2).attr("stroke-dasharray", s.dash ? "5 4" : null).attr("stroke-linejoin", "round")
        .attr("d", d3.line().defined((p) => p[1] != null).x((p) => x(p[0])).y((p) => yy(p[1])));
      if (o.endLabels) { const lp = s.pts[s.pts.length - 1]; labs.push({ t: s.label, x: x(lp[0]) + 8, y: yy(lp[1]) + 4, bold: s.w >= 3 }); }
    });
    labs.sort((a, b) => a.y - b.y);
    for (let k = 1; k < labs.length; k++) if (labs[k].y - labs[k - 1].y < 13) labs[k].y = labs[k - 1].y + 13;
    labs.forEach((l) => svg.append("text").attr("x", l.x).attr("y", l.y).attr("fill", "var(--text-2)").attr("font-size", 11.5).attr("font-weight", l.bold ? 700 : 500).text(l.t.length > 14 && narrow ? l.t.slice(0, 12) + "…" : l.t));
    // tooltip
    const key = (v) => Math.round(v * 12);
    const maps = o.series.map((s) => new Map(s.pts.map((p) => [key(p[0]), p[1]])));
    const xs = [...new Set(allPts.map((p) => key(p[0])))].sort((a, b) => a - b);
    const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--border-strong)").style("display", "none");
    svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", w - m.l - m.r).attr("height", h - m.b - m.t).attr("fill", "transparent")
      .on("mousemove", (e) => {
        const t = key(x.invert(d3.pointer(e)[0]));
        let i = d3.bisectLeft(xs, t); if (i >= xs.length) i = xs.length - 1; if (i > 0 && Math.abs(xs[i - 1] - t) < Math.abs(xs[i] - t)) i--;
        const kx = xs[i];
        cross.style("display", null).attr("x1", x(kx / 12)).attr("x2", x(kx / 12));
        const rows = o.series.map((s, j) => ({ s, v: maps[j].get(kx) }));
        if (!o.keepOrder) rows.sort((a, b) => (b.v ?? -1e9) - (a.v ?? -1e9));
        tip.show(`<div class="tt-title">${o.xfmt ? o.xfmt(kx / 12) : kx / 12}</div>${rows.map(({ s, v }) => `<div class="tt-row"><span><span class="key" style="background:${s.color}"></span>${S.escapeHtml(s.label)}</span><b>${o.vfmt ? o.vfmt(v, s) : pc(v)}</b></div>`).join("")}${o.extraTip ? o.extraTip(kx) : ""}`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => { tip.hide(); cross.style("display", "none"); });
  }

  // ---------------------------------------------------------------- tidsserie
  const PAL = ["var(--series-1)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)", "var(--series-7)", "var(--text-2)"];
  function series() {
    const ser = [{ c: "NOR", color: "var(--series-2)", w: 3 }, ...st.chips.map((c, k) => ({ c, color: PAL[k % PAL.length], dash: !!AGG[c] }))];
    document.getElementById("t-sub").textContent = "Årlig prisvekst i prosent. Velg opptil sju land i kartet, i listen eller i søkefeltet. «Komprimert» skala gjør det mulig å se land med svært høy inflasjon sammen med resten.";
    document.getElementById("chips").innerHTML = ser.map((s) => `<span class="chip"><span class="sw" style="background:${s.color}"></span>${S.escapeHtml(name(s.c))}${s.c === "NOR" ? '<span style="width:6px"></span>' : `<button data-c="${s.c}" aria-label="Fjern ${S.escapeHtml(name(s.c))}">×</button>`}</span>`).join("");
    document.querySelectorAll("#chips button").forEach((b) => (b.onclick = () => { st.chips = st.chips.filter((c) => c !== b.dataset.c); series(); rank(); }));
    lineChart(document.getElementById("ts"), {
      series: ser.map((s) => ({ label: name(s.c), color: s.color, w: s.w, dash: s.dash, pts: Y.filter((y) => y >= st.tfrom && val("infl", s.c, y) != null).map((y) => [y, val("infl", s.c, y)]) })),
      log: st.tscale === "log", endLabels: true, xdom: [st.tfrom, LAST], xfmt: (x) => String(Math.round(x)),
    });
  }

  // ---------------------------------------------------------------- sammenhenger (oversikt)
  function corr() {
    const el = document.getElementById("corr"), p0 = st.p0, p1 = st.p1, md = st.cmode;
    const nTest = FK.length, alpha = 0.05, bonf = alpha / nTest;
    let rows = FK.map((k) => {
      if (md === "between") {
        const b = F[k].global ? globalCorr(k, p0, p1) : between(k, p0, p1);
        return { k, r: b.r, lo: b.lo, hi: b.hi, p: b.p, n: b.n, b, glob: !!F[k].global };
      }
      const wv = within(k, p0, p1);
      return { k, r: wv.med, lo: wv.q1, hi: wv.q3, p: wv.p, n: wv.n, wv };
    }).filter((r) => r.r != null);
    rows.sort((a, b) => b.r - a.r);
    rows.forEach((r) => (r.sig = r.p < bonf ? 2 : r.p < alpha ? 1 : 0));
    document.getElementById("c-sub").textContent = md === "between"
      ? `Rangkorrelasjon (Spearman) mellom landenes gjennomsnitt for ${p0}–${p1}, med 95 % konfidensintervall. Positiv: land med mye av dette har hatt høyere inflasjon. Oljeprisen er lik for alle land og sammenlignes med verdens medianinflasjon år for år. Klikk på en rad for å se punktdiagrammet.`
      : `Korrelasjonen over tid i hvert land (${p0}–${p1}, minst 8 år med tall). Søylen er medianlandet, streken viser midterste halvdel av landene, og prikkene er hvert land (Norge i oransje). Positiv: inflasjonen er høyere de årene landet har mer av dette enn ellers.`;
    const w = Math.max(300, el.clientWidth || 800), narrow = w < 640, rowH = narrow ? 66 : 38, m = { t: 6, r: narrow ? 10 : 230, b: 26, l: narrow ? 10 : 250 };
    const h = m.t + m.b + rowH * rows.length;
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear([-1, 1], [m.l, w - m.r]);
    svg.append("g").attr("class", "grid").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(8).tickSize(-(h - m.t - m.b)).tickFormat(""));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(8).tickFormat((t) => t.toFixed(2).replace(/0$/, "").replace(".", ",").replace("-", "−")).tickSizeOuter(0));
    svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--text-3)");
    rows.forEach((r, i) => {
      const yy = m.t + i * rowH, by = narrow ? yy + 22 : yy + 10, bh = narrow ? 14 : rowH - 20, cy = by + bh / 2;
      const sigTxt = r.sig === 2 ? "Signifikant også etter Bonferroni-korreksjon" : r.sig === 1 ? "Signifikant på 5 %-nivå, men ikke etter korreksjon for mange tester" : "Ikke signifikant – kan skyldes tilfeldigheter";
      const g = svg.append("g").style("cursor", "pointer")
        .on("click", () => { st.sx = r.k; sx.value = r.k; scatter(); lagChart(); document.getElementById("sc-title").scrollIntoView({ behavior: "smooth", block: "start" }); })
        .on("mousemove", (e) => tip.show(md === "between"
          ? `<div class="tt-title">${F[r.k].nb}</div><div class="tt-row"><span>Rangkorrelasjon</span><b>${fr(r.r)}</b></div><div class="tt-row"><span>95 % konfidensintervall</span><b>${fr(r.lo)} til ${fr(r.hi)}</b></div><div class="tt-row"><span>p-verdi</span><b>${fp(r.p)}</b></div>${r.glob ? "" : `<div class="tt-row"><span>Pearson, komprimert skala</span><b>${fr(r.b.rp)}</b></div>`}<div class="tt-row"><span>${r.glob ? "År" : "Land"}</span><b>${r.n}</b></div><div style="max-width:290px;margin-top:4px">${sigTxt}. ${S.escapeHtml(F[r.k].hint)}</div>`
          : `<div class="tt-title">${F[r.k].nb}</div><div class="tt-row"><span>Median korrelasjon</span><b>${fr(r.r)}</b></div><div class="tt-row"><span>Midterste halvdel</span><b>${fr(r.lo)} til ${fr(r.hi)}</b></div><div class="tt-row"><span>Land med positiv sammenheng</span><b>${r.wv.pos} av ${r.n}</b></div><div class="tt-row"><span>Fortegnstest</span><b>${fp(r.p)}</b></div>${r.wv.per.find((x) => x.c === "NOR") ? `<div class="tt-row"><span>Norge</span><b>${fr(r.wv.per.find((x) => x.c === "NOR").r)}</b></div>` : ""}<div style="max-width:290px;margin-top:4px">${sigTxt}. ${S.escapeHtml(F[r.k].hint)}</div>`, e.clientX, e.clientY))
        .on("mouseleave", () => tip.hide());
      g.append("rect").attr("x", 0).attr("y", yy).attr("width", w).attr("height", rowH).attr("fill", "transparent");
      g.append("text").attr("x", narrow ? m.l : m.l - 12).attr("y", narrow ? yy + 15 : yy + rowH / 2 + 4).attr("text-anchor", narrow ? "start" : "end").attr("fill", "var(--text)").attr("font-size", 13).text(F[r.k].nb + (F[r.k].mech ? " *" : ""));
      g.append("rect").attr("x", Math.min(x(0), x(r.r))).attr("y", by).attr("height", bh).attr("rx", 3).attr("width", Math.abs(x(r.r) - x(0)))
        .attr("fill", r.r > 0 ? "var(--series-5)" : "var(--series-1)").attr("opacity", r.sig ? (md === "within" ? 0.55 : 1) : 0.3);
      if (md === "within") {
        r.wv.per.forEach((q, j) => g.append("circle").attr("cx", x(q.r)).attr("cy", cy + (((j * 7919) % 11) - 5) * (bh / 14)).attr("r", q.c === "NOR" ? 4 : 1.6)
          .attr("fill", q.c === "NOR" ? "var(--series-2)" : "var(--text)").attr("opacity", q.c === "NOR" ? 1 : 0.35).attr("stroke", q.c === "NOR" ? "var(--surface)" : null));
      }
      if (r.lo != null && r.hi != null) {
        g.append("line").attr("x1", x(r.lo)).attr("x2", x(r.hi)).attr("y1", cy).attr("y2", cy).attr("stroke", "var(--text)").attr("stroke-width", 1.5);
        [r.lo, r.hi].forEach((xv) => g.append("line").attr("x1", x(xv)).attr("x2", x(xv)).attr("y1", cy - 5).attr("y2", cy + 5).attr("stroke", "var(--text)").attr("stroke-width", 1.5));
      }
      const lab = md === "between"
        ? `${fr(r.r)} · ${fp(r.p)} · ${r.n} ${r.glob ? "år" : "land"}${r.sig === 2 ? " ✓" : r.sig === 1 ? " (✓)" : ""}`
        : `${fr(r.r)} · ${r.wv.pos} av ${r.n} positive${r.sig === 2 ? " ✓" : r.sig === 1 ? " (✓)" : ""}`;
      if (narrow) g.append("text").attr("x", m.l).attr("y", by + bh + 15).attr("fill", "var(--text-2)").attr("font-size", 11.5).attr("font-weight", 600).text(lab);
      else g.append("text").attr("x", w - m.r + 14).attr("y", cy + 4).attr("fill", "var(--text)").attr("font-size", 12).attr("font-weight", 600).text(lab);
    });
    const sig = rows.filter((r) => r.sig === 2), non = rows.filter((r) => r.sig === 0);
    const nm = (rs) => rs.map((r) => F[r.k].nb.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " og $1");
    const posS = sig.filter((r) => r.r > 0), negS = sig.filter((r) => r.r < 0);
    document.getElementById("c-note").innerHTML = `<b>Signifikanstest:</b> ${md === "between" ? "t-test av rangkorrelasjonen" : "fortegnstest av om flere land enn ventet ved ren tilfeldighet har positiv (eller negativ) sammenheng"}, med Bonferroni-korreksjon for ${nTest} samtidige tester (✓ = p < ${String(bonf.toFixed(4)).replace(".", ",")}). `
      + (posS.length ? `Tydelig positiv sammenheng med ${nm(posS)}. ` : "") + (negS.length ? `Tydelig negativ sammenheng med ${nm(negS)}. ` : "") + (non.length ? `Ingen sikker sammenheng med ${nm(non)}. ` : "")
      + `* Realrenten regnes ut med inflasjonen og henger derfor mekanisk sammen med den. Korrelasjon viser samvariasjon, ikke årsak: høy inflasjon kan like gjerne gi høy rente og svak valuta som omvendt.`;
  }

  // ---------------------------------------------------------------- punktdiagram
  function scatter() {
    const k = st.sx, f = F[k], el = document.getElementById("scatter"), p0 = st.p0, p1 = st.p1;
    const glob = !!f.global, avg = st.smode === "avg" || glob;
    document.querySelectorAll("#smode button").forEach((b) => (b.disabled = glob));
    document.getElementById("sc-title").textContent = `Inflasjon og ${f.nb.toLowerCase()}`;
    let pts, stats;
    if (glob) {
      const g = globalCorr(k, p0, p1);
      pts = g.rows.map((r) => ({ c: r.c, x: r.x, y: r.y, lab: String(r.year) }));
      stats = `<span>Rangkorrelasjon <b>${fr(g.r)}</b></span><span><b>${fp(g.p)}</b></span><span><b>${g.n}</b> år</span>`;
      document.getElementById("sc-sub").textContent = `Hvert punkt er ett år (${p0}–${p1}): endringen i oljeprisen og medianinflasjonen blant alle land.`;
    } else if (avg) {
      const b = between(k, p0, p1);
      pts = b.rows.map((r) => ({ ...r, lab: name(r.c) }));
      stats = `<span>Rangkorrelasjon <b>${fr(b.r)}</b> (95 % KI ${fr(b.lo)} til ${fr(b.hi)})</span><span><b>${fp(b.p)}</b></span><span>Pearson, komprimert skala <b>${fr(b.rp)}</b></span><span><b>${b.n}</b> land</span>`;
      document.getElementById("sc-sub").textContent = `Hvert punkt er ett land: gjennomsnittet for ${p0}–${p1} (år der begge tallene finnes). Farge viser verdensdel. Linjen er en regresjonslinje på komprimert skala.`;
    } else {
      pts = [];
      for (const c of COUNTRIES) for (let y = p0; y <= p1; y++) { const a = val(k, c, y), b = val("infl", c, y); if (a != null && b != null) pts.push({ c, x: a, y: b, year: y, lab: `${name(c)} ${y}` }); }
      const wv = within(k, p0, p1);
      const rs = spearman(pts.map((p) => p.x), pts.map((p) => p.y));
      stats = `<span>Alle landår, rangkorrelasjon <b>${fr(rs)}</b></span><span>Innen land, median <b>${fr(wv.med)}</b></span><span><b>${wv.pos}</b> av <b>${wv.n}</b> land positive (${fp(wv.p)})</span><span><b>${S.int(pts.length)}</b> landår</span>`;
      document.getElementById("sc-sub").textContent = `Hvert punkt er ett land i ett år (${p0}–${p1}). Norge er uthevet. Mange punkter fra samme land er ikke uavhengige, så se på tallet for «innen land».`;
    }
    document.getElementById("sc-stats").innerHTML = stats;
    const w = Math.max(300, el.clientWidth || 800), h = Math.min(520, Math.max(340, w * 0.55)), m = { t: 12, r: 18, b: 44, l: 54 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    if (pts.length < 3) { svg.append("text").attr("x", w / 2).attr("y", h / 2).attr("text-anchor", "middle").attr("fill", "var(--text-3)").text("For få tall for denne perioden"); return; }
    const logX = !!f.log, logY = true;
    const xq = pts.map((p) => p.x).sort(d3.ascending), yq = pts.map((p) => p.y).sort(d3.ascending);
    const xs = yScale(Math.min(0, xq[0]), xq[xq.length - 1], [m.l, w - m.r], logX);
    if (!logX) { xs.domain(d3.extent(xq)).nice(); xs.myTicks = xs.ticks(8); }
    const ys = yScale(Math.min(0, yq[0]), yq[yq.length - 1], [h - m.b, m.t], logY);
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(ys).tickValues(ys.myTicks).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "grid").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(xs).tickValues(xs.myTicks).tickSize(-(h - m.t - m.b)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(ys).tickValues(ys.myTicks).tickFormat(tickFmt).tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(xs).tickValues(xs.myTicks).tickFormat(tickFmt).tickSizeOuter(0));
    svg.append("text").attr("x", w - m.r).attr("y", h - 6).attr("text-anchor", "end").attr("fill", "var(--text-2)").attr("font-size", 12).text(`${f.nb} (${f.unit})${logX ? ", komprimert skala" : ""} →`);
    svg.append("text").attr("x", m.l + 4).attr("y", m.t + 10).attr("fill", "var(--text-2)").attr("font-size", 12).text(`↑ Inflasjon (%${glob ? ", verdensmedian" : ""}), komprimert skala`);
    if (xs.domain()[0] < 0 && xs.domain()[1] > 0) svg.append("line").attr("x1", xs(0)).attr("x2", xs(0)).attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--text-3)");
    // regresjon på transformerte verdier
    const tx = pts.map((p) => tf(k, p.x)), ty = pts.map((p) => tf("infl", p.y));
    const mx = mean(tx), my = mean(ty);
    let sxy = 0, sxx = 0; tx.forEach((v, i) => { sxy += (v - mx) * (ty[i] - my); sxx += (v - mx) ** 2; });
    const slope = sxx ? sxy / sxx : 0, icpt = my - slope * mx;
    const inv = (v) => Math.sign(v) * Math.expm1(Math.abs(v));
    const line = d3.range(0, 61).map((i) => { const xv = xq[0] + ((xq[xq.length - 1] - xq[0]) * i) / 60; const yt = icpt + slope * tf(k, xv); return [xv, inv(yt)]; }).filter((p) => p[1] >= ys.domain()[0] && p[1] <= ys.domain()[1]);
    svg.append("path").datum(line).attr("fill", "none").attr("stroke", "var(--text-2)").attr("stroke-width", 1.6).attr("stroke-dasharray", "6 4").attr("d", d3.line().x((p) => xs(p[0])).y((p) => ys(p[1])));
    const many = pts.length > 600;
    const col = (p) => (glob ? "var(--series-4)" : p.c === "NOR" ? "var(--series-2)" : RCOL[C[p.c]?.r] || "var(--neutral-mark)");
    const sorted = pts.slice().sort((a, b) => (a.c === "NOR") - (b.c === "NOR"));
    svg.append("g").selectAll("circle").data(sorted).join("circle").attr("cx", (p) => xs(p.x)).attr("cy", (p) => ys(p.y))
      .attr("r", (p) => (p.c === "NOR" ? (many ? 3.5 : 6) : many ? 1.8 : 4.2)).attr("fill", col)
      .attr("opacity", (p) => (p.c === "NOR" ? 1 : many ? 0.35 : 0.8)).attr("stroke", (p) => (p.c === "NOR" ? "var(--surface)" : null))
      .on("mousemove", (e, p) => tip.show(`<div class="tt-title">${S.escapeHtml(p.lab)}</div><div class="tt-row"><span>${glob ? "Medianinflasjon i verden" : "Inflasjon"}${avg && !glob ? ", snitt" : ""}</span><b>${pc(p.y)}</b></div><div class="tt-row"><span>${f.nb}${avg && !glob ? ", snitt" : ""}</span><b>${f.unit === "%" ? pc(p.x) : f1(p.x) + " " + f.unit}</b></div>${p.n ? `<div class="tt-row"><span>År med tall</span><b>${p.n}</b></div>` : ""}${!glob && C[p.c] ? `<div class="tt-row"><span>Verdensdel</span><b>${REGION[C[p.c].r] || "–"}</b></div>` : ""}`, e.clientX, e.clientY))
      .on("mouseleave", () => tip.hide())
      .on("click", (e, p) => { if (!glob) { st.cc = p.c; ccSel.value = p.c; countryView(); } });
    // etiketter for ytterpunkter og Norden
    if (avg && !glob) {
      const want = ["NOR", "SWE", "DNK", "USA", "JPN", "CHE", "DEU", "ISL", "FIN", "ARG", "VEN", "ZWE", "TUR", "BRA"];
      const placed = [];
      want.map((c) => pts.find((p) => p.c === c)).filter(Boolean).filter((p) => {
        const px = xs(p.x), py = ys(p.y);
        if (placed.some((q) => Math.abs(q[1] - py) < 12 && Math.abs(q[0] - px) < 60)) return false;
        placed.push([px, py]); return true;
      }).forEach((p) => svg.append("text").attr("x", xs(p.x) + 7).attr("y", ys(p.y) + 4).attr("font-size", 11).attr("font-weight", p.c === "NOR" ? 700 : 500).attr("fill", "var(--text-2)").attr("pointer-events", "none").text(name(p.c)));
    } else if (glob) {
      pts.filter((p) => Math.abs(p.x) > 35 || p.y > 12).forEach((p) => svg.append("text").attr("x", xs(p.x) + 6).attr("y", ys(p.y) + 4).attr("font-size", 11).attr("fill", "var(--text-2)").text(p.lab));
    }
    const regs = glob ? [] : [...new Set(pts.map((p) => C[p.c]?.r).filter(Boolean))];
    document.getElementById("sc-note").innerHTML = (regs.length ? `<span class="row-legend" style="display:inline-flex">${Object.keys(REGION).filter((r) => regs.includes(r)).map((r) => `<span><i class="dot" style="background:${RCOL[r]}"></i>${REGION[r]}</span>`).join("")}<span><i class="dot" style="background:var(--series-2)"></i>Norge</span></span><br>` : "") + `<b>${S.escapeHtml(f.nb)}:</b> ${S.escapeHtml(f.hint)} Komprimert skala betyr at avstanden fra 1 til 10 % er like stor som fra 10 til 100 %.`;
  }

  // ---------------------------------------------------------------- hvem kommer først
  const LAGS = [-3, -2, -1, 0, 1, 2, 3];
  function lagChart() {
    const k = st.sx, f = F[k], el = document.getElementById("lag"), p0 = st.p0, p1 = st.p1;
    const rows = LAGS.map((L) => ({ L, w: within(k, p0, p1, L) })).filter((r) => r.w.n);
    document.getElementById("lag-sub").textContent = `Korrelasjon over tid innen hvert land mellom inflasjonen og ${f.nb.toLowerCase()} noen år før eller etter (${p0}–${p1}). Søylen er medianlandet, streken midterste halvdel av landene. Er sammenhengen sterkest til venstre, kommer endringen i ${f.nb.toLowerCase()} før inflasjonen. Til høyre: den følger etter.`;
    const w = Math.max(300, el.clientWidth || 800), h = 250, m = { t: 22, r: 12, b: 46, l: 44 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleBand(LAGS, [m.l, w - m.r]).padding(0.3);
    const ext = Math.max(0.3, d3.max(rows, (r) => Math.max(Math.abs(r.w.q1 ?? 0), Math.abs(r.w.q3 ?? 0), Math.abs(r.w.med ?? 0))) || 0.3);
    const y = d3.scaleLinear([-ext, ext], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat(fr).tickPadding(6));
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "var(--text-3)");
    const best = rows.reduce((a, b) => (Math.abs(b.w.med) > Math.abs(a.w.med) ? b : a), rows[0]);
    const narrow = w < 560;
    const lagLab = (L) => (L === 0 ? "Samme år" : L < 0 ? (narrow ? `${-L} år før` : `${-L} år før`) : `${L} år etter`);
    rows.forEach((r) => {
      const cx = x(r.L) + x.bandwidth() / 2, v = r.w.med;
      const g = svg.append("g").on("mousemove", (e) => tip.show(`<div class="tt-title">${f.nb}: ${lagLab(r.L).toLowerCase()} inflasjonen</div><div class="tt-row"><span>Median korrelasjon</span><b>${fr(v)}</b></div><div class="tt-row"><span>Midterste halvdel</span><b>${fr(r.w.q1)} til ${fr(r.w.q3)}</b></div><div class="tt-row"><span>Positive</span><b>${r.w.pos} av ${r.w.n} land</b></div><div class="tt-row"><span>Fortegnstest</span><b>${fp(r.w.p)}</b></div>`, e.clientX, e.clientY)).on("mouseleave", () => tip.hide());
      g.append("rect").attr("x", x(r.L)).attr("width", x.bandwidth()).attr("y", Math.min(y(0), y(v))).attr("height", Math.abs(y(v) - y(0))).attr("rx", 3)
        .attr("fill", v > 0 ? "var(--series-5)" : "var(--series-1)").attr("opacity", r === best ? 1 : 0.55);
      g.append("line").attr("x1", cx).attr("x2", cx).attr("y1", y(r.w.q1)).attr("y2", y(r.w.q3)).attr("stroke", "var(--text)").attr("stroke-width", 1.3);
      g.append("text").attr("x", cx).attr("y", v >= 0 ? Math.min(y(v), y(r.w.q3)) - 5 : Math.max(y(v), y(r.w.q1)) + 13).attr("text-anchor", "middle").attr("font-size", 11.5).attr("font-weight", 600).attr("fill", "var(--text)").text(fr(v));
      g.append("text").attr("x", cx).attr("y", h - m.b + 16).attr("text-anchor", "middle").attr("font-size", 11.5).attr("fill", "var(--text-2)").text(lagLab(r.L));
    });
    svg.append("text").attr("x", m.l).attr("y", h - 6).attr("font-size", 11.5).attr("fill", "var(--text-3)").text(`← ${f.nb} kommer først`);
    svg.append("text").attr("x", w - m.r).attr("y", h - 6).attr("text-anchor", "end").attr("font-size", 11.5).attr("fill", "var(--text-3)").text(`${f.nb} følger etter →`);
    const r0 = rows.find((r) => r.L === 0)?.w.med, rb = rows.find((r) => r.L === -1)?.w.med, ra = rows.find((r) => r.L === 1)?.w.med;
    let txt = `Sterkest sammenheng: ${f.nb.toLowerCase()} ${lagLab(best.L).toLowerCase()} inflasjonen (median ${fr(best.w.med)}). `;
    if (rb != null && ra != null && Math.abs(ra - rb) > 0.05) txt += ra > rb ? `Sammenhengen er sterkere når ${f.nb.toLowerCase()} måles året etter enn året før, noe som tyder på at den i stor grad <i>reagerer på</i> inflasjonen. ` : `Sammenhengen er sterkere når ${f.nb.toLowerCase()} måles året før enn året etter, noe som passer med at den <i>bidrar til</i> inflasjonen. `;
    if (k === "policy" || k === "lend") txt += "Renten settes opp når inflasjonen stiger, og den dempende virkningen kommer med forsinkelse. Derfor er korrelasjonen positiv også når renten virker som den skal.";
    document.getElementById("lag-note").innerHTML = txt;
    void r0;
  }

  // ---------------------------------------------------------------- land for land
  const ccSel = document.getElementById("cc"), cfSel = document.getElementById("cf");
  ccSel.innerHTML = opts(COUNTRIES.map((c) => [c, name(c)]), st.cc);
  ccSel.onchange = () => { st.cc = ccSel.value; countryView(); };
  cfSel.onchange = () => { st.cf = cfSel.value; countryView(); };
  function countryView() {
    const c = st.cc;
    const avail = FK.filter((k) => Y.filter((y) => val(k, c, y) != null && val("infl", c, y) != null).length >= 8);
    if (!avail.includes(st.cf)) st.cf = avail.includes("policy") ? "policy" : avail.includes("money") ? "money" : avail[0];
    cfSel.innerHTML = opts(avail.map((k) => [k, F[k].nb]), st.cf);
    const k = st.cf, f = F[k];
    document.getElementById("cc-title").textContent = `${name(c)}: inflasjon og ${f ? f.nb.toLowerCase() : "–"}`;
    if (!f) { document.getElementById("cts").innerHTML = ""; document.getElementById("clag").innerHTML = ""; return; }
    const yrs = Y.filter((y) => val("infl", c, y) != null || val(k, c, y) != null);
    const pi = yrs.filter((y) => val("infl", c, y) != null).map((y) => [y, val("infl", c, y)]);
    const pf = yrs.filter((y) => val(k, c, y) != null).map((y) => [y, val(k, c, y)]);
    const same = f.unit === "%";
    const ext = d3.max(pi.concat(same ? pf : []), (p) => Math.abs(p[1])) || 0;
    const tgt = d.targets[c];
    document.getElementById("cc-sub").textContent = `${f.hint}${same ? "" : ` ${f.nb} vises på høyre akse.`}${tgt ? ` ${name(c)} innførte inflasjonsmål i ${tgt}.` : ""}`;
    document.getElementById("cc-legend").innerHTML = `<span><i style="background:var(--series-2)"></i>Inflasjon (%)</span><span><i style="background:var(--series-1)"></i>${S.escapeHtml(f.nb)} (${f.unit})</span>`;
    const euro = EUROJ[c];
    lineChart(document.getElementById("cts"), {
      series: [{ label: "Inflasjon", color: "var(--series-2)", w: 2.5, pts: pi }, { label: f.nb, color: "var(--series-1)", w: 2, pts: pf, right: !same }],
      log: ext > 60, h: 320, xfmt: (x) => String(Math.round(x)), keepOrder: true, y2label: same ? null : f.unit,
      vfmt: (v, s) => (s.label === "Inflasjon" || same ? pc(v) : v == null ? "–" : f1(v) + " " + f.unit),
      annots: [tgt ? { x: tgt, t: "Inflasjonsmål" } : null, euro && k === "policy" ? { x: euro, t: "Euro" } : null].filter(Boolean),
    });
    // korrelasjon med forskyvning for dette landet
    const el = document.getElementById("clag");
    const rows = LAGS.map((L) => { const r = withinC(k, c, Y0, LAST, L, 6); return r ? { L, ...r, ...signif(r.r, r.n) } : null; }).filter(Boolean);
    const w = Math.max(260, el.clientWidth || 400), h = 280, m = { t: 26, r: 10, b: 40, l: 40 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    svg.append("text").attr("x", m.l).attr("y", 12).attr("font-size", 12.5).attr("font-weight", 650).attr("fill", "var(--text)").text("Korrelasjon når faktoren forskyves");
    if (!rows.length) return;
    const x = d3.scaleBand(LAGS, [m.l, w - m.r]).padding(0.25), y = d3.scaleLinear([-1, 1], [h - m.b, m.t]);
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(fr).tickPadding(4));
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "var(--text-3)");
    rows.forEach((r) => {
      const g = svg.append("g").on("mousemove", (e) => tip.show(`<div class="tt-title">${f.nb} ${r.L === 0 ? "samme år" : r.L < 0 ? `${-r.L} år før` : `${r.L} år etter`}</div><div class="tt-row"><span>Korrelasjon</span><b>${fr(r.r)}</b></div><div class="tt-row"><span>95 % KI</span><b>${fr(r.lo)} til ${fr(r.hi)}</b></div><div class="tt-row"><span>p-verdi</span><b>${fp(r.p)}</b></div><div class="tt-row"><span>År</span><b>${r.n}</b></div>`, e.clientX, e.clientY)).on("mouseleave", () => tip.hide());
      g.append("rect").attr("x", x(r.L)).attr("width", x.bandwidth()).attr("y", Math.min(y(0), y(r.r))).attr("height", Math.abs(y(r.r) - y(0))).attr("rx", 3).attr("fill", r.r > 0 ? "var(--series-5)" : "var(--series-1)").attr("opacity", r.p < 0.05 ? 1 : 0.35);
      g.append("text").attr("x", x(r.L) + x.bandwidth() / 2).attr("y", h - m.b + 15).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "var(--text-2)").text(r.L === 0 ? "0" : (r.L > 0 ? "+" : "−") + Math.abs(r.L));
    });
    svg.append("text").attr("x", (m.l + w - m.r) / 2).attr("y", h - 6).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "var(--text-3)").text("år før (−) eller etter (+) inflasjonen");
    const r0 = rows.find((r) => r.L === 0);
    document.getElementById("clag-note").innerHTML = r0 ? `Samme år: r = ${fr(r0.r)} (${fp(r0.p)}, ${r0.n} år). Sterke søyler er signifikante på 5 %-nivå. Tidsserier med trend gir ofte høye korrelasjoner uten at det er noen årsakssammenheng, så tolk med forsiktighet.` : "";
  }

  // ---------------------------------------------------------------- månedstall
  const M = d.monthly, MN = M.months;
  const mNum = (i) => +MN[i].slice(0, 4) + (+MN[i].slice(5) - 1) / 12;
  function lastIdx(s) { if (!s) return -1; for (let i = s.length - 1; i >= 0; i--) if (s[i] != null) return i; return -1; }
  function polAt(c, i) { const s = M.pol[c]; if (!s) return null; for (let j = i; j >= Math.max(0, i - 2); j--) if (s[j] != null) return s[j]; return null; }
  function monthLab(m) { return `${S.MONTHS[+m.slice(5) - 1]} ${m.slice(0, 4)}`; }
  const xMonth = (x) => { const yv = Math.floor(x + 1e-6), mo = Math.round((x - yv) * 12); return `${S.MONTHS[mo]} ${yv}`; };
  const MC = Object.keys(M.cpi).filter((c) => M.pol[c] && C[c]).sort((a, b) => name(a).localeCompare(name(b), "nb"));
  const mcSel = document.getElementById("mc"), mfSel = document.getElementById("mfrom");
  mcSel.innerHTML = opts(MC.map((c) => [c, name(c)]), st.mc);
  mfSel.innerHTML = opts([[1950, 1950], [1970, 1970], [1990, 1990], [2000, 2000], [2010, 2010], [2019, 2019]], st.mfrom);
  mcSel.onchange = () => { st.mc = mcSel.value; monthly(); };
  mfSel.onchange = () => { st.mfrom = +mfSel.value; monthly(); };
  function monthly() {
    const c = st.mc, i0 = MN.findIndex((m) => +m.slice(0, 4) >= st.mfrom);
    const cpi = [], pol = [], real = [];
    for (let i = i0; i < MN.length; i++) {
      const a = M.cpi[c]?.[i], b = M.pol[c]?.[i];
      if (a != null) cpi.push([mNum(i), a]);
      if (b != null) pol.push([mNum(i), b]);
      if (a != null && b != null) real.push([mNum(i), b - a]);
    }
    const li = lastIdx(M.cpi[c]);
    document.getElementById("mo-title").textContent = `${name(c)}: inflasjon og styringsrente`;
    document.getElementById("mo-sub").textContent = li >= 0 ? `Månedstall til ${monthLab(MN[li])}. Siste: inflasjon ${pc(M.cpi[c][li])}, styringsrente ${pc(polAt(c, li))}.${EUROJ[c] ? ` Fra ${EUROJ[c]} er renten ECBs.` : ""}` : "";
    const ext = d3.max(cpi.concat(pol), (p) => Math.abs(p[1])) || 0;
    lineChart(document.getElementById("mts"), {
      series: [{ label: "Inflasjon", color: "var(--series-2)", w: 2.2, pts: cpi }, { label: "Styringsrente", color: "var(--series-1)", w: 2.2, pts: pol }],
      area: real, log: ext > 60, h: 340, xfmt: xMonth, keepOrder: true, refs: [{ y: 2, t: "2 %" }],
      extraTip: (kx) => { const m = real.find((p) => Math.round(p[0] * 12) === kx); return m ? `<div class="tt-row"><span>Realrente</span><b>${pp(m[1]).replace(" pp", " %-poeng")}</b></div>` : ""; },
    });
  }

  // bølgen 2021–2024
  const iOf = (m) => MN.indexOf(m);
  function waveRows() {
    const a = iOf("2021-01"), b = iOf("2024-12"), pre0 = iOf("2020-06"), pre1 = iOf("2021-12");
    return MC.map((c) => {
      const cs = M.cpi[c], ps = M.pol[c];
      let pk = -1; for (let i = a; i <= b && i < cs.length; i++) if (cs[i] != null && (pk < 0 || cs[i] > cs[pk])) pk = i;
      if (pk < 0) return null;
      const preV = d3.min(ps.slice(pre0, pre1 + 1).filter((v) => v != null));
      let tp = -1; for (let i = a; i < ps.length; i++) if (ps[i] != null && (tp < 0 || ps[i] > ps[tp])) tp = i;
      if (preV == null || tp < 0) return null;
      let first = -1; for (let i = pre0; i < ps.length; i++) if (ps[i] != null && ps[i] > preV + 0.05 && i >= a - 6) { first = i; break; }
      let back = null; for (let i = pk + 1; i < cs.length; i++) if (cs[i] != null && cs[i] <= 3) { back = i - pk; break; }
      const li = lastIdx(cs), lp = polAt(c, li);
      return { id: c, land: name(c), peak: cs[pk], peakM: MN[pk], hike: ps[tp] - preV, top: ps[tp], first: first >= 0 ? MN[first] : null, lag: first >= 0 ? first - iOf("2021-01") : null, back, now: cs[li], nowM: MN[li], pol: lp, real: lp != null ? lp - cs[li] : null };
    }).filter(Boolean);
  }
  function wave() {
    const rows = waveRows(), el = document.getElementById("wave");
    const mid = rows.filter((r) => r.peak < 30);
    const rs = spearman(mid.map((r) => r.hike), mid.map((r) => r.peak)), sg = signif(rs, mid.length, 1.06);
    const no = rows.find((r) => r.id === "NOR");
    const medPeak = median(rows.map((r) => r.peak)), medBack = median(rows.filter((r) => r.back != null).map((r) => r.back));
    document.getElementById("wv-sub").textContent = `Høyeste inflasjon i 2021–2024 mot hvor mye styringsrenten ble satt opp fra bunnen i 2020–2021. ${rows.length} land med månedstall fra BIS. Land med over 30 % inflasjon er utelatt fra diagrammet.`;
    document.getElementById("wv-stats").innerHTML = `<span>Medianland: topp <b>${pc(medPeak)}</b></span><span>Rangkorrelasjon <b>${fr(rs)}</b> (${fp(sg.p)})</span>${no ? `<span>Norge: topp <b>${pc(no.peak)}</b> i ${monthLab(no.peakM)}, renten opp <b>${f1(no.hike)}</b> %-poeng</span>` : ""}`;
    const w = Math.max(280, el.clientWidth || 500), h = 360, m = { t: 12, r: 14, b: 42, l: 44 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear([0, d3.max(mid, (r) => r.hike) * 1.05], [m.l, w - m.r]).nice(), y = d3.scaleLinear([0, d3.max(mid, (r) => r.peak) * 1.05], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat(tickFmt).tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat(tickFmt).tickSizeOuter(0));
    svg.append("text").attr("x", w - m.r).attr("y", h - 6).attr("text-anchor", "end").attr("font-size", 12).attr("fill", "var(--text-2)").text("Renteøkning, prosentpoeng →");
    svg.append("text").attr("x", m.l + 4).attr("y", m.t + 10).attr("font-size", 12).attr("fill", "var(--text-2)").text("↑ Høyeste inflasjon, %");
    svg.append("g").selectAll("circle").data(mid.sort((a, b) => (a.id === "NOR") - (b.id === "NOR"))).join("circle").attr("cx", (r) => x(r.hike)).attr("cy", (r) => y(r.peak)).attr("r", (r) => (r.id === "NOR" ? 6.5 : 5))
      .attr("fill", (r) => (r.id === "NOR" ? "var(--series-2)" : RCOL[C[r.id]?.r] || "var(--neutral-mark)")).attr("opacity", (r) => (r.id === "NOR" ? 1 : 0.8)).attr("stroke", "var(--surface)")
      .on("mousemove", (e, r) => tip.show(`<div class="tt-title">${S.escapeHtml(r.land)}</div><div class="tt-row"><span>Høyeste inflasjon</span><b>${pc(r.peak)} (${monthLab(r.peakM)})</b></div><div class="tt-row"><span>Renteøkning</span><b>${f1(r.hike)} %-poeng</b></div><div class="tt-row"><span>Første renteheving</span><b>${r.first ? monthLab(r.first) : "–"}</b></div><div class="tt-row"><span>Inflasjon nå</span><b>${pc(r.now)}</b></div>`, e.clientX, e.clientY))
      .on("mouseleave", () => tip.hide()).on("click", (e, r) => { st.mc = r.id; mcSel.value = r.id; monthly(); document.getElementById("mo-title").scrollIntoView({ behavior: "smooth", block: "start" }); });
    const placed = [];
    ["NOR", "USA", "SWE", "GBR", "JPN", "CHE", "BRA", "HUN", "DNK", "ISL", "DEU"].map((c) => mid.find((r) => r.id === c)).filter(Boolean).filter((r) => {
      const px = x(r.hike), py = y(r.peak);
      if (placed.some((q) => Math.abs(q[1] - py) < 12 && Math.abs(q[0] - px) < 70)) return false;
      placed.push([px, py]); return true;
    }).forEach((r) => svg.append("text").attr("x", x(r.hike) + 7).attr("y", y(r.peak) + 4).attr("font-size", 11).attr("font-weight", r.id === "NOR" ? 700 : 500).attr("fill", "var(--text-2)").attr("pointer-events", "none").text(r.land));
    document.getElementById("wt-sub").textContent = `Klikk på en kolonne for å sortere, på en rad for å se landet i diagrammet over. «Måneder til under 3 %» regnes fra toppen. Medianlandet brukte ${f0(medBack)} måneder.`;
    S.sortableTable(document.getElementById("wtable"), [
      { key: "land", label: "Land", text: true },
      { key: "peak", label: "Topp", fmt: (v) => pc(v) },
      { key: "peakM", label: "Når", text: true, fmt: (v) => (v ? `${S.MONTHS_SHORT[+v.slice(5) - 1]} ${v.slice(0, 4)}` : "–") },
      { key: "hike", label: "Rente opp (pp)", fmt: (v) => f1(v) },
      { key: "back", label: "Måneder til under 3 %", fmt: (v) => (v == null ? "ikke ennå" : f0(v)) },
      { key: "now", label: "Inflasjon nå", fmt: (v) => pc(v) },
      { key: "real", label: "Realrente nå", fmt: (v) => (v == null ? "–" : f1(v)) },
    ], rows, { sortKey: "peak", dir: -1, onRow: (id) => { st.mc = id; mcSel.value = id; monthly(); document.getElementById("mo-title").scrollIntoView({ behavior: "smooth", block: "start" }); } });
  }

  // ---------------------------------------------------------------- inflasjonsmål
  function targets() {
    const el = document.getElementById("it"), T = d.targets;
    const others = COUNTRIES.filter((c) => !T[c] && !EUROJ[c]);
    const otherMed = Y.map((y) => median(others.map((c) => val("infl", c, y)).filter((v) => v != null)));
    const win = (arr, a, b) => arr.filter((x, i) => Y[i] >= a && Y[i] <= b && x != null);
    const rows = Object.entries(T).map(([c, t]) => {
      const s = V.infl[c]; if (!s) return null;
      const bv = win(s, t - 10, t - 1), av = win(s, t + 1, Math.min(LAST, t + 10));
      if (bv.length < 5 || av.length < 5) return null;
      const before = median(bv), after = median(av);
      const ob = median(win(otherMed, t - 10, t - 1)), oa = median(win(otherMed, t + 1, Math.min(LAST, t + 10)));
      return { c, t, before, after, ch: after - before, och: oa - ob, ex: after - before - (oa - ob) };
    }).filter(Boolean).sort((a, b) => b.before - a.before);
    const better = rows.filter((r) => r.ex < 0).length, p = signTest(better, rows.length);
    const no = rows.find((r) => r.c === "NOR");
    document.getElementById("it-sub").textContent = `${rows.length} land med inflasjonsmål og tall for minst fem år før og etter. Medianinflasjonen de ti årene før og etter at målet ble innført (året selv er utelatt). Komprimert skala. Teksten til høyre viser endringen, og i parentes endringen i land uten inflasjonsmål (og utenfor euroen) i de samme årene.`;
    const w = Math.max(300, el.clientWidth || 800), narrow = w < 640, rowH = 22, m = { t: 26, r: narrow ? 92 : 210, b: 8, l: narrow ? 100 : 170 };
    const h = m.t + m.b + rowH * rows.length;
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleSymlog().constant(1).domain([Math.min(0, d3.min(rows, (r) => Math.min(r.before, r.after))), d3.max(rows, (r) => Math.max(r.before, r.after))]).range([m.l, w - m.r]);
    const tks = SYM_TICKS.filter((t) => t >= x.domain()[0] && t <= x.domain()[1] && ![-1000, -5, 5, 200, 2000].includes(t));
    svg.append("g").attr("class", "grid").attr("transform", `translate(0,${m.t - 4})`).call(d3.axisTop(x).tickValues(tks).tickSize(-(h - m.t - m.b + 4)).tickFormat(""));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${m.t - 4})`).call(d3.axisTop(x).tickValues(tks).tickFormat((t) => tickFmt(t) + (t === tks[tks.length - 1] ? " %" : "")).tickSizeOuter(0));
    rows.forEach((r, i) => {
      const yy = m.t + i * rowH + rowH / 2;
      const g = svg.append("g").on("mousemove", (e) => tip.show(`<div class="tt-title">${S.escapeHtml(name(r.c))} · inflasjonsmål fra ${r.t}</div><div class="tt-row"><span>Median ti år før</span><b>${pc(r.before)}</b></div><div class="tt-row"><span>Median ti år etter</span><b>${pc(r.after)}</b></div><div class="tt-row"><span>Endring</span><b>${pp(r.ch)}</b></div><div class="tt-row"><span>Land uten mål, samme år</span><b>${pp(r.och)}</b></div><div class="tt-row"><span>Forskjell</span><b>${pp(r.ex)}</b></div>`, e.clientX, e.clientY)).on("mouseleave", () => tip.hide());
      g.append("rect").attr("x", 0).attr("y", yy - rowH / 2).attr("width", w).attr("height", rowH).attr("fill", r.c === "NOR" ? "color-mix(in srgb, var(--series-2) 14%, transparent)" : "transparent");
      g.append("text").attr("x", m.l - 10).attr("y", yy + 4).attr("text-anchor", "end").attr("font-size", 12).attr("font-weight", r.c === "NOR" ? 700 : 400).attr("fill", "var(--text)").text(`${name(r.c)} (${r.t})`);
      g.append("line").attr("x1", x(r.before)).attr("x2", x(r.after)).attr("y1", yy).attr("y2", yy).attr("stroke", "var(--border-strong)").attr("stroke-width", 2);
      g.append("circle").attr("cx", x(r.before)).attr("cy", yy).attr("r", 5).attr("fill", "var(--series-5)");
      g.append("circle").attr("cx", x(r.after)).attr("cy", yy).attr("r", 5).attr("fill", "var(--series-1)");
      g.append("text").attr("x", w - m.r + 10).attr("y", yy + 4).attr("font-size", 11.5).attr("fill", "var(--text-2)").attr("font-weight", 600).text(narrow ? pp(r.ch) : `${pp(r.ch)}  (andre ${pp(r.och)})`);
    });
    document.getElementById("it-note").innerHTML = `<b>Resultat:</b> I ${better} av ${rows.length} land falt inflasjonen mer (eller steg mindre) enn i land uten inflasjonsmål i de samme årene (fortegnstest ${fp(p)}).${no ? ` I Norge var medianinflasjonen ${pc(no.before)} de ti årene før 2001 og ${pc(no.after)} de ti årene etter.` : ""} Mange land innførte inflasjonsmål etter at inflasjonen allerede var på vei ned, og målet kom ofte sammen med andre reformer, som en mer uavhengig sentralbank og strammere statsbudsjett. Sammenligningen viser derfor ikke hvor mye selve målet har betydd.`;
  }

  // ---------------------------------------------------------------- Norge i hundre år
  const noSeries = (() => {
    const H = d.nohist, y0 = +H.start.slice(0, 4), m0 = +H.start.slice(5) - 1;
    const cpi = [], pol = [];
    H.cpi.forEach((v, j) => { const x = y0 + (m0 + j) / 12; if (v != null) cpi.push([x, v]); if (H.pol[j] != null) pol.push([x, H.pol[j]]); });
    MN.forEach((m, i) => { const a = M.cpi.NOR?.[i], b = M.pol.NOR?.[i]; if (a != null) cpi.push([mNum(i), a]); if (b != null) pol.push([mNum(i), b]); });
    return { cpi, pol };
  })();
  const NO_ANN = [{ x: 1925.5, t: "Paripolitikk" }, { x: 1940.3, t: "Krigen" }, { x: 1951, t: "Koreakrigen" }, { x: 1974, t: "Oljekrise" }, { x: 1986.4, t: "Devaluering" }, { x: 1992.9, t: "Flytende krone" }, { x: 2001.2, t: "Inflasjonsmål" }, { x: 2022.8, t: "Prishopp" }];
  function noHist() {
    const from = st.noper, cpi = noSeries.cpi.filter((p) => p[0] >= from), pol = noSeries.pol.filter((p) => p[0] >= from);
    const per = (a, b) => mean(noSeries.cpi.filter((p) => p[0] >= a && p[0] < b).map((p) => p[1]));
    document.getElementById("no-sub").textContent = `Prisvekst siste 12 måneder (BIS, basert på SSB). Snitt 1970–2000: ${pc(per(1970, 2001))}. Snitt 2001–2020 (de første 20 årene med inflasjonsmål): ${pc(per(2001, 2021))}. Snitt siden 2021: ${pc(per(2021, 2100))}.`;
    lineChart(document.getElementById("nots"), {
      series: [{ label: "Inflasjon", color: "var(--series-2)", w: 1.8, pts: cpi }, { label: "Styringsrente", color: "var(--series-1)", w: 2, pts: pol }],
      h: 380, xfmt: xMonth, keepOrder: true, annots: NO_ANN, refs: [{ y: 2, t: "Mål: 2 %" }], xdom: [from, d3.max(cpi, (p) => p[0])],
    });
  }
  seg("noper", (v) => { st.noper = +v; noHist(); });


  // ---------------------------------------------------------------- skjult skatt: kalkulator og kjøpekraft
  function calc() {
    const g = (id) => +document.getElementById(id).value || 0;
    const pi = g("k-infl") / 100, i = g("k-rente") / 100, t = g("k-skatt") / 100, n = Math.max(0, Math.round(g("k-aar"))), b = g("k-belop");
    const iat = i * (1 - t), realAt = (1 + iat) / (1 + pi) - 1, realPre = (1 + i) / (1 + pi) - 1;
    const effTax = realPre > 0 ? (100 * (realPre - realAt)) / realPre : null;
    const endNom = b * Math.pow(1 + iat, n), endReal = endNom / Math.pow(1 + pi, n), taxPaid = d3.sum(d3.range(n), (k) => b * Math.pow(1 + iat, k) * i * t);
    const cash = b / Math.pow(1 + pi, n);
    const kr = (v) => S.nf0.format(Math.round(v)).replace("-", "−") + " kr";
    const box = (l, v, s2) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s2}</div></div>`;
    document.getElementById("k-out").innerHTML = [
      box("Realrente etter skatt", pc(100 * realAt), `Før skatt: ${pc(100 * realPre)}`),
      box("Skatt målt mot realavkastningen", effTax == null ? "over 100 %" : pc(effTax), effTax == null ? "Ingen reell avkastning å skattlegge, men det betales skatt likevel" : `Mot ${f0(100 * t)} % nominell skattesats`),
      box(`Sparing etter ${n} år, i dagens kroner`, kr(endReal), `Nominelt ${kr(endNom)} · skatt betalt ${kr(taxPaid)}`),
      box(`Kontanter etter ${n} år, i dagens kroner`, kr(cash), `Tap av kjøpekraft: ${kr(b - cash)}`),
    ].join("");
    document.getElementById("k-note").innerHTML = `Med disse tallene ${realAt < 0 ? "<b>taper sparingen seg i verdi</b> etter skatt, selv om banken betaler rente" : "vokser sparingen litt reelt"}. Uten inflasjon og med samme realrente før skatt (${pc(100 * realPre)}) ville skatten tatt ${f0(100 * t)} % av avkastningen. Skatten betales av den nominelle renten, også den delen som bare kompenserer for prisstigningen. Det er dette som gjør inflasjonen til en skjult skatt på sparing.`;
  }
  ["k-infl", "k-rente", "k-skatt", "k-aar", "k-belop"].forEach((id) => document.getElementById(id).addEventListener("input", calc));
  function priceLevel() {
    const el = document.getElementById("plevel"), y0 = 1960;
    const cs = [["NOR", "var(--series-2)", 3], ["SWE", "var(--series-1)"], ["CHE", "var(--series-3)"], ["DEU", "var(--series-4)"], ["USA", "var(--series-7)"], ["GBR", "var(--series-5)"]];
    const ser = cs.map(([c, col, wd]) => {
      let v = 100; const pts = [[y0, 100]];
      for (let y = y0 + 1; y <= LAST; y++) { const p = val("infl", c, y); if (p == null) { if (y >= LAST - 1) break; return { c, col, wd, pts: [] }; } v = v / (1 + p / 100); pts.push([y, v]); }
      return { c, col, wd, pts };
    }).filter((s) => s.pts.length);
    const no = ser.find((s) => s.c === "NOR"), last = no.pts[no.pts.length - 1][1];
    let half = null; for (const p of no.pts) if (p[1] <= 50) { half = p[0]; break; }
    document.getElementById("pl-sub").textContent = `Hva 100 kroner fra ${y0} er verdt i kjøpekraft år for år, regnet med årlig inflasjon. 100 kr i ${y0} kjøper like mye som ${S.nf0.format(Math.round((100 * 100) / last))} kr i ${LAST}. Kronen hadde mistet halve verdien allerede i ${half}. Andre land: 100 enheter av landets egen valuta.`;
    lineChart(el, { series: ser.map((s) => ({ label: name(s.c), color: s.col, w: s.wd, pts: s.pts })), endLabels: true, xfmt: (x) => String(Math.round(x)), vfmt: (v) => (v == null ? "–" : S.nf1.format(v)), h: 320, xdom: [y0, LAST] });
  }
  // ---------------------------------------------------------------- tabell
  function table() {
    const y10 = LAST - 9;
    const avgOf = (k, c, a, b) => { const v = []; for (let y = a; y <= b; y++) { const x = val(k, c, y); if (x != null) v.push(x); } return v.length >= Math.ceil((b - a + 1) / 2) ? mean(v) : null; };
    const rows = COUNTRIES.map((c) => {
      const s = V.infl[c]; let mi = -1; s.forEach((v, i) => { if (v != null && (mi < 0 || v > s[mi])) mi = i; });
      const li = lastIdx(s);
      return {
        id: c, land: name(c), region: REGION[C[c].r] || "", last: s[li], lastY: Y[li], a10: avgOf("infl", c, y10, LAST), a90: avgOf("infl", c, 1990, LAST),
        max: s[mi], maxY: Y[mi], money: avgOf("money", c, y10, LAST), fiscal: avgOf("fiscal", c, y10, LAST), fx: avgOf("fx", c, y10, LAST), policy: val("policy", c, LAST) ?? val("policy", c, LAST - 1), target: d.targets[c] || null,
      };
    });
    document.getElementById("tbl-sub").textContent = `${rows.length} land. Snitt for ${y10}–${LAST} der ikke annet står. Klikk på en rad for å se landet i «Land for land».`;
    const fx = (v) => (v == null ? "–" : f1(v));
    const cols = [
      { key: "land", label: "Land", text: true },
      { key: "region", label: "Verdensdel", text: true },
      { key: "last", label: "Siste år", fmt: (v, r) => `${pc(v)} <span class="muted">(${r.lastY})</span>` },
      { key: "a10", label: `Snitt ${y10}–`, fmt: (v) => pc(v) },
      { key: "a90", label: "Snitt 1990–", fmt: (v) => pc(v) },
      { key: "max", label: "Høyeste", fmt: (v, r) => `${pc(v)} <span class="muted">(${r.maxY})</span>` },
      { key: "money", label: "Pengemengdevekst", fmt: fx },
      { key: "fiscal", label: "Statsbudsjett, % av BNP", fmt: fx },
      { key: "fx", label: "Valutasvekkelse mot USD", fmt: fx },
      { key: "policy", label: `Styringsrente ${LAST}`, fmt: fx },
      { key: "target", label: "Inflasjonsmål fra", fmt: (v) => v || "–" },
    ];
    S.sortableTable(document.getElementById("table"), cols, rows, { sortKey: "a10", dir: -1, onRow: (id) => { st.cc = id; ccSel.value = id; countryView(); document.getElementById("cc-title").scrollIntoView({ behavior: "smooth", block: "start" }); } });
    document.getElementById("csv").onclick = () => S.downloadCsv("inflasjon-i-verden.csv", [["Land", "ISO3", "Verdensdel", "Siste år", "Inflasjon siste år", `Inflasjon snitt ${y10}-${LAST}`, `Inflasjon snitt 1990-${LAST}`, "Høyeste inflasjon", "År", `Pengemengdevekst snitt ${y10}-${LAST}`, "Statsbudsjett % av BNP", "Valutasvekkelse mot USD", `Styringsrente ${LAST}`, "Inflasjonsmål fra"],
      ...rows.map((r) => [r.land, r.id, r.region, r.lastY, r.last, r.a10?.toFixed(2), r.a90?.toFixed(2), r.max, r.maxY, r.money?.toFixed(2), r.fiscal?.toFixed(2), r.fx?.toFixed(2), r.policy?.toFixed(2), r.target])]);
  }

  // ---------------------------------------------------------------- alt sammen
  function analysis() { corr(); scatter(); lagChart(); }
  function renderAll() { kpis(); wmap(); rank(); series(); analysis(); countryView(); monthly(); wave(); targets(); noHist(); priceLevel(); }
  renderAll();
  calc();
  table();
  document.getElementById("updated").textContent = `Data hentet ${d.fetched}`;
  S.onThemeChange(() => { wmap(); rank(); });
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(renderAll, 200); });
})();
