/* Studie 10 – Hvor går skattepengene? */
(async function () {
  const S = window.Skatt;
  const tip = S.tooltip();
  const [d, ord] = await Promise.all([
    fetch("data/utgifter.json").then((r) => r.json()),
    fetch("data/skatt-ordning.json").then((r) => r.json()),
  ]);
  const Y = d.years, LAST = Y.length - 1;
  const F = Object.fromEntries(d.formaal.map((f) => [f.code, f]));
  const MAIN = d.formaal.filter((f) => f.code.length === 2);
  const kids = (code) => d.formaal.filter((f) => f.parent === code);
  const kpi = ord.kpi, baseYear = Math.max(...Object.keys(kpi).map(Number));
  let real = true;
  const defl = (y) => (real ? kpi[baseYear] / (kpi[Math.min(y, baseYear)] || kpi[baseYear]) : 1);
  document.getElementById("real-btn").textContent = `Faste ${baseYear}-kroner`;
  document.querySelectorAll(".ly").forEach((e) => (e.textContent = Y[LAST]));

  const GROUPS = [
    { id: "velferd", name: "Sosial beskyttelse", codes: ["10"], color: "var(--series-1)" },
    { id: "helse", name: "Helse", codes: ["07"], color: "var(--series-2)" },
    { id: "utd", name: "Utdanning", codes: ["09"], color: "var(--series-3)" },
    { id: "orden", name: "Forsvar, politi og rettsvesen", codes: ["02", "03"], color: "var(--series-4)" },
    { id: "naer", name: "Samferdsel, næring, miljø og bolig", codes: ["04", "05", "06"], color: "var(--series-5)" },
    { id: "adm", name: "Administrasjon, bistand og renter", codes: ["01"], color: "var(--series-6)" },
    { id: "kultur", name: "Kultur, idrett og fritid", codes: ["08"], color: "var(--series-7)" },
  ];
  const groupOf = (code) => GROUPS.find((g) => g.codes.includes(code.slice(0, 2)));
  const NICE = {
    "01": "Administrasjon, bistand og renter", "04": "Næring og samferdsel", "06": "Bolig og nærmiljø", "08": "Kultur, idrett og fritid",
    "102": "Alderdom (pensjon og eldreomsorg)", "101": "Sykdom og uførhet", "011": "Statsforvaltning, skatt og utenriks",
    "017": "Renter på offentlig gjeld", "018": "Overføringer mellom stat og kommune", "091": "Barnehage og barneskole", "092": "Ungdomsskole og videregående",
  };
  const nm = (f) => NICE[f.code] || f.name;
  const val = (f, i, sec = "off") => (f[sec][i] == null ? null : f[sec][i] * 1e6 * defl(Y[i]));
  const pc = (v, i) => (v == null ? null : v / d.pop[i]);
  const big = (v) => S.mill(v / 1e6);

  // ---------------------------------------------------------------- ingress
  function lead() {
    const tot = val(F["0"], LAST);
    document.getElementById("lead-total").textContent = big(tot);
    document.getElementById("lead-pc").textContent = S.kr(Math.round(pc(tot, LAST) / 1000) * 1000);
  }

  // ---------------------------------------------------------------- kvittering
  const taxIn = document.getElementById("tax");
  const parseTax = () => +taxIn.value.replace(/[^\d]/g, "") || 0;
  function receipt() {
    const tax = parseTax();
    const tot = F["0"].off[LAST];
    const rows = MAIN.map((f) => ({ f, share: f.off[LAST] / tot })).sort((a, b) => b.share - a.share);
    const mx = rows[0].share;
    document.getElementById("receipt").innerHTML = rows.map(({ f, share }) => {
      const subs = kids(f.code).filter((k) => k.off[LAST] > 0).sort((a, b) => b.off[LAST] - a.off[LAST]).slice(0, 5);
      return `<div class="rrow" data-c="${f.code}"><span class="sw" style="background:${groupOf(f.code).color}"></span><span class="n">${S.escapeHtml(nm(f))}<small>${S.pct(100 * share, 1)} · ${subs.slice(0, 2).map((k) => S.escapeHtml(nm(k).toLowerCase())).join(", ")} m.m.</small></span><span class="v">${S.kr(Math.round(tax * share))}</span><div class="bar"><div style="width:${(100 * share) / mx}%;background:${groupOf(f.code).color}"></div></div></div>
        <div class="rsub" id="sub-${f.code}">${subs.map((k) => `<div><span>${S.escapeHtml(nm(k))}</span><b>${S.kr(Math.round((tax * k.off[LAST]) / tot))}</b></div>`).join("")}</div>`;
    }).join("");
    document.querySelectorAll(".rrow").forEach((r) => (r.onclick = () => document.getElementById("sub-" + r.dataset.c).classList.toggle("open")));
  }
  taxIn.addEventListener("input", () => {
    const pos = parseTax();
    taxIn.value = pos ? S.nf0.format(pos) : "";
    receipt();
  });
  document.querySelectorAll(".quick button").forEach((b) => (b.onclick = () => { taxIn.value = S.nf0.format(+b.dataset.v); receipt(); }));

  // ---------------------------------------------------------------- treemap
  const st = { yi: LAST, sec: "off", unit: "tot", focus: null, from: Y.indexOf(2015) >= 0 ? Y.indexOf(2015) : 0, artf: "0" };
  const yearSel = document.getElementById("year");
  yearSel.innerHTML = Y.map((y, i) => `<option value="${i}">${y}</option>`).reverse().join("");
  yearSel.value = st.yi;
  yearSel.onchange = () => { st.yi = +yearSel.value; treemap(); };
  const seg = (id, key, fn) => document.querySelectorAll(`#${id} button`).forEach((b) => (b.onclick = () => { st[key] = b.dataset.v; document.querySelectorAll(`#${id} button`).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); fn(); }));
  seg("sector", "sec", treemap);
  seg("unit", "unit", treemap);
  document.getElementById("tm-legend").innerHTML = GROUPS.map((g) => `<span class="item"><span class="sw" style="background:${g.color}"></span>${g.name}</span>`).join("");

  function treemap() {
    const el = document.getElementById("tm");
    const w = Math.max(360, el.clientWidth || 1000), h = Math.max(380, Math.min(620, w * 0.55));
    el.innerHTML = "";
    const i = st.yi;
    const leafVal = (f) => Math.max(0, val(f, i, st.sec) || 0) / (st.unit === "pc" ? d.pop[i] : 1);
    const mains = st.focus ? [F[st.focus]] : MAIN;
    const root = {
      name: "root",
      children: mains.map((m) => {
        const ks = kids(m.code).filter((k) => k.code !== "018" || st.sec !== "off");
        return { code: m.code, name: nm(m), children: ks.length ? ks.map((k) => ({ code: k.code, name: nm(k), value: leafVal(k) })) : [{ code: m.code, name: nm(m), value: leafVal(m) }] };
      }),
    };
    const hier = d3.hierarchy(root).sum((x) => x.value || 0).sort((a, b) => b.value - a.value);
    d3.treemap().size([w, h]).paddingInner(2).paddingTop(st.focus ? 0 : 20).round(true)(hier);
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const fmtV = (v) => (st.unit === "pc" ? S.kr(Math.round(v)) : big(v));
    if (!st.focus) {
      svg.append("g").selectAll("text").data(hier.children).join("text").attr("x", (n) => n.x0 + 4).attr("y", (n) => n.y0 + 14)
        .attr("fill", "var(--text-2)").attr("font-size", 12).attr("font-weight", 650)
        .text((n) => { const t = `${n.data.name} · ${fmtV(n.value)}`; const room = (n.x1 - n.x0) / 6.6; return room > 6 ? (t.length > room ? t.slice(0, Math.floor(room) - 1) + "…" : t) : ""; });
    }
    const total = hier.value;
    const cells = svg.append("g").selectAll("g").data(hier.leaves()).join("g").attr("class", "tm-cell").attr("transform", (n) => `translate(${n.x0},${n.y0})`)
      .on("click", (e, n) => { st.focus = st.focus ? null : n.parent.data.code; treemap(); })
      .on("mousemove", (e, n) => tip.show(`<div class="tt-title">${S.escapeHtml(n.data.name)}</div><div class="faint" style="font-size:12px;margin:-2px 0 6px">${S.escapeHtml(n.parent.data.name)} · ${Y[i]}</div>
        <div class="tt-row"><span>${st.unit === "pc" ? "Per innbygger" : "Totalt"}</span><b>${fmtV(n.value)}</b></div><div class="tt-row"><span>Andel</span><b>${S.pct((100 * n.value) / total, 1)}</b></div>
        <div class="faint" style="font-size:12px;margin-top:4px">${st.focus ? "Klikk for å gå tilbake" : "Klikk for å se underformålene"}</div>`, e.clientX, e.clientY))
      .on("mouseleave", () => tip.hide());
    cells.append("rect").attr("width", (n) => Math.max(0, n.x1 - n.x0)).attr("height", (n) => Math.max(0, n.y1 - n.y0)).attr("rx", 3)
      .attr("fill", (n) => groupOf(n.data.code).color).attr("fill-opacity", (n) => (st.focus ? 0.85 : 0.75));
    cells.each(function (n) {
      const cw = n.x1 - n.x0, ch = n.y1 - n.y0;
      if (cw < 60 || ch < 30) return;
      const g = d3.select(this);
      const words = n.data.name.split(" ");
      let line = "", lines = [];
      for (const wd of words) { if ((line + " " + wd).trim().length * 6.8 > cw - 10) { lines.push(line.trim()); line = wd; } else line += " " + wd; }
      lines.push(line.trim());
      lines = lines.slice(0, Math.max(1, Math.floor((ch - 22) / 15)));
      lines.forEach((l, k) => g.append("text").attr("x", 6).attr("y", 16 + k * 15).attr("fill", "#fff").attr("font-size", 12.5).attr("font-weight", 600).text(l));
      if (ch > 22 + lines.length * 15) g.append("text").attr("x", 6).attr("y", 18 + lines.length * 15).attr("fill", "#fff").attr("fill-opacity", 0.9).attr("font-size", 12).text(fmtV(n.value));
    });
    document.getElementById("crumbs").innerHTML = st.focus ? `<button id="back">← Alle formål</button><span>/</span><b>${S.escapeHtml(nm(F[st.focus]))}</b><span class="faint">· ${fmtV(total)}</span>` : `<span class="faint">${st.sec === "off" ? "Stat og kommune samlet" : st.sec === "stat" ? "Staten (inkl. overføringer til kommunene)" : "Kommunene"} · ${Y[i]} · ${fmtV(total)}</span>`;
    const back = document.getElementById("back");
    if (back) back.onclick = () => { st.focus = null; treemap(); };
  }

  // ---------------------------------------------------------------- utvikling
  function stackedArea() {
    const el = document.getElementById("c2");
    const w = Math.max(360, el.clientWidth || 1000), h = 360, m = { t: 14, r: 14, b: 28, l: 64 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const rows = Y.map((y, i) => { const o = { x: y }; GROUPS.forEach((g) => (o[g.id] = d3.sum(g.codes, (c) => pc(val(F[c], i), i) || 0) - (g.id === "adm" ? pc(val(F["018"], i), i) || 0 : 0))); return o; });
    const stack = d3.stack().keys(GROUPS.map((g) => g.id))(rows);
    const x = d3.scaleLinear(d3.extent(Y), [m.l, w - m.r]);
    const y = d3.scaleLinear([0, d3.max(stack[stack.length - 1], (p) => p[1])], [h - m.b, m.t]).nice();
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat((v) => S.nf0.format(v / 1000) + "k").tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(Math.min(10, w / 80)).tickFormat(d3.format("d")).tickSizeOuter(0));
    svg.append("g").selectAll("path").data(stack).join("path").attr("fill", (s) => GROUPS[s.index].color).attr("fill-opacity", 0.85).attr("stroke", "var(--surface)").attr("stroke-width", 1)
      .attr("d", d3.area().x((p) => x(p.data.x)).y0((p) => y(p[0])).y1((p) => y(p[1])));
    document.getElementById("c2-legend").innerHTML = GROUPS.slice().map((g) => `<span class="item"><span class="sw" style="background:${g.color}"></span>${g.name}</span>`).join("") + `<span class="item faint">· per innbygger, ${real ? `faste ${baseYear}-kroner` : "løpende kroner"}</span>`;
    const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--text-3)").style("display", "none");
    svg.append("rect").attr("x", m.l).attr("width", w - m.l - m.r).attr("height", h - m.b).attr("fill", "transparent")
      .on("mousemove", (e) => { const xv = Math.round(x.invert(d3.pointer(e)[0])); const r = rows.find((q) => q.x === xv); if (!r) return; cross.style("display", null).attr("x1", x(xv)).attr("x2", x(xv));
        tip.show(`<div class="tt-title">${xv} · per innbygger</div>${GROUPS.slice().reverse().map((g) => `<div class="tt-row"><span><span class="key" style="background:${g.color}"></span>${g.name}</span><b>${S.kr(Math.round(r[g.id]))}</b></div>`).join("")}<div class="tt-row" style="border-top:1px solid var(--border);margin-top:4px;padding-top:4px"><span>I alt</span><b>${S.kr(Math.round(d3.sum(GROUPS, (g) => r[g.id])))}</b></div>`, e.clientX, e.clientY); })
      .on("mouseleave", () => { tip.hide(); cross.style("display", "none"); });
  }
  const fromSel = document.getElementById("from");
  fromSel.innerHTML = Y.slice(0, -1).map((y, i) => `<option value="${i}">${y}</option>`).join("");
  fromSel.value = st.from;
  fromSel.onchange = () => { st.from = +fromSel.value; growth(); };
  function growth() {
    const a = st.from, b = LAST;
    document.getElementById("gr-title").textContent = `Hva har vokst mest siden ${Y[a]}?`;
    const rows = d.formaal.filter((f) => f.code !== "0" && f.code.length <= 3 && f.code !== "018").map((f) => {
      const v0 = pc(val(f, a), a), v1 = pc(val(f, b), b);
      return { id: f.code, name: nm(f), main: f.code.length === 2 ? "Hovedformål" : nm(F[f.parent]), v0, v1, abs: v1 != null && v0 != null ? v1 - v0 : null, rel: v0 > 0 && v1 != null ? 100 * (v1 / v0 - 1) : null };
    }).filter((r) => r.v1 != null && r.v1 > 0);
    S.sortableTable(document.getElementById("growth"), [
      { key: "name", label: "Formål", text: true }, { key: "main", label: "Del av", text: true },
      { key: "v0", label: `Per innb. ${Y[a]}`, fmt: (v) => S.kr(v && Math.round(v)) }, { key: "v1", label: `Per innb. ${Y[b]}`, fmt: (v) => S.kr(v && Math.round(v)) },
      { key: "abs", label: "Endring (kr)", fmt: (v) => (v == null ? "–" : (v > 0 ? "+" : "−") + S.int(Math.abs(Math.round(v)))) }, { key: "rel", label: "Endring (%)", fmt: (v) => S.pct(v, 0, true) },
    ], rows, { sortKey: "abs", dir: -1 });
  }

  // ---------------------------------------------------------------- stat mot kommune
  function split() {
    const i = LAST;
    document.getElementById("sp-legend").innerHTML = `<span class="item"><span class="sw" style="background:var(--series-1)"></span>Staten</span><span class="item"><span class="sw" style="background:var(--series-3)"></span>Kommunene</span><span class="item faint">· ${Y[i]}, ${real ? `faste ${baseYear}-kroner` : "løpende kroner"}</span>`;
    const rows = MAIN.map((f) => {
      const stat = f.code === "01" ? (f.stat[i] || 0) - (F["018"].stat[i] || 0) : f.stat[i] || 0;
      return { f, stat, komm: f.komm[i] || 0 };
    }).sort((a, b) => b.stat + b.komm - (a.stat + a.komm));
    document.getElementById("split").innerHTML = rows.map((r) => {
      const t = r.stat + r.komm;
      return `<div class="row" title="Staten: ${big(r.stat * 1e6 * defl(Y[i]))} · Kommunene: ${big(r.komm * 1e6 * defl(Y[i]))}"><span>${S.escapeHtml(nm(r.f))}</span><div class="bar"><div style="width:${(100 * r.stat) / t}%;background:var(--series-1)"></div><div style="width:${(100 * r.komm) / t}%;background:var(--series-3)"></div></div><span class="v">${S.pct((100 * r.komm) / t, 0)} kommunene</span></div>`;
    }).join("");
  }

  // ---------------------------------------------------------------- art
  const ART = [
    { id: "lonn", name: "Lønn", codes: ["B1"], color: "var(--series-1)" },
    { id: "kjop", name: "Kjøp av varer og tjenester", codes: ["B2", "B5"], color: "var(--series-2)" },
    { id: "stonad", name: "Stønader til husholdninger", codes: ["B6"], color: "var(--series-3)" },
    { id: "overf", name: "Subsidier og overføringer", codes: ["B7", "B8", "B9"], color: "var(--series-4)" },
    { id: "inv", name: "Investeringer", codes: ["D1", "D3"], color: "var(--series-5)" },
    { id: "rente", name: "Renter mv.", codes: ["B4"], color: "var(--series-6)" },
  ];
  const artSel = document.getElementById("artf");
  artSel.innerHTML = `<option value="0">Alle formål</option>` + MAIN.map((f) => `<option value="${f.code}">${S.escapeHtml(nm(f))}</option>`).join("");
  artSel.onchange = () => { st.artf = artSel.value; arts(); };
  function arts() {
    const f = F[st.artf], el = document.getElementById("c4");
    const w = Math.max(360, el.clientWidth || 1000), h = 320, m = { t: 14, r: 10, b: 28, l: 60 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    document.getElementById("c4-legend").innerHTML = ART.map((a) => `<span class="item"><span class="sw" style="background:${a.color}"></span>${a.name}</span>`).join("");
    const rows = Y.map((y, i) => { const o = { x: y }; let t = 0; ART.forEach((a) => { o[a.id] = Math.max(0, d3.sum(a.codes, (c) => f.art[c]?.[i] || 0)); t += o[a.id]; }); ART.forEach((a) => (o[a.id + "p"] = t ? (100 * o[a.id]) / t : 0)); return o; });
    const x = d3.scaleBand(Y, [m.l, w - m.r]).padding(0.18);
    const y = d3.scaleLinear([0, 100], [h - m.b, m.t]);
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis y").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => v + " %").tickPadding(6));
    svg.append("g").attr("class", "axis x").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickSizeOuter(0).tickValues(Y.filter((_, i) => (LAST - i) % (w > 900 ? 2 : 5) === 0)));
    rows.forEach((r) => { let y0 = 0; ART.forEach((a, k) => { const v = r[a.id + "p"]; svg.append("rect").attr("x", x(r.x)).attr("width", x.bandwidth()).attr("y", y(y0 + v)).attr("height", Math.max(0, y(y0) - y(y0 + v) - (k ? 1 : 0))).attr("fill", a.color); y0 += v; }); });
    const hl = svg.append("rect").attr("class", "bar-hl").attr("y", m.t).attr("height", h - m.b - m.t).style("display", "none");
    svg.append("g").selectAll("rect").data(rows).join("rect").attr("class", "hit").attr("x", (r) => x(r.x) - 2).attr("width", x.step()).attr("y", m.t).attr("height", h - m.b - m.t)
      .on("mousemove", (e, r) => { hl.style("display", null).attr("x", x(r.x) - 2).attr("width", x.bandwidth() + 4); tip.show(`<div class="tt-title">${S.escapeHtml(nm(f))} · ${r.x}</div>${ART.slice().reverse().map((a) => `<div class="tt-row"><span><span class="key" style="background:${a.color}"></span>${a.name}</span><b>${S.pct(r[a.id + "p"], 0)} <span class="faint">${big(r[a.id] * 1e6 * defl(r.x))}</span></b></div>`).join("")}`, e.clientX, e.clientY); })
      .on("mouseleave", () => { tip.hide(); hl.style("display", "none"); });
  }

  // ---------------------------------------------------------------- tabell
  function table() {
    const i = LAST;
    const rows = d.formaal.filter((f) => f.code !== "0").map((f) => ({ id: f.code, code: f.code, name: nm(f), level: f.code.length === 2 ? "Hovedformål" : nm(F[f.parent]), off: val(f, i), pc: pc(val(f, i), i), stat: val(f, i, "stat"), komm: val(f, i, "komm"), share: (100 * f.off[i]) / F["0"].off[i] }));
    document.getElementById("tbl-sub").textContent = `${Y[i]}, ${real ? `faste ${baseYear}-kroner` : "løpende kroner"}. Staten inkluderer overføringer til kommunene.`;
    const fb = (v) => (v == null ? "–" : big(v));
    S.sortableTable(document.getElementById("table"), [
      { key: "code", label: "Kode", text: true }, { key: "name", label: "Formål", text: true }, { key: "level", label: "Del av", text: true },
      { key: "off", label: "Stat og kommune", fmt: fb }, { key: "pc", label: "Per innbygger", fmt: (v) => S.kr(v && Math.round(v)) }, { key: "share", label: "Andel", fmt: (v) => S.pct(v, 1) },
      { key: "stat", label: "Staten", fmt: fb }, { key: "komm", label: "Kommunene", fmt: fb },
    ], rows, { sortKey: "off", dir: -1 });
    document.getElementById("csv").onclick = () => S.downloadCsv("offentlige-utgifter-etter-formaal.csv", [
      ["Kode", "Formål", "Sektor", ...Y], ...d.formaal.flatMap((f) => [["off", "Stat og kommune"], ["stat", "Staten"], ["komm", "Kommunene"]].map(([k, l]) => [f.code, f.name, l, ...f[k].map((v) => v ?? "")])),
    ]);
  }

  function renderAll() { lead(); receipt(); treemap(); stackedArea(); growth(); split(); arts(); table(); }
  document.querySelectorAll("#real button").forEach((b) => (b.onclick = () => { real = b.dataset.v === "real"; document.querySelectorAll("#real button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); renderAll(); }));
  renderAll();
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { treemap(); stackedArea(); arts(); }, 200); });
  document.getElementById("updated").textContent = "Data oppdatert av SSB " + new Date(d.updated).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" });
})();
