/* Studie 21 – Hva kom opp av havet? Produksjonshistorikken på norsk sokkel */
(async function () {
  const S = window.Skatt;
  const tip = S.tooltip();
  const [d, topo] = await Promise.all([
    fetch("data/sokkel.json").then((r) => r.json()),
    fetch("data/verden.topo.json").then((r) => r.json()),
  ]);

  // ---------------------------------------------------------------- data
  const FAT = 6.2898; // fat per Sm³
  const P = d.partial;
  const allYears = d.years;
  const lastFull = P ? P.year - 1 : allYears[allYears.length - 1];
  const years = allYears.filter((y) => y <= lastFull);
  const iy = (y) => y - allYears[0];
  const T = d.totals;
  const tot = (k, y) => T[k][iy(y)] || 0;

  const AREA = { "North sea": "Nordsjøen", "Norwegian sea": "Norskehavet", "Barents sea": "Barentshavet" };
  const STATUS = { "Producing": "I produksjon", "Shut down": "Nedstengt", "Approved for production": "Godkjent", "Shut Down": "Nedstengt" };
  const F = d.fields.map((f) => {
    const at = (y) => (y >= f.y0 && y - f.y0 < f.oe.length ? f.oe[y - f.y0] : 0);
    const cumTo = [];
    let c = 0;
    allYears.forEach((y) => { c += at(y); cumTo.push(c); });
    return { ...f, at, cumTo, cum: c, area: AREA[f.area] || f.area || "–", status: STATUS[f.status] || f.status || "–" };
  });
  const byName = (n) => F.find((f) => f.name === n);
  const fm = (v) => S.nf0.format(v);
  const fm1 = (v) => S.nf1.format(v);
  const mrd = (v) => fm1(v / 1000);
  const maxBy = (arr, fn) => arr.reduce((a, b) => (fn(b) > fn(a) ? b : a));
  const peakY = (k) => maxBy(years, (y) => tot(k, y));
  const prodCount = (y) => F.filter((f) => f.at(y) > 0).length;
  const cumAll = d3.sum(years, (y) => tot("oe", y));
  const remAll = d3.sum(F, (f) => f.rem || 0);
  const pk = peakY("oe");

  // ---------------------------------------------------------------- nøkkeltall
  document.getElementById("kpis").innerHTML = [
    ["Produsert i alt", `${mrd(cumAll)} mrd. Sm³`, `oljeekvivalenter ${years[0]}–${lastFull}, ≈ ${fm(cumAll * FAT / 1000)} mrd. fat`],
    ["Toppåret", String(pk), `${fm(tot("oe", pk))} mill. Sm³ o.e., ≈ ${fm1(tot("oe", pk) * FAT / 365)} mill. fat per dag`],
    [`Produksjon ${lastFull}`, `${fm(tot("oe", lastFull))} mill. Sm³`, `${fm(100 * tot("oe", lastFull) / tot("oe", pk))} % av toppåret, fra ${prodCount(lastFull)} felt`],
    ["Gjenstående reserver", `${mrd(remAll)} mrd. Sm³`, `i felt, ≈ ${fm(remAll / tot("oe", lastFull))} år med dagens produksjon`],
  ].map(([l, v, s]) => `<div class="card kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("");

  // ---------------------------------------------------------------- fortellingen
  const ek = byName("Ekofisk"), sf = byName("Statfjord"), gf = byName("Gullfaks"), os = byName("Oseberg");
  const tr = byName("Troll"), ag = byName("Åsgard"), js = byName("Johan Sverdrup");
  // Fast farge per felt – fargen følger feltet gjennom hele fortellingen.
  const FCOL = new Map([[ek, 1], [sf, 2], [gf, 3], [os, 4], [tr, 7], [ag, 5], [js, 6]].filter(([f]) => f).map(([f, i]) => [f.id, `var(--series-${i})`]));
  const gasShare = (y) => 100 * tot("gas", y) / tot("oe", y);
  const avgPer = (y) => tot("oe", y) / prodCount(y);
  const oilPk = peakY("oil"), gasPk = peakY("gas");
  const PROD = [["oil", "Olje"], ["gas", "Gass"], ["ngl", "NGL"], ["cond", "Kondensat"]];
  const PCOL = { oil: "var(--series-1)", gas: "var(--series-2)", ngl: "var(--series-3)", cond: "var(--series-4)" };
  const sumK = (k) => d3.sum(years, (y) => tot(k, y));
  const b = (s) => `<b>${s}</b>`;
  const ifF = (f, s) => (f ? s : "");

  const STEPS = [
    { to: Math.min(lastFull, (ek ? ek.start : years[0]) + 7), hl: [ek], yr: ek ? String(ek.start) : "",
      h: "Det begynte med Ekofisk",
      p: [ifF(ek, `Ekofisk ble funnet i ${ek.disc} og startet produksjonen i ${ek.start}. I nesten ti år var det i praksis ett felt som sto for all produksjon på norsk sokkel.`),
        ifF(ek, `Feltet produserer fortsatt, og har til nå gitt ${b(fm(ek.cum) + " mill. Sm³ o.e.")}`)] },
    { to: Math.min(lastFull, 1992), hl: [ek, sf, gf, os], yr: "1979–1990",
      h: "Gigantene",
      p: [`Så kom de store feltene i den nordlige Nordsjøen: ${[sf, gf, os].filter(Boolean).map((f) => `${f.name} (${f.start})`).join(", ")}.`,
        `Produksjonen økte fra ${b(fm(tot("oe", 1980)) + " mill. Sm³")} i 1980 til ${b(fm(tot("oe", 1990)) + " mill. Sm³")} i 1990.`] },
    { to: Math.min(lastFull, 2003), hl: [sf, gf, os, tr, ag], yr: "1990-tallet",
      h: "Gassen kommer",
      p: [ifF(tr, `Troll er det største feltet på sokkelen målt i samlet produksjon, med ${b(fm(tr.cum) + " mill. Sm³ o.e.")} – det meste gass.`) + ifF(ag, ` Åsgard i Norskehavet startet i ${ag.start}.`),
        `Gassens andel av produksjonen økte fra ${b(fm(gasShare(1990)) + " %")} i 1990 til ${b(fm(gasShare(2003)) + " %")} i 2003.`] },
    { to: pk, hl: [], peak: true, yr: String(pk),
      h: "Toppen",
      p: [`I ${pk} nådde produksjonen toppen med ${b(fm(tot("oe", pk)) + " mill. Sm³ o.e.")} – rundt ${fm1(tot("oe", pk) * FAT / 365)} millioner fat per dag.`,
        `Oljeproduksjonen alene toppet seg allerede i ${oilPk}, med ${fm(tot("oil", oilPk))} mill. Sm³. Etter det falt oljen, mens gassen holdt totalen oppe.`] },
    { to: Math.min(lastFull, 2018), decade: true, yr: "2000–2018",
      h: "Mange og mindre felt",
      p: [`Antall felt i produksjon økte fra ${b(prodCount(2000))} i 2000 til ${b(prodCount(Math.min(lastFull, 2018)))} i ${Math.min(lastFull, 2018)}. Men de nye feltene var mindre: snittproduksjonen per felt falt fra ${fm1(avgPer(1990))} mill. Sm³ i 1990 til ${fm1(avgPer(Math.min(lastFull, 2018)))} mill. Sm³.`,
        "Lagene er farget etter tiåret feltet startet. Jo sterkere farge, jo nyere felt."] },
    { to: lastFull, hl: [tr, js], yr: js ? String(js.start) : "",
      h: "Johan Sverdrup",
      p: [ifF(js, `Johan Sverdrup ble funnet i ${js.disc} og startet i ${js.start}. I ${lastFull} sto feltet for ${b(fm(100 * js.at(lastFull) / tot("oe", lastFull)) + " %")} av all produksjon på sokkelen.`),
        ifF(js, `Sokkeldirektoratet anslår at det gjenstår ${fm(js.rem)} mill. Sm³ o.e. i feltet – mer enn det som er produsert så langt.`)] },
    { to: lastFull, products: true, yr: `${years[0]}–${lastFull}`,
      h: "Hva kom opp?",
      p: [`Til sammen ${b(mrd(cumAll) + " milliarder Sm³ oljeekvivalenter")}: ${PROD.map(([k, n]) => `${k === "ngl" ? n : n.toLowerCase()} ${fm(100 * sumK(k) / cumAll)} %`).join(", ")}.`,
        `Gassproduksjonen nådde toppen så sent som i ${gasPk}, og i ${lastFull} var ${b(fm(gasShare(lastFull)) + " %")} av produksjonen gass.`] },
  ];
  document.getElementById("steps").innerHTML = STEPS.map((s, i) =>
    `<div class="step" data-i="${i}"><div class="card"><div class="yr">${s.yr}</div><h2>${s.h}</h2>${s.p.filter(Boolean).map((t) => `<p>${t}</p>`).join("")}</div></div>`).join("");

  // Felt stables etter oppstartsår: eldste nederst.
  const order = F.slice().sort((a, c) => a.y0 - c.y0 || c.cum - a.cum);
  const rowsF = years.map((y) => { const r = { y }; order.forEach((f) => (r[f.id] = f.at(y))); return r; });
  const rowsP = years.map((y) => { const r = { y }; PROD.forEach(([k]) => (r[k] = tot(k, y))); return r; });
  const stackF = d3.stack().keys(order.map((f) => f.id))(rowsF);
  const stackP = d3.stack().keys(PROD.map(([k]) => k))(rowsP);
  const decades = [...new Set(order.map((f) => Math.floor(f.y0 / 10) * 10))];

  let cur = 0, story = null;
  function decadeColor() {
    const cs = getComputedStyle(document.documentElement);
    const lo = cs.getPropertyValue("--accent-soft").trim(), hi = cs.getPropertyValue("--accent").trim();
    // Sekvensiell skala i én farge: lyst for de eldste feltene, mørkere enn aksentfargen for de nyeste.
    const dark = document.documentElement.getAttribute("data-theme") === "dark" || (!document.documentElement.getAttribute("data-theme") && S.isDark());
    const end = dark ? d3.color(hi).brighter(0.9) : d3.color(hi).darker(0.9);
    const ip = d3.interpolateLab(lo, end);
    return (dec) => ip(0.22 + 0.78 * decades.indexOf(dec) / Math.max(1, decades.length - 1));
  }

  function drawStory() {
    const el = document.getElementById("story-chart");
    el.innerHTML = "";
    const w = el.clientWidth || 700;
    const h = Math.max(260, Math.min(520, window.innerHeight * (w < 600 ? 0.34 : 0.55)));
    const m = { t: 18, r: 14, b: 26, l: 44 };
    const x = d3.scaleLinear([years[0], lastFull], [m.l, w - m.r]);
    const y = d3.scaleLinear([0, d3.max(years, (yy) => tot("oe", yy)) * 1.08], [h - m.b, m.t]).nice();
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("role", "img")
      .attr("aria-label", "Stablet arealdiagram over produksjon per felt per år");
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => fm(v)).tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(Math.min(10, w / 70)).tickFormat(d3.format("d")).tickSizeOuter(0));
    const clipId = "story-clip";
    const clip = svg.append("clipPath").attr("id", clipId).append("rect").attr("x", m.l).attr("y", 0).attr("height", h).attr("width", 0);
    const area = d3.area().x((p) => x(p.data.y)).y0((p) => y(p[0])).y1((p) => y(p[1])).curve(d3.curveMonotoneX);
    const g = svg.append("g").attr("clip-path", `url(#${clipId})`);
    const gF = g.append("g");
    const layersF = gF.selectAll("path").data(stackF).join("path").attr("class", "layer").attr("d", area)
      .attr("stroke", "var(--surface)").attr("stroke-width", 0.5);
    const gP = g.append("g").style("opacity", 0);
    const layersP = gP.selectAll("path").data(stackP).join("path").attr("class", "layer").attr("d", area)
      .attr("fill", (s) => PCOL[s.key]).attr("stroke", "var(--surface)").attr("stroke-width", 2);
    const labels = g.append("g");
    const ann = svg.append("g").attr("class", "peak");
    const cross = svg.append("line").attr("class", "cross").attr("y1", m.t).attr("y2", h - m.b).style("opacity", 0);
    const fById = new Map(F.map((f) => [f.id, f]));
    story = { svg, x, y, m, w, h, clip, layersF, layersP, gF, gP, labels, ann, cross, fById };

    svg.on("pointermove", (ev) => {
      const s = STEPS[cur];
      const [px, py] = d3.pointer(ev);
      const yr = Math.round(x.invert(px));
      if (yr < years[0] || yr > s.to) { tip.hide(); cross.style("opacity", 0); return; }
      cross.attr("x1", x(yr)).attr("x2", x(yr)).style("opacity", 1);
      const i = yr - years[0], v = y.invert(py);
      let html = `<div class="tt-title">${yr}</div>`;
      if (s.products) {
        html += PROD.map(([k, n]) => `<div class="tt-row"><span><span class="key" style="background:${PCOL[k]}"></span>${n}</span><b>${fm1(tot(k, yr))}</b></div>`).join("");
      } else {
        const hit = stackF.find((ly) => ly[i][0] <= v && v < ly[i][1]);
        if (hit) { const f = fById.get(+hit.key); html += `<div class="tt-row"><span>${S.escapeHtml(f.name)} <small>(fra ${f.start})</small></span><b>${fm1(f.at(yr))}</b></div>`; }
      }
      html += `<div class="tt-row"><span>Hele sokkelen</span><b>${fm1(tot("oe", yr))}</b></div><div class="tt-row"><span>Mill. Sm³ o.e.</span><span>${prodCount(yr)} felt</span></div>`;
      tip.show(html, ev.clientX, ev.clientY);
    }).on("pointerleave", () => { tip.hide(); cross.style("opacity", 0); });
    applyStep(cur, false);
  }

  function applyStep(i, animate = true) {
    cur = i;
    const s = STEPS[i], st = story;
    if (!st) return;
    const dur = animate ? 800 : 0;
    st.clip.transition().duration(dur).attr("width", Math.max(0, st.x(s.to) - st.m.l + 1));
    const hl = new Set((s.hl || []).filter(Boolean).map((f) => f.id));
    const dc = decadeColor();
    st.layersF.transition().duration(animate ? 500 : 0)
      .attr("fill", (ly) => { const f = st.fById.get(+ly.key); if (s.decade) return dc(Math.floor(f.y0 / 10) * 10); return hl.has(f.id) ? FCOL.get(f.id) || "var(--accent)" : "var(--neutral-mark)"; })
      .attr("fill-opacity", (ly) => (s.decade || hl.has(+ly.key) ? 1 : 0.55));
    st.gF.transition().duration(dur).style("opacity", s.products ? 0 : 1);
    st.gP.transition().duration(dur).style("opacity", s.products ? 1 : 0);

    // Navn på de fremhevede feltene, der laget er tykt nok.
    st.labels.selectAll("*").remove();
    if (!s.products && !s.decade) {
      stackF.filter((ly) => hl.has(+ly.key)).forEach((ly) => {
        const f = st.fById.get(+ly.key);
        const cand = years.filter((yy) => yy <= s.to);
        const best = maxBy(cand, (yy) => f.at(yy));
        const p = ly[best - years[0]];
        if (st.y(p[0]) - st.y(p[1]) < 13) return;
        const lx = Math.min(Math.max(st.x(best), st.m.l + 40), st.x(s.to) - 40);
        st.labels.append("text").attr("class", "flabel").attr("x", lx).attr("y", (st.y(p[0]) + st.y(p[1])) / 2 + 4).attr("text-anchor", "middle").text(f.name);
      });
    }
    if (s.products) {
      stackP.forEach((ly) => {
        const p = ly[iy(pk)];
        if (st.y(p[0]) - st.y(p[1]) < 16) return;
        st.labels.append("text").attr("class", "flabel").attr("x", st.x(pk)).attr("y", (st.y(p[0]) + st.y(p[1])) / 2 + 4).attr("text-anchor", "middle").text(PROD.find(([k]) => k === ly.key)[1]);
      });
    }
    st.ann.selectAll("*").remove();
    if (s.peak) {
      const px = st.x(pk), py = st.y(tot("oe", pk));
      st.ann.append("line").attr("x1", px).attr("x2", px).attr("y1", py - 4).attr("y2", py - 22);
      st.ann.append("text").attr("x", px).attr("y", py - 27).attr("text-anchor", "end").attr("dx", 6).text(`Toppen: ${fm(tot("oe", pk))} mill. Sm³ i ${pk}`);
    }
    // Legende og tall over grafen
    const lg = document.getElementById("story-legend");
    if (s.products) lg.innerHTML = PROD.map(([k, n]) => `<span class="item"><span class="sw" style="background:${PCOL[k]}"></span>${n}</span>`).join("");
    else if (s.decade) lg.innerHTML = decades.map((dd) => `<span class="item"><span class="sw" style="background:${dc(dd)}"></span>${dd}-tallet</span>`).join("");
    else lg.innerHTML = [...(s.hl || []).filter(Boolean).map((f) => `<span class="item"><span class="sw" style="background:${FCOL.get(f.id)}"></span>${S.escapeHtml(f.name)}</span>`),
      `<span class="item"><span class="sw" style="background:var(--neutral-mark);opacity:.55"></span>${s.hl && s.hl.length ? "Andre felt" : "Hvert lag er ett felt"}</span>`].join("");
    document.getElementById("stage-now").innerHTML = s.products
      ? `${mrd(cumAll)}<small>mrd. Sm³ o.e. i alt</small>`
      : `${s.to}<small>${fm(tot("oe", s.to))} mill. Sm³ o.e.</small>`;
    document.querySelectorAll(".step").forEach((el) => el.classList.toggle("is-active", +el.dataset.i === i));
  }

  const io = new IntersectionObserver((ents) => {
    ents.forEach((e) => { if (e.isIntersecting) { const i = +e.target.dataset.i; if (i !== cur) applyStep(i); } });
  }, { rootMargin: window.matchMedia("(max-width: 1000px)").matches ? "-72% 0px -8% 0px" : "-45% 0px -45% 0px" });
  document.querySelectorAll(".step").forEach((el) => io.observe(el));

  // ---------------------------------------------------------------- kartet
  const land = topojson.feature(topo, topo.objects.land);
  const yrInput = document.getElementById("year");
  const mapYears = allYears;
  yrInput.min = mapYears[0]; yrInput.max = mapYears[mapYears.length - 1]; yrInput.value = yrInput.max;
  let mapYear = +yrInput.value, map = null;
  const located = F.filter((f) => f.lon != null && f.lat != null);
  const yLabel = (yy) => (P && yy === P.year ? `${yy}<small style="font-size:12px;color:var(--text-3)"> jan–${S.MONTHS_SHORT[P.months - 1]}</small>` : String(yy));

  function drawMap() {
    const el = document.getElementById("map");
    el.innerHTML = "";
    const w = el.clientWidth || 700, h = Math.round(Math.min(w * 1.25, Math.max(420, window.innerHeight * 0.8)));
    const box = { type: "MultiPoint", coordinates: [[0.5, 55.6], [26, 72.6], [0.5, 72.6], [26, 55.6]] };
    const proj = d3.geoConicConformal().parallels([58, 70]).rotate([-12, 0]).fitExtent([[12, 12], [w - 12, h - 12]], box);
    const path = d3.geoPath(proj);
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("role", "img").attr("aria-label", "Kart over felt på norsk sokkel");
    svg.append("clipPath").attr("id", "map-clip").append("rect").attr("width", w).attr("height", h).attr("rx", 9);
    const g = svg.append("g").attr("clip-path", "url(#map-clip)");
    g.append("path").datum(land).attr("class", "land").attr("d", path);
    [["Nordsjøen", 4.6, 57.3], ["Norskehavet", 2.5, 67.6], ["Barentshavet", 17, 72.9]].forEach(([n, lo, la]) => {
      const [px, py] = proj([lo, la]);
      if (px > 0 && px < w && py > 12 && py < h) g.append("text").attr("class", "sealabel").attr("x", px).attr("y", py).text(n);
    });
    const r = d3.scaleSqrt([0, d3.max(located, (f) => f.cum)], [0, Math.max(12, Math.min(w, h) / 22)]);
    const dots = g.append("g").selectAll("circle").data(located).join("circle").attr("class", "fld")
      .attr("cx", (f) => proj([f.lon, f.lat])[0]).attr("cy", (f) => proj([f.lon, f.lat])[1]).attr("r", 0);
    const lab = g.append("g");
    dots.on("pointermove", (ev, f) => {
      const i = iy(mapYear);
      tip.show(`<div class="tt-title">${S.escapeHtml(f.name)}</div>
        <div class="tt-row"><span>${f.area}</span><span>${f.status}</span></div>
        <div class="tt-row"><span>Funnet / startet</span><b>${f.disc || "–"} / ${f.start}</b></div>
        <div class="tt-row"><span>Produksjon ${mapYear}</span><b>${fm1(f.at(mapYear))}</b></div>
        <div class="tt-row"><span>Produsert t.o.m. ${mapYear}</span><b>${fm(f.cumTo[i])}</b></div>
        <div class="tt-row"><span>Gjenstående (anslag)</span><b>${f.rem != null ? fm(f.rem) : "–"}</b></div>
        <div class="tt-row"><span></span><span>mill. Sm³ o.e.</span></div>`, ev.clientX, ev.clientY);
    }).on("pointerleave", () => tip.hide());
    map = { dots, lab, r, proj };
    updateMap(false);
  }

  function updateMap(animate = true) {
    if (!map) return;
    const i = iy(mapYear);
    document.getElementById("map-year").innerHTML = yLabel(mapYear);
    map.dots.sort((a, c) => c.cumTo[i] - a.cumTo[i])
      .attr("fill", (f) => (f.at(mapYear) > 0 ? "var(--series-1)" : "none"))
      .attr("fill-opacity", 0.6)
      .attr("stroke", (f) => (f.at(mapYear) > 0 ? "var(--surface)" : "var(--text-3)"))
      .attr("stroke-width", (f) => (f.at(mapYear) > 0 ? 1.5 : 1))
      .style("display", (f) => (f.cumTo[i] > 0 ? null : "none"))
      .transition().duration(animate ? 300 : 0).attr("r", (f) => (f.cumTo[i] > 0 ? Math.max(2.5, map.r(f.cumTo[i])) : 0));
    map.lab.selectAll("*").remove();
    // Navn på de største feltene, men bare der navnet ikke kolliderer med et annet.
    const boxes = [];
    located.filter((f) => f.cumTo[i] > 0).sort((a, c) => c.cumTo[i] - a.cumTo[i]).slice(0, 10).forEach((f) => {
      const [px, py] = map.proj([f.lon, f.lat]), rr = map.r(f.cumTo[i]);
      if (rr < 6) return;
      const bw = f.name.length * 6.6, b = [px + rr + 3, py - 8, px + rr + 3 + bw, py + 6];
      if (boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) return;
      boxes.push(b);
      map.lab.append("text").attr("class", "mlabel").attr("x", b[0]).attr("y", py + 4).text(f.name);
    });
    const prod = F.filter((f) => f.at(mapYear) > 0).sort((a, c) => c.at(mapYear) - a.at(mapYear));
    const yt = tot("oe", mapYear), part = P && mapYear === P.year;
    document.getElementById("map-side").innerHTML = `
      <div class="stat"><div class="l">Felt i produksjon</div><div class="v">${prod.length}</div><div class="s">${F.filter((f) => f.cumTo[i] > 0).length - prod.length} felt er stengt ned</div></div>
      <div class="stat"><div class="l">Produksjon ${part ? "hittil i år" : "i året"}</div><div class="v">${fm(yt)}</div><div class="s">mill. Sm³ o.e.${part ? `, januar–${S.MONTHS[P.months - 1]}` : ""}</div></div>
      <div class="stat"><div class="l">Produsert til og med ${mapYear}</div><div class="v">${mrd(d3.sum(F, (f) => f.cumTo[i]))}</div><div class="s">mrd. Sm³ o.e.</div></div>
      <div class="stat"><div class="l">Største felt i ${mapYear}</div><ol>${prod.slice(0, 5).map((f) => `<li><b>${S.escapeHtml(f.name)}</b> ${fm1(f.at(mapYear))} (${fm(100 * f.at(mapYear) / yt)} %)</li>`).join("")}</ol></div>`;
  }
  yrInput.addEventListener("input", () => { stop(); mapYear = +yrInput.value; updateMap(); });
  let timer = null;
  const playBtn = document.getElementById("play");
  function setPlayUi(on) {
    playBtn.querySelector("span").textContent = on ? "Pause" : "Spill av";
    playBtn.setAttribute("aria-label", on ? "Pause" : "Spill av");
    playBtn.querySelector("svg").innerHTML = on ? '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>' : '<path d="M7 5v14l12-7z"/>';
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; setPlayUi(false); } }
  playBtn.addEventListener("click", () => {
    if (timer) return stop();
    if (mapYear >= +yrInput.max) mapYear = +yrInput.min;
    setPlayUi(true);
    const tick = () => {
      yrInput.value = mapYear; updateMap();
      if (mapYear >= +yrInput.max) return stop();
      mapYear++;
    };
    tick();
    timer = setInterval(tick, 380);
  });

  // ---------------------------------------------------------------- hvor mye er igjen
  function drawBars() {
    const el = document.getElementById("bars");
    el.innerHTML = "";
    const rows = F.filter((f) => f.rec > 0).sort((a, c) => c.rec - a.rec).slice(0, 20)
      .map((f) => ({ f, sold: Math.max(0, f.rec - f.rem), rem: f.rem }));
    const w = el.clientWidth || 800, small = w < 560;
    const m = { t: 6, r: small ? 74 : 110, b: 26, l: small ? 104 : 130 };
    const bh = 26, h = m.t + m.b + rows.length * bh;
    const x = d3.scaleLinear([0, d3.max(rows, (r) => r.f.rec)], [m.l, w - m.r]).nice();
    const yb = d3.scaleBand(rows.map((r) => r.f.id), [m.t, h - m.b]).padding(0.28);
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    svg.append("g").attr("class", "grid").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(small ? 4 : 7).tickSize(-(h - m.t - m.b)).tickFormat(""));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(small ? 4 : 7).tickFormat((v) => fm(v)).tickSizeOuter(0));
    const gap = 2;
    rows.forEach((r) => {
      const yy = yb(r.f.id), bw = Math.min(yb.bandwidth(), 24);
      const x1 = x(r.sold), x2 = x(r.f.rec);
      svg.append("rect").attr("x", m.l).attr("y", yy).attr("height", bw).attr("width", Math.max(0, x1 - m.l - (r.rem > 0 ? gap / 2 : 0))).attr("fill", "var(--series-1)");
      if (r.rem > 0) svg.append("rect").attr("x", x1 + gap / 2).attr("y", yy).attr("height", bw).attr("width", Math.max(0, x2 - x1 - gap / 2)).attr("rx", 3).attr("fill", "var(--series-2)");
      svg.append("text").attr("class", "blabel").attr("x", m.l - 8).attr("y", yy + bw / 2 + 4).attr("text-anchor", "end").text(r.f.name);
      svg.append("text").attr("class", "bval").attr("x", x2 + 6).attr("y", yy + bw / 2 + 4).text(`${fm(100 * r.rem / r.f.rec)} % igjen`);
      svg.append("rect").attr("class", "hit").attr("x", 0).attr("y", yy - 3).attr("width", w).attr("height", bw + 6)
        .on("pointermove", (ev) => tip.show(`<div class="tt-title">${S.escapeHtml(r.f.name)}</div>
          <div class="tt-row"><span><span class="key" style="background:var(--series-1)"></span>Solgt og levert</span><b>${fm(r.sold)}</b></div>
          <div class="tt-row"><span><span class="key" style="background:var(--series-2)"></span>Gjenstående</span><b>${fm(r.rem)}</b></div>
          <div class="tt-row"><span>Opprinnelig utvinnbart</span><b>${fm(r.f.rec)}</b></div>
          <div class="tt-row"><span></span><span>mill. Sm³ o.e.</span></div>`, ev.clientX, ev.clientY))
        .on("pointerleave", () => tip.hide());
    });
    document.getElementById("bars-legend").innerHTML = `<span class="item"><span class="sw" style="background:var(--series-1)"></span>Solgt og levert</span><span class="item"><span class="sw" style="background:var(--series-2)"></span>Gjenstående reserver</span><span class="item" style="color:var(--text-3)">mill. Sm³ o.e.</span>`;
  }

  // ---------------------------------------------------------------- antall felt og snitt
  function drawSmall(id, val, fmt, kind) {
    const el = document.getElementById(id);
    el.innerHTML = "";
    const w = el.clientWidth || 500, h = 240, m = { t: 12, r: 12, b: 26, l: 40 };
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const y = d3.scaleLinear([0, d3.max(years, val) * 1.1], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => fm(v)).tickPadding(6));
    let xs;
    if (kind === "bar") {
      const x = d3.scaleBand(years, [m.l, w - m.r]).padding(0.2);
      xs = (yy) => x(yy) + x.bandwidth() / 2;
      svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickValues(years.filter((yy) => yy % 10 === 0)).tickSizeOuter(0));
      svg.append("g").selectAll("rect").data(years).join("rect").attr("x", (yy) => x(yy)).attr("width", x.bandwidth())
        .attr("y", (yy) => y(val(yy))).attr("height", (yy) => y(0) - y(val(yy))).attr("rx", Math.min(2, x.bandwidth() / 3)).attr("fill", "var(--series-1)");
    } else {
      const x = d3.scaleLinear([years[0], lastFull], [m.l, w - m.r]);
      xs = x;
      svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("d")).tickSizeOuter(0));
      svg.append("path").datum(years).attr("fill", "none").attr("stroke", "var(--series-1)").attr("stroke-width", 2).attr("stroke-linejoin", "round")
        .attr("d", d3.line().x((yy) => x(yy)).y((yy) => y(val(yy))));
    }
    const hl = svg.append("line").attr("class", "cross").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--text-3)").style("opacity", 0);
    svg.append("rect").attr("class", "hit").attr("x", m.l).attr("y", m.t).attr("width", w - m.l - m.r).attr("height", h - m.t - m.b)
      .on("pointermove", (ev) => {
        const px = d3.pointer(ev)[0];
        const yy = years.reduce((a, c) => (Math.abs(xs(c) - px) < Math.abs(xs(a) - px) ? c : a));
        hl.attr("x1", xs(yy)).attr("x2", xs(yy)).style("opacity", 1);
        tip.show(`<div class="tt-title">${yy}</div><div class="tt-row"><span>${fmt[0]}</span><b>${fmt[1](val(yy))}</b></div>`, ev.clientX, ev.clientY);
      }).on("pointerleave", () => { tip.hide(); hl.style("opacity", 0); });
  }

  // ---------------------------------------------------------------- tabell
  const tRows = F.map((f) => ({ id: f.id, name: f.name, area: f.area, disc: f.disc, start: f.start, status: f.status, cum: f.cum, rem: f.rem, share: 100 * f.cum / d3.sum(F, (g) => g.cum) }));
  S.sortableTable(document.getElementById("table"), [
    { key: "name", label: "Felt", text: true },
    { key: "area", label: "Område", text: true },
    { key: "disc", label: "Funnet", fmt: (v) => v || "–" },
    { key: "start", label: "Første produksjon", fmt: (v) => v },
    { key: "status", label: "Status", text: true },
    { key: "cum", label: "Produsert, mill. Sm³ o.e.", fmt: (v) => fm1(v) },
    { key: "rem", label: "Gjenstående, mill. Sm³ o.e.", fmt: (v) => (v == null ? "–" : fm1(v)) },
    { key: "share", label: "Andel av alt produsert", fmt: (v) => S.pct(v) },
  ], tRows, { sortKey: "cum", dir: -1 });
  document.getElementById("tbl-sub").textContent = `${F.length} felt som har produsert, ${years[0]}–${P ? `${P.year} (januar–${S.MONTHS[P.months - 1]})` : lastFull}. Klikk på en kolonne for å sortere.`;
  document.getElementById("csv").addEventListener("click", () => S.downloadCsv("sokkel-felt.csv", [
    ["Felt", "Område", "Funnet", "Første produksjon", "Status", "Produsert (mill. Sm3 o.e.)", "Gjenstående (mill. Sm3 o.e.)", ...allYears.map(String)],
    ...F.map((f) => [f.name, f.area, f.disc, f.start, f.status, f.cum.toFixed(3).replace(".", ","), f.rem == null ? "" : f.rem.toFixed(3).replace(".", ","), ...allYears.map((yy) => f.at(yy).toFixed(3).replace(".", ","))]),
  ]));
  document.getElementById("updated").textContent = "Data hentet fra Sokkeldirektoratet " + new Date(d.updated).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" });

  function all() {
    drawStory(); drawMap(); drawBars();
    drawSmall("c-count", prodCount, ["Felt i produksjon", fm], "bar");
    drawSmall("c-avg", avgPer, ["Snitt per felt, mill. Sm³ o.e.", fm1], "line");
  }
  all();
  // Bare ny bredde gir ny tegning; på mobil endres høyden når adresselinjen skjules.
  let rt, lastW = window.innerWidth;
  window.addEventListener("resize", () => { if (window.innerWidth === lastW) return; lastW = window.innerWidth; clearTimeout(rt); rt = setTimeout(all, 200); });
  S.onThemeChange(() => applyStep(cur, false));
})();
