import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeValue, decodeValue, encodeBytes, decodeBytes, ValueCodecError } from './codec.mjs';

// Break caught: JSON/null coercion or an unescaped native tag destroys value identity.
test('numbers, null and native tag-looking data retain distinct identities', () => {
  const numbers = [0, -0, 0.1, Number.MIN_VALUE, Number.MAX_VALUE, NaN, Infinity, -Infinity];
  const data = { numbers, nil: null, looksLikeTag: ['number', 'nan'], tagObject: { numberKind: 'nonfinite', value: 'NaN' } };
  const decoded = decodeBytes(encodeBytes(data));
  numbers.forEach((n, i) => assert.ok(Object.is(n, decoded.numbers[i])));
  assert.equal(decoded.nil, null);
  assert.deepEqual(decoded.looksLikeTag, ['number', 'nan']);
  assert.deepEqual(decoded.tagObject, data.tagObject);
  assert.deepEqual(encodeValue(null), ['null']);
  assert.deepEqual(encodeValue(-0), ['number', 'negative-zero']);
  assert.deepEqual(encodeValue(NaN), ['number', 'nan']);
});

// Break caught: typed corridor data flattens to ordinary arrays or aliases caller bytes.
test('corridor-shaped Uint8 values retain constructor, bytes and detached storage', () => {
  const data = { corridor: { rgbLevel: new Uint8Array([0, 145, 255]), hiddenCenter: new Uint8Array([0, 1]) }, leftLum: [NaN, 45], okLeft: [0, 1] };
  const decoded = decodeBytes(encodeBytes(data));
  assert.equal(Object.getPrototypeOf(decoded.corridor.rgbLevel), Uint8Array.prototype);
  assert.deepEqual([...decoded.corridor.rgbLevel], [0, 145, 255]);
  assert.deepEqual([...decoded.corridor.hiddenCenter], [0, 1]);
  assert.ok(Number.isNaN(decoded.leftLum[0]));
  decoded.corridor.rgbLevel[0] = 99;
  assert.equal(data.corridor.rgbLevel[0], 0);
});

test('null prototype, ordered keys and own __proto__ survive safely', () => {
  const data = Object.create(null);
  Object.defineProperty(data, '__proto__', { value: ['null'], enumerable: true });
  data.z = false; data.a = 'last';
  const out = decodeBytes(encodeBytes(data));
  assert.equal(Object.getPrototypeOf(out), null);
  assert.deepEqual(Object.keys(out), ['__proto__', 'z', 'a']);
  assert.deepEqual(out.__proto__, ['null']);
  assert.equal(Object.prototype.polluted, undefined);
});

test('wire is complete tagged UTF8 JSON followed by one LF', () => {
  assert.equal(new TextDecoder().decode(encodeBytes({ a: true })), '["object","plain",[["a",["boolean",true]]]]\n');
});

const badValues = [undefined, 1n, () => {}, Symbol('x'), new Map(), new Set(), new Date(), new Error('x'), new ArrayBuffer(1), new DataView(new ArrayBuffer(1)), new Float64Array([1]), Buffer.from([1]), Object.create({ inherited: 1 }), [, 1], Object.assign([1], { extra: 1 }), { explicit: undefined }];
badValues.forEach((value, i) => test(`unsupported input ${i} is refused instead of normalized`, () => assert.throws(() => encodeValue(value), ValueCodecError)));

test('accessors are refused without running them', () => {
  let reads = 0;
  const v = Object.defineProperty({}, 'x', { enumerable: true, get() { reads++; return 1; } });
  assert.throws(() => encodeValue(v), ValueCodecError);
  assert.equal(reads, 0);
});

test('nonenumerable/symbol/typed extras and cycles are refused', () => {
  const hidden = Object.defineProperty({}, 'x', { value: 1 });
  const symbol = { [Symbol('x')]: 1 };
  const typed = Object.assign(new Uint8Array([1]), { extra: true });
  const cycle = {}; cycle.self = cycle;
  for (const value of [hidden, symbol, typed, cycle]) assert.throws(() => encodeValue(value), ValueCodecError);
});

const malformed = [['bogus'], ['null', 0], ['number', 'finite', -0], ['number', 'finite', Infinity], ['boolean', 1], ['typed', 'Float64Array', 1, [1]], ['typed', 'Uint8Array', 2, [1]], ['typed', 'Uint8Array', 1, [256]], ['object', 'plain', [['x', ['null']], ['x', ['null']]]], ['array', [, ['null']]]];
malformed.forEach((node, i) => test(`malformed tag ${i} is rejected`, () => assert.throws(() => decodeValue(node), ValueCodecError)));

test('depth, tagged node, typed byte and encoded file budgets fail closed', () => {
  assert.throws(() => encodeValue([[1]], { maxDepth: 1 }), ValueCodecError);
  assert.throws(() => encodeValue([1, 2], { maxNodes: 2 }), ValueCodecError);
  assert.throws(() => encodeValue(new Uint8Array([1, 2]), { maxTypedBytes: 1 }), ValueCodecError);
  assert.throws(() => encodeBytes('too long', { maxBytes: 4 }), ValueCodecError);
  assert.throws(() => decodeBytes(new TextEncoder().encode('["string","too long"]\n'), { maxBytes: 4 }), ValueCodecError);
  assert.throws(() => decodeBytes(new Uint8Array([0xff])), ValueCodecError);
});
