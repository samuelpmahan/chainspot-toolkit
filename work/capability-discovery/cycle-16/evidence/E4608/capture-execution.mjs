import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
const repo='/workspace/scratch/86659bbafcce/chainspot-discovery-lab';
const root='/workspace/scratch/afc0d51965a8/lab16/S1/E4608';
const sha=b=>createHash('sha256').update(b).digest('hex');
const relative='experiments/capability-discovery/saved-pair-consistency/';
const files=[
 [relative+'recipe.mjs','00e0e4d251d85ae64f04210d2db03e5ba7492187abc540b414f3ff86a28d689b'],
 [relative+'recipe.test.mjs','cbf9f613fb37014dd434acb9c7dfdba336ad13ff784462ea99f12a0ddf75a931'],
 [relative+'cli.mjs','7e69d20890ed6c6fe30bf07eeaf6d5a19a4a3edbc1806a23c7f12ee706ad4d3f'],
 [relative+'README.md','498b6672a354fb806750dabf1a9ad42c93a105a96c80dafd292af729c604a466'],
 ['experiments/capability-discovery/probes/path-geometry/path-geometry.mjs','ba89598ffc830cb2da862b96abefdd16305e244b4737315be65b189b8f982b34'],
 ['work/capability-discovery/cycle-09/evidence/E3012/measurement/measurement.json','fc5da1eb88c0bb572506e815e653c94ddc71ba6d66b8832d513e889477fa95b1']
];
const pins=()=>files.map(([path,expected])=>{const bytes=readFileSync(`${repo}/${path}`),hash=sha(bytes);return {path,bytes:bytes.length,sha256:hash,expected,matched:hash===expected};});
const save=(path,value)=>writeFileSync(path,typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const commands=[
 {label:'tests',args:['--test',relative+'recipe.test.mjs']},
 {label:'audit-command',args:[relative+'cli.mjs','audit','--enabled','--input','work/capability-discovery/cycle-09/evidence/E3012/measurement/measurement.json','--run-id','E4608-firstgreen','--out',root+'/firstgreen']}
];
for(const {label,args}of commands){
 const out=`${root}/${label}`;mkdirSync(out);
 const before=pins();save(`${out}/source-pins.before.json`,before);
 if(before.some(p=>!p.matched))throw Error(`frozen pin mismatch before ${label}; STOP`);
 const startedAt=new Date().toISOString(),start=performance.now();
 const run=spawnSync('node',args,{cwd:repo,encoding:null,maxBuffer:8*1024*1024});
 const elapsedMs=performance.now()-start,finishedAt=new Date().toISOString();
 const stdout=run.stdout??Buffer.alloc(0),stderr=run.stderr??Buffer.alloc(0);
 save(`${out}/stdout.txt`,stdout);save(`${out}/stderr.txt`,stderr);
 const after=pins();save(`${out}/source-pins.after.json`,after);
 const execution={command:['node',...args].join(' '),executable:'node',argv:args,cwd:repo,startedAt,finishedAt,elapsedMs,exitCode:run.status,signal:run.signal,error:run.error?String(run.error):null,stdout:{path:`${out}/stdout.txt`,bytes:stdout.length,sha256:sha(stdout)},stderr:{path:`${out}/stderr.txt`,bytes:stderr.length,sha256:sha(stderr)},pinsBeforeAfterIdentical:JSON.stringify(before)===JSON.stringify(after),allFrozenPinsMatched:after.every(p=>p.matched)};
 save(`${out}/execution.json`,execution);console.log(JSON.stringify(execution));
 if(run.status!==0||run.error||!execution.pinsBeforeAfterIdentical||!execution.allFrozenPinsMatched){console.log('STOP; no changes or reruns');process.exitCode=1;break;}
}
