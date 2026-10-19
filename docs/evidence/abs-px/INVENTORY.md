# Absolute px / fixed-ratio inventory, S0-S7 (read-only, branch claude/lucid-mendel-dvco6c)

Method note: no sub-agent tool was available to me, so the "parallel Haiku readers" were replaced by one reader (me)
sweeping ports/*, fg/*, impl/*, contracts/*, stages/*.json and recipes/* by grep and then reading every hit in context.
Every ABSOLUTE entry below was read at the cited line. Nothing in the repo was changed or run. Entries are groups of
related constants (one row = one rule); "n" counts the constants in the group. Not exhaustive for GLOBAL-ok/LOCAL-ok
(those are sampled by family); exhaustive for ABSOLUTE as far as grep for length/area/ratio constants can see.

E19 scale factors used (Lenard full 1x -> lenard1-5, one zoom): map distances x2.33 (R1 24.2 -> ~56 px), pad/badge sprites
x2.04, hallway width W x1.45 (35.75 -> 51.7-52.3 px). Basket sprite 46x72 and strokes do not scale (screen px).
A rule written in px or W but applied to a map distance therefore loses 2.33x (px) or 1.6x (W: 2.33/1.45).

## Summary table

| Class | Entries (rule groups) | Notes |
|---|---|---|
| ABSOLUTE | 26 (about 60 constants) | 9 are predicted to break or already break in the E19 data; 11 more are map-scaled but with headroom or a harmless failure direction |
| GLOBAL-ok | 17 | screen-px strokes, AA bands, basket-sprite and centre-error constants |
| LOCAL-ok | 22 | measured per image or expressed in W / R1 / pad lengths of that image |
| Testimony rules (separate) | 9 sites | tee 8 px, basket 12 px, bend W/2, plus 2 stragglers (see end) |

Top ABSOLUTE entries by predicted breakage (details below): A1 LINE_UP maxDistPx 230, A2 bendReachPx 800,
A3 secondBend axisSpanPx 80, A4 lateral profile OFFS +-30 px, A5 width search 18..59 px, A6 0.933 x R1 fallback,
A7 runEnd tmax 1500, A8 bend grid/refine 6-8 px, A9 maxLegW 15 W, A10 closeOnBp 8 W.

---------------------------------------------------------------------------------------------------------------------

## ABSOLUTE

Format: file:line | name = value | measures | current unit | should be | E19 prediction.

### S5 (pair) and S3 association

**A1** ports/s5pair/residualProfile.mjs:38 | LINE_UP_RULE.minDistPx = 40, maxDistPx = 230 | tee-to-badge distance a pad may
line up over (S5 residual verdict) | px | pad lengths (ASSOC_BOUNDS.badgeMin/MaxDistPadLengths = 0.6 / 12 L already exist in
ports/s3assoc/associate.mjs:23-24) or R1 | BREAKS at 2.33x. Measured tee-cap-to-badge lengths in the five zoomed runs
(attempts/*/s6straight.frames.json, lenPx) are 110-335 px; /2.33 they are 47-144 px at 1x, all inside 40-230. At zoom
12 of the 27 segments exceed 230 (lenard1: 253, 284, 311, 332; lenard2: 287, 314, 335; lenard3: 291; lenard4: 231;
lenard5: 245, 291, 291) so `linesUp` is false for them. Same rule would also reject 1x segments on a course with
R1 > ~55. The minimum 40 breaks the other way at zoom-out (R1 < 14).

**A2** ports/s3assoc/associate.mjs:22,25 | straight3TlsPx = 1.5, straightLateralPx = 3.0 | 3-point TLS residual and
axis-to-BasketPoint miss that read a hole as straight | px over a tee-to-basket run of hundreds of px | an angle (deg) or a
z like the badge test (sigma0 + dist x sigma_theta) | Low risk from E19: lateral miss = distance (x2.33) x angle error
(pad bigger, about /2), net about x1.1. Hole 1 at 1x has tlsMax 0.27 px against 1.5. No E19 evidence of a miss; the
bound still scales wrongly for a long hole on a big-R1 course (alex hole 7 is 1334 px tee-to-BP at R1 36).

### S7 route (accepted lane: routeMatch)

