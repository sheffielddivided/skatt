/* Studie 20 – Sykefraværet i kommunene */
(async function () {
  const S = window.Skatt;
  const tip = S.tooltip();
  const [d, topo, prof] = await Promise.all([
    fetch("data/sykefravaer.json").then((r) => r.json()),
    fetch("data/norge-2024.topo.json").then((r) => r.json()),
    fetch("data/kommuneprofil.json").then((r) => r.json()),
  ]);
  const K = d.kommuner, NO = d.norge, Y = d.years, L = Y.length - 1;
  const fylkeName = (f) => d.fylker[f]?.name || f;
  const P = Object.fromEntries(prof.indicators.map((i) => [i.key, i]));
  const pop = (id) => P.pop?.values[id] ?? 1000;
  const i19 = Y.indexOf(2019);
  const AGES = { "20_66": "20–66 år", "20_29": "20–29 år", "30_44": "30–44 år", "45_54": "45–54 år", "55_66": "55–66 år" };
  const KJ = { 0: "Alle", 1: "Menn", 2: "Kvinner" };
  const pc = (v, dg = 1) => (v == null ? "–" : S.pct(v, dg));
  const pp = (v) => (v == null ? "–" : S.signed(S.nf1.format(v) + " pp.", v));

  // ---------------------------------------------------------------- mål
  const st = { ind: "rate", kj: "0", age: "20_66", yi: L, f: "", k: null, scx: "ufore" };
  (function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (["rate", "std", "chg"].includes(h.get("i"))) st.ind = h.get("i");
    if (d.fylker[h.get("f")]) st.f = h.get("f");
    if (K[h.get("k")]) st.k = h.get("k");
  })();
  const writeHash = () => { const h = new URLSearchParams({ i: st.ind }); if (st.f) h.set("f", st.f); if (st.k) h.set("k", st.k); history.replaceState(null, "", "#" + h); };
  const rateKey = () => (st.age === "20_66" ? `rate_${st.kj}` : `rate_${st.kj}_${st.age}`);
  function getV(o, yi = st.yi) {
    if (!o) return null;
    if (st.ind === "std") return o[`std_${st.kj}`]?.[yi] ?? null;
    const s = o[rateKey()];
    if (!s) return null;
    if (st.ind === "chg") return s[yi] != null && s[i19] != null ? s[yi] - s[i19] : null;
    return s[yi] ?? null;
  }
  const indName = () => {
    const who = `${st.kj === "0" ? "" : KJ[st.kj].toLowerCase() + ", "}${st.ind === "std" ? "20–66 år" : AGES[st.age]}`;
    return st.ind === "std" ? `Sykefravær justert for alder og kjønn (${who})` : st.ind === "chg" ? `Endring i sykefravær siden 2019 (${who})` : `Sykefravær (${who})`;
  };
  const fmt = (v) => (st.ind === "chg" ? pp(v) : pc(v));
  const short = (v) => (st.ind === "chg" ? S.signed(S.nf1.format(v), v) : S.nf1.format(v));

  // ---------------------------------------------------------------- KPI
  (function kpis() {
    const big = Object.entries(K).filter(([id]) => pop(id) >= 20000);
    const hi = big.slice().sort((a, b) => b[1].std_0[L] - a[1].std_0[L]);
    const all = Object.entries(K).filter(([, k]) => k.std_0[L] != null).sort((a, b) => b[1].std_0[L] - a[1].std_0[L]);
    const cards = [
      { l: `Sykefravær ${Y[L]}`, v: pc(NO.rate_0[L]), s: `${pp(NO.rate_0[L] - NO.rate_0[i19])} siden 2019 · ${pc(NO.rate_0[0])} i ${Y[0]}` },
      { l: "Kvinner og menn", v: `${pc(NO.rate_2[L])} / ${pc(NO.rate_1[L])}`, s: "Kvinner har nesten dobbelt så høyt fravær" },
      { l: "Høyest og lavest (justert)", v: `${S.escapeHtml(all[0][1].name)}`, s: `${pc(all[0][1].std_0[L])} · lavest: ${S.escapeHtml(all[all.length - 1][1].name)} (${pc(all[all.length - 1][1].std_0[L])})` },
      { l: "Blant kommuner over 20 000 innb.", v: S.escapeHtml(hi[0][1].name), s: `${pc(hi[0][1].std_0[L])} justert · lavest: ${S.escapeHtml(hi[hi.length - 1][1].name)} (${pc(hi[hi.length - 1][1].std_0[L])})` },
    ];
    document.getElementById("kpis").innerHTML = cards.map((c) => `<div class="card kpi"><div class="l">${c.l}</div><div class="v">${c.v}</div><div class="s">${c.s}</div></div>`).join("");
  })();

  // ---------------------------------------------------------------- linjediagram
  function lines(el, legendEl, ser, opts = {}) {
    if (legendEl) legendEl.innerHTML = ser.map((s) => `<span class="item"><span class="sw ${s.dash ? "dash" : "line"}" style="background:${s.c};color:${s.c}"></span>${S.escapeHtml(s.n)}</span>`).join("");
    const w = Math.max(280, el.clientWidth || 500), h = opts.h || 260, m = { t: 12, r: 12, b: 26, l: 40 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear(d3.extent(Y), [m.l, w - m.r]);
    const all = ser.flatMap((s) => s.v).filter((v) => v != null);
    const y = d3.scaleLinear([0, Math.max(4, d3.max(all) * 1.1)], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => v + " %").tickPadding(4));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(Math.min(10, w / 60)).tickFormat(d3.format("d")).tickSizeOuter(0));
    ser.forEach((s) => {
      const pts = Y.map((yy, i) => [yy, s.v[i]]).filter((p) => p[1] != null);
      svg.append("path").datum(pts).attr("fill", "none").attr("stroke", s.c).attr("stroke-width", s.w || 2).attr("stroke-dasharray", s.dash ? "5 4" : null).attr("d", d3.line().x((p) => x(p[0])).y((p) => y(p[1])));
    });
    const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--border-strong)").style("display", "none");
    svg.append("rect").attr("x", m.l).attr("width", w - m.l - m.r).attr("height", h - m.b).attr("fill", "transparent")
      .on("mousemove", (e) => { const yy = Math.round(x.invert(d3.pointer(e)[0])), i = Y.indexOf(yy); if (i < 0) return; cross.style("display", null).attr("x1", x(yy)).attr("x2", x(yy));
        tip.show(`<div class="tt-title">${yy}</div>${ser.map((s) => `<div class="tt-row"><span><span class="key" style="background:${s.c}"></span>${S.escapeHtml(s.n)}</span><b>${pc(s.v[i])}</b></div>`).join("")}`, e.clientX, e.clientY); })
      .on("mouseleave", () => { tip.hide(); cross.style("display", "none"); });
  }
  function national() {
    lines(document.getElementById("n1"), document.getElementById("n1-legend"), [
      { n: "Kvinner", v: NO.rate_2, c: "var(--series-5)", w: 2.5 }, { n: "Alle", v: NO.rate_0, c: "var(--text)", w: 2.5 }, { n: "Menn", v: NO.rate_1, c: "var(--series-1)", w: 2.5 },
    ]);
    const cols = ["var(--series-3)", "var(--series-1)", "var(--series-4)", "var(--series-5)"];
    lines(document.getElementById("n2"), document.getElementById("n2-legend"), Object.keys(AGES).slice(1).reverse().map((a, i) => ({ n: AGES[a], v: NO[`rate_0_${a}`], c: cols[i], w: 2.2 })));
  }

  // ---------------------------------------------------------------- kontroller
  const indSel = document.getElementById("ind"), ageSel = document.getElementById("age"), yrSel = document.getElementById("yr"), fySel = document.getElementById("fy");
  fySel.innerHTML += Object.entries(d.fylker).sort((a, b) => a[1].name.localeCompare(b[1].name, "nb")).map(([f, v]) => `<option value="${f}">${S.escapeHtml(v.name)}</option>`).join("");
  yrSel.innerHTML = Y.map((y, i) => `<option value="${i}">${y}</option>`).reverse().join("");
  yrSel.value = st.yi;
  indSel.onchange = () => { st.ind = indSel.value; if (st.ind === "chg" && st.yi <= i19) st.yi = L; render(); };
  ageSel.onchange = () => { st.age = ageSel.value; render(); };
  yrSel.onchange = () => { st.yi = +yrSel.value; render(); };
  fySel.onchange = () => { st.f = fySel.value; if (st.k && st.f && K[st.k].f !== st.f) st.k = null; render(); };
  document.querySelectorAll("#kj button").forEach((b) => (b.onclick = () => { st.kj = b.dataset.v; document.querySelectorAll("#kj button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); render(); }));
  document.getElementById("klist").innerHTML = Object.values(K).map((k) => `<option value="${S.escapeHtml(k.name)} (${S.escapeHtml(fylkeName(k.f))})"></option>`).join("");
  const search = document.getElementById("search");
  search.onchange = () => {
    const v = search.value.trim().toLowerCase();
    const hit = Object.entries(K).find(([, k]) => `${k.name} (${fylkeName(k.f)})`.toLowerCase() === v) || Object.entries(K).find(([, k]) => k.name.toLowerCase().startsWith(v));
    if (!hit) return;
    if (st.f && hit[1].f !== st.f) st.f = "";
    st.k = hit[0]; render(); map.zoomToKommune(hit[0]);
    search.value = ""; search.blur();
  };

  // ---------------------------------------------------------------- kart
  const map = S.choropleth(document.getElementById("map"), topo, {
    onClick: (id) => { st.k = id; render(); },
    tooltip: (id) => { const k = K[id]; if (!k) return ""; const v = getV(k);
      return `<div class="tt-title">${S.escapeHtml(k.name)}</div><div class="tt-row"><span>${S.escapeHtml(indName())}</span><b>${v == null ? "Ingen data" : fmt(v)}</b></div><div class="tt-row"><span>Kvinner / menn</span><b>${pc(k.rate_2[st.yi])} / ${pc(k.rate_1[st.yi])}</b></div><div class="tt-row"><span>Justert, landet = 100</span><b>${k.smr_0[st.yi] == null ? "–" : S.nf0.format(k.smr_0[st.yi])}</b></div>`; },
  });

  // ---------------------------------------------------------------- sidepanel
  function ageBars(el, k) {
    const ages = Object.keys(AGES).slice(1);
    const w = Math.max(280, el.clientWidth || 420), h = 210, m = { t: 14, r: 8, b: 30, l: 36 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("class", "bars").attr("viewBox", `0 0 ${w} ${h}`);
    const x0 = d3.scaleBand(ages, [m.l, w - m.r]).padding(0.22), x1 = d3.scaleBand(["2", "1"], [0, x0.bandwidth()]).padding(0.08);
    const vals = ages.flatMap((a) => ["1", "2"].map((s) => k[`rate_${s}_${a}`]?.[st.yi])).concat(ages.flatMap((a) => ["1", "2"].map((s) => NO[`rate_${s}_${a}`][st.yi]))).filter((v) => v != null);
    const y = d3.scaleLinear([0, d3.max(vals) * 1.1], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat((v) => v + " %").tickPadding(4));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x0).tickFormat((a) => AGES[a].replace(" år", "")).tickSizeOuter(0));
    ages.forEach((a) => ["2", "1"].forEach((s) => {
      const v = k[`rate_${s}_${a}`]?.[st.yi], n = NO[`rate_${s}_${a}`][st.yi], xx = x0(a) + x1(s);
      const g = svg.append("g").on("mousemove", (e) => tip.show(`<div class="tt-title">${KJ[s]}, ${AGES[a]}</div><div class="tt-row"><span>${S.escapeHtml(k.name)}</span><b>${v == null ? "Skjermet" : pc(v)}</b></div><div class="tt-row"><span>Landet</span><b>${pc(n)}</b></div>`, e.clientX, e.clientY)).on("mouseleave", () => tip.hide());
      if (v != null) g.append("rect").attr("x", xx).attr("width", x1.bandwidth()).attr("y", y(v)).attr("height", y(0) - y(v)).attr("rx", 2).attr("fill", s === "2" ? "var(--series-5)" : "var(--series-1)");
      else g.append("rect").attr("x", xx).attr("width", x1.bandwidth()).attr("y", m.t).attr("height", y(0) - m.t).attr("fill", "transparent");
      g.append("line").attr("x1", xx - 1).attr("x2", xx + x1.bandwidth() + 1).attr("y1", y(n)).attr("y2", y(n)).attr("stroke", "var(--text)").attr("stroke-width", 2);
    }));
  }
  function side(values, sorted) {
    const el = document.getElementById("side");
    if (!st.k) {
      const li = (id) => `<li><button data-k="${id}"><span class="r">${sorted.indexOf(id) + 1}</span><span>${S.escapeHtml(K[id].name)}</span><span class="v">${fmt(values[id])}</span></button></li>`;
      const nat = getV(NO);
      el.innerHTML = `<span class="eyebrow">${st.f ? S.escapeHtml(fylkeName(st.f)) : "Hele landet"} · ${Y[st.yi]}</span>
        <h2 class="display big">${S.escapeHtml(indName())}</h2>
        <p class="faint" style="font-size:13px;margin:6px 0 0">Landet: ${nat == null ? "–" : fmt(nat).replace(/\.$/, "")}. Klikk på en kommune i kartet eller listen for å se detaljer.</p>
        <h3>Høyest</h3><ol class="rank-list">${sorted.slice(0, 8).map(li).join("")}</ol>
        <h3>Lavest</h3><ol class="rank-list">${sorted.slice(-8).reverse().map(li).join("")}</ol>`;
      el.querySelectorAll(".rank-list button").forEach((b) => (b.onclick = () => { st.k = b.dataset.k; render(); map.zoomToKommune(b.dataset.k); }));
      return;
    }
    const k = K[st.k], fy = d.fylker[k.f], yi = st.yi, rk = sorted.indexOf(st.k);
    const cell = (label, v, n) => `<div><div class="k">${label}</div><div class="v">${v}</div><div class="n">${n}</div></div>`;
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
        <div><span class="eyebrow">${S.escapeHtml(fylkeName(k.f))} · ${S.int(pop(st.k))} innbyggere</span><h2 class="display big">${S.escapeHtml(k.name)}</h2>
        ${rk >= 0 ? `<span class="pill accent" style="margin-top:6px">Nr. ${rk + 1} av ${sorted.length} på ${S.escapeHtml(indName().toLowerCase())}</span>` : ""}</div>
        <button class="icon-btn" id="close" aria-label="Lukk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
      <div class="kv">
        ${cell(`Sykefravær ${Y[yi]}`, pc(k.rate_0[yi]), `Landet ${pc(NO.rate_0[yi])}`)}
        ${cell("Justert for alder og kjønn", pc(k.std_0[yi]), `Forholdstall ${k.smr_0[yi] == null ? "–" : S.nf0.format(k.smr_0[yi])} (landet = 100)`)}
        ${cell("Kvinner", pc(k.rate_2[yi]), `Landet ${pc(NO.rate_2[yi])}`)}
        ${cell("Menn", pc(k.rate_1[yi]), `Landet ${pc(NO.rate_1[yi])}`)}
        ${cell("Endring siden 2019", k.rate_0[yi] != null && k.rate_0[i19] != null ? pp(k.rate_0[yi] - k.rate_0[i19]) : "–", `Landet ${pp(NO.rate_0[yi] - NO.rate_0[i19])}`)}
        ${cell("Tapte dagsverk", S.int(k.dagsverk[yi]), `≈ ${S.int(k.dagsverk[yi] / 230)} årsverk`)}
      </div>
      <h3>Over tid</h3>
      <div class="legend" id="kts-legend"></div>
      <div class="chart" id="kts"></div>
      <h3>Etter alder og kjønn, ${Y[yi]}</h3>
      <p class="faint" style="font-size:12.5px;margin:-4px 0 6px">Søyler: ${S.escapeHtml(k.name)} (rosa: kvinner, blå: menn). Strek: landet.</p>
      <div class="chart" id="kage"></div>`;
    document.getElementById("close").onclick = () => { st.k = null; render(); };
    lines(document.getElementById("kts"), document.getElementById("kts-legend"), [
      { n: k.name, v: k.rate_0, c: "var(--series-1)", w: 2.5 }, { n: fy?.name || "Fylket", v: fy?.rate_0 || [], c: "var(--series-3)" }, { n: "Landet", v: NO.rate_0, c: "var(--text-3)", dash: true },
    ], { h: 200 });
    ageBars(document.getElementById("kage"), k);
  }

  // ---------------------------------------------------------------- spredningsplott
  const SCX = ["ufore", "stonad", "sosial", "grunnskole", "hoyutd", "inntekt", "a67", "syss", "vekst", "med"].filter((x) => P[x]);
  const scxSel = document.getElementById("scx");
  scxSel.innerHTML = SCX.map((x) => `<option value="${x}">${S.escapeHtml(P[x].name)} (${P[x].year})</option>`).join("");
  scxSel.value = st.scx;
  scxSel.onchange = () => { st.scx = scxSel.value; scatter(); };
  function scatter() {
    const el = document.getElementById("sc"), xi = P[st.scx];
    const pts = Object.keys(K).filter((id) => K[id].std_0[L] != null && xi.values[id] != null && (!st.f || K[id].f === st.f)).map((id) => ({ id, x: xi.values[id], y: K[id].std_0[L], p: pop(id) }));
    const mx = d3.mean(pts, (p) => p.x), my = d3.mean(pts, (p) => p.y);
    const r = d3.sum(pts, (p) => (p.x - mx) * (p.y - my)) / Math.sqrt(d3.sum(pts, (p) => (p.x - mx) ** 2) * d3.sum(pts, (p) => (p.y - my) ** 2));
    const word = Math.abs(r) < 0.1 ? "ingen tydelig" : Math.abs(r) < 0.3 ? "svak" : Math.abs(r) < 0.5 ? "moderat" : "sterk";
    document.getElementById("sc-sub").textContent = `Sykefravær justert for alder og kjønn (${Y[L]}) mot et annet kjennetegn ved kommunen. Hver prikk er en kommune, størrelsen viser folketallet.`;
    const tst = S.stats.signif(r, pts.length), rt = (v) => v.toFixed(2).replace(".", ",").replace("-", "−");
    document.getElementById("sc-corr").innerHTML = `<span class="pill accent">r = ${rt(r)}</span> ${word} ${r > 0 ? "positiv" : "negativ"} sammenheng blant ${pts.length} kommuner${st.f ? ` i ${S.escapeHtml(fylkeName(st.f))}` : ""} · 95 % KI ${rt(tst.lo)} til ${rt(tst.hi)} · <span title="Tosidig t-test: t = ${S.nf1.format(tst.t).replace("-", "−")}, ${tst.df} frihetsgrader. Nabokommuner ligner ofte på hverandre, så p-verdien er noe for optimistisk.">${S.stats.fmtP(tst.p)}, ${tst.p < 0.05 ? "statistisk signifikant" : "ikke statistisk signifikant"}</span>`;
    const w = Math.max(300, el.clientWidth || 900), h = Math.min(480, Math.max(320, w * 0.5)), m = { t: 12, r: 16, b: 42, l: 46 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear(d3.extent(pts, (p) => p.x), [m.l, w - m.r]).nice(), y = d3.scaleLinear(d3.extent(pts, (p) => p.y), [h - m.b, m.t]).nice();
    const rs = d3.scaleSqrt([0, d3.max(pts, (p) => p.p)], [2, 18]);
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => v + " %").tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat((v) => (xi.unit === "kr" ? S.nf0.format(v / 1000) + "k" : S.nf0.format(v))).tickSizeOuter(0));
    svg.append("text").attr("x", w - m.r).attr("y", h - 6).attr("text-anchor", "end").attr("fill", "var(--text-3)").attr("font-size", 11.5).text(`${xi.name} (${xi.unit}) →`);
    const b = d3.sum(pts, (p) => (p.x - mx) * (p.y - my)) / d3.sum(pts, (p) => (p.x - mx) ** 2), a = my - b * mx, xd = x.domain();
    svg.append("line").attr("x1", x(xd[0])).attr("x2", x(xd[1])).attr("y1", y(a + b * xd[0])).attr("y2", y(a + b * xd[1])).attr("stroke", "var(--text-2)").attr("stroke-dasharray", "6 4").attr("opacity", 0.7);
    svg.append("g").selectAll("circle").data(pts.sort((p, q) => q.p - p.p)).join("circle").attr("class", "dot")
      .attr("cx", (p) => x(p.x)).attr("cy", (p) => y(p.y)).attr("r", (p) => rs(p.p)).attr("fill", (p) => (p.id === st.k ? "var(--series-2)" : "var(--series-1)")).attr("fill-opacity", 0.7)
      .on("mousemove", (e, p) => tip.show(`<div class="tt-title">${S.escapeHtml(K[p.id].name)}</div><div class="tt-row"><span>Sykefravær, justert</span><b>${pc(p.y)}</b></div><div class="tt-row"><span>${S.escapeHtml(xi.name)}</span><b>${xi.unit === "kr" ? S.kr(p.x) : S.nf1.format(p.x) + (xi.unit.startsWith("%") ? " %" : "")}</b></div>`, e.clientX, e.clientY))
      .on("mouseleave", () => tip.hide())
      .on("click", (e, p) => { st.k = p.id; render(); map.zoomToKommune(p.id); document.getElementById("map").scrollIntoView({ behavior: "smooth", block: "center" }); });
    const sel = pts.find((p) => p.id === st.k);
    if (sel) svg.append("text").attr("class", "lbl").attr("x", x(sel.x) + rs(sel.p) + 4).attr("y", y(sel.y) + 4).text(K[sel.id].name);
  }

  // ---------------------------------------------------------------- tabell
  function table() {
    const yi = st.yi;
    const rows = Object.entries(K).filter(([, k]) => !st.f || k.f === st.f).map(([id, k]) => ({
      id, name: k.name, fylke: fylkeName(k.f), pop: pop(id), rate: k.rate_0[yi], std: k.std_0[yi], smr: k.smr_0[yi], kv: k.rate_2[yi], me: k.rate_1[yi],
      chg: k.rate_0[yi] != null && k.rate_0[i19] != null ? k.rate_0[yi] - k.rate_0[i19] : null,
    }));
    document.getElementById("tbl-sub").textContent = `${Y[yi]}${st.f ? `, ${fylkeName(st.f)}` : ""}. Klikk på en kolonne for å sortere, eller på en rad for å se kommunen.`;
    S.sortableTable(document.getElementById("table"), [
      { key: "name", label: "Kommune", text: true }, { key: "fylke", label: "Fylke", text: true }, { key: "pop", label: "Innbyggere", fmt: (v) => S.int(v) },
      { key: "rate", label: "Sykefravær", fmt: (v) => pc(v) }, { key: "std", label: "Justert", fmt: (v) => pc(v) }, { key: "smr", label: "Landet = 100", fmt: (v) => (v == null ? "–" : S.nf0.format(v)) },
      { key: "kv", label: "Kvinner", fmt: (v) => pc(v) }, { key: "me", label: "Menn", fmt: (v) => pc(v) }, { key: "chg", label: "Siden 2019", fmt: pp },
    ], rows, { sortKey: "std", dir: -1, onRow: (id) => { st.k = id; render(); map.zoomToKommune(id); document.getElementById("map").scrollIntoView({ behavior: "smooth", block: "center" }); } });
    const dec = (v) => (v == null ? "" : String(Math.round(v * 100) / 100).replace(".", ","));
    document.getElementById("csv").onclick = () => S.downloadCsv(`sykefravaer-kommuner-${Y[yi]}.csv`, [
      ["Kommunenr", "Kommune", "Fylke", "Innbyggere", `Sykefravær ${Y[yi]} (%)`, "Justert for alder og kjønn (%)", "Forholdstall (landet = 100)", "Kvinner (%)", "Menn (%)", "Endring siden 2019 (prosentpoeng)"],
      ...rows.map((r) => [r.id, r.name, r.fylke, r.pop, dec(r.rate), dec(r.std), dec(r.smr), dec(r.kv), dec(r.me), dec(r.chg)]),
    ]);
  }

  // ---------------------------------------------------------------- render
  function render() {
    indSel.value = st.ind; fySel.value = st.f; yrSel.value = st.yi; ageSel.value = st.age;
    ageSel.disabled = st.ind === "std";
    if (st.ind === "std") st.age = "20_66";
    const values = Object.fromEntries(Object.entries(K).map(([id, k]) => [id, getV(k)]));
    const sorted = Object.keys(values).filter((id) => values[id] != null && (!st.f || K[id].f === st.f)).sort((a, b) => values[b] - values[a]);
    const nat = getV(NO);
    document.getElementById("map-title").textContent = `${indName()}, ${Y[st.yi]}`;
    document.getElementById("map-sub").textContent = `Landet: ${nat == null ? "–" : fmt(nat)}${st.f ? ` · fargene er tilpasset ${fylkeName(st.f)}` : ""}`;
    document.getElementById("ind-note").textContent = st.ind === "std" ? "Justert: Viser hva fraværet ville vært om kommunen hadde samme alders- og kjønnssammensetning som landet. Gir den mest rettferdige sammenligningen." : st.ind === "chg" ? `Endring i prosentpoeng fra 2019 til ${Y[st.yi]}. Blått: økt. Rødt: gått ned.` : "Sykefraværsdagsverk i prosent av avtalte dagsverk. Påvirkes av hvor mange eldre og kvinner som bor i kommunen.";
    map.update({ values, fmt, short, title: `${indName()}, ${Y[st.yi]}`, fylke: st.f || null, selected: st.k, diverging: st.ind === "chg" });
    side(values, sorted);
    scatter(); table(); writeHash();
  }
  national();
  render();
  if (st.k) setTimeout(() => map.zoomToKommune(st.k), 60);
  let rt, lastW = innerWidth;
  window.addEventListener("resize", () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rt); rt = setTimeout(() => { national(); render(); }, 200); });
  S.onThemeChange(() => render());
  document.getElementById("updated").textContent = `Data hentet ${d.fetched}`;
})();
