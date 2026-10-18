/**
 * The inspector: the state matrix made drillable (Sam, 2026-10-18: "turn the state --retest results into a drillable
 * artifact"; "a judge can say 'X is expected, Y is result. Check render to see if it's reasonable or not'").
 *
 *   grid (course x cell, coloured by status)  ->  the cell's objects, one row per hole or detection, with a crop each
 *   ->  one object: the crop at 4x with Sam's mark, the match radius, the pipeline's object, the recovered pad outline,
 *       the chosen badge; its numbers; the judge's reason; the course's S4 flipbook.
 *
 * What it is for, in order: every FN and FP as a picture; every recovered object (the inferred ones); every near miss
 * (error above NEAR_MISS_PX, where testimony is impeachable); courses without testimony, so judging is a read; rows
 * that changed against frozen.json; the count closure. Every number keeps its unit and its course.
 *
 * Crops are plain PNGs of the raster (one per row, deflated); marks are drawn as SVG over them at display scale, so
 * labels stay legible. attempts/state/inspector.html is one self-contained file.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { deserialize } from 'node:v8';
import { deflateSync } from 'node:zlib';
import { cropWindow } from '../../fg/png.mjs';
import { CELLS, S4_BRANCH } from './matrix.mjs';

export const NEAR_MISS_PX = 3;
export const CROP = Object.freeze({ sizePx: 72, display: 4, assocSizePx: 192, assocDisplay: 2 });
export const COLORS = Object.freeze({
  TP: '#3fb950', recoveredTP: '#58a6ff', FN: '#f85149', FP: '#d29922', recoveredFP: '#d29922', unjudged: '#8b949e',
  right: '#3fb950', wrong: '#f85149', none: '#f85149', missing: '#f85149', duplicate: '#d29922', expected: '#ffe11a',
  status: { met: '#238636', unmet: '#da3633', unjudged: '#6e7681', missing: '#8957e5', stale: '#bb8009' }
});
export const LEGEND = [
  ['cross', COLORS.expected, "Sam's mark (testimony); impeachable, often a few px off"],
  ['ring', '#ffffff', 'the match radius (tee 8 px, basket 12 px) around the mark'],
  ['rect', COLORS.TP, 'the pipeline\'s object (bbox): green TP, red FN (absent), orange FP / duplicate'],
  ['poly', COLORS.recoveredTP, 'an S4 recovered pad (corners); blue when it lands on a mark'],
  ['line', COLORS.right, 'association: solid line to the badge chosen (green right, red wrong), dashed to the true badge'],
  ['tag', '#f0883e', `near miss: error above ${NEAR_MISS_PX} px: check whether the mark or the result is off`]
];

const bboxCenter = (b) => [b[0] + (b[2] - 1) / 2, b[1] + (b[3] - 1) / 2];
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const paren = (s) => { const i = s.indexOf(' ('); return i < 0 ? null : s.slice(i + 2, -1); };

/** One cell's rows: { hole, name, verdict, errorPx, near, reason, numbers, center, marks }. Marks are in raster coords. */
export function cellRows(cell, course) {
  const J = course.judgement, O = course.objects, judged = Boolean(course.testimony);
  const rows = [];
  const push = (r) => rows.push({ hole: null, name: null, errorPx: null, near: false, reason: null, numbers: {}, marks: [], ...r });
  const rect = (bbox, color, label) => ({ kind: 'rect', x: bbox[0], y: bbox[1], w: bbox[2], h: bbox[3], color, label });
  const cross = (p, color, label) => ({ kind: 'cross', x: p[0], y: p[1], color, label });
  const ring = (p, r, color) => ({ kind: 'ring', x: p[0], y: p[1], r, color });
  const poly = (pts, color, label) => ({ kind: 'poly', pts, color, label });
  const line = (a, b, color, dash) => ({ kind: 'line', a, b, color, dash });

  if (cell.key === 'S1') {
    const annotated = new Set(course.testimony?.annotatedHoles ?? []);
    const seen = new Map();
    for (const b of O.badges) {
      const n = Number(b.label), dup = seen.has(n); seen.set(n, true);
      const verdict = !judged ? 'unjudged' : dup ? 'FP' : annotated.has(n) ? 'TP' : 'unjudged';
      push({ hole: Number.isFinite(n) ? n : null, name: `Badge ${b.label}`, verdict, center: bboxCenter(b.bbox), marks: [rect(b.bbox, COLORS[verdict], `Badge ${b.label}`)], reason: dup ? 'duplicate label' : null });
    }
    for (const m of J?.S1?.labelsMissing ?? []) push({ hole: Number(m.split(' ')[1]), name: m, verdict: 'FN', center: null, reason: 'no badge read with this label' });
    return rows.sort((a, b) => (a.hole ?? 99) - (b.hole ?? 99));
  }

  if (cell.key === 'S3association') {
    const src = judged ? (J?.S3association?.rows ?? []) : O.association.map((a) => ({ hole: null, name: null, point: a.center, said: a.said, saidCenter: a.said != null ? O.badges.filter((b) => Number(b.label) === a.said).map((b) => bboxCenter(b.bbox))[0] ?? null : null, truthCenter: null, verdict: 'unjudged', best: null }));
    src.forEach((a, i) => {
      const color = COLORS[a.verdict] ?? COLORS.unjudged, marks = [cross(a.point, color, a.name ?? `Tee ${i}`)];
      if (a.saidCenter) { marks.push(line(a.point, a.saidCenter, a.verdict === 'wrong' ? COLORS.wrong : COLORS.right, 0)); marks.push(cross(a.saidCenter, a.verdict === 'wrong' ? COLORS.wrong : COLORS.right, `Badge ${a.said}`)); }
      if (a.verdict === 'wrong' && a.truthCenter) { marks.push(line(a.point, a.truthCenter, COLORS.expected, 6)); marks.push(cross(a.truthCenter, COLORS.expected, `Badge ${a.hole} (true)`)); }
      push({ hole: a.hole, name: a.name ?? `Tee ${i}`, verdict: a.verdict, center: a.point, marks, crop: 'assoc',
        reason: a.verdict === 'none' ? 'no badge associated' : a.verdict === 'wrong' ? `said Badge ${a.said}, is Tee ${a.hole}` : null,
        numbers: a.best ? { badge: a.said, zPx: a.best.z, lateralPx: a.best.latPx, residualDeg: a.best.resDeg, distancePx: a.best.distPx } : {} });
    });
    return rows;
  }

  const radius = cell.what.startsWith('baskets') ? 12 : 8;
  if (!judged) {
    const dets = { S2: O.baskets.map((k) => ({ bbox: k.bbox })), S3: O.tees, S4baskets: [...O.baskets.map((k) => ({ bbox: k.bbox })), ...O.s4baskets.map((k) => ({ ...k, recovered: true }))], S4tees: [...O.tees, ...O.s4tees.map((t) => ({ ...t, recovered: true }))] }[cell.key] ?? [];
    dets.forEach((d, i) => {
      const center = d.center ?? bboxCenter(d.bbox), color = d.recovered ? COLORS.recoveredTP : COLORS.unjudged, name = `${d.recovered ? 'S4 ' : ''}${cell.what.startsWith('baskets') ? 'Basket' : 'Tee'} #${i}`;
      const marks = d.corners ? [poly(d.corners, color, name)] : d.bbox ? [rect(d.bbox, color, name)] : [cross(center, color, name)];
      push({ name, verdict: 'unjudged', center, marks, reason: d.recovered ? `${d.rule ?? d.tier ?? 'recovered'}${d.forHole ? `, for Badge ${d.forHole}` : ''}` : null, numbers: { confidence: d.confidence ?? undefined, visibleFrameFrac: d.visibleFrameFrac ?? undefined } });
    });
    for (const m of O.s4missed) if (cell.key === 'S4tees') push({ hole: Number(m.hole) || null, name: `Tee for Badge ${m.hole}`, verdict: 'FN', center: null, reason: m.reason });
    return rows;
  }

  const stage = cell.key === 'S4tees' ? J?.S4tees?.branches?.[S4_BRANCH] : J?.[cell.key];
  const fnWhy = new Map((J?.S3?.fn ?? []).map((s) => [Number(s.split(' ')[1]), paren(s)]));
  const missedWhy = new Map(O.s4missed.map((m) => [Number(m.hole), m.reason]));
  for (const r of stage?.rows ?? []) {
    const d = r.detection, color = COLORS[r.verdict] ?? COLORS.unjudged, marks = [];
    if (r.expected) { marks.push(ring(r.expected, radius, '#ffffff')); marks.push(cross(r.expected, COLORS.expected, r.hole != null ? `mark ${r.hole}` : null)); }
    if (d) { if (d.corners) marks.push(poly(d.corners, color, d.name)); else if (d.bbox) marks.push(rect(d.bbox, color, d.name)); else marks.push(cross(d.point, color, d.name)); }
    const reason = r.verdict === 'FN' ? (cell.key === 'S3' ? fnWhy.get(r.hole) : cell.key === 'S4tees' ? missedWhy.get(r.hole) ?? 'not recovered' : null)
      : d?.rule ? `${d.rule}${d.forHole ? `, for Badge ${d.forHole}` : ''}` : null;
    push({ hole: r.hole, name: d?.name ?? (r.hole != null ? `${cell.what.startsWith('baskets') ? 'Basket' : 'Tee'} ${r.hole}` : null), verdict: r.verdict, errorPx: r2(r.errorPx), near: r.errorPx != null && r.errorPx > NEAR_MISS_PX,
      center: r.expected ?? d?.point ?? null, marks, reason,
      numbers: { errorPx: r2(r.errorPx) ?? undefined, matchWithinPx: radius, confidence: d?.confidence ?? undefined, visibleFrameFrac: d?.visibleFrameFrac ?? undefined, forBadge: d?.forHole ?? undefined, angleDeg: d?.angleRad != null ? r2(d.angleRad * 180 / Math.PI) : undefined } });
  }
  return rows;
}

