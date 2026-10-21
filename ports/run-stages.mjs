/** LocalCI process boundary for ordered native Stage execution. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { safePath, sha } from '../facts.mjs';
import { installModules, verifyModules } from '../dependencies/localci.mjs';
const exec=promisify(execFile);

export async function outputFiles(root,path='stage-output') {
  const result=[];
  async function visit(rel) {
    for(const entry of await readdir(join(root,rel),{withFileTypes:true})) {
      const child=join(rel,entry.name);
      if(entry.isDirectory())await visit(child);
      else if(entry.isFile())result.push(child);
      else throw Error(`Unsupported native output: ${child}`);
    }
  }
  await visit(path);
  return result.sort();
}

/** What `npm ci --ignore-scripts` depends on: the lockfile, every package manifest it installs from, node and npm. */
function installKey(providerDir) {
  const manifest=JSON.parse(readFileSync(join(providerDir,'package.json')));
  const files=['package.json','package-lock.json',...(manifest.workspaces??[]).map(w=>`${w}/package.json`)];
  let npm=null;
  for(const path of [join(dirname(process.execPath),'../lib/node_modules/npm/package.json'),join(dirname(process.execPath),'node_modules/npm/package.json')])
    try{npm=JSON.parse(readFileSync(path)).version;break;}catch{}
  if(!npm)return null;   // npm version unknown: no reuse
  return sha(JSON.stringify({command:'npm ci --ignore-scripts',node:process.version,npm,platform:`${process.platform}-${process.arch}`,
    files:files.map(f=>[f,sha(readFileSync(join(providerDir,f)))])}));
}

export async function runStages({forkRoot,request,modules}) {
  const providerDir=join(forkRoot,'source/provider');
  let at=performance.now();
  const phases={},lap=name=>{const now=performance.now();phases[name]=Math.round(now-at);at=now;};
  const npmCi=async()=>{const r=await exec('npm',['ci','--ignore-scripts'],{cwd:providerDir,maxBuffer:8*1024*1024,timeout:180000});return {stdout:r.stdout,stderr:r.stderr};};
  const key=modules?installKey(providerDir):null;
  const install=key?await installModules({providerDir,cache:modules,key,install:npmCi}):await npmCi();
  lap('npm');
  const entry=join(forkRoot,'ports/run-stages.mjs');
  const child=await exec(process.execPath,['--import','tsx',entry,'--worker',JSON.stringify(request)],
    {cwd:providerDir,maxBuffer:16*1024*1024,timeout:360000});
  lap('provider');
  const inner=JSON.parse(await readFile(join(forkRoot,'provider-phases.json')).catch(()=>'{}'));
  if(inner.boot!=null)Object.assign(phases,{providerBoot:inner.boot,providerWorker:inner.worker});
  const native=JSON.parse(await readFile(join(forkRoot,'stage-output/summary.json')));
  const outputs=new Set(await outputFiles(forkRoot));
  for(const evidence of native.s7?.nativeEvidence??[]) {
    if(evidence.error||!evidence.sha256||!Number.isInteger(evidence.bytes))throw Error(`S7 native evidence incomplete: ${evidence.path}`);
    const file=safePath(forkRoot,evidence.path),bytes=await readFile(file);
    if(bytes.length!==evidence.bytes||sha(bytes)!==evidence.sha256)throw Error(`S7 native evidence hash mismatch: ${evidence.path}`);
    outputs.add(evidence.path);
  }
  const modulesVerified=key?verifyModules({providerDir,cache:modules,key}):null;
  lap('outputs');
  return {...native,phases,outputs:[...outputs].sort(),install:{exitCode:0,stdout:install.stdout,stderr:install.stderr,
      ...(key?{key,...(install.reused?{reused:install.reused}:{stored:install.stored}),postRun:modulesVerified}:{})},
    process:{exitCode:0,stdout:child.stdout,stderr:child.stderr}};
}

