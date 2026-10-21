import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { deserialize } from '../fg/pxcCodec.mjs';   // node:v8 with packed typed arrays
import { fileURLToPath } from 'node:url';

const inside = (root, candidate) => {
  const rel = path.relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const singleQuote = value => `'${String(value).replace(/'/g, "'\\''")}'`;
const first = (...values) => values.find(v => v !== undefined && v !== null);

async function readJson(root, rel) {
  if (typeof rel !== 'string' || !rel) return null;
  const file = path.resolve(root, rel);
  if (!inside(root, file)) return { _unavailable: `Outside forkRoot: ${rel}` };
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { return { _unavailable: `Cannot read ${rel}: ${error.message}` }; }
}

function textOf(value) { return typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value, null, 2); }
function brief(value) {
  if (value == null) return UNKNOWN_TEXT;
  if (typeof value !== 'object') return textOf(value);
  return Object.entries(value).slice(0, 8).map(([key, item]) => `${key}: ${Array.isArray(item) ? `${item.length} items` : item && typeof item === 'object' ? 'details available' : textOf(item)}`).join(' · ') || UNKNOWN_TEXT;
}

function findCrop(early, summary) {
  const source = early?.source ?? summary.source ?? {};
  const nativeS0 = early?.stages?.find(s => s.id === 'S0') ?? {};
  const s0 = (summary.stages ?? []).find(s => s.stage === 'S0') ?? {};
  const evidence = first(early?.experiments?.branches?.S0?.evidence, s0.summary?.evidence, s0.candidate?.evidence, {});
  const receipt = `${nativeS0.receipt ?? ''}\n${s0.receipt ?? ''}`;
  const match = receipt.match(/rowsRemoved:\s*upper=(\d+)\s+lower=(\d+)/);
  const width = first(source.widthPx, source.width, summary.source?.widthPx);
  const height = first(source.heightPx, source.height, summary.source?.heightPx);
  const top = first(evidence.topRowsRemoved, match ? Number(match[1]) : undefined, 0);
  const bottom = first(evidence.bottomRowsRemoved, match ? Number(match[2]) : undefined, 0);
  return { width, height, top, bottom, known: Number.isFinite(width) && Number.isFinite(height) && Number.isFinite(top) && Number.isFinite(bottom) };
}

function stageRows(summary, early, late, s7) {
  return (summary.stages ?? []).map((stage, index) => {
    const native = stage.stage?.startsWith('S') && Number(stage.stage.slice(1)) <= 3 ? early :
      Number(stage.stage?.slice(1)) <= 6 ? late : s7;
    const nativeStage = native?.stages?.find(s => (s.id ?? s.stageId ?? s.stage) === stage.stage) ?? null;
    const experiment = native?.experiments?.branches?.[stage.stage] ?? null;
    return { ...stage, _index: index, _native: nativeStage, _experiment: experiment };
  });
}

async function attachStageContracts(root, stages, request) {
  const lanesSelected = Array.isArray(request.lanes) ? request.lanes : [];
  const recipe = request.recipe ?? 'recipes/chainspot-s0-s7.json';
  const selectedThroughStage = [];
  for (const stage of stages) {
    const n = Number(String(stage.stage).replace('S', ''));
    if (!Number.isInteger(n)) continue;
    const stageDoc = await readJson(root, `stages/s${n}.json`);
    stage._stageContract = stageDoc && !stageDoc._unavailable ? stageDoc : null;
    const lanePaths = [stageDoc?.lane, ...(stageDoc?.auxiliaryLanes ?? [])].filter(Boolean);
    stage._lanes = [];
    for (const lanePath of lanePaths) {
      const lane = await readJson(root, lanePath);
      if (!lane || lane._unavailable) continue;
      stage._lanes.push({ ...lane, selected: lanesSelected.includes(lane.name) });
      if (lanesSelected.includes(lane.name)) selectedThroughStage.push(lane.name);
    }
    const selectors = `--recipe ${singleQuote(recipe)} --source ${singleQuote(request.sourcePath ?? 'UNKNOWN')} --until ${singleQuote(String(n))}${selectedThroughStage.length ? ` --lanes ${singleQuote(selectedThroughStage.join(','))}` : ''}`;
    stage._nextCommand = `node toolkit.mjs neat ${selectors}\nnode toolkit.mjs run ${selectors}`;
  }
  return stages;
}

function nativePixelObjects(snapshot, part) {
  const values = snapshot?.[part];
  if (!Array.isArray(values)) return [];
  return values.map((item, i) => {
    const raw = item?.px;
    const pixels = raw instanceof Set ? [...raw] : Array.isArray(raw) || ArrayBuffer.isView(raw) ? [...raw] : raw && typeof raw === 'object' ? Object.values(raw) : [];
    return { id: item?.detId ?? item?.label ?? `${part}-${i + 1}`, pixels: pixels.filter(n => Number.isInteger(n) && n >= 0) };
  }).filter(item => item.pixels.length);
}

