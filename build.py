#!/usr/bin/env python3
"""Build site/data.js from data-src (OSM extract + Mountain Project pages)."""
import json, math, re, heapq, glob, os, html

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'data-src')
mp = json.load(open(os.path.join(SRC, 'mp.json')))
mp.update(json.load(open(os.path.join(SRC, 'mp_boulders.json'))))
osm = json.load(open(os.path.join(SRC, 'osm.json')))['elements']
roads = json.load(open(os.path.join(SRC, 'roads.json')))['elements']

P1 = {'key': 'p1', 'name': 'First Pullout（Calico I）', 'short': '第一停车点', 'lat': 36.14648, 'lng': -115.43165}
P2 = {'key': 'p2', 'name': 'Second Pullout（Calico II）', 'short': '第二停车点', 'lat': 36.15182, 'lng': -115.43752}

# Calico Basin lots: outside the Scenic Drive, reached by Calico Basin Road (no fee station)
PK = {'key': 'pk', 'name': 'Kraft Mountain 停车场', 'short': 'Kraft 停车场', 'lat': 36.15680, 'lng': -115.42107, 'basin': True}
PR = {'key': 'pr', 'name': 'Red Spring 停车场', 'short': 'Red Spring 停车场', 'lat': 36.14689, 'lng': -115.41875, 'basin': True}
PULLS = [P1, P2, PK, PR]

