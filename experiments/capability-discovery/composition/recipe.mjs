/** Default-OFF measurement composition. No tracker, classifier or production wiring. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { lumOf, profileAt, edgePairOf, OFFS } from '../probes/width/vendor/active/ports/s6straight/pathSpace.mjs';
import { estimateFourLaneCorridorWidth, observeFourLaneCrossSection } from '../probes/width/vendor/dev72/fourLaneRibbon.ts';
import { assessLocalWidth, assessPairedRails } from '../probes/width/recipe.mjs';
export { preserveNonFinite } from '../probes/width/recipe.mjs';
const sha = data => createHash('sha256').update(data).digest('hex');
const finite = v => typeof v === 'number' && Number.isFinite(v);
const named = v => typeof v === 'string' && Boolean(v.trim());
const point = p => p && finite(p.xPx) && finite(p.yPx);
const unknown = reason => ({status:'UNKNOWN',reason});
function invalid(i) {
  if (!named(i.frame)) return 'explicit image pixel frame required';
  if (!i.image || i.image.frame!==i.frame || !Number.isSafeInteger(i.image.width) || i.image.width<1 || !Number.isSafeInteger(i.image.height) || i.image.height<1) return 'positive integer raster dimensions and matching image frame required';
  const count=i.image.width*i.image.height*4, data=i.image.data;
  if (!Number.isSafeInteger(count) || !(Array.isArray(data) || ArrayBuffer.isView(data)) || data.length!==count || !Array.from(data).every(v=>Number.isInteger(v)&&v>=0&&v<=255)) return 'complete finite RGBA byte data required';
  if (!i.provenance || !named(i.provenance.imageId) || !named(i.provenance.geometrySource) || !/^[a-f0-9]{64}$/.test(i.provenance.rgbaSha256??'')) return 'image identifier, exact RGBA SHA256 and geometry provenance required';
  if (sha(Uint8Array.from(data))!==i.provenance.rgbaSha256) return 'RGBA provenance hash mismatch';
  if (!i.training || i.training.frame!==i.frame || !Array.isArray(i.training.segments)) return 'explicit same-frame training segments required (empty allowed)';
  if (i.training.segments.some(s=>!point(s?.tee)||!point(s?.badge)||!finite(Math.hypot(s.badge.xPx-s.tee.xPx,s.badge.yPx-s.tee.yPx))||s.tee.xPx===s.badge.xPx&&s.tee.yPx===s.badge.yPx)) return 'finite nondegenerate tee/badge segments required';
  if (!Array.isArray(i.stations)||i.stations.some(s=>!named(s?.id)||s.frame!==i.frame||!point(s)||![s.headingRad,s.t0Px,s.t1Px].every(finite)||!finite(s.t1Px-s.t0Px)||s.t1Px<=s.t0Px)) return 'finite station poses, nonempty longitudinal windows and matching frames required';
  if (new Set(i.stations.map(s=>s.id)).size!==i.stations.length) return 'unique station identifiers required';
  const b=i.localWidthBank;
  if (!b || b.scope!=='LOCAL' || b.frame!==i.frame || !Array.isArray(b.valuesPx) || b.valuesPx.some(w=>!finite(w)||w<=0||!finite(w+1)||w+1===w)||new Set(b.valuesPx).size!==b.valuesPx.length) return 'explicit distinct positive LOCAL candidate widths in same frame required (empty allowed)';
  if (!i.occluders || i.occluders.frame!==i.frame || !Array.isArray(i.occluders.boxes) || i.occluders.boxes.some(b=>![b?.bboxX,b?.bboxY,b?.bboxW,b?.bboxH].every(finite)||b.bboxW<0||b.bboxH<0||!finite(b.bboxX+b.bboxW)||!finite(b.bboxY+b.bboxH))) return 'finite nonnegative same-frame occluder boxes required';
  if (!i.edgeSearch || !finite(i.edgeSearch.latLimPx)||i.edgeSearch.latLimPx<0||!finite(i.edgeSearch.tolWidthPx)||i.edgeSearch.tolWidthPx<0) return 'explicit finite nonnegative edge-search lateral limit and width tolerance required';
  return null;
}
function verifiedSources() {
  const manifest=JSON.parse(readFileSync(new URL('../probes/width/provenance.json',import.meta.url)));
  return manifest.sources.map(s=>{
    const bytes=readFileSync(new URL(`../probes/width/${s.file}`,import.meta.url));
    if(sha(bytes)!==s.sha256) throw new Error(`frozen source integrity mismatch: ${s.file}`);
    return {...s,verified:true};
  });
}
// Coordinate adapter only: no alpha muting, dilation, fitted weights or new signal.
function boxMask(width,height,boxes) {
  if(!boxes.length) return null;
  const mask=new Uint8Array(width*height);
  for(const b of boxes) for(let y=Math.max(0,Math.ceil(b.bboxY));y<=Math.min(height-1,Math.floor(b.bboxY+b.bboxH));y++) for(let x=Math.max(0,Math.ceil(b.bboxX));x<=Math.min(width-1,Math.floor(b.bboxX+b.bboxW));x++) mask[y*width+x]=1;
  return mask;
}
export function runComposition(input={}) {
  const base={schema:'local-ribbon-composition@1',promoted:false,operationsExecuted:[],localWidth:{status:'UNKNOWN',widthPx:null,reasons:['no calibrated width evidence supplied'],promoted:false},semanticIdentity:unknown('brightness, paired edges and width do not establish path identity or endpoint ownership')};
  if(input.enabled!==true) return {...base,status:'DISABLED',reason:'explicit enabled:true required; prototype defaults OFF'};
  const condition=invalid(input);
  if(condition) return {...base,status:'UNKNOWN',reason:condition};
  const sources=verifiedSources(), {width,height}=input.image, data=Uint8Array.from(input.image.data);
  const image={width,height,data}, boxes=input.occluders.boxes.map(b=>({...b})), bank=[...input.localWidthBank.valuesPx];
  const raster={widthPx:width,heightPx:height,rgba:data}, ctx={W:width,H:height,lum:lumOf(raster),mask:boxMask(width,height,boxes)};
  const operationsExecuted=['lumOf','estimateFourLaneCorridorWidth'];
  const rawWidthEstimate=estimateFourLaneCorridorWidth(image,input.training.segments,boxes,bank);
  // Deliberately supply neither asserted confidence policy nor fabricated held-out evidence.
  const localWidth=assessLocalWidth({estimate:rawWidthEstimate}); operationsExecuted.push('assessLocalWidth');
  const stations=input.stations.map(s=>{
    const origin=[s.xPx,s.yPx];
    const p=profileAt(ctx,origin,s.headingRad,s.t0Px,s.t1Px); operationsExecuted.push('profileAt');
    const candidates=bank.map(widthArgPx=>{
      const observation=observeFourLaneCrossSection(image,{xPx:s.xPx,yPx:s.yPx,headingRad:s.headingRad,corridorWidthPx:widthArgPx},boxes);
      const pairedRails=assessPairedRails(observation);
      const edgeFit=edgePairOf(p,widthArgPx,{latLim:input.edgeSearch.latLimPx,tolW:input.edgeSearch.tolWidthPx});
      operationsExecuted.push('observeFourLaneCrossSection','assessPairedRails','edgePairOf (shared profile; exact requested width)');
      const pair=edgeFit && ['lPx','rPx','cPx','wPx','score','gl','gr'].every(k=>finite(edgeFit[k])) && edgeFit.wPx>0 && edgeFit.gl>0 && edgeFit.gr>0;
      const midpoint=pair?{status:'OBSERVED_CHANNELS',fitMidpointNormalOffsetPx:edgeFit.cPx,candidateCenterMinusFitMidpointPx:-edgeFit.cPx||0,candidateCenterMinusFitMidpointInNominalWidths:-edgeFit.cPx/widthArgPx||0,denominator:'explicit candidate width; not calibrated width',referent:'midpoint of two edges in longitudinally averaged profile; no per-pixel path identity'}:unknown('no finite positive two-edge fit in declared profile window');
      return {widthArgPx,observation,pairedRails,edgeFit,midpoint};
    });
    return {id:s.id,frame:s.frame,pose:{xPx:s.xPx,yPx:s.yPx,headingRad:s.headingRad},window:{t0Px:s.t0Px,t1Px:s.t1Px},profile:{offsetsPx:Array.from(OFFS),meanLum:p.prof?Array.from(p.prof):null,visibleStationCounts:p.ok?Array.from(p.ok):null,stationCount:p.nT},candidates};
  });
  if(sha(data)!==input.provenance.rgbaSha256) throw new Error('source RGBA snapshot mutated by operation');
  const observed=stations.some(s=>s.candidates.some(c=>finite(c.observation.score)||c.midpoint.status==='OBSERVED_CHANNELS'));
  return {...base,status:observed?'OBSERVED_CHANNELS':'UNKNOWN',frame:input.frame,inputProvenance:{...input.provenance,rgbaSha256:sha(data)},sourceProvenance:sources,operationsExecuted,localWidth,rawWidthEstimate,stations,
    units:{geometry:'pixels in named image frame; radians',profile:'RGB mean level per normal offset; unmasked station count',edgeFit:'l/r/c/w in normal pixels; score/gl/gr RGB mean levels per pixel',sensor:'dimensionless uncalibrated lift scores'},
    samplingSeam:'Dev72 uses nearest pixels and tangent bands; JS uses bilinear profiles, box pixel mask and fixed offsets -30..30 at .25px. They are separate observations, not calibrated agreement.',
    boundaries:['no alpha/renderer transparency learning','no width promotion or automatic recentering','no organic-component rejection, course acceptance, endpoint identity or meter scale','profile fits average the declared longitudinal window; they do not prove a two-edge pair at every station']};
}
