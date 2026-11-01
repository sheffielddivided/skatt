/* Studie 5 – Aldersbølgen */
(async function () {
  const S = window.Skatt;
  const tip = S.tooltip();
  const [d, topo] = await Promise.all([
    fetch("data/alder/index.json").then((r) => r.json()),
    fetch("data/norge-2024.topo.json").then((r) => r.json()),
  ]);
  const Y = d.years, G = d.groups, LAST = Y.length - 1;
  const KOM = d.kommuner, FYL = d.fylker;
  const pyrCache = { NO: d.norge.pyr };
  for (const [f, v] of Object.entries(FYL)) pyrCache["F" + f] = v.pyr;

  const nameOf = (r) => (r === "NO" ? "Norge" : r[0] === "F" ? FYL[r.slice(1)].name : KOM[r].name);
  const indOf = (r) => (r === "NO" ? d.norge.ind : r[0] === "F" ? FYL[r.slice(1)].ind : KOM[r].ind);
  async function pyrOf(r) {
    if (pyrCache[r]) return pyrCache[r];
    const f = KOM[r].f;
    const part = await fetch(`data/alder/${f}.json`).then((x) => x.json());
    Object.assign(pyrCache, part);
    return pyrCache[r];
  }

  // ---------------------------------------------------------------- state
  const st = { r: "NO", yi: LAST, cmp: "norge", mind: "a67" };
  (function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    const r = h.get("r");
    if (r && (r === "NO" || KOM[r] || (r[0] === "F" && FYL[r.slice(1)]))) st.r = r;
    const y = +h.get("y");
    if (Y.includes(y)) st.yi = Y.indexOf(y);
    if (["norge", "first", "none"].includes(h.get("c"))) st.cmp = h.get("c");
  })();
  const writeHash = () => history.replaceState(null, "", "#" + new URLSearchParams({ r: st.r, y: Y[st.yi], c: st.cmp }));

  // ---------------------------------------------------------------- kontroller
  const regionInput = document.getElementById("region");
  const options = [{ r: "NO", l: "Norge" },
    ...Object.entries(FYL).sort((a, b) => a[1].name.localeCompare(b[1].name, "nb")).map(([f, v]) => ({ r: "F" + f, l: `${v.name} (fylke)` })),
    ...Object.entries(KOM).sort((a, b) => a[1].name.localeCompare(b[1].name, "nb")).map(([k, v]) => ({ r: k, l: `${v.name} (${FYL[v.f]?.name ?? ""})` }))];
  document.getElementById("rlist").innerHTML = options.map((o) => `<option value="${S.escapeHtml(o.l)}"></option>`).join("");
  regionInput.addEventListener("change", () => {
    const v = regionInput.value.trim().toLowerCase();
    const hit = options.find((o) => o.l.toLowerCase() === v) || options.find((o) => o.l.toLowerCase().startsWith(v));
    if (hit) setRegion(hit.r, true);
    regionInput.blur();
  });
  regionInput.addEventListener("focus", () => regionInput.select());

  const yr = document.getElementById("year");
  yr.max = LAST; yr.value = st.yi;
  yr.oninput = () => { stopPlay(); st.yi = +yr.value; renderYear(); };
  document.getElementById("cmp-first").textContent = String(Y[0]);
  document.querySelectorAll("#cmp button").forEach((b) => (b.onclick = () => { st.cmp = b.dataset.v; renderYear(); }));
  const mind = document.getElementById("mind");
  mind.onchange = () => { st.mind = mind.value; renderMap(); };

  const playBtn = document.getElementById("play");
  let timer = null;
  function stopPlay() { if (timer) { clearInterval(timer); timer = null; playBtn.classList.remove("playing"); } }
  playBtn.onclick = () => {
    if (timer) return stopPlay();
    if (st.yi >= LAST) st.yi = 0;
    playBtn.classList.add("playing");
    renderYear(true);
    timer = setInterval(() => { if (st.yi >= LAST) return stopPlay(); st.yi++; renderYear(true); }, 380);
  };

  // ---------------------------------------------------------------- pyramide
  let curPyr = null, cmpNorge = d.norge.pyr, xmax = 0;
  const share = (p, yi) => { const tot = d3.sum(p[yi][0]) + d3.sum(p[yi][1]); return [p[yi][0].map((v) => (100 * v) / tot), p[yi][1].map((v) => (100 * v) / tot)]; };

  function computeXmax() {
    let mx = 0;
    for (let yi = 0; yi <= LAST; yi++) {
      const [m, f] = share(curPyr, yi);
      mx = Math.max(mx, d3.max(m), d3.max(f));
      if (st.r !== "NO") { const [nm, nf] = share(cmpNorge, yi); mx = Math.max(mx, d3.max(nm), d3.max(nf)); }
    }
    xmax = Math.ceil(mx);
  }

  function drawPyramid(animate) {
    const el = document.getElementById("pyr");
    const w = Math.max(360, el.clientWidth || 700), h = 470, m = { t: 26, r: 10, b: 28, l: 10 }, gap = 46;
    const cx = w / 2;
    let svg = d3.select(el).select("svg");
    if (svg.empty() || +svg.attr("data-w") !== w) {
      el.innerHTML = "";
      svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("data-w", w);
      svg.append("g").attr("class", "grid-l"); svg.append("g").attr("class", "bars"); svg.append("g").attr("class", "cmpg"); svg.append("g").attr("class", "labels"); svg.append("g").attr("class", "axes"); svg.append("g").attr("class", "hits");
    }
    const yb = d3.scaleBand(d3.range(G.length), [h - m.b, m.t]).paddingInner(0.12);
    const xl = d3.scaleLinear([0, xmax], [cx - gap / 2, m.l]);
    const xr = d3.scaleLinear([0, xmax], [cx + gap / 2, w - m.r]);
    const [pm, pf] = share(curPyr, st.yi);
    const rows = G.map((g, i) => ({ i, g, m: pm[i], f: pf[i], nm: curPyr[st.yi][0][i], nf: curPyr[st.yi][1][i] }));
    const t = svg.transition().duration(animate ? 300 : 0).ease(d3.easeCubicOut);

    // akser
    const ax = svg.select(".axes");
    ax.selectAll("*").remove();
    const ticks = d3.ticks(0, xmax, 4).filter((v) => v > 0);
    const gl = svg.select(".grid-l");
    gl.selectAll("*").remove();
    for (const v of ticks) {
      for (const xs of [xl, xr]) {
        gl.append("line").attr("x1", xs(v)).attr("x2", xs(v)).attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--border)");
        ax.append("text").attr("x", xs(v)).attr("y", h - 8).attr("text-anchor", "middle").attr("fill", "var(--text-3)").attr("font-size", 11.5).text(S.nf1.format(v).replace(",0", "") + " %");
      }
    }
    ax.append("text").attr("class", "side").attr("x", cx - gap / 2 - 4).attr("y", 14).attr("text-anchor", "end").attr("fill", "var(--text-2)").attr("font-size", 13).attr("font-weight", 600).text("Menn");
    ax.append("text").attr("class", "side").attr("x", cx + gap / 2 + 4).attr("y", 14).attr("fill", "var(--text-2)").attr("font-size", 13).attr("font-weight", 600).text("Kvinner");

    const bars = svg.select(".bars");
    bars.selectAll("rect.m").data(rows, (r) => r.i).join("rect").attr("class", "m bar").attr("y", (r) => yb(r.i)).attr("height", yb.bandwidth()).attr("rx", 2).attr("fill", "var(--series-1)")
      .transition(t).attr("x", (r) => xl(r.m)).attr("width", (r) => xl(0) - xl(r.m));
    bars.selectAll("rect.f").data(rows, (r) => r.i).join("rect").attr("class", "f bar").attr("y", (r) => yb(r.i)).attr("height", yb.bandwidth()).attr("rx", 2).attr("fill", "var(--series-2)")
      .transition(t).attr("x", xr(0)).attr("width", (r) => xr(r.f) - xr(0));
    const lab = svg.select(".labels");
    lab.selectAll("text").data(rows, (r) => r.i).join("text").attr("class", "age").attr("x", cx).attr("y", (r) => yb(r.i) + yb.bandwidth() / 2 + 4).attr("fill", "var(--text-3)").attr("font-size", 11).attr("text-anchor", "middle").text((r) => r.g);

    // sammenligning (trappelinje)
    const cg = svg.select(".cmpg");
    cg.selectAll("*").remove();
    let cmp = null;
    if (st.cmp === "norge" && st.r !== "NO") cmp = share(cmpNorge, st.yi);
    if (st.cmp === "first" && st.yi !== 0) cmp = share(curPyr, 0);
    if (cmp) {
      for (const [side, xs] of [[0, xl], [1, xr]]) {
        const pts = [];
        G.forEach((_, i) => { const x = xs(cmp[side][i]); pts.push([x, yb(i) + yb.bandwidth() + (yb.step() - yb.bandwidth()) / 2]); pts.push([x, yb(i) - (yb.step() - yb.bandwidth()) / 2]); });
        cg.append("path").attr("class", "cmp").attr("d", d3.line()(pts)).attr("fill", "none").attr("stroke", "var(--text)").attr("stroke-opacity", 0.7).attr("stroke-width", 1.5);
      }
    }
    const cmpName = st.cmp === "norge" ? `Norge ${Y[st.yi]}` : `${nameOf(st.r)} ${Y[0]}`;
    document.getElementById("pyr-legend").innerHTML = `<span class="item"><span class="sw" style="background:var(--series-1)"></span>Menn</span><span class="item"><span class="sw" style="background:var(--series-2)"></span>Kvinner</span>${cmp ? `<span class="item"><span class="sw line" style="background:var(--text)"></span>${S.escapeHtml(cmpName)}</span>` : ""}`;

    const hits = svg.select(".hits");
    hits.selectAll("rect").data(rows, (r) => r.i).join("rect").attr("x", m.l).attr("width", w - m.l - m.r).attr("y", (r) => yb(r.i) - (yb.step() - yb.bandwidth()) / 2).attr("height", yb.step()).attr("fill", "transparent")
      .on("mousemove", (e, r0) => {
        const r = rows[r0.i];
        tip.show(`<div class="tt-title">${r.g} år · ${Y[st.yi]}</div>
          <div class="tt-row"><span><span class="key" style="background:var(--series-1)"></span>Menn</span><b>${S.int(r.nm)} <span class="faint">${S.pct(r.m, 1)}</span></b></div>
          <div class="tt-row"><span><span class="key" style="background:var(--series-2)"></span>Kvinner</span><b>${S.int(r.nf)} <span class="faint">${S.pct(r.f, 1)}</span></b></div>
          ${cmp ? `<div class="tt-row" style="border-top:1px solid var(--border);margin-top:4px;padding-top:4px"><span>${S.escapeHtml(cmpName)}</span><b>${S.pct(cmp[0][r.i] + cmp[1][r.i], 1)}</b></div>` : ""}`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => tip.hide());
    document.getElementById("pyr-title").textContent = `Befolkningspyramide · ${nameOf(st.r)}`;
    document.getElementById("pyr-sub").textContent = `Andel av befolkningen i hver aldersgruppe, 1. januar ${Y[st.yi]}.`;
  }

  // ---------------------------------------------------------------- nøkkeltall
  function kpis() {
    const I = indOf(st.r), N = d.norge.ind, yi = st.yi;
    const isNO = st.r === "NO";
    const vs = (key, f) => (isNO ? "" : `Norge: ${f(N[key][yi])}`);
    const chg = I.pop[0] ? (100 * (I.pop[yi] / I.pop[0] - 1)) : null;
    const pp = (key) => { const d0 = I[key][yi] - I[key][0]; return `${d0 >= 0 ? "+" : "−"}${S.nf1.format(Math.abs(d0))} ${key === "med" ? "år" : key === "fb" ? "" : "%-poeng"} siden ${Y[0]}`; };
    const cards = [
      { l: `Folketall 1.1.${Y[yi]}`, v: S.int(I.pop[yi]), s: `${S.pct(chg, 1, true)} siden ${Y[0]}`, wide: true },
      { l: "Medianalder", v: S.nf1.format(I.med[yi]) + " år", s: `${pp("med")}<br>${vs("med", (v) => S.nf1.format(v) + " år")}` },
      { l: "Andel 67 år og eldre", v: S.pct(I.a67[yi], 1), s: `${pp("a67")}<br>${vs("a67", (v) => S.pct(v, 1))}` },
      { l: "Andel 80 år og eldre", v: S.pct(I.a80[yi], 1), s: `${pp("a80")}<br>${vs("a80", (v) => S.pct(v, 1))}` },
      { l: "Eldre per 100 i arbeidsfør alder", v: S.nf1.format(I.fb[yi]), s: `${pp("fb").replace("  ", " ")}<br>${vs("fb", (v) => S.nf1.format(v))}` },
    ];
    document.getElementById("kcards").innerHTML = cards.map((c) => `<div class="card kpi ${c.wide ? "wide" : ""}"><div class="l">${c.l}</div><div class="v">${c.v}</div><div class="s">${c.s}</div></div>`).join("") +
      (KOM[st.r] ? `<div class="card kpi wide"><div class="l">Mer om ${S.escapeHtml(nameOf(st.r))}</div><div class="s" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><a class="btn" href="profil.html#x=a67&y=skatt&k=${st.r}">Kommuneprofil</a><a class="btn" href="kart.html#l=k&r=${st.r}">Skattekartet</a></div></div>` : "");
  }

  // ---------------------------------------------------------------- linjediagram
  function lineChart(id, legendId, key, fmtV) {
    const el = document.getElementById(id);
    const w = Math.max(360, el.clientWidth || 600), h = 260, m = { t: 14, r: 14, b: 28, l: 44 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const I = indOf(st.r), N = d.norge.ind;
    const series = [{ k: "r", name: nameOf(st.r), color: "var(--series-1)" }];
    if (st.r !== "NO") series.push({ k: "n", name: "Norge", color: "var(--series-2)" });
    document.getElementById(legendId).innerHTML = series.length > 1 ? series.map((s) => `<span class="item"><span class="sw line" style="background:${s.color}"></span>${S.escapeHtml(s.name)}</span>`).join("") : "";
    const rows = Y.map((y, i) => ({ y, r: I[key][i], n: N[key][i] }));
    const x = d3.scaleLinear(d3.extent(Y), [m.l, w - m.r]);
    const yv = d3.scaleLinear([0, d3.max(rows, (r) => Math.max(r.r, series.length > 1 ? r.n : 0))], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(yv).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(yv).ticks(5).tickFormat((v) => fmtV(v, true)).tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("d")).tickSizeOuter(0));
    svg.append("line").attr("x1", x(Y[st.yi])).attr("x2", x(Y[st.yi])).attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--border-strong)").attr("stroke-dasharray", "3 3");
    series.slice().reverse().forEach((s) => svg.append("path").datum(rows).attr("fill", "none").attr("stroke", s.color).attr("stroke-width", 2).attr("d", d3.line().x((r) => x(r.y)).y((r) => yv(r[s.k]))));
    series.forEach((s) => svg.append("circle").attr("cx", x(Y[st.yi])).attr("cy", yv(rows[st.yi][s.k])).attr("r", 4.5).attr("fill", s.color).attr("stroke", "var(--surface)").attr("stroke-width", 2));
    const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--text-3)").style("display", "none");
    svg.append("rect").attr("x", m.l).attr("width", w - m.l - m.r).attr("y", 0).attr("height", h - m.b).attr("fill", "transparent")
      .on("mousemove", (e) => {
        const yy = Math.round(x.invert(d3.pointer(e)[0]));
        const r = rows.find((q) => q.y === yy);
        if (!r) return;
        cross.style("display", null).attr("x1", x(yy)).attr("x2", x(yy));
        tip.show(`<div class="tt-title">${yy}</div>${series.map((s) => `<div class="tt-row"><span><span class="key" style="background:${s.color}"></span>${S.escapeHtml(s.name)}</span><b>${fmtV(r[s.k])}</b></div>`).join("")}`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => { tip.hide(); cross.style("display", "none"); })
      .on("click", (e) => { const yy = Math.round(x.invert(d3.pointer(e)[0])); if (Y.includes(yy)) { stopPlay(); st.yi = Y.indexOf(yy); renderYear(); } });
  }

  // ---------------------------------------------------------------- kart + rangering + tabell
  const MIND = {
    a67: { name: "Andel 67 år og eldre", f: (v) => S.pct(v, 1), s: (v) => S.pct(v, 0) },
    a80: { name: "Andel 80 år og eldre", f: (v) => S.pct(v, 1), s: (v) => S.pct(v, 0) },
    fb: { name: "Eldre per 100 i arbeidsfør alder", f: (v) => S.nf1.format(v), s: (v) => S.nf0.format(v) },
    med: { name: "Medianalder", f: (v) => S.nf1.format(v) + " år", s: (v) => S.nf0.format(v) },
    a0_19: { name: "Andel 0–19 år", f: (v) => S.pct(v, 1), s: (v) => S.pct(v, 0) },
    growth: { name: `Befolkningsendring siden ${Y[0]}`, f: (v) => S.pct(v, 0, true), s: (v) => S.pct(v, 0, true) },
  };
  const mval = (k, key, yi) => (key === "growth" ? (KOM[k].ind.pop[0] ? 100 * (KOM[k].ind.pop[yi] / KOM[k].ind.pop[0] - 1) : null) : KOM[k].ind[key][yi]);
  const map = S.choropleth(document.getElementById("map"), topo, {
    onClick: (id) => id && setRegion(id),
    tooltip: (id) => `<div class="tt-title">${S.escapeHtml(KOM[id].name)}</div><div class="tt-row"><span>${MIND[st.mind].name}</span><b>${MIND[st.mind].f(mval(id, st.mind, st.yi))}</b></div><div class="tt-row"><span>Folketall</span><b>${S.int(KOM[id].ind.pop[st.yi])}</b></div>`,
  });
  function renderMap() {
    const key = st.mind, yi = st.yi;
    const values = Object.fromEntries(Object.keys(KOM).map((k) => [k, mval(k, key, yi)]));
    const fy = st.r[0] === "F" ? st.r.slice(1) : null;
    map.update({ values, fmt: MIND[key].f, short: MIND[key].s, title: `${MIND[key].name}, ${Y[yi]}`, fylke: fy, selected: KOM[st.r] ? st.r : null });
    document.getElementById("map-title").textContent = `${MIND[key].name} i kommunene, ${Y[yi]}`;
    const sorted = Object.keys(values).filter((k) => values[k] != null && (!fy || KOM[k].f === fy)).sort((a, b) => values[b] - values[a]);
    const li = (k) => `<li><button data-k="${k}"><span class="r">${sorted.indexOf(k) + 1}</span><span>${S.escapeHtml(KOM[k].name)}</span><span class="v">${MIND[key].f(values[k])}</span></button></li>`;
    document.getElementById("ranks").innerHTML = `<div><h3>Høyest${fy ? " i " + S.escapeHtml(FYL[fy].name) : ""}</h3><ol class="rank-list">${sorted.slice(0, 12).map(li).join("")}</ol></div>
      <div><h3>Lavest${fy ? " i " + S.escapeHtml(FYL[fy].name) : ""}</h3><ol class="rank-list">${sorted.slice(-12).reverse().map(li).join("")}</ol></div>`;
    document.querySelectorAll("#ranks button").forEach((b) => (b.onclick = () => setRegion(b.dataset.k, true)));
  }
  function table() {
    const yi = st.yi;
    const rows = Object.entries(KOM).map(([k, v]) => ({ id: k, name: v.name, fylke: FYL[v.f]?.name, pop: v.ind.pop[yi], growth: mval(k, "growth", yi), a67: v.ind.a67[yi], a80: v.ind.a80[yi], fb: v.ind.fb[yi], med: v.ind.med[yi] }));
    document.getElementById("tbl-sub").textContent = `Per 1. januar ${Y[yi]}. Klikk på en kolonne for å sortere, eller på en rad for å se pyramiden.`;
    S.sortableTable(document.getElementById("table"), [
      { key: "name", label: "Kommune", text: true }, { key: "fylke", label: "Fylke", text: true },
      { key: "pop", label: "Folketall", fmt: S.int }, { key: "growth", label: `Endring siden ${Y[0]}`, fmt: (v) => S.pct(v, 0, true) },
      { key: "a67", label: "67+", fmt: (v) => S.pct(v, 1) }, { key: "a80", label: "80+", fmt: (v) => S.pct(v, 1) },
      { key: "fb", label: "Eldre per 100", fmt: (v) => S.nf1.format(v) }, { key: "med", label: "Medianalder", fmt: (v) => S.nf1.format(v) },
    ], rows, { sortKey: "a67", dir: -1, onRow: (id) => setRegion(id, true) });
    document.getElementById("csv").onclick = () => S.downloadCsv(`aldersfordeling-kommuner-${Y[yi]}.csv`, [
      ["Kommunenr", "Kommune", "Fylke", "Folketall", "Andel 67+ (%)", "Andel 80+ (%)", "Eldre per 100 i arbeidsfør alder", "Medianalder"],
      ...rows.map((r) => [r.id, r.name, r.fylke, r.pop, String(r.a67).replace(".", ","), String(r.a80).replace(".", ","), String(r.fb).replace(".", ","), String(r.med).replace(".", ",")]),
    ]);
  }

  // ---------------------------------------------------------------- oppdatering
  function renderYear(animate = false) {
    yr.value = st.yi;
    document.getElementById("yl").textContent = Y[st.yi];
    document.querySelectorAll("#cmp button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === st.cmp)));
    drawPyramid(animate);
    kpis();
    lineChart("c1", "l1", "a67", (v, s) => S.pct(v, s ? 0 : 1));
    lineChart("c2", "l2", "fb", (v) => S.nf1.format(v).replace(",0", ""));
    renderMap();
    if (!animate) table();
    writeHash();
  }
  async function setRegion(r, scroll = false) {
    stopPlay();
    st.r = r;
    regionInput.value = options.find((o) => o.r === r)?.l || "";
    curPyr = await pyrOf(r);
    computeXmax();
    renderYear();
    if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
  }
  await setRegion(st.r);
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => renderYear(), 200); });
  S.onThemeChange(() => renderYear());
  document.getElementById("updated").textContent = d.updated ? "Data oppdatert av SSB " + new Date(d.updated).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" }) : "";
})();
