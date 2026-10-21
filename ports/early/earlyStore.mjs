/**
 * The early runner's addressed store (node-only registration; the store
 * itself is fg/store.mjs, browser-safe).
 *
 * Sam (2026-10-17): "The point of PxC is that parts go to addressed store so
 * this shouldn't happen. Calcs declare inParts + outParts for this reason."
 * Before this module the fg runtime had an `env` side channel through which
 * runEarly handed FGs dist(), the captured gateway results, the stage
 * snapshots, restorePxC, sha256, the canonical pixel hash, the instrument
 * hook, the crop receipt, the source hash, testimony bytes and a flipbook
 * background computed inside the S1 block (which is how the S3 fork-join
 * came to have none). Here every one of those is either a Part with a
 * producing Calculation that declares its inParts/outParts, or a
 * registered Calculation looked up by address; FGs, fork-join
 * implementations and the sidecar writers read them by address.
 *
 * DATA: toolkit Parts (write-once, provenance recorded)
 *
 *   address                          producing Calculation               inParts
 *   tk.source.path                   fn.tk.source.intake                 (none: the runner's file read)
 *   tk.source.bytes                  fn.tk.source.intake                 (none)
 *   tk.source.sha256                 fn.tk.source.intake                 (none)
 *   tk.stage.<S>.captured            fn.provider.<S>.gateway             (none: the pinned clean gateway
 *                                                                         reads the provider board itself;
 *                                                                         its PCR testimony records that)
 *   tk.stage.S0.canonicalRgbaSha256  fn.tk.S0.canonicalRgbaSha256        px.course.canonicalPixels
 *   tk.source.cropReceipt            fn.tk.S0.cropReceipt                tk.stage.S0.captured
 *   tk.source.header                 fn.tk.source.header                 px.source.fullImage, tk.source.cropReceipt
 *                                    (a capture: fn.tk.source.captureRun, the tiles' headers read by the capture store)
 *   tk.s1.udiscHeader                fn.tk.s1.udiscHeader                tk.source.header, px.badges
 *   tk.stage.<S>.snapshot            fn.provider.<S>.capturePxC          the provider addresses present
 *   tk.stage.<S>.snapshotSha256      fn.provider.<S>.capturePxC            after <S> (registered per stage)
 *   view.source.background           fn.view.source.background           tk.source.bytes, tk.source.cropReceipt
 *   tk.s1.badgeGlyphTemplate.plan    fn.provider.S1.badgeGlyphTemplate.compile  (none: provider config)
 *   testimony.source.annotation      fn.testimony.locate                 tk.source.sha256
 *   testimony.source.teePoints       fn.testimony.teePoints              testimony.source.annotation,
 *                                                                         tk.source.cropReceipt
 *   tk.<fgId>.record                 fn.<fgId>                           that FG's declared reads
 *                                    (registered by ports/early/stageGuarantees.mjs once the FG
 *                                    held: how a later stage's FG gates against an earlier
 *                                    stage's record, e.g. S3 reads
 *                                    tk.fg.s2.pxBaskets.materialize.record)
 *
 * Every Part except the gateway captures, intake and snapshots is produced
 * LAZILY on first read, so a lane that never reads testimony never looks
 * for it, and a specimen without testimony still runs lane-off.
 * testimony.source.* is keyed by role (the testimony for THIS run's source)
 * because FGs are specimen-general; the value names its specimen
 * (testimony/<specimen>/) and path.
 *
 * CODE: registered capabilities (no outParts; the return value goes to the
 * caller; every call is timed into instrumentation.json `calculations`)
 *
 *   fn.provider.restore.<S>          inParts tk.stage.<S>.snapshot -> a fresh restored PxC
 *   fn.provider.executeCompiledPlan  args { site, plan, board, featureContext?, runtime }
 *                                    -> ticks (the instrumented gateway; also writes the
 *                                    per-op `ops` entries with `emits`)
 *   fn.provider.S1.materializeSubtractions   inParts tk.stage.S1.captured
 *   fn.provider.S1.detectBadges              inParts localImage
 *   fn.provider.S1.badgeGlyphTemplate.execute  inParts tk.s1.badgeGlyphTemplate.plan,
 *                                    args { board }, calls fn.provider.executeCompiledPlan
 *   fn.provider.S1.classifyBadgeAgainstTemplates  args { bitmap, read, topPx }
 *   fn.provider.S3.selectTeeFamily           args { measured }
 *   fn.provider.S2.materializeSubtraction    inParts tk.stage.S2.captured
 *   fn.provider.S3.materializeSubtraction    inParts tk.stage.S3.captured
 *   fn.provider.S3.detectTeeRings            inParts px.components (its bright mask)
 *   fn.provider.S3.makeTee                   args { member, fields } -> a provider Tee
 *   fn.provider.sha256Text                   args { text } (the provider's sha256HexSyncText)
 *   fn.tk.sha256                             args { bytes } (node:crypto; bytes or text)
 */
