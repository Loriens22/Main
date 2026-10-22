import sys,json
d=json.load(open(sys.argv[1]+'/metrics.json'))
for k,v in d.items():
    if k=='shots':
        print('SHOTS')
        for n,m in v.items(): print(f'  {n:18s} rms {m["rms"]:6} peak {m["peak"]:6} phone {m["phone"]:6} >120Hz {m["above120"]:3}% bands {m["bands"]}')
        continue
    for w,m in v.items():
        if isinstance(m,dict) and 'rms' in m: print(f'{k:12s}{w:13s} rms {m["rms"]:6} peak {m["peak"]:6} phone {m["phone"]:6} >120Hz {m["above120"]:3}% bands {m["bands"]}')
