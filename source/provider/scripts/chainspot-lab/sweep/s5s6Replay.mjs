/** Isolated S5 axis and S6 template-top geometry over sealed S4 capture. */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeRender } from './composedRenderContract.mjs';
import { svg as composedSvg } from './s5s6ComposedProjection.mjs';
import { createS5S6FeatureSet, S5S6_EXPLICIT_ON } from './s5s6Features.mjs';

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const require = createRequire(import.meta.url);
const dist = name => require(resolve(root, 'packages/alg/dist', name));
const { createExecBoard } = dist('exec/board');
const { compileABFeatureSet, executeABFeatureSet } = dist('exec/feature-set');
const { composePcr, pcrRenderId } = dist('exec/pcr');
const { measurePairs } = dist('stages/S4/exp/axis-local');
const { measureStraightGeometry } = dist('detectors/threeFactor/features/st.straightTest');
const { DEFAULT_SMART_BASKET_OPTIONS } = dist('detectors/threeFactor/smartBasket');
const jpeg = require('jpeg-js');
const sprite = JSON.parse(readFileSync(resolve(root, 'packages/alg/src/detectors/threeFactor/assets/basket-sprite.json')));
const topAdapter={semanticTipOffsetPx:DEFAULT_SMART_BASKET_OPTIONS.semanticTipOffsetPx,
  capturedSemanticBboxOriginDeltaXPx:2,capturedSemanticBboxOriginDeltaYPx:3,
  origin:'smartBasket DEFAULT_SMART_BASKET_OPTIONS; captured basket tip/semantic bbox relation asserted per candidate'};
