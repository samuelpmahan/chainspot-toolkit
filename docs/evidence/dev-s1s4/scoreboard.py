# python3 scoreboard.py   S1-S4 per dev course: judged counts (ports/judge/judge.mjs --json), count closure against the
# badge cardinality N, and stage time from the run receipts. Attempts: ./ATTEMPTS (one fresh run from git HEAD per course,
# --until 4 --lanes s3-findfamily-structural-fix,s4.basketRecovery; then ports/s3assoc and ports/s4recover).
import json, os
HERE = os.path.dirname(os.path.abspath(__file__)); TK = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
ATT = dict(l.split() for l in open(f'{HERE}/ATTEMPTS') if l.strip())
BRANCH = 'greedyOccluded'   # the S4 tee recovery shown in the table; the others are in the judge JSON
rows = []
for c, a in ATT.items():
    out = f'{TK}/attempts/stages/{a}/fork/stage-output'; A = f'{out}/early/artifacts'
    J = json.load(open(f'{HERE}/{c}.judge.json')); S = J.get('stages', {})
    badges = json.load(open(f'{A}/s1/px.badges.json'))['badges']; N = len({b['label'] for b in badges})
    kj = json.load(open(f'{A}/s2/px.baskets.json'))['baskets']; tees = json.load(open(f'{A}/s3fix/px.tees.refined.json'))['tees']
    bridge = json.load(open(f'{out}/basket-bridge/basket-recovery.part.json'))['comparisons']['accepted']
    recB = [d for d in bridge if d['classification'] != 'existing-s2-exact']
    s4r = json.load(open(f'{HERE}/{c}.s4r.json'))
    recT = json.load(open(f"{s4r['out']}/artifacts/fn.Tee.recover/{BRANCH}/recovered.json"))['recovered']
    assoc = json.load(open(f'{out}/s3assoc/px.tees.association.json'))
    nAssoc = sum(1 for r in assoc['rows'] if r.get('best'))
    rec = json.load(open(f'{out}/early/run.receipt.json')); dur = {s.get('stage', i): s['durationMs'] for i, s in enumerate(rec['stages'])}
    rows.append(dict(course=c, attempt=a, N=N, testimony=J.get('testimony'), S=S,
        counts=dict(badges=len(badges), s2=len(kj), s4b=len(recB), s3=len(tees), s3assoc=nAssoc, s4t=len(recT)),
        ms=dict(S0=dur.get(0), S1=dur.get(1), S2=dur.get(2), S3=dur.get(3), S3assoc=round(assoc.get('seconds', 0) * 1000) if 'seconds' in assoc else None, S4tees=s4r['timingsMs'][BRANCH])))

def judged(s, k='FP'): return '-' if s is None else f"{s['TP']}/{s['FN']}/{s[k] if s.get(k) is not None else 'unj'}"
L = ['| course | testimony | S1 badges | S2 baskets TP/FN/FP | S3 tees TP/FN/FP | S3 assoc right/wrong/none | S4 baskets TP/FN/FP (+recovered) | S4 tees TP/FN/FP (+recovered, right hole) | count closure after S4 (baskets, tees of N) |',
     '|---|---|---|---|---|---|---|---|---|']
for r in rows:
    S, c, t = r['S'], r['counts'], r['testimony']
    tm = '-' if not t else ('all 18 holes' if t['complete'] else f"holes {', '.join(map(str, t['annotatedHoles']))}")
    a = S.get('S3association'); b4 = S.get('S4baskets'); t4 = (S.get('S4tees') or {}).get('branches', {}).get(BRANCH)
    L.append(f"| {r['course']} | {tm} | {c['badges']} (labels 1..{r['N']}) | {judged(S.get('S2'))} | {judged(S.get('S3'))} | "
             f"{f'{a['associatedCorrectly']}/{a['associatedIncorrectly']}/{a['notAssociated']}' if a else '-'} | {judged(b4)} (+{c['s4b']}) | "
             f"{judged(t4)} (+{c['s4t']}, {t4['recoveredForHoleCorrectly'] if t4 else '-'}) | {c['s2'] + c['s4b']}/{r['N']}, {c['s3'] + c['s4t']}/{r['N']} |")
L += ['', '| course | S0 ms | S1 ms | S2 ms | S3 ms | S4 tee recovery ms |', '|---|---|---|---|---|---|']
for r in rows: L.append(f"| {r['course']} | {r['ms']['S0']} | {r['ms']['S1']} | {r['ms']['S2']} | {r['ms']['S3']} | {r['ms']['S4tees']} |")
L += ['', 'Misses, named (testimony courses):']
for r in rows:
    S = r['S']
    for k, lab in (('S2', 'S2 baskets FN'), ('S3', 'S3 tees FN')):
        if S.get(k) and S[k]['fn']: L.append(f"- {r['course']} {lab}: {'; '.join(S[k]['fn'])}")
    b4 = S.get('S4baskets'); t4 = (S.get('S4tees') or {}).get('branches', {}).get(BRANCH)
    if b4 and b4['fn']: L.append(f"- {r['course']} after S4, baskets still FN: {', '.join(b4['fn'])}")
    if t4 and t4['fn']: L.append(f"- {r['course']} after S4, tees still FN: {', '.join(t4['fn'])}")
    if t4 and t4['recoveredFP']: L.append(f"- {r['course']} S4 recovered tee FP: {', '.join(t4['recoveredFP'])}")
open(f'{HERE}/scoreboard.md', 'w').write('\n'.join(L) + '\n'); print('\n'.join(L))
