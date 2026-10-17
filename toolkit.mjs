#!/usr/bin/env node
// Toolkit script: dispatches four peer policies; ChainSpot stays the provider below LocalCI.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neat } from './policies/neat.mjs';
import { kompoze } from './policies/kompoze.mjs';
import { crisp } from './policies/crisp.mjs';
import { tidy } from './policies/tidy.mjs';
import { compile, differences, inventory, sha } from './facts.mjs';
import { runProvider } from './provider-adapter.mjs';
import { stageForRootSync } from './dependencies/smartsync.mjs';
import { materializeFork } from './dependencies/localci.mjs';
import { projectInventory, projectGraph, projectLineage, compareModels } from './models.mjs';
import { stageToolkit } from './recipes/toolkit-stages.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const exec = promisify(execFile);
const [command, ...argv] = process.argv.slice(2);
const value = (flag, fallback) => { const i = argv.indexOf(flag); return i < 0 ? fallback : argv[i+1]; };
const targetPath = value('--target', 'targets/s7-baseline.json');
const overrides = JSON.parse(value('--args', '{}'));
const checkpointPath = join(root, 'attempts/checkpoint.json');
const readCheckpoint = async () => {
  const pointer=JSON.parse(await readFile(checkpointPath));
  const checkpoint=JSON.parse(await readFile(join(root,pointer.path)));
  if (checkpoint.id!==pointer.id) throw Error('Checkpoint pointer mismatch');
  return checkpoint;
};
const attempts = async () => {
  const names = (await readdir(join(root,'attempts'))).filter(x => /^attempt-.*\.json$/.test(x)).sort();
  return Promise.all(names.map(async n => JSON.parse(await readFile(join(root,'attempts',n)))));
};
const print = doc => console.log(JSON.stringify(doc, null, 2));

