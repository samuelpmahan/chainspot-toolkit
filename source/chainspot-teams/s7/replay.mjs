#!/usr/bin/env node
// Isolated read-only replay: existing source decode, engine, support, and routing.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(process.argv[2]);
const stem = process.argv[3] ?? 'AlexClark-original';
const badgeId = process.argv[4] ?? 'badge-8';
const teeId = process.argv[5] ?? 'tee-recovered-3';
const out = resolve(import.meta.dirname, stem === 'AlexClark-original' ? '.' : `${stem}-${badgeId}`);
const localRequire = createRequire(join(root, 'package.json'));
const dist = path => localRequire(join(root, 'packages/alg/dist', path));
const sha = data => createHash('sha256').update(data).digest('hex');
const capture = JSON.parse(readFileSync(join(root, `artifacts/composed-render-20260927/${stem}-capture.json`)));
const imagePath = join(root, capture.source.path);
const sourceBytes = readFileSync(imagePath);
if (sha(sourceBytes) !== capture.source.sha256) throw Error('Source SHA mismatch');
const configBytes = readFileSync(join(root, 'packages/alg/src/detectors/threeFactor/configs/posterior-tee-recovery-on.json'));
if (sha(configBytes) !== capture.configSha256) throw Error('Config SHA mismatch');
const { decodeNodeFile } = dist('adapters/node');
const { stageContract } = dist('stages/S0/contract');
const { runThreeFactor, parseConfig, resolveConfig, DEFAULT_EXECUTION, canonicalJson, sha256Hex } = dist('detectors/threeFactor');
const { routeBadgeLegs, DEFAULT_ROUTING_KNOBS } = dist('detectors/threeFactor/routing');
const { DEFAULT_RIBBON_KNOBS } = dist('detectors/threeFactor/ribbon');
const { traceBadgeToBasket } = dist('detectors/threeFactor/features/g4.teeBadgeLockMath');
const config = resolveConfig(parseConfig(JSON.parse(configBytes)), DEFAULT_EXECUTION);
const paramsHash = await sha256Hex(canonicalJson(config));
if (paramsHash !== capture.paramsHash) throw Error('Resolved config hash mismatch');
const s0 = await stageContract.execute({ source: imagePath, inputLabel: stem, decode: decodeNodeFile });
const canonical = s0.pxc.get('px.course.canonicalPixels');
if (sha(canonical.rgba) !== capture.source.frame.canonicalRgbaSha256) throw Error('Canonical pixels mismatch');
const run = runThreeFactor(canonical, { config, paramsHash });
const m = run.measurement;
const badge = m.badges.find(b => b.detId === badgeId);
if (!badge) throw Error(`${badgeId} missing`);
const basketPoints = m.baskets.map(b => ({ id: b.detId, xPx: b.tipXPx, yPx: b.tipYPx }));
// The supplied tee list is empty on purpose: the existing path operation has
// no tee precondition, even though the enclosing assignment pipeline does.
const routingKnobs = config.features.routing.knobs ?? DEFAULT_ROUTING_KNOBS;
const ribbonKnobs = config.features.ribbon.knobs ?? DEFAULT_RIBBON_KNOBS;
const routed = routeBadgeLegs(m.field, { id: badge.detId, xPx: badge.cxPx, yPx: badge.cyPx }, [], basketPoints, m.viewport.topPx, ribbonKnobs, routingKnobs);
const fieldAt = ([x,y]) => m.field.support[Math.max(0,Math.min(m.field.height-1,Math.round((y-m.viewport.topPx)/m.field.scale)))*m.field.width+Math.max(0,Math.min(m.field.width-1,Math.round(x/m.field.scale)))];
const legs = routed.baskets.map(leg => {
  const basket = m.baskets.find(b => b.detId === leg.endpointId);
  const values = leg.path.map(fieldAt);
  const weak = values.filter(v => v < m.parameters.supportTau).length;
  return { basketId: leg.endpointId, basketTip: [basket.tipXPx,basket.tipYPx], reachable: leg.reachable,
    geodesic: leg.geodesic, path: leg.path, nodes: leg.path.length,
    weakFraction: values.length ? weak/values.length : null,
    endpointSupport: values.at(-1) ?? null,
    minSupport: values.length ? Math.min(...values) : null };
});
const pairedRow=run.assignment.scoredPairs.find(row=>row.raw.badgeId===badge.detId&&row.raw.teeId===teeId);
if(!pairedRow) throw Error(`Existing raw ${badgeId}/${teeId} pair missing`);
const teeBadgePath=[...pairedRow.raw.teeLeg.path].reverse();
const last=teeBadgePath.at(-1), prior=teeBadgePath.at(-2);
const headingRad=Math.atan2(last[1]-prior[1],last[0]-prior[0]);
const traced=traceBadgeToBasket({badgeId:badge.detId,startPx:[badge.cxPx,badge.cyPx],headingRad,
  field:m.field,viewportTopPx:m.viewport.topPx,supportTau:m.parameters.supportTau,
  corridorWidthPx:m.parameters.corridorWidthPx,startBadgeBbox:badge.bbox,
  occluders:m.badges.filter(b=>b.detId!==badge.detId).map(b=>({id:b.detId,bbox:b.bbox})),
  baskets:m.baskets.map(b=>({basketId:b.detId,bbox:b.bbox})),
  maxTraceLengthPx:Math.hypot(m.field.width*m.field.scale,m.field.height*m.field.scale)});
