/* Studie 9 – Næringslivet */
(async function () {
  const S = window.Skatt;
  const tip = S.tooltip();
  const [d, prof, topo] = await Promise.all([
    fetch("data/naering.json").then((r) => r.json()),
    fetch("data/kommuneprofil.json").then((r) => r.json()),
    fetch("data/norge-2024.topo.json").then((r) => r.json()),
  ]);
  const K = d.kommuner, Y = d.years, LAST = Y.length - 1;
  const NACE = d.nace.map((n, i) => ({ ...n, i }));
  const TOT = 0;
  const SECT = NACE.filter((n) => n.level === "section" && n.code !== "00");
  const DET = NACE.filter((n) => n.level === "detail");
  const BYCODE = Object.fromEntries(NACE.map((n) => [n.code, n]));
  const fylkeName = (f) => d.fylker[f] || f;
  const SKATT = Object.fromEntries(prof.indicators.map((i) => [i.key, i])).skatt;
  const natArb = (yi, i) => d.national.arb[yi][i];

  const st = { nace: "03.2", metric: "share", yi: LAST, f: "", k: null };
  (function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (BYCODE[h.get("n")]) st.nace = h.get("n");
    if (["share", "lq", "n"].includes(h.get("m"))) st.metric = h.get("m");
    if (d.fylker[h.get("f")]) st.f = h.get("f");
    if (K[h.get("k")]) st.k = h.get("k");
  })();
  const writeHash = () => { const h = new URLSearchParams({ n: st.nace, m: st.metric }); if (st.f) h.set("f", st.f); if (st.k) h.set("k", st.k); history.replaceState(null, "", "#" + h); };

  const share = (k, yi, i) => (k.arb[yi][TOT] ? (100 * k.arb[yi][i]) / k.arb[yi][TOT] : null);
  const natShare = (yi, i) => (100 * natArb(yi, i)) / natArb(yi, TOT);
  const lq = (k, yi, i) => { const s = share(k, yi, i); return s == null ? null : s / natShare(yi, i); };
  function metricVal(k, yi = st.yi, i = BYCODE[st.nace].i, m = st.metric) {
    if (m === "n") return k.arb[yi][i];
    if (m === "share") return share(k, yi, i);
    return k.arb[yi][TOT] >= 50 ? lq(k, yi, i) : null; // svært små tall gir urimelige kvotienter
  }
  const fmtM = (v, m = st.metric) => (v == null ? "–" : m === "n" ? S.int(v) : m === "share" ? S.pct(v, 1) : S.nf1.format(v) + "×");

  // ---------------------------------------------------------------- KPI
  (function kpis() {
    const t = natArb(LAST, TOT), t0 = natArb(0, TOT);
    const big = SECT.slice().sort((a, b) => natArb(LAST, b.i) - natArb(LAST, a.i))[0];
    const grow = SECT.slice().sort((a, b) => natArb(LAST, b.i) / natArb(0, b.i) - natArb(LAST, a.i) / natArb(0, a.i))[0];
    const hav = BYCODE["03.2"];
    const cards = [
      { l: `Sysselsatte ${Y[LAST]}`, v: S.int(t), s: `${S.pct(100 * (t / t0 - 1), 0, true)} siden ${Y[0]}` },
      { l: "Største næring", v: big.name, s: `${S.int(natArb(LAST, big.i))} sysselsatte (${S.pct(natShare(LAST, big.i), 0)})` },
      { l: `Raskest vekst siden ${Y[0]}`, v: grow.name, s: `${S.pct(100 * (natArb(LAST, grow.i) / natArb(0, grow.i) - 1), 0, true)}` },
      { l: "Havbruk", v: S.int(natArb(LAST, hav.i)), s: `sysselsatte · ${S.pct(100 * (natArb(LAST, hav.i) / natArb(0, hav.i) - 1), 0, true)} siden ${Y[0]}` },
    ];
    document.getElementById("kpis").innerHTML = cards.map((c) => `<div class="card kpi"><div class="l">${c.l}</div><div class="v" style="font-size:${c.v.length > 14 ? 21 : 28}px">${S.escapeHtml(c.v)}</div><div class="s">${c.s}</div></div>`).join("");
  })();

  // ---------------------------------------------------------------- landet
  function frame(el, h) { const w = Math.max(360, el.clientWidth || 700); el.innerHTML = ""; return { svg: d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`), w, h }; }
  function national() {
    const el = document.getElementById("c1");
    const rows = SECT.map((n) => ({ ...n, v: natArb(LAST, n.i), v0: natArb(0, n.i) })).sort((a, b) => b.v - a.v);
    document.getElementById("c1-title").textContent = `Sysselsatte etter næring, ${Y[LAST]}`;
    document.getElementById("c1-sub").textContent = `Tallet i grått er endring siden ${Y[0]}.`;
    const rowH = 25, m = { t: 4, r: 120, b: 4, l: 210 };
    const { svg, w } = frame(el, m.t + m.b + rowH * rows.length);
    const x = d3.scaleLinear([0, d3.max(rows, (r) => r.v)], [m.l, w - m.r]);
    const g = svg.append("g").attr("class", "hbar");
    rows.forEach((r, j) => {
      const y = m.t + j * rowH, on = r.code === st.nace;
      const row = g.append("g").attr("class", "row" + (on ? " on" : "")).on("click", () => { st.nace = r.code; renderAll(); });
      row.append("rect").attr("x", 0).attr("width", w).attr("y", y).attr("height", rowH).attr("fill", "transparent");
      row.append("text").attr("class", "name").attr("x", m.l - 8).attr("y", y + rowH / 2 + 4).attr("text-anchor", "end").text(r.name);
      row.append("rect").attr("x", m.l).attr("width", x(r.v) - m.l).attr("y", y + 5).attr("height", rowH - 10).attr("rx", 3).attr("fill", on ? "var(--series-2)" : "var(--series-1)");
      row.append("text").attr("class", "val").attr("x", x(r.v) + 6).attr("y", y + rowH / 2 + 4).text(S.int(r.v));
      row.append("text").attr("class", "chg").attr("x", x(r.v) + 6 + S.int(r.v).length * 7.4 + 6).attr("y", y + rowH / 2 + 4).attr("fill", "var(--text-3)").text(S.pct(100 * (r.v / r.v0 - 1), 0, true));
      row.on("mousemove", (e) => tip.show(`<div class="tt-title">${S.escapeHtml(r.name)}</div><div class="tt-row"><span>${Y[LAST]}</span><b>${S.int(r.v)}</b></div><div class="tt-row"><span>${Y[0]}</span><b>${S.int(r.v0)}</b></div><div class="tt-row"><span>Andel ${Y[LAST]}</span><b>${S.pct(natShare(LAST, r.i), 1)}</b></div>`, e.clientX, e.clientY)).on("mouseleave", () => tip.hide());
    });
    // linje for valgt næring
    const n = BYCODE[st.nace];
    document.getElementById("c2-title").textContent = `${n.name}, ${Y[0]}–${Y[LAST]}`;
    const el2 = document.getElementById("c2");
    const h = 300, m2 = { t: 14, r: 14, b: 28, l: 56 };
    const f2 = frame(el2, h);
    const data = Y.map((yy, yi) => ({ x: yy, v: natArb(yi, n.i) }));
    const x2 = d3.scaleLinear(d3.extent(Y), [m2.l, f2.w - m2.r]);
    const y2 = d3.scaleLinear([0, d3.max(data, (r) => r.v)], [h - m2.b, m2.t]).nice();
    f2.svg.append("g").attr("class", "grid").attr("transform", `translate(${m2.l},0)`).call(d3.axisLeft(y2).ticks(5).tickSize(-(f2.w - m2.l - m2.r)).tickFormat(""));
    f2.svg.append("g").attr("class", "axis y").attr("transform", `translate(${m2.l},0)`).call(d3.axisLeft(y2).ticks(5).tickFormat((v) => (v >= 1000 ? S.nf0.format(v / 1000) + "k" : v)).tickPadding(6));
    f2.svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m2.b})`).call(d3.axisBottom(x2).ticks(8).tickFormat(d3.format("d")).tickSizeOuter(0));
    f2.svg.append("path").datum(data).attr("fill", "none").attr("stroke", "var(--series-1)").attr("stroke-width", 2.5).attr("d", d3.line().x((r) => x2(r.x)).y((r) => y2(r.v)));
    f2.svg.append("circle").attr("cx", x2(Y[st.yi])).attr("cy", y2(data[st.yi].v)).attr("r", 4.5).attr("fill", "var(--series-1)").attr("stroke", "var(--surface)").attr("stroke-width", 2);
    const cross = f2.svg.append("line").attr("y1", m2.t).attr("y2", h - m2.b).attr("stroke", "var(--border-strong)").style("display", "none");
    f2.svg.append("rect").attr("x", m2.l).attr("width", f2.w - m2.l - m2.r).attr("height", h - m2.b).attr("fill", "transparent")
      .on("mousemove", (e) => { const xv = Math.round(x2.invert(d3.pointer(e)[0])); const r = data.find((q) => q.x === xv); if (!r) return; cross.style("display", null).attr("x1", x2(xv)).attr("x2", x2(xv)); tip.show(`<div class="tt-title">${xv}</div><div class="tt-row"><span>Sysselsatte</span><b>${S.int(r.v)}</b></div><div class="tt-row"><span>Andel</span><b>${S.pct(natShare(Y.indexOf(xv), n.i), 1)}</b></div>`, e.clientX, e.clientY); })
      .on("mouseleave", () => { tip.hide(); cross.style("display", "none"); });
  }

  // ---------------------------------------------------------------- kontroller
  const naceSel = document.getElementById("nace"), yrSel = document.getElementById("yr"), fySel = document.getElementById("fy");
  naceSel.innerHTML = `<optgroup label="Hovednæringer">${SECT.map((n) => `<option value="${n.code}">${n.name}</option>`).join("")}</optgroup><optgroup label="Utvalgte bransjer">${DET.map((n) => `<option value="${n.code}">${n.name}</option>`).join("")}</optgroup>`;
  yrSel.innerHTML = Y.map((y, i) => `<option value="${i}">${y}</option>`).reverse().join("");
  fySel.innerHTML += Object.entries(d.fylker).sort((a, b) => a[1].localeCompare(b[1], "nb")).map(([id, n]) => `<option value="${id}">${S.escapeHtml(n)}</option>`).join("");
  naceSel.onchange = () => { st.nace = naceSel.value; renderAll(); };
  yrSel.onchange = () => { st.yi = +yrSel.value; renderAll(); };
  fySel.onchange = () => { st.f = fySel.value; if (st.k && st.f && K[st.k].f !== st.f) st.k = null; renderK(); };
  document.querySelectorAll("#metric button").forEach((b) => (b.onclick = () => { st.metric = b.dataset.v; renderK(); }));
  document.getElementById("klist").innerHTML = Object.values(K).map((k) => `<option value="${S.escapeHtml(k.name)} (${S.escapeHtml(fylkeName(k.f))})"></option>`).join("");
  const search = document.getElementById("search");
  search.onchange = () => {
    const v = search.value.trim().toLowerCase();
    const hit = Object.entries(K).find(([id, k]) => `${k.name} (${fylkeName(k.f)})`.toLowerCase() === v) || Object.entries(K).find(([id, k]) => k.name.toLowerCase().startsWith(v));
    if (!hit) return;
    if (st.f && hit[1].f !== st.f) st.f = "";
    st.k = hit[0]; renderK(); map.zoomToKommune(hit[0]); search.value = ""; search.blur();
  };

  const map = S.choropleth(document.getElementById("map"), topo, {
    onClick: (id) => { st.k = id; renderK(); },
    tooltip: (id) => { const k = K[id], i = BYCODE[st.nace].i; return `<div class="tt-title">${S.escapeHtml(k.name)}</div><div class="faint" style="font-size:12px;margin:-2px 0 6px">${S.escapeHtml(BYCODE[st.nace].name)}, ${Y[st.yi]}</div>
      <div class="tt-row"><span>Sysselsatte</span><b>${S.int(k.arb[st.yi][i])}</b></div><div class="tt-row"><span>Andel</span><b>${S.pct(share(k, st.yi, i), 1)}</b></div><div class="tt-row"><span>Spesialisering</span><b>${fmtM(lq(k, st.yi, i), "lq")}</b></div>`; },
  });

  // ---------------------------------------------------------------- sidepanel
  function side(sorted, values) {
    const el = document.getElementById("side");
    const n = BYCODE[st.nace];
    if (!st.k) {
      const li = (id) => `<li><button data-k="${id}"><span class="r">${sorted.indexOf(id) + 1}</span><span>${S.escapeHtml(K[id].name)}</span><span class="v">${fmtM(values[id])}</span></button></li>`;
      el.innerHTML = `<span class="eyebrow">${st.f ? S.escapeHtml(fylkeName(st.f)) : "Hele landet"} · ${Y[st.yi]}</span><h2 class="display big">${S.escapeHtml(n.name)}</h2>
        <p class="faint" style="font-size:13px;margin:6px 0 0">Landet: ${S.int(natArb(st.yi, n.i))} sysselsatte, ${S.pct(natShare(st.yi, n.i), 1)} av alle. Klikk på en kommune for å se næringsprofilen.</p>
        <h3>Høyest ${st.metric === "n" ? "antall" : st.metric === "share" ? "andel" : "spesialisering"}</h3><ol class="rank-list">${sorted.slice(0, 12).map(li).join("")}</ol>`;
      el.querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => { st.k = b.dataset.k; renderK(); map.zoomToKommune(st.k); }));
      return;
    }
    const k = K[st.k], yi = st.yi;
    const jobs = k.arb[yi][TOT], bo = k.bo[yi];
    const prof = SECT.map((s) => ({ ...s, sh: share(k, yi, s.i), nat: natShare(yi, s.i), lq: lq(k, yi, s.i), n: k.arb[yi][s.i] })).sort((a, b) => b.sh - a.sh);
    const mx = Math.max(...prof.map((p) => Math.max(p.sh, p.nat)));
    const spec = [...SECT, ...DET].map((s) => ({ ...s, lq: lq(k, yi, s.i), n: k.arb[yi][s.i] })).filter((s) => s.n >= 20 && s.lq != null).sort((a, b) => b.lq - a.lq).slice(0, 4);
    const sk = SKATT.values[st.k];
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
        <div><span class="eyebrow">${S.escapeHtml(fylkeName(k.f))} · ${Y[yi]}</span><h2 class="display big">${S.escapeHtml(k.name)}</h2></div>
        <button class="icon-btn" id="close" aria-label="Lukk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
      <div class="kv">
        <div><div class="k">Arbeidsplasser i kommunen</div><div class="v">${S.int(jobs)}</div><div class="n">${S.pct(100 * (jobs / k.arb[0][TOT] - 1), 0, true)} siden ${Y[0]}</div></div>
        <div><div class="k">Sysselsatte som bor her</div><div class="v">${S.int(bo)}</div><div class="n">${jobs > bo ? "Netto innpendling" : "Netto utpendling"}: ${S.int(Math.abs(jobs - bo))}</div></div>
        <div><div class="k">Skatt per innbygger ${SKATT.year}</div><div class="v">${sk == null ? "–" : S.kr(Math.round(sk))}</div><div class="n">Landet ${S.kr(Math.round(SKATT.national))}</div></div>
        <div><div class="k">Mest særpreget</div><div class="v" style="font-size:14px">${spec[0] ? S.escapeHtml(spec[0].name) : "–"}</div><div class="n">${spec[0] ? `${S.nf1.format(spec[0].lq)}× landet · ${S.int(spec[0].n)} sysselsatte` : ""}</div></div>
      </div>
      <h3>Næringsprofil</h3>
      <p class="faint" style="font-size:12.5px;margin:-4px 0 8px">Andel av arbeidsplassene. Den svarte streken viser landet. Klikk for å vise næringen i kartet.</p>
      <div class="prof">${prof.map((p) => `<div class="prow ${p.code === st.nace ? "on" : ""}" data-c="${p.code}" title="${S.escapeHtml(p.name)}: ${S.int(p.n)} sysselsatte, landet ${S.pct(p.nat, 1)}"><span class="n">${S.escapeHtml(p.name)}</span><div class="t"><div class="b" style="width:${(100 * p.sh) / mx}%"></div><div class="m" style="left:${(100 * p.nat) / mx}%"></div></div><span class="v">${S.pct(p.sh, 0)}</span></div>`).join("")}</div>
      ${spec.length ? `<h3>Mest særpregede næringer og bransjer</h3><div style="display:flex;flex-wrap:wrap;gap:6px">${spec.map((s) => `<button class="pill" data-c="${s.code}" style="cursor:pointer">${S.escapeHtml(s.name)} · ${S.nf1.format(s.lq)}×</button>`).join("")}</div>` : ""}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px"><a class="btn" href="kart.html#l=k&r=${st.k}">Skattekartet</a><a class="btn" href="profil.html#k=${st.k}">Kommuneprofil</a></div>`;
    el.querySelector("#close").onclick = () => { st.k = null; renderK(); };
    el.querySelectorAll("[data-c]").forEach((b) => (b.onclick = () => { st.nace = b.dataset.c; renderAll(); }));
  }

  // ---------------------------------------------------------------- spredningsplott mot skatt
  function scatter() {
    const n = BYCODE[st.nace], el = document.getElementById("sc");
    document.getElementById("sc-title").textContent = `${n.name} og skatteinngang`;
    document.getElementById("sc-sub").textContent = `Andel av arbeidsplassene i ${n.name.toLowerCase()} (${Y[st.yi]}) mot skatteinngang per innbygger (${SKATT.year}). Prikkstørrelsen viser antall arbeidsplasser.`;
    const w = Math.max(360, el.clientWidth || 900), h = Math.min(500, Math.max(340, w * 0.45)), m = { t: 16, r: 20, b: 44, l: 64 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const pts = Object.entries(K).map(([id, k]) => ({ id, x: share(k, st.yi, n.i), y: SKATT.values[id], s: k.arb[st.yi][TOT], f: k.f })).filter((p) => p.x != null && p.y != null);
    const x = d3.scaleSqrt([0, d3.max(pts, (p) => p.x)], [m.l, w - m.r]).nice();
    const y = d3.scaleLinear(d3.extent(pts, (p) => p.y), [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat((v) => S.nf0.format(v / 1000) + "k").tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat((v) => v + " %").tickSizeOuter(0));
    svg.append("text").attr("x", w - m.r).attr("y", h - 8).attr("text-anchor", "end").attr("fill", "var(--text-2)").attr("font-size", 12.5).attr("font-weight", 600).text(`Andel i ${n.name.toLowerCase()} (kvadratrotskala)`);
    svg.append("text").attr("x", m.l + 4).attr("y", m.t + 4).attr("fill", "var(--text-2)").attr("font-size", 12.5).attr("font-weight", 600).text("Skatt per innbygger");
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(SKATT.national)).attr("y2", y(SKATT.national)).attr("stroke", "var(--text-3)").attr("stroke-dasharray", "3 4");
    svg.append("line").attr("x1", x(natShare(st.yi, n.i))).attr("x2", x(natShare(st.yi, n.i))).attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--text-3)").attr("stroke-dasharray", "3 4");
    const r = d3.scaleSqrt([0, d3.max(pts, (p) => p.s)], [2, 18]);
    const inF = (p) => !st.f || p.f === st.f;
    svg.append("g").selectAll("circle").data(pts.sort((a, b) => b.s - a.s)).join("circle").attr("class", (p) => "dot" + (inF(p) ? "" : " dim"))
      .attr("cx", (p) => x(p.x)).attr("cy", (p) => y(p.y)).attr("r", (p) => r(p.s)).attr("fill", "var(--series-1)").attr("fill-opacity", 0.55)
      .on("mousemove", (e, p) => tip.show(`<div class="tt-title">${S.escapeHtml(K[p.id].name)}</div><div class="tt-row"><span>Andel i ${S.escapeHtml(n.name.toLowerCase())}</span><b>${S.pct(p.x, 1)}</b></div><div class="tt-row"><span>Skatt per innbygger</span><b>${S.kr(Math.round(p.y))}</b></div>`, e.clientX, e.clientY))
      .on("mouseleave", () => tip.hide())
      .on("click", (e, p) => { st.k = p.id; renderK(); document.getElementById("side").scrollIntoView({ behavior: "smooth", block: "nearest" }); });
    const lab = new Set(pts.filter(inF).sort((a, b) => b.x * b.y - a.x * a.y).slice(0, 5).map((p) => p.id));
    if (st.k) lab.add(st.k);
    const placed = [];
    for (const p of pts.filter((q) => lab.has(q.id)).sort((a, b) => (a.id === st.k ? -1 : 1))) {
      const name = K[p.id].name.split(" - ")[0], right = x(p.x) + r(p.s) + 4 + name.length * 7 > w - m.r;
      const bx = right ? x(p.x) - r(p.s) - 4 - name.length * 7 : x(p.x) + r(p.s) + 4, by = y(p.y) - 8;
      if (placed.some((b) => Math.abs(b[1] - by) < 14 && bx < b[0] + b[2] && b[0] < bx + name.length * 7)) continue;
      placed.push([bx, by, name.length * 7]);
      if (p.id === st.k) svg.append("circle").attr("cx", x(p.x)).attr("cy", y(p.y)).attr("r", r(p.s) + 3).attr("fill", "none").attr("stroke", "var(--text)").attr("stroke-width", 2);
      svg.append("text").attr("class", "lbl").attr("x", right ? x(p.x) - r(p.s) - 4 : x(p.x) + r(p.s) + 4).attr("text-anchor", right ? "end" : "start").attr("y", y(p.y) + 4).text(name);
    }
  }

  // ---------------------------------------------------------------- render
  function renderK() {
    const n = BYCODE[st.nace];
    naceSel.value = st.nace; yrSel.value = st.yi; fySel.value = st.f;
    document.querySelectorAll("#metric button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === st.metric)));
    const values = Object.fromEntries(Object.entries(K).map(([id, k]) => [id, metricVal(k)]));
    const sorted = Object.keys(values).filter((id) => values[id] != null && (!st.f || K[id].f === st.f)).sort((a, b) => values[b] - values[a]);
    const mName = st.metric === "n" ? "Sysselsatte" : st.metric === "share" ? "Andel av sysselsatte" : "Spesialisering";
    document.getElementById("map-title").textContent = `${n.name} – ${mName.toLowerCase()}, ${Y[st.yi]}`;
    document.getElementById("map-sub").textContent = `Etter arbeidssted. Landet: ${S.pct(natShare(st.yi, n.i), 1)} av de sysselsatte.${st.metric === "lq" ? " Kommuner med under 50 arbeidsplasser er utelatt." : ""}`;
    map.update({ values, fmt: (v) => fmtM(v), short: (v) => (st.metric === "n" ? (v >= 1000 ? S.nf0.format(v / 1000) + "k" : S.nf0.format(v)) : st.metric === "share" ? S.pct(v, v < 10 ? 1 : 0) : S.nf1.format(v) + "×"), title: `${n.name}: ${mName.toLowerCase()}`, fylke: st.f || null, selected: st.k });
    side(sorted, values);
    scatter();
    const rows = Object.entries(K).filter(([id, k]) => !st.f || k.f === st.f).map(([id, k]) => ({ id, name: k.name, fylke: fylkeName(k.f), jobs: k.arb[st.yi][TOT], bo: k.bo[st.yi], n: k.arb[st.yi][n.i], sh: share(k, st.yi, n.i), lq: metricVal(k, st.yi, n.i, "lq"), sk: SKATT.values[id] }));
    document.getElementById("tbl-sub").textContent = `${n.name}, ${Y[st.yi]}. Klikk på en kolonne for å sortere, eller på en rad for å se kommunen.`;
    S.sortableTable(document.getElementById("table"), [
      { key: "name", label: "Kommune", text: true }, ...(st.f ? [] : [{ key: "fylke", label: "Fylke", text: true }]),
      { key: "jobs", label: "Arbeidsplasser", fmt: S.int }, { key: "bo", label: "Sysselsatte bosatte", fmt: S.int },
      { key: "n", label: n.name, fmt: S.int }, { key: "sh", label: "Andel", fmt: (v) => S.pct(v, 1) }, { key: "lq", label: "Spesialisering", fmt: (v) => fmtM(v, "lq") },
      { key: "sk", label: `Skatt per innb. ${SKATT.year}`, fmt: (v) => (v == null ? "–" : S.kr(Math.round(v))) },
    ], rows, { sortKey: st.metric === "n" ? "n" : st.metric === "share" ? "sh" : "lq", dir: -1, onRow: (id) => { st.k = id; renderK(); map.zoomToKommune(id); document.getElementById("map").scrollIntoView({ behavior: "smooth", block: "center" }); } });
    document.getElementById("csv").onclick = () => S.downloadCsv(`sysselsatte-naering-kommuner-${Y[st.yi]}.csv`, [
      ["Kommunenr", "Kommune", "Fylke", "Arbeidsplasser", "Sysselsatte bosatte", ...NACE.slice(1).map((x) => `${x.name} (${x.code})`)],
      ...Object.entries(K).map(([id, k]) => [id, k.name, fylkeName(k.f), k.arb[st.yi][TOT], k.bo[st.yi], ...NACE.slice(1).map((x) => k.arb[st.yi][x.i])]),
    ]);
    writeHash();
  }
  function renderAll() { national(); renderK(); }
  renderAll();
  if (st.k) setTimeout(() => map.zoomToKommune(st.k), 60);
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(renderAll, 200); });
  S.onThemeChange(() => renderK());
  document.getElementById("updated").textContent = "Data oppdatert av SSB " + new Date(d.updated).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" });
})();
