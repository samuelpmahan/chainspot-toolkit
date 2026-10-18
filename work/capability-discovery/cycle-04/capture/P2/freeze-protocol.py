#!/usr/bin/env python3
"""Freeze caller geometry and provenance. This script never imports/runs CV."""
import hashlib
import json
import math
import subprocess
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1] / 'chainspot-discovery-lab'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
def write(name, obj):
    path = HERE / name
    with path.open('x') as f:
        json.dump(obj, f, indent=2, allow_nan=False)
        f.write('\n')
    return {'path': str(path), 'sha256': sha(path), 'bytes': path.stat().st_size}
source = json.loads((HERE / 'source-integrity.json').read_text())
frame = source['originalFrame']
heading = math.atan2(160, -20)
u = [math.cos(heading), math.sin(heading)]
n = [-u[1], u[0]]
primary = [565.0, 1175.0]
shift = 6.0
groups = [
    {'id': 'proposed-ribbon', 'role': 'source-selected proposed straight translucent ribbon', 'origin': primary},
    {'id': 'lateral-plus6', 'role': 'matched same-heading coordinate perturbation; not independent negative evidence',
     'origin': [primary[0] + shift*n[0], primary[1] + shift*n[1]]},
    {'id': 'bright-organic', 'role': 'source-selected irregular bright foliage/ground texture control, visually no proposed overlay ribbon',
     'origin': [930.0, 1360.0]},
]
stations = []
for group in groups:
    short_ids = []
    for j, displacement in enumerate([-32, -16, 0, 16, 32], 1):
        station = {'id': f'{group["id"]}.short{j}', 'frame': frame,
            'xPx': group['origin'][0] + displacement*u[0],
            'yPx': group['origin'][1] + displacement*u[1],
            'headingRad': heading, 't0Px': -8, 't1Px': 8}
        stations.append(station)
        short_ids.append(station['id'])
    long_id = f'{group["id"]}.long'
    stations.append({'id': long_id, 'frame': frame, 'xPx': group['origin'][0],
        'yPx': group['origin'][1], 'headingRad': heading, 't0Px': -40, 't1Px': 40})
    group.update({'shortStationIds': short_ids, 'longStationId': long_id,
        'headingRad': heading, 'shortLongitudinalBoundsRelativeToGroupPx': [[-40,-24],[-24,-8],[-8,8],[8,24],[24,40]],
        'longLongitudinalBoundsRelativeToGroupPx': [-40,40]})
geometry = {
    'frame': frame,
    'geometrySource': 'P2 E802 fresh caller visual testimony from exact Lenard-1 original PNG; no tracked zoom annotation; tee/badge API names are unverified arbitrary segment endpoints; no semantic acceptance',
    'training': {'frame': frame, 'segments': [{'tee': {'xPx': 575, 'yPx': 1095}, 'badge': {'xPx': 555, 'yPx': 1255}}]},
    'stations': stations,
    'localWidthBank': {'frame': frame, 'scope': 'LOCAL', 'valuesPx': [34,42,50]},
    'occluders': {'frame': frame, 'boxes': []},
    'edgeSearch': {'latLimPx':12, 'tolWidthPx':2},
}
roi = {'xPx':400, 'yPx':1010, 'widthPx':640, 'heightPx':490, 'frame':'Lenard-1.E802.fixed-roi-source-pixel-centers'}
radius = 4 + max(2*50/3, 50/2+2.5)
envelopes = []
def envelope(label, x, y, r):
    e = {'label':label, 'minX':x-roi['xPx']-r, 'minY':y-roi['yPx']-r,
        'maxX':x-roi['xPx']+r, 'maxY':y-roi['yPx']+r}
    e['strictInterior'] = e['minX']>1 and e['minY']>1 and e['maxX']<roi['widthPx']-2 and e['maxY']<roi['heightPx']-2
    envelopes.append(e)
for seg in geometry['training']['segments']:
    for key in ['tee','badge']:
        envelope('training.'+key,seg[key]['xPx'],seg[key]['yPx'],radius)
for station in stations:
    envelope(station['id']+'.sensor',station['xPx'],station['yPx'],radius)
    for t in [station['t0Px'],station['t1Px']]:
        envelope(station['id']+f'.profileEndpoint{t}',station['xPx']+t*u[0],station['yPx']+t*u[1],30)
