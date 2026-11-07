/* Studie 16 – Handelen med verden */
(async function () {
  const S = window.Skatt;
  const tip = S.tooltip();
  const [d, topo] = await Promise.all([
    fetch("data/handel.json").then((r) => r.json()),
    fetch("data/verden.topo.json").then((r) => r.json()),
  ]);
  const Y = d.years, LAST = Y.length - 1, F = d.flows, E = d.eu;
  const land = topojson.feature(topo, topo.objects.land).features;
  land.forEach((f) => { f.properties.cc = { EL: "GR", UK: "GB" }[f.properties.iso2] || f.properties.iso2; });
  const AGG = { ALL: "Alle land", EU: "EU-27", REUR: "Resten av Europa", R10: "Europa", R20: "Afrika", R40: "Asia", R60: "Nord- og Mellom-Amerika", R70: "Sør-Amerika", R80: "Oseania" };
  const name = (c) => AGG[c] || d.countries[c] || c;
  const isCountry = (c) => /^[A-Z]{2}$/.test(c) && c !== "EU" && !c.startsWith("R");
  const COUNTRIES = Object.keys(F.ex).filter(isCountry);

  const st = { og: "med", flow: "ex", yi: LAST, zoom: "europa", aunit: "pct", land: "EU" };
  const key = (fl) => (fl === "ex" ? (st.og === "med" ? "ex" : "exf") : st.og === "med" ? "im" : "imf");
  const v = (c, yi, fl = st.flow) => {
    if (fl === "bal") { const a = v(c, yi, "ex"), b = v(c, yi, "im"); return a == null && b == null ? null : (a || 0) - (b || 0); }
    return F[key(fl)][c]?.[yi] ?? null;
  };
  const mrd = (x) => S.mill(x);
  const pct = (x, dg = 0) => (x == null || !isFinite(x) ? "–" : S.pct(100 * x, dg));
  const FLOW_NB = { ex: "Eksport", im: "Import", bal: "Handelsbalanse" };
  const ogTxt = () => (st.og === "med" ? "" : " uten olje og gass");

  // ---------------------------------------------------------------- kontroller
  function seg(id, prop, cb) {
    const el = document.getElementById(id);
    el.querySelectorAll("button").forEach((b) => (b.onclick = () => {
      st[prop] = b.dataset.v;
      el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      cb();
    }));
  }
  seg("og", "og", () => renderAll());
  seg("flow", "flow", () => renderAll());
  seg("zoom", "zoom", () => wmap());
  seg("aunit", "aunit", () => area());
  const yrSel = document.getElementById("yr");
  yrSel.innerHTML = Y.map((y, k) => `<option value="${k}">${y}</option>`).reverse().join("");
  yrSel.value = st.yi;
  yrSel.onchange = () => { st.yi = +yrSel.value; renderAll(); };
  const landSel = document.getElementById("land");
  const recent = COUNTRIES.filter((c) => (F.ex[c]?.[LAST] || 0) + (F.im[c]?.[LAST] || 0) > 0).sort((a, b) => name(a).localeCompare(name(b), "nb"));
  landSel.innerHTML = `<optgroup label="Grupper"><option value="ALL">Alle land</option><option value="EU">EU-27</option></optgroup><optgroup label="Land">${recent.map((c) => `<option value="${c}">${S.escapeHtml(name(c))}</option>`).join("")}</optgroup>`;
  landSel.value = st.land;
  landSel.onchange = () => pick(landSel.value);
  function pick(c, scroll) {
    st.land = c; landSel.value = c;
    country(); rank();
    if (scroll) document.getElementById("c-title").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------------------------------------------------------------- KPI
  function kpis() {
    const ex = F.ex.ALL[LAST], og = F.og.ALL[LAST], exf = F.exf.ALL[LAST];
    const topOf = (k) => COUNTRIES.slice().sort((a, b) => (F[k][b]?.[LAST] || 0) - (F[k][a]?.[LAST] || 0))[0];
    const t1 = topOf("ex"), t2 = topOf("exf");
    const ei = E.energy_years.length - 1, gas = E.gas_imp.NO[ei] / E.gas_cons[ei];
    const cards = [
      { l: `Vareeksport ${Y[LAST]}`, v: mrd(ex), s: `Olje og gass ${pct(og / ex)} · uten: ${mrd(exf)}` },
      { l: "Andel av eksporten til EU", v: pct(F.ex.EU[LAST] / ex), s: `Uten olje og gass: ${pct(F.exf.EU[LAST] / exf)} · med Storbritannia: ${pct((F.ex.EU[LAST] + F.ex.GB[LAST]) / ex)}` },
      { l: "Største kjøper", v: S.escapeHtml(name(t1)), s: `${mrd(F.ex[t1][LAST])}${t2 !== t1 ? ` · uten olje og gass: ${S.escapeHtml(name(t2))}` : " · også uten olje og gass"}` },
      { l: `Norsk gass i EU ${E.energy_years[ei]}`, v: pct(gas), s: "av EUs gassforbruk kom fra Norge" },
    ];
    document.getElementById("kpis").innerHTML = cards.map((c) => `<div class="card kpi"><div class="l">${c.l}</div><div class="v">${c.v}</div><div class="s">${c.s}</div></div>`).join("");
  }

  // ---------------------------------------------------------------- kart
  const EUROPE = { type: "Feature", geometry: { type: "Polygon", coordinates: [[[-11, 35], [-11, 71], [40, 71], [40, 35], [-11, 35]]] } };
  function wmap() {
    const yi = st.yi, el = document.getElementById("map");
    document.getElementById("m-title").textContent = `${FLOW_NB[st.flow]}${ogTxt()}, ${Y[yi]}`;
    document.getElementById("m-sub").textContent = st.flow === "bal"
      ? "Blå: Norge selger mer enn vi kjøper. Rød: vi kjøper mer enn vi selger. Klikk på et land for detaljer."
      : `${st.flow === "ex" ? "Hvor eksporten går" : "Hvor importen kommer fra"}. Grå land: ingen eller ubetydelig handel. Klikk på et land for detaljer.`;
    const w = Math.max(300, el.clientWidth || 700), h = Math.round(w * (st.zoom === "europa" ? 0.78 : 0.52));
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const proj = st.zoom === "europa"
      ? d3.geoConicConformal().rotate([-12, 0]).parallels([40, 68]).fitExtent([[4, 4], [w - 4, h - 46]], EUROPE)
      : d3.geoEqualEarth().fitExtent([[4, 4], [w - 4, h - 46]], { type: "FeatureCollection", features: land });
    const path = d3.geoPath(proj);
    const dark = S.isDark();
    const blues = dark ? ["#104281", "#1c5cab", "#2a78d6", "#5598e7", "#86b6ef", "#b7d3f6"] : ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#0d366b"];
    const reds = dark ? ["#6b1f1a", "#8f2a22", "#b8392d", "#d9584a", "#ec8a7f", "#f6bcb5"] : ["#fbd9d4", "#f4aea5", "#ea7f72", "#d9584a", "#b8392d", "#7d241c"];
    // Faste terskler (mill. kr): handelen er svært skjevt fordelt, så kvantiler gir nesten bare mørke land i Europa
    const TH = [100, 1000, 5000, 20000, 60000];
    const TL = ["0,1", "1", "5", "20", "60"];
    const bin = d3.scaleThreshold(TH, [0, 1, 2, 3, 4, 5]);
    const bal = st.flow === "bal";
    const color = (x) => (x == null || x === 0 ? null : x > 0 ? blues[bin(x)] : bal ? reds[bin(-x)] : null);
    const legend = () => {
      const lg = svg.append("g").attr("class", "lg").attr("transform", `translate(8,${h - 36})`);
      const ramp = bal ? [...reds].reverse().concat(blues) : blues;
      const bw = Math.min(bal ? 30 : 46, (w - 16) / ramp.length);
      ramp.forEach((c, k) => lg.append("rect").attr("x", k * bw).attr("y", 0).attr("width", bw - 2).attr("height", 10).attr("rx", 2).attr("fill", c));
      if (bal) {
        lg.append("text").attr("x", 0).attr("y", 26).text("Underskudd");
        lg.append("text").attr("x", ramp.length * bw - 2).attr("y", 26).attr("text-anchor", "end").text("Overskudd");
      } else {
        TL.forEach((t, k) => lg.append("text").attr("x", (k + 1) * bw - 1).attr("y", 26).attr("text-anchor", "middle").text(t));
        lg.append("text").attr("x", ramp.length * bw + 6).attr("y", 9).text("mrd. kr");
      }
    };
    const clipId = "mclip";
    svg.append("clipPath").attr("id", clipId).append("rect").attr("width", w).attr("height", h - 44);
    svg.append("g").attr("clip-path", `url(#${clipId})`).selectAll("path").data(land).join("path").attr("d", path)
      .attr("class", (f) => { const c = f.properties.cc; if (c === "NO") return "nor"; const x = v(c, yi); return x == null || !color(x) ? "na" : "c"; })
      .attr("fill", (f) => { const c = f.properties.cc; if (c === "NO") return null; const x = v(c, yi); return x == null ? null : color(x); })
      .on("mousemove", (e, f) => {
        const c = f.properties.cc;
        if (c === "NO") { tip.show(`<div class="tt-title">Norge</div>`, e.clientX, e.clientY); return; }
        tip.show(`<div class="tt-title">${S.escapeHtml(name(c))}</div>
          <div class="tt-row"><span>Eksport</span><b>${mrd(F.ex[c]?.[yi])}</b></div>
          <div class="tt-row"><span>– uten olje og gass</span><b>${mrd(F.exf[c]?.[yi])}</b></div>
          <div class="tt-row"><span>Import</span><b>${mrd(F.im[c]?.[yi])}</b></div>
          <div class="tt-row"><span>Andel av ${st.flow === "im" ? "importen" : "eksporten"}${ogTxt()}</span><b>${pct((st.flow === "im" ? v(c, yi, "im") / v("ALL", yi, "im") : v(c, yi, "ex") / v("ALL", yi, "ex")), 1)}</b></div>`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => tip.hide())
      .on("click", (e, f) => { const c = f.properties.cc; if (F.ex[c] || F.im[c]) pick(c, true); });
    const sf = land.find((f) => f.properties.cc === st.land);
    if (sf) svg.append("path").attr("class", "sel").attr("clip-path", `url(#${clipId})`).attr("d", path(sf));
    legend();
  }

  // ---------------------------------------------------------------- rangering
  function rank() {
    const yi = st.yi, el = document.getElementById("rank");
    const tot = v("ALL", yi);
    const rows = COUNTRIES.map((c) => ({ c, x: v(c, yi) })).filter((r) => r.x != null && r.x !== 0)
      .sort((a, b) => Math.abs(b.x) - Math.abs(a.x));
    document.getElementById("r-title").textContent = st.flow === "bal" ? "Overskudd og underskudd" : st.flow === "ex" ? "Største kjøpere" : "Største leverandører";
    document.getElementById("r-sub").textContent = `${FLOW_NB[st.flow]}${ogTxt()} ${Y[yi]}: ${mrd(tot)} i alt.${st.flow !== "bal" ? " Prosent = andel av alt." : ""}`;
    const mx = d3.max(rows, (r) => Math.abs(r.x)) || 1;
    const line = (c, x, i, agg) => `<div class="r ${agg ? "agg" : ""} ${c === st.land ? "on" : ""}" data-c="${c}"><span class="i">${i}</span><span>${S.escapeHtml(name(c))}</span><div><div class="b ${x < 0 ? "neg" : ""}" style="width:${Math.max(0.5, (100 * Math.abs(x)) / Math.max(mx, Math.abs(x))).toFixed(1)}%"></div></div><span class="v">${st.flow === "bal" ? mrd(x).replace(" kr", "") : pct(x / tot, x / tot < 0.1 ? 1 : 0)}</span></div>`;
    el.innerHTML = line("EU", v("EU", yi), "", true) + `<div class="sep"></div>` + rows.map((r, k) => line(r.c, r.x, k + 1)).join("");
    el.querySelectorAll(".r").forEach((r) => {
      r.onclick = () => pick(r.dataset.c, true);
      r.onmousemove = (e) => tip.show(`<div class="tt-title">${S.escapeHtml(name(r.dataset.c))}</div><div class="tt-row"><span>${FLOW_NB[st.flow]}${ogTxt()}</span><b>${mrd(v(r.dataset.c, yi))}</b></div>`, e.clientX, e.clientY);
      r.onmouseleave = () => tip.hide();
    });
  }

  // ---------------------------------------------------------------- hvor går eksporten (over tid)
  const AREAS = [
    { k: "EU", n: "EU-27", c: "var(--series-1)" }, { k: "GB", n: "Storbritannia", c: "var(--series-2)" },
    { k: "REUR", n: "Resten av Europa", c: "var(--series-3)" }, { k: "R40", n: "Asia", c: "var(--series-4)" },
    { k: "AM", n: "Amerika", c: "var(--series-5)" }, { k: "OTH", n: "Afrika, Oseania og annet", c: "var(--neutral-mark)" },
  ];
  function areaVal(k, yi, fl) {
    if (k === "AM") return (v("R60", yi, fl) || 0) + (v("R70", yi, fl) || 0);
    if (k === "OTH") return (v("ALL", yi, fl) || 0) - AREAS.filter((a) => a.k !== "OTH").reduce((s, a) => s + areaVal(a.k, yi, fl), 0);
    return v(k, yi, fl) || 0;
  }
  function area() {
    const el = document.getElementById("area"), fl = st.flow;
    const bal = fl === "bal";
    document.getElementById("a-title").textContent = bal ? `Handelsbalansen${ogTxt()} per region` : `${fl === "ex" ? "Hvor eksporten går" : "Hvor importen kommer fra"}${ogTxt()}, ${Y[0]}–${Y[LAST]}`;
    document.getElementById("a-sub").textContent = bal ? "Eksport minus import, milliarder kroner. Over null: Norge selger mer enn vi kjøper." : "EU-27 er dagens medlemsland i alle år, så kurven ikke hopper når nye land blir med.";
    document.getElementById("aunit").style.display = bal ? "none" : "";
    document.getElementById("a-legend").innerHTML = AREAS.map((a) => `<span class="item"><span class="sw${bal ? " line" : ""}" style="background:${a.c}"></span>${a.n}</span>`).join("");
    const w = Math.max(320, el.clientWidth || 900), h = 340, m = { t: 12, r: 16, b: 28, l: 56 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear([+Y[0], +Y[LAST]], [m.l, w - m.r]);
    const rows = Y.map((y, yi) => { const o = { y: +y, yi }; AREAS.forEach((a) => (o[a.k] = areaVal(a.k, yi, fl) / 1000)); o.tot = (v("ALL", yi, fl) || 0) / 1000; return o; });
    const share = !bal && st.aunit === "pct";
    let y;
    if (bal) {
      const ext = d3.extent(rows.flatMap((r) => AREAS.map((a) => r[a.k])));
      y = d3.scaleLinear([Math.min(0, ext[0]), ext[1]], [h - m.b, m.t]).nice();
    } else y = d3.scaleLinear([0, share ? 1 : d3.max(rows, (r) => r.tot)], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((t) => (share ? Math.round(t * 100) + " %" : S.nf0.format(t))).tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(Math.min(10, w / 80)).tickFormat(d3.format("d")).tickSizeOuter(0));
    if (bal) {
      svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "var(--text-3)");
      AREAS.forEach((a) => svg.append("path").datum(rows).attr("fill", "none").attr("stroke", a.c).attr("stroke-width", 2).attr("d", d3.line().x((r) => x(r.y)).y((r) => y(r[a.k]))));
    } else {
      const stack = d3.stack().keys(AREAS.map((a) => a.k)).value((r, k) => (share ? r[k] / (r.tot || 1) : r[k]));
      svg.append("g").selectAll("path").data(stack(rows)).join("path").attr("fill", (s, i) => AREAS[i].c).attr("opacity", 0.92)
        .attr("d", d3.area().x((p) => x(p.data.y)).y0((p) => y(p[0])).y1((p) => y(p[1])));
    }
    const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--border-strong)").style("display", "none");
    svg.append("rect").attr("x", m.l).attr("width", w - m.l - m.r).attr("height", h - m.b).attr("fill", "transparent")
      .on("mousemove", (e) => {
        const yy = Math.round(x.invert(d3.pointer(e)[0])), r = rows.find((q) => q.y === yy);
        if (!r) return;
        cross.style("display", null).attr("x1", x(yy)).attr("x2", x(yy));
        tip.show(`<div class="tt-title">${yy}</div>${AREAS.slice().reverse().map((a) => `<div class="tt-row"><span><span class="key" style="background:${a.c}"></span>${a.n}</span><b>${mrd(r[a.k] * 1000)}${bal ? "" : ` · ${pct(r[a.k] / (r.tot || 1))}`}</b></div>`).join("")}`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => { tip.hide(); cross.style("display", "none"); });
  }

  // ---------------------------------------------------------------- avhengighet
  const eyi = E.years.length - 1, eyr = E.years[eyi], nyi = Y.indexOf(eyr) >= 0 ? Y.indexOf(eyr) : LAST, eni = E.energy_years.length - 1;
  function dep() {
    const no = (k, a, b) => F[k][a][nyi] / (b ? F[k][b][nyi] : 1);
    const bnp = d.gdp.bnp[nyi];
    const egdp = E.gdp[eyi];
    const nonEn = (a, b) => (E[a][eyi] - E[b][eyi]);
    const rows = [
      { lab: "Andel av vareeksporten som går til den andre", sub: "EU: av eksporten til land utenfor EU", max: 1,
        a: no("ex", "EU", "ALL"), al: no("exf", "EU", "ALL"), b: E.exp_no_total[eyi] / E.exp_ext_total[eyi], bl: null },
      { lab: "Andel av vareimporten som kommer fra den andre", sub: "EU: av importen fra land utenfor EU", max: 1,
        a: no("im", "EU", "ALL"), al: no("imf", "EU", "ALL"), b: E.imp_no_total[eyi] / E.imp_ext_total[eyi], bl: nonEn("imp_no_total", "imp_no_sitc3") / nonEn("imp_ext_total", "imp_ext_sitc3") },
      { lab: "Eksport til den andre, i prosent av eget BNP", sub: "Hvor viktig kjøperen er for økonomien", max: 0.25,
        a: F.ex.EU[nyi] / bnp, al: F.exf.EU[nyi] / bnp, b: E.exp_no_total[eyi] / egdp, bl: null },
      { lab: "Import fra den andre, i prosent av eget BNP", sub: "Hvor viktig leverandøren er for økonomien", max: 0.25,
        a: F.im.EU[nyi] / bnp, al: null, b: E.imp_no_total[eyi] / egdp, bl: nonEn("imp_no_total", "imp_no_sitc3") / egdp },
      { lab: `Andel av gassforbruket som dekkes av den andre`, sub: `${E.energy_years[eni]} · Norge produserer sin egen gass`, max: 1,
        a: null, al: null, b: E.gas_imp.NO[eni] / E.gas_cons[eni], bl: null },
      { lab: "Andel av råoljeimporten som kommer fra den andre", sub: `${E.energy_years[eni]} · Norge importerer nesten ikke råolje fra EU`, max: 1,
        a: null, al: null, b: E.oil_imp.NO[eni] / E.oil_imp.TOTAL[eni], bl: null },
    ];
    document.getElementById("d-sub").textContent = `Varehandel ${eyr}. Tykk stolpe: alt. Tynn, lys stolpe: uten olje og gass (for EU: uten energi). Orange: Norge, blå: EU.`;
    const W = (q, max) => Math.min(100, (100 * q) / max).toFixed(1);
    const side = (cls, val, lt, max, txtLt) => {
      const col = cls === "l" ? "a" : "b";
      return `<div class="side ${cls}">
        <div class="bar">${val != null ? `<i class="${col}" style="width:${W(val, max)}%"></i>` : ""}</div>
        ${lt != null ? `<div class="bar thin"><i class="${col} lt" style="width:${W(lt, max)}%"></i></div>` : ""}
        <span class="num">${val != null ? `<b>${pct(val, val < 0.1 ? 1 : 0)}</b>` : "–"}${lt != null ? ` · ${txtLt} ${pct(lt, lt < 0.1 ? 1 : 0)}` : ""}</span></div>`;
    };
    document.getElementById("dep").innerHTML = `<div class="row head" style="padding-bottom:0;border:0"><div class="hd" style="text-align:right">Norge → EU</div><div class="gap"></div><div class="hd">EU → Norge</div></div>`
      + rows.map((r) => `<div class="row">${side("l", r.a, r.al, r.max, "uten olje og gass")}<div class="lab">${r.lab}<small>${r.sub}</small></div>${side("r", r.b, r.bl, r.max, "uten energi")}</div>`).join("");
    const g = rows[4].b, oilS = rows[5].b;
    document.getElementById("d-callout").innerHTML = `I ${eyr} gikk <b>${pct(rows[0].a)}</b> av Norges vareeksport til EU (<b>${pct(rows[0].al)}</b> uten olje og gass), og eksporten dit tilsvarte <b>${pct(rows[2].a)}</b> av Norges BNP. For EU er Norge en mindre handelspartner. Norge står for ${pct(rows[1].b, 1)} av EUs import fra land utenfor EU (${pct(rows[1].bl, 1)} uten energi), og importen tilsvarer ${pct(rows[3].b, 1)} av EUs BNP. Men på energi er bildet et annet: Norge dekket <b>${pct(g)}</b> av EUs gassforbruk og leverte ${pct(oilS)} av råoljen EU importerte i ${E.energy_years[eni]}. Norge er altså mest avhengig av EU målt i kroner, mens EU er avhengig av norsk gass som er vanskelig å erstatte på kort sikt.`;
  }

  // ---------------------------------------------------------------- linjediagram
  function lines(el, legendEl, years, ser, opts = {}) {
    legendEl.innerHTML = ser.map((s) => `<span class="item"><span class="sw ${s.dash ? "dash" : "line"}" style="background:${s.c};color:${s.c}"></span>${s.n}</span>`).join("");
    const w = Math.max(300, el.clientWidth || 600), h = opts.h || 300, m = { t: 12, r: 14, b: 28, l: opts.l || 44 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear(d3.extent(years), [m.l, w - m.r]);
    const all = ser.flatMap((s) => s.v).filter((q) => q != null && isFinite(q));
    const y = d3.scaleLinear([opts.min ?? 0, opts.max ?? d3.max(all)], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(opts.fmtAxis).tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(Math.min(8, w / 80)).tickFormat(d3.format("d")).tickSizeOuter(0));
    ser.forEach((s) => {
      const pts = years.map((yy, k) => [yy, s.v[k]]).filter((p) => p[1] != null && isFinite(p[1]));
      svg.append("path").datum(pts).attr("fill", "none").attr("stroke", s.c).attr("stroke-width", s.w || 2).attr("stroke-dasharray", s.dash ? "5 4" : null).attr("d", d3.line().x((p) => x(p[0])).y((p) => y(p[1])));
    });
    const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--border-strong)").style("display", "none");
    svg.append("rect").attr("x", m.l).attr("width", w - m.l - m.r).attr("height", h - m.b).attr("fill", "transparent")
      .on("mousemove", (e) => {
        const yy = Math.round(x.invert(d3.pointer(e)[0])), k = years.indexOf(yy);
        if (k < 0) return;
        cross.style("display", null).attr("x1", x(yy)).attr("x2", x(yy));
        tip.show(`<div class="tt-title">${yy}</div>${ser.map((s) => `<div class="tt-row"><span><span class="key" style="background:${s.c}"></span>${s.n}</span><b>${opts.fmt(s.v[k])}</b></div>`).join("")}`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => { tip.hide(); cross.style("display", "none"); });
  }
  const pAxis = (t) => Math.round(t * 100) + " %";
  function nline() {
    const ys = Y.map(Number), sh = (k, b = "ALL") => Y.map((_, i) => F[k].EU[i] / F[k][b][i]);
    lines(document.getElementById("nline"), document.getElementById("n-legend"), ys, [
      { n: "Eksport til EU", v: sh("ex"), c: "var(--series-2)", w: 2.5 },
      { n: "Eksport uten olje og gass", v: sh("exf"), c: "var(--series-2)", dash: true },
      { n: "Import fra EU", v: sh("im"), c: "var(--series-1)", w: 2.5 },
    ], { min: 0, max: 1, fmtAxis: pAxis, fmt: (q) => pct(q, 1) });
  }
  function eline() {
    const ys = E.years.map(Number), ny = E.energy_years.map(Number);
    const years = [...new Set([...ys, ...ny])].sort((a, b) => a - b);
    const at = (arr, src) => years.map((yy) => { const k = src.indexOf(String(yy)); return k < 0 ? null : arr[k]; });
    const div = (a, b) => a.map((q, i) => (q == null || !b[i] ? null : q / b[i]));
    lines(document.getElementById("eline"), document.getElementById("e-legend"), years, [
      { n: "Gassforbruk dekket av Norge", v: at(div(E.gas_imp.NO, E.gas_cons), E.energy_years), c: "var(--series-2)", w: 2.5 },
      { n: "Råoljeimport fra Norge", v: at(div(E.oil_imp.NO, E.oil_imp.TOTAL), E.energy_years), c: "var(--series-3)" },
      { n: "All import fra land utenfor EU", v: at(div(E.imp_no_total, E.imp_ext_total), E.years), c: "var(--series-1)", w: 2.5 },
      { n: "Import uten energi", v: at(div(E.imp_no_total.map((q, i) => q - E.imp_no_sitc3[i]), E.imp_ext_total.map((q, i) => q - E.imp_ext_sitc3[i])), E.years), c: "var(--series-1)", dash: true },
      { n: "Gassforbruk dekket av Russland", v: at(div(E.gas_imp.RU, E.gas_cons), E.energy_years), c: "var(--neutral-mark)", dash: true },
    ], { min: 0, fmtAxis: pAxis, fmt: (q) => pct(q, 1) });
  }

  // ---------------------------------------------------------------- land
  const GCOL = { olje: "var(--series-2)", gass: "var(--series-2)" };
  function groups(elId, fk, c) {
    const el = document.getElementById(elId);
    const sy = d.sitc_years, k = Math.min(sy.length - 1, Math.max(0, sy.indexOf(Y[st.yi]) >= 0 ? sy.indexOf(Y[st.yi]) : sy.length - 1));
    const g = d.sitc[fk][c] || {};
    const rows = d.groups.map(([gk, gn]) => ({ gk, gn, v: g[gk]?.[k] ?? 0 })).filter((r) => r.v > 0).sort((a, b) => b.v - a.v);
    const tot = d3.sum(rows, (r) => r.v);
    document.getElementById(fk === "ex" ? "ge-title" : "gi-title").textContent = `${fk === "ex" ? "Hva vi selger til" : "Hva vi kjøper fra"} ${name(c)}`;
    document.getElementById(fk === "ex" ? "ge-sub" : "gi-sub").textContent = `Varegrupper (SITC), ${sy[k]}. ${mrd(tot)} i alt.${fk === "ex" ? " Orange: olje og gass." : ""}`;
    const w = Math.max(280, el.clientWidth || 500), narrow = w < 480, rowH = narrow ? 38 : 26, m = { t: 4, r: 96, b: 4, l: narrow ? 6 : 230 };
    const h = m.t + m.b + rowH * Math.max(1, rows.length);
    el.innerHTML = "";
    if (!rows.length) { el.innerHTML = '<p class="muted">Ingen handel registrert.</p>'; return; }
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear([0, rows[0].v], [m.l, w - m.r]);
    rows.forEach((r, i) => {
      const yy = m.t + i * rowH, by = narrow ? yy + 18 : yy + 5, bh = narrow ? 14 : rowH - 10;
      svg.append("text").attr("x", narrow ? m.l : m.l - 10).attr("y", narrow ? yy + 13 : yy + 17).attr("text-anchor", narrow ? "start" : "end").attr("fill", "var(--text-2)").attr("font-size", 12.5).text(r.gn);
      svg.append("rect").attr("x", m.l).attr("y", by).attr("height", bh).attr("rx", 2).attr("width", Math.max(1, x(r.v) - m.l)).attr("fill", GCOL[r.gk] || "var(--series-1)")
        .on("mousemove", (e) => tip.show(`<div class="tt-title">${r.gn}</div><div class="tt-row"><span>${sy[k]}</span><b>${mrd(r.v)}</b></div><div class="tt-row"><span>Andel</span><b>${pct(r.v / tot, 1)}</b></div>`, e.clientX, e.clientY)).on("mouseleave", () => tip.hide());
      svg.append("text").attr("x", x(r.v) + 6).attr("y", by + bh / 2 + 4).attr("fill", "var(--text)").attr("font-size", 12).text(`${mrd(r.v).replace(" kr", "")} · ${pct(r.v / tot)}`);
    });
  }
  function country() {
    const c = st.land, yi = st.yi;
    document.getElementById("c-title").textContent = c === "ALL" ? "Norges handel med hele verden" : `Norges handel med ${name(c)}`;
    const ex = F.ex[c]?.[yi], exf = F.exf[c]?.[yi], im = F.im[c]?.[yi];
    const cards = [
      { l: `Eksport ${Y[yi]}`, v: mrd(ex), s: c === "ALL" ? "all vareeksport" : `${pct(ex / F.ex.ALL[yi], 1)} av Norges eksport` },
      { l: "Uten olje og gass", v: mrd(exf), s: ex ? `olje og gass: ${pct((ex - exf) / ex)} av eksporten` : "" },
      { l: `Import ${Y[yi]}`, v: mrd(im), s: c === "ALL" ? "all vareimport" : `${pct(im / F.im.ALL[yi], 1)} av Norges import` },
      { l: "Handelsbalanse", v: mrd((ex || 0) - (im || 0)), s: `uten olje og gass: ${mrd((exf || 0) - (F.imf[c]?.[yi] || 0))}` },
    ];
    document.getElementById("ckpis").innerHTML = cards.map((k) => `<div><div class="l">${k.l}</div><div class="v">${k.v}</div><div class="s">${k.s}</div></div>`).join("");
    const ys = Y.map(Number), ser = (k) => Y.map((_, i) => (F[k][c]?.[i] ?? null) / 1000);
    lines(document.getElementById("cline"), document.getElementById("c-legend"), ys, [
      { n: "Eksport", v: ser("ex"), c: "var(--series-2)", w: 2.5 },
      { n: "Eksport uten olje og gass", v: ser("exf"), c: "var(--series-2)", dash: true },
      { n: "Import", v: ser("im"), c: "var(--series-1)", w: 2.5 },
    ], { min: 0, l: 52, fmtAxis: (t) => S.nf0.format(t), fmt: (q) => (q == null ? "–" : mrd(q * 1000)) });
    groups("gex", "ex", c);
    groups("gim", "im", c);
    wmap();
  }

  // ---------------------------------------------------------------- tabell
  function table() {
    const yi = st.yi, tex = F.ex.ALL[yi], tim = F.im.ALL[yi];
    const rows = COUNTRIES.map((c) => {
      const ex = F.ex[c]?.[yi] ?? null, exf = F.exf[c]?.[yi] ?? null, im = F.im[c]?.[yi] ?? null;
      return { id: c, name: name(c), ex, exf, ogs: ex ? (ex - (exf || 0)) / ex : null, im, bal: (ex || 0) - (im || 0), sex: ex == null ? null : ex / tex, sim: im == null ? null : im / tim };
    }).filter((r) => (r.ex || 0) + (r.im || 0) > 0);
    document.getElementById("tbl-sub").textContent = `Varehandel ${Y[yi]}, ${rows.length} land. Klikk på en kolonne for å sortere, eller på et land for detaljer.`;
    const m0 = (q) => mrd(q);
    S.sortableTable(document.getElementById("table"), [
      { key: "name", label: "Land", text: true }, { key: "ex", label: "Eksport", fmt: m0 }, { key: "exf", label: "Uten olje og gass", fmt: m0 },
      { key: "ogs", label: "Olje og gass", fmt: (q) => pct(q) }, { key: "sex", label: "Andel av eksporten", fmt: (q) => pct(q, 1) },
      { key: "im", label: "Import", fmt: m0 }, { key: "sim", label: "Andel av importen", fmt: (q) => pct(q, 1) }, { key: "bal", label: "Balanse", fmt: m0 },
    ], rows, { sortKey: "ex", dir: -1, onRow: (c) => pick(c, true) });
    const dec = (q, n = 1) => (q == null ? "" : q.toFixed(n).replace(".", ","));
    document.getElementById("csv").onclick = () => S.downloadCsv(`handel-${Y[yi]}.csv`, [["Land", "Landkode", "Eksport (mill. kr)", "Eksport uten olje og gass (mill. kr)", "Import (mill. kr)", "Handelsbalanse (mill. kr)", "Andel av eksporten (%)", "Andel av importen (%)"],
      ...rows.sort((a, b) => (b.ex || 0) - (a.ex || 0)).map((r) => [r.name, r.id, dec(r.ex), dec(r.exf), dec(r.im), dec(r.bal), dec(r.sex == null ? null : 100 * r.sex, 2), dec(r.sim == null ? null : 100 * r.sim, 2)])]);
  }

  function renderAll() { wmap(); rank(); area(); country(); table(); }
  kpis(); dep(); nline(); eline(); renderAll();
  document.getElementById("updated").textContent = `Data hentet ${d.fetched}`;
  S.onThemeChange(() => wmap());
  let rt, lastW = innerWidth;
  window.addEventListener("resize", () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rt); rt = setTimeout(() => { renderAll(); nline(); eline(); }, 200); });
})();
