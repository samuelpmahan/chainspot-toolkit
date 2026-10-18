/**
 * contracts/alpha.profile@1: what the rendered overlays are made of, so every stage can see through them.
 *
 * The scene (DOCTRINE "The scene") is a photo with sprites composited over it. The translucent ones (the grey hole
 * path, the C1 and C2 fills, the C2 dashes) obey one compositing rule per pixel:
 *
 *   observed = alpha * overlayRgb + (1 - alpha) * background           (composite)
 *   background = (observed - alpha * overlayRgb) / (1 - alpha)         (unmix)
 *
 * The S7 lane publishes the Part ALPHA_PROFILE_PART: per course, per overlay class, the overlay colour and alpha
 * it fitted, with its residual and where it was fitted. S5 reads it to un-composite a pad before fitting the tee
 * axis (learning); S6 reads it to measure how much path overlay a pixel along tee -> basket carries
 * (discrimination); S7 rides that overlay fraction to trace the path (Sam, 2026-10-18: "S7 alpha composition
 * informs S5 learning and S6 discrimination").
 *
 * Shape of the Part value (every number with its unit in the name; all px in the canonical S0-cropped frame):
 *   {
 *     schema: 'nctk-alpha-profile@1', course,
 *     r1Px,                                  // the course scale, from the rings only (DOCTRINE)
 *     overlays: {
 *       path:   { rgb: [r, g, b], alpha, sigmaRgb, sigmaAlpha, samplesPx, fitOn: 'straight holes h, k, ...', residualRms },
 *       c1Fill: { ... }, c2Fill: { ... }, c2Dash: { ... }        // a class not fitted is { status: 'not fitted', reason }
 *     },
 *     method: 'how alpha and rgb were separated (text, for the reader)',
 *     fit: { ... }                           // optional diagnostics for the reader and the render (scale, per-class
 *                                            // pairs, exclusions in px, control ratio, alpha by sample geometry,
 *                                            // residual histogram, crop anchors); not a consumer surface: consumers
 *                                            // read overlays, r1Px and nothing else
 *   }
 * Units: rgb and sigmaRgb in RGB levels 0..255; alpha and sigmaAlpha as fractions 0..1; residualRms in RGB levels (the
 * per-pair rms of inside - (alpha x rgb + (1 - alpha) x outside), pairs being bin means); samplesPx in px of the image
 * (inside + outside px kept); fitOn names the Parts (candidates, holes) the class was fitted on. Producer:
 * fn.tk.s7.alphaProfile (fg/alpha/alphaProfile.calc.mjs), queries fn.q.alpha.* (fg/alpha/alphaSpace.mjs).
 * A missing profile is a recorded condition (noProfile), never a throw: consumers fall back to the raw raster and
 * say so in their emits.
 *
 * Versioning: a new field, class or a different compositing rule is alpha.profile@2, never an edit here. Browser-safe.
 */
export const ALPHA_PROFILE_PART = 'tk.s7.alphaProfile';
export const ALPHA_PROFILE_SCHEMA = 'nctk-alpha-profile@1';
export const OVERLAY_CLASSES = Object.freeze(['path', 'c1Fill', 'c2Fill', 'c2Dash']);

const clamp255 = (v) => Math.max(0, Math.min(255, v));

/** observed = alpha * overlay + (1 - alpha) * background, per channel (0..255). */
export const composite = (background, { rgb, alpha }) => background.map((b, i) => alpha * rgb[i] + (1 - alpha) * b);

/** background = (observed - alpha * overlay) / (1 - alpha), per channel, clamped to 0..255. Alpha 1 is opaque: nothing behind it. */
export function unmix(observed, { rgb, alpha }) {
  if (alpha >= 1) return null;
  return observed.map((o, i) => clamp255((o - alpha * rgb[i]) / (1 - alpha)));
}

/**
 * The fraction of overlay a pixel carries, given a background estimate: the least-squares alpha of
 * observed = a * rgb + (1 - a) * background over the three channels, clamped to 0..1. A pixel whose background
 * equals the overlay colour is undecidable (returns null).
 */
export function overlayFraction(observed, background, { rgb }) {
  let num = 0, den = 0;
  for (let i = 0; i < 3; i++) { const d = rgb[i] - background[i]; num += (observed[i] - background[i]) * d; den += d * d; }
  if (den < 1e-6) return null;
  return Math.max(0, Math.min(1, num / den));
}

/** The recorded condition when no profile exists for a course (a lane not run, a class not fitted). */
export const noProfile = (reason) => Object.freeze({ status: 'no alpha profile', reason });
export const hasOverlay = (profile, cls) => Boolean(profile?.overlays?.[cls] && profile.overlays[cls].alpha != null);
