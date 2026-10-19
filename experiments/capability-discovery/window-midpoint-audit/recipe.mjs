/** Fixed receipt-only posthoc audit. No CV, pixels, fitting or ranking. */
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const RECEIPT=new URL('../../../../discovery-cycle04/P3/E809/receipt.json',import.meta.url);
const GEOMETRY=new URL('../probes/path-geometry/path-geometry.mjs',import.meta.url);
const INPUT_SHA='302e50cb5b60f752eb6f3139a4e6a98c015005203359e0ade5aebb378e1897ba';
const GEOMETRY_SHA='ba89598ffc830cb2da862b96abefdd16305e244b4737315be65b189b8f982b34';
const BRANCHES=[['composition','Lenard-1.E802.fixed-roi-source-pixel-centers'],['sourceComposition','Lenard-1.original-source-pixel-centers']];
const GROUPS=['proposed-ribbon','lateral-plus6','bright-organic'];
const WIDTHS=[42,50], FIT=['lPx','rPx','cPx','wPx','score','gl','gr'];
const DEFINITION='E3003 exploratory |vertex turn| > pi/4; chosen after E809 exposure';
export const PARAMS={branches:BRANCHES,groups:GROUPS,widths:WIDTHS,stations:['short1','short2','short3','short4','short5'],projection:'origin + cPx * [-sin(headingRad),cos(headingRad)]',turnDefinition:DEFINITION,tolerance:1e-9,interpretation:'posthoc exposed-data geometry; identity/continuity/calibrated width UNKNOWN'};
export const paramsHash=sha(JSON.stringify(PARAMS));
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const point=p=>Array.isArray(p)&&p.length===2&&p.every(finite);
function one(values,predicate,label) {
  if(!Array.isArray(values))throw Error(`missing ${label}`);
  const found=values.filter(predicate);
  if(found.length!==1)throw Error(`unique ${label} required`);
  return found[0];
}
function describe(points,frame,widthPx,ops) {
  try {
    const descriptor=ops.describePath({points,frame,width:{fullWidthPx:widthPx,provenance:`E3003 nominal width${widthPx} hypothesis; not calibrated`}});
    return {descriptor,sharp:ops.countTurns(descriptor,{definition:DEFINITION,predicate:t=>t.absoluteRadians>Math.PI/4})};
  } catch(error) {return {descriptor:{status:'ERROR',error:String(error.message)},sharp:null};}
}
function candidateSlot(s,widthPx) {
  const c=one(s.candidates,c=>c.widthArgPx===widthPx,'candidate');
  const p=s.pose, originPx=[p?.xPx,p?.yPx];
  if(!point(originPx)||!finite(p?.headingRad))throw Error(`finite pose required: ${s.id}`);
  const f=c.edgeFit;
  const observed=f&&FIT.every(k=>finite(f[k]))&&f.wPx>0&&f.gl>0&&f.gr>0&&c.midpoint?.status==='OBSERVED_CHANNELS';
  const project=d=>[p.xPx-Math.sin(p.headingRad)*d,p.yPx+Math.cos(p.headingRad)*d];
  const projected=observed?[project(f.cPx),project(f.lPx),project(f.rPx)]:null;
  const ok=observed&&projected.every(point);
  return {id:s.id,state:ok?'OBSERVED':'UNKNOWN',reason:ok?null:observed?'projection not finite':c.midpoint?.reason??'no finite positive two-edge fit',originPx,
    midpointPx:ok?projected[0]:null,leftPx:ok?projected[1]:null,rightPx:ok?projected[2]:null,rawCandidate:c};
}
/** Pure fixed selectors; exported so fabricated missing-run cases need no receipt I/O. */
export function buildRows(receipt,ops) {
  const rows=[];
  for(const [branch,frame] of BRANCHES) {
    const b=receipt[branch];
    if(b?.frame!==frame||b.rawWidthEstimate?.widthPx!==50)throw Error(`fixed branch/frame/learner50 mismatch: ${branch}`);
    for(const group of GROUPS)for(const widthPx of WIDTHS) {
      const rawStations=PARAMS.stations.map(suffix=>one(b.stations,s=>s.id===`${group}.${suffix}`,'station'));
      if(rawStations.some(s=>s.frame!==frame))throw Error('station frame mismatch');
      const slots=rawStations.map(s=>candidateSlot(s,widthPx)),points=slots.map(s=>s.originPx);
      const baseline={points,...describe(points,frame,widthPx,ops)},runs=[],isolatedIds=[],errors=[];
      let pending=[];
      const flush=()=>{
        if(pending.length===1)isolatedIds.push(pending[0].id);
        if(pending.length>=2) {
          const runPoints=pending.map(s=>s.midpointPx),measurement=describe(runPoints,frame,widthPx,ops);
          if(measurement.descriptor.status==='ERROR')errors.push(measurement.descriptor.error);
          runs.push({stationIds:pending.map(s=>s.id),points:runPoints,...measurement});
        }
        pending=[];
      };
      for(const slot of slots) {if(slot.state==='OBSERVED')pending.push(slot);else flush();}flush();
      const completeFive=slots.every(s=>s.state==='OBSERVED')&&runs.length===1&&runs[0].sharp!==null;
      rows.push({id:`${branch}/${group}/w${widthPx}`,branch,frame,group,widthPx,rawStations,baseline,
        midpoint:{slots,runs,isolatedIds,completeFive,error:errors.length?errors.join('; '):null}});
    }
  }
  return rows;
}
function compareFrames(rows) {
  return GROUPS.flatMap(group=>WIDTHS.map(widthPx=>{
    const crop=rows.find(r=>r.branch==='composition'&&r.group===group&&r.widthPx===widthPx);
    const source=rows.find(r=>r.branch==='sourceComposition'&&r.group===group&&r.widthPx===widthPx);
    const residuals=[],unavailable=[];
    const delta=(id,a,b)=>{if(finite(a)&&finite(b))residuals.push({id,residual:b-a});else unavailable.push(id);};
    const descriptor=(id,a,b)=>{
      if(!a||!b||a.status==='ERROR'||b.status==='ERROR'){unavailable.push(id);return;}
      delta(`${id}.lengthPx`,a.lengthPx,b.lengthPx);delta(`${id}.normalizedLength`,a.normalizedLength.value,b.normalizedLength.value);
      for(let i=0;i<Math.max(a.turns.length,b.turns.length);i++) {
        delta(`${id}.turn${i}.signed`,a.turns[i]?.signedRadians,b.turns[i]?.signedRadians);
        delta(`${id}.turn${i}.absolute`,a.turns[i]?.absoluteRadians,b.turns[i]?.absoluteRadians);
      }
    };
    descriptor('baseline',crop.baseline.descriptor,source.baseline.descriptor);
    for(let i=0;i<5;i++)for(const field of ['originPx','midpointPx','leftPx','rightPx']) {
      const a=crop.midpoint.slots[i][field],b=source.midpoint.slots[i][field];
      if(a&&b){delta(`${i}.${field}.x`,a[0]+400,b[0]);delta(`${i}.${field}.y`,a[1]+1010,b[1]);}
      else unavailable.push(`${i}.${field}`);
    }
    for(const a of crop.midpoint.runs) {
      const b=source.midpoint.runs.find(b=>JSON.stringify(b.stationIds)===JSON.stringify(a.stationIds));
      descriptor(`run:${a.stationIds.join(',')}`,a.descriptor,b?.descriptor);
    }
    if(crop.midpoint.runs.length!==source.midpoint.runs.length)unavailable.push('run correspondence');
    const different=residuals.some(r=>Math.abs(r.residual)>1e-9);
    return {group,widthPx,tolerance:1e-9,status:different?'DIFFERENT':unavailable.length?'UNKNOWN':'MATCHED',residuals,unavailable};
  }));
}
function predictions(rows) {
  return BRANCHES.map(([branch])=>{
    const r=rows.find(r=>r.branch===branch&&r.group==='proposed-ribbon'&&r.widthPx===42);
    const available=r.midpoint.completeFive&&r.baseline.sharp!==null;
    return {id:`P1/${branch}`,status:!available?'UNKNOWN':r.baseline.sharp.count===0&&r.midpoint.runs[0].sharp.count>=1?'SUPPORTED':'FALSIFIED',
      definition:DEFINITION,baselineCount:r.baseline.sharp?.count??null,candidateCount:available?r.midpoint.runs[0].sharp.count:null,
      reason:available?'Full-five comparison only; exploratory exposed data':'Unavailable full-five geometry; partial runs cannot satisfy P1'};
  });
}
function file(url,maxBytes,expectedBytes,expectedSha) {
  const stat=statSync(url);if(!stat.isFile()||stat.size>maxBytes||(expectedBytes!==null&&stat.size!==expectedBytes))throw Error('file size/type refused');
  const bytes=readFileSync(url),hash=sha(bytes);
  if(bytes.length!==stat.size||(expectedSha&&hash!==expectedSha))throw Error('file identity mismatch');
  return {bytes,sha256:hash};
}
export async function runAudit(request) {
  const enabled=request&&(typeof request==='object'||typeof request==='function')?Object.getOwnPropertyDescriptor(request,'enabled'):null;
  if(!enabled)return {status:'DISABLED'};
  if(!Object.hasOwn(enabled,'value')||typeof enabled.value!=='boolean')throw Error('own boolean enabled required');
  if(!enabled.value)return {status:'DISABLED'};
  if(Object.getPrototypeOf(request)!==Object.prototype||Reflect.ownKeys(request).length!==3)throw Error('closed request required');
  for(const k of ['schema','enabled','runId']) {const d=Object.getOwnPropertyDescriptor(request,k);if(!d||!Object.hasOwn(d,'value')||!d.enumerable)throw Error('request data fields required');}
  if(request.schema!=='window-midpoint-audit-request@1'||typeof request.runId!=='string'||!/^[A-Za-z0-9._:-]{1,64}$/.test(request.runId))throw Error('request identity refused');
  const sources=[new URL('./recipe.mjs',import.meta.url),new URL('./cli.mjs',import.meta.url),GEOMETRY];
  const before=sources.map(url=>file(url,65536,null,url===GEOMETRY?GEOMETRY_SHA:null).sha256);
  const raw=file(RECEIPT,828263,828263,INPUT_SHA);
  const receipt=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw.bytes));
  const ops=await import(GEOMETRY.href);
  const rows=buildRows(receipt,ops);
  const trace={schema:'window-midpoint-audit@1',runId:request.runId,paramsHash,input:{path:'discovery-cycle04/P3/E809/receipt.json',bytes:raw.bytes.length,sha256:raw.sha256,
    sources:sources.map((url,i)=>({path:url.pathname,sha256:before[i]})),longContext:BRANCHES.map(([branch])=>({branch,stations:GROUPS.map(g=>one(receipt[branch].stations,s=>s.id===`${g}.long`,'long station'))}))},
    rows,frameComparisons:compareFrames(rows),predictions:predictions(rows)};
  sources.forEach((url,i)=>{if(file(url,65536,null,null).sha256!==before[i])throw Error('source changed during audit');});
  if(file(RECEIPT,828263,828263,INPUT_SHA).sha256!==raw.sha256)throw Error('receipt changed during audit');
  return trace;
}
