/* Studie 8 – Eiendomsskatten */
(async function () {
  const S = window.Skatt;
  const tip = S.tooltip();
  const [d, ord, topo] = await Promise.all([
    fetch("data/eiendomsskatt.json").then((r) => r.json()),
    fetch("data/skatt-ordning.json").then((r) => r.json()),
    fetch("data/norge-2024.topo.json").then((r) => r.json()),
  ]);
  const K = d.kommuner, N = d.national, Y = d.years;
  const fylkeName = (f) => d.fylker[f] || f;
  const kpi = ord.kpi, baseYear = Math.max(...Object.keys(kpi).map(Number));
  document.getElementById("real-btn").textContent = `Faste ${baseYear}-kroner`;
  let real = false;
  const defl = (y) => (real ? kpi[baseYear] / (kpi[Math.min(y, baseYear)] || kpi[baseYear]) : 1);
  const AY = d.amountYears[d.amountYears.length - 1];
  const ai = Y.indexOf(AY);
  const mill = (tusen) => S.mill(tusen / 1000);

  // ordningstype for en kommune (siste år)
  const TYPES = [
    { id: "bolig", name: "Skatt på bolig", color: "var(--series-1)" },
    { id: "naering", name: "Bare kraft og næring", color: "var(--series-2)" },
    { id: "ingen", name: "Ingen eiendomsskatt", color: "var(--neutral-mark)" },
  ];
  function typeOf(k) {
    const p = k.p;
    if (!p || p.har == null) return null;
    if (!p.har) return "ingen";
    if (p.t_naering || p.t_verk) return "naering";
    return "bolig";
  }
  const typeLabel = (p) => {
    if (!p || !p.har) return "Ingen eiendomsskatt";
    if (p.t_hele) return "I hele kommunen";
    if (p.t_heleun) return "I hele kommunen, unntatt kraft og næring";
    if (p.t_byalle) return "Byområder + kraft og næring";
    if (p.t_byverk) return "Byområder + kraftanlegg";
    if (p.t_by) return "Bare byområder";
    if (p.t_naering) return "Bare kraft og næring";
    if (p.t_verk) return "Bare kraftanlegg, vind og petroleum";
    return "Eiendomsskatt";
  };
  const perInnb = (k, key, i = ai) => (k.a[key][i] != null && k.pop[i] ? (k.a[key][i] * 1000 * defl(Y[i])) / k.pop[i] : null);

  // ---------------------------------------------------------------- KPI
  function kpis() {
    const nI = N.years.indexOf(AY);
    const tot = N.tot[nI] * 1000 * defl(AY);
    const bf = N.boligfritid[nI];
    const counts = { bolig: 0, naering: 0, ingen: 0 };
    Object.values(K).forEach((k) => { const t = typeOf(k); if (t) counts[t]++; });
    const lastEne = N.enebolig.map((v, i) => [v, N.years[i]]).filter((x) => x[0] != null).pop();
    const firstEne = N.enebolig.map((v, i) => [v, N.years[i]]).find((x) => x[0] != null);
    const cards = [
      { l: `Eiendomsskatt ${AY}`, v: S.mill(tot / 1e6), s: `${S.pct((100 * N.tot[nI]) / N.tot[0] - 100, 0, true)} siden ${N.years[0]}${real ? " (realt: " + S.pct(100 * (N.tot[nI] * defl(AY)) / (N.tot[0] * defl(N.years[0])) - 100, 0, true) + ")" : ""}` },
      { l: `Fra boliger og fritidsboliger`, v: S.pct((100 * bf) / N.tot[nI], 0), s: `${S.pct((100 * N.boligfritid[0]) / N.tot[0], 0)} i ${N.years[0]}` },
      { l: `Kommuner med skatt på bolig ${d.policyYear}`, v: `${counts.bolig} av ${Object.keys(K).length}`, s: `${counts.naering} bare på kraft/næring · ${counts.ingen} uten` },
      { l: `Enebolig på 120 m²`, v: S.kr(lastEne[0] * defl(lastEne[1])), s: `snitt i kommunene med boligskatt, ${lastEne[1]} · ${S.kr(firstEne[0] * defl(firstEne[1]))} i ${firstEne[1]}` },
    ];
    document.getElementById("kpis").innerHTML = cards.map((c) => `<div class="card kpi"><div class="l">${c.l}</div><div class="v">${c.v}</div><div class="s">${c.s}</div></div>`).join("");
  }

  // ---------------------------------------------------------------- diagrammer
  function frame(el, h) { const w = Math.max(360, el.clientWidth || 800); el.innerHTML = ""; return { svg: d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`), w, h }; }
  function legend(id, items) { document.getElementById(id).innerHTML = items.map((s) => `<span class="item"><span class="sw ${s.line ? "line" : ""}" style="background:${s.color}"></span>${S.escapeHtml(s.name)}</span>`).join(""); }
  function stacked(el, rows, keys, o) {
    const h = o.h || 320, m = { t: 14, r: 10, b: 28, l: o.l || 60 };
    const { svg, w } = frame(el, h);
    const x = d3.scaleBand(rows.map((r) => r.x), [m.l, w - m.r]).padding(0.2);
    const y = d3.scaleLinear([0, d3.max(rows, (r) => d3.sum(keys, (k) => r[k.k] || 0))], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(o.yfmt).tickPadding(6));
    const step = w > 800 ? 1 : 2;
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickSizeOuter(0).tickValues(x.domain().filter((_, i) => (rows.length - 1 - i) % step === 0)));
    rows.forEach((r) => {
      let y0 = 0;
      keys.forEach((k, i) => {
        const v = r[k.k] || 0;
        svg.append("rect").attr("x", x(r.x)).attr("width", x.bandwidth()).attr("y", y(y0 + v)).attr("height", Math.max(0, y(y0) - y(y0 + v) - (i ? 1.5 : 0))).attr("fill", k.color).attr("rx", i === keys.length - 1 ? 3 : 0);
        y0 += v;
      });
    });
    const hl = svg.append("rect").attr("class", "bar-hl").attr("y", m.t).attr("height", h - m.b - m.t).style("display", "none");
    svg.append("g").selectAll("rect").data(rows).join("rect").attr("class", "hit").attr("x", (r) => x(r.x) - (x.step() - x.bandwidth()) / 2).attr("width", x.step()).attr("y", m.t).attr("height", h - m.b - m.t)
      .on("mousemove", (e, r) => { hl.style("display", null).attr("x", x(r.x) - 2).attr("width", x.bandwidth() + 4); tip.show(o.tip(r), e.clientX, e.clientY); })
      .on("mouseleave", () => { tip.hide(); hl.style("display", "none"); });
  }
  function lineChart(el, rows, series, o) {
    const h = o.h || 240, m = { t: 14, r: 14, b: 28, l: o.l || 50 };
    const { svg, w } = frame(el, h);
    const x = d3.scaleLinear(d3.extent(rows, (r) => r.x), [m.l, w - m.r]);
    const vals = rows.flatMap((r) => series.map((s) => r[s.k])).filter((v) => v != null);
    const y = d3.scaleLinear([0, d3.max(vals)], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(o.yfmt).tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(Math.min(8, w / 70)).tickFormat(d3.format("d")).tickSizeOuter(0));
    series.forEach((s) => svg.append("path").datum(rows).attr("fill", "none").attr("stroke", s.color).attr("stroke-width", 2).attr("d", d3.line().defined((r) => r[s.k] != null).x((r) => x(r.x)).y((r) => y(r[s.k]))));
    const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--border-strong)").style("display", "none");
    svg.append("rect").attr("x", m.l).attr("width", w - m.l - m.r).attr("height", h - m.b).attr("fill", "transparent")
      .on("mousemove", (e) => { const xv = Math.round(x.invert(d3.pointer(e)[0])); const r = rows.find((q) => q.x === xv); if (!r) return; cross.style("display", null).attr("x1", x(xv)).attr("x2", x(xv)); tip.show(`<div class="tt-title">${xv}</div>${series.map((s) => `<div class="tt-row"><span><span class="key" style="background:${s.color}"></span>${s.name}</span><b>${r[s.k] == null ? "–" : o.fmt(r[s.k])}</b></div>`).join("")}`, e.clientX, e.clientY); })
      .on("mouseleave", () => { tip.hide(); cross.style("display", "none"); });
  }
  const fmtMrd = (v) => (v === 0 ? "0" : v >= 1e9 ? S.nf0.format(v / 1e9) + " mrd" : S.nf0.format(v / 1e6) + " mill");

  function national() {
    const keys = [{ k: "bf", name: "Boliger og fritidsboliger", color: "var(--series-1)" }, { k: "an", name: "Annen eiendom (kraft, næring m.m.)", color: "var(--series-2)" }];
    legend("c1-legend", keys);
    document.getElementById("c1-sub").textContent = `Kroner${real ? ` (faste ${baseYear}-kr)` : ""}, alle kommuner, ${N.years[0]}–${AY}.`;
    const rows = N.years.map((y, i) => ({ x: y, bf: N.boligfritid[i] != null ? N.boligfritid[i] * 1000 * defl(y) : null, an: N.annen[i] != null ? N.annen[i] * 1000 * defl(y) : null })).filter((r) => r.bf != null);
    stacked(document.getElementById("c1"), rows, keys, {
      yfmt: fmtMrd,
      tip: (r) => `<div class="tt-title">${r.x}</div>${keys.map((k) => `<div class="tt-row"><span><span class="key" style="background:${k.color}"></span>${k.name}</span><b>${S.mill(r[k.k] / 1e6)}</b></div>`).join("")}<div class="tt-row" style="border-top:1px solid var(--border);margin-top:4px;padding-top:4px"><span>I alt</span><b>${S.mill((r.bf + r.an) / 1e6)}</b></div>`,
    });

    // hva skattlegges – siste år, summert fra kommunene
    const parts = [
      { k: "bolig", name: "Boliger", color: "var(--series-1)" }, { k: "fritid", name: "Fritidsboliger", color: "var(--series-1)" },
      { k: "vann", name: "Vannkraftanlegg", color: "var(--series-2)" }, { k: "vind", name: "Vindkraftverk", color: "var(--series-2)" },
      { k: "petro", name: "Petroleumsanlegg", color: "var(--series-2)" }, { k: "naering", name: "Kraftnett og næringseiendom", color: "var(--series-2)" },
    ].map((p) => ({ ...p, v: d3.sum(Object.values(K), (k) => k.a[p.k][ai] || 0) * 1000 * defl(AY) }));
    const tot = d3.sum(parts, (p) => p.v), mx = d3.max(parts, (p) => p.v);
    document.getElementById("c2-title").textContent = `Hva skattlegges? (${AY})`;
    document.getElementById("c2").innerHTML = parts.map((p) => `<div class="bar-row"><span class="name">${p.name}</span><span class="val">${S.mill(p.v / 1e6)} <span class="faint">· ${S.pct((100 * p.v) / tot, 0)}</span></span><div class="track"><div class="fill" style="width:${(100 * p.v) / mx}%;background:${p.color}"></div></div></div>`).join("");

    // antall kommuner etter ordning
    const tk = [
      { k: "hele", name: "Hele kommunen", color: "var(--series-1)" },
      { k: "by", name: "Byområder (± kraft/næring)", color: "var(--series-3)" },
      { k: "naer", name: "Bare kraft og næring", color: "var(--series-2)" },
    ];
    legend("c3-legend", tk);
    const z = (v) => v || 0;
    const trows = N.years.map((y, i) => ({ x: y, hele: z(N.t_hele[i]) + z(N.t_heleun[i]), by: z(N.t_byalle[i]) + z(N.t_byverk[i]) + z(N.t_by[i]), naer: z(N.t_naering[i]) + z(N.t_verk[i]), n: N.kommuner[i] })).filter((r) => r.n != null && r.hele + r.by + r.naer > 0);
    stacked(document.getElementById("c3"), trows, tk, { h: 300, l: 44, yfmt: (v) => S.nf0.format(v), tip: (r) => `<div class="tt-title">${r.x}</div>${tk.map((k) => `<div class="tt-row"><span><span class="key" style="background:${k.color}"></span>${k.name}</span><b>${r[k.k]}</b></div>`).join("")}<div class="tt-row" style="border-top:1px solid var(--border);margin-top:4px;padding-top:4px"><span>Med eiendomsskatt</span><b>${r.n}</b></div>` });

    // enebolig og satser
    const erows = N.years.map((y, i) => ({ x: y, e: N.enebolig[i] != null ? N.enebolig[i] * defl(y) : null, b: N.snittbolig[i] != null ? N.snittbolig[i] * defl(y) : null, s: N.sats[i], sb: N.satsbolig[i] }));
    lineChart(document.getElementById("c4"), erows.filter((r) => r.e != null || r.b != null), [{ k: "e", name: "Enebolig 120 m²", color: "var(--series-1)" }, { k: "b", name: "Gjennomsnitt per bolig", color: "var(--series-2)" }], { fmt: (v) => S.kr(Math.round(v)), yfmt: (v) => S.nf0.format(v) });
    const sl = [{ k: "s", name: "Generell sats", color: "var(--series-1)" }, { k: "sb", name: "Sats for bolig", color: "var(--series-2)" }];
    legend("c5-legend", sl.map((s) => ({ ...s, line: true })));
    lineChart(document.getElementById("c5"), erows.filter((r) => r.s != null), sl, { fmt: (v) => S.nf1.format(v) + " ‰", yfmt: (v) => v + " ‰", l: 40 });
  }

  // ---------------------------------------------------------------- kommuner
  const IND = {
    type: { name: `Ordning ${d.policyYear}`, cat: true },
    pc: { name: `Eiendomsskatt per innbygger ${AY}`, get: (k) => perInnb(k, "tot"), fmt: (v) => S.kr(Math.round(v)) },
    bf: { name: `Fra bolig og fritidsbolig per innbygger ${AY}`, get: (k) => perInnb(k, "boligfritid"), fmt: (v) => S.kr(Math.round(v)) },
    kraft: { name: `Fra kraftanlegg og vindkraft per innbygger ${AY}`, get: (k) => (k.a.vann[ai] == null ? null : ((k.a.vann[ai] + (k.a.vind[ai] || 0)) * 1000 * defl(AY)) / k.pop[ai]), fmt: (v) => S.kr(Math.round(v)) },
    andel: { name: `Andel fra bolig og fritidsbolig ${AY}`, get: (k) => (k.a.tot[ai] ? (100 * k.a.boligfritid[ai]) / k.a.tot[ai] : null), fmt: (v) => S.pct(v, 0) },
    enebolig: { name: "Eiendomsskatt for enebolig 120 m²", get: (k) => k.p?.enebolig || null, fmt: (v) => S.kr(v), yearOf: "enebolig" },
    snitt: { name: "Gjennomsnittlig eiendomsskatt per bolig", get: (k) => k.p?.snittbolig || null, fmt: (v) => S.kr(v), yearOf: "snittbolig" },
    sats: { name: `Generell skattesats ${d.policyYear} (‰)`, get: (k) => k.p?.sats || null, fmt: (v) => S.nf1.format(v) + " ‰" },
    satsb: { name: `Skattesats for bolig ${d.policyYear} (‰)`, get: (k) => k.p?.satsbolig || null, fmt: (v) => S.nf1.format(v) + " ‰" },
  };
  const st = { ind: "type", f: "", k: null };
  const indSel = document.getElementById("ind"), fySel = document.getElementById("fy");
  indSel.innerHTML = Object.entries(IND).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");
  fySel.innerHTML += Object.entries(d.fylker).sort((a, b) => a[1].localeCompare(b[1], "nb")).map(([id, n]) => `<option value="${id}">${S.escapeHtml(n)}</option>`).join("");
  indSel.onchange = () => { st.ind = indSel.value; renderK(); };
  fySel.onchange = () => { st.f = fySel.value; if (st.k && st.f && K[st.k].f !== st.f) st.k = null; renderK(); };
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
    tooltip: (id) => {
      const k = K[id], I = IND[st.ind];
      const v = I.cat ? typeLabel(k.p) : I.get(k) == null ? "Ingen" : I.fmt(I.get(k));
      return `<div class="tt-title">${S.escapeHtml(k.name)}</div><div class="tt-row"><span>${I.cat ? "Ordning" : I.name}</span><b>${v}</b></div><div class="tt-row"><span>Per innbygger ${AY}</span><b>${perInnb(k, "tot") == null ? "–" : S.kr(Math.round(perInnb(k, "tot")))}</b></div>`;
    },
  });

  function side(sorted, values) {
    const el = document.getElementById("side");
    const I = IND[st.ind];
    if (!st.k) {
      if (I.cat) {
        const list = (t) => Object.entries(K).filter(([id, k]) => typeOf(k) === t && (!st.f || k.f === st.f)).sort((a, b) => (perInnb(b[1], "tot") || 0) - (perInnb(a[1], "tot") || 0));
        const li = ([id, k], i) => `<li><button data-k="${id}"><span class="r">${i + 1}</span><span>${S.escapeHtml(k.name)}</span><span class="v">${perInnb(k, "tot") == null ? "–" : S.kr(Math.round(perInnb(k, "tot")))}</span></button></li>`;
        el.innerHTML = `<span class="eyebrow">${st.f ? S.escapeHtml(fylkeName(st.f)) : "Hele landet"}</span><h2 class="display big">Ordningene</h2>
          <p class="faint" style="font-size:13px;margin:6px 0 0">Kommuner som bare skattlegger kraft og næring, rangert etter eiendomsskatt per innbygger – og kommunene uten eiendomsskatt.</p>
          <h3>Mest per innbygger – bare kraft og næring</h3><ol class="rank-list">${list("naering").slice(0, 8).map(li).join("")}</ol>
          <h3>Uten eiendomsskatt</h3><p style="font-size:14px;color:var(--text-2);margin:0">${list("ingen").map(([id, k]) => `<a href="#" data-k="${id}">${S.escapeHtml(k.name)}</a>`).join(", ") || "Ingen"}</p>`;
      } else {
        const li = (id) => `<li><button data-k="${id}"><span class="r">${sorted.indexOf(id) + 1}</span><span>${S.escapeHtml(K[id].name)}</span><span class="v">${I.fmt(values[id])}</span></button></li>`;
        el.innerHTML = `<span class="eyebrow">${st.f ? S.escapeHtml(fylkeName(st.f)) : "Hele landet"}</span><h2 class="display big">${S.escapeHtml(I.name)}</h2>
          <h3>Høyest</h3><ol class="rank-list">${sorted.slice(0, 10).map(li).join("")}</ol><h3>Lavest</h3><ol class="rank-list">${sorted.slice(-8).reverse().map(li).join("")}</ol>`;
      }
      el.querySelectorAll("[data-k]").forEach((b) => (b.onclick = (e) => { e.preventDefault(); st.k = b.dataset.k; renderK(); map.zoomToKommune(st.k); }));
      return;
    }
    const k = K[st.k], p = k.p || {}, py = k.py || {};
    const yes = (v) => (v ? "Ja" : "Nei");
    const parts = [["bolig", "Boliger"], ["fritid", "Fritidsboliger"], ["vann", "Vannkraft"], ["vind", "Vindkraft"], ["petro", "Petroleum"], ["naering", "Kraftnett og næring"]]
      .map(([key, n]) => ({ n, v: k.a[key][ai] })).filter((x) => x.v);
    const mx = d3.max(parts, (x) => x.v) || 1, tot = d3.sum(parts, (x) => x.v) || 1;
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
        <div><span class="eyebrow">${S.escapeHtml(fylkeName(k.f))} · ${S.int(k.pop[ai])} innbyggere</span><h2 class="display big">${S.escapeHtml(k.name)}</h2>
        <span class="pill accent" style="margin-top:6px">${typeLabel(p)}</span></div>
        <button class="icon-btn" id="close" aria-label="Lukk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
      <div class="kv">
        <div><div class="k">Eiendomsskatt ${AY}</div><div class="v">${k.a.tot[ai] == null ? "–" : mill(k.a.tot[ai] * defl(AY))}</div><div class="n">${perInnb(k, "tot") == null ? "" : S.kr(Math.round(perInnb(k, "tot"))) + " per innbygger"}</div></div>
        <div><div class="k">Enebolig 120 m² ${py.enebolig || ""}</div><div class="v">${p.enebolig ? S.kr(p.enebolig) : "–"}</div><div class="n">Snitt per bolig: ${p.snittbolig ? S.kr(p.snittbolig) : "–"}</div></div>
        <div><div class="k">Generell sats ${py.sats || ""}</div><div class="v">${p.sats ? S.nf1.format(p.sats) + " ‰" : "–"}</div><div class="n">Bolig: ${p.satsbolig ? S.nf1.format(p.satsbolig) + " ‰" : "–"}</div></div>
        <div><div class="k">Bunnfradrag</div><div class="v">${p.harbunn ? S.kr(p.bunn) : "Nei"}</div><div class="n">Siste taksering: ${p.takstaar || "–"}</div></div>
      </div>
      <div class="flags">
        <span class="pill">Fritak for nye boliger: ${yes(p.fritaknye)}</span>
        <span class="pill">Fritak for fritidsboliger: ${yes(p.fritakfritid)}</span>
        <span class="pill">Bruker formuesgrunnlag: ${yes(p.formuesgrunnlag)}</span>
      </div>
      ${parts.length ? `<h3>Hva skattlegges (${AY})</h3><div class="bars">${parts.map((x) => `<div class="bar-row"><span class="name">${x.n}</span><span class="val">${mill(x.v * defl(AY))} <span class="faint">· ${S.pct((100 * x.v) / tot, 0)}</span></span><div class="track"><div class="fill" style="width:${(100 * x.v) / mx}%;background:var(--series-1)"></div></div></div>`).join("")}</div>` : ""}
      <h3>Eiendomsskatt per innbygger over tid</h3>
      <div class="legend" id="kts-l"></div><div class="chart" id="kts"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><a class="btn" href="kart.html#l=k&r=${st.k}">Skattekartet</a><a class="btn" href="profil.html#k=${st.k}">Kommuneprofil</a></div>`;
    el.querySelector("#close").onclick = () => { st.k = null; renderK(); };
    const keys = [{ k: "bf", name: "Bolig og fritidsbolig", color: "var(--series-1)" }, { k: "an", name: "Annen eiendom", color: "var(--series-2)" }];
    legend("kts-l", keys);
    const rows = Y.map((y, i) => ({ x: y, bf: k.a.boligfritid[i] != null && k.pop[i] ? (k.a.boligfritid[i] * 1000 * defl(y)) / k.pop[i] : null, an: k.a.annen[i] != null && k.pop[i] ? (k.a.annen[i] * 1000 * defl(y)) / k.pop[i] : null })).filter((r) => d.amountYears.includes(r.x));
    stacked(el.querySelector("#kts"), rows, keys, { h: 220, l: 50, yfmt: (v) => S.nf0.format(v), tip: (r) => `<div class="tt-title">${r.x}</div>${keys.map((q) => `<div class="tt-row"><span><span class="key" style="background:${q.color}"></span>${q.name}</span><b>${r[q.k] == null ? "–" : S.kr(Math.round(r[q.k]))}</b></div>`).join("")}` });
  }

  function renderK() {
    const I = IND[st.ind];
    indSel.value = st.ind; fySel.value = st.f;
    let values, sorted = [];
    if (I.cat) {
      values = Object.fromEntries(Object.entries(K).map(([id, k]) => [id, typeOf(k)]));
      map.update({ values, categories: TYPES, title: `Eiendomsskatt ${d.policyYear}`, fylke: st.f || null, selected: st.k });
      document.getElementById("map-sub").textContent = "Hva kommunen skattlegger.";
    } else {
      values = Object.fromEntries(Object.entries(K).map(([id, k]) => [id, I.get(k)]));
      sorted = Object.keys(values).filter((id) => values[id] != null && (!st.f || K[id].f === st.f)).sort((a, b) => values[b] - values[a]);
      map.update({ values, fmt: I.fmt, short: I.fmt, title: I.name, fylke: st.f || null, selected: st.k });
      document.getElementById("map-sub").textContent = `Grå kommuner har ikke eiendomsskatt eller mangler tall.${st.f ? ` Fargene er tilpasset ${fylkeName(st.f)}.` : ""}`;
    }
    document.getElementById("map-title").textContent = I.name;
    side(sorted, values);
    // tabell
    const rows = Object.entries(K).filter(([id, k]) => !st.f || k.f === st.f).map(([id, k]) => ({
      id, name: k.name, fylke: fylkeName(k.f), type: typeLabel(k.p), tot: k.a.tot[ai] == null ? null : k.a.tot[ai] * 1000 * defl(AY), pc: perInnb(k, "tot"),
      andel: k.a.tot[ai] ? (100 * k.a.boligfritid[ai]) / k.a.tot[ai] : null, sats: k.p?.sats || null, satsb: k.p?.satsbolig || null, ene: k.p?.enebolig || null,
    }));
    document.getElementById("tbl-sub").textContent = `Beløp ${AY}${real ? ` i faste ${baseYear}-kroner` : ""}, ordninger ${d.policyYear}. Klikk på en kolonne for å sortere.`;
    S.sortableTable(document.getElementById("table"), [
      { key: "name", label: "Kommune", text: true }, ...(st.f ? [] : [{ key: "fylke", label: "Fylke", text: true }]),
      { key: "type", label: "Ordning", text: true }, { key: "tot", label: "Eiendomsskatt", fmt: (v) => (v == null ? "–" : S.mill(v / 1e6)) },
      { key: "pc", label: "Per innbygger", fmt: (v) => (v == null ? "–" : S.kr(Math.round(v))) }, { key: "andel", label: "Fra bolig/fritid", fmt: (v) => S.pct(v, 0) },
      { key: "sats", label: "Sats ‰", fmt: (v) => (v ? S.nf1.format(v) : "–") }, { key: "satsb", label: "Boligsats ‰", fmt: (v) => (v ? S.nf1.format(v) : "–") },
      { key: "ene", label: "Enebolig 120 m²", fmt: (v) => (v ? S.kr(v) : "–") },
    ], rows, { sortKey: "pc", dir: -1, onRow: (id) => { st.k = id; renderK(); map.zoomToKommune(id); document.getElementById("map").scrollIntoView({ behavior: "smooth", block: "center" }); } });
    document.getElementById("csv").onclick = () => S.downloadCsv(`eiendomsskatt-kommuner-${AY}.csv`, [
      ["Kommunenr", "Kommune", "Fylke", "Ordning", `Eiendomsskatt ${AY} (kr)`, "Per innbygger (kr)", "Andel fra bolig og fritid (%)", "Generell sats (promille)", "Boligsats (promille)", "Enebolig 120 m2 (kr)"],
      ...rows.map((r) => [r.id, r.name, r.fylke, r.type, r.tot == null ? "" : Math.round(r.tot), r.pc == null ? "" : Math.round(r.pc), r.andel == null ? "" : r.andel.toFixed(1).replace(".", ","), r.sats ?? "", r.satsb ?? "", r.ene ?? ""]),
    ]);
  }

  document.querySelectorAll("#real button").forEach((b) => (b.onclick = () => {
    real = b.dataset.v === "real";
    document.querySelectorAll("#real button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    kpis(); national(); renderK();
  }));
  kpis(); national(); renderK();
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { national(); renderK(); }, 200); });
  S.onThemeChange(() => renderK());
  document.getElementById("updated").textContent = "Data oppdatert av SSB " + new Date(d.updated).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" });
})();
