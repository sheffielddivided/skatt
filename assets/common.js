/* Felles hjelpefunksjoner for Skatt i tall */
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
  const STUDIES = [
    ["./", "Oversikt"], ["kart.html", "Skattekartet"], ["utgifter.html", "Skattepengene"], ["oljepenger.html", "Oljepengene"],
    ["petroleum.html", "Petroleumsskatten"], ["formue.html", "Formuesskatten"], ["eiendomsskatt.html", "Eiendomsskatten"],
    ["profil.html", "Kommuneprofilen"], ["naering.html", "Næringslivet"], ["alder.html", "Aldersbølgen"],
    ["befolkning.html", "Befolkningen"], ["ulikhet.html", "Ulikhet"],
  ];
  function renderNav() {
    const nav = document.querySelector("nav.nav");
    if (!nav) return;
    const page = location.pathname.split("/").pop() || "./";
    const cur = page === "index.html" ? "./" : page;
    nav.innerHTML = STUDIES.map(([href, name]) => `<a href="${href}"${href === cur ? ' aria-current="page"' : ""}>${name}</a>`).join("");
    const active = nav.querySelector('[aria-current="page"]');
    if (active && active.offsetLeft + active.offsetWidth > nav.clientWidth) nav.scrollLeft = active.offsetLeft - 40;
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

  window.Skatt = { isDark, onThemeChange, mill, kr, int, pct, signed, nf0, nf1, MONTHS, MONTHS_SHORT, tooltip, escapeHtml, downloadCsv, sortableTable };
})();
