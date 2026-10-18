import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';
import { widthSearchAt } from './vendor/active/ports/s6straight/pathSpace.mjs';
import { observeFourLaneCrossSection as devObserve, estimateFourLaneCorridorWidth } from './vendor/dev72/fourLaneRibbon.ts';
import { assessLocalWidth, assessPairedRails, preserveNonFinite } from './recipe.mjs';
const require = createRequire(import.meta.url);
const { observeFourLaneCrossSection: observe, DEFAULT_FOUR_LANE_SENSOR_KNOBS: knobs } = require('./vendor/provider/fourLaneSensor.cjs');
const here = dirname(fileURLToPath(import.meta.url)), sha = b => createHash('sha256').update(b).digest('hex');
const manifest = JSON.parse(readFileSync(new URL('./provenance.json', import.meta.url)));
const provenance = manifest.sources.map(s => { const bytes = readFileSync(new URL(s.file, import.meta.url)); const gitBlob = createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest('hex'); assert.equal(sha(bytes), s.sha256); assert.equal(gitBlob, s.gitBlob); return { ...s, verified: true }; });
const cases = [];
function stripe(nominalWidthPx) {
  const width = 160, height = 160, data = new Uint8Array(width * height * 4), occupiedRows = [];
  for (let y = 0; y < height; y++) { const inside = Math.abs(y - 80) < nominalWidthPx / 2; if (inside) occupiedRows.push(y); for (let x = 0; x < width; x++) data.set([inside ? 145 : 100, inside ? 145 : 100, inside ? 145 : 100, 255], (y * width + x) * 4); }
  return { image: { width, height, data }, nominalWidthPx, occupiedRows, rasterWidthPx: occupiedRows.length, bilinearEdgeSeparationPx: occupiedRows.length };
}
const ctx = image => ({ W: image.width, H: image.height, lum: Float64Array.from({ length: image.width * image.height }, (_, i) => image.data[4 * i]), mask: null });
const state = (offset = 0) => ({ xPx: 80, yPx: 80 + offset, headingRad: 0, corridorWidthPx: 30 });
function record(id, input, result, meaning) { cases.push({ id, input, result, meaning, units: 'same-image source px; RGB mean levels and lum/px where named; scores dimensionless' }); }
for (const nominalWidthPx of [29, 30, 59, 60, 61, 62]) {
  const s = stripe(nominalWidthPx), fit = widthSearchAt(ctx(s.image), [40, 80], 0, 0, 70);
  if ([29, 30].includes(nominalWidthPx)) { assert.equal(s.rasterWidthPx, 29); assert.equal(fit.wPx, 29); }
  if ([59, 60].includes(nominalWidthPx)) { assert.equal(s.rasterWidthPx, 59); assert.equal(fit.wPx, 57); assert.equal(fit.score, 4.5); }
  if ([61, 62].includes(nominalWidthPx)) assert.equal(fit, null);
  record(`raster-width-${nominalWidthPx}`, { nominalWidthPx, rasterWidthPx: s.rasterWidthPx, edgeSeparationPx: s.bilinearEdgeSeparationPx }, fit, fit?.wPx === 57 ? 'weak near-boundary under-estimate, not a measured physical ribbon width' : 'strict raster inequality counts occupied rows; nominal argument is not raster width');
}
const narrow = stripe(30);
const offDefault = widthSearchAt(ctx(narrow.image), [40, 83.25], 0, 0, 70), offWide = widthSearchAt(ctx(narrow.image), [40, 83.25], 0, 0, 70, { latLim: 12 });
assert.equal(offDefault, null); assert.equal(offWide.wPx, 29); assert.equal(offWide.cPx, -3.25);
record('offset-center-gate', { nominalWidthPx: 30, rasterWidthPx: 29, originOffsetPx: 3.25, defaultLatLimPx: 3, explicitLatLimPx: 12 }, { defaultFit: offDefault, widerGateFit: offWide }, 'default rejection does not establish ribbon absence; explicit wider gate recovers same rail width');
for (const offsetPx of [0, 2, 4]) { const observation = observe(narrow.image, state(offsetPx), [], knobs); assert.equal(observation.score, offsetPx === 0 ? 1 : 0); record(`four-lane-offset-${offsetPx}`, { expectedWidthPx: 30, rasterWidthPx: 29, offsetPx }, observation, 'fixed-center score is offset-fragile; zero score is not ribbon absence'); }
const broad = stripe(41), broadState = { xPx: 80, yPx: 80, headingRad: 0, corridorWidthPx: 40 };
const railsHidden = [{ bboxX: 60, bboxY: 54, bboxW: 40, bboxH: 12 }, { bboxX: 60, bboxY: 94, bboxW: 40, bboxH: 12 }];
const innerOnly = devObserve(broad.image, broadState, railsHidden); assert.equal(innerOnly.railMode, 'occluded'); assert.equal(innerOnly.railScore, null); assert.equal(innerOnly.score, 1); assert.equal(assessPairedRails(innerOnly).status, 'UNKNOWN');
record('rails-hidden-inner-visible', { expectedWidthPx: 40, occluders: railsHidden }, { observation: innerOnly, pairedEvidence: assessPairedRails(innerOnly) }, 'rail channel UNKNOWN coexists with combined score1; combined score is insufficient bilateral calibration evidence');
const allHidden = [{ bboxX: 0, bboxY: 0, bboxW: 160, bboxH: 160 }], segment = { tee: { xPx: 20, yPx: 80 }, badge: { xPx: 130, yPx: 80 } };
const hiddenObservation = devObserve(broad.image, broadState, allHidden); assert.equal(hiddenObservation.score, null);
const hiddenWidth = estimateFourLaneCorridorWidth(broad.image, [segment], allHidden, [30, 40, 50]); assert.equal(hiddenWidth.widthPx, 30); assert.ok(hiddenWidth.scores.every(r => r.visibleSamples === 0 && r.meanScore === -Infinity));
const noSegments = estimateFourLaneCorridorWidth(broad.image, [], [], []); assert.equal(noSegments.widthPx, 40);
const explicitFixturePolicy = { minQualifiedSegments: 1, minBilateralSamples: 1, minVisibleSamples: 1, minMeanScore: 0, minScoreSeparation: 0.1, maxRelativeWidthIqr: 0.1 };
const qualifiedFixtureEvidence = { frame: 'same-canonical-image-pixels', widthScope: 'LOCAL', segmentQualification: 'straight-tee-to-badge-independent', qualifiedSegments: 1, bilateralSamples: 1, profileTouchesLateralBoundary: false, relativeWidthIqr: 0, heldOutCheck: 'agreement-within-reported-fit-uncertainty' };
const confidenceInputs = { policy: explicitFixturePolicy, evidence: qualifiedFixtureEvidence };
for (const [id, estimate] of [['all-hidden-width', hiddenWidth], ['empty-segment-fallback', noSegments]]) { const decision = assessLocalWidth({ estimate, ...confidenceInputs }); assert.equal(decision.status, 'UNKNOWN'); assert.equal(decision.widthPx, null); record(id, { candidateWidthsPx: id === 'all-hidden-width' ? [30, 40, 50] : [], fixtureOnlyPolicy: explicitFixturePolicy }, { legacy: estimate, decision, hiddenObservation }, 'legacy numeric return is retained for diagnosis, never promoted to measured local width'); }
const tied = { widthPx: 30, scores: [{ widthPx: 30, meanScore: 1, visibleSamples: 5 }, { widthPx: 40, meanScore: 1, visibleSamples: 5 }] }, separated = { widthPx: 40, scores: [{ widthPx: 30, meanScore: 0.2, visibleSamples: 5 }, { widthPx: 40, meanScore: 1, visibleSamples: 5 }] };
const controls = {
  tied: assessLocalWidth({ estimate: tied, ...confidenceInputs }),
  missingPolicy: assessLocalWidth({ estimate: separated, evidence: qualifiedFixtureEvidence }),
  boundary: assessLocalWidth({ estimate: separated, policy: explicitFixturePolicy, evidence: { ...qualifiedFixtureEvidence, profileTouchesLateralBoundary: true } }),
  missingBilateral: assessLocalWidth({ estimate: separated, policy: explicitFixturePolicy, evidence: { ...qualifiedFixtureEvidence, bilateralSamples: 0 } }),
  missingHeldOut: assessLocalWidth({ estimate: separated, policy: explicitFixturePolicy, evidence: { ...qualifiedFixtureEvidence, heldOutCheck: 'not-run' } }),
  invalidEvidenceCount: assessLocalWidth({ estimate: separated, policy: explicitFixturePolicy, evidence: { ...qualifiedFixtureEvidence, qualifiedSegments: Infinity } }),
  eligibleFixture: assessLocalWidth({ estimate: separated, ...confidenceInputs })
};
for (const [k, v] of Object.entries(controls)) assert.equal(v.status, k === 'eligibleFixture' ? 'ELIGIBLE_FOR_COMPARISON' : 'UNKNOWN');
assert.equal(controls.eligibleFixture.promoted, false);
record('recipe-confidence-controls', { policyStatus: 'explicit synthetic fixture policy; not a physical acceptance constant', policy: explicitFixturePolicy, evidence: qualifiedFixtureEvidence }, controls, 'qualified confidence evidence is required; no policy or weak/tied/hidden/boundary evidence remains UNKNOWN');
const recipe = JSON.parse(readFileSync(new URL('./experiment.recipe.json', import.meta.url)));
const output = { schema: 'width-offset-negative-receipt@1', job_id: 'E202', outcome: 'mixed_change', tests: { status: 'PASS', cases: cases.length }, runtime: { node: process.version }, provenance, code: ['probe.mjs', 'recipe.mjs', 'experiment.recipe.json', 'provenance.json'].map(file => ({ file, sha256: sha(readFileSync(new URL(file, import.meta.url))) })), recipeId: recipe.id, cases, boundaries: ['Synthetic mechanisms only; no image accuracy, physical endpoint identity, width promotion, defaults change or AA muting.', 'Nominal raster width is reported separately from occupied rows and fitted rail width.', 'Confidence fixture thresholds are test inputs; real policies must be declared and cross-validated by their caller.'] };
const outArg = process.argv.indexOf('--out'), outputPath = resolve(here, outArg < 0 ? 'receipts/actual.json' : process.argv[outArg + 1]); mkdirSync(dirname(outputPath), { recursive: true }); writeFileSync(outputPath, JSON.stringify(output, preserveNonFinite, 2) + '\n'); console.log(JSON.stringify({ status: 'PASS', cases: cases.length, receipt: outputPath, sourceFilesVerified: provenance.length }));
