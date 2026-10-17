#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=dirname(fileURLToPath(import.meta.url));
function call(...args) {
  const p=spawnSync(process.execPath,['toolkit.mjs',...args],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
  if (p.status!==0) throw Error(`${args.join(' ')} failed (${p.status}): ${p.stderr || p.stdout}`);
  return JSON.parse(p.stdout);
}
try {
  const result={schema:'nctk-replay@1',targets:[],models:{}};
  for (const target of ['targets/s7-baseline.json','targets/s7-heading.json']) {
    const run=call('run','--target',target);
    const report=run.tidy??run;
    const native=report.nativeObservation;
    result.targets.push({target,planning:run.decision??report.planning,execution:report.execution,
      resultFreshness:report.resultFreshness?.state,humanAcceptance:report.humanAcceptance,
      receipt:native?.receipt??null,sourceSha256:native?.sourceSha256??null,
      headingSource:native?.headingSource??null,variants:native?.variants??null});
    const compared=call('compare','--target',target).comparison.results[0];
    result.models[target]={inventory:compared.answers.inventory,graph:compared.answers.graph,
      lineage:compared.answers.lineage,humanAcceptance:compared.answers.humanAcceptance,joins:compared.joins};
  }
  console.log(JSON.stringify(result,null,2));
} catch(error) { console.error(error.stack??error); process.exitCode=1; }