# ---------- crag config (Chinese notes are written from the Mountain Project texts) ----------
CRAGS = [
 dict(key='classic-rock-wall', pull='p1', zh='Classic Rock Wall', walk='约 5 分钟',
      sun='走廊内右墙（SW 区）朝东北，几乎全天阴；左墙（NE 区）朝南，大半天晒。四面有墙挡风。',
      way='下停车场台阶后一直靠右，朝 Viagra Towers 走；过了它再往东约 90 米就是走廊入口。面向走廊：左手是 Left (NE)，右手是 Right (SW)。'),
 dict(key='upper-rift', pull='p1', zh='Upper Rift', walk='约 10 分钟',
      sun='上午阴，大约 10–11 点以后晒。',
      way='在 Rift 走廊尽头翻过卡住的大石堆（要手脚并用）；不想翻的话从走廊右侧外面绕，贴着 Bowling Ball Wall 下面走上去。左边容易、中间中等、右边最难。再往前 1 分钟略低处就是 Classic Rock Upper。'),
 dict(key='cactus-massacre', pull='p1', zh='Cactus Massacre', walk='约 10 分钟',
      sun='上午中段以后一直晒。灰色陡墙。',
      way='从停车场直着下坡走到 Circus Cliff 脚下，从这面墙的右端沿石板和大石往上；横过一条沟、再上一小段石板坡，岩壁就在左手边，紧挨一条大冲沟的左侧。'),
 dict(key='civilization-crag', pull='p1', zh='Civilization Crag', walk='10–15 分钟',
      sun='标志是一个朝西北的黑色大内角，上午阴、下午晒。从停车场就能看到。',
      way='主路第一次分岔走右下，从 Circus Wall 右边的缺口上去；之后保持高度向东横切，方向大致和公路平行，中途过一两条冲沟，直到看见一面朝西北的黑色岩壁，它在 Black Hole 那块大陡板的下方。'),
 dict(key='watchtower', pull='p1', zh='Watchtower', walk='约 22 分钟',
      sun='Alcove 和 Lone Pine Wall 朝西，下午晒；The Chasm 烟囱里几乎全天阴。建议戴头盔。',
      way='先按 Civilization Crag 走到岩壁，钻进主墙左边的窄槽（槽里有 Mongol Hoarde 5.10a），到顶穿过一个乱石垭口；过垭口后横过一条沟，向左上方斜着走约 5 分钟到 Watchtower 脚下（Sand Whispers 那条钝棱的起点，周围有很多桶形仙人掌）。Alcove 和 Lone Pine Wall 在 Watchtower 最右线再往右约 15 米。'),
 dict(key='dantes-wall', pull='p1', zh="Dante's Wall", walk='约 20 分钟',
      sun='高墙，位置隐蔽，从停车场看不到。',
      way='先按 Civilization Crag 走，从窄槽线路下方继续往上，跟着石堆标记向东上坡穿过一个缺口；一直向东到 The Chasm，到那面墙后顺着岩体往下绕过去，直到一条又短又陡的窄槽，爬上去就到。这是第一停车点最靠东的岩壁。'),
 dict(key='black-corridor', pull='p2', zh='Black Corridor', walk='5–10 分钟（约 500 米，爬升 15 米）',
      sun='除正午阳光直射进走廊外基本全天阴，挡风，全年可爬。人非常多。',
      way='沿停车场的步道下到下面的冲沟，顺冲沟走，翻过一片光滑石板（经过几个水坑）到第二条沙质冲沟；横过它，再翻过另一道石板棱，进入一条窄冲沟，顺着走到走廊下层入口。下层走到头翻过一堆大石就是上层；上层再往上是 Heat Wave Wall。'),
 dict(key='stone-wall', pull='p2', zh='Stone Wall', walk='15–20 分钟',
      sun='朝东，上午有太阳。比 Black Corridor 清静。',
      way='前半段和去 Black Corridor 一样。到了那片平坦的沙地后向左转（朝通往 Sweet Pain 的沟），走 15–30 米、还在沙地里时找第二个向左的岔口；这条小路看上去走 30 米就要被灌木堵死，其实很快上到岩石，进一条窄沟。窄沟会向右拐 90 度，上去就是 Stone Wall 的左端，线路都在左手边。在沙地直走不拐的话是去 Black Corridor。'),
 dict(key='great-red-book', pull='p2', zh='Great Red Book', walk='20–25 分钟',
      sun='朝西的大石板，中午以后暴晒。从停车场能看到，在 Hunter S. Thompson Dome 的右上方。',
      way='先走到 Black Corridor，穿过走廊后向右急转，上一条贴着 Hunter S. Thompson Dome 下方的斜坡；过了 Dome 和 Poser Crag 后向左上乱石坡，到岩壁脚下。注意：招牌线 Great Red Book 本身是 2 段的 5.8 传统攀，不是运动攀。'),
 # ---- boulders (kind='boulder'): which problems are highlighted is decided in the page from the chosen V cap ----
 dict(key='sorange', pull='pk', kind='boulder', zh='Sorange', walk='约 8 分钟',
      sun='朝东南，上午有太阳。',
      way='最直接：从停车场西端（或中段）那条朝西北的小路走进 West Cluster。也可以走主路，在停车场和 The Cube 之间找一条向左（西）的岔路一直走。看到一面干净岩面上有一道很明显的镁粉痕迹、朝东南，就是 Sorange。'),
 dict(key='hound-dog', pull='pk', kind='boulder', zh='Hound Dog Arete', walk='约 9 分钟',
      sun='',
      way='先到 Main Area：从停车场东端走主路到 The Cube 前的路口右转（东），沿修好的步道走几分钟，左手有带路牌的岔路进石头堆。Hound Dog Arete 在 $600 Boulder 的下坡方向，是三块挨着的小石头。'),
 dict(key='potato-chip', pull='pk', kind='boulder', zh='Potato Chip', walk='约 8 分钟',
      sun='北面全天阴；背面晒到傍晚。',
      way='在 Main Area 中段、紧靠主路的一侧（石头堆的南缘）。石头不小，北面是半月形的悬面，沿口有一排薯片一样的薄片。'),
 dict(key='angel-dyno', pull='pk', kind='boulder', anchor='top', zh='Angel Dyno', walk='约 10 分钟',
      sun='线都在南面，一直晒到傍晚太阳落到山后。',
      way='在 Main Area 靠东的一头，是这片石头里最后几块之一，比 Bubble Butt Boulder 稍靠前。顶上是一块光滑的斜板，很好认。'),
 dict(key='prowler', pull='pk', kind='boulder', zh='Prowler', walk='约 10 分钟',
      sun='大半天都晒。',
      way='紧挨 Angel Dyno，在它左上方（西北）坡上一点。石头不大，一条船头一样的尖棱很显眼。'),
 dict(key='pearl', pull='pk', kind='boulder', anchor='top', zh='The Pearl', walk='约 10 分钟',
      sun='线主要在东北面（几乎不晒）和东南面（晒到下午三点左右）。',
      way='从停车场东北角的主路出发，先向北走一小段到 The Cube 前的东西向主路，右转（东），经过热身石头群继续走。The Pearl 就在路边左手，招牌线在光滑的东南面。'),
 dict(key='wave', pull='pk', kind='boulder', zh='The Wave', walk='约 11 分钟',
      sun='下午晒。',
      way='沿主路过了 The Pearl 再走一点，向左拐就是。石头不高。'),
 dict(key='monkey-bar', pull='pk', kind='boulder', zh='Monkey Bar', walk='约 20 分钟（约 1.3 公里，爬升 30 米）',
      sun='',
      way='从停车场东端沿主路向北朝 The Cube 走，快到时向右（东）转上 Kraft Mountain Loop Trail，一路经过左手边好几片石头，再走约 15 分钟。快到时小路分成两股，从石头两侧绕过。这是 Kraft 最有名的一块，天气好时基本都有人。'),
 dict(key='turtle-shell', pull='pr', kind='boulder', anchor='left', zh='Turtle Shell', walk='约 6 分钟',
      sun='整片 Red Spring 下午太阳转到山后就都阴了。',
      way='从停车场向左（西南）沿修好的步道走几分钟，上一小段坡，石头群在步道右手（西）的山坡上。Turtle Shell 是这一片靠东南端最大的那块，四面都有线，东面有几条洞顶线。'),
 dict(key='sundial', pull='pr', kind='boulder', anchor='right', zh='The Sundial', walk='约 6 分钟',
      sun='整片 Red Spring 下午太阳转到山后就都阴了。',
      way='和 Turtle Shell 同一片，在它西边十几米。上坡找一块像日晷的石头，正面是约 4 米高、带黑色岩漆的悬面。'),
 dict(key='cirque-du-soleil', pull='pr', kind='boulder', zh='Cirque Du Soleil', walk='约 10 分钟',
      sun='整片 Red Spring 下午太阳转到山后就都阴了。',
      way='从停车场走木栈道右侧（北边）那条踩得很实的小路，朝 Cannibal Crag 方向向北。看到 Tsunami Boulder（一条悬出来的棱很显眼）后离开小路，上石板约 15 米到它跟前，再顺着山坡直上约 90 米。Cirque Du Soleil 是一块独立的石头。'),
]

