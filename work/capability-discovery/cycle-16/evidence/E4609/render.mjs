import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/lib/index.js';

// Artifact-only saved-field display: no recipe, geometry or producer imports.
const BASE='/workspace/scratch/afc0d51965a8/lab16/';
const INPUT=BASE+'S1/E4608/firstgreen/';
const OUT=BASE+'S6/E4609/rendered';
const EXPECTED_RESULT='0ba97bcc17e85249042127907c173aef8dfcab6a3abe159756312c69cb78fe79';
const EXPECTED_CLI='555e80e8aab09623737c94110a6a614016325abd239a20a903143d5e7a9eea02';
const sha=b=>createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=readFileSync(p);return {path:p,bytes:b.length,sha256:sha(b)};};
const before=[pin(INPUT+'result.json'),pin(INPUT+'cli.txt')];
assert.equal(before[0].bytes,321752);assert.equal(before[0].sha256,EXPECTED_RESULT);assert.equal(before[1].sha256,EXPECTED_CLI);
const result=JSON.parse(readFileSync(INPUT+'result.json','utf8'));
const cli=readFileSync(INPUT+'cli.txt','utf8');
assert.equal(result.schema,'saved-pair-consistency@1');assert.equal(result.rows.length,12);
const roster=result.rows.flatMap(row=>{assert.equal(row.slots.length,5);assert.equal(row.comparisons.length,5);return row.slots.map((slot,i)=>{const comparison=row.comparisons[i];assert.equal(comparison.id,slot.id);assert.equal(comparison.state,slot.state);return {rowId:row.id,stationId:slot.id,state:slot.state,rowStatus:row.status,verdict:comparison.status};});});
const rosterLines=roster.map(r=>[r.rowId,r.stationId,r.state,r.rowStatus,r.verdict].join('\t'));
assert.equal(roster.length,60);assert.equal(new Set(roster.map(r=>r.rowId+'\t'+r.stationId)).size,60);
assert.deepEqual(cli.trimEnd().split('\n').slice(5),rosterLines);
assert.equal(cli.split('\n')[0],'result\t'+EXPECTED_RESULT);
assert.equal(cli.split('\n')[1],'status\t'+result.status);
assert.equal(cli.split('\n')[2],'projection\t'+result.projectionLabel);
assert.equal(cli.split('\n')[3],'calls\t'+JSON.stringify(result.counts));
assert.equal(roster.filter(r=>r.state==='OBSERVED'&&r.verdict==='MATCHED').length,42);
assert.equal(roster.filter(r=>r.state==='UNKNOWN'&&r.verdict==='UNKNOWN').length,18);
assert.equal(result.counts.observed,42);assert.equal(result.counts.unknown,18);
assert.equal(result.qualifications.physicalClaims,'UNKNOWN/HOLD');
assert.equal(result.savedCounterexample.newMeasurement,false);
assert.equal(result.savedCounterexample.savedSignedOffsetPx,8.090622377680736);
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const txt=(x,y,v,size=16,color='#183047',weight='normal')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${esc(v)}</text>`;
const width=1640,height=2220;
let content=txt(36,48,'Saved pair consistency — software consistency only',30,'#142d46','bold');
const headers=[
  `Captured run: ${result.runId} | stored overall status: ${result.status} | 12 rows × 5 stations = 60 records`,
  `Stored counts, kept separate: ${result.counts.observed} OBSERVED / MATCHED · ${result.counts.unknown} UNKNOWN / UNKNOWN`,
  'Exposed dependent views: crop and source are translated views, NOT independent courses or ground truth.',
  'Physical claims UNKNOWN/HOLD. Symmetric left/right swaps remain invisible to these consistency comparisons.',
  `Already-saved counterexample: ${result.savedCounterexample.savedSignedOffsetPx} px signed offset; NOT a new measurement.`,
  'CONSISTENT_AVAILABLE is a row-level software verdict; UNKNOWN stations remain UNKNOWN, not passes or zero values.',
  'Audit-used projection only, NOT the complete original payload. No geometry, rankings or scientific scores recomputed.'
];headers.forEach((v,i)=>{content+=txt(36,84+i*27,v,17);});
content+=txt(36,304,'Result SHA256: '+EXPECTED_RESULT,15)+txt(36,330,'CLI SHA256: '+EXPECTED_CLI,15);
content+=txt(36,366,'CROP VIEW — composition',21,'#174e75','bold')+txt(836,366,'SOURCE VIEW — sourceComposition (dependent)',21,'#174e75','bold');
const displayed=[];
for(let i=0;i<12;i++){
  const row=result.rows[i],column=i<6?0:1,local=i%6,x=30+column*800,y=390+local*282;
  content+=`<g data-row-id="${esc(row.id)}"><rect x="${x}" y="${y}" width="780" height="266" rx="9" fill="#ffffff" stroke="#a4b6c7"/>`;
  content+=txt(x+14,y+28,row.id,17,'#142d46','bold');
  content+=txt(x+14,y+52,'frame: '+row.frame,13);
  content+=txt(x+14,y+76,'stored row verdict: '+row.status,15,'#3a526a');
  content+=txt(x+14,y+103,'EXACT STATION ID',13,'#52697e','bold')+txt(x+326,y+103,'STATE',13,'#52697e','bold')+txt(x+487,y+103,'STORED VERDICT',13,'#52697e','bold');
  for(let j=0;j<5;j++){
    const record=roster[i*5+j],top=y+113+j*28,unknown=record.state==='UNKNOWN';displayed.push(record);
    content+=`<g data-station-id="${esc(record.stationId)}" data-state="${esc(record.state)}" data-verdict="${esc(record.verdict)}"><rect x="${x+9}" y="${top}" width="762" height="27" fill="${unknown?'#fff0db':'#e8f4ef'}"/>`;
    content+=txt(x+14,top+19,record.stationId,16)+txt(x+326,top+19,record.state,16,unknown?'#874800':'#12604b','bold')+txt(x+487,top+19,record.verdict,16,unknown?'#874800':'#12604b','bold')+'</g>';
  }
  content+='</g>';
}
content+=txt(36,2120,'Legend: green = retained OBSERVED + MATCHED; amber = retained UNKNOWN + UNKNOWN. Colors do not establish physical truth.',17);
content+=txt(36,2150,'Each exact row ID carries its stored CONSISTENT_AVAILABLE verdict above its five exact station IDs.',17);
content+=txt(36,2180,'No pixels, CV image panels, producer replay, new measurement or geometry calls. Data are copied from the captured result only.',17);
assert.deepEqual(displayed,roster);
const metadata={schema:'lab16-saved-consistency-display@1',inputPins:before,runId:result.runId,status:result.status,counts:result.counts,qualifications:result.qualifications,savedCounterexample:result.savedCounterexample,projectionLabel:result.projectionLabel,roster};
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><title>Saved software consistency audit, all sixty station records</title><desc>Two dependent views, twelve row IDs and sixty exact station IDs. Forty-two observed matched records and eighteen unknown records remain separate. Physical claims unknown and hold.</desc><metadata>${esc(JSON.stringify(metadata))}</metadata><style>text{font-family:DejaVu Sans,sans-serif}</style><rect width="${width}" height="${height}" fill="#eef3f8"/>${content}</svg>\n`;
// Rasterization is display-only; never an input image or scientific operation.
mkdirSync(OUT,{recursive:false});
writeFileSync(OUT+'/evidence.svg',svg,{flag:'wx'});
const png=await sharp(Buffer.from(svg),{density:72,limitInputPixels:10000000}).png().toBuffer();
writeFileSync(OUT+'/evidence.png',png,{flag:'wx'});
const after=[pin(INPUT+'result.json'),pin(INPUT+'cli.txt')];assert.deepEqual(after,before);
const audit={schema:'lab16-saved-consistency-display-readback@1',inputBefore:before,inputAfter:after,inputIdentityUnchanged:true,cliRows:60,displayRows:60,exactRosterAndVerdictsMatch:true,counts:result.counts,roster,outputs:[pin(OUT+'/evidence.svg'),pin(OUT+'/evidence.png')],dimensions:{width,height},geometryCalls:0,producerCalls:0,measurementCalls:0,renderInvocations:1};
writeFileSync(OUT+'/readback.json',JSON.stringify(audit,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'RENDERED',outputs:audit.outputs,dimensions:audit.dimensions,cliRows:60,displayRows:60,observedMatched:42,unknown:18,inputIdentityUnchanged:true}));
