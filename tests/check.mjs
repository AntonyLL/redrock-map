// Data and syntax checks run before every deploy.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
for (const f of ['site/app.js', 'site/sw.js']) execFileSync(process.execPath, ['--check', f]);
const window = {};
new Function('window', readFileSync('site/data.js', 'utf8'))(window);
const D = window.DATA;
assert.equal(D.crags.filter(c => c.kind === 'sport').length, 9, '应有 9 个岩壁');
assert.equal(D.crags.filter(c => c.kind === 'boulder').length, 11, '应有 11 块抱石');
assert.equal(D.pullouts.length, 4);
const PULLS = D.pullouts.map(p => p.key);
for (const k of ['in1', 'in2', 'out', 'cbr', 'cbk']) assert.ok(D.drive[k] && D.drive[k].line.length > 5, '缺开车路线 ' + k);
const gradeNum = g => { const m = /^5\.(\d+)([a-d])?(?:\/([a-d]))?([+-])?/.exec(g || ''); if (!m) return null; const n = +m[1]; if (n < 10) return n; const l = m[3] || m[2]; return n + (l ? 'abcd'.indexOf(l) : m[4] === '+' ? 3 : m[4] === '-' ? 0 : 1) / 4; };
let total = 0, btotal = 0;
for (const c of D.crags) {
  const boulder = c.kind === 'boulder';
  assert.ok(PULLS.includes(c.pull) && (boulder ? ['pk', 'pr'] : ['p1', 'p2']).includes(c.pull), c.key + ' 停车点不对');
  assert.ok(c.way && c.walk && (boulder || c.sun), c.key + ' 缺中文走法');
  assert.ok(/^(约 )?\d+(–\d+)? 分钟/.test(c.walk), c.key + ' 的步行时间要以“约 N 分钟”或“N–M 分钟”开头，页面靠它显示和估算');
  assert.ok(c.approach.trail.length >= 2, c.key + ' 缺进山路线');
  if (boulder) assert.ok(c.lat > 36.14 && c.lat < 36.165 && c.lng < -115.405 && c.lng > -115.43, c.key + ' 坐标不在 Calico Basin 范围');
  else assert.ok(c.lat > 36.14 && c.lat < 36.16 && c.lng < -115.42 && c.lng > -115.44, c.key + ' 坐标不在 Calico 范围');
  assert.ok(c.approach.trail_m + c.approach.off_m < 1600, c.key + ' 进山路线长得不合理，多半是停车点配错了');
  for (const s of c.sectors) for (const r of s.routes) {
    if (boulder) {
      // 抱石的高亮由页面按“我的抱石上限”现算（app.js 的 applyCap），数据里只要求难度能读出数字
      btotal++;
      assert.ok(/^Boulder/.test(r.type || ''), `${r.n} 不是抱石线`);
      assert.ok(Number.isInteger(r.vn) && r.vn >= 0 && r.vn <= 17, `${r.n} ${r.g} 读不出 V 级`);
      const m = /^V(\d+)(?:-(\d+))?/.exec(r.g); if (m) assert.equal(r.vn, +(m[2] || m[1]), `${r.n} ${r.g} 的 V 级要取较难的一端`);
      assert.equal(r.tier, null, '抱石线不在数据里定高亮');
      continue;
    }
    total++;
    if (r.tier !== 'out') {
      // 高亮为“能爬”的线必须是运动攀且不超过 5.10d —— 判定规则在 build.py 的 classify()
      assert.ok(/^Sport/.test(r.type || '') && !/Trad/.test(r.type), `${r.n} 不是纯运动攀却被标为能爬`);
      assert.ok(gradeNum(r.g) !== null && gradeNum(r.g) <= 10.75, `${r.n} ${r.g} 超过 5.10d 却被标为能爬`);
    }
    if (r.tier === 'pick') assert.ok(r.s >= 2.75 && r.v >= 5, `${r.n} 星级不够却被标为首选`);
  }
}
assert.ok(total > 150, '线路数量异常：' + total);
assert.ok(btotal > 80, '抱石线数量异常：' + btotal);
const sw = readFileSync('site/sw.js', 'utf8'), app = readFileSync('site/app.js', 'utf8');
for (const h of ['server.arcgisonline.com', 'basemap.nationalmap.gov', 's3.amazonaws.com', 'mountainproject.com'])
  assert.ok(sw.includes(h) && (app.includes(h) || readFileSync('site/data.js', 'utf8').includes(h)), '离线缓存域名与页面用到的不一致：' + h);
assert.ok(/TILE_CACHE = 'rr-data-v1'/.test(app) && /DATA = 'rr-data-v1'/.test(sw), '页面和离线脚本的缓存名必须一致');
// 用 hidden 属性收起的面板不能被样式里的 display 盖掉，否则会挡住整页
assert.ok(readFileSync('site/style.css', 'utf8').includes('[hidden]{display:none!important}'), '样式里必须保留 [hidden]{display:none!important}');
// 三维下换地方必须走 fit()/tiltUp()：先平着跳过去、等高程到位再倾斜。带地形直接做动画会让镜头掉到地面以下。
assert.ok(!/fitBounds\([^)]*pitch: S\.d3/.test(app) && /function tiltUp/.test(app), '三维下不要直接 fitBounds 带倾角，改用 fit()');
assert.ok(/function applyCap\(\)/.test(app) && /r\.vn > VCAP/.test(app), '页面里必须保留按上限给抱石线分档的 applyCap');
for (const p of D.pullouts) assert.ok(readFileSync('site/index.html', 'utf8').includes(`data-view="${p.key}"`), '顶部缺少标签：' + p.key);
console.log('ok', D.crags.length, 'crags', total, 'routes', btotal, 'boulder problems');
