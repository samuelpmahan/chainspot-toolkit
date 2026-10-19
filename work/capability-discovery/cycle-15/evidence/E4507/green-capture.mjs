import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
const root='/workspace/scratch/86659bbafcce/chainspot-discovery-lab';
const out='/workspace/scratch/86659bbafcce/lab15/S1/E4507/green';
const paths=['inspector.mjs','cli.mjs','inspector.test.mjs','README.md'].map(name=>'experiments/capability-discovery/ranked-inspector/'+name);
paths.push('work/capability-discovery/cycle-14/render/E4413/render.mjs',
  'work/capability-discovery/cycle-14/evidence/E4412/green/runtime.json',
  ...['03','04','05'].map(id=>'work/capability-discovery/cycle-14/evidence/E4412/green/artifact-'+id+'-0.json'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const pins=()=>paths.map(path=>({path,sha256:sha(readFileSync(join(root,path)))}));
mkdirSync(out);
const before=pins();
writeFileSync(join(out,'source-pins.before.json'),JSON.stringify(before,null,2)+'\n',{flag:'wx'});
const argv=['--test',join(root,paths[2])];
const env={...process.env}; delete env.LAB15_INSPECTOR_ARM; delete env.LAB15_ARCHIVE_CAPTURE;
const started=new Date().toISOString();
const result=spawnSync(process.execPath,argv,{cwd:root,env,encoding:'utf8',timeout:20000,maxBuffer:5242880});
const ended=new Date().toISOString();
const streams={};
for(const [name,bytes] of [['stdout.txt',result.stdout??''],['stderr.txt',result.stderr??'']]){
  writeFileSync(join(out,name),bytes,{flag:'wx'}); streams[name]={bytes:Buffer.byteLength(bytes),sha256:sha(bytes)};
}
const after=pins();
writeFileSync(join(out,'source-pins.after.json'),JSON.stringify(after,null,2)+'\n',{flag:'wx'});
writeFileSync(join(out,'execution.json'),JSON.stringify({executable:process.execPath,argv,cwd:root,
  environment:{LAB15_INSPECTOR_ARM:null,LAB15_ARCHIVE_CAPTURE:null},started,ended,status:result.status,signal:result.signal,
  error:result.error?.message??null,sourcePinsUnchanged:JSON.stringify(before)===JSON.stringify(after),streams},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({out,status:result.status,stdout:result.stdout,stderr:result.stderr}));