**A3** ports/s7route/match.mjs:33 | secondBend.axisSpanPx = 80, axisStepPx = 8, refineAxisPx = 8, refineAxisStepPx = 2,
refineStepPx = 2 | search window of the first bend B1 along the tee axis for a second-bend route, and its polish |
px (map distance) | R1 (80 px = 3.3 R1 at 1x, 1.4 R1 at zoom) or ribbon-length units | BREAKS at 2.33x: the window covers
2.33x less ground, so any second bend whose B1 sits more than 34 px (1x-equivalent) from the 1-bend route's bend is
unreachable. E19 symptom, not attributed: crossScaleBends shows full-scale bend on hole 1 (lenard1, 2, 4) and hole 8
(lenard3) found in 0 of the zoom views (summary.json). I did not run it to attribute.

**A2b (same family)** ports/s7route/match.mjs:33 | secondBend.gridStepW = 0.5, bboxW = 2, minLegW = 1 | B2 free-point grid
step, search box and minimum leg of a second bend | W (ribbon width) applied to a map distance | R1 | Drifts 1.6x
(2.33 / 1.45): the box (2 W = 71 px at 1x, 104 px at zoom) is 1.6x tighter in ground terms at zoom.

**A4** ports/s7route/routeSpace.mjs:65 | ROUTE.bendReachPx = 800 | how far past the badge a bend is tried on the tee axis |
px (map distance) | R1 (800 px = 33 R1 on Lenard full, 14 R1 on its zooms, 18 R1 on golden, 22 R1 on alex) | BREAKS at
2.33x for any bent hole whose bend is more than 343 px (800/2.33) past the badge at 1x scale. Already clips at 1x on
big-R1 courses: tee-to-BP straight distances in baselines/s3assoc are 980 px (golden 4), 1334 px (alex 7), 918 / 900 px
(alex 18, 16). Lenard full hole 12 is 905 px tee-to-BP (x2.33 = 2100 px at zoom) and hole 9 is 647 px (1507 px): a bend
beyond 800 px is lost whenever those holes are in a view. Cause of lenard2 hole 16 and lenard4 hole 3 "not traced" is
not shown to be this (condition text is only "not traced by this implementation").

**A5** ports/s7route/routeSpace.mjs:66,67 and ports/s7route/match.mjs:32 | bendStepPx = 8, contrastBendStepPx = 6,
MATCH.refineAxisSpanPx = ROUTE.contrastBendStepPx (6, x2 iterations = +-12) | bend grid step and the +-span the refine may
move the bend (E18) | px (map distance) | R1 fraction (6 px = 0.25 R1 at 1x, 0.11 R1 at zoom) | No break predicted, but
under-search at zoom: where contrast is flat inside a C1 disc (E18, golden 4) the flat span grows x2.33 while the +-12 px
refine does not. Finer in ground terms at zoom, so runtime grows with reach x2.33 / step.

**A6** ports/s7route/bends.mjs:41 | BENDS.boundW = 1.5 | how far a bend may move from the matching rule's bend | W applied
to a bend displacement (map distance) | R1 | Drifts 1.6x: 1.5 W = 54 px at 1x, 78 px at zoom, while a map-scaled
displacement of 54 px would be 125 px. Binds earlier at zoom. (The rest of bends.mjs is LOCAL-ok, see below.)

**A7** ports/s7route/routeSpace.mjs:60,69 | minStations = 20, contrastMinPx = 30; also ports/s7trace/hallway.mjs:300 (ni/no < 30),
:335 (nci/nco < 12, ni < 30), :224 (m.length < 25), :241-ish 12; ports/s7trace/endpoints.mjs:27 (minStations 12,
scanStations 25) | minimum visible stations or band px to count a reading | px count (stations are 1 px apart) | W or R1
fraction | Easier at zoom (counts grow). Breaks only at zoom-out: 20 stations is 0.56 W at 1x, 0.25 W at R1 12.

### S7 hallway sensor and width (shared by S6 and S7)

**A8** ports/s7trace/hallway.mjs:24 (OFFS) and ports/s6straight/pathSpace.mjs:44 (offsetsPx) | lateral profile extent
-30..+30 px, step 0.25 | px | W (W/2 + the 3 px outer contrast band + margin) | BREAKS next zoom up: a ribbon edge sits at
+-W/2 and the outer contrast band reaches +3 px past it. lenard5 has W = 52.3, so the band ends at 29.2 px of 30: 0.8 px
of headroom. Fails once W > ~54 px, i.e. R1 > ~58 (fine regime) = a Lenard zoom above ~2.4x, or golden (R1 44.6,
W ~41.5) zoomed above ~1.3x.

