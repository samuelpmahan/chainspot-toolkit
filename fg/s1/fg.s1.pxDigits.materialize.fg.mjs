/**
 * fg.s1.pxDigits.materialize (stages/s1.json): the G1 digit evidence behind
 * every badge label leaves the run as an inspectable artifact serialized
 * from the live board reads, witnessed by an independent re-execution of
 * the provider's public detectBadges seam over the same cropped image (the
 * pinned provider offers no digit materializer; this re-execution is the
 * second witness, never a fake one).
 *
 * Counter ownership (Sam's corrected spec, ownership by enclosure): a dark
 * component enclosed by one digit's strokes, unowned by Badge.findPx and
 * inside the badge's mute set, is attributed to that digit as a named
 * counter part; the move from mute to digit-owned is receipted as a spec
 * delta with exact per-badge pixel accounting, and its subtraction raster
 * recounts exactly the counter set (conserved:raster). The golden counter
 * table is a specimen expectation, judged and recorded, never gated.
 *
 * The certified Part px.badges.digits is not on the board: this FG derives
 * it from the board reads ('badges'). Artifacts artifacts/s1/px.digits.json,
 * counters.rgba.bin (bytes unchanged); record stages[S1].digitsMaterialization
 * / materializations.S1Digits.
 */
import { guarantee, pipe, read, step } from '../compose.mjs';
import { conserved, framed, judged, materialized, published, unitful, witnessed } from '../mixins.mjs';
import { sha256Hex } from '../canon.mjs';
import { unionOf } from '../legacy.mjs';

const ID = 'fg.s1.pxDigits.materialize';
const PART = 'px.badges.digits';
const PRODUCED_BY = 'fn.readCourseBadges (g1.digits)';
const SEAM = 'detectors/threeFactor/measure.detectBadges(localImage, 0)';
const DETECT = 'fn.provider.S1.detectBadges';
const READS = ['badges', 'px.badges', 'px.components', 'localImage', 'px.image.cropped'];
// Established golden-specimen counter table (Sam's identification,
// 2026-10-16): the enclosed counters of the loop digits.
const EXPECTED_COUNTERS = { '4': [19], '14': [19], '6': [30], '9': [30], '16': [29], '8': [26, 18], '18': [26, 18], '10': [78] };
const UNITS = {
  expected: 'px (counter component areas, per badge label)', observed: 'px (counter component areas, per badge label)',
  confidence: 'fraction (reader confidence)', margins: 'classifier score difference (top - runner-up; dimensionless)', componentLabel: 'component label id'
};

const serializeDigits = (read) => ({
  detId: read.detId, label: read.label, rawLabel: read.rawLabel, bestLabel: read.bestLabel,
  digitCount: read.digitCount, confidence: read.confidence, confidenceFloor: read.confidenceFloor,
  abstentionReason: read.abstentionReason, conflictWith: read.conflictWith ?? [],
  labelCandidates: (read.labelCandidates ?? []).map((c) => ({ label: c.label, confidence: c.confidence })),
  notes: read.notes ?? [],
  digits: (read.digits ?? []).map((d) => ({
    bbox: [...d.bbox], method: d.method, predicted: d.predicted, runnerUp: d.runnerUp,
    scores: [...d.scores], margin: d.margin,
    normalizedSha256: sha256Hex(d.normalized),
    normalized: [...d.normalized]
  }))
});
const canonicalCounterTable = (table) => Object.fromEntries(
  Object.entries(table).map(([k, v]) => [k, [...v].sort((a, b) => b - a)]).sort(([a], [b]) => Number(a) - Number(b)));

const serialize = step('serialize the digit evidence', (env, s) => {
  const reads = s.parts.badges, badges = s.parts['px.badges'];
  if (!Array.isArray(reads) || reads.length !== badges.length) env.fail(`board reads (${reads?.length}) disagree with px.badges (${badges.length})`);
  const serializedReads = reads.map(serializeDigits);
  for (let i = 0; i < badges.length; i++) {
    const rb = reads[i].bbox, bb = badges[i].bbox;
    if (!rb || !bb || rb.some((v, k) => v !== bb[k])) env.fail(`read ${i} bbox disagrees with badge ${i} bbox (reads and badges out of alignment)`);
    for (const d of serializedReads[i].digits) {
      if (d.normalized.length !== 768) env.fail(`badge ${i} digit has normalized length ${d.normalized.length}, expected 768 (24x32)`);
      if (d.scores.length !== 10) env.fail(`badge ${i} digit has ${d.scores.length} class scores, expected 10`);
    }
  }
  return { serializedReads };
});

