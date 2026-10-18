/** Collision-safe value-tree codec; no CV, store, filesystem or network imports. */
export class ValueCodecError extends Error {
  constructor(message) { super(message); this.name = 'ValueCodecError'; }
}

const HARD = Object.freeze({ maxDepth: 32, maxNodes: 500000, maxTypedBytes: 1000000, maxBytes: 33554432 });
const fail = message => { throw new ValueCodecError(message); };
const own = (v, k) => Object.hasOwn(v, k);
const data = d => d && own(d, 'value');
const ordinary = v => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;

function limits(options = {}) {
  if (!ordinary(options) || Reflect.ownKeys(options).some(k => typeof k !== 'string' || !own(HARD, k))) fail('unsupported codec limits');
  const out = { ...HARD };
  for (const k of Object.keys(options)) {
    const d = Object.getOwnPropertyDescriptor(options, k);
    if (!data(d) || !Number.isSafeInteger(d.value) || d.value < 1 || d.value > HARD[k]) fail(`invalid ${k} limit`);
    out[k] = d.value;
  }
  return out;
}

function dense(v) {
  if (!Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype) fail('ordinary dense array required');
  const keys = Reflect.ownKeys(v);
  if (keys.length !== v.length + 1 || !keys.includes('length')) fail('array has holes or extra keys');
  for (let i = 0; i < v.length; i++) {
    const d = Object.getOwnPropertyDescriptor(v, String(i));
    if (!data(d) || !d.enumerable) fail('array has holes or accessors');
  }
  return v;
}

function objectEntries(v) {
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) fail('unsupported object prototype');
  const keys = Reflect.ownKeys(v);
  const pairs = keys.map(k => {
    if (typeof k !== 'string') fail('symbol keys are unsupported');
    const d = Object.getOwnPropertyDescriptor(v, k);
    if (!data(d) || !d.enumerable) fail('object properties must be enumerable data');
    return [k, d.value];
  });
  return [proto === null ? 'null-prototype' : 'plain', pairs];
}

function exactUint8(v) {
  if (!v || typeof v !== 'object' || Object.getPrototypeOf(v) !== Uint8Array.prototype) fail('exact Uint8Array required');
  const length = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'length').get.call(v);
  const keys = Reflect.ownKeys(v);
  if (keys.length !== length || keys.some((k, i) => k !== String(i))) fail('typed array has extra keys');
  return v;
}

function budget(opts) {
  let nodes = 0, typed = 0;
  return {
    node(depth) { if (depth > opts.maxDepth || ++nodes > opts.maxNodes) fail('codec depth/node budget exceeded'); },
    bytes(count) {
      if (!Number.isSafeInteger(count) || count < 0 || count > opts.maxTypedBytes - typed) fail('codec typed-byte budget exceeded');
      typed += count;
    }
  };
}

/** Encode every value, including tag-looking native arrays/objects, without normalization. */
export function encodeValue(value, options = {}) {
  const opts = limits(options), count = budget(opts), ancestors = new Set();
  const visit = (v, depth) => {
    count.node(depth);
    if (v === null) return ['null'];
    if (typeof v === 'boolean') return ['boolean', v];
    if (typeof v === 'string') return ['string', v];
    if (typeof v === 'number') {
      if (Object.is(v, -0)) return ['number', 'negative-zero'];
      if (Number.isNaN(v)) return ['number', 'nan'];
      if (v === Infinity) return ['number', 'positive-infinity'];
      if (v === -Infinity) return ['number', 'negative-infinity'];
      return ['number', 'finite', v];
    }
    if (typeof v !== 'object') fail(`unsupported ${typeof v}`);
    if (ancestors.has(v)) fail('cycles are unsupported');
    ancestors.add(v);
    try {
      if (ArrayBuffer.isView(v)) {
        const bytes = exactUint8(v);
        count.bytes(bytes.length);
        return ['typed', 'Uint8Array', bytes.length, Array.from(bytes)];
      }
      if (Array.isArray(v)) return ['array', dense(v).map(x => visit(x, depth + 1))];
      const [kind, entries] = objectEntries(v);
      return ['object', kind, entries.map(([k, x]) => [k, visit(x, depth + 1)])];
    } finally { ancestors.delete(v); }
  };
  return visit(value, 0);
}

/** Decode only the closed wire grammar; define __proto__ as an own data property. */
export function decodeValue(encoded, options = {}) {
  const opts = limits(options), count = budget(opts), ancestors = new Set();
  const visit = (node, depth) => {
    count.node(depth);
    dense(node);
    if (ancestors.has(node)) fail('encoded cycles are unsupported');
    ancestors.add(node);
    try {
      const [tag, payload] = node;
      if (tag === 'null' && node.length === 1) return null;
      if (tag === 'boolean' && node.length === 2 && typeof payload === 'boolean') return payload;
      if (tag === 'string' && node.length === 2 && typeof payload === 'string') return payload;
      if (tag === 'number') {
        if (node.length === 3 && payload === 'finite' && typeof node[2] === 'number' && Number.isFinite(node[2]) && !Object.is(node[2], -0)) return node[2];
        if (node.length === 2) {
          if (payload === 'negative-zero') return -0;
          if (payload === 'nan') return NaN;
          if (payload === 'positive-infinity') return Infinity;
          if (payload === 'negative-infinity') return -Infinity;
        }
        fail('malformed numeric tag');
      }
      if (tag === 'array' && node.length === 2) return dense(payload).map(v => visit(v, depth + 1));
      if (tag === 'object' && node.length === 3 && ['plain', 'null-prototype'].includes(payload)) {
        const pairs = dense(node[2]), seen = new Set(), out = payload === 'plain' ? {} : Object.create(null);
        for (const pair of pairs) {
          dense(pair);
          if (pair.length !== 2 || typeof pair[0] !== 'string' || seen.has(pair[0])) fail('malformed/duplicate object pair');
          seen.add(pair[0]);
          Object.defineProperty(out, pair[0], { value: visit(pair[1], depth + 1), enumerable: true, configurable: true, writable: true });
        }
        return out;
      }
      if (tag === 'typed' && node.length === 4 && payload === 'Uint8Array') {
        const length = node[2], values = dense(node[3]);
        count.bytes(length);
        if (values.length !== length || values.some(x => !Number.isInteger(x) || x < 0 || x > 255 || Object.is(x, -0))) fail('invalid typed-array length/bytes');
        return Uint8Array.from(values);
      }
      fail('unknown tag, constructor, payload or arity');
    } finally { ancestors.delete(node); }
  };
  return visit(encoded, 0);
}

/** Exact UTF8 JSON.stringify(E(root)) + LF. Caps may be lowered, never raised. */
export function encodeBytes(value, options = {}) {
  const opts = limits(options), bytes = new TextEncoder().encode(`${JSON.stringify(encodeValue(value, opts))}\n`);
  if (bytes.length > opts.maxBytes) fail('encoded file byte budget exceeded');
  return bytes;
}

export function decodeBytes(bytes, options = {}) {
  const opts = limits(options);
  exactUint8(bytes);
  if (bytes.length > opts.maxBytes) fail('encoded file byte budget exceeded');
  let node;
  try { node = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch (error) { fail(`invalid UTF8/JSON: ${error.message}`); }
  return decodeValue(node, opts);
}
