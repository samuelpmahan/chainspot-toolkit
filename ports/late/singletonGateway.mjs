/** Optional S4 pre-winner support queue over fresh S3-derived recovery Parts. */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { groupSupportFamilies } from './singletonSupportFamilies.mjs';
import { propagateSingletonQueues } from './singletonQueue.mjs';
import { createNativePrewinnerFeatureSet, NATIVE_GRAPH_PARTS } from './singletonNativeAdapter.mjs';

const require=createRequire(import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const NATIVE_BASE_SHA='526d4e6fa06a2ad301c5f2a882773890bf692a73b1115b716ced6e5fcb24c4c4';
const OVERLAY_EXPORTS='\n// Isolated s4.singletonPropagation export overlay; original provider bytes stay untouched.\nexports.evaluateGraphCandidateResult = graphCandidateResult;\nexports.createBasketOpaqueProvider = basketOpaqueProvider;\n';

function materializeNativeOverlay(provider){
  const basePath=resolve(provider,'packages/alg/dist/detectors/threeFactor/features/g3.teeRecovery.js');
  const overlayPath=resolve(provider,'packages/alg/dist/detectors/threeFactor/features/g3.teeRecovery.singletonOverlay.js');
  const base=readFileSync(basePath);
  if(sha(base)!==NATIVE_BASE_SHA)throw Error('S4 singleton native provider source drifted');
  const overlay=Buffer.concat([base,Buffer.from(OVERLAY_EXPORTS)]);
  writeFileSync(overlayPath,overlay);
  if(sha(readFileSync(overlayPath))!==sha(overlay))throw Error('S4 singleton native overlay materialization mismatch');
  return {basePath,baseSha256:sha(base),overlayPath,overlaySha256:sha(overlay),
    patchSha256:sha(Buffer.from(OVERLAY_EXPORTS)),patchText:OVERLAY_EXPORTS};
}

export function resolveSingletonQueue(graph){
  const eligible=graph.candidates.filter(row=>row.predicate.verdict==='accepted'&&
    row.duplicateCheck.status==='CLEAR_OF_EXISTING_TEES'&&typeof row.targetBadgeId==='string');
  const grouped=groupSupportFamilies(eligible);
  const queues=grouped.supportFamilies.map(family=>({
    supportId:family.supportFamilyId,teeId:family.supportFamilyId,
    candidates:family.candidates.map(row=>({candidateId:row.candidateId,holeId:row.targetBadgeId,
      holeRead:row.targetHoleRead,candidateSha256:row.candidateSha256,
      sourceCellHash:row.sourceCellHash,fragmentPixelCount:row.fragmentPixelCount,
      nativeRank:row.nativeRank}))
  }));
  const propagation=propagateSingletonQueues({queues});
  return {schema:'s4-singleton-propagation@1',sourceSha256:graph.sourceSha256,
    snapshotSha256:graph.snapshotSha256,canonicalRgbaSha256:graph.canonicalRgbaSha256,
    rule:'Strict native fit, clear of visible tee; connected source-cell overlap forms competing support hypotheses; uncontested singleton hole removed to fixed point.',
    counts:{raw:graph.candidates.length,strictEligible:graph.candidates.filter(row=>row.predicate.verdict==='accepted').length,
      eligibleAfterVisibleDuplicate:eligible.length,supportFamilies:grouped.supportFamilies.length,
      locks:propagation.locks.length,conflicts:propagation.conflicts.length,
      residual:propagation.residualQueues.length,exhausted:propagation.exhausted.length},
    supportFamilies:grouped.supportFamilies.map(f=>({supportFamilyId:f.supportFamilyId,
      sourceCellHash:f.sourceCellHash,sourceCellCount:f.sourceCellCount,
      componentIds:f.componentIds,memberCandidateIds:f.memberCandidateIds,
      eligibleHoleIds:[...new Set(f.candidates.map(c=>c.targetBadgeId))].sort()})),
    propagation};
}

export function projectSingletonAxes({graph,decisions,baselineAxes,guarded=[],cropTopPx}){
  const byId=new Map(graph.candidates.map(row=>[row.id,row]));
  const guardedByRef=new Map(guarded.map(row=>[row.resultRef,row]));
  const proposals=[],held=[];
  const lockedHoles=new Set(decisions.propagation.locks.map(lock=>lock.holeId));
  const lockedFamilies=new Set(decisions.propagation.locks.map(lock=>lock.supportId));
  const conflictedHoles=new Set(decisions.propagation.conflicts.filter(c=>
    c.claimants.some(x=>x.resolution==='PERSISTENT_CONFLICT')).map(c=>c.holeId));
  const candidateFamily=new Map(decisions.supportFamilies.flatMap(f=>f.memberCandidateIds.map(id=>[id,f.supportFamilyId])));
  const selected=[];
  for(const lock of decisions.propagation.locks){
    if(lock.candidateIds.length!==1){held.push({lock,reason:'MULTIPLE_TARGET_CONDITIONED_GEOMETRIES_FOR_ONE_LOCK'});continue;}
    selected.push({candidateId:lock.candidateIds[0],supportFamilyId:lock.supportId,
      holeId:lock.holeId,selection:'UNCONTESTED_SINGLETON_LOCK'});
  }
  // The native builder's own per-target order is retained for residual holes.
  // Conflicted singleton holes remain unresolved; no per-hole array order may
  // silently settle competing physical supports.
  const residualByHole=new Map();
  for(const queue of decisions.propagation.residualQueues){
    if(lockedFamilies.has(queue.supportId))continue;
    for(const candidate of queue.candidates){
      if(lockedHoles.has(candidate.holeId))continue;
      const rows=residualByHole.get(candidate.holeId)??[];
      rows.push({...candidate,supportFamilyId:queue.supportId});
      residualByHole.set(candidate.holeId,rows);
    }
  }
  for(const [holeId,rows] of [...residualByHole].sort(([a],[b])=>a.localeCompare(b))){
    rows.sort((a,b)=>a.nativeRank-b.nativeRank||a.candidateId.localeCompare(b.candidateId));
    const first=rows[0];
    if(first)selected.push({candidateId:first.candidateId,supportFamilyId:first.supportFamilyId,
      holeId,selection:'NATIVE_RANK_AFTER_SINGLETON_ELIMINATION',nativeRank:first.nativeRank,
      singletonConflictBeforeRanking:conflictedHoles.has(holeId),
      alternateCandidateIds:rows.slice(1).map(x=>x.candidateId)});
  }
  const byFamily=new Map();
  for(const choice of selected){const rows=byFamily.get(choice.supportFamilyId)??[];rows.push(choice);byFamily.set(choice.supportFamilyId,rows);}
  for(const choice of selected){
    if(byFamily.get(choice.supportFamilyId).length>1){
      held.push({candidateId:choice.candidateId,holeId:choice.holeId,
        reason:'CROSS_TARGET_OVERLAPPING_SUPPORT_CONFLICT',
        competingIds:byFamily.get(choice.supportFamilyId).map(x=>x.candidateId)});
      continue;
    }
    const row=byId.get(choice.candidateId);
    if(!row||row.predicate.verdict!=='accepted'||row.duplicateCheck.status!=='CLEAR_OF_EXISTING_TEES'||
      row.targetBadgeId!==choice.holeId||candidateFamily.get(row.id)!==choice.supportFamilyId){
      held.push({choice,reason:'SELECTION_CANDIDATE_PROVENANCE_INVALID'});continue;}
    const guardedRebinding=guardedByRef.get(row.id);
    if(guardedRebinding){
      const cells=pixels=>[...new Set(pixels.map(p=>p.join(',')))].sort().join('|');
      if(cells(row.exactFragmentPixels)!==cells(guardedRebinding.observedPixels))
        throw Error(`S4 guarded target-binding source pixels drifted for ${row.id}`);
      held.push({candidateId:row.id,holeId:choice.holeId,
        reason:'REFIT_REQUIRED_TARGET_BINDING',guardedSourcePixelSha256:guardedRebinding.observedSha256,
        fittedTarget:guardedRebinding.fittedTarget,
        potentialReassignment:guardedRebinding.potentialReassignment});
      continue;
    }
    const corners=row.predicate.corners.map(([x,y])=>[x,y+cropTopPx]);
    const center=corners.reduce((p,q)=>[p[0]+q[0]/4,p[1]+q[1]/4],[0,0]);
    const edge=[corners[1][0]-corners[0][0],corners[1][1]-corners[0][1]];
    const cellSet=new Set(row.exactFragmentPixels.map(p=>p.join(',')));
    const cornerSupport=corners.map((xy,index)=>{
      let nearby=false;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)
        if(dx*dx+dy*dy<=4&&cellSet.has(`${Math.round(xy[0])+dx},${Math.round(xy[1])+dy}`))nearby=true;
      return {index,xy,status:nearby?'visible-observed':'inferred',
        evidence:nearby?'observed source cells within 2 px':'target-conditioned fitted perimeter'};
    });
    proposals.push({detId:`tee-singleton-${row.candidateSha256.slice(0,16)}`,resultRef:row.id,
      supportFamilyId:choice.supportFamilyId,conditionalTargetBadgeId:choice.holeId,
      conditionalTargetHoleRead:row.targetHoleRead,center,angleRad:Math.atan2(edge[1],edge[0]),corners,
      cornerSupport,observedPixels:row.exactFragmentPixels,observedPixelCount:row.fragmentPixelCount,
      sourceCellHash:row.sourceCellHash??sha(JSON.stringify(row.exactFragmentPixels)),
      geometrySource:'native pre-winner strict fit after conditional singleton queue',
      axisTaintedByBadgeConstraint:true,
      axisConstraintProvenance:'native badge-conditioned recovery fit; singleton graph lock is conditional, not physical validation',
      conditionalTargetProvenance:row.id,conditionalTargetBadgeId:choice.holeId,
      sourceMark:`px.s4.singleton.candidates/${row.id}`,candidateSha256:row.candidateSha256,
      nativeRank:row.nativeRank,selection:choice.selection,
      singletonConflictBeforeRanking:choice.singletonConflictBeforeRanking??false,
      alternateCandidateIds:choice.alternateCandidateIds??[],physicalAcceptance:'UNKNOWN'});
  }
  const existing=[...baselineAxes.visible];
  const adopted=[];
  for(const proposal of proposals){
    const nearExisting=existing.filter(axis=>Math.hypot(axis.center[0]-proposal.center[0],axis.center[1]-proposal.center[1])<14);
    const nearPeer=proposals.filter(other=>other!==proposal&&
      Math.hypot(other.center[0]-proposal.center[0],other.center[1]-proposal.center[1])<14);
    if(nearExisting.length||nearPeer.length)held.push({candidateId:proposal.resultRef,
      reason:nearExisting.length?'DUPLICATE_NEAR_BASELINE_AXIS':'CONFLICT_NEAR_OTHER_LOCKED_SUPPORT',
      competingIds:[...nearExisting.map(x=>x.detId),...nearPeer.map(x=>x.resultRef)]});
    else adopted.push(proposal);
  }
  return {axes:adopted,held,proposalCount:proposals.length,
    residualHoleCount:residualByHole.size,conflictedHoleIds:[...conflictedHoles].sort(),
    limitation:'Locked and native-ranked residual conditional support→badge fits can include false positives. Broad pre-propagation recoveries are comparison only; axis and target ownership remain UNKNOWN.'};
}

