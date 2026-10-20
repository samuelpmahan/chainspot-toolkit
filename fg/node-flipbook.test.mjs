import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { encodePngRgb, base64 } from './png.mjs';
import { renderFlipbook } from './flipbook.mjs';
import { repackPng, decodePng, imageFiles, externalImages, writeFlipbook, inlineFlipbook } from './node-flipbook.mjs';

// a course-like render: a smooth gradient with a drawn line, 2x nearest-neighbour upscaled (what tk.s7.routeMatchView does)
function render(w = 64, h = 48) {
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = (y * w + x) * 3;
    rgb[d] = (x >> 1) * 4; rgb[d + 1] = (y >> 1) * 5; rgb[d + 2] = Math.abs((x >> 1) - (y >> 1)) < 2 ? 255 : 40;
  }
  return { w, h, rgb };
}
const tmp = () => mkdtempSync(join(tmpdir(), 'node-flipbook-'));

test('repackPng keeps every pixel, shrinks stored and zlib PNGs, and is deterministic', () => {
  const { w, h, rgb } = render();
  for (const deflate of [undefined, (b) => new Uint8Array(deflateSync(b))]) {
    const png = encodePngRgb({ width: w, height: h, rgb, deflate }), packed = repackPng(png);
    assert.ok(packed.length < png.length, `repacked ${packed.length} B < ${png.length} B`);
    const a = decodePng(png), b = decodePng(packed);
    assert.deepEqual([b.width, b.height, b.channels], [w, h, 3]);
    assert.ok(a.pixels.equals(b.pixels) && Buffer.from(rgb).equals(b.pixels), 'same pixels');
    assert.ok(repackPng(png).equals(packed), 'same bytes every time');
    assert.ok(repackPng(packed).equals(packed), 'a filtered PNG comes back unchanged');
  }
  assert.ok(repackPng(Buffer.from('not a png')).equals(Buffer.from('not a png')));
});

test('writeFlipbook writes each image once and references it from frames.json and the page', () => {
  const dir = tmp();
  try {
    const { w, h, rgb } = render(), png = base64(encodePngRgb({ width: w, height: h, rgb }));
    const source = encodePngRgb({ width: 8, height: 8, rgb: new Uint8Array(192).fill(90) }), sourcePath = join(dir, 'source.png');
    writeFileSync(sourcePath, source);
    const raster = (address) => ({ address, kind: 'raster', ref: null, sha256: 'a'.repeat(64), data: { width: w, height: h, origin: [0, 0], png } });
    const frames = [
      { title: 'overview', fg: 'fg.s7.toy', parts: [raster('cmp.toy.overview')] },
      { title: 'the same render again', fg: 'fg.s7.toy', parts: [raster('tk.toy#view'), { address: 'tk.toy#n', kind: 'scalar', data: { value: 3, unit: 'px' } }] }
    ];
    const run = join(dir, 'run');
    const r = writeFlipbook(run, 'toy', frames, { title: 'toy', background: { src: 'data:image/png;base64,AAAA', width: 8, height: 8, x: 0, y: 0, path: sourcePath } });
    const files = readdirSync(join(run, 'img')).sort();
    assert.equal(files.length, 2, `one render file + one background file: ${files}`);
    const json = readFileSync(r.frames, 'utf8'), html = readFileSync(r.flipbook, 'utf8');
    assert.ok(!json.includes(png) && !/"png":/.test(json), 'frames.json carries no image bytes');
    assert.ok(!html.includes(png) && !html.includes('data:image'), 'the page carries no image bytes');
    const written = JSON.parse(json);
    const src = written[0].parts[0].data.src;
    assert.match(src, /^img\/[0-9a-f]{16}\.png$/);
    assert.equal(written[1].parts[0].data.src, src, 'the same render is one file');
    assert.ok(html.includes(`src="${src}"`), 'the page shows the file');
    assert.deepEqual(written[1].parts[1], frames[1].parts[1], 'non-image parts are untouched');
    const bg = files.find((f) => `img/${f}` !== src);
    assert.equal(statSync(join(run, 'img', bg)).ino, statSync(sourcePath).ino, 'the background is a hardlink of the source, not a copy');
    assert.ok(decodePng(readFileSync(join(run, src))).pixels.equals(Buffer.from(rgb)), 'the file holds the render, pixel for pixel');
    // the named PNG is the same file under a stable name
    r.images.alias(src, 'toy.overview.png');
    assert.equal(statSync(join(run, 'toy.overview.png')).ino, statSync(join(run, src)).ino);
    // a background given only as a data: URL (the early stages' Part view.source.background) is written once, shared
    const early = join(dir, 'early'), dataUrl = `data:image/png;base64,${base64(source)}`;
    for (const stage of ['s1', 's2']) writeFlipbook(early, stage, frames, { title: stage, background: { src: dataUrl, width: 8, height: 8 } });
    const earlyFiles = readdirSync(join(early, 'img'));
    assert.equal(earlyFiles.length, 2, 'two flipbooks share one background file and one render file');
    assert.ok(earlyFiles.some((f) => readFileSync(join(early, 'img', f)).equals(Buffer.from(source))), 'the background file holds the data URL bytes');
    assert.ok(!readFileSync(join(early, 's2.flipbook.html'), 'utf8').includes('data:image'));
    // on demand: one self-contained page again
    const inline = inlineFlipbook(html, run);
    assert.ok(!/img\/[0-9a-f]{16}\./.test(inline) && inline.includes('data:image/png;base64,'), 'every reference inlined');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the flipbook shows a referenced image file and refuses anything but a relative image path', () => {
  const page = (src) => renderFlipbook([{ title: 'f', parts: [{ address: 'tk.x', kind: 'raster', data: { width: 4, height: 4, src } }] }]);
  assert.ok(page('img/0123456789abcdef.png').includes('src="img/0123456789abcdef.png"'));
  for (const bad of ['../x.png', 'javascript:alert(1)', '/etc/x.png', 'img/x.svg']) assert.ok(!page(bad).includes('<img class="crop"'), bad);
  const images = { png: () => ({ src: 'img/f.png', sha256: 'f'.repeat(64) }) };
  const [f] = externalImages([{ parts: [{ address: 'a', kind: 'raster', data: { png: 'AAAA', width: 1, height: 1 } }, { address: 'b', kind: 'raster', data: { width: 1, height: 1 } }] }], images);
  assert.deepEqual(f.parts.map((p) => p.data), [{ width: 1, height: 1, src: 'img/f.png', pngSha256: 'f'.repeat(64) }, { width: 1, height: 1 }]);
});
