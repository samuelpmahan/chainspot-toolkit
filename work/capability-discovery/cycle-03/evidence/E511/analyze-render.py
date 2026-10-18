#!/usr/bin/env python3
"""Receipt-only analysis/rendering; no producer imports. TRIAL DESCRIPTOR ORIGINAL_DISPLAY_CROP OUT"""
from pathlib import Path
import sys,json,hashlib,csv,copy
from PIL import Image
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
trial,descriptor,crop,out=map(Path,sys.argv[1:]);out.mkdir(parents=True,exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();load=lambda p:json.loads(p.read_text())
r=load(trial/'receipt.json');bind=load(trial/'run-binding.json');d=load(descriptor);p=load(out/'protocol.json')
assert sha(trial/'receipt.json')==bind['receiptSha256'] and sha(descriptor)==bind['requestDescriptorSha256']
assert sha(crop)=='3ab29f152fb70ea6205c3aa268ad35f406daf5b99afe55bdd6973762fd6981e9'
assert r['support']['status']=='SUPPORTED_CONSERVATIVE_ENVELOPE' and r['execution']['compositionCalls']==2
assert r['provenance']['fullRgbaSha256']==r['provenance']['cropRgbaSha256']==d['source']['fullRgbaSha256']
c=r['composition'];s=r['sourceComposition'];rows=[]
for station in c['stations']:
 for candidate in station['candidates']:
  rows.append(dict(stationId=station['id'],**copy.deepcopy(candidate)))
assert [(x['stationId'],x['widthArgPx']) for x in rows]==[(s['id'],w) for s in d['geometry']['stations'] for w in d['geometry']['localWidthBank']['valuesPx']]
profiles=[dict(stationId=x['id'],profile=copy.deepcopy(x['profile'])) for x in c['stations']]
comparisons=[]
for w in d['geometry']['localWidthBank']['valuesPx']:
 a=next(x for x in rows if x['stationId']=='primary' and x['widthArgPx']==w);b=next(x for x in rows if x['stationId']=='lateral-plus16' and x['widthArgPx']==w)
 available=a['edgeFit'] is not None and b['edgeFit'] is not None
 comparisons.append(dict(widthArgPx=w,primaryFitPresent=a['edgeFit'] is not None,offsetFitPresent=b['edgeFit'] is not None,offsetMinusPrimaryCandidateCenterMinusFitMidpointPx=b['midpoint']['candidateCenterMinusFitMidpointPx']-a['midpoint']['candidateCenterMinusFitMidpointPx'] if available else None,comparisonStatus='OBSERVED_CHANNEL_DIFFERENCE_WITHOUT_SAME_EDGE_IDENTITY' if available else 'UNKNOWN_UNPAIRED_NULL',limit='A+16 offset does not guarantee that both fits identify the same physical edges; no semantic identity supplied.'))
a=dict(schema='E511-actual-support-ablation-analysis@1',job_id='E511',worker='V2',receiptSha256=bind['receiptSha256'],protocolSha256=bind['protocolSha256'],requestDescriptorSha256=bind['requestDescriptorSha256'],adapterStatus=r['status'],support=r['support'],execution=r['execution'],rawLearner=copy.deepcopy(c['rawWidthEstimate']),allRequestedRows=rows,allProfiles=profiles,sourceCompositionRetained='trial/receipt.json.sourceComposition',sourceCropEquivalence=r['equivalence'],candidateFitCounts=dict(total=len(rows),finite=sum(x['edgeFit'] is not None for x in rows),null=sum(x['edgeFit'] is None for x in rows)),midpointContrasts=comparisons,questionAnswer='YES for this separately declared full-frame diagnostic: ROI-only replacement changed the accepted support gate from UNKNOWN to supported and allowed local measurements. It does not measure original E508 rows retrospectively, establish smaller-ROI outputs, or validate semantics.',predictions=dict(fullFrameSupport='OBSERVED: supported and2composition calls',zeroTranslationMatch='OBSERVED: raw controls match fixed1e-9; both fullRGBA and cropRGBA hashes identical'),interpretation=['Raw learner selects37px; it remains uncalibrated diagnostic, not accepted width.','Primary combined score at29/37/45 is0/.713086/0; lateral and bright controls all combined0. This local pose/brightness contrast does not establish semantic identity.','Primary has fits at29/37 but null45; lateral has null29, finite37/45; bright patch has null29, finite37/45. Retain all six finite fits and three nulls without accepted path/non-path identities.','The observed paired37 midpoint contrast is about-1.24446px, not a+16 same-edge movement. Fit association is unverified and fixed lateral search is4px.','E508 original nine rows remain NOT_EXECUTED_SUPPORT_UNKNOWN and its equivalence remains unobserved.'],width='UNKNOWN',semanticIdentity='UNKNOWN',scientificAcceptance=False,exposure='Exposed support ablation after E508/R508. Original D3 prefreeze geometry disclosure retained. Not independent heldout evaluation.',display=dict(path=str(crop),sha256=sha(crop),originalSourceBounds=[180,1795,390,2010],meaning='Existing frozen original-ROI crop for display only; actual E511 computational ROI is full1290x2796 image.'),resources=load(trial/'resources.json'))
(out/'analysis.json').write_text(json.dumps(a,indent=2)+'\n')
flat=[]
for x in rows:
 ob=x['observation'];fit=x['edgeFit'];flat.append(dict(stationId=x['stationId'],widthArgPx=x['widthArgPx'],**{k:ob[k] for k in ['leftRail','innerLeft','innerRight','rightRail','railScore','innerScore','railMode','leftRailOccluded','innerLeftOccluded','innerRightOccluded','rightRailOccluded']},fitPresent=fit is not None,**{k:fit[k] if fit else None for k in ['lPx','rPx','cPx','wPx','gl','gr']},candidateCenterMinusFitMidpointPx=x['midpoint'].get('candidateCenterMinusFitMidpointPx'),midpointStatus=x['midpoint']['status']))
# Explicit separate names avoid overwriting sensor score with edge score in CSV.
for x,y in zip(rows,flat):y['combinedScore']=x['observation']['score'];y['edgeScore']=x['edgeFit']['score'] if x['edgeFit'] else None
with (out/'all-nine-candidates.csv').open('w',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=list(flat[0]));writer.writeheader();writer.writerows(flat)
fig=plt.figure(figsize=(16,11),dpi=160);gs=fig.add_gridspec(3,2,width_ratios=[1,1.8],height_ratios=[1.3,.58,1.1])
ax=fig.add_subplot(gs[:2,0]);im=Image.open(crop).convert('RGBA');ax.imshow(im,extent=(179.5,389.5,2009.5,1794.5),interpolation='nearest')
colors={'primary':'#1265b8','lateral-plus16':'#a83998','bright-patch':'#cf7211'}
for station in d['geometry']['stations']:
 ax.scatter(station['xPx'],station['yPx'],s=40,color=colors[station['id']],edgecolors='white');ax.annotate(station['id'],(station['xPx'],station['yPx']),xytext=({'primary':(8,16),'lateral-plus16':(-3,-23),'bright-patch':(5,-11)}[station['id']]),textcoords='offset points',fontsize=9,color=colors[station['id']],bbox=dict(facecolor='white',alpha=.85,pad=1))
ax.set(title='Frozen source ROI shown for context only\nE511 computes on FULL 1290×2796 source',xlabel='Original source xPx',ylabel='Original source yPx')
ax.grid(alpha=.15)
px=fig.add_subplot(gs[0,1])
for station in c['stations']:
 prof=station['profile'];px.plot(prof['offsetsPx'],prof['meanLum'],label=station['id']+' (nT='+str(prof['stationCount'])+')',color=colors[station['id']])
px.set(title='Actual raw RGB-mean profiles: 241 offsets per station',xlabel='Normal offset(px), fixed[-30,+30]',ylabel='RGB mean level');px.legend(loc='lower right',fontsize=9);px.grid(alpha=.2)
tx=fig.add_subplot(gs[1,1]);tx.axis('off')
learn=c['rawWidthEstimate'];scoreline='; '.join(str(x['widthPx'])+': '+format(x['meanScore'],'.6g')+' (visible '+str(x['visibleSamples'])+')' for x in learn['scores'])
text='SUPPORTED conservative envelope; ONE adapter, TWO composition calls, 66 operations.\nZERO translation controls: '+r['equivalence']['status']+'; tolerance 1e-9; '+str(len(r['equivalence']['differences']))+' differences.\nRaw learner selected'+str(learn['widthPx'])+' px; scores '+scoreline+'.\nWidth/identity UNKNOWN; learner selection is diagnostic. Six finite fits and three nulls retained.\nOriginal E508 remains nine NOT_EXECUTED rows; this is a separate exposed support ablation.'
tx.text(0,1,text,va='top',fontsize=10,linespacing=1.6)
tableax=fig.add_subplot(gs[2,:]);tableax.axis('off');col=['Frozen station','Request','Lrail','Inner L','Inner R','Rrail','Combined','Fit w(px)','−fit c(px)','Edge score'];cells=[]
f=lambda v:format(v,'.6g')
for x in rows:
 ob=x['observation'];fit=x['edgeFit'];cells.append([x['stationId'],str(x['widthArgPx']),*[f(ob[k]) for k in ['leftRail','innerLeft','innerRight','rightRail','score']],f(fit['wPx']) if fit else 'NULL',f(x['midpoint']['candidateCenterMinusFitMidpointPx']) if fit else 'UNKNOWN',f(fit['score']) if fit else 'NULL'])
table=tableax.table(cellText=cells,colLabels=col,cellLoc='left',colLoc='left',loc='upper center',colWidths=[.15,.065,.075,.085,.085,.075,.09,.095,.1,.095]);table.auto_set_font_size(False);table.set_fontsize(9.5);table.scale(1,1.5)
for (rr,cc),cell in table.get_celld().items():
 if rr==0:cell.set_facecolor('#dce9ed');cell.set_text_props(weight='bold')
 else:cell.set_facecolor('#f2f5f8' if rr%2 else 'white')
fig.suptitle('E511 Lenard: full-frame ROI support ablation permits local measurements',fontsize=17)
fig.text(.5,.035,'Actual receipt '+bind['receiptSha256'][:24]+'… | source/crop bytes identical in this zero-translation control. No crop-invariance generalization.',ha='center',fontsize=9)
fig.text(.5,.015,'Bright-patch finite fits demonstrate local ambiguity. No semantic acceptance, calibrated width, physical scale or independent heldout claim. Prior geometry disclosure retained.',ha='center',fontsize=9)
fig.tight_layout(rect=(0,.06,1,.96));fig.savefig(out/'Lenard-E511-actual.png');plt.close(fig)
print(json.dumps(dict(analysisSha256=sha(out/'analysis.json'),figureSha256=sha(out/'Lenard-E511-actual.png'),rows=len(rows),fits=a['candidateFitCounts'],csvSha256=sha(out/'all-nine-candidates.csv')),indent=2))
