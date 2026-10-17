# Per course: association pipeline (p3) vs Sam, and vs the badge-only seed, by hole number.
import json, numpy as np
rows=[]
for c in ('alex','golden','lenard','townelake','heritage'):
    P={h['hole']:h for h in json.load(open(f'p3-{c}.json'))['holes']}; B={h['hole']:h for h in json.load(open(f'badge-{c}.json'))['holes']}
    ok=[h for h in P.values() if h.get('status')=='ok']
    be=[h['truthBasketErrPx'] for h in P.values() if h.get('truthBasketErrPx') is not None]
    wrongB=[h['hole'] for h in P.values() if h.get('truthBasketErrPx') is not None and h['truthBasketErrPx']>6]
    bends=[e for h in P.values() for e in (h.get('truthBendErrPx') or []) if e is not None]
    missB=[h['hole'] for h in P.values() if h.get('truthBends') and any(e is None for e in h['truthBendErrPx'])]
    agree=[n for n in P if 'fail' not in P[n] and 'fail' not in B.get(n,{'fail':1}) and P[n].get('end')==B[n].get('end') and P[n].get('bends')==B[n].get('bends')]
    meth={}
    for h in P.values(): meth[h.get('method','?').split(' (')[0]]=meth.get(h.get('method','?').split(' (')[0],0)+1
    print(f"{c}: unique BasketPoint {len(ok)}/18; Sam basket within 6 px on {sum(1 for e in be if e<=6)}/{len(be)} (wrong basket: holes {wrongB}); "
          f"Sam bends matched {len(bends)} (err median {np.median(bends) if bends else float('nan'):.2f} px, max {max(bends) if bends else float('nan'):.2f}), unmatched bends on holes {missB}; "
          f"agrees with badge-only seed (end+bends) on {len(agree)}/18; methods {meth}")
    for n in sorted(P):
        h=P[n]
        if h.get('status')!='ok' or (h.get('truthBasketErrPx') or 0)>6: print(f"   {c} hole {n}: {h.get('status')[:60]} | {h.get('method','')[:50]} | Sam basket err {h.get('truthBasketErrPx')} px, bends err {h.get('truthBendErrPx')}")