const lastPoint=traced.points.at(-1),priorPoint=traced.points.at(-2);
const nextPoint=lastPoint&&priorPoint?[lastPoint[0]+lastPoint[0]-priorPoint[0],lastPoint[1]+lastPoint[1]-priorPoint[1]]:null;
const ownBadgeContains=([x,y])=>x>=badge.bbox[0]&&y>=badge.bbox[1]&&x<=badge.bbox[0]+badge.bbox[2]&&y<=badge.bbox[1]+badge.bbox[3];
const focus=stem==='AlexClark-original'?['basket-9','basket-8','basket-7']:['basket-10','basket-9','basket-11'];
const evidence = { schema:'s7-existing-route-replay@1', source: capture.source, configSha256:sha(configBytes), paramsHash,routeFocus:focus,
  compiledRoutingSha256: sha(readFileSync(join(root,'packages/alg/dist/detectors/threeFactor/routing.js'))),
  compiledRibbonSha256: sha(readFileSync(join(root,'packages/alg/dist/detectors/threeFactor/ribbon.js'))),
  operation:'routeBadgeLegs', sourceOperation:'runThreeFactor/S0 stageContract',
  runObserved: { badgeCount:m.badges.length,basketCount:m.baskets.length,teeCount:m.tees.length,rawPairCount:m.rawPairs.length,
    viewport:m.viewport, parameters:m.parameters, field:{width:m.field.width,height:m.field.height,scale:m.field.scale},
    badge: { id:badge.detId,label:badge.label,center:[badge.cxPx,badge.cyPx] },
    assignment:run.assignment.assignments.filter(a=>a.badgeId===badge.detId),
    teeBadgeLockEnabled:config.features.teeBadgeLock.enabled,
    teeBadgeLockDrawables:(run.trace?.units.find(u=>u.id==='teeBadgeLock')?.drawables??[])
      .filter(d=>String(d.ref??'').includes(badge.detId))
      .map(d=>({type:d.type,ref:d.ref,verdict:d.verdict,reason:d.reason,visualRole:d.visualRole,
        values:d.values,pathLength:d.path?.length})) },
  routeRequest:{badgeId:badge.detId,teePoints:[],basketPointIds:basketPoints.map(b=>b.id),knobs:{ribbon:ribbonKnobs,routing:routingKnobs}},
  routes:legs, ridgeTrace:{inputHeadingSource:`existing ${badgeId}/${teeId} badge→tee LegEvidence reversed, last approach; pair is a heading hint, not an ownership gate`,
    teeBadgePath,headingRad,startBadgeBbox:badge.bbox,
    samplePoints:traced.points.map(point=>({point,support:fieldAt(point),insideOwnBadge:ownBadgeContains(point)})),
    nextStraightProbe:nextPoint?{point:nextPoint,support:fieldAt(nextPoint),insideOwnBadge:ownBadgeContains(nextPoint)}:null,
    outcome:traced} };
mkdirSync(out,{recursive:true});
writeFileSync(join(out,'replay.json'),JSON.stringify(evidence,null,2)+'\n');
const colors=['#f72496','#20d3ea','#fac43d'];
const pathMarkup=focus.map((id,i)=>{
  const r=legs.find(r=>r.basketId===id);
  if(!r?.path.length)return '';
  const path=r.path.map(([x,y],j)=>`${j?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return `<path d="${path}" fill="none" stroke="${colors[i]}" stroke-opacity=".86" stroke-width="3"/><circle cx="${r.basketTip[0]}" cy="${r.basketTip[1]}" r="9" fill="none" stroke="${colors[i]}" stroke-width="3"/><text x="${r.basketTip[0]+12}" y="${r.basketTip[1]-9}" fill="${colors[i]}" font-size="19" font-weight="bold" stroke="#101010" stroke-width="3" paint-order="stroke">${id}</text>`;
}).join('');
const traceMarkup=`<path d="${traced.points.map(([x,y],j)=>`${j?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')}" fill="none" stroke="#38fb5c" stroke-width="5" stroke-dasharray="9 5"/><text x="${badge.cxPx+15}" y="${badge.cyPx+15}" fill="#38fb5c" font-size="15" font-weight="bold" stroke="#101010" stroke-width="3" paint-order="stroke">ridge ${traced.outcome==='basket'?traced.basketId:traced.reason}</text>`;
const [dx,dy]=capture.source.frame.canonicalToSource;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${capture.source.frame.widthPx} ${capture.source.frame.heightPx}" width="${capture.source.frame.widthPx}" height="${capture.source.frame.heightPx}"><image href="data:image/jpeg;base64,${sourceBytes.toString('base64')}" width="100%" height="100%"/><g transform="translate(${dx} ${dy})"><circle cx="${badge.cxPx}" cy="${badge.cyPx}" r="12" fill="none" stroke="#f72496" stroke-width="4"/><text x="${badge.cxPx+15}" y="${badge.cyPx-8}" fill="#f72496" font-size="19" font-weight="bold" stroke="#101010" stroke-width="3" paint-order="stroke">H${badge.label} source</text>${pathMarkup}${traceMarkup}</g></svg>`;
writeFileSync(join(out,'source-route.svg'),svg);
console.log(JSON.stringify({ sourceSha256:capture.source.sha256,paramsHash, runObserved:evidence.runObserved,
  routes:legs.map(({path,...rest})=>rest),ridgeTrace:{headingRad,outcome:traced.outcome,reason:traced.reason,
    basketId:traced.basketId,lengthPx:traced.lengthPx,bendCount:traced.bendCount,pointCount:traced.points.length} },null,2));
