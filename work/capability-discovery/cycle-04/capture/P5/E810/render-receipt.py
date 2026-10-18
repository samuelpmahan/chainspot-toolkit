"""E810 receipt-only figures. No CV imports, image measurement, fitting or tuning."""
from pathlib import Path
import hashlib
import json
import math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from PIL import Image

base=Path(__file__).resolve().parent
receipt_bytes=(base/'receipt.json').read_bytes()
r=json.loads(receipt_bytes)
d=json.loads((base/'request-descriptor.json').read_text())
b=json.loads((base/'run-binding.json').read_text())
assert hashlib.sha256(receipt_bytes).hexdigest()==json.loads((base/'analysis.json').read_text())['receipt']['sha256']
source_path=Path(b['source']['path'])
assert hashlib.sha256(source_path.read_bytes()).hexdigest()==b['source']['sha256']
source=Image.open(source_path)
source.load()
roi=d['roi']
crop=source.crop((roi['xPx'],roi['yPx'],roi['xPx']+roi['widthPx'],roi['yPx']+roi['heightPx']))
widths=d['geometry']['localWidthBank']['valuesPx']
colors={'primary':'#008fc7','lateral-plus6':'#dc2878','bright-organic':'#af8100'}

def finite_pair(c):
    f=c.get('edgeFit') if c else None
    return bool(f and all(isinstance(f.get(k),(int,float)) and math.isfinite(f[k]) for k in ['lPx','rPx','cPx','wPx','score','gl','gr']) and f['wPx']>0 and f['gl']>0 and f['gr']>0)

fig=plt.figure(figsize=(20,19),facecolor='white')
ax=fig.add_axes((.035,.515,.34,.43))
ax.imshow(crop,extent=(roi['xPx'],roi['xPx']+roi['widthPx'],roi['yPx']+roi['heightPx'],roi['yPx']))
for s in d['geometry']['stations']:
    group,window=s['id'].rsplit('.',1)
    if window=='long':continue
    u=(math.cos(s['headingRad']),math.sin(s['headingRad']))
    x,y=s['xPx'],s['yPx']
    ax.plot([x+s['t0Px']*u[0],x+s['t1Px']*u[0]],[y+s['t0Px']*u[1],y+s['t1Px']*u[1]],color=colors[group],lw=2)
    ax.plot(x,y,'.',color=colors[group],ms=4)
    if group!='lateral-plus6':
        dx=-65 if group=='primary' else 28
        ax.annotate(window.replace('short',''),(x,y),(x+dx,y),color=colors[group],fontsize=9,arrowprops={'arrowstyle':'-','color':colors[group],'lw':.5})
ax.set_title('Exact original source-pixel ROI; ordered short poses',fontsize=12)
ax.set_xlabel('Original source x (px)');ax.set_ylabel('Original source y (px)')
tx=fig.add_axes((.43,.54,.54,.37));tx.axis('off')
lines=['E810 | exact frozen P3 zoom2 protocol','One adapter invocation; separate CROP + SOURCE branches',
 f"Recipe calls: {r.get('execution',{}).get('compositionCalls',0)} | operations: {len(r.get('operationsExecuted',[]))}",
 f"Top status: {r.get('status','UNKNOWN')} | equivalence: {r.get('equivalence',{}).get('status','UNKNOWN')}",
 f"Differences retained: {len(r.get('equivalence',{}).get('differences',[]))} | unchanged tolerance 1e-9",'',
 'Blue: primary | Pink: +6 normal | Gold: bright terrain',
 'Five consecutive 16-sample moving-pose windows; one 80-sample long.',
 'All 40 / 48 / 56px rows shown. No winning width selected.',
 'Cells: fitted width / midpoint / score. NULL and missing retained.',
 'nT and raw visible-count ranges shown beside every station.','',
 'Finite pairs are averaged-window observations, not per-point continuity.',
 'Dev72 ignores window bounds; long duplicates short3 point-sensor pose.',
 'Missing/zero-call rows abstain; executed UNKNOWN can retain raw data.',
 'Floating reanchoring can change strict fitter peak choice.',
 'No tuning, recentering, widening, classifier, AA or semantic acceptance.',
 'Semantic identity UNKNOWN | calibrated width UNKNOWN | promoted=false','',
 'Original pixels only; map geometry from frozen caller testimony.',
 'Full profiles, lanes, counts, nulls and raw differences in receipt.json.',
 'Companion profile figure plots raw receipt arrays; no CV recomputation.']
