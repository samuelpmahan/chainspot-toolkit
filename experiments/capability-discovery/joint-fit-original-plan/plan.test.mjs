// Tests authored before implementation. UNEXECUTED: no observed RED/GREEN.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, symlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import * as codec from '../station-evidence/codec.mjs';
import { fixedSlots, classifyFit, selectWire, bindPlan } from './plan-core.mjs';
import { buildOriginalEvidencePlan, readBoundedFile } from './original-evidence-plan.mjs';

const hash = b => createHash('sha256').update(b).digest('hex');
const wire = value => codec.encodeValue(value);
const bytes = value => codec.encodeBytes(value);
const fitUnit = 'px (l, r, c, w: lateral offsets); score, gl, gr: lum/px';
const contrastUnit = 'lum per station (inside band minus outside band), per side';
const pair = cPx => ({ value:{lPx:-17,rPx:17,cPx,wPx:34,score:1,gl:1,gr:1},unit:fitUnit,emits:{computed:1} });
const contrast = N => ({value:{leftLum:Array(N).fill(NaN),rightLum:Array(N).fill(-0),okLeft:Array(N).fill(0),okRight:Array(N).fill(1),stationsCount:N},unit:contrastUnit,emits:{computed:1}});
const pins = {
  protocolSha256:'cb4d757f36ffe6721e71541d6093a48cc11e081bd10c1684746aad8249973829',
  attestationSha256:'9f1cb90eed3c74214c9a03029730ea1ab487c48bd86b89cbe3a701eebe923ef1',
  rgbaSha256:'4379abb30a5b0907aa0e1435b13e19eafe8fdd31ac57c9b8bdff4495a14fdc2a',
  pngSha256:'30fa01879840deb0584ffe001fa39779998710010faeae93510dbc7a8a0abe6e',
  maskSha256:'305285b7e2bc9d44dfd572caa8d39030ed1b0c2254c15967fbb9b7bff7fae609'
};

