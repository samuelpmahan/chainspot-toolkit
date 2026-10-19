import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const repo='/workspace/scratch/86659bbafcce/chainspot-discovery-lab';
const out='/workspace/scratch/86659bbafcce/lab17/S2/R4708/focused';
const test='experiments/capability-discovery/heading-ablation/projection.test.mjs';
const expected={
 [test]:'095cc1dc1eb043d2303943b62362a15392cfda64376c7fe7af03ffda941c218d',
 'experiments/capability-discovery/heading-ablation/render.mjs':'e18a6a6329011c80e90ff0a9f1052751b08893de2519c1542dc996f25801caaf',
 'experiments/capability-discovery/heading-ablation/cli.mjs':'3b7c9808fe10396ab9e2106d454998107ff8e6aea1b83f470cffb00e730d3555',
 'experiments/capability-discovery/heading-ablation/recipe.mjs':'97cc2bc1d30dd9039104df2c488fae491d93a21522aa3babbd7e5636b9710f2e',
 'experiments/capability-discovery/heading-ablation/README.md':'7e40e80460d07f45ff0f5ae14762907fd2bd8a585639b1316e0d77db7325c503',
 'work/capability-discovery/cycle-10/evidence/E4009/output/trace.json':'f237792dc0753096c3ab390a6efdf901e8850dbd433be60c7b9c808588bd3e63'};
const digest=b=>createHash('sha256').update(b).digest('hex');
const pins=()=>Object.entries(expected).map(([path,sha256])=>{const bytes=readFileSync(join(repo,path));const actual=digest(bytes);if(actual!==sha256)throw Error(`Source drift ${path}`);return {path,bytes:bytes.length,sha256:actual};});
const before=pins();
if(digest(readFileSync('/workspace/scratch/86659bbafcce/lab17/S1/E4707/frozen-projection.test.mjs'))!==expected[test])throw Error('Frozen test drift');
mkdirSync(out);mkdirSync(join(out,'outputs'));
const json=(name,value)=>writeFileSync(join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
json('source-pins.before.json',before);
const started=new Date().toISOString(),start=performance.now();
const result=spawnSync(process.execPath,['--test',test],{cwd:repo,env:{...process.env,LAB17_EVIDENCE_ROOT:join(out,'outputs')},encoding:null,timeout:30000,maxBuffer:2*1024*1024});
const ended=new Date().toISOString(),wallMs=performance.now()-start;
writeFileSync(join(out,'stdout.txt'),result.stdout||Buffer.alloc(0),{flag:'wx'});
writeFileSync(join(out,'stderr.txt'),result.stderr||Buffer.alloc(0),{flag:'wx'});
json('execution.json',{command:[process.execPath,'--test',test],cwd:repo,env:{LAB17_EVIDENCE_ROOT:join(out,'outputs')},started,ended,wallMs,exitCode:result.status,signal:result.signal,error:result.error?String(result.error):null,stdoutBytes:result.stdout?.length||0,stderrBytes:result.stderr?.length||0,stdoutSha256:digest(result.stdout||Buffer.alloc(0)),stderrSha256:digest(result.stderr||Buffer.alloc(0))});
json('source-pins.after.json',pins());
process.stdout.write(JSON.stringify({exitCode:result.status,signal:result.signal,wallMs,stdout:result.stdout?.toString(),stderr:result.stderr?.toString()})+'\n');
if(result.status!==0||result.signal||result.error)process.exitCode=1;
