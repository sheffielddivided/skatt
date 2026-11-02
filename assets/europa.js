/* Studie 12 – Norge i Europa */
(async function () {
  const S = window.Skatt;
  const tip = S.tooltip();
  const [d, topo] = await Promise.all([
    fetch("data/europa.json").then((r) => r.json()),
    fetch("data/europa.topo.json").then((r) => r.json()),
  ]);
  const C = d.countries, EU = d.eu, NORD = new Set(d.nordic);
  const IND = Object.fromEntries(d.indicators.map((i) => [i.key, i]));
  const GROUPS = [...new Set(d.indicators.map((i) => i.group))];
  const name = (g) => (g === EU ? "EU-snitt" : C[g] || g);
  const fmt = (i, v) => (v == null ? "–" : (i.dec === 0 ? S.nf0 : i.dec === 2 ? { format: (x) => x.toFixed(2).replace(".", ",") } : S.nf1).format(v) + (i.unit.startsWith("%") ? " %" : i.unit === "PPS" ? " PPS" : ""));
  const unitTxt = (i) => (i.unit.startsWith("%") || i.unit === "PPS" ? i.unit : i.unit);
  const lastYear = (i, g = "NO") => { const ys = Object.keys(i.values[g] || {}); return ys.length ? ys[ys.length - 1] : null; };
  const valAt = (i, g, y) => i.values[g]?.[y] ?? null;
  // landets nyeste verdi frem til og med år y
  const latestUpTo = (i, g, y) => { const s = i.values[g]; if (!s) return null; const ys = Object.keys(s).filter((t) => t <= y); return ys.length ? { y: ys[ys.length - 1], v: s[ys[ys.length - 1]] } : null; };

  // ---------------------------------------------------------------- profil
  const st = { ind: "skatt", yr: null, extra: "DE", sx: "skatt", sy: "utgifter" };
  (function readHash() { const h = new URLSearchParams(location.hash.slice(1)); if (IND[h.get("i")]) st.ind = h.get("i"); })();
  function score() {
    const el = document.getElementById("score");
    el.innerHTML = GROUPS.map((g) => `<h3>${g}</h3>` + d.indicators.filter((i) => i.group === g).map((i) => {
      const y = lastYear(i);
      if (!y) return "";
      const pts = Object.keys(C).map((c) => ({ c, v: latestUpTo(i, c, y)?.v })).filter((p) => p.v != null);
      const lo = d3.min(pts, (p) => p.v), hi = d3.max(pts, (p) => p.v), pos = (v) => (100 * (v - lo)) / (hi - lo || 1);
      const no = valAt(i, "NO", y), eu = valAt(i, EU, y) ?? latestUpTo(i, EU, y)?.v;
      const rank = pts.filter((p) => p.v > no).length + 1;
      return `<div class="srow ${i.key === st.ind ? "on" : ""}" data-k="${i.key}" title="${S.escapeHtml(i.desc)}">
        <span class="n">${S.escapeHtml(i.name)} <small>${S.escapeHtml(i.unit)} · ${y}</small></span>
        <span class="v">${fmt(i, no)}<small>nr. ${rank} av ${pts.length}${eu != null ? ` · EU ${fmt(i, eu)}` : ""}</small></span>
        <div class="strip"><div class="track"></div>${eu != null ? `<div class="eu" style="left:${pos(eu)}%"></div>` : ""}${pts.filter((p) => p.c !== "NO").map((p) => `<div class="d ${NORD.has(p.c) ? "nord" : ""}" style="left:${pos(p.v)}%" title="${name(p.c)}: ${fmt(i, p.v)}"></div>`).join("")}<div class="d no" style="left:${pos(no)}%" title="Norge: ${fmt(i, no)}"></div></div>
      </div>`;
    }).join("")).join("");
    el.querySelectorAll(".srow").forEach((r) => (r.onclick = () => { st.ind = r.dataset.k; st.yr = null; renderSel(); score(); document.getElementById("sel-title").scrollIntoView({ behavior: "smooth", block: "start" }); }));
  }

  // ---------------------------------------------------------------- kontroller
  const opts = GROUPS.map((g) => `<optgroup label="${g}">${d.indicators.filter((i) => i.group === g).map((i) => `<option value="${i.key}">${S.escapeHtml(i.name)}</option>`).join("")}</optgroup>`).join("");
  const indSel = document.getElementById("ind"), yrSel = document.getElementById("yr"), exSel = document.getElementById("extra");
  indSel.innerHTML = opts;
  exSel.innerHTML = Object.entries(C).filter(([c]) => !NORD.has(c)).sort((a, b) => a[1].localeCompare(b[1], "nb")).map(([c, n]) => `<option value="${c}">${n}</option>`).join("");
  exSel.value = st.extra;
  indSel.onchange = () => { st.ind = indSel.value; st.yr = null; renderSel(); score(); };
  yrSel.onchange = () => { st.yr = yrSel.value; renderSel(); };
  exSel.onchange = () => { st.extra = exSel.value; series(); };

  const colorOf = (c) => (c === "NO" ? "var(--series-2)" : NORD.has(c) ? "var(--series-1)" : "var(--neutral-mark)");

  function bars(i, y) {
    const el = document.getElementById("bars");
    const rows = Object.keys(C).map((c) => ({ c, v: valAt(i, c, y) })).filter((r) => r.v != null).sort((a, b) => b.v - a.v);
    const eu = valAt(i, EU, y);
    document.getElementById("b-title").textContent = `${i.name}, ${y}`;
    document.getElementById("b-sub").textContent = `${unitTxt(i)}. Norge er nr. ${rows.findIndex((r) => r.c === "NO") + 1 || "–"} av ${rows.length}.`;
    const rowH = 19, m = { t: 6, r: 56, b: 6, l: 92 };
    const w = Math.max(320, el.clientWidth || 600), h = m.t + m.b + rowH * rows.length;
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const lo = Math.min(0, d3.min(rows, (r) => r.v)), hi = Math.max(0, d3.max(rows, (r) => r.v));
    const x = d3.scaleLinear([lo, hi], [m.l, w - m.r]).nice();
    rows.forEach((r, k) => {
      const yy = m.t + k * rowH;
      const g = svg.append("g").on("mousemove", (e) => tip.show(`<div class="tt-title">${name(r.c)}</div><div class="tt-row"><span>${S.escapeHtml(i.name)}</span><b>${fmt(i, r.v)}</b></div>${eu != null ? `<div class="tt-row"><span>EU-snitt</span><b>${fmt(i, eu)}</b></div>` : ""}`, e.clientX, e.clientY)).on("mouseleave", () => tip.hide());
      g.append("rect").attr("x", 0).attr("width", w).attr("y", yy).attr("height", rowH).attr("fill", "transparent");
      g.append("text").attr("class", "name" + (r.c === "NO" ? " no" : "")).attr("x", m.l - 6).attr("y", yy + rowH / 2 + 4).attr("text-anchor", "end").text(name(r.c));
      const x0 = x(Math.min(0, r.v)), x1 = x(Math.max(0, r.v));
      g.append("rect").attr("x", x0).attr("width", Math.max(1, x1 - x0)).attr("y", yy + 3).attr("height", rowH - 6).attr("rx", 2).attr("fill", colorOf(r.c));
      g.append("text").attr("class", "val").attr("x", r.v >= 0 ? x1 + 4 : x0 - 4).attr("text-anchor", r.v >= 0 ? "start" : "end").attr("y", yy + rowH / 2 + 4).text(fmt(i, r.v).replace(" %", "").replace(" PPS", ""));
    });
    if (lo < 0) svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", h).attr("stroke", "var(--border-strong)");
    if (eu != null) {
      svg.append("line").attr("x1", x(eu)).attr("x2", x(eu)).attr("y1", 0).attr("y2", h).attr("stroke", "var(--text)").attr("stroke-dasharray", "4 3").attr("opacity", 0.7);
      svg.append("text").attr("x", x(eu) + 4).attr("y", h - 6).attr("fill", "var(--text-2)").attr("font-size", 11).text("EU");
    }
  }

  // ---------------------------------------------------------------- kart
  const land = topojson.feature(topo, topo.objects.land).features;
  function emap(i, y) {
    const el = document.getElementById("map");
    document.getElementById("m-title").textContent = `${i.name} i Europa, ${y}`;
    const w = Math.max(320, el.clientWidth || 600), h = Math.round(w * 0.95);
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const focus = land.filter((f) => C[f.properties.id] && !["PT", "CY", "MT", "IS"].includes(f.properties.id) || f.properties.id === "PT");
    const proj = d3.geoConicConformal().rotate([-12, 0]).parallels([40, 68]).fitExtent([[6, 6], [w - 6, h - 60]], { type: "FeatureCollection", features: focus });
    const path = d3.geoPath(proj);
    const vals = Object.keys(C).map((c) => valAt(i, c, y)).filter((v) => v != null);
    const dark = S.isDark();
    const ramp = dark ? ["#0d366b", "#104281", "#1c5cab", "#2a78d6", "#5598e7", "#86b6ef", "#b7d3f6"] : ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
    const sc = d3.scaleQuantile(vals, ramp);
    svg.append("g").selectAll("path").data(land).join("path").attr("d", path)
      .attr("class", (f) => (C[f.properties.id] ? (valAt(i, f.properties.id, y) == null ? "c na" : "c") : "o"))
      .attr("fill", (f) => { const v = C[f.properties.id] ? valAt(i, f.properties.id, y) : null; return v == null ? null : sc(v); })
      .on("mousemove", (e, f) => { const c = f.properties.id; if (!C[c]) return; tip.show(`<div class="tt-title">${name(c)}</div><div class="tt-row"><span>${S.escapeHtml(i.name)}</span><b>${fmt(i, valAt(i, c, y))}</b></div>`, e.clientX, e.clientY); })
      .on("mouseleave", () => tip.hide());
    const nof = land.find((f) => f.properties.id === "NO");
    if (nof) svg.append("path").attr("class", "no").attr("d", path(nof));
    // forklaring
    const q = sc.quantiles(), ext = d3.extent(vals), t = [ext[0], ...q, ext[1]];
    const lg = svg.append("g").attr("class", "lg").attr("transform", `translate(8,${h - 44})`);
    const bw = Math.min(70, (w - 16) / ramp.length);
    ramp.forEach((c, k) => lg.append("rect").attr("x", k * bw).attr("y", 0).attr("width", bw - 2).attr("height", 10).attr("rx", 2).attr("fill", c));
    lg.append("text").attr("x", 0).attr("y", 26).text(fmt(i, ext[0]).replace(" PPS", ""));
    lg.append("text").attr("x", (ramp.length * bw) / 2).attr("y", 26).attr("text-anchor", "middle").text(fmt(i, d3.median(vals)).replace(" PPS", "") + " (median)");
    lg.append("text").attr("x", ramp.length * bw - 2).attr("y", 26).attr("text-anchor", "end").text(fmt(i, ext[1]).replace(" PPS", ""));
  }

  // ---------------------------------------------------------------- tidsserie
  function series() {
    const i = IND[st.ind], el = document.getElementById("ts");
    document.getElementById("t-title").textContent = `${i.name} over tid`;
    const ser = [
      { c: "NO", color: "var(--series-2)", w: 3 }, { c: "SE", color: "var(--series-1)" }, { c: "DK", color: "var(--series-3)" },
      { c: "FI", color: "var(--series-4)" }, { c: st.extra, color: "var(--series-5)" }, { c: EU, color: "var(--text-2)", dash: true },
    ].filter((s) => i.values[s.c]);
    document.getElementById("t-legend").innerHTML = ser.map((s) => `<span class="item"><span class="sw ${s.dash ? "dash" : "line"}" style="background:${s.color};color:${s.color}"></span>${name(s.c)}</span>`).join("");
    const years = [...new Set(ser.flatMap((s) => Object.keys(i.values[s.c])))].map(Number).sort();
    const w = Math.max(360, el.clientWidth || 900), h = 300, m = { t: 14, r: 90, b: 28, l: 56 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear(d3.extent(years), [m.l, w - m.r]);
    const all = ser.flatMap((s) => Object.values(i.values[s.c]));
    const mn = d3.min(all), mx = d3.max(all);
    const lo = mn < 0 || mn / mx < 0.35 ? Math.min(0, mn) : mn - (mx - mn) * 0.15;
    const y = d3.scaleLinear([lo, mx], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => S.nf0.format(v)).tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(Math.min(10, w / 80)).tickFormat(d3.format("d")).tickSizeOuter(0));
    const labs = [];
    ser.slice().reverse().forEach((s) => {
      const pts = Object.entries(i.values[s.c]).map(([yy, v]) => [+yy, v]);
      svg.append("path").datum(pts).attr("fill", "none").attr("stroke", s.color).attr("stroke-width", s.w || 2).attr("stroke-dasharray", s.dash ? "5 4" : null).attr("d", d3.line().x((p) => x(p[0])).y((p) => y(p[1])));
      const lp = pts[pts.length - 1];
      labs.push({ t: name(s.c), x: x(lp[0]) + 6, y: y(lp[1]) + 4, no: s.c === "NO" });
    });
    labs.sort((a, b) => a.y - b.y);
    for (let k = 1; k < labs.length; k++) if (labs[k].y - labs[k - 1].y < 13) labs[k].y = labs[k - 1].y + 13;
    labs.forEach((l) => svg.append("text").attr("x", l.x).attr("y", l.y).attr("fill", "var(--text-2)").attr("font-size", 11.5).attr("font-weight", l.no ? 700 : 500).text(l.t));
    const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--border-strong)").style("display", "none");
    svg.append("rect").attr("x", m.l).attr("width", w - m.l - m.r).attr("height", h - m.b).attr("fill", "transparent")
      .on("mousemove", (e) => { const yy = String(Math.round(x.invert(d3.pointer(e)[0]))); cross.style("display", null).attr("x1", x(+yy)).attr("x2", x(+yy));
        tip.show(`<div class="tt-title">${yy}</div>${ser.map((s) => `<div class="tt-row"><span><span class="key" style="background:${s.color}"></span>${name(s.c)}</span><b>${fmt(i, i.values[s.c][yy])}</b></div>`).join("")}`, e.clientX, e.clientY); })
      .on("mouseleave", () => { tip.hide(); cross.style("display", "none"); });
  }

  // ---------------------------------------------------------------- tabell
  function table(i, y) {
    const y0 = String(+y - 10);
    const rows = Object.keys(C).map((c) => ({ id: c, name: name(c), v: valAt(i, c, y), v0: latestUpTo(i, c, y0)?.v ?? null })).map((r) => ({ ...r, chg: r.v != null && r.v0 != null ? r.v - r.v0 : null }));
    const ranked = rows.filter((r) => r.v != null).sort((a, b) => b.v - a.v);
    rows.forEach((r) => (r.rank = r.v == null ? null : ranked.indexOf(r) + 1));
    document.getElementById("tbl-sub").textContent = `${i.name} (${i.unit}), ${y}, og endring siden ${y0}. ${i.source}.`;
    S.sortableTable(document.getElementById("table"), [
      { key: "name", label: "Land", text: true }, { key: "v", label: String(y), fmt: (v) => fmt(i, v) }, { key: "rank", label: "Rang", fmt: (v) => (v ?? "–") },
      { key: "v0", label: y0, fmt: (v) => fmt(i, v) }, { key: "chg", label: "Endring", fmt: (v) => (v == null ? "–" : (v > 0 ? "+" : "−") + fmt(i, Math.abs(v))) },
    ], rows, { sortKey: "v", dir: -1 });
  }
  document.getElementById("csv").onclick = () => {
    const out = [["Indikator", "Enhet", "Kilde", "Land", "År", "Verdi"]];
    for (const i of d.indicators) for (const [g, s] of Object.entries(i.values)) for (const [y, v] of Object.entries(s)) out.push([i.name, i.unit, i.source, name(g), y, String(v).replace(".", ",")]);
    S.downloadCsv("norge-i-europa.csv", out);
  };

  // ---------------------------------------------------------------- spredningsplott
  const PRESETS = [
    { l: "Skattenivå og offentlige utgifter", x: "skatt", y: "utgifter" },
    { l: "Sysselsetting og uføreutgifter", x: "syss", y: "ufore" },
    { l: "Inntekt og boligeie", x: "inntekt", y: "eie" },
    { l: "Ulikhet og skattenivå", x: "skatt", y: "gini" },
    { l: "Sykefravær og sysselsetting", x: "syss", y: "syk" },
    { l: "Innvandring og sysselsetting", x: "utlfodt", y: "syss" },
  ];
  const sx = document.getElementById("sx"), sy = document.getElementById("sy");
  sx.innerHTML = opts; sy.innerHTML = opts;
  sx.onchange = () => { st.sx = sx.value; scatter(); };
  sy.onchange = () => { st.sy = sy.value; scatter(); };
  const pre = document.getElementById("presets");
  pre.innerHTML = PRESETS.map((p, k) => `<button data-k="${k}">${p.l}</button>`).join("");
  pre.querySelectorAll("button").forEach((b) => (b.onclick = () => { const p = PRESETS[+b.dataset.k]; st.sx = p.x; st.sy = p.y; scatter(); }));
  function scatter() {
    sx.value = st.sx; sy.value = st.sy;
    pre.querySelectorAll("button").forEach((b) => { const p = PRESETS[+b.dataset.k]; b.setAttribute("aria-pressed", String(p.x === st.sx && p.y === st.sy)); });
    const X = IND[st.sx], Y = IND[st.sy], el = document.getElementById("sc");
    const pts = Object.keys(C).map((c) => {
      const yx = X.values[c] ? Object.keys(X.values[c]) : [], yy = Y.values[c] ? Object.keys(Y.values[c]) : [];
      const common = yx.filter((t) => yy.includes(t));
      if (!common.length) return null;
      const t = common[common.length - 1];
      return { c, x: X.values[c][t], y: Y.values[c][t], t };
    }).filter(Boolean);
    const w = Math.max(360, el.clientWidth || 900), h = Math.min(520, Math.max(340, w * 0.5)), m = { t: 18, r: 24, b: 44, l: 60 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    if (pts.length < 3) { svg.append("text").attr("x", 20).attr("y", 30).attr("fill", "var(--text-3)").text("For få land med begge indikatorene."); return; }
    const pad = (e) => [e[0] - (e[1] - e[0]) * 0.06, e[1] + (e[1] - e[0]) * 0.06];
    const x = d3.scaleLinear(pad(d3.extent(pts, (p) => p.x)), [m.l, w - m.r]).nice();
    const y = d3.scaleLinear(pad(d3.extent(pts, (p) => p.y)), [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat((v) => S.nf0.format(v)).tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(7).tickFormat((v) => S.nf0.format(v)).tickSizeOuter(0));
    svg.append("text").attr("x", w - m.r).attr("y", h - 8).attr("text-anchor", "end").attr("fill", "var(--text-2)").attr("font-size", 12.5).attr("font-weight", 600).text(`${X.name} (${X.unit})`);
    svg.append("text").attr("x", m.l + 4).attr("y", m.t + 2).attr("fill", "var(--text-2)").attr("font-size", 12.5).attr("font-weight", 600).text(`${Y.name} (${Y.unit})`);
    const g = svg.append("g");
    pts.sort((a, b) => (a.c === "NO") - (b.c === "NO")).forEach((p) => {
      g.append("circle").attr("class", "dot").attr("cx", x(p.x)).attr("cy", y(p.y)).attr("r", p.c === "NO" ? 8 : NORD.has(p.c) ? 6 : 5).attr("fill", colorOf(p.c)).attr("fill-opacity", p.c === "NO" || NORD.has(p.c) ? 1 : 0.8)
        .on("mousemove", (e) => tip.show(`<div class="tt-title">${name(p.c)} · ${p.t}</div><div class="tt-row"><span>${S.escapeHtml(X.name)}</span><b>${fmt(X, p.x)}</b></div><div class="tt-row"><span>${S.escapeHtml(Y.name)}</span><b>${fmt(Y, p.y)}</b></div>`, e.clientX, e.clientY)).on("mouseleave", () => tip.hide());
      g.append("text").attr("class", "lbl" + (p.c === "NO" ? " no" : "")).attr("x", x(p.x) + (p.c === "NO" ? 11 : 8)).attr("y", y(p.y) + 4).text(name(p.c));
    });
  }

  // ---------------------------------------------------------------- render
  function renderSel() {
    const i = IND[st.ind];
    indSel.value = st.ind;
    const years = [...new Set(Object.keys(C).flatMap((c) => Object.keys(i.values[c] || {})))].sort();
    if (!st.yr || !years.includes(st.yr)) st.yr = lastYear(i) || years[years.length - 1];
    yrSel.innerHTML = years.slice().reverse().map((y) => `<option value="${y}">${y}</option>`).join("");
    yrSel.value = st.yr;
    document.getElementById("sel-title").textContent = i.name;
    document.getElementById("sel-desc").textContent = `${i.desc} Kilde: ${i.source}.`;
    bars(i, st.yr); emap(i, st.yr); series(); table(i, st.yr);
    history.replaceState(null, "", "#i=" + st.ind);
  }
  score(); renderSel(); scatter();
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { renderSel(); scatter(); }, 200); });
  S.onThemeChange(() => renderSel());
  document.getElementById("updated").textContent = d.updated ? "Data oppdatert av Eurostat " + new Date(d.updated).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" }) : "";
})();
