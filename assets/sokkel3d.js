/* Studie 23 – feltene i 3D: hvert felt er en topp der det ligger, like høy som produksjonen det året.
   Toppene legges sammen der feltene ligger tett, så klynger av felt blir til rygger. */
import * as THREE from "three";
import { MapControls } from "three/addons/controls/MapControls.js";

const S = window.Skatt;
const tip = S.tooltip();
const $ = (id) => document.getElementById(id);
const view = $("r3-view");

const [d, no, world] = await Promise.all([
  fetch("data/sokkel.json").then((r) => r.json()),
  fetch("data/norge-2024.topo.json").then((r) => r.json()),
  fetch("data/verden.topo.json").then((r) => r.json()),
]);

// ---------------------------------------------------------------- data
const P = d.partial;
const Y0 = d.years[0];
const lastFull = P ? P.year - 1 : d.years[d.years.length - 1];
const years = d.years.filter((y) => y <= lastFull);
const NY = years.length;
const AREA = { "North sea": "Nordsjøen", "Norwegian sea": "Norskehavet", "Barents sea": "Barentshavet" };
const fm = (v) => S.nf0.format(v);
const fm1 = (v) => S.nf1.format(v);

// Kart i kilometer: kjegleprojeksjon med jordradius som skala gir x/y i km.
const proj = d3.geoConicConformal().parallels([60, 70]).rotate([-12, 0]).center([0, 64]).scale(6371).translate([0, 0]);

const F = d.fields.filter((f) => f.lon != null).map((f) => {
  const oe = new Float32Array(NY), gas = new Float32Array(NY), cOe = new Float32Array(NY), cGas = new Float32Array(NY);
  let a = 0, b = 0;
  years.forEach((y, i) => {
    const k = y - f.y0;
    if (k >= 0 && k < f.oe.length) { oe[i] = f.oe[k]; gas[i] = Math.min(f.gas[k], f.oe[k]); }
    a += oe[i]; b += gas[i]; cOe[i] = a; cGas[i] = b;
  });
  const [x, z] = proj([f.lon, f.lat]);
  return { name: f.name, area: AREA[f.area] || f.area, start: f.start, disc: f.disc, x, z, oe, gas, cOe, cGas };
});
const byName = (n) => F.find((f) => f.name === n);
const iY = (y) => Math.max(0, Math.min(NY - 1, y - Y0));
const at = (arr, t) => { const i = Math.floor(t - Y0), u = t - Y0 - i; if (i < 0) return 0; if (i >= NY - 1) return arr[NY - 1]; return arr[i] * (1 - u) + arr[i + 1] * u; };
const maxYear = d3.max(F, (f) => d3.max(f.oe));
const maxCum = d3.max(F, (f) => f.cOe[NY - 1]);

// ---------------------------------------------------------------- tekstene
const sumWhere = (y, pred) => d3.sum(F.filter(pred), (f) => f.oe[iY(y)]);
const total = (y) => sumWhere(y, () => true);
const live = (y) => F.filter((f) => f.oe[iY(y)] > 0).sort((a, b) => b.oe[iY(y)] - a.oe[iY(y)]);
const list = (arr, y, n = 3) => arr.slice(0, n).map((f) => `${f.name} (${fm(f.oe[iY(y)])})`).join(", ");
const peakOf = (f) => years[d3.maxIndex(f.oe)];
const best = (() => { let r = null; F.forEach((f) => f.oe.forEach((v, i) => { if (!r || v > r.v) r = { f, y: years[i], v }; })); return r; })();
const areaPeak = (a) => years[d3.maxIndex(years, (y) => sumWhere(y, (f) => f.area === a))];
const pkTot = years[d3.maxIndex(years, total)];
const b = (s) => `<b>${s}</b>`;
const ek = byName("Ekofisk"), sf = byName("Statfjord"), gf = byName("Gullfaks"), js = byName("Johan Sverdrup"), tr = byName("Troll");