// Fabricated wire evidence only. It never reads original evidence/pixels.
function fixture() {
  const slots = fixedSlots(), plannedQueries = Array(160).fill(null), queryTrace = Array(160).fill(null);
  const callbacks = [], answerFragments = [], callbackFragments = [], comparisons = [], snapshots = [];
  const sourceEntries = [{path:'experiments/mock-source.mjs',expectedSha256:'a'.repeat(64),actualSha256:'a'.repeat(64),error:null}];
  for (let c=0;c<16;c++) {
    const s=slots[3*c], groupId=s.comparisonId.split('/')[0], windowId=s.comparisonId.split('/')[1];
    comparisons.push({id:s.comparisonId,groupId,windowId,imageId:'Lenard-5',frame:'Lenard-5.original-source-pixel-centers',widthPx:1290,heightPx:2796,rgbaSha256:pins.rgbaSha256,mask:c<12?null:{kind:'Uint8Array',bytes:3606840,sha256:pins.maskSha256},originPx:s.originalOriginPx,phiRad:-0.20539538918976738,t0Px:s.t0Px,t1Px:s.t1Px,stepPx:1,widthsPx:[34,42,50]});
    const privateHashes=()=>({rgbaSha256:pins.rgbaSha256,maskSha256:c<12?null:pins.maskSha256});
    snapshots.push({comparisonId:s.comparisonId,snapshotId:`lenard5-fixed16/${c}/${s.comparisonId}`,pre:privateHashes(),
      checks:Array.from({length:10},(_,k)=>({planIndex:10*c+k,post:privateHashes(),verified:true})),
      post:privateHashes(),verified:true,partKeys:{'px.image.cropped':'b'.repeat(64),'tk.s6.pathMask':'c'.repeat(64)},error:null});
    for(let captureIndex=0;captureIndex<11;captureIndex++) {
      const seq=captureIndex===0?1:captureIndex===1?0:captureIndex;
      const localPlan=seq===0?0:seq-1;
      const calculation=captureIndex===0?'fn.input.lenard5StationMeasurement':localPlan===0?'fn.q.path.profile':`fn.q.path.${(localPlan-1)%3===0?'edgePair':(localPlan-1)%3===1?'stationContrast':'loss'}`;
      const nativeEntry={seq,parent:captureIndex===0?0:null,depth:captureIndex===0?1:0,calculation,store:s.comparisonId,caller:captureIndex===0?'lazy:px.image.cropped':'cycle06-lenard5-station-measurement',site:null,inParts:[],outParts:captureIndex===0?['px.image.cropped','tk.s6.pathMask']:[],elapsedMs:1,status:'ok',error:null,emits:captureIndex===0?null:{computed:1},key:null,cached:false,computedMs:null};
      const value={comparisonId:s.comparisonId,captureIndex,nativeEntry}, body=bytes(value);
      const metadata={path:`fragments/calculation-${11*c+captureIndex}.json`,bytes:body.length,sha256:hash(body),kind:'calculation',comparisonId:s.comparisonId,captureIndex};
      callbacks.push(value); callbackFragments.push({metadata,bytes:body});
    }
  }
  for(const s of slots) for(const role of ['fit','control']) {
    const planIndex=role==='fit'?10*s.c+1+3*s.b:10*s.c+2+3*s.b;
    const rawArgs={raster:'px.image.cropped',mask:'tk.s6.pathMask',originPx:[...s.originalOriginPx],phiRad:-0.20539538918976738,t0Px:s.t0Px,t1Px:s.t1Px,stepPx:1};
    if(role==='fit') Object.assign(rawArgs,{lat0Px:0,widthPx:s.nominalBankPx,tolPx:2,latLimPx:12,minOk:{count:8,ofStations:0.2}});
    else Object.assign(rawArgs,{widthPx:s.nominalBankPx,bandPx:[1,3],alongPx:2});
    const nativeAnswer=role==='fit'?pair(-0):contrast(s.t1Px-s.t0Px),body=bytes(nativeAnswer);
    plannedQueries[planIndex]={planIndex,comparisonId:s.comparisonId,groupId:s.comparisonId.split('/')[0],windowId:s.comparisonId.split('/')[1],widthPx:s.nominalBankPx,query:`fn.q.path.${role==='fit'?'edgePair':'stationContrast'}`,rawArgs};
    queryTrace[planIndex]={planIndex,comparisonId:s.comparisonId,state:'COMPLETED',resolvedIdentity:{snapshotId:`lenard5-fixed16/${s.c}/${s.comparisonId}`,comparisonId:s.comparisonId,frame:'Lenard-5.original-source-pixel-centers',widthPx:1290,heightPx:2796,rgbaSha256:pins.rgbaSha256,maskKind:s.c<12?null:'Uint8Array',maskSha256:s.c<12?null:pins.maskSha256,partKeys:{'px.image.cropped':'b'.repeat(64),'tk.s6.pathMask':'c'.repeat(64)}},nativeAnswer,error:null};
    answerFragments.push({metadata:{path:`fragments/answer-${planIndex}.json`,bytes:body.length,sha256:hash(body),kind:'answer',comparisonId:s.comparisonId,planIndex},bytes:body});
  }
  const trace={schema:'cycle06-lenard5-trace@1',protocolId:'lenard5-fixed16',protocolSha256:pins.protocolSha256,status:'COMPLETED',error:null,
    requestBinding:{schema:'cycle06-lenard5-request-binding@1',protocolId:'lenard5-fixed16',protocolSha256:pins.protocolSha256,attestationSha256:pins.attestationSha256,comparisons,
      sourceOriginal:{ref:'49255331791b1245cf0f9cd699816175f94e70f2',path:'specimens/dev/Lenard-5.png',gitBlob:'78a4345489a5544640859127cd79f5a06bf9f21b',frame:'Lenard-5.original-source-pixel-centers'},
      encodedFileVerification:{sha256:pins.pngSha256},rawStageVerification:{sha256:pins.rgbaSha256},maskPolicy:{maskSha256:pins.maskSha256}},
    sourceBinding:{beforeImport:{verified:true,entries:sourceEntries},afterImport:{verified:true,entries:sourceEntries},afterRun:{verified:true,entries:sourceEntries}},plannedQueries,queryTrace,
    inputIntegrity:{suppliedPlanes:{pre:{rgbaSha256:pins.rgbaSha256,maskSha256:pins.maskSha256},post:{rgbaSha256:pins.rgbaSha256,maskSha256:pins.maskSha256},verified:true},snapshots,
      postFiles:[['disk-manifest','4ae5f021bc3c9be8184cdb0627abdacabae9d7c8dcff88a12b404762843bbe9f'],['protocol',pins.protocolSha256],['input-attestation',pins.attestationSha256],['png',pins.pngSha256],['rgba',pins.rgbaSha256],['mask',pins.maskSha256]].map(([role,digest])=>({role,path:`/fabricated/${role}`,expectedSha256:digest,actualSha256:digest,verified:true,error:null})),
      request:{verified:true,error:null},postErrors:[]}};
  return {trace,sidecar:{schema:'cycle06-lenard5-sidecar@1',protocolId:'lenard5-fixed16',status:'COMPLETED',error:null,calculationLog:callbacks},answerFragments,callbackFragments,sourceHashes:{'experiments/mock-source.mjs':'a'.repeat(64)}};
}
function bind(f) { return bindPlan({traceWire:wire(f.trace),sidecarWire:wire(f.sidecar),answerFragments:f.answerFragments,callbackFragments:f.callbackFragments,sourceHashes:f.sourceHashes},codec); }