**A9** ports/s7trace/hallway.mjs:357 (arange(20,60,2)), :372 (arange(18,60,1)), ports/s6straight/pathSpace.mjs:50
(widthsPx [18,60,1]); text repeated in routeSpace.mjs:224 | hallway width search range | px | R1 x the regime ratio
(REGIMES in fg/scene/invariants.mjs) or a wide fraction of R1 | BREAKS at the same point as A8 (W >= 60 here; 52.3
measured, 13% headroom). Lower bound 18 px fails below R1 ~12.

**A10** ports/s7trace/hallway.mjs:361 | widthFromStraight fallback `0.933 * S.R1` | hallway width when no STRAIGHT hole gives
one | fixed ratio W / R1 (fine regime only) | REGIMES.hallwayOverR1 by measured regime | BREAKS at 1x Lenard: W measured
35.75 px, R1 24.2, so 0.933 x R1 = 22.6 px (37% low, 1.6x). Right at zoom (0.933 x 56 = 52.3 vs 51.7). The two regimes
(1.46-1.49 at R1 <= 27, 0.93-0.94 at R1 >= 36) are why E19 sees W scale 1.45 against R1 scale 2.33.

**A11** ports/s7trace/hallway.mjs:115 | ringRadius search rs = arange(10, 260, 0.5) | R1 search range | px | fraction of
min(image dims) like fg/alpha/alphaSpace.mjs:236 (rMax = min(W,H)/3, floor 12) | Not predicted to break (R1 21-56 inside
10-260). This is the "s7main R1 search range" DOCTRINE says broke; the widened range is still a fixed px bound.

**A12** ports/s7trace/hallway.mjs:52,158 | edgePair/fitFree defaults tolW = 3.0, latLim = 12.0 (also :433 tolW 1.5, latLim 6.0,
span 2.0; :372 0.75 / 3.0; ports/s6straight/holeStraight.mjs:132 tolWPx 1.5, latLimPx 1.5) | width and centre tolerance of an
edge pair | px | edge-localisation tolerances are screen-px (blur, 0.5 px width quantum); the 12 px / 6 px lateral windows
are heading-drift allowances | W fraction for latLim | The 12 px window is x2.33 too small if heading drift over a run
dominates; no E19 evidence. Treat tolW as GLOBAL-ok, latLim 12.0 / 6.0 as ABSOLUTE-low.

### S7 legacy follower and endpoints lanes (fn.Hole.trace endpoints / pinned; not the accepted routeMatch lane)

**A13** ports/s7trace/hallway.mjs:172 | runEnd tmax = 1500 | longest run followed | px (map distance) | R1 or image diagonal |
BREAKS at zoom for long holes: 1500 px = 62 R1 at 1x, 27 R1 at zoom. Lenard full hole 12 (905 px tee-to-BP) is 2100 px
at 2.33x.

**A14** ports/s7trace/endpoints.mjs:27 (maxLegW = 15), ports/s7trace/hallway.mjs:238 (8 * W), :258 (tEnd + 1.6 W), :241 and
endpoints.mjs:44,64 (1.2 W, 0.5 W) | longest leg, farthest BasketPoint a run can close on | W applied to map distances |
R1 | Drifts 1.6x: 15 W = 536 px at 1x but 785 px at zoom, against a map distance that grew to 1249 px. 8 W = 286 px at 1x,
418 px at zoom (needs 666). The 1.2 W / 0.5 W minimums are ribbon-local and fine.

**A15** ports/s7trace/hallway.mjs:217 and endpoints.mjs:104 (70 px run after a bend), :396-399 (60 px badge-ribbon read, lat
+-3 px), :432-433 (half + 70), :480-481 (400 px hidden-cap search), :220 (heading 4..150 deg is fine) | fixed run lengths
used to read the ribbon past a vertex | px (map distance) | W (70 px = 2.0 W at 1x, 1.35 W at zoom; read length that fits
within a leg) | Reads shorter relative to W at zoom, no hard break. The 400 px cap breaks when the hidden cap is more than
400 px from the badge (170 px at 1x scale, i.e. 17 R1 at 1x, 7 R1 at zoom).

