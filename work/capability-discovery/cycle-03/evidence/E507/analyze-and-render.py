from pathlib import Path
import json,hashlib,csv,sys,math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image
D=Path(sys.argv[1]);sourcePng=Path(sys.argv[2]);protocol=Path(sys.argv[3]);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
r=json.loads((D/'receipt.json').read_text());p=json.loads(protocol.read_text());assert sha(sourcePng)==r['provenance']['sourcePngSha256'];roi=r['provenance']['roi'];im=Image.open(sourcePng).convert('RGBA');crop=im.crop((roi['xPx'],roi['yPx'],roi['xPx']+roi['widthPx'],roi['yPx']+roi['heightPx']));assert hashlib.sha256(crop.tobytes()).hexdigest()==r['provenance']['cropRgbaSha256']
raw=im.tobytes();rows=b''.join(raw[((roi['yPx']+y)*im.width+roi['xPx'])*4:((roi['yPx']+y)*im.width+roi['xPx']+roi['widthPx'])*4]for y in range(roi['heightPx']));assert rows==crop.tobytes()
summary=[];table=[]
for c,s in zip(r.get('composition',{}).get('stations',[]),r.get('sourceComposition',{}).get('stations',[])):
    assert c['id']==s['id']; cp,sp=c['profile'],s['profile'];diff=[abs(a-b)for a,b in zip(cp['meanLum'],sp['meanLum'])]
    sr={'id':c['id'],'profileStationCount':cp['stationCount'],'normalOffsetCount':len(cp['offsetsPx']),'minVisibleCount':min(cp['visibleStationCounts']),'maxVisibleCount':max(cp['visibleStationCounts']),'profileMaximumAbsoluteDifference':max(diff),'profileNumericallyDifferentSamples':sum(a!=b for a,b in zip(cp['meanLum'],sp['meanLum'])),'visibleCountsExactlyEqual':cp['visibleStationCounts']==sp['visibleStationCounts'],'candidates':[]}
    for cc,sc in zip(c['candidates'],s['candidates']):
      row={'stationId':c['id'],'widthArgPx':cc['widthArgPx'],'leftRail':cc['observation']['leftRail'],'innerLeft':cc['observation']['innerLeft'],'innerRight':cc['observation']['innerRight'],'rightRail':cc['observation']['rightRail'],'railScore':cc['observation']['railScore'],'innerScore':cc['observation']['innerScore'],'combinedScore':cc['observation']['score'],'edgeFit':cc['edgeFit'],'midpointStatus':cc['midpoint']['status'],'sourceObservationExactlyEqual':cc['observation']==sc['observation'],'sourceEdgeFitExactlyEqual':cc['edgeFit']==sc['edgeFit'],'sourceMidpointExactlyEqual':cc['midpoint']==sc['midpoint']};table.append(row);sr['candidates'].append(row)
    summary.append(sr)
a={'schema':'E507-same-receipt-analysis@1','receiptSha256':sha(D/'receipt.json'),'sourcePixelCropEqualityVerified':True,'equivalence':r.get('equivalence'),'stations':summary,'rawWidthEstimateCrop':r.get('composition',{}).get('rawWidthEstimate'),'rawWidthEstimateSource':r.get('sourceComposition',{}).get('rawWidthEstimate'),'hypothesisAssessment':{'pairedRibbonExpectation':'FALSIFIED: no finite positive two-edge fit for proposed ribbon at any declared24/30/36 candidate; all9 station-bank fits null in crop and source.','matchedContrastExpectation':'PARTIAL OBSERVATION: ribbon combined at30=.6888888888888889 and36=.3407407407407406 exceeds both controls0; candidate24 ribbon combined0 ties both controls0. This is uncalibrated fixed-pose sensor contrast only.','controlSpecificityFalsifier':'Not triggered by combined channels here: controls combined0 at all3 widths and all fits null. Individual one-sided rail lifts remain nonzero in some controls and are retained.','widthIdentityAcceptance':'UNKNOWN; raw learner diagnostic selects30 with visibleSamples5 per candidate; no confidence policy/calibration and no semantic/route acceptance.','equivalenceClaim':'MATCHED_DECLARED_CONTROL within unchanged1e-9 for this trial only; exact raw profile roundoff differences retained. No universal invariance.'},'execution':r.get('execution'),'exposure':'Exploratory predeclared image/control selection. Geometry messages reached adapter author before freeze; author reports no course inputs inspected/tuning. Not blind heldout accuracy.','limitations':['No retuning, recentering, altered crop/window/settings or second actual run.','Profiles average48 longitudinal positions, not per-position paired-edge proof.','Nearest sensor and bilinear averaged profile are different sampling channels; no AA claim.','Raw numeric width and positive sensor contrast do not establish path identity, renderer provenance, physical scale or calibrated width.']}
(D/'analysis.json').write_text(json.dumps(a,indent=2)+'\n');(D/'all-candidate-rows.json').write_text(json.dumps(table,indent=2)+'\n')
with (D/'all-candidate-rows.csv').open('w',newline='')as f:
 w=csv.DictWriter(f,fieldnames=list(table[0]));w.writeheader();w.writerows(table)
