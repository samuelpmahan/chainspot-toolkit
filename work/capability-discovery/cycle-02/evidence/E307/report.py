from pathlib import Path
import json,hashlib
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from html.parser import HTMLParser
R=Path(__file__).resolve().parent;H=R.parent/'heldout';F=H/'fixtures'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=json.loads((R/'input-manifest.json').read_text());rows=[]
class Parsed(HTMLParser):
 def __init__(self):super().__init__();self.text=[]
 def handle_data(self,d):self.text.append(d)
html=[]
for v in manifest['inputs']:
 d=json.loads((R/'receipts'/(v['id']+'.json')).read_text());c=json.loads((F/(v['caseId']+'.json')).read_text());s=d['stations'][0]
 assert d['inputProvenance']['rgbaSha256']==v['rgbaSha256'];assert d['frame']==v['nativeFrame'];assert d['localWidth']['status']=='UNKNOWN' and d['localWidth']['widthPx'] is None and d['semanticIdentity']['status']=='UNKNOWN' and d['promoted'] is False
 assert [x['widthArgPx'] for x in s['candidates']]==c['query']['candidateWidthsPx']
 for x in s['candidates']:
  o=x['observation']
  if o['leftRailOccluded'] or o['rightRailOccluded']:assert x['pairedRails']['status']=='UNKNOWN'
  if x['edgeFit'] is None:assert x['midpoint']['status']=='UNKNOWN'
  if o['railMode']=='occluded':assert o['railScore'] is None
 checks={'frameAndRgbaIdentity':'PASS','noCalibratedWidthOrSemanticPromotion':'PASS','missingRailsNeverPairedByGuard':'PASS','missingEdgeNeverInventsMidpoint':'PASS','candidateBankUnaltered':'PASS'}
 if v['variant']=='all-hidden':
  assert all(z['visibleSamples']==0 and z['meanScore']=={'numberKind':'nonfinite','value':'-Infinity'} for z in d['rawWidthEstimate']['scores']);assert d['status']=='UNKNOWN';checks['allHiddenNumericFallbackRetainedWithoutLearning']='PASS'
 if v['caseId']=='C2-05' and v['variant']=='declared-mask':
  cc=next(z for z in s['candidates'] if z['widthArgPx']==40);assert cc['observation']['innerScore']==1 and cc['observation']['score']==1 and cc['observation']['railScore'] is None and cc['pairedRails']['status']=='UNKNOWN';checks['interiorOnlyRemainsDistinctFromRails']='PASS'
 parser=Parsed();text=(R/'html'/(v['id']+'.html')).read_text();parser.feed(text);txt=' '.join(parser.text)
 assert v['rgbaSha256'] in txt and 'Semantic path identity UNKNOWN' in txt and 'Raw profile, visibility counts and channels' in txt
 html.append({'id':v['id'],'htmlSha256':sha(R/'html'/(v['id']+'.html')),'parseContentStatus':'PASS','visualBrowserScreenshot':'not yet attempted'})
 rows.append({'id':v['id'],'caseId':v['caseId'],'class':v['class'],'status':d['status'],'assertionVerdicts':checks,'predictionVerdict':'OBSERVED_AS_QUALITATIVELY_PREDICTED; no accuracy acceptance','rawWidthEstimate':d['rawWidthEstimate'],'localWidth':d['localWidth'],'semanticIdentity':d['semanticIdentity'],'profileStationCount':s['profile']['stationCount'],'candidates':s['candidates'],'receiptSha256':sha(R/'receipts'/(v['id']+'.json'))})
fig,axes=plt.subplots(7,3,figsize=(15,18),gridspec_kw={'width_ratios':[1.15,1.1,1]})
for i,(v,row) in enumerate(zip(manifest['inputs'],rows)):
 d=json.loads((R/'receipts'/(v['id']+'.json')).read_text());s=d['stations'][0];c=json.loads((F/(v['caseId']+'.json')).read_text());raw=(F/c['image']['rgbaFile']).read_bytes();assert hashlib.sha256(raw).hexdigest()==v['rgbaSha256'];im=np.frombuffer(raw,np.uint8).reshape(256,320,4)
 ax=axes[i,0];ax.imshow(im);q=c['query'];ax.plot(q['xPx']-.5,q['yPx']-.5,'r+',ms=8)
 if v['variant']=='all-hidden':ax.patch.set_hatch('///');ax.text(.04,.06,'ALL PIXELS KNOWN HIDDEN',transform=ax.transAxes,color='crimson',fontsize=9)
 elif c['knownOccluderBboxes']:
  for b in c['knownOccluderBboxes']:ax.axhspan(b['bboxY']-.5,b['bboxY']+b['bboxH']-.5,color='orange',alpha=.25)
 ax.set_title(v['id']+' / '+v['class'],fontsize=9,loc='left');ax.set_ylabel('array y (px)',fontsize=8);ax.tick_params(labelsize=8)
 ax=axes[i,1];profile=s['profile'];vals=np.array([np.nan if x is None or isinstance(x,dict) else x for x in profile['meanLum']],float);ax.plot(profile['offsetsPx'],vals,color='#17645c');ax.set_xlim(-30,30);ax.set_ylim(90,160);ax.grid(alpha=.2);ax.tick_params(labelsize=8);ax.set_title('Raw averaged luminance; window [−28,28) px',fontsize=9,loc='left');ax.set_ylabel('RGB mean level',fontsize=8)
 for z in s['candidates']:
  if z['edgeFit']:
   e=z['edgeFit'];ax.plot([e['lPx'],e['rPx']],[155,155],'.-',lw=.6,label=str(z['widthArgPx']))
 ax=axes[i,2];ws=[z['widthArgPx'] for z in s['candidates']]
 for key,color,m in [('railScore','#2563eb','o'),('innerScore','#b45309','s'),('score','#147d44','^')]:
  ys=[np.nan if z['observation'][key] is None else z['observation'][key] for z in s['candidates']];ax.plot(ws,ys,color=color,marker=m,lw=1,label=key)
 ax.set_ylim(-.08,1.13);ax.set_xticks(ws);ax.grid(alpha=.2);ax.tick_params(labelsize=8);ax.set_ylabel('uncalibrated lift',fontsize=8);ax.set_title('Raw rail / interior / combined by width',fontsize=9,loc='left')
 if all(z['observation']['railScore'] is None for z in s['candidates']):ax.text(.02,.05,'Rail: UNKNOWN (null)',transform=ax.transAxes,color='#2563eb',fontsize=8)
 if i==0:ax.legend(fontsize=7,loc='lower right')
 if i==6:
  axes[i,0].set_xlabel('array x (px)');axes[i,1].set_xlabel('normal offset from frozen query (px)');axes[i,2].set_xlabel('explicit candidate width (px)')
fig.suptitle('E307 frozen synthetic cases: raw channels retain false positives, missing rails and crossing disagreement',fontsize=13,x=.025,ha='left',y=.995)
fig.text(.025,.976,'Six unchanged construction cases + their frozen all-hidden variant. Exact RGBA inputs. Orange: known unavailable pixels. No width calibration, semantic identity or promotion.',fontsize=9)
fig.tight_layout(rect=[.01,.015,.995,.966],h_pad=1.5,w_pad=1.5);fig.savefig(R/'evaluation.png',dpi=150);plt.close(fig)
(R/'html-inspection.json').write_text(json.dumps(html,indent=2)+'\n')
(R/'measurements.json').write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps({'caseCount':6,'runCount':len(rows),'assertions':'PASS channel-honesty/frame checks; no accuracy assertion','figure':'evaluation.png','htmlContentParsed':len(html)}))
