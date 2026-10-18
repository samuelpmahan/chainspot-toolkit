/** Default-OFF, receipt-only ID grouping. No measurement, geometry algebra or I/O. */
import { createHash } from 'node:crypto';

const own = (o,k) => Object.hasOwn(o,k);
const object = o => o !== null && typeof o === 'object' && !Array.isArray(o);
const plain = o => object(o) && [Object.prototype,null].includes(Object.getPrototypeOf(o));
const named = s => typeof s === 'string' && Boolean(s.trim());
const finite = n => typeof n === 'number' && Number.isFinite(n);
const allowed = (o,keys) => plain(o) && Object.keys(o).every(k=>keys.includes(k));
function labels(a) {
  if(!Array.isArray(a)) return false;
  for(let i=0;i<a.length;i++) if(!own(a,i) || !named(a[i])) return false;
  return true;
}
const same = (a,b) => a.length===b.length && a.every((v,i)=>v===b[i]);
const base = () => ({schema:'receipt-window-groups@1',promoted:false,CVCalls:0,filesystemOrNetworkCalls:0});

function groupProblem(groups) {
  if(!Array.isArray(groups)) return 'groups array required';
  const ids=new Set();
  for(const g of groups) {
    if(!allowed(g,['id','longStationId','orderedShortStationIds']) || !named(g.id) || !named(g.longStationId) || !labels(g.orderedShortStationIds) || !g.orderedShortStationIds.length) return 'malformed or unsupported group fields';
    if(ids.has(g.id) || new Set(g.orderedShortStationIds).size!==g.orderedShortStationIds.length || g.orderedShortStationIds.includes(g.longStationId)) return 'duplicate group or station IDs';
    ids.add(g.id);
  }
  return null;
}

function branchProblem(branch) {
  if(!object(branch) || branch.schema!=='local-ribbon-composition@1') return 'unsupported branch schema';
  if(!['UNKNOWN','OBSERVED_CHANNELS'].includes(branch.status)) return 'unsupported branch status';
  if(!labels(branch.operationsExecuted) || !Array.isArray(branch.stations)) return 'branch operations and stations arrays required';
  const ids=new Set();
  for(const s of branch.stations) {
    if(!object(s) || !named(s.id) || ids.has(s.id) || !named(s.frame)) return 'malformed or duplicate station ID/frame';
    ids.add(s.id);
    if(!object(s.pose) || !['xPx','yPx','headingRad'].every(k=>finite(s.pose[k]))) return 'nonfinite or missing station linkage geometry';
    if(!object(s.window) || !finite(s.window.t0Px) || !finite(s.window.t1Px) || s.window.t1Px<=s.window.t0Px) return 'malformed station window';
    const p=s.profile;
    if(!object(p) || !Array.isArray(p.offsetsPx) || !p.offsetsPx.every(finite) || !Number.isSafeInteger(p.stationCount) || p.stationCount<0 || !(p.meanLum===null || Array.isArray(p.meanLum)&&p.meanLum.length===p.offsetsPx.length) || !(p.visibleStationCounts===null || Array.isArray(p.visibleStationCounts)&&p.visibleStationCounts.length===p.offsetsPx.length)) return 'malformed station profile';
    if(!Array.isArray(s.candidates)) return 'station candidates array required';
    const widths=new Set();
    for(const c of s.candidates) {
      if(!object(c) || !finite(c.widthArgPx) || c.widthArgPx<=0 || widths.has(c.widthArgPx)) return 'malformed or duplicate candidate width';
      widths.add(c.widthArgPx);
      if(!object(c.observation) || !object(c.pairedRails) || !object(c.midpoint) || !own(c,'edgeFit') || !(c.edgeFit===null || object(c.edgeFit))) return 'incomplete candidate raw fields';
    }
  }
  return null;
}

