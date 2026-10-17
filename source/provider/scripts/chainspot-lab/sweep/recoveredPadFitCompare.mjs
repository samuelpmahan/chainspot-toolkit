/** Deterministic evidence calculation. Renderer reads this receipt verbatim. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const sha = b => createHash('sha256').update(b).digest('hex');
const folder = resolve(root, 'artifacts/recovered-pad-fit-20260927');
const rotate = (f,u,v) => [f.centerXPx + u*Math.cos(f.angleRad)-v*Math.sin(f.angleRad),
  f.centerYPx + u*Math.sin(f.angleRad)+v*Math.cos(f.angleRad)];
const corners = f => [rotate(f,-f.halfWidthPx,-f.halfHeightPx),rotate(f,f.halfWidthPx,-f.halfHeightPx),
  rotate(f,f.halfWidthPx,f.halfHeightPx),rotate(f,-f.halfWidthPx,f.halfHeightPx)];
const angle = f => ((f.angleRad*180/Math.PI)%180+180)%180;
function measurements(f,pixels){
  const distances=[],infiniteLineDistances=[];let bandExplained=0,finitePerimeterWithin1_25=0,infiniteLineWithin1_25=0;
  for(const [x,y] of pixels){
    const dx=x-f.centerXPx,dy=y-f.centerYPx,c=Math.cos(f.angleRad),s=Math.sin(f.angleRad);
    const u=Math.abs(dx*c+dy*s),v=Math.abs(-dx*s+dy*c);
    const line=Math.min(Math.abs(u-f.halfWidthPx),Math.abs(v-f.halfHeightPx));
    const finite=u<=f.halfWidthPx&&v<=f.halfHeightPx
      ? Math.min(f.halfWidthPx-u,f.halfHeightPx-v)
      : Math.hypot(Math.max(0,u-f.halfWidthPx),Math.max(0,v-f.halfHeightPx));
    distances.push(finite);infiniteLineDistances.push(line);
    if(finite<=1.25)finitePerimeterWithin1_25++;
    if(line<=1.25)infiniteLineWithin1_25++;
    if(u<=f.halfWidthPx+1.25&&v<=f.halfHeightPx+1.25&&
      (u>=f.halfWidthPx-f.supportThicknessPx-1.25||v>=f.halfHeightPx-f.supportThicknessPx-1.25))bandExplained++;
  }
  distances.sort((a,b)=>a-b);
  infiniteLineDistances.sort((a,b)=>a-b);
  return {bandExplained,finitePerimeterWithin1_25,infiniteLineWithin1_25,
    medianFinitePerimeterDistancePx:distances[Math.floor(distances.length/2)],
    p90FinitePerimeterDistancePx:distances[Math.floor(distances.length*.9)],
    maxFinitePerimeterDistancePx:distances.at(-1),
    medianInfiniteLineDistancePx:infiniteLineDistances[Math.floor(infiniteLineDistances.length/2)],
    angleDegModulo180:angle(f)};
}
for(const name of ['AlexClark-original','IMG_5641']){
  const captureBytes=readFileSync(resolve(root,`artifacts/composed-render-20260927/${name}-capture.json`));
  const posesBytes=readFileSync(resolve(folder,`${name}-poses.json`));
  const capture=JSON.parse(captureBytes),poses=JSON.parse(posesBytes);
  if(sha(captureBytes)!==poses.frozenCaptureSha256||capture.source.sha256!==poses.source.sha256||capture.paramsHash!==poses.paramsHash)
    throw Error('Pose or capture provenance mismatch');
  const rows=poses.matches.map(p=>{
    const marks=capture.marks.filter(m=>m.detail.resultRef===p.resultRef);
    if(marks.length!==1||marks[0].detail.teeId!==p.teeId)throw Error('Wrong or duplicate accepted mark');
    const m=marks[0], pixels=m.geometry.pixels, old=m.geometry.corners;
    const baseline={centerXPx:old.reduce((s,x)=>s+x[0],0)/4,centerYPx:old.reduce((s,x)=>s+x[1],0)/4,
      halfWidthPx:Math.hypot(old[1][0]-old[0][0],old[1][1]-old[0][1])/2,
      halfHeightPx:Math.hypot(old[2][0]-old[1][0],old[2][1]-old[1][1])/2,
      angleRad:Math.atan2(old[1][1]-old[0][1],old[1][0]-old[0][0]),supportThicknessPx:p.fit.supportThicknessPx};
    if(Math.max(...old.flatMap((v,i)=>v.map((n,k)=>Math.abs(n-corners(baseline)[i][k]))))>1e-9)throw Error('Baseline corner reconstruction mismatch');
    const candidateCorners=corners(p.fit),baselineMetrics=measurements(baseline,pixels),candidateMetrics=measurements(p.fit,pixels);
    if(candidateMetrics.bandExplained!==pixels.length)throw Error('Existing accepted support fit fails captured selected pixels');
    return {teeId:p.teeId,resultRef:p.resultRef,holeRead:p.holeRead,source:p.localizationSource,
      pixelCount:pixels.length,pixelSha256:p.pixelHash,pixels,baselineCorners:old,
      constrainedSupportCorners:candidateCorners,baseline:baselineMetrics,constrainedSupport:candidateMetrics,
      supportThicknessPx:p.fit.supportThicknessPx,centerSource:{baseline:[baseline.centerXPx,baseline.centerYPx],
        constrainedSupport:[p.fit.centerXPx,p.fit.centerYPx]},
      comparison:'same provider-selected pixels; hollow support band includes course-derived stroke thickness and 1.25-px raster allowance. Finite-perimeter distance uses Euclidean distance to four finite segments; infinite-line diagnostic is retained separately to audit earlier failed metric. Both measure the selected evidence, not independent accuracy.'};
  });
  const receipt={schema:'recovered-pad-fit-comparison@1',source:poses.source,
    paramsHash:poses.paramsHash,frozenCaptureSha256:sha(captureBytes),poseInputSha256:sha(posesBytes),
    variant:'default-OFF comparison only: baseline emitted corners or constrainedSupport corners from existing acceptance fit',
    rows,negativeControl:poses.negativeControl,
    method:'All input fragments are original-image pixels from accepted G4 PixelSet. Existing G4 fit was computed with the badge ray; changing its emitted corners is an opt-in candidate, not independent evidence of the badge/axis or invisible perimeter. Counts and IDs come from frozen capture; no fragment is added or dropped.'};
  writeFileSync(resolve(folder,`${name}-comparison.json`),JSON.stringify(receipt,null,2));
  console.log(name,rows.map(r=>`H${r.holeRead} ${r.baseline.bandExplained}/${r.pixelCount}->${r.constrainedSupport.bandExplained}/${r.pixelCount}`).join(' · '),`no-fit=${receipt.negativeControl.length}`);
}
