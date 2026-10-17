import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileStageRecipe } from './compile.mjs';
import { stageState, stageRequest, stageFingerprint } from './closure.mjs';
import { crispStages } from '../policies/crisp.mjs';
import { neatStages } from '../policies/neat.mjs';
import { kompozeStages, checkpointMismatch } from '../policies/kompoze.mjs';
import { tidyStages } from '../policies/tidy.mjs';
import { sha } from '../facts.mjs';
import { compareStageModels } from './stage-models.mjs';

const root=resolve(import.meta.dirname,'..');
test('literal recipe selects a prefix and leaves lanes OFF unless named',async()=>{
  const p=await compileStageRecipe(root,undefined,{only:3,until:3,lanes:['fill-consistent-tee-selection']});
  assert.deepEqual(p.stages.map(s=>s.path),['stages/s0.json','stages/s1.json','stages/s2.json','stages/s3.json']);
  assert.deepEqual(p.stages.map(s=>s.lane.enabled),[false,false,false,true]);
  assert.equal(p.only,3);
  await assert.rejects(()=>compileStageRecipe(root,undefined,{until:2,lanes:['fill-consistent-tee-selection']}),/beyond prefix/);
});

test('declared Stage graph rejects a missing producer before execution',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'nctk-stage-graph-'));
  try {
    for(const rel of ['recipes/chainspot-s0-s7.json','source/provider/REPLAY-PROVENANCE.json']) {
      await mkdir(join(folder,rel,'..'),{recursive:true});await cp(join(root,rel),join(folder,rel));
    }
    await cp(join(root,'stages'),join(folder,'stages'),{recursive:true});
    await cp(join(root,'lanes'),join(folder,'lanes'),{recursive:true});
    const path=join(folder,'stages/s2.json'),doc=JSON.parse(await readFile(path));
    doc.consumes.push('px.missing');await writeFile(path,JSON.stringify(doc));
    await assert.rejects(()=>compileStageRecipe(folder),/Missing Stage Part producer.*px\.missing/);
  }finally {await rm(folder,{recursive:true,force:true});}
});

test('strict reuse verifies native bytes; changed source and lane give different identities',async()=>{
  const sample=await stageState(root,{selection:{until:1}});
  const alternate=await stageState(root,{selection:{until:1,lanes:['s0-chrome-conservatism']}});
  const otherSource=await stageState(root,{sourcePath:'source/provider/artifacts/replay/source/AlexClark-original.jpg',selection:{until:1}});
  assert.notEqual(stageFingerprint(sample),stageFingerprint(alternate));
  assert.notEqual(stageFingerprint(sample),stageFingerprint(otherSource));
  assert.equal(sample.files.some(f=>f.path==='stages/s6.json'||f.path==='lanes/s6/refine.json'),false);
  assert.equal(sample.files.some(f=>f.path==='stages/s1.json'||f.path==='lanes/s1/refine.json'),true);
  assert.equal(stageRequest(sample).sourceSha256,sample.source.sha256);
  const folder=await mkdtemp(join(tmpdir(),'nctk-stages-evidence-'));
  try {
    const bytes=Buffer.from('{"native":"observed"}\n');
    await writeFile(join(folder,'receipt.json'),bytes);
    const attempt={schema:'nctk-stage-attempt@1',id:'one',fingerprint:stageFingerprint(sample),execution:'PASS',
      evidence:[{path:'receipt.json',sha256:sha(bytes),size:bytes.length}]};
    assert.equal((await crispStages(folder,{fingerprint:attempt.fingerprint},[attempt])).decision,'REUSE');
    await writeFile(join(folder,'receipt.json'),'tampered\n');
    assert.equal((await crispStages(folder,{fingerprint:attempt.fingerprint},[attempt])).decision,'RUN');
  } finally { await rm(folder,{recursive:true,force:true}); }
});

