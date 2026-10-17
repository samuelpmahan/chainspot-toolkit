# python3 hallway.py   (writes hallway-raw.json)
# Hallway width per image from its TEE -> BADGE segments (docs/evidence/s7main/teebadge.py, unchanged method): full
# courses read baselines/s3assoc/<course>.json; northpark and the zoomed Lenard views read ./assoc/<image>.json (the same
# S3 association, frozen from the S3 structural-fix attempts named in s7main/course.py).
import os, sys, json, subprocess
HERE=os.path.dirname(os.path.abspath(__file__)); S7=os.path.join(HERE,'..','s7main')
FULL=['golden','alex','lenard','townelake','heritage']; OTHER=['northpark','lenard1','lenard2','lenard3','lenard4','lenard5']
def run(names, env):
    code=f"import teebadge, json\nprint(json.dumps({{n: teebadge.learn(n)[2] for n in {names!r}}}))"
    out=subprocess.run([sys.executable,'-c',code],cwd=S7,env={**os.environ,**env},capture_output=True,text=True,check=True).stdout
    return json.loads(out.strip().splitlines()[-1])
res={**run(FULL,{}),**run(OTHER,{'BASELINE_DIR':os.path.join(HERE,'assoc')})}
for n,m in res.items(): print(f"{n}: width {m['widthPx']:.2f} px from {m['segments']}/{m['of']} tee->badge segments (IQR {m['widthIQR']} px)")
json.dump(res,open(os.path.join(HERE,'hallway-raw.json'),'w'),indent=1)
