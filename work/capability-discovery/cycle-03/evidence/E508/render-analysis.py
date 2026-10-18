#!/usr/bin/env python3
"""Receipt-driven support report, no CV. Args: TRIAL_DIR ORIGINAL_PNG OUTPUT_DIR."""
from pathlib import Path
from PIL import Image
import json,hashlib,sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
trial=Path(sys.argv[1]);source=Path(sys.argv[2]);out=Path(sys.argv[3])
sha=lambda b:hashlib.sha256(b).hexdigest()
r=json.loads((trial/'receipt.json').read_text());d=json.loads((trial/'request-descriptor.json').read_text());bind=json.loads((trial/'run-binding.json').read_text())
assert sha((trial/'receipt.json').read_bytes())==bind['receiptSha256']
assert sha(source.read_bytes())==d['source']['pngSha256']
assert r['status']=='UNKNOWN' and r['operationsExecuted']==[] and len(r['support']['failures'])==2
rows=[]
for s in d['geometry']['stations']:
 for w in d['geometry']['localWidthBank']['valuesPx']:
  rows.append({'stationId':s['id'],'widthArgPx':w,'status':'NOT_EXECUTED_SUPPORT_UNKNOWN','rawProfilePresent':False,'rawObservationPresent':False,'rawEdgeFitPresent':False,'rawMidpointPresent':False,'reason':r['reason']})
analysis={'schema':'E508-all-requested-rows-analysis@1','receiptSha256':bind['receiptSha256'],'adapterStatus':r['status'],'adapterCalls':1,'compositionCalls':0,'operationsExecuted':r['operationsExecuted'],'allRequestedRows':rows,'learner':{'status':'UNKNOWN','rawRowsPresent':False,'reason':'No composition executed after whole-request support abstention.'},'profiles':{'status':'UNKNOWN','rawProfilesPresent':False,'visibleCountsPresent':False,'reason':'None of the3stations was measured; no profile, visible count, four-lane scores, fit or null-fit claim exists.'},'matchedOriginalCropControl':{'status':'UNKNOWN','rawSourceCompositionPresent':'sourceComposition' in r,'rawCropCompositionPresent':'composition' in r,'rawEquivalencePresent':'equivalence' in r,'rawDifferencesPresent':False,'reason':'Paired calls are conditional on preparation support. Zero calls means no numerical equivalence comparison, not matched outputs or an empty-difference verdict.'},'support':r['support'],'predeclaredObservations':{'primary':'UNTESTED: no scores or fit were produced.','lateral-plus16':'UNTESTED: same frozen heading/window/normal offset retained, but no translated midpoint contrast measured.','bright-patch':'UNTESTED: neither positive local photometry nor semantic rejection demonstrated.','training':'UNKNOWN: full-segment conservative support failure; no width row or selection produced.'},'falsifierOutcome':'Frozen whole-request sampling support absent. Trial abstains unchanged before producers; this is an operational support limitation, not a scientific negative on any region.','widthStatus':'UNKNOWN','semanticIdentity':'UNKNOWN','noTuning':True,'exposure':'Predeclared exploratory trial; D3 geometry was messaged to adapter owner before freeze. The retained exposure note remains applicable. No blind heldout claim.'}
(out/'analysis.json').write_text(json.dumps(analysis,indent=2)+'\n')
roi=d['roi'];x0,y0=roi['xPx'],roi['yPx'];w,h=roi['widthPx'],roi['heightPx'];im=Image.open(source).convert('RGBA')
ctx=(x0-10,y0-30,x0+w+10,y0+h+30);bg=im.crop(ctx)
fig=plt.figure(figsize=(13.5,8.5),dpi=150);gs=fig.add_gridspec(2,2,width_ratios=[1,1.55],height_ratios=[1.2,1])
ax=fig.add_subplot(gs[:,0]);ax.imshow(bg,extent=(ctx[0]-.5,ctx[2]-.5,ctx[3]-.5,ctx[1]-.5),interpolation='nearest')
ax.add_patch(Rectangle((x0-.5,y0-.5),w,h,fill=False,edgecolor='#00d3ff',linewidth=2,label='frozen ROI'))
failed={e['label'] for e in r['support']['failures']}
for e in r['support']['envelopes']:
 color='#ef304f' if e['label'] in failed else '#50b76e'
 ax.add_patch(Rectangle((x0+e['minX'],y0+e['minY']),e['maxX']-e['minX'],e['maxY']-e['minY'],fill=False,edgecolor=color,linewidth=1.6 if e['label'] in failed else .65,alpha=.95 if e['label'] in failed else .45))
 if e['label'] in failed:ax.text(x0+e['minX']+2,y0+e['minY']+8,e['label'],fontsize=8,color='white',bbox={'facecolor':'#94172d','alpha':.9,'pad':2})