// The provider's public digit seam re-executed over the same cropped image the gateway consumed.
const witness = witnessed.provider(DETECT, {
  name: 'serializerMatchesWitness', as: 'detectBadges',
  run: (call, s) => {
    const witnessDigits = call().map(serializeDigits);
    if (JSON.stringify(s.serializedReads) === JSON.stringify(witnessDigits)) return true;
    let at = -1;
    for (let i = 0; i < Math.max(s.serializedReads.length, witnessDigits.length); i++)
      if (JSON.stringify(s.serializedReads[i]) !== JSON.stringify(witnessDigits[i])) { at = i; break; }
    return { ok: false, seam: SEAM, firstDisagreeingBadgeIndex: at };
  }
});

// Counter attribution, ownership by enclosure (the specific Calculation of this FG).
const attribute = step('attribute counters by enclosure', (env, s) => {
  const reads = s.parts.badges, badges = s.parts['px.badges'], fields = s.parts['px.components'];
  const { widthPx, heightPx, rgba } = s.parts['px.image.cropped'];
  const darkLabels = fields.dark.labels;
  const componentPixels = (comp) => {
    const px = [];
    for (let y = comp.bboxY; y < comp.bboxY + comp.bboxH; y++)
      for (let x = comp.bboxX; x < comp.bboxX + comp.bboxW; x++)
        if (darkLabels[y * widthPx + x] === comp.label) px.push(y * widthPx + x);
    return px;
  };
  const ownedUnion = unionOf(badges.map((b) => [...b.px]));
  const mutedUnion = unionOf(badges.map((b) => [...b.has.mute.px]));
  const counterUnion = new Set();
  const unattributed = [];
  const enclosingCounts = [];
  const serialized = s.serializedReads.map((sRead, i) => {
    const badge = badges[i], read = reads[i];
    const owned = new Set(badge.px), mute = new Set(badge.has.mute.px);
    const darkPartLabels = new Set(badge.has.findPx.parts.filter((p) => p.polarity === 'dark').map((p) => p.label));
    const [bx, by, bw, bh] = badge.bbox;
    const counters = [];
    for (const comp of fields.dark.components) {
      if (darkPartLabels.has(comp.label)) continue;
      if (!(comp.bboxX >= bx && comp.bboxY >= by && comp.bboxX + comp.bboxW <= bx + bw && comp.bboxY + comp.bboxH <= by + bh)) continue;
      const px = componentPixels(comp);
      if (px.length !== comp.area) env.fail(`badge ${badge.label} dark component ${comp.label}: extracted ${px.length} px, component area is ${comp.area}`);
      if (px.some((p) => owned.has(p))) env.fail(`badge ${badge.label} counter candidate ${comp.label} overlaps the badge owned set`);
      // A dark component inside the bbox that leaks past the mute set is not an
      // enclosed counter (Heritage badge 5): unattributed, a finding.
      if (!px.every((p) => mute.has(p))) { unattributed.push({ badge: badge.label, componentLabel: comp.label, reason: 'not inside the badge mute set', pxCount: px.length }); continue; }
      const containing = read.digits.map((d, di) => ({ d, di })).filter(({ d }) =>
        d.bbox[0] <= comp.bboxX && d.bbox[1] <= comp.bboxY && comp.bboxX + comp.bboxW <= d.bbox[0] + d.bbox[2] && comp.bboxY + comp.bboxH <= d.bbox[1] + d.bbox[3]);
      if (containing.length !== 1) { unattributed.push({ badge: badge.label, componentLabel: comp.label, reason: `enclosed by ${containing.length} digits`, pxCount: px.length }); continue; }
      enclosingCounts.push(1);
      const { di, d } = containing[0];
      for (const p of px) counterUnion.add(p);
      counters.push({ componentLabel: comp.label, digitIndex: di, digitPredicted: d.predicted, bbox: [comp.bboxX, comp.bboxY, comp.bboxW, comp.bboxH], px, pxCount: px.length, pxSha256: sha256Hex(Uint32Array.from(px)) });
    }
    const digits = sRead.digits.map((d, di) => {
      const own = counters.filter((c) => c.digitIndex === di);
      if (!own.length) return d;
      const all = own.flatMap((c) => c.px).sort((a, b) => a - b);
      return { ...d, counter: { fn: 'ownership-by-enclosure', part: 'counter', components: own.map((c) => ({ componentLabel: c.componentLabel, bbox: c.bbox, pxCount: c.pxCount, pxSha256: c.pxSha256 })), pxCount: all.length, pxSha256: sha256Hex(Uint32Array.from(all)) } };
    });
    return { index: i, detId: sRead.detId, badgeLabel: badge.label, badgeBbox: [...badge.bbox], ...sRead, digits, counters };
  });
  env.check('countersDisjointFromOwned', [...counterUnion].every((p) => !ownedUnion.has(p)));
  env.check('countersSubsetOfMute', [...counterUnion].every((p) => mutedUnion.has(p)));
  env.check('counterDigitContainmentUnique', enclosingCounts.every((n) => n === 1), { enclosingCounts });
  // What the artifact will claim must equal what the attribution computed.
  for (const b of serialized) {
    for (const c of b.counters) if (c.pxCount !== c.px.length) env.fail(`badge ${b.badgeLabel} serialized counter ${c.componentLabel} claims ${c.pxCount} px but carries ${c.px.length}`);
    for (const d of b.digits) if (d.counter && d.counter.pxCount !== d.counter.components.reduce((n, c) => n + c.pxCount, 0))
      env.fail(`badge ${b.badgeLabel} digit counter part claims ${d.counter.pxCount} px, its components carry ${d.counter.components.reduce((n, c) => n + c.pxCount, 0)}`);
  }
  const counterPxTotal = counterUnion.size;
  const serializedCounterPx = serialized.reduce((n, b) => n + b.counters.reduce((m, c) => m + c.px.length, 0), 0);
  if (serializedCounterPx !== counterPxTotal) env.fail(`serialized counter px ${serializedCounterPx} != counter union ${counterPxTotal}`);
  const counterRgba = new Uint8ClampedArray(rgba);
  for (const p of counterUnion) counterRgba[p * 4 + 3] = 0;
  return { serialized, unattributed, counterPxTotal, counterRgba, ownedUnion, mutedUnion, dims: { width: widthPx, height: heightPx } };
});

