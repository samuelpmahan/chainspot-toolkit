/**
 * S7 FEATURES: the route-matching rule's options as a declared registry, so a rule set is a CONFIG (browser-safe).
 *
 * Sam (2026-10-22): "With ABFeatures I was able to grid search." The ABFeature era (source/provider/packages/alg/src/detectors/
 * threeFactor/features/: types.ts ABFeature, registry.ts, config.ts parse/resolve, hash.ts paramsHash) declared every option
 * of the detector as a feature with an id, a kind (baseline = part of the default, deviation = opt-in, default off), and knobs
 * (each a default, a note, a validate). A config is SPARSE (only its deviations from the defaults), it resolves against the
 * registry into a canonical config, and the canonical config's sha256 is the run's identity. This module does the same for S7
 * (ports/s7route/match.mjs): every option RULE_SETS used is a feature or a knob here, with
 *   default    the S7 default's value (S7_DEFAULT_NAME, the pointer since 2026-10-22), so resolveConfig({}) IS the S7 default;
 *   unit       R1 (rC1px: map distances), W (the hallway width, LOCAL: ribbon resolutions), deg, lum (edge contrast), count,
 *              frac (a fraction of a route's visible sensor stations: the hallway sensor's passFrac), enum;
 *   note       what it does and the evidence it rests on (the lane or doc that measured it);
 *   validate   value -> null | error;
 *   sweep      the values a grid sweep may try (ports/s7trace/gridSweep.mjs, `pxc sweep --grid`);
 *   assumption the fg/assumptions.mjs entry when the knob bounds a VARIABLE quantity (DOCTRINE 2026-10-21: stated, loud,
 *              self-correcting); a feature lists the stated assumptions its searches run under in `assumptions`.
 * needs/conflicts map the dependencies: a seq-only feature needs kBends mode 'seq' (needsSeq); regionScore and evidenceRank both
 * set the cells' final score and exclude each other. A feature whose needs are unmet is INACTIVE: dropped from the canonical
 * config (it cannot change a route) unless the config names it, which is an error (a typo'd experiment must never run as
 * the baseline while looking like it ran, config.ts's rule).
 *
 * rulesOf(canonical) compiles a config to the match.mjs options object (the routeMatch query's `rules`), the same object the
 * recorded rule sets were: every key of MATCH_RULES (which routeMatch merges under any rules) and every option whose value is
 * not its absent value. NAMED_CONFIGS are the recorded rule sets as sparse configs; features.test.mjs proves each resolves to
 * exactly the options it had (ports/s7route/fixtures/rule-sets.legacy.json, frozen at 31f2968).
 */
import { canonicalJson, sha256Hex } from '../../fg/canon.mjs';
import { ASSUMPTIONS } from '../../fg/assumptions.mjs';
import { FOLLOW_W, CLOSE_ON_BP_REACH } from '../s7trace/hallway.mjs';
import { SEQ, SEQ_FIRST_RANKS } from './seq.mjs';
import { BENDS, BEND_MOVE } from './bends.mjs';
import { FIRST_BEND_REACH } from './routeSpace.mjs';

export const CONFIG_SCHEMA = 's7-config@1';
export const S7_DEFAULT_NAME = 'routeMatchKBendsSeq3SearchW';
export const UNITS = Object.freeze({
  R1: 'rC1px: the radius of the basket\'s C1 circle measured on the image (10 m; map-scaled)',
  W: 'the hallway ribbon\'s width measured on the image (LOCAL; it follows its own curve, not the map\'s)',
  deg: 'degrees of turn', lum: 'edge contrast (luminance)', count: 'a count (integer)', ranks: 'neighbourhood ranks (a count, never px)',
  frac: 'a fraction of a route\'s visible sensor stations (the hallway sensor\'s passFrac)', enum: 'one of the listed values'
});
/** The match.mjs options routeMatch merges under every rules object (ports/s7trace/traceSpace.mjs: { ...MATCH_RULES, ...rules }). */
export const MATCH_RULES_KEYS = Object.freeze(['straightFromS6', 'secondBendRefine', 'refineUnits', 'tableUnits']);
/** Each match.mjs option's ABSENT value: what the code does when the key is not in the rules (match.mjs RULE_SETS doc). */
export const LEGACY_ABSENT = Object.freeze({
  straightFromS6: false, secondBendRefine: 'coord', refineUnits: 'r1', tableUnits: 'r1', tableSearch: 'full', secondBendGrid: 'fine',
  secondBendB1: 'axis', firstBend: 'free', stationsUnits: 'px', straightSecondBend: false, placeAxis: false, bendGateGain: BENDS.gate.gain,
  kBends: 'off', kRefineStarts: 1, kUnits: 'r1', seqNeighbours: SEQ.neighbours, seqWiden: false, seqGate: 'edge', seqScore: 'bottleneck',
  seqPolish: false, seqOwn: false, seqTurnKappa: 0, seqFollow: false, followRes: {}, seqFirstLegs: false, sensor: 'edge'
});

// ------------------------------------------------------------------------------------------------ knob specs
const oneOf = (values) => (v) => (values.includes(v) ? null : `must be one of ${values.join(', ')} (got ${JSON.stringify(v)})`);
const intIn = (lo, hi) => (v) => (Number.isInteger(v) && v >= lo && v <= hi ? null : `must be an integer in ${lo}..${hi} (got ${JSON.stringify(v)})`);
const numIn = (lo, hi, { open = false, nullable = false } = {}) => (v) => ((nullable && v === null) || (typeof v === 'number' && Number.isFinite(v) && (open ? v > lo : v >= lo) && v <= hi) ? null
  : `must be a number in ${open ? '(' : '['}${lo}, ${hi}]${nullable ? ' or null' : ''} (got ${JSON.stringify(v)})`);
const enumKnob = (dflt, values, note) => ({ default: dflt, unit: 'enum', values, note, validate: oneOf(values), sweep: values });
const seqOn = (s) => s.kBends.enabled && s.kBends.knobs.mode === 'seq';
const NEEDS_SEQ = Object.freeze({ when: seqOn, why: 'needs kBends enabled with mode \'seq\' (the sequencing, seq.mjs)' });
const followW = (s) => seqOn(s) && s.follower.enabled && s.follower.knobs.mode === 'w';
const wKnob = (key, unit, note, sweep, validate = numIn(0, 64, { open: true })) => ({ default: FOLLOW_W[key], unit, note, validate, sweep, when: followW });

