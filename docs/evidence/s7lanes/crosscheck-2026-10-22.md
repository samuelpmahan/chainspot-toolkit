# S7 lanes: the four- / three-lane tracker as a cross-check on the S7 default (2026-10-22)

Sam (2026-10-21): "I had success before by making it have 3 or 4 Lanes connected traversing the hall. The outer 2 are
meant to stay 50% in the hall 50% out, the inner 1-2 always in." Ported as a differing perspective on the S7 default
(`routeMatchKBendsSeq3SearchW`), recorded beside it and never a gate: the S7 default's output is unchanged.

## What was ported

- `ports/s7route/laneSpace.mjs`: the provider's `st.fourLaneSensor.ts` (observeFourLaneCrossSection,
  sampleFourLaneBand) and the Dash's Track probe's tracker and three-lane reduction (ChainSpot 32ea57c,
  `tests/unit/laneTrackerDashsProbe.test.ts`) as store queries: `fn.q.route.fourLane`, `fn.q.route.threeLane`,
  `fn.q.route.laneStep` (one call per tracker step, profiled), `fn.q.route.laneTrack` (one hole). Calculations:
  `tk.s7.laneTracksFour`, `tk.s7.laneTracksThree`, `tk.s7.laneCrosscheck` (renders: `fg/s7route/laneRender.mjs`).
- Runner `ports/s7route/laneRun.mjs` (one course), evaluation `ports/s7route/laneEval.mjs` (judging, outside the store).
- Scene: `tk.s7.sceneS4` (the scene the S7 sensors read: lum = mean RGB; mask = owned px of badges, baskets and tee pads,
  dilated, the C1 / C2 ring strokes, the S4 recovered baskets). A masked sample is UNKNOWN, never evidence. W =
  `tk.s7.routeHallway` (the S7 default's W). Starts: `tk.s7.routeStart` (tee cap S, tee axis u).

Golden is Dash's Track, so every probe px knob converts at golden's measured W = 41.58 px, R1 = 44.5 px:

| probe knob (px on Dash's Track) | here | law |
|---|---|---|
| rails +-W/2, inner +-W/6, guards +-2W/3, inner sub-samples +-W/9 | in W | ribbon (W measured per image) |
| tangentHalfPx 4 | 0.096 W | ribbon (window of the measurement) |
| stepPx 6 | 0.144 W | ribbon (step of the measurement) |
| edgeDeltaPx 2.5 | 2.5 px | screen px, GLOBAL: the anti-aliased edge band the rail straddles |
| liftReference 45 (gray) | 45 lum | lum (the scene's lum is the same mean RGB) |
| headings +-18 deg by 6, lookahead 3, failure 6 steps, min score 0.07 | unchanged | angle / steps / fraction |
| maxUnknownSteps 16 (96 px) | assumption `laneUnknownRunPx` 96 px, x2 widening | screen px: the occluders waited out are screen-fixed sprites (badge plates <= 72 px diagonal, basket sprite 46 x 72 px) |
| maxDistancePx 600 (13.5 R1 on golden) | assumption `laneTrackReachR1` 24 R1, x2 widening to the image diagonal | map distance (Sam's holes <= 15.0 R1, TowneLake 2) |
| start at the badge, straight through its box | start at the tee cap S, straight along u to the badge + half its diagonal + one step | Sam: the tee -> badge segment is straight hallway |
| stop: step within W/2 of a basket tip | stop: step enters a BasketPoint's C1 disc (1 R1) or the basket's sprite box, after the badge transit | C1 = 10 m by definition; the sprite (screen-fixed) reaches past C1 on zoomed-out views, and the tracker steered around it as UNKNOWN (alex 10, golden 4) |

Recorded, never a stop: a basket the tee -> badge transit crosses (`transitCrossed`, C1 or sprite).

Cross-check per hole: same basket? `lateralW` = the max distance from a point of either route to the other (W; the
default's route vs a stopped track only one way). Verdicts: agree (same basket, lateral <= 0.5 W, the S7 judge's
corridor rule), route-differs, basket-differs, no-basket (track stopped short: evidence lost after 6 visible steps below
0.07), no-default.

## Does disagreement flag real errors?

Dev (testimony: golden, lenard, townelake, heritage, alex; 75 holes judged, basket 12 px, within W/2 of Sam's corridor):
the S7 default agrees with Sam on all 75, so every flag on dev is a false alarm and recall cannot be measured there.

| dev, 108 holes on 6 courses | four-lane | three-lane |
|---|---|---|
| agree with the default | 95 | 95 |
| flagged (any verdict but agree), of the 75 judged | 8, all on holes the default has right | 8, all right |
| basket-differs, of the 75 judged | 1 (lenard 5: the tracker is the one off Sam's basket) | 1 (same) |
| tracker at Sam's basket when it reached one | 68/69 | 69/70 |
| time, 6 courses (laneTrack calls) | 268 ms | 159 ms |

Validation (no testimony; labels: the known calls, docs/evidence/validation-s7/, and the cross-view check: a Full / Lazy
view's default route length in R1 within 15 % of the Capture view's; 136 labelled holes, 10 labelled wrong):

| validation, 221 holes on 11 views | four-lane | three-lane |
|---|---|---|
| agree with the default | 151 | 155 |
| any flag: precision / recall | 10 of 42 flagged are wrong; 10 of 10 wrong flagged | 10 of 44; 10 of 10 |
| basket-differs: precision / recall | 3 of 8; 3 of 10 | 3 of 9; 3 of 10 |
| time, 11 views | 710 ms | 464 ms |

The S7 default's own routeMatch on the same stores: 1.0-24.4 s per view; the trackers are 15-140 ms per course.

Named holes:
- seatacFull 16 (default 5 bends to Basket cc, 32.2 R1; the capture reads 368 ft): flagged no-basket by both variants: the
  track stays within 0.75 W of the default's first leg and loses the hallway after 6.96 R1, at the default's first bend.
  It does not confirm the 5-bend route; it does not name another basket either.
- seatacFull 10 and 11 (swapped in old and new): both flagged. 11: basket-differs (track at Basket cx, default Basket cp,
  17.1 W apart) and its tee -> badge transit crosses Basket cp's sprite (badge 11 lies down the tee axis past cp, the track walks 27.7 R1 in all:
  the tee's badge association is the suspect). 10: no-basket, 5.85 W from the default, transit crosses Basket cu (the
  default's basket) before the badge.
- Sam's six (now right): Beaver 4, Coleto 10 and 18 agree; Beaver 19, Coleto 11, SeaTac 19 are no-basket (evidence lost
  after the default's route, 0.66-1.87 W from it). None is basket-differs.

## Correction rule

Not built. The only flag that names an alternative is basket-differs: on dev its one firing is the tracker's error
(lenard 5), and on validation 5 of its 8 firings are on holes the cross-view check calls right (beaverranchFull 21,
beaverranchLazy 10, coletocreekLazy 5 and 10, seatacFull 8). Re-solving with the tracker's basket would regress dev.

## Renders

`node ports/s7route/laneRun.mjs --specimen S --attempt ID --out DIR` writes `tk.s7.laneCrosscheck.course.png` (both
routes, labelled, coloured by verdict, legend) and `tk.s7.laneCrosscheck.hole<N>.png` per flagged hole.
`node ports/s7route/laneEval.mjs --courses FILE --out DIR` runs a list and writes `lane-eval.json`.