// Break caught: disabled entry reading source/evidence or evaluating getters.
test('disabled returns before any request getter or file I/O',async()=>{
  const r=await buildOriginalEvidencePlan({get token(){throw Error('getter ran');}});
  assert.equal(r.status,'DISABLED'); assert.equal(r.plan,null);
  await assert.rejects(buildOriginalEvidencePlan({get enabled(){throw Error('getter ran');}}),/own boolean/);
});
test('closed request refuses arbitrary geometry/root/caps before evidence reads',async()=>{
  await assert.rejects(buildOriginalEvidencePlan({schema:'cycle07-original-evidence-plan-request@1',enabled:true,token:'wrong'}),/request token/);
  await assert.rejects(buildOriginalEvidencePlan({schema:'cycle07-original-evidence-plan-request@1',enabled:true,token:'cycle07-E2006-original-evidence-plan-v1',originPx:[0,0]}),/fields/);
});
test('fixed48 order and original indices have independent boundary assertions',()=>{
  const s=fixedSlots(); assert.equal(s.length,48);
  assert.deepEqual([s[0].j,s[0].c,s[0].b,s[0].comparisonId,s[0].fitIndex,s[0].controlIndex],[0,0,0,'primary/before16',1,2]);
  assert.deepEqual([s[47].j,s[47].c,s[47].b,s[47].comparisonId,s[47].fitIndex,s[47].controlIndex],[47,15,2,'masked-primary/long48',157,158]);
  s[0].originalOriginPx[0]=0;assert.equal(fixedSlots()[0].originalOriginPx[0],780);
});
test('refined values outside nominal tolerance/latLim remain eligible; no score cutoff',()=>{
  const a=pair(12.125);Object.assign(a.value,{wPx:36.25,score:-1,gl:-2,gr:-3});
  const r=classifyFit(a,fixedSlots()[0]);assert.equal(r.eligibility,'ELIGIBLE');
  assert.equal(r.rawArgs.widthPx,36.25);
  assert.deepEqual(r.rawArgs.originPx,[780-12.125*Math.sin(-0.20539538918976738),906+12.125*Math.cos(-0.20539538918976738)]);
  assert.deepEqual(Object.keys(r.rawArgs),['raster','mask','originPx','phiRad','t0Px','t1Px','stepPx','widthPx','bandPx','alongPx']);
});
test('exact no pair skips while null/type/no-raster are fatal',()=>{
  assert.equal(classifyFit({value:{condition:'no edge pair'},unit:fitUnit,emits:{computed:1}},fixedSlots()[0]).reason,'NATIVE_NO_EDGE_PAIR');
  for(const value of [null,{...pair(0).value,cPx:null},{condition:'other'}]) assert.throws(()=>classifyFit({value,unit:fitUnit,emits:{computed:1}},fixedSlots()[0]),/INTEGRITY/);
  assert.throws(()=>classifyFit({value:{schema:'nctk-s6-path@1',condition:'no raster'},unit:'condition',emits:{computed:1}},fixedSlots()[0]),/INTEGRITY/);
});
test('numeric nonfinite/nonpositive width skips without normalization',()=>{
  for(const v of [NaN,Infinity,-Infinity]) {const a=pair(0);a.value.gl=v;assert.equal(classifyFit(a,fixedSlots()[0]).reason,'NUMERIC_UNUSABLE');}
  for(const v of [-0,0,-1]) {const a=pair(0);a.value.wPx=v;assert.equal(classifyFit(a,fixedSlots()[0]).eligibility,'NOT_EXECUTED');}
  const a=pair(-0);assert.ok(Object.is(a.value.cPx,-0));assert.equal(classifyFit(a,fixedSlots()[0]).eligibility,'ELIGIBLE');
});
test('targeted wire selection rejects duplicate/null-prototype/missing fields',()=>{
  assert.deepEqual(selectWire(wire({a:1}),['a']),wire(1));
  assert.throws(()=>selectWire(['object','plain',[['a',wire(1)],['a',wire(2)]]],['a']),/INTEGRITY/);
  assert.throws(()=>selectWire(['object','null-prototype',[]],['a']),/INTEGRITY/);
});
test('fabricated full binding returns detached48 with raw NaN/-0 and zero execution',()=>{
  const f=fixture(),plan=bind(f);assert.equal(plan.slots.length,48);assert.equal(plan.actualNewPATH,0);
  assert.ok(Object.is(plan.slots[0].rawFit.value.cPx,-0));assert.ok(Number.isNaN(plan.slots[0].rawControl.value.leftLum[0]));
  assert.ok(Object.is(plan.slots[0].rawControl.value.rightLum[0],-0));
  assert.equal(plan.slots[0].original.fit.callback.nativeEntry.seq,2);
  assert.equal(plan.slots[0].original.fit.callback.nativeEntry.error,null);
  assert.equal(Object.hasOwn(plan.slots[0].original.fit.callback.nativeEntry,'args'),false);
  assert.equal(plan.slots[0].state,'NOT_ATTEMPTED');
  f.trace.queryTrace[1].nativeAnswer.value.cPx=99;assert.ok(Object.is(plan.slots[0].rawFit.value.cPx,-0));
});
test('plan row needs no invented state/error; queryTrace error is mandatory',()=>{
  const f=fixture();assert.equal(Object.hasOwn(f.trace.plannedQueries[1],'error'),false);assert.equal(bind(f).slots.length,48);
  delete f.trace.queryTrace[1].error;assert.throws(()=>bind(f),/INTEGRITY/);
});
test('answer tagged representation must equal independently hashed fragment',()=>{
  const f=fixture();f.trace.queryTrace[1].nativeAnswer.value.cPx=1;assert.throws(()=>bind(f),/answer wire/);
});
test('callback comparison/calculation/capture/seq/caller/site and sidecar join are enforced',()=>{
  for(const [field,value] of [['seq',99],['caller','wrong'],['site','wrong'],['calculation','fn.q.path.loss']]) {
    const f=fixture(),v=f.sidecar.calculationLog[2];v.nativeEntry[field]=value;
    const body=bytes(v);f.callbackFragments[2]={metadata:{...f.callbackFragments[2].metadata,bytes:body.length,sha256:hash(body)},bytes:body};
    assert.throws(()=>bind(f),/INTEGRITY/);
  }
  const f=fixture();f.sidecar.calculationLog[2].nativeEntry.elapsedMs=2;assert.throws(()=>bind(f),/callback wire/);
});
test('control flags remain native numeric and null luminance is refused',()=>{
  const f=fixture(),a=contrast(16);a.value.leftLum[0]=null;
  f.trace.queryTrace[2].nativeAnswer=a;const body=bytes(a);f.answerFragments[1]={metadata:{...f.answerFragments[1].metadata,bytes:body.length,sha256:hash(body)},bytes:body};
  assert.throws(()=>bind(f),/INTEGRITY/);
});
test('skips retain all controls and no callback args are fabricated',()=>{
  const f=fixture(),answer={value:{condition:'no edge pair'},unit:fitUnit,emits:{computed:1}},body=bytes(answer);
  f.trace.queryTrace[1].nativeAnswer=answer;f.answerFragments[0]={metadata:{...f.answerFragments[0].metadata,bytes:body.length,sha256:hash(body)},bytes:body};
  const p=bind(f);assert.equal(p.slots.length,48);assert.equal(p.slots[0].reason,'NATIVE_NO_EDGE_PAIR');assert.equal(p.slots[0].derivedRawArgs,null);assert.equal(p.slots[0].rawControl.value.stationsCount,16);
});
test('missing source/error/callback fields are integrity stops, not normalization',()=>{
  const f=fixture();delete f.sidecar.error;assert.throws(()=>bind(f),/INTEGRITY/);
  const g=fixture();g.trace.sourceBinding.afterRun.entries[0].actualSha256='0'.repeat(64);assert.throws(()=>bind(g),/INTEGRITY/);
  const h=fixture(),v=h.sidecar.calculationLog[2];v.nativeEntry.rawArgs={};const body=bytes(v);h.callbackFragments[2]={metadata:{...h.callbackFragments[2].metadata,bytes:body.length,sha256:hash(body)},bytes:body};assert.throws(()=>bind(h),/INTEGRITY/);
});
test('per-slot resolved snapshot frame/hash/keys cannot be replaced by comparison name alone',()=>{
  for(const [field,value] of [['frame','display'],['rgbaSha256','0'.repeat(64)],['snapshotId','old']]){
    const f=fixture();f.trace.queryTrace[1].resolvedIdentity[field]=value;assert.throws(()=>bind(f),/INTEGRITY/);
  }
  const f=fixture();f.trace.queryTrace[2].resolvedIdentity.partKeys['px.image.cropped']='d'.repeat(64);assert.throws(()=>bind(f),/INTEGRITY/);
});
test('bounded descriptor read checks hash/size, refuses symlink and cap',()=>{
  const d=mkdtempSync(join(tmpdir(),'e2006-fixture-')),p=join(d,'source.txt');writeFileSync(p,'abc');
  assert.equal(readBoundedFile(p,3,hash(Buffer.from('abc')),3).length,3);
  assert.throws(()=>readBoundedFile(p,2,null,2));assert.throws(()=>readBoundedFile(p,3,'0'.repeat(64),3));
  const link=join(d,'link.txt');symlinkSync(p,link);assert.throws(()=>readBoundedFile(link,3,null,3));
});