**A16** ports/s7trace/hallway.mjs:188,258 (bpOnLeg lat = 5.0), :204 (otherTeeRibbon lat <= 4) | lateral tolerance of a
BasketPoint on a leg, of another tee's ribbon | px | W fraction | Miss = leg heading error x run length, so x2.33 at zoom
(2 px at 1x, 5 px at zoom for a 0.2 deg error over 800 px). Possible, unconfirmed.

**A17** ports/s7trace/hallway.mjs:422,442,458 | pad-line test: along < 450 px, lateral <= 3.5 px, axis <= 3 deg; :437 centre
<= 2.5 px | tee pad on a badge's ribbon line | px (map distance) | pad lengths (450 px = 25 L at 1x, 12 L at zoom;
associate.mjs already uses 12 L) | Fails above 450 px tee-to-badge, i.e. a further 1.3x beyond the E19 zoom (zoom max is 335
px). Lateral 3.5 px is a pad-centre error (GLOBAL-ish) plus heading over distance.

**A18** ports/s7trace/hallway.mjs:308 (refineVertices axisSpanPx default 60) | bend slide on the pad axis | px | R1 | Only the
legacy lanes use the default (hallway.mjs:511, s3first.mjs:57, endpoints.mjs:155); routeMatch overrides it with 6 px (A5).
60 px = 2.5 R1 at 1x, 1.1 R1 at zoom.

### Cross-stage

**A19** contracts/s7.trace@1.mjs:46 | tolerances ribbonPx = 4, endpointPx = 4 | lane-agreement: two traces within 4 px
(Hausdorff) with endpoints within 4 px | px of ribbon geometry | W (ribbon) for ribbonPx; endpoints are sprite-fit so 4 px is
GLOBAL-ok | Not predicted to break (lanes share code), but a 4 px ribbon identity is 0.11 W at 1x and 0.08 W at zoom.

**A20** ports/late/behavior/index.mjs:121,151,163 (topPerpLimitPx = 16; validated 0..50 px at :183), :81 (spacingPx 3,
endpointExclusionPx 12) | S6 basket-template top allowed off the tee ray; ray sampling and endpoint exclusion | px |
angle for the top test (lateral over a tee-to-basket run); basket-sprite/pad length for exclusion | Lateral allowance
should grow x2.33 with run length. 16 px is 1.0 L at 1x (pad 17.96) and 0.43 L at zoom. Possible; no E19 evidence.
Late lane, "late S4-S6" behaviour set.

**A21** ports/late/broadRecovery.mjs:80, ports/late/singletonGateway.mjs:140,142, ports/late/singletonNativeAdapter.mjs:32,53 |
tee dedupe distance = 14 px | two tee proposals closer than this are the same tee | px (sprite scale) | pad length (14 px = 0.78 L on
Lenard full, 0.38 L at zoom, 0.87 L on heritage L = 16) | Breaks at zoom-OUT (R1 < ~20): two real tees closer than 14 px
merge. Zoom-in is safe.

**A22** ports/s4recover/teeRecover.mjs:79,91 | minVisibleFramePx = 6, peekMinFramePx = 3 | frame-white px floor to accept a pad / pin a
hidden pad | px count (pad perimeter scales x2.04) | fraction of template frame px (minVisibleFrameFrac = 0.1 already
exists next to it) | Easier at zoom; only a zoom-out floor.

**A23** ports/s6straight/pathLoss.mjs:95 and ports/s7trace/hallway.mjs:370 | stop < 25: minimum tee-cap-to-badge px for a
hallway-learn segment | px | W or pad length | Zoom-safe (shortest zoom segment 110 px). Zoom-out: 25 px = 0.7 W at 1x.

**A24** ports/s1 invariants: fg/s1/fg.s1.badgeInvariants.observe.fg.mjs:36 | badge frame part bbox width >= 40 px | observe-only
invariant | px (sprite length; badges scale x2.04) | sprite length of the image (R1-predicted) | Unverified: at R1 21
(heritage) the badge sprite is smaller than at R1 24 by ~12%; if the frame is < 40 px wide there the invariant misreports.
I did not measure the badge frame width.

**A25** ports/s6straight/pathSpace.mjs:46 | edgeMinOk.count = 8 (station floor for an edge) | count | fraction (ofStations 0.2
already beside it) | Zoom-safe.

