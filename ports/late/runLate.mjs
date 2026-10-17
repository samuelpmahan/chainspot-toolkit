/** Ordered S4–S6 port over one fresh S3 PxC, with independently selectable OFF refinements. */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { runS4 } from './s4.mjs';
import { makeBroadRecovery } from './broadRecovery.mjs';
import { runSingletonGateway, projectSingletonAxes } from './singletonGateway.mjs';
import { buildLateInputs } from './buildInputs.mjs';
import { bindBasketBridge } from './basketBridge.mjs';
import { createRecoveryBehaviorFeatureSet, S5S6_PARTS } from './behavior/index.mjs';
import { createS5AssignmentFeature, S5_ASSIGNMENT_PARTS } from './assignmentGateway.mjs';
import { renderAssignment } from './assignmentRender.mjs';
import { renderRecovery } from './render.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hash=value=>sha(JSON.stringify(value));
const save=(path,value)=>{const bytes=Buffer.from(JSON.stringify(value,null,2));writeFileSync(path,bytes);return sha(bytes)};
const require=createRequire(import.meta.url);
const ticks=pcr=>pcr.ticks.map(({operation,testimony})=>({id:operation.id,
  declared:{consumes:operation.consumes,produces:operation.produces,calculations:operation.calculations},
  actual:{consumes:testimony.actualConsumes,produces:testimony.actualProduces,writes:testimony.writes},
  frozenCalculations:testimony.frozenCalculations,
  invocationLimit:'Bound function body identity and exact Part get/set traffic; nested helper invocation is not separately instrumented.'}));

