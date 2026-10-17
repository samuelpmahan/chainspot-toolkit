/**
 * The fn.Tee.findFamily slot, as the S3 fork-join sees it (browser-safe;
 * not an FG file, discovery loads only *.fg.mjs).
 *
 * One slot, competing implementations (impl/fn.Tee.findFamily/<name>.mjs),
 * the same FGs on every branch (fg.s3.teeFamily.materialize,
 * fg.s3.teeFamily.precision), and one comparator that joins the branches
 * by GEOMETRIC identity (contracts/tee.pose@1), never by ring keys.
 *
 *   TEE_FAMILY_SLOT       slot id, the Part every implementation's member
 *                         set is written to on its branch, the lane
 *   memberPose(ring, frame, extra?)
 *                         the member shape every implementation returns:
 *                         { center: [ring.cx, ring.cy], angleRad: frame.angle,
 *                           bbox: [frame.bboxX, frame.bboxY, frame.bboxW,
 *                           frame.bboxH], ring: { cx, cy, bbox, holeArea },
 *                           frameLabel, evidence }  canonical raster frame
 *   testimonyTeePoints(annotation, cropReceipt)
 *                         Sam's annotated tee points converted from the
 *                         annotation (source) frame to the canonical frame by
 *                         the S0 crop receipt (y - upperRowsRemoved)
 *   judgeMembers(members, points, { padPx })
 *                         per member: agrees (an annotated tee point inside the
 *                         member's frame bbox padded by padPx) or disagrees;
 *                         per point: covered or uncovered (recall info only)
 *   compareTeeFamilies({ contract, crop })
 *                         the comparableForkJoin comparator: geometric join,
 *                         matched / only-in-<branch> lists with each branch's
 *                         judge verdicts, per-branch precision, a ledger frame
 *                         and one crop contact-sheet frame per only-in-one
 *                         member. crop(raster, spec) is fg/png.mjs cropWindow
 *                         (injected so tests can stub it).
 *
 * Precision is the S3 criterion: a member Sam did not annotate is an
 * impostor at S3 whatever else is true of it. Recall (annotated points no
 * member covers) is reported as information; it is S4's job. No judge here
 * claims acceptance: acceptance stays Sam's.
 */
import { geometricJoin } from '../identity.mjs';

export const TEE_FAMILY_SLOT = Object.freeze({
  slot: 'fn.Tee.findFamily',
  part: 'px.tees.familyMembers',
  lane: 's3-findfamily-forkjoin',
  materialize: 'fg.s3.teeFamily.materialize',
  precision: 'fg.s3.teeFamily.precision',
  judgePadPx: 2,
  cropPx: 120
});

export const ACCEPTANCE = 'UNKNOWN: acceptance is Sam\'s; this judge reports agreement with his annotation testimony only';

const r4 = (v) => Math.round(v * 1e4) / 1e4;

export function memberPose(ring, frame, evidence = null) {
  return {
    center: [ring.cx, ring.cy],
    angleRad: frame.angle,
    bbox: [frame.bboxX, frame.bboxY, frame.bboxW, frame.bboxH],
    ring: { cx: ring.cx, cy: ring.cy, bbox: [ring.bboxX, ring.bboxY, ring.bboxW, ring.bboxH], holeArea: ring.holeArea },
    frameLabel: frame.label,
    evidence
  };
}

export function testimonyTeePoints(annotation, cropReceipt) {
  const upper = cropReceipt.upperRowsRemoved;
  return (annotation.holes ?? [])
    .filter((h) => h.tee && Number.isFinite(h.tee.xPx) && Number.isFinite(h.tee.yPx))
    .map((h) => ({ hole: h.number, source: [h.tee.xPx, h.tee.yPx], canonical: [h.tee.xPx, h.tee.yPx - upper] }))
    .sort((a, b) => a.hole - b.hole);
}

export const insidePadded = ([x, y], [bx, by, bw, bh], pad) => x >= bx - pad && x <= bx + bw + pad && y >= by - pad && y <= by + bh + pad;

