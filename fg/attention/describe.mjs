/**
 * Words for an attention region (fg/attention layer, browser-safe):
 * what changed (typed), what the receipt claims about it, and the one
 * QUESTION a vision agent should answer from the crop.
 *
 *   describeRegion(region, meta) -> { subject, what: [line], claims: [line], question, claimsAbout: [Claim] }
 *     meta: { step, tick, stage, lane, calcs, verdicts, laneStatus }
 *   Claim { id, address, subject, says: 'is' | 'isNot' | 'covers', center }
 *     the receipt's polarity about one object: a vision answer (or testimony)
 *     can agree or disagree with it without reading any prose.
 *
 * Questions are picked by the most informative change in the region, in
 * the order of QUESTION_ORDER; every question asks for yes / no / unsure + why.
 */
import { subjectOf, centerOf } from './regions.mjs';

const plural = (n, s) => `${n} ${s}${n === 1 ? '' : 's'}`;
const list = (ids, max = 6) => (ids.length > max ? `${ids.slice(0, max).join(', ')} +${ids.length - max}` : ids.join(', '));
const tests = (c) => (c.failedTests?.length ? c.failedTests.join('/') : c.why ?? null);
const CLS_WORDS = {
  '+own': 'px newly owned', '+mute': 'px newly muted (consumed, not owned)', '+cand': 'px noted as candidate evidence', '+elim': 'px noted as eliminated evidence',
  '-own': 'px released (no longer owned)', '-mute': 'px released from mute', '-cand': 'px candidate evidence dropped', '-elim': 'px eliminated evidence dropped',
  split: 'px re-owned into sub-parts of the same owner'
};
const clsWords = (cls) => CLS_WORDS[cls] ?? (cls.includes('->') ? `px re-owned ${cls.replace('->', '→')}` : cls.endsWith(':reassigned') ? `px re-assigned to another ${cls.split(':')[0]} owner` : `px ${cls}`);

const ACTIVE = /^(px\.tees|px\.tees\.refined|px\.tees\.family|px\.tees\.familyRefined|px\.baskets|px\.badges|badges|px\.badges\.assembly)$/;

export function claimsAbout(region) {
  const out = [];
  for (const c of region.objects) {
    const subject = subjectOf(c.address);
    if (!['tee', 'basket', 'badge', 'tee-ring'].includes(subject)) continue;
    const center = centerOf(c.obj);
    if (!center) continue;
    let says = null;
    if (['eliminated', 'removed', 'elimRecorded', 'elimRetested'].includes(c.op)) says = 'isNot';
    else if (c.facet === 'objects' && ACTIVE.test(c.address) && ['added', 'refit', 'verdict', 'renamed', 'moved', 'relabel'].includes(c.op)) says = c.verdict && !/ADMITTED|EXCUSED/.test(c.verdict) ? 'isNot' : 'is';
    if (says) out.push({ id: c.id, address: c.address, subject: subject === 'tee-ring' ? 'tee' : subject, says, center: center.map((v) => Math.round(v * 100) / 100), op: c.op });
  }
  return out;
}

function objectLines(region) {
  const by = new Map();
  for (const c of region.objects) { const k = `${c.address}|${c.op}`; if (!by.has(k)) by.set(k, []); by.get(k).push(c); }
  const lines = [];
  for (const [k, cs] of by) {
    const [address, op] = k.split('|');
    const s = subjectOf(address);
    const ids = cs.map((c) => c.from ? `${c.from}→${c.id}` : c.id);
    const why = [...new Set(cs.map(tests).filter(Boolean))].join('; ');
    const L = {
      eliminated: `−${plural(cs.length, s)}: ${list(ids)} eliminated${why ? ` by ${why}` : ''} [${address}]`,
      removed: `−${plural(cs.length, s)}: ${list(ids)} dropped from ${address}`,
      refit: `~${plural(cs.length, s)}: ${list(ids)} re-fit (same id; the identity Contract join called them different${cs[0].prev && cs[0].obj ? `: ${refitWords(cs[0])}` : ''}) [${address}]`,
      added: `+${plural(cs.length, s)}: ${list(cs.map((c) => [c.id, c.obj?.label !== undefined ? `"${c.obj.label}"` : '', c.verdict ?? ''].filter(Boolean).join(' ')))} [${address}]`,
      verdict: `${plural(cs.length, s)}: ${list(cs.map((c) => `${c.from ? `${c.from}→` : ''}${c.id} ${c.prev ?? 'unset'}→${c.verdict}`))} [${address}]`,
      relabel: `${plural(cs.length, s)}: ${list(cs.map((c) => `${c.id} ${c.labelField} ${JSON.stringify(c.prev)}→${JSON.stringify(c.obj[c.labelField])}`))} [${address}]`,
      moved: `${plural(cs.length, s)} moved: ${list(cs.map((c) => `${c.id} Δc ${c.pose?.dCenterPx ?? '?'} px${c.pose?.dAngleDeg ? ` Δθ ${c.pose.dAngleDeg}°` : ''}`))} [${address}]`,
      renamed: `${plural(cs.length, s)} matched by geometry and renamed: ${list(ids)} [${address}]`,
      edited: `${plural(cs.length, s)} edited (${[...new Set(cs.flatMap((c) => c.fields ?? []))].join(' ')}): ${list(ids)} [${address}]`,
      elimRecorded: `${plural(cs.length, `${s} candidate`)} recorded as eliminated: ${list(ids)}${why ? ` (${why})` : ''} [${address}]`,
      elimRetested: `${plural(cs.length, `${s} candidate`)} re-tested, still eliminated: ${list(ids)}${why ? ` (${why})` : ''} [${address}]`,
      elimDropped: `${plural(cs.length, 'elimination record')} dropped: ${list(ids)}${why ? ` (was: ${why})` : ''} [${address}]`,
      row: `ledger ${list(cs.map((c) => `${c.id} ${rowWords(c.row)}`), 4)} [${address}]`
    };
    lines.push(L[op] ?? `${op} ${list(ids)} [${address}]`);
  }
  return lines;
}