const STEPS = [];
{
  const y = Math.min(lastFull, 1978), l = live(y);
  STEPS.push({ y, mode: "year", v: [3.0, 56.9, 760, 58, -12, 50], h: `Ekofisk, 1971–${y}`,
    p: `Ekofisk startet i ${ek ? ek.start : 1971}, og de første årene var det i praksis det eneste feltet. I ${y} kom det olje og gass fra ${b(l.length + " felt")}: ${list(l, y, 4)} mill. Sm³ o.e. Til sammen ${b(fm(total(y)) + " mill. Sm³ o.e.")}` });
}
if (sf) {
  const y = peakOf(sf), before = F.every((f) => f === sf || d3.max(f.oe.slice(0, iY(y) + 1)) <= sf.oe[iY(y)]);
  STEPS.push({ y, mode: "year", v: [2.4, 61.0, 1000, 60, -18, 110], h: `Statfjord, ${y}`,
    p: `Lenger nord, ved grensen mot britisk sektor, nådde Statfjord toppen i ${y} med ${b(fm(sf.oe[iY(y)]) + " mill. Sm³ o.e.")}${before ? ", mer enn noe norsk felt hadde produsert på ett år før det" : ""}. ${gf ? `Gullfaks like ved ga ${fm(gf.oe[iY(y)])} mill. Sm³.` : ""} Hele sokkelen produserte ${fm(total(y))} mill. Sm³ o.e. fra ${live(y).length} felt.` });
}
{
  const y = pkTot, l = live(y);
  STEPS.push({ y, mode: "year", v: [3.6, 60.2, 1900, 54, -12, 90], h: `Toppåret ${y}`,
    p: `${b(l.length + " felt")} produserte til sammen ${b(fm(total(y)) + " mill. Sm³ o.e.")} ${sf && d3.max(l, (f) => f.oe[iY(y)]) < d3.max(sf.oe) ? "Ingen av dem var så store som Statfjord på sitt beste. " : ""}De største var ${list(l, y)} mill. Sm³. Toppen ble bygget av mange felt, ikke av noen få giganter.` });
}
{
  const a = "Norskehavet", y = areaPeak(a), l = live(y).filter((f) => f.area === a), v = sumWhere(y, (f) => f.area === a);
  STEPS.push({ y, mode: "year", v: [7.0, 65.0, 1100, 58, -20, 70], h: `Norskehavet, ${y}`,
    p: `Feltene i Norskehavet produserte mest i ${y}: ${b(fm(v) + " mill. Sm³ o.e.")}, ${fm(100 * v / total(y))} % av hele sokkelen. Størst var ${list(l, y)} mill. Sm³. Her er det mer gass, og toppene er blåere enn i Nordsjøen.` });
}
{
  const a = "Barentshavet", y = lastFull, fl = F.filter((f) => f.area === a).sort((p, q) => p.start - q.start), v = sumWhere(y, (f) => f.area === a);
  STEPS.push({ y, mode: "year", v: [21.0, 71.4, 900, 58, -15, 30], h: `Barentshavet, ${y}`,
    p: `Lengst nord ${fl.map((f) => `${f.name} (fra ${f.start})`).join(", ")}. I ${y} produserte Barentshavet ${b(fm(v) + " mill. Sm³ o.e.")}, ${fm(100 * v / total(y))} % av sokkelen.` });
}
if (js) {
  const y = lastFull, v = js.oe[iY(y)];
  STEPS.push({ y, mode: "year", v: [2.8, 58.9, 1000, 60, -20, 110], h: `Johan Sverdrup, ${y}`,
    p: `Det høyeste tårnet på sokkelen i dag. Johan Sverdrup produserte ${b(fm(v) + " mill. Sm³ o.e.")} i ${y}, ${fm(100 * v / total(y))} % av alt. ${best.f === js ? "Det er mer enn noe norsk felt har produsert på ett år." : `Rekorden for ett felt på ett år har fortsatt ${best.f.name} fra ${best.y}, med ${fm(best.v)} mill. Sm³.`}` });
}
{
  const y = lastFull, top = F.slice().sort((p, q) => q.cOe[NY - 1] - p.cOe[NY - 1]), all = d3.sum(F, (f) => f.cOe[NY - 1]);
  const share10 = 100 * d3.sum(top.slice(0, 10), (f) => f.cOe[NY - 1]) / all;
  const ns = 100 * d3.sum(F.filter((f) => f.area === "Nordsjøen"), (f) => f.cOe[NY - 1]) / all;
  STEPS.push({ y, mode: "cum", v: [5.5, 61.8, 2600, 52, -12, 120], h: `Alt siden ${years[0]}`,
    p: `Nå viser hver topp alt feltet har produsert til og med ${y}, til sammen ${b(S.nf1.format(all / 1000) + " milliarder Sm³ o.e.")} ${top.slice(0, 3).map((f) => `${f.name} ${fm(f.cOe[NY - 1])}`).join(", ")} mill. Sm³ er de største. De ti største feltene står for ${b(fm(share10) + " %")} av alt, og Nordsjøen for ${fm(ns)} %.` });
}

