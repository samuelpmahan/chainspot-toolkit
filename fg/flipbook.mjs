/**
 * Static flipbook over a Frame stream (browser-safe: no node:* imports;
 * it returns a string and the caller decides where it goes).
 *
 *   renderFlipbook(frames, { raster?, background?, records?, stage?, title? })
 *                         -> one self-contained HTML page (LABUI layout)
 *   framesJson(frames)    -> canonical JSON of the array
 *
 * The flipbook is a reader, not a second source of truth: every page is
 * one Frame exactly as an FG emitted it, and framesJson is the same stream
 * for an agent or a test (the page embeds it once and offers it as the
 * "Frames JSON" download). The layout is the LABUI S0 viewer's three panes:
 *
 *   01 / COMPOSITION  the composition tree derived from the stream:
 *                     stage -> FG (frame.fg, with its held/failed/dormant
 *                     status when `records` or frame.status says) ->
 *                     [branch ·] tick · calculation -> frames. Clicking a
 *                     frame selects it; FGs that emitted no frame (a dormant
 *                     lane) still appear when `records` names them. Below
 *                     it, the flow: each calculation and the Parts it drew.
 *   02 / FRAME        the selected frame's drawn parts (pxset/bbox/points)
 *                     on one canvas cropped to their drawn bounds, over the
 *                     optional background; or its inline PNG raster crops.
 *                     Fit / Zoom 1:1 with drag-to-pan, a caption with the px
 *                     dims and crop window, a per-part legend (click to hide
 *                     a part), and prev / slider / next for stop-motion.
 *   03 / INSPECT      one <section class="page"> per frame, rendered
 *                     server-side so the file reads with scripts off and is
 *                     greppable: title, FG id + status, branch, tick,
 *                     calculation, every part's address / kind / ref /
 *                     sha256, ledger tables, scalars, verdicts, and the
 *                     receipt slice in a <details>.
 *
 * Keys: ArrowLeft / ArrowRight step frames, f fit, z zoom; #<n> deep-links a
 * frame (0-based). Sandboxed srcdoc viewers refuse history writes, so every
 * history call is guarded.
 *
 * Renderers are keyed by part kind:
 *   pxset   data { width, height?, px: [flat index] }    filled pixels
 *   bbox    data { boxes: [[x, y, w, h, label?]] }       stroked rectangles
 *   points  data { points: [[x, y, label?]] }            dots
 *   ledger  data { rows: [{...}] } or [{...}]           table
 *   scalar  data { value, unit? } or a bare value        value
 *   raster  ref only (artifact uri) or data { width, height }: listed; the
 *           pixels come from the optional `raster` background. data
 *           { width, height, png, origin? } (base64 PNG, e.g. fg/png.mjs
 *           cropWindow) renders inline as an <img class="crop">: in the
 *           viewer when the frame draws nothing else, else in the inspector
 * pxset/bbox/points share one canvas per frame, drawn over the optional
 * background, one colour per part in part order. The canvas extent is the
 * background's when given, else the largest extent the parts imply; each
 * frame is cropped to the padded union of what it draws.
 *
 * Options:
 *   raster      { width, height, rgba }  embedded RGBA background (base64)
 *   background  { src, width, height, x?, y? }  an image URL (e.g. a data:
 *               URL of the source JPEG) drawn under every frame, top-left at
 *               (x, y) in frame coordinates. Far cheaper than `raster`.
 *   records     FG records, for status in the tree: a `<stage>.records.json`
 *               sidecar ({ stage, order, records }), a fork-join sidecar
 *               ({ branches: { <b>: { records, error } } }), or a bare
 *               { [fgId]: record | status } map
 *   stage       stage label when neither frames nor records carry one
 *   title       page title
 */
import { canonicalJson, sha256Hex } from './canon.mjs';

const DRAWN = new Set(['pxset', 'bbox', 'points']);
const PALETTE = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#9a6324', '#469990', '#800000'];
const STATUSES = new Set(['held', 'failed', 'dormant']);

const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const scriptJson = (value) => canonicalJson(value).replace(/</g, '\\u003c');
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (v) => v !== null && v !== undefined && v !== '';
const pad2 = (n, total) => String(n).padStart(String(total).length, '0');

export const framesJson = (frames) => canonicalJson(frames);

function base64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

// The drawn bounds of a frame: the union of its pxset/bbox/points data,
// padded and clamped to the frame extent, so a frame shows what it is about
// instead of a whole course at thumbnail scale.
function crop(frame, [w, h], pad = 24) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y, bw = 1, bh = 1) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + bw); y1 = Math.max(y1, y + bh); };
  for (const part of frame.parts) {
    const d = part.data;
    if (!d || !DRAWN.has(part.kind)) continue;
    if (part.kind === 'pxset') for (const px of d.px ?? []) add(px % (d.width || 1), Math.floor(px / (d.width || 1)));
    if (part.kind === 'bbox') for (const [x, y, bw, bh] of d.boxes ?? []) add(x, y, bw, bh);
    if (part.kind === 'points') for (const [x, y] of d.points ?? []) add(x, y);
  }
  if (x0 === Infinity) return [0, 0, w, h];
  const cx = Math.max(0, Math.floor(x0 - pad)), cy = Math.max(0, Math.floor(y0 - pad));
  return [cx, cy, Math.max(1, Math.min(w, Math.ceil(x1 + pad)) - cx), Math.max(1, Math.min(h, Math.ceil(y1 + pad)) - cy)];
}