function refitWords(c) {
  const a = centerOf(c.prev), b = centerOf(c.obj);
  const parts = [];
  if (a && b) parts.push(`Δc ${Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * 100) / 100} px`);
  if (typeof c.prev.angleRad === 'number' && typeof c.obj.angleRad === 'number') {
    let d = Math.abs(c.obj.angleRad - c.prev.angleRad) % Math.PI; if (d > Math.PI / 2) d = Math.PI - d;
    parts.push(`Δθ ${Math.round(d * 1800 / Math.PI) / 10}°`);
  }
  return parts.join(', ');
}

export function rowWords(row = {}) {
  const keep = ['verdict', 'agreement', 'currentLabel', 'templateLabel', 'templateAbstention', 'failedTests', 'anchor', 'baselineMember'];
  return keep.filter((k) => row[k] !== undefined && row[k] !== null && !(Array.isArray(row[k]) && !row[k].length) && row[k] !== false)
    .map((k) => `${k}=${Array.isArray(row[k]) ? row[k].join('/') : row[k]}`).join(' ');
}

function pxLines(region) {
  const lines = [];
  for (const [address, byCls] of Object.entries(region.pxByAddress)) {
    for (const [cls, n] of Object.entries(byCls).sort((a, b) => b[1] - a[1])) {
      const owners = region.owners[`${address}\u0000${cls}`] ?? [];
      lines.push(`${cls.startsWith('-') ? '−' : cls.startsWith('+') ? '+' : ''}${n} ${clsWords(cls)} (${list(owners.map((o) => o.replace(/\|[a-z]+/g, '')), 3)}) [${address}]`);
    }
  }
  return lines;
}

function claimLines(region, meta) {
  const out = [];
  for (const c of region.objects) {
    const s = subjectOf(c.address);
    if (c.op === 'eliminated' || c.op === 'elimRecorded' || c.op === 'elimRetested') out.push(`${c.id} is NOT a ${s}${tests(c) ? ` (failed: ${tests(c)})` : ''}`);
    else if (c.op === 'removed') out.push(`${c.id} is no longer in ${c.address}`);
    else if (c.op === 'verdict') out.push(`${c.id} verdict ${c.verdict}`);
    else if (c.op === 'relabel') out.push(`${c.id} reads ${JSON.stringify(c.obj[c.labelField])} (was ${JSON.stringify(c.prev)})`);
    else if (c.op === 'added' && c.facet === 'objects') out.push(`${c.id} is a ${s}${c.obj?.label !== undefined ? ` labelled ${JSON.stringify(c.obj.label)}` : ''}${c.verdict ? ` (${c.verdict})` : ''}`);
    else if (c.op === 'refit') out.push(`${c.id} is the same ${s} as before, re-fit`);
    else if (c.op === 'row') out.push(`${c.id}: ${rowWords(c.row)}`);
  }
  for (const [address, byCls] of Object.entries(region.pxByAddress)) {
    for (const [cls, n] of Object.entries(byCls)) {
      const owners = (region.owners[`${address}\u0000${cls}`] ?? []).map((o) => o.replace(/\|[a-z]+/g, ''));
      if (cls === '+own' || cls.endsWith('->own') || cls.endsWith(':reassigned')) out.push(`these ${n} px belong to ${list(owners, 3)} and to no other Part (layer conflict 0)`);
      else if (cls === '-own') out.push(`these ${n} px no longer belong to ${list(owners, 3)}`);
      else if (cls === '+mute') out.push(`these ${n} px are consumed around ${list(owners, 3)} but not owned`);
    }
  }
  const uniq = [...new Set(out)];
  const step = [`by ${meta.calcs.join(', ')} at ${meta.step}${meta.lane ? ` (lane ${meta.lane})` : ''}`];
  const ok = (meta.verdicts ?? []).filter((v) => v.ok).map((v) => v.name), bad = (meta.verdicts ?? []).filter((v) => v.ok === false).map((v) => v.name);
  if (ok.length) step.push(`checks passed: ${list(ok, 8)}`);
  if (bad.length) step.push(`checks FAILED: ${bad.join(', ')}`);
  if (meta.laneStatus?.oracle) step.push(`lane oracle ${meta.laneStatus.oracle}${meta.laneStatus.status ? ` (${meta.laneStatus.status})` : ''}`);
  return [...uniq.slice(0, 12), ...(uniq.length > 12 ? [`… ${uniq.length - 12} more`] : []), step.join('; ')];
}