function openRaster(course) {
  if (!course.paths?.snap || !existsSync(course.paths.snap)) return null;
  const img = new Map(deserialize(readFileSync(course.paths.snap))).get('px.image.cropped');
  return img ? { rgba: img.rgba, width: img.widthPx, height: img.heightPx } : null;
}

/** The whole inspector's data: per course, per cell, rows with crops. */
export function inspectorData(matrix, inputs, { root }) {
  const courses = [];
  for (const c of inputs.courses) {
    const raster = openRaster(c), cells = [];
    for (const cell of CELLS) {
      const m = matrix.rows.find((r) => r.course === c.course && r.key === cell.key);
      const rows = cellRows(cell, c).map((r) => {
        const size = r.crop === 'assoc' ? CROP.assocSizePx : CROP.sizePx, display = r.crop === 'assoc' ? CROP.assocDisplay : CROP.display;
        const crop = raster && r.center ? cropWindow(raster, { cx: r.center[0], cy: r.center[1], size, deflate: (raw) => deflateSync(raw) }) : null;
        return { ...r, crop: crop ? { png: crop.png, x0: crop.origin[0], y0: crop.origin[1], size, display } : null };
      });
      cells.push({ key: cell.key, what: cell.what, status: m?.status, result: m?.result, expected: m?.expected, freshness: m?.freshness, vsFrozen: m?.vsFrozen, goal: m?.goal, rows,
        summary: { rows: rows.length, FN: rows.filter((r) => r.verdict === 'FN').length, FP: rows.filter((r) => /FP|wrong|none/.test(r.verdict)).length, recovered: rows.filter((r) => /^recovered|S4 /.test(r.verdict + ' ' + (r.name ?? ''))).length, near: rows.filter((r) => r.near).length } });
    }
    courses.push({ course: c.course, attempt: c.attempt, N: c.N, testimony: c.testimony ? (c.testimony.complete ? 'all 18 holes' : `holes ${c.testimony.annotatedHoles.join(', ')}`) : 'none',
      flipbook: c.paths?.s4run ? relative(join(root, 'attempts', 'state'), join(c.paths.s4run, 's4recover.flipbook.html')) : null, cells, imageSize: raster ? [raster.width, raster.height] : null });
  }
  return { at: new Date().toISOString(), emits: matrix.emits, cells: CELLS.map((c) => ({ key: c.key, what: c.what })), courses, legend: LEGEND, colors: COLORS, nearMissPx: NEAR_MISS_PX };
}

