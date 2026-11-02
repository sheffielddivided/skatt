/* Studie 4 – Kommuneprofilen */
(async function () {
  const S = window.Skatt;
  const tip = S.tooltip();
  const [d, topo] = await Promise.all([
    fetch(document.body.dataset.src || "data/kommuneprofil.json").then((r) => r.json()),
    fetch("data/norge-2024.topo.json").then((r) => r.json()),
  ]);
  const K = d.kommuner;
  const IND = Object.fromEntries(d.indicators.map((i) => [i.key, i]));
  const ORDER = d.indicators.map((i) => i.key);
  const GROUPS = [...new Set(d.indicators.map((i) => i.group))];
  const LOG = new Set(["pop", "formue", ...d.indicators.filter((i) => i.log).map((i) => i.key)]);
  const fylkeName = (f) => d.fylker[f] || f;

  // ---------------------------------------------------------------- format
  function fmt(key, v, short = false) {
    if (v == null || !isFinite(v)) return "–";
    const i = IND[key];
    if (i.unit === "kr") return short && v >= 10000 ? S.nf0.format(Math.round(v / 1000)) + "k" : S.kr(Math.round(v));
    if (i.unit.startsWith("%")) return S.pct(v, short ? 0 : 1, key === "vekst");
    if (i.unit === "år") return S.nf1.format(v) + (short ? "" : " år");
    if (key === "fb") return S.nf1.format(v);
    if (short && v >= 10000) return S.nf0.format(Math.round(v / 1000)) + "k";
    return Math.abs(v) < 100 && Math.round(v) !== v ? S.nf1.format(v) : S.int(v);
  }
  const label = (key) => `${IND[key].name} (${IND[key].year})`;

  // ---------------------------------------------------------------- state
  const st = { x: d.defaults?.x || "hoyutd", y: d.defaults?.y || "skatt", f: "", k: null };
  (function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (IND[h.get("x")]) st.x = h.get("x");
    if (IND[h.get("y")]) st.y = h.get("y");
    if (d.fylker[h.get("f")]) st.f = h.get("f");
    if (K[h.get("k")]) st.k = h.get("k");
  })();
  function writeHash() {
    const h = new URLSearchParams({ x: st.x, y: st.y });
    if (st.f) h.set("f", st.f);
    if (st.k) h.set("k", st.k);
    history.replaceState(null, "", "#" + h);
  }

  // ---------------------------------------------------------------- kontroller
  const opts = GROUPS.map((g) => `<optgroup label="${g}">${d.indicators.filter((i) => i.group === g).map((i) => `<option value="${i.key}">${S.escapeHtml(i.name)} (${i.year})</option>`).join("")}</optgroup>`).join("");
  const xsel = document.getElementById("xsel"), ysel = document.getElementById("ysel"), fsel = document.getElementById("fsel");
  xsel.innerHTML = opts; ysel.innerHTML = opts;
  fsel.innerHTML += Object.entries(d.fylker).sort((a, b) => a[1].localeCompare(b[1], "nb")).map(([id, n]) => `<option value="${id}">${S.escapeHtml(n)}</option>`).join("");
  xsel.onchange = () => { st.x = xsel.value; render(); };
  ysel.onchange = () => { st.y = ysel.value; render(); };
  fsel.onchange = () => { st.f = fsel.value; if (st.k && st.f && K[st.k].f !== st.f) st.k = null; render(); };
  document.getElementById("swap").onclick = () => { [st.x, st.y] = [st.y, st.x]; render(); };

  const PRESETS = (d.presets || [
    { id: "utd", label: "Utdanning og skatt", x: "hoyutd", y: "skatt" },
    { id: "eldre", label: "Eldre og skatt", x: "a67", y: "skatt" },
    { id: "ufore", label: "Utdanning og uføretrygd", x: "grunnskole", y: "ufore" },
    { id: "syss", label: "Sysselsetting og stønad", x: "syss", y: "stonad" },
    { id: "formue", label: "Inntekt og formuesskatt", x: "inntekt", y: "formue" },
    { id: "vekst", label: "Vekst og alder", x: "vekst", y: "med" },
  ]).filter((p) => IND[p.x] && IND[p.y]);
  const pre = document.getElementById("presets");
  pre.innerHTML += PRESETS.map((p) => `<button data-p="${p.id}">${p.label}</button>`).join("");
  pre.querySelectorAll("button").forEach((b) => (b.onclick = () => { const p = PRESETS.find((q) => q.id === b.dataset.p); st.x = p.x; st.y = p.y; render(); }));

  const klist = document.getElementById("klist");
  klist.innerHTML = Object.entries(K).map(([id, k]) => `<option value="${S.escapeHtml(k.name)} (${S.escapeHtml(fylkeName(k.f))})"></option>`).join("");
  const search = document.getElementById("search");
  search.onchange = () => {
    const v = search.value.trim().toLowerCase();
    const hit = Object.entries(K).find(([id, k]) => `${k.name} (${fylkeName(k.f)})`.toLowerCase() === v) || Object.entries(K).find(([id, k]) => k.name.toLowerCase().startsWith(v));
    if (!hit) return;
    if (st.f && hit[1].f !== st.f) st.f = "";
    select(hit[0], true);
    search.value = ""; search.blur();
  };

  // ---------------------------------------------------------------- kart
  const map = S.choropleth(document.getElementById("map"), topo, {
    onClick: (id) => select(id),
    tooltip: (id) => `<div class="tt-title">${S.escapeHtml(K[id].name)}</div><div class="faint" style="font-size:12px;margin:-2px 0 6px">${S.escapeHtml(fylkeName(K[id].f))}</div>
      <div class="tt-row"><span>${S.escapeHtml(IND[st.y].name)}</span><b>${fmt(st.y, IND[st.y].values[id])}</b></div>
      <div class="tt-row"><span>${S.escapeHtml(IND[st.x].name)}</span><b>${fmt(st.x, IND[st.x].values[id])}</b></div>`,
  });

  function select(id, zoom = false) {
    st.k = id;
    render();
    if (id && zoom) map.zoomToKommune(id);
    if (id && zoom) document.getElementById("profile").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------------------------------------------------------------- statistikk
  function pearson(pts) {
    const n = pts.length;
    if (n < 3) return null;
    const mx = d3.mean(pts, (p) => p[0]), my = d3.mean(pts, (p) => p[1]);
    let sxy = 0, sxx = 0, syy = 0;
    for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
    const r = sxy / Math.sqrt(sxx * syy);
    const b = sxy / sxx;
    return { r, b, a: my - b * mx, n };
  }
  function strength(r) {
    const a = Math.abs(r);
    const s = a >= 0.7 ? "sterk" : a >= 0.4 ? "moderat" : a >= 0.2 ? "svak" : "ingen tydelig";
    return a < 0.2 ? "ingen tydelig sammenheng" : `${s} ${r > 0 ? "positiv" : "negativ"} sammenheng`;
  }

  // ---------------------------------------------------------------- spredningsplott
  function scatter() {
    const el = document.getElementById("scatter");
    const w = Math.max(360, el.clientWidth || 800), h = Math.round(Math.min(560, Math.max(380, w * 0.68)));
    const m = { t: 16, r: 18, b: 46, l: 64 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const X = IND[st.x], Y = IND[st.y];
    const pts = Object.keys(K).map((id) => ({ id, x: X.values[id], y: Y.values[id], pop: IND.pop.values[id], f: K[id].f }))
      .filter((p) => p.x != null && p.y != null && (!LOG.has(st.x) || p.x > 0) && (!LOG.has(st.y) || p.y > 0));
    const mk = (key, ext, range) => {
      const s = LOG.has(key) ? d3.scaleLog(ext, range) : d3.scaleLinear(ext, range);
      return s.nice();
    };
    const pad = (ext, key) => LOG.has(key) ? [ext[0] * 0.9, ext[1] * 1.1] : [ext[0] - (ext[1] - ext[0]) * 0.03, ext[1] + (ext[1] - ext[0]) * 0.03];
    const x = mk(st.x, pad(d3.extent(pts, (p) => p.x), st.x), [m.l, w - m.r]);
    const y = mk(st.y, pad(d3.extent(pts, (p) => p.y), st.y), [h - m.b, m.t]);
    const tf = (v, key) => (LOG.has(key) ? Math.log10(v) : v);
    const logTicks = (sc) => { const t = sc.ticks().filter((v) => [1, 2, 5].includes(+String(v.toExponential())[0])); return t.length > 9 ? t.filter((v) => +String(v.toExponential())[0] === 1) : t; };
    const yt = LOG.has(st.y) ? logTicks(y) : y.ticks(6);
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(yt).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(yt).tickFormat((v) => fmt(st.y, v, true)).tickPadding(6));
    const xt = LOG.has(st.x) ? logTicks(x) : x.ticks(6);
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickValues(xt).tickFormat((v) => fmt(st.x, v, true)).tickSizeOuter(0));
    svg.append("text").attr("class", "axis-title").attr("x", w - m.r).attr("y", h - 8).attr("text-anchor", "end").text(label(st.x) + (LOG.has(st.x) ? " · log" : ""));
    svg.append("text").attr("class", "axis-title").attr("x", m.l).attr("y", m.t - 4).attr("dy", "-0.2em").text("");
    document.getElementById("sc-title").textContent = `${Y.name} mot ${X.name.charAt(0).toLowerCase() + X.name.slice(1)}`;

    // referanselinjer
    const ref = svg.append("g").attr("class", "ref");
    if (X.national != null) { ref.append("line").attr("x1", x(X.national)).attr("x2", x(X.national)).attr("y1", m.t).attr("y2", h - m.b); ref.append("text").attr("x", x(X.national) + 4).attr("y", m.t + 10).text("Landet"); }
    if (Y.national != null) { ref.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(Y.national)).attr("y2", y(Y.national)); ref.append("text").attr("x", w - m.r - 4).attr("y", y(Y.national) - 5).attr("text-anchor", "end").text("Landet"); }

    // regresjon
    const fit = pearson(pts.map((p) => [tf(p.x, st.x), tf(p.y, st.y)]));
    const fitF = st.f ? pearson(pts.filter((p) => p.f === st.f).map((p) => [tf(p.x, st.x), tf(p.y, st.y)])) : null;
    if (fit) {
      const [x0, x1] = x.domain();
      const N = 40, line = [];
      for (let i = 0; i <= N; i++) {
        const xv = LOG.has(st.x) ? x0 * Math.pow(x1 / x0, i / N) : x0 + ((x1 - x0) * i) / N;
        let yv = fit.a + fit.b * tf(xv, st.x);
        if (LOG.has(st.y)) yv = Math.pow(10, yv);
        const [ylo, yhi] = y.domain();
        if (yv >= Math.min(ylo, yhi) && yv <= Math.max(ylo, yhi)) line.push([x(xv), y(yv)]);
      }
      if (line.length > 1) svg.append("path").attr("class", "trend").attr("d", d3.line()(line));
    }
    document.getElementById("corr").innerHTML = fit ? `<span class="pill accent">r = ${fit.r.toFixed(2).replace(".", ",").replace("-", "−")}</span><span>${strength(fit.r)} blant alle ${fit.n} kommuner</span>${fitF ? `<span class="pill">${S.escapeHtml(fylkeName(st.f))}: r = ${fitF.r.toFixed(2).replace(".", ",").replace("-", "−")}</span>` : ""}` : "";

    // prikker
    const rr = d3.scaleSqrt([0, d3.max(pts, (p) => p.pop)], [2.2, 22]);
    const sorted = pts.slice().sort((a, b) => b.pop - a.pop);
    const inF = (p) => !st.f || p.f === st.f;
    svg.append("g").selectAll("circle").data(sorted).join("circle").attr("class", (p) => "dot" + (inF(p) ? "" : " dim"))
      .attr("cx", (p) => x(p.x)).attr("cy", (p) => y(p.y)).attr("r", (p) => rr(p.pop))
      .attr("fill", (p) => (st.f && inF(p) ? "var(--series-1)" : st.f ? "var(--neutral-mark)" : "var(--series-1)"))
      .attr("fill-opacity", (p) => (st.f ? (inF(p) ? 0.85 : 0.5) : 0.55))
      .on("mousemove", (e, p) => {
        tip.show(`<div class="tt-title">${S.escapeHtml(K[p.id].name)}</div><div class="faint" style="font-size:12px;margin:-2px 0 6px">${S.escapeHtml(fylkeName(p.f))} · ${S.int(p.pop)} innb.</div>
          <div class="tt-row"><span>${S.escapeHtml(X.name)}</span><b>${fmt(st.x, p.x)}</b></div><div class="tt-row"><span>${S.escapeHtml(Y.name)}</span><b>${fmt(st.y, p.y)}</b></div>`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => tip.hide())
      .on("click", (e, p) => select(p.id));

    // etiketter: valgt kommune + de største byene
    const labels = new Set(sorted.filter(inF).slice(0, st.f ? 3 : 5).map((p) => p.id));
    if (st.k) labels.add(st.k);
    const lg = svg.append("g");
    const placed = [];
    const lab = pts.filter((q) => labels.has(q.id)).sort((a, b) => (a.id === st.k ? -1 : b.id === st.k ? 1 : b.pop - a.pop));
    for (const p of lab) {
      if (p.id === st.k) lg.append("circle").attr("cx", x(p.x)).attr("cy", y(p.y)).attr("r", rr(p.pop) + 3).attr("fill", "none").attr("stroke", "var(--text)").attr("stroke-width", 2);
      const text = K[p.id].name.split(" - ")[0];
      const lx = x(p.x) + rr(p.pop) + 4, ly = y(p.y) + 4, lw = text.length * 6.6;
      const right = lx + lw > w - m.r;
      const box = right ? [x(p.x) - rr(p.pop) - 4 - lw, ly - 11, lw, 14] : [lx, ly - 11, lw, 14];
      if (placed.some((b) => box[0] < b[0] + b[2] && b[0] < box[0] + box[2] && box[1] < b[1] + b[3] && b[1] < box[1] + box[3])) continue;
      placed.push(box);
      lg.append("text").attr("class", "lbl").attr("x", right ? x(p.x) - rr(p.pop) - 4 : lx).attr("y", ly).attr("text-anchor", right ? "end" : "start").text(text);
    }
  }

  // ---------------------------------------------------------------- profil
  function profile() {
    const el = document.getElementById("profile");
    if (!st.k) {
      el.innerHTML = `<div class="panel-head"><div><h2>Kommuneprofil</h2><p>Klikk på en prikk, en kommune i kartet eller søk for å se alle indikatorene for en kommune.</p></div></div>`;
      return;
    }
    const k = K[st.k];
    const rows = (g) => d.indicators.filter((i) => i.group === g).map((i) => {
      const v = i.values[st.k];
      const all = Object.values(i.values).filter((x) => x != null);
      const log = LOG.has(i.key);
      const t = (z) => (log ? Math.log10(Math.max(z, 1)) : z);
      const lo = t(d3.min(all)), hi = t(d3.max(all));
      const pos = (z) => (z == null ? null : (100 * (t(z) - lo)) / (hi - lo || 1));
      const rank = v == null ? null : all.filter((x) => x > v).length + 1;
      return `<div class="fp-row" data-key="${i.key}" title="${S.escapeHtml(i.desc)} Kilde: ${i.source}.">
        <button class="n">${S.escapeHtml(i.name)} <small>${i.year}</small></button>
        <span class="v">${fmt(i.key, v)}</span>
        <div class="strip"><div class="track"></div>
          ${i.national != null && pos(i.national) >= 0 && pos(i.national) <= 100 ? `<div class="tick" style="left:${pos(i.national)}%" title="Landet: ${fmt(i.key, i.national)}"></div>` : ""}
          ${v != null ? `<div class="dot" style="left:${pos(v)}%"></div>` : ""}
        </div>
        <span class="faint" style="font-size:11.5px;grid-column:1/-1;margin-top:-2px">${rank ? `Nr. ${rank} av ${all.length}` : "Ingen data"} · landet ${fmt(i.key, i.national)}</span>
      </div>`;
    }).join("");
    el.innerHTML = `
      <div class="p-head">
        <div>
          <span class="eyebrow">Kommuneprofil · ${S.escapeHtml(fylkeName(k.f))} · kommunenr. ${st.k}</span>
          <h2 class="display big">${S.escapeHtml(k.name)}</h2>
          <p class="faint" style="margin:4px 0 0;font-size:13px">Prikken viser kommunen mellom laveste og høyeste kommune i landet, streken viser landsgjennomsnittet. Klikk på en indikator for å vise den i kartet.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a class="btn" href="kart.html#l=k&r=${st.k}">Se i skattekartet</a>
          <a class="btn" href="alder.html#r=${st.k}">Se aldersfordelingen</a>
          <button class="icon-btn" id="pclose" aria-label="Lukk profilen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </div>
      </div>
      <div class="fp">${GROUPS.map((g) => `<h3>${g}</h3>${rows(g)}`).join("")}</div>`;
    el.querySelector("#pclose").onclick = () => select(null);
    el.querySelectorAll(".fp-row .n").forEach((b) => (b.onclick = () => { st.y = b.closest(".fp-row").dataset.key; render(); }));
  }

  // ---------------------------------------------------------------- tabell
  function table() {
    const rows = Object.entries(K).filter(([id, k]) => !st.f || k.f === st.f).map(([id, k]) => ({
      id, name: k.name, fylke: fylkeName(k.f), pop: IND.pop.values[id], x: IND[st.x].values[id], y: IND[st.y].values[id],
    }));
    S.sortableTable(document.getElementById("table"), [
      { key: "name", label: "Kommune", text: true },
      ...(st.f ? [] : [{ key: "fylke", label: "Fylke", text: true }]),
      { key: "pop", label: "Folketall", fmt: S.int },
      { key: "x", label: S.escapeHtml(IND[st.x].name), fmt: (v) => fmt(st.x, v) },
      ...(st.x !== st.y ? [{ key: "y", label: S.escapeHtml(IND[st.y].name), fmt: (v) => fmt(st.y, v) }] : []),
    ], rows, { sortKey: "y", dir: -1, onRow: (id) => select(id, true) });
  }
  document.getElementById("csv").onclick = () => S.downloadCsv((document.body.dataset.src || "data/kommuneprofil.json").split("/").pop().replace(".json", "") + ".csv", [
    ["Kommunenr", "Kommune", "Fylke", ...d.indicators.map((i) => `${i.name} (${i.year})`)],
    ...Object.entries(K).map(([id, k]) => [id, k.name, fylkeName(k.f), ...d.indicators.map((i) => (i.values[id] == null ? "" : String(i.values[id]).replace(".", ",")))]),
  ]);

  // ---------------------------------------------------------------- render
  function render() {
    xsel.value = st.x; ysel.value = st.y; fsel.value = st.f;
    pre.querySelectorAll("button").forEach((b) => { const p = PRESETS.find((q) => q.id === b.dataset.p); b.setAttribute("aria-pressed", String(p.x === st.x && p.y === st.y)); });
    const Y = IND[st.y];
    document.getElementById("map-title").textContent = Y.name;
    document.getElementById("map-sub").textContent = `${Y.year} · ${Y.source}${st.f ? ` · fargene er tilpasset ${fylkeName(st.f)}` : ""}`;
    map.update({ values: Y.values, fmt: (v) => fmt(st.y, v), short: (v) => fmt(st.y, v, true), title: `${Y.name} (${Y.year})`, fylke: st.f || null, selected: st.k });
    scatter(); profile(); table(); writeHash();
  }
  render();
  if (st.k) setTimeout(() => map.zoomToKommune(st.k), 60);
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(scatter, 200); });
  S.onThemeChange(() => scatter());
})();
