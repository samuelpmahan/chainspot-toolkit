/** Source-frame geometry adapters from the fresh S3/S4 Parts and executed S4 trace. */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const GOLDEN_ALEX_SHA='e1b257382f0d459fd6b57366529c6fbb8bfeca9ca3ec580b48cc9959bbdfe976';
const PINNED_H8_FRAGMENT_SHA='8922f444b77ceac246e92d9d81adb9f0d85428ba9bca5606c2f137cf67c39670';
const jsonSha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const offset=(p,top)=>[p[0],p[1]+top];
const bboxOffset=(b,top)=>[b[0],b[1]+top,b[2],b[3]];

export function buildLateInputs({forkRoot,sourcePath,sourceSha256,cropTopPx,s4,broadResult=null}) {
  const dist=name=>require(resolve(forkRoot,'packages/alg/dist',name));
  const {fitMinimumAreaPixelRect}=dist('detectors/threeFactor/features/g3.teeMinAreaPoseMath');
  const {DEFAULT_SMART_BASKET_OPTIONS}=dist('detectors/threeFactor/smartBasket');
  const sprite=JSON.parse(readFileSync(resolve(forkRoot,'packages/alg/src/detectors/threeFactor/assets/basket-sprite.json')));
  const jpeg=require(resolve(forkRoot,'node_modules/jpeg-js'));
  const sourceRgb=jpeg.decode(readFileSync(resolve(sourcePath)),{useTArray:true});
  const firstInkY=sprite.rows.findIndex(row=>row.includes('1'));
  const topXs=[...sprite.rows[firstInkY]].flatMap((v,i)=>v==='1'?[i]:[]);
  const topInkMidX=(topXs[0]+topXs.at(-1))/2;
  const width=s4.canonical.widthPx;
  const seen=new Set();
  const visible=s4.visible.map((tee,i)=>{
    const detId=`tee-clean-${i}`;
    if(seen.has(detId))throw Error('duplicate source tee id');seen.add(detId);
    const measured=fitMinimumAreaPixelRect([...tee.px].map(n=>({xPx:n%width,yPx:Math.floor(n/width)})));
    const corners=measured.accepted?measured.corners.map(p=>[p.xPx,p.yPx+cropTopPx]):null;
    return {detId,center:offset(tee.center,cropTopPx),angleRad:tee.angleRad,
      bbox:bboxOffset(tee.bbox,cropTopPx),corners,
      geometrySource:'S3 observed tee component / PCA major axis',sourceMark:`px.tees[${i}]`,
      observedPixelCount:tee.px.length,axisTaintedByBadgeConstraint:false,
      axisConstraintProvenance:'native S3 visible tee component',
      exactCellPose:measured.accepted?{center:offset([measured.center.xPx,measured.center.yPx],cropTopPx),
        angleRad:measured.angleDeg*Math.PI/180,corners,occupancy:measured.occupancy}:null};
  });
  const recovered=[],guarded=[];
  if (broadResult) {
    const shards=broadResult.candidates.filter(x=>x.type==='pixelSet'&&x.verdict==='accepted'&&x.visualRole==='tee-shard');
    for(const [i,shard] of shards.entries()) {
      const id=shard.ref.replace(/:tee-shard$/,'');
      const addition=broadResult.additions.find(x=>x.provenance?.note?.includes(id));
      if(!addition)throw Error(`S4 accepted shard ${id} lacks exact recovery addition`);
      const corners=Array.from({length:4},(_,j)=>broadResult.candidates.find(x=>x.ref===`${id}:tee-corner-tick-${j}`));
      if(corners.some(c=>!c))throw Error(`${id}: missing coherent four-corner trace`);
      const sourceCorners=corners.map(c=>[c.xPx,c.yPx+cropTopPx]);
      const edge=[sourceCorners[1][0]-sourceCorners[0][0],sourceCorners[1][1]-sourceCorners[0][1]];
      const detId=`tee-shard-fresh-${i}`;if(seen.has(detId))throw Error('duplicate recovered tee');seen.add(detId);
      const observed=shard.pixels.map(p=>offset(p,cropTopPx));
      const measured=fitMinimumAreaPixelRect(observed.map(([x,y])=>({xPx:x,yPx:y})));
      const visibleSet=new Set(observed.map(p=>p.join(',')));
      const cornerSupport=sourceCorners.map((p,index)=>{
        let nearby=false;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(dx*dx+dy*dy<=4&&visibleSet.has(`${Math.round(p[0])+dx},${Math.round(p[1])+dy}`))nearby=true;
        return {index,xy:p,status:nearby?'visible-observed':'inferred',evidence:nearby?'observed shard cells within 2 px':'badge-constrained pose extrapolation'};
      });
      // Pinned negative control: this exact H12-conditioned 100-cell fragment
      // was historically reassigned to H8 without refitting. Keep all cells
      // and the four corners visible, but never promote that pose into H12's
      // measured axis or claim it is a recovered H12 pad.
      const observedSha256=jsonSha(observed);
      if(sourceSha256===GOLDEN_ALEX_SHA&&id==='tee-shard-badge-1-149'){
        if(observed.length!==100||observedSha256!==PINNED_H8_FRAGMENT_SHA)
          throw Error('Known H8/H12 target-binding negative control pixel set drifted; manual reassessment required');
        guarded.push({resultRef:id,observedPixels:observed,observedSha256,corners:sourceCorners,cornerSupport,
          fittedTarget:'badge-1/H12',potentialReassignment:'H8',status:'REFIT_REQUIRED_TARGET_BINDING',
          reason:'Known same 100-cell H12-conditioned rectangle historically reassigned to H8. Original corners remain source-backed evidence, not accepted H8 or H12 geometry.'});
        continue;
      }
      recovered.push({detId,resultRef:id,center:[addition.xPx,addition.yPx+cropTopPx],
        angleRad:Math.atan2(edge[1],edge[0]),bbox:bboxOffset(addition.bbox,cropTopPx),corners:sourceCorners,
        cornerSupport,observedPixelCount:observed.length,observedPixels:observed,
        geometrySource:'fresh existing teeRecoveryUnit accepted observed shard / inferred perimeter',
        axisTaintedByBadgeConstraint:true,axisConstraintProvenance:'badge-conditioned existing G4 recovery',
        conditionalTargetProvenance:id,sourceMark:shard.ref,
        exactCellPose:measured.accepted?{center:offset([measured.center.xPx,measured.center.yPx],0),
          angleRad:measured.angleDeg*Math.PI/180,corners:measured.corners.map(p=>[p.xPx,p.yPx]),occupancy:measured.occupancy}:null});
    }
  }
  const unknown=[];
  // This prior H12 deduction is retained as explicitly separate historical
  // knowledge. It has no fresh S3 observed pixels and no fitted major axis.
  if(sourceSha256===GOLDEN_ALEX_SHA)unknown.push({detId:'H12-center-only-historical',holeRead:'12',
    center:[458,227.5],reason:'INFERRED_CENTER_NO_OBSERVED_FIT; legacy B11 tip minus 0.75 sprite height',
    source:'historical hypothesis, not a fresh S3 object or accepted target binding'});
  const badgePlates=s4.pxc.get('badges').map((badge,i)=>{
    const parts=s4.badges[i].has.findPx.parts;
    const plate=parts.find(p=>p.polarity==='dark')?.bbox??badge.plateBbox??badge.bbox;
    if(!plate)throw Error(`badge ${i} missing actual plate geometry`);
    return {detId:badge.detId,holeRead:badge.label,center:offset([badge.cxPx,badge.cyPx],cropTopPx),
      plateBbox:bboxOffset(plate,cropTopPx),bbox:bboxOffset(badge.bbox,cropTopPx),
      plateGeometryProvenance:parts.some(p=>p.polarity==='dark')?'fresh S1 dark component bbox':'fresh S1 badge bbox fallback',
      sourceMark:`px.badges[${i}]`};
  });
  const templateTops=s4.baskets.map((basket,i)=>{
    const white=basket.has.detectFamily.body.bbox;
    const predictedTip=[white[0]+sprite.width/2,white[1]+sprite.height+DEFAULT_SMART_BASKET_OPTIONS.semanticTipOffsetPx+cropTopPx];
    return {basketId:`basket-clean-${i}`,top:[white[0]+topInkMidX,white[1]+firstInkY+cropTopPx],
      tip:predictedTip,bbox:bboxOffset(basket.bbox,cropTopPx),
      provenance:'fresh S2 bright-body component + pinned basket sprite top row prediction; not independently segmented path ink'};
  });
  for(const item of guarded)unknown.push({detId:`${item.resultRef}-refit`,holeRead:'8',
    center:item.corners.reduce((p,q)=>[p[0]+q[0]/4,p[1]+q[1]/4],[0,0]),
    reason:item.status,source:item.reason});
  const baselineAxes={visible,recovered,unknown};
  const refinedAxes={visible:visible.map(x=>x.exactCellPose?{...x,center:x.exactCellPose.center,angleRad:x.exactCellPose.angleRad,
    corners:x.exactCellPose.corners,geometrySource:'existing minimum-area exact owned-pixel rectangle alternate'}:x),
    recovered:recovered.map(x=>x.exactCellPose?{...x,center:x.exactCellPose.center,angleRad:x.exactCellPose.angleRad,
      corners:x.exactCellPose.corners,geometrySource:'existing minimum-area observed-shard rectangle alternate; completeness unknown'}:x),unknown};
  return {baselineAxes,refinedAxes,badgePlates,templateTops,guarded,sourceRgb,
    warnings:['All fresh S3 tees remain candidate geometry even if native S4 did not resolve their badge. Recovered candidates are additional and may overlap; count is not accuracy.',
      'Exact-cell minimum-area fit is a candidate axis comparison; no antialias physical corner acceptance.',
      'Alex H12 historical center is explicit UNKNOWN, has no observed fit and is excluded from axis arithmetic.',
      'Alex pinned H12-conditioned 100-cell H8 fragment is retained as REFIT_REQUIRED and excluded from adopted recovered axes; no H8 physical geometry is asserted.']};
}
