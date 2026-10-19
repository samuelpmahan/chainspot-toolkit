/** Default-OFF, fixed saved-representation audit. Never imports a producer. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export const INPUT={path:'work/capability-discovery/cycle-09/evidence/E3012/measurement/measurement.json',bytes:1808041,sha256:'fc5da1eb88c0bb572506e815e653c94ddc71ba6d66b8832d513e889477fa95b1'};
const BASE={local:'f101061bd7547f0c350bc8c0f8ce126215047990',canonical:'c0f1205d3e3f66fc1a89fed5e4c3447e7f9045b2',tree:'403b74db31d121a559609ae6a2a3189fdf8de188'};
const GEOMETRY=new URL('../probes/path-geometry/path-geometry.mjs',import.meta.url);
const GEOMETRY_SHA='ba89598ffc830cb2da862b96abefdd16305e244b4737315be65b189b8f982b34';
const GROUPS=['proposed-ribbon','lateral-plus6','bright-organic'];
const FRAMES=['Lenard-1.E802.fixed-roi-source-pixel-centers','Lenard-1.original-source-pixel-centers'];
const PATTERNS=['OOOOO','OOOOO','UOOOO','UUOUU','OOOOO','UUUUO'];
const TOL=1e-9;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const point=p=>Array.isArray(p)&&p.length===2&&p.every(finite);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const requireValue=(condition,message)=>{if(!condition)throw Error(message);};
const errorValue=e=>({name:String(e?.name??'Error'),message:String(e?.message??e)});
function sourcePins(){
  return ['recipe.mjs','recipe.test.mjs','cli.mjs','README.md'].map(path=>{
    const bytes=readFileSync(new URL(path,import.meta.url));return {path:`experiments/capability-discovery/saved-pair-consistency/${path}`,bytes:bytes.length,sha256:sha(bytes)};
  }).concat((()=>{const bytes=readFileSync(GEOMETRY),hash=sha(bytes);requireValue(hash===GEOMETRY_SHA,'geometry dependency SHA256 mismatch');return [{path:'experiments/capability-discovery/probes/path-geometry/path-geometry.mjs',bytes:bytes.length,sha256:hash}];})());
}
/** Pure association/argument adapter; fabricated fixtures never import geometry. */
export function prepareRow(row,index){
  requireValue(Number.isInteger(index)&&index>=0&&index<12,'row index');
  const branch=index<6?'composition':'sourceComposition',local=index%6,group=GROUPS[Math.floor(local/2)],widthPx=local%2?50:42,frame=FRAMES[index<6?0:1];
  requireValue(row?.id===`${branch}/${group}/w${widthPx}`&&row.branch===branch&&row.group===group&&row.widthPx===widthPx&&row.frame===frame,'row/frame/width identity');
  requireValue(Array.isArray(row.midpoint?.slots)&&row.midpoint.slots.length===5&&Array.isArray(row.rawStations),'five slots/rawStations required');
  const ptr=`/rows/${index}`,values=[],slots=[];
  for(let i=0;i<5;i++){
    const s=row.midpoint.slots[i],id=`${group}.short${i+1}`,state=PATTERNS[local][i]==='O'?'OBSERVED':'UNKNOWN';
    requireValue(s?.id===id,'slot identity/order');
    requireValue(s.state===state&&point(s.originPx),'slot state/origin');
    const matches=row.rawStations.map((v,j)=>({v,j})).filter(({v})=>v.id===id);
    requireValue(matches.length===1,'unique rawStation association');
    const {v:station,j:stationIndex}=matches[0];
    requireValue(station.frame===frame&&station.pose?.xPx===s.originPx[0]&&station.pose?.yPx===s.originPx[1]&&finite(station.pose?.headingRad),'rawStation frame/pose association');
    requireValue(Array.isArray(station.candidates),'rawStation candidates');
    const candidates=station.candidates.map((v,j)=>({v,j})).filter(({v})=>v.widthArgPx===widthPx);
    requireValue(candidates.length===1&&same(candidates[0].v,s.rawCandidate),'unique candidate/slot association');
    const c=s.rawCandidate,f=c.edgeFit,m=c.midpoint;
    if(state==='OBSERVED'){
      requireValue(f&&['lPx','rPx','cPx','wPx','score','gl','gr'].every(k=>finite(f[k]))&&f.wPx>0&&f.gl>0&&f.gr>0,'finite positive fitted channels');
      requireValue(m?.status==='OBSERVED_CHANNELS'&&['fitMidpointNormalOffsetPx','candidateCenterMinusFitMidpointPx','candidateCenterMinusFitMidpointInNominalWidths'].every(k=>finite(m[k])),'saved midpoint scalar fields');
      requireValue([s.midpointPx,s.leftPx,s.rightPx].every(point),'observed coordinate pair');
      values.push({left:s.leftPx,right:s.rightPx});
    }else{
      requireValue(s.midpointPx===null&&s.leftPx===null&&s.rightPx===null&&m?.status==='UNKNOWN','UNKNOWN must retain null pair');
      values.push(null);
    }
    slots.push({id,state:s.state,reason:s.reason,originPx:s.originPx,midpointPx:s.midpointPx,leftPx:s.leftPx,rightPx:s.rightPx,
      rawCandidate:{widthArgPx:c.widthArgPx,edgeFit:f,midpoint:m},
      association:{status:'MATCHED',rawStationPointer:`${ptr}/rawStations/${stationIndex}`,candidatePointer:`${ptr}/rawStations/${stationIndex}/candidates/${candidates[0].j}`},
      rawContextPointer:`${ptr}/midpoint/slots/${i}`});
  }
  return {args:{points:slots.map(s=>s.originPx),frame,pairedEdges:{values,provenance:`E3012 ${INPUT.sha256} ${ptr} ${row.id}; fitted pair association/orientation is caller testimony`}},
    projection:{id:row.id,branch,frame,group,nominalWidthPx:widthPx,slots,rawContextPointer:ptr,rawStationsPointer:`${ptr}/rawStations`,
      savedContext:{error:row.midpoint.error,isolatedIds:row.midpoint.isolatedIds,completeFive:row.midpoint.completeFive,
        runs:row.midpoint.runs.map((r,i)=>({stationIds:r.stationIds,points:r.points,sharp:r.sharp,descriptorPointer:`${ptr}/midpoint/runs/${i}/descriptor`})),baselinePointer:`${ptr}/baseline`}}};
}
function comparison(name,actual,expected,tolerance=TOL){
  if(!finite(actual)||!finite(expected))return {name,actual:actual??null,expected:expected??null,residual:null,tolerance,status:'ERROR'};
  const residual=actual-expected;return {name,actual,expected,residual,tolerance,status:Math.abs(residual)<=tolerance?'MATCHED':'DIFFERENT'};
}
function compareSlots(row,descriptor){
  return row.slots.map((s,i)=>{
    const actual=descriptor.centerline.samples?.[i];
    if(s.state==='UNKNOWN'){
      const unknown=actual?.status==='UNKNOWN'&&actual.vertex===i&&Object.keys(actual).every(k=>['vertex','status','reason'].includes(k));
      return {id:s.id,state:s.state,reason:s.reason,status:unknown?'UNKNOWN':'DIFFERENT',checks:[{name:'missingPair',actual:actual??null,expected:'UNKNOWN without zero quantities',status:unknown?'MATCHED':'DIFFERENT'}]};
    }
    const f=s.rawCandidate.edgeFit,m=s.rawCandidate.midpoint,offset=Math.abs(m.candidateCenterMinusFitMidpointPx);
    const checks=[{name:'observedIdentity',actual:{vertex:actual?.vertex??null,status:actual?.status??null},expected:{vertex:i,status:'observed'},status:actual?.vertex===i&&actual?.status==='observed'?'MATCHED':'DIFFERENT'},
      comparison('midpoint.x',actual?.midpointPx?.[0],s.midpointPx[0]),comparison('midpoint.y',actual?.midpointPx?.[1],s.midpointPx[1]),
      comparison('fittedFullWidthPx',actual?.fullWidthPx,f.wPx),comparison('distanceFromMidpointPx',actual?.distanceFromMidpointPx,offset),
      comparison('distanceInFittedFullWidths',actual?.distanceInFullWidths,offset/f.wPx)];
    return {id:s.id,state:s.state,status:checks.every(c=>c.status==='MATCHED')?'MATCHED':'DIFFERENT',checks,
      normalization:{savedSignedPixelOffset:m.candidateCenterMinusFitMidpointPx,savedSignedNominalWidthRatio:m.candidateCenterMinusFitMidpointInNominalWidths,nominalWidthPx:row.nominalWidthPx,fittedWidthPx:f.wPx}};
  });
}
function compareFrames(rows){
  return rows.slice(0,6).map((crop,index)=>{
    const source=rows[index+6],slots=crop.slots.map((s,i)=>{
      const a=crop.descriptor?.centerline.samples?.[i],b=source.descriptor?.centerline.samples?.[i];
      if(s.state==='UNKNOWN')return {id:s.id,status:a?.status==='UNKNOWN'&&b?.status==='UNKNOWN'?'UNKNOWN':'DIFFERENT',unavailable:['midpoint','offset','width','normalization']};
      const checks=[comparison('translatedMidpoint.x',b?.midpointPx?.[0],finite(a?.midpointPx?.[0])?a.midpointPx[0]+400:null),comparison('translatedMidpoint.y',b?.midpointPx?.[1],finite(a?.midpointPx?.[1])?a.midpointPx[1]+1010:null),
        ...['fullWidthPx','distanceFromMidpointPx','distanceInFullWidths'].map(k=>comparison(k,b?.[k],a?.[k])),
        ...[0,1].map(k=>comparison(`offsetVector.${k}`,b?.offsetVectorPx?.[k],a?.offsetVectorPx?.[k]))];
      return {id:s.id,status:checks.every(c=>c.status==='MATCHED')?'MATCHED':'DIFFERENT',checks};
    });
    return {cropRowId:crop.id,sourceRowId:source.id,dependent:true,translationPx:[400,1010],slots,status:slots.some(s=>s.status==='DIFFERENT')?'DIFFERENT':'CONSISTENT_AVAILABLE'};
  });
}
export async function runSavedPairAudit(request){
  const gate=request&&(typeof request==='object'||typeof request==='function')?Object.getOwnPropertyDescriptor(request,'enabled'):null;
  if(!gate)return {status:'DISABLED'};
  requireValue(Object.hasOwn(gate,'value')&&typeof gate.value==='boolean','own boolean enabled required');
  if(!gate.value)return {status:'DISABLED'};
  const result={schema:'saved-pair-consistency@1',status:'REFUSED',runId:null,protocol:{sha256:'6da57b85ba0f9142eab150d67f275ce993214494bd2ec791fc919026c4ad0cbe',amendmentSha256:'2617e445f4371a7eb1a74f39d51bbf3c534dc3f281457824752804e2dc69d39f'},
    input:{...INPUT,sourceBase:BASE,before:null,after:null},sourceBinding:{before:null,after:null},projectionLabel:'Complete audit-used field projection, NOT complete original payload; exact tracked original is authoritative',
    rawContext:{longContext:'/input/longContext',predictions:'/predictions',input:'/input',frameComparisons:'/frameComparisons'},rows:[],frameComparisons:[],savedPredictions:null,
    counts:{attempted:0,completed:0,errors:0,slots:0,observed:0,unknown:0},errors:[],tolerances:{px:TOL,dimensionless:TOL},
    qualifications:{meaning:'Software representation consistency on exposed dependent fitted data only',physicalClaims:'UNKNOWN/HOLD',swapBlindness:'Midpoint/Euclidean width/distance/absolute-offset comparisons cannot detect symmetric left/right swap',normalizedLength:'No width supplied to describePath; fitted pair normalization is separate from signed nominal42/50 ratio',incidentalPolyline:'Returned lengths/turns are retained but are not physical routes or new bend evidence',stop:'Any mismatch/error requires retention and independent validation before repair, tolerance change or rerun'}};
  let bytes,before,admitted=false;
  try{
    requireValue(request&&Object.getPrototypeOf(request)===Object.prototype&&same(Object.keys(request).sort(),['enabled','measurementBytes','runId','schema']),'closed request required');
    for(const k of Object.keys(request))requireValue(Object.hasOwn(Object.getOwnPropertyDescriptor(request,k),'value'),'request data fields required');
    requireValue(request.schema==='saved-pair-consistency-request@1'&&typeof request.runId==='string'&&/^[A-Za-z0-9._:-]{1,64}$/.test(request.runId),'request identity');result.runId=request.runId;
    bytes=request.measurementBytes;
    requireValue(bytes instanceof Uint8Array&&bytes.length===INPUT.bytes&&sha(bytes)===INPUT.sha256,'fixed measurement byte identity');
    result.input.before={bytes:bytes.length,sha256:sha(bytes)};
    const saved=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    requireValue(saved.schema==='window-midpoint-audit@1'&&saved.runId==='E3012'&&saved.paramsHash==='13ab86a4f1631c0fb498e0e183c634275aa78ef3eaa3253f7195ff12bc3ba268'&&Array.isArray(saved.rows)&&saved.rows.length===12,'saved input schema/identity/roster');
    const prepared=saved.rows.map((row,i)=>prepareRow(row,i));
    result.rows=prepared.map(p=>p.projection);result.savedPredictions=saved.predictions;
    result.savedInputIdentity={schema:saved.schema,runId:saved.runId,paramsHash:saved.paramsHash,historicalInputSha256:saved.input.sha256};
    result.counts.slots=60;result.counts.observed=result.rows.flatMap(r=>r.slots).filter(s=>s.state==='OBSERVED').length;result.counts.unknown=60-result.counts.observed;
    requireValue(result.counts.observed===42&&result.counts.unknown===18,'frozen state counts');
    before=sourcePins();result.sourceBinding.before=before;
    const geometry=await import(GEOMETRY.href);requireValue(same(sourcePins(),before),'source changed during import');admitted=true;
    for(let i=0;i<12;i++){
      const row=result.rows[i];result.counts.attempted++;
      try{
        row.descriptor=geometry.describePath(prepared[i].args);result.counts.completed++;
        row.comparisons=compareSlots(row,row.descriptor);
        row.countCheck=comparison('observedPairs',row.descriptor.centerline.observedPairs,row.slots.filter(s=>s.state==='OBSERVED').length,0);
        row.status=row.comparisons.every(s=>s.status==='MATCHED'||s.status==='UNKNOWN')&&row.countCheck.status==='MATCHED'?'CONSISTENT_AVAILABLE':'INCONSISTENT';
      }catch(error){row.error=errorValue(error);row.status='ERROR';result.counts.errors++;result.errors.push({rowId:row.id,...row.error});}
    }
    result.frameComparisons=compareFrames(result.rows);
    const first=result.rows[0].slots[0];result.savedCounterexample={rowId:result.rows[0].id,stationId:first.id,savedSignedOffsetPx:first.rawCandidate.midpoint.candidateCenterMinusFitMidpointPx,hypothesis:'nominal origin equals fitted midpoint',status:'CONTRADICTED_BY_ALREADY_SAVED_NONZERO_OFFSET',newMeasurement:false};
    result.status=result.counts.errors?'ERROR':result.rows.some(r=>r.status!=='CONSISTENT_AVAILABLE')||result.frameComparisons.some(r=>r.status==='DIFFERENT')?'INCONSISTENT':'CONSISTENT';
  }catch(error){result.errors.push(errorValue(error));result.status=admitted?'ERROR':'REFUSED';}
  finally{
    if(bytes instanceof Uint8Array&&result.input.before){result.input.after={bytes:bytes.length,sha256:sha(bytes)};if(!same(result.input.before,result.input.after)){result.errors.push({message:'input bytes changed'});result.status='ERROR';}}
    if(before){try{result.sourceBinding.after=sourcePins();if(!same(before,result.sourceBinding.after))throw Error('source changed during audit');}catch(error){result.errors.push(errorValue(error));result.status='ERROR';}}
  }
  return result;
}
