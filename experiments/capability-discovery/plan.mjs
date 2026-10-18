#!/usr/bin/env node
/** Read-only recommendation boundary. Reservation, agent APIs and receipts belong to the coordinator. */
import {createHash} from 'node:crypto';
import {readFile,realpath,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
export const canonical=x=>Array.isArray(x)?`[${x.map(canonical).join(',')}]`:x&&typeof x==='object'?`{${Object.keys(x).sort().map(k=>`${JSON.stringify(k)}:${canonical(x[k])}`).join(',')}}`:JSON.stringify(x);
export const hash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:canonical(x)).digest('hex');
const token=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.@-]{0,63}$/.test(x);
const list=x=>Array.isArray(x)?x:[];
const unique=(xs,label)=>{if(new Set(xs).size!==xs.length)throw Error(`duplicate-${label}`);};
const index=(xs,label)=>{if(!Array.isArray(xs))throw Error(`missing-${label}`);unique(xs.map(x=>x.id),label);for(const x of xs)if(!token(x.id))throw Error(`invalid-${label}-id`);return new Map(xs.map(x=>[x.id,x]));};
const inside=(root,p)=>{const rel=relative(root,p);return rel===''||(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('../'));};
async function bytes(root,path){if(typeof path!=='string'||!path||isAbsolute(path)||path.includes('\\')||path.split('/').includes('..'))throw Error('unsafe-artifact-path');const base=await realpath(root),p=resolve(base,path);if(!inside(base,p)||!inside(base,await realpath(p))||(await lstat(p)).isSymbolicLink())throw Error('artifact-outside-root');return readFile(p);}
const operations={claimState:['op','claim','is'],taskOutcome:['op','task','is'],evidenceStatus:['op','bundle','is'],independentReview:['op','bundle','protocol']};
function validate(policy,state){
 if(policy.schema!=='discovery-policy@1'||state.schema!=='discovery-state@1')throw Error('unsupported-schema');
 if(!policy.source||state.source!==policy.source)throw Error('source-mismatch');
 if(!Number.isSafeInteger(state.revision)||state.revision<0)throw Error('invalid-revision');
 const tasks=index(policy.tasks,'tasks'),claims=index(state.claims,'claims'),outcomes=index(state.outcomes,'outcomes'),bundles=index(state.bundles,'bundles');
 if(!Array.isArray(state.workers))throw Error('missing-workers');unique(state.workers.map(w=>w.id),'workers');
 for(const w of state.workers)if(!token(w.id)||!token(w.principal)||typeof w.available!=='boolean')throw Error('invalid-worker');
 for(const b of bundles.values()){if(!Array.isArray(b.files)||!b.files.length||!Array.isArray(b.producers))throw Error('invalid-bundle');unique(b.files.map(f=>f.path),'bundle-files');for(const f of b.files)if(!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('invalid-file-hash');for(const p of b.producers)if(!token(p.worker)||!token(p.principal))throw Error('invalid-producer');}
 for(const c of claims.values())if(!['unknown','supported','regression','accepted','refuted'].includes(c.state))throw Error('invalid-claim-state');
 const active=new Set(),seen=new Set();
 function visit(id){if(active.has(id))throw Error('dependency-cycle');if(seen.has(id))return;const t=tasks.get(id);if(!t)throw Error('unknown-dependency');active.add(id);for(const dep of t.needs)visit(dep);active.delete(id);seen.add(id);}
 for(const t of tasks.values()){
  if(!['refresh','falsify','repair','validate','package'].includes(t.action)||!list(policy.commandIds).includes(t.commandId)||!Array.isArray(t.needs)||!Array.isArray(t.guards))throw Error('invalid-task');
  if(t.bundle&&!bundles.has(t.bundle)||t.claim&&!claims.has(t.claim))throw Error('unknown-task-binding');
  if(['validate','package','refresh'].includes(t.action)&&!t.bundle)throw Error('missing-task-bundle');
  for(const g of t.guards){const keys=operations[g.op];if(!keys||keys.some(k=>!(k in g))||Object.keys(g).some(k=>!keys.includes(k)))throw Error('invalid-guard');if(g.claim&&!claims.has(g.claim)||g.bundle&&!bundles.has(g.bundle)||g.task&&!tasks.has(g.task)&&!outcomes.has(g.task))throw Error('unknown-guard-reference');if(g.op==='claimState'&&!['unknown','supported','regression','accepted','refuted'].includes(g.is)||g.op==='evidenceStatus'&&!['current','missing','stale','unvalidated','invalid'].includes(g.is)||g.op==='taskOutcome'&&!['passed','failed','regressed','insufficient'].includes(g.is))throw Error('invalid-guard-value');}
 }
 for(const id of tasks.keys())visit(id);
 return {tasks,claims,outcomes,bundles};
}
/** Every readiness result derives from one caller-supplied snapshot and freshly read artifact bytes. */
export async function plan({policy,state,artifactRoot,now,expectRevision}){
 const result={schema:'discovery-plan@1',status:'invalid',policyHash:hash(policy),stateHash:hash(state),stateRevision:state.revision,source:state.source,tasks:[],bundles:{},nativeSpec:null,coordinatorOnly:['atomic reservation/CAS','actual agent spawn or followup','native start/finish','authenticated human acceptance ingestion'],errors:[]};
 try{
  const {tasks,claims,outcomes,bundles}=validate(policy,state);
  const clock=Date.parse(now),observed=Date.parse(state.observedAt);if(!Number.isFinite(clock)||!Number.isFinite(observed)||!Number.isSafeInteger(policy.maxStateAgeMs)||policy.maxStateAgeMs<0||clock<observed||clock-observed>policy.maxStateAgeMs)throw Error('stale-or-invalid-snapshot');
  if(expectRevision!==undefined&&state.revision!==Number(expectRevision))throw Error('dispatch-revision-mismatch');
  for(const b of bundles.values()){
   const entry={status:b.source===policy.source?'current':'stale',bindingHash:hash(b),files:[],reasons:[]};
   for(const f of b.files){try{const actual=hash(await bytes(artifactRoot,f.path));entry.files.push({path:f.path,sha256:actual});if(actual!==f.sha256){entry.status='stale';entry.reasons.push('byte-hash-mismatch');}}catch(e){entry.status=String(e.code)==='ENOENT'?'missing':'invalid';entry.reasons.push(e.code==='ENOENT'?'missing-artifact':e.message);}}
   result.bundles[b.id]=entry;
  }
  const occupiedPrincipals=new Set(state.workers.filter(w=>w.active||w.lease).map(w=>w.principal));
  const free=state.workers.filter(w=>w.available===true&&!occupiedPrincipals.has(w.principal));
  unique(free.map(w=>w.principal),'free-principal');
  const liveTask=id=>state.workers.some(w=>w.lease?.taskId===id||w.active?.taskId===id)||outcomes.get(id)?.status==='running';
  const verifiedReviews=[];
  result.proofFiles=[];
  for(const ref of list(state.reviews)){try{const data=await bytes(artifactRoot,ref.path),actual=hash(data);result.proofFiles.push({path:ref.path,expected:ref.sha256,actual});if(actual===ref.sha256)verifiedReviews.push(JSON.parse(data));}catch{result.proofFiles.push({path:ref.path,status:'unavailable'});}}
  function independent(bundle,protocol){const b=bundles.get(bundle),ev=result.bundles[bundle];if(ev?.status!=='current'||!b?.producers.length)return false;const p=list(policy.protocols).find(p=>p.id===protocol);if(!p)return false;return verifiedReviews.some(r=>r.bundle===bundle&&r.bundleHash===ev.bindingHash&&r.source===policy.source&&r.protocol===protocol&&r.protocolHash===p.sha256&&r.decision==='accepted'&&token(r.reviewer?.worker)&&token(r.reviewer?.principal)&&!b.producers.some(x=>x.worker===r.reviewer.worker||x.principal===r.reviewer.principal)&&list(state.workers).some(w=>w.id===r.reviewer.worker&&w.principal===r.reviewer.principal));}
  const human=[];
  for(const ref of list(state.humanDecisions)){try{if(!list(policy.trustedHumanDecisionHashes).includes(ref.sha256))continue;const data=await bytes(artifactRoot,ref.path);result.proofFiles.push({path:ref.path,expected:ref.sha256,actual:hash(data)});if(hash(data)!==ref.sha256)continue;human.push(JSON.parse(data));}catch{/* Untrusted/missing decisions never authorize. */}}
  const humanAccepted=(t)=>human.some(d=>d.decision==='accepted'&&d.source===policy.source&&d.claim===t.claim&&d.bundle===t.bundle&&d.bundleHash===result.bundles[t.bundle]?.bindingHash&&list(policy.authorities).some(a=>a.issuer===d.issuer&&a.principal===d.principal&&a.scope===d.scope&&d.scope==='retain'));
  function guard(g){if(g.op==='claimState')return claims.get(g.claim)?.source===policy.source&&claims.get(g.claim)?.state===g.is;if(g.op==='taskOutcome'){const o=outcomes.get(g.task);return o?.source===policy.source&&o.status==='done'&&o.outcome===g.is;}if(g.op==='evidenceStatus')return result.bundles[g.bundle]?.status===g.is;return independent(g.bundle,g.protocol);}
  for(const t of tasks.values()){
   const reasons=[],o=outcomes.get(t.id),b=bundles.get(t.bundle);let status='ready';
   if(o?.source===policy.source&&o.status==='done'){status='terminal';reasons.push('task-completed');}
   else if(liveTask(t.id)){status='blocked';reasons.push('task-running');}
   else{
    for(const dep of t.needs){const d=outcomes.get(dep);if(d?.source!==policy.source||d?.status!=='done'||d?.outcome!=='passed')reasons.push(`dependency:${dep}`);}
    for(const g of t.guards)if(!guard(g))reasons.push(`guard:${g.op}:${g.claim??g.bundle??g.task}`);
    if(['validate','package'].includes(t.action)&&!b?.producers.length)reasons.push('producer-identity-missing');
    if(['validate','package'].includes(t.action)&&result.bundles[t.bundle]?.status!=='current')reasons.push('evidence-not-current');
    if(t.action==='refresh'){if(liveTask(t.producerTask))reasons.push('producer-running');if(result.bundles[t.bundle]?.status==='current')reasons.push('evidence-already-current');}
    if(t.action==='package'){if(!independent(t.bundle,t.protocol))reasons.push('independent-validation-missing');if(!humanAccepted(t))reasons.push('human-acceptance-missing');if(claims.get(t.claim)?.state!=='accepted'||claims.get(t.claim)?.source!==policy.source)reasons.push('claim-not-accepted');}
    if(reasons.length)status='blocked';
   }
   const eligible=free.filter(w=>t.action!=='validate'||!b.producers.some(p=>p.worker===w.id||p.principal===w.principal)).map(w=>w.id);
   if(status==='ready'&&!eligible.length){status='blocked';reasons.push(t.action==='validate'?'no-independent-worker':'no-free-worker');}
   result.tasks.push({id:t.id,action:t.action,commandId:t.commandId,status,reasons,eligibleWorkers:eligible,bundleHash:t.bundle?result.bundles[t.bundle].bindingHash:null});
  }
  const ready=result.tasks.filter(t=>t.status==='ready');
  if(ready.length&&free.length)result.nativeSpec={schema:'chainspot.rebalancer-spec/v1',service:{name:'capability-discovery',scope:`revision-${state.revision}`},workers:free.map(w=>w.id),review_policy:{enabled:false},jobs:ready.map(t=>({id:t.id,kind:'extract',semantic_kind:t.action==='validate'?'review':t.action,allow_workers:t.eligibleWorkers,subject:`${t.commandId}; policy ${result.policyHash}; state ${result.stateHash}; bundle ${t.bundleHash??'none'}`}))};
  result.evidenceHash=hash({bundles:result.bundles,proofFiles:result.proofFiles});result.status=ready.length?'ready':result.tasks.every(t=>t.status==='terminal')?'terminal':'blocked';
 }catch(e){result.status='invalid';result.nativeSpec=null;result.errors.push(e.message);}
 return result;
}
/** Recheck only; this cannot atomically reserve or authorize a later unguarded dispatch. */
export async function checkDispatch(previous,inputs,worker,task){const current=await plan(inputs);const same=previous.policyHash===current.policyHash&&previous.stateHash===current.stateHash&&previous.evidenceHash===current.evidenceHash;const entry=current.tasks.find(t=>t.id===task);return {allowed:same&&current.status!=='invalid'&&entry?.status==='ready'&&entry.eligibleWorkers.includes(worker),reason:same?'coordinator-reservation-still-required':'snapshot-changed',current};}
async function main(){const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){if(!['--policy','--state','--artifacts','--now','--expect-revision'].includes(args[i])||!args[i+1])throw Error('usage: --policy FILE --state FILE --artifacts ROOT --now ISO [--expect-revision N]');options[args[i]]=args[i+1];}const load=async k=>JSON.parse(await readFile(options[k],'utf8'));console.log(JSON.stringify(await plan({policy:await load('--policy'),state:await load('--state'),artifactRoot:options['--artifacts'],now:options['--now'],expectRevision:options['--expect-revision']}),null,2));}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e.message);process.exitCode=2;});
