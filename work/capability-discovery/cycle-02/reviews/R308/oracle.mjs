import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {runComposition} from '../../../chainspot-discovery-lab/experiments/capability-discovery/composition/recipe.mjs';
import {trainingInput} from '../../../chainspot-discovery-lab/experiments/capability-discovery/composition/training-fixtures.mjs';
import {lumOf,profileAt,edgePairOf,arange} from '../../../chainspot-discovery-lab/experiments/capability-discovery/probes/width/vendor/active/ports/s6straight/pathSpace.mjs';
const own=new URL('./',import.meta.url),read=n=>readFileSync(new URL(n,own));
const base=JSON.parse(read('counterexample-input.json'));
const i=structuredClone(base);i.localWidthBank.valuesPx=[31,31.01,31.99,32,32.01,33,34,34.01];
const data=Uint8Array.from(i.image.data),ctx={W:i.image.width,H:i.image.height,lum:lumOf({widthPx:i.image.width,heightPx:i.image.height,rgba:data}),mask:null};
const station=i.stations[0],profile=profileAt(ctx,[station.xPx,station.yPx],station.headingRad,station.t0Px,station.t1Px);
const r=runComposition(i),actual=r.stations[0].candidates;
assert.equal(actual.length,i.localWidthBank.valuesPx.length);assert.deepEqual(actual.map(c=>c.widthArgPx),i.localWidthBank.valuesPx);
const cases=[];
for(const [index,w] of i.localWidthBank.valuesPx.entries()){
 const direct=edgePairOf(profile,w,{tolW:1,latLim:12}),wrapped=actual[index];
 assert.deepEqual(wrapped.edgeFit,direct);
 assert.equal(wrapped.midpoint.status,direct?'OBSERVED_CHANNELS':'UNKNOWN');
 if(direct)assert.equal(wrapped.midpoint.candidateCenterMinusFitMidpointPx,-direct.cPx||0);
 assert.ok(!('wgPx' in (wrapped.edgeFit??{})),'no hidden search bank provenance');
 cases.push({requestedWidthPx:w,sourceOracle:direct,wrappedFit:wrapped.edgeFit,midpoint:wrapped.midpoint});
}
assert.equal(actual[1].edgeFit,null);assert.equal(actual[1].midpoint.status,'UNKNOWN');assert.equal(actual[2].edgeFit,null);assert.ok(actual[3].edgeFit);assert.ok(actual[6].edgeFit);assert.equal(actual[7].edgeFit,null);
const oldRange=Array.from(arange(31.01,31.01+1,1));assert.equal(oldRange.length,2);
assert.ok(r.operationsExecuted.includes('edgePairOf (shared profile; exact requested width)'));assert.ok(!r.operationsExecuted.some(x=>x.includes('widthSearchAt')));
assert.equal(r.operationsExecuted.filter(x=>x==='profileAt').length,i.stations.length);
assert.equal(r.operationsExecuted.filter(x=>x==='edgePairOf (shared profile; exact requested width)').length,i.stations.length*i.localWidthBank.valuesPx.length);
const cli=JSON.parse(read('cli-counterexample.json'));assert.equal(cli.stations[0].candidates.length,1);assert.equal(cli.stations[0].candidates[0].widthArgPx,31.01);assert.equal(cli.stations[0].candidates[0].edgeFit,null);assert.equal(cli.stations[0].candidates[0].midpoint.status,'UNKNOWN');
const positives=[];
for(const y of [80,83.25]){
 const t=trainingInput();t.stations[0].yPx=y;t.localWidthBank.valuesPx=[30];const rr=runComposition(t),c=rr.stations[0].candidates[0];
 const st=t.stations[0],ct={W:t.image.width,H:t.image.height,lum:lumOf({widthPx:t.image.width,heightPx:t.image.height,rgba:Uint8Array.from(t.image.data)}),mask:null};
 const direct=edgePairOf(profileAt(ct,[st.xPx,st.yPx],st.headingRad,st.t0Px,st.t1Px),30,{tolW:t.edgeSearch.tolWidthPx,latLim:t.edgeSearch.latLimPx});assert.deepEqual(c.edgeFit,direct);assert.equal(c.edgeFit.wPx,29);assert.equal(c.midpoint.candidateCenterMinusFitMidpointPx,y===80?0:3.25);positives.push({yPx:y,sourceOracle:direct,wrapped:c});
}
for(const q of [r,cli]){assert.equal(q.localWidth.widthPx,null);assert.equal(q.localWidth.status,'UNKNOWN');assert.equal(q.semanticIdentity.status,'UNKNOWN');assert.equal(q.promoted,false);}
const recipe=readFileSync(new URL('../../../chainspot-discovery-lab/experiments/capability-discovery/composition/recipe.mjs',own),'utf8');assert.ok(!recipe.includes('widthSearchAt'));assert.ok(!recipe.includes('arange('));
const output={job_id:'R308',counterexampleCli:{candidate:cli.stations[0].candidates[0],operationsExecuted:cli.operationsExecuted},oldArangeEnumeration:oldRange,decimalCases:cases,integerPositiveControls:positives,operationsExecuted:r.operationsExecuted,sharedProfileCalls:r.operationsExecuted.filter(x=>x==='profileAt').length,edgePairCalls:r.operationsExecuted.filter(x=>x.startsWith('edgePairOf')).length,limits:'Exact source oracle equality on exposed raster; no scientific promotion or independent C2 evaluation.'};
writeFileSync(new URL('oracle-measurements.json',own),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({pass:true,decimalCases:cases.map(c=>({width:c.requestedWidthPx,fit:c.sourceOracle?.wPx??null,midpoint:c.midpoint.status})),positiveControls:positives.length,oldRange,profileCalls:output.sharedProfileCalls,edgePairCalls:output.edgePairCalls}));