// E2010 PHASE1: regressions below are authored before semantic fixes or any test run.
// Broken behavior to expose: current control accepts Infinity and bindPlan ignores inputIntegrity.
function replaceAnswer(f,planIndex,answer) {
  f.trace.queryTrace[planIndex].nativeAnswer=answer;
  const i=f.answerFragments.findIndex(x=>x.metadata.planIndex===planIndex),body=bytes(answer);
  assert.ok(i>=0,'fabricated selected answer exists');
  f.answerFragments[i]={metadata:{...f.answerFragments[i].metadata,bytes:body.length,sha256:hash(body)},bytes:body};
}
function expectIntegrityStop(f) {
  assert.throws(()=>bind(f),error=>error instanceof Error&&/INTEGRITY_(?:STOP|HOLD)/.test(error.message),'bad integrity witness must not return READY');
}

test('source-shaped fixture has16 snapshots10 checks and keeps canonical mask separate from private null',()=>{
  const f=fixture();assert.equal(f.trace.inputIntegrity.snapshots.length,16);
  for(let c=0;c<16;c++) {
    const snapshot=f.trace.inputIntegrity.snapshots[c];assert.equal(snapshot.checks.length,10);
    assert.deepEqual(Object.keys(snapshot),['comparisonId','snapshotId','pre','checks','post','verified','partKeys','error']);
    for(let k=0;k<10;k++)assert.deepEqual(snapshot.checks[k],{planIndex:10*c+k,post:{rgbaSha256:pins.rgbaSha256,maskSha256:c<12?null:pins.maskSha256},verified:true});
    assert.equal(Object.hasOwn(snapshot.checks[0],'error'),false);
  }
  assert.equal(f.trace.inputIntegrity.suppliedPlanes.pre.maskSha256,pins.maskSha256);
  assert.equal(f.trace.inputIntegrity.snapshots[0].pre.maskSha256,null);
});

