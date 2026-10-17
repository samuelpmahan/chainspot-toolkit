/**
 * Evidence: the S0..S3 Tick testimony plus the Part values each Tick
 * produced, read from a golden attempt's stage output (node-only, read-only).
 *
 *   loadEvidence({ baseDir, assemblyDir? }) -> {
 *     frame, source, receipts: { base, assembly }, steps: [Step] }
 *   Step = { key, stage, tick, lane, calculations, consumes, produces,
 *            verdicts: [{ name, ok }], outs: [Out], reconstructed? }
 *   Out  = { address, value (Part facets), base (declared inPart or null),
 *            contract ('tee.pose' | 'object.box' | null), supersedes: [],
 *            roleCalc?: { role: calculation } }
 *
 * This is NOT a Δ stream. It is the after-value of every Part a Tick
 * wrote, in Tick order, which every model encodes its own way. Where a
 * Tick's Part was never serialized (masks, components, family/stage
 * bodies) the value is reconstructed from what downstream Parts recorded
 * about it, and the step says so in `reconstructed`.
 *
 * Object ids are stable along a lineage when the artifacts give a stable
 * index (b<index> for badges, k<index> for baskets, g<index> for tee rings);
 * px.tees (T<label>) and px.tees.refined (R<label>) relabel, so the tee
 * lineage is joined by geometry (contracts/tee.pose@1), never by id.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { toRuns } from './px.mjs';
import { boxCenter } from './contracts.mjs';

const read = (dir, rel) => JSON.parse(readFileSync(join(dir, rel), 'utf8'));
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const okOf = (v) => v === true || (typeof v === 'number' && Number.isFinite(v));
const checksToVerdicts = (checks = {}) => Object.entries(checks).map(([name, v]) => ({ name, ok: okOf(v) }));
const ringKey = (r) => `${r4(r.cx)},${r4(r.cy)}`;

function tickOf(receipt, stageId, tickId) {
  const stage = receipt.stages.find((s) => s.id === stageId);
  const t = stage?.ticks.find((x) => x.id === tickId);
  if (!t) throw new Error(`evidence: tick ${stageId}/${tickId} not in receipt`);
  return t;
}
const artSha = (t, id) => t.artifacts?.find((a) => a.id === id)?.sha256 ?? null;

export function loadEvidence({ baseDir, assemblyDir = null }) {
  const R = read(baseDir, 'run.receipt.json');
  const A = (rel) => read(join(baseDir, 'artifacts'), rel);
  const W = R.source?.widthPx ?? R.crop.croppedPx.width;
  const frame = { width: R.crop.croppedPx.width, height: R.crop.croppedPx.height };
  const steps = [];
  const step = (stage, tickId, extra) => {
    const t = extra.tickRecord ?? tickOf(R, stage, tickId);
    const s = {
      key: `${stage}/${tickId}`, stage, tick: tickId, lane: extra.lane ?? null,
      calculations: t.declared.calculations, consumes: t.actual?.consumes ?? t.declared.consumes, produces: t.actual?.produces ?? t.declared.produces,
      verdicts: extra.verdicts ?? [], outs: extra.outs ?? []
    };
    if (extra.reconstructed) s.reconstructed = extra.reconstructed;
    steps.push(s);
    return s;
  };

  // ---------------- S0
  const s0crop = tickOf(R, 'S0', 'source.cropUDiscChrome');
  step('S0', 'source.decodeFullImage', { outs: [{ address: 'px.source.fullImage', base: null, value: { scalars: { width: R.crop.originalPx.width, height: R.crop.originalPx.height, sourceSha256: R.stages[0].inputSourceSha256 ?? null } } }] });
  step('S0', 'source.cropUDiscChrome', {
    outs: [{
      address: 'px.course.canonicalPixels', base: 'px.source.fullImage',
      value: {
        scalars: { width: frame.width, height: frame.height, canonicalRgbaSha256: artSha(s0crop, s0crop.artifacts[0]?.id), cropMethod: R.crop.cropMethod, upperRowsRemoved: R.crop.upperRowsRemoved, lowerRowsRemoved: R.crop.lowerRowsRemoved },
        elim: {
          top: { bbox: [0, -R.crop.upperRowsRemoved, frame.width, R.crop.upperRowsRemoved], why: 'chrome-crop' },
          bottom: { bbox: [0, frame.height, frame.width, R.crop.lowerRowsRemoved], why: 'chrome-crop' }
        }
      }
    }]
  });
  step('S0', 'source.cacheFullImage', { outs: [] });

  // ---------------- S1
  const badgesArt = A('s1/px.badges.json');
  const digitsArt = A('s1/px.digits.json');
  const glyphArt = A('s1/badgeGlyphTemplate.json');
  const masksT = tickOf(R, 'S1', 'badgeStage.masks'), compT = tickOf(R, 'S1', 'badgeStage.components');
  step('S1', 'badges.acceptCroppedImage', {
    reconstructed: 'opaque: dims and digest only',
    outs: [
      { address: 'localImage', base: null, value: { scalars: { width: frame.width, height: frame.height, sha256: artSha(masksT, 'badgeStage.masks.localImage') } } },
      { address: 'viewport', base: null, value: { scalars: { written: true } } },
      { address: 'px.image.cropped', base: null, value: { scalars: { width: frame.width, height: frame.height } } }
    ]
  });
  step('S1', 'badgeStage.masks', { reconstructed: 'opaque: digests only', outs: [{ address: 'badgeStage.masks', base: null, value: { scalars: { bright: artSha(masksT, 'badgeStage.masks.bright'), dark: artSha(masksT, 'badgeStage.masks.dark') } } }] });
  step('S1', 'badgeStage.components', { reconstructed: 'opaque: digests only', outs: [{ address: 'badgeStage.components', base: null, value: { scalars: { bright: artSha(compT, 'badgeStage.components.bright'), dark: artSha(compT, 'badgeStage.components.dark') } } }] });

  // px.components: only the components a downstream Part names (partial)
  const comps = {};
  const addComp = (c) => { if (c) comps[`${c.polarity}:${c.label}`] = { polarity: c.polarity, label: c.label, bbox: c.bbox, center: boxCenter(c.bbox), area: c.area }; };
  for (const b of badgesArt.badges) for (const c of b.findPx.parts) addComp(c);
  const basketsArt = A('s2/px.baskets.json');
  for (const k of basketsArt.baskets) addComp(k.findPx.body);
  const teesArt = A('s3/px.tees.json');
  for (const t of teesArt.tees) for (const c of t.findPx.parts) addComp(c);
  step('S1', 'components.publish', {
    reconstructed: 'px.components is partial: only components named by px.badges, px.baskets and px.tees',
    outs: [
      { address: 'px.components.masks', base: null, value: { scalars: { published: true } } },
      { address: 'px.components', base: null, contract: 'object.box', value: { objects: comps, scalars: { partial: true } } }
    ]
  });

  const bid = (b) => `b${b.index}`;
  const badgeBase = (b) => ({ bbox: b.bbox, center: boxCenter(b.bbox), source: b.source });
  const family = Object.fromEntries(badgesArt.badges.filter((b) => b.source === 'bright-family').map((b) => [bid(b), badgeBase(b)]));
  step('S1', 'Badge.detectFamily', { reconstructed: 'family members = px.badges with source bright-family', outs: [{ address: 'px.badges.family', base: null, contract: 'object.box', value: { objects: family } }] });
  const stageObjs = Object.fromEntries(badgesArt.badges.map((b) => [bid(b), badgeBase(b)]));
  step('S1', 'Badge.recover', {
    reconstructed: 'stage = family plus recovered badges (none recovered on this board)',
    outs: [
      { address: 'px.badges.stage', base: 'px.badges.family', contract: 'object.box', value: { objects: stageObjs } },
      { address: 'stage', base: null, value: { scalars: { written: true } } }
    ]
  });
  const labelled = Object.fromEntries(badgesArt.badges.map((b) => [bid(b), { ...badgeBase(b), label: b.label, rawLabel: b.rawLabel, confidence: r4(b.confidence) }]));
  step('S1', 'badges', { outs: [{ address: 'badges', base: 'px.badges.stage', contract: 'object.box', value: { objects: labelled } }] });

  const pxBadges = {};
  for (const b of badgesArt.badges) {
    const own = new Set(b.px);
    pxBadges[`${bid(b)}|own`] = toRuns(b.px);
    pxBadges[`${bid(b)}|mute`] = toRuns(b.mute.px.filter((p) => !own.has(p)));
  }
  const pxBadgesObjs = Object.fromEntries(badgesArt.badges.map((b) => [bid(b), { ...labelled[bid(b)], whitePx: b.whitePx, blackPx: b.blackPx, components: b.findPx.parts.map((c) => `${c.polarity}:${c.label}`) }]));
  step('S1', 'Badge.findPx', {
    verdicts: checksToVerdicts(R.materializations.S1?.checks),
    outs: [{
      address: 'px.badges', base: 'badges', contract: 'object.box', roleCalc: { mute: 'fn.Badge.mute' },
      value: { objects: pxBadgesObjs, px: pxBadges, scalars: { muteRadiusPx: badgesArt.badges[0]?.mute.radiusPx ?? null } }
    }]
  });

  // FG layer: digits own their enclosed counters (ownership-by-enclosure)
  const digitObjs = {}, digitPx = {};
  for (const b of digitsArt.badges) {
    b.digits.forEach((d, k) => { digitObjs[`b${b.index}/d${k}`] = { badge: `b${b.index}`, bbox: d.bbox, center: boxCenter(d.bbox), predicted: d.predicted, margin: r4(d.margin) }; });
    for (const c of b.counters) digitPx[`b${b.index}/d${c.digitIndex}/c${c.componentLabel}|own`] = toRuns(c.px);
  }
  const dRec = R.materializations.S1Digits;
  steps.push({
    key: 'S1/fg.s1.pxDigits.materialize', stage: 'S1', tick: 'fg.s1.pxDigits.materialize', lane: null,
    calculations: ['fn.readCourseBadges (g1.digits)'], consumes: ['badges', 'px.badges', 'px.components', 'localImage'], produces: ['px.badges.digits'],
    verdicts: checksToVerdicts(dRec?.checks),
    outs: [{ address: 'px.badges.digits', base: null, value: { objects: digitObjs, px: digitPx, scalars: { rule: 'ownership-by-enclosure' } } }]
  });
  const glyphRows = Object.fromEntries(glyphArt.verdicts.map((v) => [`b${v.badgeId.replace('badge-', '')}`, { agreement: v.agreement, currentLabel: v.currentLabel, templateLabel: v.templateLabel, templateAbstention: v.templateAbstention }]));
  steps.push({
    key: 'S1/fg.s1.badgeGlyphTemplate.materialize', stage: 'S1', tick: 'fg.s1.badgeGlyphTemplate.materialize', lane: null,
    calculations: ['badgeGlyphTemplate (g1.badgeGlyphTemplate)'], consumes: ['px.badges'], produces: ['badgeGlyphTemplate'],
    verdicts: checksToVerdicts(R.materializations.S1BadgeGlyphTemplate?.checks),
    outs: [{ address: 'badgeGlyphTemplate', base: null, value: { ledger: glyphRows } }]
  });

  let assemblyReceipt = null;
  if (assemblyDir && existsSync(join(assemblyDir, 'artifacts/s1assembly/px.badges.assembly.json'))) {
    assemblyReceipt = read(assemblyDir, 'run.receipt.json');
    const asm = read(assemblyDir, 'artifacts/s1assembly/px.badges.assembly.json');
    const branch = assemblyReceipt.experiments.branches.S1ASM;
    const objs = {}, px = {};
    for (const b of asm.badges) {
      objs[`b${b.index}`] = { bbox: b.bbox, center: boxCenter(b.bbox), label: b.label, source: b.source, components: b.components.map((c) => ({ name: c.name, role: c.role, pxCount: c.pxCount })), anchorDeltaPx: b.anchor.deltaPx, residuePx: b.residue.unexplainedResiduePx };
      for (const c of b.components) px[`b${b.index}/${c.name}|own`] = toRuns(c.px);
      for (const c of b.counters) px[`b${b.index}/d${c.digitIndex}/c${c.componentLabel}|own`] = toRuns(c.px);
    }
    step('S1', 'early.S1.badgeAssembly', {
      tickRecord: branch.ticks[0], lane: branch.lane,
      verdicts: checksToVerdicts(assemblyReceipt.materializations.S1BadgeAssembly?.checks),
      outs: [{ address: 'px.badges.assembly', base: 'px.badges', contract: 'object.box', value: { objects: objs, px } }]
    });
  }

  // ---------------- S2
  const kid = (k) => `k${k.index}`;
  const kFamily = {}, kShell = {}, kFinal = {}, pxBody = {}, pxShell = {}, pxOwn = {};
  for (const k of basketsArt.baskets) {
    const shell = new Set(k.shell.blackPx);
    const body = k.px.filter((p) => !shell.has(p));
    const b = k.detectFamily.body;
    kFamily[kid(k)] = { bbox: b.bbox, center: boxCenter(b.bbox), area: b.area, component: `${b.polarity}:${b.label}` };
    kShell[kid(k)] = { ...kFamily[kid(k)], shellMargins: k.shell.margins };
    kFinal[kid(k)] = { ...kShell[kid(k)], bbox: k.bbox, center: boxCenter(k.bbox), label: k.label, whitePx: k.whitePx, blackPx: k.blackPx };
    pxBody[`${kid(k)}|cand`] = toRuns(body);
    pxShell[`${kid(k)}|cand`] = toRuns(k.px);
    pxOwn[`${kid(k)}|own`] = toRuns(k.px);
  }
  step('S2', 'Basket.detectFamily', { reconstructed: 'body px = px.baskets px minus shell px', outs: [{ address: 'px.baskets.family', base: null, value: { objects: kFamily, px: pxBody } }] });
  step('S2', 'Basket.findShellFamily', { outs: [{ address: 'px.baskets.shellFamily', base: 'px.baskets.family', value: { objects: kShell, px: pxShell } }] });
  step('S2', 'Basket.findPx', { verdicts: checksToVerdicts(R.materializations.S2?.checks), outs: [{ address: 'px.baskets', base: 'px.baskets.shellFamily', value: { objects: kFinal, px: pxOwn } }] });

  // ---------------- S3
  const rf = A('s3/px.tees.rings-family.json');
  const gIndex = new Map(rf.rings.enclosed.map((r, j) => [ringKey(r), `g${j}`]));
  const gid = (r) => { const id = gIndex.get(ringKey(r)); if (!id) throw new Error(`evidence: ring ${ringKey(r)} not among enclosed rings`); return id; };
  const ringObj = (r) => ({ center: [r4(r.cx), r4(r.cy)], angleRad: r4(r.angle), bbox: [r.bboxX, r.bboxY, r.bboxW, r.bboxH], holeArea: r.holeArea, elongation: r4(r.elongation), ringFrac: r4(r.ringFrac), kind: r.kind });
  const elongated = new Set(rf.rings.elongated.map(ringKey)), excluded = new Set(rf.rings.excludedByBadge.map(ringKey));
  const ringsObjs = Object.fromEntries(rf.rings.candidates.map((r) => [gid(r), ringObj(r)]));
  const ringsElim = {};
  for (const r of rf.rings.enclosed) {
    if (!elongated.has(ringKey(r))) ringsElim[gid(r)] = { ...ringObj(r), why: 'not-elongated' };
    else if (excluded.has(ringKey(r))) ringsElim[gid(r)] = { ...ringObj(r), why: 'excluded-by-badge' };
  }
  step('S3', 'Tee.detectRings', { reconstructed: 'not-elongated = enclosed minus elongated', outs: [{ address: 'px.tees.rings', base: null, contract: 'tee.pose', value: { objects: ringsObjs, elim: ringsElim } }] });

  const memberObj = (m) => ({ ...ringObj(m.ring), angleRad: r4(m.frame.angle), frame: { label: m.frame.label, area: m.frame.area, major: r4(m.frame.major), minor: r4(m.frame.minor), fill: r4(m.frame.fill), bbox: [m.frame.bboxX, m.frame.bboxY, m.frame.bboxW, m.frame.bboxH] } });
  const members = new Set(rf.family.members.map((m) => ringKey(m.ring)));
  const famObjs = Object.fromEntries(rf.family.members.map((m) => [gid(m.ring), memberObj(m)]));
  const famElim = {};
  for (const r of rf.family.unframed) famElim[gid(r)] = { ...ringObj(r), why: 'unframed' };
  for (const m of rf.family.measured) if (!members.has(ringKey(m.ring))) famElim[gid(m.ring)] = { ...memberObj(m), why: 'not-member' };
  step('S3', 'Tee.findFamily', {
    verdicts: checksToVerdicts(R.materializations.S3RingsFamily?.checks),
    outs: [{ address: 'px.tees.family', base: 'px.tees.rings', contract: 'tee.pose', value: { objects: famObjs, elim: famElim, scalars: { anchor: gid(rf.family.anchor.ring) } } }]
  });

  const teeObj = (t) => ({ center: [r4(t.center[0]), r4(t.center[1])], angleRad: r4(t.angleRad), bbox: t.bbox, innerBbox: t.innerBbox, label: t.label });
  const teeObjs = Object.fromEntries(teesArt.tees.map((t) => [`T${t.label}`, teeObj(t)]));
  const teePx = Object.fromEntries(teesArt.tees.map((t) => [`T${t.label}|own`, toRuns(t.px)]));
  step('S3', 'Tee.findPx', { verdicts: checksToVerdicts(R.materializations.S3?.checks), outs: [{ address: 'px.tees', base: 'px.tees.family', contract: 'tee.pose', value: { objects: teeObjs, px: teePx } }] });

  const fix = R.experiments?.branches?.S3FIX;
  if (fix) {
    const fr = A('s3fix/px.tees.family-refined.json');
    const refined = A('s3fix/px.tees.refined.json');
    const elimArt = A('s3fix/px.tees.eliminated.json');
    const objs = {}, elim = {}, rows = {};
    for (const c of fr.candidates) {
      const id = gid(c.ring);
      const base = c.framed ? { ...ringObj(c.ring), angleRad: r4(c.frame.angle), frame: { label: c.frame.label, area: c.frame.area, major: c.frame.major, minor: c.frame.minor, fill: c.frame.fill, bbox: [c.frame.bboxX, c.frame.bboxY, c.frame.bboxW, c.frame.bboxH] } } : ringObj(c.ring);
      if (c.verdict === 'ADMITTED' || c.verdict === 'EXCUSED') objs[id] = { ...base, verdict: c.verdict };
      else elim[id] = { ...base, why: 'structural', failedTests: c.failedTests };
      rows[id] = { verdict: c.verdict, failedTests: c.failedTests, baselineMember: c.baselineMember, anchor: c.anchor };
    }
    const elimPx = Object.fromEntries(elimArt.tees.map((t) => [`${t.baselineLabel ? `T${t.baselineLabel}` : t.label}|elim`, toRuns(t.px)]));
    const m = fr.model;
    const rObjs = Object.fromEntries(refined.tees.map((t) => [`R${t.label}`, { ...teeObj(t), baselineLabel: t.baselineLabel, verdict: t.verdict }]));
    const rPx = Object.fromEntries(refined.tees.map((t) => [`R${t.label}|own`, toRuns(t.px)]));
    step('S3', 'early.S3.findFamilyStructuralFix', {
      tickRecord: fix.ticks[0], lane: fix.lane,
      verdicts: checksToVerdicts(R.materializations.S3FamilyFix?.checks),
      outs: [
        { address: 'px.tees.familyRefined', base: 'px.tees.family', contract: 'tee.pose', value: { objects: objs, elim, ledger: rows, px: elimPx, scalars: { anchorCount: m.anchorCount, bandT: m.bandT, majorBounds: m.bounds.major, minorBounds: m.bounds.minor, areaBounds: m.bounds.area, holeAreaBounds: m.bounds.holeArea, bandCoverageMin: m.bounds.bandCoverage } } },
        { address: 'px.tees.refined', base: 'px.tees', contract: 'tee.pose', supersedes: ['px.tees'], value: { objects: rObjs, px: rPx } }
      ]
    });
  }
  const fj = R.experiments?.branches?.S3FJ;
  if (fj && existsSync(join(baseDir, 'artifacts/s3forkjoin/cmp.fn.Tee.findFamily.json'))) {
    const cmp = A('s3forkjoin/cmp.fn.Tee.findFamily.json');
    const rows = Object.fromEntries(Object.entries(cmp.value.branches).map(([name, b]) => [name, { members: b.members, agrees: b.agrees, disagrees: b.disagrees, precision: b.precision }]));
    steps.push({
      key: 'S3/early.S3.findFamilyForkJoin', stage: 'S3', tick: 'early.S3.findFamilyForkJoin', lane: fj.lane,
      calculations: ['fn.Tee.findFamily (fork-join)'], consumes: ['px.tees.rings', 'px.components'], produces: ['cmp.fn.Tee.findFamily'],
      verdicts: [{ name: 'contract', ok: cmp.value.contract?.address === 'contracts/tee.pose@1' }],
      outs: [{ address: 'cmp.fn.Tee.findFamily', base: null, value: { ledger: rows, scalars: { contract: cmp.value.contract.address, matched: cmp.value.counts.matched } } }]
    });
  }
  for (const s of steps) for (const o of s.outs) { o.contract ??= null; o.supersedes ??= []; }
  return { frame, sourceWidth: W, crop: R.crop, receipts: { base: R, assembly: assemblyReceipt }, steps };
}
