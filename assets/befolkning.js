/* Studie 6 – Befolkningsutviklingen */
(async function () {
  const S = window.Skatt;
  const tip = S.tooltip();
  const [d, topo] = await Promise.all([
    fetch("data/befolkning.json").then((r) => r.json()),
    fetch("data/norge-2024.topo.json").then((r) => r.json()),
  ]);
  const N = d.national;
  const signedInt = (v) => (v == null ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "") + S.int(Math.abs(Math.round(v))));
  const fmtAxis = (v) => (Math.abs(v) >= 1000 ? S.nf0.format(v / 1000) + "k" : S.nf0.format(v)).replace("-", "−");

  // ================================================================ felles diagramhjelpere
  function frame(el, h) {
    const w = Math.max(360, el.clientWidth || 800);
    el.innerHTML = "";
    return { svg: d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`), w, h };
  }
  function legend(id, items) {
    document.getElementById(id).innerHTML = items.map((s) =>
      `<span class="item"><span class="sw ${s.line ? "line" : ""}" style="background:${s.color}${s.round ? ";border-radius:50%;width:9px;height:9px" : ""}"></span>${S.escapeHtml(s.name)}</span>`).join("");
  }
  /** Stablet søylediagram som tåler negative verdier. rows: [{x, ...}], keys: [{k, name, color}] */
  function stackedBars(el, rows, keys, o = {}) {
    const h = o.h || 340, m = { t: 14, r: 10, b: 28, l: o.l || 52 };
    const { svg, w } = frame(el, h);
    const pos = (r) => keys.reduce((s, k) => s + Math.max(0, r[k.k] || 0), 0);
    const neg = (r) => keys.reduce((s, k) => s + Math.min(0, r[k.k] || 0), 0);
    const x = d3.scaleBand(rows.map((r) => r.x), [m.l, w - m.r]).padding(rows.length > 60 ? 0.12 : 0.2);
    const y = d3.scaleLinear([Math.min(0, d3.min(rows, neg), o.total ? d3.min(rows, (r) => r.total ?? 0) : 0), Math.max(d3.max(rows, pos), o.total ? d3.max(rows, (r) => r.total ?? 0) : 0)], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(o.yfmt || fmtAxis).tickPadding(6));
    const step = Math.ceil(rows.length / Math.max(4, Math.floor((w - m.l) / 46)));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`)
      .call(d3.axisBottom(x).tickSizeOuter(0).tickValues(x.domain().filter((v, i) => (rows.length - 1 - i) % step === 0)));
    const g = svg.append("g");
    for (const r of rows) {
      let up = 0, down = 0;
      keys.forEach((k) => {
        const v = r[k.k] || 0;
        if (!v) return;
        const y0 = v > 0 ? up : down, y1 = y0 + v;
        if (v > 0) up = y1; else down = y1;
        const top = y(Math.max(y0, y1)), bot = y(Math.min(y0, y1));
        g.append("rect").attr("x", x(r.x)).attr("width", x.bandwidth()).attr("y", top).attr("height", Math.max(0, bot - top - (x.bandwidth() > 6 ? 1 : 0)))
          .attr("fill", k.color).attr("rx", x.bandwidth() > 8 ? 1.5 : 0);
      });
    }
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "var(--text-3)");
    if (o.total) {
      svg.append("g").selectAll("circle").data(rows.filter((r) => r.total != null)).join("circle")
        .attr("cx", (r) => x(r.x) + x.bandwidth() / 2).attr("cy", (r) => y(r.total)).attr("r", Math.max(1.8, Math.min(3.5, x.bandwidth() / 2.5)))
        .attr("fill", "var(--text)").attr("stroke", "var(--surface)").attr("stroke-width", 1);
    }
    const hl = svg.append("rect").attr("class", "bar-hl").attr("y", m.t).attr("height", h - m.b - m.t).style("display", "none");
    svg.append("g").selectAll("rect").data(rows).join("rect").attr("class", "hit")
      .attr("x", (r) => x(r.x) - (x.step() - x.bandwidth()) / 2).attr("width", x.step()).attr("y", m.t).attr("height", h - m.b - m.t)
      .on("mousemove", (e, r) => { hl.style("display", null).attr("x", x(r.x) - 2).attr("width", x.bandwidth() + 4); tip.show(o.tip(r), e.clientX, e.clientY); })
      .on("mouseleave", () => { tip.hide(); hl.style("display", "none"); })
      .on("click", (e, r) => o.onClick && o.onClick(r));
  }
  /** Linjediagram. series: [{k, name, color}] */
  function lines(el, rows, series, o = {}) {
    const h = o.h || 280, m = { t: 14, r: o.r || 14, b: 28, l: o.l || 52 };
    const { svg, w } = frame(el, h);
    const x = d3.scaleLinear(d3.extent(rows, (r) => r.x), [m.l, w - m.r]);
    const vals = rows.flatMap((r) => series.map((s) => r[s.k])).filter((v) => v != null);
    const y = d3.scaleLinear([Math.min(0, d3.min(vals)), d3.max(vals)], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(fmtAxis).tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(Math.min(10, Math.floor(w / 70))).tickFormat(d3.format("d")).tickSizeOuter(0));
    if (y.domain()[0] < 0) svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "var(--text-3)");
    const labs = [];
    series.forEach((s) => {
      svg.append("path").datum(rows).attr("fill", "none").attr("stroke", s.color).attr("stroke-width", 2).attr("stroke-linejoin", "round")
        .attr("d", d3.line().defined((r) => r[s.k] != null).x((r) => x(r.x)).y((r) => y(r[s.k])));
      const last = rows.slice().reverse().find((r) => r[s.k] != null);
      if (o.labels && last) labs.push({ s, x: x(last.x) + 6, y: y(last[s.k]) + 4 });
    });
    // enkel kollisjonshåndtering: skyv etiketter fra hverandre vertikalt
    labs.sort((a, b) => a.y - b.y);
    for (let i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 14) labs[i].y = labs[i - 1].y + 14;
    const overflow = labs.length ? labs[labs.length - 1].y - (h - m.b + 4) : 0;
    if (overflow > 0) labs.forEach((l) => (l.y -= overflow));
    for (const l of labs) svg.append("text").attr("x", l.x).attr("y", l.y).attr("fill", "var(--text-2)").attr("font-size", 12).attr("font-weight", 600)
      .attr("stroke", "var(--surface)").attr("stroke-width", 3).attr("paint-order", "stroke").text(l.s.short || l.s.name);
    const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--border-strong)").style("display", "none");
    const dots = series.map((s) => svg.append("circle").attr("r", 4).attr("fill", s.color).attr("stroke", "var(--surface)").attr("stroke-width", 2).style("display", "none"));
    svg.append("rect").attr("x", m.l).attr("y", 0).attr("width", w - m.l - m.r).attr("height", h - m.b).attr("fill", "transparent")
      .on("mousemove", (e) => {
        const xv = Math.round(x.invert(d3.pointer(e)[0]));
        const r = rows.find((q) => q.x === xv);
        if (!r) return;
        cross.style("display", null).attr("x1", x(xv)).attr("x2", x(xv));
        series.forEach((s, i) => (r[s.k] == null ? dots[i].style("display", "none") : dots[i].style("display", null).attr("cx", x(xv)).attr("cy", y(r[s.k]))));
        tip.show(`<div class="tt-title">${xv}</div>${series.map((s) => `<div class="tt-row"><span><span class="key" style="background:${s.color}"></span>${S.escapeHtml(s.name)}</span><b>${r[s.k] == null ? "–" : (o.fmt || S.int)(r[s.k])}</b></div>`).join("")}`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => { tip.hide(); cross.style("display", "none"); dots.forEach((q) => q.style("display", "none")); });
  }

  // ================================================================ 1. hele landet
  let from = 1951;
  const natRows = () => N.years.map((y, i) => {
    const fo = N.born[i] != null && N.dead[i] != null ? N.born[i] - N.dead[i] : null;
    const ni = N.inn[i] != null && N.ut[i] != null ? N.inn[i] - N.ut[i] : null;
    const total = N.pop[i + 1] != null && N.pop[i] != null ? N.pop[i + 1] - N.pop[i] : null;
    return { x: y, i, fo, ni, total, born: N.born[i], dead: N.dead[i], inn: N.inn[i], ut: N.ut[i] };
  }).filter((r) => r.x >= from && r.born != null);

  function renderKpis() {
    const rows = natRows();
    const L = rows[rows.length - 1];
    const lastPop = N.pop[N.pop.length - 1], lastY = N.years[N.years.length - 1];
    const ten = rows.filter((r) => r.x > L.x - 10);
    const sumNi = d3.sum(ten, (r) => r.ni), sumFo = d3.sum(ten, (r) => r.fo);
    const cards = [
      { l: `Folketall 1.1.${lastY}`, v: S.int(lastPop), s: `${signedInt(L.total)} i ${L.x} (${S.pct((100 * L.total) / N.pop[L.i], 2, true)})` },
      { l: `Fødselsoverskudd ${L.x}`, v: signedInt(L.fo), s: `${S.int(L.born)} fødte · ${S.int(L.dead)} døde` },
      { l: `Nettoinnvandring ${L.x}`, v: signedInt(L.ni), s: `${S.int(L.inn)} innvandret · ${S.int(L.ut)} utvandret` },
      { l: `Innvandringens andel av veksten`, v: S.pct((100 * sumNi) / (sumNi + sumFo), 0), s: `${ten[0].x}–${L.x}` },
    ];
    document.getElementById("kpis").innerHTML = cards.map((c) => `<div class="card kpi"><div class="l">${c.l}</div><div class="v">${c.v}</div><div class="s">${c.s}</div></div>`).join("");
  }
  function renderNational() {
    const rows = natRows();
    const keys = [{ k: "fo", name: "Fødselsoverskudd", color: "var(--series-1)" }, { k: "ni", name: "Nettoinnvandring", color: "var(--series-2)" }];
    legend("c1-legend", [...keys, { name: "Samlet vekst", color: "var(--text)", round: true }]);
    stackedBars(document.getElementById("c1"), rows, keys, {
      total: true, h: 360,
      tip: (r) => `<div class="tt-title">${r.x}</div>${keys.map((k) => `<div class="tt-row"><span><span class="key" style="background:${k.color}"></span>${k.name}</span><b>${signedInt(r[k.k])}</b></div>`).join("")}
        <div class="tt-row" style="border-top:1px solid var(--border);margin-top:4px;padding-top:4px"><span>Samlet vekst</span><b>${signedInt(r.total)}</b></div>`,
    });
    const s2 = [{ k: "born", name: "Fødte", color: "var(--series-1)" }, { k: "dead", name: "Døde", color: "var(--series-2)" }];
    legend("c2-legend", s2.map((s) => ({ ...s, line: true })));
    lines(document.getElementById("c2"), rows, s2);
    const s3 = [{ k: "inn", name: "Innvandring", color: "var(--series-1)" }, { k: "ut", name: "Utvandring", color: "var(--series-2)" }];
    legend("c3-legend", s3.map((s) => ({ ...s, line: true })));
    lines(document.getElementById("c3"), rows.filter((r) => r.inn != null || r.ut != null), s3);
    renderKpis();
  }
  document.querySelectorAll("#period button").forEach((b) => (b.onclick = () => {
    from = +b.dataset.v;
    document.querySelectorAll("#period button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderNational();
  }));

  // ================================================================ 2. land
  const REG = [
    { id: "norden", name: "Norden", color: "var(--series-1)" },
    { id: "europa", name: "Europa ellers", color: "var(--series-2)" },
    { id: "afrika", name: "Afrika", color: "var(--series-3)" },
    { id: "asia", name: "Asia", color: "var(--series-4)" },
    { id: "amerika", name: "Amerika", color: "var(--series-5)" },
    { id: "ovrige", name: "Oseania, statsløse og uoppgitt", color: "var(--series-6)" },
    { id: "norge", name: "Norge (norske statsborgere)", color: "var(--series-7)" },
  ];
  const REGBY = Object.fromEntries(REG.map((r) => [r.id, r]));
  const SLOT = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];
  const lc = { dir: "inn", dim: "citizenship", yi: null, reg: null, sel: [] }; // sel: [{code, slot}]
  const DS = () => d[lc.dim];
  const val = (c, i) => (lc.dir === "inn" ? c.inn[i] : lc.dir === "ut" ? c.ut[i] : c.inn[i] - c.ut[i]);
  const dirName = () => (lc.dir === "inn" ? "Innvandring" : lc.dir === "ut" ? "Utvandring" : "Nettoinnvandring");
  const dimName = () => (lc.dim === "citizenship" ? "statsborgerskap" : lc.dir === "inn" ? "land de flyttet fra" : lc.dir === "ut" ? "land de flyttet til" : "fra-/tilflyttingsland");
  const lyear = document.getElementById("lyear");

  function defaultSel() {
    const D = DS(), i = D.years.length - 1;
    const top = Object.entries(D.countries).filter(([c, v]) => c !== "000" && c !== "990").sort((a, b) => Math.abs(val(b[1], i)) - Math.abs(val(a[1], i))).slice(0, 4);
    lc.sel = top.map(([code], k) => ({ code, slot: k }));
  }
  function resetYears() {
    const D = DS();
    lyear.innerHTML = D.years.map((y, i) => `<option value="${i}">${y}</option>`).reverse().join("");
    lc.yi = D.years.length - 1;
    lyear.value = lc.yi;
    document.getElementById("clist").innerHTML = Object.values(D.countries).sort((a, b) => a.name.localeCompare(b.name, "nb")).map((c) => `<option value="${S.escapeHtml(c.name)}"></option>`).join("");
  }
  lyear.onchange = () => { lc.yi = +lyear.value; renderCountries(); };
  document.querySelectorAll("#dir button").forEach((b) => (b.onclick = () => { lc.dir = b.dataset.v; syncSeg(); renderCountries(); }));
  document.querySelectorAll("#dim button").forEach((b) => (b.onclick = () => { lc.dim = b.dataset.v; resetYears(); defaultSel(); syncSeg(); renderCountries(); }));
  function syncSeg() {
    document.querySelectorAll("#dir button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === lc.dir)));
    document.querySelectorAll("#dim button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === lc.dim)));
  }
  function addCountry(code) {
    if (lc.sel.some((s) => s.code === code)) return;
    if (lc.sel.length >= 5) lc.sel.shift();
    const used = new Set(lc.sel.map((s) => s.slot));
    lc.sel.push({ code, slot: [0, 1, 2, 3, 4].find((k) => !used.has(k)) });
    renderCountries();
  }
  const addc = document.getElementById("addc");
  addc.onchange = () => {
    const v = addc.value.trim().toLowerCase();
    const hit = Object.entries(DS().countries).find(([c, x]) => x.name.toLowerCase() === v) || Object.entries(DS().countries).find(([c, x]) => x.name.toLowerCase().startsWith(v));
    if (hit) addCountry(hit[0]);
    addc.value = "";
  };
  document.getElementById("resetc").onclick = () => { defaultSel(); renderCountries(); };

  function renderCountries() {
    const D = DS(), Y = D.years, C = D.countries;
    const regs = REG.filter((r) => lc.dim === "citizenship" || r.id !== "norge").filter((r) => Object.values(C).some((c) => c.r === r.id));
    // 4: verdensdeler
    const rows = Y.map((y, i) => {
      const o = { x: y, i };
      for (const r of regs) o[r.id] = 0;
      for (const c of Object.values(C)) if (o[c.r] != null) o[c.r] += val(c, i);
      o.total = regs.reduce((s, r) => s + o[r.id], 0);
      return o;
    });
    document.getElementById("c4-title").textContent = `${dirName()} etter ${dimName()}`;
    document.getElementById("c4-sub").textContent = `Antall per år, ${Y[0]}–${Y[Y.length - 1]}, gruppert etter verdensdel. Klikk på en søyle for å velge året.`;
    const keys = regs.map((r) => ({ k: r.id, name: r.name, color: r.color }));
    legend("c4-legend", keys);
    stackedBars(document.getElementById("c4"), rows, keys, {
      total: lc.dir === "net", h: 340,
      onClick: (r) => { lc.yi = r.i; lyear.value = r.i; renderCountries(); },
      tip: (r) => {
        const top = Object.values(C).map((c) => ({ c, v: val(c, r.i) })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 3);
        return `<div class="tt-title">${r.x}</div>${keys.slice().reverse().map((k) => `<div class="tt-row"><span><span class="key" style="background:${k.color}"></span>${k.name}</span><b>${lc.dir === "net" ? signedInt(r[k.k]) : S.int(r[k.k])}</b></div>`).join("")}
          <div class="tt-row" style="border-top:1px solid var(--border);margin-top:4px;padding-top:4px"><span>I alt</span><b>${lc.dir === "net" ? signedInt(r.total) : S.int(r.total)}</b></div>
          <div class="faint" style="font-size:12px;margin-top:6px">Størst: ${top.map((t) => `${S.escapeHtml(t.c.name)} (${S.int(t.v)})`).join(", ")}</div>`;
      },
    });

    // 5: valgte land
    lc.sel = lc.sel.filter((s) => C[s.code]);
    document.getElementById("chips").innerHTML = lc.sel.map((s) => `<span class="chip"><span class="sw" style="background:${SLOT[s.slot]}"></span>${S.escapeHtml(C[s.code].name)}<button data-c="${s.code}" aria-label="Fjern ${S.escapeHtml(C[s.code].name)}">×</button></span>`).join("");
    document.querySelectorAll("#chips button").forEach((b) => (b.onclick = () => { lc.sel = lc.sel.filter((s) => s.code !== b.dataset.c); renderCountries(); }));
    document.getElementById("c5-title").textContent = `${dirName()} – valgte land`;
    const series = lc.sel.map((s) => ({ k: s.code, name: C[s.code].name, short: C[s.code].name.length > 14 ? C[s.code].name.slice(0, 13) + "…" : C[s.code].name, color: SLOT[s.slot] }));
    const lrows = Y.map((y, i) => Object.fromEntries([["x", y], ...lc.sel.map((s) => [s.code, val(C[s.code], i)])]));
    if (series.length) lines(document.getElementById("c5"), lrows, series, { labels: true, r: 96, h: 320, fmt: lc.dir === "net" ? signedInt : S.int });
    else document.getElementById("c5").innerHTML = `<p class="faint">Ingen land valgt.</p>`;

    // 6: rangering
    const yi = lc.yi, y = Y[yi];
    document.getElementById("c6-title").textContent = `Største land i ${y}`;
    document.getElementById("c6-sub").textContent = `${dirName()} etter ${dimName()}. Tallet i grått er endring fra ${y - 1}. Klikk for å legge til i diagrammet.`;
    const rf = document.getElementById("regf");
    rf.innerHTML = `<button data-r="" aria-pressed="${!lc.reg}">Alle</button>` + regs.map((r) => `<button data-r="${r.id}" aria-pressed="${lc.reg === r.id}"><span class="sw" style="background:${r.color}"></span>${r.name.split(" (")[0]}</button>`).join("");
    rf.querySelectorAll("button").forEach((b) => (b.onclick = () => { lc.reg = b.dataset.r || null; renderCountries(); }));
    const ranked = Object.entries(C).filter(([c, v]) => !lc.reg || v.r === lc.reg).map(([code, c]) => ({ code, name: c.name, r: c.r, v: val(c, yi), p: yi > 0 ? val(c, yi - 1) : null }))
      .filter((r) => r.v !== 0).sort((a, b) => (lc.dir === "net" ? Math.abs(b.v) - Math.abs(a.v) : b.v - a.v)).slice(0, 20);
    hbars(document.getElementById("c6"), ranked);

    // tabell
    const all = Object.entries(C).map(([code, c]) => ({ id: code, name: c.name, reg: REGBY[c.r]?.name.split(" (")[0] || "", v: val(c, yi), p: yi > 0 ? val(c, yi - 1) : null, sum: d3.sum(Y.map((_, i) => val(c, i))) }))
      .map((r) => ({ ...r, chg: r.p ? (100 * (r.v / r.p - 1)) : null }));
    document.getElementById("ctbl-sub").textContent = `${dirName()} etter ${dimName()}, ${y}. Sum for ${Y[0]}–${Y[Y.length - 1]}. Klikk på en rad for å legge landet til i diagrammet.`;
    const fv = lc.dir === "net" ? signedInt : S.int;
    S.sortableTable(document.getElementById("ctable"), [
      { key: "name", label: "Land", text: true }, { key: "reg", label: "Verdensdel", text: true },
      { key: "v", label: String(y), fmt: fv }, { key: "p", label: String(y - 1), fmt: fv },
      { key: "chg", label: "Endring", fmt: (v) => S.pct(v, 0, true) }, { key: "sum", label: `Sum ${Y[0]}–${Y[Y.length - 1]}`, fmt: fv },
    ], all, { sortKey: "v", dir: -1, onRow: (id) => addCountry(id) });
    document.getElementById("csv-c").onclick = () => S.downloadCsv(`${dirName().toLowerCase()}-etter-${lc.dim === "citizenship" ? "statsborgerskap" : "land"}.csv`, [
      ["Landkode", "Land", "Verdensdel", ...Y], ...Object.entries(C).map(([code, c]) => [code, c.name, REGBY[c.r]?.name || "", ...Y.map((_, i) => val(c, i))]),
    ]);
  }

  function hbars(el, rows) {
    const rowH = 24, m = { t: 4, r: 110, b: 4, l: 150 };
    const h = m.t + m.b + rowH * Math.max(1, rows.length);
    const { svg, w } = frame(el, h);
    if (!rows.length) return;
    const lo = Math.min(0, d3.min(rows, (r) => r.v)), hi = Math.max(0, d3.max(rows, (r) => r.v));
    const x = d3.scaleLinear([lo, hi], [m.l, w - m.r]).nice();
    const g = svg.append("g").attr("class", "hbar");
    rows.forEach((r, j) => {
      const yy = m.t + j * rowH, row = g.append("g").attr("class", "row").style("cursor", "pointer").on("click", () => addCountry(r.code));
      row.append("rect").attr("x", 0).attr("width", w).attr("y", yy).attr("height", rowH).attr("fill", "transparent");
      row.append("text").attr("class", "name").attr("x", m.l - 8).attr("y", yy + rowH / 2 + 4).attr("text-anchor", "end").text(r.name.length > 22 ? r.name.slice(0, 21) + "…" : r.name);
      const x0 = x(Math.min(0, r.v)), x1 = x(Math.max(0, r.v));
      row.append("rect").attr("x", x0).attr("width", Math.max(1, x1 - x0)).attr("y", yy + 5).attr("height", rowH - 10).attr("rx", 3).attr("fill", REGBY[r.r]?.color || "var(--neutral-mark)");
      row.append("text").attr("class", "val").attr("x", x(Math.max(0, r.v)) + 6).attr("y", yy + rowH / 2 + 4).text(lc.dir === "net" ? signedInt(r.v) : S.int(r.v));
      if (r.p) row.append("text").attr("class", "chg").attr("x", x(Math.max(0, r.v)) + 6 + String(S.int(r.v)).length * 7.2 + 8).attr("y", yy + rowH / 2 + 4).text(S.pct(100 * (r.v / r.p - 1), 0, true));
      row.on("mousemove", (e) => tip.show(`<div class="tt-title">${S.escapeHtml(r.name)}</div><div class="tt-row"><span>${DS().years[lc.yi]}</span><b>${S.int(r.v)}</b></div><div class="tt-row"><span>${DS().years[lc.yi] - 1}</span><b>${r.p == null ? "–" : S.int(r.p)}</b></div><div class="faint" style="font-size:12px;margin-top:4px">Klikk for å legge til i diagrammet</div>`, e.clientX, e.clientY))
        .on("mouseleave", () => tip.hide());
    });
    if (lo < 0) g.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", h).attr("stroke", "var(--border-strong)");
  }

  // ================================================================ 3. kommuner
  const KY = d.kyears, KOM = d.kommuner;
  const kfrom = document.getElementById("kfrom"), kto = document.getElementById("kto"), kfylke = document.getElementById("kfylke");
  kfrom.innerHTML = KY.map((y, i) => `<option value="${i}">${y}</option>`).join("");
  kto.innerHTML = KY.map((y, i) => `<option value="${i}">${y}</option>`).join("");
  kfylke.innerHTML += Object.entries(d.fylker).sort((a, b) => a[1].localeCompare(b[1], "nb")).map(([id, n]) => `<option value="${id}">${S.escapeHtml(n)}</option>`).join("");
  const ks = { a: Math.max(0, KY.length - 10), b: KY.length - 1, comp: "tot", f: "", k: null };
  kfrom.value = ks.a; kto.value = ks.b;
  kfrom.onchange = () => { ks.a = Math.min(+kfrom.value, ks.b); kfrom.value = ks.a; renderKommuner(); };
  kto.onchange = () => { ks.b = Math.max(+kto.value, ks.a); kto.value = ks.b; renderKommuner(); };
  kfylke.onchange = () => { ks.f = kfylke.value; if (ks.k && ks.f && KOM[ks.k].f !== ks.f) ks.k = null; renderKommuner(); };
  document.querySelectorAll("#comp button").forEach((b) => (b.onclick = () => { ks.comp = b.dataset.v; document.querySelectorAll("#comp button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); renderKommuner(); }));
  const COMP = [
    { k: "fo", name: "Fødselsoverskudd", color: "var(--series-1)" },
    { k: "ni", name: "Nettoinnvandring", color: "var(--series-2)" },
    { k: "nf", name: "Innenlands flytting (netto)", color: "var(--series-3)" },
  ];
  function agg(list) {
    const o = { fo: 0, ni: 0, nf: 0, pop: 0 };
    for (const k of list) {
      for (let i = ks.a; i <= ks.b; i++) { o.fo += k.fo[i]; o.ni += k.ni[i]; o.nf += k.nf[i]; }
      o.pop += k.pop[ks.a];
    }
    o.tot = o.fo + o.ni + o.nf;
    return o;
  }
  const per1000 = (o, key) => (o.pop ? (1000 * o[key]) / o.pop : null);
  const map = S.choropleth(document.getElementById("kmap"), topo, {
    onClick: (id) => { ks.k = id; renderKommuner(); },
    tooltip: (id) => {
      const o = agg([KOM[id]]);
      return `<div class="tt-title">${S.escapeHtml(KOM[id].name)}</div><div class="faint" style="font-size:12px;margin:-2px 0 6px">${KY[ks.a]}–${KY[ks.b]}, per 1 000 innb.</div>
        ${COMP.map((c) => `<div class="tt-row"><span><span class="key" style="background:${c.color}"></span>${c.name}</span><b>${S.nf1.format(per1000(o, c.k)).replace("-", "−")}</b></div>`).join("")}
        <div class="tt-row" style="border-top:1px solid var(--border);margin-top:4px;padding-top:4px"><span>Samlet vekst</span><b>${S.nf1.format(per1000(o, "tot")).replace("-", "−")}</b></div>`;
    },
  });
  const compName = { tot: "Samlet befolkningsvekst", fo: "Fødselsoverskudd", ni: "Nettoinnvandring", nf: "Netto innenlands flytting" };

  function renderKommuner() {
    const period = `${KY[ks.a]}–${KY[ks.b]}`;
    const values = Object.fromEntries(Object.entries(KOM).map(([id, k]) => [id, per1000(agg([k]), ks.comp)]));
    document.getElementById("kmap-title").textContent = `${compName[ks.comp]}, ${period}`;
    map.update({ values, diverging: true, fmt: (v) => S.nf0.format(v).replace("-", "−"), short: (v) => S.nf0.format(v).replace("-", "−"), title: `${compName[ks.comp]} per 1 000`, fylke: ks.f || null, selected: ks.k });
    // dekomponering
    const scope = ks.k ? { name: KOM[ks.k].name, sub: d.fylker[KOM[ks.k].f], list: [KOM[ks.k]] }
      : ks.f ? { name: d.fylker[ks.f], sub: "Fylke", list: Object.values(KOM).filter((k) => k.f === ks.f) }
      : { name: "Norge", sub: "Alle kommuner", list: Object.values(KOM) };
    const o = agg(scope.list);
    const mx = Math.max(...["fo", "ni", "nf", "tot"].map((k) => Math.abs(per1000(o, k) || 0)), 1);
    const bar = (v, color) => { const wv = (50 * Math.abs(v)) / mx; return `<div class="track"><div class="zero"></div><div class="bar" style="background:${color};width:${wv}%;left:${v >= 0 ? 50 : 50 - wv}%"></div></div>`; };
    const el = document.getElementById("decomp");
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
        <div><span class="eyebrow">${S.escapeHtml(scope.sub)} · ${period}</span><h3 class="display">${S.escapeHtml(scope.name)}</h3>
        <p class="faint" style="margin:4px 0 0;font-size:13px">Folketall 1.1.${KY[ks.a]}: ${S.int(o.pop)}. Søylene viser per 1 000 innbyggere.</p></div>
        ${ks.k ? `<button class="icon-btn" id="kclose" aria-label="Lukk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>` : ""}
      </div>
      ${COMP.map((c) => `<div class="comp-row"><span class="n">${c.name}</span>${bar(per1000(o, c.k), c.color)}<span class="v">${signedInt(o[c.k])}</span></div>`).join("")}
      <div class="comp-row total"><span class="n">Samlet vekst</span>${bar(per1000(o, "tot"), "var(--text)")}<span class="v">${signedInt(o.tot)}</span></div>
      <div class="legend" id="kd-legend" style="margin-top:12px"></div>
      <div class="chart" id="kd"></div>
      ${ks.k ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn" href="alder.html#r=${ks.k}">Aldersfordeling</a><a class="btn" href="profil.html#x=vekst&y=skatt&k=${ks.k}">Kommuneprofil</a></div>` : ""}`;
    const kc = el.querySelector("#kclose");
    if (kc) kc.onclick = () => { ks.k = null; renderKommuner(); };
    legend("kd-legend", COMP);
    const rows = KY.map((y, i) => {
      const r = { x: y };
      for (const c of COMP) r[c.k] = d3.sum(scope.list, (k) => k[c.k][i]);
      r.total = r.fo + r.ni + r.nf;
      return r;
    });
    stackedBars(document.getElementById("kd"), rows, COMP, {
      total: true, h: 260, l: 48,
      tip: (r) => `<div class="tt-title">${r.x}</div>${COMP.map((c) => `<div class="tt-row"><span><span class="key" style="background:${c.color}"></span>${c.name}</span><b>${signedInt(r[c.k])}</b></div>`).join("")}<div class="tt-row" style="border-top:1px solid var(--border);margin-top:4px;padding-top:4px"><span>Samlet</span><b>${signedInt(r.total)}</b></div>`,
    });
    // tabell
    const trows = Object.entries(KOM).filter(([id, k]) => !ks.f || k.f === ks.f).map(([id, k]) => {
      const a = agg([k]);
      return { id, name: k.name, fylke: d.fylker[k.f], pop: a.pop, tot: a.tot, totp: per1000(a, "tot"), fo: per1000(a, "fo"), ni: per1000(a, "ni"), nf: per1000(a, "nf") };
    });
    document.getElementById("ktbl-sub").textContent = `${period}. Komponentene er per 1 000 innbyggere ved periodens start. Klikk på en rad for å vise kommunen.`;
    const f1 = (v) => (v == null ? "–" : S.nf1.format(v).replace("-", "−"));
    S.sortableTable(document.getElementById("ktable"), [
      { key: "name", label: "Kommune", text: true }, ...(ks.f ? [] : [{ key: "fylke", label: "Fylke", text: true }]),
      { key: "pop", label: `Folketall ${KY[ks.a]}`, fmt: S.int }, { key: "tot", label: "Vekst (antall)", fmt: signedInt },
      { key: "totp", label: "Vekst per 1 000", fmt: f1 }, { key: "fo", label: "Fødselsoversk.", fmt: f1 }, { key: "ni", label: "Innvandring", fmt: f1 }, { key: "nf", label: "Innenlands", fmt: f1 },
    ], trows, { sortKey: ks.comp === "tot" ? "totp" : ks.comp, dir: -1, onRow: (id) => { ks.k = id; renderKommuner(); map.zoomToKommune(id); document.getElementById("kmap").scrollIntoView({ behavior: "smooth", block: "center" }); } });
    document.getElementById("csv-k").onclick = () => S.downloadCsv(`befolkningsendring-kommuner-${period}.csv`, [
      ["Kommunenr", "Kommune", "Fylke", `Folketall 1.1.${KY[ks.a]}`, "Fødselsoverskudd", "Nettoinnvandring", "Netto innenlands flytting", "Samlet"],
      ...Object.entries(KOM).map(([id, k]) => { const a = agg([k]); return [id, k.name, d.fylker[k.f], a.pop, a.fo, a.ni, a.nf, a.tot]; }),
    ]);
  }

  // ================================================================ start
  resetYears(); defaultSel();
  renderNational(); renderCountries(); renderKommuner();
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { renderNational(); renderCountries(); renderKommuner(); }, 200); });
  S.onThemeChange(() => renderKommuner());
  document.getElementById("updated").textContent = "Data oppdatert av SSB " + new Date(d.updated).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" });
})();
