# E4607 frozen proposal — saved pair/scalar consistency

Status: PROTOCOL ONLY. Stop for independent review and root admission before implementation or geometry execution. FIRSTGREEN is expected; no seam defect or runtime RED is claimed.

## Question and boundary

Does the existing `describePath` pairedEdges operation agree with the coordinate/scalar representations already saved in E3012? This is a software representation-consistency audit, not a new observable, fit, detector, ranking rule, physical threshold or scientific validation. Nominal-origin-equals-fitted-midpoint is already contradicted by the saved proposed-ribbon/w42 short1 offset **8.090622377680736 px**. Retain that negative; do not rerun a producer to discover it.

The common-anchor heading renderer is not wrong: `originPx` is explicitly anchor metadata. E4009 is not an input to this audit. No Lenard-1/Lenard-5/IMG_5641 fusion, pixels, image decoding, CV, old producer/planner/token/ranker/inspector replay, installs, HH or Git writes are authorized here.

## Exact frozen closure

Repository `/workspace/scratch/86659bbafcce/chainspot-discovery-lab`, local `f101061bd7547f0c350bc8c0f8ce126215047990`, canonical `c0f1205d3e3f66fc1a89fed5e4c3447e7f9045b2`, tree `403b74db31d121a559609ae6a2a3189fdf8de188`; clean4305 tracked at protocol inspection.

| Role | Repo-relative path | Bytes | SHA256 |
|---|---|---:|---|
| Only measurement input | `work/capability-discovery/cycle-09/evidence/E3012/measurement/measurement.json` | 1808041 | `fc5da1eb88c0bb572506e815e653c94ddc71ba6d66b8832d513e889477fa95b1` |
| Reused operation | `experiments/capability-discovery/probes/path-geometry/path-geometry.mjs` | 7045 | `ba89598ffc830cb2da862b96abefdd16305e244b4737315be65b189b8f982b34` |
| Existing seam source | `experiments/capability-discovery/window-midpoint-audit/recipe.mjs` | 9614 | `29fc7753ee32d2c6dd7014952a804441c83900d1c27d26a6b43ff3f7d7bdbf15` |
| Existing tests, read only | `experiments/capability-discovery/probes/path-geometry/path-geometry.test.mjs` | — | `8c8be29b7d581346aa9ad88be30dfe3a455fcfeb89782895caa75ed6ed685fc6` |
| Existing adapter tests, read only | `experiments/capability-discovery/window-midpoint-audit/meaningful.test.mjs` | — | `4228ecc847d9f89df9d30c7d634546468a17e56af1f77249b273374f340c482a` |

Input schema `window-midpoint-audit@1`, runId `E3012`, paramsHash `13ab86a4f1631c0fb498e0e183c634275aa78ef3eaa3253f7195ff12bc3ba268`. Its historical E809 input hash `302e50cb5b60f752eb6f3139a4e6a98c015005203359e0ade5aebb378e1897ba` is retained testimony only: do not follow the obsolete path or reopen upstream inputs.

Protocol evidence read: S3 E4603 `c8c4e9121e3712981e7860a9e25df16da9ef260bf0cb1e0f486739716c118bc2`; S2 E4602 `856954f1cf49868c4724da81d46c69243e2b3a56bb6a99bac34b6831034bfb1c`; S4 E4604 `a4497f3119825d683e7108d51fed9599bf8b9df9f380bdf7232983889cfe66de`; S6 E4606 `5a965567b03cd0ad661d567d4375e56a5187085839e8be17287c5495d6959013`. These are metadata/control review, not independent physical observations.

## Complete frozen roster

Retain native row order: composition first, then sourceComposition; inside each branch proposed-ribbon42, proposed-ribbon50, lateral-plus642, lateral-plus650, bright-organic42, bright-organic50. Row IDs are `${branch}/${group}/w${width}`. Each row has exactly `${group}.short1` through `${group}.short5` in that order. All12 rows/all60 slots are mandatory.

Composition frame is `Lenard-1.E802.fixed-roi-source-pixel-centers`; sourceComposition frame is `Lenard-1.original-source-pixel-centers`. Source coordinates are the crop view translated by `[400,1010]`. These are dependent views of one exposed image, not independent courses.

| Group | Nominal width | OBSERVED short indices | UNKNOWN short indices |
|---|---:|---|---|
| proposed-ribbon | 42 | 1,2,3,4,5 | none |
| proposed-ribbon | 50 | 1,2,3,4,5 | none |
| lateral-plus6 | 42 | 2,3,4,5 | 1 |
| lateral-plus6 | 50 | 3 | 1,2,4,5 |
| bright-organic | 42 | 1,2,3,4,5 | none |
| bright-organic | 50 | 5 | 1,2,3,4 |

