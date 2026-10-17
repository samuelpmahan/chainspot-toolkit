/** Materialize sealed PCR Tick marks as source-backed, independently toggled views. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeRender } from './composedRenderContract.mjs';

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const out = resolve(root, 'artifacts/composed-render-20260927');
const sha = (v) => createHash('sha256').update(v).digest('hex');
const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const fmt = (n) => Number(n).toFixed(1);
const point = ([x, y]) => `${fmt(x)},${fmt(y)}`;
const labels = {
  'S1 badges': 'S1 · numbered badge readings',
  'S2 basket proposals': 'S2 · basket tip proposals',
  'S3 visible pads': 'S3 · visible pad geometry',
  'S4 observed recovery': 'S4 · observed shards and inferred pad fits',
  'S4 posterior hypothesis': 'S4 · inferred placement without fit'
};
function markSvg(mark) {
  const g = mark.geometry, d = mark.detail;
  if (g.type === 'badge') {
    const [x, y] = g.center, read = d.holeRead === null ? '?' : d.holeRead;
    return `<g><circle cx="${fmt(x)}" cy="${fmt(y)}" r="12" fill="#082d4c" fill-opacity=".88" stroke="#76d8ff" stroke-width="2"/><text x="${fmt(x)}" y="${fmt(y+5)}" text-anchor="middle" font-size="16" font-weight="bold" fill="white">${esc(read)}</text></g>`;
  }
  if (g.type === 'basket-tip') {
    const [x, y] = g.tip;
    return `<path d="M${fmt(x)} ${fmt(y-8)} L${fmt(x-7)} ${fmt(y+6)} L${fmt(x+7)} ${fmt(y+6)} Z" fill="#ffdf57" fill-opacity=".7" stroke="#654900" stroke-width="1.5"/>`;
  }
  if (g.type === 'visible-pad')
    return `<polygon points="${g.corners.map(point).join(' ')}" fill="#54e686" fill-opacity=".12" stroke="#1bde68" stroke-width="2"/>`;
  if (g.type === 'unshaped-tee-center') {
    const [x,y] = g.center;
    return `<g><circle cx="${fmt(x)}" cy="${fmt(y)}" r="8" fill="none" stroke="#f5ae53" stroke-width="2"/><text x="${fmt(x+10)}" y="${fmt(y-7)}" font-size="13" fill="#fff" stroke="#452305" stroke-width="3" paint-order="stroke">no pad</text></g>`;
  }
  if (g.type === 'recovered-pad') {
    const [x,y] = g.center;
    return `<g>${g.pixels.map(([px,py])=>`<rect x="${px}" y="${py}" width="1" height="1" fill="#ff2860"/>`).join('')}<polygon points="${g.corners.map(point).join(' ')}" fill="#2beafa" fill-opacity=".08" stroke="#24e5f6" stroke-width="2.7" stroke-dasharray="7 4"/><circle cx="${fmt(x)}" cy="${fmt(y)}" r="4" fill="#ff2860"/><text x="${fmt(x+12)}" y="${fmt(y-11)}" fill="#fff" font-weight="bold" font-size="20" stroke="#1b1721" stroke-width="3" paint-order="stroke">H${esc(d.holeRead)} fit</text></g>`;
  }
  if (g.type === 'injected-center') {
    const [x,y] = g.center;
    return `<g><path d="M${fmt(x-9)} ${fmt(y-9)} L${fmt(x+9)} ${fmt(y+9)} M${fmt(x+9)} ${fmt(y-9)} L${fmt(x-9)} ${fmt(y+9)}" stroke="#ff9f1e" stroke-width="4"/><text x="${fmt(x+14)}" y="${fmt(y-11)}" fill="#fff" font-weight="bold" font-size="20" stroke="#542300" stroke-width="3" paint-order="stroke">H${esc(d.holeRead)} no fit</text></g>`;
  }
  throw new Error(`Unhandled geometry ${g.type}`);
}
function svg(model, jpegBytes, interactive = false) {
  const { widthPx: w, heightPx: h } = model.source.frame;
  const layers = model.stages.map((stage, i) => `<g class="layer${model.visibility[stage.id]?'':' hidden'}" data-stage="${i}" aria-label="${esc(stage.id)}">${stage.ticks.map((tick,j)=>`<g class="tick${model.tickVisibility[stage.id][tick.id]?'':' hidden'}" data-stage="${i}" data-tick="${j}" aria-label="${esc(tick.id)}">${tick.marks.map((mark) => `<g id="mark-${esc(mark.id.replace(/[^\w-]/g,'_'))}" class="mark" data-id="${esc(mark.id)}" data-status="${esc(mark.status)}"><title>${esc(`${stage.id} → ${mark.producerTick} → ${mark.part} → ${mark.id}: ${mark.status}`)}</title>${markSvg(mark)}</g>`).join('')}</g>`).join('')}</g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Source pixels with PCR-origin render layers"><style>.mark:hover,.mark.selected{filter:drop-shadow(0 0 6px #fff)}.layer.hidden,.tick.hidden{display:none}text{font-family:DejaVu Sans,Arial,sans-serif}</style><image width="${w}" height="${h}" href="data:image/jpeg;base64,${jpegBytes.toString('base64')}" xlink:href="data:image/jpeg;base64,${jpegBytes.toString('base64')}"/>${layers}</svg>`;
}
function html(model, svgMarkup) {
  const stageList = model.stages.map((stage,i) => `<section><label><input class="toggle" type="checkbox" data-stage="${i}" checked> <b>${esc(labels[stage.id])}</b></label><details><summary>${stage.ticks.length} executed Tick${stage.ticks.length===1?'':'s'} · PCR ${esc(stage.pcrRunResultId.slice(0,12))}</summary>${stage.ticks.map((tick,j) => `<details><summary><label><input class="tick-toggle" type="checkbox" data-stage="${i}" data-tick="${j}" checked> ${esc(tick.id)}</label> · ${esc(tick.materialization)} · ${tick.marks.length} marks</summary>${tick.reason?`<p>${esc(tick.reason)}</p>`:''}<p>Produced Part(s): ${esc(tick.producedParts.join(', '))}</p>${tick.marks.map((m)=>`<button class="inspect" data-mark="${esc(m.id)}">${esc(m.detail.holeRead ? `H${m.detail.holeRead}` : m.detail.detId ?? m.id)} · ${esc(m.status)}</button>`).join('')}</details>`).join('')}</details></section>`).join('');
  const json = JSON.stringify(model).replaceAll('<','\\u003c');
  const title = basename(model.source.path);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Composed PCR · ${esc(title)}</title><style>body{background:#101b29;color:#ecf5fa;font:14px/1.4 system-ui;margin:0}header{padding:12px 20px;background:#162c3c;position:sticky;top:0;z-index:2;border-bottom:1px solid #557286}h1{font-size:18px;margin:0 0 5px}.status{color:#a8d6e6}main{display:grid;grid-template-columns:minmax(290px,360px) minmax(0,1fr);gap:14px;padding:14px}aside{max-height:85vh;overflow:auto;background:#182636;padding:14px;border-radius:10px}section{padding:9px 0;border-bottom:1px solid #45586b}details{padding:5px 0 0 16px}summary{cursor:pointer}button{background:#22455b;color:#fff;border:1px solid #63849c;border-radius:5px;padding:5px 8px;margin:4px 3px 0 0;cursor:pointer}.view{background:#111b26;text-align:center;overflow:auto;border:1px solid #536b76;border-radius:8px}.view svg{display:block;width:min(100%,900px);height:auto;margin:auto}.legend{font-size:12px;line-height:1.8}.provenance{white-space:pre-wrap;overflow-wrap:anywhere;background:#0e1b28;padding:8px;border-radius:5px;font-size:11px}.badge{color:#76d8ff}.basket{color:#ffdf57}.visible{color:#54e686}.shard{color:#ff4168}.fit{color:#24e5f6}.hypothesis{color:#ff9f1e}@media(max-width:860px){main{display:block}aside{max-height:none;margin-bottom:10px}}</style><header><h1>PCR-composed view · ${esc(title)}</h1><div class="status">S1 ${model.counts.badges} badges · S2 ${model.counts.baskets} basket proposals · S3 ${model.counts.visibleTees} visible tees · S4 ${model.counts.recoveredTees} observed recovered pads + ${model.counts.injectedTees} no-fit hypotheses · ${model.counts.assignments} final associations</div></header><main><aside><button id="source">Source only</button><button id="restore">Restore layers</button><div class="legend"><span class="badge">● badge reading</span> · <span class="basket">▲ basket tip proposal</span><br><span class="visible">▱ visible pad perimeter</span> · <span class="shard">■ observed fragment pixels</span><br><span class="fit">┄ inferred recovered perimeter</span> · <span class="hypothesis">× posterior no-fit placement</span></div><p>Legacy Stage labels group actual executed producer Ticks. Basket boxes do not assert pixel ownership. A dashed pad can disagree with visible fragments.</p>${stageList}<h3>Selected mark provenance</h3><pre class="provenance" id="detail">Select a mark in the Tick inspector or image.</pre><p class="provenance">Content ID ${model.contentId}<br>PCR identities seal Tick testimony. Captured opaque mark payloads have separate digests. Original source SHA-256 ${model.source.sha256}.</p></aside><div class="view">${svgMarkup}</div></main><script type="application/json" id="model">${json}</script><script>const model=JSON.parse(document.getElementById('model').textContent);const toggles=[...document.querySelectorAll('.toggle')],tickToggles=[...document.querySelectorAll('.tick-toggle')];function update(){toggles.forEach(t=>document.querySelector('.layer[data-stage="'+t.dataset.stage+'"]').classList.toggle('hidden',!t.checked));tickToggles.forEach(t=>document.querySelector('.tick[data-stage="'+t.dataset.stage+'"][data-tick="'+t.dataset.tick+'"]').classList.toggle('hidden',!t.checked))}toggles.concat(tickToggles).forEach(t=>t.addEventListener('change',update));document.getElementById('source').onclick=()=>{toggles.forEach(t=>t.checked=false);update()};document.getElementById('restore').onclick=()=>{toggles.concat(tickToggles).forEach(t=>t.checked=true);update()};function inspect(id){const marks=model.stages.flatMap(s=>s.ticks.flatMap(t=>t.marks));const m=marks.find(x=>x.id===id);if(!m)return;document.querySelectorAll('.mark').forEach(x=>x.classList.toggle('selected',x.dataset.id===id));document.getElementById('detail').textContent=JSON.stringify({stage:m.group,tick:m.producerTick,part:m.part,status:m.status,markId:m.id,payloadSha256:m.payloadSha256,pcrRunResultId:model.stages.find(s=>s.id===m.group).pcrRunResultId,sourceSha256:m.sourceSha256,frame:m.frame,runName:m.runName,paramsHash:m.paramsHash,geometry:m.geometry.type,detail:m.detail},null,2)}document.querySelectorAll('.inspect').forEach(b=>b.onclick=()=>inspect(b.dataset.mark));document.querySelectorAll('.mark').forEach(g=>g.onclick=()=>inspect(g.dataset.id));</script></html>`;
}
// Exact prior projection copied from composedRenderReplay.mjs through its
// source-backed SVG function; the base helper is preserved untouched.
export { svg };
