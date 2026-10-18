from pathlib import Path
import csv,json,hashlib
from PIL import Image
D=Path('/workspace/scratch/8528bb251845/discovery-cycle03/D2/review-R510');root=D.parents[2];target=root/'discovery-cycle03/D1/figure-E510'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();probes=[]
def ck(name,got,want):
 probes.append({'probe':name,'pass':got==want,'actual':got,'expected':want});assert got==want,name
ck('E510 exact fixed result',sha(target/'result.json'),'72d62cd54274aee4cb119b70af1458d6fa898b1293ac64f40f3d2a066b72839d')
res=json.loads((target/'result.json').read_text());original=Path(res['input']['path']);receipt=json.loads(original.read_text());manifest=json.loads((target/'render-manifest.json').read_text())
ck('source numeric receipt hash',sha(original),'4515742be1bcbd3ef3949e302eb1610d39c2c63218e5382d73bf82de83d60ab5');ck('input raw copy byte equality',(target/'numeric-seam-input.json').read_bytes()==original.read_bytes(),True)
ck('manifest binding',sha(target/'render-manifest.json'),res['renderManifest']['sha256'])
for f in res['files']:
 p=Path(f['path']);ck('declared SHA '+p.name,sha(p),f['sha256']);ck('declared bytes '+p.name,p.stat().st_size,f['bytes'])
for f in manifest['files']:
 p=Path(f['path']);ck('manifest SHA '+p.name,sha(p),f['sha256'])
for f in ['render_figure.py','numeric-seam-input.json','fit-table.json','fit-table.csv','numeric-seam-figure.png']:
 ck('unchanged renderer replay bytes '+f,(D/f).read_bytes()==(target/f).read_bytes(),True)
ck('widths exactly24/30/36',[r['widthArgPx']for r in receipt['rows']],[24,30,36])
expected=[]
for row in receipt['rows']:
 for frame,key in [('Full source','fullFit'),('Crop','croppedFit')]:expected.append({'widthArgPx':row['widthArgPx'],'frame':frame,**row[key],'sensorEqual':row['sensorEqual']})
table=json.loads((target/'fit-table.json').read_text());ck('table input binding',table['inputSha256'],sha(original));ck('all6 JSON rows/all fit fields exact',table['rows'],expected)
csvrows=list(csv.DictReader((target/'fit-table.csv').open(newline='')))
ck('CSV row count',len(csvrows),len(expected))
for i,(csvrow,e) in enumerate(zip(csvrows,expected)):
 for k,v in e.items():
  value=csvrow[k] if isinstance(v,str) else csvrow[k]=='True' if isinstance(v,bool) else float(csvrow[k])
  ck('CSV row'+str(i)+' '+k,value,v)
ck('receipt max profile difference',res['receiptMetadata']['profileMaximumAbsoluteDifference'],receipt['profileMaximumAbsoluteDifference']);ck('receipt visible count equality label',res['receiptMetadata']['visibleCountsEqual'],receipt['visibleCountsEqual']);ck('sensor equal per declared width',res['receiptMetadata']['sensorEqual'],[row['sensorEqual']for row in receipt['rows']])
ck('display maxdiff six significant digits',format(receipt['profileMaximumAbsoluteDifference'],'.6g'),'2.55795e-13');ck('display all3 sensors equal',all(row['sensorEqual']for row in receipt['rows']),True);ck('display visible counts equal',receipt['visibleCountsEqual'],True)
ck('figure dimensions',list(Image.open(target/'numeric-seam-figure.png').size),manifest['figureDimensionsPx'])
script=(target/'render_figure.py').read_text()
for token in ['row[\'lPx\']','row[\'rPx\']','row[\'cPx\']','R506 pending. No acceptance.','Equivalence UNKNOWN','Scientific validity UNKNOWN','Semantic / route identity UNKNOWN','Producer hypothesis:','reported exact source-pixel copy']:
 ck('renderer label/data trace '+token,token in script,True)
ck('E502 protocol remains frozen',sha(root/'discovery-cycle03/D2/frozen-protocol.json'),'ee4ac0852dfe1838c3d637ff967b65918ca9bb077ab9f1a6b2df9763ec3e916a')
p={'schema':'R510-rendering-only-probes@1','count':len(probes),'allPassed':all(z['pass']for z in probes),'probes':probes,'noCvRecompute':True}
(D/'probes.json').write_text(json.dumps(p,indent=2)+'\n')
result={'schema':'cycle03-independent-review@1','job_id':'R510','worker':'D2','reviewedJob':'E510','reviewedWorker':'D1','decision':'accepted','summary':'Exact pinned historical numeric-seam receipt is faithfully rendered. All six full-source/crop rows at requested widths24/30/36 retain recorded l/r/c and remaining fit fields in JSON/CSV; plot and displayed values originate those rows. Unchanged renderer independently reproduced PNG and tables byte-for-byte. Viewed original figure is legible, preserves historical R506-pending/no-acceptance label and all UNKNOWN statements. Acceptance is limited to trace/table/render identity and verdict faithfulness.','auditedFiles':[{'path':str(target/f),'sha256':sha(target/f)}for f in ['result.json','render_figure.py','render-manifest.json','numeric-seam-input.json','fit-table.json','fit-table.csv','numeric-seam-figure.png']],'receipt':{'path':str(original),'sha256':sha(original)},'probes':{'path':str(D/'probes.json'),'sha256':sha(D/'probes.json'),'count':len(probes),'allPassed':p['allPassed']},'rendererReplay':{'directory':str(D),'unmodifiedRenderer':True,'tablesByteIdentical':True,'figureByteIdentical':True,'figureSha256':sha(D/'numeric-seam-figure.png')},'visualInspection':{'originalPngViewed':True,'findings':'All three width groups show two full/crop intervals, left/right endpoint ticks, midpoint dots and rounded midpoint labels. Right table contains all six l/r/c rows. Profile-difference and equality labels, input hash, producer-hypothesis wording, historical R506 pending/no acceptance, and equivalence/scientific/semantic UNKNOWN lines are visible and unclipped.'},'metadataFaithfulness':{'profileMaximumAbsoluteDifference':receipt['profileMaximumAbsoluteDifference'],'displayRounded':'2.55795 x 10^-13','visibleCountsEqual':receipt['visibleCountsEqual'],'sensorEqual':[row['sensorEqual']for row in receipt['rows']],'note':'Display banner strings are fixed for this pinned receipt; independently checked against its metadata. No recomputation of profiles, sensor channels or fits.'},'limitations':['Rendering audit only; no CV source/math/scientific acceptance and no claim the renderer independently validates source-pixel mapping.','R506 pending is preserved as capture-time truth; this review does not relabel its result.','Floating addition-order/strict-score explanation remains explicitly producer hypothesis.','Displayed coordinates round to0.001px; exact raw numbers remain JSON/CSV.','No candidate or CV producer executed, no recipe/learner/edge/sensor recomputation, no source changes or Git mutation.','Own E502 protocol hash rechecked unchanged.'],'amendmentsRequired':[]}
(D/'result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'decision':'accepted','probeCount':len(probes),'resultSha256':sha(D/'result.json'),'probesSha256':sha(D/'probes.json')},indent=2))