tx.text(0,1,'\n'.join(lines),va='top',fontsize=11.2,linespacing=1.48,family='monospace')
summary={}
for i,(branch,key) in enumerate([('CROP','composition'),('SOURCE original frame','sourceComposition')]):
    comp=r.get(key,{})
    actual={s['id']:s for s in comp.get('stations',[])}
    table_rows=[];finite=null=missing=0
    for declared in d['geometry']['stations']:
        s=actual.get(declared['id']);counts=s.get('profile',{}).get('visibleStationCounts') if s else None
        row=[declared['id'].replace('lateral-plus6','offset+6').replace('bright-organic','bright')]
        row.append(f"{s['profile']['stationCount']} / {min(counts)}..{max(counts)}" if counts else 'NOT EXEC')
        for w in widths:
            c=next((c for c in s['candidates'] if c['widthArgPx']==w),None) if s else None
            if c is None:cell='NOT EXEC/MISSING';missing+=1
            elif c.get('edgeFit') is None:cell='NULL';null+=1
            elif not finite_pair(c):cell='NONFINITE/NONPOS';
            else:
                f=c['edgeFit'];finite+=1;cell=f"{f['wPx']:.3f} / {f['cPx']:+.3f}\ns={f['score']:.3f}"
            row.append(cell)
        table_rows.append(row)
    summary[branch]={'candidateRows':len(table_rows)*len(widths),'finitePositivePairs':finite,'nullFits':null,'missingOrUnexecuted':missing}
    tab=fig.add_axes((.025+i*.49,.065,.475,.395));tab.axis('off')
    tab.set_title(f'{branch}: {finite} finite / {null} null / {missing} missing or unexecuted',fontsize=11,pad=12)
    table=tab.table(cellText=table_rows,colLabels=['Ordered station','nT / visible',*[f'{w}px: w / c / score' for w in widths]],cellLoc='center',loc='center',colWidths=[.24,.16,.20,.20,.20])
    table.auto_set_font_size(False);table.set_fontsize(8);table.scale(1,2.4)
    for (row,col),cell in table.get_celld().items():
        cell.set_linewidth(.4)
        if row==0:cell.set_facecolor('#e7edf4')
        elif '.long' in table_rows[row-1][0]:cell.set_facecolor('#edf3f8')
fig.suptitle('Lenard zoom2 | actual fixed source/crop observations, every ordered fit and null',fontsize=18,y=.985)
fig.text(.025,.02,'Exploratory exposed screenshot; frozen visual testimony. Shared source/training and overlapping windows are not independent scientific cases. Receipt-derived figure, no fitter replay.',fontsize=10.5)
out=base/'E810-actual-receipt.png'
if out.exists():raise RuntimeError('Refuse figure overwrite')
fig.savefig(out,dpi=120);plt.close(fig)

profiles,axes=plt.subplots(3,2,figsize=(18,13),facecolor='white')
for row,group in enumerate(colors):
    for col,(branch,key) in enumerate([('CROP','composition'),('SOURCE','sourceComposition')]):
        panel=axes[row,col];actual={s['id']:s for s in r.get(key,{}).get('stations',[])}
        for j,window in enumerate(['short1','short2','short3','short4','short5','long']):
            s=actual.get(f'{group}.{window}')
            if not s:continue
            p=s['profile'];ys=[v if isinstance(v,(int,float)) and math.isfinite(v) else float('nan') for v in p['meanLum']]
            panel.plot(p['offsetsPx'],ys,label=f"{window} nT={p['stationCount']}",lw=2.2 if window=='long' else 1,ls='--' if window=='long' else '-')
        panel.set_title(f'{branch} | {group}');panel.set_xlabel('Normal offset (px)');panel.set_ylabel('Raw RGB-mean level');panel.grid(alpha=.25);panel.legend(fontsize=8,ncol=2)
profiles.suptitle('E810 | raw longitudinally averaged receipt profiles; no recomputed samples or fits',fontsize=16)
profiles.tight_layout(rect=(0,.025,1,.965))
profile_out=base/'E810-raw-profiles.png'
if profile_out.exists():raise RuntimeError('Refuse profile figure overwrite')
profiles.savefig(profile_out,dpi=120);plt.close(profiles)
record={'job_id':'E810','worker':'P5','sourcePngSha256':b['source']['sha256'],'receiptSha256':hashlib.sha256(receipt_bytes).hexdigest(),'branches':summary,'rendererCvCalls':0,'figures':[{'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [out,profile_out]]}
with (base/'renderer-summary.json').open('x') as handle:json.dump(record,handle,indent=2);handle.write('\n')
print(json.dumps(record))