// ---------------------------------------------------------------- tegning
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (e) {
  view.innerHTML = `<div class="r3-fallback">Nettleseren din kan ikke vise 3D-grafikk (WebGL), så kartet vises ikke. Tallene finnes i tabellen lenger ned.</div>`;
  throw e;
}
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
view.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1.6, 20, 40000);
const controls = new MapControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.screenSpacePanning = false;
controls.maxPolarAngle = 1.38;
controls.minDistance = 120;
controls.maxDistance = 7000;
controls.zoomSpeed = 0.8;

const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.9);
const sun = new THREE.DirectionalLight(0xffffff, 1.9);
sun.position.set(-600, 900, -300);
scene.add(hemi, sun);

const css = () => getComputedStyle(document.documentElement);
const col = (name) => new THREE.Color(css().getPropertyValue(name).trim());
let C = {};
function readColors() {
  C = { sea: col("--sea"), land: col("--map-empty"), line: col("--border"), oil: col("--series-2"), gas: col("--series-1") };
  scene.background = C.sea;
  // Olje → nøytral → gass, blandet i Lab-rom, så et felt med begge deler blir gråaktig i stedet for grumsete lilla.
  const mix = d3.scaleLinear().domain([0, 0.5, 1]).range([css().getPropertyValue("--series-2").trim(), css().getPropertyValue("--neutral-mark").trim(), css().getPropertyValue("--series-1").trim()]).interpolate(d3.interpolateLab);
  C.lut = d3.range(65).map((i) => new THREE.Color(mix(i / 64)));
}
readColors();

// Havflate, gradnett og land
const seaMat = new THREE.MeshLambertMaterial({ color: C.sea });
const sea = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000).rotateX(-Math.PI / 2), seaMat);
sea.position.y = -0.5;
scene.add(sea);

const gratPts = [];
d3.geoGraticule().extent([[-12, 50], [40, 78]]).step([2, 1]).lines().forEach((ln) => {
  const pts = ln.coordinates;
  for (let i = 1; i < pts.length; i++) {
    // fortett linjene så de følger projeksjonen
    for (let k = 0; k < 4; k++) {
      const a = d3.geoInterpolate(pts[i - 1], pts[i]);
      const p = proj(a(k / 4)), q = proj(a((k + 1) / 4));
      gratPts.push(p[0], 0.6, p[1], q[0], 0.6, q[1]);
    }
  }
});
const gratGeo = new THREE.BufferGeometry();
gratGeo.setAttribute("position", new THREE.Float32BufferAttribute(gratPts, 3));
const gratMat = new THREE.LineBasicMaterial({ color: C.line });
scene.add(new THREE.LineSegments(gratGeo, gratMat));