assert all(e['strictInterior'] for e in envelopes)
inspection = {
    'schema':'cycle04-original-pixel-inspection@1', 'job_id':'E802','worker':'P2',
    'method':'Direct view_image inspection of the exact original screenshot PNG and a source-pixel crop; no image generation, filtering, resizing, CV profiles or fits',
    'originalPng':{'path':source['sourcePngPath'],'sha256':source['pngSha256'],'width':1290,'height':2796},
    'inspectionCrop': {'path':str(HERE/'inspection-original-pixels-x300-y950.png'),
        'sha256':sha(HERE/'inspection-original-pixels-x300-y950.png'),
        'originalHalfOpenBoundsPx': {'left':300,'top':950,'right':1100,'bottom':1750},
        'width':800,'height':800,'resampling':'none; exact Pillow crop of stored RGB bytes'},
    'observations':[
        'Original is a mobile map screenshot with map chrome, translucent strips, number labels, ring/basket-like overlays and satellite imagery.',
        'Selected proposed strip runs approximately downward-left through original (575,1095) to (555,1255), away from the nearby numbered-label and endpoint-marker overlays in the inspection crop.',
        'The bright-organic control around original (930,1360) is an irregular light foliage/ground patch rather than the visually proposed straight translucent strip.',
        'These statements are impeachable caller visual testimony, not verified course/path/tee/badge/organic identity; no feature segmentation or measured width was produced.'
    ],
    'cvMeasurementsExecuted':0,
}
inspection_art = write('original-screenshot-inspection.json', inspection)
support_art = write('geometric-support-only.json', {
    'schema':'E802-predeclared-geometric-support@1','cvMeasurementsExecuted':0,
    'method':'Arithmetic reproduction of accepted conservative support contract; not adapter preparation or measurement',
    'sensorRadiusPx':radius, 'profileNormalExtentPx':30, 'roi':roi,
    'allEnvelopesStrictlyInterior':True, 'envelopes':envelopes,
    'boundary':'Geometric support does not guarantee finite edge fits, identity, numerical crop invariance, or safe profile-edge fits.'})
grid_js = r'''
let text=''; for await (const chunk of process.stdin) text+=chunk;
const {stations,groups,roi}=JSON.parse(text), rows=[];
const grid=(s,t,o,crop=false)=>{
  const u=[Math.cos(s.headingRad),Math.sin(s.headingRad)],n=[-u[1],u[0]];
  const x=s.xPx-(crop?roi.xPx:0),y=s.yPx-(crop?roi.yPx:0);
  return [x+t*u[0]+o*n[0],y+t*u[1]+o*n[1]];
};
const stationCenters=stations.map(s=>({id:s.id,worldTangentSampleCentersPx:
  Array.from({length:s.t1Px-s.t0Px},(_,k)=>grid(s,s.t0Px+k,0))}));
for(const g of groups){
  const long=stations.find(s=>s.id===g.longStationId); let maxSource=0,maxCrop=0,maxSourceCrop=0;
  g.shortStationIds.forEach((id,j)=>{
    const s=stations.find(s=>s.id===id);
    for(let k=0;k<16;k++)for(let oi=0;oi<241;oi++){
      const o=-30+oi*.25, a=grid(s,-8+k,o),b=grid(long,-40+j*16+k,o);
      const ac=grid(s,-8+k,o,true),bc=grid(long,-40+j*16+k,o,true);
      maxSource=Math.max(maxSource,...a.map((v,q)=>Math.abs(v-b[q])));
      maxCrop=Math.max(maxCrop,...ac.map((v,q)=>Math.abs(v-bc[q])));
      maxSourceCrop=Math.max(maxSourceCrop,Math.abs(a[0]-(ac[0]+roi.xPx)),Math.abs(a[1]-(ac[1]+roi.yPx)));
    }
  });
  rows.push({group:g.id,normalOffsetCount:241,worldComparisonCount:80*241,
    maximumPerAxisShortVsLongDifferenceSourcePx:maxSource,
    maximumPerAxisShortVsLongDifferenceCropPx:maxCrop,
    maximumPerAxisSourceVsTranslatedCropDifferencePx:maxSourceCrop});
}
process.stdout.write(JSON.stringify({schema:'E802-geometry-only-sample-lattice@1',
  method:'Native Node Math.sin/cos and exact unchanged profileAt coordinate operation order only; no image data, sampling, CV imports, profiles or fits',
  runtime:process.version,stationCenters,comparisons:rows,
  interpretation:'Moving pose+window comparison, not a pure window-only ablation. Mathematically matching longitudinal domains are not asserted bitwise identical world grids. Coordinate differences can change interpolation and strict fitter peak selection; do not turn tiny coordinate error into guaranteed output invariance.',
  cvMeasurementsExecuted:0}));
'''
lattice = json.loads(subprocess.check_output(['node','--input-type=module','-e',grid_js],
    input=json.dumps({'stations':stations,'groups':groups,'roi':roi}).encode()))
