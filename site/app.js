/* Red Rock 攀岩地图 —— 单页离线应用 */
(function () {
'use strict';
const D = window.DATA;
const $ = (s, r) => (r || document).querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PULL = Object.fromEntries(D.pullouts.map(p => [p.key, p]));
const CRAG = Object.fromEntries(D.crags.map(c => [c.key, c]));
const walkShort = c => c.walk.replace(/^约\s*/, '').replace(/（.*$/, '').replace(/\s*分钟/, ' 分钟');
const walkMin = c => { const m = (walkShort(c).match(/\d+/g) || []).map(Number); return m.length ? Math.max(...m) : null; };
const TIER = { pick: '首选', good: '同级可刷', warm: '热身', out: '不在范围' };
const isB = c => c.kind === 'boulder';
const noun = c => isB(c) ? '石头' : '岩壁';

/* Boulders: which problems are highlighted follows the chosen V cap (kept on this phone).
   首选 = 不超过上限且约三星以上（至少 5 票）；同级可刷 = 上限和低一级；热身 = 更低；其余不在范围。 */
let VCAP = 4;
try { const v = localStorage.getItem('rr-vcap'); if (v !== null && +v >= 0 && +v <= 12) VCAP = +v; } catch (e) {}
function applyCap() {
  for (const c of D.crags) {
    if (!isB(c)) continue;
    const all = c.sectors.flatMap(x => x.routes);
    for (const r of all) {
      const over = r.vn == null || r.vn > VCAP;
      r.tier = over ? 'out' : (r.s != null && r.s >= 2.75 && r.v >= 5) ? 'pick' : r.vn >= VCAP - 1 ? 'good' : 'warm';
      r.why = r.vn == null ? '难度不明' : over ? '超出 V' + VCAP : '';
    }
    c.count = Object.fromEntries(['pick', 'good', 'warm', 'out'].map(t => [t, all.filter(r => r.tier === t).length]));
  }
}
applyCap();
function setCap(v) {
  VCAP = Math.max(0, Math.min(12, v));
  try { localStorage.setItem('rr-vcap', VCAP); } catch (e) {}
  applyCap(); renderChips(); renderCard();
}
function capBox(after) {
  const d = el('div', 'cap', `<span>我的抱石上限</span><button aria-label="降一级">−</button><b>V${VCAP}</b><button aria-label="升一级">+</button>`);
  const [dn, up] = d.querySelectorAll('button');
  dn.disabled = VCAP <= 0; up.disabled = VCAP >= 12;
  dn.onclick = () => { setCap(VCAP - 1); after(); }; up.onclick = () => { setCap(VCAP + 1); after(); };
  return d;
}

/* ---------------- tiles ---------------- */
const SRC = {
  sat: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  topo: (z, x, y) => `https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/${z}/${y}/${x}`,
  dem: (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
};
const BOX = { // [south, west, north, east]
  big: [36.08, -115.52, 36.19, -115.38],
  mid: [36.128, -115.447, 36.166, -115.414],
  c1: [36.1432, -115.4330, 36.1485, -115.4225],
  c2: [36.1508, -115.4392, 36.1580, -115.4332],
  ck: [36.1560, -115.4262, 36.1625, -115.4098], // Kraft boulders
  cr: [36.1425, -115.4245, 36.1485, -115.4180], // Red Spring boulders
};
const PLAN = [
  ['sat', 'big', 10, 15], ['sat', 'mid', 16, 18], ['sat', 'c1', 19, 19], ['sat', 'c2', 19, 19], ['sat', 'ck', 19, 19], ['sat', 'cr', 19, 19],
  ['topo', 'big', 10, 14], ['topo', 'mid', 15, 16],
  ['dem', 'big', 10, 14],
];
const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
const lat2y = (lat, z) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2 * 2 ** z); };
function tileUrls() {
  const out = new Set();
  for (const [src, box, z0, z1] of PLAN) {
    const [s, w, n, e] = BOX[box];
    for (let z = z0; z <= z1; z++)
      for (let x = lon2x(w, z); x <= lon2x(e, z); x++)
        for (let y = lat2y(n, z); y <= lat2y(s, z); y++) out.add(SRC[src](z, x, y));
  }
  return [...out];
}
function photoUrls() {
  const out = new Set();
  for (const c of D.crags) {
    c.ph.forEach(p => out.add(p.u));
    for (const s of c.sectors) {
      s.ph.forEach(p => out.add(p.u));
      for (const r of s.routes) if (isB(c) || r.tier !== 'out') r.ph.slice(0, 2).forEach(p => out.add(p.u));
    }
  }
  return [...out];
}
const TILE_CACHE = 'rr-data-v1';

/* ---------------- map ---------------- */
const lineFC = feats => ({ type: 'FeatureCollection', features: feats });
const line = (coords, props) => ({ type: 'Feature', properties: props || {}, geometry: { type: 'LineString', coordinates: coords } });
const approachFC = lineFC(D.crags.flatMap(c => [line(c.approach.trail, { key: c.key, kind: 'trail' }), line(c.approach.off, { key: c.key, kind: 'off' })]));
const driveFC = lineFC(['in1', 'in2', 'out', 'cbr', 'cbk'].filter(k => D.drive[k]).map(k => line(D.drive[k].line, { leg: k })));

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      sat: { type: 'raster', tiles: [SRC.sat('{z}', '{x}', '{y}')], tileSize: 256, minzoom: 10, maxzoom: 19, attribution: '影像 © Esri, Maxar, Earthstar Geographics' },
      topo: { type: 'raster', tiles: [SRC.topo('{z}', '{x}', '{y}')], tileSize: 256, minzoom: 10, maxzoom: 16, attribution: '地形图 USGS' },
      dem: { type: 'raster-dem', tiles: [SRC.dem('{z}', '{x}', '{y}')], tileSize: 256, minzoom: 10, maxzoom: 14, encoding: 'terrarium', attribution: '高程 USGS 3DEP / Mapzen' },
      roads: { type: 'geojson', data: D.roads },
      trails: { type: 'geojson', data: D.trails, attribution: '道路与小路 © OpenStreetMap' },
      drive: { type: 'geojson', data: driveFC },
      approach: { type: 'geojson', data: approachFC },
      acc: { type: 'geojson', data: lineFC([]) },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#d9cbb8' } },
      { id: 'sat', type: 'raster', source: 'sat' },
      { id: 'topo', type: 'raster', source: 'topo', layout: { visibility: 'none' } },
      { id: 'roads-c', type: 'line', source: 'roads', paint: { 'line-color': '#000', 'line-opacity': 0.45, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2, 16, 9] }, layout: { 'line-cap': 'round', 'line-join': 'round' } },
      { id: 'roads', type: 'line', source: 'roads', paint: { 'line-color': '#fff', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1, 16, 6] }, layout: { 'line-cap': 'round', 'line-join': 'round' } },
      { id: 'drive-out', type: 'line', source: 'drive', filter: ['==', ['get', 'leg'], 'out'], paint: { 'line-color': '#7a7a7a', 'line-width': 4, 'line-dasharray': [2, 1.5] } },
      { id: 'drive-in', type: 'line', source: 'drive', filter: ['!=', ['get', 'leg'], 'out'], paint: { 'line-color': '#ffd21f', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 4, 16, 8] }, layout: { 'line-cap': 'round', 'line-join': 'round' } },
      { id: 'trails-c', type: 'line', source: 'trails', minzoom: 13, paint: { 'line-color': '#000', 'line-opacity': 0.55, 'line-width': 4 }, layout: { 'line-cap': 'round' } },
      { id: 'trails', type: 'line', source: 'trails', minzoom: 13, paint: { 'line-color': '#fff', 'line-width': 2, 'line-dasharray': [2, 1.2] } },
      { id: 'ap-c', type: 'line', source: 'approach', filter: ['==', ['get', 'key'], ''], paint: { 'line-color': '#000', 'line-width': 9, 'line-opacity': 0.6 }, layout: { 'line-cap': 'round', 'line-join': 'round' } },
      { id: 'ap-trail', type: 'line', source: 'approach', filter: ['==', ['get', 'key'], ''], paint: { 'line-color': '#00e5ff', 'line-width': 5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } },
      { id: 'ap-off', type: 'line', source: 'approach', filter: ['==', ['get', 'key'], ''], paint: { 'line-color': '#ff4fd8', 'line-width': 5, 'line-dasharray': [1, 1.2] } },
      { id: 'acc', type: 'fill', source: 'acc', paint: { 'fill-color': '#1f6fff', 'fill-opacity': 0.15 } },
    ],
  },
  center: [-115.431, 36.142], zoom: 13.2, minZoom: 10, maxZoom: 20.5, maxPitch: 70, maxTileCacheSize: 120,
  maxBounds: [[BOX.big[1], BOX.big[0]], [BOX.big[3], BOX.big[2]]],
  attributionControl: { compact: true }, dragRotate: true, pitchWithRotate: true,
});
map.addControl(new maplibregl.NavigationControl({ showZoom: false, visualizePitch: true }), 'bottom-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

const errs = [];
window.addEventListener('error', e => { if (errs.length < 60) errs.push('js: ' + e.message); });
/* markers */
const cragMarkers = {};
function mk(cls, text, lngLat, onClick, anchor) {
  const e = el('div', 'mk ' + cls, esc(text));
  if (onClick) e.addEventListener('click', ev => { ev.stopPropagation(); onClick(); });
  return new maplibregl.Marker({ element: e, anchor: anchor || 'bottom' }).setLngLat(lngLat).addTo(map);
}
D.marks.forEach(m => mk(m.k === 'wc' ? 'wc ref' : 'ref', m.n, [m.lng, m.lat]));
// Boulders sit a few metres apart: zoomed out they show as numbered dots (same numbers as the list), names appear when zoomed in.
const NUM = {};
D.pullouts.forEach(p => D.crags.filter(c => c.pull === p.key && isB(c)).forEach((c, i) => { NUM[c.key] = i + 1; }));
const numTag = c => NUM[c.key] ? `<i class="no">${NUM[c.key]}</i>` : '';
D.crags.forEach(c => {
  const m = cragMarkers[c.key] = mk(isB(c) ? 'b' : '', c.zh, [c.lng, c.lat], () => selectCrag(c.key), c.anchor);
  if (isB(c)) m.getElement().innerHTML = `<i class="no">${NUM[c.key]}</i><span class="l">${esc(c.zh)}</span>`;
});
D.pullouts.forEach(p => mk('pull', 'P ' + p.short, [p.lng, p.lat], () => setView(p.key)));
if (D.drive.entrance) mk('gate', '入口 / 收费站方向', D.drive.entrance, () => setView('drive'));
if (D.drive.junction) mk('gate', 'Calico Basin 路口（抱石）', D.drive.junction, () => setView('drive'), 'right');
// one-way arrows along the way in
(function arrows() {
  const pts = [].concat(D.drive.in1 ? D.drive.in1.line : [], D.drive.in2 ? D.drive.in2.line : []);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += dist(pts[i - 1], pts[i]);
    if (acc > 380) {
      acc = 0;
      new maplibregl.Marker({ element: el('div', 'arrow'), rotation: bearing(pts[i - 1], pts[i]), rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat(pts[i]).addTo(map);
    }
  }
})();
map.on('zoom', () => { document.body.classList.toggle('far', map.getZoom() < 16.6); document.body.classList.toggle('wide', map.getZoom() < 17.6); });
document.body.classList.add('wide');
document.body.classList.add('far');

/* ---------------- geo helpers ---------------- */
function dist(a, b) { // [lng,lat]
  const R = 6371000, p1 = a[1] * Math.PI / 180, p2 = b[1] * Math.PI / 180;
  const x = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((b[0] - a[0]) * Math.PI / 360) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function bearing(a, b) {
  const p1 = a[1] * Math.PI / 180, p2 = b[1] * Math.PI / 180, dl = (b[0] - a[0]) * Math.PI / 180;
  const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
const compass = d => ['北', '东北', '东', '东南', '南', '西南', '西', '西北'][Math.round(d / 45) % 8];
const fmtM = m => m >= 1000 ? (m / 1000).toFixed(1) + ' 公里' : Math.round(m / 5) * 5 + ' 米';
function circle(c, r) {
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const a = i / 40 * 2 * Math.PI;
    pts.push([c[0] + r * Math.cos(a) / (111320 * Math.cos(c[1] * Math.PI / 180)), c[1] + r * Math.sin(a) / 110540]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } };
}

/* ---------------- state ---------------- */
const S = { view: 'drive', crag: null, d3: false, base: 'sat', me: null, heading: null, follow: false, filter: 'all', sector: 0 };

function markTab(v) {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  const on = $('#tabs .on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
}
function setView(v) {
  S.view = v; S.crag = null;
  markTab(v);
  renderChips(); highlight(); renderCard();
  if (v === 'drive') {
    fit([D.drive.entrance, D.drive.junction].filter(Boolean).concat(D.pullouts.map(p => [p.lng, p.lat])), 15);
  } else {
    const p = PULL[v];
    fit([[p.lng, p.lat]].concat(D.crags.filter(c => c.pull === v).map(c => [c.lng, c.lat])), 17);
  }
}
function pad() { return { top: 150, bottom: Math.min(innerHeight * 0.46, 330), left: 70, right: 70 }; }
function fit(pts, maxZoom, focus) {
  const b = new maplibregl.LngLatBounds(pts[0], pts[0]); pts.forEach(p => b.extend(p));
  if (!S.d3) { map.fitBounds(b, { padding: pad(), maxZoom: maxZoom || 18, pitch: 0, bearing: 0, duration: 700 }); return; }
  const cam = map.cameraForBounds(b, { padding: pad(), maxZoom: maxZoom || 18 });
  const c = b.getCenter();
  flatThenTilt(focus || (cam ? cam.center : [c.lng, c.lat]), focus ? 16.6 : (cam ? cam.zoom : 15));
}
function goTo(center, zoom) {
  if (!S.d3) { map.easeTo({ center, zoom }); return; }
  flatThenTilt(center, zoom);
}
/* 3D camera moves.
   Two traps in the map library, both found by testing:
   1. Animating with terrain on into a place whose elevation tiles are not loaded leaves the camera under the
      ground (blank map or stripes).
   2. After terrain has been switched off once, switching it on again does not refresh by itself: elevation
      tiles are not requested and the camera's ground height stays 0 until a jumpTo. An animated tilt from
      that state stops halfway with a blank map.
   So every 3D move is: terrain off, jump there flat, terrain on, nudge the map, wait until the ground height
   under the centre is really known, write it into the camera, and only then jump (not animate) to the tilt. */
let tiltSeq = 0;
const want = { zoom: 16, center: null };
function flatThenTilt(center, zoom) {
  center = maplibregl.LngLat.convert(center).toArray(); // callers pass either [lng, lat] or a LngLat
  const bearing = map.getBearing();
  map.stop(); map._elevationFreeze = false; map.setTerrain(null);
  map.jumpTo({ center, zoom, bearing, pitch: 0 });
  want.zoom = zoom; want.center = center;
  const seq = ++tiltSeq;
  $('#btn3d').classList.add('busy');
  // Have the elevation tiles around the target on the phone first. Without this the quick jumps cancel
  // elevation downloads that are still running and the terrain keeps holes (blank patches) there.
  ensureDem(center).then(() => { if (seq === tiltSeq && S.d3) tiltUp(false); });
}
function demUrlsAround(c) {
  const out = [];
  for (let z = 10; z <= 14; z++) {
    const x = lon2x(c[0], z), y = lat2y(c[1], z), r = z >= 13 ? 1 : 0;
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) out.push(SRC.dem(z, x + dx, y + dy));
  }
  return out;
}
async function ensureDem(c) {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(TILE_CACHE);
    const jobs = demUrlsAround(c).map(async u => {
      if (await cache.match(u)) return;
      const r = await fetch(u, { mode: 'cors', credentials: 'omit' });
      if (r.ok) await cache.put(u, r);
    });
    await Promise.race([Promise.allSettled(jobs), new Promise(res => setTimeout(res, 7000))]);
  } catch (e) { errs.push('dem-prefetch: ' + e.message); }
}
function groundHeight() {
  try {
    const t = map.terrain;
    return t ? t.getElevationForLngLatZoom(map.getCenter(), map.transform.tileZoom) : 0;
  } catch (e) { return 0; }
}
function tiltUp(retried) {
  const seq = ++tiltSeq, btn = $('#btn3d'), t0 = Date.now();
  btn.classList.add('busy');
  map._elevationFreeze = false;
  map.setTerrain({ source: 'dem', exaggeration: 1 });
  map.jumpTo({ center: want.center, zoom: want.zoom });
  const tick = () => {
    if (seq !== tiltSeq || !S.d3) return;
    const h = groundHeight();
    if (h > 300) { // the whole area lies above 1000 m; 0 means "not loaded yet"
      btn.classList.remove('busy');
      map._elevationFreeze = false;
      try { map.transform.setElevation(h); } catch (e) {}
      map.jumpTo({ center: want.center, zoom: want.zoom, pitch: 60 });
      setTimeout(() => {
        if (seq !== tiltSeq || !S.d3) return;
        const el = map.transform.elevation || 0;
        if (map.getPitch() >= 50 && el > 300) { [400, 1500, 3000].forEach(ms => setTimeout(() => { if (seq === tiltSeq) redrawTerrain(); }, ms)); return; }
        errs.push('tilt-failed p=' + map.getPitch().toFixed(1) + ' z=' + map.getZoom().toFixed(2) + ' el=' + Math.round(el) + (retried ? ' (retry)' : ''));
        if (retried) { flat3dOff('这里的三维地形没有显示出来，已切回二维'); return; }
        map.stop(); map._elevationFreeze = false; map.setTerrain(null);
        map.jumpTo({ center: want.center, zoom: want.zoom, pitch: 0 });
        setTimeout(() => { if (seq === tiltSeq && S.d3) tiltUp(true); }, 300);
      }, 700);
    } else if (Date.now() - t0 > 9000) {
      errs.push('dem-timeout'); flat3dOff('地形数据没有加载到，先用二维（联网或下载离线数据后再试）');
    } else { map.triggerRepaint(); setTimeout(tick, 200); }
  };
  setTimeout(tick, 200);
}
/* In 3D the satellite layer is drawn onto the terrain through cached textures. After the jump-based moves
   above, some of those textures were left showing blank patches although the tiles had arrived. Redraw them
   once whenever the map settles. */
let rttFresh = false;
function redrawTerrain() {
  if (!S.d3 || !map.terrain) return;
  try { map.terrain.tileManager.freeRtt(); } catch (e) {}
  map.triggerRepaint();
}
map.on('movestart', () => { rttFresh = false; });
map.on('idle', () => { if (S.d3 && !rttFresh) { rttFresh = true; redrawTerrain(); } });
function flat3dOff(msg) {
  tiltSeq++; S.d3 = false;
  const btn = $('#btn3d'); btn.classList.remove('busy', 'on'); btn.textContent = '3D';
  map.stop(); map._elevationFreeze = false; map.setTerrain(null); map.jumpTo({ pitch: 0, bearing: 0 });
  if (msg) toast(msg);
}
function selectCrag(key) {
  const c = CRAG[key];
  S.view = c.pull; S.crag = key; S.sector = 0; S.filter = 'all';
  markTab(c.pull);
  renderChips(); highlight(); renderCard();
  const p = PULL[c.pull];
  fit([[p.lng, p.lat], [c.lng, c.lat]].concat(c.approach.trail), 18.5, [c.lng, c.lat]);
}
function highlight() {
  const f = ['==', ['get', 'key'], S.crag || ''];
  map.setFilter('ap-c', f);
  map.setFilter('ap-trail', ['all', f, ['==', ['get', 'kind'], 'trail']]);
  map.setFilter('ap-off', ['all', f, ['==', ['get', 'kind'], 'off']]);
  for (const k in cragMarkers) {
    const e = cragMarkers[k].getElement();
    e.classList.toggle('on', k === S.crag);
    e.style.zIndex = k === S.crag ? 3 : 1;
    e.style.display = CRAG[k].pull === S.view ? '' : 'none';
  }
}
function renderChips() {
  const box = $('#chips'); box.innerHTML = '';
  if (S.view === 'drive') {
    const b = el('button', 'chip', '进园须知与离线下载'); b.onclick = openInfo; box.appendChild(b);
    const b2 = el('button', 'chip', '今天爬什么'); b2.onclick = () => openInfo('picks'); box.appendChild(b2);
    const b3 = el('button', 'chip', '抱石摸什么'); b3.onclick = () => openInfo('bpicks'); box.appendChild(b3);
    return;
  }
  D.crags.filter(c => c.pull === S.view).forEach(c => {
    const b = el('button', 'chip' + (c.key === S.crag ? ' on' : ''), `${numTag(c)}${esc(c.zh)} <span class="t">${esc(walkShort(c))}</span> <small>★${c.count.pick}</small>`);
    b.onclick = () => selectCrag(c.key); box.appendChild(b);
  });
  const on = $('#chips .on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
}

/* ---------------- bottom card ---------------- */
function gpsLine(c) {
  if (!S.me) return `<div class="gps">点右边“定位”显示你离${noun(c)}多远</div>`;
  const d = dist(S.me, [c.lng, c.lat]), br = bearing(S.me, [c.lng, c.lat]);
  if (d < 40) return `<div class="gps near">你已在${noun(c)}附近（定位误差内）· 点“找线”</div>`;
  const total = c.approach.trail_m + c.approach.off_m, wm = walkMin(c);
  const left = wm && d < total * 1.3 ? `，大约还要 ${Math.max(1, Math.round(wm * Math.min(1, d / total)))} 分钟` : '';
  return `<div class="gps">${noun(c)}在你的${compass(br)}方向，直线 ${fmtM(d)}${left}</div>`;
}
function renderCard() {
  const card = $('#card'); card.hidden = false;
  if (S.view === 'drive') {
    const a = D.drive.in1 ? (D.drive.in1.m / 1000).toFixed(1) : '?', b = D.drive.in2 ? (D.drive.in2.m / 1000).toFixed(1) : '?', o = D.drive.out ? Math.round(D.drive.out.m / 1000) : '?';
    card.innerHTML = `<h3>开车进园</h3>
      <div class="way">从 Charleston Blvd（159 号公路）一路向西，右转进 Scenic Drive 过收费站。<b>进门后约 ${a} 公里是第一停车点，再往前 ${b} 公里是第二停车点</b>（黄线）。</div>
      <div class="warn">全程单行道：开过第一停车点就不能掉头。两个都去的话先停第一个。离开要把整圈开完，从第二停车点到出口还有约 ${o} 公里（灰色虚线）。</div>
      ${D.drive.cbk ? `<div class="way"><b>抱石走另一条路：</b>从城里过来，在到 Scenic Drive 入口之前先右转进 Calico Basin Road，不过收费站。约 ${(D.drive.cbr.m / 1000).toFixed(1)} 公里到 Red Spring 停车场，约 ${(D.drive.cbk.m / 1000).toFixed(1)} 公里开到路尽头是 Kraft 停车场。</div>` : ''}
      <div class="row"><button class="btn ghost slim" id="cInfo">须知与离线下载</button><button class="btn slim" id="cP1">看第一停车点</button></div>`;
    $('#cInfo').onclick = () => openInfo(); $('#cP1').onclick = () => setView('p1');
    return;
  }
  if (!S.crag) {
    const p = PULL[S.view];
    card.innerHTML = `<h3>${esc(p.name)}</h3><div class="sub">${p.basin ? '点石头看走法和线路，编号和地图上的圆点对应' : '点岩壁看走法和线路'} · 黑底数字是步行时间</div>${p.key === 'pk' ? '<div class="warn" style="margin:0 0 6px">停车场满了就停在铺装路的路边，不要停在住户的车道口和有禁停牌的地方。</div>' : ''}<ul class="list">` +
      D.crags.filter(c => c.pull === S.view).map(c => `<li data-k="${c.key}">${numTag(c)}<b>${esc(c.zh)}</b><span class="etaS">${esc(walkShort(c))}</span><span class="badge pick">★${c.count.pick}</span><span class="badge good">同级 ${c.count.good}</span></li>`).join('') + '</ul>';
    card.querySelectorAll('li').forEach(li => li.onclick = () => selectCrag(li.dataset.k));
    return;
  }
  const c = CRAG[S.crag];
  const offNote = c.approach.off_m > 60 ? `<div class="warn">青色实线是地图上有记录的小路（${fmtM(c.approach.trail_m)}）；最后约 ${fmtM(c.approach.off_m)} 的粉色虚线没有现成小路，只表示方向，要按上面的文字走。</div>` : '';
  card.innerHTML = `<h3>${esc(c.zh)}</h3>
    <div class="eta"><b>步行 ${esc(walkShort(c))}</b><span>从${esc(PULL[c.pull].short)}出发 · 路程约 ${fmtM(c.approach.trail_m + c.approach.off_m)}</span></div>
    <div class="badges"><span class="badge pick">★ 首选 ${c.count.pick}</span><span class="badge good">同级可刷 ${c.count.good}</span><span class="badge warm">热身 ${c.count.warm}</span><span class="badge out">不在范围 ${c.count.out}</span></div>
    ${gpsLine(c)}
    <div class="row"><button class="btn" id="cFind">找线 ›</button><button class="btn ghost" id="cWay">走法</button></div>
    <div id="cWayBox" hidden><div class="way">${esc(c.way)}</div>${c.sun ? `<div class="way"><b>日晒：</b>${esc(c.sun)}</div>` : ''}${offNote}
      <details><summary class="src">Mountain Project 英文原文</summary><pre class="en">${esc(c.get)}</pre></details></div>`;
  $('#cFind').onclick = () => openPanel(c.key);
  $('#cWay').onclick = () => { const b = $('#cWayBox'); b.hidden = !b.hidden; };
}

/* ---------------- route panel ---------------- */
function starStr(r) { return r.s == null ? '无评分' : `★${r.s.toFixed(1)}（${r.v} 票）`; }
function topoSVG(sec) {
  const rs = sec.routes, W = 50, H = 210, base = H - 46, maxFt = Math.max(60, ...rs.map(r => r.ft || 0));
  const col = { pick: '#f2a100', good: '#0b7fc2', warm: '#4f8f5d', out: '#9a938b' };
  let s = `<svg width="${rs.length * W + 20}" height="${H}" viewBox="0 0 ${rs.length * W + 20} ${H}" role="img" aria-label="从左到右的线路示意图">`;
  s += `<path d="M0 ${base} H${rs.length * W + 20}" stroke="#6b4a36" stroke-width="3"/>`;
  rs.forEach((r, i) => {
    const x = 10 + i * W + W / 2, h = 40 + ((r.ft || 55) / maxFt) * (base - 62), y = base - h, c = col[r.tier];
    const sw = r.tier === 'pick' ? 7 : r.tier === 'good' ? 5 : r.tier === 'warm' ? 3 : 2;
    const dash = r.tier === 'out' ? ' stroke-dasharray="5 5"' : '';
    s += `<g data-i="${i}" style="cursor:pointer"><rect x="${x - W / 2}" y="0" width="${W}" height="${H}" fill="transparent"/>`;
    if (r.tier === 'pick') s += `<path d="M${x} ${y} V${base}" stroke="#3a2600" stroke-width="${sw + 3}" stroke-linecap="round"/>`;
    s += `<path d="M${x} ${y} V${base}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"${dash}/>`;
    if (r.tier === 'pick') s += `<text x="${x}" y="${y - 6}" text-anchor="middle" font-size="20" fill="#f2a100" stroke="#3a2600" stroke-width=".8">★</text>`;
    else s += `<circle cx="${x}" cy="${y}" r="4" fill="${r.tier === 'warm' ? '#fff' : c}" stroke="${c}" stroke-width="2"/>`;
    s += `<circle cx="${x}" cy="${base + 15}" r="12" fill="${r.tier === 'out' ? '#efecea' : r.tier === 'warm' ? '#fff' : c}" stroke="${c}" stroke-width="2"/>`;
    s += `<text x="${x}" y="${base + 20}" text-anchor="middle" font-size="13" font-weight="800" fill="${r.tier === 'good' ? '#fff' : r.tier === 'pick' ? '#3a2600' : '#5b544d'}">${i + 1}</text>`;
    s += `<text x="${x}" y="${base + 42}" text-anchor="middle" font-size="12" font-weight="700" fill="${r.tier === 'out' ? '#9a938b' : '#1d1a17'}">${esc((r.g || '?').replace('5.', '.'))}</text></g>`;
  });
  return s + '</svg>';
}
function neighbours(sec, i) {
  const out = [];
  for (const j of [i - 2, i - 1, i + 1, i + 2]) {
    const r = sec.routes[j];
    if (r && r.tier !== 'out') out.push(`${j < i ? '左' : '右'}边 #${j + 1} ${esc(r.n)} ${esc(r.g)}`);
  }
  return out;
}
function routeCard(sec, r, i, boulder) {
  const tags = [];
  if (r.p > 1) tags.push(`<span class="tag alert">${r.p} 段</span>`);
  if (r.why) tags.push(`<span class="tag${/传统|混合/.test(r.why) ? ' alert' : ''}">${esc(r.why)}</span>`);
  if (r.ft && r.ft > 100 && r.p === 1) tags.push('<span class="tag alert">长线，核对绳长</span>');
  if (r.tier === 'pick' && r.v < 20) tags.push('<span class="tag">票数少</span>');
  const nb = r.tier === 'pick' ? neighbours(sec, i) : [];
  const d = el('details', 'rt ' + r.tier); d.id = 'r' + r.id;
  d.innerHTML = `<summary><span class="num">${i + 1}</span>
      <span class="nm"><b>${r.tier === 'pick' ? '★ ' : ''}${esc(r.n)}</b><span>${TIER[r.tier]} · ${starStr(r)}${r.ft ? ' · ' + r.ft + ' 英尺' : ''}</span></span>
      <span class="gr">${esc(r.g || '?')}<span>${esc(r.t || '')}</span></span></summary>
    <div class="body">${tags.join('')}
      ${nb.length ? `<div class="next">${boulder ? '垫子不用搬远，旁边可以顺刷' : '挂完这条不用挪地方，可以顺刷'}：${nb.join('；')}</div>` : ''}
      ${r.pro ? `<h5>${boulder ? '垫子 / 保护' : '保护 / 挂片'}</h5><p>${esc(r.pro)}</p>` : ''}
      ${r.loc ? `<h5>位置</h5><p>${esc(r.loc)}</p>` : ''}
      ${r.desc ? `<h5>描述</h5><p>${esc(r.desc)}</p>` : ''}
      ${r.ph.length ? '<div class="phs">' + r.ph.map(p => `<img loading="lazy" src="${esc(p.u)}" data-c="${esc(p.c)}" alt="">`).join('') + '</div>' : ''}
      <div class="src">${r.fa ? '首攀：' + esc(r.fa) + ' · ' : ''}来源 <a href="${esc(r.url)}" target="_blank" rel="noopener">Mountain Project</a></div></div>`;
  return d;
}
function openPanel(key) {
  const c = CRAG[key];
  $('#panelTitle').textContent = c.zh;
  const body = $('#panelBody'); body.innerHTML = '';
  if (c.sectors.length > 1) {
    const tabs = el('div', 'sectabs');
    c.sectors.forEach((s, i) => {
      const n = s.routes.filter(r => r.tier === 'pick').length;
      const b = el('button', i === S.sector ? 'on' : '', esc(s.name) + (n ? ` ★${n}` : ''));
      b.onclick = () => { S.sector = i; openPanel(key); }; tabs.appendChild(b);
    });
    body.appendChild(tabs);
  }
  const sec = c.sectors[S.sector];
  if (c.sectors.length > 1 && (sec.desc || sec.get)) body.appendChild(el('div', 'secnote', esc(sec.get || '') + (sec.desc ? '<br>' + esc(sec.desc) : '')));
  if (isB(c)) body.appendChild(capBox(() => openPanel(key)));
  body.appendChild(el('div', 'secnote', isB(c) ? '下图按 Mountain Project 上<b>从左到右</b>（绕着石头走）的顺序排列，不是照片。点一条线跳到它的卡片。' : '下图按面向岩壁<b>从左到右</b>排列，线的高矮按线路长度画，不是照片。点一条线跳到它的卡片。'));
  const topo = el('div', 'topo', topoSVG(sec)); body.appendChild(topo);
  body.appendChild(el('div', 'legend', isB(c)
    ? `<span><i class="pick"></i>★ 首选（≤V${VCAP}，约三星及以上）</span><span><i></i>同级可刷（${VCAP > 0 ? 'V' + (VCAP - 1) + '–' : ''}V${VCAP}）</span>${VCAP > 1 ? `<span><i class="warm"></i>热身（≤V${VCAP - 2}）</span>` : ''}<span><i class="out"></i>不在范围（超 V${VCAP}）</span>`
    : '<span><i class="pick"></i>★ 首选（运动攀 ≤10d，约三星及以上）</span><span><i></i>同级可刷（5.9–10d）</span><span><i class="warm"></i>热身（≤5.8）</span><span><i class="out"></i>不在范围（超 10d / 传统 / 顶绳）</span>'));
  const ph = (sec.ph.length ? sec.ph : c.ph);
  if (ph.length) {
    body.appendChild(el('div', 'secnote', noun(c) + '照片（部分带有网友画的线，点开放大）：'));
    body.appendChild(el('div', 'phs', ph.map(p => `<img loading="lazy" src="${esc(p.u)}" data-c="${esc(p.c)}" alt="">`).join('')));
  }
  const fl = el('div', 'filters');
  [['all', '全部（留作参照）'], ['can', '只看能爬的'], ['pick', '只看★首选']].forEach(([k, t]) => {
    const b = el('button', S.filter === k ? 'on' : '', t); b.onclick = () => { S.filter = k; openPanel(key); }; fl.appendChild(b);
  });
  body.appendChild(fl);
  sec.routes.forEach((r, i) => {
    if (S.filter === 'can' && r.tier === 'out') return;
    if (S.filter === 'pick' && r.tier !== 'pick') return;
    body.appendChild(routeCard(sec, r, i, isB(c)));
  });
  body.appendChild(el('div', 'src', `线路资料、星级和照片来自 <a href="${esc(sec.url)}" target="_blank" rel="noopener">Mountain Project</a>，照片版权归各拍摄者。整理于 ${esc(D.built)}。`));
  topo.querySelectorAll('g[data-i]').forEach(g => g.addEventListener('click', () => {
    const r = sec.routes[+g.dataset.i]; let d = $('#r' + r.id);
    if (!d) { S.filter = 'all'; openPanel(key); d = $('#r' + r.id); }
    d.open = true; d.scrollIntoView({ block: 'center', behavior: 'smooth' });
    d.classList.add('flash'); setTimeout(() => d.classList.remove('flash'), 1500);
  }));
  $('#panel').hidden = false; body.scrollTop = 0;
}
$('#panelBack').onclick = () => { $('#panel').hidden = true; };
document.addEventListener('click', e => {
  const img = e.target.closest('.phs img'); if (!img) return;
  const L = $('#light'); $('img', L).src = img.src; $('img', L).className = ''; $('p', L).textContent = img.dataset.c || ''; L.hidden = false;
});
$('#light img').onclick = e => e.target.classList.toggle('zoom');
$('#lightClose').onclick = () => { $('#light').hidden = true; };

/* ---------------- info / offline ---------------- */
const isStandalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
function topPicks(boulder) {
  const rows = [];
  for (const c of D.crags) if (isB(c) === boulder) for (const s of c.sectors) s.routes.forEach((r, i) => { if (r.tier === 'pick') rows.push({ c, s, r, i }); });
  rows.sort((a, b) => (b.r.s - a.r.s) || (b.r.v - a.r.v));
  return rows;
}
const pickLi = (x, n) => `<li data-n="${n}"><b>★ ${esc(x.r.n)}</b> ${esc(x.r.g)} · ${starStr(x.r)}<br><span class="src">${esc(x.c.zh)}${x.c.sectors.length > 1 ? ' · ' + esc(x.s.name) : ''} · ${esc(PULL[x.c.pull].short)} · 左起第 ${x.i + 1} 条</span></li>`;
function openInfo(focus) {
  const b = $('#infoBody');
  const picks = topPicks(false), bpicks = topPicks(true);
  b.innerHTML = `
  <div class="box" id="offBox">
    <h3 style="margin-top:0">离线数据</h3>
    ${isIOS && !isStandalone ? '<p><b>先做这一步：</b>点 Safari 底部的“分享”按钮 → “添加到主屏幕”，然后<b>从主屏幕的图标打开</b>再下载。在 Safari 里下载的数据，主屏幕图标用不到。</p>' : ''}
    <p id="offState">正在检查…</p>
    <div class="bar"><i id="offBar"></i></div>
    <div class="row"><button class="btn" id="offGo">下载离线数据</button></div>
    <p class="src">包含卫星图、地形图、三维地形和岩壁照片，约 90–110 MB，请在 Wi-Fi 下进行。下完后开飞行模式再打开一次，确认地图和照片都在。</p>
  </div>
  <div class="box"><h3 style="margin-top:0">进园</h3><ul>
    <li><b>10 月到次年 5 月，8:00–17:00 之间入园要在 recreation.gov 预约时段</b>；8:00 前入园不用预约。Scenic Drive 早上 6:00 开门。</li>
    <li>门票按车收，国家公园年卡可抵门票（预约手续费另付）。</li>
    <li>13 英里环线全程<b>单行</b>：先第一停车点，后第二停车点，开过不能回头；离开要开完整圈。</li>
    <li>第二停车点车位少，周末和假日一早就满。</li>
    <li>冬季关门早，天黑前（11 月底日落约 16:30）回到车上并开出环线。</li>
  </ul></div>
  <div class="box"><h3 style="margin-top:0">抱石（Calico Basin）</h3><ul>
    <li>Kraft 和 Red Spring 都在 Scenic Drive 外面，走 Calico Basin Road 进去，<b>不过收费站，不用预约</b>。</li>
    <li>Kraft 停车场在路的尽头，位子不多；满了停铺装路的路边，<b>不要停在住户车道口和禁停牌处</b>。</li>
    <li>Red Spring 是野餐区，网上查到冬季（11 月到 2 月）开放到 17:00 左右，以现场牌子为准。</li>
    <li>Kraft 海拔低、很晒也招风，适合冬天；换着面爬，全天都能找到阴面或阳面。</li>
    <li>星级和难度来自网友；落地区和下石头的路线到现场先看好。</li>
  </ul></div>
  <div class="box"><h3 style="margin-top:0">岩石与安全</h3><ul>
    <li><b>雨后砂岩不能爬</b>：湿的砂岩很脆，岩点会断。下过雨至少等 24–72 小时，地面下面的沙子还是湿的就别爬。</li>
    <li>地图上的蓝点在窄走廊里（Black Corridor、The Rift）会漂，最后几十米按文字和照片认路。</li>
    <li>星级、难度、挂片数来自网友，实际以现场为准；长线先核对绳长，绳尾打结。</li>
  </ul></div>
  <div class="box" id="picksBox"><h3 style="margin-top:0">今天爬什么（运动攀 ≤5.10d 的首选线）</h3>
    <p class="src">按 Mountain Project 星级从高到低。点一条直接打开它所在的岩壁。</p>
    <ul class="list">${picks.map(pickLi).join('')}</ul></div>
  <div class="box" id="bpicksBox"><h3 style="margin-top:0">抱石摸什么（不超过 V${VCAP} 的首选线）</h3>
    <div id="capSlot"></div>
    <p class="src">按 Mountain Project 星级从高到低。点一条直接打开它所在的石头。</p>
    <ul class="list">${bpicks.map(pickLi).join('') || '<li>这个上限以内没有约三星以上的线，把上限调高一级看看。</li>'}</ul></div>
  <p class="src">底图：Esri World Imagery、USGS Topo、USGS 3DEP 高程；道路与小路 © OpenStreetMap 贡献者；线路资料来自 Mountain Project。仅供个人使用。数据整理于 ${esc(D.built)}。</p>`;
  const wire = (sel, list) => b.querySelectorAll(sel + ' li[data-n]').forEach(li => li.onclick = () => {
    const x = list[+li.dataset.n]; $('#info').hidden = true; selectCrag(x.c.key);
    S.sector = x.c.sectors.indexOf(x.s); openPanel(x.c.key);
    const d = $('#r' + x.r.id); if (d) { d.open = true; d.scrollIntoView({ block: 'center' }); }
  });
  wire('#picksBox', picks); wire('#bpicksBox', bpicks);
  $('#capSlot').appendChild(capBox(() => openInfo('bpicks')));
  $('#offGo').onclick = download;
  $('#info').hidden = false;
  checkOffline();
  if (focus === 'picks') $('#picksBox').scrollIntoView();
  else if (focus === 'bpicks') $('#bpicksBox').scrollIntoView();
  else b.scrollTop = 0;
}
$('#infoBack').onclick = () => { $('#info').hidden = true; };

async function checkOffline() {
  const st = $('#offState'); if (!st) return;
  if (!('caches' in window)) { st.textContent = '这个浏览器不支持离线保存。请用 Safari 打开。'; return; }
  const need = tileUrls().concat(photoUrls());
  const cache = await caches.open(TILE_CACHE);
  const have = new Set((await cache.keys()).map(r => r.url));
  const miss = need.filter(u => !have.has(u)).length;
  if ($('#offBar')) $('#offBar').style.width = Math.round((need.length - miss) / need.length * 100) + '%';
  st.innerHTML = miss === 0 ? `<b>✓ 离线数据已存好</b>（${need.length} 项），没有信号也能用。` : `还差 ${miss} / ${need.length} 项没有存到手机里。`;
  return miss;
}
let downloading = false;
async function download() {
  if (downloading) return; downloading = true;
  const st = $('#offState'), bar = $('#offBar'), btn = $('#offGo'); btn.textContent = '下载中…';
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
  const cache = await caches.open(TILE_CACHE);
  const have = new Set((await cache.keys()).map(r => r.url));
  const all = tileUrls().concat(photoUrls()), todo = all.filter(u => !have.has(u));
  let done = all.length - todo.length, fail = 0, i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const u = todo[i++];
      try {
        const r = await fetch(u, { mode: 'cors', credentials: 'omit' });
        if (r.ok) { await cache.put(u, r); done++; } else fail++;
      } catch (e) { fail++; }
      if (bar.isConnected) { bar.style.width = Math.round(done / all.length * 100) + '%'; st.textContent = `已存 ${done} / ${all.length}` + (fail ? `，失败 ${fail}` : ''); }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  downloading = false;
  if (btn.isConnected) btn.textContent = fail ? '再试一次（补下失败的）' : '下载离线数据';
  const miss = await checkOffline();
  toast(miss ? `还有 ${miss} 项没下成，请再点一次` : '离线数据已全部存好');
}
function toast(t) { const e = $('#toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { e.hidden = true; }, 3500); }

/* ---------------- GPS & compass ---------------- */
let meMarker = null, watchId = null, wake = null;
function startGPS() {
  if (!navigator.geolocation) { toast('这台设备不支持定位'); return; }
  if (watchId != null) { if (S.me) goTo(S.me, Math.max(map.getZoom(), 17)); else toast('正在等定位，没有信号时第一次可能要一分钟'); return; }
  $('#btnMe').classList.add('busy');
  watchId = navigator.geolocation.watchPosition(pos => {
    const first = !S.me;
    S.me = [pos.coords.longitude, pos.coords.latitude];
    if (!meMarker) {
      const e = el('div'); e.style.cssText = 'width:20px;height:20px;border-radius:50%;background:#1f6fff;border:3px solid #fff;box-shadow:0 0 0 2px #1f6fff,0 1px 6px #000a';
      meMarker = new maplibregl.Marker({ element: e }).setLngLat(S.me).addTo(map);
    } else meMarker.setLngLat(S.me);
    map.getSource('acc').setData(lineFC([circle(S.me, Math.min(pos.coords.accuracy || 0, 300))]));
    $('#btnMe').classList.remove('busy'); $('#btnMe').classList.add('on');
    const inBox = S.me[1] > BOX.big[0] && S.me[1] < BOX.big[2] && S.me[0] > BOX.big[1] && S.me[0] < BOX.big[3];
    if (first) { if (inBox) goTo(S.me, Math.max(map.getZoom(), 16)); else toast('已定位，但你现在不在 Red Rock 范围内，到了以后蓝点会出现在地图上'); }
    else if (S.follow && inBox) map.easeTo({ center: S.me, duration: 500 });
    if (S.crag && !$('#card').hidden) { const g = $('#card .gps'); if (g) g.outerHTML = gpsLine(CRAG[S.crag]); }
  }, err => {
    $('#btnMe').classList.remove('busy');
    toast(err.code === 1 ? '定位权限被拒绝：到 设置 → 隐私 → 定位服务 里允许' : '暂时拿不到定位，到开阔处再试');
    if (err.code === 1) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 60000 });
  if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then(w => { wake = w; }).catch(() => {});
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && watchId != null && 'wakeLock' in navigator) navigator.wakeLock.request('screen').then(w => { wake = w; }).catch(() => {});
});
$('#btnMe').onclick = startGPS;

let lastTurn = 0;
function onOrient(e) {
  let h = null;
  if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
  else if (e.absolute && typeof e.alpha === 'number') h = 360 - e.alpha;
  if (h == null || !S.follow) return;
  S.heading = h;
  const now = Date.now(); if (now - lastTurn < 250) return; lastTurn = now;
  if (Math.abs(((h - map.getBearing() + 540) % 360) - 180) > 4) map.easeTo({ bearing: h, duration: 240, easing: t => t });
}
async function toggleFollow() {
  if (S.follow) { S.follow = false; $('#btnLook').classList.remove('on'); return; }
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') { toast('没有拿到指南针权限'); return; }
    }
  } catch (e) { toast('这台设备没有指南针'); return; }
  window.addEventListener('deviceorientationabsolute', onOrient, true);
  window.addEventListener('deviceorientation', onOrient, true);
  S.follow = true; $('#btnLook').classList.add('on');
  startGPS();
  if (S.me) goTo(S.me, Math.max(map.getZoom(), 17));
  toast('地图会跟着手机转：举起手机，屏幕上方就是你面对的方向');
}
$('#btnLook').hidden = false;
$('#btnLook').onclick = toggleFollow;

/* ---------------- 2D / 3D / base ---------------- */
$('#btn3d').onclick = () => {
  S.d3 = !S.d3;
  $('#btn3d').textContent = S.d3 ? '2D' : '3D';
  $('#btn3d').classList.toggle('on', S.d3);
  if (S.d3) {
    const c = S.crag ? [CRAG[S.crag].lng, CRAG[S.crag].lat] : map.getCenter().toArray();
    flatThenTilt(c, S.crag ? Math.max(map.getZoom(), 16.6) : map.getZoom());
    toast('三维：两指上下拖改变俯仰，两指旋转换方向');
  } else {
    flat3dOff();
  }
};
$('#btnBase').onclick = () => {
  S.base = S.base === 'sat' ? 'topo' : 'sat';
  map.setLayoutProperty('sat', 'visibility', S.base === 'sat' ? 'visible' : 'none');
  map.setLayoutProperty('topo', 'visibility', S.base === 'topo' ? 'visible' : 'none');
  $('#btnBase').textContent = S.base === 'sat' ? '地形' : '卫星';
  if (S.base === 'topo' && map.getZoom() > 17) toast('地形图最细到 16 级，再放大会变糊');
};
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => setView(b.dataset.view));

map.on('load', () => { setView('drive'); });
map.on('error', e => { if (errs.length < 60) errs.push(String((e && e.error && e.error.message) || e)); });
map.getCanvas().addEventListener('webglcontextlost', () => { errs.push('webglcontextlost'); toast('地图画面丢失，正在恢复…'); setTimeout(() => location.reload(), 1200); });

/* ---------------- service worker ---------------- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
window.__rr = { errs, map, S, tileUrls, photoUrls, selectCrag, openPanel, setView };
})();
