/* Studie 19 – Boligbranner i kommunene: funn over utforskeren (som bruker profil.js) */
(async function () {
  const S = window.Skatt;
  const tip = S.tooltip();
  const d = await fetch("data/brann.json").then((r) => r.json());
  const I = Object.fromEntries(d.indicators.map((i) => [i.key, i]));
  const K = d.kommuner, ids = Object.keys(K);
  const v = (key, k) => I[key].values[k];
  const f2 = (x) => (x == null ? "–" : x.toFixed(2).replace(".", ","));
  const pairs = (a, b) => ids.filter((k) => v(a, k) != null && v(b, k) != null);
  function pearson(a, b) {
    const ks = pairs(a, b), x = ks.map((k) => v(a, k)), y = ks.map((k) => v(b, k));
    const mx = d3.mean(x), my = d3.mean(y);
    return d3.sum(x, (p, i) => (p - mx) * (y[i] - my)) / Math.sqrt(d3.sum(x, (p) => (p - mx) ** 2) * d3.sum(y, (q) => (q - my) ** 2));
  }
  // Spearman: Pearson-korrelasjon på rangene (snittrang ved like verdier)
  function spearman(a, b) {
    const ks = pairs(a, b), n = ks.length;
    const rank = (key) => {
      const s = ks.slice().sort((p, q) => v(key, p) - v(key, q)), r = {};
      for (let i = 0; i < n;) { let j = i; while (j + 1 < n && v(key, s[j + 1]) === v(key, s[i])) j++; for (let t = i; t <= j; t++) r[s[t]] = (i + j) / 2; i = j + 1; }
      return r;
    };
    const ra = rank(a), rb = rank(b), m = (n - 1) / 2;
    const r = d3.sum(ks, (k) => (ra[k] - m) * (rb[k] - m)) / Math.sqrt(d3.sum(ks, (k) => (ra[k] - m) ** 2) * d3.sum(ks, (k) => (rb[k] - m) ** 2));
    return { r, n, ...signif(r, n, 1.06) };
  }

  // ---------------------------------------------------------------- signifikanstest (felles kode i common.js)
  const { signif } = S.stats;
  const fp = S.stats.fmtP;
  const fr = (x) => f2(x).replace("-", "−");
  // vektet snitt: branner per 1 000 innbyggere for en gruppe kommuner
  const groupRate = (ks) => d3.sum(ks, (k) => v("brann", k) * v("pop", k)) / d3.sum(ks, (k) => v("pop", k));
  const nat = I.brann.national;
  const nYears = (([a, b]) => b - a + 1)(I.brann.year.split("–").map(Number));

  // ---------------------------------------------------------------- KPI
  (function kpis() {
    const yrs = I.brann.year.split("–").map(Number), n = yrs[1] - yrs[0] + 1;
    const top = ids.filter((k) => v("brann", k) != null).sort((a, b) => v("brann", b) - v("brann", a));
    const big = ids.filter((k) => v("pop", k) >= 50000 && v("brann", k) != null).sort((a, b) => v("brann", b) - v("brann", a));
    const sp = spearman("boligpris", "brann");
    const cards = [
      { l: `Boligbranner ${I.brann.year}`, v: S.int(d.branner_totalt), s: `Ca. ${S.int(d.branner_totalt / n)} per år · ${f2(nat)} per 1 000 innbyggere` },
      { l: "Flest per innbygger", v: S.escapeHtml(K[top[0]].name), s: `${f2(v("brann", top[0]))} per 1 000 · så ${top.slice(1, 3).map((k) => K[k].name).join(" og ")}` },
      { l: "Blant de største kommunene", v: S.escapeHtml(K[big[0]].name), s: `${f2(v("brann", big[0]))} per 1 000 · lavest: ${K[big[big.length - 1]].name} (${f2(v("brann", big[big.length - 1]))})` },
      { l: "Boligpris og branner", v: `r = ${sp.r.toFixed(2).replace(".", ",").replace("-", "−")}`, s: `Rangkorrelasjon, ${fp(sp.p)}: Der boligene er billige, brenner det oftere` },
    ];
    document.getElementById("kpis").innerHTML = cards.map((c) => `<div class="card kpi"><div class="l">${c.l}</div><div class="v">${c.v}</div><div class="s">${c.s}</div></div>`).join("");
  })();

  // ---------------------------------------------------------------- korrelasjoner
  const CORR = [["piper", "piper"], ["eldre", "eldre"], ["boligpris", "pris"], ["vekst", "vekst"], ["flytting", "flytt"]];
  function corrbars() {
    const el = document.getElementById("corrbars");
    const rows = CORR.map(([key, preset]) => ({ key, preset, s: spearman(key, "brann"), p: pearson(key, "brann") })).sort((a, b) => b.s.r - a.s.r);
    const nTest = rows.length, alpha = 0.05, bonf = alpha / nTest;
    rows.forEach((r) => { r.pp = signif(r.p, r.s.n); r.sig = r.s.p < bonf ? 2 : r.s.p < alpha ? 1 : 0; });
    document.getElementById("c-sub").textContent = "Rangkorrelasjon (Spearman) mellom boligbranner per innbygger og fem kjennetegn ved kommunen, med 95 % konfidensintervall (strek) og signifikanstest. Positiv: mer av dette, flere branner. Negativ: mer av dette, færre branner. Klikk på en rad for å se den i diagrammet under.";
    const w = Math.max(300, el.clientWidth || 800), narrow = w < 560, rowH = narrow ? 64 : 36, m = { t: 6, r: narrow ? 10 : 170, b: 26, l: narrow ? 10 : 260 };
    const h = m.t + m.b + rowH * rows.length;
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleLinear([-0.7, 0.7], [m.l, w - m.r]);
    svg.append("g").attr("class", "grid").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(7).tickSize(-(h - m.t - m.b)).tickFormat(""));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(7).tickFormat((t) => t.toFixed(1).replace(".", ",").replace("-", "−")).tickSizeOuter(0));
    svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--text-3)");
    rows.forEach((r, i) => {
      const yy = m.t + i * rowH, by = narrow ? yy + 20 : yy + 9, bh = narrow ? 14 : rowH - 18;
      const sigTxt = r.sig === 2 ? "signifikant" : r.sig === 1 ? "svakt signifikant" : "ikke signifikant";
      const g = svg.append("g").style("cursor", "pointer")
        .on("click", () => { const b = document.querySelector(`#presets button[data-p="${r.preset}"]`); if (b) { b.click(); document.getElementById("presets").scrollIntoView({ behavior: "smooth", block: "start" }); } })
        .on("mousemove", (e) => tip.show(`<div class="tt-title">${S.escapeHtml(I[r.key].name)}</div>
          <div class="tt-row"><span>Rangkorrelasjon (Spearman)</span><b>${fr(r.s.r)}</b></div>
          <div class="tt-row"><span>95 % konfidensintervall</span><b>${fr(r.s.lo)} til ${fr(r.s.hi)}</b></div>
          <div class="tt-row"><span>t (${r.s.df} frihetsgrader)</span><b>${S.nf1.format(r.s.t).replace("-", "−")}</b></div>
          <div class="tt-row"><span>p-verdi</span><b>${fp(r.s.p)}</b></div>
          <div class="tt-row"><span>Vanlig korrelasjon (Pearson)</span><b>${fr(r.p)} · ${fp(r.pp.p)}</b></div>
          <div class="tt-row"><span>Kommuner</span><b>${r.s.n}</b></div>
          <div style="max-width:280px;margin-top:4px">${r.sig === 2 ? `Signifikant også etter Bonferroni-korreksjon for ${nTest} tester (p < ${String(bonf).replace(".", ",")}).` : r.sig === 1 ? `Signifikant på 5 %-nivå, men ikke etter korreksjon for ${nTest} tester.` : "Kan godt skyldes tilfeldigheter."}</div>`, e.clientX, e.clientY))
        .on("mouseleave", () => tip.hide());
      g.append("rect").attr("x", 0).attr("y", yy).attr("width", w).attr("height", rowH).attr("fill", "transparent");
      g.append("text").attr("x", narrow ? m.l : m.l - 12).attr("y", narrow ? yy + 14 : yy + rowH / 2 + 4).attr("text-anchor", narrow ? "start" : "end").attr("fill", "var(--text)").attr("font-size", 13).text(`${I[r.key].name} (${I[r.key].year})`);
      g.append("rect").attr("x", Math.min(x(0), x(r.s.r))).attr("y", by).attr("height", bh).attr("rx", 3).attr("width", Math.abs(x(r.s.r) - x(0)))
        .attr("fill", r.s.r > 0 ? "var(--series-5)" : "var(--series-1)").attr("opacity", r.sig ? 1 : 0.35);
      // konfidensintervall
      const cy = by + bh / 2;
      g.append("line").attr("x1", x(r.s.lo)).attr("x2", x(r.s.hi)).attr("y1", cy).attr("y2", cy).attr("stroke", "var(--text)").attr("stroke-width", 1.5);
      [r.s.lo, r.s.hi].forEach((xv) => g.append("line").attr("x1", x(xv)).attr("x2", x(xv)).attr("y1", cy - 5).attr("y2", cy + 5).attr("stroke", "var(--text)").attr("stroke-width", 1.5));
      const lab = `${fr(r.s.r)} · ${fp(r.s.p)}${r.sig === 2 ? " ✓" : r.sig === 1 ? " (✓)" : ""}`;
      if (narrow) g.append("text").attr("x", m.l).attr("y", by + bh + 15).attr("fill", "var(--text-2)").attr("font-size", 11.5).attr("font-weight", 600).text(lab);
      else g.append("text").attr("x", w - m.r + 14).attr("y", cy + 4).attr("fill", "var(--text)").attr("font-size", 12).attr("font-weight", 600).text(lab);
    });
    const sig = rows.filter((r) => r.sig === 2), weak = rows.filter((r) => r.sig === 1), non = rows.filter((r) => r.sig === 0);
    const nm = (rs) => rs.map((r) => I[r.key].name.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " og $1");
    document.getElementById("c-note").innerHTML = `<b>Signifikanstest:</b> ${sig.length ? `Sammenhengen med ${nm(sig)} er statistisk signifikant, også etter Bonferroni-korreksjon for at vi tester ${nTest} sammenhenger samtidig (p < ${String(bonf).replace(".", ",")}).` : ""}${weak.length ? ` Sammenhengen med ${nm(weak)} er signifikant på 5 %-nivå, men ikke etter korreksjonen.` : ""}${non.length ? ` Sammenhengen med ${nm(non)} er ikke signifikant og kan godt skyldes tilfeldigheter.` : ""}
      Testen sier bare at sammenhengen neppe skyldes tilfeldigheter. Den sier ikke hvor sterk den er eller hva som er årsaken. Nabokommuner ligner ofte på hverandre, så kommunene er ikke helt uavhengige observasjoner. Det gjør p-verdiene noe for optimistiske.`;
  }

  // ---------------------------------------------------------------- grupper (femtedeler)
  function quint(elId, subId, key, labels, unitTxt) {
    const el = document.getElementById(elId);
    const ks = ids.filter((k) => v(key, k) != null && v("brann", k) != null).sort((a, b) => v(key, a) - v(key, b));
    const n = ks.length, groups = [0, 1, 2, 3, 4].map((g) => ks.slice(Math.round((g * n) / 5), Math.round(((g + 1) * n) / 5)));
    const rows = groups.map((g, i) => ({ i, rate: groupRate(g), lo: v(key, g[0]), hi: v(key, g[g.length - 1]), n: g.length, pop: d3.sum(g, (k) => v("pop", k)) }));
    document.getElementById(subId).textContent = `${n} kommuner delt i fem like store grupper etter ${unitTxt}. Stolpene viser boligbranner per 1 000 innbyggere, vektet etter folketall. Streken er landssnittet (${f2(nat)}).`;
    const w = Math.max(280, el.clientWidth || 500), h = 260, m = { t: 22, r: 10, b: 46, l: 40 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const x = d3.scaleBand(rows.map((r) => r.i), [m.l, w - m.r]).padding(0.25);
    const y = d3.scaleLinear([0, Math.max(nat, d3.max(rows, (r) => r.rate)) * 1.15], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat((t) => t.toFixed(1).replace(".", ",")).tickPadding(6));
    const fmtR = (val) => (I[key].unit === "landet = 100" ? S.nf0.format(val) : S.nf1.format(val)).replace("-", "−");
    rows.forEach((r) => {
      const g = svg.append("g").on("mousemove", (e) => tip.show(`<div class="tt-title">${labels[r.i]}</div><div class="tt-row"><span>${S.escapeHtml(I[key].name)}</span><b>${fmtR(r.lo)} til ${fmtR(r.hi)}</b></div><div class="tt-row"><span>Boligbranner per 1 000</span><b>${f2(r.rate)}</b></div><div class="tt-row"><span>Kommuner</span><b>${r.n}</b></div><div class="tt-row"><span>Innbyggere</span><b>${S.int(r.pop)}</b></div>`, e.clientX, e.clientY)).on("mouseleave", () => tip.hide());
      g.append("rect").attr("x", x(r.i)).attr("width", x.bandwidth()).attr("y", y(r.rate)).attr("height", y(0) - y(r.rate)).attr("rx", 3).attr("fill", r.rate > nat ? "var(--series-5)" : "var(--series-1)");
      g.append("text").attr("x", x(r.i) + x.bandwidth() / 2).attr("y", y(r.rate) - 6).attr("text-anchor", "middle").attr("fill", "var(--text)").attr("font-size", 12).attr("font-weight", 600).text(f2(r.rate));
      g.append("text").attr("x", x(r.i) + x.bandwidth() / 2).attr("y", h - m.b + 16).attr("text-anchor", "middle").attr("fill", "var(--text-2)").attr("font-size", 11.5).text(labels[r.i]);
      if (x.bandwidth() >= 70) g.append("text").attr("x", x(r.i) + x.bandwidth() / 2).attr("y", h - m.b + 31).attr("text-anchor", "middle").attr("fill", "var(--text-3)").attr("font-size", 10.5).text(`${fmtR(r.lo)} … ${fmtR(r.hi)}`);
    });
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(nat)).attr("y2", y(nat)).attr("stroke", "var(--text)").attr("stroke-dasharray", "4 3");
  }

  // ---------------------------------------------------------------- kommune i søkelyset
  let spotK = ids.find((k) => K[k].name === "Båtsfjord") || ids[0];
  function spot() {
    const el = document.getElementById("spot"), k = spotK;
    const rk = (key) => { const s = ids.filter((x) => v(key, x) != null); return { r: s.filter((x) => v(key, x) > v(key, k)).length + 1, n: s.length }; };
    const b = v("brann", k), fr = rk("brann"), fl = rk("flytting"), pr = v("boligpris", k);
    const rel = b / nat - 1;
    const facts = [
      ["Boligbranner per 1 000 innb.", f2(b), `${rel >= 0 ? `${S.nf0.format(100 * rel)} % over` : `${S.nf0.format(-100 * rel)} % under`} landssnittet · nr. ${fr.r} av ${fr.n}`],
      ["Netto innflytting per 1 000", S.nf1.format(v("flytting", k)).replace("-", "−"), `per år ${I.flytting.year} · landet ${S.nf1.format(I.flytting.national)} · nr. ${fl.r} av ${fl.n}`],
      ["Befolkningsendring", S.pct(v("vekst", k), 1, true), `${I.vekst.year} · landet ${S.pct(I.vekst.national, 1, true)}`],
      ["Boligpris mot landet", pr == null ? "–" : S.nf0.format(pr), pr == null ? "For få registrerte salg til at SSB oppgir pris" : `landet = 100 · ${I.boligpris.year}`],
      ["Piper per 1 000 innb.", S.nf0.format(v("piper", k)), `landet ${S.nf0.format(I.piper.national)}`],
      ["Andel 67 år og eldre", S.pct(v("eldre", k), 1), `landet ${S.pct(I.eldre.national, 1)}`],
    ];
    // Hvor typisk er kommunens brannrate for kommuner med tilsvarende flytting?
    const sim = ids.filter((x) => v("flytting", x) != null && Math.abs(v("flytting", x) - v("flytting", k)) <= 2.5 && x !== k);
    const simRate = sim.length ? groupRate(sim) : null;
    const sorted = ids.slice().sort((a, b2) => K[a].name.localeCompare(K[b2].name, "nb"));
    el.innerHTML = `<div class="panel-head"><div><h2>Kommune i søkelyset: ${S.escapeHtml(K[k].name)}</h2><p>Velg en kommune for å se hvordan den ligger an.</p></div>
      <div class="field"><label for="spotsel">Kommune</label><select id="spotsel" class="select">${sorted.map((x) => `<option value="${x}"${x === k ? " selected" : ""}>${S.escapeHtml(K[x].name)}</option>`).join("")}</select></div></div>
      <div class="kpis" style="margin-top:6px">${facts.map(([l, val, s]) => `<div class="card kpi"><div class="l">${l}</div><div class="v">${val}</div><div class="s">${s}</div></div>`).join("")}</div>
      <p class="muted" style="margin:14px 0 0;max-width:80ch">${S.escapeHtml(K[k].name)} hadde ${f2(b)} boligbranner per 1 000 innbyggere i året. ${simRate != null ? `Kommuner med omtrent samme nettoflytting (±2,5 per 1 000) hadde i snitt ${f2(simRate)}, så ${S.escapeHtml(K[k].name)} ligger ${b > simRate * 1.15 ? "klart over" : b < simRate * 0.85 ? "klart under" : "på nivå med"} det som er vanlig for kommuner med lignende flytting.` : ""} Med ${S.int(v("pop", k))} innbyggere er tallene usikre. Én brann mer eller mindre i løpet av hele perioden ${I.brann.year} endrer raten med ${f2(1000 / v("pop", k) / nYears)}.</p>
      <p style="margin:12px 0 0"><button class="btn" id="spotgo">Vis ${S.escapeHtml(K[k].name)} i diagrammet og kartet</button></p>`;
    document.getElementById("spotsel").onchange = (e) => { spotK = e.target.value; spot(); };
    document.getElementById("spotgo").onclick = () => {
      const b2 = document.querySelector('#presets button[data-p="flytt"]'); if (b2) b2.click();
      const s = document.getElementById("search"); s.value = K[k].name; s.dispatchEvent(new Event("change"));
      document.getElementById("presets").scrollIntoView({ behavior: "smooth", block: "start" });
    };
  }

  function all() {
    corrbars();
    quint("q1", "q1-sub", "boligpris", ["Billigst", "", "", "", "Dyrest"].map((l, i) => l || `${i + 1}. gr.`), "boligpris mot landet");
    quint("q2", "q2-sub", "flytting", ["Mest ut", "", "", "", "Mest inn"].map((l, i) => l || `${i + 1}. gr.`), "netto innflytting per 1 000");
  }
  all(); spot();
  let rt, lastW = innerWidth;
  window.addEventListener("resize", () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rt); rt = setTimeout(all, 200); });
})();
