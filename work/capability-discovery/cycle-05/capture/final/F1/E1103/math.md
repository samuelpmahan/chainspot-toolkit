# E1103 — source-only mathematical predictions

Worker F1. Native-start packet received; no producer, CV operation, source edit, Git command, or worker spawn was performed. These are conditional, pre-observation predictions, not a frozen protocol, observed output, scientific acceptance, or calibrated detector. Proposed protocol admission and exact control bytes remain root-owned.

## Source binding and question

Read-only repository: `chainspot-discovery-lab`. The dispatch pins local commit `036d3e14416c40266917c51a0fe8d03785b050f3`, published commit `b17fdb6e211f886b1a5c01b60d808b73134c4df5`, and common tree `e21271ef77a501d4f41d1c9456ce1d23a87c5add`. These Git identities are coordinator testimony, not independently checked by this worker (no Git authority).

Independently rehashed source:

| Repository path | SHA-256 |
| --- | --- |
| `experiments/capability-discovery/probes/width/vendor/active/ports/s6straight/pathSpace.mjs` | `d0fb2bf5076a386a5c362b8fe034ab49ba5318fda2bd21eb74d30334ed6a105e` |
| `experiments/capability-discovery/probes/width/vendor/active/contracts/alpha.profile@1.mjs` | `9d1f316af6af2887e0c59bd7a2b0bc13d3305a817cfb6efffb42c8f3b238396f` |

The narrow latent software claim is whether existing local bilateral band contrasts can vary while one 16-station averaged profile still has a finite edge pair. Neither observation identifies a physical edge, a path, an alpha renderer, or a calibrated width. Both reuse the same pixels and are not independent scientific evidence.

## Conditional fixture assumptions

The proposed raster is 384x320, RGB background (100,100,100), with stripe RGB (145,145,145) on inclusive integer rows 145..174. Assume the stripe extends through every sampled x, at least 182..201, before gaps are applied. A gap replaces **all stripe rows** in its inclusive columns by background and does not change outside pixels. RGBA alpha is not consulted by `lumOf`; direct RGB values, exact row inclusivity, mask, and compositing policy must be frozen separately.

Pose is O=(192,160), phi=0, nominal W=30, stations arange(-8,8,1), hence 16 station columns x184..199. Positive normal offset means increasing y; offset+6 below means **move the pose** to O=(192,166), not move the stripe. `stationContrastAt` extends support to x182..201; its support is larger than the profile's x184..199 interval. All coordinates are safely inside the source boundary guard.

At phi=0, the negative-side inside offsets are -14,-13.5,-13,-12.5,-12; negative outside offsets -16,-16.5,-17,-17.5,-18. Positive-side inside offsets are 14,13.5,13,12.5,12; positive outside offsets 16,16.5,17,17.5,18. The negative side is called left by the code; it is not an independently established physical left edge.

## Local contrast is a box average, not a point measurement

For each side, the source computes inside mean minus outside mean using five longitudinal offsets d=-2,-1,0,1,2 and five lateral offsets b=1,1.5,2,2.5,3. There are 25 samples per band (50 per side; 100 across both sides), with masked samples dropped **separately** in each mean. Validity is min(inside retained fraction, outside retained fraction)>0.5: each band needs at least 13 of 25 samples. A retained count of exactly 12 or a retained fraction exactly 0.5 is not valid.

At the primary pose all five inside offsets are inside the stripe and all outside offsets are background; half-pixel bilinear sampling does not alter these uniform values. For an unmasked full-ribbon gap G, let k(t) be the number of integer columns in {192+t-2,...,192+t+2} intersecting G. Then both raw contrasts equal `45*(1-k(t)/5)`, and both validity flags remain 1. This formula is a direct source derivation, not a new acceptance threshold.

| t | x | Intact | Gap2 x191..192 | Gap6 x189..194 |
| --- | --- | --- | --- | --- |
| -8 | 184 | 45 | 45 | 45 |
| -7 | 185 | 45 | 45 | 45 |
| -6 | 186 | 45 | 45 | 45 |
| -5 | 187 | 45 | 45 | 36 |
| -4 | 188 | 45 | 45 | 27 |
| -3 | 189 | 45 | 36 | 18 |
| -2 | 190 | 45 | 27 | 9 |
| -1 | 191 | 45 | 27 | 0 |
| 0 | 192 | 45 | 27 | 0 |
| 1 | 193 | 45 | 27 | 9 |
| 2 | 194 | 45 | 36 | 18 |
| 3 | 195 | 45 | 45 | 27 |
| 4 | 196 | 45 | 45 | 36 |
| 5 | 197 | 45 | 45 | 45 |
| 6 | 198 | 45 | 45 | 45 |
| 7 | 199 | 45 | 45 | 45 |

Thus the two-column complete pixel interruption cannot produce a zero under this five-column average: minimum 27. The six-column case has zeros only at t=-1,0 and shoulders outside the missing region. An unaveraged center observation is zero at every missing column, so the two observables have different supports. Adjacent contrast stations share four of five longitudinal columns and are strongly dependent.

Historical tauLum=8 is diagnostic only. If displayed unchanged, all Gap2 stations exceed 8; Gap6 fails it only at t=-1,0 because the shoulders of 9 remain above 8. This does not propose accepting 8 or claim a two-pixel physical gap. `lossAt` counts stations times step, not exact interrupted pixel support.

## Long profile and exact edge-pair prediction

For each lateral offset, `profileAt` averages only x184..199. Its unmasked `ok` count is 16 for every offset. An interruption affecting g of these columns scales the stripe excess by (16-g)/16; background stays 100. Intact plateau=145, Gap2 plateau=139.375 (excess39.375), Gap6 plateau=128.125 (excess28.125). The default support requirement is max(8,0.2*16)=8, met everywhere even though a local gap exists.

