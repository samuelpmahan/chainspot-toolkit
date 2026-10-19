# E4804 / S4 — independent source-only corridor-judge critique

Outcome: **mixed_change**. The fresh pinned source adds substantive old-schema corridor normalization and route judging while preserving unknown bend identity. Reuse the existing semantic distinction and judge surface for future authorized work; do not adopt code or promote physical claims from this source read. Physical pixels and real44 remain **HOLD**.

## Custody and exact pins

Remote repository: `samuelpmahan/chainspot-toolkit`; requested FreshClaude exact commit `c67c2c232814048c5b0b074aff8b7e0f4651da93`. The four selected files and supporting judge implementation were read through the connected GitHub fetch interface discovered from ALL_TOOLS. All source links below bind that commit, not a moving branch.

| Path | Git blob SHA | Relevant lines |
|---|---|---|
| ports/s7trace/judgeBends.mjs | 7bd7f8ee7310f5e41b0912e2bd12ba3ed3093fe0 | 18–24, 31–63 |
| ports/s7trace/holePaths.mjs | 3243fe8ef756091d8d0910791bdd79a0d4de01d0 | 14–22 |
| ports/s7trace/traceSpace.mjs | 0b65a793b80bcc1dd898f2438bdb562cb0908fec | 31–40, 61–81, 119–134, 186–204 |
| ports/judge/testimony.mjs | 777f345eeb9fa52567cc794331adb61e543cdd6a | 12, 20–27, 30–51 |
| ports/s7trace/hallway.mjs | f9370121784a74aecb3a6097aff352e272398b58 | 516–538 |

Canonical URL pattern: `https://github.com/samuelpmahan/chainspot-toolkit/blob/c67c2c232814048c5b0b074aff8b7e0f4651da93/PATH`.

Direct comparison read: `ports/s7trace/judgeBends.mjs` at prior Lab17 scout commit `cc1fa5c9c4191e11d1d70d021161da3bac2af492`, blob `ff023ae5a1dfd4a7331d2067e7ff5aa9a714c081`. That version skipped all missing-bend rows. The fresh version adds the old-schema centreline branch at lines35–43. This is a source change, not proof of runtime improvement.

Local repository read-only HEAD was `3fcc644a5e8db8ba23380921df3da92c9989d285`; initial and later status checks were clean. Local Lab17 CURRENT/scout text was consulted only to avoid repeating its completed qualifier fix. No project source changed. An initial request using repository name `samuelpmahan/FreshClaude` returned404; the locally observed origin resolved the correct repository. That is a source-location miss, not product/test failure.

## Exact claim that the implementation supports

`judgeHoleTraces` joins trace and testimony by string-valued hole number. A nonempty path with status `reached` is required; absent/not-reached paths are judged disagreement when usable testimony exists. The underlying `judgeTrace` then checks:

1. Euclidean endpoint-coordinate distance to Sam's basket is strictly less than `basketMatchPx` (default12).
2. For finitely sampled points on each supplied output segment, the largest distance to the nearest segment of Sam's reference polyline is at most course-local `widthPx/2`.

The reported result is testimony agreement, never Sam's acceptance (`traceSpace`39). It is not a newly observed numerical success, calibrated physical corridor, or physical identity proof. Source comments saying centreline “never leaves” should be read with the actual finite directed sampling qualifier below.

## Important distinctions and limitations

| Surface | What is actually checked | What remains unestablished |
|---|---|---|
| Endpoint | `t.end.point` versus testimony basket coordinate | Named BasketPoint identity, unique basket association, semantic hole identity and independent physical basket truth. The judge does not inspect `t.end.basket` or require equality to a separately verified named basket. |
| Corridor | Output-to-reference directed nearest-segment distances at samples (`hallway`528–534) | Symmetric coverage, traversal order, complete tee-to-basket coverage, continuity/ownership of the physical ribbon, physical left/right edge identity, and a literal continuous maximum. Sampling includes segment ends but is not an analytic continuous bound. |
| Tee | Tee appears in the reference polyline | No separate output-start/tee-distance acceptance gate is applied here, despite the exported slot containing `teeMatchPx:8`. |
| Width | Course `widthPx/2` gates corridor deviation | Per-hole testimony width does not gate route agreement: it supplies bend-hit radius only (`judgeBends`45). Old-schema median paired-edge width is loaded but likewise not substituted for course W in `judgeTrace`. No physical width calibration follows. |
| Bends | Greedy closest-distance-first one-to-one matching inside radius; tie order is deterministic | Bend agreement is reported and never gates `ok`. Greedy matching is not claimed to optimize global cardinality/cost. Missing/extra bends do not by themselves negate corridor `ok`. |
| Trace adapter | `tracesOf` labels reached from non-null endpoint index and emits path endpoint; pinned adapter simplifies at W/4, selects nearest basket within W/2 and snaps endpoint | Native hit identity and the judge's12px testimony-coordinate agreement are different operations. Simplified/snapped geometry is not an independent observation of the original walked path. |

