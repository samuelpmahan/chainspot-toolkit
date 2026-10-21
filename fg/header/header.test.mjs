/**
 * The UDisc header reader (fg/queries/header.mjs, fg/header/header.calc.mjs) on training headers: every training image reads
 * exactly; a glyph whose class has no template comes out unread, never guessed; a raster with no header records the condition;
 * a capture's tiles agree; the Part renders; the template asset is what scripts/header-templates.mjs builds.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createPartStore, registerQueries, RENDER_PART } from '../store.mjs';
import { registerHeaderQueries, parseHeader } from '../queries/header.mjs';
import { HEADER_CALCULATION, CAPTURE_HEADER_CALCULATION, HEADER_CHECK_CALCULATION, HEADER_TEMPLATES, rasterOfPng, agreeTiles, headerCheckOf } from './header.calc.mjs';
import { TRAINING } from '../../scripts/header-templates.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const raster = (p) => rasterOfPng(readFileSync(join(ROOT, p)));
function storeOn(image, upperRowsRemoved, templates = HEADER_TEMPLATES) {
  const store = createPartStore({ name: 'header-test' });
  registerHeaderQueries(store, registerQueries, { templates });
  store.constant('fn.test.source', { 'px.source.fullImage': image, 'tk.source.cropReceipt': { upperRowsRemoved } });
  store.register(...HEADER_CALCULATION);
  return store;
}
const parsed = (label) => { const [, holes, par, feet] = /^(\d+) Holes . Par (\d+) . (\d+) ft$/.exec(label); return { holes: +holes, par: +par, feet: +feet }; };

test('every training header reads exactly (S0 removes the header rows: the band lies above row 431)', () => {
  for (const [path, label] of TRAINING) {
    const h = storeOn(raster(path), 431).get('tk.source.header');
    assert.equal(h.found, true, path);
    assert.deepEqual({ holes: h.holes, par: h.par, feet: h.feet }, parsed(label), path);
    assert.equal(h.text, label, path);
    assert.equal(h.unread.length, 0, path);
    assert.ok(h.perGlyph.every(([, score, margin]) => score >= HEADER_TEMPLATES.read.scoreMin && margin >= HEADER_TEMPLATES.read.marginMin), path);
  }
});

test('a glyph with no template is unread, never guessed (8 dropped from the templates; Heritage 18 / 58)', () => {
  const { 8: _drop, ...classes } = HEADER_TEMPLATES.classes;
  const h = storeOn(raster('specimens/dev/HeritagePark-full.png'), 431, { ...HEADER_TEMPLATES, classes }).get('tk.source.header');
  assert.equal(h.text, '1? Holes • Par 5? • 5511 ft');
  assert.equal(h.holes, null); assert.equal(h.par, null); assert.equal(h.feet, 5511);
  assert.equal(h.unread.length, 2);
  assert.ok(h.conditions.some((c) => c.startsWith('unread glyph')));
});

test('no header bar is a recorded condition (S0 removed no header rows; a raster with no navy band)', () => {
  const img = raster('specimens/dev/HeritagePark-full.png');
  const none = storeOn(img, 0).get('tk.source.header');
  assert.equal(none.found, false); assert.match(none.conditions[0], /^no header bar/);
  const above = storeOn(img, 300).get('tk.source.header');   // the band starts at row 315: not in the removed rows
  assert.equal(above.found, false); assert.match(above.conditions[0], /^no header bar/);
});

test('a capture reads every tile and records that they agree; the check against S1 counts badges', () => {
  const store = createPartStore({ name: 'header-capture-test' });
  registerHeaderQueries(store, registerQueries, { templates: HEADER_TEMPLATES });
  const tiles = ['specimens/captures/therec/TheRec-L.png', 'specimens/captures/therec/TheRec-R.png'].map((p) => ({ name: p.split('/').pop(), ...raster(p), crop: { yPx: 431 } }));
  store.constant('fn.test.tiles', { 'tk.source.captureTiles': tiles, 'px.badges': Array.from({ length: 9 }, (_, i) => ({ label: String(i + 1) })) });
  store.register(...CAPTURE_HEADER_CALCULATION);
  store.register(...HEADER_CHECK_CALCULATION);
  const h = store.get('tk.source.header');
  assert.equal(h.source, 'tiles'); assert.equal(h.agree, true); assert.equal(h.tilesRead, 2);
  assert.deepEqual([h.holes, h.par, h.feet], [9, 27, 2175]);
  const c = store.get('tk.s1.udiscHeader');
  assert.equal(c.verdict, 'agree'); assert.equal(c.badges, 9);
  const r = store.call(RENDER_PART, { a: 'tk.source.header' }).value;
  assert.equal(r.kind, 'udiscHeader'); assert.ok(r.parts.some((p) => p.kind === 'raster' && p.data.png));
});

test('tiles that disagree, an unread holes count and a partial view are recorded, not thrown', () => {
  const a = { name: 'a', found: true, holes: 18, par: 54, feet: 3612, text: 'x' }, b = { ...a, name: 'b', feet: 3610, text: 'y' };
  const g = agreeTiles([a, b]);
  assert.equal(g.agree, false); assert.equal(g.fields.feet, null); assert.equal(g.fields.holes, 18); assert.match(g.conditions[0], /tiles disagree on feet/);
  assert.equal(headerCheckOf({ found: true, holes: null }, []).verdict, 'unread');
  assert.equal(headerCheckOf({ found: false }, []).verdict, 'no header');
  assert.equal(headerCheckOf({ found: true, holes: 18 }, Array.from({ length: 4 }, () => ({ label: '1' }))).verdict, 'disagree');
});

test('the grammar: a departure is a condition', () => {
  const g = { glyphs: [{ bbox: [0, 0, 5, 5] }, { bbox: [10, 0, 5, 5] }], tokens: [{ glyphs: [0] }, { glyphs: [1] }] };
  const p = parseHeader(g, [{ char: '1' }, { char: 'H' }]);
  assert.ok(p.conditions.some((c) => c.startsWith('header grammar')));
});