The same pattern applies to each branch:42 observed and18 unknown slots total. Preserve `reason`, rawCandidate, rawStations, runs, isolatedIds, completeFive, saved errors and saved predictions from every row; the current saved row errors are null. Isolated lateral50 short3 and bright50 short5 remain isolated. No dropped adverse case, gap bridging, replacement pair or selecting successful width. Group names are exposed labels, not authenticated true/false-path ground truth.

## Small reusable default-OFF recipe

Proposed new folder only: `experiments/capability-discovery/saved-pair-consistency/` containing `recipe.mjs`, `recipe.test.mjs`, `cli.mjs`, `README.md`. A small `render.mjs` may be added only after separately admitted captured-result rendering. Existing source/defaults remain untouched.

Proposed API: `runSavedPairAudit({schema:'saved-pair-consistency-request@1',enabled:true,runId,measurementBytes})`. Missing/false own data `enabled` returns DISABLED before reading other fields, hashing, importing geometry or doing I/O. Enabled accepts only the exact fixed measurement byte length/hash and fixed schema/roster/frames/parameters. This is a trusted saved-artifact contract, not general serializer/security infrastructure. `width` and `support` are omitted from `describePath`; nominal42/50 must not become fitted/local-width denominators.

After exact input admission and dependency-hash verification, dynamically import only the pinned dependency-free `path-geometry.mjs`. For each row, construct points from **all five** slot.originPx values. Construct pairedEdges.values in exactly that order: OBSERVED maps to the same slot's saved `{left:leftPx,right:rightPx}`; UNKNOWN maps to literal null. Attach row/frame/input-hash provenance and the statement that fitted pair association/orientation is caller testimony. Call existing `describePath` **once per row**: exactly12 attempted actual saved-audit calls, no second midpoint-path call. Do not copy its midpoint/distance/width equations into the recipe. Do not call countTurns, replay buildRows, fit, query, score or rerank.

Check each slot.id against row.group and position, row.branch/frame/width against the fixed roster, and retained rawStations station/frame and unique matching candidate width against its slot.rawCandidate. Reject associations that do not match the retained row testimony. OBSERVED requires saved finite positive fit fields/status and finite coordinate pairs; UNKNOWN must preserve the frozen null geometry/missing pattern, not become zero. These are internal record-association guards, not authentication or physical-edge verification.

Retain full descriptor returned for each row, but do not interpret its incidental polyline lengths/turns as physical routes, infer runs across missing pairs or report a new bend experiment. Retain actual attempted/completed/error counters. A per-row operation error is retained and later rows are still attempted once; malformed pre-admission input is REFUSED without geometry. Never retry an error to obtain green.

## Frozen comparisons and falsifier

Pixel and dimensionless absolute tolerances are both **1e-9**. These are numerical representation tolerances only, not physical acceptance thresholds.

For each OBSERVED slot, compare returned sample.midpointPx with saved slot.midpointPx coordinatewise; returned fullWidthPx with saved rawCandidate.edgeFit.wPx; returned distanceFromMidpointPx with `abs(saved rawCandidate.midpoint.candidateCenterMinusFitMidpointPx)`; returned distanceInFullWidths with that same absolute saved scalar divided by saved **fitted** edgeFit.wPx. Retain actual/expected/residual/check status for every comparison, not only maxima. This comparison arithmetic does not reimplement describePath geometry.

Keep the raw signed candidateCenterMinusFitMidpointPx and candidateCenterMinusFitMidpointInNominalWidths plus nominal width42/50 separately in the result. Do not equate the signed nominal-width ratio with the nonnegative fitted-width ratio. Preserve signedCrossSectionOffsetInFullWidths from the returned descriptor but do not promote its sign to physical-edge association.

For each UNKNOWN slot, require returned sample.status UNKNOWN, no invented zero quantities and observedPairs equal the admitted observed count. Retain the original missing reason. Compare the six branch-paired results only as a representation/custody check: source returned midpoint minus crop returned midpoint must match the declared translation; offsets/distances/fitted widths/fitted normalizations must agree within tolerance where both are observed. Keep matched unknown patterns and all unavailable comparisons. Do not call this a new independent-frame validation or repeat cycle09's scientific outcome.

