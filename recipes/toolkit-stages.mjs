/** Stage-mode toolkit calls the four existing peer policies in the same order. */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { neatStages } from '../policies/neat.mjs';
import { kompozeStages } from '../policies/kompoze.mjs';
import { crispStages } from '../policies/crisp.mjs';
import { tidyStages } from '../policies/tidy.mjs';
import { snapshotPaths, sha } from '../facts.mjs';
import { STAGE_SOURCES } from './closure.mjs';
import { materializeFork } from '../dependencies/localci.mjs';
import { stageForRootSync } from '../dependencies/smartsync.mjs';
import { runStages, outputFiles } from '../ports/run-stages.mjs';
import { compareStageModels } from './stage-models.mjs';

function parse(argv) {
  const get=(key,fallback)=>{const i=argv.indexOf(key);if(i<0)return fallback;if(!argv[i+1]||argv[i+1].startsWith('--'))throw Error(`${key} needs a value`);return argv[i+1];};
  const recipePath=get('--recipe','recipes/chainspot-s0-s7.json');
  const specimen=get('--specimen','golden');
  const sourcePath=get('--source',STAGE_SOURCES[specimen]);
  if(!sourcePath)throw Error(`Unknown specimen: ${specimen}`);
  const stage=get('--stage',undefined),until=get('--until',stage??'7');
  const lanes=(get('--lanes','')||'').split(',').filter(Boolean);
  if(new Set(lanes).size!==lanes.length)throw Error('Duplicate stage Lane');
  return {recipePath,sourcePath,selection:{until,only:stage,lanes},out:get('--out',undefined)};
}
const print=x=>console.log(JSON.stringify(x,null,2));
const pointerPath=root=>join(root,'attempts/stages/checkpoint.json');
const checkpointPath=(root,id)=>join(root,'attempts/stages/checkpoints',`${id}.json`);
async function checkpoint(root) {
  const pointer=JSON.parse(await readFile(pointerPath(root)));
  const value=JSON.parse(await readFile(join(root,pointer.path)));
  if(value.id!==pointer.id||value.schema!=='nctk-stage-checkpoint@1')throw Error('Stage checkpoint pointer mismatch');
  return value;
}
async function previous(root) {
  const folder=join(root,'attempts/stages');
  const names=(await readdir(folder).catch(()=>[])).filter(x=>/^attempt-.*\.json$/.test(x)).sort();
  return Promise.all(names.map(async name=>JSON.parse(await readFile(join(folder,name)))));
}
async function currentFiles(root,checkpoint) {
  const values=[];
  for(const file of checkpoint.files) {
    try { values.push(...await snapshotPaths(root,[file.path])); }
    catch(error) { if(!String(error).includes('Missing dependency:'))throw error; }
  }
  return values;
}
async function saveCheckpoint(root,value) {
  const path=checkpointPath(root,value.id);
  await mkdir(dirname(path),{recursive:true});
  try {
    const existing=JSON.parse(await readFile(path));
    if(JSON.stringify(existing)!==JSON.stringify(value))throw Error('Immutable stage checkpoint ID collision');
  } catch(error) {
    if(error.code!=='ENOENT')throw error;
    await writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  }
  await writeFile(pointerPath(root),JSON.stringify({id:value.id,path:`attempts/stages/checkpoints/${value.id}.json`},null,2)+'\n');
}

export async function stageToolkit(root,command,argv) {
  const options=parse(argv);
  if(command==='neat') {
    const result=await neatStages(root,options);
    await saveCheckpoint(root,result);
    return print({policy:'neat',checkpointId:result.id,request:result.request,files:result.files.length});
  }
  const pinned=await checkpoint(root);
  if(command==='package') {
    if(!options.out)throw Error('package requires --out NEW_DIRECTORY outside source');
    return print({dependency:'SmartSync/root_sync',...await stageForRootSync(root,pinned,resolve(options.out),{stage:true})});
  }
  const resolved=await kompozeStages(root,pinned,options);
  if(command==='kompoze')return print({policy:'kompoze',request:resolved.request,recipe:resolved.recipe,
    stages:resolved.stages.map(s=>({path:s.path,lane:s.lane.path,enabled:s.lane.enabled,
      auxiliaryLanes:s.auxiliaryLanes.map(l=>({path:l.path,enabled:l.enabled})),consumes:s.consumes,produces:s.produces})),
    dependencyFiles:resolved.files.length,fingerprint:resolved.fingerprint});
  const prior=await previous(root);
  const plan=await crispStages(root,resolved,prior);
  if(command==='compare')return print(compareStageModels({checkpoint:pinned,resolved,
    currentFiles:await currentFiles(root,pinned),attempts:prior,plan}));
  if(command==='crisp')return print({policy:'crisp',...plan,request:resolved.request});
  if(command==='tidy')return print({policy:'tidy',...tidyStages(pinned,await currentFiles(root,pinned),resolved,plan,
    prior.find(x=>x.id===plan.attemptId))});
  if(command!=='run')throw Error('Stage recipe commands: neat, package, kompoze, crisp, run, tidy');
  if(plan.decision==='REUSE')return print({policy:'tidy',...tidyStages(pinned,await currentFiles(root,pinned),resolved,plan,
    prior.find(x=>x.id===plan.attemptId)),attemptId:plan.attemptId});

  const id=`attempt-${Date.now()}-${plan.fingerprint.slice(0,12)}`;
  const forkRoot=join(root,'attempts/stages',id,'fork');
  const record={schema:'nctk-stage-attempt@1',id,checkpointId:pinned.id,base:pinned.base,
    request:resolved.request,fingerprint:plan.fingerprint,execution:'FAIL',acceptance:'UNKNOWN',
    evidence:[],stageObservations:[],blockers:[]};
  try {
    record.materialization=await materializeFork(root,resolved,forkRoot);
    const result=await runStages({forkRoot,request:resolved.request});
    record.stageObservations=result.stages;
    record.blockers=result.blockers;
    record.native={schema:result.schema,source:result.source,upstreamVariant:result.upstreamVariant,
      early:result.early,late:result.late,s7:result.s7,testimonyLimit:result.testimonyLimit};
    record.install=result.install;
    record.process=result.process;
    for(const path of result.outputs) {
      const bytes=await readFile(join(forkRoot,path));
      record.evidence.push({path:`attempts/stages/${id}/fork/${path}`,sha256:sha(bytes),size:bytes.length});
    }
    if(!record.evidence.length)throw Error('Stage provider produced no native evidence');
    record.execution='PASS';
  } catch(error) {
    record.error=String(error.stack??error);
    record.process={status:'failed',exitCode:error.code??1,stdout:error.stdout??'',stderr:error.stderr??''};
    for(const path of await outputFiles(forkRoot).catch(()=>[])) {
      const bytes=await readFile(join(forkRoot,path));
      record.evidence.push({path:`attempts/stages/${id}/fork/${path}`,sha256:sha(bytes),size:bytes.length,partial:true});
    }
  }
  finally {
    await writeFile(join(root,'attempts/stages',`${id}.json`),JSON.stringify(record,null,2)+'\n');
  }
  print({policy:'tidy',...tidyStages(pinned,await currentFiles(root,pinned),resolved,plan,record),attemptId:id,error:record.error});
  if(record.execution!=='PASS')process.exitCode=1;
}
