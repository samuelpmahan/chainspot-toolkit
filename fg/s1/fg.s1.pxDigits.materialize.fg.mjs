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
 * counter part. It is NOT swept in by bbox and NOT left in the mute bucket;
 * the move from mute to digit-owned is receipted as a spec delta with exact
 * per-badge pixel accounting. px.badges itself is not rewritten.
 *
 * The certified Part px.badges.digits is not on the board: this FG derives
 * it from the board reads ('badges'), so it guards px.badges.digits and
 * reads the Parts it is derived from. Ported from runEarly.mjs with
 * byte-identical artifacts (artifacts/s1/px.digits.json, counters.rgba.bin)
 * and stage record (stages[S1].digitsMaterialization, materializations.S1Digits).
 */
import { defineGuarantee } from '../guarantee.mjs';
import { sha256Hex } from '../canon.mjs';
import { legacyArtifact, prettyJsonBytes, unionOf } from './legacy.mjs';

const ID = 'fg.s1.pxDigits.materialize';
const PART = 'px.badges.digits';
const PRODUCED_BY = 'fn.readCourseBadges (g1.digits)';
const SEAM = 'detectors/threeFactor/measure.detectBadges(localImage, 0)';
// Established golden-specimen counter table (Sam's identification,
// 2026-10-16): the enclosed counters of the loop digits. Recorded as a
// specimen expectation in the artifact; the guarantee itself enforces the
// specimen-general properties.
const EXPECTED_COUNTERS = { '4': [19], '14': [19], '6': [30], '9': [30], '16': [29], '8': [26, 18], '18': [26, 18], '10': [78] };

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
  Object.entries(table).map(([k, v]) => [k, [...v].sort((a, b) => b - a)])
    .sort(([a], [b]) => Number(a) - Number(b)));

