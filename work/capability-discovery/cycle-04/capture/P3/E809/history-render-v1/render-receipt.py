"""Receipt-only presentation: no CV imports, sampling, fitting, source mutation or tuning."""
from pathlib import Path
import hashlib
import json
import math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from PIL import Image

base = Path(__file__).resolve().parent
r = json.loads((base / 'receipt.json').read_text())
d = json.loads((base / 'request-descriptor.json').read_text())
binding = json.loads((base / 'run-binding.json').read_text())
source_path = Path(binding['source']['path'])
assert hashlib.sha256(source_path.read_bytes()).hexdigest() == binding['source']['sha256']
roi = d['roi']
source = Image.open(source_path)
source.load()
crop = source.crop((roi['xPx'], roi['yPx'], roi['xPx'] + roi['widthPx'], roi['yPx'] + roi['heightPx']))
colors = {'proposed-ribbon': '#00b8ff', 'lateral-plus6': '#ff4f9a', 'bright-organic': '#e6aa00'}
fig = plt.figure(figsize=(20, 15), facecolor='white')
ax = fig.add_axes((.035, .56, .38, .38))
ax.imshow(crop, extent=(roi['xPx'], roi['xPx']+roi['widthPx'], roi['yPx']+roi['heightPx'], roi['yPx']))
for s in d['geometry']['stations']:
    group, window = s['id'].rsplit('.', 1)
    if window == 'long':
        continue
    u = (math.cos(s['headingRad']), math.sin(s['headingRad']))
    x, y = s['xPx'], s['yPx']
    ax.plot([x+s['t0Px']*u[0], x+s['t1Px']*u[0]], [y+s['t0Px']*u[1], y+s['t1Px']*u[1]], color=colors[group], lw=2)
    ax.plot(x, y, '.', color=colors[group], ms=5)
    dx = -85 if group == 'proposed-ribbon' else 22
    ax.annotate(window.replace('short',''), (x,y), (x+dx,y), color=colors[group], fontsize=9, arrowprops={'arrowstyle':'-', 'color':colors[group], 'lw':.5})
ax.set_title('Exact original source-pixel ROI; numbered short-window poses', fontsize=12)
ax.set_xlabel('Original source x (px)'); ax.set_ylabel('Original source y (px)')
text = fig.add_axes((.45, .57, .52, .36)); text.axis('off')
lines = ['E809 | exact P2 frozen zoom1 protocol', 'One adapter invocation; mandatory CROP + SOURCE branches',
         f"Recipe calls: {r.get('execution',{}).get('compositionCalls',0)} | operations: {len(r.get('operationsExecuted',[]))}",
         f"Equivalence: {r.get('equivalence',{}).get('status','UNKNOWN')}",
         f"Differences retained: {len(r.get('equivalence',{}).get('differences',[]))} | fixed tolerance 1e-9", '',
         'Blue: proposed ribbon   Pink: +6 normal offset   Gold: bright organic',
         'Five 16-sample moving-pose windows + one matching 80-sample long.',
         'JS profiles are longitudinal averages; finite pairs do not prove',
         'pointwise continuity. Dev72 ignores window bounds; long duplicates short3.', '',
         'All 34 / 42 / 50px candidates retained, not selected successes.',
         '42px is a preregistered comparison anchor, NOT calibrated width.',
         'No threshold, classifier, recentering, widening, semantic acceptance.',
         'Semantic identity UNKNOWN | calibrated width UNKNOWN | promoted=false', '',
         'Tables: each cell gives fit width / midpoint / score; NULL is retained.',
         'Both branches shown separately. Complete raw fits, lanes, profiles,',
         'visible counts and source/crop differences remain in receipt.json.']
text.text(0, 1, '\n'.join(lines), va='top', fontsize=12, linespacing=1.55, family='monospace')

def finite_pair(c):
    f = c.get('edgeFit') if c else None
    return bool(f and all(isinstance(f.get(k),(int,float)) and math.isfinite(f[k]) for k in ['lPx','rPx','cPx','wPx','score','gl','gr']) and f['wPx']>0 and f['gl']>0 and f['gr']>0)

summary = {}
for i, (branch, key) in enumerate([('CROP', 'composition'), ('SOURCE original frame', 'sourceComposition')]):
    comp = r.get(key, {})
    stations = {s['id']:s for s in comp.get('stations',[])}
    table_rows = []; finite_count = 0; null_count = 0; missing_count = 0
    for declared in d['geometry']['stations']:
        s = stations.get(declared['id'])
        row = [declared['id'].replace('proposed-ribbon','ribbon').replace('bright-organic','bright').replace('lateral-plus6','offset+6')]
        counts = s.get('profile',{}).get('visibleStationCounts') if s else None
        row.append(f"{s['profile']['stationCount']} / {min(counts)}..{max(counts)}" if counts else 'NOT EXEC')
        for width in d['geometry']['localWidthBank']['valuesPx']:
            c = next((c for c in s['candidates'] if c['widthArgPx']==width),None) if s else None
            if not c:
                cell='NOT EXEC/MISSING'; missing_count += 1
            elif c.get('edgeFit') is None:
                cell='NULL'; null_count += 1
            else:
                f=c['edgeFit']; finite_count += int(finite_pair(c))
                cell=f"{f['wPx']:.3f} / {f['cPx']:+.3f}\ns={f['score']:.3f}"
            row.append(cell)
        table_rows.append(row)
    summary[branch]={'rows':len(table_rows)*3,'finitePositivePairs':finite_count,'nullFits':null_count,'notExecutedOrMissing':missing_count}
    tax = fig.add_axes((.025+i*.49, .065, .475, .45)); tax.axis('off')
    tax.set_title(f"{branch}: {finite_count} finite / {null_count} null / {missing_count} missing or unexecuted", fontsize=12, pad=12)
    table=tax.table(cellText=table_rows,colLabels=['Ordered station','nT / visible range','34px: w / c / score','42px: w / c / score','50px: w / c / score'],cellLoc='center',loc='center',colWidths=[.25,.15,.20,.20,.20])
    table.auto_set_font_size(False);table.set_fontsize(8);table.scale(1,2.5)
    for (row,col),cell in table.get_celld().items():
        cell.set_linewidth(.4)
        if row==0:cell.set_facecolor('#e7edf4')
        elif '.long' in table_rows[row-1][0]:cell.set_facecolor('#edf3f8')
fig.suptitle('Lenard zoom1 | actual fixed source/crop observations, every ordered fit and null', fontsize=18, y=.985)
fig.text(.025,.015,'Exploratory exposed screenshot; fresh frozen geometry. Same source/training and overlapping windows are not independent cases. Figure is receipt-derived, not another fitter run.',fontsize=11)
out=base/'E809-actual-receipt.png'
if out.exists(): raise RuntimeError('Refuse overwrite; no silent rerender')
fig.savefig(out,dpi=120)
plt.close(fig)
(base/'renderer-summary.json').write_text(json.dumps({'job_id':'E809','source':str(source_path),'sourcePngSha256':binding['source']['sha256'],'receiptSha256':hashlib.sha256((base/'receipt.json').read_bytes()).hexdigest(),'branches':summary,'rendererCvCalls':0,'figure':str(out),'figureSha256':hashlib.sha256(out.read_bytes()).hexdigest()},indent=2)+'\n')
print(json.dumps(summary))