/**
 * The registry. Order is the reading order of match.mjs routeMatchOf (table -> per-hole refine -> second bend -> placement ->
 * sequencing -> follower). toRules: the feature's options (full values; rulesOf drops the absent ones); fromRules: its state
 * from an effective options object (MATCH_RULES merged), for reading a recorded rule set.
 */
export const FEATURES = Object.freeze([
  { id: 'straightFromS6', kind: 'baseline', defaultEnabled: true,
    note: 'a hole S6 reads straight is drawn straight (tee cap -> BasketPoint), no bend search (rule 1 of the bend placement)',
    evidence: 'S6\'s accepted straight verdict; the S6-straight holes\' first forward basket is the true one on 44/44 (seq.mjs)', knobs: {},
    toRules: (f) => ({ straightFromS6: f.enabled }), fromRules: (E) => ({ enabled: Boolean(E.straightFromS6) }) },
  { id: 'routeTable', kind: 'baseline', defaultEnabled: true, required: true,
    note: 'the route table (routeSpace.mjs tk.s7.routeTable): every hole x basket cell\'s best route by edge contrast, read by the assignment',
    assumptions: [FIRST_BEND_REACH.name],
    knobs: {
      units: enumKnob('r1', ['r1', 'px'], 'the bend search on the tee axis in rC1px, or px: match18.py\'s recorded 800 px reach and 6 px step (an absolute px bound on a map-scaled quantity, kept only to compare)'),
      search: enumKnob('badgeMid', ['full', 'fast', 'lean', 'badgeMid'], 'full: every bend on the axis; fast: a coarse sweep at 4x the step, the best 2 refined; lean: every basket at 8x the step, the row\'s best 3 refined; badgeMid: 2 reads per cell (S -> basket and S -> B* -> basket; B* = tee + 2 x the badge along the tee axis, the first leg\'s end when the badge is its midpoint on every annotated hole, 2026-10-20)')
    },
    toRules: (f) => ({ tableUnits: f.knobs.units, tableSearch: f.knobs.search }), fromRules: (E) => ({ enabled: true, knobs: { units: E.tableUnits ?? 'r1', search: E.tableSearch ?? 'full' } }) },
  { id: 'refine', kind: 'baseline', defaultEnabled: true, required: true,
    note: 'the assigned 1-bend route\'s coordinate refine (E18; outside kBends only: the K-bend cells refine their own bends)',
    knobs: { units: enumKnob('px', ['r1', 'px'], 'px: E18 as recorded (+-6 px, 2 iterations); r1: the same in rC1px (MATCH.refineAxisSpanR1)') },
    toRules: (f) => ({ refineUnits: f.knobs.units }), fromRules: (E) => ({ enabled: true, knobs: { units: E.refineUnits ?? 'r1' } }) },
  { id: 'secondBend', kind: 'baseline', defaultEnabled: true, required: true,
    note: 'the second-bend search on a 1-bend route the sensor rejects (match6.py second_bend in rC1px; accepted when it reads >= tau and gains >= 0.15)',
    knobs: {
      refine: enumKnob('coordWide', ['coord', 'coordWide', 'dense'], 'coord: halving coordinate search from 0.25 R1; coordWide: from the coarse grid spacing, 0.47 R1 (batch 2, 2026-10-20); dense: match6.py\'s dense grid'),
      grid: enumKnob('coarse', ['fine', 'coarse'], 'coarse: the B1 axis and B2 grid at twice the spacing (the same as fine on all six dev courses, 8x fewer routes; PROFILES note 2026-10-20)'),
      b1: enumKnob('axis', ['axis', 'badge'], 'axis: B1 searched on the tee axis; badge: B1 stays at B*, only B2 is searched')
    },
    toRules: (f) => ({ secondBendRefine: f.knobs.refine, secondBendGrid: f.knobs.grid, secondBendB1: f.knobs.b1 }),
    fromRules: (E) => ({ enabled: true, knobs: { refine: E.secondBendRefine ?? 'coord', grid: E.secondBendGrid ?? 'fine', b1: E.secondBendB1 ?? 'axis' } }) },
  { id: 'straightSecondBend', kind: 'baseline', defaultEnabled: true,
    note: 'a straight contrast route the sensor rejects also gets the second-bend search, B1 seeded 0.5 W past the badge (Sam: "the tee -> badge segment is straight hallway"; heritage7 lane, 2026-10-20)', knobs: {},
    toRules: (f) => ({ straightSecondBend: f.enabled }), fromRules: (E) => ({ enabled: Boolean(E.straightSecondBend) }) },
  { id: 'firstBend', kind: 'baseline', defaultEnabled: true, required: true,
    note: 'where the first bend sits relative to B* (the badge-midpoint point)',
    knobs: { mode: enumKnob('badgePrior', ['free', 'badge', 'badgePrior'], 'free: refined and placed; badge: a 1-bend route through B* keeps it there; badgePrior: after the placement the first bend moves to B* when the sensor reads no worse there (within MATCH.priorDrop 0.02 frac; heritage7 prototype 18/18 agree)') },
    toRules: (f) => ({ firstBend: f.knobs.mode }), fromRules: (E) => ({ enabled: true, knobs: { mode: E.firstBend ?? 'free' } }) },
  { id: 'stations', kind: 'baseline', defaultEnabled: true, required: true,
    note: 'the visible-station floor of the straight read, the second bend and the placement gate',
    knobs: { units: enumKnob('r1', ['px', 'r1'], 'px: 20 visible stations (1 px apart: an absolute px length); r1: 0.449 R1, the same 20 stations on golden (R1 44.5 px) as a map-scaled length (abs-px audit)') },
    toRules: (f) => ({ stationsUnits: f.knobs.units }), fromRules: (E) => ({ enabled: true, knobs: { units: E.stationsUnits ?? 'px' } }) },
  { id: 'placeAxis', kind: 'baseline', defaultEnabled: true, assumptions: [BEND_MOVE.name],
    note: 'the bend placement (bends.mjs) fits the first bend on the tee axis, by its distance along it, instead of freely (heritage7, 2026-10-20)', knobs: {},
    toRules: (f) => ({ placeAxis: f.enabled }), fromRules: (E) => ({ enabled: Boolean(E.placeAxis) }) },
  { id: 'bendGate', kind: 'baseline', defaultEnabled: true, required: true,
    note: 'the per-bend gate: a route with more bends must read higher on the hallway sensor by this much PER added bend (bends.mjs BENDS.gate.gain): the bend placement\'s bend-count change, the K-bend chain\'s split, the follower\'s route against the K <= 1 route',
    knobs: { gainFrac: { default: BENDS.gate.gain, unit: 'frac', validate: numIn(0, 0.5), sweep: [0.03, 0.05, 0.08],
      note: 'the recorded 0.05 (after-s4-e09 bend placement); a per-bend sensor price of 0.05 let Coleto 18\'s region route spend 358 deg of turning when the gate was lenient (sam-2026-10-21.md)' } },
    toRules: (f) => ({ bendGateGain: f.knobs.gainFrac }), fromRules: (E) => ({ enabled: true, knobs: { gainFrac: E.bendGateGain ?? BENDS.gate.gain } }) },
  { id: 'kBends', kind: 'baseline', defaultEnabled: true, assumptions: [FIRST_BEND_REACH.name],
    note: 'K bends under the fair cost (kbends.mjs: a route is as good as its weakest leg). Off: the recorded rule (contrast table, 1 or 2 bends)',
    knobs: {
      mode: enumKnob('seq', ['bottleneck', 'seq'], 'bottleneck: every cell by its best K <= 1 route, K-bend chains for the unconfirmed holes (lane s7bends); seq: sequencing (seq.mjs; Sam: "18x18 is craycray"): straight claims first, then each bent hole\'s neighbourhood'),
      refineStarts: { default: 3, unit: 'count', validate: intIn(1, 8), sweep: [1, 3, 5], when: seqOn,
        note: 'each cell\'s K <= 1 refine on the tee axis starts from the sweep\'s N best local maxima (kbends.mjs kCellAt): the 0.54 R1 sweep is coarser than a bend\'s few-px peak; 3 fixed golden 5 (a 0.3 px S4 tee move flipped it to 2 bends with 1; 2026-10-22)' },
      units: { ...enumKnob('r1', ['r1', 'w'], 'the K-bend search\'s hallway steps (split grid, minimum leg, axis step, refine end) in R1 or in W (unit W / 0.934, golden\'s W per R1); foreign rings and the axis reach stay R1'), when: seqOn }
    },
    toRules: (f) => (f.enabled ? { kBends: f.knobs.mode, ...(f.knobs.mode === 'seq' ? { kRefineStarts: f.knobs.refineStarts, kUnits: f.knobs.units } : {}) } : {}),
    fromRules: (E) => ({ enabled: Boolean(E.kBends), knobs: { mode: E.kBends ?? 'seq', refineStarts: E.kRefineStarts ?? 1, units: E.kUnits ?? 'r1' } }) },
  { id: 'neighbourhood', kind: 'baseline', defaultEnabled: true, required: true, needs: NEEDS_SEQ, assumptions: [SEQ_FIRST_RANKS.name],
    note: 'a bent hole scores only the first joint ranks of its neighbourhood (unclaimed forward baskets by distance rank from its tee + from the next tee)',
    knobs: { ranks: { default: SEQ_FIRST_RANKS.value, unit: 'ranks', validate: intIn(1, SEQ.neighbours), sweep: [3, 5], assumption: SEQ_FIRST_RANKS.name,
      note: `Sam: "cut at least 80% of the 18x18 cells"; 3 ranks hold 117/120 true baskets on 6 courses; ${SEQ.neighbours} = every rank (the measured <= 4 on all 71 bent holes)` } },
    toRules: (f) => ({ seqNeighbours: f.knobs.ranks }), fromRules: (E) => ({ enabled: true, knobs: { ranks: E.seqNeighbours ?? SEQ.neighbours } }) },
  { id: 'seqWiden', kind: 'baseline', defaultEnabled: true, needs: NEEDS_SEQ, assumptions: [SEQ_FIRST_RANKS.name],
    note: 'a hole whose assigned route reads below tau on the sensor (or got no basket) re-solves with its remaining ranks: the self-correction of the seqFirstRanks bound (Beaver 7/8/21 and Coleto 18 come back through it)', knobs: {},
    toRules: (f) => ({ seqWiden: f.enabled }), fromRules: (E) => ({ enabled: Boolean(E.seqWiden) }) },
  { id: 'regionGate', kind: 'deviation', defaultEnabled: false, needs: NEEDS_SEQ,
    note: 'the sequencing\'s sensor gates read the hallway REGION passFrac (regionSpace.mjs). Measured 2026-10-21: golden 5 gains a bend and Coleto 15/18 trade baskets (region reads light ground as hallway)',
    knobs: { scope: enumKnob('all', ['all', 'widen'], 'all: every gate of the sequencing; widen: only the widening gate') },
    toRules: (f) => (f.enabled ? { seqGate: f.knobs.scope === 'all' ? 'region' : 'regionWiden' } : {}),
    fromRules: (E) => ({ enabled: E.seqGate === 'region' || E.seqGate === 'regionWiden', knobs: { scope: E.seqGate === 'regionWiden' ? 'widen' : 'all' } }) },
  { id: 'regionScore', kind: 'deviation', defaultEnabled: false, needs: NEEDS_SEQ, conflicts: ['evidenceRank'],
    note: 'each neighbourhood cell is assigned by the region support of its edge-placed route (measured 2026-10-21: the same Coleto 15/18 trade)', knobs: {},
    toRules: (f) => (f.enabled ? { seqScore: 'region' } : {}), fromRules: (E) => ({ enabled: E.seqScore === 'region' }) },
  { id: 'evidenceRank', kind: 'deviation', defaultEnabled: false, needs: NEEDS_SEQ, conflicts: ['regionScore'],
    note: 'the evidence scoring: the default\'s cells (the same store call), the final assignment ranked by log P of the combined evidence of every perspective (evidenceSpace.mjs tk.s7.cellEvidence, weights EVIDENCE_WEIGHTS fitted leave-one-course-out on the dev testimony; Sam 2026-10-22: "use that as just another piece of ranking evidence")', knobs: {},
    toRules: (f) => (f.enabled ? { seqScore: 'evidence' } : {}), fromRules: (E) => ({ enabled: E.seqScore === 'evidence' }) },
  { id: 'seqPolish', kind: 'deviation', defaultEnabled: false, needs: NEEDS_SEQ,
    note: 'every chain candidate polished on its weakest leg before it competes (kbends.mjs polishEach). Measured: golden 18 gains a bend, heritage 9 leaves Sam\'s corridor (lane s7bends ablation)', knobs: {},
    toRules: (f) => (f.enabled ? { seqPolish: true } : {}), fromRules: (E) => ({ enabled: Boolean(E.seqPolish) }) },
  { id: 'seqOwn', kind: 'baseline', defaultEnabled: true, needs: NEEDS_SEQ,
    note: 'confirmed routes own their corridors (straight claims, then routes passing the gate); no other hole\'s leg runs along one, crossing allowed (kept SeaTac 19\'s chain off hole 20\'s corridor)', knobs: {},
    toRules: (f) => ({ seqOwn: f.enabled }), fromRules: (E) => ({ enabled: Boolean(E.seqOwn) }) },
  { id: 'turnPrice', kind: 'baseline', defaultEnabled: true, needs: NEEDS_SEQ,
    note: 'the price of turning: a route\'s value is its weakest leg minus kappa x sum (1 - cos theta)^2 over its bends (kbends.mjs turnCostOf). Off: no price',
    knobs: { kappaLum: { default: 10, unit: 'lum', validate: numIn(0, 200, { open: true }), sweep: [5, 10, 20],
      note: 'at 10 lum a 35 deg bend costs 0.3 lum, 72 deg 4.8 lum, 90 deg 10 lum, 112 deg 19 lum; Sam\'s dev bends turn 14-72 deg, at most 106 deg per hole (sam-2026-10-21.md)' } },
    toRules: (f) => (f.enabled ? { seqTurnKappa: f.knobs.kappaLum } : {}), fromRules: (E) => ({ enabled: E.seqTurnKappa > 0, knobs: { kappaLum: E.seqTurnKappa > 0 ? E.seqTurnKappa : 10 } }) },
  { id: 'follower', kind: 'baseline', defaultEnabled: true, needs: NEEDS_SEQ, assumptions: [CLOSE_ON_BP_REACH.name],
    note: 'a hole whose assigned route still fails the gate rides the ribbon with the hallway follower (hallway.mjs trace, s7main) from its tee cap; the route it finds, polished on its weakest leg, competes for that cell (found Coleto 18 and SeaTac 19\'s true routes)',
    knobs: {
      mode: enumKnob('w', ['px', 'w'], 'px: the prototype\'s px resolutions; w: every resolution a fraction of W (Sam 2026-10-21: "do your search resolution as a multiplier of the hallway width"), where the hole ends in R1'),
      vertexStepW: wKnob('vertexStepW', 'W', 'vertex positions on the leg (findBend\'s and closeOnBp\'s); W/16 was routeMatchKBendsSeq3SearchW16', [1 / 16, 1 / 8]),
      runW: wKnob('runW', 'W', 'the run a new heading is read on: 3.4 W; with 1.7 W the run drifts off the ribbon and findBend adds a 4 deg correction bend (SeaTac 8 and 21, Beaver 17; runs of 1.7, 2.0, 2.5, 3.4 W compared, hallway.mjs)', [2.4, 3.4, 4.4]),
      sampleStepW: wKnob('sampleStepW', 'W', 'stations along every run (W/8 leaves no gap at any dev scale)', [1 / 16, 1 / 8]),
      lateralMissW: wKnob('lateralMissW', 'W', 'the heading step: the run\'s end misses by at most this between two headings (W/16: 1.05 deg on a 3.4 W run; W/8 on 1.7 W made 4/-4 deg zigzags)', [1 / 32, 1 / 16]),
      bendVisibleW: wKnob('bendVisibleW', 'W', 'the visible run a bend reading needs (the prototype\'s 25 stations, 1 px apart, on golden)', [0.4, 0.6, 0.8]),
      closeVisibleW: wKnob('closeVisibleW', 'W', 'the visible run the close on a BasketPoint needs (the prototype\'s 12 stations on golden)', [0.2, 0.3, 0.4]),
      gapW: wKnob('gapW', 'W', 'the run ends after this much failing run (the prototype\'s G = W stations)', [0.75, 1.0, 1.5]),
      refineEndW: wKnob('refineEndW', 'W', 'the winner is polished by halving down to this vertex step; null: no polish', [null, 1 / 32], numIn(0, 64, { open: true, nullable: true })),
      onLegLatR1: wKnob('onLegLatR1', 'R1', 'a BasketPoint this near the leg\'s centreline ends the hole on the leg (the prototype\'s 5 px on golden), or nearer than the leg x one heading step: a precision, not a bound', [0.1124]),
      onLegPastR1: wKnob('onLegPastR1', 'R1', 'how far past the run\'s end (which stops at the C1 ring, ~1 R1 short) that BasketPoint may lie: 1.6 W on golden; a read-ahead window of the run end, not a bound on the hole', [1.495])
    },
    toRules: (f) => (f.enabled ? { seqFollow: f.knobs.mode === 'w' ? 'w' : true, ...(f.knobs.mode === 'w' ? { followRes: Object.fromEntries(Object.keys(FOLLOW_W).filter((k) => f.knobs[k] !== FOLLOW_W[k]).map((k) => [k, f.knobs[k]])) } : {}) } : {}),
    fromRules: (E) => ({ enabled: Boolean(E.seqFollow), knobs: { mode: E.seqFollow === true ? 'px' : 'w', ...FOLLOW_W, ...(E.followRes ?? {}) } }) },
  { id: 'firstLegs', kind: 'deviation', defaultEnabled: false, needs: NEEDS_SEQ,
    note: 'every hole\'s first leg (tee cap -> B*) is owned from the start and its badge plate is foreign to the other holes (firstLegs.mjs; coordinator 2026-10-22, from the seatacFull 16 render): fixes seatacFull 16 and beaverranchLazy 3/17/20, swaps beaverranchLazy 1/21', knobs: {},
    toRules: (f) => (f.enabled ? { seqFirstLegs: true } : {}), fromRules: (E) => ({ enabled: Boolean(E.seqFirstLegs) }) },
  { id: 'sensor', kind: 'baseline', defaultEnabled: true, required: true,
    note: 'what the assignment reads',
    knobs: { mode: enumKnob('edge', ['edge', 'region', 'regionAll'], 'edge: the edge sensor everywhere; region: the assignment reads the hallway REGION (regionSpace.mjs), routes and per-hole steps read edges; regionAll: every measure reads the region (lane s7region 2026-10-21: shade and sidewalks beside the hallway)') },
    toRules: (f) => (f.knobs.mode === 'edge' ? {} : { sensor: f.knobs.mode }), fromRules: (E) => ({ enabled: true, knobs: { mode: E.sensor ?? 'edge' } }) }
].map((f) => Object.freeze({ needs: null, conflicts: [], assumptions: [], required: false, ...f, knobs: Object.freeze(f.knobs) })));
export const FEATURE_BY_ID = new Map(FEATURES.map((f) => [f.id, f]));