function extent(frame) {
  let w = 1, h = 1;
  for (const part of frame.parts) {
    const d = part.data;
    if (!d || !DRAWN.has(part.kind)) continue;
    if (part.kind === 'pxset') {
      w = Math.max(w, d.width ?? 1);
      let maxPx = -1;
      for (const px of d.px ?? []) if (px > maxPx) maxPx = px;
      h = Math.max(h, d.height ?? Math.floor(maxPx / (d.width || 1)) + 1);
    }
    if (part.kind === 'bbox') for (const [x, y, bw, bh] of d.boxes ?? []) { w = Math.max(w, x + bw); h = Math.max(h, y + bh); }
    if (part.kind === 'points') for (const [x, y] of d.points ?? []) { w = Math.max(w, x + 1); h = Math.max(h, y + 1); }
  }
  return [w, h];
}

// --- records: status per FG (and per fork-join branch), tolerant of the
// three shapes the runners write.
function recordIndex(records) {
  const flat = new Map(), branched = new Map(), errors = new Map(), order = [];
  const asRecord = (v) => (typeof v === 'string' ? (STATUSES.has(v) ? { status: v } : null) : isObj(v) && typeof v.status === 'string' ? v : null);
  const take = (map, branch) => {
    if (!isObj(map)) return;
    for (const [id, value] of Object.entries(map)) {
      const record = asRecord(value);
      if (!record) continue;
      if (branch === null) flat.set(id, record); else branched.set(`${branch}\u0000${id}`, record);
      if (!order.includes(id)) order.push(id);
    }
  };
  if (isObj(records)) {
    if (isObj(records.records)) take(records.records, null);
    if (isObj(records.branches)) for (const [b, v] of Object.entries(records.branches)) {
      if (isObj(v)) take(v.records, b);
      if (isObj(v) && v.error) errors.set(b, v.error);
    }
    if (!isObj(records.records) && !isObj(records.branches)) take(records, null);
  }
  const stage = isObj(records) && typeof records.stage === 'string' ? records.stage : null;
  const ordered = isObj(records) && Array.isArray(records.order) ? [...records.order.filter((id) => order.includes(id)), ...order.filter((id) => !records.order.includes(id))] : order;
  return {
    stage, order: ordered, errors,
    of(fg, branch = null) {
      if (branch !== null && branched.has(`${branch}\u0000${fg}`)) return branched.get(`${branch}\u0000${fg}`);
      if (flat.has(fg)) return flat.get(fg);
      if (branch !== null) return null;
      const all = [...branched].filter(([k]) => k.endsWith(`\u0000${fg}`)).map(([, r]) => r);
      if (!all.length) return null;
      const status = all.some((r) => r.status === 'failed') ? 'failed' : all.every((r) => r.status === 'dormant') ? 'dormant' : 'held';
      return { status, reason: all.map((r) => r.reason).filter(has).join('; ') || null };
    }
  };
}

const stageFromId = (id) => (typeof id === 'string' && /^fg\.(s\d+)\./i.test(id) ? id.match(/^fg\.(s\d+)\./i)[1] : null);
const stageLabel = (s) => (/^s\d+$/i.test(s) ? s.toUpperCase() : s);

function statusHtml(status, reason) {
  if (!has(status)) return '';
  const cls = STATUSES.has(status) ? status : 'other';
  return `<span class="st st-${cls}"${has(reason) ? ` title="${esc(reason)}"` : ''}>${esc(status)}</span>`;
}

const groupLabel = (f) => [f.branch, f.tick, f.calculation].filter(has).join(' · ') || '(no tick / calculation)';

function verdictSummary(verdicts) {
  let ok = 0, bad = 0;
  for (const v of verdicts ?? []) { if (isObj(v) && v.ok === true) ok++; if (isObj(v) && v.ok === false) bad++; }
  return { ok, bad };
}

function countOf(part) {
  const d = part.data;
  if (!d) return part.ref ? 'by ref' : '';
  if (part.kind === 'pxset') return `${(d.px ?? []).length} px`;
  if (part.kind === 'bbox') return `${(d.boxes ?? []).length} boxes`;
  if (part.kind === 'points') return `${(d.points ?? []).length} points`;
  if (part.kind === 'ledger') return `${(Array.isArray(d) ? d : d.rows ?? []).length} rows`;
  if (part.kind === 'raster' && (d.width || d.height)) return `${d.width} × ${d.height} px`;
  return '';
}

