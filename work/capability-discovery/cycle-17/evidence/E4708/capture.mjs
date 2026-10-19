import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const SVG = '/workspace/scratch/86659bbafcce/lab17/S1/E4707/green/outputs/heading-projection-FyDDpZ/actual.svg';
const RECEIPT = '/workspace/scratch/86659bbafcce/lab17/S1/E4707/green/outputs/heading-projection-T6YLNl/receipt.json';
const SHARP = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.mjs';
const OUT = '/workspace/scratch/86659bbafcce/lab17/S6/E4708/capture';
const EXPECTED = new Map([
  [SVG, {bytes:140575,sha256:'c62dae1e0249897db41b4b93a496db4079c78b89704c71bb4dcd273db96935fd'}],
  [RECEIPT, {bytes:61814,sha256:'60940ca51e8f6c4196bdffaf0247bb4939e3a89de1aa42beeeab4a845db04b2c'}]
]);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function pin(path) { const bytes=readFileSync(path); return {path,bytes:bytes.length,sha256:digest(bytes)}; }
function guardInputs() {
  return [...EXPECTED].map(([path,expected]) => {
    if (!statSync(path).isFile()) throw Error(`Not regular input: ${path}`);
    const actual=pin(path);
    if (actual.bytes!==expected.bytes || actual.sha256!==expected.sha256) throw Error(`Input pin mismatch: ${path}`);
    return actual;
  });
}
function saveJSON(path,value) { writeFileSync(path,`${JSON.stringify(value,null,2)}\n`,{flag:'wx'}); }

async function rasterize() {
  const before=guardInputs();
  const svgBytes=readFileSync(SVG);
  if (digest(svgBytes)!==EXPECTED.get(SVG).sha256) throw Error('SVG changed before rasterization');
  const {default:sharp}=await import(SHARP);
  const full=await sharp(svgBytes).png().toBuffer({resolveWithObject:true});
  if (full.info.width!==1800 || full.info.height!==4457) throw Error('Unexpected raster dimensions');
  const fullPath=join(OUT,'full.png');
  writeFileSync(fullPath,full.data,{flag:'wx'});
  const header=await sharp(full.data).extract({left:0,top:0,width:1800,height:500}).png().toBuffer();
  const headerPath=join(OUT,'header.png');
  writeFileSync(headerPath,header,{flag:'wx'});
  const after=guardInputs();
  const result={schema:'lab17-svg-raster-readback@1',job_id:'E4708',worker:'S6',
    operation:'Rasterize exact reviewed SVG bytes; crop top500 from resulting full PNG',
    inputsBefore:before,inputsAfter:after,inputPinsUnchanged:JSON.stringify(before)===JSON.stringify(after),
    sharpEntry:pin(SHARP),dimensions:{full:{width:1800,height:4457},header:{width:1800,height:500}},
    outputs:[pin(fullPath),pin(headerPath)],
    boundaries:'No renderer, CLI, recipe, producer, geometry, scientific score or source-pixel import/invocation. Existing SVG left unchanged; no SVG regeneration or metadata rewriting.'};
  saveJSON(join(OUT,'readback.json'),result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[2]==='--worker') {
  try { await rasterize(); } catch(error) { process.stderr.write(`${error.stack}\n`); process.exitCode=1; }
} else {
  if (process.argv.length!==2) throw Error('Usage: node capture.mjs');
  guardInputs();
  mkdirSync(OUT,{recursive:false});
  const script=fileURLToPath(import.meta.url),started=new Date().toISOString(),start=performance.now();
  const child=spawnSync(process.execPath,[script,'--worker'],{encoding:null,timeout:30000,maxBuffer:1024*1024});
  const wallMs=performance.now()-start,ended=new Date().toISOString();
  writeFileSync(join(OUT,'stdout.txt'),child.stdout??Buffer.alloc(0),{flag:'wx'});
  writeFileSync(join(OUT,'stderr.txt'),child.stderr??Buffer.alloc(0),{flag:'wx'});
  const execution={schema:'lab17-artifact-execution@1',job_id:'E4708',worker:'S6',started,ended,wallMs,
    command:[process.execPath,script,'--worker'],exitCode:child.status,signal:child.signal,error:child.error?.message??null,
    script:pin(script),inputsAfter:guardInputs(),stdout:pin(join(OUT,'stdout.txt')),stderr:pin(join(OUT,'stderr.txt'))};
  saveJSON(join(OUT,'execution.json'),execution);
  process.stdout.write(`${JSON.stringify(execution)}\n`);
  process.exitCode=child.status===0&&!child.error?0:1;
}
