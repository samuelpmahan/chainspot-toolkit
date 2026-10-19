"""Independent retained-artifact check: stdlib only; no product imports/execution."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

base=Path('/workspace/scratch/86659bbafcce')
repo=base/'chainspot-discovery-lab'
job=base/'lab17/S2/R4708'
oldpath=repo/'work/capability-discovery/cycle-10/evidence/E4009/output/trace.json'
oldbytes=oldpath.read_bytes()
sha=lambda data:hashlib.sha256(data).hexdigest()
oldhash='f237792dc0753096c3ab390a6efdf901e8850dbd433be60c7b9c808588bd3e63'
assert len(oldbytes)==146333 and sha(oldbytes)==oldhash
old=json.loads(oldbytes)
svgpath=base/'lab17/S1/E4707/green/outputs/heading-projection-FyDDpZ/actual.svg'
svgbytes=svgpath.read_bytes()
svg=ET.fromstring(svgbytes)
ns={'s':'http://www.w3.org/2000/svg'}
metadata=json.loads(svg.find('s:metadata',ns).text)
texts=[''.join(element.itertext()) for element in svg.findall('.//s:text',ns)]
visible=''.join(texts)
ids=[r['id'] for r in old['renderRows']]
stationids=[s['id'] for r in old['renderRows'] for s in r['stations']]
assert len(ids)==4 and len(stationids)==64 and len(set(stationids))==64
for key in ['runId','imageId','paramsHash','sourceBinding','inputBinding','claims']:
    assert metadata[key]==old[key], key
assert metadata['traceHash']==oldhash
assert metadata['rowIds']==ids and metadata['stationIds']==stationids
compact=lambda value:json.dumps(value,separators=(',',':'),ensure_ascii=False)
assert 'claims='+compact(old['claims']) in visible
prediction={k:old['prediction'][k] for k in ['status','Dprimary','Dbright']}
prediction['groups']=[{k:g[k] for k in ['groupId','status','D']} for g in old['prediction']['groups']]
assert 'prediction='+compact(prediction) in visible
assert old['prediction']['status']=='SUPPORTED'
assert old['claims']['promoted'] is False
assert old['claims']['qualification']=='conditional in-sample sampling evidence; rotation changes support'
for key in ['pathIdentity','physicalEdgeIdentity','AAAlpha','confidence']:
    assert old['claims'][key]=='UNKNOWN'
rowdescs=[json.loads(element.text) for element in svg.findall('.//s:desc',ns) if element.get('id') is None]
assert rowdescs==old['renderRows']
groups=[element for element in svg.findall('.//s:g',ns) if element.get('data-station-id') is not None]
assert [g.get('data-station-id') for g in groups]==stationids
for group,station in zip(groups,[s for r in old['renderRows'] for s in r['stations']]):
    assert group.get('data-row-id')==station['id'].rsplit('/station',1)[0]
    cells=group.findall('s:text',ns)
    assert len(cells)==8
    actual=[''.join(c.itertext()) for c in cells]
    number=lambda v:compact(v) if not isinstance(v,str) else v
    expected=[f"{station['index']} / {number(station['tPx'])}",
      'x='+number(station['originPx'][0])+'y='+number(station['originPx'][1]),
      number(station['headingDeg']),number(station['leftLum']),number(station['rightLum']),
      number(station['minLum']),number(station['deltaFromBaseline']),
      number(station['okLeft'])+' / '+number(station['okRight'])+' / '+compact(station['badFlags'])]
    assert actual==expected,station['id']

# Select by whole-trace equality and no failure artifact, never by directory title.
inventory=[]
candidates=[]
for receiptpath in sorted((base/'lab17/S1/E4707/green/outputs').glob('*/receipt.json')):
    receiptbytes=receiptpath.read_bytes(); receipt=json.loads(receiptbytes)
    tracepath=receiptpath.with_name('trace.json'); tracebytes=tracepath.read_bytes(); trace=json.loads(tracebytes)
    whole_equal=trace==old
    failed=receiptpath.with_name('failure.json').exists()
    inventory.append({'receipt':str(receiptpath),'receiptSha256':sha(receiptbytes),'traceSha256':sha(tracebytes),'wholeOriginalTraceEqual':whole_equal,'failureArtifactPresent':failed})
    if whole_equal and not failed:
        candidates.append((receiptpath,receipt,receiptbytes,tracepath,tracebytes))
assert len(candidates)==1,inventory
receiptpath,receipt,receiptbytes,tracepath,tracebytes=candidates[0]
assert tracebytes==oldbytes and sha(tracebytes)==oldhash
assert receipt['schema']=='heading-ablation-cli@1'
for key in ['runId','imageId','paramsHash','prediction','claims','renderRows']:
    assert receipt[key]==old[key],key
assert receipt['traceHash']==oldhash
assert receipt['rowIds']==ids and receipt['stationIds']==stationids
assert receipt['artifacts']==[{'path':'trace.json','bytes':len(oldbytes),'sha256':oldhash}]
readback={'schema':'lab17-independent-heading-readback@1','job_id':'R4708','status':'MATCH',
 'checker':'Python stdlib hashlib/json/ElementTree; no recipe/renderer imports',
 'sourceTrace':{'path':str(oldpath),'bytes':len(oldbytes),'sha256':oldhash},
 'selectedAuthorSvg':{'path':str(svgpath),'bytes':len(svgbytes),'sha256':sha(svgbytes)},
 'selectedAuthorReceipt':{'path':str(receiptpath),'bytes':len(receiptbytes),'sha256':sha(receiptbytes)},
 'selectedAuthorFullTrace':{'path':str(tracepath),'bytes':len(tracebytes),'sha256':sha(tracebytes),'exactOldBytes':True},
 'checks':{'visibleClaims':True,'metadataClaims':True,'visiblePrediction':True,'receiptPredictionAndClaims':True,'fourFullRowDescriptions':True,'all64StationIdentitiesAndVisibleCells':True,'sourceAndInputBindings':True,'oldTraceHashUnchanged':True,'fullTraceNotLegacyOrClone':True},
 'prediction':prediction,'claims':old['claims'],'rowIds':ids,'stationIds':stationids,
 'candidateInventory':inventory,
 'qualification':'Consumer qualifier preservation only. No scientific or physical validation. Canonical artifacts selected for separate S6 artifact-only rasterization; no standalone rendering here.'}
with (job/'readback.json').open('x') as stream:json.dump(readback,stream,indent=2);stream.write('\n')
print(json.dumps({'status':'MATCH','selectedAuthorSvg':str(svgpath),'selectedAuthorReceipt':str(receiptpath),'readback':str(job/'readback.json')}))
