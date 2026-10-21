/**
 * pxcCodec: node:v8 serialize / deserialize with typed arrays packed on write and unpacked on read.
 *
 * Sam, 2026-10-21: "Bitpack where possible for cheap compression" and "Rightsize your allocations". Backings are the
 * store's business, so the packing lives here, in the serializer: every reader gets back a typed array of the same
 * class, length and element values as was written (fresh, owned memory), and every other value (objects, Maps, shared
 * references, -0, holes) goes through V8 exactly as node:v8 does it. One codec serves the PxC snapshot
 * (pxcSnapshot.ts capture/restore, s3.pxc.bin), the toolkit's CAS and the rgba artifact views (fg/node-sink.mjs).
 *
 * The format is node:v8's own: typed arrays are V8 host objects, which Node writes as (type index, byteLength, bytes).
 * This codec writes the same record for anything it does not pack, and two records of its own (tags >= 64):
 *
 *   PACKED  an integer, float or byte array re-encoded losslessly by the smallest of
 *           BITS     value - min in the fewest bits that hold max - min, bit-packed up to 8 bits, else a Uint16 or
 *                    Uint32 lane (a 0/1 mask: 1 bit; a label plane of 177 labels: 8 bits, of 953 labels: 16 bits)
 *           PALETTE  a table of the distinct values (ascending) + indices in the fewest bits
 *                    (a {0,255} alpha plane: 1 bit; a luminance plane of 766 distinct floats: 16 bits)
 *           LANE     a byte array whose every 4th byte is one constant (RGBA with opaque alpha): the other 3 lanes
 *           and only when that saves at least 10% of the bytes;
 *   REF     the bytes of a typed array already written in this value (equal, or a contiguous sub-range of it: a
 *           row-cropped copy of an image), decoded as a fresh copy (distinct objects stay distinct).
 *
 * Old files (plain node:v8) decode unchanged, since every Node record is read as Node reads it. A file written here
 * and read with plain node:v8 deserialize throws (unknown host object), never returns wrong values.
 */
import v8 from 'node:v8';

// lib/v8.js arrayBufferViewTypes, by Node's host-object index (10 is Buffer)
const TYPES = [Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, DataView, Buffer, BigInt64Array, BigUint64Array];
const NUMERIC = 9;            // indices 0..8 are the numeric typed arrays this codec packs and dedupes
const TAG_PACKED = 64, TAG_REF = 65;
const BITS = 1, PALETTE = 2, LANE = 3;
export const PACK_MIN_BYTES = 4096;     // smaller arrays are written as Node writes them
export const REF_MIN_BYTES = 65536;     // arrays this large are remembered as dedupe targets
const MAX_PALETTE = 65536;
const SAVING = 0.9;                     // an encoding must be <= 90% of the raw bytes to be used

const typeIndex = (view) => {
  if (Buffer.isBuffer(view)) return 10;
  for (let i = 0; i < TYPES.length; i++) if (view.constructor === TYPES[i]) return i;
  return -1;
};
const bytesOf = (view) => Buffer.from(view.buffer, view.byteOffset, view.byteLength);
const exactBits = (range) => (range === 0 ? 0 : 32 - Math.clz32(range));
/** bit-packed at or below 8 bits; above that, the narrowest whole lane (Uint16 if it fits, else Uint32), which reads fast */
const bitsFor = (range) => { const b = exactBits(range); return b <= 8 ? b : b <= 16 ? 16 : 32; };
const packedBytes = (n, bits) => Math.ceil((n * bits) / 8);

