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
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createPartStore } from '../../fg/store.mjs';
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
export function createEarlyStore({ forkRoot, source, getBoard, dist, restorePxC, instrumentation }) {
  const store = createPartStore({ base: getBoard, name: 'early', onCall: (entry) => instrumentation.calculations.push(entry) });
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
    calculate: (io) => dist('detectors/threeFactor/measure').detectBadges(io.in('localImage'), 0)
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
    inParts: ['px.components'], note: "the provider's pure detectTeeRings over the board's bright mask",
    calculate: (io) => {
      const fields = io.in('px.components');
      if (!fields?.bright?.mask) throw new Error('px.components has no bright mask; cannot detect tee rings');
      return dist('detectors/threeFactor/endpoints').detectTeeRings(fields.bright.mask);
    }
  });
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
  for (const id of STAGE_IDS) {
    const [path, name] = GATEWAYS[id];
    const mod = dist(path);
    const original = mod[name]?.[ORIGINAL] ?? mod[name];
    if (typeof original !== 'function') throw new Error(`Missing pinned ${id} implementation ${name}`);
    const fn = `fn.provider.${id}.gateway`;
    const out = `tk.stage.${id}.captured`;
    store.register(fn, { outParts: [out], lazy: false, note: `the pinned clean ${id} gateway (${path}.${name})`, calculate: ({ args }) => {
      const result = original(...args);
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