import { SCALE_RC1_CALCULATION } from '../../fg/s3/scaleRc1.mjs';
import { createHash } from 'node:crypto';
import { PURPLE_QUERIES, purpleShare, THROWN_CUT } from '../../fg/queries/purple.mjs';
import { registerSpriteQueries } from '../../fg/queries/sprite.mjs';
import { registerHeaderQueries } from '../../fg/queries/header.mjs';
import { HEADER_CHECK_CALCULATION, HEADER_TEMPLATES } from '../../fg/header/header.calc.mjs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createPartStore, registerQueries } from '../../fg/store.mjs';
import { TEE_POINTS_CALCULATION } from '../../fg/s3/teeFamily.mjs';
import { executePlanInstrumented } from './instrument.mjs';

export const STAGE_IDS = ['S0', 'S1', 'S2', 'S3'];
const GATEWAYS = {
  S0: ['stages/S0/clean/index', 'executeS0'],
  S1: ['stages/S1/clean/index', 'executeS1BadgesCandidate'],
  S2: ['stages/S2/clean/index', 'executeS2BasketsCandidate'],
  S3: ['stages/S3/clean/index', 'executeS3VisibleTees']
};
const ORIGINAL = Symbol.for('chainspot.early.originalGateway');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

/** testimony/<specimen>/**\/*.annotation.json whose sourceImage.sha256 is this run's source; exactly one. */
function locateTestimony(forkRoot, sourceSha256) {
  const dir = join(forkRoot, 'testimony');
  const found = [];
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.annotation.json')) {
        const bytes = new Uint8Array(readFileSync(p));
        let doc = null;
        try { doc = JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { continue; }
        if (doc?.sourceImage?.sha256 === sourceSha256) {
          const path = relative(forkRoot, p).split('\\').join('/');
          found.push({ path, specimen: path.split('/')[1] ?? null, sha256: sha256(bytes), bytes });
        }
      }
    }
  };
  walk(dir);
  if (found.length !== 1) throw new Error(`expected exactly one testimony/**/*.annotation.json for source ${sourceSha256}, found ${found.length}${found.length ? ` (${found.map((f) => f.path).join(', ')})` : ''}`);
  return found[0];
}

/**
 * The run's store over the live provider board (getBoard() returns the
 * current PxC, which the stage gateways may replace between stages), with
 * every toolkit Part producer and provider capability registered.
 */
/**
 * A capture whose S1 read no badge at all. The pinned provider's S1 plan declares that Badge.findPx reads px.badges.stage and
 * px.components, but it reads them only through a badge, so an empty badge read set fails its own access-conformance check with
 * "missing reads=[px.badges.stage, px.components]". That is a data condition (no badges in this image), not an integrity failure:
 * the S1 gateway recognises exactly that signature with an empty read set and raises this typed condition for the runner to record.
 */