function explicitLayers(stages, late, geometry, geometryVerified, pxc, s7) {
  const layers = stages.map(stage => ({ stage: stage.stage, label: `${stage.stage} evidence`, shapes: [] }));
  const addPixels = (stageId, part) => { const layer = layers.find(item => item.stage === stageId); if (layer) layer.pixelObjects = nativePixelObjects(pxc, part); };
  addPixels('S1', 'px.badges'); addPixels('S2', 'px.baskets'); addPixels('S3', 'px.tees');
  const s6 = late?.s6;
  const hits = Array.isArray(s6?.hits) ? s6.hits : [];
  const s6Layer = layers.find(layer => layer.stage === 'S6');
  if (s6Layer && s6?.frame === 'original-jpeg-pixels') {
    for (const hit of hits) {
      if (!Array.isArray(hit.teeCenter) || !Array.isArray(hit.u) || !Number.isFinite(hit.enterPx) || !Number.isFinite(hit.exitPx)) continue;
      const [x, y] = hit.teeCenter, [ux, uy] = hit.u;
      if (![x, y, ux, uy].every(Number.isFinite)) continue;
      s6Layer.shapes.push({ kind: 'axis', id: hit.id ?? hit.teeId ?? 'native-axis',
        from: [x + ux * hit.enterPx, y + uy * hit.enterPx], to: [x + ux * hit.exitPx, y + uy * hit.exitPx],
        center: [x, y], note: 'Native S6 diagnostic axis; not owned pixels' });
    }
  }
  if (geometryVerified && geometry?.frame === 'original-jpeg-pixels') {
    const baseline = layers.find(layer => layer.stage === 'S4');
    const refined = layers.find(layer => layer.stage === 'S6');
    const addPoses = (layer, poses, category) => {
      if (!layer) return;
      for (const pose of poses ?? []) {
        if (!Array.isArray(pose.corners) || pose.corners.length !== 4 || !pose.corners.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) continue;
        const support = pose.cornerSupport ?? pose.corners.map(() => ({ status: 'UNKNOWN' }));
        layer.shapes.push({ kind: 'outline', id: pose.detId ?? pose.sourceMark ?? category,
          corners: pose.corners, inferred: support.some(p => p.status === 'inferred'),
          state: String(pose.status ?? '').includes('REFIT_REQUIRED') || String(pose.status ?? '').includes('REJECT') ? 'rejected' : category.includes('recovered') ? 'recovered' : support.some(p => p.status === 'inferred') ? 'inferred' : 'observed',
          note: `${category}; corner support includes ${[...new Set(support.map(p => p.status ?? 'UNKNOWN'))].join(', ')}` });
      }
    };
    const s3 = layers.find(layer => layer.stage === 'S3');
    addPoses(s3, geometry.baselineAxes?.visible ?? [], 'observed S3 tee corners');
    addPoses(baseline, geometry.baselineAxes?.recovered ?? [], 'recovered tee corners');
    if (baseline) for (const proposal of geometry.basketRecoveryProposals ?? []) {
      const box = proposal.sourceBbox;
      if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite)) continue;
      const [x, y, w, h] = box;
      if (w <= 0 || h <= 0) continue;
      baseline.shapes.push({ kind: 'outline', id: `basket-recovery-proposal-${proposal.index ?? baseline.shapes.length}`,
        corners: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], state: 'recovered', inferred: true,
        note: `${proposal.classification ?? 'basket proposal'}; ${proposal.provenance ?? 'pixel ownership UNKNOWN'}` });
    }
    addPoses(baseline, geometry.guardedTargetRebindings ?? [], 'guarded target rebindings');
    if (baseline) for (const pose of geometry.baselineAxes?.unknown ?? []) {
      if (Array.isArray(pose.center) && pose.center.every(Number.isFinite)) baseline.shapes.push({ kind: 'marker', point: pose.center, id: pose.detId ?? pose.holeRead ?? 'unresolved tee', state: 'unknown', note: pose.reason ?? 'no source-backed pose' });
    }
    addPoses(refined, [...(geometry.refinedAxes?.visible ?? []), ...(geometry.refinedAxes?.recovered ?? [])], 'refined tee corners');
    const s5 = layers.find(layer => layer.stage === 'S5');
    const axes = [...(geometry.baselineAxes?.visible ?? []), ...(geometry.baselineAxes?.recovered ?? [])];
    if (s5) for (const pose of axes) {
      if (!Array.isArray(pose.center) || !Array.isArray(pose.u) || !Number.isFinite(pose.enterPx) || !Number.isFinite(pose.exitPx)) continue;
      const [x, y] = pose.center, [ux, uy] = pose.u;
      s5.shapes.push({ kind: 'axis', id: pose.detId ?? 'native-hit', from: [x, y],
        to: [x + ux * pose.exitPx, y + uy * pose.exitPx], center: [x, y], note: 'Native S5 two-ray hit; not owned pixels' });
    }
  }
  if (late?._verifiedS6Rows?.frame === 'original-jpeg-pixels') {
    const rows = late._verifiedS6Rows.rows ?? [];
    const hits = late._verifiedS6Rows.hits ?? [];
    const globallyAssigned=late._verifiedS6Rows.assignment?.selected===true;
    const candidateHits=globallyAssigned?(late._verifiedS6Rows.candidateHits??[]):hits;
    const selectedIds=new Set(hits.map(hit=>hit.id));
    const badgeRead=new Map((geometry?.badgePlates??[]).map(b=>[b.detId,b.holeRead]));
    const s5 = layers.find(layer => layer.stage === 'S5');
    if (s5) for (const hit of [...candidateHits].sort((a,b)=>Number(selectedIds.has(a.id))-Number(selectedIds.has(b.id)))) {
      if (!Array.isArray(hit.teeCenter) || !Array.isArray(hit.u) || !Number.isFinite(hit.enterPx) || !Number.isFinite(hit.exitPx)) continue;
      const [x, y] = hit.teeCenter, [ux, uy] = hit.u;
      if (![x, y, ux, uy].every(Number.isFinite)) continue;
      const selected=globallyAssigned&&selectedIds.has(hit.id);
      s5.shapes.push({ kind: 'axis', id: hit.id ?? hit.teeId ?? 'S5 plate ray', from: [x, y],
        to: [x + ux * hit.exitPx, y + uy * hit.exitPx], center: [x, y],
        state:globallyAssigned?(selected?'selected':'alternative'):'candidate',
        note:`${selected?'Globally selected':'Competing candidate'} ${hit.teeId} → ${hit.badgeId} (H${badgeRead.get(hit.badgeId)??'?'}) · graph pairing only; physical ownership UNKNOWN` });
    }
    const s6 = layers.find(layer => layer.stage === 'S6');
    if (s6) for (const row of rows) {
      if (!Array.isArray(row.teeCenter) || !row.teeCenter.every(Number.isFinite)) continue;
      const status = row.status ?? UNKNOWN_TEXT;
      if (!String(status).includes('CANDIDATE') || !Array.isArray(row.templateTop) || row.templateTop.length !== 2 || !row.templateTop.every(Number.isFinite)) continue;
      s6.shapes.push({ kind: 'axis', from: row.teeCenter, to: row.templateTop, center: row.templateTop,
        id: row.id ?? row.teeId ?? 'S6 top proposal', outcome: status, state: 'candidate',
        note: 'Unowned straight top proposal; rejected rows remain in the native receipt' });
    }
  }
  if (!late?._verifiedS6Rows && late?._verifiedS5Assignment?.frame === 'original-jpeg-pixels') {
    const assignment=late._verifiedS5Assignment.assignment;
    const s5=layers.find(layer=>layer.stage==='S5');
    const badgeRead=new Map((geometry?.badgePlates??[]).map(b=>[b.detId,b.holeRead]));
    if(s5)for(const row of [...(assignment?.candidateRows??[])].sort((a,b)=>Number(a.selected)-Number(b.selected))){
      const hit=row.hit;
      if(!hit || !Array.isArray(hit.teeCenter)||!Array.isArray(hit.u)||!Number.isFinite(hit.exitPx))continue;
      const [x,y]=hit.teeCenter,[ux,uy]=hit.u;
      if(![x,y,ux,uy].every(Number.isFinite))continue;
      s5.shapes.push({kind:'axis',id:hit.id,from:[x,y],to:[x+ux*hit.exitPx,y+uy*hit.exitPx],center:[x,y],
        state:row.selected?'selected':'alternative',
        note:`${row.selected?'Globally selected':'Competing candidate'} ${hit.teeId} → ${hit.badgeId} (H${badgeRead.get(hit.badgeId)??'?'}) · graph pairing only; physical ownership UNKNOWN`});
    }
  }
  if (s7?._verifiedTraces?.length) {
    const layer = layers.find(item => item.stage === 'S7');
    if (layer) for (const trace of s7._verifiedTraces) {
      if (!Array.isArray(trace.points) || trace.points.length < 2 || !trace.points.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) continue;
      layer.shapes.push({ kind: 'trace', points: trace.points, id: trace.name ?? 'native S7 trace', outcome: trace.outcome ?? UNKNOWN_TEXT });
    }
  }
  return layers;
}

