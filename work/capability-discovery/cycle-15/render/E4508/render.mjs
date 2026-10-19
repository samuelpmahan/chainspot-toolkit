/** E4508: render reviewed inspector reports only. No inspector/provider imports. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const out = dirname(fileURLToPath(import.meta.url));
const prefix = '/workspace/scratch/86659bbafcce';
const sha = b => createHash('sha256').update(b).digest('hex');
const sourceFiles = [];
function read(path, expected) {
  const bytes = readFileSync(path), digest = sha(bytes);
  if (expected) assert.equal(digest, expected, `source changed: ${path}`);
  sourceFiles.push({path, bytes:bytes.length, sha256:digest});
  return bytes;
}
const acceptance = JSON.parse(read(prefix+'/lab15/S3/R4507/result.json'));
assert.equal(acceptance.decision, 'accepted');
const paths = [
  prefix+'/lab15/S3/R4507/cli-A/report/report.json',
  prefix+'/lab15/S1/E4507/cli-B/report/report.json',
  prefix+'/lab15/S1/E4507/cli-A2/report/report.tsv'
];
const pins = ['a70ea8521ae464b2d08a35c6ac22cdfdfa7ecadfd6cc006a01180e145da58239',
  '02d782ce61ee5b66afa2c9dbb8cb25501a036c52076920646d010d0a7694bbf2',
  'dcf3087cd86b9e965e5bf31a1d94be7992390f96017caa5f7aa10ef16a1050fc'];
const [a,b] = paths.slice(0,2).map((path,i) => JSON.parse(read(path,pins[i])));
const tsv = read(paths[2],pins[2]).toString();
const lines = tsv.trimEnd().split('\n').map(line=>line.split('\t'));
const header = lines.findIndex(fields=>fields.join('\t')==='badgeId\tpairId\tscore\tsupportMean\trank');
assert.equal(header,6);
const metadata = Object.fromEntries(lines.slice(0,header));
const a2rows = lines.slice(header+1).map(([badgeId,pairId,score,supportMean,rank])=>({badgeId,pairId,score:Number(score),supportMean:Number(supportMean),rank:Number(rank)}));
const projection = report => report.payload.groups.flatMap(group=>group.rows.map(row=>({badgeId:group.badgeId,pairId:row.raw.pairId,score:row.score,supportMean:row.raw.supportMean,rank:row.rank})));
for (const [i,report] of [a,b].entries()) {
  assert.equal(report.schema,'lab15-ranked-inspection@1');
  assert.equal(report.status,'admitted-nonempty');
  assert.equal(report.reason,null);
  assert.equal(report.payload.schema,'lab14-ranked-alternatives@1');
  assert.deepEqual(report.rows,projection(report));
  assert.equal(report.provenance.recordLabel,`desired-bridge-${i===0?'A':'B'}`);
}
assert.equal(metadata.status,a.status);
assert.equal(metadata.recordLabel,'desired-bridge-A2');
assert.equal(metadata.artifactSha256,a.provenance.ref.sha256);
assert.equal(metadata.pcrRunResultId,a.provenance.pcrRunResultId);
assert.deepEqual(a2rows,a.rows);
assert.notEqual(a.provenance.ref.sha256,b.provenance.ref.sha256);
assert.notEqual(a.provenance.pcrRunResultId,b.provenance.pcrRunResultId);
assert.deepEqual(a.rows.map(r=>r.pairId),['fixture-a1','fixture-a3','fixture-a2','fixture-b1']);
assert.deepEqual(b.rows.map(r=>r.pairId),['fixture-a1','fixture-a2','fixture-a3','fixture-b1']);
const views = [a,b].map((r,i)=>({phase:i===0?'A':'B',format:'JSON: complete supplied payload retained',label:r.provenance.recordLabel,status:r.status,rows:r.rows,artifactSha256:r.provenance.ref.sha256,pcrRunResultId:r.provenance.pcrRunResultId}));
views.push({phase:'A2',format:'TSV: display projection ONLY',label:metadata.recordLabel,status:metadata.status,rows:a2rows,artifactSha256:metadata.artifactSha256,pcrRunResultId:metadata.pcrRunResultId});
const audit = {schema:'lab15-e4508-report-render@1',job_id:'E4508',worker:'S6',scope:'Reviewed inspector outputs only; no inspector/provider/rank/PCR execution. A2 is TSV projection only.',sourceFiles,acceptance:{path:prefix+'/lab15/S3/R4507/result.json',decision:acceptance.decision,scope:acceptance.acceptance_scope},checks:{inputPinsMatch:true,jsonRowsEqualPayloadProjection:true,a2ProjectionEqualsA:true,recordedIdentitiesDifferThenRestore:true,orderedRowsPreserved:true},views,limits:['Admission is saved-byte/capture association consistency, not upstream completeness, authenticity, role or complete-schema proof.','Recorded artifact/PCR identities are carried from reports; PCR is not recomputed or independently authenticated.','A and B source JSON retain supplied full payload; A2 TSV does not establish full-payload restoration.','No pixels, original images, course geometry, ownership, selection, native-input or physical claim.']};
const cli = ['E4508 REVIEWED REPORT DISPLAY',...views.flatMap(v=>[`${v.phase}: ${v.status}; ${v.format}`,`record=${v.label}`,`artifact=${v.artifactSha256}`,`recordedPCR=${v.pcrRunResultId}`,...v.rows.map(r=>`${r.badgeId}\t${r.pairId}\t${r.score}\t${r.supportMean}\t${r.rank}`)]),'A2 matches A projection and recorded identities, not full payload proof.',`Full audit: ${out}/audit.json`].join('\n')+'\n';
const esc = s=>String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="690" viewBox="0 0 1500 690">','<rect width="1500" height="690" fill="#f4f6fa"/>'];
function text(x,y,s,size=18,color='#17253a',weight=400) {svg.push(`<text x="${x}" y="${y}" font-family="DejaVu Sans" font-size="${size}" fill="${color}" font-weight="${weight}">${esc(s)}</text>`);}
text(28,42,'Saved ranked evidence: reviewed inspector reports',29,'#14283d',700);
text(28,74,'E4508 / S6 • Metadata display only • Recorded identities carried, never recomputed',19);
text(28,104,'Admission = saved-byte association consistency; not upstream completeness, authenticity or fixture-role proof.',17,'#5c5360');
views.forEach((v,i)=>{
  const x=28+i*492;
  svg.push(`<rect x="${x}" y="125" width="462" height="380" rx="10" fill="#ffffff" stroke="#c7d2df"/>`);
  text(x+16,160,v.phase,27,'#14283d',700);
  text(x+16,188,v.format,16,v.phase==='A2'?'#8a4b11':'#235a4e',600);
  text(x+16,217,v.status,18,'#235a4e',700);
  text(x+16,243,v.label,16,'#536477');
  text(x+16,279,'Pair ID',16,'#536477',700);text(x+236,279,'Score',16,'#536477',700);text(x+309,279,'Support',16,'#536477',700);text(x+399,279,'Rank',16,'#536477',700);
  v.rows.forEach((r,j)=>{
    const y=312+j*31;
    if(r.pairId==='fixture-a2') svg.push(`<rect x="${x+8}" y="${y-22}" width="446" height="29" fill="#eaf1ff"/>`);
    text(x+16,y,r.pairId,19);text(x+238,y,r.score.toFixed(2),19);text(x+317,y,r.supportMean.toFixed(2),19);text(x+413,y,r.rank,19);
  });
  text(x+16,455,'Artifact '+v.artifactSha256.slice(0,21)+'…',15,'#285083');
  text(x+16,482,'Recorded PCR '+v.pcrRunResultId.slice(0,20)+'…',15,'#285083');
});
text(28,539,'Observed projection: A → B swaps a2 / a3; A2 returns to A. Winners a1 / b1 are unchanged.',20,'#235a4e',600);
text(28,572,'A2 equals A only for displayed rows and recorded IDs. A2 TSV contains no complete nested payload.',19,'#8a4b11',600);
text(28,605,'Full IDs, input hashes, ordered rows and limits: audit.json. Source A/B JSON retain their full supplied payload.',17,'#285083');
text(28,635,`${out}/audit.json`,16,'#285083');
text(28,666,'No inspector rerun, provider import, rerank, PCR recomputation, CV, original image, geometry or native-input claim.',16,'#5c5360');
svg.push('</svg>');
const svgBytes=Buffer.from(svg.join('\n'));
const require=createRequire(import.meta.url);
const sharp=require('sharp');
const png=await sharp(svgBytes).png().toBuffer();
const outputPins=[];
for (const [name,bytes] of [['audit.json',Buffer.from(JSON.stringify(audit,null,2)+'\n')],['summary.txt',Buffer.from(cli)],['view.svg',svgBytes],['view.png',png]]) {
  writeFileSync(resolve(out,name),bytes,{flag:'wx'});
  outputPins.push({path:resolve(out,name),bytes:bytes.length,sha256:sha(bytes)});
}
const meta=await sharp(png).metadata();
writeFileSync(resolve(out,'pins.json'),JSON.stringify({sourceFiles:[...sourceFiles,{path:resolve(out,'render.mjs'),sha256:sha(readFileSync(resolve(out,'render.mjs')))}],outputPins,pngDimensions:[meta.width,meta.height],sharpVersion:sharp.versions.sharp},null,2)+'\n',{flag:'wx'});
process.stdout.write(cli);
