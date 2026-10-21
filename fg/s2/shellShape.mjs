/**
 * S2's basket frame shape, asked of fn.q.sprite.overlap (Sam, 2026-10-21: "we need to learn and carry in the frame shape by
 * overlapping frames"; "overlapping may give a more precise shape to everything").
 *
 * Learn: the family members' dark frames are overlapped in sprite frame by fn.q.sprite.overlap (source px.components, dark
 * polarity), each registered on its bright body's bbox origin (integer: the sprite is screen-fixed and drawn on the px
 * grid), in a window padded on every side by the body's own size, factor 1, level 0.75 (the agreement S2's common shell
 * has always used). Of the agreeing px, the 8-connected component enclosing the body is the frame: its bbox gives the
 * margins and every agreeing px inside them is a frame px. Canopy that touches one member's frame is not shared, so it
 * never reaches the agreement (BeaverRanch-Gold-full: all 18 shells touched canopy and the modal vote tied).
 * Carry in: the same rule over the dev courses' members, vendored as the provider asset assets/basket-shell.json
 * (scripts/basket-shell-prior.mjs). It is used when no agreeing frame encloses the body; when both exist they are compared.
 *
 * The Part is the provider's px.baskets.shellShape (chainspot-basket-shell-shape@1): the pinned provider computes the same
 * shape itself (Basket.ts learnShellShape) for a standalone run; in the toolkit its fn.Basket.learnShellShape registration is
 * routed here (installQueriedShellShape), the way fg/s3/teeScale.mjs routes S3's ring bounds. shellShape.dev.test.mjs proves
 * the two agree on every dev course.
 */
export const SHELL_LEVEL = 0.75;
export const SHELL_QUERY = 'fn.q.sprite.overlap';

/** The fn.q.sprite.overlap arguments for a basket family on the board's component fields. */
export function shellOverlapArgs(family) {
  const [bw, bh] = family.templateSize;
  return {
    source: 'px.components', polarity: 'dark', level: SHELL_LEVEL, factor: 1, anchorRule: 'origin',
    window: { width: 3 * bw, height: 3 * bh, anchorAt: [bw, bh] },
    instances: family.members.map(({ body }) => ({ bbox: [body.bboxX, body.bboxY, body.bboxW, body.bboxH] }))
  };
}

/** The frame in an overlap answer: the agreeing component enclosing the body, as margins and frame px (shell frame). */
/** extract: the provider's 8-connected labelling (detectors/threeFactor/components extractComponents), the one every S2 component comes from. */
export function frameOf(overlap, bodyWidth, bodyHeight, extract) {
  if (!overlap.memberCount) return null;
  const { fineWidth: W, fineHeight: H, shape } = overlap, [bx, by] = overlap.window.anchorAt;
  const { components } = extract({ width: W, height: H, data: shape });
  const shell = components
    .filter((c) => c.bboxX <= bx && c.bboxY <= by && c.bboxX + c.bboxW >= bx + bodyWidth && c.bboxY + c.bboxH >= by + bodyHeight)
    .sort((a, b) => a.bboxW * a.bboxH - b.bboxW * b.bboxH || b.area - a.area || a.label - b.label)[0];
  if (!shell) return null;
  const margins = [bx - shell.bboxX, by - shell.bboxY, shell.bboxX + shell.bboxW - (bx + bodyWidth), shell.bboxY + shell.bboxH - (by + bodyHeight)];
  const offsets = [];
  for (let y = 0; y < shell.bboxH; y++) for (let x = 0; x < shell.bboxW; x++) if (shape[(shell.bboxY + y) * W + shell.bboxX + x]) offsets.push(y * shell.bboxW + x);
  return { margins, offsets: Uint32Array.from(offsets), areaPx: shell.area };
}

/** The carried prior (the provider asset) as a frame. */
export function carriedFrame(prior) {
  const offsets = [];
  prior.rows.forEach((row, y) => [...row].forEach((v, x) => v === '1' && offsets.push(y * prior.width + x)));
  return { margins: [...prior.margins], offsets: Uint32Array.from(offsets), areaPx: offsets.length, members: prior.provenance.members };
}

function compare(learned, carried, window, bodyWidth) {
  const inWindow = ({ margins: [l, t, r], offsets }) => {
    const w = bodyWidth + l + r;
    return new Set(Array.from(offsets, (o) => { const x = o % w; return (window.bodyY - t + (o - x) / w) * window.width + window.bodyX - l + x; }));
  };
  const a = inWindow(learned), b = inWindow(carried);
  let shared = 0; for (const p of a) if (b.has(p)) shared++;
  return { marginsAgree: learned.margins.every((v, i) => v === carried.margins[i]), learnedPx: a.size, carriedPx: b.size, sharedPx: shared, iou: shared / Math.max(1, a.size + b.size - shared) };
}

/** px.baskets.shellShape from an overlap answer and the carried prior (the provider's schema, field for field). */
export function shellShapeOf(family, overlap, prior, extract) {
  const [bw, bh] = family.templateSize, n = family.members.length;
  const window = { width: overlap.window.width, height: overlap.window.height, bodyX: overlap.window.anchorAt[0], bodyY: overlap.window.anchorAt[1] };
  const learned = frameOf(overlap, bw, bh, extract), carried = carriedFrame(prior);
  const source = !n ? 'none' : learned ? 'learned' : 'carried', chosen = source === 'learned' ? learned : source === 'carried' ? carried : null;
  return {
    schema: 'chainspot-basket-shell-shape@1', source, agreementMin: SHELL_LEVEL, agreementCount: overlap.agreementCount,
    overlap: { window, memberCount: overlap.memberCount, agree: overlap.agree, query: SHELL_QUERY, residuals: overlap.members.map((m) => m.residual) },
    learned, learnedCondition: !n ? 'no basket family members' : learned ? null : 'no agreeing dark component encloses the body: the carried prior is used',
    carried, comparison: learned ? compare(learned, carried, window, bw) : null,
    margins: chosen ? chosen.margins : null, shellOffsets: chosen ? chosen.offsets : new Uint32Array()
  };
}

const ORIGINAL = Symbol.for('chainspot-toolkit.shellShape.originalRegisterBasket');
/**
 * Route the pinned S2's registration of fn.Basket.learnShellShape to the query-backed calculation above; everything else
 * stays the provider's. ask(args) calls fn.q.sprite.overlap on the run's store.
 */
export function installQueriedShellShape(dist, ask) {
  const basket = dist('stages/S2/clean/Basket'), prior = dist('detectors/threeFactor/assets/basket-shell.json');
  const { extractComponents } = dist('detectors/threeFactor/components');
  const original = basket.registerBasket[ORIGINAL] ?? basket.registerBasket;
  const learnShellShape = ({ family }) => shellShapeOf(family, ask(shellOverlapArgs(family)), prior, extractComponents);
  const wrapped = (pxc) => {
    const routed = Object.create(pxc);
    routed.register = (fn, calculate) => pxc.register(fn, fn.address === 'fn.Basket.learnShellShape' ? learnShellShape : calculate);
    return original(routed);
  };
  wrapped[ORIGINAL] = original;
  basket.registerBasket = wrapped;
  return () => { basket.registerBasket = original; };
}
