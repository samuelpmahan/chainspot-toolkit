/**
 * Static flipbook over a Frame stream (browser-safe: no node:* imports;
 * it returns a string and the caller decides where it goes).
 *
 *   renderFlipbook(frames, { raster?, title? }) -> one self-contained HTML
 *   framesJson(frames)                           -> canonical JSON of the array
 *
 * The flipbook is a reader, not a second source of truth: every page is
 * one Frame exactly as an FG emitted it, and framesJson is the same stream
 * for an agent or a test. One <section class="page"> per frame, rendered
 * server-side (ledger tables, scalars, verdicts and the receipt slice are
 * plain HTML, so the file is readable with scripts off and greppable by an
 * agent); prev/next buttons, a slider, arrow keys and #<n> deep links flip
 * between pages.
 *
 * Renderers are keyed by part kind:
 *   pxset   data { width, height?, px: [flat index] }    filled pixels
 *   bbox    data { boxes: [[x, y, w, h, label?]] }       stroked rectangles
 *   points  data { points: [[x, y, label?]] }            dots
 *   ledger  data { rows: [{...}] } or [{...}]           table
 *   scalar  data { value, unit? } or a bare value        value
 *   raster  ref only (artifact uri) or data { width, height }: listed; the
 *           pixels come from the optional `raster` background. data
 *           { width, height, png } (base64 PNG, e.g. fg/png.mjs cropWindow)
 *           renders inline as an <img>, scaled 3x pixelated: the contact-sheet
 *           path for small crops, one per page
 * pxset/bbox/points share one canvas per page, drawn over the optional
 * background raster { width, height, rgba } (embedded as base64), one
 * colour per part in part order with a legend. The canvas extent is the
 * raster's when given, else the largest extent the parts imply.
 */
import { canonicalJson } from './canon.mjs';

const DRAWN = new Set(['pxset', 'bbox', 'points']);
const PALETTE = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#9a6324', '#469990', '#800000'];

const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const scriptJson = (value) => canonicalJson(value).replace(/</g, '\\u003c');

export const framesJson = (frames) => canonicalJson(frames);

function base64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