function receiptState(r) {
  if(!object(r) || r.schema!=='source-pixel-roi@1') return {reason:'unsupported receipt schema'};
  if(!labels(r.operationsExecuted)) return {reason:'receipt operations array required'};
  const crop=own(r,'composition'),source=own(r,'sourceComposition');
  if(!crop && !source) {
    if(own(r,'execution') || r.operationsExecuted.length) return {reason:'branchless receipt has contradictory execution/operations'};
    if(!['UNKNOWN','DISABLED'].includes(r.status) || !named(r.reason)) return {reason:'branchless receipt status/reason required'};
    return {state:'NOT_EXECUTED'};
  }
  if(!crop || !source) return {reason:'both execution branches required'};
  for(const branch of [r.composition,r.sourceComposition]) {
    const reason=branchProblem(branch);if(reason)return {reason};
  }
  const e=r.execution,a=r.composition.operationsExecuted,b=r.sourceComposition.operationsExecuted;
  if(!object(e) || e.compositionCalls!==2 || !Array.isArray(e.order) || !same(e.order,['crop','original-source-frame']) || e.cropOperationCount!==a.length || e.sourceOperationCount!==b.length || !same(r.operationsExecuted,[...a,...b])) return {reason:'contradictory execution count/order/operations'};
  if(r.status!==r.composition.status) return {reason:'receipt status differs from crop branch status'};
  const cs=r.composition.stations,ss=r.sourceComposition.stations;
  if(!same(cs.map(s=>s.id),ss.map(s=>s.id))) return {reason:'branch station ID sequences differ'};
  for(let i=0;i<cs.length;i++) if(!same(cs[i].candidates.map(c=>c.widthArgPx),ss[i].candidates.map(c=>c.widthArgPx))) return {reason:'branch width row sequences differ'};
  if(!object(r.equivalence) || !['UNKNOWN','MATCHED_DECLARED_CONTROL'].includes(r.equivalence.status) || r.equivalence.absoluteTolerance!==1e-9 || !Array.isArray(r.equivalence.differences)) return {reason:'accepted equivalence object required'};
  return {state:'EXECUTED'};
}

export function groupWindowEvidence(input={}) {
  if(input?.enabled!==true) return {...base(),status:'DISABLED',executionState:'NOT_INSPECTED',projection:null};
  const receiptBytes=input.receiptBytes instanceof Uint8Array ? input.receiptBytes : null;
  const binding={expectedReceiptSha256:input.expectedReceiptSha256,computedReceiptSha256:null};
  const invalid=(reason,errorClass='INVALID_INPUT')=>({...base(),status:'UNKNOWN',executionState:'UNCLASSIFIED_INVALID_INPUT',projection:null,reason,errorClass,binding,receiptBytes});
  if(!allowed(input,['enabled','expectedReceiptSha256','receiptBytes','groups'])) return invalid('unsupported helper fields');
  if(!/^[a-f0-9]{64}$/.test(input.expectedReceiptSha256??'')) return invalid('exact expected receipt hash required');
  if(!receiptBytes) return invalid('receiptBytes Uint8Array required');
  binding.computedReceiptSha256=createHash('sha256').update(receiptBytes).digest('hex');
  if(binding.computedReceiptSha256!==binding.expectedReceiptSha256) return invalid('receipt hash mismatch','INTEGRITY_MISMATCH');
  let receipt;
  try {receipt=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(receiptBytes));}
  catch {return invalid('invalid UTF-8 or JSON receipt');}
  const problem=groupProblem(input.groups);if(problem)return invalid(problem);
  const shape=receiptState(receipt);if(shape.reason)return invalid(shape.reason);
  const declaration=g=>({id:g.id,longStationId:g.longStationId,orderedShortStationIds:[...g.orderedShortStationIds]});
  if(shape.state==='NOT_EXECUTED') return {...base(),status:'PROJECTED_EVIDENCE_ONLY',executionState:shape.state,binding,receiptBytes,receipt,projection:input.groups.map(g=>({id:g.id,declaration:declaration(g),executionState:'NOT_EXECUTED',measurementRows:null,stationIdsVerified:false}))};
  const crop=new Map(receipt.composition.stations.map(s=>[s.id,s])),source=new Map(receipt.sourceComposition.stations.map(s=>[s.id,s]));
  for(const g of input.groups) for(const id of [g.longStationId,...g.orderedShortStationIds]) if(!crop.has(id)||!source.has(id)) return invalid(`group station ID not found: ${id}`);
  const view=(map,g)=>({long:map.get(g.longStationId),orderedShort:g.orderedShortStationIds.map(id=>map.get(id))});
  return {...base(),status:'PROJECTED_EVIDENCE_ONLY',executionState:shape.state,binding,receiptBytes,receipt,projection:input.groups.map(g=>({id:g.id,declaration:declaration(g),crop:view(crop,g),originalSource:view(source,g)}))};
}