// --- integrity (import-time, registry.ts's check): unique ids, deviations default OFF, every default valid, assumptions stated
{
  const seen = new Set();
  for (const f of FEATURES) {
    if (seen.has(f.id)) throw new Error(`S7 feature registry: duplicate id ${f.id}`);
    seen.add(f.id);
    if (f.kind === 'deviation' && f.defaultEnabled) throw new Error(`S7 feature ${f.id}: a deviation must default OFF`);
    if (f.required && !f.defaultEnabled) throw new Error(`S7 feature ${f.id}: a required feature is enabled`);
    for (const c of f.conflicts) if (!FEATURE_BY_ID.has(c)) throw new Error(`S7 feature ${f.id}: conflicts with unknown ${c}`);
    for (const a of f.assumptions) if (!ASSUMPTIONS.has(a)) throw new Error(`S7 feature ${f.id}: assumption ${a} is not stated (fg/assumptions.mjs)`);
    for (const [k, s] of Object.entries(f.knobs)) {
      if (!UNITS[s.unit]) throw new Error(`S7 feature ${f.id} knob ${k}: unit ${s.unit} is not one of ${Object.keys(UNITS).join(', ')}`);
      if (!s.note) throw new Error(`S7 feature ${f.id} knob ${k}: no note`);
      const e = s.validate(s.default); if (e) throw new Error(`S7 feature ${f.id} knob ${k}: default invalid: ${e}`);
      for (const v of s.sweep ?? []) { const ev = s.validate(v); if (ev) throw new Error(`S7 feature ${f.id} knob ${k}: sweep value invalid: ${ev}`); }
      if (s.assumption && !ASSUMPTIONS.has(s.assumption)) throw new Error(`S7 feature ${f.id} knob ${k}: assumption ${s.assumption} is not stated`);
    }
  }
}