function resolveEvidencePath(root, value, base = root) {
  if (typeof value !== 'string' || !value) return null;
  const resolved = path.resolve(base, value);
  return inside(root, resolved) ? resolved : null;
}

async function validatedEvidence(root, entries, base = root) {
  const found = [];
  for (const entry of entries ?? []) {
    const file = resolveEvidencePath(root, entry.path, base);
    if (!file || !entry.sha256) continue;
    try {
      const bytes = await readFile(file);
      if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) continue;
      found.push({ path: file, relativePath: path.relative(root, file), content: JSON.parse(bytes.toString('utf8')), sha256: entry.sha256 });
    } catch { /* Missing, unhashable, or non-JSON evidence is not promoted to geometry. */ }
  }
  return found;
}

function summarizeStage(stage) {
  const native = stage._native ?? {};
  const lanes = stage._lanes ?? [];
  return {
    stage: stage.stage, source: stage.source ?? UNKNOWN_TEXT, durationMs: stage.durationMs ?? native.durationMs ?? null,
    baseline: first(stage.summary, native.summary, native.counts, null), candidate: first(stage.candidate, stage.unknown, native.refinement, stage._experiment, null),
    responsibility: stage._stageContract?.responsibility ?? UNKNOWN_TEXT, lanes,
    benefit: first(...lanes.map(lane => lane.expectedBenefit), stage.candidate?.expectedBenefit, stage.candidate?.benefit, stage._experiment?.benefit, null),
    falsifier: first(...lanes.map(lane => lane.falsifier), stage.candidate?.falsifier, stage._experiment?.falsifier, null),
    nextCommand: stage._nextCommand ?? UNKNOWN_TEXT,
    acceptance: stage.acceptance ?? UNKNOWN_TEXT,
  };
}
const UNKNOWN_TEXT = 'UNKNOWN';