ax.set_title('Exact receipt support envelopes\non original-source pixels',fontsize=12);ax.set_xlabel('original xPx');ax.set_ylabel('original yPx');ax.grid(alpha=.18);ax.legend(loc='lower right',fontsize=8)
b=fig.add_subplot(gs[0,1]);b.axis('off');b.text(0,1,'UNKNOWN: frozen training support absent',va='top',fontsize=15,fontweight='bold',color='#a51632')
lines=['Accepted adapter runSourcePixelRoi executed once unchanged.',f'Actual composition calls: {bind["compositionCalls"]}; actual CV operations: {len(r["operationsExecuted"])}.',f'Raw reason: {r["reason"]}.','',f'ROI: x={x0}, y={y0}, width={w}, height={h}px.','Receipt sensor radius: 34px. Strict crop interior: x>1, y>1, x<208, y<213.','Red boxes: full-training endpoint envelopes rejected by adapter.']
for e in r['support']['failures']:lines.append(f'{e["label"]}: crop x[{e["minX"]:g},{e["maxX"]:g}], y[{e["minY"]:g},{e["maxY"]:g}]')
lines+=['','All recorded station envelopes pass, but whole request abstains.','No enlarged crop, altered endpoint, bank change, or second trial.','Raw learner, profiles/counts, lane scores, fits and midpoints absent.','Full-original/crop equivalence UNKNOWN: neither control executed.']
b.text(0,.89,'\n'.join(lines),va='top',fontsize=9.5,linespacing=1.6)
c=fig.add_subplot(gs[1,1]);c.axis('off');table=c.table(cellText=[[x['stationId'],str(x['widthArgPx']),'NOT EXECUTED'] for x in rows],colLabels=['Frozen station','Width request (px)','All raw channels'],cellLoc='left',colLoc='left',loc='upper center',colWidths=[.43,.25,.32]);table.auto_set_font_size(False);table.set_fontsize(9);table.scale(1,1.4)
for (rr,cc),cell in table.get_celld().items():
 if rr==0:cell.set_facecolor('#dce9ed');cell.set_text_props(weight='bold')
 else:cell.set_facecolor('#f7f2f3' if rr%2 else '#ffffff')
c.text(0,.02,'Width and identity UNKNOWN. Exploratory predeclared testimony; prior geometry disclosure retained.\nNo scientific ordering or path/non-path conclusion follows from this support abstention.',fontsize=8.5,va='bottom')
fig.suptitle('E508 Lenard: fixed actual-source trial abstains before measurements',fontsize=16);fig.text(.5,.012,f'Exact receipt SHA256 {bind["receiptSha256"][:20]}...; boxes are recorded support envelopes. No scores recomputed.',ha='center',fontsize=8)
fig.tight_layout(rect=(0,.03,1,.95));fig.savefig(out/'Lenard-actual-receipt.png');plt.close(fig)
print(json.dumps({'analysisSha256':sha((out/'analysis.json').read_bytes()),'figureSha256':sha((out/'Lenard-actual-receipt.png').read_bytes()),'requestedRows':len(rows)},indent=2))