// --- left: the composition tree
function treeHtml(frames, stages, index) {
  const tree = [];
  const node = (list, key, make) => list.find((n) => n.key === key) ?? (list.push(make()), list[list.length - 1]);
  frames.forEach((f, i) => {
    const st = node(tree, stages[i], () => ({ key: stages[i], fgs: [] }));
    const fg = node(st.fgs, f.fg ?? '(no fg)', () => ({ key: f.fg ?? '(no fg)', groups: [], frames: 0 }));
    const label = groupLabel(f);
    const group = node(fg.groups, `${f.branch ?? ''}\u0000${label}`, () => ({ key: `${f.branch ?? ''}\u0000${label}`, label, branch: f.branch ?? null, frames: [] }));
    group.frames.push(i); fg.frames++;
  });
  for (const id of index.order) {
    const stage = stageLabel(stageFromId(id) ?? index.stage ?? stages[0] ?? 'stage');
    const st = node(tree, stage, () => ({ key: stage, fgs: [] }));
    node(st.fgs, id, () => ({ key: id, groups: [], frames: 0 }));
  }
  const flowHtml = [];
  const out = tree.map((st) => {
    const prefix = new RegExp(`^fg\\.${st.key.replace(/[^A-Za-z0-9]/g, '')}\\.`, 'i');
    const fgs = st.fgs.map((fg) => {
      const frameStatus = fg.groups.flatMap((g) => g.frames).map((i) => frames[i].status).find(has);
      const record = index.of(fg.key);
      const status = frameStatus ?? record?.status;
      const short = fg.key.replace(prefix, '');
      const groups = fg.groups.map((g) => {
        const rec = g.branch !== null ? index.of(fg.key, g.branch) : null;
        const err = g.branch !== null && index.errors.has(g.branch) ? 'error' : null;
        const leaves = g.frames.map((i) => {
          const f = frames[i];
          const { ok, bad } = verdictSummary(f.verdicts);
          const tally = bad ? `<span class="bad">${bad} ✗</span>` : ok ? `<span class="okc">${ok} ✓</span>` : '';
          return `<button type="button" class="leaf${bad ? ' has-bad' : ''}" data-goto="${i}" aria-pressed="false"><span class="n">${pad2(i + 1, frames.length)}</span><span class="lt">${esc(f.title ?? '(untitled)')}</span>${tally ? `<small>${tally}</small>` : ''}</button>`;
        }).join('');
        return `<div class="t-calc"><div class="calc-label">${esc(g.label)}${statusHtml(rec?.status ?? err, rec?.reason)}</div>${leaves}</div>`;
      }).join('');
      const empty = fg.frames ? '' : `<div class="t-calc"><div class="calc-label muted">no frames${has(record?.reason) ? ` · ${esc(record.reason)}` : ''}</div></div>`;
      return `<details class="t-fg" open><summary><span class="fgname" title="${esc(fg.key)}">${esc(short).replace(/\./g, '.<wbr>')}</span>${statusHtml(status, record?.reason)}</summary>${groups}${empty}</details>`;
    }).join('');
    const nFrames = st.fgs.reduce((a, fg) => a + fg.frames, 0);
    return `<details class="t-stage" open><summary><span class="stage">${esc(st.key)}</span> <span class="muted">/ ${st.fgs.length} FG${st.fgs.length === 1 ? '' : 's'} · ${nFrames} frame${nFrames === 1 ? '' : 's'}</span></summary>${fgs}</details>`;
  }).join('');
  // flow: calculations in stream order, each with the Parts it drew (the
  // Mermaid PCR shape: fn nodes, Parts as edges)
  const seen = new Map();
  for (const f of frames) {
    const key = [f.tick, f.calculation].filter(has).join(' · ') || f.fg || '?';
    if (!seen.has(key)) seen.set(key, new Set());
    for (const p of f.parts) seen.get(key).add(String(p.address).split('#')[0]);
  }
  let k = 0;
  for (const [calc, parts] of seen) flowHtml.push(`<div class="fn">${k++ ? '↓ ' : ''}${esc(calc)}</div>${[...parts].map((p) => `<div class="edge">${esc(p).replace(/\./g, '.<wbr>')}</div>`).join('')}`);
  return { tree: out, flow: flowHtml.join(''), fgCount: tree.reduce((a, st) => a + st.fgs.length, 0) };
}

