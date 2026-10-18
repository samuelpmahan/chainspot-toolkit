import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {trainingInput} from './training-fixtures.mjs';
const cli=fileURLToPath(new URL('./cli.mjs',import.meta.url));
test('CLI reads explicit RGBA JSON, preserves nonfinite diagnostics and writes inspectable evidence',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ribbon-composition-'));
 try {
  const input=trainingInput();input.occluders.boxes=[{bboxX:0,bboxY:0,bboxW:160,bboxH:160}];input.image.data=Array.from(input.image.data);
  writeFileSync(join(dir,'input.json'),JSON.stringify(input));
  const p=spawnSync(process.execPath,[cli,'--input',join(dir,'input.json'),'--out',join(dir,'out.json'),'--inspect',join(dir,'inspect.html')],{encoding:'utf8'});
  assert.equal(p.status,0,p.stderr);const r=JSON.parse(readFileSync(join(dir,'out.json')));
  assert.equal(r.status,'UNKNOWN');assert.deepEqual(r.rawWidthEstimate.scores[0].meanScore,{numberKind:'nonfinite',value:'-Infinity'});
  const html=readFileSync(join(dir,'inspect.html'),'utf8');assert.match(html,/UNKNOWN/);assert.match(html,/station-ca/);assert.match(html,/No calibrated width/);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
