/** Evidence bookkeeping only; no image processing, new weights, or acceptance verdicts. */
export function widthEvidence(estimate,{segmentCount,candidateCount}={}) {
  const unknown=reason=>({status:'UNKNOWN',widthPx:null,reason,rawWidthPx:estimate?.widthPx??null});
  if(!Number.isInteger(segmentCount)||segmentCount<=0||!Number.isInteger(candidateCount)||candidateCount<=0)return unknown('nonempty segments and width bank required');
  const rows=estimate?.scores;
  if(!Array.isArray(rows)||rows.length<2||rows.length!==candidateCount)return unknown('score separation needs competing width rows');
  if(rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)||!Number.isFinite(r.widthPx)||r.widthPx<=0)||new Set(rows.map(r=>r.widthPx)).size!==rows.length)return unknown('positive distinct unambiguous candidate widths required');
  const measured=rows.filter(r=>Number.isInteger(r.visibleSamples)&&r.visibleSamples>0&&Number.isFinite(r.meanScore));
  if(measured.length!==rows.length)return unknown('one or more candidate widths has no finite visible evidence');
  const ranked=[...measured].sort((a,b)=>b.meanScore-a.meanScore);
  if(!(ranked[0].meanScore>0&&ranked[0].meanScore>ranked[1].meanScore))return unknown('positive, strictly separated best score required');
  if(estimate.widthPx!==ranked[0].widthPx)return unknown('raw selected width disagrees with separated evidence');
  return {status:'EVIDENCE_SUPPORTED',widthPx:ranked[0].widthPx,visibleSamples:ranked[0].visibleSamples,scoreSeparation:ranked[0].meanScore-ranked[1].meanScore,acceptance:'not_assessed'};
}
export function observationChannels(o){
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  return {rail:finite(o?.railScore)?'OBSERVED':'UNKNOWN',interior:finite(o?.innerScore)?'OBSERVED':'UNKNOWN',combined:finite(o?.score)?'OBSERVED':'UNKNOWN',interiorOnly:!finite(o?.railScore)&&finite(o?.innerScore),trackerConsumes:'combined',railIdentity:'not_established',acceptance:'not_assessed'};
}
