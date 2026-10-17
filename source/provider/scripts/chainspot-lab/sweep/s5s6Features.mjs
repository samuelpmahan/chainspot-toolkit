/** Reusable default-OFF experiment composition over sealed S4 geometry. */
export function createS5S6FeatureSet({ measurePairs, signedResiduals, measureStraightGeometry,
  axisToTemplateTop, runS5, runS6 }) {
  const s5Spec={id:'s5.axisBadge',kind:'compute',gate:'S5',unit:'s5s6',
    consumes:['px.s4.sealedCapture'],produces:['px.s5.axes','px.s5.pairs'],
    calculations:['fn.S4.axisLocal.measurePairs','fn.s5s6.signedResiduals'],
    accessConformance:'exact',features:['s5AxisBadge'],
    note:'all observed-pad-axis × badge centroid pairs; no ownership gate'};
  const s6Spec={id:'s6.teeBasketStraight',kind:'compute',gate:'S6',unit:'s5s6',
    consumes:['px.s5.axes','px.s5.pairs','px.s4.sealedCapture','px.s0.originalRgb','px.s6.spriteTemplate'],
    produces:['px.s6.topSamples','px.s6.proposals'],
    calculations:['fn.straightTest.measureStraightGeometry','fn.s5s6.axisToTemplateTop'],
    accessConformance:'exact',features:['s6TeeBasketStraight'],
    note:'all S5 pairs × basket template tops, ordered geometry only'};
  const s5Operation={spec:s5Spec,run:runS5,calculationBindings:[
    {address:s5Spec.calculations[0],calculate:measurePairs},
    {address:s5Spec.calculations[1],calculate:signedResiduals}]};
  const s6Operation={spec:s6Spec,run:runS6,calculationBindings:[
    {address:s6Spec.calculations[0],calculate:measureStraightGeometry},
    {address:s6Spec.calculations[1],calculate:axisToTemplateTop}]};
  return {id:'s5s6.capture-experiment',
    seededSlots:['px.s4.sealedCapture','px.s0.originalRgb','px.s6.spriteTemplate'],
    features:[
      {id:'s5AxisBadge',gate:'S5',kind:'deviation',defaultEnabled:false,knobs:{},operations:[s5Operation]},
      {id:'s6TeeBasketStraight',gate:'S6',kind:'deviation',defaultEnabled:false,knobs:{},operations:[s6Operation]}]};
}

export const S5S6_EXPLICIT_ON={s5AxisBadge:{enabled:true},s6TeeBasketStraight:{enabled:true}};
