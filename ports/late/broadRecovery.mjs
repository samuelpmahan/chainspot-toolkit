/** Port the existing G4 teeRecovery unit onto clean S1–S3 Parts, without rerunning detection. */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const inputNames = ['px.components','badges','px.baskets','px.tees','px.tees.family','px.s4.teeBadge.state'];

export function makeBroadRecovery({ forkRoot, pxc, snapshotSha256, sourceSha256, cropTopPx = 0 }) {
  const dist = name => require(resolve(forkRoot,'packages/alg/dist',name));
  const { teeRecoveryUnit, teeRecoveryFeature } = dist('detectors/threeFactor/features/g3.teeRecovery');
  const { compileABFeatureSet, executeABFeatureSet } = dist('exec/feature-set');
  const { createExecBoard } = dist('exec/board');
  const { composePcr } = dist('exec/pcr');
  const { DEFAULT_SMART_BASKET_OPTIONS } = dist('detectors/threeFactor/smartBasket');
  const sprite = JSON.parse(readFileSync(resolve(forkRoot,'packages/alg/src/detectors/threeFactor/assets/basket-sprite.json')));
  for (const address of inputNames) if (!pxc.has(address)) throw new Error(`S4 broad recovery missing fresh upstream Part ${address}`);
  const fields = pxc.get('px.components');
  const rawBadges = pxc.get('badges');
  const rawBaskets = pxc.get('px.baskets');
  const rawTees = pxc.get('px.tees');
  const teeFamily = pxc.get('px.tees.family');
  const state = pxc.get('px.s4.teeBadge.state');
  if (rawTees.length !== teeFamily.members.length) throw new Error('S4 fresh tee family/object order diverged');
  const badges = rawBadges.map((b,i) => ({ ...b, detId: b.detId ?? `badge-clean-${i}`, cxPx: b.cxPx, cyPx: b.cyPx }));
  if (badges.some(b => !Number.isFinite(b.cxPx) || !Number.isFinite(b.cyPx) || !b.bbox))
    throw new Error('S4 native Badge read lacks target center or bbox');
  const baskets = rawBaskets.map((b,i) => {
    const body = b.has?.detectFamily?.body?.bbox;
    if (!body) throw new Error('S4 native Basket lacks an owned bright-body component');
    return { detId:`basket-clean-${i}`, bbox:b.bbox, whiteBbox:body,
      centerXPx:b.bbox[0]+(b.bbox[2]-1)/2,centerYPx:b.bbox[1]+(b.bbox[3]-1)/2,
      tipXPx:body[0]+sprite.width/2,
      tipYPx:body[1]+sprite.height+DEFAULT_SMART_BASKET_OPTIONS.semanticTipOffsetPx };
  });
  const tees = rawTees.map((t,i) => {
    const { ring, frame } = teeFamily.members[i];
    if (frame.label !== t.has?.findFamily?.frame?.label) throw new Error('S4 clean tee/component identity mismatch');
    return {detId:`tee-clean-${i}`,xPx:t.center[0],yPx:t.center[1],tier:'component',angleRad:t.angleRad,
      bbox:t.bbox,area:frame.area,fill:frame.fill,onRing:true,
      ring:{bbox:t.innerBbox,area:ring.area,elongation:ring.elongation,ringFrac:ring.ringFrac},
      pad:{source:'bright-mask-component',componentLabel:frame.label,bbox:frame.bbox,
        majorPx:frame.major,minorPx:frame.minor,area:frame.area,angleRad:t.angleRad} };
  });
  const sprites = rawBaskets.map((b,i)=>{
    const body=b.has.detectFamily.body.bbox;
    return {x:body[0],y:body[1],cx:baskets[i].centerXPx,cy:baskets[i].centerYPx};
  });
  const badgeByNumber = new Map(badges.map(b=>[Number(b.label),b]));
  const assignment = {assignments:state.resolutions.map(r=>({
    badgeId:badgeByNumber.get(r.hole)?.detId,
    basketId:'UNKNOWN_NATIVE_S4_DOES_NOT_ASSIGN_BASKET'
  })).filter(r=>r.badgeId)};
  const snapshotInputs={ sourceSha256,snapshotSha256,cropTopPx,baseResolutionCount:state.resolutions.length };
  const seed = [
    ['px.s4.broad.stage',{brightLabels:fields.bright.labels,brightComponents:fields.bright.components,
      brightMask:fields.bright.mask,width:fields.bright.mask.width,height:fields.bright.mask.height}],
    ['px.s4.broad.badges',badges],['px.s4.broad.baskets',baskets],['px.s4.broad.tees',tees],
    ['px.s4.broad.sprites',sprites],['px.s4.broad.viewport',{topPx:0}],
    ['px.s4.broad.assignment',assignment],['px.s4.broad.measurement',{rawPairs:[]}],
    ['px.s4.broad.recoveredTees',[]]
  ];
  const addresses=seed.map(([a])=>a);
  const spec={id:'s4.broadShardRecovery',kind:'compute',gate:'S4',unit:'teeRecovery',
    consumes:addresses,produces:['px.s4.broad.result'],calculations:['fn.s4.existingTeeRecoveryUnit'],
    features:['s4BroadRecovery'],accessConformance:'exact',
    note:'Clean S1–S3 Parts adapted to existing global shard-recovery unit; assignment only identifies native S4 provisional targets, and legacy reassignment is disabled with empty rawPairs.'};
  function invoke(board) {
    const lane = createExecBoard();
    const pairNames=[['stage','px.s4.broad.stage'],['badges','px.s4.broad.badges'],
      ['baskets','px.s4.broad.baskets'],['tees','px.s4.broad.tees'],['sprites','px.s4.broad.sprites'],
      ['viewport','px.s4.broad.viewport'],['assignment','px.s4.broad.assignment'],
      ['measurement','px.s4.broad.measurement'],['recoveredTees','px.s4.broad.recoveredTees']];
    for (const [key,address] of pairNames) lane.set(key,board.get(address));
    const overlay=[],measures=[];const occlusionProviders=[];
    const ctx={
      span:()=>()=>{}, measure:(unit,name,value)=>measures.push({unit,name,value}),
      overlay:(unit,mark)=>overlay.push({unit,...mark}),
      resolve:feature=>({enabled:true,knobs:feature.id===teeRecoveryFeature.id?{axisToleranceDeg:3}:
        feature.id==='g4Search'?{recoveredTeeDedupeDistance:14}:{recoveredTeeDedupeDistance:14}}),
      occlusion:{registerOpaque:provider=>occlusionProviders.push(provider),
        kindAt:(x,y)=>occlusionProviders.some(p=>p.kindAt(x,y)==='OPAQUE')?'OPAQUE':'UNKNOWN'}
    };
    teeRecoveryUnit.run(lane,ctx);
    const result={candidates:overlay,measurements:measures,additions:lane.get('recoveredTees'),
      priorAssignments:assignment.assignments,searchScope:'full canonical raster',
      source: snapshotInputs,invocation:'existing teeRecoveryUnit.run; no upstream rerun',
      limitations:['Fresh clean S1–S3 Part schemas are adapted into legacy unit inputs; they are not byte-identical to separate legacy engine measurements.',
        'Native S4 assignment is a provisional tee→badge target filter, not physical ownership.',
        'Legacy global reassignment is deliberately skipped (rawPairs empty): S7 remains independent of perfect endpoint ownership.']};
    board.set('px.s4.broad.result',result);
  }
  const feature={id:'s4BroadRecovery',gate:'S4',kind:'deviation',defaultEnabled:false,knobs:{},operations:[
    {spec,run:invoke,calculationBindings:[{address:spec.calculations[0],calculate:teeRecoveryUnit.run}]}
  ]};
  const featureSet={id:'s4.broad-recovery-from-fresh-pxc',seededSlots:addresses,features:[feature]};
  async function execute({enabled=false,runId='s4-broad'}) {
    const compiled=compileABFeatureSet(featureSet,enabled?{s4BroadRecovery:{enabled:true}}:{},snapshotSha256);
    const board=createExecBoard();for(const [a,v] of seed)board.set(a,v);
    const manifest=await executeABFeatureSet(compiled,board,{}, {runId,invocation:'recovery/broadRecovery.mjs'});
    const result=enabled?board.get('px.s4.broad.result'):null;
    const pcr=enabled?composePcr({id:'s4.broad-recovery',title:'Existing shard recovery from clean S1–S3 Parts',
      tickIds:[spec.id]},compiled.plan,manifest.operations):null;
    return {featureId:feature.id,defaultEnabled:false,enabled,manifest,pcr,result,
      counts: result?{candidateDrawables:result.candidates.length,observedShardRecoveries:result.additions.length}:null};
  }
  // Preserve the exact adapted Part values for optional S4 calculations. This
  // is a typed same-run handoff; callers must still name/read each Part.
  return { execute,featureSet,source:snapshotInputs,adaptedInputs:Object.fromEntries(seed) };
}