export function judgeMembers(members, points, { padPx = TEE_FAMILY_SLOT.judgePadPx } = {}) {
  const verdicts = members.map((m, index) => {
    const holes = points.filter((p) => insidePadded(p.canonical, m.bbox, padPx)).map((p) => p.hole);
    return { index, center: [r4(m.center[0]), r4(m.center[1])], bbox: m.bbox, verdict: holes.length ? 'agrees' : 'disagrees', holes };
  });
  const coverage = points.map((p) => ({
    hole: p.hole, canonical: p.canonical,
    members: verdicts.filter((v) => v.holes.includes(p.hole)).map((v) => v.index)
  }));
  const agrees = verdicts.filter((v) => v.verdict === 'agrees').length;
  return {
    padPx, verdicts, coverage,
    totals: {
      members: members.length, agrees, disagrees: members.length - agrees,
      precision: members.length ? r4(agrees / members.length) : null,
      annotatedPoints: points.length,
      coveredPoints: coverage.filter((c) => c.members.length).length,
      uncoveredPoints: coverage.filter((c) => !c.members.length).length
    },
    uncovered: coverage.filter((c) => !c.members.length).map((c) => c.hole),
    sharedPoints: coverage.filter((c) => c.members.length > 1).map((c) => ({ hole: c.hole, members: c.members }))
  };
}

const COLORS = { member: [230, 25, 75], point: [60, 220, 75], center: [240, 50, 230] };