for(const skip of ['eligible','no-pair','numeric-unusable'])for(const side of ['leftLum','rightLum'])for(const rawValue of [Infinity,-Infinity]) {
  test(`contrast ${rawValue} ${side} with ${skip} fit retains located HOLD and never READY`,()=>{
    const f=fixture(),j=0,stationIndex=3,planIndex=2;
    if(skip==='no-pair')replaceAnswer(f,1,{value:{condition:'no edge pair'},unit:fitUnit,emits:{computed:1}});
    if(skip==='numeric-unusable'){const a=pair(-0);a.value.gl=NaN;replaceAnswer(f,1,a);}
    const answer=contrast(16);answer.value[side][stationIndex]=rawValue;replaceAnswer(f,planIndex,answer);
    const expectedBinding=f.answerFragments.find(x=>x.metadata.planIndex===planIndex).metadata;
    assert.throws(()=>bind(f),error=>{
      assert.equal(error.code,'INTEGRITY_HOLD');assert.match(error.message,/INTEGRITY_HOLD/);
      const hold=error.integrityHold;assert.ok(hold,'retained bounded HOLD payload');
      assert.equal(hold.code,'CONTRAST_INFINITY');assert.equal(hold.j,j);assert.equal(hold.c,0);assert.equal(hold.b,0);
      assert.equal(hold.role,'control');assert.equal(hold.side,side);assert.equal(hold.stationIndex,stationIndex);
      assert.equal(hold.planIndex,planIndex);assert.ok(Object.is(hold.rawValue,rawValue));
      assert.equal(hold.originalState,'COMPLETED');assert.equal(hold.originalCallbackStatus,'ok');
      assert.deepEqual(hold.answerBinding,expectedBinding);
      assert.deepEqual(hold.rawAnswer,answer);assert.ok(Object.is(hold.rawAnswer.value[side][stationIndex],rawValue));
      assert.equal(Object.hasOwn(error,'plan'),false,'no partial READY plan returned or attached');return true;
    },'source-impossible original contrast must stop even when fit would skip');
  });
}

