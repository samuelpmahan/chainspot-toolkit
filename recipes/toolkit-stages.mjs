/** Stage-mode toolkit calls the four existing peer policies in the same order. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { lstatSync } from 'node:fs';
import { hashFiles, warmHashPool } from '../dependencies/hashpool.mjs';
import { dirname, join, resolve } from 'node:path';
import { neatStages } from '../policies/neat.mjs';
import { kompozeStages, checkpointMismatch, describeRequest } from '../policies/kompoze.mjs';
import { crispStages } from '../policies/crisp.mjs';
import { tidyStages } from '../policies/tidy.mjs';
import { canonical, snapshotPaths, sha } from '../facts.mjs';
import { STAGE_SOURCES, stageState } from './closure.mjs';
import { materializeFork, verifyFork } from '../dependencies/localci.mjs';
import { stageForRootSync } from '../dependencies/smartsync.mjs';
import { runStages, outputFiles } from '../ports/run-stages.mjs';
import { compareStageModels } from './stage-models.mjs';
const exec=promisify(execFile);

// Flags that pick *which* checkpoint/run to use, not *what* is requested; they are
// dropped when a hint reconstructs the request's neat command.
const SELECTORS={'--checkpoint':1,'--from-git':1,'--out':1,'--fresh':0};
function parse(argv) {
  const get=(key,fallback)=>{const i=argv.indexOf(key);if(i<0)return fallback;if(!argv[i+1]||argv[i+1].startsWith('--'))throw Error(`${key} needs a value`);return argv[i+1];};
  const recipePath=get('--recipe','recipes/chainspot-s0-s7.json');
  const specimen=get('--specimen','golden');
  const sourcePath=get('--source',STAGE_SOURCES[specimen]);
  if(!sourcePath)throw Error(`Unknown specimen: ${specimen}`);
  const stage=get('--stage',undefined),until=get('--until',stage??'7');
  const lanes=(get('--lanes','')||'').split(',').filter(Boolean);
  if(new Set(lanes).size!==lanes.length)throw Error('Duplicate stage Lane');
  const request=[];
  for(let i=0;i<argv.length;i++) { if(argv[i] in SELECTORS){i+=SELECTORS[argv[i]];continue;} request.push(argv[i]); }
  return {recipePath,sourcePath,selection:{until,only:stage,lanes},out:get('--out',undefined),
    checkpoint:get('--checkpoint',undefined),fromGit:get('--from-git',undefined),fresh:argv.includes('--fresh'),
    requestArgs:request.join(' ')};
}
const print=x=>console.log(JSON.stringify(x,null,2));
const short=id=>id.slice(0,12);
const refusal=message=>Object.assign(Error(message),{code:'CHECKPOINT_SELECT'});
const pointerPath=root=>join(root,'attempts/stages/checkpoint.json');
const checkpointDir=root=>join(root,'attempts/stages/checkpoints');
const checkpointPath=(root,id)=>join(checkpointDir(root),`${id}.json`);

/** Write via a sibling temp file and rename, so concurrent readers never see a partial JSON. */
async function writeAtomic(path,text) {
  const temp=join(dirname(path),`.${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
  await writeFile(temp,text);
  await rename(temp,path);
}
async function readCheckpoint(path,id) {
  const value=JSON.parse(await readFile(path));
  const {id:stored,...body}=value;
  if(stored!==id||value.schema!=='nctk-stage-checkpoint@1'||sha(canonical(body))!==id)throw Error(`Stage checkpoint ${id} is not intact`);
  return value;
}
async function listCheckpoints(root) {
  return (await readdir(checkpointDir(root)).catch(()=>[])).filter(x=>/^[0-9a-f]{64}\.json$/.test(x)).map(x=>x.slice(0,64));
}
/** `--checkpoint ID` (full id or unique prefix) selects an immutable checkpoint; without it, the shared pointer. */
async function loadCheckpoint(root,options) {
  if(options.checkpoint) {
    const ids=(await listCheckpoints(root)).filter(id=>id.startsWith(options.checkpoint));
    if(ids.length!==1)throw refusal(`${ids.length?'Ambiguous':'Unknown'} --checkpoint ${options.checkpoint}`+
      (ids.length?`: matches ${ids.map(short).join(', ')}`:`; known checkpoints: ${(await listCheckpoints(root)).map(short).join(', ')||'none'}`)+
      `\n  create one with: node toolkit.mjs neat ${options.requestArgs}`);
    return readCheckpoint(checkpointPath(root,ids[0]),ids[0]);
  }
  const pointer=JSON.parse(await readFile(pointerPath(root)).catch(error=>{
    if(error.code==='ENOENT')throw refusal(`No stage checkpoint yet; run: node toolkit.mjs neat ${options.requestArgs}`);
    throw error;
  }));
  const value=await readCheckpoint(join(root,pointer.path),pointer.id).catch(()=>{throw Error('Stage checkpoint pointer mismatch');});
  return value;
}
/** Where a checkpoint's bytes live: the working tree, or the extracted git tree it closed over. */
async function checkpointRoot(root,checkpoint) {
  if(checkpoint.origin?.kind!=='git')return root;
  return (await gitTree(root,checkpoint.origin.commit)).dir;
}
/** Extract a commit once into attempts/stages/trees/COMMIT (immutable, shared by every checkpoint of that commit). */
async function gitTree(root,rev) {
  const commit=(await exec('git',['rev-parse','--verify',`${rev}^{commit}`],{cwd:root}).catch(error=>{
    throw Error(`--from-git ${rev}: not a commit in this repository (${String(error.stderr??error).trim()})`);
  })).stdout.trim();
  const rel=`attempts/stages/trees/${commit}`,dir=join(root,rel);
  if(!await stat(dir).then(()=>true,()=>false)) {
    const temp=`${dir}.${process.pid}-${Date.now()}.tmp`;
    await mkdir(temp,{recursive:true});
    try {
      await exec('git',['archive','--format=tar','-o',`${temp}/.tree.tar`,commit],{cwd:root});
      await exec('tar',['-xf','.tree.tar'],{cwd:temp});
      await rm(join(temp,'.tree.tar'));
      await rename(temp,dir).catch(error=>{if(!['EEXIST','ENOTEMPTY'].includes(error.code))throw error;});
    } finally { await rm(temp,{recursive:true,force:true}); }
  }
  return {commit,rel,dir};
}
async function previous(root) {
  const folder=join(root,'attempts/stages');
  const names=(await readdir(folder).catch(()=>[])).filter(x=>/^attempt-.*\.json$/.test(x)).sort();
  const values=await Promise.all(names.map(async name=>{try{return JSON.parse(await readFile(join(folder,name)));}catch{return null;}}));
  return values.filter(Boolean);
}
async function currentFiles(root,checkpoint) {
  // the checkpoint's files that still exist, hashed in one batch (a missing one is skipped, as before)
  const present=checkpoint.files.filter(file=>{try{lstatSync(join(root,file.path));return true;}catch{return false;}});
  try { return await snapshotPaths(root,present.map(f=>f.path)); }
  catch(error) {
    if(!String(error).includes('Missing dependency:'))throw error;
    const values=[];   // something vanished meanwhile: fall back to one file at a time
    for(const file of present) {
      try { values.push(...await snapshotPaths(root,[file.path])); }
      catch(error) { if(!String(error).includes('Missing dependency:'))throw error; }
    }
    return values;
  }
}
async function saveCheckpoint(root,value) {
  const path=checkpointPath(root,value.id),text=JSON.stringify(value,null,2)+'\n';
  await mkdir(dirname(path),{recursive:true});
  try { await writeFile(path,text,{flag:'wx'}); }
  catch(error) {
    if(error.code!=='EEXIST')throw error;
    if(JSON.stringify(JSON.parse(await readFile(path)))!==JSON.stringify(value))throw Error('Immutable stage checkpoint ID collision');
  }
  await writeAtomic(pointerPath(root),JSON.stringify({id:value.id,path:`attempts/stages/checkpoints/${value.id}.json`},null,2)+'\n');
}
/** Resolve, turning checkpoint refusals into a message that also says what to run next. */
async function resolveAgainst(root,source,pinned,options) {
  try { return await kompozeStages(source,pinned,options); }
  catch(error) {
    if(!String(error.code).startsWith('CHECKPOINT_'))throw error;
    const neat=`node toolkit.mjs neat ${options.requestArgs}`;
    const hints=[];
    if(error.code==='CHECKPOINT_MISMATCH') {
      const state=await stageState(root,options).catch(()=>null);
      const matching=[];
      if(state)for(const id of await listCheckpoints(root)) {
        const other=await readCheckpoint(checkpointPath(root,id),id).catch(()=>null);
        if(!other||checkpointMismatch(other,state).length)continue;
        const files=new Map(other.files.map(f=>[f.path,f.sha256]));
        matching.push({id,time:(await stat(checkpointPath(root,id))).mtimeMs,
          fresh:other.origin?.kind==='git'||state.files.every(f=>files.get(f.path)===f.sha256)});
      }
      matching.sort((a,b)=>b.fresh-a.fresh||b.time-a.time);
      if(matching.length)hints.push(`existing checkpoint(s) for this request: ${matching.slice(0,3).map(x=>short(x.id)+(x.fresh?'':' (stale)')).join(', ')} `+
        `-> add --checkpoint ${short(matching[0].id)}`);
      if(!options.checkpoint)hints.push('without --checkpoint the shared pointer attempts/stages/checkpoint.json was used; the last neat (possibly another agent\'s) set it');
      hints.push(`or create one: ${neat}  (prints its checkpoint ID)`);
    } else if(pinned.origin?.kind==='git') {
      hints.push(`the extracted tree ${pinned.origin.tree} was edited; delete it and re-run: ${neat} --from-git ${pinned.origin.commit}`);
    } else {
      hints.push(`to capture the current working tree (includes every in-progress edit in these paths, also other agents'): ${neat}`);
      hints.push(`to pin committed state while others edit: ${neat} --from-git HEAD   then pass the printed --checkpoint ID`);
    }
    error.message+=`\n${hints.map(x=>`  ${x}`).join('\n')}`;
    throw error;
  }
}

