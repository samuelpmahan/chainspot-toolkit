import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRows,runAudit} from './recipe.mjs';
import * as geometry from '../probes/path-geometry/path-geometry.mjs';
const groups=['proposed-ribbon','lateral-plus6','bright-organic'];
function fixture() {
  const branch=frame=>({frame,rawWidthEstimate:{widthPx:50},stations:groups.flatMap(group=>Array.from({length:6},(_,i)=>({
    id:`${group}.${i===5?'long':`short${i+1}`}`,frame,pose:{xPx:i*10,yPx:0,headingRad:0},
    candidates:[42,50].map(widthArgPx=>({widthArgPx,edgeFit:{lPx:-20,rPx:24,cPx:2,wPx:44,score:1,gl:1,gr:1},midpoint:{status:'OBSERVED_CHANNELS',fitMidpointNormalOffsetPx:2}}))
  })))});
  return {composition:branch('Lenard-1.E802.fixed-roi-source-pixel-centers'),sourceComposition:branch('Lenard-1.original-source-pixel-centers')};
}
test('missing stations break runs and isolated fits never create segments',()=>{
  const r=fixture();
  for(const b of [r.composition,r.sourceComposition]) for(const s of b.stations) if(s.id.startsWith('lateral-plus6.short')) {
    const i=Number(s.id.at(-1));
    for(const c of s.candidates) if(c.widthArgPx===42?i===1:i!==3) { c.edgeFit=null;c.midpoint={status:'UNKNOWN'}; }
  }
  const rows=buildRows(r,geometry);
  assert.equal(rows.length,12);
  const partial=rows.find(r=>r.id==='composition/lateral-plus6/w42');
  assert.deepEqual(partial.midpoint.runs[0].stationIds,['lateral-plus6.short2','lateral-plus6.short3','lateral-plus6.short4','lateral-plus6.short5']);
  assert.equal(partial.midpoint.completeFive,false);
  const isolated=rows.find(r=>r.id==='composition/lateral-plus6/w50');
  assert.deepEqual(isolated.midpoint.isolatedIds,['lateral-plus6.short3']);
  assert.deepEqual(isolated.midpoint.runs,[]);
  const full=rows[0];
  assert.deepEqual(full.midpoint.slots[0].midpointPx,[0,2]);
  assert.equal(full.midpoint.completeFive,true);
  assert.equal(full.midpoint.runs[0].sharp.count,0);
});
test('disabled entry ignores unrelated getter and duplicate selector rejects',async()=>{
  assert.deepEqual(await runAudit({enabled:false,get receipt(){throw Error('must not read');}}),{status:'DISABLED'});
  const r=fixture();r.composition.stations.push(r.composition.stations[0]);
  assert.throws(()=>buildRows(r,geometry),/unique station/);
});