test('ordinary NaN finite-invalid -0 controls remain retained and fit Infinity still skips',()=>{
  const f=fixture(),a=pair(-0);a.value.gl=Infinity;replaceAnswer(f,1,a);
  const p=bind(f);assert.equal(p.slots[0].eligibility,'NOT_EXECUTED');assert.equal(p.slots[0].reason,'NUMERIC_UNUSABLE');
  assert.ok(Number.isNaN(p.slots[0].rawControl.value.leftLum[0]));assert.equal(p.slots[0].rawControl.value.okLeft[0],0);
  assert.ok(Object.is(p.slots[0].rawControl.value.rightLum[0],-0));
});

test('successful plan retains bounded fixed16x10 input-integrity acceptance witness',()=>{
  const f=fixture(),p=bind(f),w=p.inputIntegrityWitness;
  assert.ok(w,'new bounded witness is inspectable');assert.equal(w.strategy,'fixed16x10');
  assert.deepEqual(w.snapshots,f.trace.inputIntegrity.snapshots);
  assert.deepEqual(w.suppliedPlanes,f.trace.inputIntegrity.suppliedPlanes);
  assert.deepEqual(w.request,{verified:true,error:null});assert.deepEqual(w.postErrors,[]);
  assert.equal(Object.hasOwn(w.snapshots[0].checks[0],'error'),false);
});

