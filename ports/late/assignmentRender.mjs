/** Source-backed S5 global-assignment projection. This module only renders a computed Part. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const sha = b => createHash('sha256').update(b).digest('hex');
const esc = x => String(x ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const n = x => Number(x).toFixed(2);
const xy = p => `${n(p[0])},${n(p[1])}`;
const save = (path, text) => { const b=Buffer.from(text); writeFileSync(path,b); return {path,sha256:sha(b)}; };

function candidateEndpoints(row) {
  const hit = row.hit ?? row.candidate ?? row;
  const tee = hit.teeCenter ?? row.teeCenter;
  const badge = hit.badgeCenter ?? row.badgeCenter;
  if (Array.isArray(hit.axisStart) && Array.isArray(hit.axisBadgeEndpoint)) return [hit.axisStart,hit.axisBadgeEndpoint];
  if (Array.isArray(tee) && Array.isArray(hit.u) && Number.isFinite(hit.exitPx))
    return [tee,[tee[0]+hit.u[0]*hit.exitPx,tee[1]+hit.u[1]*hit.exitPx]];
  if (Array.isArray(tee) && Array.isArray(badge)) return [tee,badge];
  throw new TypeError(`candidate ${row.id ?? hit.id ?? '?'} has no renderable source-frame endpoints`);
}

const rowId = r => String(r.id ?? r.candidateId ?? r.hitId ?? r.hit?.id ?? r.candidate?.id ?? '');
const selectedIds = assignment => new Set((assignment.assignments ?? assignment.selected ?? []).map(a =>
  String(a.candidateId ?? a.hitId ?? a.id ?? a.hit?.id ?? a.candidate?.id ?? '')));

/** Input is only source bytes plus the already computed assignment Part. */
export function renderAssignment({sourcePath,sourceSha256,width,height,candidateHits=[],assignment,teeAxes={visible:[],recovered:[],unknown:[]},badgePlates=[],outDir,runId,paramsHash}) {
  if (!assignment || !Array.isArray(assignment.candidateRows) ||
      !(Array.isArray(assignment.assignments) || Array.isArray(assignment.selected)))
    throw new TypeError('assignment must contain selected/assignments and candidateRows arrays');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width<1 || height<1) throw new TypeError('invalid source dimensions');
  const source=readFileSync(sourcePath);
  if (sha(source)!==sourceSha256) throw new Error('renderer source bytes differ from reviewed input');
  const data=`data:image/jpeg;base64,${source.toString('base64')}`;
  const rows=assignment.candidateRows;
  const rowHits = new Map(candidateHits.map(h=>[String(h.id),h]));
  const ids=rows.map(rowId);
  if(ids.some(x=>!x) || new Set(ids).size!==ids.length) throw new Error('candidate rows require unique stable IDs');
  const winners=selectedIds(assignment);
  for(const id of winners) if(!ids.includes(id)) throw new Error(`selected assignment ${id} has no candidate row`);
  const header=`<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><title>S5 global assignment projection; ownership UNKNOWN</title><image x="0" y="0" width="${width}" height="${height}" href="${data}" xlink:href="${data}"/>`;
  const candidateMark=r=>{
    const id=rowId(r), hit=r.hit ?? r.candidate ?? rowHits.get(id) ?? r;
    const [a,b]=candidateEndpoints({...r,hit});
    const isSelected=winners.has(id) || r.selected===true, status=String(r.disposition ?? r.status ?? 'UNCLASSIFIED');
    const tentative=isSelected && /TENTATIVE|SUSPICIOUS/i.test(`${status} ${r.selectionStatus ?? ''} ${r.confidence ?? ''}`);
    const color=isSelected?(tentative?'#ffad32':'#28ed82'):(/REJECT|INVALID/i.test(status)?'#ed5268':'#54c8ff');
    const dash=tentative?'stroke-dasharray="8 5"':(!isSelected?'stroke-dasharray="3 5"':'');
    const title=esc(`${id} | ${status}${r.reason?` | ${r.reason}`:''} | distancePx=${r.centerDistancePx ?? r.distancePx ?? 'UNKNOWN'} | distanceDiagonalFraction=${r.distanceDiagonalFraction ?? r.diagonalFraction ?? 'UNKNOWN'} | winnerHitId=${r.winnerHitId ?? r.winnerId ?? 'UNKNOWN'} conflictingSelectedHitId=${r.conflictingSelectedHitId ?? r.alternateId ?? 'UNKNOWN'} | ${isSelected?(tentative?'SELECTED_TENTATIVE':'SELECTED_WINNER'):'NOT_SELECTED'} | physical=UNKNOWN`);
    const badge=badgePlates.find(b=>b.detId===r.badgeId || b.id===r.badgeId);
    const hole=badge?.holeRead ?? r.holeRead;
    return `<g id="candidate-${esc(id)}" data-candidate="${esc(id)}" data-status="${esc(status)}" data-selected="${isSelected}"${isSelected?'':' style="display:none"'}><path d="M${xy(a)} L${xy(b)}" stroke="${color}" stroke-width="${isSelected?4:2}" fill="none" ${dash}/><circle cx="${n(a[0])}" cy="${n(a[1])}" r="4" fill="${color}"/><circle cx="${n(b[0])}" cy="${n(b[1])}" r="4" fill="${color}"/><title>${esc(`${id} badgeId=${r.badgeId ?? 'UNKNOWN'} hole=H${hole ?? '?'} ${title}`)}</title></g>`;
  };
  const markers=rows.map(candidateMark).join('');
  const unknown=(assignment.unresolvedTees ?? assignment.unknownAxes ?? assignment.unresolvedAxes ?? []).map((u,i)=>{
    const center=u.center ?? u.teeCenter ?? u.badgeCenter;
    if(!Array.isArray(center)) return '';
    const reason=esc(u.reason ?? u.status ?? 'unresolved; no assignment');
    return `<g data-unknown="${esc(u.id ?? u.teeId ?? u.badgeId ?? i)}"><path d="M${n(center[0]-7)} ${n(center[1]-7)} L${n(center[0]+7)} ${n(center[1]+7)} M${n(center[0]+7)} ${n(center[1]-7)} L${n(center[0]-7)} ${n(center[1]+7)}" stroke="#ff9c30" stroke-width="3"/><title>${reason}; no fitted/assigned axis; physical=UNKNOWN</title></g>`;
  }).join('');
  const selectedTeeIds=new Set((assignment.selected ?? assignment.assignments ?? []).map(a=>a.teeId ?? a.hit?.teeId).filter(Boolean));
  const unusedTeeIds=new Set(assignment.unusedTeeIds ?? []);
  const teeContext=[...(teeAxes.visible??[]),...(teeAxes.recovered??[])].map(t=>{
    const unused=unusedTeeIds.has(t.detId), selected=selectedTeeIds.has(t.detId);
    const corners=t.corners ?? t.polygon;
    const outline=Array.isArray(corners)?`<polygon points="${corners.map(xy).join(' ')}" fill="${unused?'#ff9c30':'#28ed82'}" fill-opacity=".07" stroke="${unused?'#ff9c30':selected?'#28ed82':'#9aa7b2'}" stroke-width="${unused?4:2}"/>`:'';
    return `<g data-tee-axis="${esc(t.detId)}" data-unused="${unused}">${outline}<title>${esc(`${t.detId}: ${unused?'unused fitted tee hypothesis':selected?'selected tee':'fitted tee hypothesis'}; physical=UNKNOWN`)}</title></g>`;
  }).join('');
  const matchedBadgeCount=new Set((assignment.selected ?? assignment.assignments ?? []).map(a=>a.badgeId ?? a.hit?.badgeId).filter(Boolean)).size;
  const unmatchedBadgeMarks=(assignment.unmatchedBadgeIds ?? []).map(id=>{
    const b=badgePlates.find(x=>x.detId===id || x.id===id);
    const center=b?.center ?? (Array.isArray(b?.centerXPx)?[b.centerXPx,b.centerYPx]:null);
    if(!center) return `<g data-unmatched-badge="${esc(id)}"><title>UNMATCHED ${esc(id)}; plate center unavailable</title></g>`;
    const label=`UNMATCHED H${b.holeRead ?? '?'}`;
    return `<g data-unmatched-badge="${esc(id)}"><circle cx="${n(center[0])}" cy="${n(center[1])}" r="13" fill="none" stroke="#ff3d85" stroke-width="4"/><path d="M${n(center[0]-9)} ${n(center[1]-9)} L${n(center[0]+9)} ${n(center[1]+9)} M${n(center[0]+9)} ${n(center[1]-9)} L${n(center[0]-9)} ${n(center[1]+9)}" stroke="#ff3d85" stroke-width="3"/><rect x="${n(center[0]+14)}" y="${n(center[1]-14)}" width="128" height="20" rx="3" fill="#101e2b" fill-opacity=".9"/><text x="${n(center[0]+18)}" y="${n(center[1]+1)}" font-family="Arial,sans-serif" font-size="13" font-weight="bold" fill="#ff6fa5">${esc(label)}</text><title>${esc(`${label}; badgeId=${id}; physical=UNKNOWN`)}</title></g>`;
  }).join('');
  const svg=header+`<metadata>${esc(JSON.stringify({runId,sourceSha256,paramsHash,stage:'S5_GLOBAL_ASSIGNMENT',frame:'original-jpeg-pixels',physical:'UNKNOWN'}))}</metadata><g id="assignment-legend"><rect x="3" y="3" width="${Math.min(width-6,1180)}" height="38" rx="4" fill="#101e2b" fill-opacity=".9"/><text x="12" y="29" font-family="Arial,sans-serif" font-size="20" fill="#fff">S5 assignment · matched badges: ${matchedBadgeCount} · unmatched: ${(assignment.unmatchedBadgeIds ?? []).length} · physical acceptance UNKNOWN</text></g><g id="tee-axis-context">${teeContext}</g><g id="unmatched-badge-plates">${unmatchedBadgeMarks}</g><g id="candidate-rows">${markers}</g><g id="unknown-no-axis">${unknown}</g></svg>`;
  const cliText=`runId=${runId} sourceSha256=${sourceSha256} paramsHash=${paramsHash} stage=S5_GLOBAL_ASSIGNMENT frame=original-jpeg-pixels physical=UNKNOWN\n`+
    rows.map(r=>{const id=rowId(r),sel=winners.has(id)||r.selected===true;const badge=badgePlates.find(b=>b.detId===r.badgeId || b.id===r.badgeId);return `candidate:${id} | badgeId=${r.badgeId ?? 'UNKNOWN'} hole=H${r.holeRead ?? badge?.holeRead ?? '?'} | ${r.disposition ?? r.status ?? 'UNCLASSIFIED'} | ${r.reason ?? 'no reason supplied'} | selected=${sel?'yes':'no'} distancePx=${r.centerDistancePx ?? r.distancePx ?? 'UNKNOWN'} distanceDiagonalFraction=${r.distanceDiagonalFraction ?? r.diagonalFraction ?? 'UNKNOWN'} winnerHitId=${r.winnerHitId ?? r.winnerId ?? 'UNKNOWN'} conflictingSelectedHitId=${r.conflictingSelectedHitId ?? r.alternateId ?? 'UNKNOWN'}${sel&&/TENTATIVE|SUSPICIOUS/i.test(`${r.disposition} ${r.status} ${r.selectionStatus ?? ''}`)?' tentative=yes':''} | physical=UNKNOWN`;}).join('\n')+'\n'+
    (assignment.unresolvedTees ?? []).map(u=>`unknown-tee:${u.id ?? u.teeId ?? 'UNKNOWN'} | ${u.status ?? 'UNRESOLVED'} | ${u.reason ?? 'no fitted axis'} | physical=UNKNOWN`).join('\n')+'\n'+
    (assignment.unresolvedBadges ?? assignment.unmatchedBadgeIds ?? []).map(u=>{const x=typeof u==='string'?{badgeId:u}:u;return `unknown-badge:${x.id ?? x.badgeId ?? 'UNKNOWN'} | ${x.status ?? 'UNRESOLVED'} | ${x.reason ?? 'no assignment'} | physical=UNKNOWN`;}).join('\n')+'\n';
  const svgArtifact=save(`${outDir}/s5-assignment-source-backed.svg`,svg);
  const cli=save(`${outDir}/s5-assignment-CLItext.txt`,cliText);
  const markCount=(svg.match(/data-candidate="/g)??[]).length;
  const cliIds=[...cliText.matchAll(/^candidate:(.+?) \|/gm)].map(m=>m[1]);
  if(markCount!==rows.length || cliIds.length!==rows.length || new Set(cliIds).size!==rows.length || ids.some(id=>!cliIds.includes(id)))
    throw new Error('assignment CLI and SVG candidate correspondence mismatch');
  return {svg:svgArtifact,cli,candidateCount:rows.length,selectedCount:winners.size};
}
