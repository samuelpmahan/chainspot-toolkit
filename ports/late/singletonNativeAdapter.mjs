/** Isolated gateway adapter over the pinned G4 builder; performs no CV of its own. */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const finite = Number.isFinite;

export function enumerateNativePrewinnerGraph({ stage, badges, baskets, tees, sprites, viewport, assignment, identity }, { nativeModulePath }) {
  const expected = '526d4e6fa06a2ad301c5f2a882773890bf692a73b1115b716ced6e5fcb24c4c4';
  const overlayHash = createHash('sha256').update(readFileSync(nativeModulePath)).digest('hex');
  if (identity.nativeOverlaySha256 && identity.nativeOverlaySha256 !== overlayHash) throw new Error('isolated native overlay hash mismatch');
  const actual = createHash('sha256').update(readFileSync(identity.nativeSourcePath)).digest('hex');
  if (actual !== expected || identity.nativeSourceSha256 !== expected) throw new Error('pinned native g3.teeRecovery base hash mismatch');
  const native = require(resolve(nativeModulePath));
  if (!identity?.sourceSha256 || !identity?.snapshotSha256 || !identity?.canonicalRgbaSha256) throw new Error('native graph requires source, S3 snapshot, and canonical RGBA hashes');
  native.setActiveAxisToleranceDeg(3);
  const occlusion = native.createBasketOpaqueProvider(stage, baskets, sprites, viewport.topPx);
  const built = native.buildTeeRecoveryCandidates(stage, badges, baskets, tees, viewport.topPx, { assignment, sprites, occlusion });
  const outputById = new Map(built.candidates.map(candidate => [candidate.id, candidate]));
  const candidates = [];
  for (const outcome of built.searchOutcomes) {
    const all = [...(outcome.winner ? [outcome.winner] : []), ...outcome.runnerUps];
    for (const [rankIndex, raw] of all.entries()) {
      const candidate = raw;
      const postCrossTarget = outputById.get(raw.id);
      const strict = native.evaluateGraphCandidateResult(candidate);
      const center = strict.corners.reduce((p,q) => [p[0]+q[0]/4,p[1]+q[1]/4],[0,0]);
      const nearest = tees.map(t => ({teeId:t.detId,distancePx:Math.hypot(t.xPx-center[0],t.yPx-center[1])})).sort((a,b)=>a.distancePx-b.distancePx)[0] ?? null;
      const existingDuplicate = Boolean(nearest && nearest.distancePx < 14);
      const sourceComponentLabels=[...new Set(candidate.fragmentPixels.map(([x,y])=>stage.brightLabels[y*stage.width+x]).filter(label=>label>0))].sort((a,b)=>a-b);
      const componentByLabel=new Map(stage.brightComponents.map(component=>[component.label,component]));
      const exactFragmentPixels=candidate.fragmentPixels.map(([x,y])=>[x,y+(identity.canonicalToSourceYpx??0)]);
      candidates.push({
        id:candidate.id, candidateId:candidate.id, targetBadgeId:outcome.badgeId, holeId:outcome.badgeLabel ?? null, targetHoleRead:outcome.badgeLabel ?? null,
        nativeGeometryFrame:'canonical-s0-cropped',sourceYTranslationPx:identity.canonicalToSourceYpx??0,
        predicateCoordinateFrameNote:'Native builder coordinates/corners and duplicate distances remain canonical cropped S0 coordinates; exactFragmentPixels/sourceCells add sourceYTranslationPx once. The native result values label coordinateFrame original-image, so that label alone must not be interpreted as a coordinate translation.',
        nativeRank:rankIndex+1, isNativeTargetWinner:raw===outcome.winner,
        fragmentPixels:candidate.fragmentPixels.map(p=>[...p]),
        exactFragmentPixels,sourceCells:exactFragmentPixels,
        sourceCellHash:hash(exactFragmentPixels),
        fragmentPixelCount:candidate.fragmentPixels.length,
        supportingComponentIds:[...candidate.supportingComponentIds],
        sourceComponentLabels,
        sourceComponents:sourceComponentLabels.map(label=>{const c=componentByLabel.get(label);return {label,bbox:c?.bbox??null,area:c?.area??null,cx:c?.cx??null,cy:c?.cy??null};}),
        fit:{...candidate.fit},localizationFit:candidate.localizationFit?{...candidate.localizationFit}:null,
        localizationSource:candidate.localizationSource,
        consideredComponentsGlobal:candidate.consideredComponentsGlobal,
        predicate:{verdict:strict.verdict,reason:strict.reason,values:strict.values,corners:strict.corners,
          crossTargetAmbiguityLostTo:postCrossTarget?.ambiguityLostToBadgeLabel??null},
        duplicateCheck:{thresholdPx:14,nearestExistingTee:nearest,status:existingDuplicate?'DUPLICATE_NEAR_EXISTING_TEE':'CLEAR_OF_EXISTING_TEES',
          rule:'probe compares native result corner centroid to fresh visible tees only; recovered/addition interactions are not claimed'},
        supportFamilyKey:[...new Set(candidate.supportingComponentIds.map(id=>id.split(':')[0]))].sort((a,b)=>Number(a)-Number(b)).join('+'),
        sourceSha256:identity.sourceSha256,snapshotSha256:identity.snapshotSha256,canonicalRgbaSha256:identity.canonicalRgbaSha256,
        candidateSha256:hash({id:candidate.id,pixels:candidate.fragmentPixels,components:candidate.supportingComponentIds,fit:candidate.fit})
      });
    }
  }
  return {schema:'s4-native-prewinner-candidate-graph@1',sourceSha256:identity.sourceSha256,
    snapshotSha256:identity.snapshotSha256,canonicalRgbaSha256:identity.canonicalRgbaSha256,
    nativeSourceSha256:identity.nativeSourceSha256,expectedNativeSourceSha256:expected,
    nativeOverlaySha256:overlayHash,
    axisToleranceDeg:3,basketOpaqueProvider:'pinned basketOpaqueProvider; UNKNOWN for pixels outside exact sprite 1-cells',
    targetCount:built.searchOutcomes.length,consideredComponentCounts:[...new Set(built.searchOutcomes.map(x=>x.consideredComponents))],
    nativeWinnerIds:built.candidates.map(x=>x.id),chromeSubtractionNotes:built.chromeSubtractionNotes,
    candidates};
}

