#!/usr/bin/env node
/** Exclusive bounded file-only CLI; timeout/RSS observation belong to the outer process. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {runHeadingAblation} from './recipe.mjs';
const MAX_TRACE=2*1024*1024,MAX_TOTAL=5*1024*1024;
export function persistHeadingTrace(trace,outDir){
  let total=0;const artifacts=[];
  const write=(name,value,max)=>{const bytes=new TextEncoder().encode(`${JSON.stringify(value,null,2)}\n`);if(bytes.length>max||total+bytes.length>MAX_TOTAL)throw Error('output practical byte cap exceeded');writeFileSync(join(outDir,name),bytes,{flag:'wx'});total+=bytes.length;artifacts.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});};
  try{write('trace.json',trace,MAX_TRACE);const receipt={schema:'heading-ablation-cli@1',status:trace.status,runId:trace.runId,imageId:trace.imageId,paramsHash:trace.paramsHash,traceHash:artifacts[0].sha256,
    rowIds:trace.renderRows.map(r=>r.id),stationIds:trace.renderRows.flatMap(r=>r.stations.map(s=>s.id)),prediction:trace.prediction,renderRows:trace.renderRows,artifacts:[...artifacts],
    limits:{perTraceBytes:MAX_TRACE,totalBytes:MAX_TOTAL,qualification:'practical file caps; not RSS proof; outer timeout required'}};write('receipt.json',receipt,MAX_TRACE);return receipt;}
  catch(error){try{write('failure.json',{schema:'heading-ablation-output-failure@1',status:'OUTPUT_FAILED',error:String(error.message).slice(0,2048),retainedPrefix:artifacts},65536);}catch{}throw error;}
}
export async function runHeadingCLI(args){
  if(!Array.isArray(args)||args.length!==5||args[0]!=='run'||args[1]!=='--run-id'||args[3]!=='--out'||!/^[A-Za-z0-9._:-]{1,64}$/.test(args[2])||typeof args[4]!=='string'||!args[4].trim()||args[4].length>4096||args[4].includes('\0'))throw Error('Usage: node cli.mjs run --run-id ID --out NEWDIR');
  const outDir=resolve(args[4]);mkdirSync(outDir,{recursive:false});
  const trace=await runHeadingAblation({schema:'heading-ablation-request@1',enabled:true,runId:args[2]});return persistHeadingTrace(trace,outDir);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))runHeadingCLI(process.argv.slice(2)).then(r=>{console.log(JSON.stringify(r));process.exitCode=r.status==='COMPLETED'?0:1;}).catch(e=>{console.error(JSON.stringify({status:'NOT_COMPLETED',error:String(e.message)}));process.exitCode=1;});