function extent(frame, raster) {
  if (raster) return [raster.width, raster.height];
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

function ledgerHtml(data) {
  const rows = Array.isArray(data) ? data : (data?.rows ?? []);
  if (!rows.length) return '<p class="muted">empty ledger</p>';
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v) => esc(v !== null && typeof v === 'object' ? canonicalJson(v) : v ?? '');
  return `<table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${
    rows.map((r) => `<tr>${cols.map((c) => `<td>${cell(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function imageHtml(data) {
  if (!data || typeof data.png !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(data.png)) return '';
  const w = Number(data.width) || 0, h = Number(data.height) || 0;
  return `<img class="crop" alt="" width="${w}" height="${h}" style="width:${w * 3}px;height:${h * 3}px" src="data:image/png;base64,${data.png}">`;
}

function scalarHtml(data) {
  const value = data !== null && typeof data === 'object' && 'value' in data ? data.value : data;
  const unit = data !== null && typeof data === 'object' && data.unit ? ` ${esc(data.unit)}` : '';
  return `<span class="scalar">${esc(typeof value === 'object' ? canonicalJson(value) : value)}${unit}</span>`;
}

function pageHtml(frame, index, total, raster) {
  const drawn = frame.parts.filter((p) => DRAWN.has(p.kind) && p.data);
  const [w, h] = extent(frame, raster);
  const scale = Math.max(1, Math.floor(640 / Math.max(w, h)));
  const meta = [
    ['fg', frame.fg], ['branch', frame.branch], ['tick', frame.tick], ['calculation', frame.calculation]
  ].filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `<span><b>${k}</b> ${esc(v)}</span>`).join(' ');
  const legend = drawn.map((p) => `<li><i style="background:${PALETTE[frame.parts.indexOf(p) % PALETTE.length]}"></i>${esc(p.address)} <small>${p.kind}</small></li>`).join('');
  const others = frame.parts.filter((p) => !DRAWN.has(p.kind) || !p.data).map((p) => {
    const body = p.kind === 'ledger' ? ledgerHtml(p.data) : p.kind === 'scalar' ? scalarHtml(p.data) : p.kind === 'raster' ? imageHtml(p.data) : '';
    return `<div class="part"><h3>${esc(p.address)} <small>${p.kind}${p.ref ? ` · ${esc(p.ref)}` : ''}</small></h3>${body}</div>`;
  }).join('');
  const verdicts = (frame.verdicts ?? []).map((v) => {
    const ok = typeof v === 'object' && v !== null ? v.ok : undefined;
    const label = typeof v === 'object' && v !== null ? (v.name ?? canonicalJson(v)) : v;
    const detail = typeof v === 'object' && v !== null && v.detail !== undefined ? ` <small>${esc(canonicalJson(v.detail))}</small>` : '';
    return `<li class="${ok === true ? 'ok' : ok === false ? 'bad' : ''}">${esc(label)}${detail}</li>`;
  }).join('');
  return `<section class="page" id="p${index}" data-index="${index}"${index ? ' hidden' : ''}>
<header><h2>${esc(frame.title)}</h2><div class="meta">${meta} <span class="muted">page ${index + 1}/${total}</span></div></header>
${drawn.length ? `<div class="view"><canvas data-frame="${index}" width="${w}" height="${h}" style="width:${w * scale}px"></canvas><ul class="legend">${legend}</ul></div>` : ''}
${others}
${verdicts ? `<h3>verdicts</h3><ul class="verdicts">${verdicts}</ul>` : ''}
<details><summary>receipt slice</summary><pre>${esc(JSON.stringify(frame.receipt ?? null, null, 2))}</pre></details>
</section>`;
}

export function renderFlipbook(frames, { raster = null, title = 'FG flipbook' } = {}) {
  if (!Array.isArray(frames)) throw new TypeError('renderFlipbook: frames must be an array');
  const draw = frames.map((f) => f.parts.map((p, i) => DRAWN.has(p.kind) && p.data ? { kind: p.kind, color: PALETTE[i % PALETTE.length], data: p.data } : null).filter(Boolean));
  const bg = raster ? { width: raster.width, height: raster.height, rgba: base64(raster.rgba instanceof Uint8Array ? raster.rgba : new Uint8Array(raster.rgba)) } : null;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#fff;--fg:#1a1a1a;--muted:#666;--line:#ddd;--ok:#1a7f37;--bad:#c62828}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#e8e8e8;--muted:#999;--line:#333;--ok:#4caf50;--bad:#ef5350}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}
nav{position:sticky;top:0;background:var(--bg);display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line);flex-wrap:wrap}
nav input[type=range]{flex:1;min-width:120px}
h2{margin:12px 0 4px}h3{margin:12px 0 4px;font-size:14px}.meta span{margin-right:12px}.muted,small{color:var(--muted)}
.view{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}
canvas{max-width:100%;image-rendering:pixelated;border:1px solid var(--line);background:repeating-conic-gradient(#8882 0 25%,#0000 0 50%) 0 0/16px 16px}
.legend{list-style:none;padding:0;margin:0}.legend i{display:inline-block;width:12px;height:12px;margin-right:6px;vertical-align:middle}
table{border-collapse:collapse;font-variant-numeric:tabular-nums;display:block;overflow-x:auto}td,th{border:1px solid var(--line);padding:2px 8px;text-align:left}
.scalar{font-size:24px;font-variant-numeric:tabular-nums}.ok::marker{content:"\\2713  ";color:var(--ok)}.bad::marker{content:"\\2717  ";color:var(--bad)}.bad{color:var(--bad)}
pre{overflow-x:auto;font-size:12px}${frames.some((f) => f.parts.some((p) => p.kind === 'raster' && typeof p.data?.png === 'string')) ? 'img.crop{image-rendering:pixelated;max-width:100%;border:1px solid var(--line)}' : ''}
</style></head><body>
<nav><button id="prev" type="button">&larr; prev</button><input id="slider" type="range" min="0" max="${Math.max(0, frames.length - 1)}" value="0"><button id="next" type="button">next &rarr;</button><span id="where"></span></nav>
<main>
${frames.length ? frames.map((f, i) => pageHtml(f, i, frames.length, raster)).join('\n') : '<p class="muted">no frames</p>'}
</main>
<script type="application/json" id="fg-draw">${scriptJson(draw)}</script>
<script type="application/json" id="fg-raster">${scriptJson(bg)}</script>
<script>
(() => {
  const draw = JSON.parse(document.getElementById('fg-draw').textContent);
  const bg = JSON.parse(document.getElementById('fg-raster').textContent);
  const pages = [...document.querySelectorAll('section.page')];
  let bgCanvas = null;
  if (bg) {
    const bin = atob(bg.rgba); const bytes = new Uint8ClampedArray(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    bgCanvas = document.createElement('canvas'); bgCanvas.width = bg.width; bgCanvas.height = bg.height;
    bgCanvas.getContext('2d').putImageData(new ImageData(bytes, bg.width, bg.height), 0, 0);
  }
  const drawn = new Set();
  const paint = (i) => {
    if (drawn.has(i)) return; drawn.add(i);
    const canvas = document.querySelector('canvas[data-frame="' + i + '"]'); if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (bgCanvas) { ctx.globalAlpha = 0.6; ctx.drawImage(bgCanvas, 0, 0); ctx.globalAlpha = 1; }
    for (const part of draw[i]) {
      const d = part.data; ctx.fillStyle = part.color; ctx.strokeStyle = part.color;
      if (part.kind === 'pxset') { ctx.globalAlpha = 0.75; for (const p of d.px || []) ctx.fillRect(p % d.width, Math.floor(p / d.width), 1, 1); ctx.globalAlpha = 1; }
      if (part.kind === 'bbox') { ctx.lineWidth = Math.max(1, canvas.width / 400); for (const [x, y, w, h] of d.boxes || []) ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1)); }
      if (part.kind === 'points') { const r = Math.max(0.5, canvas.width / 200); for (const [x, y] of d.points || []) { ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, r, 0, 2 * Math.PI); ctx.fill(); } }
    }
  };
  const slider = document.getElementById('slider'), where = document.getElementById('where');
  let at = 0;
  const show = (i) => {
    if (!pages.length) return;
    at = Math.max(0, Math.min(pages.length - 1, i));
    pages.forEach((p, j) => { p.hidden = j !== at; });
    slider.value = at; where.textContent = (at + 1) + ' / ' + pages.length;
    if (location.hash !== '#' + at) history.replaceState(null, '', '#' + at);
    paint(at);
  };
  document.getElementById('prev').onclick = () => show(at - 1);
  document.getElementById('next').onclick = () => show(at + 1);
  slider.oninput = () => show(Number(slider.value));
  addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') show(at - 1); if (e.key === 'ArrowRight') show(at + 1); });
  show(Number((location.hash || '#0').slice(1)) || 0);
})();
</script>
</body></html>
`;
}