const landMat = new THREE.MeshLambertMaterial({ color: C.land });
function addLand(geom, minArea) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
  const shapes = [];
  polys.forEach((poly) => {
    const ring = poly[0].map((c) => proj(c));
    if (Math.abs(d3.polygonArea(ring)) < minArea) return;
    let pts = ring.map(([x, y]) => new THREE.Vector2(x, -y));
    if (THREE.ShapeUtils.isClockWise(pts)) pts = pts.reverse();
    shapes.push(new THREE.Shape(pts));
  });
  if (!shapes.length) return;
  const g = new THREE.ExtrudeGeometry(shapes, { depth: 6, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  scene.add(new THREE.Mesh(g, landMat));
}
addLand(topojson.merge(no, no.objects.fylker.geometries), 15);
topojson.feature(world, world.objects.land).features
  .filter((f) => f.properties.id !== "NOR" && d3.geoBounds(f)[1][1] > 50 && d3.geoBounds(f)[0][0] < 45 && d3.geoBounds(f)[1][0] > -15)
  .forEach((f) => addLand(f.geometry, 40));

// Høydefeltet: et rutenett over alle feltene, 4 km mellom punktene
const CELL = 4, R = 30;
const x0 = d3.min(F, (f) => f.x) - R - 8, x1 = d3.max(F, (f) => f.x) + R + 8;
const z0 = d3.min(F, (f) => f.z) - R - 8, z1 = d3.max(F, (f) => f.z) + R + 8;
const NX = Math.ceil((x1 - x0) / CELL) + 1, NZ = Math.ceil((z1 - z0) / CELL) + 1, NV = NX * NZ;
const pos = new Float32Array(NV * 3), colr = new Float32Array(NV * 3);
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const v = (j * NX + i) * 3; pos[v] = x0 + i * CELL; pos[v + 2] = z0 + j * CELL; }
const idx = new Uint32Array((NX - 1) * (NZ - 1) * 6);
{ let k = 0; for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) { const a = j * NX + i, b2 = a + 1, c = a + NX, e = c + 1; idx[k++] = a; idx[k++] = c; idx[k++] = b2; idx[k++] = b2; idx[k++] = c; idx[k++] = e; } }
const geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
geo.setAttribute("color", new THREE.BufferAttribute(colr, 3));
geo.setIndex(new THREE.BufferAttribute(idx, 1));
const fieldMat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
const mesh = new THREE.Mesh(geo, fieldMat);
scene.add(mesh);

// Hvert felt får en fast liste over punktene det løfter, med vekt 1 midt i toppen og 0 ved foten.
const kern = (dist) => Math.pow(Math.max(0, 1 - dist / R), 1.9);
F.forEach((f) => {
  const ci = Math.round((f.x - x0) / CELL), cj = Math.round((f.z - z0) / CELL), rr = Math.ceil(R / CELL);
  const ids = [], ws = [];
  for (let j = cj - rr; j <= cj + rr; j++) for (let i = ci - rr; i <= ci + rr; i++) {
    if (i < 0 || j < 0 || i >= NX || j >= NZ) continue;
    const w = kern(Math.hypot(x0 + i * CELL - f.x, z0 + j * CELL - f.z));
    if (w > 0) { ids.push(j * NX + i); ws.push(w); }
  }
  const m = Math.max(...ws);
  f.ids = Uint32Array.from(ids); f.ws = Float32Array.from(ws.map((w) => w / m));
});

