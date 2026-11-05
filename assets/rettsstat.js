/* Studie 15 – Rettsstaten i verden (WJP Rule of Law Index) */
(async function () {
  const S = window.Skatt;
  const tip = S.tooltip();
  const [d, topo] = await Promise.all([
    fetch("data/rettsstat.json").then((r) => r.json()),
    fetch("data/verden.topo.json").then((r) => r.json()),
  ]);
  const C = d.countries, YEARS = d.years, NY = YEARS.length, LAST = NY - 1;
  const NORD = new Set(["DNK", "SWE", "FIN", "ISL"]);
  const IND = Object.fromEntries(d.indicators.map((i) => [i.key, i]));
  const land = topojson.feature(topo, topo.objects.land).features;

  // Norske landnavn via Intl, med ISO2 fra kartet
  const ISO2 = { XKX: "XK" };
  land.forEach((f) => { ISO2[f.properties.id] = { EL: "GR", UK: "GB" }[f.properties.iso2] || f.properties.iso2; });
  let dn = null;
  try { dn = new Intl.DisplayNames(["nb"], { type: "region" }); } catch (e) { /* eldre nettleser */ }
  const NAME = {};
  Object.entries(C).forEach(([c, v]) => { let n = null; try { n = dn && ISO2[c] ? dn.of(ISO2[c]) : null; } catch (e) { /* */ } NAME[c] = n && n !== ISO2[c] ? n : v.en; });
  const name = (c) => NAME[c] || c;
  const yLab = (k) => YEARS[k];
  const yearNum = (k) => (YEARS[k].includes("-") ? 2000 + +YEARS[k].split("-")[1] : +YEARS[k]);
  const val = (k, c, yi) => d.values[k]?.[c]?.[yi] ?? null;
  const f3 = (v) => (v == null ? "–" : v.toFixed(2).replace(".", ","));
  const fd = (v) => (v == null ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(3).replace(".", ","));
  const ranked = (k, yi, filter) => Object.keys(C).filter((c) => (!filter || filter(c)) && val(k, c, yi) != null).sort((a, b) => val(k, b, yi) - val(k, a, yi));
  const rankOf = (k, c, yi) => { const r = ranked(k, yi); return { r: r.indexOf(c) + 1, n: r.length }; };
  const colorOf = (c) => (c === "NOR" ? "var(--series-2)" : NORD.has(c) ? "var(--series-1)" : "var(--neutral-mark)");

  const st = { ind: "overall", yi: LAST, reg: "", from: Math.max(0, YEARS.indexOf("2019")), vs: "USA", chips: ["DNK", "SWE", "USA", "HUN", "POL"] };
  (function readHash() { const h = new URLSearchParams(location.hash.slice(1)); if (IND[h.get("i")]) st.ind = h.get("i"); })();

  // ---------------------------------------------------------------- KPI
  function kpis() {
    const k = "overall", no = val(k, "NOR", LAST), { r, n } = rankOf(k, "NOR", LAST);
    const top = ranked(k, LAST)[0];
    const fs = d.indicators.filter((i) => i.level === "factor").map((i) => ({ i, v: val(i.key, "NOR", LAST) })).sort((a, b) => b.v - a.v);
    const both = Object.keys(C).filter((c) => val(k, c, LAST) != null && val(k, c, LAST - 1) != null);
    const down = both.filter((c) => val(k, c, LAST) < val(k, c, LAST - 1)).length;
    const med = d3.median(Object.keys(C).map((c) => val(k, c, LAST)).filter((v) => v != null));
    const cards = [
      { l: `Norges plass ${yLab(LAST)}`, v: `${r}. av ${n}`, s: r === 1 ? "Beste land i indeksen" : `Bak ${ranked(k, LAST).slice(0, r - 1).map(name).join(", ")}` },
      { l: "Norges poengsum", v: f3(no), s: `Skala 0–1 · ${fd(no - val(k, "NOR", 0))} siden ${yLab(0)}` },
      { l: "Sterkest og svakest", v: S.escapeHtml(fs[0].i.nb), s: `${f3(fs[0].v)} · svakest: ${S.escapeHtml(fs[fs.length - 1].i.nb.toLowerCase())} (${f3(fs[fs.length - 1].v)})` },
      { l: `Land med tilbakegang i ${yLab(LAST)}`, v: `${down} av ${both.length}`, s: `Verdensmedian ${f3(med)} · best: ${name(top)}` },
    ];
    document.getElementById("kpis").innerHTML = cards.map((c) => `<div class="card kpi"><div class="l">${c.l}</div><div class="v">${c.v}</div><div class="s">${c.s}</div></div>`).join("");
  }

  // ---------------------------------------------------------------- profil
  const openF = new Set();
  const chev = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
  function srow(i, sub) {
    const pts = Object.keys(C).map((c) => ({ c, v: val(i.key, c, LAST) })).filter((p) => p.v != null);
    const no = val(i.key, "NOR", LAST), med = d3.median(pts, (p) => p.v);
    const { r, n } = rankOf(i.key, "NOR", LAST);
    const pos = (v) => (v * 100).toFixed(2);
    const strip = `<div class="strip"><div class="track"></div><div class="md" style="left:${pos(med)}%" title="Median ${f3(med)}"></div>${pts.filter((p) => p.c !== "NOR").map((p) => `<div class="d ${NORD.has(p.c) ? "nord" : ""}" style="left:${pos(p.v)}%" title="${name(p.c)}: ${f3(p.v)}"></div>`).join("")}${no != null ? `<div class="d no" style="left:${pos(no)}%" title="Norge: ${f3(no)}"></div>` : ""}</div>`;
    const v = `<span class="v">${f3(no)}<small>nr. ${r} av ${n}</small></span>`;
    if (sub) return `<div class="srow sub ${i.key === st.ind ? "on" : ""}" data-k="${i.key}"><span class="n">${i.key} ${S.escapeHtml(i.nb)}</span>${strip}${v}</div>`;
    const tg = i.level === "factor" ? `<button class="tg" aria-label="Vis underfaktorer" aria-expanded="${openF.has(i.factor)}">${chev}</button>` : "<span></span>";
    return `<div class="srow top ${i.key === st.ind ? "on" : ""} ${openF.has(i.factor) ? "open" : ""}" data-k="${i.key}">${tg}<span class="n">${S.escapeHtml(i.nb)}</span>${strip}${v}</div>`;
  }
  function score() {
    const el = document.getElementById("score");
    el.innerHTML = d.indicators.filter((i) => i.level !== "sub").map((i) => srow(i) + (i.level === "factor"
      ? `<div class="subs" ${openF.has(i.factor) ? "" : "hidden"}>${d.indicators.filter((s) => s.level === "sub" && s.factor === i.factor).map((s) => srow(s, true)).join("")}</div>` : "")).join("");
    el.querySelectorAll(".srow").forEach((r) => (r.onclick = (e) => {
      const i = IND[r.dataset.k];
      if (e.target.closest(".tg")) { openF.has(i.factor) ? openF.delete(i.factor) : openF.add(i.factor); score(); return; }
      st.ind = i.key; indSel.value = i.key; renderSel(); score();
      document.getElementById("sel-title").scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  }

  // ---------------------------------------------------------------- kontroller
  const indSel = document.getElementById("ind"), yrSel = document.getElementById("yr"), regSel = document.getElementById("reg");
  const fac = d.indicators.filter((i) => i.level === "factor");
  indSel.innerHTML = `<optgroup label="Samlet"><option value="overall">Samlet rettsstatsindeks</option></optgroup>`
    + `<optgroup label="Faktorer">${fac.map((i) => `<option value="${i.key}">${i.factor}. ${S.escapeHtml(i.nb)}</option>`).join("")}</optgroup>`
    + fac.map((f) => `<optgroup label="${f.factor}. ${S.escapeHtml(f.nb)}">${d.indicators.filter((s) => s.level === "sub" && s.factor === f.factor).map((s) => `<option value="${s.key}">${s.key} ${S.escapeHtml(s.nb)}</option>`).join("")}</optgroup>`).join("");
  indSel.value = st.ind;
  yrSel.innerHTML = YEARS.map((y, k) => `<option value="${k}">${y}</option>`).reverse().join("");
  yrSel.value = st.yi;
  [...new Set(Object.values(C).map((c) => c.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, "nb")).forEach((r) => regSel.insertAdjacentHTML("beforeend", `<option>${S.escapeHtml(r)}</option>`));
  const fromSel = document.getElementById("from");
  fromSel.innerHTML = YEARS.slice(0, -1).map((y, k) => `<option value="${k}">${y}</option>`).join("");
  fromSel.value = st.from;
  const vsSel = document.getElementById("vs");
  const sortedC = Object.keys(C).filter((c) => c !== "NOR").sort((a, b) => name(a).localeCompare(name(b), "nb"));
  vsSel.innerHTML = sortedC.map((c) => `<option value="${c}">${S.escapeHtml(name(c))}</option>`).join("");
  vsSel.value = st.vs;
  document.getElementById("clist").innerHTML = sortedC.map((c) => `<option value="${S.escapeHtml(name(c))}">`).join("");
  indSel.onchange = () => { st.ind = indSel.value; renderSel(); score(); };
  yrSel.onchange = () => { st.yi = +yrSel.value; renderSel(); };
  regSel.onchange = () => { st.reg = regSel.value; renderSel(); };
  fromSel.onchange = () => { st.from = +fromSel.value; movers(); };
  vsSel.onchange = () => { st.vs = vsSel.value; dumbbell(); };
  const addc = document.getElementById("addc");
  addc.onchange = () => { const c = sortedC.find((x) => name(x).toLowerCase() === addc.value.trim().toLowerCase()); if (c) { addChip(c); addc.value = ""; } };
  function addChip(c) {
    if (c === "NOR" || st.chips.includes(c)) return;
    st.chips.push(c); if (st.chips.length > 6) st.chips.shift();
    series(); rank();
  }
  const inReg = (c) => !st.reg || C[c].region === st.reg;

  // ---------------------------------------------------------------- kart
  function wmap() {
    const i = IND[st.ind], yi = st.yi, el = document.getElementById("map");
    document.getElementById("m-title").textContent = `${i.nb}, ${yLab(yi)}`;
    const w = Math.max(300, el.clientWidth || 700), h = Math.round(w * 0.56);
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const feats = st.reg ? land.filter((f) => C[f.properties.id] && inReg(f.properties.id)) : land;
    const proj = d3.geoEqualEarth().fitExtent([[4, 4], [w - 4, h - 46]], { type: "FeatureCollection", features: feats });
    const path = d3.geoPath(proj);
    const vals = Object.keys(C).map((c) => val(i.key, c, yi)).filter((v) => v != null);
    const dark = S.isDark();
    const ramp = dark ? ["#0d366b", "#104281", "#1c5cab", "#2a78d6", "#5598e7", "#86b6ef", "#b7d3f6"] : ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
    const sc = d3.scaleQuantize(d3.extent(vals), ramp);
    svg.append("g").selectAll("path").data(land).join("path").attr("d", path)
      .attr("class", (f) => { const c = f.properties.id, v = C[c] ? val(i.key, c, yi) : null; return v == null || !inReg(c) ? "na" : "c"; })
      .attr("fill", (f) => { const c = f.properties.id, v = C[c] && inReg(c) ? val(i.key, c, yi) : null; return v == null ? null : sc(v); })
      .on("mousemove", (e, f) => {
        const c = f.properties.id, v = C[c] ? val(i.key, c, yi) : null;
        if (v == null) { tip.show(`<div class="tt-title">${S.escapeHtml(dn ? (() => { try { return dn.of(ISO2[c] || "ZZ"); } catch (x) { return c; } })() : c)}</div><div class="tt-row"><span>Ikke med i indeksen ${yLab(yi)}</span></div>`, e.clientX, e.clientY); return; }
        const { r, n } = rankOf(i.key, c, yi);
        tip.show(`<div class="tt-title">${S.escapeHtml(name(c))}</div><div class="tt-row"><span>${S.escapeHtml(i.nb)}</span><b>${f3(v)}</b></div><div class="tt-row"><span>Plass</span><b>${r} av ${n}</b></div><div class="tt-row"><span>Region</span><b>${S.escapeHtml(C[c].region || "–")}</b></div>`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => tip.hide())
      .on("click", (e, f) => { if (C[f.properties.id] && f.properties.id !== "NOR") addChip(f.properties.id); });
    const nof = land.find((f) => f.properties.id === "NOR");
    if (nof && inReg("NOR")) svg.append("path").attr("class", "sel").attr("d", path(nof));
    const lg = svg.append("g").attr("class", "lg").attr("transform", `translate(8,${h - 36})`);
    const bw = Math.min(56, (w - 16) / ramp.length);
    ramp.forEach((c, k) => lg.append("rect").attr("x", k * bw).attr("y", 0).attr("width", bw - 2).attr("height", 10).attr("rx", 2).attr("fill", c));
    const ext = sc.domain();
    lg.append("text").attr("x", 0).attr("y", 26).text(f3(ext[0]) + " (svakest)");
    lg.append("text").attr("x", ramp.length * bw - 2).attr("y", 26).attr("text-anchor", "end").text(f3(ext[1]) + " (sterkest)");
  }

  // ---------------------------------------------------------------- rangering
  function rank() {
    const i = IND[st.ind], yi = st.yi, el = document.getElementById("rank");
    const rows = ranked(i.key, yi, inReg), all = ranked(i.key, yi);
    document.getElementById("r-title").textContent = st.reg ? `Rangering i ${st.reg}` : "Rangering";
    const no = rows.indexOf("NOR");
    document.getElementById("r-sub").textContent = `${rows.length} land i ${yLab(yi)}.${no >= 0 ? ` Norge er nr. ${no + 1}.` : ""}${st.reg ? " Tallet til venstre er plass i verden." : ""}`;
    el.innerHTML = rows.map((c) => {
      const v = val(i.key, c, yi);
      return `<div class="r ${c === "NOR" ? "no" : ""} ${NORD.has(c) ? "nord" : ""} ${st.chips.includes(c) ? "pick" : ""}" data-c="${c}" title="Legg til i sammenligningen"><span class="i">${all.indexOf(c) + 1}</span><span>${S.escapeHtml(name(c))}</span><div><div class="b" style="width:${(v * 100).toFixed(1)}%"></div></div><span class="v">${f3(v)}</span></div>`;
    }).join("");
    el.querySelectorAll(".r").forEach((r) => (r.onclick = () => addChip(r.dataset.c)));
    const noEl = el.querySelector(".r.no");
    if (noEl) el.scrollTop = Math.max(0, noEl.offsetTop - el.offsetTop - 60);
  }

  // ---------------------------------------------------------------- tidsserie
  const PAL = ["var(--series-1)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)", "var(--series-7)"];
  function series() {
    const i = IND[st.ind], el = document.getElementById("ts");
    document.getElementById("t-title").textContent = `${i.nb} over tid`;
    const ser = [{ c: "NOR", color: "var(--series-2)", w: 3 }, ...st.chips.map((c, k) => ({ c, color: PAL[k % PAL.length] }))];
    document.getElementById("chips").innerHTML = ser.map((s) => `<span class="chip"><span class="sw" style="background:${s.color}"></span>${S.escapeHtml(name(s.c))}${s.c === "NOR" ? "<span style=\"width:6px\"></span>" : `<button data-c="${s.c}" aria-label="Fjern ${S.escapeHtml(name(s.c))}">×</button>`}</span>`).join("");
    document.querySelectorAll("#chips button").forEach((b) => (b.onclick = () => { st.chips = st.chips.filter((c) => c !== b.dataset.c); series(); rank(); }));
    const w = Math.max(320, el.clientWidth || 900), h = 320, m = { t: 14, r: w < 560 ? 70 : 110, b: 28, l: 44 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear([yearNum(0), yearNum(LAST)], [m.l, w - m.r]);
    const all = ser.flatMap((s) => d.values[i.key][s.c] || []).filter((v) => v != null);
    const y = d3.scaleLinear([Math.max(0, d3.min(all) - 0.05), Math.min(1, d3.max(all) + 0.03)], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => v.toFixed(1).replace(".", ",")).tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(Math.min(12, w / 70)).tickFormat(d3.format("d")).tickSizeOuter(0));
    const labs = [];
    ser.slice().reverse().forEach((s) => {
      const pts = (d.values[i.key][s.c] || []).map((v, k) => [yearNum(k), v]).filter((p) => p[1] != null);
      if (!pts.length) return;
      svg.append("path").datum(pts).attr("fill", "none").attr("stroke", s.color).attr("stroke-width", s.w || 2).attr("d", d3.line().x((p) => x(p[0])).y((p) => y(p[1])));
      svg.append("g").selectAll("circle").data(pts).join("circle").attr("cx", (p) => x(p[0])).attr("cy", (p) => y(p[1])).attr("r", s.w ? 3.5 : 2.5).attr("fill", s.color);
      const lp = pts[pts.length - 1];
      labs.push({ t: name(s.c), x: x(lp[0]) + 8, y: y(lp[1]) + 4, no: s.c === "NOR" });
    });
    labs.sort((a, b) => a.y - b.y);
    for (let k = 1; k < labs.length; k++) if (labs[k].y - labs[k - 1].y < 13) labs[k].y = labs[k - 1].y + 13;
    labs.forEach((l) => svg.append("text").attr("x", l.x).attr("y", l.y).attr("fill", "var(--text-2)").attr("font-size", 11.5).attr("font-weight", l.no ? 700 : 500).text(l.t.length > 16 && w < 560 ? l.t.slice(0, 14) + "…" : l.t));
    const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--border-strong)").style("display", "none");
    svg.append("rect").attr("x", m.l).attr("width", w - m.l - m.r).attr("height", h - m.b).attr("fill", "transparent")
      .on("mousemove", (e) => {
        const yr = x.invert(d3.pointer(e)[0]);
        let k = 0; YEARS.forEach((_, j) => { if (Math.abs(yearNum(j) - yr) < Math.abs(yearNum(k) - yr)) k = j; });
        cross.style("display", null).attr("x1", x(yearNum(k))).attr("x2", x(yearNum(k)));
        const rows = ser.map((s) => ({ s, v: val(i.key, s.c, k) })).sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
        tip.show(`<div class="tt-title">${yLab(k)}</div>${rows.map(({ s, v }) => `<div class="tt-row"><span><span class="key" style="background:${s.color}"></span>${S.escapeHtml(name(s.c))}</span><b>${f3(v)}</b></div>`).join("")}`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => { tip.hide(); cross.style("display", "none"); });
  }

  // ---------------------------------------------------------------- Norge mot ...
  function dumbbell() {
    const el = document.getElementById("dumb"), c = st.vs;
    document.getElementById("d-legend").innerHTML = `<span class="item"><span class="sw" style="background:var(--series-2)"></span>Norge</span><span class="item"><span class="sw" style="background:var(--series-1)"></span>${S.escapeHtml(name(c))}</span>`;
    const rows = ["overall", ...fac.map((f) => f.key)].map((k) => ({ i: IND[k], a: val(k, "NOR", LAST), b: val(k, c, LAST) }));
    const w = Math.max(300, el.clientWidth || 560), narrow = w < 600, rowH = narrow ? 44 : 34, m = { t: 8, r: 14, b: 26, l: narrow ? 10 : 250 };
    const h = m.t + m.b + rowH * rows.length;
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear([0, 1], [m.l, w - m.r]);
    svg.append("g").attr("class", "grid").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(5).tickSize(-(h - m.t - m.b)).tickFormat(""));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat((v) => v.toFixed(1).replace(".", ",")).tickSizeOuter(0));
    rows.forEach((r, k) => {
      const yy = m.t + k * rowH + (narrow ? rowH * 0.68 : rowH / 2);
      svg.append("text").attr("class", "lbl").attr("x", narrow ? m.l : m.l - 12).attr("y", narrow ? yy - 14 : yy + 4).attr("text-anchor", narrow ? "start" : "end").attr("font-weight", r.i.level === "overall" ? 650 : 400).text(r.i.level === "overall" ? "Samlet" : r.i.nb);
      if (r.a != null && r.b != null) svg.append("line").attr("x1", x(r.a)).attr("x2", x(r.b)).attr("y1", yy).attr("y2", yy).attr("stroke", "var(--border-strong)").attr("stroke-width", 3);
      [["b", "var(--series-1)", c], ["a", "var(--series-2)", "NOR"]].forEach(([key, col, cc]) => {
        if (r[key] == null) return;
        svg.append("circle").attr("cx", x(r[key])).attr("cy", yy).attr("r", 6.5).attr("fill", col).attr("stroke", "var(--surface)").attr("stroke-width", 1.5)
          .on("mousemove", (e) => tip.show(`<div class="tt-title">${S.escapeHtml(r.i.nb)}</div><div class="tt-row"><span>Norge</span><b>${f3(r.a)}</b></div><div class="tt-row"><span>${S.escapeHtml(name(c))}</span><b>${f3(r.b)}</b></div>`, e.clientX, e.clientY))
          .on("mouseleave", () => tip.hide());
      });
    });
  }

  // ---------------------------------------------------------------- endringer
  function hbars(el, rows, color) {
    const w = Math.max(240, el.clientWidth || 300), rowH = 22, m = { t: 4, r: 54, b: 4, l: 118 };
    const h = m.t + m.b + rowH * rows.length;
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const mx = d3.max(rows, (r) => Math.abs(r.d)) || 0.01, x = d3.scaleLinear([0, mx], [0, w - m.l - m.r]);
    rows.forEach((r, k) => {
      const yy = m.t + k * rowH;
      const g = svg.append("g").on("mousemove", (e) => tip.show(`<div class="tt-title">${S.escapeHtml(name(r.c))}</div><div class="tt-row"><span>${yLab(st.from)}</span><b>${f3(r.v0)}</b></div><div class="tt-row"><span>${yLab(LAST)}</span><b>${f3(r.v1)}</b></div>`, e.clientX, e.clientY)).on("mouseleave", () => tip.hide());
      g.append("rect").attr("x", 0).attr("width", w).attr("y", yy).attr("height", rowH).attr("fill", "transparent");
      const nm = name(r.c);
      g.append("text").attr("x", m.l - 8).attr("y", yy + 15).attr("text-anchor", "end").attr("fill", "var(--text-2)").attr("font-size", 12).attr("font-weight", r.c === "NOR" ? 700 : 400).text(nm.length > 17 ? nm.slice(0, 16) + "…" : nm);
      g.append("rect").attr("x", m.l).attr("y", yy + 4).attr("height", rowH - 8).attr("rx", 2).attr("width", Math.max(1, x(Math.abs(r.d)))).attr("fill", r.c === "NOR" ? "var(--series-2)" : color);
      g.append("text").attr("x", m.l + x(Math.abs(r.d)) + 6).attr("y", yy + 15).attr("fill", "var(--text)").attr("font-size", 12).text(fd(r.d));
    });
  }
  function movers() {
    const i = IND[st.ind], a = st.from;
    document.getElementById("mv-title").textContent = `Endring fra ${yLab(a)} til ${yLab(LAST)}`;
    const rows = Object.keys(C).map((c) => ({ c, v0: val(i.key, c, a), v1: val(i.key, c, LAST) })).filter((r) => r.v0 != null && r.v1 != null).map((r) => ({ ...r, d: r.v1 - r.v0 }));
    const no = rows.find((r) => r.c === "NOR");
    document.getElementById("mv-sub").textContent = `${i.nb}. ${rows.length} land har tall for begge år.${no ? ` Norge: ${fd(no.d)}.` : ""} Fall: ${rows.filter((r) => r.d < 0).length} land.`;
    const up = rows.slice().sort((x, y) => y.d - x.d).slice(0, 10).filter((r) => r.d > 0);
    const dn2 = rows.slice().sort((x, y) => x.d - y.d).slice(0, 10).filter((r) => r.d < 0);
    hbars(document.getElementById("up"), up, "var(--series-1)");
    hbars(document.getElementById("down"), dn2, "var(--series-5)");
  }

  // ---------------------------------------------------------------- tabell
  let tbl = null;
  function table() {
    const i = IND[st.ind], yi = st.yi, y0 = Math.max(0, yi - 1);
    const all = ranked(i.key, yi);
    const rows = Object.keys(C).filter(inReg).map((c) => {
      const v = val(i.key, c, yi), v0 = val(i.key, c, y0);
      return { id: c, name: name(c), region: C[c].region || "–", income: C[c].income || "–", v, rank: v == null ? null : all.indexOf(c) + 1, chg: v != null && v0 != null && yi > 0 ? v - v0 : null };
    }).filter((r) => r.v != null);
    document.getElementById("tbl-sub").textContent = `${i.nb}, ${yLab(yi)}${yi > 0 ? `, og endring fra ${yLab(y0)}` : ""}. Klikk på en kolonne for å sortere.`;
    const cols = [
      { key: "rank", label: "Plass" }, { key: "name", label: "Land", text: true }, { key: "region", label: "Region", text: true }, { key: "income", label: "Inntektsgruppe", text: true },
      { key: "v", label: "Poeng", fmt: f3 }, { key: "chg", label: "Endring", fmt: (v) => (v == null ? "–" : fd(v)) },
    ];
    tbl = S.sortableTable(document.getElementById("table"), cols, rows, { sortKey: "rank", dir: 1, onRow: (c) => addChip(c) });
    document.getElementById("csv").onclick = () => S.downloadCsv(`rettsstat-${i.key}-${yLab(yi)}.csv`, [["Plass", "Land", "ISO3", "Region", "Inntektsgruppe", "Poeng", "Endring"], ...rows.sort((a, b) => a.rank - b.rank).map((r) => [r.rank, r.name, r.id, r.region, r.income, r.v.toFixed(3).replace(".", ","), r.chg == null ? "" : r.chg.toFixed(3).replace(".", ",")])]);
  }

  function renderSel() {
    const i = IND[st.ind];
    document.getElementById("sel-title").textContent = i.nb;
    const lvl = i.level === "overall" ? "Gjennomsnittet av de åtte faktorene." : i.level === "factor" ? `Faktor ${i.factor} i indeksen.` : `Underfaktor ${i.key} under «${IND["f" + i.factor].nb.toLowerCase()}».`;
    const no = val(i.key, "NOR", st.yi), { r, n } = rankOf(i.key, "NOR", st.yi);
    document.getElementById("sel-desc").textContent = `${lvl} Engelsk: «${i.en}». Norge får ${f3(no)} i ${yLab(st.yi)} og er nr. ${r} av ${n}.`;
    history.replaceState(null, "", st.ind === "overall" ? location.pathname : `#i=${st.ind}`);
    wmap(); rank(); series(); movers(); table();
  }

  kpis(); score(); renderSel(); dumbbell();
  document.getElementById("updated").textContent = `Data hentet ${d.fetched}`;
  S.onThemeChange(() => wmap());
  let rt, lastW = innerWidth;
  window.addEventListener("resize", () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rt); rt = setTimeout(() => { wmap(); series(); dumbbell(); movers(); }, 200); });
})();
