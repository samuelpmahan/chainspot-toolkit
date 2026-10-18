from pathlib import Path
import json,hashlib,math
from PIL import Image
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
p=Path(__file__).parent;protocol=json.loads((p.parent/'protocol.json').read_text());sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
def numerical_diffs(a,b,path=''):
 out=[]
 if isinstance(a,(float,int)) and not isinstance(a,bool) and isinstance(b,(float,int)) and not isinstance(b,bool):
  if a!=b:out.append({'path':path,'absoluteDifference':abs(a-b),'source':a,'crop':b})
 elif isinstance(a,dict) and isinstance(b,dict):
  for k in a:out+=numerical_diffs(a[k],b[k],path+'.'+str(k))
 elif isinstance(a,list) and isinstance(b,list):
  for i,(x,y) in enumerate(zip(a,b)):out+=numerical_diffs(x,y,path+'.'+str(i))
 return out
analysis={'schema':'E509-actual-receipt-analysis@1','declarationSha256':sha(p.parent/'protocol.json'),'scoresSource':'Direct unchanged original-source receipt rows; no recomputed image scores, detector or fitting call. Differences are arithmetic over already emitted raw fields.','courses':[]}
colors=['#18792c','#c5293a','#c58200'];short=['ribbon','+12 normal','bright non-path']
for decl in protocol['cases']:
 name=decl['imageId'];r=json.loads((p/(name+'.receipt.json')).read_text());meta=json.loads((p/(name+'.run-sidecar.json')).read_text());src=r['sourceComposition'];crop=r['composition'];rows=[];table=[]
 for i,s in enumerate(src['stations']):
  for c in s['candidates']:
   o=c['observation'];f=c['edgeFit'];mid=c['midpoint'];row={'stationId':s['id'],'role':decl['stations'][i]['role'],'bankWidthPx':c['widthArgPx'],'observation':o,'pairedRails':c['pairedRails'],'edgeFit':f,'midpoint':mid,'profileStationCount':s['profile']['stationCount'],'visibleCountRange':[min(s['profile']['visibleStationCounts']),max(s['profile']['visibleStationCounts'])]};rows.append(row)
   fmt=lambda x:'UNKNOWN' if x is None else f'{x:.3f}'
   table.append([short[i],str(c['widthArgPx'])]+[fmt(o[k]) for k in ['leftRail','innerLeft','innerRight','rightRail','railScore','innerScore','score']]+[fmt(None if f is None else f['wPx']),fmt(None if mid['status']=='UNKNOWN' else mid['candidateCenterMinusFitMidpointPx'])])
 shifts=[]
 for a,b in zip(src['stations'][0]['candidates'],src['stations'][1]['candidates']):
  am,bm=a['midpoint'],b['midpoint'];valid=am['status']=='OBSERVED_CHANNELS' and bm['status']=='OBSERVED_CHANNELS';delta=bm['candidateCenterMinusFitMidpointPx']-am['candidateCenterMinusFitMidpointPx'] if valid else None
  shifts.append({'bankWidthPx':a['widthArgPx'],'expectedSameEdgesDeltaPx':12,'observedMidpointDifferencePx':delta,'residualFromExpectedPx':None if delta is None else delta-12,'fitWidthChangePx':None if not valid else b['edgeFit']['wPx']-a['edgeFit']['wPx'],'interpretation':'No paired baseline/control midpoint; hypothesis unavailable.' if not valid else 'Raw difference retained; no tolerance/acceptance threshold applied. Different selected edges or boundary influence may break same-edge premise.'})
 diffs=numerical_diffs(src['rawWidthEstimate'],crop['rawWidthEstimate'],'rawWidthEstimate')
 for i,(a,b) in enumerate(zip(src['stations'],crop['stations'])):
  diffs+=numerical_diffs(a['profile'],b['profile'],f'stations.{i}.profile');diffs+=numerical_diffs(a['candidates'],b['candidates'],f'stations.{i}.candidates')
 diffs.sort(key=lambda e:e['absoluteDifference'],reverse=True)
 record={'imageId':name,'receiptSha256':sha(p/(name+'.receipt.json')),'requestDescriptorSha256':sha(p/(name+'.request-descriptor.json')),'sourcePngSha256':r['provenance']['sourcePngSha256'],'fullRgbaSha256':r['provenance']['fullRgbaSha256'],'cropRgbaSha256':r['provenance']['cropRgbaSha256'],'support':r['support'],'execution':r['execution'],'rawLearner':src['rawWidthEstimate'],'localWidth':r['localWidth'],'semanticIdentity':r['semanticIdentity'],'rows':rows,'matchedOffsetComparisons':shifts,'sourceCropEquivalence':r['equivalence'],'subToleranceDifferenceAudit':{'allNumericalUnequalCount':len(diffs),'maxAbsoluteDifference':diffs[0]['absoluteDifference'] if diffs else 0,'tenLargest':diffs[:10],'meaning':'Raw floating roundoff may exist below fixed1e-9 tolerance; exact same semantic/fit identity is not inferred.'},'resourceSidecar':name+'.run-sidecar.json','adapterElapsedMs':meta['elapsedMs'],'processMaxRSSKiB':meta['processResourceUsage']['maxRSS']}
 if name=='NorthPark-full':record['findings']=['All learner rows mean0/visible5 tie; raw32 is diagnostic default/tie selection, not measured width.','Proposed ribbon and +12 control combined scores0 at all3 bank widths. Ribbon pairs absent at32; finite fitted pairs at40/48.','Bright non-path has finite pairs at all3 widths, positive interior channels and nonzero combined at32/40: concrete local photometry ambiguity for caller visual non-path hypothesis.','Same-edge +12 observation holds numerically at40 (delta about12), unavailable at32 and fails at48 (delta about2.637); no row chosen to replace failed controls.','Nearby road and dashed-ring/terrain are visible confounds; fitted geometry cannot be assigned to rendered ribbon.']
 else:record['findings']=['Learner raw45 mean.221926 exceeds37(.091259)/29(.070519), despite strongest proposed-ribbon fixed sensor at37(.765926); no width calibration follows.','Ribbon finite pairs all3 widths; offset combined scores0 all3 while paired profiles remain finite.','Bright non-path combined0 and no finite pair at any bank width; midpoint remains UNKNOWN, never zero.','Same-edge expected +12 delta is not exact for any row: about6.578/11.774/5.060 at29/37/45. Cropping/finite profile reach, terrain and peak selection can alter selected edges; no followup tuning.','At offset profile some left fits near -28.386px profile edge are retained without a boundary-safety claim.']
 analysis['courses'].append(record)
 # Source/crop pixels already fixed: this render reads only source crop and raw receipt values.
 image=Image.open(p.parent/(name+'.source-crop.png')).convert('RGBA');assert hashlib.sha256(image.tobytes()).hexdigest()==r['provenance']['cropRgbaSha256']
 fig=plt.figure(figsize=(18,12));gs=fig.add_gridspec(3,3,height_ratios=[3.2,2.4,2.8],hspace=.48,wspace=.25);fig.suptitle(f'E509 {name}: exact receipt diagnostics; source/crop {r["equivalence"]["status"]}',fontsize=17,y=.985)
 ax=fig.add_subplot(gs[0,:2]);roi=r['provenance']['roi'];bx,by,w,h=roi['xPx'],roi['yPx'],roi['widthPx'],roi['heightPx'];ax.imshow(image,extent=[bx-.5,bx+w-.5,by+h-.5,by-.5],interpolation='nearest',aspect='equal');ax.set_title('Source crop + frozen caller poses: R=ribbon, O=offset, N=bright; display only',fontsize=10);ax.set_xlabel('original source xPx');ax.set_ylabel('original source yPx')
 for s,color,label in zip(decl['stations'],colors,['R','O','N']):
  u=np.array([math.cos(s['headingRad']),math.sin(s['headingRad'])]);n=np.array([-u[1],u[0]]);c=np.array([s['xPx'],s['yPx']]);a=c+s['t0Px']*u;b=c+s['t1Px']*u;ax.plot([a[0],b[0]],[a[1],b[1]],color=color,lw=2);a=c-30*n;b=c+30*n;ax.plot([a[0],b[0]],[a[1],b[1]],color=color,lw=.8);ax.text(c[0]+3,c[1]+3,label,color=color,fontsize=11,weight='bold',bbox=dict(fc='white',alpha=.8,pad=1))
 textax=fig.add_subplot(gs[0,2]);textax.axis('off');learner='\n'.join(f'{x["widthPx"]:g}px: mean {x["meanScore"]:.6f}; visible {x["visibleSamples"]}' for x in src['rawWidthEstimate']['scores']);shifttext='\n'.join(f'{x["bankWidthPx"]:g}px: '+('UNKNOWN' if x['observedMidpointDifferencePx'] is None else f'{x["observedMidpointDifferencePx"]:.6f}px') for x in shifts)
 textax.text(0,1,'Raw learner rows (diagnostic)\n'+learner+f'\nraw selection: {src["rawWidthEstimate"]["widthPx"]}px\ncalibrated width: UNKNOWN\n\nOffset − ribbon midpoint difference\nexpected +12px only for same edges\n'+shifttext+f'\n\nTwo composition calls: crop, original\nAll profile counts: 36/36\nRaw differences >1e-9: {len(r["equivalence"]["differences"])}\nAll identities: UNKNOWN',ha='left',va='top',fontsize=10.5,linespacing=1.35)
 for i,(s,cs) in enumerate(zip(src['stations'],crop['stations'])):
  ax=fig.add_subplot(gs[1,i]);x=s['profile']['offsetsPx'];ax.plot(x,s['profile']['meanLum'],color=colors[i],label='original source',lw=1.5);ax.plot(x,cs['profile']['meanLum'],color='black',label='ROI',lw=.7,ls='--');ax.set_title(short[i]+': raw longitudinal mean profile',fontsize=11);ax.set_xlabel('normal offset from frozen pose (source px)');ax.set_ylabel('RGB mean (0–255)');ax.set_xlim(-30,30);ax.grid(alpha=.25);ax.legend(fontsize=8,loc='best')
 tax=fig.add_subplot(gs[2,:]);tax.axis('off');col=['station','bank px','left rail','inner L','inner R','right rail','rail','interior','combined','fit width px','center−mid px'];t=tax.table(cellText=table,colLabels=col,cellLoc='center',bbox=[0,0,1,.88],colWidths=[.13,.07,.085,.085,.085,.085,.075,.085,.09,.095,.115]);t.auto_set_font_size(False);t.set_fontsize(9.5)
 for (row,colid),cell in t.get_celld().items():
  if row==0:cell.set_facecolor('#e4e9ee');cell.set_text_props(weight='bold')
  elif ((row-1)//3)%2==0:cell.set_facecolor('#f2f5f7')
 tax.set_title('All 3 stations × 3 frozen widths: original-source raw outputs; paired profile ≠ fixed sensor score\nChannel scores dimensionless; fitted geometry is uncalibrated source pixels. UNKNOWN means absent fit.',fontsize=11,pad=12,y=1.03)
 caveat='NorthPark testimony absent; all geometry is caller visual testimony.' if name=='NorthPark-full' else 'TowneLake historical annotation → original-source mapping UNKNOWN; geometry is caller visual testimony.'
 fig.text(.5,.02,caveat+' No accepted ribbon/non-path identity or physical width. No tuning or AA muting.',ha='center',fontsize=10)
 fig.savefig(p/(name+'.actual-scientific.png'),dpi=150,bbox_inches='tight',facecolor='white');plt.close(fig)
(p/'analysis.json').write_text(json.dumps(analysis,indent=2)+'\n');print('analysis + two figures created from exact receipts')
for c in analysis['courses']:print(c['imageId'],'max numeric difference',c['subToleranceDifferenceAudit']['maxAbsoluteDifference'],'offset deltas',[x['observedMidpointDifferencePx'] for x in c['matchedOffsetComparisons']])