# ---------- grades ----------
def grade_num(g):
    """5.10d -> 10.75 ; returns None if unknown. Slash/plus grades take the harder end."""
    if not g: return None
    m = re.match(r'5\.(\d+)([a-d])?(?:/([a-d]))?([+-])?', g.strip())
    if not m: return None
    n = int(m.group(1)); letter = m.group(3) or m.group(2); pm = m.group(4)
    if n < 10:
        return n + (0.5 if pm == '+' else 0)
    if letter: sub = 'abcd'.index(letter)
    elif pm == '+': sub = 3
    elif pm == '-': sub = 0
    else: sub = 1
    return n + sub / 4
CAP = grade_num('5.10d')

def v_num(g):
    """V3 -> 3 ; ranges and +/- take the harder end (V4-5 -> 5, V5- -> 5) ; V-easy -> 0."""
    if not g: return None
    if re.match(r'V-?(easy|B)', g.strip(), re.I): return 0
    m = re.match(r'V(\d+)(?:-(\d+))?', g.strip())
    return int(m.group(2) or m.group(1)) if m else None

def classify(r):
    t = (r.get('type') or '')
    kinds = [k.strip() for k in t.split(',')]
    is_sport = 'Sport' in kinds
    is_trad = 'Trad' in kinds
    is_tr = 'TR' in kinds
    gn = grade_num(r.get('grade'))
    pitches = 1
    m = re.search(r'(\d+) pitches', t)
    if m: pitches = int(m.group(1))
    stars = r.get('stars'); votes = r.get('votes') or 0
    if is_sport and not is_trad and gn is not None and gn <= CAP:
        if stars is not None and stars >= 2.75 and votes >= 5: tier = 'pick'
        elif gn >= 9: tier = 'good'
        else: tier = 'warm'
    else:
        tier = 'out'
    if not is_sport or is_trad:
        why = '传统攀' if is_trad and not is_sport else ('混合保护' if is_trad else ('顶绳' if is_tr else t.split(',')[0]))
    elif gn is None: why = '难度不明'
    elif gn > CAP: why = '超出 10d'
    else: why = ''
    return tier, why, pitches, gn