const invalidIntegrityCases=[
  ['missing inputIntegrity',f=>{delete f.trace.inputIntegrity;}],
  ['missing snapshots',f=>{delete f.trace.inputIntegrity.snapshots;}],
  ['snapshot count15',f=>{f.trace.inputIntegrity.snapshots.pop();}],
  ['wrong comparison c',f=>{f.trace.inputIntegrity.snapshots[0].comparisonId='primary/core16';}],
  ['wrong snapshotId',f=>{f.trace.inputIntegrity.snapshots[0].snapshotId='historical';}],
  ['missing snapshot pre',f=>{delete f.trace.inputIntegrity.snapshots[0].pre;}],
  ['private pre RGBA substituted',f=>{f.trace.inputIntegrity.snapshots[0].pre.rgbaSha256='0'.repeat(64);}],
  ['private post RGBA substituted',f=>{f.trace.inputIntegrity.snapshots[0].post.rgbaSha256='0'.repeat(64);}],
  ['private pre and post jointly substituted',f=>{f.trace.inputIntegrity.snapshots[0].pre.rgbaSha256='0'.repeat(64);f.trace.inputIntegrity.snapshots[0].post.rgbaSha256='0'.repeat(64);}],
  ['private null mask replaced by mask hash',f=>{f.trace.inputIntegrity.snapshots[0].pre.maskSha256=pins.maskSha256;}],
  ['private explicit mask replaced by null',f=>{f.trace.inputIntegrity.snapshots[12].post.maskSha256=null;}],
  ['missing selected check',f=>{f.trace.inputIntegrity.snapshots[0].checks.splice(1,1);}],
  ['wrong selected check planIndex',f=>{f.trace.inputIntegrity.snapshots[0].checks[1].planIndex=2;}],
  ['selected fit check verified false',f=>{f.trace.inputIntegrity.snapshots[0].checks[1].verified=false;}],
  ['selected control check verified false',f=>{f.trace.inputIntegrity.snapshots[0].checks[2].verified=false;}],
  ['selected check missing verified',f=>{delete f.trace.inputIntegrity.snapshots[0].checks[1].verified;}],
  ['selected check wrong post RGBA',f=>{f.trace.inputIntegrity.snapshots[0].checks[1].post.rgbaSha256='0'.repeat(64);}],
  ['masked selected check null mask',f=>{f.trace.inputIntegrity.snapshots[12].checks[1].post.maskSha256=null;}],
  ['illegal invented selected check error null',f=>{f.trace.inputIntegrity.snapshots[0].checks[1].error=null;}],
  ['unselected check invalid under whole10 strategy',f=>{f.trace.inputIntegrity.snapshots[0].checks[3].verified=false;}],
  ['outer snapshot verified false',f=>{f.trace.inputIntegrity.snapshots[0].verified=false;}],
  ['outer snapshot missing error',f=>{delete f.trace.inputIntegrity.snapshots[0].error;}],
  ['outer snapshot error retained',f=>{f.trace.inputIntegrity.snapshots[0].error={code:'SNAPSHOT_HASH_MISMATCH',message:'fabricated'};}],
  ['outer snapshot Part key mismatch',f=>{f.trace.inputIntegrity.snapshots[0].partKeys['px.image.cropped']='d'.repeat(64);}],
  ['global postErrors nonempty',f=>{f.trace.inputIntegrity.postErrors.push({code:'POST_INPUT_MUTATION',message:'fabricated'});}],
  ['global postErrors missing',f=>{delete f.trace.inputIntegrity.postErrors;}],
  ['canonical suppliedPlanes missing',f=>{delete f.trace.inputIntegrity.suppliedPlanes;}],
  ['canonical suppliedPlanes verified false',f=>{f.trace.inputIntegrity.suppliedPlanes.verified=false;}],
  ['canonical suppliedPlanes pre RGBA wrong',f=>{f.trace.inputIntegrity.suppliedPlanes.pre.rgbaSha256='0'.repeat(64);}],
  ['canonical suppliedPlanes post mask null',f=>{f.trace.inputIntegrity.suppliedPlanes.post.maskSha256=null;}],
  ['canonical suppliedPlanes missing post',f=>{delete f.trace.inputIntegrity.suppliedPlanes.post;}],
  ['global request missing',f=>{delete f.trace.inputIntegrity.request;}],
  ['global request verified false',f=>{f.trace.inputIntegrity.request.verified=false;}],
  ['global request missing error',f=>{delete f.trace.inputIntegrity.request.error;}],
  ['global request error retained',f=>{f.trace.inputIntegrity.request.error={code:'POST_REQUEST_MUTATION'};}],
  ['global request extra refusal field',f=>{f.trace.inputIntegrity.request.refusal=null;}]
];
for(const [name,mutate]of invalidIntegrityCases)test(`input-integrity rejects ${name} without normalization or READY`,()=>{
  const f=fixture();mutate(f);expectIntegrityStop(f);
});

