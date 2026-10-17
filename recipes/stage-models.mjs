import { differences } from '../facts.mjs';

/** Three read-only projections of precisely the same checkpoint, recipe and Attempts. */
export function compareStageModels({checkpoint,resolved,currentFiles,attempts,plan}) {
  const changes=differences(checkpoint.files,currentFiles);
  const latest=attempts.filter(x=>x.schema==='nctk-stage-attempt@1'&&x.fingerprint===resolved.fingerprint).at(-1)??null;
  const reused=plan.decision==='REUSE' ? attempts.find(x=>x.id===plan.attemptId) : null;
  const inventory={name:'A path/artifact inventory',checkpointId:checkpoint.id,
    selectedSource:checkpoint.request.sourcePath,files:checkpoint.files.length,
    changedPaths:changes.map(x=>x.path),sourceMatchesCheckpoint:changes.length===0,
    nativeAnswer:{inputBytesCurrent:changes.length===0,resultFreshness:'UNKNOWN',execution:'UNKNOWN',humanAcceptance:'UNKNOWN'},
    joinsNeeded:['ordered recipe dependency graph to know effect of a changed file','verified Attempt evidence for technical result']};
  const graph={name:'B dependency/result graph',recipe:resolved.recipe.path,
    edges:resolved.stages.map((s,index)=>({stage:s.path,requires:index?resolved.stages[index-1].path:resolved.source.path,
      consumes:s.consumes,produces:s.produces,optionalLane:s.lane.path,laneEnabled:s.lane.enabled})),
    selectedPrefix:resolved.until,selectedStage:resolved.only,
    closureFiles:resolved.files.length,closureMatchesCheckpoint:changes.length===0,
    nativeAnswer:{stagePrerequisites:changes.length===0?'CLOSED':'STALE',resultFreshness:'UNKNOWN',
      execution:'UNKNOWN',humanAcceptance:'UNKNOWN'},
    joinsNeeded:['Attempt lineage plus hash-verified native files to answer result freshness and process outcome']};
  const lineage={name:'C Attempt/branch lineage',fingerprint:resolved.fingerprint,
    matchingAttempts:attempts.filter(x=>x.schema==='nctk-stage-attempt@1'&&x.fingerprint===resolved.fingerprint)
      .map(x=>({id:x.id,execution:x.execution,evidenceCount:x.evidence?.length??0,
        humanAcceptance:x.acceptance,stages:x.stageObservations?.map(s=>({stage:s.stage,summary:s.summary,candidate:s.candidate?.enabled??false}))??[]})),
    nativeAnswer:{resultFreshness:reused?'VERIFIED':latest?'UNVERIFIED_OR_STALE':'MISSING',
      execution:latest?.execution??'NOT_RUN',humanAcceptance:latest?.acceptance??'UNKNOWN'},
    joinsNeeded:['checkpoint byte inventory and dependency closure to explain which source change forces a new Attempt']};
  return {schema:'nctk-stage-model-comparison@1',sameRequest:resolved.request,
    inventory,graph,lineage,
    interpretation:'A answers which bytes changed. B answers which prerequisite Stage/Part paths are required. C answers which exact Attempt has surviving evidence. Human geometry/ownership acceptance stays UNKNOWN until separately judged; no projection is scored for a fact it does not contain.'};
}