async function worker() {
  const boot=performance.now();
  const request=JSON.parse(process.argv.at(-1));
  const forkRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  // provider wall phases (ms), a sidecar beside stage-output: never evidence, never hashed
  process.on('exit',()=>{try{writeFileSync(join(forkRoot,'provider-phases.json'),JSON.stringify({unit:'ms wall, provider process',boot:Math.round(boot),worker:Math.round(performance.now()-boot)})+'\n');}catch{}});
  const out='stage-output';
  await mkdir(join(forkRoot,out),{recursive:true});
  const {runEarly}=await import('./early/runEarly.mjs');
  const earlyLast=Math.min(request.until,3);
  const early=await runEarly({forkRoot,sourcePath:request.sourcePath,outDir:`${out}/early`,
    until:`S${earlyLast}`,experiments:request.lanes.filter(name=>({
      's0-chrome-conservatism':'S0','s1-badge-cardinality-audit':'S1',
      's2-shell-ownership-audit':'S2','fill-consistent-tee-selection':'S3',
      's3-findfamily-structural-fix':'S3FIX','s1-badge-assembly':'S1ASM','s2-basket-assembly':'S2ASM','s3-tee-assembly':'S3ASM','s3-findfamily-forkjoin':'S3FJ'
    })[name]).map(name=>({
      's0-chrome-conservatism':'S0','s1-badge-cardinality-audit':'S1',
      's2-shell-ownership-audit':'S2','fill-consistent-tee-selection':'S3',
      's3-findfamily-structural-fix':'S3FIX','s1-badge-assembly':'S1ASM','s2-basket-assembly':'S2ASM','s3-tee-assembly':'S3ASM','s3-findfamily-forkjoin':'S3FJ'
    })[name])});
  if(early.condition&&(early.notRun??[]).includes('S4')) {
    // a recorded data condition (e.g. no badges) that the later stages cannot run past: the result says so and the run passes
    // (S2 'no baskets' still runs S3 and records it: early.condition with S3 counts, notRun from S4)
    const result={schema:'nctk-stage-run@1',request,source:early.source,early:{receiptPath:`${out}/early/run.receipt.json`,snapshot:null},condition:early.condition,notRun:early.notRun,
      stages:early.stages.map(s=>({stage:s.id,source:'compiled gateway',durationMs:s.durationMs,acceptance:'UNKNOWN'})),blockers:[`${early.condition.stage}: ${early.condition.result}; ${early.notRun.join(', ')} not run`],humanAcceptance:'UNKNOWN'};
    await writeFile(join(forkRoot,out,'summary.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({stageCount:result.stages.length,blockers:result.blockers}));
    return;
  }
  let late=null,s7=null;
  // the course the later stages read: the request's source, or for a capture (*.capture.json) the course raster S0 stitched
  const course=early.source.path;
  if(request.until>=4) {
    if(!early.snapshot?.path||!early.snapshot?.sha256)throw Error('S4 requires fresh sealed S3 PxC snapshot');
    let basketBridge=null;
    if(request.lanes.includes('s4.basketRecovery')) {
      const {runBasketRecovery}=await import('./early/basketRecovery.mjs');
      basketBridge=await runBasketRecovery({forkRoot,
        receiptPath:join(forkRoot,out,'early/run.receipt.json'),sourcePath:course,
        outDir:join(forkRoot,out,'basket-bridge')});
    }
    const {runLate}=await import('./late/runLate.mjs');
    late=await runLate({forkRoot,sourcePath:course,outDir:`${out}/late`,early,
      earlyOutDir:join(forkRoot,out,'early'),until:Math.min(request.until,6),
      lanes:request.lanes.filter(x=>['s4.openFrame','s4.singletonPropagation','s5.exactCellPose','s5.globalAssignment','s6.axisPropagation'].includes(x)),
      basketBridge});
    await writeFile(join(forkRoot,out,'late/run.receipt.json'),JSON.stringify(late,null,2)+'\n');
  }
  if(request.until===7) {
    const {runS7}=await import('./s7.mjs');
    s7=await runS7({forkRoot,sourcePath:request.sourcePath,outDir:`${out}/s7`,
      imageId:request.sourcePath.includes('IMG_5641')?'IMG_5641':'AlexClark-original',
      upstreamS6:late?.s6??null,headingLane:request.lanes.includes('s5-axis-heading')});
    if(request.lanes.includes('s5-axis-heading')&&s7.s6Seam?.status!=='BOUND')
      throw Error(`Selected S7 heading lane has no verified S6 binding: ${s7.s6Seam?.reason??'unknown'}`);
  }
  const stages=[...early.stages.map(s=>({stage:s.id,source:'compiled gateway',durationMs:s.durationMs,
    ticks:s.ticks,materialization:s.materialization??null,
    digitsMaterialization:s.digitsMaterialization??null,glyphTemplateMaterialization:s.glyphTemplateMaterialization??null,
    ringsFamilyMaterialization:s.ringsFamilyMaterialization??null,
    familyFixMaterialization:s.familyFixMaterialization??null,
    familyFix:early.experiments?.branches?.S3FIX??null,
    ...(s.badgeAssemblyMaterialization?{badgeAssemblyMaterialization:s.badgeAssemblyMaterialization}:{}),
    ...(early.experiments?.branches?.S1ASM?{badgeAssembly:early.experiments.branches.S1ASM}:{}),
    ...(s.basketAssemblyMaterialization?{basketAssemblyMaterialization:s.basketAssemblyMaterialization}:{}),
    ...(early.experiments?.branches?.S2ASM?{basketAssembly:early.experiments.branches.S2ASM}:{}),
    ...(s.teeAssemblyMaterialization?{teeAssemblyMaterialization:s.teeAssemblyMaterialization}:{}),
    ...(early.experiments?.branches?.S3ASM?{teeAssembly:early.experiments.branches.S3ASM}:{}),
    ...(s.id==='S3'&&early.experiments?.branches?.S3FJ?{familyForkJoin:early.experiments.branches.S3FJ}:{}),
    canonicalRgbaSha256:s.canonicalRgbaSha256,
    inputSnapshotSha256:s.inputSnapshotSha256??null,outputSnapshotSha256:s.outputSnapshotSha256??null,
    summary:s.id==='S0'?early.crop??null:s.id==='S1'?{badges:early.counts?.badges??null}:
      s.id==='S2'?{baskets:early.counts?.baskets??null}:{tees:early.counts?.tees??null},
    candidate:early.experiments?.branches?.[s.id]??null,acceptance:'UNKNOWN'}))];
  // Late and S7 native receipts stay linked intact; compact cards are derived
  // only from fields actually returned by the respective adapter.
  for(const s of late?.stages??[])stages.push({stage:s.stageId??s.id??s.stage??'S4',source:'fresh S3 snapshot',
    ticks:s.ticks??s.broad?.onPcr?.ticks??[],summary:s.broad?{...s.counts,broad:s.broad.counts}:s.counts??null,
    candidate:s.basketRecovery?{primary:s.refinement??null,basketRecovery:s.basketRecovery}:
      s.stageId==='S5'?{pose:s.refinement??null,globalAssignment:s.globalAssignment??null}:s.refinement??null,
    evidenceFiles:s.evidenceFiles??[],
    unknown:s.unknown??null,acceptance:'UNKNOWN'});
  if(s7)stages.push({stage:'S7',source:'legacy path replay from original JPEG',
    summary:s7.counts??null,candidate:s7.s6Seam??null,
    receipt:s7.output?.path??null,unknown:s7.unknown??[],acceptance:'UNKNOWN'});
  const blockers=[];
  if(request.until>=4&&!late?.s6&&request.until>=6)blockers.push('S6 row absent: no fresh heading proposal');
  if(request.until===7&&!late?.s6)blockers.push('S7 heading proposal unbound: S6 row absent');
  const result={schema:'nctk-stage-run@1',request,source:early.source,
    // a recorded condition the stages ran past (S2 'no baskets'): only when it holds, so every other summary is byte-identical
    ...(early.condition?{condition:early.condition,notRun:early.notRun??[]}:{}),
    early:{receiptPath:`${out}/early/run.receipt.json`,snapshot:early.snapshot},
    upstreamVariant:{S4:'S3 clean baseline snapshot',S5:'S4 baseline fresh snapshot',S6:'S5 base fresh calculation',S7:'legacy original JPEG; S6 row only heading hypothesis'},
    late:late?{receiptPath:`${out}/late/run.receipt.json`,s6:late.s6??null}:null,
    s7:s7?{receiptPath:`${out}/s7/s7.json`,summary:s7.counts??null,seam:s7.s6Seam??null,
      nativeEvidence:s7.actualEvidence?.files??[]}:null,
    stages,blockers,humanAcceptance:'UNKNOWN',
    testimonyLimit:'Gateway PCR is actual declared/observed Part traffic; frozen binding alone is not nested invocation proof. S7 legacy re-decodes original JPEG.'};
  await writeFile(join(forkRoot,out,'summary.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({stageCount:stages.length,blockers}));
}
if(process.argv.includes('--worker'))worker().catch(error=>{console.error(error.stack??error);process.exitCode=1;});
