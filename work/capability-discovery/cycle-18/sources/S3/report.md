# Lab18 E4803 — changed Claude route-source nonduplication scout

Outcome: **mixed_change**. Physical admission: **HOLD**. The exact advanced source adds a matching/refinement policy over the previously inspected route-scoring surfaces, and changes the ribbon-contrast implementation. Existing scoring, width, straight and bend operations should not be reinvented. This is a read-only source finding, not adoption, execution, numerical equivalence, physical validation or a speed claim.

## Exact custody

Remote: `samuelpmahan/chainspot-toolkit`, commit `c67c2c232814048c5b0b074aff8b7e0f4651da93`, tree `a74f48220e4377a61e224171085a6cf9b8f7c97b`, parent `186b66aee6d67d8080da487e22453997cc8763a6`. Connected comparison confirms ahead5/behind0 from prior `cc1fa5c9c4191e11d1d70d021161da3bac2af492`, which is the merge base. This establishes changed source, not inactivity elsewhere. Selected content pins and canonical URLs are in `sourcepins.json`.

Local repository was clean before and after, HEAD `3fcc644a5e8db8ba23380921df3da92c9989d285`. Read cycle17 CURRENT and its S3 source report/metadata. Writes are confined to this assigned S3 evidence directory, outside the repository. No branch, Git integration, source adoption, HH or account mutation.

Only the selected current `match.mjs`, `routeSpace.mjs`, `match.test.mjs` bodies and prior `routeSpace.mjs` body were deliberately fetched. Current directory metadata and Git commit identity were also read. An initial generic compare GET unexpectedly returned a very large source/serialized-fixture diff; it was not retained as an artifact or used as numerical evidence. Later comparison used the compact stats-only connector. This incidental overbroad response is disclosed, not recast as bounded evidence or execution.

No producer, geometry, fitting, query, algorithm, test, renderer or numeric replay ran. No module was imported. No original pixels, real44, E4012 metadata/RGBA, consumed E2021, old160 or Lab10 work was opened or executed.

## Existing operations and switches — reuse boundaries

All line references below are at the exact current commit; they are descriptive source evidence only.

| Concern | Existing implementation | Actual switch / limit |
|---|---|---|
| Centerline/path hypotheses | `routeSpace.mjs`205–216 starts from tee center plus signed tee axis times FRONT and pad length; 230–260 searches straight/one-bend paths to BasketPoints, with bend on that tee axis past badge | Contrast candidates every6px, sensor candidates every8px, from0.5W past badge up to800px; no independently observed physical centerline or heading control |
| Width | `routeHallwayOf`, 219–225 delegates to existing `teeBadgeLearn`, returning median LOCAL pixel width from usable tee-to-badge segments | Recorded rule: free18..59px width search, usable center within3px; no calibrated physical width or public width-search toggle here |
| Assignment | `routeMatchOf`, `match.mjs`94–105, uses global rectangular Hungarian assignment from `assignMinCost`29–53 | Score = raw contrast plus existing onAxisPrior; missing contrast becomes finite−99, not forbidden; nearest on-axis basket prior15 is already supplied by `onAxisOf`305–310. Do not implement a second matcher or fold the prior into raw contrast |
| Straight preference | `match.mjs`106–110 overrides refined contrast route with straight whenever sensor passes | Hardcoded MATCH tau0.75 and at least20 visible stations; no separate straight Boolean in the selected matching API |
| One-bend refinement | `match.mjs`105 calls existing imported `refineVertices` on every assigned three-vertex route | Two iterations, tee-axis direction; header explicitly documents deliberate divergence from prototype's unrefined prior-reassigned case. Imported refinement implementation was not audited here |
| Second bend | `secondBend`, `match.mjs`58–87; dispatcher113–115 | Actual option is `secondBends=true` by default; false skips this search only. Call-site comment singular `secondBend:false` is not the actual option name. Gate: one-bend reading<.75, two-bend reading>=.75, gain>=.15, >=20 stations. Fixed grid/top8/local refinement constants are MATCH.secondBend, line25 |
| Bend penalty | Contrast search `routeSpace.mjs`241–249 retains straight on ties and replaces it only on strict contrast improvement; matching applies sensor gates | No explicit additive bend-count or curvature penalty/switch in these selected bodies. Straight preference and second-bend admission are existing policy, not a newly missing penalty implementation |
| AA / edge sampling | `ribbonContrastAt`132–200 uses integer pixel loops and distance bands0.5..3px around a round-join ribbon; mask<.01, end caps excluded, >=30 visible px per band. `routeSensorAt`94–122 reuses `stationContrastAt` | `ribbonContrastAt` exposes an optional band argument; no explicit AA/supersampling/AA-on-off switch exists in the selected files. Imported station sampler may have its own behavior, not inspected here. This is not evidence of AA correctness or absence across repository |
| Existing query surfaces | `ROUTE_QUERIES`, `routeSpace.mjs`390–404: `fn.q.route.sensor` and `.contrast`; store routeTableOn358–376 | Scene or raster/mask plus verts and W; missing context/width/route yields condition. Reuse these if later admitted; do not add another sensor loop |