export async function stageToolkit(root,command,argv) {
  // Wall time of every run phase outside stage compute, so overhead is never invisible (ms since process start).
  const phases={},clock={at:performance.now()};
  phases.startup=Math.round(clock.at);
  const lap=name=>{const now=performance.now();phases[name]=Math.round(now-clock.at);clock.at=now;};
  const options=parse(argv);
  if(command==='neat') {
    let source=root,origin;
    if(options.fromGit) { const tree=await gitTree(root,options.fromGit); source=tree.dir; origin={kind:'git',commit:tree.commit,tree:tree.rel}; }
    const result=await neatStages(source,{...options,origin});
    await saveCheckpoint(root,result);
    return print({policy:'neat',checkpointId:result.id,origin:result.origin??{kind:'working-tree'},
      request:result.request,describe:describeRequest(result.request),files:result.files.length,
      next:`node toolkit.mjs run ${options.requestArgs} --checkpoint ${short(result.id)}`});
  }
  if(['run','compare','tidy'].includes(command))warmHashPool();   // workers boot while the checkpoint loads
  const pinned=await loadCheckpoint(root,options);
  const source=await checkpointRoot(root,pinned);
  lap('checkpoint');
  if(command==='package') {
    if(!options.out)throw Error('package requires --out NEW_DIRECTORY outside source');
    return print({dependency:'SmartSync/root_sync',...await stageForRootSync(source,pinned,resolve(options.out),{stage:true})});
  }
  const resolved=await resolveAgainst(root,source,pinned,options);
  lap('kompoze');
  if(command==='kompoze')return print({policy:'kompoze',checkpointId:pinned.id,request:resolved.request,recipe:resolved.recipe,
    stages:resolved.stages.map(s=>({path:s.path,lane:s.lane.path,enabled:s.lane.enabled,
      auxiliaryLanes:s.auxiliaryLanes.map(l=>({path:l.path,enabled:l.enabled})),consumes:s.consumes,produces:s.produces})),
    dependencyFiles:resolved.files.length,fingerprint:resolved.fingerprint});
  const prior=await previous(root);
  const plan=await crispStages(root,resolved,prior,{fresh:options.fresh});
  lap('crisp');
  if(command==='compare')return print(compareStageModels({checkpoint:pinned,resolved,
    currentFiles:await currentFiles(source,pinned),attempts:prior,plan}));
  if(command==='crisp')return print({policy:'crisp',checkpointId:pinned.id,...plan,request:resolved.request});
  if(command==='tidy')return print({policy:'tidy',...tidyStages(pinned,await currentFiles(source,pinned),resolved,plan,
    prior.find(x=>x.id===plan.attemptId))});
  if(command!=='run')throw Error('Stage recipe commands: neat, package, kompoze, crisp, run, tidy');
  if(plan.decision==='REUSE')return print({policy:'tidy',...tidyStages(pinned,await currentFiles(source,pinned),resolved,plan,
    prior.find(x=>x.id===plan.attemptId)),attemptId:plan.attemptId});

  const id=`attempt-${Date.now()}-${plan.fingerprint.slice(0,12)}`;
  const forkRoot=join(root,'attempts/stages',id,'fork');
  const record={schema:'nctk-stage-attempt@1',id,checkpointId:pinned.id,base:pinned.base,
    ...(pinned.origin?{origin:pinned.origin}:{}),
    request:resolved.request,fingerprint:plan.fingerprint,execution:'FAIL',acceptance:'UNKNOWN',
    evidence:[],stageObservations:[],blockers:[]};
  try {
    // Fork files are hardlinks into a content store (one immutable, verified file per sha256 and mode), and the
    // provider's node_modules is reused per install key; both are re-verified after the run (verifyFork, verifyModules).
    const objects=join(root,'attempts/stages/objects');
    record.materialization=await materializeFork(source,resolved,forkRoot,{objects});
    lap('fork');
    const result=await runStages({forkRoot,request:resolved.request,modules:join(root,'attempts/stages/modules')});
    Object.assign(phases,result.phases);clock.at=performance.now();
    record.materialization.postRun=await verifyFork(forkRoot,resolved.files,{objects});
    lap('verifyFork');
    record.stageObservations=result.stages;
    record.blockers=result.blockers;
    record.native={schema:result.schema,source:result.source,upstreamVariant:result.upstreamVariant,
      early:result.early,late:result.late,s7:result.s7,testimonyLimit:result.testimonyLimit};
    record.install=result.install;
    record.process=result.process;
    const hashes=await hashFiles(result.outputs.map(path=>join(forkRoot,path)),
      result.outputs.map(path=>lstatSync(join(forkRoot,path),{throwIfNoEntry:false})?.size??0));
    for(const [i,path] of result.outputs.entries()) {
      if(hashes[i].error)throw Error(`Evidence unreadable: ${path} (${hashes[i].error})`);
      record.evidence.push({path:`attempts/stages/${id}/fork/${path}`,sha256:hashes[i].sha256,size:hashes[i].size});
    }
    if(!record.evidence.length)throw Error('Stage provider produced no native evidence');
    lap('evidence');
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
    lap('record');
    record.phases={unit:'ms wall, this attempt',...phases,total:Math.round(performance.now())};
    await writeAtomic(join(root,'attempts/stages',`${id}.json`),JSON.stringify(record,null,2)+'\n');
  }
  const tidied=tidyStages(pinned,await currentFiles(source,pinned),resolved,plan,record);
  lap('tidy');
  print({policy:'tidy',...tidied,attemptId:id,error:record.error,phases:{...phases,total:Math.round(performance.now())}});
  if(record.execution!=='PASS')process.exitCode=1;
}