**A26** ports/s3assoc/associate.mjs:53-58 | `t = L/2 + 4 .. L/2 + 4 + 2L`, `na > 20`, `decisive >= 8` | ahead/behind
sense test window | px floor `+4` and count 20 | pad length | Mixed: window is L-relative (LOCAL-ok), the `+4` and 20 are
absolute but small. Zoom-safe.

---------------------------------------------------------------------------------------------------------------------

## GLOBAL-ok (already scale-free: screen px, sprite constants, ratios of the rings)

| file:line | name = value | measures | unit |
|---|---|---|---|
| fg/scene/invariants.mjs:22-25 | basketSprite 46x72, padEndStroke 3.53-3.62, padSideStroke 3.01-3.05, c1sStroke 2.75-3.5 | sprite and stroke sizes | screen px (GLOBAL) |
| fg/scene/invariants.mjs:29 | RING_RATIO = 2 | C2 = 2 x C1 | ratio of two rings |
| fg/scene/invariants.mjs:41 | PAD_MODEL [3.532, 0.5971], [2.985, 0.3994] | pad L, W vs R1 | screen-px intercept + R1 slope |
| fg/alpha/alphaSpace.mjs:37-44 | c1StrokeFwhmPx 5, c2StrokeFwhmPx 9, aaBandPx 1.5, ribbonAaBandPx 2.5, spriteAaFringePx 2, depthPx 4, binArcPx 6 | stroke influence, AA bands, sample depth/bin | screen px |
| ports/s4recover/teeRecover.mjs:67,68,83,93 | zoneMarginPx 0.75, outsideRingPx 2, basketFringePx 2, boundaryTolPx 0.5 | AA margins | screen px |
| ports/s7trace/hallway.mjs:141-149 | ring stroke mask 3.5 px at R1, 4.5 px at 2 R1 | ring stroke width | screen px |
| ports/s7route/routeSpace.mjs:68 and hallway.mjs:279,317 | contrastBandPx / polyScore band [0.5, 3.0] | inside/outside edge band | screen px (edge blur) |
| ports/s6straight/pathSpace.mjs:48 | bandPx [1, 3], alongPx 2 | station contrast bands | screen px |
| ports/early/s3FamilyFix.mjs:59 | marginMin 2, marginMax 7, marginSpreadMax 3 | pad frame stroke margins | screen px |
| fg/s2/fg.s2.basketInvariants.observe.fg.mjs:30 | DUPLICATE_WITHIN_PX 10 | two BasketPoints are one | basket sprite (GLOBAL) |
| ports/s3assoc/associate.mjs:16 | BASKET_POINT_OFFSET [0.34, 0.73] | sprite tip to BasketPoint | screen px |
| ports/s3assoc/associate.mjs:18 | sigma0Px 0.85 | badge + pad centre error | screen px (sprite fit) |
| ports/early/s1BadgeAssembly.mjs:56; fg/s1 invariants:60 | anchorFlagThresholdPx 2, plateOffset <= 1 | centroid agreement | sub-pixel fit |
| contracts/*: tee.pose, basket.pose, s4.resolution, s5.pair, s6.row; fg/delta/contracts.mjs:19 | centerPx 2, sizePx 2, topPx 2 | lane agreement of sprite fits | sub-pixel fit noise; sizePx 2 is 11% of pad L at 1x |
| ports/s4recover/teeRecover.mjs:70-74, 89 | whiteChromaMax 16, interiorNeutralMax 6, tint*, hallwayMinStepLum 12 | colour spreads, lum steps | lum / channel units |
| ports/s6straight/pathSpace.mjs:49; routeSpace.mjs:59,71 | tauLum 8, stepLum 8, onAxisPriorLum 15 | edge contrast | lum |
| ports/s7route/routeSpace.mjs:63 | stationStepPx 1.0 | sampling | px grid |

## LOCAL-ok (measured per image or already in W / R1 / pad lengths of that image)

| file:line | name = value | measures | unit |
|---|---|---|---|
| ports/early/s3FamilyFix.mjs:69,73,74 | bandFillRelMin/Max 0.75 / 1.3, sizeExpansion 1.1, coverageFactor 0.85 | band fill and size bounds | relative to the image's own medians/anchors (the fix for the old absolute 0.65-1.05) |
| ports/s4recover/teeRecover.mjs:78,86,87,342 | searchRadiusFactor 1.25, hiddenDistMargin 0.1, 8 x tpl.lengthPx | tee-badge search, hidden-tee range | this course's S3 range / pad length |
| ports/s3assoc/associate.mjs:23,24 | badgeMin/MaxDistPadLengths 0.6 / 12 | badge distance | pad lengths (drifts 1.14x = 2.33/2.04 between zoom and 1x) |
| ports/s7route/routeSpace.mjs:61,62,64,72 | firstLegSkipW .75, jointSkipW .5, bendFromBadgeW .5, onAxisLateralW .5 | ribbon-local skips, on-axis band | W |
| ports/s7route/bends.mjs:28-40 | windowW 1, stepW .125, minWindowW .5, edgeTolW .15, edgeLatW .45, c2R1 2.0, badgeExclusionW .5, sigmaW 1/16, clipW .25 | centre-sample window, tolerances, C2 disc exclusion | W or R1 (ribbon-local quantities) |
| ports/s7route/bends.mjs:35-38 | maxBends 3, minRunSamples 3, minSamples 4, passes 2 | counts | samples |
| ports/s7route/match.mjs:25-27 | tau .75, minStations, noReadingLum -99 | sensor threshold | fraction / lum |
| ports/s7trace/traceSpace.mjs:127,129 | simplify(W/4), end within W/2 | trace tolerance | W |
| ports/s7trace/hallway.mjs:23, ports/s6straight/holeStraight.mjs:132 | FRONT 10.6/25.02, trim0OfWidth .6 | cap ahead of pad centre | pad lengths / W |
| fg/alpha/alphaSpace.mjs:236,257 | rMax = min(W,H)/3, r >= 12 | R1 search | fraction of image + R1 floor |
| fg/scene/invariants.mjs:47-50 | REGIMES r1Px [0,27] / [36,inf], hallwayOverR1 1.46-1.494 / 0.928-0.943 | two measured regimes | R1 (px) and ratio, regime-conditioned |
| fg/alpha/alphaProfile.calc.mjs:41 | RENDER_WINDOW_PX 270 | render window | layout (excluded) |
| ports/s7trace/judgeBends.mjs:45 | bend match radius = corridor W / 2 | judge bend rule | W |

---------------------------------------------------------------------------------------------------------------------

## Testimony rules (judge tolerances, listed separately; not classified)

| file:line | name = value | note |
|---|---|---|
| ports/judge/judge.mjs:24 | MATCH_PX { basket 12, tee 8 } | the one rule per kind (source of truth) |
| ports/s4recover/teeRecover.mjs:54 | hitRadiusPx 8 | tee |
| ports/s5pair/pairBadge.mjs:26; ports/s6straight/holeStraight.mjs:31 | matchPx 8; teeMatchPx 8 | tee |
| ports/s6straight/holeStraight.mjs:32; ports/s7trace/traceSpace.mjs:36,37 | basketMatchPx 12; teeMatchPx 8 | basket |
| ports/s7route/routeSpace.mjs:70 | samMatchPx 12 | basket (also hallway.mjs:527, judgeBends.mjs:31 default 12) |
| ports/state/inspect.mjs:110 | matchWithinPx 8 | display |
| ports/ablation/testimony.mjs:31 | JUDGE { teePadPx 4, teeRadiusPx 16 } | NOT the one tee rule: 16 px against 8 px elsewhere |
| fg/s3/teeFamily.mjs:53 | judgePadPx 2 | padded bbox test |

E19 reading for these: Sam's hand marks were drawn on the 1x image and registered into each zoom (regResidual 0.26-0.37
view px), so a mark's own error is x2.33 in view px. Basket-off median was 2.3-3.4 view px with max 8.4 (lenard4) and 8.3
(lenard5) against the 12 px rule, i.e. the 12 px rule is 5.1 px at 1x and the margin shrinks by 2.33x. W/2 (bend and corridor rule) scales
x1.45. Two views mis-assign a basket to a neighbouring hole (lenard3: hole 9 -> hole 6's basket).

## Excluded
Render/layout sizes (cropPx 64, 120, 270, inspect.mjs CROP, flipbook, attention packet pad/maxSide), test fixtures, and
source/provider/* (S1/S2/autostitch detectors are outside the scoped paths). Stages JSON and recipes contain no length
constants beyond prose counts (e.g. s2.json "BasketPoints within 10 px", "46 x 72 px", which mirror GLOBAL-ok entries).