export async function runLate({forkRoot,sourcePath,outDir,early,earlyOutDir=null,until=6,lanes=[],basketBridge=null}) {
  if(![4,5,6].includes(Number(until)))throw Error('runLate until must be 4, 5, or 6');
  const selected=new Set(lanes.map(x=>String(x).toLowerCase()));
  for(const lane of selected)if(!['s4','s5','s6','s4.openframe','s4.singletonpropagation','s5.exactcellpose','s5.globalassignment','s6.axispropagation'].includes(lane))throw Error(`Unknown recovery lane ${lane}`);
  const s4On=selected.has('s4')||selected.has('s4.openframe');
  const singletonOn=selected.has('s4.singletonpropagation');
  const s5On=selected.has('s5')||selected.has('s5.exactcellpose');
  const assignmentOn=selected.has('s5.globalassignment');
  const s6On=selected.has('s6')||selected.has('s6.axispropagation');
  if((s5On||assignmentOn)&&Number(until)<5||s6On&&Number(until)<6)throw Error('Selected refinement beyond --until');
  const root=resolve(forkRoot),provider=resolve(root,'source/provider'),out=resolve(root,outDir),source=resolve(root,sourcePath);
  mkdirSync(out,{recursive:true});
  if(early?.schema!=='nctk-early@1'||!early.snapshot?.sha256||early.stages?.at(-1)?.id!=='S3')
    throw Error('S4 requires completed fresh S3 native receipt and snapshot');
  const sourceSha256=sha(readFileSync(source));
  if(early.source?.sha256!==sourceSha256||resolve(early.source.path)!==source)throw Error('S4 source identity mismatched fresh S3 receipt');
  const snap=resolve(earlyOutDir??resolve(root,'stage-output/early'),early.snapshot.path);
  if(sha(readFileSync(snap))!==early.snapshot.sha256)throw Error('S4 S3 snapshot bytes differ from receipt');
  const canonicalRgbaSha256=early.stages[0].canonicalRgbaSha256;
  if(!canonicalRgbaSha256)throw Error('Early native S0 canonical image identity absent');
  const cropTopPx=early.stages[0].cropReceipt?.upperRowsRemoved??early.crop?.upperRowsRemoved??
    Number(early.stages[0].receipt?.match(/rowsRemoved: upper=(\d+) lower=\d+/)?.[1]);
  if(!Number.isInteger(cropTopPx))throw Error('S0 source/canonical frame offset missing');
  const base=await runS4({forkRoot:provider,sourcePath:source,sourceSha256,
    snapshotPath:snap,snapshotSha256:early.snapshot.sha256,canonicalRgbaSha256,openFrame:false});
  const broad=makeBroadRecovery({forkRoot:provider,pxc:base.pxc,snapshotSha256:early.snapshot.sha256,
    sourceSha256,cropTopPx});
  const broadOff=await broad.execute({enabled:false,runId:`${basename(source)}-s4b-off`});
  const broadOn=await broad.execute({enabled:true,runId:`${basename(source)}-s4b-on`});
  if(broadOff.manifest.operations.length||broadOn.manifest.operations.length!==1)throw Error('S4 broad default-OFF gateway mismatch');
  const s4Compare=s4On?await runS4({forkRoot:provider,sourcePath:source,sourceSha256,
    snapshotPath:snap,snapshotSha256:early.snapshot.sha256,canonicalRgbaSha256,openFrame:true}):null;
  const s4Artifact=join(out,'s4-broad-trace.json');const s4TraceSha256=save(s4Artifact,{sourceSha256,
    upstreamSnapshotSha256:early.snapshot.sha256,base:base.report,broadOn,
    openFrame:s4Compare?.report??null});
  const stages=[{...base.report,imageId:basename(source),sourceSha256,upstreamReceiptHashes:[early.snapshot.sha256],
    featureId:'s4BroadRecovery',defaultEnabled:false,baseInvocation:'explicit ON for the recipe base, OFF gate verified',
    inputPartRefs:['px.components','badges','px.baskets','px.tees','px.tees.family','px.s4.teeBadge.state'],
    outputPartRefs:['px.s4.broad.result'],broad:{offOps:broadOff.manifest.operations.length,onPcr:broadOn.pcr,
      counts:broadOn.counts},refinement:{id:'s4.openFrame',defaultEnabled:false,enabled:s4On,
      off:base.report.counts.baseline,on:s4Compare?.report.counts.refinement??null,
      status:s4On?'COMPARATIVE_CANDIDATE':'OFF'},
    evidenceFiles:[{path:s4Artifact,sha256:s4TraceSha256}],
    unknown:{...base.report.unknown,unresolvedHoleReadsAfterBroad:base.report.unknown.unresolvedHoleReads.filter(h=>
      !broadOn.result?.candidates.some(c=>c.visualRole==='tee-shard'&&c.verdict==='accepted'&&c.reason?.includes(`badge ${h}`))),
      humanFit:'UNKNOWN',holeOwnership:'UNKNOWN'}}];
  const result={schema:'nctk-late@1',source:{path:source,sha256:sourceSha256},
    s3SnapshotSha256:early.snapshot.sha256,stages,s6:null,
    scope:'Fresh S3 snapshot→native S4→existing G4 global shard recovery→S5 signed major-axis→S6 direct two-ray geometry; no course ownership accepted.'};
  const inputs=buildLateInputs({forkRoot:provider,sourcePath:source,sourceSha256,cropTopPx,s4:base,broadResult:broadOn.result});
  let singletonRun=null,singletonProjection=null,singletonDecisionSha256=null;
  if(singletonOn){
    singletonRun=await runSingletonGateway({provider,adaptedInputs:broad.adaptedInputs,
      sourceSha256,snapshotSha256:early.snapshot.sha256,canonicalRgbaSha256,cropTopPx,
      runId:`${basename(source)}-s4-singleton`});
    singletonProjection=projectSingletonAxes({graph:singletonRun.graph,decisions:singletonRun.decisions,
      baselineAxes:inputs.baselineAxes,guarded:inputs.guarded,cropTopPx});
    // The ON branch inserts propagation before recovery ranking. Native broad
    // winner-first additions remain in its comparison trace, not S5 inputs.
    inputs.baselineAxes.recovered=singletonProjection.axes;
    inputs.refinedAxes.recovered=singletonProjection.axes.map(axis=>({...axis}));
    inputs.warnings.push('Singleton locks are conditional on the native eligible support graph; footer/control fits and target ownership remain physical UNKNOWN.');
    const graphPath=join(out,'s4-singleton-native-graph.json');
    const graphSha256=save(graphPath,{schema:'s4-singleton-native-graph-artifact@1',
      sourceSha256,s3SnapshotSha256:early.snapshot.sha256,graph:singletonRun.graph});
    const decisionsPath=join(out,'s4-singleton-decisions.json');
    singletonDecisionSha256=save(decisionsPath,{schema:'s4-singleton-decision-artifact@1',
      sourceSha256,s3SnapshotSha256:early.snapshot.sha256,
      nativeGraphSha256:graphSha256,decisions:singletonRun.decisions,
      projection:singletonProjection,overlay:{baseSha256:singletonRun.overlay.baseSha256,
        overlaySha256:singletonRun.overlay.overlaySha256,patchSha256:singletonRun.overlay.patchSha256},
      pcr:singletonRun.pcr,seedHashes:singletonRun.seedHashes});
    stages[0].singletonPropagation={id:'s4.singletonPropagation',defaultEnabled:false,enabled:true,
      status:singletonRun.decisions.propagation.status,counts:singletonRun.decisions.counts,
      selectedConditionalAxes:singletonProjection.axes.length,heldConditionalAxes:singletonProjection.held,
      locks:singletonRun.decisions.propagation.locks,conflicts:singletonRun.decisions.propagation.conflicts,
      rounds:singletonRun.decisions.propagation.rounds,
      sourcePart:'px.s4.singleton.candidates',decisionPart:'px.s4.singleton.propagation',
      overlayBaseSha256:singletonRun.overlay.baseSha256,overlaySha256:singletonRun.overlay.overlaySha256,
      nativeReceipts:{pcr:singletonRun.pcr},physicalAcceptance:'UNKNOWN'};
    stages[0].inputPartRefs.push(...singletonRun.seedHashes.map(x=>x.address));
    stages[0].outputPartRefs.push(...singletonRun.outputParts);
    stages[0].evidenceFiles.push({path:graphPath,sha256:graphSha256},
      {path:decisionsPath,sha256:singletonDecisionSha256});
  }
  const boundBasketBridge=bindBasketBridge({receipt:basketBridge,sourcePath:source,sourceSha256,
    snapshotSha256:early.snapshot.sha256,cropTopPx,existingBasketCount:base.baskets.length});
  inputs.basketRecoveryProposals=boundBasketBridge?.proposals??[];
  if(boundBasketBridge){
    stages[0].inputPartRefs.push('px.early.s4.basketTemplate');
    stages[0].outputPartRefs.push(boundBasketBridge.partAddress);
    stages[0].basketRecovery={defaultEnabled:false,selected:true,counts:boundBasketBridge.counts,
      tick:boundBasketBridge.tick,partAddress:boundBasketBridge.partAddress,
      ticks:boundBasketBridge.ticks,partSha256:boundBasketBridge.partSha256,
      invocationOrder:'independent S3 clone gateway executes before the late native S4 port; these Ticks do not share a single serial PCR',
      caveat:boundBasketBridge.caveat};
    stages[0].evidenceFiles.push({path:boundBasketBridge.partPath,sha256:boundBasketBridge.partSha256},
      {path:boundBasketBridge.tickPath,sha256:boundBasketBridge.tickSha256});
  }
  const geometryPath=join(out,'geometry.json');
  const geometrySha256=save(geometryPath,{schema:'nctk-late-source-geometry@1',
    sourceSha256,s3SnapshotSha256:early.snapshot.sha256,frame:'original-jpeg-pixels',
    baselineAxes:inputs.baselineAxes,refinedAxes:inputs.refinedAxes,
    badgePlates:inputs.badgePlates,templateTops:inputs.templateTops,
    basketRecoveryProposals:inputs.basketRecoveryProposals,
    guardedTargetRebindings:inputs.guarded,warnings:inputs.warnings});
  stages[0].evidenceFiles.push({path:geometryPath,sha256:geometrySha256});
  stages[0].broad.counts.selectedObservedShardRecoveries=singletonOn?0:inputs.baselineAxes.recovered.length;
  if(singletonOn)stages[0].broad.counts.comparisonObservedShardRecoveries=broadOn.result.additions.length;
  stages[0].broad.counts.refitRequiredTargetBindings=inputs.guarded.length;
  if(inputs.guarded.length){
    stages[0].unknown.unresolvedHoleReadsAfterBroad=[...new Set([
      ...stages[0].unknown.unresolvedHoleReadsAfterBroad,12])].sort((a,b)=>a-b);
    stages[0].unknown.targetBinding=inputs.guarded.map(g=>({resultRef:g.resultRef,
      fittedTarget:g.fittedTarget,potentialReassignment:g.potentialReassignment,status:g.status}));
  }
  if(Number(until)===4){
    const views=renderRecovery({sourcePath:source,sourceSha256,sourceWidth:early.source.widthPx,
      sourceHeight:early.source.heightPx,inputs,s5Rows:null,outDir:out});
    stages[0].evidenceFiles.push(views.s4,views.s4Cli,...views.detail);return result;
  }
  const dist=name=>require(resolve(provider,'packages/alg/dist',name));
  const {createExecBoard}=dist('exec/board');
  const {compileABFeatureSet,executeABFeatureSet}=dist('exec/feature-set');
  const {composePcr}=dist('exec/pcr');
  async function executeGeometry({axes,stageLimit=6,variant='base'}) {
    const board=createExecBoard();
    for(const [address,value] of [[S5S6_PARTS.s5Axes,axes],[S5S6_PARTS.badgePlates,inputs.badgePlates],
      [S5S6_PARTS.templateTops,inputs.templateTops],[S5S6_PARTS.sourceRgb,inputs.sourceRgb],
      [S5_ASSIGNMENT_PARTS.frame,{width:early.source.widthPx,height:early.source.heightPx}]])board.set(address,value);
    const baseFeatures=createRecoveryBehaviorFeatureSet({topHitPart:assignmentOn?
      S5_ASSIGNMENT_PARTS.resolvedHits:S5S6_PARTS.rayHits});
    const featureSet={...baseFeatures,seededSlots:[...baseFeatures.seededSlots,S5_ASSIGNMENT_PARTS.frame],
      features:[baseFeatures.features[0],createS5AssignmentFeature(),baseFeatures.features[1]]};
    const paramsHash=hash({sourceSha256,s3SnapshotSha256:early.snapshot.sha256,s4BroadPcr:broadOn.pcr.runResultId,
      variant,axes:axes.visible.concat(axes.recovered).map(a=>[a.detId,a.center,a.angleRad,a.resultRef??null]),stageLimit,
      plateMarginPx:2,topPerpLimitPx:16,...(assignmentOn?{assignmentPolicy:'native-sparse-global-max-cardinality-min-distance@1'}:{})});
    const off=compileABFeatureSet(featureSet,{},paramsHash);
    if(off.plan.ops.length!==0)throw Error('S5/S6 feature declarations unexpectedly ON');
    const enabled={s5MajorAxisMetrics:{enabled:true},...(assignmentOn?{s5GlobalAssignment:{enabled:true}}:{}),
      ...(stageLimit===6?{s6TwoRay:{enabled:true}}:{})};
    const on=compileABFeatureSet(featureSet,enabled,paramsHash);
    const manifest=await executeABFeatureSet(on,board,{},
      {runId:`${basename(source)}-${variant}-${paramsHash.slice(0,10)}`,invocation:'runLate explicit ordered recipe'});
    if(manifest.operations.length!==(stageLimit===6?3:2)+Number(assignmentOn))throw Error('S5/S6 Tick cardinality mismatch');
    const s5Pairs=board.get(S5S6_PARTS.s5Pairs);
    const s5Hits=board.get(S5S6_PARTS.rayHits);
    const assignment=assignmentOn?board.get(S5_ASSIGNMENT_PARTS.assignment):null;
    const resolvedHits=assignmentOn?board.get(S5_ASSIGNMENT_PARTS.resolvedHits):s5Hits;
    const s5Pcr=composePcr({id:'S5.axis-badge',title:'Signed two-direction major-axis to badge centroid measures',
      tickIds:['s5.majorAxisBadgeMetrics','s5.twoRayBadgeHits',
        ...(assignmentOn?['s5.globalOneToOneAssignment']:[])]},on.plan,manifest.operations);
    const s6=stageLimit===6?{hits:resolvedHits,rows:board.get(S5S6_PARTS.s6Rows),
      unknown:axes.unknown.map(u=>({...u,status:'UNKNOWN_NO_FITTED_AXIS'})),
      pcr:composePcr({id:'S6.two-ray',title:'Both tee axes intersect badge plates then forward basket tops',
        tickIds:['s6.twoRayBasketTops']},on.plan,manifest.operations)}:null;
    return {paramsHash,offOps:off.plan.ops.length,manifest,s5Pairs,s5Hits,assignment,resolvedHits,s5Pcr,s6};
  }
  const baseRun=await executeGeometry({axes:inputs.baselineAxes,stageLimit:Number(until),variant:'base'});
  const altRun=s5On||s6On?await executeGeometry({axes:inputs.refinedAxes,
    stageLimit:s6On?Number(until):5,variant:'exact-owned-cell-pose'}):null;
  const s5Rows=join(out,'s5-pairs.json');const s5RowsSha256=save(s5Rows,{sourceSha256,
    s3SnapshotSha256:early.snapshot.sha256,paramsHash:baseRun.paramsHash,rows:baseRun.s5Pairs,
    rayBadgeHits:baseRun.s5Hits,alternateRayBadgeHits:altRun?.s5Hits??null,
    alternateRows:altRun?.s5Pairs??null,unknown:inputs.baselineAxes.unknown});
  const assignmentPath=assignmentOn?join(out,'s5-global-assignment.json'):null;
  const assignmentSha256=assignmentOn?save(assignmentPath,{schema:'nctk-s5-global-assignment@1',
    sourceSha256,s3SnapshotSha256:early.snapshot.sha256,paramsHash:baseRun.paramsHash,
    frame:'original-jpeg-pixels',pcr:baseRun.s5Pcr,assignment:baseRun.assignment}):null;
  const pairById=new Map(baseRun.s5Pairs.map(x=>[x.id,x]));
  const deltas=altRun?.s5Pairs.flatMap(x=>{
    const before=pairById.get(x.id);return before?[{id:x.id,beforePerpPx:before.perpendicularPx,
      afterPerpPx:x.perpendicularPx,beforeAngleDeg:before.angleResidualDeg,afterAngleDeg:x.angleResidualDeg,
      deltaPerpPx:x.perpendicularPx-before.perpendicularPx}]:[];
  })??[];
  stages.push({stageId:'S5',imageId:basename(source),sourceSha256,upstreamReceiptHashes:[s4TraceSha256,
    ...(singletonDecisionSha256?[singletonDecisionSha256]:[])],
    inputPartRefs:[S5S6_PARTS.s5Axes,S5S6_PARTS.badgePlates],outputPartRefs:[S5S6_PARTS.s5Pairs,
      S5S6_PARTS.rayHits,...(assignmentOn?[S5_ASSIGNMENT_PARTS.assignment,S5_ASSIGNMENT_PARTS.resolvedHits]:[])],
    featureId:'s5MajorAxisMetrics',defaultEnabled:false,baseInvocation:'explicit ON for the ordered recipe base',
    ticks:ticks(baseRun.s5Pcr),nativeReceipts:{pcr:baseRun.s5Pcr,runId:baseRun.manifest.runId,
      paramsHash:baseRun.paramsHash,offOps:baseRun.offOps},
    counts:{axes:inputs.baselineAxes.visible.length+inputs.baselineAxes.recovered.length,
      visible:inputs.baselineAxes.visible.length,recovered:inputs.baselineAxes.recovered.length,
      pairMeasurements:baseRun.s5Pairs.length,rayDirections:(inputs.baselineAxes.visible.length+inputs.baselineAxes.recovered.length)*2,
      rayCompatibleBadgeHits:baseRun.s5Hits.length,unknownNoAxis:inputs.baselineAxes.unknown.length,
      ...(assignmentOn?{resolvedTeeBadgePairs:baseRun.assignment.selected.length,
        unmatchedBadges:baseRun.assignment.unmatchedBadgeIds.length,
        unusedTeeHypotheses:baseRun.assignment.unusedTeeIds.length}:{}),
      alternateImproved: deltas.filter(d=>d.deltaPerpPx < -1e-9).length,
      alternateRegressed:deltas.filter(d=>d.deltaPerpPx > 1e-9).length},
    unknown:{humanFit:'UNKNOWN',holeOwnership:'UNKNOWN',centerOnly:inputs.baselineAxes.unknown},
    refinement:{id:'s5.exactCellPose',defaultEnabled:false,enabled:s5On||s6On,
      explicitlySelected:s5On,dependencyForS6:s6On&&!s5On,
      operation:'existing minimum-area exact observed pixel-cell rectangle alternate',
      alternativePcr:altRun?.s5Pcr??null,deltas:deltas.filter(d=>Math.abs(d.deltaPerpPx)>1e-9)},
    globalAssignment:assignmentOn?{id:'s5.globalAssignment',defaultEnabled:false,enabled:true,
      graphCoverage:baseRun.assignment.status,physicalAcceptance:baseRun.assignment.physicalStatus,
      selectedHitIds:baseRun.assignment.selected.map(row=>row.hit.id),
      candidateHitCount:baseRun.s5Hits.length,selectedCount:baseRun.assignment.selected.length,
      unmatchedBadgeIds:baseRun.assignment.unmatchedBadgeIds,unusedTeeIds:baseRun.assignment.unusedTeeIds,
      unknownAxes:baseRun.assignment.unknownAxes,scorePolicy:baseRun.assignment.scorePolicy,
      assignmentPath,assignmentSha256}: {id:'s5.globalAssignment',defaultEnabled:false,enabled:false},
    status:assignmentOn?`GRAPH_ASSIGNMENT_${baseRun.assignment.status}_PHYSICAL_UNKNOWN`:
      'RAY_COMPATIBLE_BADGE_GEOMETRY_UNOWNED',
    evidenceFiles:[{path:s5Rows,sha256:s5RowsSha256},
      ...(assignmentOn?[{path:assignmentPath,sha256:assignmentSha256}]:[])],
    durationMs:baseRun.manifest.operations.slice(0,2+Number(assignmentOn)).reduce((n,x)=>n+x.durationMs,0)});
  if(assignmentOn){
    const view=renderAssignment({sourcePath:source,sourceSha256,width:early.source.widthPx,
      height:early.source.heightPx,candidateHits:baseRun.s5Hits,assignment:baseRun.assignment,
      teeAxes:inputs.baselineAxes,badgePlates:inputs.badgePlates,
      outDir:out,runId:baseRun.manifest.runId,paramsHash:baseRun.paramsHash});
    stages[1].evidenceFiles.push(view.svg,view.cli);
  }
  if(Number(until)===5){
    const views=renderRecovery({sourcePath:source,sourceSha256,sourceWidth:early.source.widthPx,
      sourceHeight:early.source.heightPx,inputs,s5Rows:baseRun.s5Pairs,s5Hits:baseRun.s5Hits,
      s5AlternateRows:altRun?.s5Pairs??null,runId:baseRun.manifest.runId,paramsHash:baseRun.paramsHash,outDir:out});
    stages[0].evidenceFiles.push(views.s4,views.s4Cli,...views.detail);
    stages[1].evidenceFiles.push(views.s5,views.s5Cli);return result;
  }
  const s6base=baseRun.s6;
  const s6Rows=join(out,'s6-rows.json');
  const accepted=s6base.rows.filter(r=>r.status==='TWO_RAY_ZERO_BEND_GEOMETRY_CANDIDATE_UNOWNED');
  const s6TraceHash=hash({hits:s6base.hits,rows:s6base.rows,unknown:s6base.unknown});
  const rowSha256=save(s6Rows,{schema:'nctk-s6-rows@1',sourceSha256,s3SnapshotSha256:early.snapshot.sha256,
    runId:baseRun.manifest.runId,paramsHash:baseRun.paramsHash,traceHash:s6TraceHash,
    frame:'original-jpeg-pixels',hits:s6base.hits,rows:s6base.rows,unknown:s6base.unknown,
    ...(assignmentOn?{candidateHits:baseRun.s5Hits,assignment:{selected:true,path:assignmentPath,
      sha256:assignmentSha256,status:baseRun.assignment.status,
      selectedHitIds:baseRun.assignment.selected.map(row=>row.hit.id)}}:{}),
    counts:{rays:(inputs.baselineAxes.visible.length+inputs.baselineAxes.recovered.length)*2,
      plateHits:s6base.hits.length,topEvaluations:s6base.rows.length,candidates:accepted.length,
      rejected:s6base.rows.length-accepted.length,noAxis:s6base.unknown.length},
    caveat:'All candidates unowned. Badge plate bbox is geometry, template top is predicted, RGB is context only.'});
  const altS6=altRun?.s6??null;
  const altAccepted=altS6?.rows.filter(r=>r.status==='TWO_RAY_ZERO_BEND_GEOMETRY_CANDIDATE_UNOWNED')??[];
  const beforeIds=new Set(accepted.map(r=>r.id)),afterIds=new Set(altAccepted.map(r=>r.id));
  const tuple=r=>`${r.teeId}|${r.badgeId}|${r.basketId}`;
  const beforeTuples=new Set(accepted.map(tuple)),afterTuples=new Set(altAccepted.map(tuple));
  const receiptPath=join(out,'s6-receipt.json');
  const receipt={schema:'nctk-s6-receipt@1',sourceSha256,s3SnapshotSha256:early.snapshot.sha256,
    rowPath:s6Rows,rowSha256,paramsHash:baseRun.paramsHash,traceHash:s6TraceHash,
    ...(assignmentOn?{assignment:{path:assignmentPath,sha256:assignmentSha256,
      selectedHitIds:baseRun.assignment.selected.map(row=>row.hit.id)}}:{}),
    s7Seam:assignmentOn?'Top-level hits are only global S5 selected tee→badge rays; original alternatives remain candidateHits. S6 forward-top status never gates S7 bent-path search.':
      'All top-level hits remain eligible unowned tee→badge heading hints for bent-path search; S6 forward-top status never gates S7. Preserve hit ordinal/ambiguity and UNKNOWN.',
    pcr:s6base.pcr,counts:{rays:(inputs.baselineAxes.visible.length+inputs.baselineAxes.recovered.length)*2,
      plateHits:s6base.hits.length,topEvaluations:s6base.rows.length,candidates:accepted.length,
      rejected:s6base.rows.length-accepted.length,noAxis:s6base.unknown.length},
    refinement:{id:'s6.axisPropagation',defaultEnabled:false,enabled:s6On,
      comparisonStatus:altS6?'EXECUTED':'NOT_RUN',
      alternatePcr:altS6?.pcr??null,alternateCandidates:altS6?altAccepted.length:null,
      gained:altS6?altAccepted.filter(r=>!beforeIds.has(r.id)).map(r=>r.id):null,
      lost:altS6?accepted.filter(r=>!afterIds.has(r.id)).map(r=>r.id):null,
      pairingGained:altS6?altAccepted.filter(r=>!beforeTuples.has(tuple(r))).map(tuple):null,
      pairingLost:altS6?accepted.filter(r=>!afterTuples.has(tuple(r))).map(tuple):null,
      pairingPreserved:altS6?altAccepted.filter(r=>beforeTuples.has(tuple(r))).length:null},
    limitation:'S6 direct rays are unowned geometry hints. Negative straight-ray evidence cannot veto bent S7 routes.'};
  const receiptSha256=save(receiptPath,receipt);
  stages.push({stageId:'S6',imageId:basename(source),sourceSha256,upstreamReceiptHashes:[s5RowsSha256],
    inputPartRefs:[S5S6_PARTS.s5Axes,S5S6_PARTS.badgePlates,S5S6_PARTS.templateTops,S5S6_PARTS.s5Pairs,
      S5S6_PARTS.sourceRgb,assignmentOn?S5_ASSIGNMENT_PARTS.resolvedHits:S5S6_PARTS.rayHits],
    outputPartRefs:[S5S6_PARTS.s6Rows],featureId:'s6TwoRay',defaultEnabled:false,
    baseInvocation:'explicit ON for the ordered recipe base',ticks:ticks(s6base.pcr),nativeReceipts:{pcr:s6base.pcr,
      runId:baseRun.manifest.runId,paramsHash:baseRun.paramsHash,offOps:baseRun.offOps},
    counts:receipt.counts,unknown:{humanPath:'UNKNOWN',holeOwnership:'UNKNOWN',centerOnly:s6base.unknown},
    refinement:receipt.refinement,status:'UNOWNED_ZERO_BEND_CANDIDATES',
    evidenceFiles:[{path:s6Rows,sha256:rowSha256},{path:receiptPath,sha256:receiptSha256}],
    durationMs:baseRun.manifest.operations.slice(2+Number(assignmentOn)).reduce((n,x)=>n+x.durationMs,0)});
  const views=renderRecovery({sourcePath:source,sourceSha256,sourceWidth:early.source.widthPx,
    sourceHeight:early.source.heightPx,inputs,s5Rows:baseRun.s5Pairs,s5Hits:baseRun.s5Hits,
    s5AlternateRows:altRun?.s5Pairs??null,s6Result:s6base,s6AlternateResult:s6On?altS6:null,
    altRunId:altRun?.manifest.runId??null,altParamsHash:altRun?.paramsHash??null,
    runId:baseRun.manifest.runId,paramsHash:baseRun.paramsHash,traceHash:s6TraceHash,outDir:out});
  stages[0].evidenceFiles.push(views.s4,views.s4Cli,...views.detail);
  stages[1].evidenceFiles.push(views.s5,views.s5Cli);
  stages[2].evidenceFiles.push(views.s6,views.s6Cli);
  if(views.s6Alt)stages[2].evidenceFiles.push(views.s6Alt,views.s6AltCli);
  result.s6={rowPath:s6Rows,rowSha256,receiptPath,receiptSha256,sourceSha256};
  return result;
}

if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
  const args=Object.fromEntries(process.argv.slice(2).map(x=>x.split('=')));
  const earlyPath=resolve(args['--early']??'');
  if(!args['--early']||!args['--fork-root']||!args['--source']||!args['--out'])throw Error('Usage: --early=RECEIPT --fork-root=ROOT --source=JPEG --out=DIR [--until=4|5|6] [--lanes=s4,s5,s6]');
  runLate({early:JSON.parse(readFileSync(earlyPath)),earlyOutDir:dirname(earlyPath),forkRoot:args['--fork-root'],
    sourcePath:args['--source'],outDir:args['--out'],until:Number(args['--until']??6),
    lanes:(args['--lanes']??'').split(',').filter(Boolean),
    basketBridge:args['--basket-bridge']?JSON.parse(readFileSync(resolve(args['--basket-bridge']))):null})
    .then(x=>console.log(JSON.stringify(x,null,2)))
    .catch(e=>{console.error(e);process.exitCode=1});
}