const H = new Float32Array(NV), G = new Float32Array(NV);
const KY = 260 / maxYear, KC = 360 / maxCum;
let state = { t: years[years.length - 1], m: 0 }; // m = 0: hvert år, 1: til sammen
const hOf = (f, t, m) => (1 - m) * at(f.oe, t) * KY + m * at(f.cOe, t) * KC;
const gOf = (f, t, m) => (1 - m) * at(f.gas, t) * KY + m * at(f.cGas, t) * KC;
function rebuild() {
  H.fill(0); G.fill(0);
  const { t, m } = state;
  F.forEach((f) => {
    const h = hOf(f, t, m);
    if (h <= 0) return;
    const g = gOf(f, t, m);
    f.h = h;
    for (let k = 0; k < f.ids.length; k++) { H[f.ids[k]] += h * f.ws[k]; G[f.ids[k]] += g * f.ws[k]; }
  });
  const tmp = new THREE.Color();
  for (let v = 0; v < NV; v++) {
    const h = H[v];
    pos[v * 3 + 1] = h;
    if (h < 0.05) { colr[v * 3] = C.sea.r; colr[v * 3 + 1] = C.sea.g; colr[v * 3 + 2] = C.sea.b; continue; }
    tmp.copy(C.lut[Math.round(64 * Math.min(1, G[v] / h))]);
    // svake høydebånd gir toppene form, og foten glir over i havet
    const band = Math.floor(h / 18) % 2 ? 0.93 : 1;
    tmp.multiplyScalar(band).lerp(C.sea, 1 - Math.min(1, h / 8));
    colr[v * 3] = tmp.r; colr[v * 3 + 1] = tmp.g; colr[v * 3 + 2] = tmp.b;
  }
  geo.attributes.position.needsUpdate = true;
  geo.attributes.color.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  head();
  dirty = true;
}

// ---------------------------------------------------------------- overskrift og navnelapper
function head() {
  const { t, m } = state, y = Math.round(t);
  const cum = m > 0.5;
  const sum = (key) => d3.sum(F, (f) => at(cum ? f[key === "gas" ? "cGas" : "cOe"] : f[key], t));
  const oe = sum("oe"), gas = sum("gas"), n = F.filter((f) => at(cum ? f.cOe : f.oe, t) > 0).length;
  $("r3-year").textContent = cum ? `${years[0]}–${y}` : String(y);
  $("r3-sub").innerHTML = `${cum ? S.nf1.format(oe / 1000) + " mrd." : fm(oe) + " mill."} Sm³ o.e. fra ${n} felt<br><span class="k" style="background:var(--series-2)"></span>olje og væsker ${cum ? S.nf1.format((oe - gas) / 1000) : fm(oe - gas)}<span class="k" style="background:var(--series-1)"></span>gass ${cum ? S.nf1.format(gas / 1000) : fm(gas)}`;
  $("r3-note").textContent = cum ? `Høyde: alt feltet har produsert til og med ${y}` : "Høyde: feltets produksjon i året som vises";
}

const PLACES = [["Nordsjøen", 4.2, 57.6, 1], ["Norskehavet", 4.5, 67.4, 1], ["Barentshavet", 27, 73.2, 1], ["Norge", 9.5, 61.6, 0], ["Sverige", 15.2, 62.5, 0], ["Storbritannia", -3.2, 56.9, 0], ["Danmark", 9.2, 56.0, 0]]
  .map(([n, lo, la, s]) => { const [x, z] = proj([lo, la]); return { n, v: new THREE.Vector3(x, 8, z), s }; });