/** codes (unsigned integers, each < 2^bits) -> LSB-first bit stream */
export function packBits(codes, bits) {
  const n = codes.length, out = new Uint8Array(packedBytes(n, bits));
  if (bits === 0) return out;
  if (bits === 8) { out.set(codes); return out; }
  if (bits === 16) { out.set(new Uint8Array(Uint16Array.from(codes).buffer)); return out; }
  if (bits === 32) { out.set(new Uint8Array(Uint32Array.from(codes).buffer)); return out; }
  if (bits === 1) {
    const whole = n & ~7;
    for (let i = 0, o = 0; i < whole; i += 8, o++)
      out[o] = codes[i] | (codes[i + 1] << 1) | (codes[i + 2] << 2) | (codes[i + 3] << 3) | (codes[i + 4] << 4) | (codes[i + 5] << 5) | (codes[i + 6] << 6) | (codes[i + 7] << 7);
    for (let i = whole; i < n; i++) out[i >> 3] |= codes[i] << (i & 7);
    return out;
  }
  let acc = 0, nb = 0, o = 0;
  if (bits <= 24) {
    for (let i = 0; i < n; i++) {
      acc |= codes[i] << nb; nb += bits;
      while (nb >= 8) { out[o++] = acc & 255; acc >>>= 8; nb -= 8; }
    }
  } else {
    for (let i = 0; i < n; i++) {
      acc += codes[i] * 2 ** nb; nb += bits;
      while (nb >= 8) { out[o++] = acc % 256; acc = Math.floor(acc / 256); nb -= 8; }
    }
  }
  if (nb > 0) out[o] = acc & 255;
  return out;
}

/** LSB-first bit stream -> n codes (a Uint8Array, Uint16Array or Uint32Array) */
export function unpackBits(src, n, bits) {
  if (bits === 8) return Uint8Array.from(src.subarray(0, n));
  if (bits === 16) { const aligned = new Uint8Array(2 * n); aligned.set(src.subarray(0, 2 * n)); return new Uint16Array(aligned.buffer); }
  if (bits === 32) { const aligned = new Uint8Array(4 * n); aligned.set(src.subarray(0, 4 * n)); return new Uint32Array(aligned.buffer); }
  if (bits <= 8) {
    const codes = new Uint8Array(n);
    if (bits === 0) return codes;
    if (bits === 1) {
      const whole = n & ~7;
      for (let i = 0, p = 0; i < whole; i += 8, p++) {
        const b = src[p];
        codes[i] = b & 1; codes[i + 1] = (b >> 1) & 1; codes[i + 2] = (b >> 2) & 1; codes[i + 3] = (b >> 3) & 1;
        codes[i + 4] = (b >> 4) & 1; codes[i + 5] = (b >> 5) & 1; codes[i + 6] = (b >> 6) & 1; codes[i + 7] = b >> 7;
      }
      for (let i = whole; i < n; i++) codes[i] = (src[i >> 3] >> (i & 7)) & 1;
      return codes;
    }
    return unpackGeneral(src, n, bits, codes);
  }
  return unpackGeneral(src, n, bits, bits <= 16 ? new Uint16Array(n) : new Uint32Array(n));
}

function unpackGeneral(src, n, bits, codes) {
  let acc = 0, nb = 0, p = 0;
  if (bits <= 24) {
    const mask = (1 << bits) - 1;
    for (let i = 0; i < n; i++) {
      while (nb < bits) { acc |= src[p++] << nb; nb += 8; }
      codes[i] = acc & mask; acc >>>= bits; nb -= bits;
    }
  } else {
    const span = 2 ** bits;
    for (let i = 0; i < n; i++) {
      while (nb < bits) { acc += src[p++] * 2 ** nb; nb += 8; }
      codes[i] = acc % span; acc = Math.floor(acc / span); nb -= bits;
    }
  }
  return codes;
}

const codeArray = (n, bits) => (bits <= 8 ? new Uint8Array(n) : bits <= 16 ? new Uint16Array(n) : new Uint32Array(n));

/**
 * The cheapest lossless encoding of a numeric typed array, or null (write it raw). Palette values are ascending,
 * so the encoding is a function of the values alone.
 */