test('tidy reports never-run result missing despite unchanged source',()=>{
  const file={path:'source/foo',sha256:'abc',size:3};
  const result=tidyStages({id:'base',files:[file]},[file],{request:{until:0}},
    {decision:'RUN'});
  assert.equal(result.changed.state,'UNCHANGED');
  assert.equal(result.resultFreshness,'MISSING');
  assert.equal(result.humanAcceptance,'UNKNOWN');
  assert.equal(tidyStages({id:'base',files:[file]},[],{request:{until:0}},
    {decision:'RUN'}).resultFreshness,'STALE');
});

test('the same facts yield distinct native answers and explicit joins',()=>{
  const file={path:'source/input.jpg',sha256:'abc',size:3};
  const result=compareStageModels({checkpoint:{id:'c',request:{sourcePath:file.path},files:[file]},
    resolved:{recipe:{path:'recipes/x.json'},stages:[{path:'stages/s0.json',consumes:['source'],produces:['pixels'],lane:{path:'lanes/s0/refine.json',enabled:false}}],
      source:file,until:0,only:null,files:[file],request:{sourcePath:file.path,until:0},fingerprint:'f'},
    currentFiles:[file],attempts:[{schema:'nctk-stage-attempt@1',id:'a',fingerprint:'f',execution:'PASS',acceptance:'UNKNOWN',evidence:[{path:'receipt'}],stageObservations:[{stage:'S0',summary:{crop:4}}]}],
    plan:{decision:'REUSE',attemptId:'a'}});
  assert.equal(result.inventory.nativeAnswer.resultFreshness,'UNKNOWN');
  assert.equal(result.graph.nativeAnswer.stagePrerequisites,'CLOSED');
  assert.equal(result.lineage.nativeAnswer.resultFreshness,'VERIFIED');
  assert.equal(result.lineage.nativeAnswer.humanAcceptance,'UNKNOWN');
});

test('checkpoints name their specimen/lanes; a mismatched request is refused with both; --fresh forces RUN',async()=>{
  const lane=await neatStages(root,{selection:{until:3,lanes:['s3-findfamily-structural-fix']}});
  const base=await stageState(root,{selection:{until:3}});
  const alex=await stageState(root,{sourcePath:'source/provider/artifacts/replay/source/AlexClark-original.jpg',selection:{until:3,lanes:['s3-findfamily-structural-fix']}});
  assert.deepEqual(checkpointMismatch(lane,base),['lanes']);
  assert.deepEqual(checkpointMismatch(lane,alex),['specimen']);
  assert.deepEqual(checkpointMismatch(lane,await stageState(root,{selection:{until:2}})),[]);
  await assert.rejects(()=>kompozeStages(root,lane,{selection:{until:3}}),
    e=>e.code==='CHECKPOINT_MISMATCH'&&/lanes \[s3-findfamily-structural-fix\]/.test(e.message)&&/lanes \[none\]/.test(e.message));
  const edited={...lane,files:lane.files.map(f=>f.path==='policies/crisp.mjs'?{...f,sha256:'0'.repeat(64)}:f).filter(f=>f.path!=='policies/tidy.mjs')};
  await assert.rejects(()=>kompozeStages(root,edited,{selection:{until:3,lanes:['s3-findfamily-structural-fix']}}),
    e=>e.code==='CHECKPOINT_STALE'&&/modified policies\/crisp\.mjs/.test(e.message)&&/added {4}policies\/tidy\.mjs/.test(e.message));
  const folder=await mkdtemp(join(tmpdir(),'nctk-stages-fresh-'));
  try {
    const bytes=Buffer.from('{}\n');await writeFile(join(folder,'r.json'),bytes);
    const attempt={schema:'nctk-stage-attempt@1',id:'one',fingerprint:'f',execution:'PASS',evidence:[{path:'r.json',sha256:sha(bytes),size:bytes.length}]};
    assert.equal((await crispStages(folder,{fingerprint:'f'},[attempt])).decision,'REUSE');
    const fresh=await crispStages(folder,{fingerprint:'f'},[attempt],{fresh:true});
    assert.equal(fresh.decision,'RUN');assert.equal(fresh.reusable,'one');
  } finally { await rm(folder,{recursive:true,force:true}); }
});
