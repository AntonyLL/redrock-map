import json,urllib.request,sys
def q(s):
    r=urllib.request.Request('https://api.openbeta.io',json.dumps({'query':s}).encode(),{'content-type':'application/json','user-agent':'trailmap/1.0'})
    return json.load(urllib.request.urlopen(r,timeout=60))
CL='climbs{name uuid grades{yds} type{sport trad tr bouldering aid} length boltsCount fa safety metadata{lat lng leftRightIndex mp_id} content{description location protection}}'
def area(u):
    d=q('{area(uuid:"%s"){area_name uuid totalClimbs metadata{lat lng mp_id leftRightIndex} content{description} %s children{uuid area_name}}}'%(u,CL))
    if 'errors' in d: print(d['errors'],file=sys.stderr)
    a=d['data']['area']; a['children']=[area(c['uuid']) for c in a['children']]; return a
if __name__=='__main__':
    for nm in ['Watch','Rift']:
        d=q('{areas(filter:{area_name:{match:"%s"}}){area_name uuid pathTokens totalClimbs metadata{lat lng mp_id}}}'%nm)
        for a in d['data']['areas']:
            if 'Nevada' in a['pathTokens']: print(a)
    ids={'stone-wall':'72fe4e8c-9fe5-5203-868a-b980a244e3f6','great-red-book':'c86cccb3-6b80-5830-8ad4-a0f044db26be','black-corridor':'bd1a36f9-fcb9-5d2c-8c45-acfd8dcc6428','dantes-wall':'b47c9ab5-f947-51a1-9511-da0dca07d9fa','civilization-crag':'bf52d6e0-8d43-5b18-a3d3-bb0cc6ebc916','cactus-massacre':'eb2f0ff1-da5e-52da-b53e-e2f336f14194','classic-rock-wall':'f48459bb-9213-50df-a221-d6750bbb6cbb'}
    out={k:area(v) for k,v in ids.items()}
    json.dump(out,open('openbeta.json','w'),indent=1)
    def show(a,ind=0):
        print(' '*ind+a['area_name'],a['metadata'])
        for c in sorted(a['climbs'],key=lambda c:c['metadata']['leftRightIndex']):
            t=[k for k,v in c['type'].items() if v]
            print(' '*ind+'  ',c['metadata']['leftRightIndex'],c['name'],c['grades']['yds'],t,c['length'],c['boltsCount'],c['metadata']['mp_id'])
        for ch in a['children']: show(ch,ind+3)
    for a in out.values(): show(a)
