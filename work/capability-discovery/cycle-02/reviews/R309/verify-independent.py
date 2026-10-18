from pathlib import Path
import json,hashlib,math
root=Path(__file__).resolve().parent;replay=root/'replay';original=root.parents[1]/'C1'/'E309'
r=json.loads((replay/'receipt.json').read_text());p=json.loads((replay/'protocol.json').read_text());result=json.loads((original/'result.json').read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha((replay/'protocol.json').read_bytes())==result['protocolHash']==r['protocolSha256']
assert sha((replay/'probe.mjs').read_bytes())==result['producerHash']==r['producerSha256']
assert sha((replay/'receipt.json').read_bytes())==result['receiptHash']==sha((original/'receipt.json').read_bytes())
for s in p['sources']:
 b=(replay/s['file']).read_bytes();assert sha(b)==s['sha256'];assert hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest()==s['gitBlob']
assert len(r['fixtures'])==16 and len(r['rows'])==64
fixtureChecks=[]
for f in r['fixtures']:
 w=f['nominalWidthPx'];lo,hi=f['nominalEdgesYPx'];coverage=[];levels=[]
 for y in range(160):
  if f['mode']=='crisp-point':v=int(lo<=y<hi)
  else:v=max(0,min(y+.5,hi)-max(y-.5,lo))
  coverage.append(v);levels.append(math.floor(100+45*v+.5))
 assert coverage==f['analyticOrPointCoverages'] and levels==f['rowLuminance']
 data=b''.join(bytes([v,v,v,255])*160 for v in levels);assert sha(data)==f['rgbaSha256']
 assert f['nonzeroRasterSpanPx']==sum(v>100 for v in levels) and f['fullyBrightRowsPx']==sum(v==145 for v in levels)
 assert math.isclose(sum((v-100)/45 for v in levels),f['integratedRasterContrastWidthPx'],abs_tol=1e-12)
 crossings=[]
 for y in range(159):
  a,b=levels[y:y+2]
  if a<122.5<=b or a>=122.5>b:crossings.append(y+(122.5-a)/(b-a))
 assert crossings==f['bilinearHalfLevelEdgesYPx'] and crossings[1]-crossings[0]==f['bilinearHalfLevelEdgeSeparationPx']
 fixtureChecks.append({'id':f['id'],'coverageReconstructed':True,'quantizedRgbaHashMatches':True,'nominalWidthPx':w,'quantizedContrastAreaWidthPx':f['integratedRasterContrastWidthPx'],'halfLevelSeparationPx':f['bilinearHalfLevelEdgeSeparationPx']})
by={f['id']:f for f in r['fixtures']};ties=nulls=0
for row in r['rows']:
 f=by[row['fixtureId']];api=row['sourceAPIs'];cy=80+row['queryPhasePx'];levels=f['rowLuminance']
 assert row['state']=={'xPx':80,'yPx':cy,'headingRad':0} and api['profile']['nT']==100 and all(v==100 for v in api['profile']['ok'])
 for off,value in zip(r['sourceAPIConventions']['OFFS'],api['profile']['prof']):
  y=cy+off;k=math.floor(y);expected=levels[k]+(levels[k+1]-levels[k])*(y-k)
  assert math.isclose(expected,value,abs_tol=1e-10)
 nominal=next(c['observation'] for c in api['fourlane'] if c['widthPx']==f['nominalWidthPx'])
 assert all(nominal[k]==1 for k in ['leftRail','rightRail','innerLeft','innerRight','railScore','innerScore','score'])
 for candidate,score in zip(api['fourlane'],api['learner']['scores']):
  assert candidate['widthPx']==score['widthPx'] and score['visibleSamples']==5 and math.isclose(candidate['observation']['score'],score['meanScore'],abs_tol=1e-15)
 mx=max(x['meanScore'] for x in api['learner']['scores']);winners=[x['widthPx'] for x in api['learner']['scores'] if x['meanScore']==mx]
 assert winners==row['learnerInterpretation']['tiedBestWidthsPx'] and (len(winners)==1)==row['learnerInterpretation']['strictFiniteWinner']
 ties+=len(winners)>1;nulls+=sum(e['fit'] is None for e in api['edges'])
 assert row['learnerInterpretation']['calibrationClaim'].startswith('UNKNOWN') and row['determinismRepeatExact'] is True
assert ties==48 and nulls==288
sensitivity={}
for key in ['learner','fourlane','profile']:
 groups={f['id']:len({json.dumps(row['sourceAPIs'][key],sort_keys=True) for row in r['rows'] if row['fixtureId']==f['id']}) for f in r['fixtures']}
 sensitivity[key]={'varyingFixtures':sum(v>1 for v in groups.values()),'distinctPerFixture':groups}
assert [sensitivity[k]['varyingFixtures'] for k in ['learner','fourlane','profile']]==[0,6,16]
for stab in r['stability']:
 w=stab['nominalWidthPx'];mode=stab['mode'];rows=[row for row in r['rows'] if by[row['fixtureId']]['nominalWidthPx']==w and by[row['fixtureId']]['mode']==mode]
 fits=[next(x['fit'] for x in row['sourceAPIs']['edges'] if x['expectedWidthPx']==w) for row in rows]
 assert len(rows)==16 and all(fits)
 for key,field in [('nominalFittedWidthPx','wPx'),('nominalFitScoreLumPerPx','score')]:
  vals=[f[field] for f in fits];assert stab[key]=={'min':min(vals),'max':max(vals),'span':max(vals)-min(vals)}
 if mode=='crisp-point':assert all(f['wPx']==w and f['score']==36 for f in fits)
 else:assert math.isclose(stab['nominalFittedWidthPx']['span'],.2934782608695652,abs_tol=1e-12) and math.isclose(stab['nominalFitScoreLumPerPx']['min'],22.7,abs_tol=1e-12)
example=[row for row in r['rows'] if row['fixtureId']=='W30-p0-crisp-point' and row['queryPhasePx'] in [0,.5]]
rawExample=[{'queryPhasePx':row['queryPhasePx'],'width24':row['sourceAPIs']['fourlane'][0]['observation'],'learner':row['sourceAPIs']['learner']} for row in example]
out={'status':'PASS','fixtures':16,'poses':64,'coverageQuantizationFixtures':fixtureChecks,'sourceFiles':3,'profileRowsIndependentlyInterpolated':64,'directObservations':384,'edgeQueries':384,'nativeNullFits':nulls,'tiedLearnerRows':ties,'uniqueWidthUnknownRows':ties,'sensitivity':sensitivity,'stability':r['stability'],'rawChannelCounterexample':rawExample,'freshProcessReceiptByteIdentical':True}
(root/'verification.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'status':'PASS','fixtures':16,'poses':64,'ties':ties,'nativeNullFits':nulls,'sensitivity':{k:v['varyingFixtures'] for k,v in sensitivity.items()}}))
