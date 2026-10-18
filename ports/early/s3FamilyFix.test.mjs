import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseAnchors } from './s3FamilyFix.mjs';

const c = (structural, bandFill, framed = true, baselineMember = false) => ({ structural, bandFill, framed, baselineMember });

test('chooseAnchors: the first non-empty rung wins and says which; nothing ever throws', () => {
  const full = chooseAnchors([c(true, 0.8), c(true, 0.82), c(true, 0.3), c(false, 0.5)]);
  assert.equal(full.anchors.length, 2); assert.match(full.source, /local band fill/);
  assert.match(chooseAnchors([c(true, 0.8), c(true, 0.3)]).source, /structural tests only/);   // median 0.55: both outside 0.75-1.3 x
  assert.match(chooseAnchors([c(false, 0.5, true, true), c(false, 0.4)]).source, /baseline S3 family members/);
  assert.match(chooseAnchors([c(false, 0.5), c(false, null, false)]).source, /any framed candidate/);
  const none = chooseAnchors([c(false, null, false)]);
  assert.deepEqual(none.anchors, []); assert.match(none.source, /^none/);
  assert.deepEqual(chooseAnchors([]).anchors, []);
});