// ------------------------------------------------------------------------------------------------ configs
const defaultState = (f) => ({ enabled: f.defaultEnabled, knobs: Object.fromEntries(Object.entries(f.knobs).map(([k, s]) => [k, s.default])) });

/**
 * Check a sparse config: { schema?, name?, note?, features: { [id]: { enabled?, knobs? } } }. -> { ok, errors, state }:
 * state is every feature's resolved state (defaults merged with the deviations). Never throws; resolveConfig does. lenient: knobs without effect are
 * warnings (a grid's product), not errors.
 */
export function checkConfig(raw, { lenient = false } = {}) {
  const errors = [], warnings = [];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['a config must be a JSON object'], state: null };
  for (const k of Object.keys(raw)) if (!['$schema', 'schema', 'name', 'note', 'features'].includes(k)) errors.push(`unknown key '${k}'`);
  if (raw.schema !== undefined && raw.schema !== CONFIG_SCHEMA) errors.push(`schema must be '${CONFIG_SCHEMA}'`);
  const dev = raw.features ?? {};
  if (dev === null || typeof dev !== 'object' || Array.isArray(dev)) return { ok: false, errors: [...errors, 'features must map feature ids to { enabled?, knobs? }'], state: null };
  const state = Object.fromEntries(FEATURES.map((f) => [f.id, defaultState(f)]));
  for (const [id, d] of Object.entries(dev)) {
    const f = FEATURE_BY_ID.get(id);
    if (!f) { errors.push(`unknown feature '${id}'`); continue; }
    if (d === null || typeof d !== 'object') { errors.push(`feature '${id}': settings must be an object`); continue; }
    for (const k of Object.keys(d)) if (k !== 'enabled' && k !== 'knobs') errors.push(`feature '${id}': unknown key '${k}'`);
    if (d.enabled !== undefined) {
      if (typeof d.enabled !== 'boolean') errors.push(`feature '${id}': enabled must be a boolean`);
      else if (f.required && !d.enabled) errors.push(`feature '${id}' is required: it cannot be disabled (set its knobs)`);
      else state[id].enabled = d.enabled;
    }
    for (const [k, v] of Object.entries(d.knobs ?? {})) {
      const s = f.knobs[k];
      if (!s) { errors.push(`feature '${id}': unknown knob '${k}'`); continue; }
      const e = s.validate(v);
      if (e) errors.push(`feature '${id}' knob '${k}': ${e}`); else state[id].knobs[k] = v;
    }
  }
  for (const [id, d] of Object.entries(dev)) {
    const f = FEATURE_BY_ID.get(id);
    if (!f || !d || typeof d !== 'object') continue;
    const sets = d.enabled === true || Object.keys(d.knobs ?? {}).length > 0;
    // lenient (a grid's product): knobs that cannot act in this combination are dropped as duplicates, not errors; enabling a
    // feature whose needs are unmet stays an error (that combination is recorded as skipped)
    if (sets && f.needs && !f.needs.when(state)) (lenient && d.enabled !== true ? warnings : errors).push(`feature '${id}' ${f.needs.why}`);
    if (sets && state[id].enabled) for (const c of f.conflicts) if (state[c].enabled) errors.push(`feature '${id}' conflicts with '${c}' (both enabled)`);
    for (const [k, v] of Object.entries(d.knobs ?? {})) { const s = f.knobs[k]; if (s?.when && !s.when(state) && (!f.needs || f.needs.when(state))) (lenient ? warnings : errors).push(`feature '${id}' knob '${k}' = ${JSON.stringify(v)} has no effect in this config`); }
  }
  return { ok: errors.length === 0, errors, warnings, state };
}

