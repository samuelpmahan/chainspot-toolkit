# Competing implementations: tee-seeded (judged-*.json, refined) vs badge-seeded (badge-*.json), joined on the visible pad.
import sys, json, numpy as np
name=sys.argv[1]
T=json.load(open(f'judged-{name}.json')); B=json.load(open(f'badge-{name}.json'))['holes']
rows=[]
for h in B:
    if 'fail' in h or not h.get('teeVisible'): continue
    pc=np.array(h['padCentre']); t=min(T,key=lambda t:np.hypot(*(np.array(t['pad'][:2])-pc)))
    if np.hypot(*(np.array(t['pad'][:2])-pc))>1: continue
    tv=np.array(t.get('vertsRefined') or t['verts']); bv=np.array(h['verts'])
    same_end=(t['end']==h['end']); nb_t=len(tv)-2 if t['end'] is not None else None; nb_b=h['bends']
    vd=None
    if same_end and t['end'] is not None and nb_t==nb_b and nb_t>0: vd=float(np.max(np.hypot(*(tv[1:-1]-bv[1:-1]).T)))
    rows.append((h['hole'],t['end'],h['end'],nb_t,nb_b,vd,t['status']))
    print(f"{name} hole {h['hole']:2d}: tee-seed end {t['end']} bends {nb_t} [{t['status'][:20]}] | badge-seed end {h['end']} bends {nb_b} | "+('AGREE' if same_end and nb_t==nb_b else 'DIFFER')+(f", bend vertices within {vd:.2f} px" if vd is not None else ''))
ag=sum(1 for r in rows if r[1]==r[2] and r[3]==r[4]); print(f'{name}: agree on end+bend count {ag}/{len(rows)} holes with a visible tee')