export default defineGuarantee({
  id: ID,
  guards: [PART],
  reads: ['badges', 'px.badges', 'px.components', 'localImage'],
  env: ['dist', 'captured'],
  run(ctx) {
    const { dist, captured } = ctx.env;
    const { detectBadges } = dist('detectors/threeFactor/measure');
    const reads = ctx.board.get('badges');
    const badges = ctx.board.get('px.badges');
    const fields = ctx.board.get('px.components');
    if (!Array.isArray(reads) || reads.length !== badges.length) ctx.fail(`board reads (${reads?.length}) disagree with px.badges (${badges.length})`);
    const serializedReads = reads.map(serializeDigits);
    for (let i = 0; i < badges.length; i++) {
      const rb = reads[i].bbox, bb = badges[i].bbox;
      if (!rb || !bb || rb.some((v, k) => v !== bb[k])) ctx.fail(`read ${i} bbox disagrees with badge ${i} bbox (reads and badges out of alignment)`);
      for (const d of serializedReads[i].digits) {
        if (d.normalized.length !== 768) ctx.fail(`badge ${i} digit has normalized length ${d.normalized.length}, expected 768 (24x32)`);
        if (d.scores.length !== 10) ctx.fail(`badge ${i} digit has ${d.scores.length} class scores, expected 10`);
      }
    }
    // Independent witness: the provider's public digit seam re-executed over
    // the same cropped image the gateway consumed.
    const witness = ctx.witness('serializerMatchesWitness', () => {
      const witnessDigits = detectBadges(ctx.board.get('localImage'), 0).map(serializeDigits);
      if (JSON.stringify(serializedReads) === JSON.stringify(witnessDigits)) return true;
      let at = -1;
      for (let i = 0; i < Math.max(serializedReads.length, witnessDigits.length); i++)
        if (JSON.stringify(serializedReads[i]) !== JSON.stringify(witnessDigits[i])) { at = i; break; }
      return { ok: false, seam: SEAM, firstDisagreeingBadgeIndex: at };
    });

    // Counter attribution, ownership by enclosure.
    const { widthPx, heightPx } = captured.S1.croppedImage;
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
    const serializedBadges = serializedReads.map((sRead, i) => {
      const badge = badges[i];
      const read = reads[i];
      const owned = new Set(badge.px);
      const mute = new Set(badge.has.mute.px);
      const darkPartLabels = new Set(badge.has.findPx.parts.filter((p) => p.polarity === 'dark').map((p) => p.label));
      const [bx, by, bw, bh] = badge.bbox;
      const counters = [];
      for (const comp of fields.dark.components) {
        if (darkPartLabels.has(comp.label)) continue;
        if (!(comp.bboxX >= bx && comp.bboxY >= by && comp.bboxX + comp.bboxW <= bx + bw && comp.bboxY + comp.bboxH <= by + bh)) continue;
        const px = componentPixels(comp);
        if (px.length !== comp.area) ctx.fail(`badge ${badge.label} dark component ${comp.label}: extracted ${px.length} px, component area is ${comp.area}`);
        if (px.some((p) => owned.has(p))) ctx.fail(`badge ${badge.label} counter candidate ${comp.label} overlaps the badge owned set`);
        // A dark component inside the badge bbox that leaks past the mute
        // set is not an enclosed counter (Heritage badge 5): left unattributed
        // and recorded as a finding instead of failing the run.
        if (!px.every((p) => mute.has(p))) { unattributed.push({ badge: badge.label, componentLabel: comp.label, reason: 'not inside the badge mute set', pxCount: px.length }); continue; }
        const containing = read.digits.map((d, di) => ({ d, di })).filter(({ d }) =>
          d.bbox[0] <= comp.bboxX && d.bbox[1] <= comp.bboxY &&
          comp.bboxX + comp.bboxW <= d.bbox[0] + d.bbox[2] && comp.bboxY + comp.bboxH <= d.bbox[1] + d.bbox[3]);
        enclosingCounts.push(containing.length);
        if (containing.length !== 1) { enclosingCounts.pop(); unattributed.push({ badge: badge.label, componentLabel: comp.label, reason: `enclosed by ${containing.length} digits`, pxCount: px.length }); continue; }
        const { di, d } = containing[0];
        for (const p of px) counterUnion.add(p);
        counters.push({
          componentLabel: comp.label, digitIndex: di, digitPredicted: d.predicted,
          bbox: [comp.bboxX, comp.bboxY, comp.bboxW, comp.bboxH],
          px, pxCount: px.length,
          pxSha256: sha256Hex(Uint32Array.from(px))
        });
      }
      const digits = sRead.digits.map((d, di) => {
        const own = counters.filter((c) => c.digitIndex === di);
        if (!own.length) return d;
        const all = own.flatMap((c) => c.px).sort((a, b) => a - b);
        return {
          ...d,
          counter: {
            fn: 'ownership-by-enclosure', part: 'counter',
            components: own.map((c) => ({ componentLabel: c.componentLabel, bbox: c.bbox, pxCount: c.pxCount, pxSha256: c.pxSha256 })),
            pxCount: all.length,
            pxSha256: sha256Hex(Uint32Array.from(all))
          }
        };
      });
      return { index: i, detId: sRead.detId, badgeLabel: badge.label, badgeBbox: [...badge.bbox], ...sRead, digits, counters };
    });
    // Global set arithmetic for the spec delta.
    const countersDisjointFromOwned = ctx.check('countersDisjointFromOwned', [...counterUnion].every((p) => !ownedUnion.has(p)));
    const countersSubsetOfMute = ctx.check('countersSubsetOfMute', [...counterUnion].every((p) => mutedUnion.has(p)));
    const counterDigitContainmentUnique = ctx.check('counterDigitContainmentUnique', enclosingCounts.every((n) => n === 1), { enclosingCounts });
    const counterPxTotal = counterUnion.size;
    // Serialized-vs-computed cross-checks: what the artifact will claim must
    // equal what the attribution computed, per component and in total.
    for (const b of serializedBadges) {
      for (const c of b.counters)
        if (c.pxCount !== c.px.length) ctx.fail(`badge ${b.badgeLabel} serialized counter ${c.componentLabel} claims ${c.pxCount} px but carries ${c.px.length}`);
      for (const d of b.digits)
        if (d.counter && d.counter.pxCount !== d.counter.components.reduce((n, c) => n + c.pxCount, 0))
          ctx.fail(`badge ${b.badgeLabel} digit counter part claims ${d.counter.pxCount} px, its components carry ${d.counter.components.reduce((n, c) => n + c.pxCount, 0)}`);
    }
    const serializedCounterPx = serializedBadges.reduce((n, b) => n + b.counters.reduce((m, c) => m + c.px.length, 0), 0);
    if (serializedCounterPx !== counterPxTotal) ctx.fail(`serialized counter px ${serializedCounterPx} != counter union ${counterPxTotal}`);
    // Counter subtraction raster + independent recount of the same set. The
    // canonical raster is fully opaque, so zeroed alpha == the set size.
    const counterRgba = new Uint8ClampedArray(captured.S1.croppedImage.rgba);
    for (const p of counterUnion) counterRgba[p * 4 + 3] = 0;
    let counterZeroed = 0;
    for (let p = 0; p < widthPx * heightPx; p++) if (counterRgba[p * 4 + 3] === 0) counterZeroed++;
    ctx.check('counterRasterRecount', counterZeroed === counterPxTotal, { zeroed: counterZeroed, counterUnion: counterPxTotal });

    const observedCounters = {};
    for (const b of serializedBadges) if (b.counters.length) observedCounters[b.badgeLabel] = b.counters.map((c) => c.pxCount).sort((a, b2) => b2 - a);
    const expectationMatches = JSON.stringify(canonicalCounterTable(observedCounters)) === JSON.stringify(canonicalCounterTable(EXPECTED_COUNTERS));
    const renderCounters = serializedBadges.filter((b) => b.counters.length).map((b) => {
      const px = b.counters.flatMap((c) => c.px).sort((a, b2) => a - b2);
      const xs = b.counters.map((c) => c.bbox), minX = Math.min(...xs.map((c) => c[0])), minY = Math.min(...xs.map((c) => c[1]));
      const maxX = Math.max(...xs.map((c) => c[0] + c[2])), maxY = Math.max(...xs.map((c) => c[1] + c[3]));
      return { label: b.badgeLabel, badgeIndex: b.index, bbox: [minX, minY, maxX - minX, maxY - minY], px, pxCount: px.length };
    });
    const digitCountTotal = serializedBadges.reduce((n, b) => n + b.digits.length, 0);
    const counterComponentCount = serializedBadges.reduce((n, b) => n + b.counters.length, 0);
    const digitSetArtifact = {
      schema: 'nctk-s1-digits-artifact@1', part: PART, producedBy: PRODUCED_BY,
      guarantee: ID, badgeCount: serializedBadges.length,
      image: { widthPx, heightPx },
      totals: {
        digitCount: digitCountTotal,
        counterComponentCount, counterBadgeCount: renderCounters.length, counterPx: counterPxTotal,
        specDelta: {
          rule: 'ownership-by-enclosure (Sam, 2026-10-16): a digit owns its enclosed counter as a named part',
          movedFromMuteToDigitOwnedPx: counterPxTotal,
          badgeOwnedUnionBeforePx: ownedUnion.size, badgeOwnedUnionAfterPx: ownedUnion.size + counterPxTotal,
          mutedUnionBeforePx: mutedUnion.size, mutedUnionAfterPx: mutedUnion.size - counterPxTotal,
          note: 'px.badges and its fg.s1 materialization are unchanged; the delta is receipted at the digit layer where the attribution is made.'
        }
      },
      witness: { kind: 'independent re-execution', seam: SEAM, digitEvidenceMatches: witness.ok },
      specimenExpectation: { source: 'established counter table (Sam, 2026-10-16)', expected: EXPECTED_COUNTERS, observed: observedCounters, matches: expectationMatches },
      badges: serializedBadges,
      counters: renderCounters
    };
    const dims = { width: widthPx, height: heightPx };
    const setEntry = ctx.artifact('px.badges.digits', 'digit-set-json', prettyJsonBytes(digitSetArtifact), undefined, { path: 's1/px.digits.json' });
    const countersEntry = ctx.artifact('s1.counters.rgba', 'rgba', counterRgba, dims, { path: 's1/counters.rgba.bin' });
    const objects = ctx.check('objects', serializedBadges.every((b) => Array.isArray(b.digits)));
    const digitEvidence = ctx.check('digitEvidence', serializedBadges.every((b) => b.digits.every((d) => d.normalized.length === 768 && d.scores.length === 10)));
    const artifactsRehashedAfterWrite = ctx.check('artifactsRehashedAfterWrite', setEntry.rehashed && countersEntry.rehashed);

    ctx.frame({
      title: `px.badges.digits: ${digitCountTotal} digits over ${serializedBadges.length} badges`, calculation: PRODUCED_BY,
      parts: [
        { address: PART, kind: 'pxset', artifact: setEntry },
        { address: `${PART}#bbox`, kind: 'bbox', data: { boxes: serializedBadges.flatMap((b) => b.digits.map((d) => [...d.bbox, String(d.predicted)])) } },
        { address: `${PART}#ledger`, kind: 'ledger', data: { rows: serializedBadges.map((b) => ({
          index: b.index, badgeLabel: b.badgeLabel, label: b.label, bestLabel: b.bestLabel, confidence: b.confidence,
          abstentionReason: b.abstentionReason, digits: b.digits.map((d) => d.predicted).join(''),
          margins: b.digits.map((d) => d.margin), counterPx: b.counters.map((c) => c.pxCount)
        })) } }
      ],
      verdicts: serializedBadges.map((b) => ({ name: `badge ${b.badgeLabel}: read ${b.label ?? 'abstained'}`, ok: b.label !== null && b.label === b.badgeLabel }))
    });
    ctx.frame({
      title: `digit-owned counters: ${counterComponentCount} components, ${counterPxTotal} px moved from mute`, calculation: 'ownership-by-enclosure',
      parts: [
        { address: 's1.counters.rgba', kind: 'raster', artifact: countersEntry },
        { address: `${PART}#counterBbox`, kind: 'bbox', data: { boxes: renderCounters.map((c) => [...c.bbox, c.label]) } },
        { address: `${PART}#specDelta`, kind: 'ledger', data: { rows: [digitSetArtifact.totals.specDelta] } }
      ],
      verdicts: Object.keys(canonicalCounterTable(EXPECTED_COUNTERS)).map((label) => ({
        name: `counters of ${label}: expected ${EXPECTED_COUNTERS[label].join('+')}, observed ${(observedCounters[label] ?? []).join('+') || 'none'}`,
        ok: JSON.stringify([...EXPECTED_COUNTERS[label]].sort((a, b) => b - a)) === JSON.stringify(observedCounters[label] ?? [])
      }))
    });

    const record = {
      guarantee: ID, part: PART, producedBy: PRODUCED_BY,
      badgeCount: serializedBadges.length,
      totals: digitSetArtifact.totals,
      witness: digitSetArtifact.witness,
      specimenExpectation: digitSetArtifact.specimenExpectation,
      checks: {
        objects, digitEvidence,
        serializerMatchesWitness: witness.ok,
        countersDisjointFromOwned, countersSubsetOfMute, counterDigitContainmentUnique,
        counterRasterRecount: counterZeroed,
        artifactsRehashedAfterWrite
      },
      artifacts: [legacyArtifact(setEntry), legacyArtifact(countersEntry, dims)]
    };
    ctx.publish('stages.S1.digitsMaterialization', record);
    ctx.publish('materializations.S1Digits', record);
    return { totals: digitSetArtifact.totals, badgeCount: serializedBadges.length, producedBy: PRODUCED_BY, specimenExpectationMatches: expectationMatches, ...(unattributed.length ? { unattributedCounterCandidates: unattributed } : {}) };
  }
});
