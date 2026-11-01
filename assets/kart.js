/* Studie 1 – Skattekartet */
(async function () {
  const S = window.Skatt;
  const tip = S.tooltip();

  const [data, topo] = await Promise.all([
    fetch("data/skatt-regioner.json").then((r) => r.json()),
    fetch("data/norge-2024.topo.json").then((r) => r.json()),
  ]);

  // ------------------------------------------------------------------ data
  const YEARS = data.years;
  const LAST = YEARS.length - 1;
  const partial = data.partial; // {year, month} eller null
  const ART_INDEX = Object.fromEntries(data.arts.map((a, i) => [a.code, i]));
  const SHORT = {
    "00": "Skatteinngang i alt",
    "06": "Skatt til kommunen",
    "07": "Skatt til fylkeskommunen",
    "08": "Trygdeavgift",
    "09": "Arbeidsgiveravgift",
    "10": "Fellesskatt",
    "11": "Statsskatt på formue og inntekt",
    "12": "Særskatt på petroleum",
    "13": "Ordinær skatt på petroleum",
    "14": "Svalbardskatt",
  };
  const DESC = {
    "06": "Inntekts- og formuesskatt til primærkommunen",
    "07": "Inntektsskatt til fylkeskommunen",
    "08": "Medlemsavgift til folketrygden",
    "09": "Arbeidsgiveravgift til folketrygden",
    "10": "Fellesskatt til staten (inkl. selskapsskatt)",
    "11": "Trinnskatt, formuesskatt til staten m.m.",
    "12": "Særskatt på utvinning av petroleum",
    "13": "Ordinær skatt på utvinning av petroleum",
    "14": "Skatt fra Svalbard",
  };
  const PRESETS = [
    { id: "all", label: "I alt", arts: ["00"] },
    { id: "inc", label: "Inntekt og formue", arts: ["06", "07", "10", "11"] },
    { id: "kom", label: "Kommune + fylke", arts: ["06", "07"] },
    { id: "avg", label: "Trygd + arbeidsgiver", arts: ["08", "09"] },
  ];
  const SUB_ARTS = data.arts.map((a) => a.code).filter((c) => c !== "00");

  const kommuner = data.kommuner;
  const fylker = data.fylker;
  const fylkeName = (f) => (fylker[f] ? fylker[f].name : f);

  const kommunerIFylke = {};
  for (const [id, r] of Object.entries(kommuner)) (kommunerIFylke[r.f] ||= {})[id] = r;
  function regionsFor(level) {
    if (level === "f") return fylker;
    return state.fy && kommunerIFylke[state.fy] ? kommunerIFylke[state.fy] : kommuner;
  }
  function nationalRank(id) {
    const v = metric(kommuner[id]);
    if (v == null) return null;
    let rank = 1, n = 0;
    for (const r of Object.values(kommuner)) { const x = metric(r); if (x == null) continue; n++; if (x > v) rank++; }
    return { rank, n };
  }

  // ------------------------------------------------------------------ state
  const state = { yi: LAST - (partial ? 1 : 0), level: "k", metric: "pc", arts: ["00"], sel: null, fy: null };
  readHash();

  function artValue(r, yi) {
    if (state.arts.includes("00")) return r.v[ART_INDEX["00"]][yi];
    let s = 0;
    for (const a of state.arts) s += r.v[ART_INDEX[a]][yi] || 0;
    return s;
  }
  function artValueYtdPrev(r) {
    if (!r.ytdPrev) return null;
    if (state.arts.includes("00")) return r.ytdPrev[ART_INDEX["00"]];
    let s = 0;
    for (const a of state.arts) s += r.ytdPrev[ART_INDEX[a]] || 0;
    return s;
  }
  function prevValue(r, yi) {
    if (partial && yi === LAST) return artValueYtdPrev(r);
    if (yi === 0) return null;
    return artValue(r, yi - 1);
  }
  function change(r, yi) {
    const p = prevValue(r, yi), c = artValue(r, yi);
    if (p == null || c == null || p <= 0.05) return null;
    return (c / p - 1) * 100;
  }
  function perCap(r, yi) {
    const v = artValue(r, yi), p = r.pop[yi];
    return v == null || !p ? null : (v * 1e6) / p;
  }
  function metric(r, yi = state.yi, m = state.metric) {
    if (m === "tot") return artValue(r, yi);
    if (m === "pc") return perCap(r, yi);
    return change(r, yi);
  }
  function fmtMetric(v, m = state.metric) {
    if (v == null) return "Ingen data";
    if (m === "tot") return S.mill(v);
    if (m === "pc") return S.kr(Math.round(v));
    return S.pct(v, 1, true);
  }
  function national(yi = state.yi) {
    let v = 0, p = 0, prev = 0;
    for (const r of Object.values(kommuner)) { v += artValue(r, yi) || 0; p += r.pop[yi] || 0; prev += prevValue(r, yi) || 0; }
    return { v, pop: p, pc: (v * 1e6) / p, chg: prev > 0 ? (v / prev - 1) * 100 : null };
  }
  function artsLabel() {
    if (state.arts.includes("00")) return SHORT["00"];
    const pre = PRESETS.find((p) => sameSet(p.arts, state.arts));
    if (pre) return pre.label;
    if (state.arts.length === 1) return SHORT[state.arts[0]];
    return `${state.arts.length} skattearter`;
  }
  function sameSet(a, b) { return a.length === b.length && a.every((x) => b.includes(x)); }
  function yearLabel(yi) {
    const y = YEARS[yi];
    if (partial && yi === LAST) return `${y} (jan–${S.MONTHS_SHORT[partial.month - 1]})`;
    return String(y);
  }
  function prevLabel(yi) {
    if (partial && yi === LAST) return `jan–${S.MONTHS_SHORT[partial.month - 1]} ${YEARS[yi] - 1}`;
    return String(YEARS[yi] - 1);
  }

  // ------------------------------------------------------------------ hash
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    const y = +h.get("y");
    if (y && YEARS.includes(y)) state.yi = YEARS.indexOf(y);
    if (["k", "f"].includes(h.get("l"))) state.level = h.get("l");
    if (["tot", "pc", "chg"].includes(h.get("m"))) state.metric = h.get("m");
    const a = (h.get("a") || "").split(",").filter((x) => x in ART_INDEX);
    if (a.length) state.arts = a.includes("00") ? ["00"] : a;
    if (h.get("fy") && fylker[h.get("fy")]) state.fy = h.get("fy");
    const r = h.get("r");
    if (r && regionsFor(state.level)[r]) state.sel = r;
  }
  function writeHash() {
    const h = new URLSearchParams({ y: YEARS[state.yi], l: state.level, m: state.metric, a: state.arts.join(",") });
    if (state.fy) h.set("fy", state.fy);
    if (state.sel) h.set("r", state.sel);
    history.replaceState(null, "", "#" + h.toString());
  }

  // ------------------------------------------------------------------ controls
  const yearSel = document.getElementById("year");
  yearSel.innerHTML = YEARS.map((y, i) => `<option value="${i}">${yearLabel(i)}</option>`).reverse().join("");
  yearSel.addEventListener("change", () => { stopPlay(); state.yi = +yearSel.value; update(); });

  function bindSeg(id, key) {
    const el = document.getElementById(id);
    el.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      if (state[key] === b.dataset.v) return;
      state[key] = b.dataset.v;
      if (key === "level") {
        state.sel = null;
        drawLayers();
        if (state.level === "f" && state.fy) { state.sel = state.fy; }
        else if (state.level === "k" && state.fy) zoomTo(featById["f" + state.fy], 0.82);
      }
      update();
    }));
  }
  bindSeg("level", "level");

  // Fylkesfilter
  const fylkeSel = document.getElementById("fylke");
  fylkeSel.innerHTML += Object.entries(fylker).sort((a, b) => a[1].name.localeCompare(b[1].name, "nb"))
    .map(([id, f]) => `<option value="${id}">${S.escapeHtml(f.name)}</option>`).join("");
  fylkeSel.addEventListener("change", () => setFylke(fylkeSel.value || null));
  function setFylke(fy, keepSel = false) {
    stopPlay();
    state.fy = fy;
    if (state.level !== "k") { state.level = "k"; drawLayers(); }
    if (!keepSel || (state.sel && fy && kommuner[state.sel]?.f !== fy)) state.sel = null;
    update();
    if (fy) zoomTo(featById["f" + fy], 0.82);
    else svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity);
  }
  bindSeg("metric", "metric");

  // Skattearter
  const artsBtn = document.getElementById("arts-btn");
  const artsPop = document.getElementById("arts-pop");
  document.getElementById("presets").innerHTML = PRESETS.map((p) => `<button data-p="${p.id}">${p.label}</button>`).join("");
  document.getElementById("art-list").innerHTML = SUB_ARTS.map((c) =>
    `<label><input type="checkbox" value="${c}"><span>${SHORT[c]}<small>${DESC[c]}</small></span></label>`).join("");
  artsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = artsPop.hidden;
    artsPop.hidden = !open;
    artsBtn.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (e) => {
    if (!artsPop.hidden && !artsPop.contains(e.target) && e.target !== artsBtn) { artsPop.hidden = true; artsBtn.setAttribute("aria-expanded", "false"); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !artsPop.hidden) { artsPop.hidden = true; artsBtn.focus(); } });
  artsPop.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", () => {
    state.arts = PRESETS.find((p) => p.id === b.dataset.p).arts.slice();
    update();
  }));
  artsPop.querySelectorAll("input[type=checkbox]").forEach((cb) => cb.addEventListener("change", () => {
    const checked = [...artsPop.querySelectorAll("input:checked")].map((x) => x.value);
    state.arts = checked.length === 0 || checked.length === SUB_ARTS.length ? ["00"] : checked;
    update();
  }));

  // Søk
  const allRegions = [
    ...Object.entries(kommuner).map(([id, r]) => ({ id, level: "k", label: `${r.name} (${fylkeName(r.f)})` })),
    ...Object.entries(fylker).map(([id, r]) => ({ id, level: "f", label: `${r.name} (fylke)` })),
  ];
  document.getElementById("region-list").innerHTML = allRegions.map((r) => `<option value="${S.escapeHtml(r.label)}"></option>`).join("");
  const search = document.getElementById("search");
  search.addEventListener("change", () => {
    const v = search.value.trim().toLowerCase();
    if (!v) return;
    const hit = allRegions.find((r) => r.label.toLowerCase() === v) ||
      allRegions.find((r) => r.label.toLowerCase().startsWith(v)) ||
      allRegions.find((r) => r.label.toLowerCase().includes(v));
    if (!hit) return;
    if (hit.level === "k" && state.fy && kommuner[hit.id].f !== state.fy) state.fy = null;
    if (hit.level !== state.level) { state.level = hit.level; drawLayers(); }
    select(hit.id, true);
    search.value = "";
    search.blur();
  });

  // Avspilling
  const playBtn = document.getElementById("play");
  let timer = null;
  function stopPlay() { if (timer) { clearInterval(timer); timer = null; playBtn.classList.remove("playing"); } }
  playBtn.addEventListener("click", () => {
    if (timer) return stopPlay();
    playBtn.classList.add("playing");
    if (state.yi >= LAST - (partial ? 1 : 0)) state.yi = state.metric === "chg" ? 1 : 0;
    update();
    timer = setInterval(() => {
      if (state.yi >= LAST) return stopPlay();
      state.yi++;
      update();
    }, 1100);
  });

  // ------------------------------------------------------------------ kart
  const svg = d3.select("#map");
  const wrap = document.getElementById("map-wrap");
  const W = 800, H = 1000;
  svg.attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
  const featK = topojson.feature(topo, topo.objects.kommuner).features;
  const featF = topojson.feature(topo, topo.objects.fylker).features;
  const fylkeMesh = topojson.mesh(topo, topo.objects.fylker, (a, b) => a !== b);
  const projection = d3.geoTransverseMercator().rotate([-15, -65]).fitExtent([[30, 70], [W - 30, H - 20]], { type: "FeatureCollection", features: featF });
  const path = d3.geoPath(projection);
  const gRoot = svg.append("g");
  const gRegions = gRoot.append("g");
  const gBorders = gRoot.append("g");
  const gHover = gRoot.append("g");
  const gSel = gRoot.append("g");
  const featById = {};
  featK.forEach((f) => (featById["k" + f.properties.id] = f));
  featF.forEach((f) => (featById["f" + f.properties.id] = f));

  const zoom = d3.zoom().scaleExtent([1, 40]).translateExtent([[-200, -200], [W + 200, H + 200]])
    .on("zoom", (e) => gRoot.attr("transform", e.transform));
  svg.call(zoom).on("dblclick.zoom", null);
  document.getElementById("zoom-in").onclick = () => svg.transition().duration(300).call(zoom.scaleBy, 1.8);
  document.getElementById("zoom-out").onclick = () => svg.transition().duration(300).call(zoom.scaleBy, 1 / 1.8);
  document.getElementById("zoom-reset").onclick = () => svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);

  function zoomTo(feature, fill = 0.5) {
    const [[x0, y0], [x1, y1]] = path.bounds(feature);
    const k = Math.min(10, fill / Math.max((x1 - x0) / W, (y1 - y0) / H));
    const t = d3.zoomIdentity.translate(W / 2, H / 2).scale(Math.max(1, k)).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    svg.transition().duration(750).call(zoom.transform, t);
  }

  let regionSel;
  function drawLayers() {
    const feats = state.level === "f" ? featF : featK;
    regionSel = gRegions.selectAll("path.region").data(feats, (d) => state.level + d.properties.id)
      .join("path").attr("class", "region").attr("d", path)
      .on("mousemove", (e, d) => hover(e, d))
      .on("mouseleave", () => { tip.hide(); gHover.selectAll("*").remove(); })
      .on("click", (e, d) => { e.stopPropagation(); select(d.properties.id === state.sel ? null : d.properties.id); });
    gBorders.selectAll("*").remove();
    if (state.level === "k") gBorders.append("path").attr("class", "fylke-border").attr("d", path(fylkeMesh));
  }
  svg.on("click", () => { if (state.sel) select(null); });

  function hover(e, d) {
    const id = d.properties.id;
    const r = regionsFor(state.level)[id];
    if (!r) return;
    gHover.selectAll("*").remove();
    gHover.append("path").attr("class", "hover-outline").attr("d", path(d));
    const v = metric(r);
    const rk = rankOf(id);
    const sub = state.level === "k" ? `<div class="faint" style="font-size:12px;margin:-2px 0 6px">${S.escapeHtml(fylkeName(r.f))}</div>` : "";
    tip.show(`<div class="tt-title">${S.escapeHtml(r.name)}</div>${sub}
      <div class="tt-row"><span>${metricShort()}</span><b>${fmtMetric(v)}</b></div>
      ${rk ? `<div class="tt-row"><span>Rangering</span><b>${rk.rank} av ${rk.n}</b></div>` : ""}`, e.clientX, e.clientY);
  }
  function metricShort() { return state.metric === "pc" ? "Per innbygger" : state.metric === "tot" ? "Totalt" : `Endring fra ${prevLabel(state.yi)}`; }

  // ------------------------------------------------------------------ farger
  const RAMP_L = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
  const RAMP_D = ["#0d366b", "#104281", "#1c5cab", "#2a78d6", "#5598e7", "#86b6ef", "#b7d3f6"];
  const DIV_L = ["#a52f2f", "#e34948", "#f2a3a2", "#e5e3dd", "#9ec5f4", "#3987e5", "#184f95"];
  const DIV_D = ["#e66767", "#b33b3b", "#6b2e2d", "#3a3a37", "#1c4a80", "#2a78d6", "#86b6ef"];
  const CHG_T = [-15, -5, -1.5, 1.5, 5, 15];

  let scale, values = {}, ranking = [];
  function computeScale() {
    const regs = regionsFor(state.level);
    values = {};
    for (const [id, r] of Object.entries(regs)) values[id] = metric(r);
    const vs = Object.values(values).filter((v) => v != null && isFinite(v));
    ranking = Object.keys(values).filter((id) => values[id] != null).sort((a, b) => values[b] - values[a]);
    const dark = S.isDark();
    if (state.metric === "chg") {
      scale = d3.scaleThreshold(CHG_T, dark ? DIV_D : DIV_L);
    } else {
      const ramp = dark ? RAMP_D : RAMP_L;
      const k = state.level === "f" ? 5 : 7;
      const colors = k === 7 ? ramp : [ramp[0], ramp[2], ramp[3], ramp[5], ramp[6]];
      scale = d3.scaleQuantile(vs, colors);
    }
  }
  function rankOf(id) {
    const i = ranking.indexOf(id);
    return i < 0 ? null : { rank: i + 1, n: ranking.length };
  }
  function isOut(id) { return state.level === "k" && state.fy && kommuner[id]?.f !== state.fy; }
  function colorOf(id) {
    if (isOut(id)) return "var(--map-out)";
    const v = values[id];
    return v == null || !isFinite(v) ? "var(--map-empty)" : scale(v);
  }

  function fmtShort(v) {
    if (state.metric === "tot") return S.mill(v, { short: true });
    if (state.metric === "pc") return v >= 10000 ? S.nf0.format(Math.round(v / 1000)) + "k" : S.nf0.format(Math.round(v));
    return S.pct(v, v % 1 === 0 ? 0 : 1);
  }
  function drawLegend() {
    const el = document.getElementById("legend");
    const unit = state.metric === "pc" ? "kr per innbygger" : state.metric === "tot" ? "Skatteinngang" : `Endring fra ${prevLabel(state.yi)}`;
    let bins = [];
    if (state.metric === "chg") {
      const t = [-Infinity, ...CHG_T, Infinity];
      bins = scale.range().map((c, i) => ({ c, lo: t[i], hi: t[i + 1] }));
      bins = bins.map((b) => ({ ...b, label: !isFinite(b.lo) ? `under ${S.pct(b.hi, 0 + (b.hi % 1 ? 1 : 0))}` : !isFinite(b.hi) ? `over ${S.pct(b.lo, b.lo % 1 ? 1 : 0, true)}` : `${fmtShort(b.lo)} til ${fmtShort(b.hi)}` }));
    } else {
      const q = scale.quantiles();
      const ext = d3.extent(Object.values(values).filter((v) => v != null));
      const t = [ext[0], ...q, ext[1]];
      bins = scale.range().map((c, i) => ({ c, lo: t[i], hi: t[i + 1], label: `${fmtShort(t[i])} – ${fmtShort(t[i + 1])}` }));
    }
    bins.forEach((b) => (b.n = Object.values(values).filter((v) => v != null && (state.metric === "chg" ? scale(v) === b.c : v >= b.lo && v <= b.hi && scale(v) === b.c)).length));
    const empty = Object.values(values).filter((v) => v == null).length;
    el.innerHTML = `<div class="lt">${unit}</div><div class="bins">${bins.slice().reverse().map((b) =>
      `<div class="bin" data-c="${b.c}"><span class="sw" style="background:${b.c}"></span><span>${b.label}</span><span class="n">${b.n}</span></div>`).join("")}
      ${empty ? `<div class="bin"><span class="sw" style="background:var(--map-empty)"></span><span>Ingen data</span><span class="n">${empty}</span></div>` : ""}</div>`;
    el.querySelectorAll(".bin[data-c]").forEach((b) => {
      b.addEventListener("mouseenter", () => regionSel.classed("dim", (d) => colorOf(d.properties.id) !== b.dataset.c));
      b.addEventListener("mouseleave", () => regionSel.classed("dim", false));
    });
  }

  // ------------------------------------------------------------------ valg
  function select(id, zoomIn = false) {
    state.sel = id;
    drawSelection();
    renderPanel();
    writeHash();
    if (id && zoomIn) zoomTo(featById[state.level + id]);
  }
  function drawSelection() {
    gSel.selectAll("*").remove();
    if (!state.sel) return;
    const f = featById[state.level + state.sel];
    if (!f) return;
    gSel.append("path").attr("class", "sel-halo").attr("d", path(f));
    gSel.append("path").attr("class", "sel-outline").attr("d", path(f));
  }

  // ------------------------------------------------------------------ panel
  const panel = document.getElementById("panel");
  function renderPanel() {
    const regs = regionsFor(state.level);
    const yi = state.yi;
    const nat = national(yi);
    if (!state.sel || !regs[state.sel]) return renderOverview(nat);
    const id = state.sel, r = regs[id];
    const v = metric(r), tot = artValue(r, yi), pc = perCap(r, yi), chg = change(r, yi);
    const rk = rankOf(id);
    const isK = state.level === "k";
    const nrk = isK && state.fy ? nationalRank(id) : null;
    const ratio = pc != null && nat.pc ? (pc / nat.pc - 1) * 100 : null;
    const fyl = isK ? fylker[r.f] : null;
    const shareF = isK && fyl ? (artValue(r, yi) / artValue(fyl, yi)) * 100 : null;
    const pop = r.pop[yi];
    const dens = r.area ? pop / r.area : null;

    // Fordeling på skattearter
    const parts = SUB_ARTS.map((c) => ({ c, v: r.v[ART_INDEX[c]][yi] || 0 })).filter((p) => Math.abs(p.v) >= 0.05).sort((a, b) => b.v - a.v);
    const sumParts = parts.reduce((s, p) => s + Math.max(0, p.v), 0);
    const maxPart = d3.max(parts, (p) => p.v) || 1;
    const allOn = state.arts.includes("00");

    panel.innerHTML = `
      <div class="p-head">
        <div>
          <span class="eyebrow">${isK ? "Kommune" : "Fylke"} · ${yearLabel(yi)}</span>
          <h2 class="display">${S.escapeHtml(r.name)}</h2>
          <div class="sub">${isK ? `${S.escapeHtml(fylkeName(r.f))} · kommunenr. ${id}` : `Fylkesnr. ${id}`}</div>
        </div>
        <button class="icon-btn close" aria-label="Lukk og vis hele landet" title="Lukk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
      <div class="hero-num">${fmtMetric(v)}</div>
      <div class="hero-cap">${S.escapeHtml(artsLabel())} · ${metricShort().toLowerCase()}</div>
      <div class="cmp">
        ${rk ? `<span class="pill accent">Nr. ${rk.rank} av ${rk.n}${nrk ? ` i ${S.escapeHtml(fylkeName(state.fy))}` : ""}</span>` : ""}
        ${nrk ? `<span class="pill">Nr. ${nrk.rank} av ${nrk.n} i landet</span>` : ""}
        ${ratio != null && state.metric !== "chg" ? `<span class="pill">${S.pct(ratio, 0, true)} mot landssnittet per innb.</span>` : ""}
        ${state.metric === "chg" && nat.chg != null ? `<span class="pill">Landet: ${S.pct(nat.chg, 1, true)}</span>` : ""}
      </div>

      <h3>Nøkkeltall</h3>
      <div class="kv">
        <div><div class="k">Skatteinngang</div><div class="v">${S.mill(tot)}</div></div>
        <div><div class="k">Per innbygger</div><div class="v">${S.kr(pc && Math.round(pc))}</div></div>
        <div><div class="k">Endring fra ${prevLabel(yi)}</div><div class="v">${S.pct(chg, 1, true)}</div></div>
        <div><div class="k">${isK ? "Andel av fylket" : "Andel av landet"}</div><div class="v">${S.pct(isK ? shareF : (tot / nat.v) * 100, 1)}</div></div>
        <div><div class="k">Innbyggere 1.1.${YEARS[yi]}</div><div class="v">${S.int(pop)}</div></div>
        <div><div class="k">Innb. per km² land</div><div class="v">${dens == null ? "–" : S.nf1.format(dens)}</div></div>
      </div>

      <h3>Utvikling ${state.metric === "tot" ? "– totalt" : "– per innbygger"}</h3>
      <div class="legend" id="ts-legend"></div>
      <div class="chart mini-chart" id="ts"></div>

      <h3>Fordeling på skattearter, ${yearLabel(yi)}</h3>
      <div class="bars">${parts.map((p) => `
        <div class="bar-row ${allOn || state.arts.includes(p.c) ? "" : "off"}">
          <span class="name" title="${DESC[p.c]}">${SHORT[p.c]}</span>
          <span class="val">${S.mill(p.v)} <span class="faint">· ${S.pct((100 * Math.max(0, p.v)) / sumParts, 0)}</span></span>
          <div class="track"><div class="fill" style="width:${Math.max(0, (100 * p.v) / maxPart)}%"></div></div>
        </div>`).join("")}
      </div>
      <div class="btn-row">
        ${isK && !state.fy ? `<button class="btn ghost" id="filter-fylke">Vis kommunene i ${S.escapeHtml(fylkeName(r.f))} →</button>` : ""}
        ${isK ? `<button class="btn ghost" id="to-fylke">Se fylket samlet →</button>` : `<button class="btn ghost" id="filter-fylke">Vis kommunene i ${S.escapeHtml(r.name)} →</button>`}
      </div>
    `;
    panel.querySelector(".close").onclick = () => select(null);
    const tf = panel.querySelector("#to-fylke");
    if (tf) tf.onclick = () => { state.level = "f"; drawLayers(); select(r.f); update(); };
    const ff = panel.querySelector("#filter-fylke");
    if (ff) ff.onclick = () => setFylke(isK ? r.f : id, isK);
    drawTimeSeries(r);
  }

  function renderOverview(nat) {
    if (state.level === "k" && state.fy) return renderFylkeOverview(nat);
    const yi = state.yi;
    const isK = state.level === "k";
    const top = ranking.slice(0, isK ? 8 : 5), bot = ranking.slice(-(isK ? 8 : 5)).reverse();
    const regs = regionsFor(state.level);
    const li = (id) => `<li><button data-id="${id}"><span class="r">${ranking.indexOf(id) + 1}</span><span class="n">${S.escapeHtml(regs[id].name)}</span><span class="v">${fmtMetric(values[id])}</span></button></li>`;
    const other = data.other;
    const outsideVal = (code) => {
      const o = other[code];
      if (!o) return null;
      if (state.arts.includes("00")) return o.v[ART_INDEX["00"]][yi];
      return state.arts.reduce((s, a) => s + (o.v[ART_INDEX[a]][yi] || 0), 0);
    };
    const sokkel = outsideVal("23"), sval = outsideVal("21"), kilde = outsideVal("24");
    const all = nat.v + (sokkel || 0) + (sval || 0) + (kilde || 0);
    panel.innerHTML = `
      <span class="eyebrow">Hele landet · ${yearLabel(yi)}</span>
      <h2 class="display">Norge</h2>
      <div class="sub">${S.escapeHtml(artsLabel())}</div>
      <div class="hero-num">${state.metric === "tot" ? S.mill(nat.v) : state.metric === "pc" ? S.kr(Math.round(nat.pc)) : S.pct(nat.chg, 1, true)}</div>
      <div class="hero-cap">${state.metric === "tot" ? "Sum for alle kommuner" : state.metric === "pc" ? "Landssnitt per innbygger (kommunene)" : `Endring for alle kommuner fra ${prevLabel(yi)}`}</div>
      <div class="kv" style="margin-top:16px">
        <div><div class="k">Kommunene totalt</div><div class="v">${S.mill(nat.v)}</div></div>
        <div><div class="k">Innbyggere 1.1.${YEARS[yi]}</div><div class="v">${S.int(nat.pop)}</div></div>
      </div>
      <h3>Høyest ${metricShort().toLowerCase()}</h3>
      <ol class="rank-list">${top.map(li).join("")}</ol>
      <h3>Lavest ${metricShort().toLowerCase()}</h3>
      <ol class="rank-list">${bot.map(li).join("")}</ol>
      <h3>Utenfor kartet</h3>
      <div class="outside">
        <div class="row"><span>Kontinentalsokkelen</span><b>${S.mill(sokkel)}</b></div>
        <div class="row"><span>Svalbard</span><b>${S.mill(sval)}</b></div>
        <div class="row"><span>Kildeskatt og ufordelt</span><b>${S.mill(kilde)}</b></div>
        <div class="row" style="border-top:1px solid var(--border);margin-top:6px;padding-top:8px"><span>Alt inkludert</span><b>${S.mill(all)}</b></div>
        <div style="margin-top:6px;font-size:12px;color:var(--text-3)">Sokkelen står for ${S.pct((100 * (sokkel || 0)) / all, 0)} av skatteinngangen i ${yearLabel(yi)}.</div>
      </div>
      <div class="hint"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 9l10 4-4 2-2 4z"/><path d="M5 3v4M3 5h4"/></svg>Klikk på ${isK ? "en kommune" : "et fylke"} i kartet for detaljer.</div>
    `;
    panel.querySelectorAll(".rank-list button").forEach((b) => b.addEventListener("click", () => select(b.dataset.id, true)));
  }

  function renderFylkeOverview(nat) {
    const yi = state.yi, fid = state.fy, f = fylker[fid];
    const n = ranking.length;
    const k = n <= 12 ? n : 6;
    const top = ranking.slice(0, k), bot = n <= 12 ? [] : ranking.slice(-k).reverse();
    const regs = regionsFor("k");
    const li = (id) => `<li><button data-id="${id}"><span class="r">${ranking.indexOf(id) + 1}</span><span class="n">${S.escapeHtml(regs[id].name)}</span><span class="v">${fmtMetric(values[id])}</span></button></li>`;
    const tot = artValue(f, yi), pc = perCap(f, yi), chg = change(f, yi);
    const ratio = pc != null ? (pc / nat.pc - 1) * 100 : null;
    const frank = (() => { const vs = Object.entries(fylker).map(([i, x]) => [i, metric(x)]).filter((e) => e[1] != null).sort((a, b) => b[1] - a[1]); const i = vs.findIndex((e) => e[0] === fid); return i < 0 ? null : { rank: i + 1, n: vs.length }; })();
    panel.innerHTML = `
      <div class="p-head">
        <div>
          <span class="eyebrow">Fylke · ${yearLabel(yi)}</span>
          <h2 class="display">${S.escapeHtml(f.name)}</h2>
          <div class="sub">${n} kommuner · ${S.escapeHtml(artsLabel())}</div>
        </div>
        <button class="icon-btn close" aria-label="Fjern fylkesfilteret og vis hele landet" title="Vis hele landet"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
      <div class="hero-num">${fmtMetric(metric(f))}</div>
      <div class="hero-cap">${metricShort()} for fylket samlet</div>
      <div class="cmp">
        ${frank ? `<span class="pill accent">Nr. ${frank.rank} av ${frank.n} fylker</span>` : ""}
        ${ratio != null && state.metric !== "chg" ? `<span class="pill">${S.pct(ratio, 0, true)} mot landssnittet per innb.</span>` : ""}
      </div>
      <div class="kv" style="margin-top:16px">
        <div><div class="k">Skatteinngang</div><div class="v">${S.mill(tot)}</div></div>
        <div><div class="k">Per innbygger</div><div class="v">${S.kr(pc && Math.round(pc))}</div></div>
        <div><div class="k">Endring fra ${prevLabel(yi)}</div><div class="v">${S.pct(chg, 1, true)}</div></div>
        <div><div class="k">Andel av landet</div><div class="v">${S.pct((100 * tot) / nat.v, 1)}</div></div>
      </div>
      <h3>${bot.length ? "Høyest" : "Kommunene rangert etter"} ${metricShort().toLowerCase()}</h3>
      <ol class="rank-list">${top.map(li).join("")}</ol>
      ${bot.length ? `<h3>Lavest ${metricShort().toLowerCase()}</h3><ol class="rank-list">${bot.map(li).join("")}</ol>` : ""}
      <div class="btn-row"><button class="btn ghost" id="clear-fylke">← Vis hele landet</button></div>
      <div class="hint"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 9l10 4-4 2-2 4z"/><path d="M5 3v4M3 5h4"/></svg>Fargene er tilpasset kommunene i fylket.</div>
    `;
    panel.querySelector(".close").onclick = () => setFylke(null);
    panel.querySelector("#clear-fylke").onclick = () => setFylke(null);
    panel.querySelectorAll(".rank-list button").forEach((b) => b.addEventListener("click", () => select(b.dataset.id, true)));
  }

  function drawTimeSeries(r) {
    const el = document.getElementById("ts");
    const n = partial ? LAST : LAST + 1; // bare hele år
    const usePc = state.metric !== "tot";
    const rows = [];
    for (let i = 0; i < n; i++) {
      rows.push({ y: YEARS[i], r: usePc ? perCap(r, i) : artValue(r, i), n: usePc ? national(i).pc : null });
    }
    const series = [{ key: "r", name: r.name, color: "var(--series-1)" }];
    if (usePc) series.push({ key: "n", name: "Landssnitt", color: "var(--neutral-mark)", dash: true });
    document.getElementById("ts-legend").innerHTML = series.length > 1 ? series.map((s) =>
      `<span class="item"><span class="sw ${s.dash ? "dash" : "line"}" style="background:${s.color};color:${s.color}"></span>${S.escapeHtml(s.name)}</span>`).join("") : "";
    const w = 356, h = 170, m = { t: 12, r: 8, b: 22, l: 44 };
    const x = d3.scaleLinear(d3.extent(rows, (d) => d.y), [m.l, w - m.r]);
    const ymax = d3.max(rows, (d) => Math.max(d.r || 0, d.n || 0));
    const ymin = Math.min(0, d3.min(rows, (d) => Math.min(d.r ?? 0, d.n ?? 0)));
    const y = d3.scaleLinear([ymin, ymax], [h - m.b, m.t]).nice(4);
    el.innerHTML = "";
    const svgc = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const fy = (v) => usePc ? (v >= 1000 ? S.nf0.format(v / 1000) + "k" : S.nf0.format(v)) : S.mill(v, { short: true }).replace(" mill.", "m").replace(" mrd.", " mrd");
    svgc.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svgc.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(fy).tickPadding(6));
    svgc.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat(d3.format("d")).tickSizeOuter(0));
    for (const s of series.slice().reverse()) {
      svgc.append("path").datum(rows.filter((d) => d[s.key] != null)).attr("fill", "none").attr("stroke", s.color).attr("stroke-width", 2)
        .attr("stroke-dasharray", s.dash ? "4 3" : null).attr("stroke-linejoin", "round").attr("stroke-linecap", "round")
        .attr("d", d3.line().x((d) => x(d.y)).y((d) => y(d[s.key])));
    }
    // markør for valgt år
    const selYear = YEARS[Math.min(state.yi, n - 1)];
    const sel = rows.find((d) => d.y === selYear);
    if (sel && sel.r != null) svgc.append("circle").attr("cx", x(sel.y)).attr("cy", y(sel.r)).attr("r", 4.5).attr("fill", "var(--series-1)").attr("stroke", "var(--surface)").attr("stroke-width", 2);
    // hover
    const cross = svgc.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--border-strong)").style("display", "none");
    const dots = series.map((s) => svgc.append("circle").attr("r", 4).attr("fill", s.color).attr("stroke", "var(--surface)").attr("stroke-width", 2).style("display", "none"));
    svgc.append("rect").attr("x", m.l).attr("y", 0).attr("width", w - m.l - m.r).attr("height", h).attr("fill", "transparent")
      .on("mousemove", (e) => {
        const [px] = d3.pointer(e);
        const yr = Math.round(x.invert(px));
        const d = rows.find((q) => q.y === yr);
        if (!d) return;
        cross.style("display", null).attr("x1", x(yr)).attr("x2", x(yr));
        series.forEach((s, i) => d[s.key] == null ? dots[i].style("display", "none") : dots[i].style("display", null).attr("cx", x(yr)).attr("cy", y(d[s.key])));
        const fv = (v) => usePc ? S.kr(v && Math.round(v)) : S.mill(v);
        tip.show(`<div class="tt-title">${yr}</div>${series.map((s) => `<div class="tt-row"><span><span class="key" style="background:${s.color}"></span>${S.escapeHtml(s.name)}</span><b>${fv(d[s.key])}</b></div>`).join("")}`, e.clientX, e.clientY);
      })
      .on("mouseleave", () => { tip.hide(); cross.style("display", "none"); dots.forEach((d) => d.style("display", "none")); });
  }

  // ------------------------------------------------------------------ tabell
  function renderTable() {
    const isK = state.level === "k";
    const regs = regionsFor(state.level);
    const yi = state.yi;
    const rows = Object.entries(regs).map(([id, r]) => ({
      id, name: r.name, fylke: isK ? fylkeName(r.f) : "", pop: r.pop[yi], tot: artValue(r, yi), pc: perCap(r, yi), chg: change(r, yi),
      rank: rankOf(id)?.rank ?? null,
    }));
    document.getElementById("table-title").textContent = `${isK ? (state.fy ? `Kommuner i ${fylkeName(state.fy)}` : "Alle kommuner") : "Alle fylker"} · ${yearLabel(yi)} · ${artsLabel()}`;
    const cols = [
      { key: "name", label: isK ? "Kommune" : "Fylke", text: true },
      ...(isK && !state.fy ? [{ key: "fylke", label: "Fylke", text: true }] : []),
      { key: "pop", label: "Innbyggere", fmt: S.int },
      { key: "tot", label: "Skatteinngang", fmt: (v) => S.mill(v) },
      { key: "pc", label: "Per innbygger", fmt: (v) => S.kr(v && Math.round(v)) },
      { key: "chg", label: `Endring fra ${prevLabel(yi)}`, fmt: (v) => S.pct(v, 1, true) },
    ];
    const sortKey = state.metric;
    S.sortableTable(document.getElementById("table"), cols, rows, {
      sortKey, dir: -1,
      onRow: (id) => { select(id, true); document.getElementById("map-wrap").scrollIntoView({ behavior: "smooth", block: "center" }); },
    });
    document.getElementById("csv").onclick = () => {
      S.downloadCsv(`skatt-${isK ? "kommuner" : "fylker"}-${YEARS[yi]}.csv`, [
        [isK ? "Kommunenr" : "Fylkesnr", "Navn", ...(isK ? ["Fylke"] : []), "Innbyggere", "Skatteinngang (mill. kr)", "Per innbygger (kr)", "Endring (%)"],
        ...rows.map((r) => [r.id, r.name, ...(isK ? [r.fylke] : []), r.pop, r.tot?.toFixed(1).replace(".", ","), r.pc == null ? "" : Math.round(r.pc), r.chg == null ? "" : r.chg.toFixed(1).replace(".", ",")]),
      ]);
    };
  }

  // ------------------------------------------------------------------ oppdatering
  function syncControls() {
    yearSel.value = String(state.yi);
    document.querySelectorAll("#level button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === state.level)));
    document.querySelectorAll("#metric button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.v === state.metric));
    });
    const chgBtn = document.querySelector('#metric button[data-v="chg"]');
    chgBtn.disabled = state.yi === 0;
    chgBtn.title = state.yi === 0 ? "Ingen data for året før" : "";
    if (state.yi === 0 && state.metric === "chg") state.metric = "pc";
    document.getElementById("arts-label").textContent = artsLabel();
    artsPop.querySelectorAll("[data-p]").forEach((b) => b.setAttribute("aria-pressed", String(sameSet(PRESETS.find((p) => p.id === b.dataset.p).arts, state.arts))));
    artsPop.querySelectorAll("input[type=checkbox]").forEach((cb) => (cb.checked = state.arts.includes("00") || state.arts.includes(cb.value)));
  }

  function update() {
    syncControls();
    computeScale();
    regionSel.attr("fill", (d) => colorOf(d.properties.id)).classed("dim", false).classed("out", (d) => isOut(d.properties.id));
    gBorders.selectAll(".fylke-focus").remove();
    if (state.level === "k" && state.fy) gBorders.append("path").attr("class", "fylke-focus").attr("d", path(featById["f" + state.fy]));
    fylkeSel.value = state.level === "k" && state.fy ? state.fy : "";
    drawSelection();
    drawLegend();
    const t = state.metric === "pc" ? "per innbygger" : state.metric === "tot" ? "totalt" : `– endring fra ${prevLabel(state.yi)}`;
    document.getElementById("map-title").textContent = `${artsLabel()} ${t}`;
    document.getElementById("map-sub").textContent = `${state.level === "k" ? (state.fy ? `Kommuner i ${fylkeName(state.fy)}` : "Kommuner") : "Fylker"} · ${yearLabel(state.yi)}${partial && state.yi === LAST ? " (hittil i år)" : ""}`;
    renderPanel();
    renderTable();
    writeHash();
  }

  drawLayers();
  update();
  if (state.sel) setTimeout(() => zoomTo(featById[state.level + state.sel]), 50);
  else if (state.level === "k" && state.fy) setTimeout(() => zoomTo(featById["f" + state.fy], 0.82), 50);
  document.getElementById("map-loading").remove();
  document.getElementById("updated").textContent = "Data oppdatert av SSB " + new Date(data.updated).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" });
  S.onThemeChange(() => update());
})();
