import {readFileSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
const text=x=>typeof x==='string'&&x.trim().length>0;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const hex=(x,n)=>typeof x==='string'&&new RegExp(`^[a-f0-9]{${n}}$`).test(x);
const texts=x=>Array.isArray(x)&&x.length>0&&x.every(text);
function localFile(root,file){
 if(!text(file)||isAbsolute(file)||file.includes('\\')||file.split('/').includes('..'))throw Error('unsafe package-relative path');
 const base=realpathSync(root),full=realpathSync(resolve(base,file)),rel=relative(base,full);
 if(isAbsolute(rel)||rel==='..'||rel.startsWith('../'))throw Error('path escapes package root');
 return full;
}
const guardKinds={
 width_evidence_separated:{module:'guards.mjs#widthEvidence',requires:true},
 rail_observed:{module:'guards.mjs#observationChannels',predicate:true},
 interior_only:{module:'guards.mjs#observationChannels',predicate:true},
 combined_unknown:{module:'guards.mjs#observationChannels',predicate:true},
 adapter_available:{externalContract:'external:CourseAdapter',predicate:true},
 candidate_pools_available:{externalContract:'external:CandidatePools',predicate:true},
};
/** Static declared contract validation. Predicate text is documentation, never evaluated code. */
export function validateCatalog(catalog,recipes,{root=dirname(fileURLToPath(import.meta.url)),checkBytes=true}={}){
 const errors=[],need=(ok,msg)=>{if(!ok)errors.push(msg)};
 let sourceMap=new Map(),operationMap=new Map();
 try{
 if(!plain(catalog)||!plain(recipes)||!Array.isArray(catalog.sources)||!Array.isArray(catalog.operations)||!Array.isArray(recipes.recipes))throw Error('catalog/recipe object and array schemas required');
 sourceMap=new Map(catalog.sources.map(x=>[x.id,x]));operationMap=new Map(catalog.operations.map(x=>[x.id,x]));
 const probes=new Set((catalog.probeDefinitions??[]).map(x=>x.id));
 need(catalog.status==='experimental_evidence_only','catalog must remain experimental_evidence_only');
 need(sourceMap.size===catalog.sources.length,'duplicate source id');need(operationMap.size===catalog.operations.length,'duplicate operation id');
 for(const [id,contract]of Object.entries(catalog.externalContracts??{}))need(plain(contract)&&texts(contract.required)&&text(contract.status),`${id}: substantive external contract required`);
 for(const s of sourceMap.values()){
  need(hex(s.ref,40)&&hex(s.gitBlob,40)&&hex(s.sha256,64),`${s.id}: exact source identity required`);
  need(text(s.path)&&text(s.file),`${s.id}: source paths required`);
  try{const file=localFile(root,s.file);if(checkBytes){const b=readFileSync(file),sha=createHash('sha256').update(b).digest('hex'),blob=createHash('sha1').update(Buffer.from(`blob ${b.length}\0`)).update(b).digest('hex');need(sha===s.sha256&&blob===s.gitBlob,`${s.id}: source bytes differ`);}}catch(e){errors.push(`${s.id}: source unavailable or unsafe: ${e.message}`);}
 }
 for(const [s,deps]of Object.entries(catalog.sourceDependencies??{})){need(sourceMap.has(s),`dependency owner missing: ${s}`);need(Array.isArray(deps),`dependency list invalid: ${s}`);for(const d of Array.isArray(deps)?deps:[])need(sourceMap.has(d)||plain(catalog.externalContracts?.[d]),`dependency missing: ${d}`);}
 for(const op of operationMap.values()){
  need(sourceMap.has(op.source),`${op.id}: source missing`);need(probes.has(op.probe),`${op.id}: probe missing`);
  for(const k of ['callableAddress','signature','coordinateFrame','limits','nextFalsifier','probeCoverage'])need(text(op[k]),`${op.id}: ${k} required`);
  need(texts(op.consumes)&&texts(op.produces),`${op.id}: input/output contract required`);need(op.acceptance==='not_assessed',`${op.id}: accepted claim forbidden`);
  const source=sourceMap.get(op.source);if(source&&checkBytes)try{const body=readFileSync(localFile(root,source.file),'utf8'),symbol=op.callableAddress.split('#')[1];need(body.includes(`function ${symbol}(`)||body.includes(`def ${symbol}(`),`${op.id}: callable symbol absent`);}catch(e){errors.push(`${op.id}: callable source unavailable: ${e.message}`);}
 }
 for(const group of catalog.capabilities??[])for(const id of group.operations??[])need(operationMap.has(id),`${group.id}: operation missing ${id}`);
 need(Array.isArray(recipes.guards),'declared guard list required');
 for(const id of recipes.guards??[]){
  const contract=recipes.guardContracts?.[id],expected=guardKinds[id];
  if(!expected||!plain(contract)){errors.push(`${id}: recognized substantive guard contract required`);continue;}
  need(expected.requires?texts(contract.requires):text(contract.predicate),`${id}: substantive requirements or predicate required`);
  if(expected.module){
   need(contract.module===expected.module,`${id}: recognized local module export required`);
   if(contract.module===expected.module){try{const [file,symbol]=contract.module.split('#'),body=readFileSync(localFile(root,file),'utf8');need(new RegExp(`export\\s+(?:async\\s+)?function\\s+${symbol}\\s*\\(`).test(body)||new RegExp(`export\\s+const\\s+${symbol}\\s*=`).test(body),`${id}: guard export absent`);}catch(e){errors.push(`${id}: guard module unavailable: ${e.message}`);}}
  }
  if(expected.externalContract)need(contract.externalContract===expected.externalContract&&plain(catalog.externalContracts?.[expected.externalContract])&&texts(catalog.externalContracts[expected.externalContract].required),`${id}: known external contract required`);
 }
 for(const recipe of recipes.recipes){
  if(!Array.isArray(recipe.steps)){errors.push(`${recipe.id}: steps array required`);continue;}
  const steps=new Map(recipe.steps.map(x=>[x.id,x]));need(steps.size===recipe.steps.length,`${recipe.id}: duplicate step`);
  for(const step of steps.values()){
   for(const id of step.operations??[])need(operationMap.has(id),`${recipe.id}/${step.id}: missing operation ${id}`);
   for(const k of ['next','whenTrue','whenFalse'])if(step[k])need(steps.has(step[k]),`${recipe.id}/${step.id}: missing branch ${step[k]}`);
   if(step.guard)need(recipes.guards.includes(step.guard)&&plain(recipes.guardContracts?.[step.guard])&&text(step.whenTrue)&&text(step.whenFalse),`${recipe.id}/${step.id}: guard needs contract and both branches`);
   if(step.terminal)need(recipes.terminalStatuses.includes(step.terminal)&&step.terminal!=='accepted',`${recipe.id}/${step.id}: invalid terminal`);
  }
 }
 need(catalog.reviewRepair?.review==='R101'&&catalog.reviewRepair.resolved.length>=2,'R101 repair record required');
 }catch(e){errors.push(`malformed catalog: ${e.message}`);}
 return {status:errors.length?'FAIL':'PASS',errors,counts:{sources:sourceMap.size,operations:operationMap.size,capabilities:catalog?.capabilities?.length,recipes:recipes?.recipes?.length},acceptance:'not_assessed'};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const root=resolve(process.argv[2]??dirname(fileURLToPath(import.meta.url)));
 const r=validateCatalog(JSON.parse(readFileSync(resolve(root,'catalog.json'))),JSON.parse(readFileSync(resolve(root,'recipes.json'))),{root});
 console.log(JSON.stringify(r,null,2));if(r.status!=='PASS')process.exitCode=1;
}
