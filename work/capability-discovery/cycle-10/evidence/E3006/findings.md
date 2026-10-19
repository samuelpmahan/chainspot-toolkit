# E3006 / S5 — new heading ablation proposal; no execution

Outcome: **mixed_change**. Existing public operations can test a new centerline-heading seam with four prospective contrast calls. Existing retained geometric summaries already expose a useful warning: the bright control's flank-derived midpoint line disagrees sharply with its core fitted midpoint. This is exploratory geometry, not a new pixel measurement, proof of edge identity, or prospective validation.

## Source-supported seam

`pathSpace.mjs` [P] lines95–103 averages a lateral profile over all longitudinal stations. Lines108–138 then select a rising/falling gradient pair with a nonlinear maximum; pair association is not retained. Lines142–158 sample bilateral contrast using a single fixed heading. A pooled pair therefore does not supply stationwise edges, a fitted tangent, or assurance that neighboring-window winners belong to the same structure. Public profile output cannot reconstruct stationwise profiles.

The earlier proposed joint center+width contrast experiment keeps phi fixed [K]. This proposal changes only heading relative to a jointly centered, width-fixed baseline. It is not another old160 grid, a replay, a width search, or the completed synthetic8. The organic capsule equality remains a semantic counterexample [O]; heading adjustment cannot establish path identity or AA/alpha.

## Exploratory retained-geometry read

Read only ordinary executed `R1513/result.json.perCaseFigures`, matching each `banks[].nominalWidth===42`; no tagged native answer, E2021 plan wire, input image, pixel plane or codec was read. Windows have station means -16.5,-0.5,15.5 and equal spacing16. All numbers below are exposed summary values, not new measurements.

| Group | c before16 | c core16 | c after16 | core minus mean(flanks), px |
| --- | ---: | ---: | ---: | ---: |
| primary | 0.8175617257517427 | -0.5947449408418812 | -1.1095791960404195 | -0.4487362056975428 |
| bright-nonpath | -0.03190735089543928 | 6.512793849318173 | -8.174105198179092 | 10.61580012385544 |

These fitted midpoint summaries are not one exact affine line. This directly challenges treating independently selected window fits as a single straight centerline, especially for bright. It does **not** falsify physical straightness: local texture, winner switching, pooling, taper and actual curvature are unresolved alternatives. No threshold or same-edge acceptance is inferred from these residuals. This observation is exploratory because the geometry has now been exposed.

## Frozen prospective four-call experiment

Question: on these exposed primary/bright core windows, does flank-derived heading improve bilateral contrast beyond the frozen joint-center+width baseline, and does it improve the bright control similarly?

Only nominal42 selects geometry. Do not select another bank/window after seeing results. Use the original full-frame source-pixel coordinates, original image, literal mask:null, phi=-0.20539538918976738, group origins primary[780,906], bright[780,740]. Let n=[-sin(phi),cos(phi)]. Both arms use Ojoint=O+cCore*n and the SAME listed raw numeric width; there is no width cosine correction, recenter, refit or search.

| Group | cCore constant | width constant | baseline phi | candidate phi constant |
| --- | ---: | ---: | ---: | ---: |
| primary | -0.5947449408418812 | 42.26372284910734 | -0.20539538918976738 | -0.26554589467489287 |
| bright-nonpath | 6.512793849318173 | 43.74145492884304 | -0.20539538918976738 | -0.4545519493150654 |

Candidate heading is motivated by phi+atan((cAfter-cBefore)/32). The table freezes caller-selected binary64 decimal constants from this exploratory summary analysis; it does not assert a new authenticated native raw-argument binding. Future admission must pin literal constants/formulas and input provenance, with independent unit/source review. No rounded display token is silently substituted for an independently authorized raw value.

Call only unchanged public `fn.q.path.stationContrast`, in order primary baseline, primary candidate, bright baseline, bright candidate. Retain exact public key order `raster,mask,originPx,phiRad,t0Px,t1Px,stepPx,widthPx,bandPx,alongPx`; semantic addresses px.image.cropped/tk.s6.pathMask; t0=-8,t1=8,step=1,band=[1,3],along=2. No profile/edgePair/loss/free-width/overlay query. Fixed scalar station parameters remain equal; changed heading necessarily changes sampled pixels, and does not establish a common physical support.

Prediction, frozen before ANY four-call outputs: let Dg be mean of per-station changes in min(leftLum,rightLum) from baseline to candidate, only if all16 stations in BOTH arms have two finite sides and okLeft=okRight=1. Predict Dprimary>0 AND Dprimary>Dbright. Dprimary<=0 falsifies benefit; Dbright>=Dprimary falsifies the proposed primary-specific explanation. Any missing/nonfinite/invalid station yields UNKNOWN for this aggregate, while all raw sides/flags and individual differences stay visible. No posthoc support dropping, replacement, new cutoff, rerun, or improved-pose search. A positive outcome is conditional in-sample sampling evidence, not confidence, path/edge identity or causal isolation of physical width.

This is an intentionally small falsifier, not a tracker or detector. Flank/core winner switching may defeat it; retain that failure. Four fresh public contrast calls need actual original pixels/new CV and a separately reviewed bounded producer/runtime/output gate. Geometry construction and residual inspection need only already retained ordinary geometric summaries. No fresh pixels/CV are needed to conclude that stationwise edge geometry is absent. An AA/alpha claim remains unsupported: [P] reads arithmetic RGB, and WHITE is a brightness proxy; no renderer/AA inference is proposed.

## Exact source IDs (SHA256; fresh read-time hashes)

- [P] `chainspot-discovery-lab/experiments/capability-discovery/probes/width/vendor/active/ports/s6straight/pathSpace.mjs`, 27838B, `d0fb2bf5076a386a5c362b8fe034ab49ba5318fda2bd21eb74d30334ed6a105e`.
- [G] `discovery-cycle06/R1/R1513/result.json`, 605076B, `0002f0c25157073eced2c6a4008abbd2a2feca268b863536160ba9069e8441c8`; only ordinary summary geometry was extracted; not raw-answer decoding/replay.
- [K] `discovery-cycle07/S2/E2002/contract.md`, 15735B, `6d5e03b5762e9966bddd3d9f508ec47b9ea1489ef6ba16f13d53316df28789dc`.
- [O] `discovery-cycle05/F3/R1103/review.md`, 8356B, `68a0ba2d708eb9c81403fc9aaaf2d2b77f28a609fab8a28089dec55f20953f6e`; existing capsule equality and fixed-pose contrast math, not repeated here.
- [L] `chainspot-discovery-lab/experiments/capability-discovery/lenard5-station-evidence/README.md`, 9668B, `6a40f91299961893ec7de5096b366f234be46743e7b86036a32e41dda24afaf7`.
- [C8] `chainspot-discovery-lab/work/capability-discovery/cycle-08/post-review-admin/current/CURRENT.md`, 4822B, `f9041e4fe7d5f617b64ef18fc7ff9728d63f88383bbd2ec4700d08bddcf63233`; Lab8 was a pure contract checkpoint with zero new geometry/CV.

No tests, product/source imports, codec/helper/store/PATH/CV calls, producer, image/pixel access, Git or source mutation, delegation or HH work. Only own E3006 findings/result files were written. Read-only Python standard-library JSON/arithmetic/hash inspection was used on the allowed ordinary summary and listed source documents.