function stageCard(stage) {
  const summary = summarizeStage(stage);
  return `<article class="stage-card"><header><span class="stage-id">${esc(summary.stage)}</span><span class="pill">${esc(summary.source)}</span><span class="accept">Acceptance: ${esc(summary.acceptance)}</span></header>
    <p><b>Responsibility</b> ${esc(summary.responsibility)}</p>
    <div class="claim-grid"><p><b>Native / baseline</b><br>${esc(brief(summary.baseline))}</p><p><b>Candidate observation</b><br>${esc(brief(summary.candidate))}</p></div>
    <div class="claim-grid"><p><b>Expected benefit</b><br>${esc(summary.benefit ?? UNKNOWN_TEXT)}</p><p><b>Falsifier</b><br>${esc(summary.falsifier ?? UNKNOWN_TEXT)}</p></div>
    <p><b>Lane contracts</b> ${summary.lanes.length ? summary.lanes.map(l => `${esc(l.name)} (${esc(l.type ?? UNKNOWN_TEXT)}, default ${esc(l.default ?? UNKNOWN_TEXT)}; ${l.selected ? 'selected' : 'not selected'})`).join(' · ') : 'None declared'}</p>
    <p><b>Next replay command</b></p><div class="command">${esc(summary.nextCommand)}</div>
    <details><summary>Raw native fields</summary><div class="metrics"><pre>${esc(textOf(summary.baseline ?? UNKNOWN_TEXT))}</pre><pre>${esc(textOf(summary.candidate ?? UNKNOWN_TEXT))}</pre></div></details></article>`;
}

function matrixRow(stage) {
  const data = summarizeStage(stage);
  const unknown = stage.unknown ?? stage.candidate?.unknown ?? UNKNOWN_TEXT;
  return `<tr><th>${esc(data.stage)}</th><td>${esc(data.source)}</td><td>${esc(brief(data.baseline))}</td><td>${esc(brief(data.candidate))}</td><td>${esc(brief(unknown))}</td><td>${esc(data.acceptance)}</td></tr>`;
}