// --- right: inspector blocks
function ledgerHtml(data) {
  const rows = Array.isArray(data) ? data : (data?.rows ?? []);
  if (!rows.length) return '<p class="muted">empty ledger</p>';
  const cols = [...new Set(rows.flatMap((r) => (isObj(r) ? Object.keys(r) : [])))];
  const cell = (v) => esc(v !== null && typeof v === 'object' ? canonicalJson(v) : v ?? '');
  return `<div class="tablewrap"><table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${
    rows.map((r) => `<tr>${cols.map((c) => `<td>${cell(isObj(r) ? r[c] : '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

const pngOk = (d) => isObj(d) && typeof d.png === 'string' && /^[A-Za-z0-9+/=]+$/.test(d.png);
function imageHtml(data, address) {
  if (!pngOk(data)) return '';
  const w = Number(data.width) || 0, h = Number(data.height) || 0;
  return `<img class="crop" alt="${esc(address)}" width="${w}" height="${h}" src="data:image/png;base64,${data.png}">`;
}

function scalarHtml(data) {
  const value = isObj(data) && 'value' in data ? data.value : data;
  const unit = isObj(data) && data.unit ? ` <small>${esc(data.unit)}</small>` : '';
  return `<div class="scalar">${esc(typeof value === 'object' && value !== null ? canonicalJson(value) : value)}${unit}</div>`;
}

function pageHtml(frame, i, total, stage, index, viewerHasCanvas) {
  const record = frame.fg ? (frame.branch ? index.of(frame.fg, frame.branch) : null) ?? index.of(frame.fg) : null;
  const status = frame.status ?? record?.status;
  const facts = [['stage', stage], ['branch', frame.branch], ['tick', frame.tick], ['calculation', frame.calculation], ['seq', frame.seq]]
    .filter(([, v]) => has(v)).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  const recordFacts = record ? [['reason', record.reason], ['lane', record.lane], ['guards', record.guards], ['reads', record.reads], ['calls', record.calls], ['requires', record.requires]]
    .filter(([, v]) => has(v) && !(Array.isArray(v) && !v.length)).map(([k, v]) => `<dt>${k}</dt><dd>${esc(Array.isArray(v) ? v.join(', ') : v)}</dd>`).join('') : '';
  const parts = frame.parts.map((p, j) => {
    const drawn = DRAWN.has(p.kind) && p.data;
    const swatch = drawn ? `<i class="sw" style="background:${PALETTE[j % PALETTE.length]}"></i>` : '';
    const sub = [p.kind, countOf(p), p.ref, p.sha256 ? `sha256 ${String(p.sha256).slice(0, 12)}` : null].filter(has).map(esc).join(' · ');
    let body = '';
    if (p.kind === 'ledger') {
      const n = (Array.isArray(p.data) ? p.data : p.data?.rows ?? []).length;
      body = `<details${n <= 8 ? ' open' : ''}><summary>table · ${n} row${n === 1 ? '' : 's'}</summary>${ledgerHtml(p.data)}</details>`;
    } else if (p.kind === 'scalar') body = scalarHtml(p.data);
    else if (p.kind === 'raster' && pngOk(p.data)) body = viewerHasCanvas ? imageHtml(p.data, p.address) : '<div class="muted">shown in the viewer</div>';
    return `<div class="part">${swatch}<div class="address">${esc(p.address)}</div><small>${sub}</small>${body}</div>`;
  }).join('');
  const { ok, bad } = verdictSummary(frame.verdicts);
  const verdicts = (frame.verdicts ?? []).map((v) => {
    const okv = isObj(v) ? v.ok : undefined;
    const label = isObj(v) ? (v.name ?? canonicalJson(v)) : v;
    const detail = isObj(v) && v.detail !== undefined ? ` <small>${esc(canonicalJson(v.detail))}</small>` : '';
    return `<li class="${okv === true ? 'ok' : okv === false ? 'bad' : ''}">${esc(label)}${detail}</li>`;
  }).join('');
  return `<section class="page" id="p${i}" data-index="${i}"${i ? ' hidden' : ''}>
<div class="block"><div class="label">FRAME ${i + 1} / ${total}</div><div class="value">${esc(frame.title ?? '(untitled)')}</div></div>
<div class="block"><div class="label">FG</div><div class="address">${esc(frame.fg ?? '(none)')} ${statusHtml(status, record?.reason)}</div><dl>${facts}${recordFacts}</dl></div>
<div class="block"><div class="label">PARTS · ${frame.parts.length}</div>${parts || '<div class="muted">none</div>'}</div>
${verdicts ? `<div class="block"><div class="label">VERDICTS · ${ok} ok${bad ? ` · <span class="bad">${bad} bad</span>` : ''}</div><ul class="verdicts">${verdicts}</ul></div>` : ''}
<details class="block"><summary>Receipt slice</summary><pre>${esc(JSON.stringify(frame.receipt ?? null, null, 2))}</pre></details>
</section>`;
}

// --- center: the viewer, one .shot per frame
function shotHtml(frame, i, view, full) {
  const drawn = frame.parts.map((p, j) => [p, j]).filter(([p]) => DRAWN.has(p.kind) && p.data);
  const pngs = frame.parts.filter((p) => p.kind === 'raster' && pngOk(p.data));
  const [vx, vy, w, h] = view;
  let body, caption;
  if (drawn.length) {
    body = `<canvas data-frame="${i}" width="${w}" height="${h}"></canvas>`;
    caption = `${w} × ${h} px · crop window (${vx}, ${vy})–(${vx + w}, ${vy + h}) of ${full[0]} × ${full[1]}`;
  } else if (pngs.length) {
    body = pngs.map((p) => imageHtml(p.data, p.address)).join('');
    caption = pngs.map((p) => `${p.data.width} × ${p.data.height} px${Array.isArray(p.data.origin) ? ` · window (${p.data.origin.join(', ')})–(${p.data.origin[0] + p.data.width}, ${p.data.origin[1] + p.data.height})` : ''}`).join(' | ');
  } else {
    const refs = frame.parts.filter((p) => p.ref).map((p) => `<div><span class="address">${esc(p.address)}</span> <small>${esc(p.kind)} · ${esc(p.ref)}</small></div>`).join('');
    body = `<div class="empty"><div class="label">NOTHING DRAWN ON THIS FRAME</div>${refs ? `<p>pixels by artifact ref only (not embedded in the Frame):</p>${refs}` : '<p>see the inspector for its parts</p>'}</div>`;
    caption = 'no drawn parts';
  }
  const legendText = typeof frame.receipt?.legend === 'string' ? `<li class="note">${esc(frame.receipt.legend)}</li>` : '';
  const legend = drawn.map(([p, j]) => `<li><button type="button" class="lg" data-frame="${i}" data-part="${j}" aria-pressed="true"><i class="sw" style="background:${PALETTE[j % PALETTE.length]}"></i>${esc(p.address)} <small>${esc(p.kind)} · ${esc(countOf(p))}</small></button></li>`).join('');
  return {
    shot: `<div class="shot" data-index="${i}"${i ? ' hidden' : ''}>${body}</div>`,
    caption: `<div class="caption" data-index="${i}"${i ? ' hidden' : ''}>${esc(caption)} · <span class="mode">fit to view</span></div>`,
    legend: legend || legendText ? `<ul class="legend" data-index="${i}"${i ? ' hidden' : ''}>${legend}${legendText}</ul>` : ''
  };
}

export function renderFlipbook(frames, { raster = null, background = null, records = null, stage = null, title = 'FG flipbook' } = {}) {
  if (!Array.isArray(frames)) throw new TypeError('renderFlipbook: frames must be an array');
  const index = recordIndex(records);
  const fullExtent = (f) => raster ? [raster.width, raster.height]
    : background ? [background.width + (background.x ?? 0), background.height + (background.y ?? 0)] : extent(f);
  const fulls = frames.map(fullExtent);
  const views = frames.map((f, k) => crop(f, fulls[k]));
  // stage: the frame's own, else the caller's, else the records', else the
  // fg id's (fg.s1.* -> S1), else the stream's most common one
  const raw = frames.map((f) => f.stage ?? stage ?? index.stage ?? stageFromId(f.fg));
  const counts = new Map();
  for (const s of raw) if (has(s)) counts.set(s, (counts.get(s) ?? 0) + 1);
  const common = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'stage';
  const stages = raw.map((s) => stageLabel(has(s) ? s : common));
  const { tree, flow, fgCount } = treeHtml(frames, stages, index);
  const shots = frames.map((f, i) => shotHtml(f, i, views[i], fulls[i]));
  const hasCanvas = frames.map((f) => f.parts.some((p) => DRAWN.has(p.kind) && p.data));
  const image = background ? { src: background.src, x: background.x ?? 0, y: background.y ?? 0 } : null;
  const bg = raster ? { width: raster.width, height: raster.height, rgba: base64(raster.rgba instanceof Uint8Array ? raster.rgba : new Uint8Array(raster.rgba)) } : null;
  const stream = framesJson(frames);
  const stageList = [...new Set(stages)].join(' · ');
  const fileName = `${String(title).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'frames'}.frames.json`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--line:#5b4723;--gold:#efbe6b;--muted:#bbaa87;--fg:#eee1c3;--bg:#171208;--pane:#211a0e;--deep:#100d07;--ok:#9bc27a;--bad:#f08a73;color-scheme:dark}
*{box-sizing:border-box}
[hidden]{display:none!important}
html,body{margin:0;background:var(--bg)}
.labui{color:var(--fg);background:var(--bg);font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;padding:18px;min-height:100dvh}
header,.context,footer{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
header{border-bottom:1px solid var(--line);padding-bottom:10px}
.brand{color:var(--gold);letter-spacing:2px;font-size:23px}
a{color:var(--muted);text-underline-offset:3px}a:hover{color:var(--gold)}
.context{padding:12px 0}.context>span:first-child{overflow-wrap:anywhere}
.muted,.label,dt,.caption,footer,small{color:var(--muted)}
small{font-size:11px}
.layout{display:grid;grid-template-columns:250px minmax(0,1fr) 330px;gap:10px;height:calc(100dvh - 150px);min-height:520px}
.pane{border:1px solid var(--line);background:var(--pane);min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.heading{padding:9px 11px;color:var(--gold);border-bottom:1px solid var(--line);letter-spacing:.6px;flex:none}
button{font:inherit;cursor:pointer;color:var(--muted);background:transparent;border:1px solid var(--line);padding:5px 9px;border-radius:2px}
button:hover{color:var(--fg);background:#372a15}
button[aria-pressed=true]{color:var(--gold);background:#3b2d16;border-color:var(--gold)}
button:focus-visible,a:focus-visible,summary:focus-visible,.viewport:focus-visible,input:focus-visible{outline:2px solid var(--gold);outline-offset:3px}
summary{cursor:pointer;color:var(--gold)}
.tree{flex:1;overflow:auto;padding:4px 0;position:relative}
.t-stage>summary{padding:10px 12px;border-bottom:1px solid var(--line)}
.stage{color:var(--gold)}
.t-fg{border-bottom:1px solid var(--line)}
.t-fg>summary{padding:8px 12px 6px;display:flex;gap:6px;align-items:baseline;flex-wrap:wrap}
.t-fg>summary::marker,.t-fg>summary::-webkit-details-marker{color:var(--muted)}
.fgname{overflow-wrap:anywhere;flex:1;min-width:0}
.t-calc{padding:0 10px 8px 18px;display:grid;gap:5px}
.calc-label{font-size:11px;color:var(--muted);overflow-wrap:anywhere;display:flex;gap:6px;flex-wrap:wrap;align-items:baseline}
.leaf{text-align:left;width:100%;display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:7px;font-size:12px;line-height:1.4;padding:5px 7px}
.leaf .n{color:var(--gold);opacity:.75}.leaf .lt{overflow-wrap:anywhere}.leaf small{grid-column:2}
.leaf.has-bad{border-left:3px solid var(--bad)}
.st{font-size:10px;letter-spacing:.6px;text-transform:uppercase;border:1px solid var(--line);padding:0 5px;border-radius:2px;white-space:nowrap}
.st-held{color:var(--ok);border-color:#4d6a35}.st-failed,.st-error{color:var(--bad);border-color:#7a3a2a}.st-dormant{color:var(--muted)}
.flow{padding:8px 12px;border-top:1px solid var(--line);color:var(--muted);font-size:11px;max-height:26%;overflow:auto;flex:none}
.flow summary{color:var(--muted);letter-spacing:.6px}
.flow .fn{color:var(--fg);padding-top:5px;overflow-wrap:anywhere}.flow .edge{position:relative;padding-left:24px;overflow-wrap:anywhere}.flow .edge::before{content:"\\2192";position:absolute;left:10px}
.viewbar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border-bottom:1px solid var(--line);flex-wrap:wrap;flex:none}
#vtitle{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.tools{display:flex;gap:5px}
.viewport{flex:1;min-height:0;overflow:hidden;background:var(--deep);display:flex;align-items:center;justify-content:center;padding:12px}
.shot{width:100%;height:100%;display:flex;gap:10px;align-items:center;justify-content:center}
.shot[hidden]{display:none}
.shot canvas,.shot img{display:block;width:100%;height:100%;min-width:0;min-height:0;object-fit:contain;image-rendering:pixelated}
.viewport.zoomed{display:block;overflow:auto;cursor:grab}
.viewport.zoomed.panning{cursor:grabbing}
.zoomed .shot{width:max-content;height:auto;margin:0 auto}
.zoomed .shot canvas,.zoomed .shot img{width:auto;height:auto;max-width:none}
.empty{max-width:520px;color:var(--muted);overflow-wrap:anywhere;font-size:12px}.empty p{margin:8px 0}
.caption{padding:7px 11px;border-top:1px solid var(--line);font-size:11px;overflow-wrap:anywhere;flex:none}
.legend{list-style:none;margin:0;padding:6px 10px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:5px;flex:none;max-height:96px;overflow:auto}
.legend .lg{font-size:11px;padding:2px 7px;display:flex;align-items:center;gap:6px;text-align:left}
.legend .lg[aria-pressed=false]{opacity:.45;text-decoration:line-through}
.legend .note{font-size:11px;color:var(--muted);padding:2px 0}
.sw{display:inline-block;width:11px;height:11px;flex:none;border:1px solid #0006}
.stepper{display:flex;gap:6px;align-items:center;padding:7px 10px;border-top:1px solid var(--line);flex:none}
.stepper input{flex:1;min-width:60px;accent-color:var(--gold)}
#where{min-width:56px;text-align:right;color:var(--muted)}
.inspect{flex:1;overflow:auto;padding:12px;overflow-wrap:anywhere}
.page[hidden]{display:none}
.block{margin-bottom:19px}
.label{font-size:11px;letter-spacing:.6px;margin-bottom:4px}
.value{color:var(--gold)}
.address{font-size:12px;color:var(--fg)}
dl{margin:6px 0 0;display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:10px;font-size:12px}dt{font-size:11px}dd{margin:0 0 4px}
.part{border-top:1px dashed #5b472388;padding:7px 0;position:relative}.part .sw{position:absolute;left:-6px;top:11px;width:3px;height:14px;border:0}
.part small{display:block}
.part details{margin-top:5px}.part details summary{font-size:11px}
.tablewrap{overflow-x:auto;margin-top:4px;max-height:320px;overflow-y:auto}
table{border-collapse:collapse;font-size:11px;font-variant-numeric:tabular-nums}td,th{border:1px solid var(--line);padding:2px 6px;text-align:left;white-space:nowrap}th{color:var(--gold);position:sticky;top:0;background:var(--pane)}
.scalar{font-size:20px;color:var(--gold);font-variant-numeric:tabular-nums}.scalar small{font-size:12px}
.part img.crop{display:block;margin-top:6px;width:180px;height:auto;image-rendering:pixelated;border:1px solid var(--line)}
.verdicts{margin:0;padding-left:18px;max-height:260px;overflow:auto;font-size:12px}
.ok::marker{content:"\\2713  ";color:var(--ok)}.bad::marker{content:"\\2717  ";color:var(--bad)}.bad{color:var(--bad)}.okc{color:var(--ok)}
details.block{border-top:1px solid var(--line);padding:10px 0}
pre{white-space:pre-wrap;font:11px/1.6 ui-monospace,monospace;margin:6px 0 0;overflow-wrap:anywhere}
.download{display:inline-block;margin-top:4px;font-size:12px}
footer{padding-top:10px;font-size:11px}
@media(max-width:850px){.layout{grid-template-columns:200px minmax(0,1fr);height:auto;min-height:0}.pane{overflow:visible}.tree{max-height:60dvh}.inspector{grid-column:1/-1}.viewport{flex:none;height:60dvh}.inspect{overflow:visible}.page:not([hidden]){display:grid;grid-template-columns:1fr 1fr;gap:12px}.page .block{margin:0}.page details.block{grid-column:1/-1}}
@media(max-width:480px){.labui{padding:10px}.layout{grid-template-columns:1fr}.tree{max-height:38dvh}.flow{display:none}.page:not([hidden]){display:block}.page .block{margin-bottom:16px}.viewport{height:56dvh}#vtitle{white-space:normal}}
@media(pointer:coarse){button{min-height:44px}}
</style></head><body>
<main class="labui">
<header><span class="brand">LABUI_</span><span class="muted" title="sha256 of the canonical frame stream">frames ${esc(sha256Hex(stream).slice(0, 12))}</span></header>
<div class="context"><span>${esc(title)}</span><span class="muted">${esc(stageList)} · ${fgCount} FG${fgCount === 1 ? '' : 's'} · ${frames.length} frame${frames.length === 1 ? '' : 's'}</span></div>
<div class="layout">
<nav class="pane" aria-label="Composition tree">
<div class="heading">01 / COMPOSITION</div>
<div class="tree" id="tree">${tree || '<p class="muted" style="padding:0 12px">no frames</p>'}</div>
${flow ? `<details class="flow" open><summary>FLOW · calculation → Parts</summary>${flow}</details>` : ''}
</nav>
<section class="pane image-pane" aria-label="Frame viewer">
<div class="heading">02 / FRAME</div>
<div class="viewbar"><span id="vtitle">${esc(frames[0]?.title ?? 'no frames')}</span><div class="tools"><button id="fit" type="button" aria-pressed="true">Fit</button><button id="zoom" type="button" aria-pressed="false">Zoom 1:1</button></div></div>
<div class="viewport" id="viewport" tabindex="0" role="region" aria-label="Frame viewport; drag or scroll to pan when zoomed">
${frames.length ? shots.map((s) => s.shot).join('\n') : '<p class="muted">no frames</p>'}
</div>
${shots.map((s) => s.caption).join('\n')}
${shots.map((s) => s.legend).join('\n')}
<div class="stepper"><button id="prev" type="button" aria-label="previous frame">&larr; prev</button><input id="slider" type="range" min="0" max="${Math.max(0, frames.length - 1)}" value="0" aria-label="frame"><button id="next" type="button" aria-label="next frame">next &rarr;</button><span id="where">${frames.length ? 1 : 0} / ${frames.length}</span></div>
</section>
<aside class="pane inspector" aria-label="Inspector">
<div class="heading">03 / INSPECT</div>
<div class="inspect" id="inspect">
${frames.length ? frames.map((f, i) => pageHtml(f, i, frames.length, stages[i], index, hasCanvas[i])).join('\n') : '<p class="muted">no frames</p>'}
<a class="download" id="dl" href="#" download="${esc(fileName)}">Frames JSON ↓</a>
</div>
</aside>
</div>
<footer><span>FG frame stream · read-only · one page per Frame</span><span>← → step · f fit · z zoom · drag to pan · Tab controls</span></footer>
</main>
<script type="application/json" id="fg-frames">${stream.replace(/</g, '\\u003c')}</script>
<script type="application/json" id="fg-views">${scriptJson(views)}</script>
<script type="application/json" id="fg-raster">${scriptJson(bg)}</script>
<script type="application/json" id="fg-image">${scriptJson(image)}</script>
<script>
(() => {
  const $ = (id) => document.getElementById(id);
  const all = (sel) => [...document.querySelectorAll(sel)];
  const frames = JSON.parse($('fg-frames').textContent);
  const views = JSON.parse($('fg-views').textContent);
  const bg = JSON.parse($('fg-raster').textContent);
  const image = JSON.parse($('fg-image').textContent);
  const PALETTE = ${JSON.stringify(PALETTE)};
  const DRAWN = ['pxset', 'bbox', 'points'];
  const byIndex = (sel) => { const m = []; all(sel).forEach((el) => { m[Number(el.dataset.index)] = el; }); return m; };
  const pages = byIndex('section.page'), shots = byIndex('.shot'), captions = byIndex('.caption[data-index]'), legends = byIndex('.legend[data-index]');
  const leaves = all('.leaf');
  const hiddenParts = frames.map(() => new Set());
  const painted = new Set();
  let img = null;
  if (image) { img = new Image(); img.onload = () => { const again = [...painted]; painted.clear(); again.forEach(paint); }; img.src = image.src; }
  let bgCanvas = null;
  if (bg) {
    const bin = atob(bg.rgba); const bytes = new Uint8ClampedArray(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    bgCanvas = document.createElement('canvas'); bgCanvas.width = bg.width; bgCanvas.height = bg.height;
    bgCanvas.getContext('2d').putImageData(new ImageData(bytes, bg.width, bg.height), 0, 0);
  }
  function paint(i) {
    if (painted.has(i)) return; painted.add(i);
    const canvas = document.querySelector('canvas[data-frame="' + i + '"]'); if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const [vx, vy, vw, vh] = views[i];
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.translate(-vx, -vy);
    if (bgCanvas) { ctx.globalAlpha = 0.6; ctx.drawImage(bgCanvas, 0, 0); ctx.globalAlpha = 1; }
    if (img && img.complete && img.naturalWidth) { ctx.globalAlpha = 0.7; ctx.drawImage(img, image.x, image.y); ctx.globalAlpha = 1; }
    const big = Math.max(vw, vh);
    frames[i].parts.forEach((part, j) => {
      const d = part.data;
      if (!d || !DRAWN.includes(part.kind) || hiddenParts[i].has(j)) return;
      const color = PALETTE[j % PALETTE.length]; ctx.fillStyle = color; ctx.strokeStyle = color;
      if (part.kind === 'pxset') { ctx.globalAlpha = 0.75; for (const p of d.px || []) ctx.fillRect(p % d.width, Math.floor(p / d.width), 1, 1); ctx.globalAlpha = 1; }
      if (part.kind === 'bbox') { ctx.lineWidth = Math.max(1, Math.round(big / 500)); for (const [x, y, w, h] of d.boxes || []) ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1)); }
      if (part.kind === 'points') { const r = Math.max(1.5, big / 250); for (const [x, y] of d.points || []) { ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, r, 0, 2 * Math.PI); ctx.fill(); } }
    });
  }
  const viewport = $('viewport'), slider = $('slider'), where = $('where'), tree = $('tree');
  let at = 0, zoomed = false;
  function setZoom(z) {
    zoomed = z;
    viewport.classList.toggle('zoomed', z);
    $('fit').setAttribute('aria-pressed', String(!z)); $('zoom').setAttribute('aria-pressed', String(z));
    all('.caption .mode').forEach((m) => { m.textContent = z ? '1 image pixel per CSS pixel · drag to pan' : 'fit to view'; });
    viewport.scrollTo(0, 0);
  }
  function reveal(leaf) {
    for (let d = leaf.parentElement; d && d !== tree; d = d.parentElement) if (d.tagName === 'DETAILS') d.open = true;
    const top = leaf.offsetTop, bottom = top + leaf.offsetHeight;
    if (top < tree.scrollTop) tree.scrollTop = top - 8;
    else if (bottom > tree.scrollTop + tree.clientHeight) tree.scrollTop = bottom - tree.clientHeight + 8;
  }
  function show(i) {
    if (!frames.length) return;
    at = Math.max(0, Math.min(frames.length - 1, i));
    const toggle = (list) => list.forEach((el, j) => { if (el) el.hidden = j !== at; });
    toggle(pages); toggle(shots); toggle(captions); toggle(legends);
    slider.value = at; where.textContent = (at + 1) + ' / ' + frames.length;
    $('vtitle').textContent = frames[at].title || '(untitled)';
    $('vtitle').title = frames[at].title || '';
    leaves.forEach((l) => { const on = Number(l.dataset.goto) === at; l.setAttribute('aria-pressed', String(on)); if (on) reveal(l); });
    if (zoomed) viewport.scrollTo(0, 0);
    // Sandboxed viewers (srcdoc iframes) refuse history writes; the frame
    // number is a convenience, never worth failing the paint for.
    try { if (location.hash !== '#' + at) history.replaceState(null, '', '#' + at); } catch {}
    paint(at);
  }
  $('prev').onclick = () => show(at - 1);
  $('next').onclick = () => show(at + 1);
  slider.oninput = () => show(Number(slider.value));
  $('fit').onclick = () => setZoom(false);
  $('zoom').onclick = () => setZoom(!zoomed);
  leaves.forEach((l) => { l.onclick = () => show(Number(l.dataset.goto)); });
  all('.legend .lg').forEach((b) => {
    b.onclick = () => {
      const i = Number(b.dataset.frame), j = Number(b.dataset.part), off = hiddenParts[i];
      if (off.has(j)) off.delete(j); else off.add(j);
      b.setAttribute('aria-pressed', String(!off.has(j)));
      painted.delete(i); paint(i);
    };
  });
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || (e.target && e.target.matches && e.target.matches('input, textarea, select'))) return;
    const k = e.key;
    if (k === 'ArrowLeft') { show(at - 1); e.preventDefault(); }
    else if (k === 'ArrowRight') { show(at + 1); e.preventDefault(); }
    else if (k === 'f' || k === 'F') { setZoom(false); e.preventDefault(); }
    else if (k === 'z' || k === 'Z') { setZoom(!zoomed); e.preventDefault(); }
  });
  let drag = null;
  viewport.addEventListener('pointerdown', (e) => {
    if (!zoomed || e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, l: viewport.scrollLeft, t: viewport.scrollTop };
    viewport.classList.add('panning');
    try { viewport.setPointerCapture(e.pointerId); } catch {}
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!drag) return;
    viewport.scrollLeft = drag.l - (e.clientX - drag.x); viewport.scrollTop = drag.t - (e.clientY - drag.y);
  });
  const stop = () => { drag = null; viewport.classList.remove('panning'); };
  viewport.addEventListener('pointerup', stop); viewport.addEventListener('pointercancel', stop);
  try { $('dl').href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(frames)); } catch {}
  let start = 0;
  try { start = Number((location.hash || '#0').replace(/^#p?/, '')) || 0; } catch {}
  show(start);
})();
</script>
</body></html>
`;
}