function choose(view) {
  const n = view.length, raw = view.byteLength, per = view.BYTES_PER_ELEMENT, isFloat = view instanceof Float32Array || view instanceof Float64Array;
  if (n === 0) return null;
  let min = Infinity, max = -Infinity, ints = true, values = null;
  if (per === 1) {   // one histogram pass gives min, max and the palette
    const seen = new Uint8Array(256);
    for (let i = 0; i < n; i++) seen[view[i] & 255] = 1;
    values = [];
    for (let v = 0; v < 256; v++) if (seen[v]) values.push(v);
    min = values[0]; max = values.at(-1);
    if (view instanceof Int8Array) { values = values.map((v) => (v << 24) >> 24).sort((a, b) => a - b); min = values[0]; max = values.at(-1); }
  } else {
    for (let i = 0; i < n; i++) {
      const x = view[i];
      if (x < min) min = x;
      if (x > max) max = x;
      if (isFloat && (x !== x || (x === 0 && 1 / x < 0))) return null;   // NaN or -0: a palette keys by value, so keep raw
      if (isFloat && ints && !Number.isInteger(x)) ints = false;
    }
  }
  let best = null, size = raw * SAVING;
  const range = max - min;
  if (ints && range < 2 ** 32) {
    const bits = bitsFor(range), s = packedBytes(n, bits);
    if (s <= size) { best = { mode: BITS, min, bits }; size = s; }
  }
  // a palette only wins when its index is narrower than the value range
  if (!values && (!best || best.bits > 1)) {
    const cap = !best ? MAX_PALETTE : best.bits > 16 ? MAX_PALETTE : best.bits > 8 ? 256 : 2 ** (best.bits - 1);
    if (ints && range < 2 ** 24) {
      const seen = new Uint8Array(range + 1);
      let distinct = 0;
      for (let i = 0; i < n && distinct <= cap; i++) { const k = view[i] - min; if (!seen[k]) { seen[k] = 1; distinct++; } }
      if (distinct <= cap) { values = []; for (let k = 0; k <= range; k++) if (seen[k]) values.push(min + k); }
    } else {
      const set = new Set();
      for (let i = 0; i < n && set.size <= cap; i++) set.add(view[i]);
      if (set.size <= cap) values = [...set].sort((a, b) => a - b);
    }
  }
  if (values) {
    const bits = bitsFor(values.length - 1), s = values.length * per + packedBytes(n, bits);
    if (s <= size) { best = { mode: PALETTE, values, bits }; size = s; }
  }
  if (per === 1 && n % 4 === 0 && (raw * 3) / 4 <= size) {
    const v = view[3];
    let constant = true;
    for (let i = 7; i < n; i += 4) if (view[i] !== v) { constant = false; break; }
    if (constant) best = { mode: LANE, value: v };
  }
  return best;
}

class PackSerializer extends v8.DefaultSerializer {
  constructor() { super(); this.written = []; }
  _writeHostObject(view) {
    const t = typeIndex(view);
    if (t < 0 || t >= NUMERIC || view.byteLength < PACK_MIN_BYTES) return super._writeHostObject(view);
    const bytes = bytesOf(view);
    if (view.byteLength >= REF_MIN_BYTES) {
      for (let r = 0; r < this.written.length; r++) {
        const at = subrangeAt(this.written[r], bytes);
        if (at >= 0) {
          this.writeUint32(TAG_REF); this.writeUint32(r); this.writeUint32(t); this.writeUint32(at); this.writeUint32(view.length);
          return;
        }
      }
      this.written.push(bytes);
    }
    const enc = choose(view);
    if (!enc) return super._writeHostObject(view);
    const n = view.length;
    this.writeUint32(TAG_PACKED); this.writeUint32(t); this.writeUint32(n); this.writeUint32(enc.mode);
    if (enc.mode === BITS) {
      const codes = codeArray(n, enc.bits);
      if (enc.min === 0) codes.set(view);
      else for (let i = 0; i < n; i++) codes[i] = view[i] - enc.min;
      this.writeDouble(enc.min); this.writeUint32(enc.bits); this.writeRawBytes(packBits(codes, enc.bits));
    } else if (enc.mode === PALETTE) {
      const codes = codeArray(n, enc.bits), table = new TYPES[t](enc.values);
      if (view.BYTES_PER_ELEMENT === 1) {
        const index = new Uint8Array(256);
        enc.values.forEach((v, k) => { index[v & 255] = k; });
        for (let i = 0; i < n; i++) codes[i] = index[view[i] & 255];
      } else {
        const index = new Map(enc.values.map((v, k) => [v, k]));
        for (let i = 0; i < n; i++) codes[i] = index.get(view[i]);
      }
      this.writeUint32(table.length); this.writeRawBytes(bytesOf(table)); this.writeUint32(enc.bits); this.writeRawBytes(packBits(codes, enc.bits));
    } else {
      const rest = new Uint8Array((n / 4) * 3);
      for (let i = 0, j = 0; i < n; i += 4, j += 3) { rest[j] = view[i]; rest[j + 1] = view[i + 1]; rest[j + 2] = view[i + 2]; }
      this.writeUint32(enc.value); this.writeRawBytes(rest);
    }
  }
}