export const NATIVE_GRAPH_PARTS = Object.freeze({
  stage:'px.s4.singleton.stage',badges:'px.s4.singleton.badges',baskets:'px.s4.singleton.baskets',
  tees:'px.s4.singleton.tees',sprites:'px.s4.singleton.sprites',viewport:'px.s4.singleton.viewport',
  assignment:'px.s4.singleton.assignment',identity:'px.s4.singleton.identity',result:'px.s4.singleton.candidates'
});

export function createNativePrewinnerFeatureSet({ nativeModulePath }) {
  const consumes=Object.values(NATIVE_GRAPH_PARTS).filter(x=>x!==NATIVE_GRAPH_PARTS.result);
  const spec={id:'s4.nativePrewinnerCandidateGraph',kind:'compute',gate:'S4',unit:'native-prewinner-candidate-graph',
    consumes,produces:[NATIVE_GRAPH_PARTS.result],calculations:['fn.s4.enumerateNativePrewinnerCandidates'],
    accessConformance:'exact',features:['s4NativePrewinnerGraph'],
    note:'Expose existing native winner+runner-up target fits with exact pixels and the unchanged strict predicate; no CV rewrite.'};
  const calculate=input=>enumerateNativePrewinnerGraph(input,{nativeModulePath});
  const operation={spec,calculationBindings:[{address:spec.calculations[0],calculate}],
    run(board){const input=Object.fromEntries(consumes.map(address=>[address,board.get(address)]));
      board.set(NATIVE_GRAPH_PARTS.result,calculate({
        stage:input[NATIVE_GRAPH_PARTS.stage],badges:input[NATIVE_GRAPH_PARTS.badges],baskets:input[NATIVE_GRAPH_PARTS.baskets],
        tees:input[NATIVE_GRAPH_PARTS.tees],sprites:input[NATIVE_GRAPH_PARTS.sprites],viewport:input[NATIVE_GRAPH_PARTS.viewport],
        assignment:input[NATIVE_GRAPH_PARTS.assignment],identity:input[NATIVE_GRAPH_PARTS.identity]
      },{nativeModulePath}));}};
  return {id:'s4-native-prewinner-candidate-graph',seededSlots:consumes,features:[{
    id:'s4NativePrewinnerGraph',gate:'G4',kind:'deviation',defaultEnabled:false,resolveOnlyWhenConfigured:true,knobs:{},operations:[operation]
  }]};
}