/** The canonical form of a resolved state: active features only (needs met), a disabled feature without knobs, inactive knobs dropped. */
function canonicalOf(state) {
  const features = {};
  for (const f of FEATURES) {
    if (f.needs && !f.needs.when(state)) continue;
    const s = state[f.id];
    features[f.id] = s.enabled ? { enabled: true, knobs: Object.fromEntries(Object.entries(f.knobs).filter(([, spec]) => !spec.when || spec.when(state)).map(([k]) => [k, s.knobs[k]])) } : { enabled: false };
  }
  return { schema: CONFIG_SCHEMA, features };
}

/**
 * Resolve a sparse config (an object, or a NAMED_CONFIGS name) against the registry. Throws on an invalid config (an input's
 * integrity: unknown feature, bad value, unmet need, conflict). -> { name, canonical, hash, short, rules }
 */
export function resolveConfig(raw = {}) {
  const named = typeof raw === 'string' ? raw : null;
  if (named && !(named in NAMED_CONFIGS)) throw new Error(`S7 config: no named config '${named}'`);
  const cfg = named ? NAMED_CONFIGS[named] : raw;
  const c = checkConfig(cfg);
  if (!c.ok) throw new Error(`S7 config${cfg?.name ? ` ${cfg.name}` : named ? ` ${named}` : ''}: ${c.errors.join('; ')}`);
  const canonical = canonicalOf(c.state), hash = configHash(canonical);
  return Object.freeze({ name: named ?? cfg.name ?? null, canonical, hash, short: hash.slice(0, 12), rules: rulesOf(canonical) });
}
/** sha256 of the canonical config's canonical JSON (keys sorted): two sparse configs that resolve alike hash alike. */
export const configHash = (canonical) => sha256Hex(canonicalJson(canonical));

