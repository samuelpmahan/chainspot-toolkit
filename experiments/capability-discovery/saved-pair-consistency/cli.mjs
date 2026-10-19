#!/usr/bin/env node
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {runSavedPairAudit} from './recipe.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const args=process.argv.slice(2);
try{
  if(!args.includes('--enabled'))console.log('DISABLED');
  else{
    if(args.length!==8||args[0]!=='audit'||args[1]!=='--enabled'||args[2]!=='--input'||args[4]!=='--run-id'||args[6]!=='--out')throw Error('Usage: audit --enabled --input FILE --run-id ID --out NEW_DIRECTORY');
    const input=resolve(args[3]),out=resolve(args[7]);mkdirSync(out);
    const before=readFileSync(input),result=await runSavedPairAudit({schema:'saved-pair-consistency-request@1',enabled:true,runId:args[5],measurementBytes:before});
    result.fileBinding={actualPath:input,before:{bytes:before.length,sha256:sha(before)},after:null};
    try{const after=readFileSync(input);result.fileBinding.after={bytes:after.length,sha256:sha(after)};if(JSON.stringify(result.fileBinding.before)!==JSON.stringify(result.fileBinding.after))throw Error('input file changed');}
    catch(error){result.errors.push({message:String(error.message),phase:'input-file-after'});result.status='ERROR';}
    const bytes=Buffer.from(JSON.stringify(result,null,2)+'\n'),hash=sha(bytes);
    writeFileSync(join(out,'result.json'),bytes,{flag:'wx'});
    // Report the same captured object; never call geometry or recalculate scores.
    const lines=[`result\t${hash}`,`status\t${result.status}`,`projection\t${result.projectionLabel}`,`calls\t${JSON.stringify(result.counts)}`,
      'meaning\tSoftware consistency only; physical claims UNKNOWN/HOLD; dependent exposed views; symmetric swap blind',
      ...result.rows.flatMap(r=>r.slots.map((s,i)=>[r.id,s.id,s.state,r.status,r.comparisons?.[i]?.status??'UNAVAILABLE'].join('\t')))];
    const report=lines.join('\n')+'\n';writeFileSync(join(out,'cli.txt'),report,{flag:'wx'});process.stdout.write(report);
    if(result.status!=='CONSISTENT')process.exitCode=1;
  }
}catch(error){console.error(String(error.message));process.exitCode=1;}