Scoring still separates raw contrast, raw sensor, per-hole rows, and joined table (routeSpace263–334). Sam basket match is judging-only nearest point within12px (289–298), not a scoring truth source. Both measures consume the same scene, mask, width and route; two agreeing values do not become independent physical observations. Query fallback381–382 creates an all-unmasked plane when a raster is supplied without mask, so future authority must bind actual mask/context explicitly.

## What changed since prior pin

Compact comparison marks `match.mjs` and `match.test.mjs` added. The former adds assignment then refinement/straight/second-bend policy on the already-existing scoring table. It does not justify regenerating the scoring machinery. Prior routeSpace already held starts, width, sensor, ribbon contrast, row/table/query contracts and on-axis prior.

The old and new routeSpace texts have a common prefix of10594 characters and suffix of16073 characters. The intervening implementation changes in ribbonContrastAt introduce flattened segment arrays, squared-distance prefilters/nearest-leg selection, then retain Math.hypot for candidate near ties and final distance-band decisions. Constants, query contracts and downstream route-table section remain textually unchanged. Source comments claim unchanged counted pixels/sums; this scout neither proves nor disproves that claim. Floating-point tie selection and prefilter-boundary behavior are a source-backed review target only, not an observed defect. No performance measurement or equivalence rerun is admitted.

## Tests are source, not results

`match.test.mjs`24–40 specifies300 deterministic small random rectangular matrices versus brute-force assignment, forbidden cells, uniqueness and empty cases. Lines43–97 construct a flat synthetic320x310 scene with three24px ribbons and manufactured tees/headings/baskets: straight, one bend, two bends; a faded final leg rejects the second bend, and false disables it. These are useful bounded software contract tests already present; no new toy test is needed for the scout. They were not run and provide no independent real-course frame/control/heading/exposure authority. The selected test source is not a physical acceptance suite and no passing count is claimed.

## Source-backed risks and next authority

- A complete one-to-one assignment can still be unsupported: missing contrast is finite−99 plus prior and therefore eligible. MarginLum is a row-score comparison, not calibrated confidence or a global alternative-assignment gap (`match.mjs`97–119). Do not call an assignment physical correctness.
- Width, tee axis and route candidates remain coupled to existing S3/S4 scene inputs. Straight sensor support samples visible stations, skips ends/joints, and reports passing/visible; it does not establish continuity through excluded/masked spans or route ownership at crossings.
- One-bend contrast route is retained if straight fails even when its own sensor is weak; only the optional second-bend upgrade is sensor-gated. A rejected upgrade is not rejection of the entire assigned route (`match.mjs`110–115).
- The new synthetic tests do not settle real-route generalization, AA, independent left/right edges, calibrated width, causality, confidence or absolute physical centerline claims. An added policy is not independent evidence.

Next-ready work is metadata-only owner review: immutable original-to-canonical frame/crop binding, independently owned positive/negative/crossing/short-visible controls, independently fixed heading arms, exposure ledger, uncertainty and accepted protocol. Until those are independently supplied and admitted, original pixels/real44 and all algorithm/query/test/render execution remain HOLD. Existing accepted evidence may be reused unchanged; no replay is warranted merely because source advanced.