/** The match.mjs options of a canonical config: MATCH_RULES' keys always, every other option only when not its absent value. */
export function rulesOf(canonical) {
  const out = {};
  for (const f of FEATURES) {
    const s = canonical.features[f.id];
    if (!s) continue;
    for (const [k, v] of Object.entries(f.toRules({ enabled: s.enabled, knobs: s.knobs ?? {} }))) {
      const absent = LEGACY_ABSENT[k];
      if (MATCH_RULES_KEYS.includes(k) || canonicalJson(v) !== canonicalJson(absent)) out[k] = v;
    }
  }
  return Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
}

/** Read an options object (a recorded rule set) as a full state; MATCH_RULES merged first, as routeMatch does. Unknown keys throw. */
export function stateFromRules(rules, matchRules) {
  const E = { ...matchRules, ...rules };
  for (const k of Object.keys(E)) if (!(k in LEGACY_ABSENT)) throw new Error(`S7 config: option '${k}' is not a feature or knob of the registry`);
  return Object.fromEntries(FEATURES.map((f) => { const d = defaultState(f), r = f.fromRules(E); return [f.id, { enabled: r.enabled, knobs: { ...d.knobs, ...Object.fromEntries(Object.entries(r.knobs ?? {}).filter(([k]) => k in d.knobs)) } }]; }));
}
/** The sparse config (deviations from the defaults) of a full state: what a config file holds. */
export function sparseOf(state) {
  const canon = canonicalOf(state), dflt = canonicalOf(Object.fromEntries(FEATURES.map((f) => [f.id, defaultState(f)]))), features = {};
  for (const [id, s] of Object.entries(canon.features)) {
    const d = dflt.features[id] ?? { enabled: FEATURE_BY_ID.get(id).defaultEnabled, knobs: defaultState(FEATURE_BY_ID.get(id)).knobs }, out = {};
    if (s.enabled !== d.enabled) out.enabled = s.enabled;
    const knobs = Object.fromEntries(Object.entries(s.knobs ?? {}).filter(([k, v]) => canonicalJson(v) !== canonicalJson((d.knobs ?? defaultState(FEATURE_BY_ID.get(id)).knobs)[k] ?? defaultState(FEATURE_BY_ID.get(id)).knobs[k])));
    if (Object.keys(knobs).length) out.knobs = knobs;
    if (Object.keys(out).length) features[id] = out;
  }
  return { features };
}

/**
 * The recorded rule sets (ports/s7route/match.mjs RULE_SETS, each a routeMatch variant in impl/fn.Hole.trace/) as sparse configs
 * over the S7 default. Each resolves to exactly the options it had (features.test.mjs, against fixtures/rule-sets.legacy.json).
 */
