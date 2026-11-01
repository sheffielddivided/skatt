/* Studie 11 – Oljepengene */
(async function () {
  const S = window.Skatt;
  const tip = S.tooltip();
  const [d, ord] = await Promise.all([
    fetch("data/oljepenger.json").then((r) => r.json()),
    fetch("data/skatt-ordning.json").then((r) => r.json()),
  ]);
  const kpi = ord.kpi, baseYear = Math.max(...Object.keys(kpi).map(Number));
  document.getElementById("real-btn").textContent = `Faste ${baseYear}-kroner`;
  let real = false;
  const defl = (y) => (real ? kpi[baseYear] / (kpi[Math.min(y, baseYear)] || kpi[baseYear]) : 1);
  const z = (v) => v || 0;

  const rows = d.years.map((y, i) => {
    const petro = z(d.petro_skatt[i]) + z(d.petro_avgift[i]) + z(d.equinor[i]) + z(d.sdoe[i]);
    const fond = z(d.spu_renter[i]) + z(d.spu_utbytte[i]);
    const use = -(d.overskudd[i] - petro - fond);
    return {
      x: y, i, petro, fond, use, net: petro - use,
      skatt: z(d.petro_skatt[i]), avgift: z(d.petro_avgift[i]), sdoe: z(d.sdoe[i]), equinor: z(d.equinor[i]),
      pctBnp: (100 * use) / d.bnp_fastland[i], pctUtg: (100 * use) / d.utgifter[i], pc: (use * 1e6) / d.pop[i],
      utg: d.utgifter[i], formue: d.nettofordringer[i], pop: d.pop[i],
    };
  }).filter((r) => r.utg != null);
  const L = rows[rows.length - 1];
  const M = (v, y) => S.mill(v * defl(y)); // v i mill. kr

  // ---------------------------------------------------------------- KPI og pengestrøm
  function kpis() {
    const r01 = rows.find((r) => r.x === 2001);
    const cards = [
      { l: `Oljepengebruk ${L.x}`, v: M(L.use, L.x), s: `${S.kr(Math.round(L.pc * defl(L.x)))} per innbygger` },
      { l: "Andel av fastlands-BNP", v: S.pct(L.pctBnp, 1), s: r01 ? `${S.pct(r01.pctBnp, 1)} i 2001` : "" },
      { l: "Andel av statens utgifter", v: S.pct(L.pctUtg, 0), s: "dekkes av oljepenger" },
      { l: `Petroleumsinntekter ${L.x}`, v: M(L.petro, L.x), s: (() => { const top = d3.greatest(rows, (r) => r.petro * defl(r.x)); return `toppår ${top.x}: ${M(top.petro, top.x)}`; })() },
    ];
    document.getElementById("kpis").innerHTML = cards.map((c) => `<div class="card kpi"><div class="l">${c.l}</div><div class="v">${c.v}</div><div class="s">${c.s}</div></div>`).join("");
    const prev = rows.find((r) => r.x === L.x - 1);
    document.getElementById("flow").innerHTML = `
      <div class="box"><div class="l">Inn: petroleumsinntekter ${L.x}</div><div class="v">${M(L.petro, L.x)}</div><div class="s">skatt, avgifter, SDØE og Equinor-utbytte</div></div>
      <div class="arrow">→<small>til fondet</small></div>
      <div class="box fund"><div class="l">Statens netto finansformue ved utgangen av ${L.x}</div><div class="v">${M(L.formue, L.x)}</div><div class="s">${S.kr(Math.round((L.formue * 1e6 * defl(L.x)) / L.pop / 1000) * 1000)} per innbygger · fondet ga ${M(L.fond, L.x)} i renter og utbytte</div></div>
      <div class="arrow">→<small>til budsjettet</small></div>
      <div class="box"><div class="l">Ut: oljepengebruk ${L.x}</div><div class="v">${M(L.use, L.x)}</div><div class="s">${S.pct(L.pctUtg, 0)} av statens utgifter${prev ? ` · ${S.pct(100 * (L.use / prev.use - 1), 0, true)} fra ${prev.x}` : ""}</div></div>`;
  }

  // ---------------------------------------------------------------- hjelpere
  function frame(el, h) { const w = Math.max(360, el.clientWidth || 700); el.innerHTML = ""; return { svg: d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`), w, h }; }
  const fmtAx = (v) => (v === 0 ? "0" : (v < 0 ? "−" : "") + S.nf0.format(Math.abs(v) / 1000) + " mrd");
  function axes(svg, x, y, w, h, m, yfmt, band) {
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat(yfmt).tickPadding(6));
    const ax = band ? d3.axisBottom(x).tickValues(x.domain().filter((v) => v % (w > 900 ? 2 : 5) === 0)) : d3.axisBottom(x).ticks(Math.min(10, w / 80)).tickFormat(d3.format("d"));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(ax.tickSizeOuter(0));
  }
  function legend(id, items) { document.getElementById(id).innerHTML = items.map((s) => `<span class="item"><span class="sw ${s.line ? "line" : ""}" style="background:${s.color}${s.round ? ";border-radius:50%;width:9px;height:9px" : ""}"></span>${s.name}</span>`).join(""); }
  function line(el, series, o) {
    const h = o.h || 280, m = { t: 16, r: 16, b: 28, l: 56 };
    const { svg, w } = frame(el, h);
    const x = d3.scaleLinear(d3.extent(rows, (r) => r.x), [m.l, w - m.r]);
    const vals = rows.flatMap((r) => series.map((s) => s.get(r)));
    const y = d3.scaleLinear([Math.min(0, d3.min(vals)), d3.max(vals)], [h - m.b, m.t]).nice();
    axes(svg, x, y, w, h, m, o.yfmt);
    if (y.domain()[0] < 0) svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "var(--text-3)");
    (o.notes || []).forEach((n) => {
      svg.append("line").attr("x1", x(n.x)).attr("x2", x(n.x)).attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--text-3)").attr("stroke-dasharray", "2 3");
      svg.append("text").attr("x", x(n.x) + 4).attr("y", m.t + 10 + (n.dy || 0)).attr("fill", "var(--text-3)").attr("font-size", 11.5).text(n.t);
    });
    series.forEach((s) => svg.append("path").datum(rows).attr("fill", "none").attr("stroke", s.color).attr("stroke-width", 2.2).attr("d", d3.line().x((r) => x(r.x)).y((r) => y(s.get(r)))));
    const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--border-strong)").style("display", "none");
    svg.append("rect").attr("x", m.l).attr("width", w - m.l - m.r).attr("height", h - m.b).attr("fill", "transparent")
      .on("mousemove", (e) => { const xv = Math.round(x.invert(d3.pointer(e)[0])); const r = rows.find((q) => q.x === xv); if (!r) return; cross.style("display", null).attr("x1", x(xv)).attr("x2", x(xv));
        tip.show(`<div class="tt-title">${xv}</div>${series.map((s) => `<div class="tt-row"><span><span class="key" style="background:${s.color}"></span>${s.name}</span><b>${o.fmt(s.get(r))}</b></div>`).join("")}`, e.clientX, e.clientY); })
      .on("mouseleave", () => { tip.hide(); cross.style("display", "none"); });
  }
  const NOTES = [{ x: 2001, t: "Handlingsregelen (4 %)" }, { x: 2017, t: "3 %-banen" }, { x: 2020, t: "Pandemien", dy: 14 }];

  // ---------------------------------------------------------------- diagrammer
  function charts() {
    // 1: inn og ut
    const el = document.getElementById("c1");
    const h = 380, m = { t: 16, r: 14, b: 28, l: 64 };
    const { svg, w } = frame(el, h);
    const keys = [{ name: "Petroleumsinntekter (inn)", color: "var(--series-1)" }, { name: "Oljepengebruk (ut)", color: "var(--series-2)" }, { name: "Netto spart", color: "var(--text)", round: true }];
    legend("c1-legend", keys);
    const x = d3.scaleBand(rows.map((r) => r.x), [m.l, w - m.r]).padding(0.2);
    const y = d3.scaleLinear([d3.min(rows, (r) => -r.use * defl(r.x)), d3.max(rows, (r) => r.petro * defl(r.x))], [h - m.b, m.t]).nice();
    axes(svg, x, y, w, h, m, fmtAx, true);
    svg.append("g").selectAll("rect").data(rows).join("rect").attr("x", (r) => x(r.x)).attr("width", x.bandwidth()).attr("y", (r) => y(r.petro * defl(r.x))).attr("height", (r) => y(0) - y(r.petro * defl(r.x))).attr("rx", 2).attr("fill", "var(--series-1)");
    svg.append("g").selectAll("rect").data(rows).join("rect").attr("x", (r) => x(r.x)).attr("width", x.bandwidth()).attr("y", (r) => y(Math.max(0, -r.use * defl(r.x)))).attr("height", (r) => Math.abs(y(0) - y(-r.use * defl(r.x)))).attr("rx", 2).attr("fill", "var(--series-2)");
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "var(--text-3)");
    svg.append("g").selectAll("circle").data(rows).join("circle").attr("cx", (r) => x(r.x) + x.bandwidth() / 2).attr("cy", (r) => y(r.net * defl(r.x))).attr("r", 3.5).attr("fill", "var(--text)").attr("stroke", "var(--surface)").attr("stroke-width", 1.5);
    const hl = svg.append("rect").attr("class", "bar-hl").attr("y", m.t).attr("height", h - m.b - m.t).style("display", "none");
    svg.append("g").selectAll("rect").data(rows).join("rect").attr("class", "hit").attr("x", (r) => x(r.x) - 2).attr("width", x.step()).attr("y", m.t).attr("height", h - m.b - m.t)
      .on("mousemove", (e, r) => { hl.style("display", null).attr("x", x(r.x) - 2).attr("width", x.bandwidth() + 4);
        tip.show(`<div class="tt-title">${r.x}</div><div class="tt-row"><span><span class="key" style="background:var(--series-1)"></span>Petroleumsinntekter</span><b>${M(r.petro, r.x)}</b></div><div class="tt-row"><span><span class="key" style="background:var(--series-2)"></span>Oljepengebruk</span><b>${M(r.use, r.x)}</b></div><div class="tt-row" style="border-top:1px solid var(--border);margin-top:4px;padding-top:4px"><span>Netto spart</span><b>${M(r.net, r.x)}</b></div>`, e.clientX, e.clientY); })
      .on("mouseleave", () => { tip.hide(); hl.style("display", "none"); });

    line(document.getElementById("c2"), [{ name: "Andel av fastlands-BNP", color: "var(--series-2)", get: (r) => r.pctBnp }], { fmt: (v) => S.pct(v, 1), yfmt: (v) => v + " %", notes: NOTES });
    line(document.getElementById("c3"), [{ name: "Andel av statens utgifter", color: "var(--series-2)", get: (r) => r.pctUtg }], { fmt: (v) => S.pct(v, 1), yfmt: (v) => v + " %", notes: NOTES });
    const s4 = [{ name: "Oljepengebruk", color: "var(--series-2)", get: (r) => r.use * defl(r.x) }, { name: "Fondets renter og utbytte", color: "var(--series-1)", get: (r) => r.fond * defl(r.x) }];
    legend("c4-legend", s4.map((s) => ({ ...s, line: true })));
    line(document.getElementById("c4"), s4, { fmt: (v) => S.mill(v), yfmt: fmtAx });

    // 5: sammensetning
    const comp = [{ k: "skatt", name: "Skatt", color: "var(--series-1)" }, { k: "sdoe", name: "SDØE", color: "var(--series-2)" }, { k: "equinor", name: "Utbytte fra Equinor", color: "var(--series-3)" }, { k: "avgift", name: "Avgifter", color: "var(--series-4)" }];
    legend("c5-legend", comp);
    const el5 = document.getElementById("c5");
    const h5 = 280, m5 = { t: 14, r: 10, b: 28, l: 60 };
    const f5 = frame(el5, h5);
    const x5 = d3.scaleBand(rows.map((r) => r.x), [m5.l, f5.w - m5.r]).padding(0.18);
    const y5 = d3.scaleLinear([0, d3.max(rows, (r) => d3.sum(comp, (c) => Math.max(0, r[c.k])) * defl(r.x))], [h5 - m5.b, m5.t]).nice();
    axes(f5.svg, x5, y5, f5.w, h5, m5, fmtAx, true);
    rows.forEach((r) => { let y0 = 0; comp.forEach((c, k) => { const v = Math.max(0, r[c.k]) * defl(r.x); f5.svg.append("rect").attr("x", x5(r.x)).attr("width", x5.bandwidth()).attr("y", y5(y0 + v)).attr("height", Math.max(0, y5(y0) - y5(y0 + v) - (k ? 1 : 0))).attr("fill", c.color); y0 += v; }); });
    f5.svg.append("g").selectAll("rect").data(rows).join("rect").attr("class", "hit").attr("x", (r) => x5(r.x) - 1).attr("width", x5.step()).attr("y", m5.t).attr("height", h5 - m5.b - m5.t)
      .on("mousemove", (e, r) => tip.show(`<div class="tt-title">${r.x}</div>${comp.slice().reverse().map((c) => `<div class="tt-row"><span><span class="key" style="background:${c.color}"></span>${c.name}</span><b>${M(r[c.k], r.x)}</b></div>`).join("")}`, e.clientX, e.clientY))
      .on("mouseleave", () => tip.hide());

    formue();
  }
  let nfUnit = "tot";
  document.querySelectorAll("#nfunit button").forEach((b) => (b.onclick = () => { nfUnit = b.dataset.v; document.querySelectorAll("#nfunit button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); formue(); }));
  function formue() {
    line(document.getElementById("c6"), [{ name: nfUnit === "pc" ? "Per innbygger" : "Netto finansformue", color: "var(--series-1)", get: (r) => (r.formue == null ? 0 : nfUnit === "pc" ? (r.formue * 1e6 * defl(r.x)) / r.pop : r.formue * defl(r.x)) }],
      { h: 300, fmt: (v) => (nfUnit === "pc" ? S.kr(Math.round(v)) : S.mill(v)), yfmt: (v) => (nfUnit === "pc" ? S.nf1.format(v / 1e6).replace(",0", "") + " mill. kr" : S.nf0.format(v / 1000) + " mrd") });
  }

  // ---------------------------------------------------------------- tabell
  function table() {
    document.getElementById("tbl-sub").textContent = `Mill. kr${real ? ` (faste ${baseYear}-kroner)` : ""}. Klikk på en kolonne for å sortere.`;
    const f = (v) => S.nf0.format(Math.round(v)).replace("-", "−");
    const t = rows.map((r) => ({ id: r.x, år: String(r.x), petro: r.petro * defl(r.x), fond: r.fond * defl(r.x), use: r.use * defl(r.x), pctBnp: r.pctBnp, pctUtg: r.pctUtg, pc: r.pc * defl(r.x), formue: r.formue == null ? null : r.formue * defl(r.x) }));
    S.sortableTable(document.getElementById("table"), [
      { key: "år", label: "År", text: true }, { key: "petro", label: "Petroleumsinntekter", fmt: f }, { key: "fond", label: "Fondets renter og utbytte", fmt: f },
      { key: "use", label: "Oljepengebruk", fmt: f }, { key: "pctBnp", label: "% av fastlands-BNP", fmt: (v) => S.pct(v, 1) }, { key: "pctUtg", label: "% av statens utgifter", fmt: (v) => S.pct(v, 1) },
      { key: "pc", label: "Per innbygger (kr)", fmt: f }, { key: "formue", label: "Netto finansformue", fmt: (v) => (v == null ? "–" : f(v)) },
    ], t, { sortKey: "år", dir: -1 });
    document.getElementById("csv").onclick = () => S.downloadCsv(`oljepenger${real ? "-faste-kroner" : ""}.csv`, [
      ["År", "Petroleumsinntekter (mill. kr)", "Fondets renter og utbytte (mill. kr)", "Oljepengebruk (mill. kr)", "Andel av fastlands-BNP (%)", "Andel av statens utgifter (%)", "Per innbygger (kr)", "Statens netto finansformue (mill. kr)"],
      ...t.map((r) => [r.år, Math.round(r.petro), Math.round(r.fond), Math.round(r.use), r.pctBnp.toFixed(2).replace(".", ","), r.pctUtg.toFixed(2).replace(".", ","), Math.round(r.pc), r.formue == null ? "" : Math.round(r.formue)]),
    ]);
  }

  function renderAll() { kpis(); charts(); table(); }
  document.querySelectorAll("#real button").forEach((b) => (b.onclick = () => { real = b.dataset.v === "real"; document.querySelectorAll("#real button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); renderAll(); }));
  renderAll();
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(charts, 200); });
  document.getElementById("updated").textContent = "Data oppdatert av SSB " + new Date(d.updated).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" });
})();