export class NoBadgesCondition extends Error {
  constructor(detail) { super(`S1 read no badges: ${detail}`); this.name = 'NoBadgesCondition'; this.condition = { stage: 'S1', result: 'no badges', detail }; }
}
const EMPTY_READ_SET = /Tick 'Badge\.findPx' access contradicts its declaration; missing reads=\[px\.badges\.stage, px\.components\] extra reads=\[\] missing writes=\[\] extra writes=\[\]/;

/**
 * Lane s1-round-view-plate: provider feature knobs (feature id -> knob -> value) applied only while the S1 gateway runs. The badge
 * plate in the UDisc round view is a translucent black over the map (V 43-65), not the opaque near-black of the course map (V 7-10),
 * so the plate test's dark ceiling and fill floor are recalibrated. Provider files stay untouched: the knobs are the provider's own.
 */
/**
 * The S1 dark rule for a THROWN ROUND (Sam, 2026-10-20: the clean course-view CV must not change at all; "find purple and it's thrown").
 * A capture is thrown when its canonical pixels carry the UDisc round view's purple walk line (tk.s0.purple, fg/queries/purple.mjs: hue
 * 250-270 deg, share >= THROWN_CUT of the canonical pixels). Only then does S1 use this rule; a course-view capture runs the pinned rule
 * exactly. The round view draws the badge plate as a translucent black over the map (V 43-65 over any terrain), not the course map's
 * opaque near-black (V 7-10). The rule is LOCAL: a pixel is dark when V <= 45 (the pinned ceiling, kept) OR when it is darker than the map
 * immediately around it, V <= ratio x the mean V of the windowPx x windowPx box centred on it. The provider's white-frame, aspect, size,
 * glyph and numeral tests run unchanged on the resulting mask; provider files stay untouched (the rule wraps raster.computeBrightDarkMasks
 * for the S1 gateway and its digit witness). On therecThrown / dashs5612 / dashs5613, windowPx 51 / ratio 0.6 reads 9 / 7 / 18 badges and
 * the fixed 65 / 0.45 reads 8 / 6 / 17, both with 0 false and 0 wrong numerals. On course-view captures the local rule breaks S2 (no basket
 * read on townelake, heritage, northpark), which is why it is keyed on the walk line.
 */
export const S1_LOCAL_DARK = Object.freeze({ windowPx: 51, ratio: 0.6 });
export function localDarkMasks(baseMasks, { windowPx, ratio }) {
  return function (image, knobs) {
    const m = baseMasks(image, knobs), { width: W, height: H, data } = image, n = W * H, V = new Uint8Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) V[i] = Math.max(data[p], data[p + 1], data[p + 2]);
    const S = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += V[y * W + x]; S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1] + row; } }
    const h = windowPx >> 1, dark = m.dark.data;
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - h), y1 = Math.min(H, y + h + 1);
      for (let x = 0; x < W; x++) {
        const i = y * W + x; if (dark[i]) continue;
        const x0 = Math.max(0, x - h), x1 = Math.min(W, x + h + 1);
        const mean = (S[y1 * (W + 1) + x1] - S[y0 * (W + 1) + x1] - S[y1 * (W + 1) + x0] + S[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
        if (V[i] <= ratio * mean) dark[i] = 1;
      }
    }
    return m;
  };
}
/** Install the local dark rule on the provider's raster module (computeBrightDarkMasks); returns the restore function. */
export function applyLocalDarkRule(rasterModule, params = S1_LOCAL_DARK) {
  const base = rasterModule.computeBrightDarkMasks;
  rasterModule.computeBrightDarkMasks = localDarkMasks(base, params);
  return () => { rasterModule.computeBrightDarkMasks = base; };
}
/** The typed condition when `error` is the pinned S1 plan's empty-read-set access failure on a board whose badge read set is empty; else null. */
export function noBadgesOf(error, board) {
  if (!EMPTY_READ_SET.test(String(error?.message)) || !board?.has?.('badges') || board.get('badges').length !== 0) return null;
  return new NoBadgesCondition('the badge read set is empty (the pinned plan then fails its own access check on the declared reads px.badges.stage, px.components)');
}