const OLD = { kBends: { enabled: false }, routeTable: { knobs: { search: 'lean' } }, stations: { knobs: { units: 'px' } }, straightSecondBend: { enabled: false }, placeAxis: { enabled: false }, firstBend: { knobs: { mode: 'free' } } };
const pre = (extra = {}) => ({ features: { ...OLD, ...extra } });
const seq = (extra = {}) => ({ features: { ...extra } });
export const NAMED_CONFIGS = Object.freeze({
  routeMatch: pre({ routeTable: { knobs: { search: 'full' } }, refine: { knobs: { units: 'r1' } }, secondBend: { knobs: { grid: 'fine' } } }),
  routeMatchS6straight: pre({ routeTable: { knobs: { search: 'full' } }, refine: { knobs: { units: 'r1' } }, secondBend: { knobs: { grid: 'fine' } } }),
  routeMatchS6CoordWide: pre({ routeTable: { knobs: { search: 'full' } }, refine: { knobs: { units: 'r1' } }, secondBend: { knobs: { grid: 'fine' } } }),
  routeMatchS6Dense: pre({ routeTable: { knobs: { search: 'full' } }, refine: { knobs: { units: 'r1' } }, secondBend: { knobs: { refine: 'dense', grid: 'fine' } } }),
  routeMatchS6PxDense: pre({ routeTable: { knobs: { units: 'px', search: 'full' } }, secondBend: { knobs: { refine: 'dense', grid: 'fine' } } }),
  routeMatchDenseSecondBend: pre({ routeTable: { knobs: { search: 'full' } }, refine: { knobs: { units: 'r1' } }, secondBend: { knobs: { refine: 'dense', grid: 'fine' } } }),
  routeMatchPxRefine: pre({ routeTable: { knobs: { search: 'full' } }, secondBend: { knobs: { grid: 'fine' } } }),
  routeMatchPxTable: pre({ routeTable: { knobs: { units: 'px', search: 'full' } }, secondBend: { knobs: { grid: 'fine' } } }),
  routeMatchFast: pre({ routeTable: { knobs: { search: 'fast' } }, refine: { knobs: { units: 'r1' } }, secondBend: { knobs: { grid: 'fine' } } }),
  routeMatchFastPxRefine: pre({ routeTable: { knobs: { search: 'fast' } }, secondBend: { knobs: { grid: 'fine' } } }),
  routeMatchLean: pre({ refine: { knobs: { units: 'r1' } }, secondBend: { knobs: { grid: 'fine' } } }),
  routeMatchLeanPxRefine: pre({ secondBend: { knobs: { grid: 'fine' } } }),
  routeMatchLeanCoarse2: pre({ refine: { knobs: { units: 'r1' } } }),
  routeMatchLeanPxRefineCoarse2: pre(),
  routeMatchBadgeMid: pre({ routeTable: { knobs: { search: 'badgeMid' } } }),
  routeMatchBadgeMidPinned: pre({ routeTable: { knobs: { search: 'badgeMid' } }, secondBend: { knobs: { b1: 'badge' } }, firstBend: { knobs: { mode: 'badge' } } }),
  routeMatchLeanBadgeMid2: pre({ secondBend: { knobs: { b1: 'badge' } } }),
  routeMatchLeanBadgePrior: pre({ firstBend: { knobs: { mode: 'badgePrior' } } }),
  routeMatchBadgeMidPrior: pre({ routeTable: { knobs: { search: 'badgeMid' } }, firstBend: { knobs: { mode: 'badgePrior' } } }),
  routeMatchLeanPxRefineCoarse2R1St: pre({ stations: { knobs: { units: 'r1' } } }),
  routeMatchLeanPxRefineCoarse2StraightB2: pre({ straightSecondBend: { enabled: true } }),
  routeMatchLeanPxRefineCoarse2AxisB1: pre({ placeAxis: { enabled: true } }),
  routeMatchLeanPxRefineCoarse2TeeAxis: pre({ stations: { knobs: { units: 'r1' } }, straightSecondBend: { enabled: true }, placeAxis: { enabled: true } }),
  routeMatchTeeAxisBadgePrior: { features: { kBends: { enabled: false }, routeTable: { knobs: { search: 'lean' } } } },
  routeMatchBadgeMidTeeAxisPrior: { features: { kBends: { enabled: false } } },
  routeMatchKBends: { features: { kBends: { knobs: { mode: 'bottleneck' } }, routeTable: { knobs: { search: 'lean' } } } },
  routeMatchKBendsSeq: seq({ neighbourhood: { knobs: { ranks: 5 } }, seqWiden: { enabled: false }, seqOwn: { enabled: false }, turnPrice: { enabled: false }, follower: { enabled: false }, kBends: { knobs: { refineStarts: 1 } } }),
  routeMatchKBendsSeq3: seq({ seqOwn: { enabled: false }, turnPrice: { enabled: false }, follower: { enabled: false }, kBends: { knobs: { refineStarts: 1 } } }),
  routeMatchKBendsSeq3Search: seq({ follower: { knobs: { mode: 'px' } }, kBends: { knobs: { refineStarts: 1 } } }),
  routeMatchKBendsSeq3SearchW: seq(),
  routeMatchKBendsSeq3SearchWEvidence: seq({ evidenceRank: { enabled: true } }),
  routeMatchKBendsSeq3SearchWFirstLegs: seq({ firstLegs: { enabled: true } }),
  routeMatchKBendsSeq3SearchW16: seq({ follower: { knobs: { vertexStepW: 1 / 16 } }, kBends: { knobs: { refineStarts: 1 } } }),
  routeMatchKBendsSeq3SearchWK: seq({ kBends: { knobs: { refineStarts: 1, units: 'w' } } }),
  routeMatchKBendsSeq3RegionGate: seq({ regionGate: { enabled: true }, seqOwn: { enabled: false }, turnPrice: { enabled: false }, follower: { enabled: false }, kBends: { knobs: { refineStarts: 1 } } }),
  routeMatchKBendsSeq3RegionScore: seq({ regionScore: { enabled: true }, seqOwn: { enabled: false }, turnPrice: { enabled: false }, follower: { enabled: false }, kBends: { knobs: { refineStarts: 1 } } }),
  routeMatchKBendsSeq3RegionWiden: seq({ regionGate: { enabled: true, knobs: { scope: 'widen' } }, seqOwn: { enabled: false }, turnPrice: { enabled: false }, follower: { enabled: false }, kBends: { knobs: { refineStarts: 1 } } }),
  routeMatchKBendsSeq3Region: seq({ regionGate: { enabled: true }, regionScore: { enabled: true }, seqOwn: { enabled: false }, turnPrice: { enabled: false }, follower: { enabled: false }, kBends: { knobs: { refineStarts: 1 } } }),
  routeMatchTeeAxisBadgePriorRegion: { features: { kBends: { enabled: false }, routeTable: { knobs: { search: 'lean' } }, sensor: { knobs: { mode: 'region' } } } },
  routeMatchTeeAxisBadgePriorRegionAll: { features: { kBends: { enabled: false }, routeTable: { knobs: { search: 'lean' } }, sensor: { knobs: { mode: 'regionAll' } } } }
});

