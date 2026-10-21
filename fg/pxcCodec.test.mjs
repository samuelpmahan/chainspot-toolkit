// The PxC codec packs typed arrays losslessly: every value decodes deep-equal to what was written (class, length,
// element values, shared references), plain node:v8 bytes still decode, and the packed forms are smaller.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import v8 from 'node:v8';
import { serialize, deserialize } from './pxcCodec.mjs';
import { packBits, unpackBits } from '../source/provider/scripts/chainspot-lab/sweep/pxcCodec.mjs';

let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
const N = 70000;   // above the codec's dedupe floor (64 KiB for 1-byte arrays)

const roundTrip = (value) => {
  const bytes = serialize(value), back = deserialize(bytes);
  assert.deepStrictEqual(back, value);
  return { bytes, back };
};

test('bit streams round-trip at every width', () => {
  for (const bits of [0, 1, 2, 3, 4, 5, 6, 7, 8, 16, 32]) {
    for (const n of [0, 1, 7, 8, 9, 1001]) {
      const codes = Array.from({ length: n }, () => Math.floor(rand() * 2 ** bits));
      assert.deepStrictEqual([...unpackBits(packBits(codes, bits), n, bits)], codes, `${bits} bits, ${n} codes`);
    }
  }
});

test('every numeric typed array round-trips exactly, whatever encoding it gets', () => {
  const fills = {
    mask: () => (rand() < 0.1 ? 1 : 0),
    labels: () => Math.floor(rand() * 953),
    small: () => Math.floor(rand() * 7),
    signed: () => Math.floor(rand() * 200) - 100,
    alpha: () => (rand() < 0.02 ? 0 : 255),
    noise: () => Math.floor(rand() * 2 ** 31),
    halves: () => Math.floor(rand() * 766) / 3,
    real: () => rand() * 1000
  };
  for (const Ctor of [Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array])
    for (const [name, fill] of Object.entries(fills)) {
      const a = Ctor.from({ length: N }, fill);
      const { back } = roundTrip({ a });
      assert.equal(back.a.constructor, Ctor, `${Ctor.name} ${name}`);
    }
});

test('0/1 masks bitpack, label planes rightsize, RGBA with opaque alpha drops its constant lane', () => {
  const mask = Uint8Array.from({ length: 8 * N }, () => (rand() < 0.1 ? 1 : 0));
  assert.ok(serialize(mask).length < mask.byteLength / 8 + 64);
  const labels = Int32Array.from({ length: N }, () => Math.floor(rand() * 177));
  assert.ok(serialize(labels).length < N + 64, 'labels <= 176 fit one byte each');
  const wide = Int32Array.from({ length: N }, () => Math.floor(rand() * 953));
  assert.ok(serialize(wide).length < 2 * N + 64, 'labels <= 952 fit a Uint16 lane');
  const rgba = Uint8ClampedArray.from({ length: 4 * N }, (_, i) => (i % 4 === 3 ? 255 : Math.floor(rand() * 256)));
  assert.ok(serialize(rgba).length < 3 * N + 64);
  roundTrip({ mask, labels, wide, rgba });
});

test('a float plane of few distinct values is a palette; NaN and -0 stay raw and exact', () => {
  const lum = Float64Array.from({ length: N }, () => Math.floor(rand() * 766) / 3);
  assert.ok(serialize(lum).length < 2 * N + 766 * 8 + 64);
  const odd = Float64Array.from({ length: N }, () => Math.floor(rand() * 4)); odd[5] = -0; odd[9] = NaN;
  const { back } = roundTrip({ lum, odd });
  assert.ok(Object.is(back.odd[5], -0)); assert.ok(Number.isNaN(back.odd[9]));
});

test('equal and sub-range copies are written once and decode as distinct copies', () => {
  const full = Uint8ClampedArray.from({ length: 4 * N }, () => Math.floor(rand() * 256));
  const cropped = full.slice(4 * 1290, 4 * N - 4 * 1290), twin = full.slice();
  const { bytes, back } = roundTrip({ full, cropped, twin });
  assert.ok(bytes.length < full.byteLength * 1.01, 'cropped and twin cost no pixel bytes');
  assert.notEqual(back.twin, back.full); assert.notEqual(back.twin.buffer, back.full.buffer);
  back.twin[0] ^= 1; assert.notEqual(back.twin[0], back.full[0], 'a decoded copy owns its memory');
});

test('shared references, Maps, Buffers, DataViews and BigInt arrays are as node:v8 leaves them', () => {
  const plane = Int32Array.from({ length: N }, () => Math.floor(rand() * 100));
  const image = { widthPx: 10, rgba: Uint8ClampedArray.from({ length: 4 * N }, () => 255) };
  const value = [['px.image.cropped', image], ['px.course.canonicalPixels', image], ['a', { labels: plane }], ['b', { labels: plane }],
    ['m', new Map([['k', new Set([1, 2])]])], ['buf', Buffer.alloc(N, 3)], ['dv', new DataView(new ArrayBuffer(16))], ['big', new BigInt64Array(N)], ['small', new Uint16Array([1, 2, 3])]];
  const { back } = roundTrip(value);
  assert.equal(back[0][1], back[1][1]); assert.equal(back[2][1].labels, back[3][1].labels);
  assert.ok(Buffer.isBuffer(back[5][1]));
});

test('plain node:v8 bytes decode unchanged; packed bytes refuse plain node:v8', () => {
  const value = [['px.components.masks', { bright: { data: Uint8Array.from({ length: N }, () => (rand() < 0.5 ? 1 : 0)) } }]];
  assert.deepStrictEqual(deserialize(v8.serialize(value)), value);
  assert.throws(() => v8.deserialize(serialize(value)));
});

test('an rgba artifact is written as a view of one RGB base and read back byte for byte', async () => {
  const { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { createFileSink, readArtifactBytes, nodeSha256 } = await import('./node-sink.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'rgba-view-'));
  try {
    const n = 50000, image = Uint8Array.from({ length: 4 * n }, (_, i) => (i % 4 === 3 ? 255 : Math.floor(rand() * 256)));
    const masked = (p) => { const b = image.slice(); for (let i = 0; i < n; i++) if (rand() < p) b[4 * i + 3] = 0; return b; };
    const a = masked(0.01), b = masked(0.2), sink = createFileSink(dir);
    const ra = sink.putArtifact('rgba', 's1.a', a, { width: n, height: 1 }, { path: 's1/a.rgba.bin' });
    const rb = sink.putArtifact('rgba', 's2.b', b, { width: n, height: 1 }, { path: 's2/b.rgba.bin' });
    assert.equal(ra.sha256, nodeSha256(a)); assert.equal(ra.bytes, a.length); assert.equal(ra.uri, 's1/a.rgba.bin');
    assert.deepStrictEqual(sink.readArtifact('s1.a'), a); assert.deepStrictEqual(readArtifactBytes(join(dir, rb.uri)), b);
    assert.equal(readdirSync(join(dir, 'img')).length, 1, 'both views share one RGB base');
    assert.ok(statSync(join(dir, 's1/a.rgba.bin')).size < n / 8 + 512, 'a view costs its alpha plane in bits');
    writeFileSync(join(dir, 'old.rgba.bin'), a);
    assert.deepStrictEqual(readArtifactBytes(join(dir, 'old.rgba.bin')), a, 'an old raw .rgba.bin reads unchanged');
    assert.equal(readFileSync(join(dir, 'old.rgba.bin')).length, a.length);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
