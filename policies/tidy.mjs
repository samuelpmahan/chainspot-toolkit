import { differences } from '../facts.mjs';

/** Independent source change, target freshness, process execution and human acceptance status. */
export function tidy(checkpoint, currentFiles, resolved, decision, attempt = null) {
  const scoped = new Set(checkpoint.files.map(f => f.path));
  const changed = differences(checkpoint.files, currentFiles.filter(f => scoped.has(f.path)));
  const relevant = new Set(resolved.files.map(f => f.path));
  const relevantChanges = changed.filter(f => relevant.has(f.path));
  return {checkpointId:checkpoint.id,target:resolved.target.path,
    changed:{state:changed.length?'CHANGED':'UNCHANGED',paths:changed.map(f => f.path)},
    sourceMatchesCheckpoint:relevantChanges.length===0,
    resultFreshness:{state:relevantChanges.length?'STALE':decision.decision==='REUSE'?'VERIFIED':attempt?.execution==='PASS'?'VERIFIED':'MISSING',
      relevantChangedPaths:relevantChanges.map(f => f.path)},
    planning:decision.decision,execution:attempt?.execution ?? (decision.decision==='REUSE'?'REUSED':'NOT_RUN'),
    humanAcceptance:attempt?.acceptance ?? 'UNKNOWN',evidence:attempt?.evidence ?? [],nativeObservation:attempt?.nativeObservation??null};
}

/** The attempted computation and human accuracy claim are separate observations. */
export function tidyStages(checkpoint,currentFiles,resolved,decision,attempt=null) {
  const changed=differences(checkpoint.files,currentFiles);
  const reused=decision.decision==='REUSE';
  return {schema:'nctk-stage-status@1',checkpointId:checkpoint.id,request:resolved.request,
    changed:{state:changed.length?'CHANGED':'UNCHANGED',paths:changed.map(x=>x.path)},
    sourceMatchesCheckpoint:changed.length===0,
    resultFreshness:changed.length?'STALE':reused||attempt?.execution==='PASS'?'VERIFIED':'MISSING',
    planning:decision.decision,execution:attempt?.execution??(reused?'REUSED':'NOT_RUN'),
    humanAcceptance:attempt?.acceptance??'UNKNOWN',
    evidence:attempt?.evidence??[],stageObservations:attempt?.stageObservations??[],
    blockers:attempt?.blockers??[]};
}
