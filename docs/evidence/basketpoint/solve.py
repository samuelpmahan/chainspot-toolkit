import json, math, numpy as np
S=json.load(open('spokes.json'))
def solve(rows):
    A=[];b=[];w=[]
    for r in rows:
        t=math.radians(r['spokeDeg']); n=np.array([-math.sin(t),math.cos(t)])
        A.append(n); b.append(-r['tipLatPx']); w.append(1.0)
    A=np.array(A); b=np.array(b)
    d,*_=np.linalg.lstsq(A,b,rcond=None); res=A@d-b
    return d,res
allr=[]
for c,rows in S.items():
    ok=[r for r in rows if r['ok'] and abs(r['tipLatPx'])<5 and r['n']>=15]
    # iterate: drop >3*MAD
    for _ in range(3):
        d,res=solve(ok); mad=np.median(np.abs(res))*1.4826+1e-6; keep=np.abs(res)<max(3*mad,0.5)
        ok=[r for r,k in zip(ok,keep) if k]
    d,res=solve(ok); allr+= [dict(r,course=c) for r in ok]
    print(f'{c}: n {len(ok)}  BasketPoint = tip + ({d[0]:+.2f}, {d[1]:+.2f}) px   spoke residual |med| {np.median(np.abs(res)):.2f} px, max {np.abs(res).max():.2f}')
d,res=solve(allr); print(f'POOLED n {len(allr)}: tip + ({d[0]:+.2f}, {d[1]:+.2f}) px, residual |med| {np.median(np.abs(res)):.2f} px, rms {np.sqrt((res**2).mean()):.2f} px')
# bootstrap
rng=np.random.default_rng(0); B=[solve([allr[i] for i in rng.integers(0,len(allr),len(allr))])[0] for _ in range(500)]
B=np.array(B); print('bootstrap 95%% x %.2f..%.2f  y %.2f..%.2f px'%(*np.percentile(B[:,0],[2.5,97.5]),*np.percentile(B[:,1],[2.5,97.5])))
json.dump(dict(delta=d.tolist(),n=len(allr),rows=allr),open('basketpoint.json','w'),indent=1)
