import test from 'node:test';
import assert from 'node:assert/strict';
import { trainingInput } from './training-fixtures.mjs';
let run;
try { ({runComposition:run}=await import('./recipe.mjs')); } catch(error) { if(error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
function call(input) { assert.equal(typeof run,'function','composition entry point must exist'); return run(input); }
const at30 = r => r.stations[0].candidates.find(c=>c.widthArgPx===30);
test('default OFF executes no operations',()=> {const r=call({});assert.equal(r.status,'DISABLED');assert.deepEqual(r.operationsExecuted,[]);});
test('real positive exposes raw channels and fitted two-edge midpoint without calibration',()=> {
  const input=trainingInput(), bytes=Uint8Array.from(input.image.data),r=call(input),c=at30(r);
  assert.equal(r.status,'OBSERVED_CHANNELS');assert.equal(c.observation.railMode,'paired');assert.equal(c.observation.score,1);
  assert.equal(c.edgeFit.wPx,29);assert.equal(c.midpoint.candidateCenterMinusFitMidpointPx,0);
  assert.equal(r.localWidth.status,'UNKNOWN');assert.equal(r.localWidth.widthPx,null);assert.equal(r.promoted,false);assert.equal(r.semanticIdentity.status,'UNKNOWN');
  assert.deepEqual(input.image.data,bytes);assert.equal(r.inputProvenance.rgbaSha256,input.provenance.rgbaSha256);
});
test('shifted station retains fixed-center zero plus real signed midpoint',()=> {
  const input=trainingInput();input.stations[0].yPx=83.25;const c=at30(call(input));
  assert.equal(c.observation.score,0);assert.equal(c.edgeFit.cPx,-3.25);assert.equal(c.midpoint.candidateCenterMinusFitMidpointPx,3.25);
});
test('interior-only score1 remains UNKNOWN bilateral evidence',()=> {
  const input=trainingInput({broad:true}); input.occluders.boxes=[{bboxX:60,bboxY:54,bboxW:40,bboxH:12},{bboxX:60,bboxY:94,bboxW:40,bboxH:12}];
  const c=call(input).stations[0].candidates.find(c=>c.widthArgPx===40);
  assert.equal(c.observation.score,1);assert.equal(c.observation.railScore,null);assert.equal(c.pairedRails.status,'UNKNOWN');
});
test('all-hidden numeric learner return is raw only and no fitted midpoint',()=> {
  const input=trainingInput();input.occluders.boxes=[{bboxX:0,bboxY:0,bboxW:160,bboxH:160}];const r=call(input);
  assert.equal(r.status,'UNKNOWN');assert.equal(r.rawWidthEstimate.widthPx,24);assert.ok(r.rawWidthEstimate.scores.every(s=>s.visibleSamples===0&&s.meanScore===-Infinity));
  assert.equal(r.localWidth.widthPx,null);assert.equal(at30(r).midpoint.status,'UNKNOWN');
});
test('empty training bank preserves legacy fallback40 as UNKNOWN',()=> {
  const input=trainingInput();input.training.segments=[];input.localWidthBank.valuesPx=[];const r=call(input);
  assert.equal(r.rawWidthEstimate.widthPx,40);assert.equal(r.localWidth.status,'UNKNOWN');assert.equal(r.status,'UNKNOWN');
});
test('frame, provenance and finite violations fail closed before source operations',()=> {
  const mutations=[i=>i.stations[0].frame='other',i=>i.training.frame='other',i=>i.occluders.frame='other',i=>i.localWidthBank.frame='other',i=>i.image.frame='other',i=>i.stations[0].headingRad=NaN,i=>i.training.segments[0].tee.xPx=Infinity,i=>i.localWidthBank.valuesPx=[0],i=>i.edgeSearch.latLimPx=NaN,i=>delete i.provenance,i=>i.provenance.rgbaSha256='bad',i=>i.image.data[0]=999];
  for(const mutate of mutations){const input=trainingInput();mutate(input);const r=call(input);assert.equal(r.status,'UNKNOWN');assert.deepEqual(r.operationsExecuted,[]);assert.equal(r.localWidth.widthPx,null);}
});
test('organic shape identical across exposed samples cannot acquire semantic path identity',()=> {
  const a=call(trainingInput()),b=call(trainingInput({shape:'organic'}));
  assert.deepEqual(a.rawWidthEstimate,b.rawWidthEstimate);assert.deepEqual(a.stations,b.stations);assert.equal(b.semanticIdentity.status,'UNKNOWN');assert.equal(b.promoted,false);
});