const labelsEl = $("r3-labels");
const vtmp = new THREE.Vector3();
function toScreen(v, w, h) {
  vtmp.copy(v).project(camera);
  if (vtmp.z > 1) return null;
  return [(vtmp.x + 1) / 2 * w, (1 - vtmp.y) / 2 * h];
}
function labels() {
  const w = view.clientWidth, h = view.clientHeight;
  let html = "";
  PLACES.forEach((p) => { const s = toScreen(p.v, w, h); if (s && s[0] > 40 && s[0] < w - 40 && s[1] > 20 && s[1] < h - 20) html += `<div class="r3-place${p.s ? "" : " land"}" style="left:${s[0]}px;top:${s[1]}px">${p.n}</div>`; });
  const { t, m } = state, cum = m > 0.5;
  const hd = $("r3-head") || view.querySelector(".r3-head"), tl = view.querySelector(".r3-tools");
  const placed = [{ x0: 0, y0: 0, x1: hd.offsetWidth, y1: hd.offsetHeight }, { x0: tl.offsetLeft, y0: tl.offsetTop, x1: w, y1: h }];
  const cand = F.filter((f) => hOf(f, t, m) > 4).sort((a, c) => hOf(c, t, m) - hOf(a, t, m)).slice(0, 14);
  let n = 0;
  for (const f of cand) {
    if (n >= 6) break;
    const top = H[f.ids[d3.maxIndex(f.ws)]] || 0;
    if (hOf(f, t, m) < 0.35 * top) continue; // feltet er gjemt i toppen til en større nabo
    const s = toScreen(vtmp.set(f.x, top, f.z), w, h);
    if (!s || s[0] < 10 || s[0] > w - 10 || s[1] < 10 || s[1] > h) continue;
    const val = cum ? at(f.cOe, t) : at(f.oe, t);
    const txt = `${fm(val)} mill. Sm³`, bw = Math.max(f.name.length, txt.length) * 7 + 22, bh = 40;
    const free = (box) => box.y0 >= 4 && box.x0 >= 4 && box.x1 <= w - 4 && box.y1 <= h - 4 && !placed.some((o) => box.x0 < o.x1 + 4 && box.x1 > o.x0 - 4 && box.y0 < o.y1 + 4 && box.y1 > o.y0 - 4);
    let done = false;
    for (const stem of [24, 58, 96]) {
      const box = { x0: s[0] - bw / 2, x1: s[0] + bw / 2, y0: s[1] - stem - bh, y1: s[1] - stem + 4 };
      if (!free(box)) continue;
      placed.push(box);
      html += `<div class="r3-lab" style="left:${s[0]}px;top:${s[1]}px"><div class="box">${S.escapeHtml(f.name)}<b>${txt}</b></div><div class="stem" style="height:${stem}px"></div></div>`;
      done = true;
      break;
    }
    // Ikke plass over toppen: legg lappen ved siden av, med en vannrett strek
    for (const side of done ? [] : [1, -1]) {
      const x = side > 0 ? s[0] + 18 : s[0] - 18 - bw;
      const box = { x0: x, x1: x + bw, y0: s[1] - bh / 2, y1: s[1] + bh / 2 };
      if (!free(box)) continue;
      placed.push(box);
      html += `<div class="r3-lab side" style="left:${box.x0}px;top:${box.y0}px"><div class="box">${S.escapeHtml(f.name)}<b>${txt}</b></div></div><div class="r3-hstem" style="left:${side > 0 ? s[0] : box.x1}px;top:${s[1]}px;width:18px"></div>`;
      done = true;
      break;
    }
    if (done) n++;
  }
  labelsEl.innerHTML = html;
  $("r3-north").querySelector("svg").style.transform = `rotate(${-controls.getAzimuthalAngle() * 180 / Math.PI}deg)`;
}

// ---------------------------------------------------------------- kamera og overganger
const sph = new THREE.Spherical();
function viewOf([lon, lat, dist, polar, az, ty = 80]) {
  const [x, z] = proj([lon, lat]);
  return { target: new THREE.Vector3(x, ty, z), r: dist, phi: polar * Math.PI / 180, theta: az * Math.PI / 180 };
}
function curView() {
  sph.setFromVector3(vtmp.copy(camera.position).sub(controls.target));
  return { target: controls.target.clone(), r: sph.radius, phi: sph.phi, theta: sph.theta };
}
function setView(v) {
  controls.target.copy(v.target);
  sph.set(v.r, v.phi, v.theta);
  camera.position.setFromSpherical(sph).add(v.target);
  camera.lookAt(v.target);
}
let tween = null, dirty = true;
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
function go(to, ms = 1600) {
  const from = curView(), s0 = { ...state };
  let dth = (to.view ? to.view.theta : from.theta) - from.theta;
  dth = Math.atan2(Math.sin(dth), Math.cos(dth));
  tween = { t0: performance.now(), ms, step(u) {
    const e = ease(u);
    if (to.view) setView({ target: from.target.clone().lerp(to.view.target, e), r: from.r * Math.pow(to.view.r / from.r, e), phi: from.phi + (to.view.phi - from.phi) * e, theta: from.theta + dth * e });
    if (to.t != null || to.m != null) { state = { t: s0.t + ((to.t ?? s0.t) - s0.t) * e, m: s0.m + ((to.m ?? s0.m) - s0.m) * e }; rebuild(); }
  } };
}

