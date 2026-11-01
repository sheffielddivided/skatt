/* Gjenbrukbart koropletkart over kommuner (d3 + topojson).
 *
 *   const map = Skatt.choropleth(el, topo, { onClick(id), tooltip(id) -> html });
 *   map.update({ values: {kode: tall}, fmt: (v) => "…", title: "…", fylke: "46" | null, selected: "4601" | null });
 */
(function () {
  const S = window.Skatt;
  const RAMP_L = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
  const RAMP_D = ["#0d366b", "#104281", "#1c5cab", "#2a78d6", "#5598e7", "#86b6ef", "#b7d3f6"];
  const DIV_L = ["#a52f2f", "#e34948", "#f2a3a2", "#e5e3dd", "#9ec5f4", "#3987e5", "#184f95"];
  const DIV_D = ["#e66767", "#b33b3b", "#6b2e2d", "#3a3a37", "#1c4a80", "#2a78d6", "#86b6ef"];
  /** Symmetriske terskler rundt 0 basert på 90-persentilen av |v|, avrundet til «pene» tall. */
  function divThresholds(vs) {
    const a = d3.quantile(vs.map(Math.abs).sort(d3.ascending), 0.9) || 1;
    const nice = (x) => { const p = Math.pow(10, Math.floor(Math.log10(x))); const m = x / p; return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p; };
    const hi = nice(a), mid = nice(a / 3), lo = nice(a / 10);
    return [-hi, -mid, -lo, lo, mid, hi];
  }

  function choropleth(el, topo, opts = {}) {
    const tip = S.tooltip();
    el.classList.add("choro");
    el.innerHTML = `
      <svg class="choro-svg" role="img"></svg>
      <div class="choro-zoom">
        <button class="icon-btn" data-z="in" aria-label="Zoom inn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
        <button class="icon-btn" data-z="out" aria-label="Zoom ut"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg></button>
        <button class="icon-btn" data-z="reset" aria-label="Vis hele landet"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
      </div>
      <div class="choro-legend"></div>`;
    const W = 800, H = 1000;
    const svg = d3.select(el.querySelector("svg")).attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
    const featK = topojson.feature(topo, topo.objects.kommuner).features;
    const featF = topojson.feature(topo, topo.objects.fylker).features;
    const mesh = topojson.mesh(topo, topo.objects.fylker, (a, b) => a !== b);
    const proj = d3.geoTransverseMercator().rotate([-15, -65]).fitExtent([[20, 20], [W - 20, H - 20]], { type: "FeatureCollection", features: featF });
    const path = d3.geoPath(proj);
    const g = svg.append("g");
    const gR = g.append("g"), gB = g.append("g"), gH = g.append("g"), gS = g.append("g");
    const byId = {}, byF = {};
    featK.forEach((f) => (byId[f.properties.id] = f));
    featF.forEach((f) => (byF[f.properties.id] = f));
    let state = { values: {}, fmt: String, fylke: null, selected: null, scale: null };

    const zoom = d3.zoom().scaleExtent([1, 40]).translateExtent([[-200, -200], [W + 200, H + 200]]).on("zoom", (e) => g.attr("transform", e.transform));
    svg.call(zoom).on("dblclick.zoom", null);
    el.querySelector('[data-z="in"]').onclick = () => svg.transition().duration(300).call(zoom.scaleBy, 1.8);
    el.querySelector('[data-z="out"]').onclick = () => svg.transition().duration(300).call(zoom.scaleBy, 1 / 1.8);
    el.querySelector('[data-z="reset"]').onclick = () => reset();
    function reset() { svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity); }
    function zoomTo(feature, fill = 0.82) {
      const [[x0, y0], [x1, y1]] = path.bounds(feature);
      const k = Math.min(10, fill / Math.max((x1 - x0) / W, (y1 - y0) / H));
      svg.transition().duration(700).call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2).scale(Math.max(1, k)).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
    }

    const out = (id) => state.fylke && id.slice(0, 2) !== state.fylke;
    const regions = gR.selectAll("path").data(featK).join("path").attr("class", "choro-region").attr("d", path)
      .on("mousemove", (e, d) => {
        const id = d.properties.id;
        if (out(id)) return;
        gH.selectAll("*").remove();
        gH.append("path").attr("class", "choro-hover").attr("d", path(d));
        tip.show(opts.tooltip ? opts.tooltip(id) : id, e.clientX, e.clientY);
      })
      .on("mouseleave", () => { tip.hide(); gH.selectAll("*").remove(); })
      .on("click", (e, d) => { e.stopPropagation(); if (!out(d.properties.id) && opts.onClick) opts.onClick(d.properties.id); });
    gB.append("path").attr("class", "choro-fylke").attr("d", path(mesh));
    svg.on("click", () => opts.onClick && opts.onClick(null));

    function color(id) {
      if (out(id)) return "var(--map-out)";
      const v = state.values[id];
      if (state.categories) return state.categories.find((c) => c.id === v)?.color || "var(--map-empty)";
      return v == null || !isFinite(v) ? "var(--map-empty)" : state.scale(v);
    }

    function legend() {
      const lg = el.querySelector(".choro-legend");
      if (state.categories) {
        const cnt = (cid) => Object.entries(state.values).filter(([id, v]) => v === cid && !out(id)).length;
        lg.innerHTML = `<div class="lt">${S.escapeHtml(state.title || "")}</div>` + state.categories
          .map((c) => `<div class="bin" data-c="${c.color}"><span class="sw" style="background:${c.color}"></span><span>${S.escapeHtml(c.name)}</span><span style="margin-left:auto;padding-left:10px;color:var(--text-3)">${cnt(c.id)}</span></div>`).join("");
        lg.querySelectorAll(".bin").forEach((b) => {
          b.onmouseenter = () => regions.classed("dim", (d) => color(d.properties.id) !== b.dataset.c);
          b.onmouseleave = () => regions.classed("dim", false);
        });
        return;
      }
      const vs = Object.entries(state.values).filter(([id, v]) => v != null && !out(id)).map((e) => e[1]);
      if (!vs.length) { lg.innerHTML = ""; return; }
      const f = state.short || state.fmt;
      let labels;
      if (state.diverging) {
        const t = state.scale.domain();
        labels = state.scale.range().map((c, i) => (i === 0 ? `under ${f(t[0])}` : i === t.length ? `over ${f(t[t.length - 1])}` : `${f(t[i - 1])} – ${f(t[i])}`));
      } else {
        const ext = d3.extent(vs);
        const cuts = state.scale.quantiles ? state.scale.quantiles() : state.scale.domain();
        const t = [ext[0], ...cuts, ext[1]];
        if (state.lowBin) t[1] = state.lowMin;
        labels = state.scale.range().map((c, i) => (state.lowBin && i === 0 ? f(ext[0]) : `${f(t[i])} – ${f(t[i + 1])}`));
      }
      lg.innerHTML = `<div class="lt">${S.escapeHtml(state.title || "")}</div>` + state.scale.range().map((c, i) => ({ c, i })).reverse()
        .map(({ c, i }) => `<div class="bin" data-c="${c}"><span class="sw" style="background:${c}"></span><span>${labels[i]}</span></div>`).join("");
      lg.querySelectorAll(".bin").forEach((b) => {
        b.onmouseenter = () => regions.classed("dim", (d) => color(d.properties.id) !== b.dataset.c);
        b.onmouseleave = () => regions.classed("dim", false);
      });
    }

    function update(o) {
      const prevF = state.fylke;
      state = { ...state, ...o };
      const ramp = S.isDark() ? RAMP_D : RAMP_L;
      if ("values" in o && !("categories" in o)) state.categories = null;
      const vs = state.categories ? [0] : Object.entries(state.values).filter(([id, v]) => v != null && isFinite(v) && !out(id)).map((e) => e[1]);
      state.lowBin = false;
      if (state.diverging) state.scale = d3.scaleThreshold(divThresholds(vs), S.isDark() ? DIV_D : DIV_L);
      else {
        // Mange like minimumsverdier (f.eks. 0) gir like kvantiler – gi dem en egen klasse.
        const mn = d3.min(vs), rest = vs.filter((v) => v > mn);
        if (rest.length && (vs.length - rest.length) / vs.length > 0.15) {
          const q = d3.scaleQuantile(rest, d3.range(6)).quantiles();
          const cut = mn + (d3.min(rest) - mn) / 2;
          state.scale = d3.scaleThreshold([cut, ...q], ramp);
          state.lowBin = true;
          state.lowMin = d3.min(rest);
        } else state.scale = d3.scaleQuantile(vs, ramp);
      }
      regions.attr("fill", (d) => color(d.properties.id)).classed("out", (d) => out(d.properties.id));
      gS.selectAll("*").remove();
      if (state.fylke && byF[state.fylke]) gS.append("path").attr("class", "choro-focus").attr("d", path(byF[state.fylke]));
      if (state.selected && byId[state.selected]) {
        gS.append("path").attr("class", "choro-halo").attr("d", path(byId[state.selected]));
        gS.append("path").attr("class", "choro-sel").attr("d", path(byId[state.selected]));
      }
      legend();
      if ("fylke" in o && o.fylke !== prevF) {
        if (state.fylke) zoomTo(byF[state.fylke]); else reset();
      }
    }

    S.onThemeChange(() => update({}));
    return { update, zoomToKommune: (id) => byId[id] && zoomTo(byId[id], 0.4), colorOf: color };
  }

  S.choropleth = choropleth;
})();