async function main() {
  if (command === 'neat') {
    const selected = value('--files', targetPath).split(',');
    for (const path of selected) {
      if (path.startsWith('targets/')) await compile(root,path);
      else if (!path.startsWith('source/')) throw Error(`Expected target declaration or source path: ${path}`);
    }
    const checkpoint = await neat(root,{files:selected});
    const immutable=join(root,'attempts/checkpoints',`${checkpoint.id}.json`);
    await mkdir(dirname(immutable),{recursive:true});
    try {
      const existing=await readFile(immutable);
      if (JSON.stringify(JSON.parse(existing))!==JSON.stringify(checkpoint)) throw Error('Immutable checkpoint ID collision');
    } catch(error) {
      if (error.code!=='ENOENT') throw error;
      await writeFile(immutable,JSON.stringify(checkpoint,null,2)+'\n',{flag:'wx'});
    }
    await writeFile(checkpointPath, JSON.stringify({id:checkpoint.id,path:`attempts/checkpoints/${checkpoint.id}.json`},null,2)+'\n');
    return print({policy:'neat',checkpointId:checkpoint.id,selectedPaths:selected,files:checkpoint.files.length});
  }
  const checkpoint = await readCheckpoint();
  if (command === 'package') {
    const destination=value('--out');
    if (!destination) throw Error('package needs --out NEW_DIRECTORY outside source');
    return print({dependency:'SmartSync/root_sync',...await stageForRootSync(root,checkpoint,resolve(destination))});
  }
  if (command === 'kompoze') {
    const resolved = await kompoze(root,checkpoint,targetPath,overrides);
    return print({policy:'kompoze',target:resolved.target.path,composition:resolved.target.composition??null,args:resolved.args,ticks:resolved.tickPaths,
      graph:resolved.graph,dependencyFiles:resolved.files.length});
  }
  const resolved = await kompoze(root,checkpoint,targetPath,overrides);
  const prior = await attempts();
  const plan = await crisp(root,resolved,prior);
  if (command === 'crisp') return print({policy:'crisp',target:targetPath,...plan});
  if (command === 'tidy') {
    const selected = plan.decision==='REUSE' ? prior.findLast(a => a.id === plan.attemptId) : null;
    return print({policy:'tidy',...tidy(checkpoint,await inventory(root),resolved,plan,selected)});
  }
  if (command === 'compare') {
    const current = await inventory(root);
    const scoped = new Set(checkpoint.files.map(f=>f.path));
    const facts = {checkpoint:{...checkpoint,changes:differences(checkpoint.files,current.filter(f=>scoped.has(f.path)))},
      declarations:resolved.declarations,requests:[...new Map(prior.map(a=>[a.request.id,a.request])).values()],attempts:prior.map(a=>a.modelAttempt),
      evidenceFiles:await Promise.all(prior.flatMap(a=>a.evidence??[]).map(async e=>({path:e.path,sha256:sha(await readFile(join(root,e.path)).catch(()=>Buffer.alloc(0)))})))};
    const query = {path:targetPath,target:targetPath,args:resolved.args,selectedTicks:resolved.tickPaths,fingerprint:plan.fingerprint};
    return print({inventory:projectInventory(facts),graph:projectGraph(facts),lineage:projectLineage(facts),comparison:compareModels(facts,[query])});
  }
  if (command !== 'run') throw Error('Use neat, kompoze, crisp, package, run, tidy or compare');
  if (plan.decision === 'REUSE') return print({policy:'crisp',...plan,tidy:tidy(checkpoint,await inventory(root),resolved,plan,prior.find(a=>a.id===plan.attemptId))});
  const id = `attempt-${Date.now()}-${plan.fingerprint.slice(0,12)}`;
  const forkRoot = join(root,'attempts',id,'fork');
  const forkMaterialization=await materializeFork(root,resolved,forkRoot);
  const request = {id:`request-${plan.fingerprint}`,target:targetPath,args:resolved.args,selectedTicks:resolved.tickPaths,fingerprint:plan.fingerprint};
  const record = {schema:'nctk-attempt@1',id,checkpointId:checkpoint.id,base:checkpoint.base,request,
    fingerprint:plan.fingerprint,execution:'FAIL',acceptance:'UNKNOWN',evidence:[],ticks:resolved.tickPaths,
    composition:resolved.target.composition??null,
    forkMaterialization,dependencySource:'package-lock.json; npm ci in fresh copied fork; network/cache not claimed hermetic'};
  try {
    const providerDir = join(forkRoot,'source/provider');
    const installed = await exec('npm',['ci','--ignore-scripts'],{cwd:providerDir,maxBuffer:8*1024*1024,timeout:120000});
    record.install = {exitCode:0,stdout:installed.stdout,stderr:installed.stderr};
    const result = await runProvider({forkRoot,providerPath:'source/provider',scriptPath:'source/chainspot-teams/s7/width-probe.mjs',
      args:resolved.args,sourceRowPath:resolved.args.mode==='heading'?'source/chainspot-teams/s7/input/IMG_5641-rows.json':undefined});
    record.process = result;
    for (const path of result.outputs) {
      const absolute = join(forkRoot,path), bytes = await readFile(absolute);
      record.evidence.push({path:`attempts/${id}/fork/${path}`,sha256:sha(bytes),size:bytes.length});
    }
    record.execution = result.status === 'completed' && result.exitCode === 0 && record.evidence.length ? 'PASS':'FAIL';
    if (record.execution==='PASS') {
      const receiptPath=result.outputs.find(p=>p.endsWith('/width-probe.json'));
      if (!receiptPath) throw Error('Provider produced no native width-probe receipt');
      const native=JSON.parse(await readFile(join(forkRoot,receiptPath)));
      record.nativeObservation={receipt:`attempts/${id}/fork/${receiptPath}`,sourceSha256:native.source.sha256,
        probeScriptSha256:native.probeScriptSha256,headingSource:native.headingSource,
        s5AxisRowSha256:native.s5AxisEvidence?.rowFileSha256??null,
        baselineExact:native.outcomes[0]?.baselineExact,
        variants:native.outcomes.map(o=>({name:o.name,lengthPx:o.traced.lengthPx,bendCount:o.traced.bendCount,
          outcome:o.traced.outcome,reason:o.traced.reason,basketId:o.traced.basketId}))};
    }
  } catch (error) {
    record.error = String(error.stack ?? error);
    if (error.stdout || error.stderr) record.install = {exitCode:error.code??1,stdout:error.stdout??'',stderr:error.stderr??''};
  } finally {
    record.modelAttempt = {id,requestId:request.id,checkpointId:checkpoint.id,fingerprint:plan.fingerprint,
      status:record.execution==='PASS'?'SUCCESS':'FAILED',acceptance:record.acceptance,evidence:record.evidence,
      nativeObservation:record.nativeObservation??null};
    await writeFile(join(root,'attempts',`${id}.json`),JSON.stringify(record,null,2)+'\n');
  }
  print({policy:'tidy',...tidy(checkpoint,await inventory(root),resolved,plan,record),attemptId:id,process:record.process,error:record.error});
  if (record.execution!=='PASS') process.exitCode=1;
}
(argv.includes('--recipe') ? stageToolkit(root,command,argv) : main())
  .catch(error => { console.error(error.stack??error); process.exitCode=1; });