def photo_list(url_or_id, kind):
    pat = 'route_%s_*' % url_or_id if kind == 'route' else 'area_%s*' % url_or_id
    out = []; seen = set()
    for fn in glob.glob(os.path.join(SRC, 'cache', pat)):
        h = open(fn).read()
        for m in re.finditer(r'assets/photos/climb/(\d+)_(?:medium|smallMed|large)_(\d+)\.jpg', h):
            if m.group(1) in seen: continue
            seen.add(m.group(1))
            cap = ''
            c = re.search(r'photo/%s/[^"]*"[^>]*>\s*(?:<img[^>]*alt="([^"]*)")?' % m.group(1), h)
            if c and c.group(1): cap = html.unescape(c.group(1))
            out.append({'u': 'https://mountainproject.com/assets/photos/climb/%s_medium_%s.jpg' % (m.group(1), m.group(2)), 'c': cap[:140]})
    return out

def feet(t):
    m = re.search(r'(\d+) ft', t or '')
    return int(m.group(1)) if m else None

def build_sector(a, kind):
    rs = []
    for r in a['routes']:
        if kind == 'boulder':   # tier is filled in by the page from the chosen cap
            tier, why, pitches, gn = None, '', 1, None
        else:
            tier, why, pitches, gn = classify(r)
        s = r['sections']
        rs.append({
            'id': r['id'], 'n': r['name'], 'g': r['grade'], 'gn': gn, 'vn': v_num(r['grade']) if kind == 'boulder' else None, 't': (r.get('type') or '').split(',')[0],
            'type': r.get('type'), 'ft': feet(r.get('type')), 'p': pitches,
            's': r.get('stars'), 'v': r.get('votes') or 0, 'tier': tier, 'why': why,
            'desc': s.get('Description', ''), 'loc': s.get('Location', ''), 'pro': s.get('Protection', ''),
            'fa': r.get('fa') or '', 'url': r['url'],
            'ph': photo_list(r['id'], 'route')[:3],
        })
    return {'id': a['id'], 'name': a['name'], 'lat': a['lat'], 'lng': a['lng'],
            'desc': a['sections'].get('Description', ''), 'get': a['sections'].get('Getting There', ''),
            'url': 'https://www.mountainproject.com/area/%s' % a['id'],
            'ph': photo_list(a['id'], 'area')[:10], 'routes': rs}

def leaves(a):
    if a['routes']: yield a
    for c in a['children']:
        yield from leaves(c)

# ---------- trail graph ----------
def hav(a, b):
    R = 6371000; p1, p2 = math.radians(a[0]), math.radians(b[0])
    x = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b[1] - a[1]) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))

def graph(elements, kinds, oneway=False):
    G = {}; pos = {}
    for e in elements:
        if e['type'] != 'way' or e.get('tags', {}).get('highway') not in kinds: continue
        ns = e['nodes']; geo = e['geometry']
        ow = oneway and e['tags'].get('oneway') == 'yes'
        for i, n in enumerate(ns): pos[n] = (geo[i]['lat'], geo[i]['lon'])
        for i in range(len(ns) - 1):
            d = hav(pos[ns[i]], pos[ns[i + 1]])
            G.setdefault(ns[i], []).append((ns[i + 1], d))
            G.setdefault(ns[i + 1], [])
            if not ow: G[ns[i + 1]].append((ns[i], d))
    return G, pos

def nearest(pos, G, pt):
    return min((n for n in G), key=lambda n: hav(pos[n], pt))

