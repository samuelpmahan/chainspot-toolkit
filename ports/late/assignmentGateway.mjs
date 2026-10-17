/** Optional S5 one-to-one resolver over the already measured two-ray hit Part. */
import { resolveS5GlobalAssignment } from './behavior/assignment.mjs';

export const S5_ASSIGNMENT_PARTS=Object.freeze({
  frame:'px.s0.assignmentSourceFrame',
  axes:'px.s5.sealedAxes',
  badges:'px.s1.sealedBadgePlates',
  candidates:'px.s5.rayBadgeHits',
  assignment:'px.s5.globalAssignment',
  resolvedHits:'px.s5.resolvedRayBadgeHits'
});

export function createS5AssignmentFeature(){
  const p=S5_ASSIGNMENT_PARTS;
  const spec={id:'s5.globalOneToOneAssignment',kind:'decide',gate:'S5',unit:'tee-badge-global',
    consumes:[p.axes,p.badges,p.candidates,p.frame],
    produces:[p.assignment,p.resolvedHits],calculations:['fn.s5.resolveGlobalTwoRayAssignment'],
    accessConformance:'exact',features:['s5GlobalAssignment']};
  return {id:'s5GlobalAssignment',gate:'G5',kind:'deviation',defaultEnabled:false,
    resolveOnlyWhenConfigured:true,knobs:{},operations:[{spec,
      calculationBindings:[{address:spec.calculations[0],calculate:resolveS5GlobalAssignment}],
      run(board){
        const frame=board.get(p.frame);
        const assignment=resolveS5GlobalAssignment({sealedAxes:board.get(p.axes),
          badgePlates:board.get(p.badges),rayBadgeHits:board.get(p.candidates),
          sourceWidth:frame.width,sourceHeight:frame.height});
        board.set(p.assignment,assignment);
        board.set(p.resolvedHits,assignment.selected.map(row=>row.hit));
      }}]};
}