export function compareTeeFamilies({ contract, crop, part = TEE_FAMILY_SLOT.part, slot = TEE_FAMILY_SLOT.slot }) {
  return ({ branches, frame }) => {
    const names = Object.keys(branches).sort();
    const view = {};
    for (const n of names) {
      const b = branches[n];
      const value = b.board?.has?.(part) ? b.board.get(part) : null;
      const precision = b.records?.[TEE_FAMILY_SLOT.precision];
      view[n] = {
        error: b.error, members: value?.members ?? [],
        verdicts: precision?.status === 'held' ? precision.verdicts : null,
        totals: precision?.status === 'held' ? precision.totals : null,
        uncovered: precision?.status === 'held' ? precision.uncovered : null,
        points: precision?.status === 'held' ? precision.points : null
      };
    }
    const join = geometricJoin({ sets: Object.fromEntries(names.map((n) => [n, view[n].members])), contract });
    const verdictOf = (n, i) => view[n].verdicts?.[i]?.verdict ?? null;
    const rowOf = (identity) => {
      const at = names.find((n) => identity.members[n] !== null);
      const m = view[at].members[identity.members[at]];
      const row = { identity: identity.id, center: [r4(m.center[0]), r4(m.center[1])], angleDeg: r4(m.angleRad * 180 / Math.PI), bbox: m.bbox };
      for (const n of names) {
        const i = identity.members[n];
        row[n] = i === null ? null : { index: i, verdict: verdictOf(n, i), holes: view[n].verdicts?.[i]?.holes ?? null };
      }
      row.pairs = identity.pairs.map((p) => ({ a: p.a.branch, b: p.b.branch, ...p.detail }));
      return row;
    };
    const byId = new Map(join.identities.map((x) => [x.id, x]));
    const byPosition = (a, b) => (a.center[1] - b.center[1]) || (a.center[0] - b.center[0]);
    const matched = join.matched.map((id) => rowOf(byId.get(id))).sort(byPosition);
    const only = Object.fromEntries(names.map((n) => [n, join.only[n].map((id) => rowOf(byId.get(id))).sort(byPosition)]));
    const partial = join.partial.map((id) => rowOf(byId.get(id))).sort(byPosition);
    const perBranch = Object.fromEntries(names.map((n) => [n, {
      error: view[n].error, members: view[n].members.length,
      agrees: view[n].totals?.agrees ?? null, disagrees: view[n].totals?.disagrees ?? null,
      precision: view[n].totals?.precision ?? null, uncoveredPoints: view[n].uncovered
    }]));
    const points = names.map((n) => view[n].points).find(Boolean) ?? [];

    // Frame 1: the comparison ledger over the whole canonical frame.
    const boxes = (rows) => ({ boxes: rows.map((r) => [...r.bbox, `#${r.identity}`]) });
    const ledgerRows = [...matched.map((r) => ({ in: 'both', ...r })), ...names.flatMap((n) => only[n].map((r) => ({ in: `only ${n}`, ...r }))), ...partial.map((r) => ({ in: 'partial', ...r }))]
      .map(({ pairs, ...r }) => ({ ...r, ...Object.fromEntries(names.map((n) => [n, r[n] ? `#${r[n].index} ${r[n].verdict ?? '?'}` : '-'])) }));
    frame({
      title: `${slot}: ${matched.length} matched, ${names.map((n) => `${only[n].length} only-${n}`).join(', ')} (joined by ${contract.address})`,
      calculation: slot,
      parts: [
        { address: `cmp.${slot}.matched`, kind: 'bbox', data: boxes(matched) },
        ...names.map((n) => ({ address: `cmp.${slot}.only.${n}`, kind: 'bbox', data: boxes(only[n]) })),
        { address: 'testimony.tees', kind: 'points', data: { points: points.map((p) => [...p.canonical, `hole ${p.hole}`]) } },
        { address: `cmp.${slot}.ledger`, kind: 'ledger', data: { rows: ledgerRows } },
        { address: `cmp.${slot}.precision`, kind: 'ledger', data: { rows: names.map((n) => ({ branch: n, ...perBranch[n], uncoveredPoints: (perBranch[n].uncoveredPoints ?? []).join(' ') })) } }
      ],
      verdicts: names.map((n) => ({ name: `${n} precision ${perBranch[n].precision ?? 'n/a'} (${perBranch[n].agrees ?? '?'}/${perBranch[n].members})`, ok: perBranch[n].disagrees === 0 }))
    });

    // Frames 2..: one crop contact sheet per only-in-one member.
    const raster = names.map((n) => branches[n].board).find((b) => b?.has?.('px.image.cropped'))?.get('px.image.cropped');
    for (const n of names) for (const r of only[n]) {
      const m = view[n].members[r[n].index];
      const sheet = raster ? crop({ rgba: raster.rgba, width: raster.widthPx, height: raster.heightPx }, {
        cx: m.center[0], cy: m.center[1], size: TEE_FAMILY_SLOT.cropPx,
        overlays: [
          { kind: 'rect', bbox: m.bbox, color: COLORS.member },
          { kind: 'cross', x: m.center[0], y: m.center[1], color: COLORS.center, arm: 2 },
          ...points.map((p) => ({ kind: 'cross', x: p.canonical[0], y: p.canonical[1], color: COLORS.point, arm: 4 }))
        ]
      }) : null;
      const others = names.filter((o) => o !== n);
      frame({
        title: `only ${n}: identity #${r.identity} at (${r.center.join(', ')}), judge ${r[n].verdict ?? '?'}`,
        calculation: slot,
        parts: [
          ...(sheet ? [{ address: `cmp.${slot}.crop.${r.identity}`, kind: 'raster', data: sheet }] : []),
          { address: `cmp.${slot}.member.${r.identity}`, kind: 'ledger', data: { rows: [{ branch: n, index: r[n].index, center: r.center, angleDeg: r.angleDeg, bbox: r.bbox, verdict: r[n].verdict, holes: (r[n].holes ?? []).join(' '), absentFrom: others.join(' '), evidence: m.evidence }] } }
        ],
        verdicts: [{ name: `${n} #${r[n].index} ${r[n].verdict === 'agrees' ? 'agrees with' : 'has no'} annotated tee point`, ok: r[n].verdict === 'agrees' },
          ...others.map((o) => ({ name: `absent from ${o}`, ok: r[n].verdict !== 'agrees' }))],
        receipt: { contract: contract.address, cropPx: TEE_FAMILY_SLOT.cropPx, origin: sheet?.origin ?? null, legend: 'red: member frame bbox; magenta: ring center; green: annotated tee points (canonical frame)' }
      });
    }

    return {
      slot, contract: join.contract, acceptance: ACCEPTANCE,
      counts: { matched: matched.length, ...Object.fromEntries(names.map((n) => [`only.${n}`, only[n].length])), partial: partial.length, ambiguous: join.ambiguous.length, collisions: join.collisions.length },
      branches: perBranch,
      matched, only, partial, ambiguous: join.ambiguous, collisions: join.collisions
    };
  };
}