const sha = data => createHash('sha256').update(data).digest('hex');
const jsonHash = data => sha(JSON.stringify(data));
const args = Object.fromEntries(process.argv.slice(2).map(x => x.split('=')));
const geometry=args['--geometry'] ?? 'baseline';
if(!['baseline','constrained-support'].includes(geometry)) throw new Error('--geometry=baseline|constrained-support');
const out=resolve(root,'artifacts/s5-s6-20260927',geometry);
mkdirSync(out,{recursive:true});
const focusCount = Number(args['--focus-count'] ?? 1);
if (!Number.isInteger(focusCount) || focusCount < 1 || focusCount > 5) throw new Error('--focus-count=1..5');
const rad = Math.PI / 180;
const fmt = x => x == null ? 'UNKNOWN' : Number(x).toFixed(2);
const esc = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const firstInkY = sprite.rows.findIndex(row => row.includes('1'));
const topInkX = [...sprite.rows[firstInkY]].flatMap((v, i) => v === '1' ? [i] : []);
const topInkMidX = (topInkX[0] + topInkX.at(-1)) / 2;
const calls={measurePairs:0,signedResiduals:0,measureStraightGeometry:0,axisToTemplateTop:0};
const algIdentityFiles = [
  'packages/alg/src/stages/S4/exp/axis-local/index.ts',
  'packages/alg/dist/stages/S4/exp/axis-local/index.js',
  'packages/alg/src/detectors/threeFactor/features/st.straightTest.ts',
  'packages/alg/dist/detectors/threeFactor/features/st.straightTest.js',
  'packages/alg/src/exec/gateway.ts','packages/alg/dist/exec/gateway.js',
  'packages/alg/src/exec/pcr.ts','packages/alg/dist/exec/pcr.js',
  'packages/alg/src/exec/feature-set.ts','packages/alg/dist/exec/feature-set.js',
  'packages/alg/src/detectors/labEndpoint/endpoints.ts','packages/alg/dist/detectors/labEndpoint/endpoints.js',
  'packages/alg/src/detectors/threeFactor/smartBasket.ts','packages/alg/dist/detectors/threeFactor/smartBasket.js',
  'packages/alg/src/detectors/threeFactor/features/g2.sprite.ts','packages/alg/dist/detectors/threeFactor/features/g2.sprite.js',
  'packages/alg/src/detectors/threeFactor/features/g3.teeRecovery.ts','packages/alg/dist/detectors/threeFactor/features/g3.teeRecovery.js',
  'packages/alg/src/detectors/threeFactor/assets/basket-sprite.json'
];
const activeProviderFiles = Object.fromEntries(algIdentityFiles.map(p => [p,sha(readFileSync(resolve(root,p)))]));
const baseRenderer=readFileSync(resolve(root,'scripts/chainspot-lab/sweep/composedRenderReplay.mjs'),'utf8').split(/^for \(const stem of /m)[0];
const copiedRenderer=readFileSync(resolve(root,'scripts/chainspot-lab/sweep/s5s6ComposedProjection.mjs'),'utf8').split('// Exact prior projection copied')[0];
if (baseRenderer !== copiedRenderer) throw new Error('composed projection copy differs from preserved S1-S4 renderer');

function axesOf(capture, fitGateway=null) {
  const seen = new Set();
  const observed = capture.marks.filter(m => m.geometry.type === 'visible-pad' || m.geometry.type === 'recovered-pad');
  const fitted=new Map(fitGateway?.runs.ON.candidate.entries.map(e=>[e.teeId,e])??[]);
  const tees = observed.map(m => {
    const detId = m.detail.detId ?? m.detail.teeId;
    const fit=m.geometry.type==='recovered-pad'?fitted.get(detId):null;
    if(fit && (fit.resultRef!==m.detail.resultRef||fit.sourceSha256!==capture.source.sha256||fit.paramsHash!==capture.paramsHash||
      fit.frame!==capture.source.frame.name||jsonHash(fit.baselineCorners)!==jsonHash(m.geometry.corners)))
      throw new Error(`${detId}: fit candidate or baseline geometry drift`);
    const corners = fit?.corners ?? m.geometry.corners;
    const center = [0,1].map(k => corners.reduce((n,p) => n+p[k], 0) / corners.length);
    const edges = corners.map((p,i) => [corners[(i+1)%4][0]-p[0], corners[(i+1)%4][1]-p[1]]);
    const edge = edges.sort((a,b) => Math.hypot(...b)-Math.hypot(...a))[0];
    const angleRad = fit?.angleRad ?? Math.atan2(edge[1], edge[0]);
    if (seen.has(detId)) throw new Error(`duplicate tee ${detId}`);
    seen.add(detId);
    const recovered=m.geometry.type==='recovered-pad';
    return { detId, center, angleRad, corners,
      geometrySource:fit?fit.geometrySource:m.status,
      axisTaintedByBadgeConstraint:recovered,
      axisConstraintProvenance:recovered
        ? (fit?'G4 fit gateway constrained support':'S4 captured badge-ray-constrained recovery')
        : 'visible pad geometry; axis from emitted rectangle',
      recoveryLocalizationBasis:recovered?(m.detail.localization??'UNKNOWN'):null,
      sourceMark:m.id, resultRef:m.detail.resultRef ?? null,
      detectorCenter:m.geometry.center ?? null,
      fragmentCount:m.detail.fragmentCount ?? null,
      edgeStatus:'rectangle boundary from prior emitted geometry; antialias-pixel edge validation pending fit lane' };
  });
  const unknown = capture.marks.filter(m => m.geometry.type === 'injected-center')
    .map(m => ({ detId:m.detail.teeId, holeRead:m.detail.holeRead, reason:'INFERRED_NO_FIT: no observed pad edge or major axis', center:m.geometry.center }));
  if(fitGateway && (fitted.size!==observed.filter(m=>m.geometry.type==='recovered-pad').length ||
    observed.filter(m=>m.geometry.type==='recovered-pad').some(m=>!fitted.has(m.detail.teeId)) ||
    fitGateway.runs.ON.candidate.noFit.length!==unknown.length ||
    unknown.some(u=>!fitGateway.runs.ON.candidate.noFit.some(f=>f.teeId===u.detId&&f.corners===null))))
    throw new Error('fit candidate inventory or no-fit mismatch');
  return { tees, unknown };
}
function signedAxis(tee, point) {
  const dx=point[0]-tee.center[0], dy=point[1]-tee.center[1];
  let ux=Math.cos(tee.angleRad), uy=Math.sin(tee.angleRad);
  if (dx*ux+dy*uy < 0) { ux=-ux; uy=-uy; }
  return { ux, uy, alongPx:dx*ux+dy*uy, signedPerpPx:-uy*dx+ux*dy,
    distancePx:Math.hypot(dx,dy), angleResidualDeg: Math.atan2(Math.abs(-uy*dx+ux*dy),Math.abs(dx*ux+dy*uy))/rad };
}
function s5Calculation(tees, badges) {
  // Invoke the real S4 axis-local pair calculation, then retain its signed
  // counterpart and exact source identities. The old 5-degree judge is not run.
  return badges.flatMap(badge => {
    if(!Number.isInteger(Number(badge.holeRead))||Number(badge.holeRead)<=0) return [];
    // Single-badge invocation preserves detId even when two plates read the
    // same digit. 1×1 synthetic bbox makes S4's bbox-center equal the
    // captured plate's pixel centroid, not its separate bounding-box center.
    calls.measurePairs++;
    const measured=measurePairs(tees.map(t=>({center:t.center,angleRad:t.angleRad})),
      [{label:badge.holeRead,bbox:[badge.center[0],badge.center[1],1,1]}]);
    return measured.map(p=>{
    const tee=tees[p.tee];
    const signed=signedAxis(tee,badge.center);
    if (Math.abs(Math.abs(signed.signedPerpPx)-p.perpendicularPx) > 1e-8 || Math.abs(signed.angleResidualDeg-p.angleDeg)>1e-8)
      throw new Error('existing measurePairs and signed axis adapter disagree');
    return { id:`s5:${tee.detId}:${badge.detId}`, teeId:tee.detId, badgeId:badge.detId,
      holeRead:badge.holeRead, teeCenter:tee.center, badgeCenter:badge.center,
      axisStart:[tee.center[0]-signed.ux*22,tee.center[1]-signed.uy*22],
      axisBadgeEndpoint:[tee.center[0]+signed.ux*(signed.alongPx+20),tee.center[1]+signed.uy*(signed.alongPx+20)],
      signedPerpPx:signed.signedPerpPx, perpendicularPx:p.perpendicularPx,
      angleResidualDeg:p.angleDeg, alongPx:signed.alongPx, distancePx:p.distancePx,
      status:'MEASURED_PAIR_UNOWNED',axisTaintedByBadgeConstraint:tee.axisTaintedByBadgeConstraint,
      axisConstraintProvenance:tee.axisConstraintProvenance,
      sourceMark:tee.sourceMark, badgeMark:badge.sourceMark };
    });
  });
}
function topFromBasket(b, template) {
  // The semantic bbox includes dark shell. The semantic tip is sprite x+21,
  // sprite y+70; the matched template's top ink is its first row. This is
  // a template-predicted anchor, not independently segmented source ink.
  const x=b.tip[0] - template.width/2 + topInkMidX;
  const y=b.tip[1] - template.height - topAdapter.semanticTipOffsetPx + firstInkY;
  if (Math.abs(y - (b.bbox[1]+topAdapter.capturedSemanticBboxOriginDeltaYPx)) > 1e-6 ||
      Math.abs(x-b.bbox[0]-(topInkMidX+topAdapter.capturedSemanticBboxOriginDeltaXPx))>1e-6)
    throw new Error(`${b.detId}: basket template/semantic bbox seam changed`);
  return [x,y];
}
function s6Calculation(pairs, tees, badges, baskets, template) {
  const tm = new Map(tees.map(t => [t.detId,t]));
  const bm = new Map(badges.map(b => [b.detId,b]));
  return pairs.flatMap(pair => baskets.map(basket => {
    const tee=tm.get(pair.teeId), badge=bm.get(pair.badgeId);
    const top=topFromBasket(basket,template);
    const toBadge=signedAxis(tee,badge.center);
    // Use the S5 axis directed tee→badge; never substitute tee→basket chord.
    const dx=top[0]-tee.center[0],dy=top[1]-tee.center[1];
    const topAlongPx=dx*toBadge.ux+dy*toBadge.uy;
    const topSignedPerpPx=-toBadge.uy*dx+toBadge.ux*dy;
    const topAxialResidualDeg=Math.atan2(Math.abs(topSignedPerpPx),Math.abs(topAlongPx))/rad;
    calls.measureStraightGeometry++;
    const chord=measureStraightGeometry({holeLabel:badge.holeRead,
      badge:{detId:badge.detId,xPx:badge.center[0],yPx:badge.center[1],label:badge.holeRead,provenance:'S1 captured badge centroid'},
      tee:{detId:tee.detId,xPx:tee.center[0],yPx:tee.center[1],tier:'captured geometry',angleRad:tee.angleRad,provenance:tee.sourceMark},
      basket:{detId:basket.detId,xPx:top[0],yPx:top[1],strongIdentity:false,provenance:'template-predicted sprite top'}});
    const order = topAlongPx > toBadge.alongPx && toBadge.alongPx > 0 ? 'FORWARD_AFTER_BADGE' : 'ORDER_REJECT';
    return {id:`s6:${tee.detId}:${badge.detId}:${basket.detId}`,s5Id:pair.id,
      teeId:tee.detId,badgeId:badge.detId,basketId:basket.detId,holeRead:badge.holeRead,
      teeCenter:tee.center,badgeCenter:badge.center,basketTop:top,
      axisStart:[tee.center[0]-toBadge.ux*22,tee.center[1]-toBadge.uy*22],
      axisProjectionEndpoint:[tee.center[0]+toBadge.ux*Math.max(topAlongPx,toBadge.alongPx+20),tee.center[1]+toBadge.uy*Math.max(topAlongPx,toBadge.alongPx+20)],
      topProvenance:'BASKET_SPRITE_TEMPLATE_PREDICTION',topSignedPerpPx,
      topPerpendicularPx:Math.abs(topSignedPerpPx),topAxialResidualDeg,
      topAlongPx,badgeAlongPx:toBadge.alongPx,order,
      chordSupplement:chord, status:order==='ORDER_REJECT'?'REJECT_ORDER':'GEOMETRY_ONLY_UNVERIFIED_PATH',
      note:'Zero bends and top arrival need painted-path evidence; no route accepted.'};
  }));
}
function sourceTopSample(rgb, top) {
  const y=Math.round(top[1]), x=Math.round(top[0]); let bright=0;
  for(let dx=-15;dx<=15;dx++) {const i=((y*rgb.width+x+dx)*4); const p=rgb.data;
    if(Math.min(p[i],p[i+1],p[i+2])>=185) bright++;}
  return {sampleRowYPx:y, sampleWidthPx:31, brightRgbMin185:bright,
    caveat:'JPEG RGB brightness supports visible top-row context; it does not prove sprite pixel ownership.'};
}
function svgLayer(capture, axes, topSamples, selected, stage) {
  const path=pts=>pts.map(p=>`${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
  const pads=axes.tees.map(t=>`<g data-tee="${esc(t.detId)}"><polygon points="${path(t.corners)}" fill="#00e99e" fill-opacity=".08" stroke="#00eca0" stroke-width="2"/><line x1="${t.center[0]-Math.cos(t.angleRad)*24}" y1="${t.center[1]-Math.sin(t.angleRad)*24}" x2="${t.center[0]+Math.cos(t.angleRad)*24}" y2="${t.center[1]+Math.sin(t.angleRad)*24}" stroke="#00fff0" stroke-width="2"/><circle cx="${t.center[0]}" cy="${t.center[1]}" r="3.5" fill="#fff"/></g>`).join('');
  const badgeMarks=capture.marks.filter(m=>m.geometry.type==='badge').map(m=>`<circle cx="${m.geometry.center[0]}" cy="${m.geometry.center[1]}" r="5" fill="#fc66df" stroke="#fff" stroke-width="1"/>`).join('');
  const basketMarks=topSamples.map(({basketId,top})=>`<g data-basket="${esc(basketId)}"><path d="M${top[0]-6},${top[1]} L${top[0]+6},${top[1]}" stroke="#ffdb46" stroke-width="3"/><circle cx="${top[0]}" cy="${top[1]}" r="3" fill="#ffdb46"/></g>`).join('');
  const lines=selected.map(item=>stage==='S5'
    ? (()=>{const p=item;return `<g data-s5="${esc(p.id)}"><polyline points="${path([p.axisStart,p.axisBadgeEndpoint])}" stroke="#00fff0" stroke-opacity=".8" stroke-width="2" stroke-dasharray="6 5" fill="none"/><polyline points="${path([p.teeCenter,p.badgeCenter])}" stroke="#fc66df" stroke-width="2" fill="none"/><title>${esc(`${p.id}: ${fmt(p.signedPerpPx)} px / ${fmt(p.angleResidualDeg)}°. UNOWNED`)}</title></g>`;})()
    : (()=>{const r=item;return `<g data-s6="${esc(r.id)}"><polyline points="${path([r.axisStart,r.axisProjectionEndpoint])}" stroke="#ffdb46" stroke-opacity=".85" stroke-width="2" stroke-dasharray="6 5" fill="none"/><polyline points="${path([r.teeCenter,r.basketTop])}" stroke="#ffdb46" stroke-opacity=".9" stroke-width="2" fill="none"/><title>${esc(`${r.id}: template top ${fmt(r.topSignedPerpPx)} px / ${fmt(r.topAxialResidualDeg)}°, ${r.order}. UNOWNED`)}</title></g>`;})()).join('');
  const viewIds=selected.map(x=>x.id);
  return `<g id="${stage==='S5'?'s5':'s6'}-geometry" data-view-filter="${esc(viewIds.join(','))}"><g id="${stage}-focal-unowned-proposals">${lines}</g>${stage==='S5'?`<g id="s5-pad-outlines-and-axes">${pads}</g><g id="s5-badge-centroids">${badgeMarks}</g><g id="s5-unsupported-no-fit">${axes.unknown.map(t=>`<path d="M${t.center[0]-6} ${t.center[1]-6}l12 12m0 -12l-12 12" stroke="#ff9d28" stroke-width="2"/>`).join('')}</g>`:`<g id="s6-basket-template-tops">${basketMarks}</g>`}</g>`;
}

for(const stem of ['AlexClark-original','IMG_5641']) {
  const capture=JSON.parse(readFileSync(resolve(root,`artifacts/composed-render-20260927/${stem}-capture.json`)));
  composeRender(capture); // verifies every S1-S4 mark against its PCR producer and frame
  const captureSha256=sha(readFileSync(resolve(root,`artifacts/composed-render-20260927/${stem}-capture.json`)));
  let fitGateway=null,fitGatewaySha256=null;
  if(geometry==='constrained-support') {
    const bytes=readFileSync(resolve(root,`artifacts/recovered-pad-fit-20260927/${stem}-gateway.json`));
    fitGatewaySha256=sha(bytes);fitGateway=JSON.parse(bytes);
    if(fitGateway.schema!=='recovered-pad-fit-gateway@1'||fitGateway.sourceSha256!==capture.source.sha256||
      JSON.stringify(fitGateway.frame)!==JSON.stringify(capture.source.frame)||
      fitGateway.paramsHash!==capture.paramsHash||fitGateway.runs.OFF.manifest.operations.length!==0||
      fitGateway.runs.OFF.candidate!==null||fitGateway.runs.ON.manifest.operations.length!==1)
      throw new Error('fit gateway source/frame or explicit feature testimony mismatch');
  }
  const source=readFileSync(resolve(root,capture.source.path));
  if(sha(source)!==capture.source.sha256) throw new Error('source JPEG drift');
  const axes=axesOf(capture,fitGateway);
  const badges=capture.marks.filter(m=>m.geometry.type==='badge').map(m=>({detId:m.detail.detId,holeRead:String(m.detail.holeRead),center:m.geometry.center,sourceMark:m.id}));
  const baskets=capture.marks.filter(m=>m.geometry.type==='basket-tip').map(m=>({detId:m.detail.detId,tip:m.geometry.tip,bbox:m.geometry.bbox,sourceMark:m.id}));
  if(badges.length!==capture.counts.badges||baskets.length!==capture.counts.baskets||axes.tees.length!==capture.counts.visibleTees+capture.counts.recoveredTees)
    throw new Error('captured inventory mismatch');
  const rgb=jpeg.decode(source,{useTArray:true});
  const board=createExecBoard();
  board.set('px.s4.sealedCapture',{axes,badges,baskets,sourceSha256:capture.source.sha256,
    canonicalRgbaSha256:capture.source.frame.canonicalRgbaSha256,priorPcrRunResultIds:Object.values(capture.pcrs).map(p=>p.runResultId)});
  board.set('px.s0.originalRgb',rgb);
  board.set('px.s6.spriteTemplate',sprite);
  const paramsHash=jsonHash({source:capture.source.sha256,canonical:capture.source.frame.canonicalRgbaSha256,
    previous:capture.paramsHash,calculation:'s5s6@3',captureSha256,
    basketSprite:jsonHash(sprite),topAdapter,activeProviderFiles,geometry,fitGatewaySha256});
  for(const key of Object.keys(calls)) calls[key]=0;
  const runS5=b=>{const input=b.get('px.s4.sealedCapture');b.set('px.s5.axes',input.axes);
    calls.signedResiduals++;b.set('px.s5.pairs',s5Calculation(input.axes.tees,input.badges));};
  const runS6=b=>{const axes=b.get('px.s5.axes');const pairs=b.get('px.s5.pairs');const input=b.get('px.s4.sealedCapture');
    const rgbPart=b.get('px.s0.originalRgb');const template=b.get('px.s6.spriteTemplate');
    const topSamples=input.baskets.map(basket=>{const top=topFromBasket(basket,template);return {basketId:basket.detId,top,...sourceTopSample(rgbPart,top)};});
    b.set('px.s6.topSamples',topSamples);calls.axisToTemplateTop++;
    b.set('px.s6.proposals',s6Calculation(pairs,axes.tees,input.badges,input.baskets,template));};
  const set=createS5S6FeatureSet({measurePairs,signedResiduals:s5Calculation,measureStraightGeometry,
    axisToTemplateTop:s6Calculation,runS5,runS6});
  const disabled=compileABFeatureSet(set,{},paramsHash);
  if(disabled.plan.ops.length!==0||disabled.enabledFeatureIds.length!==0) throw new Error('default-OFF feature set scheduled operations');
  const compiled=compileABFeatureSet(set,S5S6_EXPLICIT_ON,paramsHash);
  const plan=compiled.plan;
  // Bound functions are invoked from the adapters; these counts make the
  // gateway's own frozen-function blind spot explicit and independently testable.
  const manifest=await executeABFeatureSet(compiled,board,{},
    {runId:`${stem}-${paramsHash.slice(0,12)}`,invocation:'s5s6Replay.mjs explicit opt-in'});
  const receipts=manifest.operations;
  const s5=board.get('px.s5.pairs'),s6=board.get('px.s6.proposals');
  const topSamples=board.get('px.s6.topSamples');
  const unknownBadges=badges.filter(b=>!Number.isInteger(Number(b.holeRead))||Number(b.holeRead)<=0)
    .map(b=>({badgeId:b.detId,holeRead:b.holeRead,reason:'UNREAD_OR_NONNUMERIC: existing measurePairs cannot score this badge'}));
  if(s5.length!==axes.tees.length*(badges.length-unknownBadges.length)||s6.length!==s5.length*baskets.length) throw new Error('candidate cardinality mismatch');
  const pcr5=composePcr({id:'s5.axis-badge',title:'S5 axis to badge',tickIds:['s5.axisBadge']},plan,receipts);
  const pcr6=composePcr({id:'s6.tee-basket-straight',title:'S6 axis to basket top',tickIds:['s6.teeBasketStraight']},plan,receipts);
  const byTee=axes.tees.map(t=>{
    const all=s5.filter(p=>p.teeId===t.detId).sort((a,b)=>a.angleResidualDeg-b.angleResidualDeg||a.perpendicularPx-b.perpendicularPx);
    const choices=all.slice(0,focusCount).map(p=>{const onward=s6.filter(r=>r.s5Id===p.id).sort((a,b)=>(a.order==='ORDER_REJECT')-(b.order==='ORDER_REJECT')||a.topAxialResidualDeg-b.topAxialResidualDeg||a.topPerpendicularPx-b.topPerpendicularPx);
      return {s5:p,s6:onward[0],s6RunnerUp:onward[1]};});
    return {teeId:t.detId,geometrySource:t.geometrySource,sourceMark:t.sourceMark,leadingProposals:choices,
      pairCount:all.length,ambiguous:'all associations remain unowned'};
  });
  // Full measured inventories stay addressable in pairs.json. The focal view
  // is deliberately narrow; an angular minimum is not an ownership decision.
  const focusIds=stem==='AlexClark-original'?['tee-recovered-2','tee-1']:['tee-recovered-1','tee-0'];
  const focused=byTee.filter(t=>focusIds.includes(t.teeId)).flatMap(t=>t.leadingProposals);
  const selectedS5=focused.map(x=>x.s5),selectedS6=focused.map(x=>x.s6);
  const contentId=jsonHash({source:capture.source.sha256,canonical:capture.source.frame.canonicalRgbaSha256,
    prior:Object.values(capture.pcrs).map(p=>p.runResultId),s5,s6,unknown:axes.unknown,topSamples});
  const receipt={schema:'chainspot-s5-s6-experiment@1',source:capture.source,priorParamsHash:capture.paramsHash,
    priorProviderIdentity:capture.providerIdentity,activeProviderFiles,captureSha256,
    geometryVariant:geometry,fitGatewaySha256,topAdapter,
    bboxCenterAdaptation:'[capturedBadgeCentroidX,capturedBadgeCentroidY,1,1]; existing measurePairs bbox-center equals captured centroid; synthetic carrier is not original clean Badge Part',
    paramsHash:plan.paramsHash,contentId,
    abFeatureSet:{id:set.id,enabled:compiled.enabledFeatureIds,manifestHash:manifest.manifestHash,planFingerprint:plan.planFingerprint,
      defaultEnabled:false,invocation:manifest.invocation},unknownBadges,
    stages:[{id:'S5',pcr:pcr5,renderId:pcrRenderId(pcr5,{contentId,layer:'S5',focusCount})},
      {id:'S6',pcr:pcr6,renderId:pcrRenderId(pcr6,{contentId,layer:'S6',focusCount})}],
    actualInvocationCounts:{...calls},unknown:axes.unknown,topSamples,axes:axes.tees,
    pairCount:s5.length,proposalCount:s6.length,orderRejectCount:s6.filter(r=>r.order==='ORDER_REJECT').length,
    leadingByTee:byTee,viewFilter:{focusCount,focusIds,drawnS5:selectedS5.map(x=>x.id),drawnS6:selectedS6.map(x=>x.id)},
    limitations:['Both the frozen captured S4 recovered-pad polygon and the candidate support pose came from badge-ray-constrained recovery; neither independently confirms its badge. Antialias edge fit is not fully validated.','Existing S4 pair function sees synthetic centroid-preserving Tee/Badge carriers; clean Stage S5/S6 contracts do not exist.','S6 top is a sprite-template prediction using a captured bbox relation and default semantic tip offset; bright-row sample is context, not independently identified ink.','No tee/badge/basket ownership or zero-bend path is accepted.','Gateway get/set traffic is exact; register/call and nested invocation are not gateway tracked. Explicit adapter counts and result cardinalities cover calls here.','Current source/dist files are pinned separately; their transpiled equivalence is not proven.','The best-angle focus selection is a visualization heuristic known to pair some remote badges; never an assignment.']};
  writeFileSync(resolve(out,`${stem}-receipt.json`),JSON.stringify(receipt,null,2));
  writeFileSync(resolve(out,`${stem}-pairs.json`),JSON.stringify({s5,s6}));
  const priorSvg=composedSvg(composeRender(capture),source);
  if(!priorSvg.includes('<image ')||!priorSvg.includes('id="mark-')||!priorSvg.endsWith('</svg>')) throw new Error('prior composed SVG unavailable or changed');
  for(const stage of ['S5','S6']) {
    const layers=stage==='S5' ? svgLayer(capture,axes,topSamples,selectedS5,'S5')
      : svgLayer(capture,axes,topSamples,selectedS5,'S5')+svgLayer(capture,axes,topSamples,selectedS6,'S6');
    writeFileSync(resolve(out,`${stem}-cumulative-${stage}.svg`),priorSvg.slice(0,-6)+layers+'</svg>');
  }
  console.log(`${stem} | S5 ${s5.length} measured pairs (${axes.tees.length} fitted pad axes × ${badges.length} badges), ${axes.unknown.length} no-fit; S6 ${s6.length} template-top proposals, ${receipt.orderRejectCount} order rejects`);
  console.log(`  PCR S5 ${pcr5.runResultId.slice(0,16)} → ${pcr5.ticks[0].testimony.actualConsumes.join(',')} / ${pcr5.ticks[0].testimony.actualProduces.join(',')}; S6 ${pcr6.runResultId.slice(0,16)} → ${pcr6.ticks[0].testimony.actualConsumes.join(',')} / ${pcr6.ticks[0].testimony.actualProduces.join(',')}`);
  for(const t of byTee) {const best=t.leadingProposals[0];console.log(`  ${t.teeId}: ${best.s5.id} axis ${fmt(best.s5.signedPerpPx)} px / ${fmt(best.s5.angleResidualDeg)}°; ${best.s6.id} top ${fmt(best.s6.topSignedPerpPx)} px / ${fmt(best.s6.topAxialResidualDeg)}° ${best.s6.order}; UNOWNED`);}
  for(const t of axes.unknown) console.log(`  ${t.detId}: ${t.reason}`);
  console.log(`  ${out}/${stem}-cumulative-S5.svg and -S6.svg | content ${contentId.slice(0,16)}; focal ${focused.length} unowned proposals; no path accepted`);
}
