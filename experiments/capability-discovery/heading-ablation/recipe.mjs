/** Fixed E3006 four-call experiment; default OFF, no production wiring. */
import {openSync,fstatSync,readSync,closeSync,constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {encodeBytes} from '../station-evidence/codec.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const ROOT=new URL('./',import.meta.url), RASTER='px.image.cropped',MASK='tk.s6.pathMask';
const PHI=-0.20539538918976738, WIDTH=1290,HEIGHT=2796,RGBA_BYTES=14427360;
const FRAME='Lenard-5.original-source-pixel-centers';
const RGBA_SHA='4379abb30a5b0907aa0e1435b13e19eafe8fdd31ac57c9b8bdff4495a14fdc2a';
const GROUPS=[['primary',780,906,-0.5947449408418812,42.26372284910734,-0.26554589467489287],
  ['bright-nonpath',780,740,6.512793849318173,43.74145492884304,-0.4545519493150654]];
const INPUTS=[
  ['protocol','../../../../discovery-cycle09/E3006/findings.md',7351,'ac488338b6af073ec41714ab33335cb94a58f3a13d173ec41651af3558697df3'],
  ['review','../../../../discovery-cycle09/R3006/review.md',959,'4101b72b6fbeb2967ea942b5a63c412ce6aed2c3a8de2a63abd5cb758fd4a2a7'],
  ['attestation','../../../../discovery-cycle06/G1/E1501/staging-attestation.json',4252,'9f1cb90eed3c74214c9a03029730ea1ab487c48bd86b89cbe3a701eebe923ef1'],
  ['png','../../../../discovery-cycle06/G1/E1501/Lenard-5.original.png',3943106,'30fa01879840deb0584ffe001fa39779998710010faeae93510dbc7a8a0abe6e'],
  ['rgba','../../../../discovery-cycle06/G1/E1501/Lenard-5.full.rgba',RGBA_BYTES,RGBA_SHA]
];
const SOURCES=[
  ['../probes/width/vendor/active/ports/s6straight/pathSpace.mjs','d0fb2bf5076a386a5c362b8fe034ab49ba5318fda2bd21eb74d30334ed6a105e'],
  ['../probes/width/vendor/active/contracts/alpha.profile@1.mjs','9d1f316af6af2887e0c59bd7a2b0bc13d3305a817cfb6efffb42c8f3b238396f'],
  ['../probes/root-inventory/source/fg/store.mjs','122d624e0311e18f596db37bf292d9c31f47a364e75c8808ca6788c3449a3074'],
  ['../probes/root-inventory/source/fg/pxset.mjs','01e68e82741d4af56901b3306a304ca540e8ab0d73a12ba20a0afbe0e788f5d5'],
  ['../probes/root-inventory/source/fg/render.mjs','39a24a645c222430464592546eb6bdc1a8b190902ed5708ecd951b0bb639315a'],
  ['../probes/root-inventory/source/fg/canon.mjs','3cc0319f4678eaf8679adcbfaa9db054841417a966c079019b0f72e24ba24406'],
  ['../probes/root-inventory/source/fg/png.mjs','7668bab9de6a19a2cc6f44e5ac47d6e89373da130764365cf32011187a980241'],
  ['../probes/root-inventory/source/fg/alpha/alphaRender.mjs','4d17e1da77b1e5ceb6a4a2609d26c010caa6c43df8392e9599544299d9e1c549'],
  ['../probes/root-inventory/source/contracts/alpha.profile@1.mjs','9d1f316af6af2887e0c59bd7a2b0bc13d3305a817cfb6efffb42c8f3b238396f'],
  ['../station-evidence/codec.mjs','3cba80fa24f1ff9ae30f5a24fbcc8c4b29944304a03447252d6172448fdd7015'],
  ['recipe.mjs',null],['cli.mjs',null],['render.mjs',null]
];
const CONSTANT='fn.input.headingAblation',CALLER='heading-ablation-fixed4';
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const wire=v=>JSON.parse(new TextDecoder().decode(encodeBytes(v,{maxNodes:20000,maxTypedBytes:65536,maxBytes:131072})));
const display=v=>typeof v==='number'&&!Number.isFinite(v)?Number.isNaN(v)?'NaN':v>0?'+Infinity':'-Infinity':v??null;
const err=(e,phase)=>({name:String(e?.name??'Error'),message:String(e?.message??e).slice(0,2048),phase});
function closed(v,keys) {
  if(!v||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)throw Error('closed ordinary request required');
  for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d||!Object.hasOwn(d,'value')||!d.enumerable)throw Error('own enumerable request data required');}
}
function enabled(v) {
  const d=v&&(typeof v==='object'||typeof v==='function')?Object.getOwnPropertyDescriptor(v,'enabled'):null;
  if(!d)return false;
  if(!Object.hasOwn(d,'value')||typeof d.value!=='boolean')throw Error('own boolean enabled required');
  return d.value;
}
function validate(v) {
  if(!enabled(v))return null;
  closed(v,['schema','enabled','runId']);
  if(v.schema!=='heading-ablation-request@1'||typeof v.runId!=='string'||!/^[A-Za-z0-9._:-]{1,64}$/.test(v.runId))throw Error('request identity refused');
  return {schema:v.schema,enabled:true,runId:v.runId};
}
function read(relative,max,exact=null,expected=null,retain=false) {
  const path=fileURLToPath(new URL(relative,ROOT));let fd;
  try{
    fd=openSync(path,constants.O_RDONLY|constants.O_NONBLOCK);const s=fstatSync(fd);
    if(!s.isFile()||!Number.isSafeInteger(s.size)||s.size<0||s.size>max||(exact!==null&&s.size!==exact))throw Error('regular bounded file length required');
    const hash=createHash('sha256'),bytes=retain?new Uint8Array(s.size):null,chunk=new Uint8Array(Math.max(1,Math.min(65536,s.size)));let offset=0;
    while(offset<s.size){const n=readSync(fd,chunk,0,Math.min(chunk.length,s.size-offset),offset);if(!n)throw Error('file truncated');hash.update(chunk.subarray(0,n));if(bytes)bytes.set(chunk.subarray(0,n),offset);offset+=n;}
    if(readSync(fd,chunk,0,1,offset)!==0||fstatSync(fd).size!==s.size)throw Error('file length changed');
    const sha256=hash.digest('hex');if(expected!==null&&sha256!==expected)throw Error('file SHA256 mismatch');
    return {binding:{path,bytes:s.size,sha256},bytes};
  }finally{if(fd!==undefined)closeSync(fd);}
}
function sourceHashes(){return SOURCES.map(([path,expected])=>read(path,131072,null,expected).binding);}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
/** Pure fixed metadata; never opens inputs or imports gateway. */
export function planHeadingQueries(){return GROUPS.flatMap(([groupId,x,y,c,widthPx,candidate])=>['baseline','candidate'].map(arm=>({
  planIndex:GROUPS.findIndex(g=>g[0]===groupId)*2+(arm==='candidate'?1:0),id:`${groupId}/${arm}`,groupId,arm,query:'fn.q.path.stationContrast',
  rawArgs:{raster:RASTER,mask:MASK,originPx:[x-c*Math.sin(PHI),y+c*Math.cos(PHI)],phiRad:arm==='baseline'?PHI:candidate,t0Px:-8,t1Px:8,stepPx:1,widthPx,bandPx:[1,3],alongPx:2}
})));}
const PLAN=planHeadingQueries();
export const paramsHash=sha(JSON.stringify(PLAN));
function station(answer,index){
  const keys=['leftLum','rightLum','okLeft','okRight'];
  const shape=!!answer&&keys.every(k=>Array.isArray(answer[k])&&answer[k].length===16);
  const values=Object.fromEntries(keys.map(k=>[k,answer?.[k]?.[index]??null]));
  const badFlags=[];if(!shape)badFlags.push('shape');if(answer?.stationsCount!==16)badFlags.push('stationsCount');
  for(const k of ['leftLum','rightLum'])if(!finite(values[k]))badFlags.push(k);
  for(const k of ['okLeft','okRight'])if(values[k]!==1)badFlags.push(k);
  return {...values,badFlags,valid:badFlags.length===0,minLum:finite(values.leftLum)&&finite(values.rightLum)?Math.min(values.leftLum,values.rightLum):null};
}
/** Pure paired all16 gate. Raw sides are never dropped to improve the mean. */
export function evaluatePrediction(answers){
  const groups=GROUPS.map(([groupId],g)=>{
    const stations=Array.from({length:16},(_,index)=>{const b=station(answers?.[g*2],index),c=station(answers?.[g*2+1],index);
      const difference=b.minLum!==null&&c.minLum!==null?c.minLum-b.minLum:null;
      return {index,tPx:-8+index,baseline:b,candidate:c,difference:display(difference),valid:b.valid&&c.valid&&finite(difference)};});
    const valid=Array.isArray(answers)&&answers.length===4&&stations.every(s=>s.valid),D=valid?stations.reduce((sum,s)=>sum+s.difference,0)/16:null;
    return {groupId,status:valid&&finite(D)?'VALID':'UNKNOWN',D:finite(D)?D:null,stations};
  });
  const [Dprimary,Dbright]=groups.map(g=>g.D),valid=groups.every(g=>g.status==='VALID');
  return {status:!valid?'UNKNOWN':Dprimary>0&&Dprimary>Dbright?'SUPPORTED':'FALSIFIED',Dprimary,Dbright,groups};
}
/** Public gateway returns envelopes; keep this boundary identical for fixtures and execution. */
export function evaluatePublicPrediction(envelopes){return evaluatePrediction(envelopes.map(answer=>answer?.value));}
function renderRows(prediction){return PLAN.map((plan,i)=>{
  const group=prediction.groups[Math.floor(i/2)],side=plan.arm;
  const stations=group.stations.map(s=>{const v=s[side];return {id:`${plan.id}/station${s.index}`,index:s.index,tPx:s.tPx,originPx:[...plan.rawArgs.originPx],headingDeg:plan.rawArgs.phiRad*180/Math.PI,
    leftLum:display(v.leftLum),rightLum:display(v.rightLum),minLum:display(v.minLum),okLeft:display(v.okLeft),okRight:display(v.okRight),badFlags:[...v.badFlags],deltaFromBaseline:plan.arm==='baseline'?(s.difference===null?null:0):display(s.difference)};});
  const valid=group.stations.every(s=>s[side].valid),mean=valid?group.stations.reduce((sum,s)=>sum+s[side].minLum,0)/16:null;
  return {id:plan.id,groupId:plan.groupId,arm:plan.arm,sourceId:'Lenard-5.full.rgba',originPx:[...plan.rawArgs.originPx],headingDeg:plan.rawArgs.phiRad*180/Math.PI,rawArgs:plan.rawArgs,stations,
    aggregate:{status:valid&&finite(mean)?'VALID':'UNKNOWN',minLum:finite(mean)?mean:null,deltaFromBaseline:group.status==='VALID'?(plan.arm==='baseline'?0:group.D):null}};
});}
/** Enabled route alone reads original files, then imports and makes exactly four calls. */
export async function runHeadingAblation(input){
  const trace={schema:'heading-ablation-trace@1',runId:null,imageId:'Lenard-5',paramsHash,status:'DISABLED',error:null,plannedQueries:[],calls:[],sourceBinding:{before:null,afterImport:null,after:null},inputBinding:{before:[],after:[],canonical:null},
    counts:{attempted:0,completed:0,callbacks:0},prediction:evaluatePrediction([]),renderRows:[],claims:{promoted:false,pathIdentity:'UNKNOWN',physicalEdgeIdentity:'UNKNOWN',AAAlpha:'UNKNOWN',confidence:'UNKNOWN',qualification:'conditional in-sample sampling evidence; rotation changes support'}};
  let phase='validation',request=null,rgba=null,before=null;const answers=[];
  const failure=(error,at)=>{trace.error??=err(error,at);trace.status=trace.counts.attempted?'PARTIAL_FAILED':'NOT_EXECUTED';};
  try{
    request=validate(input);if(!request)return trace;trace.runId=request.runId;trace.status='NOT_EXECUTED';trace.plannedQueries=planHeadingQueries();
    phase='source-before';before=sourceHashes();trace.sourceBinding.before=before;
    phase='input-before';for(const [role,path,bytes,hash]of INPUTS){const loaded=read(path,bytes,bytes,hash,role==='rgba');trace.inputBinding.before.push({role,...loaded.binding});if(role==='rgba')rgba=loaded.bytes;}
    trace.inputBinding.canonical={pre:sha(rgba),post:null,verified:null};
    phase='import';const [{createPartStore,registerQueries},{PATH_QUERIES}]=await Promise.all([import('../probes/root-inventory/source/fg/store.mjs'),import('../probes/width/vendor/active/ports/s6straight/pathSpace.mjs')]);
    trace.sourceBinding.afterImport=sourceHashes();if(!same(before,trace.sourceBinding.afterImport))throw Error('source changed during import');
    for(const plan of PLAN){
      phase='snapshot';const privateRGBA=Uint8Array.from(rgba);const row={planIndex:plan.planIndex,id:plan.id,state:'NOT_ATTEMPTED',rawArgs:structuredClone(plan.rawArgs),units:'lum per station (inside band minus outside band), per side',nativeAnswer:null,callbackSeen:[],callbackEntries:[],callbackEncodingErrors:[],identity:{frame:FRAME,widthPx:WIDTH,heightPx:HEIGHT,mask:null,partKeys:{[RASTER]:null,[MASK]:null}},integrity:{pre:sha(privateRGBA),post:null,verified:null},error:null};trace.calls.push(row);
      try{
        if(row.integrity.pre!==RGBA_SHA)throw Error('private snapshot mismatch');
        phase='registration';const store=createPartStore({base:null,name:plan.id,onCall:entry=>{
          // Observe native exit before risky serialization. Never turn an observer failure into a native throw.
          row.callbackSeen.push({seq:entry.seq,parent:entry.parent,calculation:entry.calculation,status:entry.status});trace.counts.callbacks++;
          try{if(row.callbackSeen.length>2)throw Error('callback count cap exceeded');row.callbackEntries.push(wire(entry));}catch(error){row.callbackEncodingErrors.push(err(error,'callback-encoding'));}
        }});
        store.constant(CONSTANT,{[RASTER]:Object.freeze({widthPx:WIDTH,heightPx:HEIGHT,rgba:privateRGBA}),[MASK]:null});registerQueries(store,PATH_QUERIES);
        phase='query';row.state='ATTEMPTED';trace.counts.attempted++;
        try{
          const answer=store.call(plan.query,structuredClone(plan.rawArgs),{caller:CALLER});if(answer&&typeof answer.then==='function')throw Error('asynchronous answer refused');
          row.state='COMPLETED';trace.counts.completed++;phase='answer-encode';
          try{row.nativeAnswer=wire(answer);answers[plan.planIndex]=structuredClone(answer);}catch(error){
            row.answerEncodingError=err(error,'answer-encode');
            if(row.callbackEncodingErrors.length){phase='callback-encoding';throw Error(row.callbackEncodingErrors[0].message);}throw error;
          }
          if(row.callbackEncodingErrors.length){phase='callback-encoding';throw Error(row.callbackEncodingErrors[0].message);}
        }
        finally{for(const address of [RASTER,MASK])row.identity.partKeys[address]=store.provenance(address)?.key??null;}
      }catch(error){
        if(row.state==='ATTEMPTED'){row.nativeError=err(error,phase);row.state='THREW';}
        // A nested constant observer can fail before the enclosing native query throws.
        if(row.callbackEncodingErrors.length){phase='callback-encoding';row.error=row.callbackEncodingErrors[0];throw Error(row.error.message);}
        row.error=err(error,phase);throw error;
      }
      finally{row.integrity.post=sha(privateRGBA);row.integrity.verified=row.integrity.post===row.integrity.pre;if(!row.integrity.verified){row.integrity.error=err(Error('private input mutation'),'private-input-after');if(!row.error){phase='private-input-after';throw Error('private input mutation');}}}
    }
    trace.status='COMPLETED';
  }catch(error){failure(error,phase);}
  finally{
    if(rgba){trace.inputBinding.canonical.post=sha(rgba);trace.inputBinding.canonical.verified=trace.inputBinding.canonical.post===RGBA_SHA;if(!trace.inputBinding.canonical.verified)failure(Error('canonical input mutation'),'input-after');}
    if(request){
      for(const [role,path,bytes,hash]of INPUTS){try{trace.inputBinding.after.push({role,...read(path,bytes,bytes,hash).binding});}catch(error){failure(error,'input-after');trace.inputBinding.after.push({role,error:err(error,'input-after')});}}
      if(before)try{trace.sourceBinding.after=sourceHashes();if(!same(before,trace.sourceBinding.after))throw Error('source changed after run');}catch(error){failure(error,'source-after');}
      try{if(!same(request,validate(input)))throw Error('request changed');}catch(error){failure(error,'request-after');}
      trace.prediction=evaluatePublicPrediction(answers);if(trace.status!=='COMPLETED')trace.prediction.status='UNKNOWN';trace.renderRows=renderRows(trace.prediction);
    }
  }
  return trace;
}