/** byte offset at which needle occurs whole inside hay (both Buffers), or -1 */
function subrangeAt(hay, needle) {
  if (hay.length < needle.length) return -1;
  if (hay.length === needle.length) return hay.equals(needle) ? 0 : -1;
  const probe = needle.subarray(0, Math.min(4096, needle.length));
  for (let i = hay.indexOf(probe), tries = 0; i >= 0 && i + needle.length <= hay.length && tries < 16; i = hay.indexOf(probe, i + 1), tries++)
    if (hay.compare(needle, 0, needle.length, i, i + needle.length) === 0) return i;
  return -1;
}

class PackDeserializer extends v8.DefaultDeserializer {
  constructor(buffer) { super(buffer); this.read = []; }
  raw(n) { const off = this._readRawBytes(n); return new Uint8Array(this.buffer.buffer, this.buffer.byteOffset + off, n); }
  _readHostObject() {
    const tag = this.readUint32();
    if (tag === TAG_REF) {
      const r = this.readUint32(), Ctor = TYPES[this.readUint32()], at = this.readUint32(), n = this.readUint32();
      const out = new Ctor(n), src = this.read[r];
      new Uint8Array(out.buffer).set(src.subarray(at, at + out.byteLength));
      return out;
    }
    if (tag === TAG_PACKED) {
      const t = this.readUint32(), Ctor = TYPES[t], n = this.readUint32(), mode = this.readUint32(), out = new Ctor(n);
      if (mode === BITS) {
        const min = this.readDouble(), bits = this.readUint32(), codes = unpackBits(this.raw(packedBytes(n, bits)), n, bits);
        if (min === 0) out.set(codes);
        else for (let i = 0; i < n; i++) out[i] = min + codes[i];
      } else if (mode === PALETTE) {
        const k = this.readUint32(), table = new Ctor(k);
        new Uint8Array(table.buffer).set(this.raw(k * Ctor.BYTES_PER_ELEMENT));
        const bits = this.readUint32(), codes = unpackBits(this.raw(packedBytes(n, bits)), n, bits);
        for (let i = 0; i < n; i++) out[i] = table[codes[i]];
      } else if (mode === LANE) {
        const value = this.readUint32(), rest = this.raw((n / 4) * 3);
        for (let i = 0, j = 0; i < n; i += 4, j += 3) { out[i] = rest[j]; out[i + 1] = rest[j + 1]; out[i + 2] = rest[j + 2]; out[i + 3] = value; }
      } else throw new Error(`pxcCodec: unknown packed mode ${mode}`);
      if (out.byteLength >= REF_MIN_BYTES) this.read.push(new Uint8Array(out.buffer, out.byteOffset, out.byteLength));
      return out;
    }
    // Node's own record, read exactly as lib/v8.js DefaultDeserializer reads it
    const Ctor = TYPES[tag];
    if (!Ctor) throw new Error(`pxcCodec: unknown host object type ${tag}`);
    const byteLength = this.readUint32(), byteOffset = this._readRawBytes(byteLength);
    const per = Ctor.BYTES_PER_ELEMENT || 1, offset = this.buffer.byteOffset + byteOffset;
    let out;
    if (offset % per === 0) out = tag === 10 ? Buffer.from(this.buffer.buffer, offset, byteLength) : new Ctor(this.buffer.buffer, offset, byteLength / per);
    else {
      const copy = Buffer.allocUnsafe(byteLength);
      copy.set(new Uint8Array(this.buffer.buffer, offset, byteLength));
      out = tag === 10 ? copy : new Ctor(copy.buffer, copy.byteOffset, byteLength / per);
    }
    if (tag < NUMERIC && byteLength >= REF_MIN_BYTES) this.read.push(new Uint8Array(out.buffer, out.byteOffset, out.byteLength));
    return out;
  }
}

/** node:v8 serialize, with typed arrays packed */
export function serialize(value) {
  const s = new PackSerializer();
  s.writeHeader();
  s.writeValue(value);
  return s.releaseBuffer();
}

/** node:v8 deserialize of a packed or plain buffer */
export function deserialize(bytes) {
  const d = new PackDeserializer(bytes);
  d.readHeader();
  return d.readValue();
}
