/* Studie 3 – Formuesskatt og utflytting */
(async function () {
  const S = window.Skatt;
  const tip = S.tooltip();
  const [d, ord] = await Promise.all([
    fetch("data/formue.json").then((r) => r.json()),
    fetch("data/skatt-ordning.json").then((r) => r.json()),
  ]);

  const kpi = ord.kpi;
  const baseYear = Math.max(...Object.keys(kpi).map(Number));
  document.getElementById("real-btn").textContent = `Faste ${baseYear}-kroner`;
  let real = false;
  const defl = (y) => (real ? kpi[baseYear] / (kpi[Math.min(y, baseYear)] || kpi[baseYear]) : 1);
  const kr = () => (real ? ` (faste ${baseYear}-kr)` : "");
  const REF_FROM = 2012, REF_TO = 2021, HIKE = 2022;

  // ------------------------------------------------------------ nasjonale serier
  const years = d.years;
  const nat = years.map((y, i) => ({
    y, n: d.national.n[i], kom: d.national.kom[i], stat: d.national.stat[i],
    tot: d.national.kom[i] == null ? null : d.national.kom[i] + d.national.stat[i],
  })).filter((r) => r.tot != null);
  const natAt = (y) => nat.find((r) => r.y === y);

  // Fordeling etter størrelse på skatten (08231)
  const GROUPS = [
    { id: "g1", name: "Under 50 000 kr", codes: ["03", "04", "05"] },
    { id: "g2", name: "50 000–199 999 kr", codes: ["06", "07", "08", "09"] },
    { id: "g3", name: "200 000–999 999 kr", codes: ["10", "11", "12", "13", "14"] },
    { id: "g4", name: "1 mill. kr og mer", codes: ["15"] },
  ];
  const bRows = d.byears.map((y, i) => {
    const o = { y };
    let total = 0;
    for (const g of GROUPS) {
      let s = 0;
      for (const b of d.brackets.filter((b) => g.codes.includes(b.code))) s += (b.n[i] || 0) * (b.avg[i] || 0);
      o[g.id] = s;
      total += s;
    }
    for (const g of GROUPS) o[g.id + "p"] = total ? (100 * o[g.id]) / total : null;
    const top = d.brackets.find((b) => b.code === "15");
    o.topN = top.n[i];
    o.topSum = (top.n[i] || 0) * (top.avg[i] || 0);
    o.total = total;
    return o;
  }).filter((r) => r.total > 0);

  // Utvandring
  const ey = d.eyears;
  const mean = (arr, from, to) => d3.mean(ey.map((y, i) => (y >= from && y <= to ? arr[i] : null)).filter((v) => v != null));
  const lastE = ey[ey.length - 1];
  const sveits = Object.values(d.emigration.countries).find((c) => c.name === "Sveits");
  const totalE = d.emigration.total;
  const swBase = mean(sveits.v, REF_FROM, REF_TO), swAfter = mean(sveits.v, HIKE, lastE);
  const totBase = mean(totalE, REF_FROM, REF_TO), totAfter = mean(totalE, HIKE, lastE);

  // ------------------------------------------------------------ hjelpere
  function frame(el, w, h) { el.innerHTML = ""; return d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("role", "img"); }
  function yGrid(svg, y, w, m, fmt, ticks = 5) {
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(ticks).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(ticks).tickFormat(fmt).tickPadding(8));
  }
  function xBand(svg, x, h, m, w) {
    const dom = x.domain(), step = w > 900 ? 1 : w > 560 ? 2 : 4;
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`)
      .call(d3.axisBottom(x).tickSizeOuter(0).tickValues(dom.filter((_, i) => (dom.length - 1 - i) % step === 0)));
  }
  function legend(id, items) {
    document.getElementById(id).innerHTML = items.map((s) =>
      `<span class="item"><span class="sw ${s.line ? "line" : ""} ${s.dash ? "dash" : ""}" style="background:${s.color};color:${s.color}"></span>${s.name}</span>`).join("");
  }
  const fmtMrd = (v) => (v === 0 ? "0" : Math.abs(v) >= 1000 ? S.nf0.format(v / 1000) + " mrd" : S.nf0.format(v) + " mill");
  const fmtK = (v) => (v >= 1e6 ? S.nf1.format(v / 1e6) + " mill" : v >= 1000 ? S.nf0.format(v / 1000) + "k" : S.nf0.format(v));

  /** Enkelt søylediagram med hover. rows: [{x, v, ...}] */
  function bars(el, rows, o) {
    const w = Math.max(400, el.clientWidth || 600), h = o.h || 280, m = { t: 16, r: 8, b: 30, l: o.l || 56 };
    const svg = frame(el, w, h);
    const x = d3.scaleBand(rows.map((r) => r.x), [m.l, w - m.r]).padding(0.22);
    const y = d3.scaleLinear([0, d3.max(rows, (r) => r.v)], [h - m.b, m.t]).nice();
    yGrid(svg, y, w, m, o.yfmt, 4);
    xBand(svg, x, h, m, w);
    svg.append("g").selectAll("rect").data(rows).join("rect")
      .attr("x", (r) => x(r.x)).attr("width", x.bandwidth()).attr("y", (r) => y(r.v)).attr("height", (r) => y(0) - y(r.v))
      .attr("rx", 3).attr("fill", (r) => (o.hl && o.hl(r) ? "var(--series-1)" : "var(--neutral-mark)"));
    if (o.ref != null) {
      svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(o.ref)).attr("y2", y(o.ref)).attr("stroke", "var(--text-2)").attr("stroke-dasharray", "4 4");
      svg.append("text").attr("x", m.l + 4).attr("y", y(o.ref) - 6).attr("fill", "var(--text-2)").attr("font-size", 12).attr("font-weight", 600).attr("stroke", "var(--surface)").attr("stroke-width", 4).attr("paint-order", "stroke").text(o.refLabel);
    }
    const hl = svg.append("rect").attr("class", "bar-hl").attr("y", m.t).attr("height", h - m.b - m.t).style("display", "none");
    svg.append("g").selectAll("rect").data(rows).join("rect").attr("class", "hit")
      .attr("x", (r) => x(r.x) - (x.step() - x.bandwidth()) / 2).attr("width", x.step()).attr("y", m.t).attr("height", h - m.b - m.t)
      .on("mousemove", (e, r) => { hl.style("display", null).attr("x", x(r.x) - 3).attr("width", x.bandwidth() + 6); tip.show(o.tip(r), e.clientX, e.clientY); })
      .on("mouseleave", () => { tip.hide(); hl.style("display", "none"); });
  }

  // ------------------------------------------------------------ KPI
  function renderKpis() {
    const a = nat[nat.length - 1], b = natAt(REF_TO);
    const totA = a.tot * defl(a.y), totB = b.tot * defl(b.y);
    const lb = bRows[bRows.length - 1];
    const cards = [
      { l: `Formuesskatt ${a.y}`, v: S.mill(totA), s: `<span class="delta">${S.pct(100 * (totA / totB - 1), 0, true)}</span> fra ${b.y}${real ? " (realt)" : ""}` },
      { l: `Betaler formuesskatt ${a.y}`, v: S.int(a.n), s: `<span class="delta">${S.pct(100 * (a.n / b.n - 1), 0, true)}</span> fra ${b.y}` },
      { l: `Betalt av de ${S.int(lb.topN)} største`, v: S.pct(lb.g4p, 0), s: `av formuesskatten i ${lb.y} (≥ 1 mill. kr hver)` },
      { l: `Utflyttet til Sveits per år`, v: S.nf0.format(Math.round(swAfter)), s: `snitt ${HIKE}–${lastE} · <span class="delta">${S.pct(100 * (swAfter / swBase - 1), 0, true)}</span> mot ${REF_FROM}–${REF_TO}` },
    ];
    document.getElementById("kpis").innerHTML = cards.map((c) => `<div class="card kpi"><div class="l">${c.l}</div><div class="v">${c.v}</div><div class="s">${c.s}</div></div>`).join("");
  }

  // ------------------------------------------------------------ 1: per år
  function chart1() {
    const el = document.getElementById("c1");
    const w = Math.max(360, el.clientWidth || 1000), h = 360, m = { t: 30, r: 10, b: 30, l: 62 };
    const svg = frame(el, w, h);
    const keys = [{ k: "kom", name: "Til kommunen", color: "var(--series-1)" }, { k: "stat", name: "Til staten", color: "var(--series-2)" }];
    legend("c1-legend", keys);
    document.getElementById("c1-sub").textContent = `Mill. kr${kr()}, ${nat[0].y}–${nat[nat.length - 1].y}.`;
    document.getElementById("c1-title").textContent = `Formuesskatt per år${real ? ` (faste ${baseYear}-kroner)` : ""}`;
    const x = d3.scaleBand(nat.map((r) => r.y), [m.l, w - m.r]).padding(0.22);
    const y = d3.scaleLinear([0, d3.max(nat, (r) => r.tot * defl(r.y))], [h - m.b, m.t]).nice();
    yGrid(svg, y, w, m, fmtMrd);
    xBand(svg, x, h, m, w);
    nat.forEach((r) => {
      let y0 = 0;
      keys.forEach((s, i) => {
        const v = r[s.k] * defl(r.y);
        svg.append("rect").attr("x", x(r.y)).attr("width", x.bandwidth()).attr("y", y(y0 + v)).attr("height", Math.max(0, y(y0) - y(y0 + v) - (i ? 1.5 : 0)))
          .attr("rx", i === keys.length - 1 ? 3 : 0).attr("fill", s.color);
        y0 += v;
      });
    });
    const hr = natAt(HIKE);
    if (hr) {
      const cx = x(HIKE) + x.bandwidth() / 2, top = y(hr.tot * defl(HIKE));
      const an = svg.append("g").attr("class", "annot");
      an.append("line").attr("x1", cx).attr("x2", cx).attr("y1", top - 4).attr("y2", top - 18);
      an.append("text").attr("x", cx).attr("y", top - 22).attr("text-anchor", "end").text("Skjerpet formuesskatt");
    }
    const hl = svg.append("rect").attr("class", "bar-hl").attr("y", m.t - 10).attr("height", h - m.b - m.t + 10).style("display", "none");
    svg.append("g").selectAll("rect").data(nat).join("rect").attr("class", "hit")
      .attr("x", (r) => x(r.y) - (x.step() - x.bandwidth()) / 2).attr("width", x.step()).attr("y", m.t - 10).attr("height", h - m.b - m.t + 10)
      .on("mousemove", (e, r) => {
        hl.style("display", null).attr("x", x(r.y) - 3).attr("width", x.bandwidth() + 6);
        tip.show(`<div class="tt-title">${r.y}</div>${keys.map((s) => `<div class="tt-row"><span><span class="key" style="background:${s.color}"></span>${s.name}</span><b>${S.mill(r[s.k] * defl(r.y))}</b></div>`).join("")}
          <div class="tt-row" style="border-top:1px solid var(--border);margin-top:4px;padding-top:4px"><span>I alt</span><b>${S.mill(r.tot * defl(r.y))}</b></div>
          <div class="tt-row"><span>Antall som betaler</span><b>${S.int(r.n)}</b></div>`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => { tip.hide(); hl.style("display", "none"); });
  }

  // ------------------------------------------------------------ 2 + 3
  function chart2() {
    bars(document.getElementById("c2"), nat.map((r) => ({ x: r.y, v: r.n })), {
      yfmt: fmtK, hl: (r) => r.x >= HIKE,
      tip: (r) => `<div class="tt-title">${r.x}</div><div class="tt-row"><span>Betaler formuesskatt</span><b>${S.int(r.v)}</b></div>`,
    });
    bars(document.getElementById("c3"), bRows.map((r) => ({ x: r.y, v: r.topN, sum: r.topSum, p: r.g4p })), {
      yfmt: (v) => S.nf0.format(v), hl: (r) => r.x >= HIKE, l: 48,
      tip: (r) => `<div class="tt-title">${r.x}</div><div class="tt-row"><span>Personer</span><b>${S.int(r.v)}</b></div>
        <div class="tt-row"><span>Betalte til sammen</span><b>${S.mill((r.sum / 1e6) * defl(r.x))}</b></div>
        <div class="tt-row"><span>Andel av all formuesskatt</span><b>${S.pct(r.p, 0)}</b></div>`,
    });
  }

  // ------------------------------------------------------------ 4: hvem betaler
  function chart4() {
    const el = document.getElementById("c4");
    const w = Math.max(360, el.clientWidth || 1000), h = 320, m = { t: 12, r: 10, b: 30, l: 48 };
    const svg = frame(el, w, h);
    const dark = S.isDark();
    const ramp = dark ? ["#184f95", "#2a78d6", "#6da7ec", "#b7d3f6"] : ["#9ec5f4", "#5598e7", "#256abf", "#0d366b"];
    const keys = GROUPS.map((g, i) => ({ ...g, color: ramp[i] }));
    legend("c4-legend", keys);
    const x = d3.scaleBand(bRows.map((r) => r.y), [m.l, w - m.r]).padding(0.18);
    const y = d3.scaleLinear([0, 100], [h - m.b, m.t]);
    yGrid(svg, y, w, m, (v) => v + " %", 4);
    xBand(svg, x, h, m, w);
    bRows.forEach((r) => {
      let y0 = 0;
      keys.forEach((g, i) => {
        const v = r[g.id + "p"];
        svg.append("rect").attr("x", x(r.y)).attr("width", x.bandwidth()).attr("y", y(y0 + v)).attr("height", Math.max(0, y(y0) - y(y0 + v) - (i ? 1.5 : 0)))
          .attr("fill", g.color).attr("rx", i === keys.length - 1 ? 3 : 0);
        y0 += v;
      });
    });
    const hl = svg.append("rect").attr("class", "bar-hl").attr("y", m.t).attr("height", h - m.b - m.t).style("display", "none");
    svg.append("g").selectAll("rect").data(bRows).join("rect").attr("class", "hit")
      .attr("x", (r) => x(r.y) - (x.step() - x.bandwidth()) / 2).attr("width", x.step()).attr("y", m.t).attr("height", h - m.b - m.t)
      .on("mousemove", (e, r) => {
        hl.style("display", null).attr("x", x(r.y) - 3).attr("width", x.bandwidth() + 6);
        tip.show(`<div class="tt-title">${r.y}</div><div class="faint" style="font-size:12px;margin:-2px 0 6px">Formuesskatt per person</div>${keys.slice().reverse().map((g) =>
          `<div class="tt-row"><span><span class="key" style="background:${g.color}"></span>${g.name}</span><b>${S.pct(r[g.id + "p"], 0)}</b></div>`).join("")}`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => { tip.hide(); hl.style("display", "none"); });
  }

  // ------------------------------------------------------------ 5 + 6: utvandring
  function chart5() {
    bars(document.getElementById("c5"), ey.map((y, i) => ({ x: y, v: sveits.v[i] })), {
      yfmt: (v) => S.nf0.format(v), hl: (r) => r.x >= HIKE, l: 40, ref: swBase, refLabel: `Snitt ${REF_FROM}–${REF_TO}: ${S.nf0.format(Math.round(swBase))}`,
      tip: (r) => `<div class="tt-title">${r.x}</div><div class="tt-row"><span>Utvandret til Sveits</span><b>${S.int(r.v)}</b></div><div class="tt-row"><span>Mot snittet ${REF_FROM}–${REF_TO}</span><b>${S.pct(100 * (r.v / swBase - 1), 0, true)}</b></div>`,
    });
  }
  function chart6() {
    const el = document.getElementById("c6");
    const w = Math.max(400, el.clientWidth || 600), h = 280, m = { t: 16, r: 16, b: 30, l: 40 };
    const svg = frame(el, w, h);
    const series = [
      { k: "sw", name: "Sveits", color: "var(--series-1)" },
      { k: "all", name: "Alle land", color: "var(--series-2)" },
    ];
    legend("c6-legend", series.map((s) => ({ ...s, line: true })));
    const rows = ey.map((y, i) => ({ x: y, sw: (100 * sveits.v[i]) / swBase, all: (100 * totalE[i]) / totBase, swN: sveits.v[i], allN: totalE[i] }));
    const x = d3.scaleLinear(d3.extent(ey), [m.l, w - m.r]);
    const y = d3.scaleLinear([0, d3.max(rows, (r) => Math.max(r.sw, r.all))], [h - m.b, m.t]).nice();
    yGrid(svg, y, w, m, (v) => S.nf0.format(v), 5);
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("d")).tickSizeOuter(0));
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(100)).attr("y2", y(100)).attr("stroke", "var(--border-strong)").attr("stroke-dasharray", "3 3");
    svg.append("rect").attr("x", x(HIKE - 0.5)).attr("width", x(ey[ey.length - 1]) - x(HIKE - 0.5) + 8).attr("y", m.t).attr("height", h - m.b - m.t).attr("fill", "var(--surface-2)");
    svg.append("text").attr("x", x(HIKE - 0.5) + 6).attr("y", m.t + 14).attr("fill", "var(--text-3)").attr("font-size", 11.5).text(`Fra ${HIKE}`);
    series.forEach((s) => {
      svg.append("path").datum(rows).attr("fill", "none").attr("stroke", s.color).attr("stroke-width", 2).attr("stroke-linejoin", "round").attr("d", d3.line().x((r) => x(r.x)).y((r) => y(r[s.k])));
    });
    const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--border-strong)").style("display", "none");
    const dots = series.map((s) => svg.append("circle").attr("r", 4.5).attr("fill", s.color).attr("stroke", "var(--surface)").attr("stroke-width", 2).style("display", "none"));
    svg.append("rect").attr("x", m.l).attr("y", 0).attr("width", w - m.l - m.r).attr("height", h - m.b).attr("fill", "transparent")
      .on("mousemove", (e) => {
        const yr = Math.round(x.invert(d3.pointer(e)[0]));
        const r = rows.find((q) => q.x === yr);
        if (!r) return;
        cross.style("display", null).attr("x1", x(yr)).attr("x2", x(yr));
        series.forEach((s, i) => dots[i].style("display", null).attr("cx", x(yr)).attr("cy", y(r[s.k])));
        tip.show(`<div class="tt-title">${yr}</div>
          <div class="tt-row"><span><span class="key" style="background:var(--series-1)"></span>Sveits</span><b>${S.nf0.format(r.sw)} <span class="faint">(${S.int(r.swN)})</span></b></div>
          <div class="tt-row"><span><span class="key" style="background:var(--series-2)"></span>Alle land</span><b>${S.nf0.format(r.all)} <span class="faint">(${S.int(r.allN)})</span></b></div>`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => { tip.hide(); cross.style("display", "none"); dots.forEach((q) => q.style("display", "none")); });
  }

  function landTable() {
    const rows = Object.entries(d.emigration.countries).map(([id, c]) => {
      const before = mean(c.v, REF_FROM, REF_TO), after = mean(c.v, HIKE, lastE);
      return { id, land: c.name, before, after, chg: before ? 100 * (after / before - 1) : null, last: c.v[c.v.length - 1] };
    }).filter((r) => r.before >= 20);
    rows.push({ id: "all", land: "Alle land", before: totBase, after: totAfter, chg: 100 * (totAfter / totBase - 1), last: totalE[totalE.length - 1] });
    const f1 = (v) => S.nf0.format(Math.round(v));
    S.sortableTable(document.getElementById("land-table"), [
      { key: "land", label: "Land", text: true },
      { key: "before", label: `Snitt ${REF_FROM}–${REF_TO}`, fmt: f1 },
      { key: "after", label: `Snitt ${HIKE}–${lastE}`, fmt: f1 },
      { key: "chg", label: "Endring", fmt: (v) => S.pct(v, 0, true) },
      { key: "last", label: String(lastE), fmt: S.int },
    ], rows, { sortKey: "chg", dir: -1 });
    document.getElementById("csv-land").onclick = () => S.downloadCsv("utvandring-norske-statsborgere.csv", [
      ["Land", ...ey], ...Object.values(d.emigration.countries).map((c) => [c.name, ...c.v]), ["Alle land", ...totalE],
    ]);
  }

  // ------------------------------------------------------------ kommuner
  const K = d.kommuner, KY = d.kyears;
  const kYear = document.getElementById("k-year"), kFylke = document.getElementById("k-fylke");
  kYear.innerHTML = KY.map((y, i) => `<option value="${i}">${y}</option>`).reverse().join("");
  kFylke.innerHTML += Object.entries(d.fylker).sort((a, b) => a[1].localeCompare(b[1], "nb")).map(([id, n]) => `<option value="${id}">${S.escapeHtml(n)}</option>`).join("");
  const ks = { yi: KY.length - 1, fy: "", metric: "pc" };
  const refI = KY.indexOf(REF_TO);
  kYear.onchange = () => { ks.yi = +kYear.value; renderKommuner(); };
  kFylke.onchange = () => { ks.fy = kFylke.value; renderKommuner(); };
  document.querySelectorAll("#k-metric button").forEach((b) => b.addEventListener("click", () => {
    ks.metric = b.dataset.v;
    document.querySelectorAll("#k-metric button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderKommuner();
  }));

  const kTot = (k, i) => (k.kom[i] + k.stat[i]) * defl(KY[i]);
  function kMetric(k, i, m) {
    const tot = kTot(k, i);
    if (m === "tot") return tot;
    if (m === "pc") return k.pop[i] ? (tot * 1e6) / k.pop[i] : null;
    if (m === "share") return k.pop[i] ? (100 * k.n[i]) / k.pop[i] : null;
    const base = kTot(k, refI);
    return base > 0.05 ? 100 * (tot / base - 1) : null;
  }
  const kFmt = { tot: (v) => S.mill(v), pc: (v) => S.kr(v && Math.round(v)), share: (v) => S.pct(v, 1), chg: (v) => S.pct(v, 0, true) };
  const kLabel = { tot: "Formuesskatt totalt", pc: "Formuesskatt per innbygger", share: "Andel av innbyggerne som betaler formuesskatt", chg: `Endring i formuesskatt fra ${REF_TO}` };

  function renderKommuner() {
    const i = ks.yi, m = ks.metric, y = KY[i];
    const list = Object.entries(K).filter(([id, k]) => !ks.fy || k.f === ks.fy)
      .map(([id, k]) => ({ id, name: k.name, f: d.fylker[k.f], v: kMetric(k, i, m), tot: kTot(k, i), pc: kMetric(k, i, "pc"), share: kMetric(k, i, "share"), chg: kMetric(k, i, "chg"), n: k.n[i], avg: k.n[i] ? (kTot(k, i) * 1e6) / k.n[i] : null }))
      .filter((r) => r.v != null);
    list.sort((a, b) => b.v - a.v);
    const scope = ks.fy ? d.fylker[ks.fy] : "landet";
    document.getElementById("k-title").textContent = `${kLabel[m]}, ${y}`;
    document.getElementById("k-sub").textContent = `${list.length > 20 ? "De 20 høyeste" : "Alle"} kommunene i ${scope}${m === "tot" || m === "pc" ? kr() : ""}.${m === "chg" ? ` Sammenligner ${y} med ${REF_TO}, året før skjerpingen.` : ""}`;
    // nasjonal referanse
    let natTot = 0, natPop = 0, natN = 0, natBase = 0;
    for (const k of Object.values(K)) { natTot += kTot(k, i); natPop += k.pop[i]; natN += k.n[i]; natBase += kTot(k, refI); }
    const ref = m === "tot" ? null : m === "pc" ? (natTot * 1e6) / natPop : m === "share" ? (100 * natN) / natPop : 100 * (natTot / natBase - 1);

    const top = list.slice(0, 20);
    const el = document.getElementById("c7");
    const w = Math.max(360, el.clientWidth || 900), rowH = 26, m2 = { t: 24, r: 90, b: 8, l: Math.min(190, w * 0.36) };
    const h = m2.t + m2.b + rowH * top.length;
    const svg = frame(el, w, h);
    const lo = Math.min(0, d3.min(top, (r) => r.v)), hi = Math.max(0, d3.max(top, (r) => r.v), ref ?? 0);
    const x = d3.scaleLinear([lo, hi], [m2.l, w - m2.r]).nice();
    const g = svg.append("g").attr("class", "hbar");
    top.forEach((r, j) => {
      const yy = m2.t + j * rowH;
      g.append("text").attr("class", "name").attr("x", m2.l - 10).attr("y", yy + rowH / 2 + 4).attr("text-anchor", "end").text(r.name.length > 26 ? r.name.slice(0, 25) + "…" : r.name);
      const x0 = x(Math.min(0, r.v)), x1 = x(Math.max(0, r.v));
      g.append("rect").attr("x", x0).attr("width", Math.max(1, x1 - x0)).attr("y", yy + 5).attr("height", rowH - 10).attr("rx", 3).attr("fill", "var(--series-1)");
      g.append("text").attr("class", "val").attr("x", x1 + 6).attr("y", yy + rowH / 2 + 4).text(kFmt[m](r.v));
      g.append("rect").attr("class", "hit").attr("x", 0).attr("width", w).attr("y", yy).attr("height", rowH)
        .on("mousemove", (e) => tip.show(`<div class="tt-title">${S.escapeHtml(r.name)}</div><div class="faint" style="font-size:12px;margin:-2px 0 6px">${S.escapeHtml(r.f)} · ${y}</div>
          <div class="tt-row"><span>Formuesskatt</span><b>${S.mill(r.tot)}</b></div>
          <div class="tt-row"><span>Per innbygger</span><b>${S.kr(r.pc && Math.round(r.pc))}</b></div>
          <div class="tt-row"><span>Betaler formuesskatt</span><b>${S.int(r.n)} (${S.pct(r.share, 1)})</b></div>
          <div class="tt-row"><span>Snitt per skatteyter</span><b>${S.kr(r.avg && Math.round(r.avg))}</b></div>
          <div class="tt-row"><span>Endring fra ${REF_TO}</span><b>${S.pct(r.chg, 0, true)}</b></div>`, e.clientX, e.clientY))
        .on("mouseleave", () => tip.hide());
    });
    if (lo < 0) g.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", m2.t).attr("y2", h - m2.b).attr("stroke", "var(--border-strong)");
    if (ref != null && isFinite(ref)) {
      svg.append("line").attr("x1", x(ref)).attr("x2", x(ref)).attr("y1", m2.t - 6).attr("y2", h - m2.b).attr("stroke", "var(--text-2)").attr("stroke-dasharray", "4 4");
      svg.append("text").attr("x", x(ref) + 4).attr("y", m2.t - 10).attr("fill", "var(--text-2)").attr("font-size", 11.5).text(`Landet: ${kFmt[m](ref)}`);
    }

    const f = (v) => S.kr(v && Math.round(v));
    S.sortableTable(document.getElementById("kom-table"), [
      { key: "name", label: "Kommune", text: true },
      ...(ks.fy ? [] : [{ key: "f", label: "Fylke", text: true }]),
      { key: "tot", label: "Formuesskatt", fmt: (v) => S.mill(v) },
      { key: "pc", label: "Per innbygger", fmt: f },
      { key: "n", label: "Antall som betaler", fmt: S.int },
      { key: "share", label: "Andel som betaler", fmt: (v) => S.pct(v, 1) },
      { key: "avg", label: "Snitt per skatteyter", fmt: f },
      { key: "chg", label: `Endring fra ${REF_TO}`, fmt: (v) => S.pct(v, 0, true) },
    ], list, { sortKey: m, dir: -1 });
    document.getElementById("csv-kom").onclick = () => S.downloadCsv(`formuesskatt-kommuner-${y}.csv`, [
      ["Kommunenr", "Kommune", "Fylke", "Formuesskatt (mill. kr)", "Per innbygger (kr)", "Antall som betaler", "Andel som betaler (%)", "Snitt per skatteyter (kr)", `Endring fra ${REF_TO} (%)`],
      ...list.map((r) => [r.id, r.name, r.f, r.tot.toFixed(2).replace(".", ","), r.pc == null ? "" : Math.round(r.pc), r.n, r.share == null ? "" : r.share.toFixed(1).replace(".", ","), r.avg == null ? "" : Math.round(r.avg), r.chg == null ? "" : r.chg.toFixed(1).replace(".", ",")]),
    ]);
  }

  // ------------------------------------------------------------ oppstart
  document.querySelectorAll("#real button").forEach((b) => b.addEventListener("click", () => {
    real = b.dataset.v === "real";
    document.querySelectorAll("#real button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderAll();
  }));
  function renderAll() { renderKpis(); chart1(); chart2(); chart4(); chart5(); chart6(); landTable(); renderKommuner(); }
  renderAll();
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(renderAll, 200); });
  S.onThemeChange(() => chart4());
  document.getElementById("updated").textContent = "Data oppdatert av SSB " + new Date(d.updated).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" });
})();
