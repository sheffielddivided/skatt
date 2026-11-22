/* Studie 24 – El Niño */
(async function () {
  const S = window.Skatt;
  const tip = S.tooltip();
  const [d, topo] = await Promise.all([
    fetch("data/elnino.json").then((r) => r.json()),
    fetch("data/verden.topo.json").then((r) => r.json()),
  ]);
  const land = topojson.feature(topo, topo.objects.land).features;
  const Y0 = d.start, YEARS = d.years;
  const ym = (i) => [Y0 + Math.floor(i / 12), (i % 12) + 1];
  const idx = (y, m) => (y - Y0) * 12 + (m - 1);
  const at = (arr, y, m) => { const i = idx(y, m); return i >= 0 && i < arr.length && arr[i] != null ? arr[i] : null; };
  const SEAS_NB = ["des–feb", "jan–mar", "feb–apr", "mar–mai", "apr–jun", "mai–jul", "jun–aug", "jul–sep", "aug–okt", "sep–nov", "okt–des", "nov–jan"];
  const seasLab = (i) => { const [y, m] = ym(i); return `${SEAS_NB[m - 1]} ${y}`; };
  const monLab = (i) => { const [y, m] = ym(i); return `${S.MONTHS[m - 1]} ${y}`; };
  const f1 = (v) => (v == null || !isFinite(v) ? "–" : S.signed(S.nf1.format(v), Math.round(v * 10)));
  const nf2 = new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const f2 = (v) => (v == null || !isFinite(v) ? "–" : S.signed(nf2.format(v), Math.round(v * 100)));
  const deg = (v) => (v == null ? "–" : f1(v) + " °C");
  const cls = (v) => (v == null ? null : v >= 0.5 ? "EN" : v <= -0.5 ? "LN" : "N");
  const CLS_NB = { EN: "El Niño", LN: "La Niña", N: "Nøytralt" };
  const CLS_COL = { EN: "var(--warm)", LN: "var(--cold)", N: "var(--neutral-mark)" };
  const strength = (a) => (a >= 2 ? "svært sterk" : a >= 1.5 ? "sterk" : a >= 1 ? "moderat" : "svak");
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const ONI = d.oni, N34 = d.nino34;

  // ---------------------------------------------------------------- statistikk
  function detrend(vals) {
    // trekk fra en andregrads trend (minste kvadraters metode)
    const pts = vals.map((v, i) => [i, v]).filter((p) => p[1] != null);
    if (pts.length < 10) return vals.map(() => null);
    const mx = d3.mean(pts, (p) => p[0]);
    const X = pts.map((p) => [1, p[0] - mx, (p[0] - mx) ** 2]);
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
    X.forEach((r, k) => { for (let i = 0; i < 3; i++) { b[i] += r[i] * pts[k][1]; for (let j = 0; j < 3; j++) A[i][j] += r[i] * r[j]; } });
    // Gauss-eliminasjon
    for (let i = 0; i < 3; i++) {
      for (let k = i + 1; k < 3; k++) { const f = A[k][i] / A[i][i]; for (let j = i; j < 3; j++) A[k][j] -= f * A[i][j]; b[k] -= f * b[i]; }
    }
    const c = [0, 0, 0];
    for (let i = 2; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < 3; j++) s -= A[i][j] * c[j]; c[i] = s / A[i][i]; }
    const trend = (i) => c[0] + c[1] * (i - mx) + c[2] * (i - mx) ** 2;
    return vals.map((v, i) => (v == null ? null : { r: v - trend(i), t: trend(i) }));
  }
  function pearson(pairs) {
    const n = pairs.length; if (n < 10) return null;
    const mx = d3.mean(pairs, (p) => p[0]), my = d3.mean(pairs, (p) => p[1]);
    let sxy = 0, sxx = 0, syy = 0;
    pairs.forEach(([a, b]) => { sxy += (a - mx) * (b - my); sxx += (a - mx) ** 2; syy += (b - my) ** 2; });
    const r = sxy / Math.sqrt(sxx * syy);
    return { r, n, slope: sxy / sxx, icpt: my - (sxy / sxx) * mx, ...S.stats.signif(r, n) };
  }

  // ---------------------------------------------------------------- navn
  const ISO2 = {};
  land.forEach((f) => { ISO2[f.properties.id] = { EL: "GR", UK: "GB" }[f.properties.iso2] || f.properties.iso2; });
  let dn = null;
  try { dn = new Intl.DisplayNames(["nb"], { type: "region" }); } catch (e) { /* */ }
  const name = (c) => {
    if (c === "EUR") return "Europa (landareal)";
    if (c === "OWID_WRL") return "Verden (landareal)";
    try { const n = dn && ISO2[c] ? dn.of(ISO2[c]) : null; if (n && n !== ISO2[c]) return n; } catch (e) { /* */ }
    return d.countries[c]?.n || c;
  };

  // Europa-snittet fra NOAA NCEI som et eget «land»
  (function addEurope() {
    const G = { DJF: [[-1, 12], [0, 1], [0, 2]], MAM: [[0, 3], [0, 4], [0, 5]], JJA: [[0, 6], [0, 7], [0, 8]], SON: [[0, 9], [0, 10], [0, 11]] };
    const t = {};
    Object.entries(G).forEach(([g, ms]) => {
      t[g] = YEARS.map((y) => { const v = ms.map(([dy, m]) => (y + dy < Y0 ? null : at(d.eur, y + dy, m))); return v.every((x) => x != null) ? d3.mean(v) : null; });
    });
    d.countries.EUR = { n: "Europe", t };
  })();

  // ---------------------------------------------------------------- episoder
  function episodes() {
    const out = [];
    let s = null, type = null;
    const close = (e) => {
      if (s != null && e - s + 1 >= 5) {
        let pk = s; for (let i = s; i <= e; i++) if (Math.abs(ONI[i]) > Math.abs(ONI[pk])) pk = i;
        out.push({ type, s, e, len: e - s + 1, peak: ONI[pk], pk, ongoing: e === ONI.length - 1 });
      }
    };
    ONI.forEach((v, i) => {
      const c = cls(v);
      if (c === type && c !== "N") return;
      close(i - 1);
      s = c === "N" || c == null ? null : i; type = c;
    });
    close(ONI.length - 1);
    return out;
  }
  const EPS = episodes();
  const lastI = ONI.length - 1, lastV = ONI[lastI];
  const curEp = EPS.find((e) => e.ongoing) || null;

  // ---------------------------------------------------------------- KPI
  function kpis() {
    const wk = d.week[d.week.length - 1];
    const wd = new Date(wk[0]);
    const enEps = EPS.filter((e) => e.type === "EN").sort((a, b) => b.peak - a.peak);
    const prevMax = EPS.filter((e) => e.type === "EN" && !e.ongoing).sort((a, b) => b.peak - a.peak)[0];
    // global temperatur siste 12 måneder og rang mot alle 12-månedersperioder
    const G = d.glob, roll = [];
    for (let i = 11; i < G.length; i++) { const v = G.slice(i - 11, i + 1); if (v.every((x) => x != null)) roll.push({ i, v: d3.mean(v) }); }
    const g12 = roll[roll.length - 1], gRank = roll.filter((r) => r.v > g12.v + 1e-9).length + 1;
    const cards = [
      { l: "Niño 3.4, siste uke", v: deg(wk[2]), s: `Uka rundt ${wd.getDate()}. ${S.MONTHS[wd.getMonth()]} ${wd.getFullYear()} · avvik fra 1991–2020` },
      { l: "Oceanic Niño Index (ONI)", v: f1(lastV), s: `${cap(seasLab(lastI))} · ${curEp ? `${strength(Math.abs(curEp.peak))} ${CLS_NB[curEp.type]}` : cls(lastV) === "N" ? "nøytralt" : `${CLS_NB[cls(lastV)]}-forhold`}` },
      curEp && curEp.type === "EN"
        ? { l: "Rangering av dagens El Niño", v: `Nr. ${enEps.indexOf(curEp) + 1} av ${enEps.length}`, s: `Målt på toppverdi hittil · forrige rekord ${f1(prevMax.peak)} (${seasLab(prevMax.pk)})` }
        : { l: "El Niño-episoder siden 1950", v: S.int(enEps.length), s: `Sterkeste: ${f1(enEps[0].peak)} (${seasLab(enEps[0].pk)})` },
      { l: "Global temperatur, siste 12 måneder", v: deg(g12.v), s: `${gRank === 1 ? "Varmeste 12 måneder som er målt" : `Nr. ${gRank} av alle 12-månedersperioder`} · mot 1951–1980` },
    ];
    document.getElementById("kpis").innerHTML = cards.map((c) => `<div class="card kpi"><div class="l">${c.l}</div><div class="v">${c.v}</div><div class="s">${c.s}</div></div>`).join("");
  }

  // ---------------------------------------------------------------- skjematisk tverrsnitt
  const WST = {
    normal: { edge: 0.42, tw: 300, te: 196, sea: [-5, 3], cx: 0.15, cs: 1, rise: 0.15, sink: 0.8, cell: 1, trade: [0.72, 0.42], tradeT: "Passatvind", up: 1,
      cap: [["Vind", "Passatvinden blåser jevnt fra øst mot vest og skyver det varme overflatevannet foran seg."], ["Hav", "Et tykt lag varmt vann ligger i vest. I øst ligger termoklinen – grensen mot det kalde dypvannet – nær overflaten, og kaldt vann strømmer opp utenfor Peru."], ["Vær", "Varm, fuktig luft stiger over Indonesia og gir mye regn. Over det kjølige østlige Stillehavet synker lufta, og det er tørt langs kysten av Peru og Chile."]] },
    nino: { edge: 0.88, tw: 262, te: 250, sea: [1, -3], cx: 0.52, cs: 1.12, rise: 0.52, sink: 0.12, cell: 0.75, trade: [0.88, 0.74], tradeT: "Svak passatvind", up: 0,
      cap: [["Vind", "Passatvinden svekkes eller snur. Vestavindsstøt i det vestlige Stillehavet skyver varmt vann østover."], ["Hav", "Det varme vannet brer seg mot Sør-Amerika, og termoklinen flater ut. Oppstrømmingen av kaldt vann utenfor Peru stopper nesten opp."], ["Vær", "Regnet følger det varme vannet til det sentrale Stillehavet. Indonesia og Australia får tørke og skogbranner, mens Peru og Ecuador får styrtregn og flom."]] },
    nina: { edge: 0.3, tw: 318, te: 178, sea: [-8, 5], cx: 0.17, cs: 1.2, rise: 0.17, sink: 0.84, cell: 1.35, trade: [0.8, 0.32], tradeT: "Sterk passatvind", up: 1.6,
      cap: [["Vind", "Passatvinden er sterkere enn normalt og presser enda mer varmt vann mot vest."], ["Hav", "Termoklinen heller brattere. Kaldt dypvann når overflaten over store deler av det østlige og sentrale Stillehavet."], ["Vær", "Ekstra mye regn og flomfare i Indonesia og Australia. Tørt i Peru, sør i USA og på Afrikas horn. Kloden blir litt kjøligere en periode."]] },
  };
  let wsState = "normal", wsBuilt = null;
  function walker(animate) {
    const el = document.getElementById("walker"), P = WST[wsState];
    const W = Math.max(460, Math.min(960, el.clientWidth || 900)), H = 380, surf = 170;
    const X = (f) => f * W;
    const T = (sel) => (animate ? sel.transition().duration(900).ease(d3.easeCubicInOut) : sel);
    if (wsBuilt !== W + (S.isDark() ? "d" : "l")) {
      wsBuilt = W + (S.isDark() ? "d" : "l");
      el.innerHTML = "";
      const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`);
      const defs = svg.append("defs");
      const g = defs.append("linearGradient").attr("id", "sstg").attr("x1", 0).attr("x2", 1);
      g.append("stop").attr("class", "s0").attr("offset", 0).attr("stop-color", "var(--warm)");
      g.append("stop").attr("class", "s1").attr("offset", P.edge - 0.1).attr("stop-color", "var(--warm)");
      g.append("stop").attr("class", "s2").attr("offset", P.edge + 0.1).attr("stop-color", "var(--cold)");
      g.append("stop").attr("class", "s3").attr("offset", 1).attr("stop-color", "var(--cold)");
      ["ar", "ar2"].forEach((id) => defs.append("marker").attr("id", id).attr("viewBox", "0 0 10 10").attr("refX", 6).attr("refY", 5).attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto-start-reverse")
        .append("path").attr("d", "M0,0 L10,5 L0,10 z").attr("fill", id === "ar" ? "var(--text-2)" : "var(--cold)"));
      svg.append("rect").attr("width", W).attr("height", surf).attr("fill", "var(--sky)");
      svg.append("rect").attr("y", surf).attr("width", W).attr("height", H - surf).attr("fill", "var(--deep)");
      svg.append("path").attr("class", "warm").attr("fill", "var(--warm-soft)").attr("opacity", 0.75);
      svg.append("rect").attr("class", "sst").attr("x", X(0.08)).attr("y", surf).attr("width", X(0.84)).attr("height", 14).attr("fill", "url(#sstg)");
      svg.append("path").attr("class", "therm").attr("fill", "none").attr("stroke", "var(--text-2)").attr("stroke-width", 1.6).attr("stroke-dasharray", "6 4");
      svg.append("text").attr("class", "lbl s therm-l").attr("text-anchor", "middle").text("Termoklin");
      svg.append("path").attr("class", "up").attr("fill", "none").attr("stroke", "var(--cold)").attr("stroke-width", 2.4).attr("marker-end", "url(#ar2)");
      svg.append("text").attr("class", "lbl s up-l").attr("text-anchor", "end").text("Kaldt vann strømmer opp");
      // land
      svg.append("path").attr("fill", "var(--landm)").attr("d", `M0,${surf - 34} Q${X(0.04)},${surf - 46} ${X(0.085)},${surf - 18} L${X(0.085)},${H} L0,${H} Z`);
      svg.append("path").attr("fill", "var(--landm)").attr("d", `M${W},${surf - 110} L${X(0.955)},${surf - 70} Q${X(0.93)},${surf - 30} ${X(0.915)},${surf - 6} L${X(0.915)},${H} L${W},${H} Z`);
      svg.append("text").attr("class", "lbl b").attr("x", 8).attr("y", surf - 54).text("Indonesia");
      svg.append("text").attr("class", "lbl s").attr("x", 8).attr("y", surf - 40).text("Australia");
      svg.append("text").attr("class", "lbl b").attr("x", W - 8).attr("y", surf - 120).attr("text-anchor", "end").text("Sør-Amerika");
      svg.append("text").attr("class", "lbl s").attr("x", W - 8).attr("y", surf - 106).attr("text-anchor", "end").text("Peru, Ecuador");
      svg.append("text").attr("class", "lbl s").attr("x", X(0.5)).attr("y", H - 12).attr("text-anchor", "middle").text("Kaldt dypvann");
      svg.append("text").attr("class", "lbl s").attr("x", X(0.5)).attr("y", 18).attr("text-anchor", "middle").text("Ekvator · Stillehavet");
      // sky og regn
      const cl = svg.append("g").attr("class", "cloud");
      [[0, 0, 26], [-26, 8, 18], [26, 8, 19], [-12, -14, 18], [14, -12, 17]].forEach(([x, y, r]) => cl.append("circle").attr("cx", x).attr("cy", y).attr("r", r).attr("fill", "var(--surface)").attr("stroke", "var(--border-strong)"));
      cl.append("rect").attr("x", -44).attr("y", 8).attr("width", 88).attr("height", 18).attr("fill", "var(--surface)");
      [-24, -10, 4, 18, 32].forEach((x) => cl.append("line").attr("x1", x).attr("x2", x - 6).attr("y1", 34).attr("y2", 58).attr("stroke", "var(--cold)").attr("stroke-width", 2).attr("stroke-linecap", "round"));
      // Walker-sirkulasjonen
      ["c-up", "c-top", "c-down", "c-bot"].forEach((c) => svg.append("path").attr("class", c).attr("fill", "none").attr("stroke", "var(--text-2)").attr("stroke-width", 2).attr("marker-end", "url(#ar)"));
      svg.append("text").attr("class", "lbl s cell-l").attr("text-anchor", "middle").text("Walker-sirkulasjonen");
      svg.append("text").attr("class", "lbl warm-l b").attr("text-anchor", "middle").text("Varmt vann");
      svg.append("text").attr("class", "lbl cold-l b").attr("text-anchor", "middle").text("Kjølig vann");
      svg.append("text").attr("class", "lbl trade-l").attr("text-anchor", "middle");
      svg.append("path").attr("class", "trade").attr("fill", "none").attr("stroke", "var(--text)").attr("stroke-width", 3).attr("marker-end", "url(#ar)");
      svg.append("text").attr("class", "lbl s dry-l").attr("text-anchor", "middle").text("Synkende, tørr luft");
      animate = false;
    }
    const svg = d3.select(el).select("svg");
    const g = svg.select("#sstg");
    T(g.select(".s1")).attr("offset", Math.max(0, P.edge - 0.12));
    T(g.select(".s2")).attr("offset", Math.min(1, P.edge + 0.1));
    const x0 = X(0.085), x1 = X(0.915);
    const thermD = `M${x0},${P.tw} C${X(0.4)},${P.tw} ${X(0.6)},${(P.tw + P.te) / 2 + (P.te - P.tw) * 0.35} ${x1},${P.te}`;
    T(svg.select(".therm")).attr("d", thermD);
    T(svg.select(".warm")).attr("d", `M${x0},${surf} L${x1},${surf} L${x1},${P.te} C${X(0.6)},${(P.tw + P.te) / 2 + (P.te - P.tw) * 0.35} ${X(0.4)},${P.tw} ${x0},${P.tw} Z`);
    T(svg.select(".therm-l")).attr("x", X(0.5)).attr("y", (P.tw + P.te) / 2 + 22);
    T(svg.select(".up")).attr("d", `M${X(0.86)},${P.te + 70} Q${X(0.86)},${surf + 30} ${X(0.89)},${surf + 8}`).attr("opacity", Math.min(1, P.up)).attr("stroke-width", 1.5 + P.up * 1.2);
    T(svg.select(".up-l")).attr("x", X(0.84)).attr("y", P.te + 60).attr("opacity", P.up > 0 ? 1 : 0);
    // celle
    const top = 46, bot = surf - 34, r = P.rise, s = P.sink, dir = s > r ? 1 : -1, pad = 0.03 * dir;
    T(svg.select(".c-up")).attr("d", `M${X(r)},${bot - 6} L${X(r)},${top + 14}`).attr("opacity", P.cell > 0.8 ? 1 : 0.7).attr("stroke-width", 1.2 + P.cell);
    T(svg.select(".c-top")).attr("d", `M${X(r + pad)},${top} L${X(s - pad)},${top}`).attr("stroke-width", 1.2 + P.cell);
    T(svg.select(".c-down")).attr("d", `M${X(s)},${top + 14} L${X(s)},${bot - 6}`).attr("stroke-width", 1.2 + P.cell);
    T(svg.select(".c-bot")).attr("d", `M${X(s - pad)},${bot + 10} L${X(r + pad)},${bot + 10}`).attr("stroke-width", 1.2 + P.cell).attr("opacity", 0.55);
    T(svg.select(".cell-l")).attr("x", X((r + s) / 2)).attr("y", top - 10);
    T(svg.select(".dry-l")).attr("x", X(s) + (dir > 0 ? -2 : 6)).attr("y", top + 74).attr("text-anchor", s > 0.5 ? "end" : "start").attr("dx", s > 0.5 ? -10 : 10);
    T(svg.select(".cloud")).attr("transform", `translate(${X(P.cx)},${top + 46}) scale(${P.cs})`);
    T(svg.select(".trade")).attr("d", `M${X(P.trade[0])},${surf - 14} L${X(P.trade[1])},${surf - 14}`).attr("stroke-width", wsState === "nina" ? 4.5 : wsState === "nino" ? 2.2 : 3);
    svg.select(".trade-l").text(P.tradeT);
    T(svg.select(".trade-l")).attr("x", X((P.trade[0] + P.trade[1]) / 2)).attr("y", surf - 24);
    T(svg.select(".warm-l")).attr("x", X(Math.max(0.2, P.edge / 2 + 0.05))).attr("y", surf + 38);
    T(svg.select(".cold-l")).attr("x", X(Math.min(0.8, (P.edge + 0.92) / 2))).attr("y", surf + 38).attr("opacity", P.edge > 0.8 ? 0 : 1);
    document.getElementById("wcap").innerHTML = P.cap.map(([h, t]) => `<div><b>${h}</b>${t}</div>`).join("");
  }
  (function () { const el = document.getElementById("wstate"); el.querySelectorAll("button").forEach((b) => (b.onclick = () => { el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); wsState = b.dataset.v; walker(true); })); })();
  if (curEp) { wsState = curEp.type === "EN" ? "nino" : "nina"; document.querySelectorAll("#wstate button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.v === wsState))); }

  // ---------------------------------------------------------------- Niño-regionene
  const divCol = (v, max = 3) => {
    const dark = S.isDark();
    const s = d3.scaleDiverging([-max, 0, max], (t) => d3.interpolateRgbBasis(dark ? ["#5598e7", "#2a2a27", "#ec8a7f"] : ["#2a78d6", "#f4f3ef", "#d9584a"])(t)).clamp(true);
    return s(v);
  };
  function ninoMap() {
    const el = document.getElementById("nmap");
    const li = d.nino34.length - 1;
    document.getElementById("nm-sub").textContent = `Fargen viser havtemperaturen i ${monLab(li)}, avvik fra snittet 1991–2020. Niño 3.4 (tykk ramme) brukes til å definere El Niño.`;
    const w = Math.max(300, el.clientWidth || 600), h = Math.round(w * 0.52);
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const proj = d3.geoEqualEarth().rotate([160, 0]).fitExtent([[4, 4], [w - 4, h - 4]], { type: "MultiPoint", coordinates: [[100, -38], [-65, 38], [100, 38], [-65, -38], [-160, 40], [-160, -40]] });
    const path = d3.geoPath(proj);
    svg.append("clipPath").attr("id", "nclip").append("rect").attr("width", w).attr("height", h);
    const g = svg.append("g").attr("clip-path", "url(#nclip)");
    g.append("rect").attr("class", "sea").attr("width", w).attr("height", h);
    g.selectAll("path.land").data(land).join("path").attr("class", "land").attr("d", path);
    const eq = d3.range(80, 300, 2).map((lon) => proj([lon, 0]));
    g.append("path").attr("class", "eq").attr("fill", "none").attr("d", d3.line()(eq));
    g.append("text").attr("class", "lab").attr("x", proj([105, 0])[0]).attr("y", proj([105, 0])[1] - 4).text("Ekvator");
    const box = (lo0, lo1, la0, la1) => {
      const pts = [];
      for (let x = lo0; x <= lo1; x += 1) pts.push(proj([x, la1]));
      for (let x = lo1; x >= lo0; x -= 1) pts.push(proj([x, la0]));
      return d3.line()(pts) + "Z";
    };
    const R = [
      { k: "nino4", n: "Niño 4", b: [160, 210, -5, 5], ly: 9 },
      { k: "nino3", n: "Niño 3", b: [210, 270, -5, 5], ly: 9 },
      { k: "nino34", n: "Niño 3.4", b: [190, 240, -5, 5], ly: -9, cls: "n34" },
      { k: "nino12", n: "Niño 1+2", b: [270, 280, -10, 0], ly: 1 },
    ];
    R.forEach((r) => {
      const v = d[r.k][d[r.k].length - 1];
      g.append("path").attr("class", `box ${r.cls || ""}`).attr("d", box(...r.b)).attr("fill", divCol(v, 4))
        .on("mousemove", (e) => tip.show(`<div class="tt-title">${r.n}</div><div class="tt-row"><span>${cap(monLab(d[r.k].length - 1))}</span><b>${deg(v)}</b></div>`, e.clientX, e.clientY))
        .on("mouseleave", () => tip.hide());
    });
    R.forEach((r) => {
      const v = d[r.k][d[r.k].length - 1];
      const lat = r.ly > 0 ? r.b[2] : r.b[3];
      const c = proj([(r.b[0] + r.b[1]) / 2, lat]);
      const t = g.append("text").attr("class", "lab").attr("x", c[0]).attr("y", c[1] + (r.ly > 0 ? 14 : -6)).attr("text-anchor", "middle").attr("font-weight", r.cls ? 700 : 500);
      t.text(`${r.n} ${f1(v)}`);
    });
    // fargeskala
    const lg = svg.append("g").attr("transform", `translate(10,${h - 26})`);
    const vals = [-3, -2, -1, 0, 1, 2, 3], bw = Math.min(30, (w - 40) / 7);
    vals.forEach((v, k) => { lg.append("rect").attr("x", k * bw).attr("width", bw - 2).attr("height", 8).attr("rx", 2).attr("fill", divCol(v, 4)); lg.append("text").attr("class", "lab").attr("x", k * bw + bw / 2 - 1).attr("y", 20).attr("text-anchor", "middle").text((v > 0 ? "+" : "") + v); });
    lg.append("text").attr("class", "lab").attr("x", 7 * bw + 4).attr("y", 8).text("°C");
  }

  // ---------------------------------------------------------------- ONI-tidsserie
  function oniChart() {
    const el = document.getElementById("oni");
    const nEN = EPS.filter((e) => e.type === "EN").length, nLN = EPS.filter((e) => e.type === "LN").length;
    const shareEN = ONI.filter((v) => v >= 0.5).length / ONI.length, shareLN = ONI.filter((v) => v <= -0.5).length / ONI.length;
    document.getElementById("oni-sub").textContent = `Tremåneders snitt av havtemperaturavviket i Niño 3.4. Siden 1950 har det vært ${nEN} El Niño- og ${nLN} La Niña-episoder. ${S.pct(100 * shareEN, 0)} av tiden har vært El Niño, ${S.pct(100 * shareLN, 0)} La Niña.`;
    const w = Math.max(320, el.clientWidth || 900), h = 300, m = { t: 22, r: 10, b: 26, l: 36 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear([0, ONI.length], [m.l, w - m.r]);
    const ext = Math.max(2.8, d3.max(ONI, Math.abs));
    const y = d3.scaleLinear([-ext, ext], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(w - m.l - m.r)).tickFormat(""));
    [0.5, -0.5].forEach((t) => svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(t)).attr("y2", y(t)).attr("stroke", "var(--text-3)").attr("stroke-dasharray", "3 3"));
    const bw = Math.max(0.6, (w - m.l - m.r) / ONI.length);
    svg.append("g").selectAll("rect").data(ONI.map((v, i) => [i, v])).join("rect")
      .attr("x", (p) => x(p[0])).attr("width", bw + 0.3).attr("y", (p) => y(Math.max(0, p[1]))).attr("height", (p) => Math.abs(y(p[1]) - y(0)))
      .attr("fill", (p) => CLS_COL[cls(p[1])]);
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "var(--text-3)");
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat((v) => (v > 0 ? "+" : "") + S.nf1.format(v).replace(",0", "")).tickPadding(4));
    const yrTicks = d3.range(Y0, Y0 + Math.ceil(ONI.length / 12) + 1, w < 560 ? 20 : 10);
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickValues(yrTicks.map((yy) => idx(yy, 1))).tickFormat((v) => ym(v)[0]).tickSizeOuter(0));
    // etiketter for de sterkeste
    const strong = EPS.filter((e) => Math.abs(e.peak) >= (w < 560 ? 2 : 1.5)).sort((a, b) => a.pk - b.pk);
    let lastX = -99;
    strong.forEach((e) => {
      const px = x(e.pk) + bw / 2;
      if (e.type === "EN" && px - lastX < 34) return;
      const [y1] = ym(e.s), [y2] = ym(e.e);
      const t = y1 === y2 ? `${y1}` : `${y1}–${String(y2).slice(2)}`;
      svg.append("text").attr("x", px).attr("y", e.type === "EN" ? y(e.peak) - 5 : y(e.peak) + 13).attr("text-anchor", "middle").attr("fill", "var(--text-2)").attr("font-size", 11).attr("font-weight", e.ongoing ? 700 : 500).text(e.ongoing ? `${t} nå` : t);
      if (e.type === "EN") lastX = px;
    });
    const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--border-strong)").style("display", "none");
    svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", w - m.l - m.r).attr("height", h - m.t - m.b).attr("fill", "transparent")
      .on("mousemove", (e) => {
        const i = Math.max(0, Math.min(ONI.length - 1, Math.floor(x.invert(d3.pointer(e)[0]))));
        cross.style("display", null).attr("x1", x(i) + bw / 2).attr("x2", x(i) + bw / 2);
        const ep = EPS.find((p) => i >= p.s && i <= p.e);
        tip.show(`<div class="tt-title">${cap(seasLab(i))}</div><div class="tt-row"><span>ONI</span><b>${f1(ONI[i])}</b></div><div class="tt-row"><span>Niño 3.4, måned</span><b>${deg(N34[i])}</b></div><div class="tt-row"><span>Tilstand</span><b>${ep ? `${CLS_NB[ep.type]} (${strength(Math.abs(ep.peak))})` : cls(ONI[i]) === "N" ? "Nøytralt" : `${CLS_NB[cls(ONI[i])]}-forhold`}</b></div>`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => { tip.hide(); cross.style("display", "none"); });
  }

  // ---------------------------------------------------------------- episodetabell
  let epType = "all";
  const epTable = (() => {
    const rows = () => EPS.filter((e) => epType === "all" || e.type === epType).map((e) => ({ id: e.s, type: CLS_NB[e.type], tk: e.type, s: e.s, e: e.e, len: e.len, peak: e.peak, abs: Math.abs(e.peak), pk: e.pk, str: strength(Math.abs(e.peak)), ongoing: e.ongoing }));
    const t = S.sortableTable(document.getElementById("eptable"), [
      { key: "s", label: "Start", text: true, fmt: (v) => cap(seasLab(v)) },
      { key: "type", label: "Type", text: true, fmt: (v, r) => `<span class="tag ${r.tk.toLowerCase()}">${v}</span>` },
      { key: "e", label: "Slutt", text: true, fmt: (v, r) => (r.ongoing ? "<b>pågår</b>" : cap(seasLab(v))) },
      { key: "len", label: "Varighet (sesonger)", fmt: (v) => S.int(v) },
      { key: "abs", label: "Topp (ONI)", fmt: (v, r) => f1(r.peak) },
      { key: "pk", label: "Toppsesong", text: true, fmt: (v) => cap(seasLab(v)) },
      { key: "str", label: "Styrke", text: true, fmt: (v) => cap(v) },
    ], rows(), { sortKey: "s", dir: -1 });
    return { update() { t.update(rows()); } };
  })();
  function epSub() {
    const en = EPS.filter((e) => e.type === "EN"), ln = EPS.filter((e) => e.type === "LN");
    const vs = en.filter((e) => e.peak >= 2).map((e) => ym(e.pk)[0]);
    document.getElementById("ep-sub").textContent = `En episode er minst fem sesonger på rad over +0,5 (El Niño) eller under −0,5 (La Niña). El Niño varer i snitt ${S.nf1.format(d3.mean(en, (e) => e.len))} sesonger, La Niña ${S.nf1.format(d3.mean(ln, (e) => e.len))}. Svært sterke El Niño-episoder (≥ 2,0) toppet seg i ${vs.join(", ").replace(/, ([^,]*)$/, " og $1")}. Klikk på en kolonne for å sortere.`;
  }
  (function () { const el = document.getElementById("eptype"); el.querySelectorAll("button").forEach((b) => (b.onclick = () => { el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); epType = b.dataset.v; epTable.update(); })); })();
  document.getElementById("csv").onclick = () => S.downloadCsv("enso-episoder.csv", [["Type", "Start", "Slutt", "Varighet (sesonger)", "Topp (ONI)", "Toppsesong", "Styrke", "Pågår"],
    ...EPS.map((e) => [CLS_NB[e.type], seasLab(e.s), seasLab(e.e), e.len, String(e.peak).replace(".", ","), seasLab(e.pk), strength(Math.abs(e.peak)), e.ongoing ? "ja" : "nei"])]);

  // ---------------------------------------------------------------- nå: analoger
  function nowText() {
    const h = document.getElementById("now-h"), l = document.getElementById("now-lead");
    if (curEp) {
      const st = strength(Math.abs(curEp.peak));
      h.textContent = curEp.type === "EN" ? `En ${st} El Niño pågår nå` : `La Niña pågår nå`;
      l.textContent = curEp.type === "EN"
        ? `ONI har ligget over +0,5 siden ${seasLab(curEp.s)}, og siste sesong (${seasLab(lastI)}) var ${f1(lastV)}. ${curEp.peak >= 2 ? "Det er nivå med de største episodene som er målt. " : ""}El Niño når som regel toppen mellom november og januar og svekkes utover våren. Grafen viser hvordan årets utvikling følger de store episodene siden 1970-tallet.`
        : `ONI har ligget under −0,5 siden ${seasLab(curEp.s)}. Siste sesong (${seasLab(lastI)}) var ${f1(lastV)}.`;
    } else {
      h.textContent = "Stillehavet nå";
      l.textContent = `Siste sesong (${seasLab(lastI)}) var ONI ${f1(lastV)}, som er ${cls(lastV) === "N" ? "nøytralt" : CLS_NB[cls(lastV)] + "-forhold"}. Grafen sammenligner med de store El Niño-episodene.`;
    }
  }
  function analog() {
    const el = document.getElementById("analog");
    const curY = curEp && curEp.type === "EN" ? ym(curEp.s)[0] : ym(N34.length - 1)[0];
    const bigs = EPS.filter((e) => e.type === "EN" && e.peak >= 1.8 && !e.ongoing).map((e) => ym(e.s)[0]);
    const years = [...new Set([...bigs, curY])].sort();
    const PAL = ["var(--series-1)", "var(--series-3)", "var(--series-4)", "var(--series-7)", "var(--series-5)", "var(--series-6)", "var(--text-3)"];
    const ser = years.map((y0, k) => ({ y0, cur: y0 === curY, col: y0 === curY ? "var(--warm)" : PAL[k % PAL.length], pts: d3.range(24).map((m) => [m, at(N34, y0 + Math.floor(m / 12), (m % 12) + 1)]).filter((p) => p[1] != null) }));
    document.getElementById("an-sub").textContent = `Havtemperatur i Niño 3.4 måned for måned, fra januar i startåret til desember året etter. Avvik fra 1991–2020. Siste måned: ${monLab(N34.length - 1)}.`;
    document.getElementById("an-legend").innerHTML = ser.map((s) => `<span class="item"><span class="sw line" style="background:${s.col}${s.cur ? ";height:4px" : ""}"></span>${s.y0}–${String(s.y0 + 1).slice(2)}${s.cur ? " (nå)" : ""}</span>`).join("");
    const w = Math.max(320, el.clientWidth || 700), h = 320, m = { t: 12, r: 14, b: 28, l: 36 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear([0, 23], [m.l, w - m.r]);
    const y = d3.scaleLinear([Math.min(-1.5, d3.min(ser.flatMap((s) => s.pts.map((p) => p[1])))), Math.max(3, d3.max(ser.flatMap((s) => s.pts.map((p) => p[1]))))], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "var(--text-3)");
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(0.5)).attr("y2", y(0.5)).attr("stroke", "var(--text-3)").attr("stroke-dasharray", "3 3");
    svg.append("line").attr("x1", x(12)).attr("x2", x(12)).attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--border-strong)");
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat((v) => (v > 0 ? "+" : "") + v).tickPadding(4));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickValues(d3.range(0, 24, w < 560 ? 3 : 2)).tickFormat((v) => `${S.MONTHS_SHORT[v % 12]}${v === 0 ? " år 1" : v === 12 ? " år 2" : ""}`).tickSizeOuter(0));
    ser.filter((s) => !s.cur).concat(ser.filter((s) => s.cur)).forEach((s) => {
      svg.append("path").datum(s.pts).attr("fill", "none").attr("stroke", s.col).attr("stroke-width", s.cur ? 3.5 : 1.8).attr("opacity", s.cur ? 1 : 0.85).attr("d", d3.line().x((p) => x(p[0])).y((p) => y(p[1])));
      if (s.cur && s.pts.length) { const lp = s.pts[s.pts.length - 1]; svg.append("circle").attr("cx", x(lp[0])).attr("cy", y(lp[1])).attr("r", 5).attr("fill", s.col); svg.append("text").attr("x", x(lp[0]) + 8).attr("y", y(lp[1]) - 6).attr("fill", "var(--text)").attr("font-size", 12).attr("font-weight", 700).text(deg(lp[1])); }
    });
    const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--border-strong)").style("display", "none");
    svg.append("rect").attr("x", m.l).attr("width", w - m.l - m.r).attr("height", h - m.b).attr("fill", "transparent")
      .on("mousemove", (e) => {
        const mi = Math.max(0, Math.min(23, Math.round(x.invert(d3.pointer(e)[0]))));
        cross.style("display", null).attr("x1", x(mi)).attr("x2", x(mi));
        tip.show(`<div class="tt-title">${cap(S.MONTHS[mi % 12])}, år ${mi < 12 ? 1 : 2}</div>${ser.map((s) => { const v = s.pts.find((p) => p[0] === mi); return `<div class="tt-row"><span><span class="key" style="background:${s.col}"></span>${S.MONTHS_SHORT[mi % 12]} ${s.y0 + (mi < 12 ? 0 : 1)}</span><b>${v ? deg(v[1]) : "–"}</b></div>`; }).join("")}`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => { tip.hide(); cross.style("display", "none"); });
  }
  function weekly() {
    const el = document.getElementById("weekly"), W = d.week.slice(-52);
    document.getElementById("wk-sub").textContent = `Ukentlige havtemperaturavvik, siste ${W.length} uker. Niño 1+2 ligger rett utenfor Peru og Ecuador.`;
    const w = Math.max(300, el.clientWidth || 400), h = 220, m = { t: 12, r: 70, b: 26, l: 32 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleTime(d3.extent(W, (p) => new Date(p[0])), [m.l, w - m.r]);
    const y = d3.scaleLinear([Math.min(-1, d3.min(W, (p) => Math.min(p[1], p[2]))), Math.max(2, d3.max(W, (p) => Math.max(p[1], p[2])))], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "var(--text-3)");
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => (v > 0 ? "+" : "") + v).tickPadding(4));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(w < 400 ? 4 : 6).tickFormat((t) => S.MONTHS_SHORT[t.getMonth()]).tickSizeOuter(0));
    [[1, "Niño 1+2", "var(--series-4)"], [2, "Niño 3.4", "var(--warm)"]].forEach(([k, n, c]) => {
      svg.append("path").datum(W).attr("fill", "none").attr("stroke", c).attr("stroke-width", k === 2 ? 3 : 2).attr("d", d3.line().x((p) => x(new Date(p[0]))).y((p) => y(p[k])));
      const lp = W[W.length - 1];
      svg.append("text").attr("x", x(new Date(lp[0])) + 6).attr("y", y(lp[k]) + 4).attr("fill", "var(--text-2)").attr("font-size", 11.5).attr("font-weight", 600).text(`${n} ${f1(lp[k])}`);
    });
    // fakta
    const li = N34.length - 1;
    const facts = [
      ["Niño 1+2 (kysten av Peru)", d.nino12[li]], ["Niño 3 (østlige Stillehavet)", d.nino3[li]], ["Niño 3.4 (sentrale øst)", d.nino34[li]], ["Niño 4 (sentrale vest)", d.nino4[li]],
    ];
    const east = d.nino12[li] - d.nino4[li];
    document.getElementById("nowfacts").innerHTML = `<div class="f"><span><b>${cap(monLab(li))}</b></span><b>Avvik</b></div>` + facts.map(([n, v]) => `<div class="f"><span>${n}</span><b>${deg(v)}</b></div>`).join("") +
      `<p class="note">${east > 1 ? "Varmen er størst langt øst, nær Sør-Amerika – et typisk trekk ved de kraftigste episodene (som 1982–83 og 1997–98)." : east < -0.5 ? "Varmen er størst i det sentrale Stillehavet. Slike episoder kalles ofte «Modoki» og har litt andre fjernvirkninger." : "Varmen er nokså jevnt fordelt over det østlige og sentrale Stillehavet."}</p>`;
  }

  // ---------------------------------------------------------------- global temperatur
  const GY = YEARS.map((y) => { const v = d3.range(1, 13).map((m) => at(d.glob, y, m)); const ok = v.filter((x) => x != null); return { y, v: ok.length ? d3.mean(ok) : null, n: ok.length }; });
  const GFULL = GY.filter((g) => g.n === 12);
  const GDT = detrend(GFULL.map((g) => g.v));
  function glob() {
    const el = document.getElementById("glob");
    const w = Math.max(300, el.clientWidth || 600), h = 300, m = { t: 14, r: 10, b: 26, l: 40 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const rows = GY.filter((g) => g.v != null).map((g) => ({ ...g, o: at(ONI, g.y, 1) }));
    const x = d3.scaleBand(rows.map((r) => r.y), [m.l, w - m.r]).padding(0.15);
    const y = d3.scaleLinear([Math.min(-0.3, d3.min(rows, (r) => r.v)), d3.max(rows, (r) => r.v)], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").selectAll("rect").data(rows).join("rect").attr("x", (r) => x(r.y)).attr("width", x.bandwidth()).attr("y", (r) => y(Math.max(0, r.v))).attr("height", (r) => Math.abs(y(r.v) - y(0)))
      .attr("fill", (r) => CLS_COL[cls(r.o) || "N"]).attr("opacity", (r) => (r.n < 12 ? 0.5 : 1))
      .on("mousemove", (e, r) => tip.show(`<div class="tt-title">${r.y}${r.n < 12 ? " (hittil i år)" : ""}</div><div class="tt-row"><span>Global temperatur</span><b>${deg(r.v)}</b></div><div class="tt-row"><span>ONI des–feb</span><b>${f1(r.o)} · ${CLS_NB[cls(r.o)] || "–"}</b></div>`, e.clientX, e.clientY))
      .on("mouseleave", () => tip.hide());
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "var(--text-3)");
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat((v) => (v > 0 ? "+" : "") + S.nf1.format(v)).tickPadding(4));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickValues(rows.map((r) => r.y).filter((yy) => yy % (w < 560 ? 20 : 10) === 0)).tickSizeOuter(0));
    // rekordår
    let rec = -9; const recs = [];
    rows.forEach((r) => { if (r.n === 12 && r.v > rec) { rec = r.v; recs.push(r); } });
    recs.slice(-4).forEach((r) => svg.append("text").attr("x", x(r.y) + x.bandwidth() / 2).attr("y", y(r.v) - 4).attr("text-anchor", "middle").attr("font-size", 10.5).attr("fill", "var(--text-2)").text(r.y));
  }
  function gscatter() {
    const el = document.getElementById("gscatter");
    const pts = GFULL.map((g, k) => ({ y: g.y, x: at(ONI, g.y, 1), r: GDT[k]?.r })).filter((p) => p.x != null && p.r != null);
    const st = pearson(pts.map((p) => [p.x, p.r]));
    document.getElementById("gs-sub").textContent = `Hvert punkt er ett år: ONI vinteren ved årsskiftet (x) mot hvor mye varmere eller kaldere året var enn den langsiktige trenden (y). r = ${nf2.format(st.r)}, ${S.stats.fmtP(st.p)}. En ONI på +2 gir i snitt ${nf2.format(2 * st.slope)} °C ekstra.`;
    const w = Math.max(300, el.clientWidth || 600), h = 300, m = { t: 12, r: 16, b: 38, l: 44 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear(d3.extent(pts, (p) => p.x), [m.l, w - m.r]).nice();
    const y = d3.scaleLinear(d3.extent(pts, (p) => p.r), [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => (v > 0 ? "+" : "") + S.nf1.format(v)).tickPadding(4));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat((v) => (v > 0 ? "+" : "") + v).tickSizeOuter(0));
    svg.append("text").attr("x", w - m.r).attr("y", h - 4).attr("text-anchor", "end").attr("fill", "var(--text-3)").attr("font-size", 11.5).text("ONI des–feb →");
    svg.append("text").attr("x", m.l).attr("y", m.t - 2).attr("fill", "var(--text-3)").attr("font-size", 11.5).text("°C over/under trenden");
    const xs = x.domain();
    svg.append("line").attr("x1", x(xs[0])).attr("x2", x(xs[1])).attr("y1", y(st.icpt + st.slope * xs[0])).attr("y2", y(st.icpt + st.slope * xs[1])).attr("stroke", "var(--text-2)").attr("stroke-dasharray", "5 4");
    svg.append("g").selectAll("circle").data(pts).join("circle").attr("cx", (p) => x(p.x)).attr("cy", (p) => y(p.r)).attr("r", 4.5).attr("fill", (p) => CLS_COL[cls(p.x)]).attr("stroke", "var(--surface)")
      .on("mousemove", (e, p) => tip.show(`<div class="tt-title">${p.y}</div><div class="tt-row"><span>ONI des–feb</span><b>${f1(p.x)}</b></div><div class="tt-row"><span>Mot trenden</span><b>${f2(p.r)} °C</b></div>`, e.clientX, e.clientY))
      .on("mouseleave", () => tip.hide());
    const lab = pts.slice().sort((a, b) => Math.abs(b.x) - Math.abs(a.x)).slice(0, 6);
    lab.forEach((p) => svg.append("text").attr("x", x(p.x) + (p.x > 0 ? -7 : 7)).attr("y", y(p.r) + 4).attr("text-anchor", p.x > 0 ? "end" : "start").attr("font-size", 11).attr("fill", "var(--text-2)").text(p.y));
  }

  // ---------------------------------------------------------------- fjernvirkninger
  const st = { v: "t", seas: "DJF", zoom: "verden", c: "NOR" };
  const CENT = { DJF: 1, MAM: 4, JJA: 7, SON: 10 };
  const SEAS_LONG = { DJF: "vinter (des–feb)", MAM: "vår (mar–mai)", JJA: "sommer (jun–aug)", SON: "høst (sep–nov)" };
  const SEAS_SHORT = { DJF: "Vinter", MAM: "Vår", JJA: "Sommer", SON: "Høst" };
  const ONI_YEAR = YEARS.map((y) => { const v = d3.range(1, 13).map((m) => at(ONI, y, m)); return v.every((x) => x != null) ? d3.mean(v) : null; });
  const cache = {};
  function series(c, v, seas) {
    const k = `${c}|${v}|${seas}`;
    if (cache[k]) return cache[k];
    const C = d.countries[c]; let out = null;
    if (C) {
      if (v === "t" && C.t[seas]) {
        const raw = YEARS.map((y, i) => C.t[seas][i] ?? null);
        const dt = detrend(raw);
        out = YEARS.map((y, i) => ({ y, x: at(ONI, y, CENT[seas]), a: dt[i]?.r ?? null, raw: raw[i] })).filter((p) => p.x != null && p.a != null);
      } else if (v === "p" && C.p) {
        const raw = YEARS.map((y, i) => C.p[i] ?? null);
        const dt = detrend(raw);
        out = YEARS.map((y, i) => ({ y, x: ONI_YEAR[i], a: dt[i] ? (100 * dt[i].r) / dt[i].t : null, raw: raw[i] })).filter((p) => p.x != null && p.a != null && isFinite(p.a));
      }
    }
    return (cache[k] = out);
  }
  function corrOf(c, v = st.v, seas = st.seas) { const s = series(c, v, seas); return s ? pearson(s.map((p) => [p.x, p.a])) : null; }
  const SKIP = new Set(["OWID_WRL", "EUR", "SGS", "ATF", "HMD", "IOT", "UMI", "BVT", "ATA", "FLK", "SPM", "PCN"]);
  const ALL = Object.keys(d.countries).filter((c) => !SKIP.has(c));
  function ramp(v) {
    const dark = S.isDark();
    if (v === "t") return dark ? ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281", "#8f2a22", "#b8392d", "#d9584a", "#ec8a7f", "#f6bcb5"] : ["#184f95", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb", "#fbd9d4", "#f4aea5", "#ea7f72", "#d9584a", "#9a2e23"];
    return dark ? ["#e0b57a", "#c98f3f", "#a86d22", "#7f5216", "#5a3b10", "#0f4a44", "#14665d", "#1c8a7c", "#3fb0a0", "#86d4c8"] : ["#7f5216", "#a86d22", "#c98f3f", "#e0b57a", "#f2dcbc", "#cdeee8", "#93d6cb", "#4fb5a5", "#1c8a7c", "#0f5a52"];
  }
  const TH = [-0.6, -0.45, -0.3, -0.15, 0, 0.15, 0.3, 0.45, 0.6];
  const rCol = (r, v) => (r == null ? null : ramp(v)[d3.bisect(TH, r)]);
  const wordPos = (v) => (v === "t" ? "varmere" : "våtere"), wordNeg = (v) => (v === "t" ? "kaldere" : "tørrere");
  function seasLabel() { return st.v === "t" ? SEAS_LONG[st.seas] : "nedbør i hele året"; }
  function tNote() {
    document.getElementById("seas-f").style.opacity = st.v === "p" ? 0.45 : 1;
    document.querySelectorAll("#tseas button").forEach((b) => (b.disabled = st.v === "p"));
    document.getElementById("t-note").textContent = st.v === "t"
      ? `Temperaturavviket i hvert land i ${SEAS_LONG[st.seas]}, korrelert med ONI for de samme tre månedene, 1950–i dag. Den langsiktige oppvarmingen er trukket fra først.`
      : "Årsnedbøren i hvert land korrelert med årssnittet av ONI, 1950–i dag. Nedbøren er målt som prosent over eller under landets egen trend.";
  }
  function wmap() {
    const el = document.getElementById("map"), v = st.v;
    document.getElementById("m-title").textContent = v === "t" ? `Temperatur og El Niño, ${SEAS_LONG[st.seas]}` : "Nedbør og El Niño, hele året";
    document.getElementById("m-sub").textContent = `Korrelasjon (r). ${v === "t" ? "Rødt: varmere under El Niño og kaldere under La Niña. Blått: omvendt." : "Grønt: våtere under El Niño. Brunt: tørrere."} Klikk et land for detaljer.`;
    const w = Math.max(300, el.clientWidth || 700), h = Math.round(w * (st.zoom === "europa" ? 0.78 : 0.52));
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    svg.append("clipPath").attr("id", "wclip").append("rect").attr("width", w).attr("height", h - 44);
    const proj = st.zoom === "europa"
      ? d3.geoConicConformal().rotate([-12, 0]).parallels([40, 68]).fitExtent([[4, 4], [w - 4, h - 46]], { type: "Feature", geometry: { type: "Polygon", coordinates: [[[-11, 35], [-11, 71], [40, 71], [40, 35], [-11, 35]]] } })
      : d3.geoEqualEarth().fitExtent([[4, 4], [w - 4, h - 46]], { type: "FeatureCollection", features: land.filter((f) => f.properties.id !== "ATA") });
    const path = d3.geoPath(proj);
    svg.append("g").attr("clip-path", "url(#wclip)").selectAll("path").data(land).join("path").attr("d", path)
      .attr("class", (f) => (corrOf(f.properties.id) ? "c" : "na"))
      .attr("fill", (f) => rCol(corrOf(f.properties.id)?.r, v))
      .on("mousemove", (e, f) => {
        const c = f.properties.id, s = corrOf(c);
        tip.show(`<div class="tt-title">${S.escapeHtml(name(c))}</div>${s ? `<div class="tt-row"><span>Korrelasjon (r)</span><b>${f2(s.r)}</b></div><div class="tt-row"><span>Signifikans</span><b>${S.stats.fmtP(s.p)}</b></div><div class="tt-row"><span>Per +1 i ONI</span><b>${v === "t" ? f2(s.slope) + " °C" : f1(s.slope) + " %"}</b></div><div class="tt-row"><span>År</span><b>${s.n}</b></div>` : '<div class="tt-row"><span>Ingen tall</span></div>'}`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => tip.hide())
      .on("click", (e, f) => { if (corrOf(f.properties.id)) pick(f.properties.id, true); });
    const sel = land.find((f) => f.properties.id === st.c);
    if (sel) svg.append("path").attr("class", "sel").attr("clip-path", "url(#wclip)").attr("d", path(sel));
    const lg = svg.append("g").attr("class", "lg").attr("transform", `translate(8,${h - 36})`);
    const R = ramp(v), bw = Math.min(34, (w - 40) / R.length);
    R.forEach((c, k) => lg.append("rect").attr("x", k * bw).attr("y", 0).attr("width", bw - 2).attr("height", 10).attr("rx", 2).attr("fill", c));
    TH.forEach((t, k) => { if (w < 420 && k % 2) return; lg.append("text").attr("x", (k + 1) * bw - 1).attr("y", 26).attr("text-anchor", "middle").text(t === 0 ? "0" : nf2.format(t).replace(/0$/, "").replace("-", "−")); });
    lg.append("text").attr("x", R.length * bw + 6).attr("y", 9).text("r");
  }
  function rank() {
    const el = document.getElementById("rank"), v = st.v;
    const rows = ALL.map((c) => ({ c, s: corrOf(c) })).filter((x) => x.s && x.s.n >= 30).sort((a, b) => b.s.r - a.s.r);
    const pos = rows.findIndex((r) => r.c === "NOR") + 1, nr = rows.find((r) => r.c === "NOR");
    const sig = rows.filter((r) => r.s.p < 0.05).length;
    document.getElementById("r-sub").textContent = `${rows.length} land. ${sig} har en signifikant sammenheng (p < 0,05). Norge: r = ${nr ? f2(nr.s.r) : "–"} (${nr ? S.stats.fmtP(nr.s.p) : "–"}), nr. ${pos}.`;
    const K = 12, top = rows.slice(0, K), bot = rows.slice(-K).reverse();
    const nor = rows.find((r) => r.c === "NOR");
    const line = (r, i) => {
      const x = (val) => 50 + 50 * val / 0.9, a = Math.min(x(0), x(r.s.r)), b = Math.abs(x(r.s.r) - x(0));
      return `<div class="r ${r.c === "NOR" ? "no" : ""} ${r.c === st.c ? "pick" : ""}" data-c="${r.c}"><span class="i">${i}</span><span>${S.escapeHtml(name(r.c))}</span><div class="bw"><div class="z" style="left:50%"></div><div class="b" style="left:${a.toFixed(1)}%;width:${Math.max(0.6, b).toFixed(1)}%;background:${rCol(r.s.r, v)}"></div></div><span class="v">${f2(r.s.r)}</span></div>`;
    };
    el.innerHTML = `<div class="sep">${cap(wordPos(v))} under El Niño</div>` + top.map((r, k) => line(r, k + 1)).join("") +
      (nor && !top.includes(nor) && !bot.includes(nor) ? `<div class="sep">…</div>${line(nor, pos)}` : "") +
      `<div class="sep">${cap(wordNeg(v))} under El Niño</div>` + bot.map((r, k) => line(r, rows.length - k)).join("");
    el.querySelectorAll(".r").forEach((row) => (row.onclick = () => pick(row.dataset.c, true)));
  }

  // ---------------------------------------------------------------- Europa
  const EUROPE = ["NOR", "SWE", "FIN", "DNK", "ISL", "EST", "LVA", "LTU", "GBR", "IRL", "NLD", "BEL", "LUX", "DEU", "POL", "BLR", "UKR", "FRA", "CHE", "AUT", "CZE", "SVK", "HUN", "ROU", "MDA", "SVN", "HRV", "BIH", "SRB", "MNE", "ALB", "MKD", "BGR", "GRC", "ITA", "ESP", "PRT", "TUR", "EUR"];
  function heat() {
    const el = document.getElementById("heat");
    const cols = ["DJF", "MAM", "JJA", "SON"];
    const cnt = { sig: 0, n: 0 };
    const rows = EUROPE.filter((c) => d.countries[c]).map((c) => {
      const cells = cols.map((s) => ({ s, v: "t", k: corrOf(c, "t", s) })).concat([{ s: "DJF", v: "p", k: corrOf(c, "p") }]);
      cells.forEach((x) => { if (x.k && c !== "EUR") { cnt.n++; if (x.k.p < 0.05) cnt.sig++; } });
      return { c, cells };
    });
    document.getElementById("h-sub").textContent = `${cnt.sig} av ${cnt.n} ruter er signifikante. Ved ren tilfeldighet ville vi ventet rundt ${Math.round(cnt.n * 0.05)}. Mønsteret: litt varmere høst i Mellom- og Sør-Europa, svakt varmere vinter i sør, og nesten ingenting i Norden.`;
    const txt = (r) => (Math.abs(r) > 0.35 ? (S.isDark() ? "#111" : "#fff") : "var(--text)");
    el.innerHTML = `<table><thead><tr><th></th>${cols.map((s) => `<th>${SEAS_SHORT[s]}</th>`).join("")}<th>Nedbør, år</th></tr></thead><tbody>${rows.map((r) =>
      `<tr class="${r.c === "NOR" ? "no" : ""}"><th class="c" data-c="${r.c}">${S.escapeHtml(name(r.c))}</th>${r.cells.map((x) => x.k
        ? `<td class="${x.k.p < 0.05 ? "sig" : ""} ${r.c === st.c && x.v === st.v && (x.v === "p" || x.s === st.seas) ? "pick" : ""}" data-c="${r.c}" data-s="${x.s}" data-v="${x.v}" style="background:${rCol(x.k.r, x.v)};color:${txt(x.k.r)}" title="${S.escapeHtml(name(r.c))}: r = ${f2(x.k.r)}, ${S.stats.fmtP(x.k.p)}">${f2(x.k.r)}</td>`
        : "<td>–</td>").join("")}</tr>`).join("")}</tbody></table>`;
    el.querySelectorAll("th.c").forEach((th) => (th.onclick = () => pick(th.dataset.c, true)));
    el.querySelectorAll("td[data-c]").forEach((td) => (td.onclick = () => { setVar(td.dataset.v, td.dataset.s); pick(td.dataset.c, true); }));
  }
  const csel = document.getElementById("csel");
  (function () {
    const eu = EUROPE.filter((c) => d.countries[c]).sort((a, b) => (a === "EUR" ? -1 : b === "EUR" ? 1 : name(a).localeCompare(name(b), "nb")));
    const rest = ALL.filter((c) => !EUROPE.includes(c)).sort((a, b) => name(a).localeCompare(name(b), "nb"));
    csel.innerHTML = `<optgroup label="Europa">${eu.map((c) => `<option value="${c}">${S.escapeHtml(name(c))}</option>`).join("")}</optgroup><optgroup label="Resten av verden">${rest.map((c) => `<option value="${c}">${S.escapeHtml(name(c))}</option>`).join("")}</optgroup>`;
    csel.value = st.c;
    csel.onchange = () => pick(csel.value);
  })();
  function cscatter() {
    const el = document.getElementById("cscatter"), v = st.v;
    const pts = series(st.c, v, st.seas);
    document.getElementById("c-title").textContent = `${name(st.c)}: ${v === "t" ? SEAS_LONG[st.seas] : "årsnedbør"}`;
    el.innerHTML = "";
    if (!pts || pts.length < 10) { document.getElementById("c-sub").textContent = v === "p" ? "Ingen nedbørstall for dette området." : "For få tall."; return; }
    const s = pearson(pts.map((p) => [p.x, p.a]));
    document.getElementById("c-sub").textContent = `Hvert punkt er ett år. ONI (x) mot ${v === "t" ? "temperatur" : "nedbør"} over eller under trenden (y). r = ${nf2.format(s.r)}, ${S.stats.fmtP(s.p)}${s.p < 0.05 ? " – signifikant" : " – ikke signifikant"}. El Niño forklarer ${S.pct(100 * s.r * s.r, 0)} av variasjonen fra år til år.`;
    const w = Math.max(300, el.clientWidth || 600), h = 320, m = { t: 14, r: 16, b: 38, l: 44 };
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear(d3.extent(pts, (p) => p.x), [m.l, w - m.r]).nice();
    const ext = d3.max(pts, (p) => Math.abs(p.a));
    const y = d3.scaleLinear([-ext, ext], [h - m.b, m.t]).nice();
    const unit = v === "t" ? " °C" : " %";
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "var(--text-3)");
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat((t) => (t > 0 ? "+" : "") + S.nf0.format(t)).tickPadding(4));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat((t) => (t > 0 ? "+" : "") + t).tickSizeOuter(0));
    svg.append("text").attr("x", w - m.r).attr("y", h - 4).attr("text-anchor", "end").attr("fill", "var(--text-3)").attr("font-size", 11.5).text(`ONI ${v === "t" ? SEAS_NB[CENT[st.seas] - 1] : "årssnitt"} →`);
    svg.append("text").attr("x", m.l).attr("y", m.t - 3).attr("fill", "var(--text-3)").attr("font-size", 11.5).text(v === "t" ? "°C over/under trenden" : "% over/under trenden");
    const xs = x.domain();
    svg.append("line").attr("x1", x(xs[0])).attr("x2", x(xs[1])).attr("y1", y(s.icpt + s.slope * xs[0])).attr("y2", y(s.icpt + s.slope * xs[1])).attr("stroke", "var(--text-2)").attr("stroke-dasharray", "5 4");
    svg.append("g").selectAll("circle").data(pts).join("circle").attr("cx", (p) => x(p.x)).attr("cy", (p) => y(p.a)).attr("r", 4.5).attr("fill", (p) => CLS_COL[cls(p.x)]).attr("stroke", "var(--surface)")
      .on("mousemove", (e, p) => tip.show(`<div class="tt-title">${v === "t" && st.seas === "DJF" ? `Vinteren ${p.y - 1}/${String(p.y).slice(2)}` : p.y}</div><div class="tt-row"><span>ONI</span><b>${f1(p.x)}</b></div><div class="tt-row"><span>Mot trenden</span><b>${v === "t" ? f1(p.a) : f1(p.a)}${unit}</b></div><div class="tt-row"><span>${v === "t" ? "Avvik fra normalen*" : "Nedbør"}</span><b>${v === "t" ? f1(p.raw) + " °C" : S.int(p.raw) + " mm"}</b></div>`, e.clientX, e.clientY))
      .on("mouseleave", () => tip.hide());
    pts.filter((p) => p.x >= 1.5).forEach((p) => svg.append("text").attr("x", x(p.x) + (x(p.x) > w - 70 ? -7 : 7)).attr("text-anchor", x(p.x) > w - 70 ? "end" : "start").attr("y", y(p.a) + 4).attr("font-size", 10.5).attr("fill", "var(--text-2)").text(v === "t" && st.seas === "DJF" ? `${p.y - 1}/${String(p.y).slice(2)}` : p.y));
  }
  function cbars() {
    const el = document.getElementById("cbars"), v = st.v, pts = series(st.c, v, st.seas);
    const unit = v === "t" ? " °C" : " %";
    document.getElementById("cb-title").textContent = "Snitt etter tilstand i Stillehavet";
    el.innerHTML = ""; document.getElementById("cwin").innerHTML = "";
    if (!pts || pts.length < 10) { document.getElementById("cb-sub").textContent = ""; return; }
    const G = [["LN", "La Niña", (p) => p.x <= -0.5], ["N", "Nøytralt", (p) => p.x > -0.5 && p.x < 0.5], ["EN", "El Niño", (p) => p.x >= 0.5], ["SEN", "Sterk El Niño (≥ 1,5)", (p) => p.x >= 1.5]].map(([k, n, f]) => {
      const a = pts.filter(f).map((p) => p.a);
      const mean = d3.mean(a), sd = d3.deviation(a) || 0;
      return { k, n, mean, lo: mean - 1.96 * sd / Math.sqrt(a.length || 1), hi: mean + 1.96 * sd / Math.sqrt(a.length || 1), cnt: a.length, min: d3.min(a), max: d3.max(a) };
    });
    document.getElementById("cb-sub").textContent = `${v === "t" ? "Temperatur" : "Nedbør"} over eller under trenden, gjennomsnitt med 95 % konfidensintervall. Strekene viser spennet fra laveste til høyeste år.`;
    const w = Math.max(300, el.clientWidth || 600), h = 240, m = { t: 10, r: 60, b: 26, l: w < 420 ? 112 : 150 };
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const ext = d3.max(G, (g) => Math.max(Math.abs(g.min ?? 0), Math.abs(g.max ?? 0))) || 1;
    const x = d3.scaleLinear([-ext, ext], [m.l, w - m.r]).nice();
    const y = d3.scaleBand(G.map((g) => g.k), [m.t, h - m.b]).padding(0.35);
    svg.append("g").attr("class", "grid").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(5).tickSize(-(h - m.t - m.b)).tickFormat(""));
    svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--text-3)");
    G.forEach((g) => {
      const yy = y(g.k), bh = y.bandwidth(), col = g.k === "SEN" ? "var(--warm)" : CLS_COL[g.k];
      svg.append("text").attr("x", m.l - 8).attr("y", yy + bh / 2 + 4).attr("text-anchor", "end").attr("font-size", 12).attr("fill", "var(--text-2)").text(`${g.n} (${g.cnt})`);
      if (!g.cnt) return;
      svg.append("line").attr("x1", x(g.min)).attr("x2", x(g.max)).attr("y1", yy + bh / 2).attr("y2", yy + bh / 2).attr("stroke", "var(--border-strong)").attr("stroke-width", 1.5);
      svg.append("rect").attr("x", Math.min(x(0), x(g.mean))).attr("width", Math.abs(x(g.mean) - x(0))).attr("y", yy).attr("height", bh).attr("rx", 3).attr("fill", col).attr("opacity", g.k === "SEN" ? 0.6 : 1);
      if (g.cnt > 2) svg.append("line").attr("x1", x(g.lo)).attr("x2", x(g.hi)).attr("y1", yy + bh / 2).attr("y2", yy + bh / 2).attr("stroke", "var(--text)").attr("stroke-width", 2);
      svg.append("text").attr("x", w - m.r + 6).attr("y", yy + bh / 2 + 4).attr("font-size", 12).attr("font-weight", 600).attr("fill", "var(--text)").text(f1(g.mean) + unit.trim().replace("°C", "°"));
    });
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat((t) => (t > 0 ? "+" : "") + S.nf0.format(t)).tickSizeOuter(0));
    // sterke El Niño-år
    const strong = pts.filter((p) => p.x >= 1.5).sort((a, b) => b.y - a.y);
    if (strong.length) {
      const warmer = strong.filter((p) => p.a > 0).length;
      document.getElementById("cwin").innerHTML = `<p class="note" style="margin-top:4px">${v === "t" ? (st.seas === "DJF" ? "Vintre" : "Sesonger") : "År"} med sterk El Niño: ${strong.map((p) => `<b>${v === "t" && st.seas === "DJF" ? `${p.y - 1}/${String(p.y).slice(2)}` : p.y}</b> ${f1(p.a)}${unit.trim() === "%" ? " %" : "°"}`).join(" · ")}. ${warmer} av ${strong.length} var ${wordPos(v)} enn trenden${warmer === 0 || warmer === strong.length ? "" : ", resten " + wordNeg(v)}.</p>`;
    }
  }

  // ---------------------------------------------------------------- NAO
  let naoP = "DJF";
  function nao() {
    const el = document.getElementById("nao");
    const ms = naoP === "DJF" ? [[-1, 12], [0, 1], [0, 2]] : [[0, 1], [0, 2], [0, 3]];
    const pts = YEARS.map((y) => { const v = ms.map(([dy, m]) => (y + dy < Y0 ? null : at(d.nao, y + dy, m))); return { y, n: v.every((x) => x != null) ? d3.mean(v) : null, o: at(ONI, y, 1) }; }).filter((p) => p.n != null && p.o != null);
    const s = pearson(pts.map((p) => [p.o, p.n]));
    const grp = { LN: pts.filter((p) => p.o <= -0.5), N: pts.filter((p) => Math.abs(p.o) < 0.5), EN: pts.filter((p) => p.o >= 0.5) };
    const mEN = d3.mean(grp.EN, (p) => p.n), mLN = d3.mean(grp.LN, (p) => p.n);
    document.getElementById("nao-sub").textContent = `NAO er trykkforskjellen mellom Azorene og Island. Positiv NAO gir mild, våt og vindfull vinter i Norge; negativ gir kaldere og tørrere vær. Snitt ${naoP === "DJF" ? "des–feb" : "jan–mar"}: ${f2(mEN)} i El Niño-vintre og ${f2(mLN)} i La Niña-vintre. Korrelasjon med ONI: r = ${nf2.format(s.r)} (${S.stats.fmtP(s.p)})${s.p >= 0.05 ? " – forskjellen er liten og ikke signifikant" : ""}. Sterke El Niño-vintre har svart ring.`;
    const w = Math.max(300, el.clientWidth || 600), h = 300, m = { t: 14, r: 14, b: 30, l: 40 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleBand(["LN", "N", "EN"], [m.l, w - m.r]).padding(0.2);
    const ext = d3.max(pts, (p) => Math.abs(p.n));
    const y = d3.scaleLinear([-ext, ext], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "var(--text-3)");
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat((t) => (t > 0 ? "+" : "") + t).tickPadding(4));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickFormat((k) => `${CLS_NB[k]} (${grp[k].length})`).tickSizeOuter(0));
    svg.append("text").attr("x", m.l + 4).attr("y", y(ext * 0.92)).attr("fill", "var(--text-3)").attr("font-size", 11).text("Mild og våt i Norge");
    svg.append("text").attr("x", m.l + 4).attr("y", y(-ext * 0.92)).attr("fill", "var(--text-3)").attr("font-size", 11).text("Kald og tørr i Norge");
    Object.entries(grp).forEach(([k, a]) => {
      const bw = x.bandwidth();
      // deterministisk spredning sideveis
      a.forEach((p, i) => {
        const jit = (((p.y * 37) % 17) / 16 - 0.5) * bw * 0.6;
        svg.append("circle").attr("cx", x(k) + bw / 2 + jit).attr("cy", y(p.n)).attr("r", p.o >= 1.5 ? 5.5 : 4.2).attr("fill", CLS_COL[k]).attr("opacity", 0.85).attr("stroke", p.o >= 1.5 ? "var(--text)" : "var(--surface)")
          .on("mousemove", (e) => tip.show(`<div class="tt-title">Vinteren ${p.y - 1}/${String(p.y).slice(2)}</div><div class="tt-row"><span>NAO</span><b>${f2(p.n)}</b></div><div class="tt-row"><span>ONI des–feb</span><b>${f1(p.o)}</b></div>`, e.clientX, e.clientY))
          .on("mouseleave", () => tip.hide());
      });
      const mm = d3.mean(a, (p) => p.n);
      svg.append("line").attr("x1", x(k) + bw * 0.12).attr("x2", x(k) + bw * 0.88).attr("y1", y(mm)).attr("y2", y(mm)).attr("stroke", "var(--text)").attr("stroke-width", 2.5);
    });
  }
  (function () { const el = document.getElementById("naop"); el.querySelectorAll("button").forEach((b) => (b.onclick = () => { el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); naoP = b.dataset.v; nao(); })); })();

  // ---------------------------------------------------------------- styring
  function segSet(id, val) { document.querySelectorAll(`#${id} button`).forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.v === val))); }
  function seg(id, cb) { const el = document.getElementById(id); el.querySelectorAll("button").forEach((b) => (b.onclick = () => { segSet(id, b.dataset.v); cb(b.dataset.v); })); }
  function setVar(v, seas) { st.v = v; if (v === "t" && seas) st.seas = seas; segSet("tvar", st.v); segSet("tseas", st.seas); }
  seg("tvar", (v) => { st.v = v; renderT(); });
  seg("tseas", (v) => { st.seas = v; renderT(); });
  seg("zoom", (v) => { st.zoom = v; wmap(); });
  function pick(c, scroll) {
    st.c = c; csel.value = c; renderT();
    if (scroll) document.getElementById("c-title").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function renderT() { tNote(); wmap(); rank(); heat(); cscatter(); cbars(); }

  function all() { kpis(); walker(false); ninoMap(); oniChart(); epSub(); nowText(); analog(); weekly(); glob(); gscatter(); renderT(); nao(); }
  all();
  document.getElementById("updated").textContent = `Data hentet ${d.fetched}`;
  S.onThemeChange(() => { wsBuilt = null; walker(false); ninoMap(); wmap(); heat(); });
  let rt, lastW = innerWidth;
  window.addEventListener("resize", () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rt); rt = setTimeout(() => { walker(false); ninoMap(); oniChart(); analog(); weekly(); glob(); gscatter(); wmap(); cscatter(); cbars(); nao(); }, 200); });
})();
