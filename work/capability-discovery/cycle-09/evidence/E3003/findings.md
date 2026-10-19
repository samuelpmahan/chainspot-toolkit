# E3003 — freeze: window-fit midpoint turns versus nominal straight geometry

Worker S2; epoch0. **READY_FOR_INDEPENDENT_REVIEW; NOT EXECUTED.** mixed_change means proposal ready, not measured success. No score, producer, source import, test, image/pixel read, Git mutation or source change. Only findings.md and result.json were written.

## Fixed actual data and the new question

Use `discovery-cycle04/P3/E809/receipt.json`, 828263 bytes, SHA256 `302e50cb5b60f752eb6f3139a4e6a98c015005203359e0ade5aebb378e1897ba`. It is an actual retained Lenard-1 execution receipt, not fabricated receipt-shaped data. E809 result reports one adapter invocation, two source/crop compositions, 366 operations and 108 candidate rows. It already falsifies finite-pair specificity at width42 and universal same-edge +6 interpretation. Those findings are not rerun or relabeled as new.

New question: **does treating short-window averaged pair midpoints as path vertices manufacture sharp turns on nominally straight geometry?** E809 analysis/result/render source contain no midpoint-polyline turning descriptor. This applies existing geometry operations to retained coordinates; no 90px/170px case, native-analysis, synthetic grid, width-bank producer or original160 repeat.

Literal selectors: `receipt.composition` is crop frame `Lenard-1.E802.fixed-roi-source-pixel-centers`; `receipt.sourceComposition` is original frame `Lenard-1.original-source-pixel-centers`. Keep both; neither is an independent scientific case. In each branch use all three groups `proposed-ribbon`, `lateral-plus6`, `bright-organic`, with exact ordered IDs `<group>.short1` through `<group>.short5`. Long rows remain retained raw context, never additional vertices. Use exactly widths42 and50, selected by `candidate.widthArgPx === width`, with no reselection/expansion.

42 is E809's historical preregistered comparison anchor, not a learned width. 50 is `branch.rawWidthEstimate.widthPx`, the Dev72 training learner's raw diagnostic selection from34/42/50 at a different stage. It is not a calibrated local width, successful edge association, or authority to call42 wrong. Both are fixed denominators for separate rows; do not pool them or compare their normalized lengths as geometry-independent evidence.

## Baseline, candidate and exact arithmetic

For station pose `(x,y,h)`, baseline vertex is `(x,y)`. For a candidate passing the unchanged composition finite-pair gate, candidate vertex is `(x - sin(h)*cPx, y + cos(h)*cPx)`. Here `cPx = candidate.edgeFit.cPx`, equivalently retained `midpoint.fitMidpointNormalOffsetPx`. This is the existing normal-coordinate projection of the longitudinally averaged fit midpoint, in that branch's named pixel frame. It supplies no edge tracking or physical centerline assertion. Reconstruct left/right similarly from lPx/rPx only for retained diagnostic SVG/JSON, never to infer association.

Finite-pair gate: edgeFit exists; lPx/rPx/cPx/wPx/score/gl/gr all finite; wPx>0; gl>0; gr>0; midpoint.status is OBSERVED_CHANNELS. Missing/null/nonfinite/nonpositive evidence is UNKNOWN, never `(0,0)` or offset0. Preserve the exact raw candidate and reason.

Split the five ordered candidate vertices at every UNKNOWN. A run needs **at least two consecutive observed vertices** for describePath; an isolated observed vertex is retained but has no segment/turn descriptor. Three consecutive vertices are needed for an interior turn. Never bridge a missing station, close a gap, interpolate, smooth, merge collinear vertices, track/recenter, or discard a troublesome group. A full-five candidate assertion is UNKNOWN unless all five vertices are observed; partial-run measurements remain explicitly partial. Duplicate consecutive projected vertices must retain the describePath rejection as an explicit error, not be silently deduplicated.