lattice_art = write('sample-lattice-geometry-only.json', lattice)
freeze = REPO/'work/capability-discovery/cycle-03/evidence/E506/candidate-freeze.json'
recipe = REPO/'work/capability-discovery/cycle-02/feature-manifest-E308.json'
assert sha(freeze)=='d31b7a4312ac1bfc4f76bc96fc278f8acad4f49f4b04283df0faa8e6dce54626'
assert sha(recipe)=='5b59dce1c7ae87f962c0305697ed883e423bd504fedce5851fb02242309dcf52'
frozen = json.loads(freeze.read_text())
for row in frozen['files']+frozen['retainedContractHistoryAndEvidence']:
    assert sha(REPO/row['path'])==row['sha256']
protocol = {
    'schema':'cycle04-longitudinal-paired-edge-premeasurement-protocol@1','job_id':'E802','worker':'P2',
    'frozenAtUtc':datetime.now(timezone.utc).isoformat(),
    'status':'FROZEN_BEFORE_CV; root must explicitly release to producer',
    'question':'Does one fresh source-selected zoom ribbon retain finite paired-edge evidence across five short consecutive windows, and does this constrain more than an 80px averaged profile or matched bright control?',
    'source':source,
    'acceptedUnchangedExecution':{'adapterFreezeSha256':sha(freeze),'compositionManifestSha256':sha(recipe),
        'defaultEnabled':False,'futureExecution':'One explicit enabled adapter request; supported run performs crop and full-original-frame composition; retain all disagreements over existing1e-9 tolerance as UNKNOWN',
        'sourceChangesAllowed':False,'tuningAllowed':False},
    'requestDescriptor':{'enabled':True,'sourceBinding':{'pngPath':source['sourcePngPath'],'stager':'experiments/capability-discovery/source-pixels/stage-png.py',
        'imageId':'Lenard-1.E802','frame':frame,'expectedPngSha256':source['pngSha256'],'expectedFullRgbaSha256':source['fullRgbaSha256']},
        'roi':roi,'geometry':geometry},
    'groups':groups,
    'geometryTestimony':{
        'trainingMeaning':'Fresh visually selected centerline-like segment, supplied to the legacy tee/badge API only. Neither endpoint is claimed to be a verified tee, badge, basket or annotation-mapped point.',
        'annotationBoundary':'E501 reports no Lenard1..5 testimony; Lenard-full annotation mapping to full-source is UNKNOWN. No full-source or E508/E511 coordinates were transferred.',
        'widthBankMeaning':'Explicit arbitrary caller bank [34,42,50] source pixels, chosen as a bounded visual sampling range before measurements; not learned, calibrated or accepted truth.42 is a preregistered comparison anchor, not a width estimate.',
        'heading':'atan2(160,-20), directly from the supplied training segment; identical for every group and window',
        'lateralShift':{'distancePx':shift,'normal':n,'definition':'shifted origin = primary origin +6*[-sin(heading),cos(heading)]'},
        'occluders':'Explicit empty list: no mask, label removal or inferred occluder segmentation. Visible labels outside selected windows are not evidence of absence of all occlusion.'},
    'windowSemantics':{
        'shortWindowCountPerGroup':5,'shortNominalProfileSamples':16,'longNominalProfileSamples':80,
        'sampleConvention':'Unchanged arange(t0,t1,1); t1 excluded. Five short windows partition[-40,40) mathematically in group longitudinal coordinates; no intended gaps or double-counted longitudinal indices. Reanchored floating world coordinates are not claimed bitwise identical; see explicit geometry-only grid record.',
        'movingOrigins':'Short origins move along heading by[-32,-16,0,16,32]px; each uses t[-8,8). Dev72 ignores t0/t1, so moving origins deliberately move its five tangent samples. Long origin is the group center; its Dev72 channels duplicate only short3, not all five.',
        'longComparison':'Moving-pose+window comparison, not a pure window-only ablation. Long JS profile averages the matching union of longitudinal sampling locations mathematically; floating arithmetic and masks can differ. It is not five independent cases. Reconstruct any short-profile mean only from recorded raw profile/count arrays, retaining numerical/mask disagreement.',
        'explicitSampleLatticeGeometryEvidence':lattice_art,
        'knownMinimum':'16 short samples exceeds the fixed edgePairOf floor8 when unmasked; actual visibility/count rules remain unchanged and can still return null.',
        'rowCount':54,'stationCount':18,'groupsShareSourceAndTraining':True},
    'predeclaredObservationsAndFalsifiers':[
        {'claim':'primary paired-edge continuity on this80px trace at comparison anchor42',
         'prediction':'All5 primary short-window source-frame edgeFit values and its long-window edgeFit are finite positive pairs at42.',
         'falsifier':'Any primary short-window null falsifies the all5 continuity expectation. A finite long fit with any short null specifically falsifies interpreting that long average as paired edges throughout the trace.'},
        {'claim':'same physical pair under fixed+6px lateral coordinate perturbation at42',
         'prediction':'When both primary and shifted source-frame fits are finite, shifted candidateCenterMinusFitMidpointPx minus primary value is predicted+6px.',
         'falsifier':'Nulls make the pair comparison unobserved; nonzero residual from the explicit+6 prediction is retained as evidence against exact same-edge interpretation. Report signed residuals without a new score cutoff or post-hoc tolerance. Finite fits alone do not establish edge identity.'},
        {'claim':'finite-pair short-window continuity distinguishes this proposed strip from this bright control',
         'prediction':'The fixed bright-organic control will not exhibit finite positive pairs at42 in all5 short windows.',
         'falsifier':'All5 finite bright-control short pairs at42 falsify this finite-pair-continuity specificity expectation on this control; any other pattern remains a bounded descriptive comparison, never semantic acceptance.'},
        {'claim':'bank and profile boundary diagnostics',
         'prediction':'No guaranteed ranking, calibrated width, score threshold or fit-boundary safety is predicted.',
         'falsifier':'Retain every34/42/50 row including nulls and weak/boundary fits.50 plus a lateral shift can approach/exceed the fixed normal extent; never widen profiles, recenter, drop a width or substitute a successful row.'}
    ],
    'reporting':{'retain':'Both source/crop receipts, raw learner, all profiles/counts,4lanes, rails/interior/combined, every fit/null, midpoint values and differences; long-vs-short and all controls at every bank width',
        'semanticIdentity':'UNKNOWN','calibratedWidth':'UNKNOWN','promoted':False,
        'antiSelection':'No post-freeze geometry/ROI/training/bank/window/heading/mask/settings changes, widening, recentering, hidden rerun or parameter tuning. Support refusal remains NOT_EXECUTED; any amended experiment is separate new authorization/freeze.',
        'exposure':'Historical Lenard zoom images may have been exposed. This selection and protocol are fresh/unexecuted, not authenticated heldout or blind evaluation.',
        'independence':'One screenshot, overlapping profiles, shared training and crop/source controls do not provide independent scientific cases.'},
    'supportEvidence':support_art,'inspectionEvidence':inspection_art,'sampleLatticeEvidence':lattice_art,
    'cvMeasurementsExecuted':0,'adapterPreparationCalls':0,'compositionCalls':0,
}
protocol_art=write('protocol.json',protocol)
pre_art=write('premeasurement-hash-record.json',{
    'schema':'E802-premeasurement-freeze@1','job_id':'E802','worker':'P2',
    'createdAtUtc':datetime.now(timezone.utc).isoformat(),'cvMeasurementsExecuted':0,
    'protocol':protocol_art,'sourceIntegrity':{'path':str(HERE/'source-integrity.json'),'sha256':sha(HERE/'source-integrity.json')},
    'sourcePng':{'path':source['sourcePngPath'],'sha256':source['pngSha256'],'gitBlob':source['gitBlob']},
    'fullRgbaSha256':source['fullRgbaSha256'],'supportEvidence':support_art,'inspectionEvidence':inspection_art,'sampleLatticeEvidence':lattice_art,
    'disclosure':'Geometry disclosed only in P2 artifacts for root freeze/release; no message to P6/source owner.'})
artifacts=[]
for path in sorted(HERE.iterdir()):
    if path.is_file() and path.name!='result.json':
        artifacts.append({'path':str(path),'sha256':sha(path),'bytes':path.stat().st_size})
write('result.json',{
    'job_id':'E802','worker':'P2','outcome':'insufficient_evidence',
    'summary':'Source geometry, matched controls and falsifiers frozen before any CV. This premeasurement job has no evidence to confirm longitudinal paired edges; semantic identity/calibrated width remain UNKNOWN. Exact accepted adapter and recipe references verified unchanged.',
    'completedTask':'predeclare_protocol_only','protocol':protocol_art,'premeasurementRecord':pre_art,
    'sourcePngPath':source['sourcePngPath'],'cvMeasurementsExecuted':0,'sourceOrRepoChanges':False,
    'semanticIdentity':'UNKNOWN','calibratedWidth':'UNKNOWN','promoted':False,
    'artifactHashes':artifacts,
})
print(json.dumps({'protocol':protocol_art,'premeasurementRecord':pre_art,'resultSha256':sha(HERE/'result.json'),'cvMeasurementsExecuted':0},indent=2))
