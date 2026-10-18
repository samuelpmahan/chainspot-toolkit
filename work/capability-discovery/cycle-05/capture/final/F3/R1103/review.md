# R1103 — independent paper/source review of F1 E1103

Decision: accepted, strictly as conditional mathematical/source analysis. This is not acceptance of measured output, scientific validity, path identity, human geometry, promotion or a production implementation. F3 produced neither F1's derivation nor F4's fixtures. No CV/query/producer source was imported or invoked; no Git, source changes or spawns occurred. E1105 remains unchanged.

## Reviewed identity and method

Rehashed F1 result SHA256 `66f271ea1ec75f4861582fd3c41338b07276e282da913b3fc2592f8c193c6a35`, F4 protocol `3b7f1d2b166c759997c73f820c433ff653c84114e83c28af62c68ec003967ff5`, and pathSpace `d0fb2bf5076a386a5c362b8fe034ab49ba5318fda2bd21eb74d30334ed6a105e`; all match dispatch. Read F1 math/oracles, F4 protocol/generator/inventory/verification and relevant frozen profile/fit/contrast/loss/public-query source. Raw fixture hashes match F4 inventory. An independent read-only byte/index audit checked all 614400 RGBA pixels of five raw rasters and 368640 bytes of three masks against the frozen integer membership equations and exact RGB/alpha values. It also checked F1's gap-support count arrays using interval intersection arithmetic. No image decoding or CV measurement was performed. Source-derived analytic predictions remain predictions.

## Independent derivation

At phi0, O=(192,160), t=-8..7 gives x184..199. The contrast source extends x support by d=-2..2, so the union is x182..201. Inside offsets are -14..-12 and +12..+14 in steps0.5, all inside bright integer rows145..174. Outside offsets -18..-16 and +16..+18 are all background. Each band has25 sample positions. Thus intact left/right contrast is145-100=45 with validity1.

For an unmasked missing-column interval [a,b], the number within a station's five-tap support is `k=max(0,min(x+2,b)-max(x-2,a)+1)`. Exact bilateral contrast is `45*(5-k)/5`. This independently reproduces both complete F1 arrays, not merely their minima:

| Case | k for t=-8..7 | Bilateral contrast |
| --- | --- | --- |
| Gap2 | 0,0,0,0,0,1,2,2,2,2,1,0,0,0,0,0 | 45,45,45,45,45,36,27,27,27,27,36,45,45,45,45,45 |
| Gap6 | 0,0,0,1,2,3,4,5,5,4,3,2,1,0,0,0 | 45,45,45,36,27,18,9,0,0,9,18,27,36,45,45,45 |

Both flags remain1 without masking. Historical strict contrast>8 therefore passes all16 Gap2 stations, and14 Gap6 stations; Gap6 failures t=-1,0 form a source-reported run length2. This does not measure the six-column interruption's physical length or establish a useful threshold. Five-column overlap also prevents treating the16 results as independent samples.

Long-profile counts are16 everywhere unmasked. Removing g=0,2,6 stripe columns gives plateau `100+45*(16-g)/16`:145,139.375,128.125. The excesses D are45,39.375,28.125. Bilinear step transitions occur at rows144.5 and174.5, i.e. offsets-15.5 and14.5. Around the rising midpoint, smoothed values at midpoint±0.25 are `100+0.3D` and `100+0.7D`; the source central gradient is their difference/0.5=`0.8D`. Adjacent gradient values are0.7D. Thus the unique central peak and symmetric parabolic correction yield, in real arithmetic:

| Case | l | r | c | w | score=gl=gr |
| --- | --- | --- | --- | --- | --- |
| Intact | -15.5 | 14.5 | -0.5 | 30 | 36 |
| Gap2 | -15.5 | 14.5 | -0.5 | 30 | 31.5 |
| Gap6 | -15.5 | 14.5 | -0.5 | 30 | 22.5 |

Counts16 exceed need=max(8,.2*16)=8. Width30 and center-.5 satisfy declared tolerance3 and lateral limit12. Real-arithmetic symmetry is not a promise of bit-identical JavaScript floating output; F1 appropriately requires a pre-observation frozen numerical comparison tolerance. No tolerance was selected or tuned here.

