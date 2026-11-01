/* Studie 2 – Petroleumsskatten */
(async function () {
  const S = window.Skatt;
  const tip = S.tooltip();
  const d = await fetch("data/skatt-ordning.json").then((r) => r.json());

  const months = d.months;
  const get = (key, m) => { const i = months.indexOf(m); return i < 0 ? null : d.series[key]?.[i] ?? null; };
  const lastM = months[months.length - 1];
  const lastYear = +lastM.slice(0, 4), lastMonth = +lastM.slice(5);
  const partial = lastMonth !== 12;
  const decs = months.filter((m) => m.endsWith("M12"));
  const kpiYears = Object.keys(d.kpi).map(Number);
  const baseYear = Math.max(...kpiYears);
  document.getElementById("real-btn").textContent = `Faste ${baseYear}-kroner`;

  // ---- årsrader ----
  function row(m, label, isPartial) {
    const y = +m.slice(0, 4);
    const ord = get("2:C", m) ?? 0, sær = get("2:D", m) ?? 0;
    const petro = ord + sær;
    const uper = get("2:A", m), total = get("0:A", m), pers = get("1:A", m), renter = get("4:A", m);
    return { m, y, label, partial: isPartial, ord, sær, petro, uper, total, pers, renter, uperOther: uper - petro,
      shareUper: (100 * petro) / uper, shareTotal: (100 * petro) / total };
  }
  const rows = decs.map((m) => row(m, m.slice(0, 4), false));
  if (partial) rows.push(row(lastM, `${lastYear}*`, true));
  const full = rows.filter((r) => !r.partial);
  const ytd = partial ? rows[rows.length - 1] : null;
  const ytdPrev = partial ? row(`${lastYear - 1}M${String(lastMonth).padStart(2, "0")}`, "", true) : null;

  // ---- kroneverdi ----
  let real = false;
  const defl = (y) => (real ? d.kpi[baseYear] / (d.kpi[Math.min(y, baseYear)] || d.kpi[baseYear]) : 1);
  const val = (r, k) => r[k] == null ? null : r[k] * defl(r.y);

  document.querySelectorAll("#real button").forEach((b) => b.addEventListener("click", () => {
    real = b.dataset.v === "real";
    document.querySelectorAll("#real button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderAll();
  }));

  // ---- KPI-kort ----
  function renderKpis() {
    const a = full[full.length - 1], b = full[full.length - 2];
    const chg = (100 * (a.petro / b.petro - 1));
    const cards = [
      { l: `Petroleumsskatt ${a.y}`, v: S.mill(a.petro), s: `<span class="delta">${S.pct(chg, 1, true)}</span> fra ${b.y}` },
      { l: `Andel av upersonlige skattytere`, v: S.pct(a.shareUper, 0), s: `${a.y} · snitt ${full[0].y}–${a.y}: ${S.pct(d3.mean(full, (r) => r.shareUper), 0)}` },
      { l: `Andel av all skatt`, v: S.pct(a.shareTotal, 0), s: `${a.y} · toppår ${d3.greatest(full, (r) => r.shareTotal).y}: ${S.pct(d3.max(full, (r) => r.shareTotal), 0)}` },
    ];
    if (ytd) {
      const c = 100 * (ytd.petro / ytdPrev.petro - 1);
      cards.push({ l: `Hittil i år (jan–${S.MONTHS_SHORT[lastMonth - 1]} ${lastYear})`, v: S.mill(ytd.petro), s: `<span class="delta">${S.pct(c, 1, true)}</span> mot samme periode ${lastYear - 1}` });
    } else {
      const top = d3.greatest(full, (r) => r.petro);
      cards.push({ l: "Rekordår", v: S.mill(top.petro), s: String(top.y) });
    }
    document.getElementById("kpis").innerHTML = cards.map((c) => `<div class="card kpi"><div class="l">${c.l}</div><div class="v">${c.v}</div><div class="s">${c.s}</div></div>`).join("");
  }

  // ---- felles akse-hjelpere ----
  const fmtAxis = (v) => (v === 0 ? "0" : S.nf0.format(v / 1000) + " mrd");
  function frame(el, w, h, m) {
    el.innerHTML = "";
    return d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("role", "img");
  }
  function yGrid(svg, y, w, m, fmt, ticks = 5) {
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(ticks).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(ticks).tickFormat(fmt).tickPadding(8));
  }
  function legend(id, items) {
    document.getElementById(id).innerHTML = items.map((s) =>
      `<span class="item"><span class="sw ${s.line ? "line" : ""}" style="background:${s.color}${s.pattern ? ";background-image:repeating-linear-gradient(135deg,transparent 0 2px,var(--surface) 2px 4px)" : ""}"></span>${s.name}</span>`).join("");
  }
  const kr = () => (real ? ` (faste ${baseYear}-kr)` : "");

  // ---- Diagram 1: stablede søyler ordinær + særskatt ----
  function chart1() {
    const el = document.getElementById("c1");
    const w = Math.max(640, el.clientWidth || 1000), h = 380, m = { t: 30, r: 10, b: 30, l: 62 };
    const svg = frame(el, w, h, m);
    const keys = [{ k: "ord", name: "Ordinær skatt på utvinning", color: "var(--series-1)" }, { k: "sær", name: "Særskatt på utvinning", color: "var(--series-2)" }];
    legend("c1-legend", [...keys, ...(ytd ? [{ name: `${lastYear}: hittil i år (jan–${S.MONTHS_SHORT[lastMonth - 1]})`, color: "var(--neutral-mark)", pattern: true }] : [])]);
    document.getElementById("c1-sub").textContent = `Mill. kr${kr()}, ${rows[0].y}–${lastYear}. Upersonlige skattytere.`;
    const x = d3.scaleBand(rows.map((r) => r.label), [m.l, w - m.r]).padding(0.22);
    const y = d3.scaleLinear([0, d3.max(rows, (r) => val(r, "petro"))], [h - m.b, m.t]).nice();
    yGrid(svg, y, w, m, fmtAxis);
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`)
      .call(d3.axisBottom(x).tickSizeOuter(0).tickValues(x.domain().filter((_, i) => w > 900 || i % 2 === 0)));
    const gap = 1.5;
    const g = svg.append("g");
    rows.forEach((r) => {
      let y0 = 0;
      keys.forEach((s, i) => {
        const v = Math.max(0, val(r, s.k));
        const top = y(y0 + v), bot = y(y0);
        const hh = Math.max(0, bot - top - (i > 0 ? gap : 0));
        g.append("rect").attr("x", x(r.label)).attr("width", x.bandwidth()).attr("y", top).attr("height", hh)
          .attr("rx", i === keys.length - 1 ? 3 : 0).attr("fill", s.color).attr("opacity", r.partial ? 0.45 : 1);
        y0 += v;
      });
      if (r.partial) {
        g.append("rect").attr("x", x(r.label)).attr("width", x.bandwidth()).attr("y", y(val(r, "petro"))).attr("height", y(0) - y(val(r, "petro")))
          .attr("fill", "none").attr("stroke", "var(--text-3)").attr("stroke-dasharray", "3 3").attr("rx", 3);
      }
    });
    // annotasjoner
    const notes = [
      { y: "2016", t: "Oljeprisfall" },
      { y: "2020", t: "Pandemi" },
      { y: "2022", t: "Energikrise" },
    ].filter((n) => x(n.y) != null);
    const an = svg.append("g").attr("class", "annot");
    notes.forEach((n) => {
      const r = rows.find((q) => q.label === n.y);
      const cx = x(n.y) + x.bandwidth() / 2, top = y(val(r, "petro"));
      an.append("line").attr("x1", cx).attr("x2", cx).attr("y1", top - 4).attr("y2", top - 18);
      an.append("text").attr("x", cx).attr("y", top - 22).attr("text-anchor", "middle").text(n.t);
    });
    // treffflater og tooltip
    const hl = svg.append("rect").attr("class", "bar-hl").attr("y", m.t - 10).attr("height", h - m.b - m.t + 10).style("display", "none");
    svg.append("g").selectAll("rect").data(rows).join("rect").attr("class", "hit")
      .attr("x", (r) => x(r.label) - (x.step() - x.bandwidth()) / 2).attr("width", x.step()).attr("y", m.t - 10).attr("height", h - m.b - m.t + 10)
      .on("mousemove", (e, r) => {
        hl.style("display", null).attr("x", x(r.label) - 3).attr("width", x.bandwidth() + 6);
        tip.show(`<div class="tt-title">${r.partial ? `${r.y} (jan–${S.MONTHS_SHORT[lastMonth - 1]})` : r.y}</div>
          ${keys.map((s) => `<div class="tt-row"><span><span class="key" style="background:${s.color}"></span>${s.name.replace(" på utvinning", "")}</span><b>${S.mill(val(r, s.k))}</b></div>`).join("")}
          <div class="tt-row" style="border-top:1px solid var(--border);margin-top:4px;padding-top:4px"><span>Petroleumsskatt</span><b>${S.mill(val(r, "petro"))}</b></div>`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => { tip.hide(); hl.style("display", "none"); });
  }

  // ---- Diagram 2: andeler ----
  function chart2() {
    const el = document.getElementById("c2");
    const w = Math.max(420, el.clientWidth || 600), h = 320, m = { t: 16, r: 16, b: 30, l: 44 };
    const svg = frame(el, w, h, m);
    const data = rows;
    const series = [
      { k: "shareUper", name: "Andel av upersonlige skattytere", short: "Upersonlige", color: "var(--series-1)" },
      { k: "shareTotal", name: "Andel av all skatt", short: "All skatt", color: "var(--series-2)" },
    ];
    legend("c2-legend", series.map((s) => ({ ...s, line: true })));
    const x = d3.scalePoint(data.map((r) => r.label), [m.l, w - m.r]).padding(0.3);
    const y = d3.scaleLinear([0, 100], [h - m.b, m.t]);
    yGrid(svg, y, w, m, (v) => v + " %", 5);
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`)
      .call(d3.axisBottom(x).tickSizeOuter(0).tickValues(x.domain().filter((_, i) => i % (w > 700 ? 2 : 3) === 0 || i === x.domain().length - 1)));
    series.forEach((s) => {
      const fullPts = data.filter((r) => !r.partial);
      svg.append("path").datum(fullPts).attr("fill", "none").attr("stroke", s.color).attr("stroke-width", 2).attr("stroke-linejoin", "round")
        .attr("d", d3.line().x((r) => x(r.label)).y((r) => y(r[s.k])));
      if (ytd) {
        svg.append("path").datum([fullPts[fullPts.length - 1], ytd]).attr("fill", "none").attr("stroke", s.color).attr("stroke-width", 2).attr("stroke-dasharray", "3 3")
          .attr("d", d3.line().x((r) => x(r.label)).y((r) => y(r[s.k])));
      }
      const lastPt = data[data.length - 1];
      svg.append("circle").attr("cx", x(lastPt.label)).attr("cy", y(lastPt[s.k])).attr("r", 4).attr("fill", s.color).attr("stroke", "var(--surface)").attr("stroke-width", 2);
    });
    crosshair(svg, x, y, data, series, w, h, m, (v) => S.pct(v, 1), (r) => r.partial ? `${r.y} (jan–${S.MONTHS_SHORT[lastMonth - 1]})` : r.y);
  }

  function crosshair(svg, x, y, data, series, w, h, m, fmt, title) {
    const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--border-strong)").style("display", "none");
    const dots = series.map((s) => svg.append("circle").attr("r", 4.5).attr("fill", s.color).attr("stroke", "var(--surface)").attr("stroke-width", 2).style("display", "none"));
    svg.append("rect").attr("x", m.l).attr("y", 0).attr("width", w - m.l - m.r).attr("height", h - m.b).attr("fill", "transparent")
      .on("mousemove", (e) => {
        const [px] = d3.pointer(e);
        const r = d3.least(data, (q) => Math.abs(x(q.label ?? q.x) - px));
        const cx = x(r.label ?? r.x);
        cross.style("display", null).attr("x1", cx).attr("x2", cx);
        series.forEach((s, i) => r[s.k] == null ? dots[i].style("display", "none") : dots[i].style("display", null).attr("cx", cx).attr("cy", y(r[s.k])));
        tip.show(`<div class="tt-title">${title(r)}</div>${series.filter((s) => r[s.k] != null).map((s) => `<div class="tt-row"><span><span class="key" style="background:${s.color}"></span>${s.short || s.name}</span><b>${fmt(r[s.k])}</b></div>`).join("")}`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => { tip.hide(); cross.style("display", "none"); dots.forEach((q) => q.style("display", "none")); });
  }

  // ---- Diagram 4: akkumulert gjennom året ----
  function chart4() {
    const el = document.getElementById("c4");
    const w = Math.max(420, el.clientWidth || 600), h = 320, m = { t: 16, r: 52, b: 30, l: 56 };
    const svg = frame(el, w, h, m);
    const years = d3.range(Math.max(2009, lastYear - 7), lastYear + 1);
    const cur = lastYear, prev = lastYear - 1;
    const byYear = years.map((yr) => ({
      yr,
      pts: d3.range(1, 13).map((mo) => {
        const mm = `${yr}M${String(mo).padStart(2, "0")}`;
        const c = get("2:C", mm), s = get("2:D", mm);
        return c == null && s == null ? null : { mo, v: ((c || 0) + (s || 0)) * (real ? d.kpi[baseYear] / (d.kpi[Math.min(yr, baseYear)] || d.kpi[baseYear]) : 1) };
      }).filter(Boolean),
    }));
    const colorOf = (yr) => (yr === cur ? "var(--series-1)" : yr === prev ? "var(--series-2)" : "var(--neutral-mark)");
    legend("c4-legend", [{ name: String(cur) + (partial ? " (hittil)" : ""), color: "var(--series-1)", line: true }, { name: String(prev), color: "var(--series-2)", line: true }, { name: `${years[0]}–${prev - 1}`, color: "var(--neutral-mark)", line: true }]);
    const x = d3.scaleLinear([1, 12], [m.l, w - m.r]);
    const y = d3.scaleLinear([Math.min(0, d3.min(byYear, (b) => d3.min(b.pts, (p) => p.v))), d3.max(byYear, (b) => d3.max(b.pts, (p) => p.v))], [h - m.b, m.t]).nice();
    yGrid(svg, y, w, m, fmtAxis);
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(12).tickFormat((v) => S.MONTHS_SHORT[v - 1]).tickSizeOuter(0));
    const line = d3.line().x((p) => x(p.mo)).y((p) => y(p.v)).curve(d3.curveMonotoneX);
    byYear.sort((a, b) => (a.yr === cur) - (b.yr === cur) || (a.yr === prev) - (b.yr === prev));
    byYear.forEach((b) => {
      svg.append("path").datum(b.pts).attr("fill", "none").attr("stroke", colorOf(b.yr)).attr("stroke-width", b.yr >= prev ? 2.5 : 1.5).attr("opacity", b.yr >= prev ? 1 : 0.8).attr("d", line);
      const lp = b.pts[b.pts.length - 1];
      if (lp) svg.append("text").attr("class", "dlabel").attr("x", x(lp.mo) + 6).attr("y", y(lp.v) + 4).attr("fill", b.yr >= prev ? "var(--text-2)" : "var(--text-3)").attr("font-weight", b.yr >= prev ? 600 : 400).text(b.yr);
    });
    // tooltip per måned
    const flat = d3.range(1, 13).map((mo) => {
      const o = { x: mo };
      byYear.forEach((b) => { const p = b.pts.find((q) => q.mo === mo); o["y" + b.yr] = p ? p.v : null; });
      return o;
    });
    const series = byYear.slice().sort((a, b) => b.yr - a.yr).map((b) => ({ k: "y" + b.yr, name: String(b.yr), color: colorOf(b.yr) }));
    crosshair(svg, (v) => x(v), y, flat, series, w, h, m, (v) => S.mill(v), (r) => `Per utgangen av ${S.MONTHS[r.x - 1]}`);
  }

  // ---- Diagram 3: sammensetning av all skatt ----
  function chart3() {
    const el = document.getElementById("c3");
    const w = Math.max(640, el.clientWidth || 1000), h = 360, m = { t: 16, r: 10, b: 30, l: 62 };
    const svg = frame(el, w, h, m);
    const keys = [
      { k: "petro", name: "Petroleumsskatt", color: "var(--series-1)" },
      { k: "uperOther", name: "Annen skatt fra upersonlige", color: "var(--series-3)" },
      { k: "pers", name: "Personlige skattytere inkl. arbeidsgiveravgift", color: "var(--neutral-mark)" },
    ];
    legend("c3-legend", keys);
    const x = d3.scaleBand(rows.map((r) => r.label), [m.l, w - m.r]).padding(0.22);
    const y = d3.scaleLinear([0, d3.max(rows, (r) => keys.reduce((s, k) => s + Math.max(0, val(r, k.k)), 0))], [h - m.b, m.t]).nice();
    yGrid(svg, y, w, m, fmtAxis);
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`)
      .call(d3.axisBottom(x).tickSizeOuter(0).tickValues(x.domain().filter((_, i) => w > 900 || i % 2 === 0)));
    const g = svg.append("g");
    rows.forEach((r) => {
      let y0 = 0;
      keys.forEach((s, i) => {
        const v = Math.max(0, val(r, s.k));
        const top = y(y0 + v), bot = y(y0);
        g.append("rect").attr("x", x(r.label)).attr("width", x.bandwidth()).attr("y", top).attr("height", Math.max(0, bot - top - (i > 0 ? 1.5 : 0)))
          .attr("rx", i === keys.length - 1 ? 3 : 0).attr("fill", s.color).attr("opacity", r.partial ? 0.45 : 1);
        y0 += v;
      });
    });
    const hl = svg.append("rect").attr("class", "bar-hl").attr("y", m.t).attr("height", h - m.b - m.t).style("display", "none");
    svg.append("g").selectAll("rect").data(rows).join("rect").attr("class", "hit")
      .attr("x", (r) => x(r.label) - (x.step() - x.bandwidth()) / 2).attr("width", x.step()).attr("y", m.t).attr("height", h - m.b - m.t)
      .on("mousemove", (e, r) => {
        hl.style("display", null).attr("x", x(r.label) - 3).attr("width", x.bandwidth() + 6);
        const sum = keys.reduce((s, k) => s + val(r, k.k), 0);
        tip.show(`<div class="tt-title">${r.partial ? `${r.y} (jan–${S.MONTHS_SHORT[lastMonth - 1]})` : r.y}</div>
          ${keys.slice().reverse().map((s) => `<div class="tt-row"><span><span class="key" style="background:${s.color}"></span>${s.name.replace(" inkl. arbeidsgiveravgift", "")}</span><b>${S.mill(val(r, s.k))} <span class="faint">${S.pct((100 * val(r, s.k)) / sum, 0)}</span></b></div>`).join("")}`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => { tip.hide(); hl.style("display", "none"); });
  }

  // ---- Tabell ----
  function table() {
    const tRows = rows.map((r) => ({
      id: r.label, år: r.partial ? `${r.y} (jan–${S.MONTHS_SHORT[lastMonth - 1]})` : String(r.y),
      ord: val(r, "ord"), sær: val(r, "sær"), petro: val(r, "petro"), uper: val(r, "uper"), total: val(r, "total"),
      shareUper: r.shareUper, shareTotal: r.shareTotal,
    }));
    document.getElementById("tbl-sub").textContent = `Mill. kr${kr()}. Klikk på en kolonne for å sortere.`;
    const f = (v) => S.nf0.format(Math.round(v));
    S.sortableTable(document.getElementById("table"), [
      { key: "år", label: "År", text: true },
      { key: "ord", label: "Ordinær skatt", fmt: f },
      { key: "sær", label: "Særskatt", fmt: f },
      { key: "petro", label: "Petroleumsskatt", fmt: f },
      { key: "uper", label: "Upersonlige i alt", fmt: f },
      { key: "total", label: "All skatt", fmt: f },
      { key: "shareUper", label: "Andel av upers.", fmt: (v) => S.pct(v, 1) },
      { key: "shareTotal", label: "Andel av alt", fmt: (v) => S.pct(v, 1) },
    ], tRows, { sortKey: "år", dir: -1 });
    document.getElementById("csv").onclick = () => S.downloadCsv(`petroleumsskatt${real ? "-faste-kroner" : ""}.csv`, [
      ["År", "Ordinær skatt (mill. kr)", "Særskatt (mill. kr)", "Petroleumsskatt (mill. kr)", "Upersonlige i alt (mill. kr)", "All skatt (mill. kr)", "Andel av upersonlige (%)", "Andel av all skatt (%)"],
      ...tRows.map((r) => [r.år, Math.round(r.ord), Math.round(r.sær), Math.round(r.petro), Math.round(r.uper), Math.round(r.total), r.shareUper.toFixed(1).replace(".", ","), r.shareTotal.toFixed(1).replace(".", ",")]),
    ]);
  }

  function renderAll() {
    renderKpis(); chart1(); chart2(); chart3(); chart4(); table();
    document.getElementById("c1-title").textContent = `Petroleumsskatt per år${real ? ` (faste ${baseYear}-kroner)` : ""}`;
  }
  renderAll();
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(renderAll, 200); });
  document.getElementById("updated").textContent = "Data oppdatert av SSB " + new Date(d.updated).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" });
})();
