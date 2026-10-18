/** Standalone default-OFF source-pixel ROI boundary; no CV signal implementation. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runComposition, preserveNonFinite } from '../composition/recipe.mjs';
export { preserveNonFinite };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const HASH = /^[a-f0-9]{64}$/;
const finite = v => typeof v === 'number' && Number.isFinite(v);
const named = v => typeof v === 'string' && Boolean(v.trim());
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const keys = (v, allowed) => object(v) && Object.keys(v).every(k => allowed.includes(k));
const point = p => keys(p,['xPx','yPx']) && finite(p.xPx) && finite(p.yPx);
function freeze(v) { if (v && typeof v === 'object') { for (const child of Object.values(v)) freeze(child); Object.freeze(v); } return v; }
const base = () => ({schema:'source-pixel-roi@1',promoted:false,operationsExecuted:[],semanticIdentity:{status:'UNKNOWN',reason:'source pixels and supplied geometry do not establish identity'},localWidth:{status:'UNKNOWN',widthPx:null}});
const unknown = reason => freeze({...base(),status:'UNKNOWN',reason});
export class SourcePixelIntegrityError extends Error { constructor(message) { super(message); this.name='SourcePixelIntegrityError'; } }
function condition(i) {
  if (!keys(i,['enabled','source','roi','geometry'])) return 'unsupported top-level fields';
  const s=i.source, image=s?.image, p=s?.provenance, r=i.roi, g=i.geometry;
  if (!keys(s,['image','provenance']) || !keys(image,['width','height','data','frame'])) return 'complete source image required; unsupported source/image fields';
  if (!named(image.frame)||!Number.isSafeInteger(image.width)||image.width<1||!Number.isSafeInteger(image.height)||image.height<1) return 'named source frame and positive safe integer dimensions required';
  const count=image.width*image.height*4, data=image.data;
  if (!Number.isSafeInteger(count)||!(Array.isArray(data)||data instanceof Uint8Array)||data.length!==count||!Array.from(data).every(x=>Number.isInteger(x)&&x>=0&&x<=255)) return 'complete row-major RGBA bytes required';
  if (!keys(p,['imageId','rgbaSha256','sourcePngSha256','decoder'])||!named(p.imageId)||!HASH.test(p.rgbaSha256??'')||!HASH.test(p.sourcePngSha256??'')) return 'image identifier, source PNG SHA256 and full RGBA SHA256 required';
  if (!keys(p.decoder,['name','version','outputMode','sourceMode','orientation','colorTransform','alpha'])||!named(p.decoder.name)||!named(p.decoder.version)||p.decoder.outputMode!=='RGBA') return 'explicit decoder name/version and RGBA output mode required; unsupported decoder fields';
  if (!keys(r,['xPx','yPx','widthPx','heightPx','frame'])||![r.xPx,r.yPx,r.widthPx,r.heightPx].every(Number.isSafeInteger)||r.xPx<0||r.yPx<0||r.widthPx<1||r.heightPx<1||r.xPx+r.widthPx>image.width||r.yPx+r.heightPx>image.height||!named(r.frame)||r.frame===image.frame) return 'explicit distinct crop frame and in-bounds integer ROI required; no clamping/padding';
  if (!keys(g,['frame','geometrySource','training','stations','localWidthBank','occluders','edgeSearch'])||g.frame!==image.frame||!named(g.geometrySource)) return 'same-original-frame geometry testimony required; unsupported geometry fields';
  const t=g.training;
  if (!keys(t,['frame','segments'])||t.frame!==g.frame||!Array.isArray(t.segments)||t.segments.some(s=>!keys(s,['tee','badge'])||!point(s.tee)||!point(s.badge)||!finite(Math.hypot(s.badge.xPx-s.tee.xPx,s.badge.yPx-s.tee.yPx))||s.tee.xPx===s.badge.xPx&&s.tee.yPx===s.badge.yPx)) return 'finite nondegenerate same-frame training required; unsupported training fields';
  if (!Array.isArray(g.stations)||g.stations.some(s=>!keys(s,['id','frame','xPx','yPx','headingRad','t0Px','t1Px'])||!named(s.id)||s.frame!==g.frame||![s.xPx,s.yPx,s.headingRad,s.t0Px,s.t1Px].every(finite)||!finite(s.t1Px-s.t0Px)||s.t1Px<=s.t0Px)||new Set(g.stations.map(s=>s.id)).size!==g.stations.length) return 'finite unique same-frame station poses/windows required; unsupported station fields';
  const b=g.localWidthBank;
  if (!keys(b,['frame','scope','valuesPx'])||b.frame!==g.frame||b.scope!=='LOCAL'||!Array.isArray(b.valuesPx)||b.valuesPx.some(w=>!finite(w)||w<=0||!finite(w+1)||w+1===w)||new Set(b.valuesPx).size!==b.valuesPx.length) return 'explicit distinct positive LOCAL widths required (empty allowed)';
  const o=g.occluders;
  if (!keys(o,['frame','boxes'])||o.frame!==g.frame||!Array.isArray(o.boxes)||o.boxes.some(b=>!keys(b,['bboxX','bboxY','bboxW','bboxH','kind'])||![b.bboxX,b.bboxY,b.bboxW,b.bboxH].every(finite)||b.bboxW<0||b.bboxH<0||!finite(b.bboxX+b.bboxW)||!finite(b.bboxY+b.bboxH))) return 'explicit finite same-frame occluder boxes required; unsupported box fields';
  if (!keys(g.edgeSearch,['latLimPx','tolWidthPx'])||![g.edgeSearch.latLimPx,g.edgeSearch.tolWidthPx].every(v=>finite(v)&&v>=0)) return 'explicit nonnegative edge search required';
  return null;
}
function verifyRecipe() {
  const url=new URL('../../../work/capability-discovery/cycle-02/feature-manifest-E308.json',import.meta.url), bytes=readFileSync(url);
  if (sha(bytes)!=='5b59dce1c7ae87f962c0305697ed883e423bd504fedce5851fb02242309dcf52') throw new SourcePixelIntegrityError('accepted recipe manifest integrity mismatch');
  const manifest=JSON.parse(bytes), entries=[...manifest.files,manifest.existingGuard,...manifest.immutableSources.map(s=>({path:`experiments/capability-discovery/probes/width/${s.file}`,sha256:s.sha256}))];
  for(const e of entries) if(sha(readFileSync(new URL(`../../../${e.path}`,import.meta.url)))!==e.sha256) throw new SourcePixelIntegrityError(`accepted recipe closure integrity mismatch: ${e.path}`);
  return {manifestSha256:sha(bytes),verifiedFiles:entries.length};
}
function support(g,r) {
  const widths=g.localWidthBank.valuesPx;
  const sensorRadius=widths.length?Math.max(...widths.map(v=>{const w=Math.max(1,v);return Math.max(2*w/3,w/2+2.5)+4;})):0;
  const envelopes=[];
  const add=(label,p,radius)=>envelopes.push({label,minX:p.xPx-r.xPx-radius,minY:p.yPx-r.yPx-radius,maxX:p.xPx-r.xPx+radius,maxY:p.yPx-r.yPx+radius});
  for(const [j,s] of g.training.segments.entries()) { add(`training[${j}].tee`,s.tee,sensorRadius);add(`training[${j}].badge`,s.badge,sensorRadius); }
  for(const s of g.stations) {
    if(widths.length) add(`station:${s.id}:sensor`,s,sensorRadius);
    for(const t of [s.t0Px,s.t1Px]) add(`station:${s.id}:profile-window-end`,{xPx:s.xPx+t*Math.cos(s.headingRad),yPx:s.yPx+t*Math.sin(s.headingRad)},30);
  }
  const failures=envelopes.filter(b=>![b.minX,b.minY,b.maxX,b.maxY].every(finite)||!(b.minX>1&&b.minY>1&&b.maxX<r.widthPx-2&&b.maxY<r.heightPx-2));
  return {status:failures.length?'UNKNOWN':'SUPPORTED_CONSERVATIVE_ENVELOPE',method:'full training segments; station window endpoints; isotropic bounds for existing nearest/bilinear footprints; strict JS interior border',profileNormalExtentPx:30,sensorRadiusPx:sensorRadius,envelopes,failures};
}
function prepare(input={}, includeSource=false) {
  if(input?.enabled!==true) return freeze({...base(),status:'DISABLED',reason:'explicit enabled:true required; adapter defaults OFF'});
  const reason=condition(input); if(reason) return unknown(reason);
  // Copy before hash/crop and never expose a mutable backing buffer.
  const full=Uint8Array.from(input.source.image.data), src=input.source.image, p=structuredClone(input.source.provenance), roi=structuredClone(input.roi), g=structuredClone(input.geometry);
  if(sha(full)!==p.rgbaSha256) throw new SourcePixelIntegrityError('full source RGBA hash mismatch');
  const evidence=support(g,roi); if(evidence.failures.length) return freeze({...base(),status:'UNKNOWN',reason:'complete required sampling support absent in declared ROI',support:evidence});
  const crop=new Uint8Array(roi.widthPx*roi.heightPx*4);
  for(let y=0;y<roi.heightPx;y++) { const start=((roi.yPx+y)*src.width+roi.xPx)*4;crop.set(full.subarray(start,start+roi.widthPx*4),y*roi.widthPx*4); }
  const cropSha256=sha(crop), translate=p=>({xPx:p.xPx-roi.xPx,yPx:p.yPx-roi.yPx});
  const compositionInput={enabled:true,frame:roi.frame,image:{width:roi.widthPx,height:roi.heightPx,data:Array.from(crop),frame:roi.frame},provenance:{imageId:p.imageId,rgbaSha256:cropSha256,geometrySource:g.geometrySource},training:{frame:roi.frame,segments:g.training.segments.map(s=>({tee:translate(s.tee),badge:translate(s.badge)}))},stations:g.stations.map(s=>({...s,...translate(s),frame:roi.frame})),localWidthBank:{...g.localWidthBank,frame:roi.frame},occluders:{frame:roi.frame,boxes:g.occluders.boxes.map(b=>({...b,bboxX:b.bboxX-roi.xPx,bboxY:b.bboxY-roi.yPx}))},edgeSearch:g.edgeSearch};
  const sourceInput=includeSource?{enabled:true,frame:g.frame,image:{width:src.width,height:src.height,data:Array.from(full),frame:g.frame},provenance:{imageId:p.imageId,rgbaSha256:p.rgbaSha256,geometrySource:g.geometrySource},training:g.training,stations:g.stations,localWidthBank:g.localWidthBank,occluders:g.occluders,edgeSearch:g.edgeSearch}:undefined;
  return freeze({...base(),status:'PREPARED',support:evidence,input:compositionInput,...(includeSource?{sourceInput}:{}),provenance:{imageId:p.imageId,sourcePngSha256:p.sourcePngSha256,sourcePngVerification:'caller/stager testimony; encoded PNG bytes unavailable to JS adapter',decoder:p.decoder,fullRgbaSha256:sha(full),cropRgbaSha256:cropSha256,originalFrame:src.frame,cropFrame:roi.frame,originalSizePx:{width:src.width,height:src.height},roi,transform:{kind:'integer translation; no resampling',originalToCrop:{xPx:-roi.xPx,yPx:-roi.yPx},cropToOriginal:{xPx:roi.xPx,yPx:roi.yPx}},geometrySource:g.geometrySource}});
}
export function prepareSourcePixelRoi(input={}) { return prepare(input); }
function compareControls(crop,source) {
  const differences=[],absoluteTolerance=1e-9;
  const compare=(a,b,path)=>{
    if(Object.is(a,b)) return;
    if(typeof a==='number'&&typeof b==='number') {
      const absoluteDifference=Math.abs(a-b);
      if(Number.isFinite(a)&&Number.isFinite(b)&&absoluteDifference<=absoluteTolerance) return;
      differences.push({path,crop:preserveNonFinite('',a),source:preserveNonFinite('',b),absoluteDifference:preserveNonFinite('',absoluteDifference)});return;
    }
    if(a&&b&&typeof a==='object'&&typeof b==='object') {
      const fields=new Set([...Object.keys(a),...Object.keys(b)]);
      for(const k of fields) compare(a[k],b[k],`${path}.${k}`);
      return;
    }
    differences.push({path,crop:preserveNonFinite('',a===undefined?{missing:true}:a),source:preserveNonFinite('',b===undefined?{missing:true}:b),absoluteDifference:null});
  };
  compare(crop.rawWidthEstimate,source.rawWidthEstimate,'rawWidthEstimate');
  const channels=r=>r.stations?.map(s=>({id:s.id,profile:s.profile,candidates:s.candidates}));
  compare(channels(crop),channels(source),'stations');
  return {status:differences.length?'UNKNOWN':'MATCHED_DECLARED_CONTROL',absoluteTolerance,differences,reason:differences.length?'same-operation output disagreement; ROI equivalence remains UNKNOWN':'declared raw channels match within fixed numerical tolerance; no semantic or scientific equivalence follows',scope:'raw learner, profiles/counts, candidate observation/pairedRails/edgeFit/midpoint; frame/translated pose metadata excluded'};
}
export function runSourcePixelRoi(input={}) {
  const prepared=prepare(input,true); if(prepared.status!=='PREPARED') return prepared;
  const recipe=verifyRecipe(), result=runComposition(prepared.input), sourceResult=runComposition(prepared.sourceInput);
  if(sha(Uint8Array.from(prepared.input.image.data))!==prepared.provenance.cropRgbaSha256||sha(Uint8Array.from(prepared.sourceInput.image.data))!==prepared.provenance.fullRgbaSha256) throw new SourcePixelIntegrityError('RGBA snapshot changed');
  return freeze({...base(),status:result.status,support:prepared.support,provenance:prepared.provenance,recipe,operationsExecuted:[...result.operationsExecuted,...sourceResult.operationsExecuted],execution:{compositionCalls:2,order:['crop','original-source-frame'],cropOperationCount:result.operationsExecuted.length,sourceOperationCount:sourceResult.operationsExecuted.length},localWidth:result.localWidth,semanticIdentity:result.semanticIdentity,composition:result,sourceComposition:sourceResult,equivalence:compareControls(result,sourceResult)});
}
