/**
 * Early-lane adapter for the pinned S0-S3 compiled Stage gateways.
 * Experiments are independent, opt-in branches from that Stage's OFF snapshot.
 * It never writes to the provider tree or edits original pixels/PxC identities.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { computeFamilyFix, rederiveFamilyFixVerdicts, FAMILY_FIX, FIX_BOUNDS, ringKeyOf } from './s3FamilyFix.mjs';
import { computeBadgeAssembly, rederiveBadgeComponents, BADGE_ASSEMBLY } from './s1BadgeAssembly.mjs';
import { computeBasketAssembly, rederiveBasketDecomposition, BASKET_ASSEMBLY } from './s2BasketAssembly.mjs';
import { computeTeeAssembly, rederiveTeeInterior, TEE_ASSEMBLY } from './s3TeeAssembly.mjs';
import { createInstrumentation, executePlanInstrumented } from './instrument.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const json = (value) => JSON.stringify(value, null, 2);
function treeIdentity(dir, suffixes) {
  const files = [];
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (suffixes.test(entry.name)) files.push([path.slice(dir.length), hash(readFileSync(path))]);
    }
  };
  walk(dir);
  return hash(JSON.stringify(files));
}

export async function runEarly({ forkRoot, sourcePath, outDir, experiments = [], until = 'S3' }) {
  const root = resolve(forkRoot);
  const provider = resolve(root, 'source/provider');
  if (!existsSync(resolve(provider, 'packages/alg/dist/stages/S0/contract.js')))
    throw new Error(`Pinned compiled Stage contracts not found under ${provider}`);
  const source = resolve(root, sourcePath);
  const out = resolve(root, outDir);
  mkdirSync(out, { recursive: true });
  const sourceBytes = readFileSync(source);
  const sourceSha256 = hash(sourceBytes);
  const require = createRequire(pathToFileURL(join(provider, 'package.json')));
  const dist = (path) => require(resolve(provider, 'packages/alg/dist', path));
  const { decodeNodeFile } = dist('adapters/node');
  const { ComponentPxC } = dist('stages/componentPxC');
  const { BadgePxC } = dist('stages/S1/clean/Badge');
  const { BasketPxC } = dist('stages/S2/clean/Basket');
  const { TeePxC } = dist('stages/S3/clean/Tee');
  const { capturePxC, restorePxC } = await import(pathToFileURL(resolve(provider, 'scripts/chainspot-lab/sweep/pxcSnapshot.ts')));
  const stageOrder = ['S0', 'S1', 'S2', 'S3'];
  const lastIndex = stageOrder.indexOf(until.toUpperCase());
  if (lastIndex < 0) throw new Error(`until must be S0, S1, S2, or S3; received ${until}`);
  // Runner auto-instrumentation (ports/early/instrument.mjs): every
  // compiled-plan op execution below is timed and its produced Parts are
  // read for an `emits` measures object. The record is written as a sidecar
  // (instrumentation.json) beside run.receipt.json at the end of the run;
  // it never enters the receipt, whose bytes are hashed into evidence.
  const instrumentation = createInstrumentation();

  const captured = {};
  for (const [id, path, name] of [
    ['S0', 'stages/S0/clean/index', 'executeS0'],
    ['S1', 'stages/S1/clean/index', 'executeS1BadgesCandidate'],
    ['S2', 'stages/S2/clean/index', 'executeS2BasketsCandidate'],
    ['S3', 'stages/S3/clean/index', 'executeS3VisibleTees']
  ]) {
    const mod = dist(path);
    const original = mod[name];
    if (typeof original !== 'function') throw new Error(`Missing pinned ${id} implementation ${name}`);
    mod[name] = (...args) => {
      const result = original(...args);
      return result instanceof Promise
        ? result.then((value) => (captured[id] = value, value))
        : (captured[id] = result, result);
    };
  }

  const tickView = (pcr) => (pcr?.ticks ?? []).map(({ operation, testimony }) => ({
    id: testimony.opId,
    declared: { consumes: operation.consumes, produces: operation.produces, calculations: operation.calculations },
    actual: { consumes: testimony.actualConsumes, produces: testimony.actualProduces, writes: testimony.writes },
    frozenCalculations: testimony.frozenCalculations,
    artifacts: testimony.artifacts.map(({ id, sha256, dims }) => ({ id, sha256, dims }))
  }));

  const stages = [];
  let pxc;
  let initialPixels;
  const stageSnapshots = {};
  for (const id of stageOrder.slice(0, lastIndex + 1)) {
    const started = Date.now();
    const inputSnapshotSha256 = pxc ? hash(stageSnapshots[stageOrder[stageOrder.indexOf(id) - 1]]) : null;
    const contract = dist(`stages/${id}/contract`).stageContract;
    const result = await contract.execute({ source, inputLabel: basename(source), decode: decodeNodeFile, ...(pxc ? { pxc } : {}) });
    pxc = result.pxc;
    const image = pxc.get(id === 'S0' ? 'px.course.canonicalPixels' : ComponentPxC.image);
    const canonicalRgbaSha256 = hash(image.rgba);
    if (id === 'S0') initialPixels = canonicalRgbaSha256;
    else if (canonicalRgbaSha256 !== initialPixels) throw new Error(`${id} changed canonical S0 source pixels`);
    if (!captured[id]?.pcr) throw new Error(`${id} did not expose its clean PCR`);
    const stage = {
      id,
      receipt: result.receiptText,
      pcr: captured[id].pcr,
      ticks: tickView(captured[id].pcr),
      durationMs: Date.now() - started,
      invocationLimit: 'one clean gateway invocation for this stage in this run',
      inputSourceSha256: id === 'S0' ? sourceSha256 : null,
      inputCanonicalRgbaSha256: id === 'S0' ? null : (stages.at(-1)?.canonicalRgbaSha256 ?? null),
      outputPixelRef: canonicalRgbaSha256,
      inputSnapshotSha256,
      canonicalRgbaSha256,
      panels: result.panels.map((panel) => ({ label: panel.label, widthPx: panel.widthPx, heightPx: panel.heightPx }))
    };
    stages.push(stage);
    const available = [...new Set([
      'px.source.selectedInput', 'px.source.fullImage', 'px.course.canonicalPixels',
      'localImage', 'viewport',
      ...Object.values(ComponentPxC).map((key) => key.address),
      ...Object.values(BadgePxC).map((key) => key.address),
      ...Object.values(BasketPxC).map((key) => key.address),
      ...Object.values(TeePxC).map((key) => key.address)
    ])].filter((address) => pxc.has(address));
    stageSnapshots[id] = capturePxC(pxc, available);
    stage.outputSnapshotSha256 = hash(stageSnapshots[id]);
  }
  // S1 materialization FunctionalGuarantee (declared in stages/s1.json as
  // fg.s1.pxBadges.materialize, enforced here in the stage wiring): px.badges
  // must leave every run as inspectable artifacts serialized from the live
  // board value, cross-checked against the provider's own materializer
  // (materializeS1Subtractions). An opaque or mismatched px.badges throws and
  // fails the run; it never passes silently.
  let s1Materialization = null;
  if (lastIndex >= 1) {
    const fail = (reason) => { throw new Error(`S1 materialization FunctionalGuarantee failed: ${reason}`); };
    const { materializeS1Subtractions } = dist('stages/S1/clean/index');
    const badges = pxc.get(BadgePxC.objects.address);
    if (!Array.isArray(badges) || !badges.length) fail('px.badges is missing or empty on the board after S1');
    if (!captured.S1?.badges || captured.S1.badges.length !== badges.length) fail('captured S1 run badges disagree with the board px.badges');
    const plain = (value) => ArrayBuffer.isView(value) ? [...value]
      : Array.isArray(value) ? value.map(plain)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]))
      : value ?? null;
    const serializedBadges = badges.map((badge, index) => {
      if (!badge.px || !badge.has?.mute?.px) fail(`badge ${index} lacks px or has.mute.px (opaque badge object)`);
      return {
        index, label: badge.label ?? null, rawLabel: badge.rawLabel ?? null, source: badge.source ?? null,
        bbox: badge.bbox ? [...badge.bbox] : null, confidence: badge.confidence ?? null,
        abstentionReason: badge.abstentionReason ?? null, note: badge.note ?? null,
        whitePx: badge.whitePx, blackPx: badge.blackPx,
        px: [...badge.px], pxCount: badge.px.length,
        findPx: { fn: badge.has.findPx.fn, parts: plain(badge.has.findPx.parts) },
        mute: { fn: badge.has.mute.fn, radiusPx: badge.has.mute.radiusPx, px: [...badge.has.mute.px], pxCount: badge.has.mute.px.length }
      };
    });
    const subtractions = materializeS1Subtractions(captured.S1);
    const union = (lists) => { const set = new Set(); for (const list of lists) for (const pixel of list) set.add(pixel); return set.size; };
    const totals = {
      badgePx: union(serializedBadges.map(b => b.px)),
      whitePx: serializedBadges.reduce((n, b) => n + b.whitePx, 0),
      blackPx: serializedBadges.reduce((n, b) => n + b.blackPx, 0),
      mutedPx: union(serializedBadges.map(b => b.mute.px)),
      addedMutePx: 0
    };
    totals.addedMutePx = totals.mutedPx - totals.badgePx;
    if (totals.badgePx !== subtractions.badgePx.badgePx) fail(`serialized badge px union ${totals.badgePx} != materializer badgePx ${subtractions.badgePx.badgePx}`);
    if (totals.mutedPx !== subtractions.muted.mutedPx) fail(`serialized mute px union ${totals.mutedPx} != materializer mutedPx ${subtractions.muted.mutedPx}`);
    if (totals.addedMutePx !== subtractions.muted.addedMutePx) fail(`addedMutePx ${totals.addedMutePx} != materializer ${subtractions.muted.addedMutePx}`);
    const { widthPx, heightPx } = subtractions.badgePx;
    for (const [name, raster] of [['badgePx', subtractions.badgePx], ['muted', subtractions.muted]])
      if (raster.rgba.length !== widthPx * heightPx * 4) fail(`${name} subtraction raster has ${raster.rgba.length} bytes, expected ${widthPx * heightPx * 4}`);
    const artifactDir = join(out, 'artifacts', 's1');
    mkdirSync(artifactDir, { recursive: true });
    const badgeSetArtifact = {
      schema: 'nctk-s1-badges-artifact@1', part: 'px.badges', producedBy: 'Badge.findPx',
      guarantee: 'fg.s1.pxBadges.materialize', badgeCount: serializedBadges.length,
      image: { widthPx, heightPx }, totals,
      subtractions: {
        badgePx: { badgePx: subtractions.badgePx.badgePx, mutedPx: subtractions.badgePx.mutedPx, overlapPx: subtractions.badgePx.overlapPx, remainingOpaquePx: subtractions.badgePx.remainingOpaquePx },
        muted: { badgePx: subtractions.muted.badgePx, mutedPx: subtractions.muted.mutedPx, addedMutePx: subtractions.muted.addedMutePx, overlapPx: subtractions.muted.overlapPx, remainingOpaquePx: subtractions.muted.remainingOpaquePx }
      },
      badges: serializedBadges
    };
    const writeArtifact = (id, kind, filename, bytes, dims) => {
      const path = join(artifactDir, filename);
      writeFileSync(path, bytes);
      const reread = readFileSync(path);
      if (hash(reread) !== hash(bytes)) fail(`artifact ${id} hash mismatch after write`);
      return { id, kind, path: `artifacts/s1/${filename}`, sha256: hash(bytes), bytes: bytes.length, ...(dims ? { dims } : {}) };
    };
    const artifacts = [
      writeArtifact('px.badges', 'badge-set-json', 'px.badges.json', Buffer.from(json(badgeSetArtifact) + '\n')),
      writeArtifact('s1.badgePx.rgba', 'rgba', 'badgePx.rgba.bin', Buffer.from(subtractions.badgePx.rgba.buffer, subtractions.badgePx.rgba.byteOffset, subtractions.badgePx.rgba.byteLength), { width: widthPx, height: heightPx }),
      writeArtifact('s1.muted.rgba', 'rgba', 'muted.rgba.bin', Buffer.from(subtractions.muted.rgba.buffer, subtractions.muted.rgba.byteOffset, subtractions.muted.rgba.byteLength), { width: widthPx, height: heightPx })
    ];
    s1Materialization = {
      guarantee: 'fg.s1.pxBadges.materialize', part: 'px.badges', producedBy: 'Badge.findPx',
      badgeCount: serializedBadges.length, totals,
      checks: {
        objects: serializedBadges.every(b => b.bbox !== null && b.source !== null),
        px: serializedBadges.every(b => Array.isArray(b.px) && b.pxCount === b.px.length && b.pxCount > 0),
        muted: serializedBadges.every(b => Array.isArray(b.mute.px) && b.mute.pxCount === b.mute.px.length && b.mute.pxCount >= b.pxCount),
        serializerMatchesMaterializer: true,
        artifactsRehashedAfterWrite: true
      },
      artifacts
    };
    if (!s1Materialization.checks.objects || !s1Materialization.checks.px || !s1Materialization.checks.muted)
      fail(`badge-set checks failed: ${json(s1Materialization.checks)}`);
    stages.find(s => s.id === 'S1').materialization = s1Materialization;
  }

  // S1 digits materialization FunctionalGuarantee (declared in stages/s1.json
  // as fg.s1.pxDigits.materialize, enforced here in the stage wiring): the
  // G1 digit evidence behind every badge label must leave the run as an
  // inspectable artifact serialized from the live board reads, witnessed by
  // an independent re-execution of the provider's public detectBadges seam
  // over the same cropped image (the pinned provider offers no digit
  // materializer; this re-execution is the second witness, never a fake one).
  // Counter ownership (Sam's corrected spec, ownership by enclosure): a dark
  // component enclosed by one digit's strokes, unowned by Badge.findPx and
  // inside the badge's mute set, is attributed to that digit as a named
  // counter part. It is NOT swept in by bbox and NOT left in the mute bucket;
  // the move from mute to digit-owned is receipted here as a spec delta with
  // exact per-badge pixel accounting. px.badges itself is not rewritten.
  let s1DigitsMaterialization = null;
  if (lastIndex >= 1) {
    const fail = (reason) => { throw new Error(`S1 digits materialization FunctionalGuarantee failed: ${reason}`); };
    const { detectBadges } = dist('detectors/threeFactor/measure');
    const reads = pxc.get(BadgePxC.reads.address);
    const badges = pxc.get(BadgePxC.objects.address);
    const fields = pxc.get(BadgePxC.components.address);
    if (!Array.isArray(reads) || reads.length !== badges.length) fail(`board reads (${reads?.length}) disagree with px.badges (${badges.length})`);
    const serializeDigits = (read) => ({
      detId: read.detId, label: read.label, rawLabel: read.rawLabel, bestLabel: read.bestLabel,
      digitCount: read.digitCount, confidence: read.confidence, confidenceFloor: read.confidenceFloor,
      abstentionReason: read.abstentionReason, conflictWith: read.conflictWith ?? [],
      labelCandidates: (read.labelCandidates ?? []).map((c) => ({ label: c.label, confidence: c.confidence })),
      notes: read.notes ?? [],
      digits: (read.digits ?? []).map((d) => ({
        bbox: [...d.bbox], method: d.method, predicted: d.predicted, runnerUp: d.runnerUp,
        scores: [...d.scores], margin: d.margin,
        normalizedSha256: hash(Buffer.from(d.normalized.buffer, d.normalized.byteOffset, d.normalized.byteLength)),
        normalized: [...d.normalized]
      }))
    });
    const serializedReads = reads.map(serializeDigits);
    for (let i = 0; i < badges.length; i++) {
      const rb = reads[i].bbox, bb = badges[i].bbox;
      if (!rb || !bb || rb.some((v, k) => v !== bb[k])) fail(`read ${i} bbox disagrees with badge ${i} bbox (reads and badges out of alignment)`);
      for (const d of serializedReads[i].digits) {
        if (d.normalized.length !== 768) fail(`badge ${i} digit has normalized length ${d.normalized.length}, expected 768 (24x32)`);
        if (d.scores.length !== 10) fail(`badge ${i} digit has ${d.scores.length} class scores, expected 10`);
      }
    }
    // Independent witness: the provider's public digit seam re-executed over
    // the same cropped image the gateway consumed.
    const witnessReads = detectBadges(pxc.get('localImage'), 0);
    const witnessDigits = witnessReads.map(serializeDigits);
    if (JSON.stringify(serializedReads) !== JSON.stringify(witnessDigits)) {
      let at = -1;
      for (let i = 0; i < Math.max(serializedReads.length, witnessDigits.length); i++)
        if (JSON.stringify(serializedReads[i]) !== JSON.stringify(witnessDigits[i])) { at = i; break; }
      fail(`serialized digit evidence disagrees with the detectBadges witness at badge index ${at}`);
    }
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
    const unionOf = (lists) => { const set = new Set(); for (const list of lists) for (const pixel of list) set.add(pixel); return set; };
    const ownedUnion = unionOf(badges.map(b => [...b.px]));
    const mutedUnion = unionOf(badges.map(b => [...b.has.mute.px]));
    const counterUnion = new Set();
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
        if (px.length !== comp.area) fail(`badge ${badge.label} dark component ${comp.label}: extracted ${px.length} px, component area is ${comp.area}`);
        if (px.some((p) => owned.has(p))) fail(`badge ${badge.label} counter candidate ${comp.label} overlaps the badge owned set`);
        if (!px.every((p) => mute.has(p))) fail(`badge ${badge.label} counter candidate ${comp.label} is not inside the badge mute set`);
        const containing = read.digits.map((d, di) => ({ d, di })).filter(({ d }) =>
          d.bbox[0] <= comp.bboxX && d.bbox[1] <= comp.bboxY &&
          comp.bboxX + comp.bboxW <= d.bbox[0] + d.bbox[2] && comp.bboxY + comp.bboxH <= d.bbox[1] + d.bbox[3]);
        if (containing.length !== 1) fail(`badge ${badge.label} counter candidate ${comp.label} is enclosed by ${containing.length} digits, expected exactly 1`);
        const { di, d } = containing[0];
        for (const p of px) counterUnion.add(p);
        counters.push({
          componentLabel: comp.label, digitIndex: di, digitPredicted: d.predicted,
          bbox: [comp.bboxX, comp.bboxY, comp.bboxW, comp.bboxH],
          px, pxCount: px.length,
          pxSha256: hash(Buffer.from(Uint32Array.from(px).buffer))
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
            pxSha256: hash(Buffer.from(Uint32Array.from(all).buffer))
          }
        };
      });
      return { index: i, detId: sRead.detId, badgeLabel: badge.label, badgeBbox: [...badge.bbox], ...sRead, digits, counters };
    });
    // Global set arithmetic for the spec delta.
    for (const p of counterUnion) {
      if (ownedUnion.has(p)) fail('counter union overlaps the badge owned union');
      if (!mutedUnion.has(p)) fail('counter union is not contained in the badge muted union');
    }
    const counterPxTotal = counterUnion.size;
    // Serialized-vs-computed cross-checks: what the artifact will claim must
    // equal what the attribution computed, per component and in total.
    for (const b of serializedBadges) {
      for (const c of b.counters)
        if (c.pxCount !== c.px.length) fail(`badge ${b.badgeLabel} serialized counter ${c.componentLabel} claims ${c.pxCount} px but carries ${c.px.length}`);
      for (const d of b.digits)
        if (d.counter && d.counter.pxCount !== d.counter.components.reduce((n, c) => n + c.pxCount, 0))
          fail(`badge ${b.badgeLabel} digit counter part claims ${d.counter.pxCount} px, its components carry ${d.counter.components.reduce((n, c) => n + c.pxCount, 0)}`);
    }
    const serializedCounterPx = serializedBadges.reduce((n, b) => n + b.counters.reduce((m, c) => m + c.px.length, 0), 0);
    if (serializedCounterPx !== counterPxTotal) fail(`serialized counter px ${serializedCounterPx} != counter union ${counterPxTotal}`);
    // Counter subtraction raster + independent recount of the same set.
    const counterRgba = new Uint8ClampedArray(captured.S1.croppedImage.rgba);
    for (const p of counterUnion) counterRgba[p * 4 + 3] = 0;
    let counterZeroed = 0;
    for (let p = 0; p < widthPx * heightPx; p++) if (counterRgba[p * 4 + 3] === 0) counterZeroed++;
    // The canonical raster is fully opaque, so zeroed alpha == the set size.
    if (counterZeroed !== counterPxTotal) fail(`counter raster zeroes ${counterZeroed} px, serialized counter union is ${counterPxTotal}`);
    // Established golden-specimen counter table (Sam's identification,
    // 2026-10-16): the enclosed counters of the loop digits. Recorded as a
    // specimen expectation in the artifact; the guarantee itself enforces
    // the specimen-general properties above.
    const expectedCounters = { '4': [19], '14': [19], '6': [30], '9': [30], '16': [29], '8': [26, 18], '18': [26, 18], '10': [78] };
    const observedCounters = {};
    for (const b of serializedBadges) if (b.counters.length) observedCounters[b.badgeLabel] = b.counters.map((c) => c.pxCount).sort((a, b2) => b2 - a);
    const canonicalCounterTable = (table) => Object.fromEntries(
      Object.entries(table).map(([k, v]) => [k, [...v].sort((a, b) => b - a)])
        .sort(([a], [b]) => Number(a) - Number(b)));
    const expectationMatches = JSON.stringify(canonicalCounterTable(observedCounters)) === JSON.stringify(canonicalCounterTable(expectedCounters));
    const renderCounters = serializedBadges.filter((b) => b.counters.length).map((b) => {
      const px = b.counters.flatMap((c) => c.px).sort((a, b2) => a - b2);
      const xs = b.counters.map((c) => c.bbox), minX = Math.min(...xs.map((c) => c[0])), minY = Math.min(...xs.map((c) => c[1]));
      const maxX = Math.max(...xs.map((c) => c[0] + c[2])), maxY = Math.max(...xs.map((c) => c[1] + c[3]));
      return { label: b.badgeLabel, badgeIndex: b.index, bbox: [minX, minY, maxX - minX, maxY - minY], px, pxCount: px.length };
    });
    const digitCountTotal = serializedBadges.reduce((n, b) => n + b.digits.length, 0);
    const counterComponentCount = serializedBadges.reduce((n, b) => n + b.counters.length, 0);
    const artifactDir = join(out, 'artifacts', 's1');
    mkdirSync(artifactDir, { recursive: true });
    const digitSetArtifact = {
      schema: 'nctk-s1-digits-artifact@1', part: 'px.badges.digits', producedBy: 'fn.readCourseBadges (g1.digits)',
      guarantee: 'fg.s1.pxDigits.materialize', badgeCount: serializedBadges.length,
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
      witness: { kind: 'independent re-execution', seam: 'detectors/threeFactor/measure.detectBadges(localImage, 0)', digitEvidenceMatches: true },
      specimenExpectation: { source: 'established counter table (Sam, 2026-10-16)', expected: expectedCounters, observed: observedCounters, matches: expectationMatches },
      badges: serializedBadges,
      counters: renderCounters
    };
    const writeArtifact = (id, kind, filename, bytes, dims) => {
      const path = join(artifactDir, filename);
      writeFileSync(path, bytes);
      const reread = readFileSync(path);
      if (hash(reread) !== hash(bytes)) fail(`artifact ${id} hash mismatch after write`);
      return { id, kind, path: `artifacts/s1/${filename}`, sha256: hash(bytes), bytes: bytes.length, ...(dims ? { dims } : {}) };
    };
    const artifacts = [
      writeArtifact('px.badges.digits', 'digit-set-json', 'px.digits.json', Buffer.from(json(digitSetArtifact) + '\n')),
      writeArtifact('s1.counters.rgba', 'rgba', 'counters.rgba.bin', Buffer.from(counterRgba.buffer, counterRgba.byteOffset, counterRgba.byteLength), { width: widthPx, height: heightPx })
    ];
    s1DigitsMaterialization = {
      guarantee: 'fg.s1.pxDigits.materialize', part: 'px.badges.digits', producedBy: 'fn.readCourseBadges (g1.digits)',
      badgeCount: serializedBadges.length,
      totals: digitSetArtifact.totals,
      witness: digitSetArtifact.witness,
      specimenExpectation: digitSetArtifact.specimenExpectation,
      checks: {
        objects: serializedBadges.every((b) => Array.isArray(b.digits)),
        digitEvidence: serializedBadges.every((b) => b.digits.every((d) => d.normalized.length === 768 && d.scores.length === 10)),
        serializerMatchesWitness: true,
        countersDisjointFromOwned: true,
        countersSubsetOfMute: true,
        counterDigitContainmentUnique: true,
        counterRasterRecount: counterZeroed,
        artifactsRehashedAfterWrite: true
      },
      artifacts
    };
    stages.find(s => s.id === 'S1').digitsMaterialization = s1DigitsMaterialization;
  }

  // S1 badgeGlyphTemplate materialization FunctionalGuarantee (declared in
  // stages/s1.json as fg.s1.badgeGlyphTemplate.materialize, enforced here in
  // the stage wiring): the default-OFF G1 whole-glyph template deviation is
  // executed on a restored S1 snapshot branch through the provider's own
  // gateway, under the provider's own badge-glyph-template-on config, and
  // its verdicts are serialized and witnessed by the provider's pure
  // classifyBadgeAgainstTemplates over the same board inputs. The baseline
  // reader's labels are never overwritten; the template output is evidence
  // alongside, exactly as the feature's own contract states.
  let s1GlyphTemplateMaterialization = null;
  if (lastIndex >= 1) {
    const fail = (reason) => { throw new Error(`S1 badgeGlyphTemplate materialization FunctionalGuarantee failed: ${reason}`); };
    const { resolveConfig, DEFAULT_EXECUTION, canonicalJson } = dist('detectors/threeFactor');
    const { compileExecutionPlan } = dist('exec/compile');
    const { executeCompiledPlan } = dist('exec/gateway');
    const { createMemorySink } = dist('exec/sink');
    const { operationImpls, operationCalculationBindings, ARTIFACT_EXTRACTORS } = dist('exec/operations');
    const { sha256HexSyncText } = dist('exec/sha256');
    const { nullFeatureContext, defaultKnobs } = dist('detectors/threeFactor/features/types');
    const { classifyBadgeAgainstTemplates } = dist('detectors/threeFactor/features/g1.badgeGlyphTemplate');
    const { DEFAULT_BADGE_GLYPH_TEMPLATE_KNOBS } = dist('detectors/threeFactor/digits/badgeGlyphTemplateMath');
    const onConfig = JSON.parse(readFileSync(join(provider, 'packages/alg/dist/detectors/threeFactor/configs/badge-glyph-template-on.json'), 'utf8'));
    const resolvedTemplate = resolveConfig(onConfig, DEFAULT_EXECUTION);
    const templateParamsHash = sha256HexSyncText(canonicalJson(resolvedTemplate));
    const templatePlan = compileExecutionPlan(resolvedTemplate, templateParamsHash);
    const templateOp = templatePlan.ops.find((op) => op.id === 'badgeGlyphTemplate');
    if (!templateOp) fail('badgeGlyphTemplate operation unavailable in the compiled template-on plan');
    const branch = restorePxC(stageSnapshots.S1);
    const templateCtx = {
      ...nullFeatureContext,
      resolve(feature) {
        if (feature.id === 'badgeGlyphTemplate') return { enabled: true, knobs: defaultKnobs(feature) };
        return nullFeatureContext.resolve(feature);
      }
    };
    executePlanInstrumented(instrumentation, 's1.badgeGlyphTemplate', executeCompiledPlan,
      { ops: [templateOp], bindings: templatePlan.bindings ?? {}, planFingerprint: templatePlan.planFingerprint, paramsHash: templateParamsHash },
      branch, templateCtx, createMemorySink(),
      { implementations: operationImpls, calculationBindings: operationCalculationBindings, artifactExtractors: ARTIFACT_EXTRACTORS }
    );
    if (!branch.has('badgeGlyphTemplate')) fail('badgeGlyphTemplate branch produced no verdicts');
    const verdicts = branch.get('badgeGlyphTemplate');
    const reads = branch.get('badges');
    const badges = pxc.get(BadgePxC.objects.address);
    if (!Array.isArray(verdicts) || verdicts.length !== badges.length) fail(`template verdicts (${verdicts?.length}) disagree with px.badges (${badges.length})`);
    const plain = (value) => ArrayBuffer.isView(value) ? [...value]
      : Array.isArray(value) ? value.map(plain)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]))
      : value ?? null;
    const serializedVerdicts = verdicts.map(plain);
    // Independent witness: the provider's pure classifier over the same
    // board inputs (localImage bitmap, reads, viewport shift, default knobs).
    const localImage = branch.get('localImage');
    const bitmap = { width: localImage.width, height: localImage.height, data: localImage.data };
    const { topPx } = branch.get('viewport');
    const witnessFields = ['badgeId', 'currentLabel', 'templateLabel', 'templateBestLabel', 'templateScore', 'templateMargin', 'templateAbstention', 'readerConfidence', 'agreement'];
    for (let i = 0; i < reads.length; i++) {
      const w = classifyBadgeAgainstTemplates(bitmap, reads[i], topPx, DEFAULT_BADGE_GLYPH_TEMPLATE_KNOBS);
      for (const k of witnessFields)
        if (JSON.stringify(w[k] ?? null) !== JSON.stringify(serializedVerdicts[i][k] ?? null))
          fail(`template verdict ${i} field ${k}: serialized ${JSON.stringify(serializedVerdicts[i][k] ?? null)} != witness ${JSON.stringify(w[k] ?? null)}`);
    }
    const counts = { agree: 0, disagree: 0, templateAbstained: 0, readerAbstained: 0, bothAbstained: 0 };
    for (const v of serializedVerdicts) {
      if (!(v.agreement in counts)) fail(`template verdict carries unknown agreement '${v.agreement}'`);
      counts[v.agreement]++;
    }
    if (Object.values(counts).reduce((a, b) => a + b, 0) !== serializedVerdicts.length) fail('template agreement counts do not sum to the verdict count');
    const artifactDir = join(out, 'artifacts', 's1');
    mkdirSync(artifactDir, { recursive: true });
    const templateArtifact = {
      schema: 'nctk-s1-badge-glyph-template-artifact@1', part: 'badgeGlyphTemplate', producedBy: 'badgeGlyphTemplate (g1.badgeGlyphTemplate)',
      guarantee: 'fg.s1.badgeGlyphTemplate.materialize', badgeCount: serializedVerdicts.length,
      config: { name: onConfig.name, paramsHash: templateParamsHash, planFingerprint: templatePlan.planFingerprint },
      counts,
      witness: { kind: 'provider pure function', seam: 'classifyBadgeAgainstTemplates(localImage, read, viewportTopPx, DEFAULT_BADGE_GLYPH_TEMPLATE_KNOBS)', fieldsCompared: witnessFields, matches: true },
      verdicts: serializedVerdicts
    };
    const writeArtifact = (id, kind, filename, bytes) => {
      const path = join(artifactDir, filename);
      writeFileSync(path, bytes);
      const reread = readFileSync(path);
      if (hash(reread) !== hash(bytes)) fail(`artifact ${id} hash mismatch after write`);
      return { id, kind, path: `artifacts/s1/${filename}`, sha256: hash(bytes), bytes: bytes.length };
    };
    const artifacts = [
      writeArtifact('badgeGlyphTemplate', 'glyph-template-verdicts-json', 'badgeGlyphTemplate.json', Buffer.from(json(templateArtifact) + '\n'))
    ];
    s1GlyphTemplateMaterialization = {
      guarantee: 'fg.s1.badgeGlyphTemplate.materialize', part: 'badgeGlyphTemplate', producedBy: 'badgeGlyphTemplate (g1.badgeGlyphTemplate)',
      badgeCount: serializedVerdicts.length,
      config: templateArtifact.config,
      counts,
      witness: templateArtifact.witness,
      checks: {
        objects: serializedVerdicts.every((v) => typeof v.badgeId === 'string' && typeof v.agreement === 'string'),
        serializerMatchesWitness: true,
        agreementCountsSum: true,
        artifactsRehashedAfterWrite: true
      },
      artifacts
    };
    stages.find(s => s.id === 'S1').glyphTemplateMaterialization = s1GlyphTemplateMaterialization;
  }

  // --- Declared spec delta refine.s1.badgeAssembly.plateFirst (stages/s1.json)
  // and its materialization guarantee fg.s1.pxBadges.assembly. Lane
  // s1-badge-assembly, default OFF: with the lane off, none of this runs and
  // the stage reproduces the pinned baseline exactly. With the lane on, a
  // branch from the S1 snapshot runs the toolkit-layer plate-first badge
  // assembly Calculation (ports/early/s1BadgeAssembly.mjs) over the pinned
  // per-badge component evidence (Badge.findPx component refs plus the
  // component label fields), never over the finished px.badges set. The base
  // board is never written; the assembly Part lives only on the branch and
  // in its artifact. Unlike the S3 fix, the gates here are exact
  // reproduction gates, not a recorded delta: plate-first assembly must not
  // change a single pixel, so a differing badge fails the run with its
  // differing pixel count named.
  let s1BadgeAssemblyMaterialization = null;
  let s1AssemblyBranchEvidence = null;
  if (lastIndex >= 1 && experiments.includes('S1ASM')) {
    const failAsm = (reason) => { throw new Error(`S1 badge assembly FunctionalGuarantee failed: ${reason}`); };
    if (!s1Materialization) failAsm('the fg.s1.pxBadges.materialize record is missing; the assembly has no baseline totals to gate against');
    if (!s1DigitsMaterialization) failAsm('the fg.s1.pxDigits.materialize record is missing; the assembly has no counter attribution to reconcile against');
    const { executeCompiledPlan } = dist('exec/gateway');
    const { nullFeatureContext } = dist('detectors/threeFactor/features/types');
    const { createMemorySink } = dist('exec/sink');
    const { sha256HexSyncText } = dist('exec/sha256');
    const canon = (value) => Array.isArray(value) ? `[${value.map(canon).join(',')}]`
      : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canon(value[k])}`).join(',')}}`
      : JSON.stringify(value) ?? 'null';
    const asmOp = {
      id: 'early.S1.badgeAssembly', kind: 'measure', gate: 'shared', unit: 'early-s1-badge-assembly',
      consumes: [BadgePxC.objects.address, BadgePxC.reads.address, BadgePxC.components.address],
      produces: [BADGE_ASSEMBLY.part], calculations: [BADGE_ASSEMBLY.assemblyCalculation], accessConformance: 'exact',
      note: 'Declared spec delta refine.s1.badgeAssembly.plateFirst: each Badge Part is re-assembled from its component evidence through the phase-1 assembly shape with the plate as the declared base, the white frame/ribbon and the per-digit glyph components fused onto it, and digit counters carried as digit-owned sub-structure. Branch from the S1 snapshot; base emissions unchanged.'
    };
    const runAssemblyBranch = () => {
      const branch = restorePxC(stageSnapshots.S1);
      for (const address of asmOp.consumes)
        if (!branch.has(address)) failAsm(`restored S1 branch is missing ${address}; the badge component evidence is not exposed on the S1 snapshot`);
      const before = hash(branch.get(ComponentPxC.image.address).rgba);
      let asmPart = null;
      const calculate = (badgesIn, readsIn, fieldsIn) => {
        asmPart = computeBadgeAssembly({ badges: badgesIn, reads: readsIn, fields: fieldsIn });
        return asmPart;
      };
      const plan = { ops: [asmOp], bindings: {}, planFingerprint: sha256HexSyncText(JSON.stringify(asmOp)) };
      const runtime = {
        implementations: new Map([[asmOp.id, (board) => { const part = calculate(...asmOp.consumes.map((address) => board.get(address))); board.set(BADGE_ASSEMBLY.part, part); }]]),
        calculationBindings: new Map([[asmOp.id, [{ address: BADGE_ASSEMBLY.assemblyCalculation, calculate }]]])
      };
      const ticks = executePlanInstrumented(instrumentation, 's1.badgeAssembly', executeCompiledPlan, plan, branch, nullFeatureContext, createMemorySink(), runtime);
      const after = hash(branch.get(ComponentPxC.image.address).rgba);
      if (before !== after || before !== initialPixels) failAsm('badge assembly branch mutated canonical pixels');
      return { branch, ticks, asmPart };
    };
    const branchA = runAssemblyBranch();
    const assemblyPart = branchA.branch.get(BADGE_ASSEMBLY.part);
    if (!assemblyPart || !Array.isArray(assemblyPart.badges)) failAsm('branch did not produce px.badges.assembly');
    // Exact reproduction gates against the accepted baseline on this same
    // live board (the objects fg.s1.pxBadges.materialize serialized).
    const baseBadges = pxc.get(BadgePxC.objects.address);
    if (assemblyPart.badges.length !== baseBadges.length)
      failAsm(`assembly badge count ${assemblyPart.badges.length} != baseline px.badges count ${baseBadges.length}`);
    const reproduction = assemblyPart.badges.map((rec, i) => {
      const baseSet = new Set(baseBadges[i].px);
      const fusedSet = new Set(rec.fusedPx);
      let differingPx = 0;
      for (const p of baseSet) if (!fusedSet.has(p)) differingPx++;
      for (const p of fusedSet) if (!baseSet.has(p)) differingPx++;
      return {
        index: i, label: rec.label,
        fusedPxCount: rec.fusedPxCount, baselinePxCount: baseSet.size,
        differingPx, exact: differingPx === 0 && rec.fusedPxCount === baseSet.size
      };
    });
    const inexact = reproduction.filter(r => !r.exact);
    if (inexact.length)
      failAsm(`plate-first assembly does not reproduce the baseline badge sets: ${inexact.map(r => `badge ${r.label} differs by ${r.differingPx} px (fused ${r.fusedPxCount} vs baseline ${r.baselinePxCount})`).join('; ')}`);
    if (assemblyPart.totals.fusedUnionPx !== s1Materialization.totals.badgePx)
      failAsm(`assembly fused union ${assemblyPart.totals.fusedUnionPx} != fg.s1 baseline badgePx union ${s1Materialization.totals.badgePx}`);
    if (assemblyPart.totals.whitePx !== s1Materialization.totals.whitePx || assemblyPart.totals.blackPx !== s1Materialization.totals.blackPx)
      failAsm(`assembly white/black totals ${assemblyPart.totals.whitePx}/${assemblyPart.totals.blackPx} != fg.s1 materialization totals ${s1Materialization.totals.whitePx}/${s1Materialization.totals.blackPx}`);
    if (assemblyPart.totals.counterComponentCount !== s1DigitsMaterialization.totals.counterComponentCount
      || assemblyPart.totals.counterPx !== s1DigitsMaterialization.totals.counterPx)
      failAsm(`assembly counter attribution (${assemblyPart.totals.counterComponentCount} components, ${assemblyPart.totals.counterPx} px) != fg.s1.pxDigits.materialize attribution (${s1DigitsMaterialization.totals.counterComponentCount} components, ${s1DigitsMaterialization.totals.counterPx} px)`);
    if (assemblyPart.totals.ownedWithCountersPx !== assemblyPart.totals.fusedUnionPx + assemblyPart.totals.counterPx)
      failAsm('assembly owned-with-counters ledger does not balance (fused union + counter px)');
    // Witness 1: deterministic re-execution of the assembly Calculation on
    // a second restored branch must reproduce the assembly Part exactly.
    const branchB = runAssemblyBranch();
    const canonicalAsm = hash(canon(assemblyPart));
    if (hash(canon(branchB.asmPart)) !== canonicalAsm)
      failAsm('re-execution of the badge assembly Calculation on a second branch disagrees with the first');
    // Witness 2: independent re-derivation of badge 10's components from
    // the raster component fields by a separate code path that never reads
    // the findPx component refs; every role set must match the assembly.
    const fields = pxc.get(BadgePxC.components.address);
    const reads = pxc.get(BadgePxC.reads.address);
    const witnessIndex = assemblyPart.badges.findIndex(r => r.label === '10');
    if (witnessIndex < 0) failAsm('badge 10 is absent from the assembly; the independent witness has no subject');
    const witness = rederiveBadgeComponents({ badge: baseBadges[witnessIndex], read: reads[witnessIndex], fields });
    const wRec = assemblyPart.badges[witnessIndex];
    const samePx = (a, b) => canon([...a].sort((x, y) => x - y)) === canon([...b].sort((x, y) => x - y));
    const wPlate = wRec.components.find(c => c.name === 'plate');
    const wFrame = wRec.components.find(c => c.name === 'frame');
    if (!samePx(witness.plate.px, wPlate.px)) failAsm('independent witness plate set disagrees with the assembly for badge 10');
    if (!witness.frame || !wFrame || !samePx(witness.frame.px, wFrame.px)) failAsm('independent witness frame set disagrees with the assembly for badge 10');
    for (const wd of witness.digits) {
      const recDigit = wRec.components.find(c => c.name === `digit-${wd.digitIndex}`);
      if (!recDigit || !samePx(wd.glyphs.flatMap(g => g.px), recDigit.px))
        failAsm(`independent witness glyph set for badge 10 digit ${wd.digitIndex} disagrees with the assembly`);
      const recGlyphLabels = (wRec.digits[wd.digitIndex]?.glyphComponents ?? []).map(g => g.label).sort((a, b) => a - b);
      const witGlyphLabels = wd.glyphs.map(g => g.ref.label).sort((a, b) => a - b);
      if (canon(recGlyphLabels) !== canon(witGlyphLabels))
        failAsm(`independent witness glyph components for badge 10 digit ${wd.digitIndex} disagree with the assembly`);
    }
    if (!samePx(witness.counters.flatMap(c => c.px), wRec.counters.flatMap(c => c.px)))
      failAsm('independent witness counter set disagrees with the assembly for badge 10');
    if (witness.counters.length !== wRec.counters.length)
      failAsm(`independent witness found ${witness.counters.length} counter components for badge 10, the assembly carries ${wRec.counters.length}`);
    const witnessRecord = {
      badgeLabel: '10', badgeIndex: witnessIndex,
      platePx: witness.plate.px.length, framePx: witness.frame ? witness.frame.px.length : 0,
      digitGlyphPx: witness.digits.map(d => d.glyphs.reduce((n, g) => n + g.px.length, 0)),
      counterComponents: witness.counters.length, counterPx: witness.counters.reduce((n, c) => n + c.pxCount, 0),
      exact: true
    };
    const asmArtifactDir = join(out, 'artifacts', 's1assembly');
    mkdirSync(asmArtifactDir, { recursive: true });
    const writeAsmArtifact = (id, kind, filename, bytes) => {
      const path = join(asmArtifactDir, filename);
      writeFileSync(path, bytes);
      const reread = readFileSync(path);
      if (hash(reread) !== hash(bytes)) failAsm(`artifact ${id} hash mismatch after write`);
      return { id, kind, path: `artifacts/s1assembly/${filename}`, sha256: hash(bytes), bytes: bytes.length };
    };
    const assemblyArtifact = {
      schema: 'nctk-s1-badge-assembly-artifact@1', part: BADGE_ASSEMBLY.part, producedBy: BADGE_ASSEMBLY.assemblyCalculation,
      guarantee: 'fg.s1.pxBadges.assembly', specDelta: BADGE_ASSEMBLY.specDelta, calculation: BADGE_ASSEMBLY.calculation,
      image: assemblyPart.image, totals: assemblyPart.totals, emits: assemblyPart.emits,
      reproduction,
      witnesses: {
        reexecution: { canonicalSha256: canonicalAsm, exact: true },
        rederivation: witnessRecord
      },
      badges: assemblyPart.badges
    };
    const asmArtifacts = [
      writeAsmArtifact('px.badges.assembly', 'badge-assembly-json', 'px.badges.assembly.json', Buffer.from(json(assemblyArtifact) + '\n'))
    ];
    const rereadAsm = JSON.parse(readFileSync(join(asmArtifactDir, 'px.badges.assembly.json'), 'utf8'));
    if (canon(rereadAsm.badges) !== canon(assemblyPart.badges) || canon(rereadAsm.totals) !== canon(assemblyPart.totals))
      failAsm('re-read assembly artifact disagrees with the serialized assembly Part');
    s1BadgeAssemblyMaterialization = {
      guarantee: 'fg.s1.pxBadges.assembly', specDelta: BADGE_ASSEMBLY.specDelta,
      part: BADGE_ASSEMBLY.part, producedBy: BADGE_ASSEMBLY.assemblyCalculation,
      badgeCount: assemblyPart.totals.badgeCount, totals: assemblyPart.totals,
      reproduction: { exactBadges: reproduction.filter(r => r.exact).length, ofBadges: reproduction.length, badges: reproduction },
      witnesses: assemblyArtifact.witnesses,
      checks: {
        allBadgesReproducedExactly: true, fusedUnionMatchesBaseline: true, whiteBlackTotalsMatchBaseline: true,
        countersReconcileWithDigitsGuarantee: true, ownedLedgerBalances: true,
        reexecutionExact: true, rederivationExact: true,
        artifactsRehashedAfterWrite: true, artifactsReReadAndCompared: true
      },
      artifacts: asmArtifacts
    };
    stages.find(s => s.id === 'S1').badgeAssemblyMaterialization = s1BadgeAssemblyMaterialization;
    s1AssemblyBranchEvidence = {
      mode: 'ON', status: 'SPEC_DELTA_ORACLE_UNKNOWN', lane: 's1-badge-assembly',
      baseSnapshotSha256: hash(stageSnapshots.S1),
      benefit: 'Every Badge Part is re-derived plate-first from its component evidence, so the assembly structure (plate base, fused frame and digit components, digit-owned counters, anchor, window residue) crosses the toolkit seam as named Parts instead of a flat px array with two counts.',
      falsifier: 'A badge fused set differs from the accepted px.badges set, the fused union differs from 37,002, the counters differ from the accepted attribution, or the owned total differs from 37,295.',
      oracle: 'UNKNOWN', partAddress: BADGE_ASSEMBLY.part,
      totals: assemblyPart.totals,
      reproduction: { exactBadges: reproduction.filter(r => r.exact).length, ofBadges: reproduction.length },
      canonicalRgbaSha256Off: stages[stageOrder.indexOf('S1')].canonicalRgbaSha256, canonicalRgbaSha256On: hash(branchA.branch.get(ComponentPxC.image.address).rgba),
      ticks: branchA.ticks.map(t => ({ id: t.opId, declared: { consumes: asmOp.consumes, produces: asmOp.produces, calculations: asmOp.calculations }, actual: { consumes: t.actualConsumes, produces: t.actualProduces, writes: t.writes }, frozenCalculations: t.frozenCalculations }))
    };
  }

  // S2 materialization FunctionalGuarantee (declared in stages/s2.json as
  // fg.s2.pxBaskets.materialize, enforced here in the stage wiring): px.baskets
  // must leave every run as inspectable artifacts serialized from the live
  // board value, cross-checked against the provider's own materializer
  // (materializeS2Subtraction). Layer integrity against the S1 sets is
  // computed from the same live board and recorded, never asserted away:
  // the claimed basket set must be disjoint from S1's owned and muted sets,
  // and the remaining-pixel arithmetic must balance exactly.
  let s2Materialization = null;
  if (lastIndex >= 2) {
    const fail = (reason) => { throw new Error(`S2 materialization FunctionalGuarantee failed: ${reason}`); };
    const { materializeS2Subtraction } = dist('stages/S2/clean/index');
    const { materializeS1Subtractions } = dist('stages/S1/clean/index');
    const baskets = pxc.get(BasketPxC.objects.address);
    if (!Array.isArray(baskets) || !baskets.length) fail('px.baskets is missing or empty on the board after S2');
    if (!captured.S2?.baskets || captured.S2.baskets.length !== baskets.length) fail('captured S2 run baskets disagree with the board px.baskets');
    const plain = (value) => ArrayBuffer.isView(value) ? [...value]
      : Array.isArray(value) ? value.map(plain)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]))
      : value ?? null;
    const serializedBaskets = baskets.map((basket, index) => {
      if (!basket.px || !basket.bbox) fail(`basket ${index} lacks px or bbox (opaque basket object)`);
      return {
        index, label: String(index + 1),
        bbox: [...basket.bbox],
        whitePx: basket.whitePx, blackPx: basket.blackPx,
        px: [...basket.px], pxCount: basket.px.length,
        pxSha256: hash(Buffer.from(basket.px.buffer, basket.px.byteOffset, basket.px.byteLength)),
        findPx: { fn: basket.has.findPx.fn, body: plain(basket.has.findPx.body) },
        shell: { fn: basket.has.findShellFamily.fn, margins: plain(basket.has.findShellFamily.margins), blackPx: [...basket.has.findShellFamily.blackPx], blackPxCount: basket.has.findShellFamily.blackPx.length },
        detectFamily: { fn: basket.has.detectFamily.fn, body: plain(basket.has.detectFamily.body) }
      };
    });
    const unionOf = (lists) => { const set = new Set(); for (const list of lists) for (const pixel of list) set.add(pixel); return set; };
    const claimed = unionOf(serializedBaskets.map(b => b.px));
    const claimedVisits = serializedBaskets.reduce((n, b) => n + b.pxCount, 0);
    // Independent witness: the provider's own S2 materializer over the
    // captured run (not the board serialization above).
    const witness = materializeS2Subtraction(captured.S2.image, captured.S2.baskets);
    if (witness.basketPx !== claimed.size) fail(`serialized basket px union ${claimed.size} != materializer basketPx ${witness.basketPx}`);
    if (witness.overlapPx !== claimedVisits - claimed.size) fail(`materializer overlapPx ${witness.overlapPx} != serialized visits-union ${claimedVisits - claimed.size}`);
    let witnessZeroed = 0;
    for (let pixel = 0; pixel < witness.widthPx * witness.heightPx; pixel++) if (witness.rgba[pixel * 4 + 3] === 0) witnessZeroed++;
    if (witnessZeroed !== witness.basketPx) fail(`materializer raster zeroes ${witnessZeroed} px, expected ${witness.basketPx}`);
    if (witness.remainingOpaquePx !== witness.widthPx * witness.heightPx - witness.basketPx) fail('materializer remainingOpaquePx does not balance the frame');
    // Layer integrity vs the S1 sets on this same live board.
    const badges = pxc.get(BadgePxC.objects.address);
    if (!Array.isArray(badges) || !badges.length) fail('px.badges missing on the board; cannot judge the S2 layer against S1');
    const s1Owned = unionOf(badges.map(b => [...b.px]));
    const s1Muted = unionOf(badges.map(b => [...b.has.mute.px]));
    const s1Consumed = unionOf([[...s1Owned], [...s1Muted]]);
    const intersect = (a, b) => { let n = 0; for (const pixel of a) if (b.has(pixel)) n++; return n; };
    const framePx = witness.widthPx * witness.heightPx;
    const remainingEntering = framePx - s1Consumed.size;
    const remainingLeaving = remainingEntering - claimed.size;
    const layerIntegrity = {
      framePx,
      s1OwnedPx: s1Owned.size, s1MutedPx: s1Muted.size, s1OwnedSubsetOfMuted: intersect(s1Owned, s1Muted) === s1Owned.size,
      s1ConsumedUnionPx: s1Consumed.size,
      remainingEnteringPx: remainingEntering,
      claimedPx: claimed.size, claimedVisits, overlapWithinLayerPx: claimedVisits - claimed.size,
      intersections: { vsS1Owned: intersect(claimed, s1Owned), vsS1Muted: intersect(claimed, s1Muted) },
      remainingLeavingPx: remainingLeaving,
      balanceHolds: remainingEntering === claimed.size + remainingLeaving
    };
    // Raster recount of the layer arithmetic: canonical raster, zero the S1
    // consumed union, count; zero the claimed set, count again.
    const layerRgba = new Uint8ClampedArray(captured.S2.image.rgba);
    for (const pixel of s1Consumed) layerRgba[pixel * 4 + 3] = 0;
    let opaqueEntering = 0;
    for (let pixel = 0; pixel < framePx; pixel++) if (layerRgba[pixel * 4 + 3] !== 0) opaqueEntering++;
    for (const pixel of claimed) layerRgba[pixel * 4 + 3] = 0;
    let opaqueLeaving = 0;
    for (let pixel = 0; pixel < framePx; pixel++) if (layerRgba[pixel * 4 + 3] !== 0) opaqueLeaving++;
    layerIntegrity.rasterRecount = { remainingEnteringPx: opaqueEntering, remainingLeavingPx: opaqueLeaving };
    layerIntegrity.rasterRecountHolds = opaqueEntering === remainingEntering && opaqueLeaving === remainingLeaving;
    if (!layerIntegrity.rasterRecountHolds) fail(`layer raster recount (${opaqueEntering} in, ${opaqueLeaving} out) disagrees with set arithmetic (${remainingEntering} in, ${remainingLeaving} out)`);
    // S1 witness agreement for the entering layer (same run, same board).
    const s1Witness = materializeS1Subtractions(captured.S1);
    layerIntegrity.s1WitnessRemainingAfterMutedPx = s1Witness.muted.remainingOpaquePx;
    layerIntegrity.s1WitnessAgrees = s1Witness.muted.remainingOpaquePx === remainingEntering;
    const { widthPx, heightPx } = witness;
    const artifactDir = join(out, 'artifacts', 's2');
    mkdirSync(artifactDir, { recursive: true });
    const basketSetArtifact = {
      schema: 'nctk-s2-baskets-artifact@1', part: 'px.baskets', producedBy: 'Basket.findPx',
      guarantee: 'fg.s2.pxBaskets.materialize', basketCount: serializedBaskets.length,
      note: 'Baskets carry no engine label; label is the 1-based order used by the pinned S2 contract receipt.',
      image: { widthPx, heightPx },
      totals: { claimedPx: claimed.size, claimedVisits, overlapWithinLayerPx: claimedVisits - claimed.size },
      witness: { basketPx: witness.basketPx, overlapPx: witness.overlapPx, remainingOpaquePx: witness.remainingOpaquePx },
      layerIntegrity,
      baskets: serializedBaskets
    };
    const writeArtifact = (id, kind, filename, bytes, dims) => {
      const path = join(artifactDir, filename);
      writeFileSync(path, bytes);
      const reread = readFileSync(path);
      if (hash(reread) !== hash(bytes)) fail(`artifact ${id} hash mismatch after write`);
      return { id, kind, path: `artifacts/s2/${filename}`, sha256: hash(bytes), bytes: bytes.length, ...(dims ? { dims } : {}) };
    };
    const artifacts = [
      writeArtifact('px.baskets', 'basket-set-json', 'px.baskets.json', Buffer.from(json(basketSetArtifact) + '\n')),
      writeArtifact('s2.basketPx.rgba', 'rgba', 'basketPx.rgba.bin', Buffer.from(witness.rgba.buffer, witness.rgba.byteOffset, witness.rgba.byteLength), { width: widthPx, height: heightPx }),
      writeArtifact('s2.remaining.rgba', 'rgba', 'remaining.rgba.bin', Buffer.from(layerRgba.buffer, layerRgba.byteOffset, layerRgba.byteLength), { width: widthPx, height: heightPx })
    ];
    s2Materialization = {
      guarantee: 'fg.s2.pxBaskets.materialize', part: 'px.baskets', producedBy: 'Basket.findPx',
      basketCount: serializedBaskets.length,
      familyCount: captured.S2.family.members.length,
      shellMemberCount: captured.S2.shellFamily.members.length,
      totals: basketSetArtifact.totals,
      witness: basketSetArtifact.witness,
      layerIntegrity,
      checks: {
        objects: serializedBaskets.every(b => Array.isArray(b.bbox) && b.bbox.length === 4),
        px: serializedBaskets.every(b => Array.isArray(b.px) && b.pxCount === b.px.length && b.pxCount > 0),
        serializerMatchesMaterializer: true,
        artifactsRehashedAfterWrite: true
      },
      artifacts
    };
    if (!s2Materialization.checks.objects || !s2Materialization.checks.px)
      fail(`basket-set checks failed: ${json(s2Materialization.checks)}`);
    stages.find(s => s.id === 'S2').materialization = s2Materialization;
  }

  // --- Declared spec delta refine.s2.basketAssembly.bodyFirst (stages/s2.json)
  // and its materialization guarantee fg.s2.pxBaskets.assembly. Lane
  // s2-basket-assembly, default OFF: with the lane off, none of this runs and
  // the stage reproduces the pinned baseline exactly. With the lane on, a
  // branch from the S2 snapshot runs the toolkit-layer body-first basket
  // assembly Calculation (ports/early/s2BasketAssembly.mjs) over the pinned
  // component evidence (the Basket.findPx body component ref materialized
  // against the bright label field, and the findShellFamily blackPx set
  // cross-checked against the shellFamily Part member), never over the
  // finished px.baskets set. The base board is never written; the assembly
  // Part lives only on the branch and in its artifact. The gates here are
  // exact reproduction gates, not a recorded delta: body-first assembly must
  // not change a single pixel, so a differing basket fails the run with its
  // differing pixel count named.
  let s2BasketAssemblyMaterialization = null;
  let s2AssemblyBranchEvidence = null;
  if (lastIndex >= 2 && experiments.includes('S2ASM')) {
    const failAsm = (reason) => { throw new Error(`S2 basket assembly FunctionalGuarantee failed: ${reason}`); };
    if (!s2Materialization) failAsm('the fg.s2.pxBaskets.materialize record is missing; the assembly has no baseline totals to gate against');
    const { executeCompiledPlan } = dist('exec/gateway');
    const { nullFeatureContext } = dist('detectors/threeFactor/features/types');
    const { createMemorySink } = dist('exec/sink');
    const { sha256HexSyncText } = dist('exec/sha256');
    const canon = (value) => Array.isArray(value) ? `[${value.map(canon).join(',')}]`
      : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canon(value[k])}`).join(',')}}`
      : JSON.stringify(value) ?? 'null';
    const asmOp = {
      id: 'early.S2.basketAssembly', kind: 'measure', gate: 'shared', unit: 'early-s2-basket-assembly',
      consumes: [BasketPxC.objects.address, BasketPxC.shellFamily.address, ComponentPxC.fields.address],
      produces: [BASKET_ASSEMBLY.part], calculations: [BASKET_ASSEMBLY.assemblyCalculation], accessConformance: 'exact',
      note: 'Declared spec delta refine.s2.basketAssembly.bodyFirst: each Basket Part is re-assembled from its component evidence through the phase-1 assembly shape with the bright body as the declared base and the shell fused onto it, the tip carried as the anchor, and window ownership accounted against the semantic bbox. Branch from the S2 snapshot; base emissions unchanged.'
    };
    const runAssemblyBranch = () => {
      const branch = restorePxC(stageSnapshots.S2);
      for (const address of asmOp.consumes)
        if (!branch.has(address)) failAsm(`restored S2 branch is missing ${address}; the basket component evidence is not exposed on the S2 snapshot`);
      const before = hash(branch.get(ComponentPxC.image.address).rgba);
      let asmPart = null;
      const calculate = (basketsIn, shellFamilyIn, fieldsIn) => {
        asmPart = computeBasketAssembly({ baskets: basketsIn, shellFamily: shellFamilyIn, fields: fieldsIn });
        return asmPart;
      };
      const plan = { ops: [asmOp], bindings: {}, planFingerprint: sha256HexSyncText(JSON.stringify(asmOp)) };
      const runtime = {
        implementations: new Map([[asmOp.id, (board) => { const part = calculate(...asmOp.consumes.map((address) => board.get(address))); board.set(BASKET_ASSEMBLY.part, part); }]]),
        calculationBindings: new Map([[asmOp.id, [{ address: BASKET_ASSEMBLY.assemblyCalculation, calculate }]]])
      };
      const ticks = executePlanInstrumented(instrumentation, 's2.basketAssembly', executeCompiledPlan, plan, branch, nullFeatureContext, createMemorySink(), runtime);
      const after = hash(branch.get(ComponentPxC.image.address).rgba);
      if (before !== after || before !== initialPixels) failAsm('basket assembly branch mutated canonical pixels');
      return { branch, ticks, asmPart };
    };
    const branchA = runAssemblyBranch();
    const assemblyPart = branchA.branch.get(BASKET_ASSEMBLY.part);
    if (!assemblyPart || !Array.isArray(assemblyPart.baskets)) failAsm('branch did not produce px.baskets.assembly');
    // Exact reproduction gates against the accepted baseline on this same
    // live board (the objects fg.s2.pxBaskets.materialize serialized).
    const baseBaskets = pxc.get(BasketPxC.objects.address);
    if (assemblyPart.baskets.length !== baseBaskets.length)
      failAsm(`assembly basket count ${assemblyPart.baskets.length} != baseline px.baskets count ${baseBaskets.length}`);
    const reproduction = assemblyPart.baskets.map((rec, i) => {
      const baseSet = new Set(baseBaskets[i].px);
      const fusedSet = new Set(rec.fusedPx);
      let differingPx = 0;
      for (const p of baseSet) if (!fusedSet.has(p)) differingPx++;
      for (const p of fusedSet) if (!baseSet.has(p)) differingPx++;
      return {
        index: i, label: rec.label,
        bodyPxCount: rec.components[0].pxCount, shellPxCount: rec.components[1].pxCount,
        fusedPxCount: rec.fusedPxCount, baselinePxCount: baseSet.size,
        componentOverlapPx: rec.componentOverlapPx,
        residuePx: rec.residuePx,
        differingPx, exact: differingPx === 0 && rec.fusedPxCount === baseSet.size
      };
    });
    const inexact = reproduction.filter(r => !r.exact);
    if (inexact.length)
      failAsm(`body-first assembly does not reproduce the baseline basket sets: ${inexact.map(r => `basket ${r.label} differs by ${r.differingPx} px (fused ${r.fusedPxCount} vs baseline ${r.baselinePxCount})`).join('; ')}`);
    const overlapping = reproduction.filter(r => r.componentOverlapPx !== 0);
    if (overlapping.length)
      failAsm(`basket component overlap is nonzero: ${overlapping.map(r => `basket ${r.label} overlaps by ${r.componentOverlapPx} px`).join('; ')}`);
    if (assemblyPart.totals.fusedUnionPx !== s2Materialization.totals.claimedPx)
      failAsm(`assembly fused union ${assemblyPart.totals.fusedUnionPx} != fg.s2 baseline claimedPx union ${s2Materialization.totals.claimedPx}`);
    const baselineBodyPx = baseBaskets.reduce((n, b) => n + b.whitePx, 0);
    const baselineShellPx = baseBaskets.reduce((n, b) => n + b.blackPx, 0);
    if (assemblyPart.totals.bodyPx !== baselineBodyPx || assemblyPart.totals.shellPx !== baselineShellPx)
      failAsm(`assembly body/shell totals ${assemblyPart.totals.bodyPx}/${assemblyPart.totals.shellPx} != baseline whitePx/blackPx totals ${baselineBodyPx}/${baselineShellPx}`);
    const [residueLo, residueHi] = BASKET_ASSEMBLY.expectedResidueBandPx;
    const outOfBand = reproduction.filter(r => r.residuePx < residueLo || r.residuePx > residueHi);
    if (outOfBand.length)
      failAsm(`basket window residue outside the phase-1 analysis band [${residueLo}, ${residueHi}]: ${outOfBand.map(r => `basket ${r.label} residue ${r.residuePx} px`).join('; ')}`);
    const outsideWindow = assemblyPart.baskets.filter(r => r.ownership.ownedOutsideWindowPx !== 0);
    if (outsideWindow.length)
      failAsm(`baskets owning px outside their semantic window: ${outsideWindow.map(r => `basket ${r.label} owns ${r.ownership.ownedOutsideWindowPx} px outside`).join('; ')}`);
    // Witness 1: deterministic re-execution of the assembly Calculation on
    // a second restored branch must reproduce the assembly Part exactly.
    const branchB = runAssemblyBranch();
    const canonicalAsm = hash(canon(assemblyPart));
    if (hash(canon(branchB.asmPart)) !== canonicalAsm)
      failAsm('re-execution of the basket assembly Calculation on a second branch disagrees with the first');
    // Witness 2: independent re-derivation of basket 1's body and shell
    // from the raster fields by a separate code path that never reads the
    // basket's recorded findPx body ref or findShellFamily blackPx; both
    // role sets must match the assembly.
    const fields = pxc.get(ComponentPxC.fields.address);
    const shellFamily = pxc.get(BasketPxC.shellFamily.address);
    const witnessIndex = 0;
    const witness = rederiveBasketDecomposition({ basket: baseBaskets[witnessIndex], shellFamily, fields });
    const wRec = assemblyPart.baskets[witnessIndex];
    const samePx = (a, b) => canon([...a].sort((x, y) => x - y)) === canon([...b].sort((x, y) => x - y));
    const wBody = wRec.components.find(c => c.name === 'body');
    const wShell = wRec.components.find(c => c.name === 'shell');
    if (!samePx(witness.body.px, wBody.px)) failAsm('independent witness body set disagrees with the assembly for basket 1');
    if (!samePx(witness.shell.px, wShell.px)) failAsm('independent witness shell set disagrees with the assembly for basket 1');
    const witnessRecord = {
      basketLabel: wRec.label, basketIndex: witnessIndex,
      bodyPx: witness.body.px.length, shellPx: witness.shell.px.length,
      exact: true
    };
    const asmArtifactDir = join(out, 'artifacts', 's2assembly');
    mkdirSync(asmArtifactDir, { recursive: true });
    const writeAsmArtifact = (id, kind, filename, bytes) => {
      const path = join(asmArtifactDir, filename);
      writeFileSync(path, bytes);
      const reread = readFileSync(path);
      if (hash(reread) !== hash(bytes)) failAsm(`artifact ${id} hash mismatch after write`);
      return { id, kind, path: `artifacts/s2assembly/${filename}`, sha256: hash(bytes), bytes: bytes.length };
    };
    const assemblyArtifact = {
      schema: 'nctk-s2-basket-assembly-artifact@1', part: BASKET_ASSEMBLY.part, producedBy: BASKET_ASSEMBLY.assemblyCalculation,
      guarantee: 'fg.s2.pxBaskets.assembly', specDelta: BASKET_ASSEMBLY.specDelta, calculation: BASKET_ASSEMBLY.calculation,
      image: assemblyPart.image, totals: assemblyPart.totals, emits: assemblyPart.emits,
      reproduction,
      witnesses: {
        reexecution: { canonicalSha256: canonicalAsm, exact: true },
        rederivation: witnessRecord
      },
      baskets: assemblyPart.baskets
    };
    const asmArtifacts = [
      writeAsmArtifact('px.baskets.assembly', 'basket-assembly-json', 'px.baskets.assembly.json', Buffer.from(json(assemblyArtifact) + '\n'))
    ];
    const rereadAsm = JSON.parse(readFileSync(join(asmArtifactDir, 'px.baskets.assembly.json'), 'utf8'));
    if (canon(rereadAsm.baskets) !== canon(assemblyPart.baskets) || canon(rereadAsm.totals) !== canon(assemblyPart.totals))
      failAsm('re-read assembly artifact disagrees with the serialized assembly Part');
    s2BasketAssemblyMaterialization = {
      guarantee: 'fg.s2.pxBaskets.assembly', specDelta: BASKET_ASSEMBLY.specDelta,
      part: BASKET_ASSEMBLY.part, producedBy: BASKET_ASSEMBLY.assemblyCalculation,
      basketCount: assemblyPart.totals.basketCount, totals: assemblyPart.totals,
      reproduction: { exactBaskets: reproduction.filter(r => r.exact).length, ofBaskets: reproduction.length, baskets: reproduction },
      witnesses: assemblyArtifact.witnesses,
      checks: {
        allBasketsReproducedExactly: true, fusedUnionMatchesBaseline: true, bodyShellTotalsMatchBaseline: true,
        componentOverlapZero: true, residueWithinPhase1Band: true, ownedOutsideWindowZero: true,
        reexecutionExact: true, rederivationExact: true,
        artifactsRehashedAfterWrite: true, artifactsReReadAndCompared: true
      },
      artifacts: asmArtifacts
    };
    stages.find(s => s.id === 'S2').basketAssemblyMaterialization = s2BasketAssemblyMaterialization;
    s2AssemblyBranchEvidence = {
      mode: 'ON', status: 'SPEC_DELTA_ORACLE_UNKNOWN', lane: 's2-basket-assembly',
      baseSnapshotSha256: hash(stageSnapshots.S2),
      benefit: 'Every Basket Part is re-derived body-first from its component evidence, so the assembly structure (body base, fused shell, tip anchor, window residue) crosses the toolkit seam as named Parts instead of a flat px array with two counts.',
      falsifier: 'A basket fused set differs from the accepted px.baskets set, the fused union differs from 36,362, a basket component overlap is nonzero, or a basket window residue falls outside the phase-1 band of 1,172 to 1,177 px.',
      oracle: 'UNKNOWN', partAddress: BASKET_ASSEMBLY.part,
      totals: assemblyPart.totals,
      reproduction: { exactBaskets: reproduction.filter(r => r.exact).length, ofBaskets: reproduction.length },
      canonicalRgbaSha256Off: stages[stageOrder.indexOf('S2')].canonicalRgbaSha256, canonicalRgbaSha256On: hash(branchA.branch.get(ComponentPxC.image.address).rgba),
      ticks: branchA.ticks.map(t => ({ id: t.opId, declared: { consumes: asmOp.consumes, produces: asmOp.produces, calculations: asmOp.calculations }, actual: { consumes: t.actualConsumes, produces: t.actualProduces, writes: t.writes }, frozenCalculations: t.frozenCalculations }))
    };
  }

  // S3 materialization FunctionalGuarantees (declared in stages/s3.json as
  // fg.s3.pxTees.materialize and fg.s3.pxTeesRingsFamily.materialize, enforced
  // here in the stage wiring): px.tees and its producing Parts px.tees.rings /
  // px.tees.family must leave every run as inspectable artifacts serialized
  // from the live board, cross-checked against independent witnesses (the
  // provider's own materializeS3Subtraction for the tee set; re-execution of
  // the provider's pure detectTeeRings and selectTeeFamily for rings/family).
  // Layer integrity against ALL prior layers (S1 owned+muted, S2 claimed) is
  // computed from the same live board and recorded, never asserted away.
  let s3Materialization = null;
  let s3RingsFamilyMaterialization = null;
  let s3FamilyFixMaterialization = null;
  let s3FixBranchEvidence = null;
  if (lastIndex >= 3) {
    const fail = (reason) => { throw new Error(`S3 materialization FunctionalGuarantee failed: ${reason}`); };
    const { materializeS3Subtraction } = dist('stages/S3/clean/index');
    const { materializeS1Subtractions } = dist('stages/S1/clean/index');
    const plain = (value) => ArrayBuffer.isView(value) ? [...value]
      : Array.isArray(value) ? value.map(plain)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]))
      : value ?? null;
    const unionOf = (lists) => { const set = new Set(); for (const list of lists) for (const pixel of list) set.add(pixel); return set; };
    const intersect = (a, b) => { let n = 0; for (const pixel of a) if (b.has(pixel)) n++; return n; };

    // --- fg.s3.pxTees.materialize: the tee set, witnessed by the provider's
    // own materializer over the captured run.
    const tees = pxc.get(TeePxC.objects.address);
    if (!Array.isArray(tees) || !tees.length) fail('px.tees is missing or empty on the board after S3');
    if (!captured.S3?.tees || captured.S3.tees.length !== tees.length) fail('captured S3 run tees disagree with the board px.tees');
    const serializedTees = tees.map((tee, index) => {
      if (!tee.px || !tee.bbox) fail(`tee ${index} lacks px or bbox (opaque tee object)`);
      return {
        index, label: String(index + 1),
        center: [...tee.center], bbox: [...tee.bbox], innerBbox: [...tee.innerBbox], angleRad: tee.angleRad,
        px: [...tee.px], pxCount: tee.px.length,
        pxSha256: hash(Buffer.from(tee.px.buffer, tee.px.byteOffset, tee.px.byteLength)),
        detectRings: { fn: tee.has.detectRings.fn, hole: plain(tee.has.detectRings.hole) },
        findFamily: { fn: tee.has.findFamily.fn, frame: plain(tee.has.findFamily.frame) },
        findPx: { fn: tee.has.findPx.fn, parts: plain(tee.has.findPx.parts) }
      };
    });
    const claimed = unionOf(serializedTees.map(t => t.px));
    const claimedVisits = serializedTees.reduce((n, t) => n + t.pxCount, 0);
    const witness = materializeS3Subtraction(captured.S3.image, captured.S3.tees);
    if (witness.teePx !== claimed.size) fail(`serialized tee px union ${claimed.size} != materializer teePx ${witness.teePx}`);
    if (witness.overlapPx !== claimedVisits - claimed.size) fail(`materializer overlapPx ${witness.overlapPx} != serialized visits-union ${claimedVisits - claimed.size}`);
    let witnessZeroed = 0;
    for (let pixel = 0; pixel < witness.widthPx * witness.heightPx; pixel++) if (witness.rgba[pixel * 4 + 3] === 0) witnessZeroed++;
    if (witnessZeroed !== witness.teePx) fail(`materializer raster zeroes ${witnessZeroed} px, expected ${witness.teePx}`);
    if (witness.remainingOpaquePx !== witness.widthPx * witness.heightPx - witness.teePx) fail('materializer remainingOpaquePx does not balance the frame');
    // Full-stack layer integrity vs every prior layer on this same live board.
    const badges = pxc.get(BadgePxC.objects.address);
    const baskets = pxc.get(BasketPxC.objects.address);
    if (!Array.isArray(badges) || !badges.length) fail('px.badges missing on the board; cannot judge the S3 layer against S1');
    if (!Array.isArray(baskets) || !baskets.length) fail('px.baskets missing on the board; cannot judge the S3 layer against S2');
    const s1Owned = unionOf(badges.map(b => [...b.px]));
    const s1Muted = unionOf(badges.map(b => [...b.has.mute.px]));
    const s1Consumed = unionOf([[...s1Owned], [...s1Muted]]);
    const s2Claimed = unionOf(baskets.map(b => [...b.px]));
    const priorConsumed = unionOf([[...s1Consumed], [...s2Claimed]]);
    const framePx = witness.widthPx * witness.heightPx;
    const remainingEntering = framePx - priorConsumed.size;
    const remainingLeaving = remainingEntering - claimed.size;
    const layerIntegrity = {
      framePx,
      s1OwnedPx: s1Owned.size, s1MutedPx: s1Muted.size, s1OwnedSubsetOfMuted: intersect(s1Owned, s1Muted) === s1Owned.size,
      s1ConsumedUnionPx: s1Consumed.size,
      s2ClaimedPx: s2Claimed.size,
      priorConsumedUnionPx: priorConsumed.size,
      remainingEnteringPx: remainingEntering,
      claimedPx: claimed.size, claimedVisits, overlapWithinLayerPx: claimedVisits - claimed.size,
      intersections: {
        vsS1Owned: intersect(claimed, s1Owned), vsS1Muted: intersect(claimed, s1Muted),
        vsS2Claimed: intersect(claimed, s2Claimed), vsPriorConsumed: intersect(claimed, priorConsumed)
      },
      remainingLeavingPx: remainingLeaving,
      balanceHolds: remainingEntering === claimed.size + remainingLeaving
    };
    // Stack agreement with the S2 block's own recorded leaving figure (same
    // run, same board): what S2 said was left must be what S3 found.
    if (s2Materialization) {
      layerIntegrity.s2RecordedRemainingLeavingPx = s2Materialization.layerIntegrity.remainingLeavingPx;
      layerIntegrity.stackAgreesWithS2Record = s2Materialization.layerIntegrity.remainingLeavingPx === remainingEntering;
      if (!layerIntegrity.stackAgreesWithS2Record) fail(`S3 remaining entering ${remainingEntering} != S2 recorded remaining leaving ${s2Materialization.layerIntegrity.remainingLeavingPx}`);
    }
    // Raster recount of the stack arithmetic: canonical raster, zero each
    // prior layer in turn and count, then zero the claimed set and count.
    const layerRgba = new Uint8ClampedArray(captured.S3.image.rgba);
    for (const pixel of s1Consumed) layerRgba[pixel * 4 + 3] = 0;
    for (const pixel of s2Claimed) layerRgba[pixel * 4 + 3] = 0;
    let opaqueEntering = 0;
    for (let pixel = 0; pixel < framePx; pixel++) if (layerRgba[pixel * 4 + 3] !== 0) opaqueEntering++;
    for (const pixel of claimed) layerRgba[pixel * 4 + 3] = 0;
    let opaqueLeaving = 0;
    for (let pixel = 0; pixel < framePx; pixel++) if (layerRgba[pixel * 4 + 3] !== 0) opaqueLeaving++;
    layerIntegrity.rasterRecount = { remainingEnteringPx: opaqueEntering, remainingLeavingPx: opaqueLeaving };
    layerIntegrity.rasterRecountHolds = opaqueEntering === remainingEntering && opaqueLeaving === remainingLeaving;
    if (!layerIntegrity.rasterRecountHolds) fail(`stack raster recount (${opaqueEntering} in, ${opaqueLeaving} out) disagrees with set arithmetic (${remainingEntering} in, ${remainingLeaving} out)`);
    // S1 witness agreement for the bottom of the stack (same run, same board).
    const s1Witness = materializeS1Subtractions(captured.S1);
    layerIntegrity.s1WitnessRemainingAfterMutedPx = s1Witness.muted.remainingOpaquePx;
    layerIntegrity.s1WitnessAgrees = s1Witness.muted.remainingOpaquePx === framePx - s1Consumed.size;
    if (!layerIntegrity.s1WitnessAgrees) fail('S1 witness remaining-after-muted disagrees with the stack arithmetic');
    const { widthPx, heightPx } = witness;
    const artifactDir = join(out, 'artifacts', 's3');
    mkdirSync(artifactDir, { recursive: true });
    const writeArtifact = (id, kind, filename, bytes, dims) => {
      const path = join(artifactDir, filename);
      writeFileSync(path, bytes);
      const reread = readFileSync(path);
      if (hash(reread) !== hash(bytes)) fail(`artifact ${id} hash mismatch after write`);
      return { id, kind, path: `artifacts/s3/${filename}`, sha256: hash(bytes), bytes: bytes.length, ...(dims ? { dims } : {}) };
    };
    const teeSetArtifact = {
      schema: 'nctk-s3-tees-artifact@1', part: 'px.tees', producedBy: 'Tee.findPx',
      guarantee: 'fg.s3.pxTees.materialize', teeCount: serializedTees.length,
      note: 'Tees carry no engine label; label is the 1-based order used by the pinned S3 contract receipt.',
      planFingerprint: captured.S3.plan.planFingerprint,
      image: { widthPx, heightPx },
      totals: { claimedPx: claimed.size, claimedVisits, overlapWithinLayerPx: claimedVisits - claimed.size },
      witness: { teePx: witness.teePx, overlapPx: witness.overlapPx, remainingOpaquePx: witness.remainingOpaquePx },
      layerIntegrity,
      tees: serializedTees
    };
    const artifacts = [
      writeArtifact('px.tees', 'tee-set-json', 'px.tees.json', Buffer.from(json(teeSetArtifact) + '\n')),
      writeArtifact('s3.teePx.rgba', 'rgba', 'teePx.rgba.bin', Buffer.from(witness.rgba.buffer, witness.rgba.byteOffset, witness.rgba.byteLength), { width: widthPx, height: heightPx }),
      writeArtifact('s3.remaining.rgba', 'rgba', 'remaining.rgba.bin', Buffer.from(layerRgba.buffer, layerRgba.byteOffset, layerRgba.byteLength), { width: widthPx, height: heightPx })
    ];
    s3Materialization = {
      guarantee: 'fg.s3.pxTees.materialize', part: 'px.tees', producedBy: 'Tee.findPx',
      teeCount: serializedTees.length,
      planFingerprint: captured.S3.plan.planFingerprint,
      totals: teeSetArtifact.totals,
      witness: teeSetArtifact.witness,
      layerIntegrity,
      checks: {
        objects: serializedTees.every(t => Array.isArray(t.bbox) && t.bbox.length === 4 && Array.isArray(t.innerBbox) && t.innerBbox.length === 4),
        px: serializedTees.every(t => Array.isArray(t.px) && t.pxCount === t.px.length && t.pxCount > 0),
        serializerMatchesMaterializer: true,
        artifactsRehashedAfterWrite: true
      },
      artifacts
    };
    if (!s3Materialization.checks.objects || !s3Materialization.checks.px)
      fail(`tee-set checks failed: ${json(s3Materialization.checks)}`);
    stages.find(s => s.id === 'S3').materialization = s3Materialization;

    // --- fg.s3.pxTeesRingsFamily.materialize: the producing Parts, witnessed
    // by re-executing the provider's pure detectTeeRings over the board's
    // bright mask and the provider's pure selectTeeFamily over the board's
    // measured pairs (the strongest independent checks the provider offers;
    // it ships no rings/family materializer).
    const failRF = (reason) => { throw new Error(`S3 rings/family materialization FunctionalGuarantee failed: ${reason}`); };
    const { detectTeeRings } = dist('detectors/threeFactor/endpoints');
    const { selectTeeFamily } = dist('stages/S3/clean/index');
    const rings = pxc.get(TeePxC.rings.address);
    const family = pxc.get(TeePxC.family.address);
    if (!rings || !family) failRF('px.tees.rings or px.tees.family is missing on the board after S3');
    if (!captured.S3?.rings || captured.S3.rings.candidates.length !== rings.candidates.length) failRF('captured S3 rings disagree with the board px.tees.rings');
    if (!captured.S3?.family || captured.S3.family.members.length !== family.members.length) failRF('captured S3 family disagrees with the board px.tees.family');
    const ringTuple = (r) => [r.cx, r.cy, r.bboxX, r.bboxY, r.bboxW, r.bboxH, r.kind];
    const tupleKey = (t) => JSON.stringify(t);
    const multiset = (tuples) => { const map = new Map(); for (const t of tuples) map.set(tupleKey(t), (map.get(tupleKey(t)) ?? 0) + 1); return map; };
    const multisetEqual = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
    const serializedRings = {
      enclosed: rings.enclosed.map(r => plain(r)),
      elongated: rings.elongated.map(r => plain(r)),
      excludedByBadge: rings.excludedByBadge.map(r => plain(r)),
      candidates: rings.candidates.map(r => plain(r))
    };
    // Witness 1: enclosed holes re-derived from the board's bright mask.
    const fields = pxc.get(ComponentPxC.fields.address);
    if (!fields?.bright?.mask) failRF('component fields bright mask missing on the board; cannot witness rings');
    const witnessEnclosed = detectTeeRings(fields.bright.mask);
    const serializedEnclosedTuples = serializedRings.enclosed.map(ringTuple);
    const witnessEnclosedTuples = witnessEnclosed.map(ringTuple);
    if (!multisetEqual(multiset(serializedEnclosedTuples), multiset(witnessEnclosedTuples)))
      failRF(`serialized enclosed rings (${serializedEnclosedTuples.length}) != detectTeeRings witness (${witnessEnclosedTuples.length}) or their geometry differs`);
    // Partition closure: elongated subset of enclosed; candidates and
    // excludedByBadge partition the elongated set exactly.
    const enclosedSet = multiset(serializedEnclosedTuples);
    for (const t of serializedRings.elongated.map(ringTuple)) if (!enclosedSet.get(tupleKey(t))) failRF('an elongated ring is not among the enclosed rings');
    const partitionUnion = multiset([...serializedRings.candidates.map(ringTuple), ...serializedRings.excludedByBadge.map(ringTuple)]);
    if (!multisetEqual(partitionUnion, multiset(serializedRings.elongated.map(ringTuple))))
      failRF('candidates + excludedByBadge do not partition the elongated rings exactly');
    // Family serialization and closure vs the candidate rings.
    const memberView = (m) => ({ ring: plain(m.ring), frame: plain(m.frame) });
    const serializedFamily = {
      measured: family.measured.map(memberView),
      unframed: family.unframed.map(r => plain(r)),
      members: family.members.map(memberView),
      anchor: family.anchor ? memberView(family.anchor) : null
    };
    const framedUnion = multiset([...serializedFamily.measured.map(m => ringTuple(m.ring)), ...serializedFamily.unframed.map(ringTuple)]);
    if (!multisetEqual(framedUnion, multiset(serializedRings.candidates.map(ringTuple))))
      failRF('measured rings + unframed rings do not reproduce the candidate rings exactly');
    // Witness 2: family selection re-run over the board's measured pairs.
    const witnessFamily = selectTeeFamily(family.measured);
    const witnessMemberTuples = witnessFamily.members.map(m => ringTuple(m.ring));
    const serializedMemberTuples = serializedFamily.members.map(m => ringTuple(m.ring));
    if (!multisetEqual(multiset(witnessMemberTuples), multiset(serializedMemberTuples)))
      failRF(`serialized family members (${serializedMemberTuples.length}) != selectTeeFamily witness (${witnessMemberTuples.length}) or their rings differ`);
    const witnessAnchorTuple = witnessFamily.anchor ? ringTuple(witnessFamily.anchor.ring) : null;
    const serializedAnchorTuple = serializedFamily.anchor ? ringTuple(serializedFamily.anchor.ring) : null;
    if (tupleKey(witnessAnchorTuple) !== tupleKey(serializedAnchorTuple))
      failRF('serialized family anchor disagrees with the selectTeeFamily witness anchor');
    // Tee linkage: every tee's ring is a family member ring, counts agree.
    if (serializedTees.length !== serializedFamily.members.length)
      failRF(`tee count ${serializedTees.length} != family member count ${serializedFamily.members.length}`);
    const memberRingSet = new Set(serializedMemberTuples.map(tupleKey));
    for (const t of serializedTees) if (!memberRingSet.has(tupleKey(ringTuple(t.detectRings.hole)))) failRF(`tee ${t.index} ring is not a family member ring`);
    const ringsFamilyArtifact = {
      schema: 'nctk-s3-rings-family-artifact@1', parts: ['px.tees.rings', 'px.tees.family'], producedBy: 'Tee.detectRings + Tee.findFamily',
      guarantee: 'fg.s3.pxTeesRingsFamily.materialize',
      planFingerprint: captured.S3.plan.planFingerprint,
      image: { widthPx, heightPx },
      counts: {
        enclosed: serializedRings.enclosed.length, elongated: serializedRings.elongated.length,
        excludedByBadge: serializedRings.excludedByBadge.length, candidates: serializedRings.candidates.length,
        measured: serializedFamily.measured.length, unframed: serializedFamily.unframed.length,
        members: serializedFamily.members.length
      },
      witnesses: {
        detectTeeRings: { enclosedCount: witnessEnclosedTuples.length, exact: true },
        selectTeeFamily: { memberCount: witnessMemberTuples.length, anchorExact: true }
      },
      rings: serializedRings,
      family: serializedFamily
    };
    const rfArtifacts = [
      writeArtifact('px.tees.rings-family', 'rings-family-json', 'px.tees.rings-family.json', Buffer.from(json(ringsFamilyArtifact) + '\n'))
    ];
    s3RingsFamilyMaterialization = {
      guarantee: 'fg.s3.pxTeesRingsFamily.materialize', parts: ['px.tees.rings', 'px.tees.family'], producedBy: 'Tee.detectRings + Tee.findFamily',
      counts: ringsFamilyArtifact.counts,
      witnesses: ringsFamilyArtifact.witnesses,
      checks: {
        enclosedMatchesWitness: true,
        partitionClosed: true,
        familyMatchesWitness: true,
        teeLinkage: true,
        artifactsRehashedAfterWrite: true
      },
      artifacts: rfArtifacts
    };
    stages.find(s => s.id === 'S3').ringsFamilyMaterialization = s3RingsFamilyMaterialization;

    // --- Declared spec delta refine.s3.findFamily.structural (stages/s3.json)
    // and its materialization guarantee fg.s3.pxTeesFamilyFix.materialize.
    // Lane s3-findfamily-structural-fix, default OFF: with the lane off, none
    // of this runs and the stage reproduces the pinned baseline exactly.
    // With the lane on, a branch from the S3 snapshot runs the toolkit-layer
    // structural refinement of fn.Tee.findFamily (ports/early/s3FamilyFix.mjs)
    // over the pinned rings/family Parts. The base board is never written;
    // the corrected family and tee set live only on the branch and in these
    // artifacts. The delta against the baseline is RECORDED, not gated: the
    // guarantee certifies the materialization is faithful, and any delta
    // other than the declared specimen expectation is a finding.
    if (experiments.includes('S3FIX')) {
      const failFix = (reason) => { throw new Error(`S3 findFamily structural-fix materialization FunctionalGuarantee failed: ${reason}`); };
      const { executeCompiledPlan } = dist('exec/gateway');
      const { nullFeatureContext } = dist('detectors/threeFactor/features/types');
      const { createMemorySink } = dist('exec/sink');
      const { sha256HexSyncText } = dist('exec/sha256');
      const { Tee } = dist('stages/S3/clean/Tee');
      const { componentRef, materializeRasterComponentPixels } = dist('detectors/threeFactor/componentAssembly');
      const canon = (value) => Array.isArray(value) ? `[${value.map(canon).join(',')}]`
        : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canon(value[k])}`).join(',')}}`
        : JSON.stringify(value) ?? 'null';
      const fixOp = {
        id: 'early.S3.findFamilyStructuralFix', kind: 'measure', gate: 'shared', unit: 'early-s3-findfamily-fix',
        consumes: [TeePxC.rings.address, TeePxC.family.address, ComponentPxC.fields.address, ComponentPxC.image.address, BadgePxC.objects.address, BasketPxC.objects.address, TeePxC.objects.address],
        produces: [FAMILY_FIX.familyPart, FAMILY_FIX.teesPart], calculations: [FAMILY_FIX.refinedCalculation], accessConformance: 'exact',
        note: 'Declared spec delta refine.s3.findFamily.structural: membership in px.tees.family becomes structural (anchored pad model, fitted-size / border / band / interior / whiteness tests, occlusion excuses only by named prior-layer Parts) instead of resemblance-based. Branch from the S3 snapshot; base emissions unchanged.'
      };
      const runFixBranch = () => {
        const branch = restorePxC(stageSnapshots.S3);
        const before = hash(branch.get(ComponentPxC.image.address).rgba);
        let fixResult = null;
        const calculate = (ringsIn, familyIn, fieldsIn, imageIn, badgesIn, basketsIn, baseTeesIn) => {
          const byRing = new Map(baseTeesIn.map(t => [ringKeyOf(t.has.detectRings.hole), t]));
          const makeTee = (member) => {
            const existing = byRing.get(ringKeyOf(member.ring));
            if (existing) return existing;
            const frame = componentRef('bright', member.frame);
            const raster = { width: fieldsIn.bright.mask.width, height: fieldsIn.bright.mask.height, topPx: 0, brightLabels: fieldsIn.bright.labels, darkLabels: fieldsIn.dark.labels };
            return new Tee(member, { frame, px: materializeRasterComponentPixels(frame, raster) });
          };
          fixResult = computeFamilyFix({ rings: ringsIn, family: familyIn, fields: fieldsIn, image: imageIn, badges: badgesIn, baskets: basketsIn, makeTee });
          return fixResult.familyPart;
        };
        const plan = { ops: [fixOp], bindings: {}, planFingerprint: sha256HexSyncText(JSON.stringify(fixOp)) };
        const runtime = {
          implementations: new Map([[fixOp.id, (board) => { const part = calculate(...fixOp.consumes.map((address) => board.get(address))); board.set(FAMILY_FIX.familyPart, part); board.set(FAMILY_FIX.teesPart, fixResult.tees); }]]),
          calculationBindings: new Map([[fixOp.id, [{ address: FAMILY_FIX.refinedCalculation, calculate }]]])
        };
        const ticks = executePlanInstrumented(instrumentation, 's3.findFamilyStructuralFix', executeCompiledPlan, plan, branch, nullFeatureContext, createMemorySink(), runtime);
        const after = hash(branch.get(ComponentPxC.image.address).rgba);
        if (before !== after || before !== initialPixels) throw new Error('S3 findFamily structural-fix branch mutated canonical pixels');
        return { branch, ticks, fixResult };
      };
      const branchA = runFixBranch();
      const familyPart = branchA.branch.get(FAMILY_FIX.familyPart);
      const refinedTees = branchA.branch.get(FAMILY_FIX.teesPart);
      if (!familyPart || !Array.isArray(refinedTees)) failFix('branch did not produce px.tees.familyRefined / px.tees.refined');
      const rowsByRingKey = new Map(branchA.fixResult.rows.map(r => [ringKeyOf(r.ring), r]));
      const serializedRefinedTees = refinedTees.map((tee, index) => {
        const row = rowsByRingKey.get(ringKeyOf(tee.has.detectRings.hole));
        return {
          index, label: String(index + 1),
          center: [...tee.center], bbox: [...tee.bbox], innerBbox: [...tee.innerBbox], angleRad: tee.angleRad,
          px: [...tee.px], pxCount: tee.px.length,
          pxSha256: hash(Buffer.from(tee.px.buffer, tee.px.byteOffset, tee.px.byteLength)),
          baselineIndex: row?.baselineMember ? row.baselineMember - 1 : null,
          baselineLabel: row?.baselineMember ? String(row.baselineMember) : null,
          verdict: row?.verdict ?? null,
          detectRings: { fn: tee.has.detectRings.fn, hole: plain(tee.has.detectRings.hole) },
          findFamily: { fn: FAMILY_FIX.refinedCalculation, frame: plain(tee.has.findFamily.frame) },
          findPx: { fn: tee.has.findPx.fn, parts: plain(tee.has.findPx.parts) }
        };
      });
      const teeTuple = (t) => [t.center, t.bbox, t.innerBbox, t.angleRad, t.pxCount, t.pxSha256];
      // Witness 1: deterministic re-execution of the refined Calculation on a
      // second restored branch must reproduce the family Part and the
      // corrected tee tuples exactly.
      const branchB = runFixBranch();
      const canonicalA = hash(canon({ part: familyPart, tees: serializedRefinedTees.map(teeTuple) }));
      const partB = branchB.branch.get(FAMILY_FIX.familyPart);
      const teesB = branchB.branch.get(FAMILY_FIX.teesPart).map((tee) => ({
        center: [...tee.center], bbox: [...tee.bbox], innerBbox: [...tee.innerBbox], angleRad: tee.angleRad,
        pxCount: tee.px.length, pxSha256: hash(Buffer.from(tee.px.buffer, tee.px.byteOffset, tee.px.byteLength))
      }));
      const canonicalB = hash(canon({ part: partB, tees: teesB.map(teeTuple) }));
      if (canonicalA !== canonicalB) failFix('re-execution of the refined findFamily on a second branch disagrees with the first');
      // Witness 2: independent re-derivation of every verdict from the
      // serialized baseline rings/family Parts and the board rasters (a
      // separate code path in s3FamilyFix.mjs that never sees the branch
      // result). The serialized ledger must match it row for row.
      const witness = rederiveFamilyFixVerdicts({ ringsPlain: serializedRings, familyPlain: serializedFamily, fields, image: captured.S3.image, badges, baskets });
      if (familyPart.candidates.length !== witness.rows.length)
        failFix(`serialized verdict rows (${familyPart.candidates.length}) != witness rows (${witness.rows.length})`);
      if (canon(familyPart.model) !== canon(witness.model))
        failFix(`serialized pad model disagrees with the witness model: ${canon(familyPart.model)} vs ${canon(witness.model)}`);
      for (let i = 0; i < witness.rows.length; i++) {
        const s = familyPart.candidates[i], w = witness.rows[i];
        if (s.index !== w.index || s.baselineMember !== w.baselineMember || s.anchor !== w.anchor || s.verdict !== w.verdict
          || canon(s.failedTests) !== canon(w.failedTests) || canon(s.tests) !== canon(w.tests)
          || canon(s.measurements) !== canon(w.measurements))
          failFix(`verdict row ${i} disagrees with the independent re-derivation (serialized ${s.verdict}/${JSON.stringify(s.failedTests)}, witness ${w.verdict}/${JSON.stringify(w.failedTests)})`);
        if (ringKeyOf(s.ring) !== w.ringKey) failFix(`verdict row ${i} ring disagrees with the baseline candidate ring`);
      }
      // Partition closure: every candidate appears in exactly one pile, and
      // the corrected family is exactly admitted + excused.
      if (familyPart.candidates.length !== serializedRings.candidates.length)
        failFix(`verdict rows (${familyPart.candidates.length}) != baseline candidate count (${serializedRings.candidates.length})`);
      const pileIndices = [...familyPart.piles.admitted, ...familyPart.piles.excused, ...familyPart.piles.eliminated].sort((a, b) => a - b);
      if (canon(pileIndices) !== canon(familyPart.candidates.map(c => c.index)))
        failFix('verdict piles do not partition the candidate set exactly');
      const correctedKeys = new Set(familyPart.correctedFamily.members.map(m => ringKeyOf(m.ring)));
      const pileKeys = new Set(familyPart.candidates.filter(c => c.verdict !== 'ELIMINATED').map(c => ringKeyOf(c.ring)));
      if (canon([...correctedKeys].sort()) !== canon([...pileKeys].sort()))
        failFix('corrected family members are not exactly the admitted + excused candidates');
      if (serializedRefinedTees.length !== familyPart.correctedFamily.members.length)
        failFix(`refined tee count ${serializedRefinedTees.length} != corrected member count ${familyPart.correctedFamily.members.length}`);
      // Admitted/excused baseline members keep their baseline tee identity:
      // the corrected set reuses the baseline tee objects, so tuples must be
      // identical to the witnessed baseline serialization.
      for (const t of serializedRefinedTees) {
        if (t.baselineIndex === null) continue;
        const base = serializedTees[t.baselineIndex];
        if (canon(teeTuple(t)) !== canon(teeTuple(base)))
          failFix(`refined tee ${t.index} (baseline tee ${t.baselineLabel}) tuple differs from its baseline tuple`);
      }
      // The delta against the pinned baseline, recorded as data.
      const delta = {
        baselineTeeCount: serializedTees.length, correctedTeeCount: serializedRefinedTees.length,
        eliminatedBaselineMembers: familyPart.candidates.filter(c => c.baselineMember && c.verdict === 'ELIMINATED')
          .map(c => ({ baselineLabel: String(c.baselineMember), center: [c.ring.cx, c.ring.cy], failedTests: c.failedTests })),
        excusedBaselineMembers: familyPart.candidates.filter(c => c.baselineMember && c.verdict === 'EXCUSED')
          .map(c => ({ baselineLabel: String(c.baselineMember), center: [c.ring.cx, c.ring.cy], failedTests: c.failedTests, occluders: c.measurements.missingEvidence?.byOccluder ?? null })),
        admittedBaselineMembers: familyPart.candidates.filter(c => c.baselineMember && c.verdict === 'ADMITTED').map(c => String(c.baselineMember)),
        admittedNonMembers: familyPart.candidates.filter(c => !c.baselineMember && c.verdict === 'ADMITTED')
          .map(c => ({ center: [c.ring.cx, c.ring.cy], framed: c.framed })),
        excusedNonMembers: familyPart.candidates.filter(c => !c.baselineMember && c.verdict === 'EXCUSED')
          .map(c => ({ center: [c.ring.cx, c.ring.cy], framed: c.framed, failedTests: c.failedTests })),
        eliminatedNonMembers: familyPart.candidates.filter(c => !c.baselineMember && c.verdict === 'ELIMINATED')
          .map(c => ({ center: [c.ring.cx, c.ring.cy], framed: c.framed, failedTests: c.failedTests })),
        declaredSpecimenExpectation: { eliminatedBaselineLabels: ['16', '17', '18'], admittedNonMembers: 0, excusedBaselineMembers: 0 },
        matchesDeclaredSpecimenExpectation: null
      };
      delta.matchesDeclaredSpecimenExpectation =
        canon(delta.eliminatedBaselineMembers.map(x => x.baselineLabel)) === canon(delta.declaredSpecimenExpectation.eliminatedBaselineLabels)
        && delta.admittedNonMembers.length === 0 && delta.excusedBaselineMembers.length === 0
        && delta.admittedBaselineMembers.length === delta.baselineTeeCount - 3;
      // Renderer-binding rasters: canonical RGB with alpha zeroed on exactly
      // the set each artifact claims (corrected tee union; eliminated framed
      // candidates' frame-component px).
      const refinedUnion = unionOf(serializedRefinedTees.map(t => t.px));
      const refinedRgba = new Uint8ClampedArray(captured.S3.image.rgba);
      for (const pixel of refinedUnion) refinedRgba[pixel * 4 + 3] = 0;
      let refinedZeroed = 0;
      for (let pixel = 0; pixel < framePx; pixel++) if (refinedRgba[pixel * 4 + 3] === 0) refinedZeroed++;
      if (refinedZeroed !== refinedUnion.size) failFix(`refined raster zeroes ${refinedZeroed} px, expected the refined union ${refinedUnion.size}`);
      const eliminatedFramed = familyPart.candidates.filter(c => c.verdict === 'ELIMINATED' && c.framed);
      let elimSeq = 0;
      const serializedEliminated = eliminatedFramed.map((c) => {
        const px = [];
        for (let i = 0; i < fields.bright.labels.length; i++) if (fields.bright.labels[i] === c.frame.label) px.push(i);
        return {
          label: c.baselineMember ? String(c.baselineMember) : `X${++elimSeq}`,
          baselineLabel: c.baselineMember ? String(c.baselineMember) : null,
          center: [c.ring.cx, c.ring.cy], bbox: [c.frame.bboxX, c.frame.bboxY, c.frame.bboxW, c.frame.bboxH],
          ringBbox: [c.ring.bboxX, c.ring.bboxY, c.ring.bboxW, c.ring.bboxH],
          failedTests: c.failedTests, px, pxCount: px.length,
          pxSha256: hash(Buffer.from(Uint32Array.from(px).buffer))
        };
      });
      const eliminatedUnion = unionOf(serializedEliminated.map(t => t.px));
      const eliminatedRgba = new Uint8ClampedArray(captured.S3.image.rgba);
      for (const pixel of eliminatedUnion) eliminatedRgba[pixel * 4 + 3] = 0;
      let eliminatedZeroed = 0;
      for (let pixel = 0; pixel < framePx; pixel++) if (eliminatedRgba[pixel * 4 + 3] === 0) eliminatedZeroed++;
      if (eliminatedZeroed !== eliminatedUnion.size) failFix(`eliminated raster zeroes ${eliminatedZeroed} px, expected the eliminated union ${eliminatedUnion.size}`);
      const fixArtifactDir = join(out, 'artifacts', 's3fix');
      mkdirSync(fixArtifactDir, { recursive: true });
      const writeFixArtifact = (id, kind, filename, bytes, dims) => {
        const path = join(fixArtifactDir, filename);
        writeFileSync(path, bytes);
        const reread = readFileSync(path);
        if (hash(reread) !== hash(bytes)) failFix(`artifact ${id} hash mismatch after write`);
        return { id, kind, path: `artifacts/s3fix/${filename}`, sha256: hash(bytes), bytes: bytes.length, ...(dims ? { dims } : {}) };
      };
      const familyRefinedArtifact = {
        schema: 'nctk-s3-family-refined-artifact@1', parts: [FAMILY_FIX.familyPart, FAMILY_FIX.teesPart],
        guarantee: 'fg.s3.pxTeesFamilyFix.materialize', specDelta: FAMILY_FIX.specDelta,
        calculation: FAMILY_FIX.calculation, refinedCalculation: FAMILY_FIX.refinedCalculation,
        planFingerprint: captured.S3.plan.planFingerprint,
        image: { widthPx, heightPx }, boundsRule: FIX_BOUNDS,
        model: familyPart.model, counts: familyPart.counts,
        candidates: familyPart.candidates, correctedFamily: familyPart.correctedFamily, piles: familyPart.piles,
        witnesses: {
          reexecution: { canonicalSha256: canonicalA, exact: true },
          rederivation: { rowsChecked: witness.rows.length, exact: true }
        },
        delta
      };
      const refinedSetArtifact = {
        schema: 'nctk-s3-tees-refined-artifact@1', part: FAMILY_FIX.teesPart, producedBy: FAMILY_FIX.refinedCalculation,
        guarantee: 'fg.s3.pxTeesFamilyFix.materialize', teeCount: serializedRefinedTees.length,
        note: 'Corrected tee set under the declared spec delta. Labels are the corrected order; baselineLabel records the baseline tee identity for members carried over unchanged.',
        planFingerprint: captured.S3.plan.planFingerprint,
        image: { widthPx, heightPx },
        totals: { claimedPx: refinedUnion.size, claimedVisits: serializedRefinedTees.reduce((n, t) => n + t.pxCount, 0) },
        tees: serializedRefinedTees
      };
      const eliminatedSetArtifact = {
        schema: 'nctk-s3-tees-eliminated-artifact@1', part: 'px.tees.eliminated', producedBy: FAMILY_FIX.refinedCalculation,
        guarantee: 'fg.s3.pxTeesFamilyFix.materialize', teeCount: serializedEliminated.length,
        note: 'Eliminated FRAMED candidates only: the set is each candidate frame component px. Eliminated unframed candidates have no frame pixel set and live in the verdict ledger (px.tees.family-refined.json) only.',
        planFingerprint: captured.S3.plan.planFingerprint,
        image: { widthPx, heightPx },
        totals: { claimedPx: eliminatedUnion.size },
        tees: serializedEliminated
      };
      const fixArtifacts = [
        writeFixArtifact('px.tees.familyRefined', 'family-refined-json', 'px.tees.family-refined.json', Buffer.from(json(familyRefinedArtifact) + '\n')),
        writeFixArtifact('px.tees.refined', 'tee-set-json', 'px.tees.refined.json', Buffer.from(json(refinedSetArtifact) + '\n')),
        writeFixArtifact('s3fix.refinedPx.rgba', 'rgba', 'refinedPx.rgba.bin', Buffer.from(refinedRgba.buffer, refinedRgba.byteOffset, refinedRgba.byteLength), { width: widthPx, height: heightPx }),
        writeFixArtifact('px.tees.eliminated', 'eliminated-set-json', 'px.tees.eliminated.json', Buffer.from(json(eliminatedSetArtifact) + '\n')),
        writeFixArtifact('s3fix.eliminatedPx.rgba', 'rgba', 'eliminatedPx.rgba.bin', Buffer.from(eliminatedRgba.buffer, eliminatedRgba.byteOffset, eliminatedRgba.byteLength), { width: widthPx, height: heightPx })
      ];
      // Serializer fidelity and artifact re-read: the serialized px arrays
      // must equal the branch Part's tee objects element for element, and
      // the artifacts on disk must re-read to exactly what was serialized.
      for (let i = 0; i < refinedTees.length; i++)
        if (canon(serializedRefinedTees[i].px) !== canon([...refinedTees[i].px]))
          failFix(`serialized refined tee ${i} px differs from the branch Part tee object`);
      const rereadFamily = JSON.parse(readFileSync(join(fixArtifactDir, 'px.tees.family-refined.json'), 'utf8'));
      if (canon(rereadFamily.candidates) !== canon(familyPart.candidates) || canon(rereadFamily.model) !== canon(familyPart.model)
        || canon(rereadFamily.counts) !== canon(familyPart.counts) || canon(rereadFamily.delta) !== canon(delta))
        failFix('re-read family-refined artifact disagrees with the serialized verdict ledger');
      const rereadRefined = JSON.parse(readFileSync(join(fixArtifactDir, 'px.tees.refined.json'), 'utf8'));
      if (rereadRefined.teeCount !== serializedRefinedTees.length || canon(rereadRefined.tees.map(t => t.px)) !== canon(serializedRefinedTees.map(t => t.px)))
        failFix('re-read refined tee artifact disagrees with the serialized corrected tee set');
      s3FamilyFixMaterialization = {
        guarantee: 'fg.s3.pxTeesFamilyFix.materialize', specDelta: FAMILY_FIX.specDelta,
        parts: [FAMILY_FIX.familyPart, FAMILY_FIX.teesPart], producedBy: FAMILY_FIX.refinedCalculation,
        planFingerprint: captured.S3.plan.planFingerprint,
        counts: familyPart.counts, model: familyPart.model, delta,
        witnesses: familyRefinedArtifact.witnesses,
        checks: {
          partitionClosed: true, serializerMatchesRederivation: true, reexecutionExact: true,
          correctedMembersAreAdmittedPlusExcused: true, baselineTuplesPreserved: true,
          serializerMatchesBranchPart: true, rastersRecounted: true,
          artifactsRehashedAfterWrite: true, artifactsReReadAndCompared: true
        },
        artifacts: fixArtifacts
      };
      stages.find(s => s.id === 'S3').familyFixMaterialization = s3FamilyFixMaterialization;
      s3FixBranchEvidence = {
        mode: 'ON', status: 'SPEC_DELTA_ORACLE_UNKNOWN', lane: 's3-findfamily-structural-fix',
        baseSnapshotSha256: hash(stageSnapshots.S3),
        benefit: 'Membership in the tee family becomes a structural verdict per candidate, so same-scale map chrome is eliminated at S3 with named failed tests instead of surviving to S4 attrition.',
        falsifier: 'A genuine pad is eliminated or excused, a chrome candidate is admitted, or an admitted tee tuple differs from the pinned baseline tuple.',
        oracle: 'UNKNOWN', partAddress: FAMILY_FIX.familyPart, teesPartAddress: FAMILY_FIX.teesPart,
        counts: familyPart.counts, delta,
        canonicalRgbaSha256Off: stages[stageOrder.indexOf('S3')].canonicalRgbaSha256, canonicalRgbaSha256On: hash(branchA.branch.get(ComponentPxC.image.address).rgba),
        ticks: branchA.ticks.map(t => ({ id: t.opId, declared: { consumes: fixOp.consumes, produces: fixOp.produces, calculations: fixOp.calculations }, actual: { consumes: t.actualConsumes, produces: t.actualProduces, writes: t.writes }, frozenCalculations: t.frozenCalculations }))
      };
    }
  }

  // --- Declared spec delta refine.s3.teeAssembly.interiorFirst (stages/s3.json)
  // and its materialization guarantee fg.s3.pxTees.assembly. Lane
  // s3-tee-assembly, default OFF: with the lane off, none of this runs and
  // the stage reproduces the pinned baseline exactly. With the lane on, a
  // branch from the S3 snapshot runs the toolkit-layer interior-first tee
  // assembly Calculation (ports/early/s3TeeAssembly.mjs) over the pinned
  // S3 evidence (the tee's findPx frame component ref materialized against
  // the bright label field; the interior derived from the bright mask as
  // the enclosed complement component and gated exactly against the ring's
  // recorded holeArea and bbox), never over the finished px.tees set as a
  // component. The base board is never written; the assembly Part lives
  // only on the branch and in its artifact. This delta is additive, not a
  // reproduction: the gates are that the frame reproduces the baseline tee
  // px element for element, the interior equals the ring record exactly,
  // and the overlap is zero; a differing tee fails the run with its
  // differing pixel count named.
  let s3TeeAssemblyMaterialization = null;
  let s3AssemblyBranchEvidence = null;
  if (lastIndex >= 3 && experiments.includes('S3ASM')) {
    const failAsm = (reason) => { throw new Error(`S3 tee assembly FunctionalGuarantee failed: ${reason}`); };
    if (!s3Materialization) failAsm('the fg.s3.pxTees.materialize record is missing; the assembly has no baseline totals to gate against');
    const { executeCompiledPlan } = dist('exec/gateway');
    const { nullFeatureContext } = dist('detectors/threeFactor/features/types');
    const { createMemorySink } = dist('exec/sink');
    const { sha256HexSyncText } = dist('exec/sha256');
    const canon = (value) => Array.isArray(value) ? `[${value.map(canon).join(',')}]`
      : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canon(value[k])}`).join(',')}}`
      : JSON.stringify(value) ?? 'null';
    const asmOp = {
      id: 'early.S3.teeAssembly', kind: 'measure', gate: 'shared', unit: 'early-s3-tee-assembly',
      consumes: [TeePxC.objects.address, TeePxC.rings.address, ComponentPxC.fields.address],
      produces: [TEE_ASSEMBLY.part], calculations: [TEE_ASSEMBLY.assemblyCalculation], accessConformance: 'exact',
      note: 'Declared spec delta refine.s3.teeAssembly.interiorFirst: each baseline Tee Part is assembled whole from its evidence through the phase-1 assembly shape with the enclosed interior as the declared base and the frame component fused onto it, the ring center carried as the anchor, and window ownership accounted against the frame bbox. Branch from the S3 snapshot; base emissions unchanged.'
    };
    const runAssemblyBranch = () => {
      const branch = restorePxC(stageSnapshots.S3);
      for (const address of asmOp.consumes)
        if (!branch.has(address)) failAsm(`restored S3 branch is missing ${address}; the tee component evidence is not exposed on the S3 snapshot`);
      const before = hash(branch.get(ComponentPxC.image.address).rgba);
      let asmPart = null;
      const calculate = (teesIn, ringsIn, fieldsIn) => {
        asmPart = computeTeeAssembly({ tees: teesIn, rings: ringsIn, fields: fieldsIn });
        return asmPart;
      };
      const plan = { ops: [asmOp], bindings: {}, planFingerprint: sha256HexSyncText(JSON.stringify(asmOp)) };
      const runtime = {
        implementations: new Map([[asmOp.id, (board) => { const part = calculate(...asmOp.consumes.map((address) => board.get(address))); board.set(TEE_ASSEMBLY.part, part); }]]),
        calculationBindings: new Map([[asmOp.id, [{ address: TEE_ASSEMBLY.assemblyCalculation, calculate }]]])
      };
      const ticks = executePlanInstrumented(instrumentation, 's3.teeAssembly', executeCompiledPlan, plan, branch, nullFeatureContext, createMemorySink(), runtime);
      const after = hash(branch.get(ComponentPxC.image.address).rgba);
      if (before !== after || before !== initialPixels) failAsm('tee assembly branch mutated canonical pixels');
      return { branch, ticks, asmPart };
    };
    const branchA = runAssemblyBranch();
    const assemblyPart = branchA.branch.get(TEE_ASSEMBLY.part);
    if (!assemblyPart || !Array.isArray(assemblyPart.tees)) failAsm('branch did not produce px.tees.assembly');
    // Exact delta gates against the accepted baseline on this same live
    // board (the objects fg.s3.pxTees.materialize serialized).
    const baseTees = pxc.get(TeePxC.objects.address);
    if (assemblyPart.tees.length !== baseTees.length)
      failAsm(`assembly tee count ${assemblyPart.tees.length} != baseline px.tees count ${baseTees.length}`);
    const reproduction = assemblyPart.tees.map((rec, i) => {
      const baseSet = new Set(baseTees[i].px);
      const frameSet = new Set(rec.components[1].px);
      let frameDifferingPx = 0;
      for (const p of baseSet) if (!frameSet.has(p)) frameDifferingPx++;
      for (const p of frameSet) if (!baseSet.has(p)) frameDifferingPx++;
      return {
        index: i, label: rec.label,
        framePxCount: rec.components[1].pxCount, baselinePxCount: baseSet.size,
        interiorPxCount: rec.components[0].pxCount, holeArea: rec.ring.holeArea,
        fusedPxCount: rec.fusedPxCount,
        componentOverlapPx: rec.componentOverlapPx,
        residuePx: rec.residuePx,
        anchor: rec.anchor.value, frameCentroid: rec.anchor.frameCentroid,
        anchorDistancePx: rec.anchor.distanceToFrameCentroidPx,
        frameDifferingPx, interiorDifferingPx: Math.abs(rec.components[0].pxCount - rec.ring.holeArea),
        exact: frameDifferingPx === 0 && rec.components[1].pxCount === baseSet.size && rec.components[0].pxCount === rec.ring.holeArea
      };
    });
    const inexact = reproduction.filter(r => !r.exact);
    if (inexact.length)
      failAsm(`interior-first assembly does not meet the delta gates: ${inexact.map(r => `tee ${r.label} frame differs by ${r.frameDifferingPx} px (assembly frame ${r.framePxCount} vs baseline ${r.baselinePxCount}), interior differs by ${r.interiorDifferingPx} px (derived ${r.interiorPxCount} vs ring holeArea ${r.holeArea})`).join('; ')}`);
    const overlapping = reproduction.filter(r => r.componentOverlapPx !== 0);
    if (overlapping.length)
      failAsm(`tee component overlap is nonzero: ${overlapping.map(r => `tee ${r.label} overlaps by ${r.componentOverlapPx} px`).join('; ')}`);
    if (assemblyPart.totals.frameUnionPx !== s3Materialization.totals.claimedPx)
      failAsm(`assembly frame union ${assemblyPart.totals.frameUnionPx} != fg.s3 baseline claimedPx union ${s3Materialization.totals.claimedPx}`);
    if (assemblyPart.totals.fusedUnionPx !== assemblyPart.totals.frameUnionPx + assemblyPart.totals.interiorUnionPx)
      failAsm(`assembly fused union ${assemblyPart.totals.fusedUnionPx} != frame union ${assemblyPart.totals.frameUnionPx} + interior union ${assemblyPart.totals.interiorUnionPx}`);
    const outsideWindow = assemblyPart.tees.filter(r => r.ownership.ownedOutsideWindowPx !== 0);
    if (outsideWindow.length)
      failAsm(`tees owning px outside their frame window: ${outsideWindow.map(r => `tee ${r.label} owns ${r.ownership.ownedOutsideWindowPx} px outside`).join('; ')}`);
    // Witness 1: deterministic re-execution of the assembly Calculation on
    // a second restored branch must reproduce the assembly Part exactly.
    const branchB = runAssemblyBranch();
    const canonicalAsm = hash(canon(assemblyPart));
    if (hash(canon(branchB.asmPart)) !== canonicalAsm)
      failAsm('re-execution of the tee assembly Calculation on a second branch disagrees with the first');
    // Witness 2: independent re-derivation of tee 1's interior from the
    // raster fields by a separate code path that never reads the tee's
    // findPx component refs or its ring record; the derived set must
    // match the assembly exactly.
    const fields = pxc.get(ComponentPxC.fields.address);
    const witnessIndex = 0;
    const witness = rederiveTeeInterior({ tee: baseTees[witnessIndex], fields });
    const wRec = assemblyPart.tees[witnessIndex];
    const samePx = (a, b) => canon([...a].sort((x, y) => x - y)) === canon([...b].sort((x, y) => x - y));
    const wInterior = wRec.components.find(c => c.name === 'interior');
    if (!samePx(witness.interior.px, wInterior.px)) failAsm('independent witness interior set disagrees with the assembly for tee 1');
    const witnessRecord = {
      teeLabel: wRec.label, teeIndex: witnessIndex,
      interiorPx: witness.interior.px.length, holeArea: wRec.ring.holeArea,
      exact: true
    };
    const asmArtifactDir = join(out, 'artifacts', 's3assembly');
    mkdirSync(asmArtifactDir, { recursive: true });
    const writeAsmArtifact = (id, kind, filename, bytes) => {
      const path = join(asmArtifactDir, filename);
      writeFileSync(path, bytes);
      const reread = readFileSync(path);
      if (hash(reread) !== hash(bytes)) failAsm(`artifact ${id} hash mismatch after write`);
      return { id, kind, path: `artifacts/s3assembly/${filename}`, sha256: hash(bytes), bytes: bytes.length };
    };
    const assemblyArtifact = {
      schema: 'nctk-s3-tee-assembly-artifact@1', part: TEE_ASSEMBLY.part, producedBy: TEE_ASSEMBLY.assemblyCalculation,
      guarantee: 'fg.s3.pxTees.assembly', specDelta: TEE_ASSEMBLY.specDelta, calculation: TEE_ASSEMBLY.calculation,
      image: assemblyPart.image, totals: assemblyPart.totals, emits: assemblyPart.emits,
      reproduction,
      witnesses: {
        reexecution: { canonicalSha256: canonicalAsm, exact: true },
        rederivation: witnessRecord
      },
      tees: assemblyPart.tees
    };
    const asmArtifacts = [
      writeAsmArtifact('px.tees.assembly', 'tee-assembly-json', 'px.tees.assembly.json', Buffer.from(json(assemblyArtifact) + '\n'))
    ];
    const rereadAsm = JSON.parse(readFileSync(join(asmArtifactDir, 'px.tees.assembly.json'), 'utf8'));
    if (canon(rereadAsm.tees) !== canon(assemblyPart.tees) || canon(rereadAsm.totals) !== canon(assemblyPart.totals))
      failAsm('re-read assembly artifact disagrees with the serialized assembly Part');
    s3TeeAssemblyMaterialization = {
      guarantee: 'fg.s3.pxTees.assembly', specDelta: TEE_ASSEMBLY.specDelta,
      part: TEE_ASSEMBLY.part, producedBy: TEE_ASSEMBLY.assemblyCalculation,
      teeCount: assemblyPart.totals.teeCount, totals: assemblyPart.totals,
      reproduction: { exactTees: reproduction.filter(r => r.exact).length, ofTees: reproduction.length, tees: reproduction },
      witnesses: assemblyArtifact.witnesses,
      checks: {
        allFramesReproducedExactly: true, interiorsMatchHoleArea: true, componentOverlapZero: true,
        fusedUnionArithmetic: true, ownedOutsideWindowZero: true,
        reexecutionExact: true, rederivationExact: true,
        artifactsRehashedAfterWrite: true, artifactsReReadAndCompared: true
      },
      artifacts: asmArtifacts
    };
    stages.find(s => s.id === 'S3').teeAssemblyMaterialization = s3TeeAssemblyMaterialization;
    s3AssemblyBranchEvidence = {
      mode: 'ON', status: 'SPEC_DELTA_ORACLE_UNKNOWN', lane: 's3-tee-assembly',
      baseSnapshotSha256: hash(stageSnapshots.S3),
      benefit: 'Every baseline Tee Part is assembled whole from its evidence (enclosed interior base, frame fused on, ring-center anchor, window-residue accounting), so the interior pixels the baseline Part never claimed are owned by the Part instead of living only as ring geometry on px.tees.rings, and the assembly structure crosses the toolkit seam as named Parts instead of a frame-only px array.',
      falsifier: 'A tee frame set differs from the accepted px.tees set, the frame union differs from 4,884, a tee interior size differs from its ring\'s recorded holeArea, or a tee component overlap is nonzero.',
      oracle: 'UNKNOWN', partAddress: TEE_ASSEMBLY.part,
      totals: assemblyPart.totals,
      delta: {
        frameOnlyBaselinePx: s3Materialization.totals.claimedPx,
        interiorAddedPx: assemblyPart.totals.interiorUnionPx,
        fusedUnionPx: assemblyPart.totals.fusedUnionPx
      },
      reproduction: { exactTees: reproduction.filter(r => r.exact).length, ofTees: reproduction.length },
      canonicalRgbaSha256Off: stages[stageOrder.indexOf('S3')].canonicalRgbaSha256, canonicalRgbaSha256On: hash(branchA.branch.get(ComponentPxC.image.address).rgba),
      ticks: branchA.ticks.map(t => ({ id: t.opId, declared: { consumes: asmOp.consumes, produces: asmOp.produces, calculations: asmOp.calculations }, actual: { consumes: t.actualConsumes, produces: t.actualProduces, writes: t.writes }, frozenCalculations: t.frozenCalculations }))
    };
  }

  if (hash(readFileSync(source)) !== sourceSha256) throw new Error('Source image bytes changed during replay');

  const addresses = [...new Set([
    'px.source.selectedInput', 'px.source.fullImage', 'px.course.canonicalPixels',
    'localImage', 'viewport',
    ...Object.values(ComponentPxC).map((key) => key.address),
    ...Object.values(BadgePxC).map((key) => key.address),
    ...Object.values(BasketPxC).map((key) => key.address),
    ...Object.values(TeePxC).map((key) => key.address)
  ])];
  const presentAddresses = addresses.filter((address) => pxc.has(address));
  const snapshotBytes = until.toUpperCase() === 'S3' ? capturePxC(pxc, presentAddresses) : null;
  const snapshotPath = snapshotBytes ? join(out, 's3.pxc.bin') : null;
  if (snapshotBytes) writeFileSync(snapshotPath, snapshotBytes);
  const snapshotSha256 = snapshotBytes ? hash(snapshotBytes) : null;

  // S0-S2 currently have no distinct compiled experimental contract. Keep each
  // gate OFF and record the evidence gap instead of presenting identical code as ON.
  const gates = {
    S0: { id: 's0-chrome-conservatism', default: 'OFF', status: 'validation-only', benefit: 'Expose how much chrome the existing proposal removes so an over-crop is detectable.', falsifier: 'Any nontrivial crop removes content pixels or cuts into the object-bearing area.', reason: 'Pinned S0 contract already applies stripChromeProposal; ON records its native crop receipt without changing pixels.' },
    S1: { id: 's1-badge-cardinality-audit', default: 'OFF', status: 'validation-only', benefit: 'Compare mask component supply with emitted badge objects.', falsifier: 'Emitted badge count or white/black BadgePx disagrees with the component evidence in a way needing adjudication.', reason: 'Pinned clean and candidate implementations are byte-identical; ON records existing calculation evidence, no detector change.' },
    ...(experiments.includes('S1ASM') ? { S1ASM: { id: 's1-badge-assembly', default: 'OFF', status: 'AVAILABLE_OFF', declaration: 'stages/s1.json refinements: refine.s1.badgeAssembly.plateFirst', benefit: 'Every Badge Part is re-assembled plate-first from its component evidence (plate base; frame and digit components fused on; digit counters as digit-owned sub-structure), so the assembly structure crosses the toolkit seam as named Parts with anchor and window-residue accounting instead of a flat px array with two counts.', falsifier: 'A badge fused set differs from the accepted px.badges set, the fused union differs from 37,002, the counters differ from the accepted attribution (10 components, 293 px), or the owned total differs from 37,295.', reason: 'Declared spec delta on fn.Badge.findPx assembly order, enforced in this wiring as a branch from the S1 snapshot; the pinned provider and the base board emissions are unchanged. This gate entry is recorded only when the lane runs, so lane-off receipts stay byte-identical.' } } : {}),
    S2: { id: 's2-shell-ownership-audit', default: 'OFF', status: 'validation-only', benefit: 'Expose candidate family, shell support, and output counts together.', falsifier: 'Shell support or family/output cardinality indicates missed or multiply owned basket pixels.', reason: 'Pinned clean and candidate implementations are byte-identical; ON records existing calculation evidence, no detector change.' },
    ...(experiments.includes('S2ASM') ? { S2ASM: { id: 's2-basket-assembly', default: 'OFF', status: 'AVAILABLE_OFF', declaration: 'stages/s2.json refinements: refine.s2.basketAssembly.bodyFirst', benefit: 'Every Basket Part is re-assembled body-first from its component evidence (bright body base; shell fused on; tip anchor; window-residue accounting), so the assembly structure crosses the toolkit seam as named Parts instead of a flat px array with two counts.', falsifier: 'A basket fused set differs from the accepted px.baskets set, the fused union differs from 36,362, a basket component overlap is nonzero, or a basket window residue falls outside the phase-1 band of 1,172 to 1,177 px.', reason: 'Declared spec delta on fn.Basket.findPx assembly structure, enforced in this wiring as a branch from the S2 snapshot; the pinned provider and the base board emissions are unchanged. This gate entry is recorded only when the lane runs, so lane-off receipts stay byte-identical.' } } : {}),
    S3: { id: 'fill-consistent-tee-selection', default: 'OFF', status: 'AVAILABLE_OFF', contract: 'stages/S3/exp/fill-consistent/contract' },
    S3FIX: { id: 's3-findfamily-structural-fix', default: 'OFF', status: 'AVAILABLE_OFF', declaration: 'stages/s3.json refinements: refine.s3.findFamily.structural', benefit: 'Membership in the tee family becomes a structural verdict per candidate (anchored pad model; fitted-size, border, band, interior and whiteness tests; occlusion excuses only by named prior-layer Parts), so same-scale map chrome is eliminated at S3 with named failed tests instead of surviving to S4 attrition.', falsifier: 'A genuine pad is eliminated or excused, a chrome candidate is admitted, or an admitted tee tuple differs from the pinned baseline tuple.', reason: 'Declared spec delta on fn.Tee.findFamily, enforced in this wiring as a branch from the S3 snapshot; the pinned provider and the base board emissions are unchanged.' },
    ...(experiments.includes('S3ASM') ? { S3ASM: { id: 's3-tee-assembly', default: 'OFF', status: 'AVAILABLE_OFF', declaration: 'stages/s3.json refinements: refine.s3.teeAssembly.interiorFirst', benefit: 'Every baseline Tee Part is assembled whole from its evidence (enclosed interior base, derived from the bright mask and gated exactly against the ring record; frame fused on; ring-center anchor; window-residue accounting), so the tee owns the interior pixels its frame surrounds instead of carrying only the frame.', falsifier: 'A tee frame set differs from the accepted px.tees set, the frame union differs from 4,884, a tee interior size differs from its ring\'s recorded holeArea, or a tee component overlap is nonzero.', reason: 'Declared spec delta on fn.Tee.findPx assembly structure, enforced in this wiring as a branch from the S3 snapshot; the pinned provider and the base board emissions are unchanged. This gate entry is recorded only when the lane runs, so lane-off receipts stay byte-identical.' } } : {})
  };
  const branchResults = {};
  if (experiments.some((id) => ['S0', 'S1', 'S2'].includes(id))) {
    const { executeCompiledPlan } = dist('exec/gateway');
    const { nullFeatureContext } = dist('detectors/threeFactor/features/types');
    const { createMemorySink } = dist('exec/sink');
    const { sha256HexSyncText } = dist('exec/sha256');
    const audits = {
      S0: { opId: 'early.S0.edgeBandAudit', consumes: ['px.source.fullImage', 'px.course.canonicalPixels', 'px.early.s0.cropReceipt'], produces: 'px.early.s0.edgeBandAudit', fn: 'fn.early.S0.edgeBandAudit',
        calculate: (full, crop, cropReceipt) => ({ source: [full.widthPx, full.heightPx], canonical: [crop.widthPx, crop.heightPx], topRowsRemoved: cropReceipt.upperRowsRemoved, bottomRowsRemoved: cropReceipt.lowerRowsRemoved, cropMethod: cropReceipt.cropMethod, removedAreaFraction: 1 - (crop.widthPx * crop.heightPx) / (full.widthPx * full.heightPx) }) },
      S1: { opId: 'early.S1.badgeCardinalityAudit', consumes: ['px.components.masks', 'px.components', 'px.badges.family', 'px.badges'], produces: 'px.early.s1.badgeCardinalityAudit', fn: 'fn.early.S1.badgeCardinalityAudit',
        calculate: (masks, fields, family, badges) => { const labels = badges.map(b => b.label ?? null); const nonempty = labels.filter(v => v !== null); const counts = new Map(nonempty.map(label => [label, nonempty.filter(other => other === label).length])); return { brightComponents: fields.bright.components.length, darkComponents: fields.dark.components.length, brightMaskPixels: masks.bright.data.reduce((n, v) => n + v, 0), darkMaskPixels: masks.dark.data.reduce((n, v) => n + v, 0), familyCount: family.length, badgeCount: badges.length, whiteBadgePx: badges.reduce((n, b) => n + b.whitePx, 0), blackBadgePx: badges.reduce((n, b) => n + b.blackPx, 0), labels, missingLabelCount: labels.length - nonempty.length, duplicateLabelCount: [...counts.values()].filter(n => n > 1).length }; } },
      S2: { opId: 'early.S2.shellOwnershipAudit', consumes: ['px.baskets.family', 'px.baskets.shellFamily', 'px.baskets'], produces: 'px.early.s2.shellOwnershipAudit', fn: 'fn.early.S2.shellOwnershipAudit',
        calculate: (family, shell, baskets) => { const owned = new Map(); for (const [i, basket] of baskets.entries()) for (const pixel of basket.px) owned.set(pixel, (owned.get(pixel) ?? 0) + 1); return { familyCount: family.members.length, shellMemberCount: shell.members.length, shellMargins: shell.margins ?? null, shellPixelCount: shell.shellOffsets.length, basketCount: baskets.length, ownedBasketPixels: [...owned.values()].filter(n => n > 0).length, multiplyOwnedBasketPixels: [...owned.values()].filter(n => n > 1).length }; } }
    };
    for (const id of ['S0', 'S1', 'S2']) if (experiments.includes(id) && stageOrder.indexOf(id) <= lastIndex) {
      const a = audits[id];
      const branch = restorePxC(stageSnapshots[id]);
      if (id === 'S0') branch.set('px.early.s0.cropReceipt', captured.S0.cropReceipt);
      const calculate = (...args) => a.calculate(...args);
      const op = { id: a.opId, kind: 'measure', gate: 'shared', unit: `early-${id.toLowerCase()}-audit`, consumes: a.consumes, produces: [a.produces], calculations: [a.fn], accessConformance: 'exact', note: `${gates[id].benefit} Validation evidence only; source outputs unchanged.` };
      const plan = { ops: [op], bindings: {}, planFingerprint: sha256HexSyncText(JSON.stringify(op)) };
      const runtime = { implementations: new Map([[a.opId, (board) => { const value = calculate(...a.consumes.map((address) => board.get(address))); board.set(a.produces, value); }]]), calculationBindings: new Map([[a.opId, [{ address: a.fn, calculate }]]]) };
      const ticks = executePlanInstrumented(instrumentation, `early.${id}.audit`, executeCompiledPlan, plan, branch, nullFeatureContext, createMemorySink(), runtime);
      const evidence = branch.get(a.produces);
      const offBaseline = id === 'S0'
        ? { ...captured.S0.cropReceipt }
        : id === 'S1'
          ? { familyCount: captured.S1.family.length, badgeCount: captured.S1.badges.length }
          : { familyCount: captured.S2.family.members.length, shellMemberCount: captured.S2.shellFamily.members.length, basketCount: captured.S2.baskets.length };
      branchResults[id] = { mode: 'ON', status: 'VALIDATION_ONLY_NO_CV_CHANGE', baseSnapshotSha256: hash(stageSnapshots[id]), benefit: gates[id].benefit, falsifier: gates[id].falsifier, oracle: 'UNKNOWN', partAddress: a.produces, offBaseline, onEvidence: evidence, canonicalRgbaSha256Off: stages[stageOrder.indexOf(id)].canonicalRgbaSha256, canonicalRgbaSha256On: hash(branch.get(id === 'S0' ? 'px.course.canonicalPixels' : ComponentPxC.image).rgba), ticks: ticks.map(t => ({ id: t.opId, declared: { consumes: op.consumes, produces: op.produces, calculations: op.calculations }, actual: { consumes: t.actualConsumes, produces: t.actualProduces, writes: t.writes }, frozenCalculations: t.frozenCalculations })) };
    }
  }
  if (experiments.includes('S3') && until.toUpperCase() === 'S3') {
    const branch = restorePxC(stageSnapshots.S2);
    const before = hash(branch.get(ComponentPxC.image).rgba);
    const contract = dist('stages/S3/exp/fill-consistent/contract').stageContract;
    const result = await contract.execute({ source, inputLabel: basename(source), decode: decodeNodeFile, pxc: branch });
    const after = hash(branch.get(ComponentPxC.image).rgba);
    if (before !== after || before !== initialPixels) throw new Error('S3 experiment mutated original canonical pixels');
    const pcr = branch.get('px.tees.exp.pcr');
    const baselineTees = captured.S3.tees;
    const treatmentTees = branch.get(TeePxC.objects);
    const objectIdentity = (tees) => hash(JSON.stringify(tees.map((tee) => ({ center: tee.center, bbox: tee.bbox, innerBbox: tee.innerBbox, pxSha256: hash(Buffer.from(tee.px.buffer, tee.px.byteOffset, tee.px.byteLength)) }))));
    branchResults.S3 = { mode: 'ON', status: 'EXPERIMENTAL_ORACLE_UNKNOWN', receipt: result.receiptText,
      ticks: tickView(pcr), canonicalRgbaSha256: after,
      offBaseline: { tees: baselineTees.length, teeObjectsSha256: objectIdentity(baselineTees) },
      onTreatment: { tees: treatmentTees.length, teeObjectsSha256: objectIdentity(treatmentTees) },
      comparison: { countDelta: treatmentTees.length - baselineTees.length, objectIdentityChanged: objectIdentity(treatmentTees) !== objectIdentity(baselineTees) },
      counts: { measuredFrames: branch.get(TeePxC.family).measured.length, tees: treatmentTees.length } };
  }
  if (s3FixBranchEvidence) branchResults.S3FIX = s3FixBranchEvidence;
  if (s1AssemblyBranchEvidence) branchResults.S1ASM = s1AssemblyBranchEvidence;
  if (s2AssemblyBranchEvidence) branchResults.S2ASM = s2AssemblyBranchEvidence;
  if (s3AssemblyBranchEvidence) branchResults.S3ASM = s3AssemblyBranchEvidence;

  const sourceInfo = { path: source, sha256: sourceSha256, widthPx: captured.S0.fullImage.widthPx, heightPx: captured.S0.fullImage.heightPx };
  const final = pxc;
  const provenance = JSON.parse(readFileSync(resolve(provider, 'REPLAY-PROVENANCE.json'), 'utf8'));
  const sourceAlgSha256 = treeIdentity(resolve(provider, 'packages/alg/src'), /\.(ts|json|yaml)$/);
  const compiledAlgSha256 = treeIdentity(resolve(provider, 'packages/alg/dist'), /\.(js|json)$/);
  const provenanceVerified = sourceAlgSha256 === provenance.sourceAlgSha256 && compiledAlgSha256 === provenance.compiledAlgSha256;
  if (!provenanceVerified) throw new Error('Pinned provider source/compiled artifact hashes do not match REPLAY-PROVENANCE.json');
  const receipt = {
    schema: 'nctk-early@1', source: sourceInfo,
    provider: { provenanceVerified, provenanceSha256: hash(readFileSync(resolve(provider, 'REPLAY-PROVENANCE.json'))), sourceAlgSha256, compiledAlgSha256 },
    stages,
    materializations: { ...(s1Materialization ? { S1: s1Materialization } : {}), ...(s1DigitsMaterialization ? { S1Digits: s1DigitsMaterialization } : {}), ...(s1GlyphTemplateMaterialization ? { S1BadgeGlyphTemplate: s1GlyphTemplateMaterialization } : {}), ...(s1BadgeAssemblyMaterialization ? { S1BadgeAssembly: s1BadgeAssemblyMaterialization } : {}), ...(s2Materialization ? { S2: s2Materialization } : {}), ...(s2BasketAssemblyMaterialization ? { S2BasketAssembly: s2BasketAssemblyMaterialization } : {}), ...(s3Materialization ? { S3: s3Materialization } : {}), ...(s3RingsFamilyMaterialization ? { S3RingsFamily: s3RingsFamilyMaterialization } : {}), ...(s3FamilyFixMaterialization ? { S3FamilyFix: s3FamilyFixMaterialization } : {}), ...(s3TeeAssemblyMaterialization ? { S3TeeAssembly: s3TeeAssemblyMaterialization } : {}) },
    crop: captured.S0.cropReceipt,
    snapshot: snapshotBytes ? { path: snapshotPath, relativePath: 's3.pxc.bin', sha256: snapshotSha256, addresses: presentAddresses } : null,
    counts: { ...(final.has(BadgePxC.objects.address) ? { badges: final.get(BadgePxC.objects).length } : {}), ...(final.has(BasketPxC.objects.address) ? { baskets: final.get(BasketPxC.objects).length } : {}), ...(final.has(TeePxC.objects.address) ? { tees: final.get(TeePxC.objects).length } : {}) },
    experiments: { gates, branches: branchResults },
    oracle: 'UNKNOWN',
    testimonyScope: 'Compiled gateway PCR operation testimony: declared/actual Part traffic, writes, frozen calculation bindings, and artifact hashes. It does not independently prove semantic correctness or every internal read/cache effect.'
  };
  writeFileSync(join(out, 'run.receipt.json'), json(receipt));
  writeFileSync(join(out, 'tick-traffic.json'), json({ stages: Object.fromEntries(stages.map(({ id, ticks }) => [id, ticks])), experiments: branchResults }));
  // Auto-instrumentation sidecar: per-op timing and verbatim emits for every
  // compiled-plan op this runner executed. A sidecar, not receipt content,
  // because elapsed times are nondeterministic and the receipt is hashed.
  writeFileSync(join(out, 'instrumentation.json'), json(instrumentation.document()));
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const args = process.argv.slice(2);
  const flagAt = args.indexOf('--until');
  const until = flagAt >= 0 ? args[flagAt + 1] : 'S3';
  if (flagAt >= 0) args.splice(flagAt, 2);
  const [forkRoot, sourcePath, outDir, ...experiments] = args;
  if (!forkRoot || !sourcePath || !outDir) {
    console.error('Usage: node --import tsx runEarly.mjs <forkRoot> <sourcePath> <outDir> [S3]');
    process.exitCode = 2;
  } else {
    runEarly({ forkRoot, sourcePath, outDir, experiments, until }).then((result) => console.log(json({
      schema: result.schema, source: result.source, snapshot: result.snapshot, counts: result.counts,
      gates: result.experiments.gates, experimentBranches: Object.keys(result.experiments.branches)
    }))).catch((error) => { console.error(error.stack ?? error); process.exitCode = 1; });
  }
}