Expected FIRSTGREEN: all available coordinate/scalar consistency residuals satisfy tolerance, all42 observed/18 unknown identities remain intact,12 calls complete, and the saved nonzero short1 offset still contradicts nominal-origin-equals-fit-midpoint. No actual consistency output has been produced yet.

Falsifier: any above-tolerance residual, lost/added/reordered slot, observed/unknown/count disagreement, missing required observed field, nonfinite/degenerate pair, unexpected thrown operation or association/frame mismatch. Keep the counterexample/error and report INCONSISTENT/ERROR/REFUSED as appropriate; a pass means CONSISTENT on available software representations with18 explicit UNKNOWN samples, never physical success. A zero-origin hypothesis contradiction is an informative retained negative, not evidence of consumer malfunction. An above-tolerance result requires immediate STOP after retaining the complete single pass, before any repair, tolerance change, source change or rerun; independent validation decides its meaning. Informative falsification/reuse may be the accepted deliverable without a bugfix. Missing not-yet-created modules are not a hard-failure RED or a demonstrated seam defect.

Blindness: midpoint, Euclidean width/distance and absolute-offset comparisons cannot detect a symmetric left/right swap. Scalar and coordinates also share the same underlying fit, so agreement is dependent and cannot establish the fit is right, edge/path identity, width calibration, continuity, AA, ownership, causal effect, confidence or generalization. All such scientific claims remain UNKNOWN/HOLD.

## Focused fixtures, one actual pass, captured-result display

Only narrow adapter regression fixtures are proposed: disabled entry ignores an unrelated getter and causes zero geometry calls; wrong group/station association is refused before geometry; an explicitly UNKNOWN fabricated slot maps to literal null rather than a neighbor/zero pair. An exported small pure row-to-arguments helper may serve these tests if necessary; no new geometry math or general fixture framework. These fixtures test actual adapter failure modes, not synthetic physical evidence. They do not call the actual saved12-row audit. FIRSTGREEN, including any fixture first-pass success, must be reported honestly; do not manufacture RED.

Exact proposed commands, **not authorized by this draft**, from the pinned repo root:

```sh
node --test experiments/capability-discovery/saved-pair-consistency/recipe.test.mjs
node experiments/capability-discovery/saved-pair-consistency/cli.mjs audit --enabled --input work/capability-discovery/cycle-09/evidence/E3012/measurement/measurement.json --run-id E4607-firstgreen --out /workspace/scratch/afc0d51965a8/lab16/S1/E4607/firstgreen
```

The first command never reads E3012 or calls its12-row audit. The second is the sole author actual pass, writes exclusive fresh `result.json` and a CLI report derived from that same returned/captured object, and records input/dependency/new-source hashes before/after. Freeze the new source hashes and actual command before invoking it. No overwrite or automatic retry. A nonzero/status mismatch must retain already produced output and errors. Independent review should inspect the retained actual result and source; it need not duplicate the saved-audit pass.

Result schema proposal `saved-pair-consistency@1`: run/protocol/input/source bindings, complete retained12-row/60-slot evidence,12 full descriptors or explicit errors, per-slot comparison results/UNKNOWN reasons, dependent-frame comparisons, actual call counters, saved short1 counterexample, tolerances and explicit software-only/science-HOLD qualifiers. Keep the complete unmodified parsed saved input in result.evidence so no raw context/error/negative is silently omitted; its exact original bytes/hash remain authoritative, not a rewritten copy.

CLI reports and optional small chart must read only the captured `result.json` bound by its exact hash and preserve row/slot IDs and UNKNOWNs. No geometry import, describePath call, source-image access or numerical score/fit recomputation during reporting/rendering. A separately admitted command would be `node experiments/capability-discovery/saved-pair-consistency/render.mjs --result /workspace/scratch/afc0d51965a8/lab16/S1/E4607/firstgreen/result.json --sha256 CAPTURED_RESULT_SHA256 --out /workspace/scratch/afc0d51965a8/lab16/S1/E4607/display`; the SHA value cannot be known/frozen before execution. Do not execute a placeholder command.

## Review gate

Different-worker protocol review must approve exact closure, full roster/missing pattern, normalization separation, numeric-only falsifier, symmetric-swap blindness,12-call limit and FIRSTGREEN wording. Root must then explicitly admit source implementation. After code is written, present actual written flow and stop for the existing checkpoint gate before any test/geometry run. This packet itself authorizes only this protocol and receipt; no source/Git/HH edits or geometry calls. Preserve all six original scout receipts once in canonical native custody; malformed S2/S5 originals and coordinator envelopes remain separately identified, never silently rewritten or duplicated as fresh worker evidence.