def dijkstra(G, s):
    dist = {s: 0}; prev = {}; pq = [(0, s)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist.get(u, 1e18): continue
        for v, w in G[u]:
            nd = d + w
            if nd < dist.get(v, 1e18):
                dist[v] = nd; prev[v] = u; heapq.heappush(pq, (nd, v))
    return dist, prev

def path_to(prev, s, t):
    p = [t]
    while p[-1] != s: p.append(prev[p[-1]])
    return p[::-1]

FOOT = {'path', 'footway', 'steps', 'track', 'pedestrian', 'bridleway', 'service'}
TG, TP = graph(osm, FOOT)
foot_from = {}
for P in PULLS:
    s = nearest(TP, TG, (P['lat'], P['lng']))
    foot_from[P['key']] = (s,) + dijkstra(TG, s)

def approach(pull, target):
    """Best trail node: minimise trail distance + 3x off-trail distance to target."""
    s, dist, prev = foot_from[pull]
    best = min(dist, key=lambda n: dist[n] + 3 * hav(TP[n], target))
    nodes = path_to(prev, s, best)
    line = [[round(TP[n][1], 6), round(TP[n][0], 6)] for n in nodes]
    return {'trail': line, 'trail_m': round(dist[best]), 'off_m': round(hav(TP[best], target)),
            'off': [line[-1], [target[1], target[0]]]}

# ---------- assemble crags ----------
out_crags = []
for cfg in CRAGS:
    a = mp[cfg['key']]
    kind = cfg.get('kind', 'sport')
    if not glob.glob(os.path.join(SRC, 'cache', 'area_%s*' % a['id'])):
        raise SystemExit('data-src/cache 里没有 %s 的页面，照片会全部丢掉。先在 data-src 里跑 scrape.py（两组都跑）把页面抓回来再生成。' % cfg['key'])
    sectors = [build_sector(x, kind) for x in leaves(a)]
    allr = [r for s in sectors for r in s['routes']]
    lat, lng = a['lat'], a['lng']
    ap = approach(cfg['pull'], (lat, lng))
    c = dict(cfg); c['kind'] = kind
    c.update({'name': a['name'], 'lat': lat, 'lng': lng, 'url': 'https://www.mountainproject.com/area/%s' % a['id'],
              'desc': a['sections'].get('Description', ''), 'get': a['sections'].get('Getting There', ''),
              'ph': photo_list(a['id'], 'area')[:10], 'sectors': sectors, 'approach': ap,
              'count': {t: sum(1 for r in allr if r['tier'] == t) for t in ('pick', 'good', 'warm', 'out')}})
    out_crags.append(c)
    print('%-18s routes %3d pick %2d good %2d warm %2d out %2d | trail %4dm + off %3dm | photos %d' % (
        cfg['key'], len(allr), c['count']['pick'], c['count']['good'], c['count']['warm'], c['count']['out'],
        ap['trail_m'], ap['off_m'], len(c['ph'])))

# ---------- driving ----------
ROAD = {'primary', 'secondary', 'tertiary', 'unclassified', 'trunk', 'service', 'residential'}
seen = set(); merged = []
for e in roads + osm:
    if e['type'] == 'way' and e['id'] not in seen:
        seen.add(e['id']); merged.append(e)
RG, RP = graph(merged, ROAD, oneway=True)
loop = [e for e in merged if e.get('tags', {}).get('name') in ('Scenic Loop Drive', 'Red Rock Scenic Drive')]
# entrance = junction of the scenic drive with SR-159 (Red Rock Canyon Road)
hw = set(n for e in merged if e.get('tags', {}).get('name') == 'Red Rock Canyon Road' for n in e['nodes'])
# start on the highway ~1.5 km east (town side) of the entrance turn
ent_nodes = [n for e in loop for n in e['nodes'] if n in hw]
print('loop/highway junction nodes', [(RP[n]) for n in ent_nodes])

def drive(a, b):
    s = nearest(RP, RG, a); t = nearest(RP, RG, b)
    dist, prev = dijkstra(RG, s)
    if t not in dist: return None
    return [[round(RP[n][1], 6), round(RP[n][0], 6)] for n in path_to(prev, s, t)], round(dist[t])

FEE = (36.1352, -115.4276)   # refined below from data print
drv = {}
if ent_nodes:
    ent = min(ent_nodes, key=lambda n: hav(RP[n], (P1['lat'], P1['lng'])))
    E = RP[ent]
    for k, a, b in (('in1', E, (P1['lat'], P1['lng'])), ('in2', (P1['lat'], P1['lng']), (P2['lat'], P2['lng']))):
        r = drive(a, b); drv[k] = {'line': r[0], 'm': r[1]} if r else None
        print(k, r and r[1])
    # full remaining loop from P2 back to the highway
    exits = [n for n in ent_nodes if n != ent] or ent_nodes
    best = None
    for n in exits:
        r = drive((P2['lat'], P2['lng']), RP[n])
        if r and (best is None or r[1] < best[1]): best = r
    drv['out'] = {'line': best[0], 'm': best[1]} if best else None
    print('out', best and best[1])
    drv['entrance'] = [E[1], E[0]]
# Calico Basin: turn off SR-159 onto Calico Basin Road, then to the two lots
cb = set(n for e in merged if e.get('tags', {}).get('name') == 'Calico Basin Road' for n in e['nodes']) & hw
print('calico basin junction', [RP[n] for n in cb])
if cb:
    J = RP[next(iter(cb))]
    drv['junction'] = [J[1], J[0]]
    for k, P in (('cbr', PR), ('cbk', PK)):
        r = drive(J, (P['lat'], P['lng'])); drv[k] = {'line': r[0], 'm': r[1]} if r else None
        print(k, r and r[1], r and hav((r[0][-1][1], r[0][-1][0]), (P['lat'], P['lng'])))

# ---------- overlays ----------
def feats(elements, pred, props):
    fs = []
    for e in elements:
        if e['type'] == 'way' and pred(e.get('tags', {})):
            fs.append({'type': 'Feature', 'properties': props(e['tags']),
                       'geometry': {'type': 'LineString', 'coordinates': [[round(p['lon'], 6), round(p['lat'], 6)] for p in e['geometry']]}})
    return {'type': 'FeatureCollection', 'features': fs}
trails = feats(osm, lambda t: t.get('highway') in ('path', 'footway', 'steps', 'track', 'bridleway'), lambda t: {'name': t.get('name', '')})
roadfc = feats(merged, lambda t: t.get('highway') in ROAD, lambda t: {'name': t.get('name', ''), 'loop': t.get('name') in ('Scenic Loop Drive', 'Red Rock Scenic Drive'), 'ow': t.get('oneway') == 'yes'})

# other named crags from OSM as faint landmarks
marks = []
mine = [(c['lat'], c['lng']) for c in out_crags]
for e in osm:
    t = e.get('tags', {})
    if t.get('climbing') == 'crag' and t.get('name'):
        if e['type'] == 'node': p = (e['lat'], e['lon'])
        elif e.get('bounds'): b = e['bounds']; p = ((b['minlat'] + b['maxlat']) / 2, (b['minlon'] + b['maxlon']) / 2)
        else: continue
        if min(hav(p, m) for m in mine) > 35: marks.append({'n': t['name'], 'lat': round(p[0], 6), 'lng': round(p[1], 6)})
for e in osm:
    t = e.get('tags', {})
    if e['type'] == 'node' and t.get('amenity') == 'toilets':
        marks.append({'n': '厕所', 'lat': e['lat'], 'lng': e['lon'], 'k': 'wc'})

data = {'built': __import__('datetime').date.today().isoformat(), 'pullouts': PULLS, 'crags': out_crags,
        'drive': drv, 'trails': trails, 'roads': roadfc, 'marks': marks}
js = 'window.DATA=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';'
open(os.path.join(ROOT, 'site', 'data.js'), 'w').write(js)
print('data.js', len(js) // 1024, 'KB', 'trails', len(trails['features']), 'roads', len(roadfc['features']), 'marks', len(marks))