The occupied integer rows put the interpolated step midpoints at y144.5 and174.5: offsets -15.5 and14.5 relative to O. A 0.25-pixel profile grid resolves both; five-tap smoothing plus central gradient yields unique symmetric peaks there. For a step of excess D over a one-pixel bilinear ramp the peak is 0.8*D lum/px. The parabolic sub-step correction is zero by symmetry. Conditional source predictions: l=-15.5,r=14.5,c=-0.5,w=30 for all three fixtures; scores36,31.5,22.5 respectively. The pair is finite at Wexp30, tolW3,latLim12. `widthSearchAt` at defaults also includes Wg30 and admits c=-0.5 under latLim3. Numeric equality must be tested with a frozen arithmetic tolerance, not tuned after output.

This finite pair is expected for a **longitudinally averaged photometric rectangle**, not continuous edges at every station. A fit/null result alone suppresses the local amplitude pattern.

## Offset and mask controls

For a +6 normal pose shift to O=(192,166), both negative-side bands lie inside the stripe and both positive-side bands lie outside it. Therefore cl=cr=0, with valid flags1 when unmasked; this is misregistration, not evidence of physical absence. The same stripe's long-profile center becomes -6.5. `edgePairOf` with default latLim12 still admits it, while `widthSearchAt` with default latLim3 rejects it. Any wrapper that changes these gates or recentering semantics must declare that separately; no universal +6 invariance follows.

For an exact known-gap mask covering all gap stripe pixels (or full-height gap columns), the remaining inside samples are still145 and outside samples100. With k<5, raw contrasts renormalize back to45; the validity remains1 only when k<=2. Gap2 is valid45 at all16 stations. Gap6 has validity0 at t=-3,-2,-1,0,1,2; raw contrasts at t=-3,-2,1,2 remain45 **despite invalidity**, and at t=-1,0 have no inside sample and are NaN. Do not replace these invalid cases by visible zero contrast. In a JSON-producing wrapper, define explicit nonfinite tagging: vanilla JSON.stringify turns NaN into null; raw `stationContrastAt` uses Float64Array NaN.

For `profileAt` with that mask, stripe-supported offsets retain14 (Gap2) or10 (Gap6) stations, still above8. The gap is removed from the mean and the intact profile/pair is recovered conditionally; `ok` varies at outside/edge offsets according to exact mask geometry and bilinear support. This is a missing-data/support effect, not recovered continuity.

Full-hidden control (mask=1 throughout all sampled support): station contrasts NaN, validity0; profile `ok`=0 and NaN profile; edge pair null. `lossAt` has visibleCount0, passFrac/lossFrac/medianContrast null, longestGapPx0 and gapsCount0. The zero reported gap is **no visible evidence**, not a proven absence of interruption. Masked stations terminate `gapsOf` runs; two visible failed runs separated by one hidden station do not join.

Mask decisions are bilinear mask>0.01, not nearest-neighbor. A binary mask corner can hide fractional samples outside an intuitive box. Different inside/outside masks create nonmatched support and biased contrasts. Exact mask bytes and inclusive box semantics must freeze.

## Alpha dependency and non-path controls

`stationContrastAt`, `profileAt`, and `edgePairOf` do not use the alpha contract, although the module imports it. `samplesAt`/`overlayAt` use center RGB at a single station (no five-column averaging); the background is the per-channel median of unmasked integer lateral offsets with 15<|offset|<=30. Here 30 background samples are available and the minimum required is8. Without an alpha profile, unchanged bright centers yield rounded proxy fraction0.290 (=45/155 rounded to three decimals), gap centers0. This is white-overlay brightness, not alpha.

If a profile is supplied, `overlayFraction` uses its overlay RGB direction, not its alpha value, in the least-squares ratio. Infinitely many (overlay RGB,alpha) pairs can produce145 on background100. A declared grayscale overlay190 gives0.5, overlay145 gives1, overlay100 is undecidable (denominator0). A fitted alpha field alone cannot distinguish organic brightness from rendered overlay.

Bright-organic and capsule control bytes/positions are not specified; unconditional numbers would invent protocol. A capsule whose sampled neighborhood is identical to the stripe is a constructive non-path equality control: every local operation returns the same values despite a different semantic label or remote endpoints. An organic rectangle with the same sampled values is equally indistinguishable. Curved caps entering the sampled support may alter the measurements but do not confer specificity. A center-only erased stripe (e.g. rows159..161 set to100) leaves both edge-band contrasts45 while center proxy drops0: converse disagreement is also possible.

## Proposed falsifiers and limits

The companion JSON is a machine-readable **proposal**, not an executable runner. Before any call, freeze RGB/RGBA pixels, row/column inclusivity, x extent, pose and sample phase, mask bytes, alpha input/null, exact operation/gates, serialization, and a numerical tolerance. Compare all raw left/right contrasts, separate valid flags, profile counts and values, pair fields/nulls, and center overlay fractions. Retain counterexamples and failed assumptions; do not tune gaps, controls, thresholds, or gates afterward.

Under those exact inputs, disagreement with any predicted array or finite/null state falsifies this derivation or exposes a source/input/orchestration mismatch. Agreement establishes only the bounded software mechanism. No same-edge association, path identity, physical gap estimate, width calibration, scale, heldout course performance, alpha renderer identity, production wiring, or promotion follows. Outcome: confirmed reuse **at source-level analytical capability only**; empirical confirmation and scientific/human acceptance remain unknown.