Source-derived contract probes, **not run and not observed product failures**: a one-vertex path bypasses the segment loop and leaves deviation zero; the API does not itself enforce at least two vertices, tee start, endpoint/path consistency or nondegenerate progress. Thus callers' structural guarantees matter. A future separately authorized test could verify explicit rejection/qualification of malformed reached records, but this scout supplies no execution authorization.

There is also a source-level rounding seam: `judgeTrace.ok` uses raw endpoint distance, but wrapper `reachedBasket` compares the returned one-decimal rounded distance. Hypothetical raw11.96px would satisfy raw `<12` while rounded12.0 fails wrapper `<12`. This analytical example is not an executed measurement. It is active-owner-only review material: no new test, recomputation or patch is admitted here. Near-threshold explanatory text/totals must not silently be treated as exact raw predicates.

## Fresh old-schema operation and bendsJudged qualifier

`testimony.corridorOf` independently reverses each edge if its first point is closer to the basket, then pairs points by index up to the shorter edge, computes midpoint samples/paired widths, and reports unpaired-count metadata. It does not establish independently validated point correspondence or literal left/right physical ownership. `loadHolePaths` retains the centreline and median width but does not forward `pairedPoints` or `unpaired` metadata; downstream use should not infer complete pairing from its reduced shape.

The fresh `judgeBends` branch uses that centreline as a route reference, emits `judged:true` and route `ok`, but explicitly retains `bendsSam:null` and `bendsJudged:false` for both reached and missing traces. These midpoint samples are not asserted to be bend testimony. Missing both bends and centre remains unjudged. Empty explicit bend array is valid straight-hole testimony, not the same as missing bends.

The file's leading comment still says holes without old-schema bend testimony are unjudged; that is stale relative to the new centreline branch. Consumers must follow the explicit row qualifier rather than flatten this into “all bends judged.”

Totals include old-schema rows in route `judged/agree/reachedBasket`, while sums use missing/null bend counts as zero. Therefore a larger route-judged denominator is changed coverage, not higher bend success, and unknown bends cannot be interpreted as zero bends/no missed bends. New-schema rows do not explicitly emit `bendsJudged:true`; preserve schema-aware interpretation instead of assuming absent false means physical authority. No numerical aggregate or win rate was calculated in this task.

## Unknowns and disposition

The selected sources do not verify independently bound original-to-canonical frame receipts; loader uses fixed per-specimen y offsets and latest lexicographic corrected annotation. They do not verify control-owner custody, blindness/exposure policy, independently frozen literal heading arms or an unexposed held-out control set. `holesView` uses S3 association headings or recovered fitted pad axes signed toward badges, not independent heading controls. These are explicit missing prerequisites, not a claim that annotations are false.

No adoption, algorithm invocation, active tests, query/geometry computation, renderer, CV, original pixel access, E4012 metadata, consumed E2021 material, real44, HH, publication, account change or spend occurred. No gain, physical correctness, generalization, numerical success inflation, acceptance or new physical observable is claimed. Lab17's completed display-qualifier correction was not repeated.

Recommendation: preserve the existing agreement-only/unknown-bend semantics; if future work is authorized, first bind frames, independent owners, literal heading controls and exposure policy, then use this existing judge rather than a duplicate. Review threshold rounding, structural input validity and lost pairing metadata as bounded source-derived candidate seams, each requiring separate authorization before execution or mutation.
