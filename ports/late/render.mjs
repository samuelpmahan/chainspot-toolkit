/** Source-backed projections of reviewed trace Parts; this module never runs CV. */
import { readFileSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const f=x=>Number(x).toFixed(2);
const point=p=>`${f(p[0])},${f(p[1])}`;
const polygon=p=>p?.map(point).join(' ')??'';
const mark=(xy,r,color)=>`<circle cx="${f(xy[0])}" cy="${f(xy[1])}" r="${r}" fill="${color}"/>`;
const path=(a,b,color,attrs='')=>`<path d="M${point(a)} L${point(b)}" stroke="${color}" stroke-width="2" fill="none" ${attrs}/>`;
const save=(where,s)=>{const bytes=Buffer.from(s);writeFileSync(where,bytes);return {path:where,sha256:sha(bytes)}};

export function renderRecovery({sourcePath,sourceSha256,sourceWidth,sourceHeight,inputs,s5Rows,s5Hits=[],s5AlternateRows,s6Result,
  s6AlternateResult=null,altRunId=null,altParamsHash=null,runId,paramsHash,traceHash,outDir}) {
  const source=readFileSync(sourcePath);
  if(sha(source)!==sourceSha256)throw Error('renderer source bytes differ from reviewed trace');
  const dataUri=`data:image/jpeg;base64,${source.toString('base64')}`;
  const image=`<image x="0" y="0" width="${sourceWidth}" height="${sourceHeight}" href="${dataUri}" xlink:href="${dataUri}"/>`;
  const open=title=>`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${sourceWidth} ${sourceHeight}" width="${sourceWidth}" height="${sourceHeight}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${image}`;
  const footer=`</svg>`;
  const badges=inputs.badgePlates.map(b=>`<g data-badge="${esc(b.detId)}"><rect x="${b.plateBbox[0]}" y="${b.plateBbox[1]}" width="${b.plateBbox[2]}" height="${b.plateBbox[3]}" fill="none" stroke="#f564d4" stroke-width="1.3"/>${mark(b.center,3,'#f564d4')}<title>${esc(`${b.holeRead} · ${b.plateGeometryProvenance}`)}</title></g>`).join('');
  const baskets=inputs.templateTops.map(b=>`<g data-basket="${esc(b.basketId)}">${mark(b.top,4,'#ffdb5a')}<title>Sprite-predicted top, not segmented path ink</title></g>`).join('');
  const basketProposals=(inputs.basketRecoveryProposals??[]).map(p=>`<g data-basket-proposal="${p.index}" data-status="UNOWNED_MATCHER_PROPOSAL"><rect x="${p.sourceBbox[0]}" y="${p.sourceBbox[1]}" width="${p.sourceBbox[2]}" height="${p.sourceBbox[3]}" fill="none" stroke="#23d5ee" stroke-width="2.5" stroke-dasharray="7 4"/><title>${esc(`${p.classification}: ${p.source}; predicted basket bbox, not accepted S2 basket or owned pixels`)}</title></g>`).join('');
  const visible=inputs.baselineAxes.visible.map(t=>`<g data-tee-visible="${esc(t.detId)}"><polygon points="${polygon(t.corners)}" stroke="#33ec82" stroke-width="1.5" fill="#33ec82" fill-opacity=".07"/><title>${esc(t.detId)}: ${t.observedPixelCount} S3 owned observed cells</title></g>`).join('');
  const recovered=inputs.baselineAxes.recovered.map(t=>`<g data-tee-recovered="${esc(t.detId)}" data-result-ref="${esc(t.resultRef)}">${t.observedPixels.map(p=>`<rect x="${p[0]}" y="${p[1]}" width="1" height="1" fill="#ff345b"/>`).join('')}<polygon points="${polygon(t.corners)}" stroke="#28edff" stroke-width="2.5" stroke-dasharray="6 4" fill="#28edff" fill-opacity=".05"/>${t.cornerSupport.map(c=>mark(c.xy,2.5,c.status==='visible-observed'?'#ff345b':'#28edff')).join('')}<title>${esc(`${t.resultRef}: ${t.observedPixelCount} observed shard cells; corners ${t.cornerSupport.map(c=>`${c.index}:${c.status}`).join(', ')}; inferred perimeter is not physical acceptance`)}</title></g>`).join('');
  const guarded=(inputs.guarded??[]).map(t=>`<g data-target-rebind="${esc(t.resultRef)}" data-status="REFIT_REQUIRED_TARGET_BINDING">${t.observedPixels.map(p=>`<rect x="${p[0]}" y="${p[1]}" width="1" height="1" fill="#ff345b"/>`).join('')}<polygon points="${polygon(t.corners)}" stroke="#ffa337" stroke-width="3" stroke-dasharray="3 6" fill="none"/><title>${esc(t.reason)}</title></g>`).join('');
  const unknown=inputs.baselineAxes.unknown.map(t=>`<g data-no-axis="${esc(t.detId)}">${path([t.center[0]-7,t.center[1]-7],[t.center[0]+7,t.center[1]+7],'#ff9c30')}${path([t.center[0]+7,t.center[1]-7],[t.center[0]-7,t.center[1]+7],'#ff9c30')}<title>${esc(t.reason)}; excluded from axis measurements</title></g>`).join('');
  const s4Svg=open('S4 fresh visible objects, observed shards, inferred outlines and no-axis hypotheses')+
    `<metadata>${esc(JSON.stringify({sourceSha256,frame:'original-jpeg-pixels',labels:'green observed S3; red observed shard cells; dashed cyan inferred tee perimeter or optional basket proposal; amber no fitted axis'}))}</metadata>`+
    `<g id="s1-badge-plates">${badges}</g><g id="s2-template-tops">${baskets}</g><g id="s4-optional-unowned-basket-proposals">${basketProposals}</g><g id="s3-visible-tee">${visible}</g><g id="s4-observed-shard-inferred-outline">${recovered}</g><g id="s4-target-rebind-required">${guarded}</g><g id="s4-no-axis-unknown">${unknown}</g>`+footer;
  const s4=save(`${outDir}/s4-source-backed.svg`,s4Svg);
  const s4Cli=save(`${outDir}/s4-CLItext.txt`,
    `sourceSha256=${sourceSha256} frame=original-jpeg-pixels stage=S4 ownership=UNKNOWN\n`+
    inputs.baselineAxes.visible.map(t=>`visible:${t.detId} | OBSERVED_S3_COMPONENT | center=${t.center.map(f).join(',')} corners=${polygon(t.corners)} observedCells=${t.observedPixelCount} | ownership=UNKNOWN`).join('\n')+'\n'+
    inputs.baselineAxes.recovered.map(t=>`recovered:${t.detId} | OBSERVED_SHARD_INFERRED_OUTLINE | ref=${t.resultRef} center=${t.center.map(f).join(',')} corners=${polygon(t.corners)} observedCells=${t.observedPixelCount} cornerSupport=${t.cornerSupport.map(c=>c.status).join(',')} | ownership=UNKNOWN`).join('\n')+'\n'+
    (inputs.guarded??[]).map(t=>`guarded:${t.resultRef} | REFIT_REQUIRED_TARGET_BINDING | observedCells=${t.observedPixels.length} corners=${polygon(t.corners)} fittedTarget=${t.fittedTarget} potentialReassignment=${t.potentialReassignment} | ownership=UNKNOWN`).join('\n')+'\n'+
    inputs.baselineAxes.unknown.map(t=>`no-axis:${t.detId} | UNKNOWN_NO_FITTED_AXIS | center=${t.center.map(f).join(',')} reason=${t.reason} | ownership=UNKNOWN`).join('\n')+'\n'+
    (inputs.basketRecoveryProposals??[]).map(p=>`basket-proposal:${p.index} | UNOWNED_MATCHER_PROPOSAL | ${p.classification} sourceBbox=${p.sourceBbox.join(',')} tier=${p.tier} source=${p.source} nearestS2IoU=${f(p.nearestS2?.iou??0)} | ownership=UNKNOWN`).join('\n')+'\n');
  const s4Text=readFileSync(s4Cli.path,'utf8');
  for(const [visualPattern,textPattern,want] of [
    [/data-tee-visible="/g,/^visible:/gm,inputs.baselineAxes.visible.length],
    [/data-tee-recovered="/g,/^recovered:/gm,inputs.baselineAxes.recovered.length],
    [/data-target-rebind="/g,/^guarded:/gm,(inputs.guarded??[]).length],
    [/data-no-axis="/g,/^no-axis:/gm,inputs.baselineAxes.unknown.length],
    [/data-basket-proposal="/g,/^basket-proposal:/gm,(inputs.basketRecoveryProposals??[]).length]]) {
    if((s4Svg.match(visualPattern)??[]).length!==want||(s4Text.match(textPattern)??[]).length!==want)
      throw Error('S4 CLI and source-backed SVG spatial-row correspondence mismatch');
  }
  const detail=[];
  if(inputs.guarded?.length){
    const guard=inputs.guarded[0],cx=guard.corners.reduce((n,p)=>n+p[0],0)/4,
      cy=guard.corners.reduce((n,p)=>n+p[1],0)/4;
    for(const [name,p,lines] of [['H8-target-binding', [cx,cy], ['H8 fragment: 100 observed cells','H12 pose; target refit required']],
      ['H12-no-fit',[458,227.5],['H12 inferred center only','Observed major axis UNKNOWN']]]){
      const x=Math.max(0,Math.round(p[0]-130)),y=Math.max(0,Math.round(p[1]-130));
      const zoom=s4Svg.replace(`viewBox="0 0 ${sourceWidth} ${sourceHeight}" width="${sourceWidth}" height="${sourceHeight}"`,
        `viewBox="${x} ${y} 260 260" width="780" height="780"`)
        .replace('</svg>',`<rect x="${x+3}" y="${y+3}" width="254" height="39" rx="4" fill="#101e2b" fill-opacity=".9"/><text x="${x+10}" y="${y+18}" font-family="Arial,sans-serif" font-size="10" fill="#fff">${esc(lines[0])}</text><text x="${x+10}" y="${y+33}" font-family="Arial,sans-serif" font-size="10" fill="#fff">${esc(lines[1])}</text></svg>`);
      detail.push(save(`${outDir}/s4-${name}-zoom.svg`,zoom));
    }
  }
  if(!s5Rows)return {s4,s4Cli,detail};
  const rayCompatible=new Set(s5Hits.map(h=>`s5:${h.teeId}:${h.badgeId}`));
  const s5Drawable=(r,color,alternate=false)=>`<g ${alternate?'data-s5-alt':'data-s5'}="${esc(r.id)}" data-status="${esc(r.status)}" ${!alternate&&!rayCompatible.has(r.id)?'style="display:none"':''}>${path(r.axisStart,r.axisBadgeEndpoint,color,'stroke-dasharray="5 4"')}${path(r.teeCenter,r.badgeCenter,'#f564d4')}<title>${esc(`${r.id}: ${f(r.signedPerpPx)} px, ${f(r.angleResidualDeg)} deg; ${rayCompatible.has(r.id)?'actual plate hit':'diagnostic pair only'}; unowned; ${r.axisConstraintProvenance}`)}</title></g>`;
  const s5Svg=open('S5 two-direction major-axis relations; exact-cell-pose alternate remains unowned')+
    `<metadata>${esc(JSON.stringify({runId,sourceSha256,paramsHash,featureId:'s5MajorAxisMetrics',coordinateFrame:'original-jpeg-pixels'}))}</metadata>`+
    `<g id="s5-context">${badges}${visible}${recovered}${guarded}${unknown}</g>`+
    `<g id="s5-all-measured-pairs-ray-hits-shown">${s5Rows.map(r=>s5Drawable(r,rayCompatible.has(r.id)?'#3ff7e2':'#88afdc')).join('')}</g>`+
    `<g id="s5-exact-cell-alternate" style="display:none">${(s5AlternateRows??[]).map(r=>s5Drawable(r,'#ffbd55',true)).join('')}</g>`+footer;
  const s5=save(`${outDir}/s5-source-backed.svg`,s5Svg);
  const s5Cli=save(`${outDir}/s5-CLItext.txt`,
    `runId=${runId} sourceSha256=${sourceSha256} paramsHash=${paramsHash} featureId=s5MajorAxisMetrics frame=original-jpeg-pixels\n`+
    s5Rows.map(r=>`${r.id} | ${r.status} | plateHit=${rayCompatible.has(r.id)?'RAY_COMPATIBLE_UNOWNED':'NO_BBOX_HIT_DIAGNOSTIC'} signedPerpPx=${f(r.signedPerpPx)} angleDeg=${f(r.angleResidualDeg)} | targetCondition=${r.conditionalTargetProvenance??'NONE'} | ownership=UNKNOWN`).join('\n')+'\n'+
    (s5AlternateRows??[]).map(r=>`alt:${r.id} | ${r.status} | signedPerpPx=${f(r.signedPerpPx)} angleDeg=${f(r.angleResidualDeg)} | ownership=UNKNOWN`).join('\n')+'\n'+
    inputs.baselineAxes.unknown.map(u=>`${u.detId} | UNKNOWN_NO_FITTED_AXIS | ${u.reason}`).join('\n')+'\n');
  if((s5Svg.match(/data-s5="/g)??[]).length!==s5Rows.length||
    (readFileSync(s5Cli.path,'utf8').match(/^s5:/gm)??[]).length!==s5Rows.length)throw Error('S5 CLI/visual diagnostic-row correspondence mismatch');
  if(!s6Result)return {s4,s4Cli,detail,s5,s5Cli};
  const s6Drawable=r=>{
    const end=[r.teeCenter[0]+r.u[0]*r.topAlongPx,r.teeCenter[1]+r.u[1]*r.topAlongPx];
    const color=r.status==='REJECTED_GEOMETRY'?'#ff6875':'#ffd54d';
    return `<g data-s6="${esc(r.id)}" data-status="${esc(r.status)}" data-reasons="${esc(r.reasons.join('+'))}">${path(r.teeCenter,end,color,'stroke-dasharray="7 4"')}${path(end,r.templateTop,'#f565c9')}${mark(r.templateTop,3,'#ffd54d')}<title>${esc(`${r.id}: hit ${r.rayHitOrdinal}/${r.rayHitCount}; ${r.status}; ${r.reasons.join('+')||'unowned'}`)}</title></g>`;
  };
  const candidates=s6Result.rows.filter(r=>r.status!=='REJECTED_GEOMETRY');
  const rejects=s6Result.rows.filter(r=>r.status==='REJECTED_GEOMETRY');
  const s6Svg=open('S6 two directed rays through actual badge plate boxes toward predicted basket tops')+
    `<metadata>${esc(JSON.stringify({runId,sourceSha256,paramsHash,traceHash,featureId:'s6TwoRay',frame:'original-jpeg-pixels'}))}</metadata>`+
    `<g id="s6-context">${badges}${baskets}${visible}${recovered}${guarded}${unknown}</g>`+
    `<g id="s6-unowned">${candidates.map(s6Drawable).join('')}</g><g id="s6-rejected" style="display:none">${rejects.map(s6Drawable).join('')}</g>`+footer;
  const s6=save(`${outDir}/s6-source-backed.svg`,s6Svg);
  const s6Cli=save(`${outDir}/s6-CLItext.txt`,
    `runId=${runId} sourceSha256=${sourceSha256} paramsHash=${paramsHash} traceHash=${traceHash} featureId=s6TwoRay frame=original-jpeg-pixels\n`+
    s6Result.rows.map(r=>`${r.id} | ${r.status} | hit=${r.rayHitOrdinal}/${r.rayHitCount} plate=${f(r.badgePlateEnterPx)}..${f(r.badgePlateExitPx)} top=${f(r.topAlongPx)} perp=${f(r.topSignedPerpPx)} | reasons=${r.reasons.join('+')||'NONE'} | ownership=UNKNOWN`).join('\n')+'\n'+
    s6Result.unknown.map(u=>`${u.detId} | ${u.status} | ${u.reason}`).join('\n')+'\n');
  if((s6Svg.match(/data-s6="/g)??[]).length!==s6Result.rows.length ||
    (readFileSync(s6Cli.path,'utf8').match(/^s6ray:/gm)??[]).length!==s6Result.rows.length)
    throw Error('S6 CLI and source-backed SVG spatial-row correspondence mismatch');
  let s6Alt=null,s6AltCli=null;
  if(s6AlternateResult){
    const altCandidates=s6AlternateResult.rows.filter(r=>r.status!=='REJECTED_GEOMETRY');
    const altRejected=s6AlternateResult.rows.filter(r=>r.status==='REJECTED_GEOMETRY');
    const altTraceHash=sha(JSON.stringify({hits:s6AlternateResult.hits,rows:s6AlternateResult.rows,
      unknown:s6AlternateResult.unknown}));
    const altSvg=open('S6 alternate exact-cell tee pose; original source, all candidate and rejected rows')+
      `<metadata>${esc(JSON.stringify({runId:altRunId,sourceSha256,paramsHash:altParamsHash,
        traceHash:altTraceHash,featureId:'s6.axisPropagation',frame:'original-jpeg-pixels'}))}</metadata>`+
      `<g id="s6-alternate-context">${badges}${baskets}${visible}${recovered}${guarded}${unknown}</g>`+
      `<g id="s6-alternate-unowned">${altCandidates.map(s6Drawable).join('')}</g>`+
      `<g id="s6-alternate-rejected" style="display:none">${altRejected.map(s6Drawable).join('')}</g>`+footer;
    s6Alt=save(`${outDir}/s6-alternate-source-backed.svg`,altSvg);
    s6AltCli=save(`${outDir}/s6-alternate-CLItext.txt`,
      `runId=${altRunId} sourceSha256=${sourceSha256} paramsHash=${altParamsHash} traceHash=${altTraceHash} featureId=s6.axisPropagation frame=original-jpeg-pixels\n`+
      s6AlternateResult.rows.map(r=>`${r.id} | ${r.status} | hit=${r.rayHitOrdinal}/${r.rayHitCount} plate=${f(r.badgePlateEnterPx)}..${f(r.badgePlateExitPx)} top=${f(r.topAlongPx)} perp=${f(r.topSignedPerpPx)} | reasons=${r.reasons.join('+')||'NONE'} | ownership=UNKNOWN`).join('\n')+'\n'+
      s6AlternateResult.unknown.map(u=>`${u.detId} | ${u.status} | ${u.reason}`).join('\n')+'\n');
    if((altSvg.match(/data-s6="/g)??[]).length!==s6AlternateResult.rows.length||
      (readFileSync(s6AltCli.path,'utf8').match(/^s6ray:/gm)??[]).length!==s6AlternateResult.rows.length)
      throw Error('S6 alternate CLI/visual row correspondence mismatch');
  }
  return {s4,s4Cli,detail,s5,s5Cli,s6,s6Cli,s6Alt,s6AltCli};
}