/** Ordered: first match wins. Each entry tests the region and returns a question. */
export const QUESTION_ORDER = [
  ['tee eliminated', (r) => r.objects.find((c) => subjectOf(c.address).startsWith('tee') && ['eliminated', 'elimRecorded', 'elimRetested', 'removed'].includes(c.op)),
    (c) => `The receipt says the outlined ${c.id} is NOT a tee pad${tests(c) ? ` (failed: ${tests(c)})` : ''}. Is it a tee pad (a hole's tee marker)? yes/no/unsure + why; if not, what is it?`],
  ['tee refit', (r) => r.objects.find((c) => subjectOf(c.address) === 'tee' && c.op === 'refit'),
    (c) => `The receipt re-fit ${c.id} (dashed = before, solid = after). Do both outlines sit on the same physical object? yes/no/unsure + why`],
  ['tee verdict', (r) => r.objects.find((c) => subjectOf(c.address) === 'tee' && ['verdict', 'added', 'renamed'].includes(c.op)),
    (c) => `The receipt says the outlined ${c.id} is a tee pad${c.verdict ? ` (${c.verdict})` : ''}. Is it a tee pad? yes/no/unsure + why`],
  ['counter holes', (r) => Object.entries(r.pxByAddress).find(([a, by]) => /digits|assembly/.test(a) && Object.keys(by).some((k) => k === 'mute->own' || (k === '+own' && /digits/.test(a)))),
    () => 'Does the shaded region cover exactly the enclosed counter holes of the digit glyph(s) (the inside of 0, 4, 6, 8, 9 ...), no more and no less? yes/no/unsure + why'],
  ['badge relabel', (r) => r.objects.find((c) => subjectOf(c.address) === 'badge' && (c.op === 'relabel' || (c.op === 'edited' && (c.fields ?? []).includes('label')))),
    (c) => `The receipt reads badge ${c.id} as ${JSON.stringify(c.obj?.label)}. What number does the badge show? match/mismatch/unsure + why`],
  ['glyph row', (r) => r.objects.find((c) => c.op === 'row' && c.row?.agreement !== undefined),
    (c) => `The glyph template says ${rowWords(c.row)} for badge ${c.id}. What number does the badge show, and is the template's reading right? yes/no/unsure + why`],
  ['badge released', (r) => Object.entries(r.pxByAddress).find(([a, by]) => /badges/.test(a) && by['-mute']),
    () => 'The red band was muted around the badge and is now released. Does any of the red band belong to the badge itself (plate edge, glyph)? yes/no/unsure + why'],
  ['badge plate', (r) => Object.entries(r.pxByAddress).find(([a, by]) => /^px\.badges$/.test(a) && by['+own']),
    () => 'Does the shaded region cover exactly the number badge (plate and glyphs), with no background and nothing missing? yes/no/unsure + why'],
  ['badge split', (r) => Object.entries(r.pxByAddress).find(([a, by]) => /badges/.test(a) && by.split),
    () => 'The badge was split into sub-parts (outlined). Do the sub-part boundaries follow visible structure (plate vs glyphs)? yes/no/unsure + why'],
  ['basket', (r) => Object.keys(r.pxByAddress).some((a) => /baskets/.test(a)) || r.objects.find((c) => subjectOf(c.address) === 'basket'),
    () => 'Does the shaded region cover exactly one basket icon (body and shell), nothing else? yes/no/unsure + why'],
  ['tee ring', (r) => r.objects.find((c) => subjectOf(c.address) === 'tee-ring'),
    (c) => `Is the outlined ${c.id} an enclosed elongated ring (the outline of a tee pad)? yes/no/unsure + why`],
  ['badge object', (r) => r.objects.find((c) => subjectOf(c.address) === 'badge'),
    (c) => `Is the outlined ${c.id} a hole-number badge? yes/no/unsure + why`],
  ['component', (r) => r.objects.find((c) => subjectOf(c.address) === 'component'),
    () => 'Is each outlined box one visible connected blob of the map art? yes/no/unsure + why'],
  ['fallback', () => true, () => 'Does the Δ overlay land on a visible feature consistent with the claim? yes/no/unsure + why']
];

export function questionFor(region) {
  for (const [name, test, ask] of QUESTION_ORDER) { const hit = test(region); if (hit) return { kind: name, text: ask(hit) }; }
  return null;
}

export function describeRegion(region, meta) {
  const what = [...objectLines(region), ...pxLines(region)];
  const subjects = [...new Set([...region.objects.map((c) => subjectOf(c.address)), ...Object.keys(region.pxByAddress).map(subjectOf)])];
  return { subject: subjects.join('+'), what, claims: claimLines(region, meta), question: questionFor(region), claimsAbout: claimsAbout(region) };
}