// ------------------------------------------------------------------------------------------------ grids
/** A seeded PRNG (mulberry32): the same seed, the same subsample. */
export function prng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const merge = (a, b) => { const out = { ...a }; for (const [id, d] of Object.entries(b)) out[id] = { ...(out[id] ?? {}), ...(d.enabled !== undefined ? { enabled: d.enabled } : {}), ...(d.knobs ? { knobs: { ...(out[id]?.knobs ?? {}), ...d.knobs } } : {}) }; return out; };
/** One axis value as a sparse features fragment. Axis forms: { feature, values: [bool] } | { knob: 'feature.knob', values } | { name, options: { label: fragment } }. */
function axisValues(axis) {
  if (axis.feature) {
    if (!FEATURE_BY_ID.has(axis.feature)) throw new Error(`S7 grid: unknown feature '${axis.feature}'`);
    return (axis.values ?? [false, true]).map((v) => ({ label: `${axis.feature}=${v ? 'on' : 'off'}`, fragment: { [axis.feature]: { enabled: v } } }));
  }
  if (axis.knob) {
    const [id, k] = axis.knob.split('.'), f = FEATURE_BY_ID.get(id), s = f?.knobs[k];
    if (!s) throw new Error(`S7 grid: unknown knob '${axis.knob}'`);
    const values = axis.values === 'sweep' || axis.values === undefined ? s.sweep : axis.values;
    for (const v of values) { const e = s.validate(v); if (e) throw new Error(`S7 grid: knob '${axis.knob}' value ${JSON.stringify(v)}: ${e}`); }
    return values.map((v) => ({ label: `${axis.knob}=${typeof v === 'number' ? +v.toFixed(4) : v}`, fragment: { [id]: { knobs: { [k]: v } } } }));
  }
  if (axis.options) return Object.entries(axis.options).map(([label, fragment]) => ({ label: `${axis.name ?? 'option'}=${label}`, fragment }));
  throw new Error('S7 grid: an axis is { feature, values } | { knob, values } | { name, options }');
}
/**
 * Expand a grid spec into configs: { base?: sparse config | named config, axes: [...], cross?: [...], include?: [named],
 * sample?: { n, seed } }. The cartesian product of the axes over the base; optionally a seeded random subsample of n of it (the base
 * and the included named configs are always kept), then crossed with every value of the cross axes; invalid combinations recorded (skipped, with the errors); duplicates by config hash merged.
 * -> { product, sampled, configs: [{ hash, short, labels, names, sparse, canonical, rules }], skipped: [{ labels, errors }], duplicates }
 */
export function expandGrid(spec) {
  const base = typeof spec.base === 'string' ? NAMED_CONFIGS[spec.base] : spec.base ?? NAMED_CONFIGS[S7_DEFAULT_NAME];
  if (!base) throw new Error(`S7 grid: no named config '${spec.base}'`);
  const axes = (spec.axes ?? []).map(axisValues);
  let combos = [[]];
  for (const vals of axes) combos = combos.flatMap((c) => vals.map((v) => [...c, v]));
  const product = combos.length * (spec.cross ?? []).reduce((a, x) => a * axisValues(x).length, 1);
  if (spec.sample?.n && spec.sample.n < combos.length) {
    const rnd = prng(spec.sample.seed ?? 1), idx = combos.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    combos = idx.slice(0, spec.sample.n).sort((a, b) => a - b).map((i) => combos[i]);
  }
  // cross: axes crossed with every kept combination after the subsample (e.g. a final-assignment option whose twin shares the
  // sequencing's cells, so it costs only the final ranking)
  for (const vals of (spec.cross ?? []).map(axisValues)) combos = combos.flatMap((c) => vals.map((v) => [...c, v]));
  const entries = [{ labels: ['base'], names: typeof spec.base === 'string' ? [spec.base] : spec.base ? [] : [S7_DEFAULT_NAME], sparse: { features: base.features ?? {} } },
    ...(spec.include ?? []).map((n) => { if (!NAMED_CONFIGS[n]) throw new Error(`S7 grid: no named config '${n}'`); return { labels: [`named ${n}`], names: [n], sparse: NAMED_CONFIGS[n] }; }),
    ...combos.map((c) => ({ labels: c.map((v) => v.label), names: [], sparse: { features: c.reduce((acc, v) => merge(acc, v.fragment), base.features ?? {}) } }))];
  const byHash = new Map(), skipped = [];
  let duplicates = 0;
  for (const e of entries) {
    const chk = checkConfig(e.sparse, { lenient: true });
    if (!chk.ok) { skipped.push({ labels: e.labels, errors: chk.errors }); continue; }
    const canonical = canonicalOf(chk.state), hash = configHash(canonical);
    const had = byHash.get(hash);
    if (had) { duplicates++; had.labels.push(e.labels.join(' ')); had.names.push(...e.names); continue; }
    byHash.set(hash, { hash, short: hash.slice(0, 12), labels: [e.labels.join(' ')], names: [...e.names], sparse: sparseOf(chk.state), canonical, rules: rulesOf(canonical) });
  }
  for (const [name, cfg] of Object.entries(NAMED_CONFIGS)) { const r = resolveConfig(cfg); const c = byHash.get(r.hash); if (c && !c.names.includes(name)) c.names.push(name); }
  return { product, sampled: combos.length, configs: [...byHash.values()], skipped, duplicates };
}

/** The registry as rows (feature, kind, default, knob, unit, default, sweep, assumption, note): for the docs and `pxc sweep --registry`. */
export function registryRows() {
  return FEATURES.flatMap((f) => [{ feature: f.id, kind: f.kind, enabled: f.defaultEnabled, required: f.required, needs: f.needs ? f.needs.why : null, conflicts: f.conflicts, assumptions: f.assumptions, note: f.note },
    ...Object.entries(f.knobs).map(([k, s]) => ({ feature: f.id, knob: k, unit: s.unit, default: s.default, values: s.values ?? null, sweep: s.sweep ?? null, assumption: s.assumption ?? null, note: s.note }))]);
}
