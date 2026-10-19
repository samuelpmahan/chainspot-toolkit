import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
const root='/workspace/scratch/86659bbafcce/chainspot-discovery-lab';
const own='/workspace/scratch/86659bbafcce/lab15/S1/E4507';
const saved=join(root,'work/capability-discovery/cycle-14/evidence/E4412/green');
const cli=join(root,'experiments/capability-discovery/ranked-inspector/cli.mjs');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const paths=['inspector.mjs','cli.mjs','inspector.test.mjs','README.md'].map(name=>join(root,'experiments/capability-discovery/ranked-inspector',name));
paths.push(join(saved,'runtime.json'),...['03','04','05'].map(id=>join(saved,'artifact-'+id+'-0.json')));
const pins=()=>paths.map(path=>({path,sha256:sha(readFileSync(path))}));
const results=[];
for(const [phase,format] of [['B','json'],['A2','tsv']]){
  const directory=join(own,'cli-'+phase); mkdirSync(directory);
  const before=pins(); writeFileSync(join(directory,'source-pins.before.json'),JSON.stringify(before,null,2)+'\n',{flag:'wx'});
  const argv=[cli,'--runtime',join(saved,'runtime.json'),'--artifacts',saved,'--label','desired-bridge-'+phase,'--format',format,'--out',join(directory,'report')];
  const started=new Date().toISOString();
  const result=spawnSync(process.execPath,argv,{cwd:root,encoding:'utf8',timeout:5000,maxBuffer:1048576});
  const ended=new Date().toISOString(),streams={};
  for(const [name,bytes] of [['stdout.txt',result.stdout??''],['stderr.txt',result.stderr??'']]){
    writeFileSync(join(directory,name),bytes,{flag:'wx'});streams[name]={bytes:Buffer.byteLength(bytes),sha256:sha(bytes)};
  }
  const after=pins(); writeFileSync(join(directory,'source-pins.after.json'),JSON.stringify(after,null,2)+'\n',{flag:'wx'});
  const reportPath=join(directory,'report','report.'+format);
  const record={phase,format,executable:process.execPath,argv,cwd:root,started,ended,status:result.status,signal:result.signal,error:result.error?.message??null,
    sourcePinsUnchanged:JSON.stringify(before)===JSON.stringify(after),streams,
    report:result.status===0?{path:reportPath,sha256:sha(readFileSync(reportPath)),bytes:readFileSync(reportPath).length}:null};
  writeFileSync(join(directory,'execution.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'}); results.push(record);
  if(result.status!==0)break;
}
console.log(JSON.stringify(results));
