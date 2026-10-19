import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
const root = '/workspace/scratch/86659bbafcce/chainspot-discovery-lab';
const own = '/workspace/scratch/86659bbafcce/lab15/S1/E4507';
const out = join(own, 'baseline');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const protocol = JSON.parse(readFileSync(join(own, 'protocol.json')));
const names = {
  archive: 'work/capability-discovery/cycle-14/render/E4413/render.mjs',
  runtime: 'work/capability-discovery/cycle-14/evidence/E4412/green/runtime.json',
  artifact03: 'work/capability-discovery/cycle-14/evidence/E4412/green/artifact-03-0.json',
  artifact04: 'work/capability-discovery/cycle-14/evidence/E4412/green/artifact-04-0.json',
  artifact05: 'work/capability-discovery/cycle-14/evidence/E4412/green/artifact-05-0.json'
};
const pins = Object.entries(names).map(([key,path]) => {
  const sha256 = sha(readFileSync(join(root,path))); assert.equal(sha256,protocol.pins[key]); return {path,sha256};
});
for (const path of ['experiments/capability-discovery/ranked-inspector/inspector.test.mjs'])
  pins.push({path,sha256:sha(readFileSync(join(root,path)))});
pins.push({path:join(own,'protocol.json'),sha256:sha(readFileSync(join(own,'protocol.json')))});
mkdirSync(out);
writeFileSync(join(out,'source-pins.before.json'),JSON.stringify(pins,null,2)+'\n',{flag:'wx'});
const argv = ['--test', join(root,'experiments/capability-discovery/ranked-inspector/inspector.test.mjs')];
const started = new Date().toISOString();
const result = spawnSync(process.execPath,argv,{cwd:root,encoding:'utf8',timeout:20000,maxBuffer:5242880,
  env:{...process.env,LAB15_INSPECTOR_ARM:'archive',LAB15_ARCHIVE_CAPTURE:out}});
const ended = new Date().toISOString();
for(const [name,bytes] of [['stdout.txt',result.stdout??''],['stderr.txt',result.stderr??'']])
  writeFileSync(join(out,name),bytes,{flag:'wx'});
const after=pins.map(pin=>({...pin,sha256:sha(readFileSync(pin.path.startsWith('/')?pin.path:join(root,pin.path)))}));
writeFileSync(join(out,'source-pins.after.json'),JSON.stringify(after,null,2)+'\n',{flag:'wx'});
writeFileSync(join(out,'execution.json'),JSON.stringify({executable:process.execPath,argv,cwd:root,
  environment:{LAB15_INSPECTOR_ARM:'archive',LAB15_ARCHIVE_CAPTURE:out},started,ended,
  status:result.status,signal:result.signal,error:result.error?.message??null,sourcePinsUnchanged:JSON.stringify(pins)===JSON.stringify(after),
  stdout:{bytes:Buffer.byteLength(result.stdout??''),sha256:sha(result.stdout??'')},stderr:{bytes:Buffer.byteLength(result.stderr??''),sha256:sha(result.stderr??'')}},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({out,status:result.status,stdout:result.stdout,stderr:result.stderr}));
