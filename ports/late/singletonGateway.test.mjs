import assert from 'node:assert/strict';
import { projectSingletonAxes } from './singletonGateway.mjs';
import { measureS6RayHits } from './behavior/index.mjs';

// The actual H12-conditioned 100-cell negative control may never be rebound
// as H8 merely because its old rectangle intersects the H8 badge plate.
const pixels=[[1,1],[2,1],[3,1]];
const row={id:'tee-shard-badge-1-149',targetBadgeId:'badge-1',targetHoleRead:'12',
  predicate:{verdict:'accepted',corners:[[0,0],[4,0],[4,2],[0,2]]},
  duplicateCheck:{status:'CLEAR_OF_EXISTING_TEES'},exactFragmentPixels:pixels,
  fragmentPixelCount:pixels.length,candidateSha256:'a'.repeat(64),nativeRank:1};
const projection=projectSingletonAxes({graph:{candidates:[row]},
  decisions:{supportFamilies:[{supportFamilyId:'family',memberCandidateIds:[row.id]}],
    propagation:{locks:[{supportId:'family',holeId:'badge-1',candidateIds:[row.id]}],
      residualQueues:[],conflicts:[]}},baselineAxes:{visible:[],recovered:[]},cropTopPx:0,
  guarded:[{resultRef:row.id,observedPixels:pixels,observedSha256:'observed-hash',
    fittedTarget:'H12',potentialReassignment:'H8'}]});
assert.equal(projection.axes.length,0);
assert.equal(projection.held[0].reason,'REFIT_REQUIRED_TARGET_BINDING');

// A badge-conditioned pose still measures both plates, but its ray-hit Part
// may supply only its fitted target to global assignment and S6.
const sourceRgb={width:100,height:30,data:new Uint8Array(100*30*4)};
const badgePlates=[{detId:'badge-1',holeRead:'12',center:[50,10],plateBbox:[48,8,5,5]},
  {detId:'badge-8',holeRead:'8',center:[70,10],plateBbox:[68,8,5,5]}];
const tee={detId:'recovered',center:[10,10],angleRad:0,
  conditionalTargetBadgeId:'badge-1',conditionalTargetProvenance:row.id};
const args={badgePlates,templateTops:[],sourceRgb};
const conditional=measureS6RayHits({...args,sealedAxes:{visible:[],recovered:[tee],unknown:[]}});
assert.deepEqual([...new Set(conditional.map(x=>x.badgeId))],['badge-1']);
const unconditioned=measureS6RayHits({...args,sealedAxes:{visible:[],recovered:[{
  detId:'visible',center:[10,10],angleRad:0}],unknown:[]}});
assert.deepEqual([...new Set(unconditioned.map(x=>x.badgeId))].sort(),['badge-1','badge-8']);
console.log('singleton target-binding regression PASS');
