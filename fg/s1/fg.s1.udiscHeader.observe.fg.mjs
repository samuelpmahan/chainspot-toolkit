/**
 * fg.s1.udiscHeader.observe (stages/s1.json; Sam, 2026-10-21: "Also read the UDisc header totals automatically"): the UDisc
 * header bar "N Holes • Par P • X ft" (Part tk.source.header, Calculation fn.tk.source.header or, for a capture, every tile's
 * header: fn.tk.source.captureHeader; fg/header/header.calc.mjs) checked against S1 (Part tk.s1.udiscHeader, Calculation
 * fn.tk.s1.udiscHeader): N against the S1 badge count. Verdicts: agree, disagree (a partial view or badges S1 missed),
 * filled (holes with an out-of-vocabulary digit, "2?", completed by the S1 badge count when it is the only consistent
 * completion; feet and par never), unread, no header. Every glyph carries its read, score, margin and learned P. Recorded and published as stages[S1].udiscHeader, never a gate:
 * px.badges and the S1 labels are unchanged. The frame is the header Part's default render: the band, each glyph boxed with
 * its read, coloured by confidence, with a legend.
 */
import { guarantee, pipe, read, step } from '../compose.mjs';
import { framed, published, unitful } from '../mixins.mjs';
import { renderValue } from '../render.mjs';

const ID = 'fg.s1.udiscHeader.observe';
const PART = 'tk.s1.udiscHeader', HEADER = 'tk.source.header';
const UNITS = { holes: 'count (holes, the header)', par: 'strokes (the header)', feet: 'ft (the header)', badges: 'count (S1 badges)', maxBadgeLabel: 'hole number',
  unreadGlyphs: 'count (glyphs out of vocabulary)', flaggedGlyphs: 'count (glyphs read with low confidence)', holesRead: 'count (holes, as read)', p: 'probability 0..1 (learned)', tilesRead: 'count (tiles)', tilesOf: 'count (tiles)', glyphs: 'count (glyphs)', capHPx: 'px', score: 'NCC -1..1', margin: 'NCC -1..1',
  scale: 'ratio (render px per image px)', origin: 'px', value: 'as named by the row\'s field (count, strokes, ft)' };

const observe = step('observe the header against S1', (env, s) => {
  const x = s.parts[PART], h = s.parts[HEADER];
  if (!x || typeof x.verdict !== 'string') env.fail('tk.s1.udiscHeader is missing');
  const totals = { holes: x.holes, holesRead: x.holesRead, ...(x.holesFilled ? { holesFilledBy: x.holesFilled.filledBy, holesPattern: x.holesFilled.pattern } : {}), par: x.par, feet: x.feet, badges: x.badges, verdict: x.verdict,
    unreadGlyphs: x.unreadGlyphs, flaggedGlyphs: x.flaggedGlyphs, headerText: x.headerText,
    ...(h.source === 'tiles' ? { tilesRead: h.tilesRead, tilesOf: h.tilesOf, tilesAgree: h.agree } : {}) };
  const glyphs = (h.glyphs ?? []).map((g) => ({ glyph: g.index, char: g.char, best: g.best, score: g.score, margin: g.margin, p: g.p, confidence: g.confidence }));
  return { totals, conditions: x.conditions, glyphs, capHPx: h.line?.capHPx ?? null };
});

const frames = framed((s) => [{
  title: `UDisc header: ${s.totals.headerText ?? 'none'}; holes ${s.totals.holes ?? '?'} vs ${s.totals.badges} S1 badges: ${s.totals.verdict}`,
  calculation: 'fn.tk.s1.udiscHeader', tick: ID,
  parts: [...renderValue(HEADER, s.parts[HEADER]).parts, { address: `${PART}#conditions`, kind: 'ledger', data: { rows: s.conditions.map((c) => ({ condition: c })) } }],
  verdicts: [{ name: `header holes ${s.totals.holes ?? '?'} vs S1 badges ${s.totals.badges}: ${s.totals.verdict}`, ok: s.totals.verdict === 'agree' || s.totals.verdict === 'filled' },
    ...(s.totals.tilesAgree === false ? [{ name: 'the capture\'s tiles agree on the header', ok: false }] : [])]
}]);

export default guarantee({
  id: ID, guards: [PART], requires: ['fg.s1.pxBadges.materialize'], audit: [unitful({ units: UNITS })],
  result: (s) => ({ totals: s.totals })
}, pipe(read(PART, HEADER), observe, frames,
  published({
    stage: 'S1', key: 'udiscHeader', materialization: 'S1UdiscHeader',
    header: () => ({ part: PART, header: HEADER, observedBy: ID }),
    body: (s) => ({ totals: s.totals, conditions: s.conditions, glyphs: s.glyphs, capHPx: s.capHPx })
  })));