function htmlDoc(data) {
  const dataScript = safeJson(data);
  const executed = data.stages.map(stage => Number(String(stage.stage).match(/^S([0-7])$/)?.[1])).filter(Number.isInteger);
  const requested = Number(data.request?.until);
  const highestStage = executed.length ? Math.max(...executed) : Number.isInteger(requested) && requested >= 0 && requested <= 7 ? requested : 0;
  const cards = data.stages.map(stageCard).join('\n');
  const matrix = data.stages.map(matrixRow).join('\n');
  const blockers = data.blockers.length ? data.blockers.map(x => `<li>${esc(x)}</li>`).join('') : '<li>None reported by the stage run.</li>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ChainSpot stage progress</title>
<style>
:root{color-scheme:light;--ink:#17211f;--muted:#5b6965;--line:#dbe3df;--paper:#fff;--wash:#f3f7f4;--green:#176b52;--amber:#9b6712;--red:#9e443f}*{box-sizing:border-box}body{margin:0;background:var(--wash);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:1220px;margin:auto;padding:32px 22px 64px}.eyebrow{text-transform:uppercase;letter-spacing:.12em;color:var(--green);font-weight:750;font-size:12px}h1{font-size:clamp(30px,5vw,48px);line-height:1.06;margin:8px 0 12px;letter-spacing:-.035em}.lede{max-width:850px;color:var(--muted);font-size:17px}.panel,.stage-card{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:20px;margin:18px 0;box-shadow:0 3px 14px #142a2010}h2{margin:0 0 14px;font-size:23px;letter-spacing:-.02em}h3{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 6px}.hero{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(250px,.7fr);gap:18px;align-items:start}.canvas-wrap{background:#152420;border-radius:12px;overflow:hidden;display:grid;place-items:center;min-height:280px}.canvas-wrap canvas{display:block;width:100%;height:auto;max-height:82vh;object-fit:contain}.legend{display:flex;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:13px;margin:12px 0}.swatch{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:5px;vertical-align:-1px}.side-note{color:var(--muted);font-size:14px}.blockers{border-left:4px solid var(--amber);padding:8px 14px;background:#fff9eb;border-radius:4px}.stage-card header{display:flex;gap:10px;align-items:center;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:11px;margin-bottom:14px}.stage-id{font-size:20px;font-weight:800;color:var(--green)}.pill,.accept{border-radius:99px;background:#eef4f0;padding:3px 10px;font-size:12px;color:var(--muted)}.accept{margin-left:auto;background:#fff4df;color:#76500d}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:12px}.metrics>div{min-width:0}.metrics pre,td pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f7f9f8;border-radius:8px;padding:10px;margin:0;font:12px/1.4 ui-monospace,SFMono-Regular,monospace;max-height:280px;overflow:auto}.claim-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;color:var(--muted);font-size:14px}.claim-grid p{margin:12px 0 0}.command{white-space:pre-wrap;overflow-wrap:anywhere;background:#17211f;color:#e7f5ee;border-radius:9px;padding:14px;font:13px/1.5 ui-monospace,SFMono-Regular,monospace}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;min-width:880px;font-size:13px}th,td{text-align:left;vertical-align:top;padding:9px;border-bottom:1px solid var(--line)}th{font-weight:750;color:var(--muted)}td pre{max-height:180px}footer{margin-top:24px;color:var(--muted);font-size:13px}@media(max-width:780px){.hero{grid-template-columns:1fr}.metrics,.claim-grid{grid-template-columns:1fr}.accept{margin-left:0}}
</style></head><body><main><div class="eyebrow">Native stage evidence · local, portable report</div><h1>Progress through the ChainSpot pipeline</h1><p class="lede">This board presents the run summary alongside its native receipts. The course canvas uses one S0-cropped source frame; diagnostic overlays appear only when receipt geometry provides coordinates in the declared source frame. A bounding box is never treated as owned pixels.</p>
<section class="hero"><div class="panel"><h2>Shared cropped-course canvas</h2><label for="stage-scrubber"><b>Show cumulative evidence through <span id="stage-value">S0</span></b></label><input id="stage-scrubber" type="range" min="0" max="${highestStage}" value="${highestStage}" step="1" aria-label="Select cumulative stage layer"><div class="canvas-wrap"><canvas id="course" aria-label="Cropped course source image with cumulative native stage layers"></canvas></div><div class="legend" id="legend"></div><p class="side-note" id="canvas-note"></p>${data.contentSafetyNote ? `<p class="blockers"><b>Content-safety review: MAYBE.</b> ${esc(data.contentSafetyNote)}</p>` : ''}</div><aside><div class="panel"><h2>Run state</h2><p><b>Requested through:</b> ${esc(data.request.until ?? UNKNOWN_TEXT)}</p><p><b>Selected lanes:</b> ${esc((data.request.lanes ?? []).join(', ') || UNKNOWN_TEXT)}</p><p><b>Human acceptance:</b> ${esc(data.humanAcceptance ?? UNKNOWN_TEXT)}</p><p><b>Upstream variant:</b></p><pre>${esc(textOf(data.upstreamVariant ?? UNKNOWN_TEXT))}</pre></div><div class="panel blockers"><h2>Blockers / unknowns</h2><ul>${blockers}</ul></div></aside></section>
<section><h2>Stage evidence cards</h2>${cards || '<p class="panel">No stage observations are present.</p>'}</section>
<section class="panel"><h2>Stage comparison matrix</h2><div class="table-scroll"><table><thead><tr><th>Stage</th><th>Evidence source</th><th>Baseline / native metrics</th><th>Candidate / observation</th><th>Blocker / UNKNOWN</th><th>Acceptance</th></tr></thead><tbody>${matrix}</tbody></table></div></section>
<section class="panel"><h2>Reproduction command</h2><p>Run from the checkpoint root:</p><div class="command">${esc(data.command)}</div></section><footer>${esc(data.testimonyLimit ?? 'Native receipt presence does not imply human acceptance or semantic correctness.')}</footer></main>
<script id="board-data" type="application/json">${dataScript}</script><script>
(()=>{
 const d=JSON.parse(document.getElementById('board-data').textContent), canvas=document.getElementById('course'), ctx=canvas.getContext('2d');
 const note=document.getElementById('canvas-note'), legend=document.getElementById('legend'), slider=document.getElementById('stage-scrubber'), stageValue=document.getElementById('stage-value');
 const colors=['#25d3a1','#ffd166','#72b7ff','#ff7d6b','#d3a2ff','#f28cb1','#a6df64','#f3a847'], layers=d.layers||[];
 for(const [i,l] of layers.entries()){const mark=document.createElement('span'),swatch=document.createElement('i');swatch.className='swatch';swatch.style.background=colors[i%colors.length];const pixelCount=(l.pixelObjects||[]).length,shapeCount=(l.shapes||[]).length;mark.append(swatch,document.createTextNode(l.stage+' · '+(pixelCount?pixelCount+' pixel objects':shapeCount?shapeCount+' native shapes':'geometry UNKNOWN')));legend.append(mark)}
 if(!d.imageDataUrl){note.textContent=d.sourceUnavailable||'Source JPEG unavailable; canvas geometry is UNKNOWN.';return}
 const img=new Image();img.onload=()=>{
   const c=d.crop||{}, top=c.known?c.top:0, bottom=c.known?c.bottom:0;canvas.width=img.naturalWidth;canvas.height=img.naturalHeight-top-bottom;
   ctx.drawImage(img,0,top,img.naturalWidth,canvas.height,0,0,canvas.width,canvas.height);
   const draw=()=>{const selected=Number(slider.value);stageValue.textContent='S'+selected;ctx.drawImage(img,0,top,img.naturalWidth,canvas.height,0,0,canvas.width,canvas.height);
     layers.forEach((layer,i)=>{const stageNo=Number(String(layer.stage).replace('S',''));if(!Number.isFinite(stageNo)||stageNo>selected)return;ctx.save();ctx.strokeStyle=colors[i%colors.length];ctx.fillStyle=colors[i%colors.length];ctx.lineWidth=Math.max(2,canvas.width/700);
       for(const object of layer.pixelObjects||[])for(const index of object.pixels){const x=index%canvas.width,y=Math.floor(index/canvas.width);if(y<canvas.height)ctx.fillRect(x,y,1,1)}
       for(const shape of layer.shapes||[]){ctx.strokeStyle=shape.state==='rejected'?'#d34f49':shape.state==='selected'?'#14b760':shape.state==='alternative'?'#97a8bb':shape.state==='candidate'?'#13855d':shape.state==='inferred'||shape.state==='recovered'?'#c88920':shape.state==='unknown'?'#777777':colors[i%colors.length];if(shape.kind==='axis'){ctx.lineWidth=shape.state==='selected'?Math.max(4,canvas.width/370):Math.max(1.5,canvas.width/900);ctx.setLineDash(shape.state==='alternative'?[5,6]:[]);ctx.beginPath();ctx.moveTo(shape.from[0],shape.from[1]-top);ctx.lineTo(shape.to[0],shape.to[1]-top);ctx.stroke();ctx.setLineDash([]);if(shape.center){ctx.beginPath();ctx.arc(shape.center[0],shape.center[1]-top,Math.max(3,canvas.width/220),0,Math.PI*2);ctx.fill()}}
         else if(shape.kind==='outline'){ctx.setLineDash(shape.state==='rejected'?[2,5]:shape.inferred||shape.state==='recovered'||shape.state==='inferred'?[8,5]:[]);ctx.beginPath();ctx.moveTo(shape.corners[0][0],shape.corners[0][1]-top);for(const p of shape.corners.slice(1))ctx.lineTo(p[0],p[1]-top);ctx.closePath();ctx.stroke();ctx.setLineDash([])}
         else if(shape.kind==='marker'){ctx.beginPath();ctx.arc(shape.point[0],shape.point[1]-top,Math.max(3,canvas.width/300),0,Math.PI*2);ctx.stroke();if(shape.state==='unknown'&&shape.id){ctx.font=Math.max(11,canvas.width/100)+'px sans-serif';ctx.fillText(shape.id,shape.point[0]+5,shape.point[1]-top-5)}}
         else if(shape.kind==='trace'){ctx.beginPath();ctx.moveTo(shape.points[0][0],shape.points[0][1]-top);for(const p of shape.points.slice(1))ctx.lineTo(p[0],p[1]-top);ctx.stroke()}}
       ctx.restore()});note.textContent='Canvas frame: '+canvas.width+' × '+canvas.height+' px. '+(c.known?'S0 crop rows removed: '+top+' top, '+bottom+' bottom. ':'S0 crop metadata UNKNOWN; original frame shown. ')+(layers.slice(0,selected+1).some(l=>l.shapes.length||(l.pixelObjects||[]).length)?'Colored pixels are native object pixels; outlines, markers, traces and axes are native observations, not ownership masks. Dashed outlines include inferred corner support.':'No exact pixel masks or tee polygons were supplied by validated native evidence through S'+selected+'.')};slider.addEventListener('input',draw);draw()
 };img.onerror=()=>{note.textContent='Source image could not be decoded; geometry UNKNOWN.'};img.src=d.imageDataUrl
})();
</script></body></html>`;
}

export async function renderBoard({ forkRoot, summaryPath = 'stage-output/summary.json', outPath = 'stage-output/progress.html' }) {
  const root = path.resolve(forkRoot);
  const summaryFile = path.resolve(root, summaryPath);
  const outputFile = path.resolve(root, outPath);
  if (!inside(root, summaryFile) || !inside(root, outputFile)) throw new Error('summaryPath and outPath must stay within forkRoot');
  const summary = JSON.parse(await readFile(summaryFile, 'utf8'));
  const early = await readJson(root, summary.early?.receiptPath);
  const late = await readJson(root, summary.late?.receiptPath);
  const s7 = await readJson(root, summary.s7?.receiptPath);
  const sourcePath = first(summary.source?.path, summary.request?.sourcePath);
  let imageDataUrl = null;
  let sourceUnavailable = null;
  if (sourcePath) {
    const sourceFile = path.resolve(root, sourcePath);
    if (inside(root, sourceFile)) {
      try {
        const bytes = await readFile(sourceFile);
        const actual = createHash('sha256').update(bytes).digest('hex');
        const expected = summary.source?.sha256 ?? early?.source?.sha256;
        if (expected && expected === actual) imageDataUrl = `data:image/jpeg;base64,${bytes.toString('base64')}`;
        else sourceUnavailable = `Source JPEG hash mismatch or missing expected hash; source image omitted (actual ${actual}).`;
      } catch (error) { sourceUnavailable = `Source JPEG unavailable: ${error.message}`; }
    } else sourceUnavailable = 'Source path escapes forkRoot; source image omitted.';
  } else sourceUnavailable = 'Source path is UNKNOWN; source image omitted.';
  const stages = await attachStageContracts(root, stageRows(summary, early, late, s7), summary.request ?? {});
  const crop = findCrop(early, summary);
  const geometryRel = summary.late?.geometryPath ?? (summary.late?.receiptPath ? path.posix.join(path.posix.dirname(summary.late.receiptPath), 'geometry.json') : null);
  const geometry = await readJson(root, geometryRel);
  const geometryFile = geometryRel ? path.resolve(root, geometryRel) : null;
  const geometryEvidence = [
    ...(late?.evidenceFiles ?? []), ...(summary.late?.evidenceFiles ?? []),
    ...(late?.stages ?? []).flatMap(stage => stage.evidenceFiles ?? []),
  ].find(e => resolveEvidencePath(root, e.path) === geometryFile);
  let geometryVerified = false;
  if (geometry && !geometry._unavailable && geometryFile && geometryEvidence?.sha256) {
    const digest = createHash('sha256').update(await readFile(geometryFile)).digest('hex');
    geometryVerified = digest === geometryEvidence.sha256 && geometry.sourceSha256 === (summary.source?.sha256 ?? early?.source?.sha256) &&
      geometry.s3SnapshotSha256 === (summary.early?.snapshot?.sha256 ?? early?.snapshot?.sha256) && geometry.frame === 'original-jpeg-pixels';
  }
  const lateEvidence = await validatedEvidence(root, (late?.stages ?? []).flatMap(stage => stage.evidenceFiles ?? []));
  const s6RowsEvidence = lateEvidence.find(e => path.basename(e.path) === 's6-rows.json');
  const s5AssignmentEvidence = lateEvidence.find(e => path.basename(e.path) === 's5-global-assignment.json');
  const sourceSha = summary.source?.sha256 ?? early?.source?.sha256;
  const snapshotSha = summary.early?.snapshot?.sha256 ?? early?.snapshot?.sha256;
  if (late && s6RowsEvidence?.content?.sourceSha256 === sourceSha && s6RowsEvidence.content.s3SnapshotSha256 === snapshotSha) late._verifiedS6Rows = s6RowsEvidence.content;
  if (late && s5AssignmentEvidence?.content?.schema==='nctk-s5-global-assignment@1' &&
      s5AssignmentEvidence.content.sourceSha256===sourceSha &&
      s5AssignmentEvidence.content.s3SnapshotSha256===snapshotSha)
    late._verifiedS5Assignment=s5AssignmentEvidence.content;
  const s7Evidence = await validatedEvidence(root, s7?.actualEvidence?.files ?? []);
  const verifiedTraces = [];
  for (const record of s7Evidence) {
    const receipt = record.content;
    if (receipt?.sourceSha256 === sourceSha && receipt.frame === 'original-jpeg-pixels' && Array.isArray(receipt.traces)) {
      for (const trace of receipt.traces) {
        const points = (trace.points ?? []).map(point => point.sourcePoint).filter(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite));
        if (points.length >= 2) verifiedTraces.push({ name: trace.hitId ?? trace.teeId ?? 'fresh S6 hint', points, outcome: trace.outcome ?? UNKNOWN_TEXT, hint: true });
      }
    }
    if (receipt?.source?.sha256 !== sourceSha || receipt?.source?.frame?.name !== 'original-jpeg-pixels') continue;
    for (const outcome of receipt.outcomes ?? []) {
      const trace = outcome.traced ?? {};
      if (Array.isArray(trace.points)) {
        const [dx, dy] = receipt.source.frame.canonicalToSource ?? [0, 0];
        verifiedTraces.push({ name: outcome.name, points: trace.points.map(point => [point[0] + dx, point[1] + dy]), outcome: trace.outcome ?? UNKNOWN_TEXT });
      }
    }
  }
  if (s7 && verifiedTraces.length) s7._verifiedTraces = verifiedTraces;
  let pxc = null;
  const snapshot = summary.early?.snapshot ?? early?.snapshot;
  const earlyReceiptPath = summary.early?.receiptPath ?? 'stage-output/early/run.receipt.json';
  const snapshotPath = path.isAbsolute(snapshot?.path ?? '') ? snapshot.path : snapshot?.relativePath ? path.join(path.dirname(earlyReceiptPath), snapshot.relativePath) : snapshot?.path;
  if (snapshotPath && snapshot?.sha256) {
    const resolvedSnapshot = path.resolve(root, snapshotPath);
    if (inside(root, resolvedSnapshot)) {
      try {
        const bytes = await readFile(resolvedSnapshot);
        if (createHash('sha256').update(bytes).digest('hex') === snapshot.sha256) {
          const records = deserialize(bytes);
          pxc = Array.isArray(records) ? Object.fromEntries(records) : records;
        }
      } catch { /* Unreadable or unbound snapshot leaves object-pixel layers UNKNOWN. */ }
    }
  }
  const req = summary.request ?? {};
  const lanes = Array.isArray(req.lanes) ? req.lanes : [];
  const recipe = req.recipe ?? 'recipes/chainspot-s0-s7.json';
  const selectors = `--recipe ${singleQuote(recipe)} --source ${singleQuote(req.sourcePath ?? 'UNKNOWN')} --until ${singleQuote(req.until ?? 'UNKNOWN')}${req.only ? ` --stage ${singleQuote(req.only)}` : ''}${lanes.length ? ` --lanes ${singleQuote(lanes.join(','))}` : ''}`;
  const command = summary.runnableCommand ?? `node toolkit.mjs neat ${selectors}\nnode toolkit.mjs run ${selectors}`;
  const contentSafetyNote = (sourcePath ?? '').endsWith('IMG_5641.jpg') ? 'Apple Maps, Legal, and MAP/SAT controls remain in the source on purpose. S0 removes only obvious chrome; detection and pathfinding must handle these controls as negative examples. The crop audit checks frame geometry, not stage accuracy.' : null;
  const data = { request: req, source: summary.source ?? null, command, humanAcceptance: summary.humanAcceptance ?? UNKNOWN_TEXT,
    blockers: summary.blockers ?? [], upstreamVariant: summary.upstreamVariant ?? null, testimonyLimit: summary.testimonyLimit ?? null,
    stages, layers: explicitLayers(stages, late, geometry, geometryVerified, pxc, s7), crop, imageDataUrl, sourceUnavailable, geometryVerified,
    contentSafetyNote, nativeReceipts: { early, late, s7, geometry: geometryVerified ? geometry : null } };
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, htmlDoc(data), 'utf8');
  return { outPath: path.relative(root, outputFile), bytes: (await readFile(outputFile)).length, stages: stages.length,
    imageEmbedded: Boolean(imageDataUrl), geometryLayers: data.layers.reduce((n, l) => n + l.shapes.length, 0) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [forkRoot, summaryPath, outPath] = process.argv.slice(2);
  if (!forkRoot) {
    console.error('Usage: node ui/render-board.mjs FORK_ROOT [SUMMARY_PATH] [OUT_PATH]');
    process.exitCode = 2;
  } else {
    renderBoard({ forkRoot, summaryPath, outPath }).then(result => console.log(JSON.stringify(result, null, 2)))
      .catch(error => { console.error(error.stack ?? error); process.exitCode = 1; });
  }
}
