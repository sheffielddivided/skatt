/* Studie 22 – Vindkraft i Europa */
(async function () {
  const S = window.Skatt;
  const tip = S.tooltip();
  const [d, st0, topo, notopo] = await Promise.all([
    fetch("data/vind.json").then((r) => r.json()),
    fetch("data/vind-stotte.json").then((r) => r.json()),
    fetch("data/verden.topo.json").then((r) => r.json()),
    fetch("data/norge-2024.topo.json").then((r) => r.json()),
  ]);
  const land = topojson.feature(topo, topo.objects.land).features;
  const Y = d.years, E = d.ember, LASTY = Y[Y.length - 1];
  const AGG = { EU: "EU", EUR: "Europa" };
  const NORD = new Set(["DNK", "SWE", "FIN", "ISL"]);
  const ISO2 = {};
  land.forEach((f) => { ISO2[f.properties.id] = { EL: "GR", UK: "GB" }[f.properties.iso2] || f.properties.iso2; });
  ISO2.XKX = "XK";
  let dn = null;
  try { dn = new Intl.DisplayNames(["nb"], { type: "region" }); } catch (e) { /* */ }
  const name = (c) => { if (AGG[c]) return AGG[c]; if (c === "XKX") return "Kosovo"; try { const n = dn && ISO2[c] ? dn.of(ISO2[c]) : null; if (n && n !== ISO2[c]) return n; } catch (e) { /* */ } return d.names[c] || c; };
  const COUNTRIES = Object.keys(d.names).filter((c) => !AGG[c] && E.cap.wind?.[c]).sort((a, b) => name(a).localeCompare(name(b), "nb"));
  const ALLC = [...COUNTRIES, "EU", "EUR"];

  const f0 = (v) => (v == null || !isFinite(v) ? "–" : S.nf0.format(v).replace("-", "−"));
  const f1 = (v) => (v == null || !isFinite(v) ? "–" : S.nf1.format(v).replace("-", "−"));
  const fx = (v, dg) => (v == null || !isFinite(v) ? "–" : (dg === 0 ? f0(v) : Math.abs(v) >= 100 ? f0(v) : f1(v)));
  const yi = (y) => Y.indexOf(y);
  const ev = (kind, src, c, y) => { const s = E[kind][src]?.[c]; const i = yi(y); return s && i >= 0 ? s[i] : null; };
  const pop = (c, y) => { const s = d.pop[c]; const i = yi(y); return s && i >= 0 ? s[i] : null; };
  const OY = d.onoff.years;
  const oo = (k, c, y) => { const s = d.onoff[k]?.[c]; const i = OY.indexOf(y); return s && i >= 0 ? s[i] : null; };

  // ---------------------------------------------------------------- mål
  const M = {
    cap: { nb: "Installert kapasitet", unit: "GW", f: (c, y) => ev("cap", "wind", c, y), fmt: (v) => fx(v) + " GW", note: "Samlet effekt i vindturbinene ved utgangen av året (Ember)." },
    cap_pc: { nb: "Kapasitet per innbygger", unit: "W per innbygger", f: (c, y) => { const v = ev("cap", "wind", c, y), p = pop(c, y); return v != null && p ? (v * 1e9) / p : null; }, fmt: (v) => fx(v, 0) + " W", note: "Watt installert vindkraft per innbygger." },
    cap_area: { nb: "Kapasitet per areal", unit: "MW per 1 000 km²", f: (c, y) => { const v = ev("cap", "wind", c, y), a = d.area[c]; return v != null && a ? (v * 1000 * 1000) / a : null; }, fmt: (v) => fx(v) + " MW", note: "Megawatt vindkraft per 1 000 km² landareal. Havvind er tatt med, så land med mye havvind får høye tall." },
    cap_share: { nb: "Andel av all installert kapasitet", unit: "%", f: (c, y) => { const v = ev("cap", "wind", c, y), t = ev("cap", "total_generation", c, y); return v != null && t ? (100 * v) / t : null; }, fmt: (v) => fx(v) + " %", note: "Vindkraftens andel av all installert kraftkapasitet i landet." },
    gen: { nb: "Produksjon", unit: "TWh", f: (c, y) => ev("gen", "wind", c, y), fmt: (v) => fx(v) + " TWh", note: "Strøm produsert av vindkraft gjennom året." },
    gen_pc: { nb: "Produksjon per innbygger", unit: "kWh per innbygger", f: (c, y) => { const v = ev("gen", "wind", c, y), p = pop(c, y); return v != null && p ? (v * 1e9) / p : null; }, fmt: (v) => fx(v, 0) + " kWh", note: "Kilowattimer vindkraft per innbygger per år." },
    gen_share: { nb: "Andel av strømproduksjonen", unit: "%", f: (c, y) => { const v = ev("gen", "wind", c, y), t = ev("gen", "total_generation", c, y); return v != null && t ? (100 * v) / t : null; }, fmt: (v) => fx(v) + " %", note: "Vindkraftens andel av all strøm produsert i landet." },
    dem_share: { nb: "Andel av strømforbruket", unit: "%", f: (c, y) => { const v = ev("gen", "wind", c, y), t = ev("gen", "demand", c, y); return v != null && t ? (100 * v) / t : null; }, fmt: (v) => fx(v) + " %", note: "Vindkraft delt på landets strømforbruk (produksjon pluss import minus eksport)." },
    cf: { nb: "Kapasitetsfaktor", unit: "%", f: (c, y) => cfOf(c, y), fmt: (v) => fx(v) + " %", note: "Produksjon delt på det turbinene ville gitt med full effekt hele året. Regnet med snittet av kapasiteten ved inngangen og utgangen av året." },
    off_share: { nb: "Havvindens andel av vindkapasiteten", unit: "%", f: (c, y) => { const a = oo("on", c, y) || 0, b = oo("off", c, y) || 0; return a + b > 0 ? (100 * b) / (a + b) : null; }, fmt: (v) => fx(v) + " %", note: "Havvind som andel av all vindkapasitet (Eurostat, til og med 2024).", years: OY },
  };
  function cfOf(c, y) {
    const g = ev("gen", "wind", c, y), a = ev("cap", "wind", c, y), b = ev("cap", "wind", c, y - 1);
    if (g == null || !a) return null;
    const cap = b != null ? (a + b) / 2 : a;
    if (cap < 0.05) return null;
    const v = (100 * g) / (cap * 8.76);
    return v > 0 && v < 70 ? v : null;
  }
  const MK = Object.keys(M);

  const st = { m: "cap", year: LASTY, chips: ["DEU", "DNK", "SWE", "GBR", "ESP", "FIN"], mc: "NOR", mmode: "share", tech: "on" };
  (function readHash() { const h = new URLSearchParams(location.hash.slice(1)); if (M[h.get("m")]) st.m = h.get("m"); })();
  const indSel = document.getElementById("ind"), yearSel = document.getElementById("year");
  indSel.innerHTML = `<optgroup label="Kapasitet">${["cap", "cap_pc", "cap_area", "cap_share", "off_share"].map((k) => `<option value="${k}">${M[k].nb}</option>`).join("")}</optgroup><optgroup label="Produksjon">${["gen", "gen_pc", "gen_share", "dem_share", "cf"].map((k) => `<option value="${k}">${M[k].nb}</option>`).join("")}</optgroup>`;
  indSel.value = st.m;
  const yearsFor = (m) => (M[m].years || Y).filter((y) => y >= 2000 && COUNTRIES.some((c) => M[m].f(c, y) != null));
  function fillYears() {
    const ys = yearsFor(st.m).reverse();
    if (!ys.includes(st.year)) st.year = ys[0];
    yearSel.innerHTML = ys.map((y) => `<option${y === st.year ? " selected" : ""}>${y}</option>`).join("");
  }
  indSel.onchange = () => { st.m = indSel.value; fillYears(); top(); };
  yearSel.onchange = () => { st.year = +yearSel.value; wmap(); rank(); };
  function seg(id, cb) { const el = document.getElementById(id); el.querySelectorAll("button").forEach((b) => (b.onclick = () => { el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); cb(b.dataset.v); })); }

  const addc = document.getElementById("addc");
  document.getElementById("clist").innerHTML = ALLC.filter((c) => c !== "NOR").map((c) => `<option value="${S.escapeHtml(name(c))}">`).join("");
  addc.onchange = () => { const c = ALLC.find((x) => name(x).toLowerCase() === addc.value.trim().toLowerCase()); if (c) { addChip(c); addc.value = ""; } };
  function addChip(c, scroll) {
    if (c !== "NOR" && !st.chips.includes(c)) { st.chips.push(c); if (st.chips.length > 7) st.chips.shift(); }
    series(); rank();
    if (scroll) document.getElementById("t-title").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------------------------------------------------------------- KPI
  function kpis() {
    const y = LASTY;
    const eu = ev("cap", "wind", "EUR", y), eus = M.gen_share.f("EUR", y);
    const rk = (m) => COUNTRIES.map((c) => ({ c, v: M[m].f(c, y) })).filter((x) => x.v != null).sort((a, b) => b.v - a.v);
    const sh = rk("gen_share"), pc = rk("cap_pc");
    const nos = M.gen_share.f("NOR", y);
    const cards = [
      { l: `Vindkraft i Europa ${y}`, v: `${f0(eu)} GW`, s: `${f0(ev("gen", "wind", "EUR", y))} TWh produsert · ${f1(eus)} % av all strøm` },
      { l: `Størst andel av strømmen ${y}`, v: S.escapeHtml(name(sh[0].c)), s: `${f1(sh[0].v)} % · så ${sh.slice(1, 3).map((x) => `${name(x.c)} (${f0(x.v)} %)`).join(" og ")}` },
      { l: "Mest per innbygger", v: S.escapeHtml(name(pc[0].c)), s: `${f0(pc[0].v)} W per innbygger · Norge ${f0(M.cap_pc.f("NOR", y))} W (nr. ${pc.findIndex((x) => x.c === "NOR") + 1})` },
      { l: `Norge ${y}`, v: `${f1(nos)} %`, s: `av strømproduksjonen · ${f1(ev("gen", "wind", "NOR", y))} TWh fra ${f1(ev("cap", "wind", "NOR", y))} GW · nr. ${sh.findIndex((x) => x.c === "NOR") + 1} av ${sh.length}` },
    ];
    document.getElementById("kpis").innerHTML = cards.map((c) => `<div class="card kpi"><div class="l">${c.l}</div><div class="v">${c.v}</div><div class="s">${c.s}</div></div>`).join("");
  }

  // ---------------------------------------------------------------- kart og rangering
  function ramp() { return S.isDark() ? ["#1c3a5e", "#1d4f8a", "#2a6bb8", "#3f8ae0", "#7fb3f0", "#c4dcf7"] : ["#dbe9fa", "#b3d0f4", "#80b0ea", "#4a8bdb", "#2066bd", "#0f3f7d"]; }
  function wmap() {
    const m = M[st.m], y = st.year, el = document.getElementById("map");
    document.getElementById("m-title").textContent = `${m.nb} ${y}`;
    document.getElementById("m-sub").textContent = `${m.unit}. Klikk på et land for å se det over tid.`;
    document.getElementById("ind-note").textContent = m.note;
    const w = Math.max(300, el.clientWidth || 700), h = Math.round(w * 0.8);
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    svg.append("clipPath").attr("id", "vclip").append("rect").attr("width", w).attr("height", h - 44);
    const proj = d3.geoConicConformal().rotate([-12, 0]).parallels([40, 68]).fitExtent([[4, 4], [w - 4, h - 46]], { type: "Feature", geometry: { type: "Polygon", coordinates: [[[-11, 35], [-11, 71], [36, 71], [36, 35], [-11, 35]]] } });
    const path = d3.geoPath(proj);
    const vals = COUNTRIES.map((c) => m.f(c, y)).filter((v) => v != null && v > 0).sort(d3.ascending);
    const R = ramp();
    const th = [0.2, 0.4, 0.6, 0.8, 0.95].map((q) => d3.quantile(vals, q)).map((v) => { const p = Math.pow(10, Math.floor(Math.log10(v || 1))); return Math.round(v / p) * p; });
    const TH = [...new Set(th)].filter((v) => v > 0);
    const col = (v) => (v == null ? null : R[Math.min(R.length - 1, d3.bisectRight(TH, v) + (R.length - 1 - TH.length))]);
    svg.append("g").attr("clip-path", "url(#vclip)").selectAll("path").data(land).join("path").attr("d", path)
      .attr("class", (f) => (m.f(f.properties.id, y) == null ? "na" : "c"))
      .attr("fill", (f) => col(m.f(f.properties.id, y)))
      .on("mousemove", (e, f) => {
        const c = f.properties.id, v = m.f(c, y);
        tip.show(`<div class="tt-title">${S.escapeHtml(name(c))}</div>${v != null ? `<div class="tt-row"><span>${m.nb}</span><b>${m.fmt(v)}</b></div><div class="tt-row"><span>Kapasitet</span><b>${M.cap.fmt(ev("cap", "wind", c, y))}</b></div><div class="tt-row"><span>Produksjon</span><b>${M.gen.fmt(ev("gen", "wind", c, y))}</b></div><div class="tt-row"><span>Andel av strømmen</span><b>${M.gen_share.fmt(M.gen_share.f(c, y))}</b></div>` : '<div class="tt-row"><span>Ingen tall</span></div>'}`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => tip.hide())
      .on("click", (e, f) => { if (E.cap.wind[f.properties.id]) addChip(f.properties.id, true); });
    const nof = land.find((f) => f.properties.id === "NOR");
    if (nof) svg.append("path").attr("class", "sel").attr("clip-path", "url(#vclip)").attr("d", path(nof));
    const cols = R.slice(R.length - 1 - TH.length), lg = svg.append("g").attr("class", "lg").attr("transform", `translate(8,${h - 36})`), bw = Math.min(46, (w - 60) / cols.length);
    cols.forEach((c, k) => lg.append("rect").attr("x", k * bw).attr("y", 0).attr("width", bw - 2).attr("height", 10).attr("rx", 2).attr("fill", c));
    TH.forEach((t, k) => lg.append("text").attr("x", (k + 1) * bw - 1).attr("y", 26).attr("text-anchor", "middle").text(S.nf0.format(t) === "0" ? S.nf1.format(t) : S.nf0.format(t)));
    lg.append("text").attr("x", cols.length * bw + 6).attr("y", 9).text(m.unit.replace(" per innbygger", "").replace(" per 1 000 km²", ""));
  }
  function rank() {
    const m = M[st.m], y = st.year, el = document.getElementById("rank");
    const rows = ALLC.map((c) => ({ c, v: m.f(c, y) })).filter((x) => x.v != null).sort((a, b) => b.v - a.v);
    const nc = rows.filter((r) => !AGG[r.c]);
    document.getElementById("r-sub").textContent = `${nc.length} land, ${y}. Norge er nr. ${nc.findIndex((r) => r.c === "NOR") + 1 || "–"}.`;
    const mx = d3.max(nc, (r) => r.v) || 1;
    let k = 0;
    el.innerHTML = rows.map((r) => `<div class="r ${r.c === "NOR" ? "no" : ""} ${NORD.has(r.c) ? "nord" : ""} ${AGG[r.c] ? "agg" : ""} ${st.chips.includes(r.c) ? "pick" : ""}" data-c="${r.c}"><span class="i">${AGG[r.c] ? "" : ++k}</span><span>${S.escapeHtml(name(r.c))}</span><div class="bw"><div class="b" style="left:0;width:${Math.min(100, Math.max(0.6, (100 * r.v) / mx)).toFixed(1)}%"></div></div><span class="v">${m.fmt(r.v).replace(/ (GW|TWh|W|kWh|MW)$/, "")}</span></div>`).join("");
    el.querySelectorAll(".r").forEach((row) => (row.onclick = () => addChip(row.dataset.c, true)));
  }

  // ---------------------------------------------------------------- linjediagram
  function lineChart(el, o) {
    const w = Math.max(300, el.clientWidth || 800), h = o.h || 340, narrow = w < 560;
    const m = { t: 12, r: o.endLabels ? (narrow ? 70 : 110) : 14, b: 28, l: 48 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const all = o.series.flatMap((s) => s.pts);
    if (!all.length) return;
    const x = d3.scaleLinear(o.xdom || d3.extent(all, (p) => p[0]), [m.l, w - m.r]);
    const y = d3.scaleLinear([0, d3.max(all, (p) => p[1]) || 1], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat((t) => S.nf0.format(t)).tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(Math.min(12, w / 70)).tickFormat(o.xtick || d3.format("d")).tickSizeOuter(0));
    const labs = [];
    o.series.slice().reverse().forEach((s) => {
      if (!s.pts.length) return;
      svg.append("path").datum(s.pts).attr("fill", "none").attr("stroke", s.color).attr("stroke-width", s.w || 2).attr("stroke-dasharray", s.dash ? "5 4" : null).attr("d", d3.line().defined((p) => p[1] != null).x((p) => x(p[0])).y((p) => y(p[1])));
      if (o.endLabels) { const lp = s.pts[s.pts.length - 1]; labs.push({ t: s.label, x: x(lp[0]) + 8, y: y(lp[1]) + 4, b: s.w >= 3 }); }
    });
    labs.sort((a, b) => a.y - b.y);
    for (let k = 1; k < labs.length; k++) if (labs[k].y - labs[k - 1].y < 13) labs[k].y = labs[k - 1].y + 13;
    labs.forEach((l) => svg.append("text").attr("x", l.x).attr("y", l.y).attr("fill", "var(--text-2)").attr("font-size", 11.5).attr("font-weight", l.b ? 700 : 500).text(l.t.length > 14 && narrow ? l.t.slice(0, 12) + "…" : l.t));
    const xs = [...new Set(all.map((p) => p[0]))].sort((a, b) => a - b);
    const maps = o.series.map((s) => new Map(s.pts.map((p) => [p[0], p[1]])));
    const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--border-strong)").style("display", "none");
    svg.append("rect").attr("x", m.l).attr("width", w - m.l - m.r).attr("height", h - m.b).attr("fill", "transparent")
      .on("mousemove", (e) => {
        const t = x.invert(d3.pointer(e)[0]);
        const xv = xs.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a), xs[0]);
        cross.style("display", null).attr("x1", x(xv)).attr("x2", x(xv));
        const rows = o.series.map((s, j) => ({ s, v: maps[j].get(xv) })).sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
        tip.show(`<div class="tt-title">${o.xfmt ? o.xfmt(xv) : xv}</div>${rows.map(({ s, v }) => `<div class="tt-row"><span><span class="key" style="background:${s.color}"></span>${S.escapeHtml(s.label)}</span><b>${v == null ? "–" : o.vfmt(v)}</b></div>`).join("")}`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => { tip.hide(); cross.style("display", "none"); });
  }

  const PAL = ["var(--series-1)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)", "var(--series-7)", "var(--text-2)"];
  function series() {
    const m = M[st.m];
    document.getElementById("t-title").textContent = `${m.nb} over tid`;
    document.getElementById("t-sub").textContent = `${m.unit}. Velg opptil sju land i kartet, i listen eller i søkefeltet.`;
    const ser = [{ c: "NOR", color: "var(--series-2)", w: 3 }, ...st.chips.map((c, k) => ({ c, color: PAL[k % PAL.length], dash: !!AGG[c] }))];
    document.getElementById("chips").innerHTML = ser.map((s) => `<span class="chip"><span class="sw" style="background:${s.color}"></span>${S.escapeHtml(name(s.c))}${s.c === "NOR" ? '<span style="width:6px"></span>' : `<button data-c="${s.c}" aria-label="Fjern ${S.escapeHtml(name(s.c))}">×</button>`}</span>`).join("");
    document.querySelectorAll("#chips button").forEach((b) => (b.onclick = () => { st.chips = st.chips.filter((c) => c !== b.dataset.c); series(); rank(); }));
    const ys = (m.years || Y).filter((y) => y >= 2000);
    lineChart(document.getElementById("ts"), {
      series: ser.map((s) => ({ label: name(s.c), color: s.color, w: s.w, dash: s.dash, pts: ys.map((y) => [y, m.f(s.c, y)]).filter((p) => p[1] != null) })),
      endLabels: true, vfmt: m.fmt, xdom: [2000, ys[ys.length - 1]],
    });
  }

  // ---------------------------------------------------------------- kapasitet mot produksjon
  function scatter() {
    const y = LASTY, el = document.getElementById("scatter");
    const pts = COUNTRIES.map((c) => ({ c, x: M.cap_share.f(c, y), y: M.gen_share.f(c, y), cap: ev("cap", "wind", c, y) })).filter((p) => p.x != null && p.y != null && p.cap > 0.05);
    const below = pts.filter((p) => p.y < p.x).length;
    document.getElementById("sc-sub").textContent = `Vindkraftens andel av kapasiteten (x) og av produksjonen (y) i ${y}. Punktene under den stiplede linjen gir mindre strøm enn kapasiteten skulle tilsi. Det gjelder ${below} av ${pts.length} land. Størrelsen viser installert kapasitet.`;
    const w = Math.max(280, el.clientWidth || 500), h = 380, m = { t: 12, r: 14, b: 40, l: 42 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const mx = Math.max(d3.max(pts, (p) => p.x), d3.max(pts, (p) => p.y)) * 1.05;
    const x = d3.scaleLinear([0, mx], [m.l, w - m.r]).nice(), yy = d3.scaleLinear([0, mx], [h - m.b, m.t]).nice(), r = d3.scaleSqrt([0, d3.max(pts, (p) => p.cap)], [3, 18]);
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(yy).ticks(6).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(yy).ticks(6).tickFormat((t) => t + " %").tickPadding(4));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat((t) => t + " %").tickSizeOuter(0));
    svg.append("line").attr("x1", x(0)).attr("y1", yy(0)).attr("x2", x(mx)).attr("y2", yy(mx)).attr("stroke", "var(--text-3)").attr("stroke-dasharray", "4 4");
    svg.append("text").attr("x", w - m.r).attr("y", h - 6).attr("text-anchor", "end").attr("font-size", 12).attr("fill", "var(--text-2)").text("Andel av kapasiteten →");
    svg.append("text").attr("x", m.l + 4).attr("y", m.t + 10).attr("font-size", 12).attr("fill", "var(--text-2)").text("↑ Andel av produksjonen");
    svg.append("g").selectAll("circle").data(pts.sort((a, b) => b.cap - a.cap)).join("circle").attr("cx", (p) => x(p.x)).attr("cy", (p) => yy(p.y)).attr("r", (p) => r(p.cap))
      .attr("fill", (p) => (p.c === "NOR" ? "var(--series-2)" : NORD.has(p.c) ? "var(--series-1)" : "var(--neutral-mark)")).attr("opacity", 0.8).attr("stroke", "var(--surface)")
      .on("mousemove", (e, p) => tip.show(`<div class="tt-title">${S.escapeHtml(name(p.c))}</div><div class="tt-row"><span>Andel av kapasiteten</span><b>${f1(p.x)} %</b></div><div class="tt-row"><span>Andel av produksjonen</span><b>${f1(p.y)} %</b></div><div class="tt-row"><span>Kapasitetsfaktor</span><b>${f1(cfOf(p.c, y))} %</b></div>`, e.clientX, e.clientY))
      .on("mouseleave", () => tip.hide());
    const placed = [];
    ["NOR", "DNK", "DEU", "GBR", "IRL", "ESP", "SWE", "PRT", "NLD", "FIN", "FRA", "POL"].map((c) => pts.find((p) => p.c === c)).filter(Boolean).forEach((p) => {
      const px = x(p.x) + r(p.cap) + 3, py = yy(p.y) + 4;
      if (placed.some((q) => Math.abs(q[1] - py) < 12 && Math.abs(q[0] - px) < 70)) return;
      placed.push([px, py]);
      svg.append("text").attr("x", px).attr("y", py).attr("font-size", 11).attr("font-weight", p.c === "NOR" ? 700 : 500).attr("fill", "var(--text-2)").attr("pointer-events", "none").text(name(p.c));
    });
  }
  function cfBars() {
    const el = document.getElementById("cfbars"), y1 = LASTY, y0 = LASTY - 4;
    const rows = COUNTRIES.map((c) => { const v = d3.range(y0, y1 + 1).map((y) => cfOf(c, y)).filter((x) => x != null); return { c, v: v.length >= 3 ? d3.mean(v) : null, off: M.off_share.f(c, Math.min(y1, OY[OY.length - 1])) }; }).filter((r) => r.v != null && ev("cap", "wind", r.c, y1) >= 0.1).sort((a, b) => b.v - a.v);
    document.getElementById("cf-sub").textContent = `Snitt ${y0}–${y1}, land med minst 100 MW. Mørkere blå betyr mer havvind. En kapasitetsfaktor på 30 % tilsvarer full effekt i om lag 2 600 timer i året.`;
    const w = Math.max(280, el.clientWidth || 500), rowH = 17, m = { t: 6, r: 44, b: 22, l: 112 }, h = m.t + m.b + rowH * rows.length;
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear([0, d3.max(rows, (r) => r.v) * 1.05], [m.l, w - m.r]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(5).tickSize(-(h - m.t - m.b)).tickFormat(""));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat((t) => t + " %").tickSizeOuter(0));
    const sh = d3.scaleLinear([0, 60], [0.35, 1]).clamp(true);
    rows.forEach((r, i) => {
      const yy = m.t + i * rowH;
      const g = svg.append("g").on("mousemove", (e) => tip.show(`<div class="tt-title">${S.escapeHtml(name(r.c))}</div><div class="tt-row"><span>Kapasitetsfaktor ${y0}–${y1}</span><b>${f1(r.v)} %</b></div><div class="tt-row"><span>Havvind av kapasiteten</span><b>${r.off == null ? "–" : f0(r.off) + " %"}</b></div>`, e.clientX, e.clientY)).on("mouseleave", () => tip.hide());
      g.append("text").attr("x", m.l - 8).attr("y", yy + rowH / 2 + 4).attr("text-anchor", "end").attr("font-size", 11.5).attr("font-weight", r.c === "NOR" ? 700 : 400).attr("fill", "var(--text)").text(name(r.c));
      g.append("rect").attr("x", x(0)).attr("y", yy + 2).attr("height", rowH - 4).attr("width", x(r.v) - x(0)).attr("rx", 2).attr("fill", r.c === "NOR" ? "var(--series-2)" : "var(--series-1)").attr("opacity", r.c === "NOR" ? 1 : sh(r.off || 0));
      g.append("text").attr("x", x(r.v) + 4).attr("y", yy + rowH / 2 + 4).attr("font-size", 11).attr("fill", "var(--text-2)").text(f1(r.v));
    });
  }

  // ---------------------------------------------------------------- land og hav
  function onoff() {
    const el = document.getElementById("onoff"), y = OY[OY.length - 1];
    const rows = COUNTRIES.map((c) => ({ c, on: (oo("on", c, y) || 0) / 1000, off: (oo("off", c, y) || 0) / 1000 })).filter((r) => r.on + r.off >= 0.3).sort((a, b) => b.on + b.off - (a.on + a.off));
    const tot = d3.sum(rows, (r) => r.off), top5 = d3.sum(rows.slice().sort((a, b) => b.off - a.off).slice(0, 5), (r) => r.off);
    document.getElementById("oo-sub").textContent = `Installert kapasitet i GW ved utgangen av ${y} (Eurostat, land med minst 0,3 GW). De fem landene med mest havvind har ${f0((100 * top5) / tot)} % av havvinden.`;
    const w = Math.max(280, el.clientWidth || 500), rowH = 18, m = { t: 6, r: 50, b: 22, l: 112 }, h = m.t + m.b + rowH * rows.length;
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear([0, d3.max(rows, (r) => r.on + r.off)], [m.l, w - m.r]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(5).tickSize(-(h - m.t - m.b)).tickFormat(""));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat((t) => t + " GW").tickSizeOuter(0));
    rows.forEach((r, i) => {
      const yy = m.t + i * rowH;
      const g = svg.append("g").on("mousemove", (e) => tip.show(`<div class="tt-title">${S.escapeHtml(name(r.c))} ${y}</div><div class="tt-row"><span>Landvind</span><b>${f1(r.on)} GW</b></div><div class="tt-row"><span>Havvind</span><b>${f1(r.off)} GW</b></div><div class="tt-row"><span>Havvindandel</span><b>${f0((100 * r.off) / (r.on + r.off))} %</b></div>`, e.clientX, e.clientY)).on("mouseleave", () => tip.hide());
      g.append("text").attr("x", m.l - 8).attr("y", yy + rowH / 2 + 4).attr("text-anchor", "end").attr("font-size", 11.5).attr("font-weight", r.c === "NOR" ? 700 : 400).attr("fill", "var(--text)").text(name(r.c));
      g.append("rect").attr("x", x(0)).attr("y", yy + 2).attr("height", rowH - 4).attr("width", x(r.on) - x(0)).attr("fill", "var(--series-3)");
      g.append("rect").attr("x", x(r.on)).attr("y", yy + 2).attr("height", rowH - 4).attr("width", x(r.on + r.off) - x(r.on)).attr("fill", "var(--series-1)");
      g.append("text").attr("x", x(r.on + r.off) + 4).attr("y", yy + rowH / 2 + 4).attr("font-size", 11).attr("fill", "var(--text-2)").text(f1(r.on + r.off));
    });
  }
  function euGrowth() {
    const el = document.getElementById("eugrowth");
    const ys = OY.filter((y) => y >= 2000);
    const rows = ys.map((y) => ({ y, on: d3.sum(COUNTRIES, (c) => oo("on", c, y) || 0) / 1000, off: d3.sum(COUNTRIES, (c) => oo("off", c, y) || 0) / 1000 }));
    const l = rows[rows.length - 1];
    document.getElementById("eu-sub").textContent = `Sum for landene i Eurostats statistikk, GW. Ved utgangen av ${l.y}: ${f0(l.on)} GW landvind og ${f0(l.off)} GW havvind.`;
    const w = Math.max(280, el.clientWidth || 500), h = 320, m = { t: 12, r: 12, b: 26, l: 42 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleBand(ys, [m.l, w - m.r]).padding(0.15), y = d3.scaleLinear([0, d3.max(rows, (r) => r.on + r.off)], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat((t) => t).tickPadding(4));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickValues(ys.filter((v) => v % 5 === 0)).tickSizeOuter(0));
    rows.forEach((r) => {
      const g = svg.append("g").on("mousemove", (e) => tip.show(`<div class="tt-title">${r.y}</div><div class="tt-row"><span>Landvind</span><b>${f1(r.on)} GW</b></div><div class="tt-row"><span>Havvind</span><b>${f1(r.off)} GW</b></div>`, e.clientX, e.clientY)).on("mouseleave", () => tip.hide());
      g.append("rect").attr("x", x(r.y)).attr("width", x.bandwidth()).attr("y", y(r.on)).attr("height", y(0) - y(r.on)).attr("fill", "var(--series-3)");
      g.append("rect").attr("x", x(r.y)).attr("width", x.bandwidth()).attr("y", y(r.on + r.off)).attr("height", y(r.on) - y(r.on + r.off)).attr("fill", "var(--series-1)");
    });
  }

  // ---------------------------------------------------------------- måned for måned
  const MO = d.monthly, MN = MO.months;
  const MC = Object.keys(MO.wind).filter((c) => d.names[c] && !AGG[c] && d3.sum(MO.wind[c].filter((v) => v != null)) > 100).sort((a, b) => name(a).localeCompare(name(b), "nb"));
  const mcSel = document.getElementById("mc");
  mcSel.innerHTML = MC.map((c) => `<option value="${c}"${c === st.mc ? " selected" : ""}>${S.escapeHtml(name(c))}</option>`).join("");
  mcSel.onchange = () => { st.mc = mcSel.value; monthly(); };
  seg("mmode", (v) => { st.mmode = v; monthly(); });
  function monthly() {
    const c = st.mc, share = st.mmode === "share";
    const val = (i) => { const w = MO.wind[c]?.[i], t = MO.total[c]?.[i]; return w == null ? null : share ? (t ? (100 * w) / t : null) : w; };
    const unit = share ? " %" : " GWh";
    document.getElementById("mo-title").textContent = `${name(c)}: vindkraft gjennom året`;
    const li = MN.map((_, i) => i).filter((i) => val(i) != null).pop();
    document.getElementById("mo-sub").textContent = `${share ? "Vindkraftens andel av nettoproduksjonen" : "Vindkraftproduksjon i GWh"} per måned (Eurostat). Til venstre: hvert år som en linje, med snittet for de fem siste hele årene som tykk linje og i år i oransje. Til høyre: alle måneder siden 2016. Siste måned: ${S.MONTHS[+MN[li].slice(5) - 1]} ${MN[li].slice(0, 4)}.`;
    const yrs = [...new Set(MN.map((m) => +m.slice(0, 4)))];
    const byY = yrs.map((y) => ({ y, pts: d3.range(12).map((k) => { const i = MN.indexOf(`${y}-${String(k + 1).padStart(2, "0")}`); return [k + 1, i >= 0 ? val(i) : null]; }).filter((p) => p[1] != null) })).filter((s) => s.pts.length);
    const full = byY.filter((s) => s.pts.length === 12).slice(-5);
    const avg = d3.range(12).map((k) => [k + 1, d3.mean(full, (s) => s.pts[k][1])]);
    const lastY = byY[byY.length - 1].y;
    lineChart(document.getElementById("season"), {
      series: [...byY.map((s) => ({ label: String(s.y), color: s.y === lastY ? "var(--series-2)" : "var(--neutral-mark)", w: s.y === lastY ? 2.5 : 1.2, pts: s.pts })), { label: "Snitt", color: "var(--series-1)", w: 3.5, pts: avg }],
      xdom: [1, 12], xtick: (t) => S.MONTHS_SHORT[t - 1] || "", xfmt: (t) => S.MONTHS[t - 1], vfmt: (v) => fx(v) + unit, h: 300,
    });
    const pts = MN.map((m, i) => [+m.slice(0, 4) + (+m.slice(5) - 1) / 12, val(i)]).filter((p) => p[1] != null);
    lineChart(document.getElementById("mts"), {
      series: [{ label: name(c), color: "var(--series-1)", w: 1.8, pts }],
      xfmt: (x) => { const yv = Math.floor(x + 1e-6); return `${S.MONTHS[Math.round((x - yv) * 12)]} ${yv}`; }, vfmt: (v) => fx(v) + unit, h: 300,
    });
  }

  // ---------------------------------------------------------------- støtte
  const CE = st0.ceer;
  const CC = Object.keys(CE).filter((c) => CE[c]["2023"] || CE[c]["2022"]);
  seg("tech", (v) => { st.tech = v; levels(); });
  function levels() {
    const el = document.getElementById("lvl"), t = st.tech;
    const rows = CC.map((c) => ({ c, a: CE[c]["2022"]?.[t + "_lvl"], b: CE[c]["2023"]?.[t + "_lvl"] })).filter((r) => r.a != null || r.b != null).sort((p, q) => (q.b ?? q.a) - (p.b ?? p.a));
    document.getElementById("sl-title").textContent = `Støtte per MWh ${t === "on" ? "landvind" : "havvind"}`;
    document.getElementById("sl-sub").textContent = `CEERs beregnede støtte per MWh for vindkraft som var med i en støtteordning, i euro. Negative tall: produsentene betalte tilbake fordi markedsprisen var høyere enn den garanterte prisen. ${rows.length} land.`;
    const w = Math.max(300, el.clientWidth || 800), narrow = w < 560, rowH = 24, m = { t: 22, r: narrow ? 14 : 120, b: 8, l: 112 }, h = m.t + m.b + rowH * rows.length;
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const ext = d3.extent(rows.flatMap((r) => [r.a, r.b]).filter((v) => v != null));
    const x = d3.scaleLinear([Math.min(0, ext[0]), Math.max(0, ext[1])], [m.l, w - m.r]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(0,${m.t - 4})`).call(d3.axisTop(x).ticks(8).tickSize(-(h - m.t - m.b + 4)).tickFormat(""));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${m.t - 4})`).call(d3.axisTop(x).ticks(8).tickFormat((v) => f0(v)).tickSizeOuter(0));
    svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", m.t - 4).attr("y2", h - m.b).attr("stroke", "var(--text-3)");
    rows.forEach((r, i) => {
      const yy = m.t + i * rowH + rowH / 2;
      const g = svg.append("g").on("mousemove", (e) => tip.show(`<div class="tt-title">${S.escapeHtml(name(r.c))}, ${t === "on" ? "landvind" : "havvind"}</div><div class="tt-row"><span>2022</span><b>${r.a == null ? "–" : f1(r.a) + " €/MWh"}</b></div><div class="tt-row"><span>2023</span><b>${r.b == null ? "–" : f1(r.b) + " €/MWh"}</b></div><div class="tt-row"><span>Støttet produksjon 2023</span><b>${CE[r.c]["2023"]?.[t + "_gwh"] == null ? "–" : f1(CE[r.c]["2023"][t + "_gwh"] / 1000) + " TWh"}</b></div>${st0.schemes[r.c] ? `<div style="max-width:280px;margin-top:4px">${S.escapeHtml(st0.schemes[r.c].type.join(", "))}</div>` : ""}`, e.clientX, e.clientY)).on("mouseleave", () => tip.hide());
      g.append("rect").attr("x", 0).attr("y", yy - rowH / 2).attr("width", w).attr("height", rowH).attr("fill", "transparent");
      g.append("text").attr("x", m.l - 10).attr("y", yy + 4).attr("text-anchor", "end").attr("font-size", 12).attr("fill", "var(--text)").text(name(r.c));
      if (r.a != null && r.b != null) g.append("line").attr("x1", x(r.a)).attr("x2", x(r.b)).attr("y1", yy).attr("y2", yy).attr("stroke", "var(--border-strong)").attr("stroke-width", 2);
      if (r.a != null) g.append("circle").attr("cx", x(r.a)).attr("cy", yy).attr("r", 5).attr("fill", "var(--neutral-mark)");
      if (r.b != null) g.append("circle").attr("cx", x(r.b)).attr("cy", yy).attr("r", 6).attr("fill", r.b < 0 ? "var(--series-5)" : "var(--series-1)");
      if (!narrow) g.append("text").attr("x", w - m.r + 10).attr("y", yy + 4).attr("font-size", 11.5).attr("font-weight", 600).attr("fill", "var(--text-2)").text(r.b == null ? "2023: –" : `2023: ${f1(r.b)}`);
    });
    document.getElementById("lvl-note").innerHTML = `<b>Merk:</b> ${S.escapeHtml(st0.note)} Sverige har lave tall fordi elsertifikatprisen var nær null. Storbritannias tall er oppgitt avrundet.`;
  }
  function costChart() {
    const el = document.getElementById("cost");
    const rows = CC.map((c) => { const r = CE[c]["2023"]; if (!r) return null; const on = (r.on_gwh || 0) * (r.on_lvl || 0) / 1000, off = (r.off_gwh || 0) * (r.off_lvl || 0) / 1000; const twh = ((r.on_gwh || 0) + (r.off_gwh || 0)) / 1000; if (!twh) return null; if (r.on_lvl == null && r.off_lvl == null) return null; const p = pop(c, 2023); return { c, v: on + off, on, off, twh, pc: p ? ((on + off) * 1e6) / p : null }; }).filter(Boolean).sort((a, b) => b.v - a.v);
    const tot = d3.sum(rows, (r) => r.v);
    document.getElementById("cost-sub").textContent = `Støttenivå ganger støttet produksjon, millioner euro i 2023. Summen for ${rows.length} land er ${S.nf0.format(tot)} mill. euro. Negative tall er tilbakebetaling. Beregnet av oss fra CEERs tall.`;
    const w = Math.max(280, el.clientWidth || 500), rowH = 20, m = { t: 6, r: 64, b: 22, l: 112 }, h = m.t + m.b + rowH * rows.length;
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const ext = d3.extent(rows, (r) => r.v);
    const x = d3.scaleLinear([Math.min(0, ext[0]), Math.max(0, ext[1])], [m.l, w - m.r]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(5).tickSize(-(h - m.t - m.b)).tickFormat(""));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat((t) => f0(t)).tickSizeOuter(0));
    svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--text-3)");
    rows.forEach((r, i) => {
      const yy = m.t + i * rowH;
      const g = svg.append("g").on("mousemove", (e) => tip.show(`<div class="tt-title">${S.escapeHtml(name(r.c))}, 2023</div><div class="tt-row"><span>Beregnet støtte</span><b>${f0(r.v)} mill. €</b></div><div class="tt-row"><span>Landvind / havvind</span><b>${f0(r.on)} / ${f0(r.off)}</b></div><div class="tt-row"><span>Støttet produksjon</span><b>${f1(r.twh)} TWh</b></div><div class="tt-row"><span>Per innbygger</span><b>${r.pc == null ? "–" : f0(r.pc) + " €"}</b></div><div class="tt-row"><span>Per støttet MWh</span><b>${f1(r.v / r.twh)} €</b></div>`, e.clientX, e.clientY)).on("mouseleave", () => tip.hide());
      g.append("text").attr("x", m.l - 8).attr("y", yy + rowH / 2 + 4).attr("text-anchor", "end").attr("font-size", 11.5).attr("fill", "var(--text)").text(name(r.c));
      g.append("rect").attr("x", Math.min(x(0), x(r.v))).attr("y", yy + 3).attr("height", rowH - 6).attr("width", Math.max(1, Math.abs(x(r.v) - x(0)))).attr("rx", 2).attr("fill", r.v < 0 ? "var(--series-5)" : "var(--series-1)");
      g.append("text").attr("x", r.v < 0 ? x(0) + 4 : x(r.v) + 4).attr("y", yy + rowH / 2 + 4).attr("font-size", 11).attr("fill", "var(--text-2)").text(f0(r.v));
    });
  }
  function supShare() {
    const el = document.getElementById("supshare");
    const rows = CC.map((c) => { const r = CE[c]["2023"]; const g = ev("gen", "wind", c, 2023); if (!r || !g) return null; const s = ((r.on_gwh || 0) + (r.off_gwh || 0)) / 1000; return { c, s, g, v: Math.min(100, (100 * s) / g) }; }).filter(Boolean).sort((a, b) => b.v - a.v);
    document.getElementById("sup-sub").textContent = "Vindkraft som var med i en støtteordning i 2023 (CEER), som andel av all vindkraftproduksjon i landet (Ember). Lav andel betyr at mye bygges eller drives uten støtte, eller at anlegg har gått ut av ordningen. Spania støtter i hovedsak eldre anlegg med en betaling per installert MW, som ikke fanges opp her.";
    const w = Math.max(280, el.clientWidth || 500), rowH = 20, m = { t: 6, r: 44, b: 22, l: 112 }, h = m.t + m.b + rowH * rows.length;
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear([0, 100], [m.l, w - m.r]);
    svg.append("g").attr("class", "grid").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(5).tickSize(-(h - m.t - m.b)).tickFormat(""));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat((t) => t + " %").tickSizeOuter(0));
    rows.forEach((r, i) => {
      const yy = m.t + i * rowH;
      const g = svg.append("g").on("mousemove", (e) => tip.show(`<div class="tt-title">${S.escapeHtml(name(r.c))}, 2023</div><div class="tt-row"><span>Støttet vindkraft</span><b>${f1(r.s)} TWh</b></div><div class="tt-row"><span>All vindkraft</span><b>${f1(r.g)} TWh</b></div><div class="tt-row"><span>Andel</span><b>${f0(r.v)} %</b></div>`, e.clientX, e.clientY)).on("mouseleave", () => tip.hide());
      g.append("text").attr("x", m.l - 8).attr("y", yy + rowH / 2 + 4).attr("text-anchor", "end").attr("font-size", 11.5).attr("fill", "var(--text)").text(name(r.c));
      g.append("rect").attr("x", x(0)).attr("y", yy + 3).attr("height", rowH - 6).attr("width", x(r.v) - x(0)).attr("rx", 2).attr("fill", "var(--series-3)");
      g.append("text").attr("x", x(r.v) + 4).attr("y", yy + rowH / 2 + 4).attr("font-size", 11).attr("fill", "var(--text-2)").text(f0(r.v) + " %");
    });
  }
  function allRes() {
    const el = document.getElementById("allres");
    const rows = Object.keys(CE).filter((c) => CE[c].all2022).map((c) => ({ c, ...CE[c].all2022 })).sort((a, b) => b.per_mwh - a.per_mwh);
    document.getElementById("all-sub").textContent = "Samlet støtte til all fornybar kraft (vind, sol, bio og vann) i 2022, delt på all strømproduksjon i landet, euro per MWh. Viser hvor stor regningen er sammenlignet med kraftmarkedet. 2022 var et år med svært høye strømpriser, så mange land fikk penger tilbake.";
    const w = Math.max(300, el.clientWidth || 800), h = 300, m = { t: 16, r: 10, b: 70, l: 40 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleBand(rows.map((r) => r.c), [m.l, w - m.r]).padding(0.2), ext = d3.extent(rows, (r) => r.per_mwh), y = d3.scaleLinear([Math.min(0, ext[0]), ext[1]], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat((t) => f0(t)).tickPadding(4));
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "var(--text-3)");
    rows.forEach((r) => {
      const g = svg.append("g").on("mousemove", (e) => tip.show(`<div class="tt-title">${S.escapeHtml(name(r.c))}, 2022</div><div class="tt-row"><span>Fornybarstøtte i alt</span><b>${f0(r.meur)} mill. €</b></div><div class="tt-row"><span>Per MWh av all produksjon</span><b>${f1(r.per_mwh)} €</b></div>`, e.clientX, e.clientY)).on("mouseleave", () => tip.hide());
      g.append("rect").attr("x", x(r.c)).attr("width", x.bandwidth()).attr("y", Math.min(y(0), y(r.per_mwh))).attr("height", Math.max(1, Math.abs(y(r.per_mwh) - y(0)))).attr("rx", 2).attr("fill", r.per_mwh < 0 ? "var(--series-5)" : "var(--series-1)");
      g.append("text").attr("transform", `translate(${x(r.c) + x.bandwidth() / 2},${h - m.b + 8}) rotate(-50)`).attr("text-anchor", "end").attr("font-size", 11).attr("fill", "var(--text-2)").text(name(r.c));
    });
  }
  function schemes() {
    const cls = (t) => (/CfD|differanse|Komplement|Negative|Nullsubsidie|auksjon/i.test(t) ? "cfd" : /sertifikat|Elsertifikat/i.test(t) ? "cert" : "fit");
    const order = ["NOR", ...Object.keys(st0.schemes).filter((c) => c !== "NOR").sort((a, b) => name(a).localeCompare(name(b), "nb"))];
    document.getElementById("schemes").innerHTML = order.map((c) => {
      const s = st0.schemes[c];
      const l23 = CE[c]?.["2023"];
      const lv = l23 ? [l23.on_lvl != null ? `land ${f1(l23.on_lvl)}` : null, l23.off_lvl != null ? `hav ${f1(l23.off_lvl)}` : null].filter(Boolean).join(", ") : "";
      return `<div class="scheme ${c === "NOR" ? "no" : ""}"><h3>${S.escapeHtml(name(c))}<small>${lv ? `CEER 2023: ${lv} €/MWh` : ""}</small></h3><div class="tags">${s.type.map((t) => `<span class="tag ${cls(t)}">${S.escapeHtml(t)}</span>`).join("")}</div><p><b>Nå:</b> ${S.escapeHtml(s.now)}</p>${s.hist ? `<p><b>Tidligere:</b> ${S.escapeHtml(s.hist)}</p>` : ""}<p><b>Hvem betaler:</b> ${S.escapeHtml(s.fin)}</p>${s.tax ? `<p><b>Skatt:</b> ${S.escapeHtml(s.tax)}</p>` : ""}</div>`;
    }).join("");
    const KC = { betaling: "var(--series-3)", cfd: "var(--series-1)", ingen: "var(--series-5)" };
    document.getElementById("auctions").innerHTML = st0.auctions.map((a) => `<li><span class="d">${S.MONTHS_SHORT[+a.date.slice(5) - 1]} ${a.date.slice(0, 4)}</span><span class="k"><i style="background:${KC[a.kind]}"></i>${S.escapeHtml(name(a.c))}</span><span class="t">${S.escapeHtml(a.t)}</span></li>`).join("") + `<li><span class="d"></span><span class="k"></span><span class="t" style="color:var(--text-3);font-size:12.5px"><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--series-3);margin-right:4px"></i>utbygger betalte · <i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--series-1);margin:0 4px 0 8px"></i>statlig garanti · <i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--series-5);margin:0 4px 0 8px"></i>ingen bud</span></li>`;
  }

  // ---------------------------------------------------------------- Norge
  const NV = d.nve;
  function noTs() {
    const el = document.getElementById("nots"), s = d.ssb;
    const rows = s.years.map((y, i) => ({ y, w: s.wind[i], t: s.total[i] })).filter((r) => r.w != null && r.y >= 1995);
    const l = rows[rows.length - 1];
    const plannedGwh = d3.sum(NV, (p) => p.gwh || 0);
    document.getElementById("no-sub").textContent = `Vindkraftproduksjon i TWh per år (SSB). I ${l.y}: ${f1(l.w / 1000)} TWh, ${f1((100 * l.w) / l.t)} % av all kraftproduksjon. NVE regner med ${f1(plannedGwh / 1000)} TWh i et normalår fra parkene som er i drift.`;
    const w = Math.max(280, el.clientWidth || 500), h = 320, m = { t: 14, r: 12, b: 26, l: 36 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleBand(rows.map((r) => r.y), [m.l, w - m.r]).padding(0.15), y = d3.scaleLinear([0, d3.max(rows, (r) => r.w / 1000)], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickPadding(4));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickValues(rows.map((r) => r.y).filter((v) => v % 5 === 0)).tickSizeOuter(0));
    rows.forEach((r) => {
      const g = svg.append("g").on("mousemove", (e) => tip.show(`<div class="tt-title">${r.y}</div><div class="tt-row"><span>Vindkraft</span><b>${f1(r.w / 1000)} TWh</b></div><div class="tt-row"><span>Andel av produksjonen</span><b>${f1((100 * r.w) / r.t)} %</b></div>`, e.clientX, e.clientY)).on("mouseleave", () => tip.hide());
      g.append("rect").attr("x", x(r.y)).attr("width", x.bandwidth()).attr("y", y(r.w / 1000)).attr("height", y(0) - y(r.w / 1000)).attr("fill", r.y >= 2012 && r.y <= 2021 ? "var(--series-1)" : "var(--series-3)");
    });
    svg.append("text").attr("x", m.l + 6).attr("y", m.t + 4).attr("font-size", 11).attr("fill", "var(--text-3)").text("Blå: anlegg kunne få elsertifikater (2012–2021)");
  }
  function noMap() {
    const el = document.getElementById("nomap");
    const kom = topojson.feature(notopo, notopo.objects.kommuner).features, fyl = topojson.feature(notopo, notopo.objects.fylker).features;
    const byK = d3.group(NV.filter((p) => p.knr), (p) => p.knr);
    const tot = d3.sum(NV, (p) => p.mw || 0);
    document.getElementById("nomap-sub").textContent = `${NV.length} vindkraftverk i drift med til sammen ${S.nf0.format(tot)} MW (NVE). Sirkelen viser installert effekt, plassert i (første) vertskommune. Fargen viser når parken ble satt i drift.`;
    const w = Math.max(280, el.clientWidth || 500), h = Math.round(w * 1.1);
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const proj = d3.geoTransverseMercator().rotate([-15, 0]).fitExtent([[6, 6], [w - 6, h - 40]], { type: "FeatureCollection", features: fyl });
    const path = d3.geoPath(proj);
    svg.append("g").selectAll("path").data(kom).join("path").attr("class", "k").attr("d", path);
    svg.append("g").selectAll("path").data(fyl).join("path").attr("class", "f").attr("d", path);
    const r = d3.scaleSqrt([0, d3.max(NV, (p) => p.mw)], [0, 16]);
    const col = (y) => (y < 2012 ? "var(--neutral-mark)" : y <= 2016 ? "var(--series-3)" : y <= 2021 ? "var(--series-1)" : "var(--series-2)");
    const pts = [];
    byK.forEach((ps, k) => { const f = kom.find((x) => x.properties.id === k); if (!f) return; const [cx, cy] = path.centroid(f); ps.forEach((p, j) => pts.push({ p, cx: cx + j * 3, cy: cy + j * 3 })); });
    svg.append("g").selectAll("circle").data(pts.sort((a, b) => b.p.mw - a.p.mw)).join("circle").attr("cx", (q) => q.cx).attr("cy", (q) => q.cy).attr("r", (q) => Math.max(2, r(q.p.mw)))
      .attr("fill", (q) => col(+q.p.start.slice(0, 4))).attr("opacity", 0.8).attr("stroke", "var(--surface)")
      .on("mousemove", (e, q) => tip.show(plantTip(q.p), e.clientX, e.clientY)).on("mouseleave", () => tip.hide());
    const lg = svg.append("g").attr("transform", `translate(8,${h - 26})`);
    [["Før 2012", 2000], ["2012–2016", 2014], ["2017–2021", 2019], ["2022–", 2023]].forEach(([t, y], k) => {
      lg.append("circle").attr("cx", k * 92 + 6).attr("cy", 6).attr("r", 5).attr("fill", col(y));
      lg.append("text").attr("x", k * 92 + 15).attr("y", 10).attr("font-size", 11.5).attr("fill", "var(--text-2)").text(t);
    });
  }
  const plantTip = (p) => `<div class="tt-title">${S.escapeHtml(p.navn)}</div><div class="tt-row"><span>Kommune</span><b>${S.escapeHtml(p.kommune)} (${S.escapeHtml(p.fylke)})</b></div><div class="tt-row"><span>Installert effekt</span><b>${f1(p.mw)} MW</b></div><div class="tt-row"><span>Normalårsproduksjon</span><b>${f0(p.gwh)} GWh</b></div><div class="tt-row"><span>Turbiner</span><b>${p.turbiner ?? "–"} · ${p.kw ? f1(p.kw / 1000) + " MW" : "–"}</b></div><div class="tt-row"><span>I drift fra</span><b>${p.start.slice(0, 4)}</b></div><div class="tt-row"><span>Eier</span><b>${S.escapeHtml(p.eier || "–")}</b></div><div class="tt-row"><span>Prisområde</span><b>NO${p.omr}</b></div>`;
  function turbines() {
    const el = document.getElementById("turb");
    const pts = NV.filter((p) => p.kw && p.start).map((p) => ({ p, x: +p.start.slice(0, 4) + (+p.start.slice(5, 7) - 1) / 12, y: p.kw / 1000 }));
    const early = d3.mean(pts.filter((q) => q.x < 2012), (q) => q.y), late = d3.mean(pts.filter((q) => q.x >= 2019), (q) => q.y);
    document.getElementById("turb-sub").textContent = `Snittstørrelsen på turbinene i hver park etter året parken ble satt i drift. Parker før 2012 har i snitt ${f1(early)} MW per turbin, parker fra 2019 ${f1(late)} MW. Sirkelen viser parkens samlede effekt.`;
    const w = Math.max(280, el.clientWidth || 500), h = 320, m = { t: 12, r: 14, b: 28, l: 40 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear(d3.extent(pts, (q) => q.x), [m.l, w - m.r]).nice(), y = d3.scaleLinear([0, d3.max(pts, (q) => q.y)], [h - m.b, m.t]).nice(), r = d3.scaleSqrt([0, d3.max(NV, (p) => p.mw)], [2, 14]);
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat((t) => t + " MW").tickPadding(4));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(8).tickFormat(d3.format("d")).tickSizeOuter(0));
    svg.append("g").selectAll("circle").data(pts).join("circle").attr("cx", (q) => x(q.x)).attr("cy", (q) => y(q.y)).attr("r", (q) => r(q.p.mw)).attr("fill", "var(--series-1)").attr("opacity", 0.6).attr("stroke", "var(--surface)")
      .on("mousemove", (e, q) => tip.show(plantTip(q.p), e.clientX, e.clientY)).on("mouseleave", () => tip.hide());
  }
  function plants() {
    document.getElementById("pl-sub").textContent = "Klikk på en kolonne for å sortere. Normalårsproduksjon er NVEs anslag for et år med normal vind.";
    S.sortableTable(document.getElementById("plants"), [
      { key: "navn", label: "Vindkraftverk", text: true },
      { key: "kommune", label: "Kommune", text: true },
      { key: "mw", label: "MW", fmt: (v) => f1(v) },
      { key: "gwh", label: "GWh/år", fmt: (v) => f0(v) },
      { key: "cf", label: "Kap.faktor", fmt: (v) => (v == null ? "–" : f0(v) + " %") },
      { key: "turbiner", label: "Turbiner", fmt: (v) => v ?? "–" },
      { key: "aar", label: "År", fmt: (v) => v },
      { key: "eier", label: "Eier", text: true },
    ], NV.map((p) => ({ ...p, id: p.navn, aar: +p.start.slice(0, 4), cf: p.mw && p.gwh ? (100 * p.gwh) / (p.mw * 8.76) : null })), { sortKey: "mw", dir: -1 });
  }

  // ---------------------------------------------------------------- tabell
  function table() {
    const y = LASTY, oy = OY[OY.length - 1];
    const rows = COUNTRIES.map((c) => {
      const l23 = CE[c]?.["2023"];
      return { id: c, land: name(c), cap: M.cap.f(c, y), gen: M.gen.f(c, y), share: M.gen_share.f(c, y), dem: M.dem_share.f(c, y), cshare: M.cap_share.f(c, y), pc: M.cap_pc.f(c, y), gpc: M.gen_pc.f(c, y), cf: cfOf(c, y), off: oo("off", c, oy) != null ? oo("off", c, oy) / 1000 : null, on_lvl: l23?.on_lvl ?? null, ordning: st0.schemes[c]?.type.join(", ") || "" };
    }).filter((r) => r.cap != null);
    document.getElementById("tbl-sub").textContent = `${rows.length} land, ${y}. Havvind er fra Eurostat (${oy}), støtte fra CEER (2023).`;
    const fv = (v) => (v == null ? "–" : f1(v));
    S.sortableTable(document.getElementById("table"), [
      { key: "land", label: "Land", text: true },
      { key: "cap", label: "Kapasitet (GW)", fmt: fv },
      { key: "off", label: `Herav havvind (GW)`, fmt: fv },
      { key: "gen", label: "Produksjon (TWh)", fmt: fv },
      { key: "share", label: "Andel av produksjonen", fmt: (v) => fv(v) + (v == null ? "" : " %") },
      { key: "dem", label: "Andel av forbruket", fmt: (v) => fv(v) + (v == null ? "" : " %") },
      { key: "cshare", label: "Andel av kapasiteten", fmt: (v) => fv(v) + (v == null ? "" : " %") },
      { key: "pc", label: "W per innb.", fmt: (v) => f0(v) },
      { key: "cf", label: "Kap.faktor", fmt: (v) => fv(v) + (v == null ? "" : " %") },
      { key: "on_lvl", label: "Støtte landvind (€/MWh)", fmt: fv },
      { key: "ordning", label: "Støtteordning", text: true },
    ], rows, { sortKey: "cap", dir: -1 });
    document.getElementById("csv").onclick = () => S.downloadCsv("vindkraft-europa.csv", [["Land", "ISO3", "År", "Kapasitet GW", "Havvind GW", "Produksjon TWh", "Andel av produksjon %", "Andel av forbruk %", "Andel av kapasitet %", "W per innbygger", "kWh per innbygger", "Kapasitetsfaktor %", "Støtte landvind 2023 €/MWh", "Støtteordning"],
      ...rows.map((r) => [r.land, r.id, y, r.cap, r.off, r.gen, r.share?.toFixed(2), r.dem?.toFixed(2), r.cshare?.toFixed(2), r.pc?.toFixed(0), r.gpc?.toFixed(0), r.cf?.toFixed(1), r.on_lvl, r.ordning])]);
  }

  function top() { wmap(); rank(); series(); }
  function renderAll() { kpis(); top(); scatter(); cfBars(); onoff(); euGrowth(); monthly(); levels(); costChart(); supShare(); allRes(); noTs(); noMap(); turbines(); }
  fillYears();
  renderAll();
  schemes(); plants(); table();
  document.getElementById("updated").textContent = `Data hentet ${d.fetched}`;
  S.onThemeChange(() => { wmap(); rank(); });
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(renderAll, 200); });
})();