const expectation = judged('specimenExpectation', {
  judge: (s) => {
    const observed = {};
    for (const b of s.serialized) if (b.counters.length) observed[b.badgeLabel] = b.counters.map((c) => c.pxCount).sort((a, b2) => b2 - a);
    return { matches: JSON.stringify(canonicalCounterTable(observed)) === JSON.stringify(canonicalCounterTable(EXPECTED_COUNTERS)), observed };
  }
});

const assemble = step('assemble px.digits artifact', (env, s) => {
  const renderCounters = s.serialized.filter((b) => b.counters.length).map((b) => {
    const px = b.counters.flatMap((c) => c.px).sort((a, b2) => a - b2);
    const xs = b.counters.map((c) => c.bbox), minX = Math.min(...xs.map((c) => c[0])), minY = Math.min(...xs.map((c) => c[1]));
    const maxX = Math.max(...xs.map((c) => c[0] + c[2])), maxY = Math.max(...xs.map((c) => c[1] + c[3]));
    return { label: b.badgeLabel, badgeIndex: b.index, bbox: [minX, minY, maxX - minX, maxY - minY], px, pxCount: px.length };
  });
  const { observed, matches } = s.judged.specimenExpectation;
  env.check('objects', s.serialized.every((b) => Array.isArray(b.digits)));
  env.check('digitEvidence', s.serialized.every((b) => b.digits.every((d) => d.normalized.length === 768 && d.scores.length === 10)));
  const totals = {
    digitCount: s.serialized.reduce((n, b) => n + b.digits.length, 0),
    counterComponentCount: s.serialized.reduce((n, b) => n + b.counters.length, 0), counterBadgeCount: renderCounters.length, counterPx: s.counterPxTotal,
    specDelta: {
      rule: 'ownership-by-enclosure (Sam, 2026-10-16): a digit owns its enclosed counter as a named part',
      movedFromMuteToDigitOwnedPx: s.counterPxTotal,
      badgeOwnedUnionBeforePx: s.ownedUnion.size, badgeOwnedUnionAfterPx: s.ownedUnion.size + s.counterPxTotal,
      mutedUnionBeforePx: s.mutedUnion.size, mutedUnionAfterPx: s.mutedUnion.size - s.counterPxTotal,
      note: 'px.badges and its fg.s1 materialization are unchanged; the delta is receipted at the digit layer where the attribution is made.'
    }
  };
  const artifact = {
    schema: 'nctk-s1-digits-artifact@1', part: PART, producedBy: PRODUCED_BY,
    guarantee: ID, badgeCount: s.serialized.length,
    image: { widthPx: s.dims.width, heightPx: s.dims.height },
    totals,
    witness: { kind: 'independent re-execution', seam: SEAM, digitEvidenceMatches: s.witnesses.detectBadges.ok },
    specimenExpectation: { source: 'established counter table (Sam, 2026-10-16)', expected: EXPECTED_COUNTERS, observed, matches },
    badges: s.serialized,
    counters: renderCounters
  };
  return { totals, artifact, renderCounters, observed };
});