# Direct receipt display: no sensor/profile/edge computation.
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10})
fig=plt.figure(figsize=(18,11.6),facecolor='white');gs=fig.add_gridspec(3,3,width_ratios=[.8,1.25,1.1],hspace=.65,wspace=.35,left=.045,right=.98,top=.82,bottom=.19)
fig.suptitle('HeritagePark fixed source-pixel trial: contrast without a fitted edge pair',fontsize=21,weight='bold',y=.97)
fig.text(.045,.917,'One authorized adapter run | 2 unchanged composition calls | all 9 edge fits null in both source and crop',fontsize=13)
fig.text(.045,.883,'All geometric/control identities are unverified visual testimony. Full/crop comparison: '+r['equivalence']['status']+' (fixed tolerance 1e-9).',fontsize=11)
ax=fig.add_subplot(gs[:,0]);ax.imshow(crop);ax.set_title('Actual source pixels: integer 280 x 270 crop\norigin (970,1120), no resize for evidence',fontsize=11);colors=['#f03b3b','#00aacc','#c29000'];short=['proposed ribbon','+55 normal control','bright field control']
for st,color,label in zip(p['stations'],colors,short):
 x=st['xPx']-roi['xPx'];y=st['yPx']-roi['yPx'];h=st['headingRad'];ax.plot([x+st['t0Px']*math.cos(h),x+st['t1Px']*math.cos(h)],[y+st['t0Px']*math.sin(h),y+st['t1Px']*math.sin(h)],color=color,lw=2);ax.scatter([x],[y],color=color,s=25,label=label)
ax.legend(loc='upper center',bbox_to_anchor=(.5,-.16),fontsize=9,frameon=False);ax.set_xlabel('Original x minus 970 (pixels)');ax.set_ylabel('Original y minus 1120 (pixels)')
for k,(cs,ss,sr,color)in enumerate(zip(r['composition']['stations'],r['sourceComposition']['stations'],summary,colors)):
 ax=fig.add_subplot(gs[k,1]);pr=cs['profile'];ax.plot(pr['offsetsPx'],ss['profile']['meanLum'],color='#303030',lw=2,label='full source');ax.plot(pr['offsetsPx'],pr['meanLum'],color=color,lw=1,ls='--',label='crop');ax.set_title(cs['id']+'\nprofile: all counts48/48; max full/crop |delta|='+format(sr['profileMaximumAbsoluteDifference'],'.3g'),fontsize=10);ax.set_xlabel('Normal offset (source pixels)');ax.set_ylabel('Raw RGB mean');ax.grid(alpha=.15);ax.legend(fontsize=8,loc='best')
 ax=fig.add_subplot(gs[k,2]);xs=np.arange(3);fields=['leftRail','innerLeft','innerRight','rightRail','score'];labels=['left rail','inner left','inner right','right rail','combined'];palette=['#2e6994','#65a5cb','#b5d9ec','#df9b46','#8c3e3e']
 for j,(field,label,bc)in enumerate(zip(fields,labels,palette)):
  ax.bar(xs+(j-2)*.145,[z['observation'][field]for z in cs['candidates']],width=.14,label=label,color=bc)
 ax.set_xticks(xs,['24','30','36']);ax.set_ylim(0,1.12);ax.set_ylabel('Raw uncalibrated lift');ax.set_xlabel('Explicit LOCAL candidate width (px)');ax.set_title('All 3 edge fits null; midpoint UNKNOWN',fontsize=11);ax.grid(axis='y',alpha=.15)
 if k==0:ax.legend(ncol=3,fontsize=8,loc='upper right')
fig.text(.045,.13,'Predeclared paired-ribbon expectation FALSIFIED: proposed ribbon has no finite positive two-edge fit at any declared width.',fontsize=13,weight='bold',color='#8a2929')
fig.text(.045,.097,'Sensor contrast is partial evidence only: ribbon combined [0, 0.688889, 0.340741]; both controls [0,0,0]. Raw learner selects30 (5 samples/width).',fontsize=11)
fig.text(.045,.068,'Calibrated width UNKNOWN | semantic/route identity UNKNOWN | promoted=false | no AA muting, recentering, crop enlargement or tuning.',fontsize=11)
fig.text(.045,.039,'Full and crop observation/fit/midpoint fields exactly match; profiles may differ at roundoff. Matched numeric control is not scientific equivalence.',fontsize=10)
fig.text(.045,.014,'Receipt SHA256 '+sha(D/'receipt.json')+' | Figure reads this receipt and verified original PNG only; no scores recomputed.',fontsize=8)
fig.savefig(D/'scientific-figure.png',dpi=160);plt.close(fig)
print(json.dumps({'receiptSha256':sha(D/'receipt.json'),'figureSha256':sha(D/'scientific-figure.png'),'analysisSha256':sha(D/'analysis.json'),'profileDifferences':[s['profileMaximumAbsoluteDifference']for s in summary],'allObservationEqual':all(z['sourceObservationExactlyEqual']for z in table)},indent=2))
