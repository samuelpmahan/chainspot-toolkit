import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, RENDER_PART } from '../store.mjs';
import { capture } from './capture.calc.mjs';

test('fn.tk.capture: produces tk.capture, emits its measures, renders', () => {
  const img = { widthPx: 4, heightPx: 2, rgba: new Uint8Array(32) };
  const store = createPartStore({ base: { has: (x) => x === 'px.image.cropped', get: () => img } });
  store.register(...capture);
  assert.ok(store.get('tk.capture'));
  assert.ok(store.calls().find((e) => e.calculation === 'fn.tk.capture').emits, 'emits recorded by the store');
  assert.notEqual(store.call(RENDER_PART, { a: 'tk.capture' }).value.kind, 'unrenderable');
});
