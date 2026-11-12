/* Felles hjelpefunksjoner for Norge ASA */
(function () {
  const root = document.documentElement;

  // ---------- Tema ----------
  function storedTheme() {
    try { return localStorage.getItem("theme"); } catch (e) { return null; }
  }
  function applyTheme(t) {
    if (t === "light" || t === "dark") root.setAttribute("data-theme", t);
    else root.removeAttribute("data-theme");
  }
  applyTheme(storedTheme());

  function isDark() {
    const t = root.getAttribute("data-theme");
    if (t) return t === "dark";
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  const themeListeners = [];
  function onThemeChange(fn) { themeListeners.push(fn); }
  function fireTheme() { themeListeners.forEach((fn) => fn(isDark())); }
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", fireTheme);
  }

  // ---------- Felles meny ----------
  const SITE = { name: "Norge ASA", tagline: "Skatt, velferd og samfunn i tall" };
  const MENU = [
    { group: "Skatt", items: [
      ["kart.html", "Skattekartet", "Skatteinngang i kommuner og fylker"],
      ["petroleum.html", "Petroleumsskatten", "Skatt fra olje og gass over tid"],
      ["formue.html", "Formuesskatten", "Formuesskatt og utflytting"],
      ["eiendomsskatt.html", "Eiendomsskatten", "Kommunenes egen skatt"],
    ] },
    { group: "Pengebruk", items: [
      ["utgifter.html", "Hvor går skattepengene?", "Offentlige utgifter etter formål"],
      ["oljepenger.html", "Oljepengene", "Inn i fondet og ut i budsjettet"],
    ] },
    { group: "Kommuner", items: [
      ["profil.html", "Kommuneprofilen", "Sammenhenger mellom 21 indikatorer"],
      ["naering.html", "Næringslivet", "Hva kommunene lever av"],
      ["ulikhet.html", "Inntektsulikhet", "Forskjeller og lavinntekt"],
      ["kommunehverdag.html", "Leger, hytter og snøscootere", "Kommune-Norge i morsomme tall"],
      ["brann.html", "Boligbranner", "Brann, boligpris og flytting i kommunene"],
      ["sykefravaer.html", "Sykefraværet", "Legemeldt sykefravær i alle kommuner"],
    ] },
    { group: "Befolkning", items: [
      ["alder.html", "Aldersbølgen", "Befolkningspyramider 1986–i dag"],
      ["befolkning.html", "Befolkningsutviklingen", "Fødsler, innvandring og flytting"],
    ] },
    { group: "Internasjonalt", items: [
      ["europa.html", "Norge i Europa", "Norge sammenlignet med 29 land"],
      ["hverdag.html", "Leger, lærere og våpen", "Hverdagen i Europa – fra leger til biler"],
      ["handel.html", "Handelen med verden", "Eksport og import – med og uten olje og gass"],
      ["elbil.html", "Elbiler i verden", "Andel av nybilsalg og bilpark i 60 land"],
      ["bolig.html", "Boligpriser i verden", "Boligpriser, husleie og inntekt i 50 land"],
      ["inflasjon.html", "Inflasjon i verden", "Prisvekst, rente, pengemengde og budsjett i 190 land"],
      ["rettsstat.html", "Rettsstaten i verden", "Korrupsjon, rettigheter og domstoler i 143 land"],
    ] },
  ];
  const STUDIES = [["./", "Oversikt"], ...MENU.flatMap((g) => g.items.map(([h, n]) => [h, n]))];
  const chevron = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  function renderNav() {
    document.querySelectorAll(".brand-text").forEach((b) => (b.textContent = SITE.name));
    const nav = document.querySelector("nav.nav");
    if (!nav) return;
    const page = location.pathname.split("/").pop() || "./";
    const cur = page === "index.html" ? "./" : page;
    const link = ([h, n, desc]) => `<a href="${h}"${h === cur ? ' aria-current="page"' : ""}><span>${n}</span>${desc ? `<small>${desc}</small>` : ""}</a>`;
    nav.innerHTML = `<a class="top" href="./"${cur === "./" ? ' aria-current="page"' : ""}>Oversikt</a>` + MENU.map((g, k) => {
      const active = g.items.some(([h]) => h === cur);
      return `<div class="dd${active ? " active" : ""}"><button class="dd-btn" aria-expanded="false" aria-controls="dd-${k}">${g.group}${chevron}</button><div class="dd-menu card" id="dd-${k}" role="menu">${g.items.map(link).join("")}</div></div>`;
    }).join("");
    const closeAll = (except) => nav.querySelectorAll(".dd").forEach((d) => { if (d !== except) { d.classList.remove("open"); d.querySelector(".dd-btn").setAttribute("aria-expanded", "false"); } });
    nav.querySelectorAll(".dd").forEach((dd) => {
      const btn = dd.querySelector(".dd-btn");
      btn.addEventListener("click", (e) => { e.stopPropagation(); const open = !dd.classList.contains("open"); closeAll(dd); dd.classList.toggle("open", open); btn.setAttribute("aria-expanded", String(open)); });
    });
    document.addEventListener("click", () => closeAll());
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeAll(); closeDrawer(); } });

    // Mobilmeny
    const bar = nav.parentElement;
    const burger = document.createElement("button");
    burger.className = "icon-btn burger";
    burger.setAttribute("aria-label", "Meny");
    burger.setAttribute("aria-expanded", "false");
    burger.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
    bar.appendChild(burger);
    const drawer = document.createElement("div");
    drawer.className = "drawer";
    drawer.hidden = true;
    drawer.innerHTML = `<div class="drawer-inner">${link(["./", "Oversikt"])}${MENU.map((g) => `<div class="dg"><div class="eyebrow">${g.group}</div>${g.items.map(link).join("")}</div>`).join("")}</div>`;
    document.querySelector(".topbar").appendChild(drawer);
    function closeDrawer() { drawer.hidden = true; burger.setAttribute("aria-expanded", "false"); document.body.classList.remove("no-scroll"); }
    burger.addEventListener("click", (e) => { e.stopPropagation(); const open = drawer.hidden; drawer.hidden = !open; burger.setAttribute("aria-expanded", String(open)); document.body.classList.toggle("no-scroll", open); });
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderNav();
    const btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.addEventListener("click", () => {
        const next = isDark() ? "light" : "dark";
        applyTheme(next);
        try { localStorage.setItem("theme", next); } catch (e) { /* ignorer */ }
        fireTheme();
      });
    }
  });

  // ---------- Tallformat ----------
  const nf0 = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /** Formatterer et beløp gitt i millioner kroner. */
  function mill(v, opts = {}) {
    if (v == null || !isFinite(v)) return "–";
    const a = Math.abs(v);
    if (a >= 1000) return (a >= 100000 ? nf0 : nf1).format(v / 1000) + (opts.short ? " mrd." : " mrd. kr");
    if (a >= 1) return nf0.format(v) + (opts.short ? " mill." : " mill. kr");
    return nf0.format(v * 1000) + (opts.short ? " k" : " tusen kr");
  }
  function kr(v) { return v == null || !isFinite(v) ? "–" : nf0.format(v) + " kr"; }
  function int(v) { return v == null || !isFinite(v) ? "–" : nf0.format(v); }
  function pct(v, digits = 1, sign = false) {
    if (v == null || !isFinite(v)) return "–";
    const s = (digits === 0 ? nf0 : digits === 2 ? nf2 : nf1).format(v) + " %";
    return sign && v > 0 ? "+" + s : s.replace("-", "−");
  }
  function signed(s, v) { return v > 0 ? "+" + s : s.replace("-", "−"); }

  const MONTHS = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
  const MONTHS_SHORT = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];

  // ---------- Tooltip ----------
  function tooltip() {
    let el = document.querySelector(".tooltip");
    if (!el) {
      el = document.createElement("div");
      el.className = "tooltip";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    return {
      show(html, x, y) {
        el.innerHTML = html;
        el.classList.add("show");
        const r = el.getBoundingClientRect();
        let left = x + 14, top = y + 14;
        if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
        if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
        el.style.left = Math.max(8, left) + "px";
        el.style.top = Math.max(8, top) + "px";
      },
      hide() { el.classList.remove("show"); },
    };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function downloadCsv(filename, rows) {
    const csv = rows.map((r) => r.map((c) => {
      const s = c == null ? "" : String(c);
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /** Sorterbar tabell. cols: [{key,label,fmt,num}] */
  function sortableTable(container, cols, rows, opts = {}) {
    let sortKey = opts.sortKey || cols[0].key, dir = opts.dir || -1;
    function render() {
      const sorted = rows.slice().sort((a, b) => {
        const x = a[sortKey], y = b[sortKey];
        if (x == null) return 1; if (y == null) return -1;
        return (typeof x === "string" ? x.localeCompare(y, "nb") : x - y) * dir;
      });
      container.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr>${cols.map((c) =>
        `<th scope="col" data-k="${c.key}" ${c.text ? 'class="t"' : ""} ${c.key === sortKey ? `aria-sort="${dir > 0 ? "ascending" : "descending"}"` : ""}>${c.label}</th>`).join("")}</tr></thead><tbody>${sorted.map((r) =>
        `<tr ${opts.onRow ? `class="clickable" data-id="${escapeHtml(r.id)}"` : ""}>${cols.map((c) => `<td${c.text ? ' class="t"' : ""}>${c.fmt ? c.fmt(r[c.key], r) : escapeHtml(r[c.key] ?? "–")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      container.querySelectorAll("th").forEach((th) => th.addEventListener("click", () => {
        const k = th.dataset.k;
        if (k === sortKey) dir = -dir; else { sortKey = k; dir = typeof rows[0]?.[k] === "string" ? 1 : -1; }
        render();
      }));
      if (opts.onRow) container.querySelectorAll("tbody tr").forEach((tr) => tr.addEventListener("click", () => opts.onRow(tr.dataset.id)));
    }
    render();
    return { update(newRows) { rows = newRows; render(); } };
  }


  // ---------------------------------------------------------------- statistikk
  // Signifikanstest for en korrelasjon r med n observasjoner: tosidig t-test av H0 «ingen sammenheng»
  // (t = r·√((n−2)/(1−r²)), n−2 frihetsgrader) og 95 % konfidensintervall via Fishers z.
  // vf = variansfaktor for z (1 for Pearson, 1,06 for Spearman).
  function lgamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t);
    let ser = 1.000000000190015; for (const ci of c) ser += ci / ++y;
    return -t + Math.log((2.5066282746310005 * ser) / x);
  }
  function betacf(a, b, x) {
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - (qab * x) / qap;
    d = 1 / (Math.abs(d) < 1e-300 ? 1e-300 : d); let h = d;
    for (let m = 1; m <= 300; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d; d = 1 / (Math.abs(d) < 1e-300 ? 1e-300 : d); c = 1 + aa / c; c = Math.abs(c) < 1e-300 ? 1e-300 : c; h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d; d = 1 / (Math.abs(d) < 1e-300 ? 1e-300 : d); c = 1 + aa / c; c = Math.abs(c) < 1e-300 ? 1e-300 : c;
      const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-12) break;
    }
    return h;
  }
  function ibeta(a, b, x) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
  }
  function signif(r, n, vf = 1) {
    const df = n - 2, t = r * Math.sqrt(df / Math.max(1e-12, 1 - r * r));
    const p = ibeta(df / 2, 0.5, df / (df + t * t));
    const z = Math.atanh(r), se = Math.sqrt(vf / (n - 3));
    return { t, df, p, lo: Math.tanh(z - 1.96 * se), hi: Math.tanh(z + 1.96 * se) };
  }
  const fmtP = (p) => (p == null || !isFinite(p) ? "–" : p < 0.001 ? "p < 0,001" : `p = ${p < 0.01 ? p.toFixed(3) : p.toFixed(2)}`.replace(".", ","));
  const stats = { signif, ibeta, fmtP };

  window.Skatt = { stats, SITE, MENU, isDark, onThemeChange, mill, kr, int, pct, signed, nf0, nf1, MONTHS, MONTHS_SHORT, tooltip, escapeHtml, downloadCsv, sortableTable };
})();