The +6 pose control moves origin to y166, not the stripe. Negative inside/outside bands are both bright, positive inside/outside both dark, so both contrasts0 with flags1. The same pair shifts to l=-21.5,r=8.5,c=-6.5,w30 and passes the declared latLim12. F1's separate widthSearch latLim3 rejection is correct source commentary but is not an admitted query in F4's four-query protocol and must not become an extra producer call.

## Masks and raw/public semantics

Actual F4 gap6 mask spans full height in integer columns189..194. Integer x and full-height support mean the bilinear mask is exactly0 or1 for these samples, including half-integer lateral samples. Every profile offset therefore retains exactly10 stations, not just interior offsets; counts10 still pass need8 and the intact profile is recovered by omission. F1's statement that counts may vary concerns its additionally proposed stripe-only mask alternative, not this frozen case.

Each contrast band retains5*(5-k) positions and is valid only when its fraction>0.5. Here this means k<=2; k3 and4 retain10 and5 samples, giving finite raw45 but invalid flags. k5 retains none and gives NaN. Consequently t=-3,-2,-1,0,1,2 are invalid; only t=-1,0 are NaN, and the other four retain raw45. There are10 valid stations, all pass historical tau8; source loss has no visible failed run. This is missing evidence, not continuity.

All-hidden gives profile count0/NaN, bilateral NaN/flags0, and lower-level no edge pair. Source loss has visibleCount0, passCount0, null pass/loss fractions and median, longestGap0/gapsCount0. Hidden stations terminate source gap runs. These values support F1's missing-evidence interpretation.

The producer must respect public API representation: profile converts source NaN to null; stationContrast keeps NaN in plain arrays; public edgePair represents lower-level null as `{condition:'no edge pair'}`. F1's `edgePair:null` and `profileEveryValueTagged:'NaN'` are analytical lower-level states, not literal public-output byte oracles. This is a representation mapping, not a flaw in the math, and is already a separate E1105 contract concern.

## Non-path controls and pending scope

The frozen capsule straight segment covers x128..256, strictly including every contributing query coordinate x182..201. With center159.5 and radius15 its integer occupied rows are exactly145..174 throughout this interval. All four admitted queries therefore depend on the same local pixels as intact despite the non-path construction. A favorable fit/contrast/proxy output cannot establish semantic identity. F1 intentionally left numeric organic oracles conditional because its packet preceded exact control freezing; F4's actual capsule now satisfies that condition without altering F1's immutable packet.

For the large ellipse, even the conservative contributing rectangle x182..201,y130..190 lies comfortably inside the ellipse: the maximal normalized squared distance is bounded by `(10.5/96)^2+(30.5/70)^2 < .202 < 1`. Hence profile and bands are uniformly145, bilateral contrast0, and no positive width30 pair is expected. Source smoothing's finite-profile end artifacts are removed by endZero6. This verifies F4's ellipse control compatibility; F1 did not assert a competing numeric ellipse oracle. Rejection of this large ellipse does not neutralize the capsule equality counterexample.

F1's proxy0.290 derivation is also compatible: center145, median lateral background100, white proxy255 gives45/155, rounded by source to.290. Gap centers give0; no fitted alpha or overlay classification is implied. Profile/threshold null remain mandatory F4 arguments. Masked centers are null, not failed overlay classification.

Extra F1 proposals—gap2 known-mask, stripe-only alternate mask, center-only erasure, widthSearch—are analytically scoped and not automatically admitted F4 cases. They must not cause fixture, parameter, query or control changes after producer output. F1's statements that tolerance and exact organic bytes were not yet frozen describe its conditional packet timing; root must still freeze final runner/oracle mapping and numerical tolerance before any producer run.

## Verdict

Accepted with no blocking mathematical correction. The45/27/0 contrasts,36/31.5/22.5 long scores, finite-pair seam-.5, full-height mask renormalization/invalidity, tau8 Gap2 failure-to-detect and capsule semantic false-positive reasoning all follow from the pinned source and actual frozen fixture geometry. The decision is bounded mathematical review, never empirical confirmation. Exact observed API outputs, runner integrity, numerical tolerance admission and all scientific/human acceptance remain outside this review.
