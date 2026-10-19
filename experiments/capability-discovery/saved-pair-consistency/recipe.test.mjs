import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRow,runSavedPairAudit} from './recipe.mjs';

// Would fail if the adapter shifted IDs, used a neighboring pair, or evaluated
// unrelated disabled fields. No E3012 read and no geometry call in these tests.
function fixture(index=0) {
  const group=index===2?'lateral-plus6':'proposed-ribbon';
  const frame='Lenard-1.E802.fixed-roi-source-pixel-centers';
  const slots=Array.from({length:5},(_,i)=>{
    const missing=index===2&&i===0;
    return {id:`${group}.short${i+1}`,state:missing?'UNKNOWN':'OBSERVED',reason:missing?'fixture missing':null,
      originPx:[i*10,0],midpointPx:missing?null:[i*10,2],leftPx:missing?null:[i*10,-18],rightPx:missing?null:[i*10,22],
      rawCandidate:{widthArgPx:42,edgeFit:missing?null:{lPx:-18,rPx:22,cPx:2,wPx:40,score:1,gl:1,gr:1},
        midpoint:missing?{status:'UNKNOWN',reason:'fixture missing'}:{status:'OBSERVED_CHANNELS',fitMidpointNormalOffsetPx:2,candidateCenterMinusFitMidpointPx:-2,candidateCenterMinusFitMidpointInNominalWidths:-2/42,denominator:'fixture nominal42',referent:'fixture fitted pair'}}};
  });
  return {id:`composition/${group}/w42`,branch:'composition',frame,group,widthPx:42,
    rawStations:slots.map(s=>({id:s.id,frame,pose:{xPx:s.originPx[0],yPx:s.originPx[1],headingRad:0},candidates:[structuredClone(s.rawCandidate)]})),
    midpoint:{slots,runs:[],isolatedIds:[],completeFive:index!==2,error:null}};
}
test('disabled entry ignores unrelated getter before byte/source inspection',async()=>{
  assert.deepEqual(await runSavedPairAudit({enabled:false,get measurementBytes(){throw Error('must not read');}}),{status:'DISABLED'});
});
test('wrong station association is refused by actual row adapter',()=>{
  const row=fixture();row.midpoint.slots[1].id='bright-organic.short2';
  assert.throws(()=>prepareRow(row,0),/slot identity/);
});
test('UNKNOWN adapter slot is literal null, retaining all five origins and neighbors',()=>{
  const row=fixture(2),out=prepareRow(row,2);
  assert.equal(out.args.pairedEdges.values[0],null);
  assert.equal(out.args.points.length,5);
  assert.deepEqual(out.args.pairedEdges.values[1],{left:row.midpoint.slots[1].leftPx,right:row.midpoint.slots[1].rightPx});
  assert.equal(out.projection.slots[0].state,'UNKNOWN');
  assert.equal(out.projection.slots[0].reason,'fixture missing');
  assert.equal(Object.hasOwn(out.args,'width'),false);
});
test('wrong bytes are refused with zero calls before geometry import',async()=>{
  const out=await runSavedPairAudit({schema:'saved-pair-consistency-request@1',enabled:true,runId:'fixture',measurementBytes:new Uint8Array(2)});
  assert.equal(out.status,'REFUSED');assert.equal(out.counts.attempted,0);
});
