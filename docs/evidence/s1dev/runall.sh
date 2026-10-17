cd /home/user/chainspot-toolkit
for s in golden alex lenard townelake heritage northpark lenard1 lenard2 lenard3 lenard4 lenard5; do
  cp=$(node toolkit.mjs neat --recipe recipes/chainspot-s0-s7.json --specimen $s --until 1 --from-git HEAD 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['checkpointId'][:12])")
  node toolkit.mjs run --recipe recipes/chainspot-s0-s7.json --specimen $s --until 1 --checkpoint $cp > /tmp/claude-0/-home-user/73d91f40-13de-5bef-9b81-7de266a5102a/scratchpad/s1dev/run-$s.json 2>&1
  python3 - "$s" <<'PY'
import json,sys
s=sys.argv[1]; d=json.load(open(f'/tmp/claude-0/-home-user/73d91f40-13de-5bef-9b81-7de266a5102a/scratchpad/s1dev/run-{s}.json'))
att=d.get('attemptId')
try:
    r=json.load(open(f'/home/user/chainspot-toolkit/attempts/stages/{att}/fork/stage-output/early/run.receipt.json'))
except FileNotFoundError:
    print(s, att, d.get('execution'), 'NO RECEIPT'); sys.exit()
s1=[x for x in r['stages'] if x['id']=='S1'][0]; bi=s1.get('badgeInvariants') or {}; f=bi.get('findings',{})
print(f"{s:10s} {att} {d.get('execution')} | robust base {'holds' if bi.get('robustBaseHolds') else 'BREAKS'} | {f.get('view')} | merged frames {f.get('mergedWithNeighbour')} | size explained by merge {f.get('sizeExplainedByMerge')} | missing {f.get('missing')} | plate max {f.get('plateOffsetMaxPx')} px | low conf {f.get('lowConfidence')}")
PY
done
