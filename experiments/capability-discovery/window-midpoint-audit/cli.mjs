#!/usr/bin/env node
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {runAudit} from './recipe.mjs';
const args=process.argv.slice(2);
try {
  if(!args.includes('--enabled')) {console.log('DISABLED');}
  else {
    if(args.length!==5||args[0]!=='--enabled'||args[1]!=='--run-id'||args[3]!=='--out')throw Error('Usage: --enabled --run-id ID --out NEW_DIRECTORY');
    const out=resolve(args[4]);mkdirSync(out);
    const trace=await runAudit({schema:'window-midpoint-audit-request@1',enabled:true,runId:args[2]});
    const bytes=Buffer.from(`${JSON.stringify(trace,null,2)}\n`),hash=createHash('sha256').update(bytes).digest('hex');
    writeFileSync(join(out,'measurement.json'),bytes,{flag:'wx'});
    const lines=[`trace\t${hash}`,`run\t${trace.runId}`,`params\t${trace.paramsHash}`,...trace.rows.map(r=>[
      r.id,r.frame,r.midpoint.completeFive?'COMPLETE_FIVE':'PARTIAL_OR_UNKNOWN',r.baseline.sharp?.count??'UNKNOWN',
      r.midpoint.completeFive?r.midpoint.runs[0].sharp.count:'UNKNOWN'].join('\t'))];
    const text=lines.join('\n')+'\n';writeFileSync(join(out,'cli.txt'),text,{flag:'wx'});process.stdout.write(text);
  }
} catch(error) {console.error(error.message);process.exitCode=1;}