export async function runSingletonGateway({provider,adaptedInputs,sourceSha256,snapshotSha256,
  canonicalRgbaSha256,cropTopPx,runId}){
  const overlay=materializeNativeOverlay(provider);
  const dist=name=>require(resolve(provider,'packages/alg/dist',name));
  const {createExecBoard}=dist('exec/board');
  const {compileABFeatureSet,executeABFeatureSet}=dist('exec/feature-set');
  const {composePcr}=dist('exec/pcr');
  const p=NATIVE_GRAPH_PARTS;
  const identity={sourceSha256,snapshotSha256,canonicalRgbaSha256,
    canonicalToSourceYpx:cropTopPx,nativeSourcePath:overlay.basePath,
    nativeSourceSha256:overlay.baseSha256,nativeOverlaySha256:overlay.overlaySha256};
  const seed=[
    [p.stage,adaptedInputs['px.s4.broad.stage']],[p.badges,adaptedInputs['px.s4.broad.badges']],
    [p.baskets,adaptedInputs['px.s4.broad.baskets']],[p.tees,adaptedInputs['px.s4.broad.tees']],
    [p.sprites,adaptedInputs['px.s4.broad.sprites']],[p.viewport,adaptedInputs['px.s4.broad.viewport']],
    [p.assignment,adaptedInputs['px.s4.broad.assignment']],[p.identity,identity]
  ];
  if(seed.some(([,value])=>value===undefined))throw Error('S4 singleton adapted Part missing');
  const graphSet=createNativePrewinnerFeatureSet({nativeModulePath:overlay.overlayPath});
  const queuePart='px.s4.singleton.propagation';
  const queueSpec={id:'s4.singletonPropagation',kind:'decide',gate:'S4',unit:'source-cell-support-queue',
    consumes:[p.result],produces:[queuePart],calculations:['fn.s4.propagateSingletonCandidateQueues'],
    accessConformance:'exact',features:['s4SingletonPropagation']};
  const calculateQueue=resolveSingletonQueue;
  const queueFeature={id:'s4SingletonPropagation',gate:'G4',kind:'deviation',defaultEnabled:false,
    resolveOnlyWhenConfigured:true,knobs:{},operations:[{spec:queueSpec,
      calculationBindings:[{address:queueSpec.calculations[0],calculate:calculateQueue}],
      run(board){board.set(queuePart,calculateQueue(board.get(p.result)));}}]};
  const featureSet={id:'s4-singleton-fresh-parts',seededSlots:seed.map(([address])=>address),
    features:[...graphSet.features,queueFeature]};
  const compiled=compileABFeatureSet(featureSet,{s4NativePrewinnerGraph:{enabled:true},
    s4SingletonPropagation:{enabled:true}},snapshotSha256);
  const board=createExecBoard();for(const [address,value] of seed)board.set(address,value);
  const manifest=await executeABFeatureSet(compiled,board,{},
    {runId,invocation:'late/singletonGateway.mjs'});
  if(manifest.operations.length!==2)throw Error('S4 singleton Tick cardinality mismatch');
  const graph=board.get(p.result),decisions=board.get(queuePart);
  const pcr=composePcr({id:'s4.singleton',title:'Native pre-winner fits and support singleton propagation',
    tickIds:['s4.nativePrewinnerCandidateGraph','s4.singletonPropagation']},compiled.plan,manifest.operations);
  return {graph,decisions,pcr,overlay,identity,seedHashes:seed.map(([address,value])=>({address,sha256:sha(JSON.stringify(value))})),
    outputParts:[p.result,queuePart]};
}
