import test from 'node:test';
import assert from 'node:assert/strict';
import {describePath,countTurns} from './path-geometry.mjs';
const frame='synthetic canonical raster; y increases down';
const six=[[0,0],[5,0],[5,20],[15,20],[15,-20],[25,-20],[25,0],[60,0]];
const args=points=>({points,frame,width:{fullWidthPx:10,provenance:'synthetic known full ribbon width10px'}});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
test('straight versus six supplied turns remains descriptive, with explicit caller count',()=>{
 const a=describePath(args([[0,0],[60,0]])),b=describePath(args(six));
 assert.equal(a.lengthPx,60);assert.equal(a.turns.length,0);assert.equal(b.lengthPx,140);assert.equal(b.turns.length,6);
 assert.equal(countTurns(b,{definition:'fixture only: abs(angle)>=pi/3',predicate:t=>t.absoluteRadians>=Math.PI/3}).count,6);
 assert.equal(countTurns(b,{definition:'fixture only: abs(angle)>pi/2',predicate:t=>t.absoluteRadians>Math.PI/2}).count,0);
 assert.throws(()=>countTurns(b),/definition/);assert.throws(()=>countTurns(b,{definition:'not boolean',predicate:()=>1}),/boolean/);
 assert.equal(b.centerline.status,'UNKNOWN');assert.equal(b.supportEvidence.status,'UNKNOWN');
});
test('translation and rigid rotation preserve metric lengths, signed turn sequence and local-width ratios',()=>{
 const a=describePath(args(six)),theta=.37;
 const rotated=six.map(([x,y])=>[x*Math.cos(theta)-y*Math.sin(theta)+100,x*Math.sin(theta)+y*Math.cos(theta)-83]);
 const b=describePath(args(rotated));near(a.lengthPx,b.lengthPx);
 a.segments.forEach((s,i)=>near(s.lengthInFullRibbonWidths,b.segments[i].lengthInFullRibbonWidths));
 a.turns.forEach((t,i)=>{near(t.signedRadians,b.turns[i].signedRadians);near(t.distanceAlongPx,b.turns[i].distanceAlongPx);});
});
test('uniform scale changes dimensional lengths but not ratios/turns; local width array retained',()=>{
 const a=describePath({...args(six),width:{fullWidthPx:[10,20,10,20,10,20,10],provenance:'varying synthetic widths'}});
 const b=describePath({...args(six.map(p=>p.map(v=>v*3))),width:{fullWidthPx:[30,60,30,60,30,60,30],provenance:'scaled widths'}});
 near(b.lengthPx,3*a.lengthPx);near(a.normalizedLength.value,b.normalizedLength.value);
 a.turns.forEach((t,i)=>near(t.signedRadians,b.turns[i].signedRadians));
});
test('centerline offset requires paired edges, transforms invariantly, and preserves unknown samples',()=>{
 const input={points:[[2,0],[2,20]],frame,pairedEdges:{provenance:'synthetic cross sections',values:[{left:[-5,0],right:[5,0]},null]}};
 const a=describePath(input);assert.equal(a.centerline.samples[0].distanceInFullWidths,.2);assert.equal(a.centerline.samples[1].status,'UNKNOWN');
 const tx=([x,y])=>[-2*y+10,2*x+7];
 const b=describePath({points:input.points.map(tx),frame,pairedEdges:{provenance:'scaled rotated cross sections',values:[{left:tx([-5,0]),right:tx([5,0])},null]}});
 near(a.centerline.samples[0].distanceInFullWidths,b.centerline.samples[0].distanceInFullWidths);
 near(a.centerline.samples[0].signedCrossSectionOffsetInFullWidths,b.centerline.samples[0].signedCrossSectionOffsetInFullWidths);
 const c=describePath({points:input.points,frame,pairedEdges:{provenance:'missing',values:[null,null]}});assert.equal(c.centerline.status,'UNKNOWN');
});
test('sample support reports observed coverage without manufacturing calibrated confidence',()=>{
 const a=describePath({...args([[0,0],[1,0],[100,0]]),support:{values:[1,null,.2],threshold:.5,provenance:'fixture evidence'}});
 assert.equal(a.supportEvidence.supportedFractionOfObserved,.5);assert.equal(a.supportEvidence.observedFraction,2/3);assert.match(a.supportEvidence.confidence,/uncalibrated/);
 const b=describePath({...args([[0,0],[100,0]]),support:{values:[null,null],threshold:.5,provenance:'hidden'}});
 assert.equal(b.supportEvidence.status,'UNKNOWN');assert.equal(b.supportEvidence.supportedFractionOfObserved,null);
});
test('no implicit grid-turn merging or universal bend prior; U-turn/repeated nonadjacent point allowed',()=>{
 const a=describePath(args([[0,0],[1,0],[2,0],[1,0]]));assert.equal(a.turns.length,2);assert.equal(a.turns[0].absoluteRadians,0);near(a.turns[1].absoluteRadians,Math.PI);
 assert.equal(a.segments.length,3);assert.equal('score' in a,false);
});
test('degenerate, duplicate, nonfinite, absent provenance and inconsistent observations fail clearly',()=>{
 for(const points of [[],[[0,0]],[[0,0],[0,0]]])assert.throws(()=>describePath(args(points)),/vertices|duplicate/);
 for(const n of [NaN,Infinity,-Infinity])assert.throws(()=>describePath(args([[0,0],[n,1]])),/finite/);
 assert.throws(()=>describePath({...args(six),width:{fullWidthPx:0,provenance:'bad'}}),/positive/);
 assert.throws(()=>describePath({...args(six),width:{fullWidthPx:[10],provenance:'bad'}}),/one full width/);
 assert.throws(()=>describePath({points:[[0,0],[1,0]],frame:''}),/referent/);
 assert.throws(()=>describePath({...args([[0,0],[1,0]]),support:{values:[1,2],threshold:.5,provenance:'bad'}}),/\[0,1\]/);
 assert.throws(()=>describePath({...args([[0,0],[1,0]]),pairedEdges:{values:[{left:[0,0],right:[0,0]},null],provenance:'degenerate'}}),/positive/);
 assert.throws(()=>describePath(args([[Number.MAX_VALUE,0],[-Number.MAX_VALUE,0]])),/overflow/);
 assert.throws(()=>describePath({...args([[0,0],[1,0],[2,0]]),width:{fullWidthPx:1e-308,provenance:'overflow denominator'}}),/overflow/);
});