export function createEarlyStore({ forkRoot, source, getBoard, dist, restorePxC, instrumentation }) {
  const store = createPartStore({ base: getBoard, name: 'early', onCall: (entry) => instrumentation.calculations.push(entry) });
  // S0: the purple walk-line share of the canonical pixels (Part tk.s0.purple) and the query fn.q.s0.purple; thrown = purple present
  store.register('fn.tk.s0.purple', { inParts: ['px.course.canonicalPixels'], outParts: ['tk.s0.purple'], note: 'share of canonical px that are the round view\'s purple walk line; thrown when >= THROWN_CUT',
    calculate: (io) => { const r = purpleShare(io.in('px.course.canonicalPixels')); return { 'tk.s0.purple': { ...r, thrown: r.share >= THROWN_CUT, cut: THROWN_CUT } }; } });
  registerQueries(store, PURPLE_QUERIES);
  // fn.q.sprite.overlap: one sprite's instances overlapped in sprite frame (S2's basket frame shape is its first user)
  registerSpriteQueries(store, registerQueries);
  // fn.q.header.*: the UDisc header bar (fg/queries/header.mjs); tk.source.header is registered by the runner (one raster, or a
  // capture's tiles), and fn.tk.s1.udiscHeader checks its hole count against the S1 badges (fg.s1.udiscHeader.observe)
  registerHeaderQueries(store, registerQueries, { templates: HEADER_TEMPLATES });
  store.register(...HEADER_CHECK_CALCULATION);
  const isThrown = () => store.get('tk.s0.purple').thrown;
  const { executeCompiledPlan } = dist('exec/gateway');
  const { nullFeatureContext, defaultKnobs } = dist('detectors/threeFactor/features/types');
  const { createMemorySink } = dist('exec/sink');
  const { sha256HexSyncText } = dist('exec/sha256');

  // --- source intake and S0-derived Parts
  store.register('fn.tk.source.intake', {
    outParts: ['tk.source.path', 'tk.source.bytes', 'tk.source.sha256'], lazy: false,
    note: 'the runner reads the specimen source file once',
    calculate: () => { const bytes = readFileSync(source); return { 'tk.source.path': source, 'tk.source.bytes': bytes, 'tk.source.sha256': sha256(bytes) }; }
  });
  store.register('fn.tk.S0.canonicalRgbaSha256', {
    inParts: ['px.course.canonicalPixels'], outParts: ['tk.stage.S0.canonicalRgbaSha256'],
    calculate: (io) => ({ 'tk.stage.S0.canonicalRgbaSha256': sha256(io.in('px.course.canonicalPixels').rgba) })
  });
  store.register('fn.tk.S0.cropReceipt', {
    inParts: ['tk.stage.S0.captured'], outParts: ['tk.source.cropReceipt'],
    note: "S0's recorded crop insets: the source frame -> canonical frame mapping",
    calculate: (io) => ({ 'tk.source.cropReceipt': io.in('tk.stage.S0.captured').cropReceipt })
  });
  store.register('fn.view.source.background', {
    inParts: ['tk.source.bytes', 'tk.source.cropReceipt'], outParts: ['view.source.background'],
    note: 'flipbook background: the source image as a data URL, shifted by the crop insets into canonical coordinates; view-only, never receipt bytes',
    calculate: (io) => {
      const bytes = io.in('tk.source.bytes');
      const crop = io.in('tk.source.cropReceipt');
      return {
        'view.source.background': crop?.originalPx ? {
          src: `data:image/${bytes[0] === 0x89 ? 'png' : 'jpeg'};base64,${Buffer.from(bytes).toString('base64')}`,
          width: crop.originalPx.width, height: crop.originalPx.height, x: 0, y: -crop.upperRowsRemoved
        } : null
      };
    }
  });

  // --- testimony (lazy: only a lane that reads it looks for it)
  store.register('fn.testimony.locate', {
    inParts: ['tk.source.sha256'], outParts: ['testimony.source.annotation'],
    note: "Sam's annotation testimony for this run's source, byte for byte",
    calculate: (io) => ({ 'testimony.source.annotation': locateTestimony(forkRoot, io.in('tk.source.sha256')) })
  });
  store.register('fn.testimony.teePoints', TEE_POINTS_CALCULATION);

  // --- provider capabilities
  for (const id of STAGE_IDS)
    store.register(`fn.provider.restore.${id}`, {
      inParts: [`tk.stage.${id}.snapshot`], note: `a fresh provider PxC restored from the sealed ${id} snapshot`,
      calculate: (io) => restorePxC(io.in(`tk.stage.${id}.snapshot`))
    });
  store.register('fn.provider.executeCompiledPlan', {
    note: 'the provider gateway, instrumented per op (instrumentation.json ops)',
    calculate: ({ args: { site, plan, board, featureContext = nullFeatureContext, runtime } }) =>
      executePlanInstrumented(instrumentation, site, executeCompiledPlan, plan, board, featureContext, createMemorySink(), runtime)
  });
  store.register('fn.provider.sha256Text', { calculate: ({ args }) => sha256HexSyncText(args.text) });
  store.register('fn.tk.sha256', { calculate: ({ args }) => sha256(args.bytes) });
  store.register('fn.provider.S1.materializeSubtractions', {
    inParts: ['tk.stage.S1.captured'],
    calculate: (io) => dist('stages/S1/clean/index').materializeS1Subtractions(io.in('tk.stage.S1.captured'))
  });
  store.register('fn.provider.S1.detectBadges', {
    inParts: ['localImage'],
    calculate: (io) => {
      // the witness re-runs the pinned detector under the same local dark rule the S1 gateway ran with
      const restore = isThrown() ? applyLocalDarkRule(rasterModule) : () => {};
      try { return dist('detectors/threeFactor/measure').detectBadges(io.in('localImage'), 0); } finally { restore(); }
    }
  });
  store.register('fn.provider.S1.badgeGlyphTemplate.compile', {
    outParts: ['tk.s1.badgeGlyphTemplate.plan'], note: "the provider's badge-glyph-template-on config, resolved and compiled",
    calculate: () => {
      const { resolveConfig, DEFAULT_EXECUTION, canonicalJson } = dist('detectors/threeFactor');
      const { compileExecutionPlan } = dist('exec/compile');
      const onConfig = structuredClone(dist('detectors/threeFactor/configs/badge-glyph-template-on.json'));
      const resolved = resolveConfig(onConfig, DEFAULT_EXECUTION);
      const paramsHash = sha256HexSyncText(canonicalJson(resolved));
      const compiled = compileExecutionPlan(resolved, paramsHash);
      const op = compiled.ops.find((o) => o.id === 'badgeGlyphTemplate') ?? null;
      return {
        'tk.s1.badgeGlyphTemplate.plan': {
          config: { name: onConfig.name, paramsHash, planFingerprint: compiled.planFingerprint },
          op,
          plan: op ? { ops: [op], bindings: compiled.bindings ?? {}, planFingerprint: compiled.planFingerprint, paramsHash } : null
        }
      };
    }
  });
  store.register('fn.provider.S1.badgeGlyphTemplate.execute', {
    inParts: ['tk.s1.badgeGlyphTemplate.plan'], calls: ['fn.provider.executeCompiledPlan'],
    note: 'runs the template op on the given branch board under a feature context with only badgeGlyphTemplate enabled',
    calculate: (io) => {
      const { operationImpls, operationCalculationBindings, ARTIFACT_EXTRACTORS } = dist('exec/operations');
      const featureContext = {
        ...nullFeatureContext,
        resolve(feature) {
          if (feature.id === 'badgeGlyphTemplate') return { enabled: true, knobs: defaultKnobs(feature) };
          return nullFeatureContext.resolve(feature);
        }
      };
      return io.call('fn.provider.executeCompiledPlan', {
        site: 's1.badgeGlyphTemplate', plan: io.in('tk.s1.badgeGlyphTemplate.plan').plan, board: io.args.board, featureContext,
        runtime: { implementations: operationImpls, calculationBindings: operationCalculationBindings, artifactExtractors: ARTIFACT_EXTRACTORS }
      });
    }
  });
  // S1 crosscheck (Sam, 2026-10-21: "Yes, make readers crosscheck"): the per-digit reader sets the label, the coverage
  // digit reader checks it (confirmed / disagree, the per-digit label kept) and fills a label the per-digit reader could
  // not give when its own P >= p* (filled); the B+W digit and whole-number coverage readers are recorded as witnesses.
  store.register('fn.Badge.crosscheck', {
    inParts: ['localImage', 'viewport', 'badges'], outParts: ['px.badges.crosscheck'],
    note: "every S1 badge read by every reader, with the coverage digit reader's verdict on the per-digit label (provider g1.badgeCrosscheck)",
    calculate: (io) => {
      const { crosscheckBadges } = dist('detectors/threeFactor/features/g1.badgeCrosscheck');
      const image = io.in('localImage'), { topPx } = io.in('viewport');
      const rows = crosscheckBadges({ width: image.width, height: image.height, data: image.data }, io.in('badges'), topPx);
      const count = (v) => rows.filter((r) => r.verdict === v).length;
      const totals = { badges: rows.length, confirmed: count('confirmed'), disagree: count('disagree'), filled: count('filled'), unread: count('unread') };
      return { 'px.badges.crosscheck': { badges: rows, totals, unit: 'per badge: labels (hole numbers), P (learned confidence 0..1), bbox (px); totals: count (badges)', emits: totals } };
    }
  });
  store.register('fn.provider.S1.classifyBadgeAgainstTemplates', {
    calculate: ({ args: { bitmap, read, topPx } }) => {
      const { classifyBadgeAgainstTemplates } = dist('detectors/threeFactor/features/g1.badgeGlyphTemplate');
      const { DEFAULT_BADGE_GLYPH_TEMPLATE_KNOBS } = dist('detectors/threeFactor/digits/badgeGlyphTemplateMath');
      return classifyBadgeAgainstTemplates(bitmap, read, topPx, DEFAULT_BADGE_GLYPH_TEMPLATE_KNOBS);
    }
  });
  store.register('fn.provider.S3.selectTeeFamily', {
    calculate: ({ args: { measured } }) => dist('stages/S3/clean/index').selectTeeFamily(measured)
  });
  store.register('fn.provider.S2.materializeSubtraction', {
    inParts: ['tk.stage.S2.captured'], note: "the provider's S2 basket subtraction over the captured S2 run",
    calculate: (io) => { const c = io.in('tk.stage.S2.captured'); return dist('stages/S2/clean/index').materializeS2Subtraction(c.image, c.baskets); }
  });
  store.register('fn.provider.S3.materializeSubtraction', {
    inParts: ['tk.stage.S3.captured'], note: "the provider's S3 tee subtraction over the captured S3 run",
    calculate: (io) => { const c = io.in('tk.stage.S3.captured'); return dist('stages/S3/clean/index').materializeS3Subtraction(c.image, c.tees); }
  });
  store.register('fn.provider.S3.detectTeeRings', {
    inParts: ['px.components', 'tk.scale.rC1'], note: "the provider's pure detectTeeRings over the board's bright mask, with S3's bounds for this image's rC1 (fg/s3/teeScale.mjs)",
    calculate: (io) => {
      const fields = io.in('px.components');
      if (!fields?.bright?.mask) throw new Error('px.components has no bright mask; cannot detect tee rings');
      const ends = dist('detectors/threeFactor/endpoints'), { tee } = io.in('tk.scale.rC1');
      return ends.detectTeeRings(fields.bright.mask, { ...ends.DEFAULT_ENDPOINTS_KNOBS, holeDimMax: tee.holeDimMax, holeAreaMax: tee.holeAreaMax, ringMergeProximity: tee.ringMergeProximity });
    }
  });
  // rC1px: the radius of the basket's C1 circle, measured per image from the S2 BasketPoints before S3 (fg/s3/scaleRc1.mjs)
  store.register(...SCALE_RC1_CALCULATION);
  store.register('fn.provider.S3.makeTee', {
    note: "a provider Tee object for a family member the baseline did not materialize: the member's bright frame component, materialized against the given component fields",
    calculate: ({ args: { member, fields } }) => {
      const { Tee } = dist('stages/S3/clean/Tee');
      const { componentRef, materializeRasterComponentPixels } = dist('detectors/threeFactor/componentAssembly');
      const frame = componentRef('bright', member.frame);
      const raster = { width: fields.bright.mask.width, height: fields.bright.mask.height, topPx: 0, brightLabels: fields.bright.labels, darkLabels: fields.dark.labels };
      return new Tee(member, { frame, px: materializeRasterComponentPixels(frame, raster) });
    }
  });

  // --- the pinned clean stage gateways, as Calculations producing
  // tk.stage.<S>.captured. The provider's stage contract still invokes its
  // own gateway function; the runner routes that invocation through the
  // store (the original function is kept under a symbol so a second run in
  // the same process wraps the original, not a previous run's wrapper).
  const rasterModule = dist('detectors/threeFactor/raster');
  const runS1Gateway = (original, args) => {
    const restore = isThrown() ? applyLocalDarkRule(rasterModule) : () => {};
    try { return original(...args); }
    catch (error) { throw noBadgesOf(error, args[0]) ?? error; }
    finally { restore(); }
  };
  for (const id of STAGE_IDS) {
    const [path, name] = GATEWAYS[id];
    const mod = dist(path);
    const original = mod[name]?.[ORIGINAL] ?? mod[name];
    if (typeof original !== 'function') throw new Error(`Missing pinned ${id} implementation ${name}`);
    const fn = `fn.provider.${id}.gateway`;
    const out = `tk.stage.${id}.captured`;
    store.register(fn, { outParts: [out], lazy: false, note: `the pinned clean ${id} gateway (${path}.${name})`, calculate: ({ args }) => {
      const result = id === 'S1' ? runS1Gateway(original, args) : original(...args);
      return result instanceof Promise ? result.then((value) => ({ [out]: value })) : { [out]: result };
    } });
    const wrapped = (...args) => {
      const result = store.call(fn, args, { caller: `stageContract.${id}` });
      return result instanceof Promise ? result.then((r) => r[out]) : result[out];
    };
    wrapped[ORIGINAL] = original;
    mod[name] = wrapped;
  }
  return store;
}

/**
 * Seal one stage's provider board as tk.stage.<S>.snapshot (+ sha256),
 * through fn.provider.<S>.capturePxC, whose inParts are exactly the
 * provider addresses present after that stage.
 */
export function sealStage(store, id, { addresses, capturePxC }) {
  const present = addresses.filter((address) => store.has(address));
  const fn = `fn.provider.${id}.capturePxC`;
  store.register(fn, {
    inParts: present, outParts: [`tk.stage.${id}.snapshot`, `tk.stage.${id}.snapshotSha256`], lazy: false,
    note: `the provider PxC snapshot after ${id}`,
    calculate: (io) => {
      const bytes = capturePxC(io.board, present);
      return { [`tk.stage.${id}.snapshot`]: bytes, [`tk.stage.${id}.snapshotSha256`]: sha256(bytes) };
    }
  });
  store.call(fn);
  return present;
}