export function inspectorHtml(data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><title>State inspector</title>
<style>
body{margin:0;background:#0d1117;color:#c9d1d9;font:13px/1.4 -apple-system,Segoe UI,Helvetica,Arial,sans-serif}
header{padding:12px 16px;border-bottom:1px solid #30363d}h1{font-size:16px;margin:0 0 4px}
#grid{padding:12px 16px;overflow-x:auto}
main{display:grid;grid-template-columns:minmax(380px,1fr) minmax(420px,1fr);gap:0;border-top:1px solid #30363d}
section{padding:12px 16px;border-right:1px solid #30363d;min-height:60vh;min-width:0;overflow:auto}
table{border-collapse:collapse}th,td{border:1px solid #30363d;padding:4px 6px;text-align:left;vertical-align:top}
td.cell{cursor:pointer;min-width:120px}td.cell:hover{outline:2px solid #58a6ff}td.cell.sel{outline:2px solid #ffe11a}
.st{display:inline-block;padding:0 6px;border-radius:9px;color:#fff;font-weight:600}
.thumbs{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.thumb{width:150px;cursor:pointer;background:#161b22;border:1px solid #30363d;border-radius:4px;padding:4px}
.thumb.sel{border-color:#ffe11a}.thumb .cap{font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v{font-weight:700}.near{color:#f0883e}
img{image-rendering:pixelated;display:block}
.wrap{position:relative;display:inline-block}.wrap svg{position:absolute;left:0;top:0;pointer-events:none}
.num{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.legend li{margin:2px 0}.legend i{display:inline-block;width:12px;height:12px;margin-right:6px;vertical-align:middle;border-radius:2px}
button{background:#21262d;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;padding:2px 8px;cursor:pointer;margin-right:4px}button.on{border-color:#58a6ff}
a{color:#58a6ff}small{color:#8b949e}
</style></head><body>
<header><h1>State inspector: every stage on every dev course</h1><div id="hdr"></div></header>
<div id="grid"></div>
<main><section id="left"><div id="cellpanel"><small>Pick a cell above.</small></div></section><section id="right"><div id="detail"><small>Pick a cell, then an object.</small></div>
<div class="legend" style="margin-top:24px"><b>Legend</b><ul id="legend"></ul></div></section></main>
<script type="application/json" id="data">${json}</script>
<script>
const D=JSON.parse(document.getElementById('data').textContent);const $=(s)=>document.querySelector(s);const esc=(s)=>String(s??'').replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const st=(s)=>'<span class="st" style="background:'+(D.colors.status[s]||'#444')+'">'+esc(s)+'</span>';
$('#hdr').innerHTML='derived '+esc(D.at)+' &middot; '+D.emits.cells+' cells: '+D.emits.met+' met, '+D.emits.unmet+' unmet, '+D.emits.unjudged+' unjudged, '+D.emits.missing+' missing, '+D.emits.stale+' stale';
$('#legend').innerHTML=D.legend.map(([k,c,t])=>'<li><i style="background:'+c+'"></i>'+esc(k)+': '+esc(t)+'</li>').join('');
let sel={ci:null,ki:null,ri:null,filter:'all'};
// deep links: #course=golden&cell=S3&row=2&filter=miss (a report can say "check render" with a link)
function readHash(){const q=new URLSearchParams(location.hash.slice(1));const ci=D.courses.findIndex((c)=>c.course===q.get('course'));if(ci<0)return;const ki=D.cells.findIndex((c)=>c.key===q.get('cell'));if(ki<0)return;sel={ci,ki,ri:q.has('row')?+q.get('row'):null,filter:q.get('filter')||'all'};}
function writeHash(){if(sel.ci==null)return;const q=new URLSearchParams({course:D.courses[sel.ci].course,cell:D.cells[sel.ki].key,filter:sel.filter});if(sel.ri!=null)q.set('row',sel.ri);history.replaceState(null,'','#'+q.toString());}
function render(){writeHash();grid();cellpanel();detail();}
function grid(){let h='<table><tr><th>course</th>'+D.cells.map((c)=>'<th>'+esc(c.key)+'<br><small>'+esc(c.what)+'</small></th>').join('')+'</tr>';
D.courses.forEach((c,ci)=>{h+='<tr><th>'+esc(c.course)+'<br><small>N = '+c.N+' &middot; testimony: '+esc(c.testimony)+'</small></th>';c.cells.forEach((k,ki)=>{const s=k.summary;h+='<td class="cell'+(sel.ci===ci&&sel.ki===ki?' sel':'')+'" data-ci="'+ci+'" data-ki="'+ki+'">'+st(k.status)+' <small>'+esc(k.freshness)+(k.vsFrozen?' &middot; '+esc(k.vsFrozen):'')+'</small><br>'+esc(k.result||'-')+'<br><small>'+s.rows+' objects'+(s.FN?', <b style="color:#f85149">'+s.FN+' FN</b>':'')+(s.FP?', <b style="color:#d29922">'+s.FP+' FP/wrong</b>':'')+(s.recovered?', <b style="color:#58a6ff">'+s.recovered+' recovered</b>':'')+(s.near?', <b class="near">'+s.near+' near</b>':'')+'</small></td>';});h+='</tr>';});
$('#grid').innerHTML=h+'</table>';document.querySelectorAll('td.cell').forEach((td)=>td.onclick=()=>{sel={ci:+td.dataset.ci,ki:+td.dataset.ki,ri:null,filter:sel.filter};render();});}
const show=(r)=>sel.filter==='all'||(sel.filter==='miss'&&/FN|FP|wrong|none/.test(r.verdict))||(sel.filter==='rec'&&/recovered|S4 /.test(r.verdict+' '+(r.name||'')))||(sel.filter==='near'&&r.near);
function cellpanel(){if(sel.ci==null){$('#cellpanel').innerHTML='<small>Pick a cell above.</small>';return;}const c=D.courses[sel.ci],k=c.cells[sel.ki];
let h='<h3 style="margin:12px 0 4px">'+esc(c.course)+' &middot; '+esc(k.key)+' '+esc(k.what)+' '+st(k.status)+'</h3><div><b>expected:</b> '+esc(k.expected)+'<br><b>result:</b> '+esc(k.result||'-')+'<br><small>goal: '+esc(k.goal)+'</small>'+(c.flipbook?'<br><a href="'+esc(c.flipbook)+'">S4 flipbook of '+esc(c.course)+'</a>':'')+'</div><div style="margin-top:6px">'+['all','miss','rec','near'].map((f)=>'<button class="'+(sel.filter===f?'on':'')+'" data-f="'+f+'">'+({all:'all',miss:'FN / FP / wrong',rec:'recovered',near:'near misses'})[f]+'</button>').join('')+'</div><div class="thumbs">';
k.rows.forEach((r,ri)=>{if(!show(r))return;const col=D.colors[r.verdict]||'#8b949e';h+='<div class="thumb'+(sel.ri===ri?' sel':'')+'" data-ri="'+ri+'">'+(r.crop?pic(r,144/r.crop.size):'<div style="height:144px;display:flex;align-items:center;justify-content:center;color:#8b949e">no geometry</div>')+'<div class="cap"><span class="v" style="color:'+col+'">'+esc(r.verdict)+'</span> '+esc(r.name||'')+(r.hole!=null?' <small>hole '+r.hole+'</small>':'')+(r.errorPx!=null?' <span class="num'+(r.near?' near':'')+'">'+r.errorPx+' px</span>':'')+'</div></div>';});
$('#cellpanel').innerHTML=h+'</div>';document.querySelectorAll('.thumb').forEach((t)=>t.onclick=()=>{sel.ri=+t.dataset.ri;render();});document.querySelectorAll('button[data-f]').forEach((b)=>b.onclick=()=>{sel.filter=b.dataset.f;sel.ri=null;render();});}
function pic(r,scale){const c=r.crop,S=c.size*scale,P=(x,y)=>[(x-c.x0+0.5)*scale,(y-c.y0+0.5)*scale];let s='<svg width="'+S+'" height="'+S+'" viewBox="0 0 '+S+' '+S+'">';
for(const m of r.marks){if(m.kind==='cross'){const[x,y]=P(m.x,m.y);s+='<path d="M'+(x-6)+' '+y+'H'+(x+6)+'M'+x+' '+(y-6)+'V'+(y+6)+'" stroke="'+m.color+'" stroke-width="2"/>';if(m.label&&scale>2)s+='<text x="'+(x+8)+'" y="'+(y-8)+'" fill="'+m.color+'" font-size="11" font-weight="700" stroke="#000" stroke-width="3" paint-order="stroke">'+esc(m.label)+'</text>';}
else if(m.kind==='ring'){const[x,y]=P(m.x,m.y);s+='<circle cx="'+x+'" cy="'+y+'" r="'+(m.r*scale)+'" fill="none" stroke="'+m.color+'" stroke-width="1" stroke-dasharray="3 3" opacity=".8"/>';}
else if(m.kind==='rect'){const[x,y]=P(m.x-0.5,m.y-0.5);s+='<rect x="'+x+'" y="'+y+'" width="'+(m.w*scale)+'" height="'+(m.h*scale)+'" fill="none" stroke="'+m.color+'" stroke-width="2"/>';if(m.label&&scale>2)s+='<text x="'+(x+2)+'" y="'+(y-4)+'" fill="'+m.color+'" font-size="11" font-weight="700" stroke="#000" stroke-width="3" paint-order="stroke">'+esc(m.label)+'</text>';}
else if(m.kind==='poly'){const pts=m.pts.map(([x,y])=>P(x,y).join(',')).join(' ');s+='<polygon points="'+pts+'" fill="none" stroke="'+m.color+'" stroke-width="2"/>';if(m.label&&scale>2){const[x,y]=P(m.pts[0][0],m.pts[0][1]);s+='<text x="'+x+'" y="'+(y-6)+'" fill="'+m.color+'" font-size="11" font-weight="700" stroke="#000" stroke-width="3" paint-order="stroke">'+esc(m.label)+'</text>';}}
else if(m.kind==='line'){const[ax,ay]=P(m.a[0],m.a[1]),[bx,by]=P(m.b[0],m.b[1]);s+='<line x1="'+ax+'" y1="'+ay+'" x2="'+bx+'" y2="'+by+'" stroke="'+m.color+'" stroke-width="2"'+(m.dash?' stroke-dasharray="'+m.dash+' '+m.dash+'"':'')+'/>';}}
return '<div class="wrap"><img width="'+S+'" height="'+S+'" src="data:image/png;base64,'+c.png+'">'+s+'</svg></div>';}
function detail(){if(sel.ri==null){$('#detail').innerHTML='<small>Pick a cell, then an object.</small>';return;}const c=D.courses[sel.ci],k=c.cells[sel.ki],r=k.rows[sel.ri],col=D.colors[r.verdict]||'#8b949e';
let h='<h3 style="margin:0 0 6px">'+esc(c.course)+' &middot; '+esc(k.key)+' &middot; <span style="color:'+col+'">'+esc(r.verdict)+'</span> '+esc(r.name||'')+(r.hole!=null?' (hole '+r.hole+')':'')+'</h3>';
h+=r.crop?pic(r,r.crop.display):'<div><small>no geometry to show</small></div>';
if(r.crop)h+='<div><small>crop origin ('+r.crop.x0+', '+r.crop.y0+') px, '+r.crop.size+' px at '+r.crop.display+'x, canonical frame of '+esc(c.course)+'</small></div>';
h+='<p><b>expected:</b> '+esc(k.expected)+'<br><b>this object:</b> '+esc(r.verdict)+(r.errorPx!=null?', '+r.errorPx+' px from the mark'+(r.near?' <span class="near">(near miss: above '+D.nearMissPx+' px; is the mark or the result off?)</span>':''):'')+(r.reason?'<br><b>reason:</b> '+esc(r.reason):'')+'</p>';
const nums=Object.entries(r.numbers||{}).filter(([,v])=>v!==undefined&&v!==null);if(nums.length)h+='<table class="num">'+nums.map(([k2,v])=>'<tr><td>'+esc(k2)+'</td><td>'+esc(typeof v==='number'?Math.round(v*1000)/1000:v)+'</td></tr>').join('')+'</table>';
if(k.vsFrozen)h+='<p><b>vs frozen:</b> '+esc(k.vsFrozen)+'</p>';if(c.flipbook)h+='<p><a href="'+esc(c.flipbook)+'">open the S4 flipbook of '+esc(c.course)+'</a> (pose frames, occluder search, profile)</p>';
$('#detail').innerHTML=h;}
readHash();grid();cellpanel();detail();window.addEventListener('hashchange',()=>{readHash();grid();cellpanel();detail();});
</script></body></html>`;
}

export function writeInspector(root, matrix, inputs) {
  const data = inspectorData(matrix, inputs, { root });
  const dir = join(root, 'attempts', 'state'); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'inspector.html'), inspectorHtml(data));
  return 'attempts/state/inspector.html';
}
