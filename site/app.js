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

/* ---------------- tiles ---------------- */
const SRC = {
  sat: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  topo: (z, x, y) => `https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/${z}/${y}/${x}`,
  dem: (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
};
const BOX = { // [south, west, north, east]
  big: [36.08, -115.52, 36.19, -115.38],
  mid: [36.126, -115.447, 36.161, -115.413],
  calico: [36.1395, -115.4445, 36.1610, -115.4170],
  c1: [36.1432, -115.4330, 36.1485, -115.4225],
  c2: [36.1508, -115.4392, 36.1580, -115.4332],
};
const PLAN = [
  ['sat', 'big', 10, 13], ['sat', 'mid', 14, 16], ['sat', 'calico', 17, 18], ['sat', 'c1', 19, 19], ['sat', 'c2', 19, 19],
  ['topo', 'big', 10, 13], ['topo', 'mid', 14, 16],
  ['dem', 'big', 10, 12], ['dem', 'mid', 13, 15],
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
      for (const r of s.routes) if (r.tier !== 'out') r.ph.slice(0, 2).forEach(p => out.add(p.u));
    }
  }
  return [...out];
}
const TILE_CACHE = 'rr-data-v1';

/* ---------------- map ---------------- */
const lineFC = feats => ({ type: 'FeatureCollection', features: feats });
const line = (coords, props) => ({ type: 'Feature', properties: props || {}, geometry: { type: 'LineString', coordinates: coords } });
const approachFC = lineFC(D.crags.flatMap(c => [line(c.approach.trail, { key: c.key, kind: 'trail' }), line(c.approach.off, { key: c.key, kind: 'off' })]));
const driveFC = lineFC(['in1', 'in2', 'out'].filter(k => D.drive[k]).map(k => line(D.drive[k].line, { leg: k })));

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      sat: { type: 'raster', tiles: [SRC.sat('{z}', '{x}', '{y}')], tileSize: 256, minzoom: 10, maxzoom: 19, attribution: '影像 © Esri, Maxar, Earthstar Geographics' },
      topo: { type: 'raster', tiles: [SRC.topo('{z}', '{x}', '{y}')], tileSize: 256, minzoom: 10, maxzoom: 16, attribution: '地形图 USGS' },
      dem: { type: 'raster-dem', tiles: [SRC.dem('{z}', '{x}', '{y}')], tileSize: 256, minzoom: 10, maxzoom: 15, encoding: 'terrarium', attribution: '高程 USGS 3DEP / Mapzen' },
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
  center: [-115.431, 36.142], zoom: 13.2, minZoom: 10, maxZoom: 20.5, maxPitch: 78,
  maxBounds: [[BOX.big[1], BOX.big[0]], [BOX.big[3], BOX.big[2]]],
  attributionControl: { compact: true }, dragRotate: true, pitchWithRotate: true,
});
map.addControl(new maplibregl.NavigationControl({ showZoom: false, visualizePitch: true }), 'bottom-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

/* markers */
const cragMarkers = {};
function mk(cls, text, lngLat, onClick) {
  const e = el('div', 'mk ' + cls, esc(text));
  if (onClick) e.addEventListener('click', ev => { ev.stopPropagation(); onClick(); });
  return new maplibregl.Marker({ element: e, anchor: 'bottom' }).setLngLat(lngLat).addTo(map);
}
D.marks.forEach(m => mk(m.k === 'wc' ? 'wc ref' : 'ref', m.n, [m.lng, m.lat]));
D.crags.forEach(c => { cragMarkers[c.key] = mk('', c.zh, [c.lng, c.lat], () => selectCrag(c.key)); cragMarkers[c.key].getElement().innerHTML = `${esc(c.zh)} <span class="t">${esc(walkShort(c))}</span>`; });
D.pullouts.forEach(p => mk('pull', 'P ' + p.short, [p.lng, p.lat], () => setView(p.key)));
if (D.drive.entrance) mk('gate', '入口 / 收费站方向', D.drive.entrance, () => setView('drive'));
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
map.on('zoom', () => document.body.classList.toggle('far', map.getZoom() < 15.6));
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

function setView(v) {
  S.view = v; S.crag = null;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  renderChips(); highlight(); renderCard();
  if (v === 'drive') {
    fit([D.drive.entrance, [PULL.p1.lng, PULL.p1.lat], [PULL.p2.lng, PULL.p2.lat]], 15);
  } else {
    const p = PULL[v];
    fit([[p.lng, p.lat]].concat(D.crags.filter(c => c.pull === v).map(c => [c.lng, c.lat])), 17);
  }
}
function pad() { return { top: 150, bottom: Math.min(innerHeight * 0.46, 330), left: 30, right: 70 }; }
function fit(pts, maxZoom) {
  const b = new maplibregl.LngLatBounds(pts[0], pts[0]); pts.forEach(p => b.extend(p));
  map.fitBounds(b, { padding: pad(), maxZoom: maxZoom || 18, pitch: S.d3 ? 62 : 0, bearing: S.d3 ? map.getBearing() : 0, duration: 700 });
}
function selectCrag(key) {
  const c = CRAG[key];
  S.view = c.pull; S.crag = key; S.sector = 0; S.filter = 'all';
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === c.pull));
  renderChips(); highlight(); renderCard();
  const p = PULL[c.pull];
  fit([[p.lng, p.lat], [c.lng, c.lat]].concat(c.approach.trail), 18.5);
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
    e.style.display = (S.view === 'drive' || CRAG[k].pull === S.view) ? '' : 'none';
  }
}
function renderChips() {
  const box = $('#chips'); box.innerHTML = '';
  if (S.view === 'drive') {
    const b = el('button', 'chip', '进园须知与离线下载'); b.onclick = openInfo; box.appendChild(b);
    const b2 = el('button', 'chip', '今天爬什么'); b2.onclick = () => openInfo('picks'); box.appendChild(b2);
    return;
  }
  D.crags.filter(c => c.pull === S.view).forEach(c => {
    const b = el('button', 'chip' + (c.key === S.crag ? ' on' : ''), `${esc(c.zh)} <span class="t">${esc(walkShort(c))}</span> <small>★${c.count.pick}</small>`);
    b.onclick = () => selectCrag(c.key); box.appendChild(b);
  });
  const on = $('#chips .on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
}

/* ---------------- bottom card ---------------- */
function gpsLine(c) {
  if (!S.me) return '<div class="gps">点右边“定位”显示你离岩壁多远</div>';
  const d = dist(S.me, [c.lng, c.lat]), br = bearing(S.me, [c.lng, c.lat]);
  if (d < 40) return '<div class="gps near">你已在岩壁附近（定位误差内）· 点“找线”</div>';
  const total = c.approach.trail_m + c.approach.off_m, wm = walkMin(c);
  const left = wm && d < total * 1.3 ? `，大约还要 ${Math.max(1, Math.round(wm * Math.min(1, d / total)))} 分钟` : '';
  return `<div class="gps">岩壁在你的${compass(br)}方向，直线 ${fmtM(d)}${left}</div>`;
}
function renderCard() {
  const card = $('#card'); card.hidden = false;
  if (S.view === 'drive') {
    const a = D.drive.in1 ? (D.drive.in1.m / 1000).toFixed(1) : '?', b = D.drive.in2 ? (D.drive.in2.m / 1000).toFixed(1) : '?', o = D.drive.out ? Math.round(D.drive.out.m / 1000) : '?';
    card.innerHTML = `<h3>开车进园</h3>
      <div class="way">从 Charleston Blvd（159 号公路）一路向西，右转进 Scenic Drive 过收费站。<b>进门后约 ${a} 公里是第一停车点，再往前 ${b} 公里是第二停车点</b>（黄线）。</div>
      <div class="warn">全程单行道：开过第一停车点就不能掉头。两个都去的话先停第一个。离开要把整圈开完，从第二停车点到出口还有约 ${o} 公里（灰色虚线）。</div>
      <div class="row"><button class="btn ghost slim" id="cInfo">须知与离线下载</button><button class="btn slim" id="cP1">看第一停车点</button></div>`;
    $('#cInfo').onclick = () => openInfo(); $('#cP1').onclick = () => setView('p1');
    return;
  }
  if (!S.crag) {
    const p = PULL[S.view];
    card.innerHTML = `<h3>${esc(p.name)}</h3><div class="sub">点岩壁名字看走法和线路</div><ul class="list">` +
      D.crags.filter(c => c.pull === S.view).map(c => `<li data-k="${c.key}"><b>${esc(c.zh)}</b> <span class="etaS">步行 ${esc(walkShort(c))}</span><br><span class="badge pick">★ 首选 ${c.count.pick}</span> <span class="badge good">同级 ${c.count.good}</span> <span class="badge warm">热身 ${c.count.warm}</span></li>`).join('') + '</ul>';
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
    <div id="cWayBox" hidden><div class="way">${esc(c.way)}</div><div class="way"><b>日晒：</b>${esc(c.sun)}</div>${offNote}
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
function routeCard(sec, r, i) {
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
      ${nb.length ? `<div class="next">挂完这条不用挪地方，可以顺刷：${nb.join('；')}</div>` : ''}
      ${r.pro ? `<h5>保护 / 挂片</h5><p>${esc(r.pro)}</p>` : ''}
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
  body.appendChild(el('div', 'secnote', '下图按面向岩壁<b>从左到右</b>排列，线的高矮按线路长度画，不是照片。点一条线跳到它的卡片。'));
  const topo = el('div', 'topo', topoSVG(sec)); body.appendChild(topo);
  body.appendChild(el('div', 'legend', '<span><i class="pick"></i>★ 首选（运动攀 ≤10d，约三星及以上）</span><span><i></i>同级可刷（5.9–10d）</span><span><i class="warm"></i>热身（≤5.8）</span><span><i class="out"></i>不在范围（超 10d / 传统 / 顶绳）</span>'));
  const ph = (sec.ph.length ? sec.ph : c.ph);
  if (ph.length) {
    body.appendChild(el('div', 'secnote', '岩壁照片（部分带有网友画的线，点开放大）：'));
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
    body.appendChild(routeCard(sec, r, i));
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
function topPicks() {
  const rows = [];
  for (const c of D.crags) for (const s of c.sectors) s.routes.forEach((r, i) => { if (r.tier === 'pick') rows.push({ c, s, r, i }); });
  rows.sort((a, b) => (b.r.s - a.r.s) || (b.r.v - a.r.v));
  return rows;
}
function openInfo(focus) {
  const b = $('#infoBody');
  const picks = topPicks();
  b.innerHTML = `
  <div class="box" id="offBox">
    <h3 style="margin-top:0">离线数据</h3>
    ${isIOS && !isStandalone ? '<p><b>先做这一步：</b>点 Safari 底部的“分享”按钮 → “添加到主屏幕”，然后<b>从主屏幕的图标打开</b>再下载。在 Safari 里下载的数据，主屏幕图标用不到。</p>' : ''}
    <p id="offState">正在检查…</p>
    <div class="bar"><i id="offBar"></i></div>
    <div class="row"><button class="btn" id="offGo">下载离线数据</button></div>
    <p class="src">包含卫星图、地形图、三维地形和岩壁照片，约 60–80 MB，请在 Wi-Fi 下进行。下完后开飞行模式再打开一次，确认地图和照片都在。</p>
  </div>
  <div class="box"><h3 style="margin-top:0">进园</h3><ul>
    <li><b>10 月到次年 5 月，8:00–17:00 之间入园要在 recreation.gov 预约时段</b>；8:00 前入园不用预约。Scenic Drive 早上 6:00 开门。</li>
    <li>门票按车收，国家公园年卡可抵门票（预约手续费另付）。</li>
    <li>13 英里环线全程<b>单行</b>：先第一停车点，后第二停车点，开过不能回头；离开要开完整圈。</li>
    <li>第二停车点车位少，周末和假日一早就满。</li>
    <li>冬季关门早，天黑前（11 月底日落约 16:30）回到车上并开出环线。</li>
  </ul></div>
  <div class="box"><h3 style="margin-top:0">岩石与安全</h3><ul>
    <li><b>雨后砂岩不能爬</b>：湿的砂岩很脆，岩点会断。下过雨至少等 24–72 小时，地面下面的沙子还是湿的就别爬。</li>
    <li>地图上的蓝点在窄走廊里（Black Corridor、The Rift）会漂，最后几十米按文字和照片认路。</li>
    <li>星级、难度、挂片数来自网友，实际以现场为准；长线先核对绳长，绳尾打结。</li>
  </ul></div>
  <div class="box" id="picksBox"><h3 style="margin-top:0">今天爬什么（运动攀 ≤5.10d 的首选线）</h3>
    <p class="src">按 Mountain Project 星级从高到低。点一条直接打开它所在的岩壁。</p>
    <ul class="list">${picks.map((x, n) => `<li data-n="${n}"><b>★ ${esc(x.r.n)}</b> ${esc(x.r.g)} · ${starStr(x.r)}<br><span class="src">${esc(x.c.zh)}${x.c.sectors.length > 1 ? ' · ' + esc(x.s.name) : ''} · ${esc(PULL[x.c.pull].short)} · 左起第 ${x.i + 1} 条</span></li>`).join('')}</ul></div>
  <p class="src">底图：Esri World Imagery、USGS Topo、USGS 3DEP 高程；道路与小路 © OpenStreetMap 贡献者；线路资料来自 Mountain Project。仅供个人使用。数据整理于 ${esc(D.built)}。</p>`;
  b.querySelectorAll('#picksBox li').forEach(li => li.onclick = () => {
    const x = picks[+li.dataset.n]; $('#info').hidden = true; selectCrag(x.c.key);
    S.sector = x.c.sectors.indexOf(x.s); openPanel(x.c.key);
    const d = $('#r' + x.r.id); if (d) { d.open = true; d.scrollIntoView({ block: 'center' }); }
  });
  $('#offGo').onclick = download;
  $('#info').hidden = false;
  checkOffline();
  if (focus === 'picks') $('#picksBox').scrollIntoView();
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
  if (watchId != null) { if (S.me) map.easeTo({ center: S.me, zoom: Math.max(map.getZoom(), 17) }); else toast('正在等定位，没有信号时第一次可能要一分钟'); return; }
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
    if (first) { if (inBox) map.easeTo({ center: S.me, zoom: Math.max(map.getZoom(), 16) }); else toast('已定位，但你现在不在 Red Rock 范围内，到了以后蓝点会出现在地图上'); }
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
  if (S.me) map.easeTo({ center: S.me, zoom: Math.max(map.getZoom(), 17), pitch: S.d3 ? 72 : 0 });
  toast('地图会跟着手机转：举起手机，屏幕上方就是你面对的方向');
}
$('#btnLook').hidden = false;
$('#btnLook').onclick = toggleFollow;

/* ---------------- 2D / 3D / base ---------------- */
$('#btn3d').onclick = () => {
  S.d3 = !S.d3;
  $('#btn3d').textContent = S.d3 ? '2D' : '3D';
  $('#btn3d').classList.toggle('on', S.d3);
  if (S.d3) { map.setTerrain({ source: 'dem', exaggeration: 1 }); map.easeTo({ pitch: 62, duration: 800 }); toast('三维：两指上下拖改变俯仰，两指旋转换方向'); }
  else { map.easeTo({ pitch: 0, bearing: 0, duration: 600 }); map.once('moveend', () => { if (!S.d3) map.setTerrain(null); }); }
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
map.on('error', () => {});

/* ---------------- service worker ---------------- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
window.__rr = { map, S, tileUrls, photoUrls, selectCrag, openPanel, setView };
})();