test('native answer record key reordering remains grammar-valid when tagged representations agree',()=>{
  const f=fixture(),a=pair(-0),v=a.value;
  replaceAnswer(f,1,{emits:{computed:1},unit:a.unit,value:{gr:v.gr,gl:v.gl,score:v.score,wPx:v.wPx,cPx:v.cPx,rPx:v.rPx,lPx:v.lPx}});
  assert.equal(bind(f).slots[0].eligibility,'ELIGIBLE');
});
test('queryTrace native record key SET is accepted independently from rawArgs insertion order',()=>{
  const f=fixture(),r=f.trace.queryTrace[1];
  f.trace.queryTrace[1]={error:r.error,nativeAnswer:r.nativeAnswer,resolvedIdentity:r.resolvedIdentity,state:r.state,comparisonId:r.comparisonId,planIndex:r.planIndex};
  assert.equal(bind(f).slots[0].eligibility,'ELIGIBLE');
});
test('planned query native record key SET is accepted but rawArgs key order is not weakened',()=>{
  const f=fixture(),r=f.trace.plannedQueries[1];
  f.trace.plannedQueries[1]={rawArgs:r.rawArgs,query:r.query,widthPx:r.widthPx,windowId:r.windowId,groupId:r.groupId,comparisonId:r.comparisonId,planIndex:r.planIndex};
  assert.equal(bind(f).slots[0].eligibility,'ELIGIBLE');
});
test('rawArgs reordering is refused even though the same scalar values are present',()=>{
  const f=fixture(),a=f.trace.plannedQueries[1].rawArgs;
  f.trace.plannedQueries[1].rawArgs={mask:a.mask,raster:a.raster,originPx:a.originPx,phiRad:a.phiRad,t0Px:a.t0Px,t1Px:a.t1Px,stepPx:a.stepPx,lat0Px:a.lat0Px,widthPx:a.widthPx,tolPx:a.tolPx,latLimPx:a.latLimPx,minOk:a.minOk};
  expectIntegrityStop(f);
});
test('descriptor refuses ancestor symlink independently from leaf symlink',()=>{
  const d=mkdtempSync(join(tmpdir(),'e2010-ancestor-')),real=join(d,'real'),alias=join(d,'alias');
  mkdirSync(real);writeFileSync(join(real,'source.txt'),'abc');symlinkSync(real,alias,'dir');
  assert.throws(()=>readBoundedFile(join(alias,'source.txt'),3,hash(Buffer.from('abc')),3),/symlink/);
});
test('descriptor refuses exactBytes above maxBytes before any path walk or file allocation',()=>{
  assert.throws(()=>readBoundedFile('/this-test-path-must-not-be-read',3,null,2),/file size\/cap/);
});
