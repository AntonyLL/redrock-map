import re,json,time,html,urllib.request,os,sys
UA="Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 Chrome/130 Safari/537.36"
os.makedirs('cache',exist_ok=True)
def get(url):
    fn='cache/'+re.sub(r'[^a-z0-9]+','_',url.split('mountainproject.com/')[1])[:120]+'.html'
    if os.path.exists(fn): return open(fn).read()
    for k in range(3):
        try:
            h=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':UA}),timeout=40).read().decode('utf8','replace'); break
        except Exception as e:
            print('retry',url,e,file=sys.stderr); time.sleep(3); h=''
    open(fn,'w').write(h); time.sleep(0.7); return h
def txt(s):
    s=re.sub(r'<br\s*/?>|</p>|</div>|</li>','\n',s); s=re.sub(r'<[^>]+>','',s)
    return re.sub(r'\n\s*\n+','\n\n',html.unescape(s)).strip()
def sections(h):
    out={}
    for m in re.finditer(r'<h2[^>]*>\s*(?:<a name="[^"]*"></a>)?\s*([A-Za-z &;]+?)\s*<!--EDIT.*?</h2>\s*<div class="fr-view">(.*?)</div>\s*(?:</div>|<div|<h2|<a)',h,re.S):
        out[html.unescape(m.group(1)).strip()]=txt(m.group(2))
    return out
def photos(h):
    ph=[];seen=set()
    for m in re.finditer(r'<a[^>]+href="(https://www\.mountainproject\.com/photo/(\d+)/[^"]*)"[^>]*>\s*<img[^>]+?(?:data-src|src)="(https://[^"]*?/assets/photos/climb/[^"]+)"[^>]*?(?:alt="([^"]*)")?',h,re.S):
        if m.group(2) in seen: continue
        seen.add(m.group(2)); ph.append({'id':m.group(2),'page':m.group(1),'img':m.group(3),'alt':html.unescape(m.group(4) or '')})
    return ph
def area(aid):
    h=get('https://www.mountainproject.com/area/%s'%aid)
    a={'id':aid,'name':txt(re.search(r'<h1[^>]*>(.*?)</h1>',h,re.S).group(1)).split('\n')[0].strip()}
    g=re.search(r'GPS:</td>\s*<td>\s*([-\d.]+),\s*([-\d.]+)',h); a['lat'],a['lng']=(float(g.group(1)),float(g.group(2))) if g else (None,None)
    a['sections']=sections(h); a['photos']=photos(h)
    a['routes']=[]
    t=re.search(r'id="left-nav-route-table">(.*?)</table>',h,re.S)
    if t:
        for r in re.finditer(r'data-lr="(-?\d+)".*?href="(https://www.mountainproject.com/route/(\d+)/[^"]*)">(.*?)</a>\s*<span class="route-type ([^"]*)">(.*?)</span>\s*<!--TODO',t.group(1),re.S):
            gy=re.search(r"rateYDS'>([^<]*)",r.group(6))
            extra=txt(re.sub(r"<span class='rate(?!YDS)[A-Za-z]+'>[^<]*</span>",'',r.group(6)))
            a['routes'].append({'lr':int(r.group(1)),'id':r.group(3),'url':r.group(2),'name':txt(r.group(4)),'cls':r.group(5),'grade':gy.group(1).strip() if gy else None,'gradeline':' '.join(extra.split())})
        a['routes'].sort(key=lambda r:r['lr'])
    a['children']=[]
    for m in re.finditer(r'<div class="lef-nav-row">\s*<a href="https://www.mountainproject.com/area/(\d+)/',h):
        a['children'].append(area(m.group(1)))
    for r in a['routes']: route(r)
    return a
def route(r):
    h=get(r['url'])
    r['sections']=sections(h)
    m=re.search(r'Avg:\s*([\d.]+)\s*from\s*([\d,]+)\s*vote',h); 
    if m: r['stars']=float(m.group(1)); r['votes']=int(m.group(2).replace(',',''))
    m=re.search(r'Type:</td>\s*<td>\s*(.*?)</td>',h,re.S); r['type']=' '.join(txt(m.group(1)).split()) if m else None
    m=re.search(r'FA:</td>\s*<td>\s*(.*?)</td>',h,re.S); r['fa']=' '.join(txt(m.group(1)).split()) if m else None
    r['photos']=photos(h)[:6]
    # comments
    r['comments']=[' '.join(txt(c).split())[:600] for c in re.findall(r'<div class="comment-body[^"]*">(.*?)</div>',h,re.S)][:8]
GROUPS={
 # sport crags on the Scenic Drive -> mp.json
 'mp':{'stone-wall':'105820170','great-red-book':'105732120','black-corridor':'105732030','dantes-wall':'109868589','civilization-crag':'106686385','cactus-massacre':'114114376','classic-rock-wall':'122003508','watchtower':'202497801','upper-rift':'126660358'},
 # Calico Basin boulders -> mp_boulders.json
 'mp_boulders':{'sorange':'114000100','monkey-bar':'105937674','angel-dyno':'106378780','potato-chip':'105959400','wave':'113802231','pearl':'106056258','prowler':'116107548','hound-dog':'111338565','turtle-shell':'107158774','sundial':'106657531','cirque-du-soleil':'125717942'},
}
# parent pages read only for their directions and access notes (no recursion into children)
PARENTS={'mp_boulders':{'_kraft':'105937608','_redspring':'106657528','_calico':'108541423','_west':'114986624','_main':'123855477','_pearl':'123855693','_east':'123855862','_rs_main':'125621150','_rs_hill':'200291782'}}
def parent(aid):
    h=get('https://www.mountainproject.com/area/%s'%aid)
    a={'id':aid,'name':txt(re.search(r'<h1[^>]*>(.*?)</h1>',h,re.S).group(1)).split('\n')[0].strip(),'sections':sections(h)}
    a['access']=[' '.join(txt(m).split()) for m in re.findall(r'Access Issue:\s*</span>(.*?)</div>\s*</div>',h,re.S)]
    return a
grp=sys.argv[1] if len(sys.argv)>1 else 'mp'
out={}
for k,v in GROUPS[grp].items():
    out[k]=area(v); print(k,out[k]['name'],out[k]['lat'],len(out[k]['routes']),[ (c['name'],len(c['routes'])) for c in out[k]['children']],list(out[k]['sections']),len(out[k]['photos']),flush=True)
for k,v in PARENTS.get(grp,{}).items():
    out[k]=parent(v); print(k,out[k]['name'],list(out[k]['sections']),len(out[k]['access']),flush=True)
json.dump(out,open(grp+'.json','w'),indent=1,ensure_ascii=False)
