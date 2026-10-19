/** Closed default-OFF original-evidence binding operation. No CLI, writer, CV or store. */
import { openSync, closeSync, readSync, fstatSync, lstatSync, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { fixedSlots, bindPlan } from './plan-core.mjs';

const ROOT='/workspace/scratch/8528bb251845';
const LAB=`${ROOT}/chainspot-discovery-lab`;
const RAW=`${ROOT}/discovery-cycle06/G5/E1510/producer-v1`;
const TOKEN='cycle07-E2006-original-evidence-plan-v1';
const MAX_READ=8388608,MAX_OUTPUT=2097152;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const refuse=why=>{throw new Error(`INTEGRITY_STOP: ${why}`);};
const own=(o,k)=>Object.hasOwn(o,k);
const PIN=Object.freeze({
  protocol:{path:`${ROOT}/discovery-cycle07/S1/E2005/protocol.v2.json`,bytes:83022,sha256:'7948df5ee19e10a065f907a7dc0af1b845b5b408f32776b78813ad938bedea6e'},
  input:{path:`${ROOT}/discovery-cycle06/G5/E1510/manifest.v1.json`,bytes:367,sha256:'4ae5f021bc3c9be8184cdb0627abdacabae9d7c8dcff88a12b404762843bbe9f'},
  manifest:{path:`${RAW}/artifact-manifest.json`,bytes:87118,sha256:'f85df68d1b34ce2464dcec869c023f0bb10a0240cf9f750ca1a0b23e0151064f'},
  trace:{path:`${RAW}/value-trace.json`,bytes:2094896,sha256:'a2333d711ce5e46d5c13b8949c0027d3a67c91e5802b911f6bf62b1b33950d21'},
  sidecar:{path:`${RAW}/timing-sidecar.json`,bytes:181123,sha256:'2ce4fc7faa1c94f7dff078de7b5e5129c0876764012a82dc7b7691f0afde1fb0'},
  freeze:{path:`${ROOT}/discovery-cycle06/root-source-admission.json`,bytes:6356,sha256:'6f3f30924749e0104a12e7d5d3d43b45b23569e55de8ffe565111620dd0355b8'},
  originalProtocol:{path:`${LAB}/work/capability-discovery/cycle-05/capture/final/F2/E1104/protocol-proposal.json`,bytes:12718,sha256:'cb4d757f36ffe6721e71541d6093a48cc11e081bd10c1684746aad8249973829'},
  attestation:{path:`${ROOT}/discovery-cycle06/G1/E1501/staging-attestation.json`,bytes:4252,sha256:'9f1cb90eed3c74214c9a03029730ea1ab487c48bd86b89cbe3a701eebe923ef1'},
  receipt:{path:`${ROOT}/discovery-cycle06/R1/R1513/result.json`,bytes:605076,sha256:'0002f0c25157073eced2c6a4008abbd2a2feca268b863536160ba9069e8441c8'},
  shapeAuthority:{path:`${ROOT}/discovery-cycle07/S2/E2002/result.json`,bytes:12400,sha256:'4cbf7d093bbad21454474cdbca8372565708f574f4273832f30cc7a8035fd40d'},
  codec:{path:`${LAB}/experiments/capability-discovery/station-evidence/codec.mjs`,bytes:7322,sha256:'3cba80fa24f1ff9ae30f5a24fbcc8c4b29944304a03447252d6172448fdd7015'}
});

function noSymlinkPath(path) {
  const absolute=resolve(path);let current=sep;
  const pieces=absolute.split(sep).filter(Boolean);
  for(let i=0;i<pieces.length;i++) {
    current=resolve(current,pieces[i]);const s=lstatSync(current);
    if(s.isSymbolicLink()||(i<pieces.length-1&&!s.isDirectory()))refuse('symlink/non-directory path component');
  }
  return absolute;
}
/** Generic descriptor utility; the public operation supplies only closed pinned paths. */
export function readBoundedFile(path,exactBytes,expectedSha256,maxBytes) {
  if(!Number.isSafeInteger(exactBytes)||exactBytes<0||!Number.isSafeInteger(maxBytes)||exactBytes>maxBytes)refuse('file size/cap');
  const absolute=noSymlinkPath(path),before=lstatSync(absolute);
  if(!before.isFile()||before.size!==exactBytes)refuse('regular exact-size file required');
  if(!Number.isSafeInteger(constants.O_NOFOLLOW))refuse('O_NOFOLLOW required');
  let fd;
  try {
    fd=openSync(absolute,constants.O_RDONLY|constants.O_NONBLOCK|constants.O_NOFOLLOW);
    const initial=fstatSync(fd);
    if(!initial.isFile()||initial.size!==exactBytes||initial.dev!==before.dev||initial.ino!==before.ino)refuse('descriptor file identity/length');
    const bytes=new Uint8Array(exactBytes);let pos=0;
    while(pos<exactBytes){const n=readSync(fd,bytes,pos,exactBytes-pos,pos);if(n===0)refuse('truncated descriptor read');pos+=n;}
    if(readSync(fd,new Uint8Array(1),0,1,exactBytes)!==0)refuse('file grew/EOF mismatch');
    const after=fstatSync(fd);
    if(after.size!==initial.size||after.dev!==initial.dev||after.ino!==initial.ino||after.mtimeMs!==initial.mtimeMs)refuse('file changed during read');
    if(expectedSha256!==null&&sha(bytes)!==expectedSha256)refuse('file hash mismatch');
    return bytes;
  } finally {if(fd!==undefined)closeSync(fd);}
}
function json(bytes) {try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{refuse('UTF8/JSON metadata');}}
function closedRequest(input) {
  if(input===null||(typeof input!=='object'&&typeof input!=='function'))return false;
  const enabled=Object.getOwnPropertyDescriptor(input,'enabled');
  if(!enabled)return false;
  if(!own(enabled,'value')||typeof enabled.value!=='boolean')throw new Error('enabled must be own boolean data');
  if(!enabled.value)return false;
  if(Object.getPrototypeOf(input)!==Object.prototype)refuse('request ordinary object');
  const keys=Reflect.ownKeys(input),expected=['schema','enabled','token'];
  if(keys.length!==3||keys.some(k=>typeof k!=='string'||!expected.includes(k)))refuse('request fields');
  for(const k of expected){const d=Object.getOwnPropertyDescriptor(input,k);if(!d||!own(d,'value')||!d.enumerable)refuse('request data fields');}
  if(input.schema!=='cycle07-original-evidence-plan-request@1')refuse('request schema');
  if(input.token!==TOKEN)refuse('request token');return true;
}
function metadataEntry(e,kind) {
  if(!e||Object.getPrototypeOf(e)!==Object.prototype||e.kind!==kind||!Number.isSafeInteger(e.bytes)||e.bytes<1||typeof e.sha256!=='string'||!/^[0-9a-f]{64}$/.test(e.sha256))refuse('fragment metadata');
  const pattern=kind==='answer'?/^fragments\/answer-\d+\.json$/:/^fragments\/calculation-\d+\.json$/;
  if(!pattern.test(e.path)||resolve(RAW,e.path)!==`${RAW}/${e.path}`)refuse('fragment path');
}
function equalJSON(a,b,reason){if(JSON.stringify(a)!==JSON.stringify(b))refuse(reason);}
function slotLedger(protocol,manifest) {
  if(protocol.schema!=='cycle07-joint-fit-station-contrast-protocol@1.1.0'||!Array.isArray(protocol.slots)||protocol.slots.length!==48)refuse('fixed protocol ledger');
  if(manifest.schema!=='cycle05-station-artifacts@1'||manifest.status!=='COMPLETED'||!Array.isArray(manifest.artifacts)||manifest.artifacts.length>512)refuse('raw artifact manifest');
  const paths=new Set(),answers=new Map(),callbacks=new Map();
  for(const e of manifest.artifacts){if(paths.has(e.path))refuse('duplicate artifact path');paths.add(e.path);
    if(e.kind==='answer'){metadataEntry(e,'answer');if(answers.has(e.planIndex))refuse('duplicate answer index');answers.set(e.planIndex,e);}
    if(e.kind==='calculation'){metadataEntry(e,'calculation');const key=`${e.comparisonId}/${e.captureIndex}`;if(callbacks.has(key))refuse('duplicate callback capture');callbacks.set(key,e);}
  }
  if(answers.size!==160||callbacks.size!==176)refuse('original160/176 artifact counts');
  for(const [pin,relative,kind]of [[PIN.trace,'value-trace.json','value-trace'],[PIN.sidecar,'timing-sidecar.json','timing-sidecar']]){
    const aggregate=manifest.artifacts.find(e=>e.path===relative);
    if(!aggregate||aggregate.kind!==kind||aggregate.bytes!==pin.bytes||aggregate.sha256!==pin.sha256)refuse('aggregate manifest binding');
  }
  const selected=[];
  for(const s of fixedSlots()){
    const ledger=protocol.slots[s.j];
    for(const k of ['j','c','b','comparisonId','nominalBankPx','originalOriginPx','t0Px','t1Px'])equalJSON(ledger[k],s[k],`ledger ${k}`);
    for(const [role,index]of [['fit',s.fitIndex],['control',s.controlIndex]]){
      const m=answers.get(index);if(!m||m.comparisonId!==s.comparisonId)refuse('answer slot metadata');equalJSON(ledger[role],m,'ledger/manifest exact answer binding');selected.push(m);
    }
    for(let captureIndex=0;captureIndex<11;captureIndex++)if(!callbacks.has(`${s.comparisonId}/${captureIndex}`))refuse('missing callback context');
  }
  return {answers:selected,callbacks:[...callbacks.values()]};
}
function encodedTree(bytes,maxDepth=40,maxNodes=500000) {
  const tree=json(bytes),canonical=new TextEncoder().encode(`${JSON.stringify(tree)}\n`);
  if(canonical.length!==bytes.length||sha(canonical)!==sha(bytes))refuse('noncanonical aggregate tagged wire');
  const stack=[[tree,0]];let nodes=0;
  while(stack.length){const [x,d]=stack.pop();if(++nodes>maxNodes||d>maxDepth)refuse('aggregate encoded-tree budget');if(Array.isArray(x))for(const y of x)stack.push([y,d+1]);else if(x!==null&&typeof x==='object')refuse('wire grammar contains JSON object');}
  return tree;
}

/** No file/codec/native-value I/O before the closed enabled descriptor. */
export async function buildOriginalEvidencePlan(input) {
  if(!closedRequest(input))return {status:'DISABLED',plan:null,encodedBytes:null,sha256:null,actualNewPATH:0};
  let readBytes=0;const bindings=[];
  const load=(p,cap=1048576)=>{
    if(readBytes+p.bytes>MAX_READ)refuse('total binding read cap');
    const bytes=readBoundedFile(p.path,p.bytes,p.sha256,cap);readBytes+=bytes.length;bindings.push({...p});return bytes;
  };
  // Native fragments remain opaque until every selected answer/callback is hashed.
  const protocol=json(load(PIN.protocol)),inputManifest=json(load(PIN.input)),manifest=json(load(PIN.manifest));
  load(PIN.receipt);load(PIN.shapeAuthority);load(PIN.originalProtocol);load(PIN.attestation);
  if(inputManifest.schema!=='cycle06-lenard5-files@1'||inputManifest.enabled!==true||inputManifest.protocolId!=='lenard5-fixed16'||inputManifest.protocolPath!==PIN.originalProtocol.path||inputManifest.inputAttestationPath!==`${ROOT}/discovery-cycle06/G1/E1501/staging-attestation.json`)refuse('original input manifest identity');
  const freeze=json(load(PIN.freeze));
  if(freeze.schema!=='cycle06-root-source-admission@1'||freeze.status!=='ACCEPTED_ENGINEERING_SOURCE_FREEZE_ONLY'||!Array.isArray(freeze.entries)||freeze.entries.length!==22)refuse('source22 authority');
  const seenSource=new Set(),closureHashes={};let codecBytes=null;
  for(const e of freeze.entries){
    if(typeof e.path!=='string'||e.path.startsWith('/')||e.path.split('/').some(x=>x==='..'||x==='.'||!x)||seenSource.has(e.path)||e.mode!=='100644')refuse('source22 path/mode');seenSource.add(e.path);
    const p={path:`${LAB}/${e.path}`,bytes:e.bytes,sha256:e.sha256},body=load(p);
    if(e.path.startsWith('experiments/capability-discovery/probes/'))closureHashes[e.path]=e.sha256;
    if(p.path===PIN.codec.path){if(e.bytes!==PIN.codec.bytes||e.sha256!==PIN.codec.sha256)refuse('codec freeze identity');codecBytes=body;}
  }
  if(Object.keys(closureHashes).length!==9||codecBytes===null)refuse('nine-module closure/codec');
  const selection=slotLedger(protocol,manifest);
  const exactTotal=readBytes+PIN.trace.bytes+PIN.sidecar.bytes+selection.answers.reduce((a,e)=>a+e.bytes,0)+selection.callbacks.reduce((a,e)=>a+e.bytes,0);
  if(!Number.isSafeInteger(exactTotal)||exactTotal>MAX_READ)refuse('metadata-derived complete read budget');
  const traceBytes=load(PIN.trace,PIN.trace.bytes),sidecarBytes=load(PIN.sidecar,PIN.sidecar.bytes);
  const answerFragments=selection.answers.map(metadata=>({metadata,bytes:load({path:`${RAW}/${metadata.path}`,bytes:metadata.bytes,sha256:metadata.sha256},8192)}));
  const callbackFragments=selection.callbacks.map(metadata=>({metadata,bytes:load({path:`${RAW}/${metadata.path}`,bytes:metadata.bytes,sha256:metadata.sha256},2048)}));
  // FIRST codec import happens only after all opaque bindings above succeeded.
  // Import verified pure source bytes; this does not authenticate the host/runtime.
  const codec=await import(`data:text/javascript;base64,${Buffer.from(codecBytes).toString('base64')}`);
  const plan=bindPlan({traceWire:encodedTree(traceBytes),sidecarWire:encodedTree(sidecarBytes),answerFragments,callbackFragments,sourceHashes:closureHashes},codec);
  plan.bindingAuthority={inputManifest:PIN.input,rawManifest:PIN.manifest,aggregates:[PIN.trace,PIN.sidecar],source22:PIN.freeze,originalProtocol:PIN.originalProtocol,attestation:PIN.attestation,acceptedReceipt:PIN.receipt,shapeAuthority:PIN.shapeAuthority,acceptedProtocolV2:PIN.protocol,codec:PIN.codec,nonportableOriginalRawRoot:RAW,readBytes,readCap:MAX_READ,sourceHashMeaning:'hash at check, not execution authentication or concurrent replacement defense',tokenMeaning:'admission identifier, not durable spent token'};
  const encodedBytes=codec.encodeBytes(plan,{maxBytes:MAX_OUTPUT,maxTypedBytes:1});
  const detachedPlan=codec.decodeValue(codec.encodeValue(plan,{maxBytes:MAX_OUTPUT,maxTypedBytes:1}),{maxBytes:MAX_OUTPUT,maxTypedBytes:1});
  return {status:'READY',plan:detachedPlan,encodedBytes,sha256:sha(encodedBytes),bindings,actualNewPATH:0};
}