// ---------------------------------------------------------------- stegene
let cur = 0;
const dotsEl = $("r3-dots");
dotsEl.innerHTML = STEPS.map((s, i) => `<button aria-label="Steg ${i + 1}: ${S.escapeHtml(s.h)}"></button>`).join("");
const range = $("r3-range");
range.min = years[0]; range.max = lastFull;
function syncUi() {
  range.value = Math.round(state.t);
  $("r3-mode").querySelectorAll("button").forEach((bt) => bt.setAttribute("aria-pressed", String((bt.dataset.v === "cum") === (state.m > 0.5 || pendingMode === 1))));
}
let pendingMode = null;
function showStep(i, animate = true) {
  stop();
  cur = Math.max(0, Math.min(STEPS.length - 1, i));
  const s = STEPS[cur];
  $("r3-step").innerHTML = `<h3>${s.h}</h3><p>${s.p}</p>`;
  dotsEl.querySelectorAll("button").forEach((bt, k) => (k === cur ? bt.setAttribute("aria-current", "step") : bt.removeAttribute("aria-current")));
  $("r3-back").disabled = cur === 0;
  $("r3-next").disabled = cur === STEPS.length - 1;
  const target = { view: viewOf(s.v), t: s.y, m: s.mode === "cum" ? 1 : 0 };
  pendingMode = target.m;
  if (animate) go(target); else { setView(target.view); state = { t: target.t, m: target.m }; rebuild(); }
  range.value = s.y;
  syncUi();
}
$("r3-back").addEventListener("click", () => showStep(cur - 1));
$("r3-next").addEventListener("click", () => showStep(cur + 1));
dotsEl.querySelectorAll("button").forEach((bt, k) => bt.addEventListener("click", () => showStep(k)));
$("r3").addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.key === "ArrowRight") { showStep(cur + 1); e.preventDefault(); }
  if (e.key === "ArrowLeft") { showStep(cur - 1); e.preventDefault(); }
});

// År, avspilling og «hvert år / til sammen»
range.addEventListener("input", () => { stop(); go({ t: +range.value }, 350); });
$("r3-mode").querySelectorAll("button").forEach((bt) => bt.addEventListener("click", () => {
  pendingMode = bt.dataset.v === "cum" ? 1 : 0;
  go({ m: pendingMode }, 900);
  syncUi();
}));
let playing = null;
const playBtn = $("r3-play");
function stop() {
  if (!playing) return;
  playing = null;
  playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>';
  playBtn.setAttribute("aria-label", "Spill av");
}
playBtn.addEventListener("click", () => {
  if (playing) return stop();
  tween = null;
  if (state.t >= lastFull - 0.01) { state.t = years[0]; }
  playing = { last: performance.now() };
  playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
  playBtn.setAttribute("aria-label", "Pause");
});