Reuse `describePath` and `countTurns` from `chainspot-discovery-lab/experiments/capability-discovery/probes/path-geometry/path-geometry.mjs` (SHA256 `ba89598ffc830cb2da862b96abefdd16305e244b4737315be65b189b8f982b34`). For each baseline and candidate run supply its literal branch frame and scalar fullWidthPx42 or50 with provenance naming this hypothesis. Retain full descriptors: every segment length/tangent/normalized length and every signed/absolute turn, not only a count. Supply countTurns definition `E3003 exploratory |vertex turn| > pi/4; chosen after E809 exposure` and predicate `turn.absoluteRadians > Math.PI/4`. No epsilon, learned cutoff, accepted bend prior, exponential score or physical-bend interpretation. The sharp threshold is deliberately exploratory and was chosen after exposure.

## Frozen prediction and falsifiers

Prediction P1: for proposed-ribbon at42, the complete fitted-midpoint polyline will contain at least one turn strictly above pi/4, while the nominal five-origin baseline contains zero. The previously exposed42 midpoint sequence motivates this prediction; this is a new computation on exposed data, not a blind forecast. Falsify if either complete row cannot be formed, nominal sharp count is nonzero, or candidate sharp count is zero. Do not change the threshold after seeing it.

Prediction P2, a diagnostic challenge: the learner-selected50 row may fail to reproduce P1 through different fits or missing evidence. Report its complete/partial status and full turns even if it agrees; it is not an independent replication. All lateral-plus6/bright-organic rows and both frames are mandatory adverse controls, not accepted classifier labels. An equal or sharper bright control defeats any specificity interpretation. A disagreement between widths, frames, or null patterns is informative failure, not permission to choose a winner.

Compare corresponding source/crop lengths, normalized lengths and raw turn values at the already used absolute1e-9 diagnostic tolerance, retaining exact residuals. Do not use that numerical tolerance as physical uncertainty or relax it. The integer translation is cropToOriginal(+400,+1010), already in receipt provenance. Its consistency supports bounded arithmetic only. Physical same-edge identity, per-point continuity, semantic path identity, calibrated width and endpoint ownership remain UNKNOWN under every possible result.

## Execution contract and cost

One receipt-only Node process; hash source/data before dynamic import; import only Node builtins and exact geometry module. No helper execution, producer, vendor/project import, image decoding, pixel reread, tests, rerun or new dataset. Existing seven passing descriptor-test logs establish operation history. The coordinate/SVG adapter needs separate review.

Command proposal after separate script/source freeze:

`node discovery-cycle09/<execution-job>/midpoint-turns.mjs --receipt discovery-cycle04/P3/E809/receipt.json --out discovery-cycle09/<execution-job>/measurement.json --svg discovery-cycle09/<execution-job>/trace.svg`

The runner must implement only the literal selectors/arithmetic above. Output contract: bound exact source/data hashes; all12 branch/group/width rows; all60 raw station/candidate observations and baseline vertices; observed midpoint/left/right vertices or UNKNOWN; ordered observed-run/isolated IDs; full baseline/run descriptors plus full raw turns, sharp counts, complete-five status/errors; long-row raw context; source/crop residuals; P1 evaluation and adverse cases; no ranking/acceptance. TraceSVG uses only retained coordinates, distinct origin/midpoint/edge marks, separate rows or panels for all12 combinations, explicit missing markers and no connecting line across UNKNOWN. It may be emitted as a standalone vector artifact without a background image. No pixel reread.

Bounded work: one828263-byte JSON parse;60 candidate selections (2branches*3groups*2widths*5stations),60 baseline vertices and at most60 midpoint vertices;12 baseline descriptions plus at most24 candidate descriptions (up to two2+-vertex runs per five stations), at most36 candidate interior turns. No empirical timing/memory claim. Source/data hashes and old execution evidence are distinct from this proposed descriptor computation; execution count remains0.
