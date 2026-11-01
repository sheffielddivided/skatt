/* Studie 7 – Inntektsulikhet i kommunene */
(async function () {
  const S = window.Skatt;
  const tip = S.tooltip();
  const [d, topo] = await Promise.all([
    fetch("data/ulikhet.json").then((r) => r.json()),
    fetch("data/norge-2024.topo.json").then((r) => r.json()),
  ]);
  const K = d.kommuner, NO = d.norge, NAT = d.national;
  const fylkeName = (f) => d.fylker[f]?.name || f;
  const f3 = (v) => (v == null ? "–" : v.toFixed(3).replace(".", ","));
  const f1 = (v) => (v == null ? "–" : S.nf1.format(v));

  // ---------------------------------------------------------------- indikatorer
  const IND = {
    gini: { name: "Gini-koeffisient", years: d.gyears.map(String), get: (k, i) => k.gini[i], nat: (i) => NO.gini[i], fmt: f3, short: (v) => v.toFixed(2).replace(".", ",") },
    p9010: { name: "P90/P10", years: d.gyears.map(String), get: (k, i) => k.p9010[i], nat: (i) => NO.p9010[i], fmt: f1, short: f1 },
    d10: { name: "Andel husholdninger i høyeste inntektstidel", years: d.dyears.map(String), get: (k, i) => k.dec[i]?.[9], nat: () => 10, fmt: (v) => S.pct(v, 1), short: (v) => S.pct(v, 0) },
    d1: { name: "Andel husholdninger i laveste inntektstidel", years: d.dyears.map(String), get: (k, i) => k.dec[i]?.[0], nat: () => 10, fmt: (v) => S.pct(v, 1), short: (v) => S.pct(v, 0) },
    low: { name: "Vedvarende lavinntekt, alle", years: d.lyears, get: (k, i) => k.low[i], nat: (i) => NO.low[i], fmt: (v) => S.pct(v, 1), short: (v) => S.pct(v, 0) },
    lowc: { name: "Vedvarende lavinntekt, barn 0–17 år", years: d.lyears, get: (k, i) => k.lowc[i], nat: (i) => NO.lowc[i], fmt: (v) => S.pct(v, 1), short: (v) => S.pct(v, 0) },
    med: { name: "Median inntekt etter skatt, husholdninger", years: [String(d.medYear)], get: (k) => k.med?.alle, nat: () => NO.med?.alle, fmt: (v) => S.kr(v), short: (v) => S.nf0.format(Math.round(v / 1000)) + "k" },
  };
  const st = { ind: "gini", yi: null, f: "", k: null };
  (function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (IND[h.get("i")]) st.ind = h.get("i");
    if (d.fylker[h.get("f")]) st.f = h.get("f");
    if (K[h.get("k")]) st.k = h.get("k");
  })();
  const writeHash = () => { const h = new URLSearchParams({ i: st.ind }); if (st.f) h.set("f", st.f); if (st.k) h.set("k", st.k); history.replaceState(null, "", "#" + h); };

  // ---------------------------------------------------------------- KPI
  (function kpis() {
    const n = NAT.years.length - 1;
    const i0 = NAT.years.indexOf(2005);
    const gl = d.gyears.length - 1, ll = d.lyears.length - 1;
    const top = Object.values(K).filter((k) => k.pop >= 5000).sort((a, b) => (b.gini[gl] ?? 0) - (a.gini[gl] ?? 0))[0];
    const tenth = Object.values(K).filter((k) => (k.dec[k.dec.length - 1]?.[9] ?? 0) >= 15).length;
    const cards = [
      { l: `Gini-koeffisient ${NAT.years[n]}`, v: f3(NAT.gini[n]), s: `${f3(NAT.gini[0])} i ${NAT.years[0]} · toppår ${NAT.years[i0]}: ${f3(NAT.gini[i0])}` },
      { l: `Mest ulike kommune (over 5 000 innb.)`, v: top.name.split(" - ")[0], s: `Gini ${f3(top.gini[gl])} i ${d.gyears[gl]} · landet ${f3(NO.gini[gl])}` },
      { l: `Barn i vedvarende lavinntekt`, v: S.pct(NO.lowc[ll], 1), s: `${d.lyears[ll]} · alle aldre: ${S.pct(NO.low[ll], 1)}` },
      { l: `Kommuner med mange høytlønte`, v: String(tenth), s: `har minst 15 % av husholdningene i landets øverste inntektstidel` },
    ];
    document.getElementById("kpis").innerHTML = cards.map((c) => `<div class="card kpi"><div class="l">${c.l}</div><div class="v">${S.escapeHtml(c.v)}</div><div class="s">${c.s}</div></div>`).join("");
  })();

  // ---------------------------------------------------------------- linjediagram
  function lines(el, rows, series, o = {}) {
    const w = Math.max(360, el.clientWidth || 600), h = o.h || 260, m = { t: 14, r: 14, b: 28, l: 46 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear(d3.extent(rows, (r) => r.x), [m.l, w - m.r]);
    const vals = rows.flatMap((r) => series.map((s) => r[s.k])).filter((v) => v != null);
    const y = d3.scaleLinear([o.zero ? 0 : d3.min(vals) * 0.95, d3.max(vals) * 1.03], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(o.yfmt || ((v) => S.nf1.format(v))).tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(Math.min(8, Math.floor(w / 70))).tickFormat(d3.format("d")).tickSizeOuter(0));
    (o.notes || []).forEach((n) => {
      const r = rows.find((q) => q.x === n.x);
      if (!r) return;
      const g = svg.append("g").attr("class", "annot");
      g.append("line").attr("x1", x(n.x)).attr("x2", x(n.x)).attr("y1", y(r[series[0].k]) - 6).attr("y2", y(r[series[0].k]) - 20).attr("stroke", "var(--text-3)").attr("stroke-dasharray", "2 3");
      g.append("text").attr("x", x(n.x) + 4).attr("y", y(r[series[0].k]) - 24).attr("fill", "var(--text-3)").attr("font-size", 11.5).text(n.t);
    });
    series.forEach((s) => svg.append("path").datum(rows).attr("fill", "none").attr("stroke", s.color).attr("stroke-width", 2).attr("stroke-dasharray", s.dash ? "4 3" : null)
      .attr("d", d3.line().defined((r) => r[s.k] != null).x((r) => x(r.x)).y((r) => y(r[s.k]))));
    if (o.marker != null) {
      const r = rows.find((q) => q.x === o.marker);
      if (r) series.forEach((s) => r[s.k] != null && svg.append("circle").attr("cx", x(r.x)).attr("cy", y(r[s.k])).attr("r", 4).attr("fill", s.color).attr("stroke", "var(--surface)").attr("stroke-width", 2));
    }
    const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--border-strong)").style("display", "none");
    svg.append("rect").attr("x", m.l).attr("y", 0).attr("width", w - m.l - m.r).attr("height", h - m.b).attr("fill", "transparent")
      .on("mousemove", (e) => {
        const xv = Math.round(x.invert(d3.pointer(e)[0]));
        const r = rows.find((q) => q.x === xv);
        if (!r) return;
        cross.style("display", null).attr("x1", x(xv)).attr("x2", x(xv));
        tip.show(`<div class="tt-title">${r.label || xv}</div>${series.map((s) => `<div class="tt-row"><span><span class="key" style="background:${s.color}"></span>${S.escapeHtml(s.name)}</span><b>${r[s.k] == null ? "–" : (o.fmt || f1)(r[s.k])}</b></div>`).join("")}`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => { tip.hide(); cross.style("display", "none"); });
  }
  function national() {
    const rows = NAT.years.map((y, i) => ({ x: y, gini: NAT.gini[i], p: NAT.p9010[i], s: NAT.s8020[i] }));
    lines(document.getElementById("c1"), rows, [{ k: "gini", name: "Gini", color: "var(--series-1)" }], {
      fmt: f3, yfmt: (v) => v.toFixed(2).replace(".", ","), notes: [{ x: 2005, t: "Utbytte før aksjonærmodellen (2006)" }],
    });
    const s2 = [{ k: "p", name: "P90/P10", color: "var(--series-1)" }, { k: "s", name: "S80/S20", color: "var(--series-2)" }];
    document.getElementById("c2-legend").innerHTML = s2.map((s) => `<span class="item"><span class="sw line" style="background:${s.color}"></span>${s.name}</span>`).join("");
    lines(document.getElementById("c2"), rows, s2, { zero: true });
  }

  // ---------------------------------------------------------------- kontroller
  const indSel = document.getElementById("ind"), yrSel = document.getElementById("yr"), fySel = document.getElementById("fy");
  indSel.innerHTML = Object.entries(IND).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");
  fySel.innerHTML += Object.entries(d.fylker).sort((a, b) => a[1].name.localeCompare(b[1].name, "nb")).map(([id, f]) => `<option value="${id}">${S.escapeHtml(f.name)}</option>`).join("");
  function fillYears() {
    const ys = IND[st.ind].years;
    yrSel.innerHTML = ys.map((y, i) => `<option value="${i}">${y}</option>`).reverse().join("");
    st.yi = ys.length - 1;
    yrSel.value = st.yi;
    yrSel.disabled = ys.length < 2;
  }
  indSel.onchange = () => { st.ind = indSel.value; fillYears(); render(); };
  yrSel.onchange = () => { st.yi = +yrSel.value; render(); };
  fySel.onchange = () => { st.f = fySel.value; if (st.k && st.f && K[st.k].f !== st.f) st.k = null; render(); };
  document.getElementById("klist").innerHTML = Object.values(K).map((k) => `<option value="${S.escapeHtml(k.name)} (${S.escapeHtml(fylkeName(k.f))})"></option>`).join("");
  const search = document.getElementById("search");
  search.onchange = () => {
    const v = search.value.trim().toLowerCase();
    const hit = Object.entries(K).find(([id, k]) => `${k.name} (${fylkeName(k.f)})`.toLowerCase() === v) || Object.entries(K).find(([id, k]) => k.name.toLowerCase().startsWith(v));
    if (!hit) return;
    if (st.f && hit[1].f !== st.f) st.f = "";
    st.k = hit[0]; render(); map.zoomToKommune(hit[0]);
    search.value = ""; search.blur();
  };

  // ---------------------------------------------------------------- kart
  const map = S.choropleth(document.getElementById("map"), topo, {
    onClick: (id) => { st.k = id; render(); },
    tooltip: (id) => { const I = IND[st.ind]; return `<div class="tt-title">${S.escapeHtml(K[id].name)}</div><div class="tt-row"><span>${I.name}</span><b>${I.get(K[id], st.yi) == null ? "Ingen data" : I.fmt(I.get(K[id], st.yi))}</b></div>`; },
  });

  // ---------------------------------------------------------------- sidepanel
  function decileChart(el, dec, cmp) {
    const w = Math.max(320, el.clientWidth || 420), h = 200, m = { t: 12, r: 8, b: 34, l: 36 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleBand(d3.range(10), [m.l, w - m.r]).padding(0.18);
    const y = d3.scaleLinear([0, Math.max(14, d3.max(dec), cmp ? d3.max(cmp) : 0)], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat((v) => v + " %").tickPadding(4));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickFormat((i) => i + 1).tickSizeOuter(0));
    svg.append("text").attr("x", m.l).attr("y", h - 4).attr("fill", "var(--text-3)").attr("font-size", 11).text("← lavest inntekt");
    svg.append("text").attr("x", w - m.r).attr("y", h - 4).attr("text-anchor", "end").attr("fill", "var(--text-3)").attr("font-size", 11).text("høyest inntekt →");
    svg.append("g").selectAll("rect").data(dec).join("rect").attr("x", (_, i) => x(i)).attr("width", x.bandwidth()).attr("y", (v) => y(v)).attr("height", (v) => y(0) - y(v)).attr("rx", 3)
      .attr("fill", (v) => (v >= 10 ? "var(--series-1)" : "var(--neutral-mark)"))
      .on("mousemove", (e, v) => { const i = dec.indexOf(v); tip.show(`<div class="tt-title">Tidel ${i + 1}</div><div class="tt-row"><span>Andel husholdninger</span><b>${S.pct(v, 1)}</b></div>${cmp ? `<div class="tt-row"><span>${S.escapeHtml(cmp.label)}</span><b>${S.pct(cmp[i], 1)}</b></div>` : ""}`, e.clientX, e.clientY); })
      .on("mouseleave", () => tip.hide());
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(10)).attr("y2", y(10)).attr("stroke", "var(--text)").attr("stroke-dasharray", "4 4");
    svg.append("text").attr("x", m.l + 4).attr("y", m.t + 8).attr("fill", "var(--text-2)").attr("font-size", 11.5).text("Stiplet: landet = 10 %");
    if (cmp) {
      const pts = [];
      cmp.forEach((v, i) => { pts.push([x(i) - (x.step() - x.bandwidth()) / 2, y(v)]); pts.push([x(i) + x.bandwidth() + (x.step() - x.bandwidth()) / 2, y(v)]); });
      svg.append("path").attr("d", d3.line()(pts)).attr("fill", "none").attr("stroke", "var(--series-2)").attr("stroke-width", 2);
    }
  }

  function side(values, sorted) {
    const el = document.getElementById("side");
    const I = IND[st.ind];
    if (!st.k) {
      const li = (k) => `<li><button data-k="${k}"><span class="r">${sorted.indexOf(k) + 1}</span><span>${S.escapeHtml(K[k].name)}</span><span class="v">${I.fmt(values[k])}</span></button></li>`;
      el.innerHTML = `<span class="eyebrow">${st.f ? S.escapeHtml(fylkeName(st.f)) : "Hele landet"} · ${I.years[st.yi]}</span>
        <h2 class="display big">${S.escapeHtml(I.name)}</h2>
        <p class="faint" style="font-size:13px;margin:6px 0 0">Landet: ${I.nat(st.yi) == null ? "–" : I.fmt(I.nat(st.yi))}. Klikk på en kommune i kartet eller listen for å se inntektsprofilen.</p>
        <h3>Høyest</h3><ol class="rank-list">${sorted.slice(0, 8).map(li).join("")}</ol>
        <h3>Lavest</h3><ol class="rank-list">${sorted.slice(-8).reverse().map(li).join("")}</ol>`;
      el.querySelectorAll(".rank-list button").forEach((b) => (b.onclick = () => { st.k = b.dataset.k; render(); map.zoomToKommune(b.dataset.k); }));
      return;
    }
    const k = K[st.k];
    const gl = d.gyears.length - 1, ll = d.lyears.length - 1, dl = d.dyears.length - 1;
    const rk = sorted.indexOf(st.k);
    const cell = (label, v, n) => `<div><div class="k">${label}</div><div class="v">${v}</div><div class="n">${n}</div></div>`;
    const firstDec = k.dec.findIndex((x) => x);
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
        <div><span class="eyebrow">${S.escapeHtml(fylkeName(k.f))} · ${S.int(k.pop)} innbyggere</span><h2 class="display big">${S.escapeHtml(k.name)}</h2>
        ${rk >= 0 ? `<span class="pill accent" style="margin-top:6px">Nr. ${rk + 1} av ${sorted.length} på ${S.escapeHtml(I.name.toLowerCase())}</span>` : ""}</div>
        <button class="icon-btn" id="close" aria-label="Lukk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
      <div class="kv">
        ${cell(`Gini ${d.gyears[gl]}`, f3(k.gini[gl]), `Landet ${f3(NO.gini[gl])}`)}
        ${cell(`P90/P10 ${d.gyears[gl]}`, f1(k.p9010[gl]), `Landet ${f1(NO.p9010[gl])}`)}
        ${cell(`Median inntekt etter skatt ${d.medYear}`, S.kr(k.med?.alle), `Landet ${S.kr(NO.med?.alle)}`)}
        ${cell(`Høyeste inntektstidel ${d.dyears[dl]}`, S.pct(k.dec[dl]?.[9], 1), "Landet 10 %")}
        ${cell(`Vedvarende lavinntekt ${d.lyears[ll]}`, S.pct(k.low[ll], 1), `Landet ${S.pct(NO.low[ll], 1)}`)}
        ${cell(`Barn i vedvarende lavinntekt`, k.lowc[ll] == null ? "Skjermet" : S.pct(k.lowc[ll], 1), `Landet ${S.pct(NO.lowc[ll], 1)}`)}
      </div>
      <h3>Inntektsprofil ${d.dyears[dl]}</h3>
      <p class="faint" style="font-size:12.5px;margin:-4px 0 6px">Andel av kommunens husholdninger i hver av landets ti inntektsgrupper (inntekt etter skatt). Oransje strek: ${d.dyears[firstDec]}.</p>
      <div class="chart" id="dec"></div>
      <h3>Gini over tid</h3>
      <div class="legend"><span class="item"><span class="sw line" style="background:var(--series-1)"></span>${S.escapeHtml(k.name)}</span><span class="item"><span class="sw line" style="background:var(--series-2)"></span>Landet</span></div>
      <div class="chart" id="gts"></div>
      <h3>Vedvarende lavinntekt over tid</h3>
      <div class="legend"><span class="item"><span class="sw line" style="background:var(--series-1)"></span>Barn 0–17 år</span><span class="item"><span class="sw line" style="background:var(--series-2)"></span>Alle</span><span class="item"><span class="sw dash" style="color:var(--text-3)"></span>Barn, landet</span></div>
      <div class="chart" id="lts"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><a class="btn" href="profil.html#x=inntekt&y=skatt&k=${st.k}">Kommuneprofil</a><a class="btn" href="kart.html#l=k&r=${st.k}">Skattekartet</a></div>`;
    el.querySelector("#close").onclick = () => { st.k = null; render(); };
    const cmp = k.dec[firstDec] ? Object.assign(k.dec[firstDec].slice(), { label: String(d.dyears[firstDec]) }) : null;
    if (k.dec[dl]) decileChart(el.querySelector("#dec"), k.dec[dl], cmp);
    lines(el.querySelector("#gts"), d.gyears.map((y, i) => ({ x: y, k: k.gini[i], n: NO.gini[i] })), [{ k: "k", name: k.name, color: "var(--series-1)" }, { k: "n", name: "Landet", color: "var(--series-2)" }], { h: 200, fmt: f3, yfmt: (v) => v.toFixed(2).replace(".", ",") });
    lines(el.querySelector("#lts"), d.lyears.map((y, i) => ({ x: +y.slice(-4), label: y, c: k.lowc[i], a: k.low[i], n: NO.lowc[i] })),
      [{ k: "c", name: "Barn 0–17 år", color: "var(--series-1)" }, { k: "a", name: "Alle", color: "var(--series-2)" }, { k: "n", name: "Barn, landet", color: "var(--text-3)", dash: true }], { h: 200, zero: true, fmt: (v) => S.pct(v, 1), yfmt: (v) => v + " %" });
  }

  // ---------------------------------------------------------------- spredningsplott
  function scatter() {
    const el = document.getElementById("sc");
    const w = Math.max(360, el.clientWidth || 900), h = Math.min(520, Math.max(360, w * 0.5)), m = { t: 20, r: 20, b: 44, l: 56 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const gl = d.gyears.length - 1;
    const pts = Object.entries(K).map(([id, k]) => ({ id, x: k.med?.alle, y: k.gini[gl], pop: k.pop, f: k.f })).filter((p) => p.x && p.y != null);
    const yMax = Math.min(0.4, d3.max(pts, (p) => p.y));
    const x = d3.scaleLinear(d3.extent(pts, (p) => p.x), [m.l, w - m.r]).nice();
    const y = d3.scaleLinear([d3.min(pts, (p) => p.y) - 0.01, yMax + 0.01], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat((v) => v.toFixed(2).replace(".", ",")).tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(7).tickFormat((v) => S.nf0.format(v / 1000) + "k").tickSizeOuter(0));
    svg.append("text").attr("x", w - m.r).attr("y", h - 8).attr("text-anchor", "end").attr("fill", "var(--text-2)").attr("font-size", 12.5).attr("font-weight", 600).text(`Median inntekt etter skatt, husholdninger (${d.medYear})`);
    svg.append("text").attr("x", m.l + 4).attr("y", m.t - 6).attr("fill", "var(--text-2)").attr("font-size", 12.5).attr("font-weight", 600).text(`Gini (${d.gyears[gl]})`);
    const nx = NO.med?.alle, ny = NO.gini[gl];
    svg.append("line").attr("x1", x(nx)).attr("x2", x(nx)).attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--text-3)").attr("stroke-dasharray", "3 4");
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(ny)).attr("y2", y(ny)).attr("stroke", "var(--text-3)").attr("stroke-dasharray", "3 4");
    const q = [["Rike og ulike", w - m.r - 6, m.t + 14, "end"], ["Rike og like", w - m.r - 6, h - m.b - 8, "end"], ["Mindre rike og ulike", m.l + 8, m.t + 14, "start"], ["Mindre rike og like", m.l + 8, h - m.b - 8, "start"]];
    q.forEach(([t, xx, yy, a]) => svg.append("text").attr("class", "q").attr("x", xx).attr("y", yy).attr("text-anchor", a).text(t));
    const r = d3.scaleSqrt([0, d3.max(pts, (p) => p.pop)], [2, 20]);
    const inF = (p) => !st.f || p.f === st.f;
    svg.append("g").selectAll("circle").data(pts.slice().sort((a, b) => b.pop - a.pop)).join("circle").attr("class", (p) => "dot" + (inF(p) ? "" : " dim"))
      .attr("cx", (p) => x(p.x)).attr("cy", (p) => y(Math.min(p.y, yMax + 0.01))).attr("r", (p) => r(p.pop))
      .attr("fill", "var(--series-1)").attr("fill-opacity", 0.55)
      .on("mousemove", (e, p) => tip.show(`<div class="tt-title">${S.escapeHtml(K[p.id].name)}</div><div class="tt-row"><span>Median inntekt</span><b>${S.kr(p.x)}</b></div><div class="tt-row"><span>Gini</span><b>${f3(p.y)}</b></div>${p.y > yMax + 0.01 ? `<div class="faint" style="font-size:12px">Utenfor skalaen</div>` : ""}`, e.clientX, e.clientY))
      .on("mouseleave", () => tip.hide())
      .on("click", (e, p) => { st.k = p.id; render(); document.getElementById("side").scrollIntoView({ behavior: "smooth", block: "nearest" }); });
    const lab = new Set(pts.filter(inF).sort((a, b) => b.pop - a.pop).slice(0, 4).map((p) => p.id));
    if (st.k) lab.add(st.k);
    for (const p of pts.filter((q2) => lab.has(q2.id))) {
      if (p.id === st.k) svg.append("circle").attr("cx", x(p.x)).attr("cy", y(Math.min(p.y, yMax + 0.01))).attr("r", r(p.pop) + 3).attr("fill", "none").attr("stroke", "var(--text)").attr("stroke-width", 2);
      const name = K[p.id].name.split(" - ")[0], right = x(p.x) + r(p.pop) + 4 + name.length * 7 > w - m.r;
      svg.append("text").attr("class", "lbl").attr("x", right ? x(p.x) - r(p.pop) - 4 : x(p.x) + r(p.pop) + 4).attr("text-anchor", right ? "end" : "start").attr("y", y(Math.min(p.y, yMax + 0.01)) + 4).text(name);
    }
  }

  // ---------------------------------------------------------------- tabell
  function table() {
    const gl = d.gyears.length - 1, ll = d.lyears.length - 1, dl = d.dyears.length - 1;
    const rows = Object.entries(K).filter(([id, k]) => !st.f || k.f === st.f).map(([id, k]) => ({
      id, name: k.name, fylke: fylkeName(k.f), pop: k.pop, gini: k.gini[gl], p: k.p9010[gl], med: k.med?.alle, d1: k.dec[dl]?.[0], d10: k.dec[dl]?.[9], low: k.low[ll], lowc: k.lowc[ll],
    }));
    S.sortableTable(document.getElementById("table"), [
      { key: "name", label: "Kommune", text: true }, ...(st.f ? [] : [{ key: "fylke", label: "Fylke", text: true }]),
      { key: "pop", label: "Innbyggere", fmt: S.int }, { key: "gini", label: `Gini ${d.gyears[gl]}`, fmt: f3 }, { key: "p", label: "P90/P10", fmt: f1 },
      { key: "med", label: `Median ${d.medYear}`, fmt: S.kr }, { key: "d1", label: "Laveste tidel", fmt: (v) => S.pct(v, 1) }, { key: "d10", label: "Høyeste tidel", fmt: (v) => S.pct(v, 1) },
      { key: "low", label: "Lavinntekt", fmt: (v) => S.pct(v, 1) }, { key: "lowc", label: "Barn lavinntekt", fmt: (v) => S.pct(v, 1) },
    ], rows, { sortKey: "gini", dir: -1, onRow: (id) => { st.k = id; render(); map.zoomToKommune(id); document.getElementById("map").scrollIntoView({ behavior: "smooth", block: "center" }); } });
    document.getElementById("csv").onclick = () => S.downloadCsv("inntektsulikhet-kommuner.csv", [
      ["Kommunenr", "Kommune", "Fylke", "Innbyggere", `Gini ${d.gyears[gl]}`, `P90/P10 ${d.gyears[gl]}`, `Median inntekt etter skatt ${d.medYear}`, `Laveste tidel ${d.dyears[dl]} (%)`, `Høyeste tidel ${d.dyears[dl]} (%)`, `Vedvarende lavinntekt ${d.lyears[ll]} (%)`, `Barn i vedvarende lavinntekt ${d.lyears[ll]} (%)`],
      ...rows.map((r) => [r.id, r.name, r.fylke, r.pop, r.gini, r.p, r.med, r.d1, r.d10, r.low, r.lowc].map((v) => (typeof v === "number" ? String(v).replace(".", ",") : v ?? ""))),
    ]);
  }

  // ---------------------------------------------------------------- render
  function render() {
    const I = IND[st.ind];
    indSel.value = st.ind; fySel.value = st.f;
    const values = Object.fromEntries(Object.entries(K).map(([id, k]) => [id, I.get(k, st.yi) ?? null]));
    const sorted = Object.keys(values).filter((k) => values[k] != null && (!st.f || K[k].f === st.f)).sort((a, b) => values[b] - values[a]);
    document.getElementById("map-title").textContent = `${I.name}, ${I.years[st.yi]}`;
    document.getElementById("map-sub").textContent = `Landet: ${I.nat(st.yi) == null ? "–" : I.fmt(I.nat(st.yi))}${st.f ? ` · fargene er tilpasset ${fylkeName(st.f)}` : ""}`;
    map.update({ values, fmt: I.fmt, short: I.short, title: `${I.name}, ${I.years[st.yi]}`, fylke: st.f || null, selected: st.k });
    side(values, sorted);
    scatter(); table(); writeHash();
  }
  national();
  fillYears();
  render();
  if (st.k) setTimeout(() => map.zoomToKommune(st.k), 60);
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { national(); render(); }, 200); });
  S.onThemeChange(() => render());
  document.getElementById("updated").textContent = "Data oppdatert " + new Date(d.updated).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" });
})();