const frames = framed((s) => [{
  title: `px.badges.digits: ${s.totals.digitCount} digits over ${s.serialized.length} badges`, calculation: PRODUCED_BY,
  parts: [
    { address: PART, kind: 'pxset', artifact: s.entries[PART] },
    { address: `${PART}#bbox`, kind: 'bbox', data: { boxes: s.serialized.flatMap((b) => b.digits.map((d) => [...d.bbox, String(d.predicted)])) } },
    { address: `${PART}#ledger`, kind: 'ledger', data: { rows: s.serialized.map((b) => ({
      index: b.index, badgeLabel: b.badgeLabel, label: b.label, bestLabel: b.bestLabel, confidence: b.confidence,
      abstentionReason: b.abstentionReason, digits: b.digits.map((d) => d.predicted).join(''),
      margins: b.digits.map((d) => d.margin), counterPx: b.counters.map((c) => c.pxCount)
    })) } }
  ],
  verdicts: s.serialized.map((b) => ({ name: `badge ${b.badgeLabel}: read ${b.label ?? 'abstained'}`, ok: b.label !== null && b.label === b.badgeLabel }))
}, {
  title: `digit-owned counters: ${s.totals.counterComponentCount} components, ${s.counterPxTotal} px moved from mute`, calculation: 'ownership-by-enclosure',
  parts: [
    { address: 's1.counters.rgba', kind: 'raster', artifact: s.entries['s1.counters.rgba'] },
    { address: `${PART}#counterBbox`, kind: 'bbox', data: { boxes: s.renderCounters.map((c) => [...c.bbox, c.label]) } },
    { address: `${PART}#specDelta`, kind: 'ledger', data: { rows: [s.totals.specDelta] } }
  ],
  verdicts: Object.keys(canonicalCounterTable(EXPECTED_COUNTERS)).map((label) => ({
    name: `counters of ${label}: expected ${EXPECTED_COUNTERS[label].join('+')}, observed ${(s.observed[label] ?? []).join('+') || 'none'}`,
    ok: JSON.stringify([...EXPECTED_COUNTERS[label]].sort((a, b) => b - a)) === JSON.stringify(s.observed[label] ?? [])
  }))
}]);

export default guarantee({
  id: ID, guards: [PART], audit: [unitful({ units: UNITS })],
  result: (s) => ({ totals: s.totals, badgeCount: s.serialized.length, producedBy: PRODUCED_BY, specimenExpectationMatches: s.judged.specimenExpectation.matches, ...(s.unattributed.length ? { unattributedCounterCandidates: s.unattributed } : {}) })
}, pipe(read(...READS),
  serialize, witness, attribute,
  conserved.raster({ name: 'counterRasterRecount', rasters: (s) => [{ rgba: s.counterRgba, px: s.counterPxTotal }] }),
  expectation, assemble,
  materialized({ artifacts: (s) => [
    { id: PART, kind: 'digit-set-json', path: 's1/px.digits.json', json: s.artifact },
    { id: 's1.counters.rgba', kind: 'rgba', path: 's1/counters.rgba.bin', bytes: s.counterRgba, dims: s.dims }
  ] }),
  frames,
  published({
    stage: 'S1', key: 'digitsMaterialization', materialization: 'S1Digits',
    header: () => ({ part: PART, producedBy: PRODUCED_BY }),
    body: (s) => ({ badgeCount: s.serialized.length, totals: s.artifact.totals, witness: s.artifact.witness, specimenExpectation: s.artifact.specimenExpectation })
  })));
