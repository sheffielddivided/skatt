/* Studie 18 – Boligpriser i verden */
(async function () {
  const S = window.Skatt;
  const tip = S.tooltip();
  const [d, topo] = await Promise.all([
    fetch("data/bolig.json").then((r) => r.json()),
    fetch("data/verden.topo.json").then((r) => r.json()),
  ]);
  const land = topojson.feature(topo, topo.objects.land).features;
  const Q = d.quarters, O = d.oecd;
  const AGG = { OECD: "OECD-snittet", EA: "Euroområdet" };
  const NORD = new Set(["DNK", "SWE", "FIN", "ISL"]);
  const ISO2 = {};
  land.forEach((f) => { ISO2[f.properties.id] = { EL: "GR", UK: "GB" }[f.properties.iso2] || f.properties.iso2; });
  let dn = null;
  try { dn = new Intl.DisplayNames(["nb"], { type: "region" }); } catch (e) { /* */ }
  const name = (c) => { if (AGG[c]) return AGG[c]; try { const n = dn && ISO2[c] ? dn.of(ISO2[c]) : null; if (n && n !== ISO2[c]) return n; } catch (e) { /* */ } return d.names[c] || c; };
  const isAgg = (c) => !!AGG[c];
  const qLab = (q) => `${q.slice(5, 7).replace("Q", "")}. kv. ${q.slice(0, 4)}`;
  const qNum = (q) => +q.slice(0, 4) + (+q.slice(6) - 1) / 4;

  const MEAS = {
    real: { nb: "Reelle boligpriser", kind: "index", note: "Boligprisindeks justert for generell prisvekst (KPI). Viser om boliger har blitt dyrere enn andre varer og tjenester." },
    nom: { nb: "Nominelle boligpriser", kind: "index", note: "Boligprisindeks i lokal valuta, ikke justert for prisvekst." },
    rent: { nb: "Husleie", kind: "index", note: "Leieprisindeks fra konsumprisindeksen i hvert land." },
    pti: { nb: "Boligpris mot inntekt", kind: "index", note: "Boligpriser delt på disponibel inntekt per innbygger. Stiger når boligprisene vokser raskere enn inntektene." },
    ptr: { nb: "Boligpris mot husleie", kind: "index", note: "Boligpriser delt på leieprisene. Stiger når det blir relativt dyrere å eie enn å leie." },
    pti_avg: { nb: "Pris mot inntekt, sammenlignet med langtidssnittet", kind: "level", note: "100 = landets eget langtidssnitt. 130 betyr at boligene er 30 % dyrere målt mot inntekt enn de pleier å være." },
    ptr_avg: { nb: "Pris mot husleie, sammenlignet med langtidssnittet", kind: "level", note: "100 = landets eget langtidssnitt. Over 100 betyr at det er dyrere enn vanlig å eie sammenlignet med å leie." },
  };
  const lastOf = (m, c) => { const s = O[m][c]; if (!s) return null; for (let i = s.length - 1; i >= 0; i--) if (s[i] != null) return { i, v: s[i], q: Q[i] }; return null; };
  const yearAvg = (m, c, y) => { const s = O[m][c]; if (!s) return null; const v = Q.map((q, i) => (q.startsWith(String(y)) ? s[i] : null)).filter((x) => x != null); return v.length ? d3.mean(v) : null; };
  // verdien som rangeres: endring i % fra basisår (indekser) eller avvik fra langtidssnittet (nivå)
  function score(m, c, base) {
    const l = lastOf(m, c); if (!l) return null;
    if (MEAS[m].kind === "level") return { v: l.v - 100, q: l.q };
    const b = yearAvg(m, c, base); if (b == null) return null;
    return { v: (100 * l.v) / b - 100, q: l.q };
  }
  const fp = (v, dg = 0) => (v == null ? "–" : S.signed(S.nf0.format(Math.round(v)) + " %", Math.round(v)));

  const st = { m: "real", base: 2015, zoom: "europa", chips: ["SWE", "DNK", "DEU", "USA", "GBR", "ESP"], bt: "00", nobase: 2015 };
  (function readHash() { const h = new URLSearchParams(location.hash.slice(1)); if (MEAS[h.get("m")]) st.m = h.get("m"); })();
  const indSel = document.getElementById("ind"), fromSel = document.getElementById("from");
  indSel.innerHTML = `<optgroup label="Endring over tid">${["real", "nom", "rent", "pti", "ptr"].map((k) => `<option value="${k}">${MEAS[k].nb}</option>`).join("")}</optgroup><optgroup label="Dyrt eller billig?">${["pti_avg", "ptr_avg"].map((k) => `<option value="${k}">${MEAS[k].nb}</option>`).join("")}</optgroup>`;
  indSel.value = st.m;
  const YEARS = [...new Set(Q.map((q) => +q.slice(0, 4)))].filter((y) => y <= +Q[Q.length - 1].slice(0, 4) - 1);
  fromSel.innerHTML = YEARS.slice().reverse().map((y) => `<option>${y}</option>`).join("");
  fromSel.value = st.base;
  indSel.onchange = () => { st.m = indSel.value; render(); };
  fromSel.onchange = () => { st.base = +fromSel.value; render(); };
  function seg(id, cb) { const el = document.getElementById(id); el.querySelectorAll("button").forEach((b) => (b.onclick = () => { el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); cb(b.dataset.v); })); }
  seg("zoom", (v) => { st.zoom = v; wmap(); });
  seg("btype", (v) => { st.bt = v; noTs(); });
  const COUNTRIES = Object.keys(d.names).filter((c) => !isAgg(c)).sort((a, b) => name(a).localeCompare(name(b), "nb"));
  document.getElementById("clist").innerHTML = [...COUNTRIES, "OECD", "EA"].filter((c) => c !== "NOR").map((c) => `<option value="${S.escapeHtml(name(c))}">`).join("");
  const addc = document.getElementById("addc");
  addc.onchange = () => { const c = [...COUNTRIES, "OECD", "EA"].find((x) => name(x).toLowerCase() === addc.value.trim().toLowerCase()); if (c) { addChip(c); addc.value = ""; } };
  function addChip(c, scroll) {
    if (c !== "NOR" && !st.chips.includes(c)) { st.chips.push(c); if (st.chips.length > 7) st.chips.shift(); }
    series(); rank();
    if (scroll) document.getElementById("t-title").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------------------------------------------------------------- KPI
  function kpis() {
    const r10 = score("real", "NOR", 2000), rk = ranked("real", 2000), lr = lastOf("real", "NOR");
    const pti = lastOf("pti_avg", "NOR"), ptiR = ranked("pti_avg", 0);
    const pk = peakOf("NOR");
    const cards = [
      { l: "Reell prisvekst i Norge siden 2000", v: fp(r10.v), s: `Nr. ${rk.indexOf("NOR") + 1} av ${rk.length} land · OECD-snittet ${fp(score("real", "OECD", 2000)?.v)}` },
      { l: "Nominell prisvekst siden 2015", v: fp(score("nom", "NOR", 2015).v), s: `Reelt ${fp(score("real", "NOR", 2015).v)} · til ${qLab(lr.q)}` },
      { l: "Pris mot inntekt, mot langtidssnittet", v: S.nf0.format(pti.v), s: `100 = normalt for Norge · nr. ${ptiR.indexOf("NOR") + 1} av ${ptiR.length} på dette målet` },
      { l: "Reell pris mot toppen", v: fp(pk.drop), s: pk.drop > -0.5 ? "Rekordhøyt nå" : `Toppen var ${qLab(pk.q)}` },
    ];
    document.getElementById("kpis").innerHTML = cards.map((c) => `<div class="card kpi"><div class="l">${c.l}</div><div class="v">${c.v}</div><div class="s">${c.s}</div></div>`).join("");
  }
  function ranked(m, base) { return COUNTRIES.map((c) => ({ c, s: score(m, c, base) })).filter((x) => x.s).sort((a, b) => b.s.v - a.s.v).map((x) => x.c); }
  function peakOf(c) {
    const s = O.real[c]; if (!s) return null;
    let pi = -1; s.forEach((v, i) => { if (v != null && (pi < 0 || v > s[pi])) pi = i; });
    const l = lastOf("real", c);
    return { q: Q[pi], peak: s[pi], last: l.v, lq: l.q, drop: (100 * l.v) / s[pi] - 100 };
  }

  // ---------------------------------------------------------------- kart
  function wmap() {
    const m = st.m, el = document.getElementById("map"), lvl = MEAS[m].kind === "level";
    document.getElementById("m-title").textContent = lvl ? MEAS[m].nb : `${MEAS[m].nb}: endring siden ${st.base}`;
    document.getElementById("m-sub").textContent = lvl ? "Blå: dyrere enn landets langtidssnitt. Rød: billigere. Siste kvartal med tall." : "Blå: økt. Rød: falt. Fra snittet i startåret til siste kvartal med tall.";
    const w = Math.max(300, el.clientWidth || 700), h = Math.round(w * (st.zoom === "europa" ? 0.78 : 0.52));
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    svg.append("clipPath").attr("id", "bclip").append("rect").attr("width", w).attr("height", h - 44);
    const proj = st.zoom === "europa"
      ? d3.geoConicConformal().rotate([-12, 0]).parallels([40, 68]).fitExtent([[4, 4], [w - 4, h - 46]], { type: "Feature", geometry: { type: "Polygon", coordinates: [[[-11, 35], [-11, 71], [40, 71], [40, 35], [-11, 35]]] } })
      : d3.geoEqualEarth().fitExtent([[4, 4], [w - 4, h - 46]], { type: "FeatureCollection", features: land });
    const path = d3.geoPath(proj);
    const dark = S.isDark();
    const blues = dark ? ["#104281", "#1c5cab", "#2a78d6", "#5598e7", "#86b6ef"].reverse() : ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#184f95"];
    const reds = dark ? ["#8f2a22", "#b8392d", "#d9584a", "#ec8a7f", "#f6bcb5"].reverse() : ["#fbd9d4", "#f4aea5", "#ea7f72", "#d9584a", "#9a2e23"];
    const vals = COUNTRIES.map((c) => score(m, c, st.base)?.v).filter((v) => v != null);
    const mx = d3.quantile(vals.map(Math.abs).sort(d3.ascending), 0.9) || 10;
    const step = [5, 10, 20, 25, 50, 100, 200].find((s) => s * 4 >= mx) || 200;
    const TH = [step, 2 * step, 3 * step, 4 * step];
    const bin = d3.scaleThreshold(TH, [0, 1, 2, 3, 4]);
    const col = (v) => (v == null ? null : v >= 0 ? blues[bin(v)] : reds[bin(-v)]);
    svg.append("g").attr("clip-path", "url(#bclip)").selectAll("path").data(land).join("path").attr("d", path)
      .attr("class", (f) => (score(m, f.properties.id, st.base) == null ? "na" : "c"))
      .attr("fill", (f) => col(score(m, f.properties.id, st.base)?.v))
      .on("mousemove", (e, f) => {
        const c = f.properties.id, s = score(m, c, st.base);
        tip.show(`<div class="tt-title">${S.escapeHtml(name(c))}</div>${s ? `<div class="tt-row"><span>${lvl ? "Mot langtidssnittet" : `Endring siden ${st.base}`}</span><b>${lvl ? S.nf0.format(s.v + 100) : fp(s.v)}</b></div><div class="tt-row"><span>Siste tall</span><b>${qLab(s.q)}</b></div>` : '<div class="tt-row"><span>Ingen tall</span></div>'}`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => tip.hide())
      .on("click", (e, f) => { if (score(m, f.properties.id, st.base)) addChip(f.properties.id, true); });
    const nof = land.find((f) => f.properties.id === "NOR");
    if (nof) svg.append("path").attr("class", "sel").attr("clip-path", "url(#bclip)").attr("d", path(nof));
    const lg = svg.append("g").attr("class", "lg").attr("transform", `translate(8,${h - 36})`);
    const ramp = [...reds].reverse().concat(blues), bw = Math.min(34, (w - 16) / ramp.length);
    ramp.forEach((c, k) => lg.append("rect").attr("x", k * bw).attr("y", 0).attr("width", bw - 2).attr("height", 10).attr("rx", 2).attr("fill", c));
    [-TH[3], -TH[2], -TH[1], -TH[0], 0, TH[0], TH[1], TH[2], TH[3]].forEach((t, k) => lg.append("text").attr("x", (k + 1) * bw - 1).attr("y", 26).attr("text-anchor", "middle").text(lvl ? S.nf0.format(100 + t) : (t > 0 ? "+" : "") + t));
    if (!lvl) lg.append("text").attr("x", ramp.length * bw + 6).attr("y", 9).text("%");
  }

  // ---------------------------------------------------------------- rangering
  function rank() {
    const m = st.m, el = document.getElementById("rank"), lvl = MEAS[m].kind === "level";
    const rows = [...COUNTRIES, "OECD", "EA"].map((c) => ({ c, s: score(m, c, st.base) })).filter((x) => x.s).sort((a, b) => b.s.v - a.s.v);
    const n = rows.filter((r) => !isAgg(r.c)).length;
    const pos = rows.filter((r) => !isAgg(r.c)).findIndex((r) => r.c === "NOR") + 1;
    document.getElementById("r-sub").textContent = `${n} land. Norge er nr. ${pos || "–"}. ${lvl ? "Tallet viser nivået mot landets langtidssnitt (100)." : `Endring fra ${st.base} til siste kvartal.`}`;
    const ext = d3.extent(rows, (r) => r.s.v), lo = Math.min(0, ext[0]), hi = Math.max(0, ext[1]);
    const x = (v) => (100 * (v - lo)) / (hi - lo || 1);
    let k = 0;
    el.innerHTML = rows.map((r) => {
      const v = r.s.v, i = isAgg(r.c) ? "" : ++k;
      const a = Math.min(x(0), x(v)), b = Math.abs(x(v) - x(0));
      return `<div class="r ${r.c === "NOR" ? "no" : ""} ${NORD.has(r.c) ? "nord" : ""} ${isAgg(r.c) ? "agg" : ""} ${st.chips.includes(r.c) ? "pick" : ""}" data-c="${r.c}"><span class="i">${i}</span><span>${S.escapeHtml(name(r.c))}</span><div class="bw"><div class="z" style="left:${x(0).toFixed(1)}%"></div><div class="b" style="left:${a.toFixed(1)}%;width:${Math.max(0.6, b).toFixed(1)}%"></div></div><span class="v">${lvl ? S.nf0.format(v + 100) : fp(v)}</span></div>`;
    }).join("");
    el.querySelectorAll(".r").forEach((row) => (row.onclick = () => addChip(row.dataset.c, true)));
  }

  // ---------------------------------------------------------------- tidsserie
  const PAL = ["var(--series-1)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)", "var(--series-7)", "var(--text-2)"];
  function series() {
    const m = st.m, el = document.getElementById("ts"), lvl = MEAS[m].kind === "level";
    document.getElementById("t-title").textContent = lvl ? `${MEAS[m].nb} over tid` : `${MEAS[m].nb} siden ${st.base}`;
    document.getElementById("t-sub").textContent = lvl ? "100 = landets eget langtidssnitt. Velg opptil sju land." : `Indeks der snittet i ${st.base} = 100. Velg opptil sju land. Klikk i kartet eller i listen for å legge til.`;
    const ser = [{ c: "NOR", color: "var(--series-2)", w: 3 }, ...st.chips.map((c, k) => ({ c, color: PAL[k % PAL.length], dash: isAgg(c) }))];
    document.getElementById("chips").innerHTML = ser.map((s) => `<span class="chip"><span class="sw" style="background:${s.color}"></span>${S.escapeHtml(name(s.c))}${s.c === "NOR" ? '<span style="width:6px"></span>' : `<button data-c="${s.c}" aria-label="Fjern ${S.escapeHtml(name(s.c))}">×</button>`}</span>`).join("");
    document.querySelectorAll("#chips button").forEach((b) => (b.onclick = () => { st.chips = st.chips.filter((c) => c !== b.dataset.c); series(); rank(); }));
    const start = lvl ? 1980 : st.base;
    const ks = Q.map((q, i) => i).filter((i) => +Q[i].slice(0, 4) >= start);
    const data = ser.map((s) => {
      const raw = O[m][s.c]; if (!raw) return { ...s, pts: [] };
      const b = lvl ? 100 : yearAvg(m, s.c, st.base);
      return { ...s, pts: b ? ks.map((i) => [qNum(Q[i]), raw[i] == null ? null : (100 * raw[i]) / b, Q[i]]).filter((p) => p[1] != null) : [] };
    });
    const all = data.flatMap((s) => s.pts.map((p) => p[1]));
    const w = Math.max(320, el.clientWidth || 900), h = 340, mg = { t: 14, r: w < 560 ? 80 : 120, b: 28, l: 44 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const xMax = d3.max(data.flatMap((s) => s.pts.map((p) => p[0]))) || qNum(Q[Q.length - 1]);
    const x = d3.scaleLinear([start, xMax], [mg.l, w - mg.r]);
    const y = d3.scaleLinear([Math.min(lvl ? 60 : 80, d3.min(all) || 80), Math.max(120, d3.max(all) || 120)], [h - mg.b, mg.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${mg.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(w - mg.l - mg.r)).tickFormat(""));
    svg.append("line").attr("x1", mg.l).attr("x2", w - mg.r).attr("y1", y(100)).attr("y2", y(100)).attr("stroke", "var(--text-3)");
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${mg.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat(d3.format("d")).tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - mg.b})`).call(d3.axisBottom(x).ticks(Math.min(12, w / 70)).tickFormat(d3.format("d")).tickSizeOuter(0));
    const labs = [];
    data.slice().reverse().forEach((s) => {
      if (!s.pts.length) return;
      svg.append("path").datum(s.pts).attr("fill", "none").attr("stroke", s.color).attr("stroke-width", s.w || 2).attr("stroke-dasharray", s.dash ? "5 4" : null).attr("d", d3.line().x((p) => x(p[0])).y((p) => y(p[1])));
      const lp = s.pts[s.pts.length - 1];
      labs.push({ t: name(s.c), x: x(lp[0]) + 8, y: y(lp[1]) + 4, no: s.c === "NOR" });
    });
    labs.sort((a, b) => a.y - b.y);
    for (let k = 1; k < labs.length; k++) if (labs[k].y - labs[k - 1].y < 13) labs[k].y = labs[k - 1].y + 13;
    labs.forEach((l) => svg.append("text").attr("x", l.x).attr("y", l.y).attr("fill", "var(--text-2)").attr("font-size", 11.5).attr("font-weight", l.no ? 700 : 500).text(l.t.length > 14 && w < 560 ? l.t.slice(0, 12) + "…" : l.t));
    const cross = svg.append("line").attr("y1", mg.t).attr("y2", h - mg.b).attr("stroke", "var(--border-strong)").style("display", "none");
    svg.append("rect").attr("x", mg.l).attr("width", w - mg.l - mg.r).attr("height", h - mg.b).attr("fill", "transparent")
      .on("mousemove", (e) => {
        const t = x.invert(d3.pointer(e)[0]);
        const qi = ks.reduce((a, b) => (Math.abs(qNum(Q[b]) - t) < Math.abs(qNum(Q[a]) - t) ? b : a), ks[0]);
        cross.style("display", null).attr("x1", x(qNum(Q[qi]))).attr("x2", x(qNum(Q[qi])));
        const rows = data.map((s) => ({ s, v: s.pts.find((p) => p[2] === Q[qi])?.[1] })).sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
        tip.show(`<div class="tt-title">${qLab(Q[qi])}</div>${rows.map(({ s, v }) => `<div class="tt-row"><span><span class="key" style="background:${s.color}"></span>${S.escapeHtml(name(s.c))}</span><b>${v == null ? "–" : S.nf0.format(v)}</b></div>`).join("")}`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => { tip.hide(); cross.style("display", "none"); });
  }

  // ---------------------------------------------------------------- dyrt?
  function scatter() {
    const el = document.getElementById("scatter");
    const pts = COUNTRIES.map((c) => ({ c, a: lastOf("pti_avg", c), b: lastOf("ptr_avg", c) })).filter((p) => p.a && p.b).map((p) => ({ c: p.c, x: p.a.v, y: p.b.v, q: p.a.q }));
    document.getElementById("sc-sub").textContent = "Pris mot inntekt og pris mot husleie, sammenlignet med hvert lands langtidssnitt (100). Land øverst til høyre er dyre på begge mål. Siste kvartal med tall.";
    const w = Math.max(300, el.clientWidth || 600), h = Math.min(440, Math.max(320, w * 0.8)), m = { t: 12, r: 16, b: 40, l: 46 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear(d3.extent([...pts.map((p) => p.x), 90, 110]), [m.l, w - m.r]).nice();
    const y = d3.scaleLinear(d3.extent([...pts.map((p) => p.y), 90, 110]), [h - m.b, m.t]).nice();
    svg.append("rect").attr("x", x(100)).attr("y", m.t).attr("width", w - m.r - x(100)).attr("height", y(100) - m.t).attr("fill", "var(--series-5)").attr("opacity", 0.07);
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(5).tickSizeOuter(0));
    [[x(100), x(100), m.t, h - m.b], [m.l, w - m.r, y(100), y(100)]].forEach(([x1, x2, y1, y2]) => svg.append("line").attr("x1", x1).attr("x2", x2).attr("y1", y1).attr("y2", y2).attr("stroke", "var(--text-3)").attr("stroke-dasharray", "4 3"));
    svg.append("text").attr("x", w - m.r).attr("y", h - 6).attr("text-anchor", "end").attr("fill", "var(--text-3)").attr("font-size", 11.5).text("Pris mot inntekt →");
    svg.append("text").attr("x", m.l + 4).attr("y", m.t + 10).attr("fill", "var(--text-3)").attr("font-size", 11.5).text("↑ Pris mot husleie");
    svg.append("text").attr("x", w - m.r - 4).attr("y", m.t + 10).attr("text-anchor", "end").attr("fill", "var(--text-3)").attr("font-size", 11.5).text("Dyrt på begge mål");
    const col = (c) => (c === "NOR" ? "var(--series-2)" : NORD.has(c) ? "var(--series-1)" : "var(--neutral-mark)");
    pts.forEach((p) => {
      svg.append("circle").attr("cx", x(p.x)).attr("cy", y(p.y)).attr("r", p.c === "NOR" ? 7 : 5.5).attr("fill", col(p.c)).attr("stroke", "var(--surface)").style("cursor", "pointer")
        .on("mousemove", (e) => tip.show(`<div class="tt-title">${S.escapeHtml(name(p.c))}</div><div class="tt-row"><span>Pris mot inntekt</span><b>${S.nf0.format(p.x)}</b></div><div class="tt-row"><span>Pris mot husleie</span><b>${S.nf0.format(p.y)}</b></div><div class="tt-row"><span>Siste tall</span><b>${qLab(p.q)}</b></div>`, e.clientX, e.clientY))
        .on("mouseleave", () => tip.hide()).on("click", () => addChip(p.c, true));
    });
    // enkel kollisjonshåndtering for etikettene
    const labs = pts.map((p) => ({ p, x: x(p.x) + 8, y: y(p.y) + 4, t: name(p.c), w: name(p.c).length * 5.6 })).sort((a, b) => a.y - b.y);
    labs.forEach((l, i) => { for (let j = 0; j < i; j++) { const o = labs[j]; if (Math.abs(o.y - l.y) < 11 && l.x < o.x + o.w && o.x < l.x + l.w) l.y = o.y + 11; } });
    labs.forEach((l) => svg.append("text").attr("x", l.x).attr("y", l.y).attr("fill", "var(--text-2)").attr("font-size", 10.5).attr("font-weight", l.p.c === "NOR" ? 700 : 400).text(l.t));
  }

  // ---------------------------------------------------------------- fra toppen
  function peak() {
    const el = document.getElementById("peak");
    const rows = COUNTRIES.map((c) => ({ c, ...peakOf(c) })).filter((r) => r.peak).sort((a, b) => a.drop - b.drop);
    document.getElementById("pk-sub").textContent = `Reelle boligpriser i siste kvartal sammenlignet med høyeste nivå noensinne. Årstallet viser når toppen var. ${rows.filter((r) => r.drop > -0.5).length} land er på rekordnivå nå.`;
    const w = Math.max(280, el.clientWidth || 500), rowH = 17, m = { t: 4, r: 74, b: 4, l: 118 };
    const h = m.t + m.b + rowH * rows.length;
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear([d3.min(rows, (r) => r.drop), 0], [m.l, w - m.r]);
    rows.forEach((r, i) => {
      const yy = m.t + i * rowH;
      const g = svg.append("g").on("mousemove", (e) => tip.show(`<div class="tt-title">${S.escapeHtml(name(r.c))}</div><div class="tt-row"><span>Topp</span><b>${qLab(r.q)}</b></div><div class="tt-row"><span>Nå mot toppen</span><b>${fp(r.drop)}</b></div><div class="tt-row"><span>Siste tall</span><b>${qLab(r.lq)}</b></div>`, e.clientX, e.clientY)).on("mouseleave", () => tip.hide()).on("click", () => addChip(r.c, true));
      g.append("rect").attr("x", 0).attr("y", yy).attr("width", w).attr("height", rowH).attr("fill", "transparent");
      g.append("text").attr("x", m.l - 8).attr("y", yy + 12).attr("text-anchor", "end").attr("fill", "var(--text-2)").attr("font-size", 11).attr("font-weight", r.c === "NOR" ? 700 : 400).text(name(r.c));
      g.append("rect").attr("x", x(r.drop)).attr("y", yy + 3).attr("height", rowH - 6).attr("rx", 2).attr("width", Math.max(1.5, x(0) - x(r.drop))).attr("fill", r.c === "NOR" ? "var(--series-2)" : NORD.has(r.c) ? "var(--series-1)" : "var(--neutral-mark)");
      g.append("text").attr("x", w - m.r + 6).attr("y", yy + 12).attr("fill", "var(--text-2)").attr("font-size", 11).text(r.drop > -0.5 ? "på toppen" : `${fp(r.drop)} · ${r.q.slice(0, 4)}`);
    });
  }

  // ---------------------------------------------------------------- Norge
  const NS = d.ssb, NQ = NS.quarters;
  const noYears = [...new Set(NQ.map((q) => +q.slice(0, 4)))].filter((y) => y < +NQ[NQ.length - 1].slice(0, 4));
  const nofrom = document.getElementById("nofrom");
  nofrom.innerHTML = noYears.slice().reverse().map((y) => `<option>${y}</option>`).join("");
  nofrom.value = st.nobase;
  nofrom.onchange = () => { st.nobase = +nofrom.value; noTs(); };
  const BIG = { TOTAL: "var(--text)", "001": "var(--series-2)", "002": "var(--series-4)", "003": "var(--series-1)", "004": "var(--series-3)" };
  function noTs() {
    const el = document.getElementById("nots"), vals = NS.values[st.bt];
    const ks = NQ.map((q, i) => i).filter((i) => +NQ[i].slice(0, 4) >= st.nobase);
    const base = (r) => d3.mean(NQ.map((q, i) => (q.startsWith(String(st.nobase)) ? vals[r][i] : null)).filter((v) => v != null));
    const regs = Object.keys(NS.regions);
    const data = regs.map((r) => { const b = base(r); return { r, b, pts: b ? ks.map((i) => [qNum(NQ[i]), vals[r][i] == null ? null : (100 * vals[r][i]) / b, NQ[i]]).filter((p) => p[1] != null) : [] }; });
    const lastQ = NQ[NQ.length - 1];
    const ch = data.map((s) => ({ r: s.r, v: s.pts.length ? s.pts[s.pts.length - 1][1] - 100 : null })).filter((x) => x.v != null).sort((a, b) => b.v - a.v);
    document.getElementById("no-title").textContent = `Boligprisene i norske regioner siden ${st.nobase}`;
    document.getElementById("no-sub").textContent = `Indeks der snittet i ${st.nobase} = 100, ${NS.types[st.bt].toLowerCase()}. Til ${qLab(lastQ)}: størst økning i ${NS.regions[ch[0].r]} (${fp(ch[0].v)}), minst i ${NS.regions[ch[ch.length - 1].r]} (${fp(ch[ch.length - 1].v)}).`;
    document.getElementById("no-legend").innerHTML = Object.entries(BIG).map(([r, c]) => `<span class="item"><span class="sw line" style="background:${c}"></span>${NS.regions[r]}</span>`).join("") + '<span class="item"><span class="sw line" style="background:var(--neutral-mark)"></span>Andre regioner</span>';
    const w = Math.max(320, el.clientWidth || 900), h = 360, m = { t: 14, r: w < 560 ? 70 : 170, b: 28, l: 44 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const all = data.flatMap((s) => s.pts.map((p) => p[1]));
    const x = d3.scaleLinear([st.nobase, qNum(lastQ)], [m.l, w - m.r]), y = d3.scaleLinear([Math.min(90, d3.min(all)), d3.max(all)], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(100)).attr("y2", y(100)).attr("stroke", "var(--text-3)");
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat(d3.format("d")).tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(Math.min(12, w / 70)).tickFormat(d3.format("d")).tickSizeOuter(0));
    const labs = [];
    data.sort((a, b) => (BIG[a.r] ? 1 : 0) - (BIG[b.r] ? 1 : 0)).forEach((s) => {
      if (!s.pts.length) return;
      const big = !!BIG[s.r];
      svg.append("path").datum(s.pts).attr("fill", "none").attr("stroke", BIG[s.r] || "var(--neutral-mark)").attr("stroke-width", s.r === "TOTAL" ? 3 : big ? 2.2 : 1.2).attr("opacity", big ? 1 : 0.8).attr("stroke-dasharray", s.r === "TOTAL" ? "5 3" : null).attr("d", d3.line().x((p) => x(p[0])).y((p) => y(p[1])));
      if (big && w >= 560) { const lp = s.pts[s.pts.length - 1]; labs.push({ t: `${NS.regions[s.r].replace(" med Bærum", "")} ${fp(lp[1] - 100)}`, y: y(lp[1]) + 4, x: x(lp[0]) + 8 }); }
    });
    labs.sort((a, b) => a.y - b.y);
    for (let k = 1; k < labs.length; k++) if (labs[k].y - labs[k - 1].y < 13) labs[k].y = labs[k - 1].y + 13;
    labs.forEach((l) => svg.append("text").attr("x", l.x).attr("y", l.y).attr("fill", "var(--text-2)").attr("font-size", 11.5).text(l.t));
    const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--border-strong)").style("display", "none");
    svg.append("rect").attr("x", m.l).attr("width", w - m.l - m.r).attr("height", h - m.b).attr("fill", "transparent")
      .on("mousemove", (e) => {
        const t = x.invert(d3.pointer(e)[0]);
        const qi = ks.reduce((a, b) => (Math.abs(qNum(NQ[b]) - t) < Math.abs(qNum(NQ[a]) - t) ? b : a), ks[0]);
        cross.style("display", null).attr("x1", x(qNum(NQ[qi]))).attr("x2", x(qNum(NQ[qi])));
        const rows = data.map((s) => ({ s, v: s.pts.find((p) => p[2] === NQ[qi])?.[1] })).filter((r) => r.v != null).sort((a, b) => b.v - a.v);
        tip.show(`<div class="tt-title">${qLab(NQ[qi])}</div>${rows.map(({ s, v }) => `<div class="tt-row"><span><span class="key" style="background:${BIG[s.r] || "var(--neutral-mark)"}"></span>${S.escapeHtml(NS.regions[s.r])}</span><b>${S.nf0.format(v)}</b></div>`).join("")}`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => { tip.hide(); cross.style("display", "none"); });
  }

  // ---------------------------------------------------------------- tabell
  function table() {
    const b = st.base;
    const rows = COUNTRIES.map((c) => {
      const pk = peakOf(c);
      return { id: c, name: name(c), real: score("real", c, b)?.v ?? null, nom: score("nom", c, b)?.v ?? null, rent: score("rent", c, b)?.v ?? null,
        pti: lastOf("pti_avg", c)?.v ?? null, ptr: lastOf("ptr_avg", c)?.v ?? null, drop: pk?.drop ?? null, q: lastOf("real", c)?.q ?? lastOf("nom", c)?.q ?? "" };
    }).filter((r) => r.real != null || r.nom != null);
    document.getElementById("tbl-sub").textContent = `Endring fra snittet i ${b} til siste kvartal, nivå mot langtidssnittet og avstand fra toppen. Klikk på et land for å se det i grafen.`;
    const n0 = (v) => (v == null ? "–" : S.nf0.format(v));
    S.sortableTable(document.getElementById("table"), [
      { key: "name", label: "Land", text: true }, { key: "real", label: `Reelt siden ${b}`, fmt: (v) => fp(v) }, { key: "nom", label: `Nominelt siden ${b}`, fmt: (v) => fp(v) },
      { key: "rent", label: `Husleie siden ${b}`, fmt: (v) => fp(v) }, { key: "pti", label: "Pris/inntekt (snitt = 100)", fmt: n0 }, { key: "ptr", label: "Pris/husleie (snitt = 100)", fmt: n0 },
      { key: "drop", label: "Reelt mot toppen", fmt: (v) => fp(v) }, { key: "q", label: "Siste tall", fmt: (v) => (v ? qLab(v) : "–") },
    ], rows, { sortKey: "real", dir: -1, onRow: (c) => addChip(c, true) });
    const dec = (v) => (v == null ? "" : v.toFixed(1).replace(".", ","));
    document.getElementById("csv").onclick = () => S.downloadCsv(`boligpriser-${b}.csv`, [["Land", "ISO3", `Reell endring siden ${b} (%)`, `Nominell endring siden ${b} (%)`, `Husleie siden ${b} (%)`, "Pris mot inntekt (langtidssnitt = 100)", "Pris mot husleie (langtidssnitt = 100)", "Reell pris mot toppen (%)", "Siste kvartal"],
      ...rows.sort((a, c) => (c.real ?? -999) - (a.real ?? -999)).map((r) => [r.name, r.id, dec(r.real), dec(r.nom), dec(r.rent), dec(r.pti), dec(r.ptr), dec(r.drop), r.q])]);
  }

  function render() {
    document.getElementById("ind-note").textContent = MEAS[st.m].note;
    document.getElementById("from-f").style.visibility = MEAS[st.m].kind === "level" ? "hidden" : "";
    history.replaceState(null, "", st.m === "real" ? location.pathname : `#m=${st.m}`);
    wmap(); rank(); series(); table();
  }
  kpis(); render(); scatter(); peak(); noTs();
  document.getElementById("updated").textContent = `Data hentet ${d.fetched}`;
  S.onThemeChange(() => wmap());
  let rt, lastW = innerWidth;
  window.addEventListener("resize", () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rt); rt = setTimeout(() => { render(); scatter(); peak(); noTs(); }, 200); });
})();