// Zoom: knappene, klyping på mobil, og hjulet bare med Ctrl/⌘ så siden fortsatt kan rulles
let hintT;
view.addEventListener("wheel", (e) => {
  if (e.ctrlKey || e.metaKey) { e.preventDefault(); return; }
  e.stopImmediatePropagation();
  $("r3-hint").classList.add("show");
  clearTimeout(hintT); hintT = setTimeout(() => $("r3-hint").classList.remove("show"), 1200);
}, { capture: true, passive: false });
function zoom(f) { const v = curView(); go({ view: { ...v, r: Math.max(controls.minDistance, Math.min(controls.maxDistance, v.r * f)) } }, 450); }
$("r3-in").addEventListener("click", () => zoom(0.7));
$("r3-out").addEventListener("click", () => zoom(1.4));
$("r3-north").addEventListener("click", () => { const v = curView(); go({ view: { ...v, theta: 0 } }, 600); });
$("r3-reset").addEventListener("click", () => go({ view: viewOf(STEPS[cur].v), t: STEPS[cur].y, m: STEPS[cur].mode === "cum" ? 1 : 0 }, 900));
controls.addEventListener("start", () => { tween = null; tip.hide(); });
controls.addEventListener("change", () => (dirty = true));

// Pek på en topp for å lese av feltet
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let hoverEv = null;
renderer.domElement.addEventListener("pointermove", (e) => { if (e.buttons === 0) hoverEv = e; });
renderer.domElement.addEventListener("pointerleave", () => { hoverEv = null; tip.hide(); });
function hover() {
  if (!hoverEv) return;
  const e = hoverEv; hoverEv = null;
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(mesh)[0];
  if (!hit || hit.point.y < 0.5) { tip.hide(); return; }
  const { t, m } = state;
  let bestF = null, bv = 0;
  F.forEach((f) => { const dd = Math.hypot(f.x - hit.point.x, f.z - hit.point.z); if (dd < R) { const v = hOf(f, t, m) * kern(dd); if (v > bv) { bv = v; bestF = f; } } });
  if (!bestF) { tip.hide(); return; }
  const cum = m > 0.5, y = Math.round(t), v = cum ? at(bestF.cOe, t) : at(bestF.oe, t), g = cum ? at(bestF.cGas, t) : at(bestF.gas, t);
  tip.show(`<div class="tt-title">${S.escapeHtml(bestF.name)}</div>
    <div class="tt-row"><span>${bestF.area}</span><span>fra ${bestF.start}</span></div>
    <div class="tt-row"><span>${cum ? `Til sammen t.o.m. ${y}` : `Produksjon ${y}`}</span><b>${fm1(v)}</b></div>
    <div class="tt-row"><span><span class="key" style="background:var(--series-2)"></span>Olje og væsker</span><b>${fm1(v - g)}</b></div>
    <div class="tt-row"><span><span class="key" style="background:var(--series-1)"></span>Gass</span><b>${fm1(g)}</b></div>
    <div class="tt-row"><span></span><span>mill. Sm³ o.e.</span></div>`, e.clientX, e.clientY);
}

// ---------------------------------------------------------------- størrelse, tema og løkke
function resize() {
  const w = view.clientWidth;
  const h = Math.round(w < 640 ? w * 1.15 : Math.max(420, Math.min(660, w * 0.56)));
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  dirty = true;
}
new ResizeObserver(resize).observe(view);
resize();
S.onThemeChange(() => { readColors(); seaMat.color = C.sea; landMat.color = C.land; gratMat.color = C.line; rebuild(); });

let visible = true;
new IntersectionObserver((es) => (visible = es[0].isIntersecting)).observe(view);
function loop(now) {
  requestAnimationFrame(loop);
  if (!visible) return;
  if (tween) {
    const u = Math.min(1, (now - tween.t0) / tween.ms);
    tween.step(u);
    dirty = true;
    if (u >= 1) { tween = null; syncUi(); }
  }
  if (playing) {
    const dt = (now - playing.last) / 1000; playing.last = now;
    state = { t: Math.min(lastFull, state.t + dt * 1.6), m: state.m };
    rebuild(); syncUi();
    if (state.t >= lastFull) stop();
  }
  controls.update();
  hover();
  if (dirty) { renderer.render(scene, camera); labels(); dirty = false; }
}
showStep(0, false);
requestAnimationFrame(loop);
