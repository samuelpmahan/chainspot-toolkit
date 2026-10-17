/** Reuse the production G4 builder to expose both poses for the seven frozen recoveries. */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const require = createRequire(import.meta.url);
const dist = (name) => require(resolve(root, 'packages/alg/dist', name));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const { decodeNodeFile } = dist('adapters/node');
const { stageContract } = dist('stages/S0/contract');
const { runThreeFactor, parseConfig, resolveConfig, DEFAULT_EXECUTION, canonicalJson, sha256Hex } = dist('detectors/threeFactor');
const { teeRecoveryUnit, buildTeeRecoveryCandidates } = dist('detectors/threeFactor/features/g3.teeRecovery');
const configBytes = readFileSync(resolve(root, 'packages/alg/src/detectors/threeFactor/configs/posterior-tee-recovery-on.json'));
const config = resolveConfig(parseConfig(JSON.parse(configBytes)), DEFAULT_EXECUTION);
const paramsHash = await sha256Hex(canonicalJson(config));
const outdir = resolve(root, 'artifacts/recovered-pad-fit-20260927');
mkdirSync(outdir, { recursive: true });

for (const name of ['AlexClark-original', 'IMG_5641']) {
  const frozen = JSON.parse(readFileSync(resolve(root, `artifacts/composed-render-20260927/${name}-capture.json`)));
  if (frozen.paramsHash !== paramsHash || frozen.configSha256 !== sha(configBytes)) throw new Error('Frozen capture config mismatch');
  const source = resolve(root, frozen.source.path);
  if (sha(readFileSync(source)) !== frozen.source.sha256) throw new Error('Original source bytes mismatch');
  const s0 = await stageContract.execute({ source, inputLabel: name, decode: decodeNodeFile });
  const canonical = s0.pxc.get('px.course.canonicalPixels');
  if (sha(canonical.rgba) !== frozen.source.frame.canonicalRgbaSha256) throw new Error('S0 canonical bytes mismatch');
  const captured = [];
  const originalRun = teeRecoveryUnit.run;
  teeRecoveryUnit.run = function (board, ctx) {
    const before = {
      stage: board.get('stage'), badges: board.get('badges'), baskets: board.get('baskets'), tees: board.get('tees'),
      sprites: board.get('sprites'), assignment: board.get('assignment'), viewport: board.get('viewport')
    };
    originalRun.call(this, board, ctx);
    // The original unit has registered its basket sprite occluder in ctx.
    // Repeating its exported candidate builder against pre-operation Parts
    // exposes exact fits without changing its selected outputs or drawing.
    const built = buildTeeRecoveryCandidates(before.stage, before.badges, before.baskets, before.tees,
      before.viewport.topPx, { assignment: before.assignment, sprites: before.sprites, occlusion: ctx.occlusion });
    captured.push(...built.candidates.map(c => ({ id: c.id, fit: c.fit, localizationFit: c.localizationFit,
      localizationSource: c.localizationSource, pixelCount: c.fragmentPixels.length,
      pixelsHash: sha(JSON.stringify(c.fragmentPixels)), firstPixels: c.fragmentPixels.slice(0,3), coordinateFrame: c.coordinateFrame,
      viewportTopPx: c.viewportTopPx })));
  };
  let run;
  try { run = runThreeFactor(canonical, { config, paramsHash }); }
  finally { teeRecoveryUnit.run = originalRun; }
  const recovered = frozen.marks.filter(m => m.geometry.type === 'recovered-pad');
  const matches = recovered.map(m => {
    const c = captured.filter(x => x.id === m.detail.resultRef);
    if (c.length !== 1 || c[0].pixelCount !== m.geometry.pixels.length) throw new Error(`Candidate mismatch ${m.detail.resultRef}`);
    const p = c[0];
    const top = (p.coordinateFrame === 'original' ? 0 : p.viewportTopPx ?? 0) + frozen.source.frame.canonicalToSource[1];
    if (p.pixelsHash !== sha(JSON.stringify(m.geometry.pixels.map(([x,y]) => [x,y-top])))) throw new Error(`PixelSet mismatch ${p.id}: frame=${p.coordinateFrame} top=${top}, source first=${JSON.stringify(m.geometry.pixels.slice(0,3))}, candidate first=${JSON.stringify(p.firstPixels)}; candidate hash=${p.pixelsHash}`);
    if (Math.abs(p.fit.centerXPx - m.geometry.supportCenter[0]) > 1e-9 ||
        Math.abs(p.fit.centerYPx + top - m.geometry.supportCenter[1]) > 1e-9) throw new Error(`Support center mismatch ${p.id}`);
    const fit = { ...p.fit, centerYPx: p.fit.centerYPx + top };
    const localizationFit = p.localizationFit && { ...p.localizationFit, centerYPx: p.localizationFit.centerYPx + top };
    return { teeId: m.detail.teeId, resultRef: p.id, holeRead: m.detail.holeRead,
      fit, localizationFit, localizationSource: p.localizationSource ?? 'support-fit',
      pixelCount: p.pixelCount, pixelHash: m.detail.fragmentSha256, baselineCorners: m.geometry.corners };
  });
  if (matches.length !== frozen.counts.recoveredTees ||
      run.assignment.tees.filter(t => t.recovery?.source === 'tee-shard-recovery').length !== matches.length)
    throw new Error('Recovered inventory mismatch');
  const result = { schema: 'recovered-pad-pose-comparison-input@1', source: frozen.source, paramsHash,
    frozenCaptureSha256: sha(readFileSync(resolve(root, `artifacts/composed-render-20260927/${name}-capture.json`))),
    matches, negativeControl: frozen.marks.filter(m => m.geometry.type === 'injected-center').map(m => ({
      teeId: m.detail.teeId, holeRead: m.detail.holeRead, source: m.detail.provenance.source,
      observedPixelCount: 0, fit: null, corners: null })) };
  writeFileSync(resolve(outdir, `${name}-poses.json`), JSON.stringify(result, null, 2));
  console.log(name, matches.map(m => `${m.holeRead}:${m.localizationSource}`).join(' '),
    `no-fit controls=${result.negativeControl.length}`);
}
