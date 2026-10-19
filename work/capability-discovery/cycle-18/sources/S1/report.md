# S1 E4801 — source-only integration scout

Outcome: **mixed_change**. The pinned Claude source adds a matching implementation and a public Hole.trace integration seam. This is meaningful changed source, but it neither closes physical admission nor supplies a lab-owned concrete failure usable without pixel replay. Physical/original-pixel/new-CV/real44 admission remains **HOLD**. No source was adopted, executed, edited, or copied into the lab.

## Exact custody

Local source read-only: `/workspace/scratch/86659bbafcce/chainspot-discovery-lab`, HEAD `3fcc644a5e8db8ba23380921df3da92c9989d285`, tree `a5821fab7d07d091f1c2b4aa8b39523ecc68f9c9`, empty porcelain status. Canonical `4e508532b38336c2bd0247fc1ff2d2af132a55dc` was supplied by root, not independently rechecked by S1. README, REVIEW, cycle17 CURRENT, and the previous S1/S3 source reports were read; no E4012 metadata or pixel bodies were opened.

Connected GitHub reads pinned `samuelpmahan/chainspot-toolkit` to `c67c2c232814048c5b0b074aff8b7e0f4651da93`. Git-data commit metadata independently returned tree `a74f48220e4377a61e224171085a6cf9b8f7c97b`, parent `186b66aee6d67d8080da487e22453997cc8763a6`. Compare against prior Claude `cc1fa5c9c4191e11d1d70d021161da3bac2af492` reports ahead5/behind0, 30 changed paths. This is not an inference of inactivity or human acceptance. No fixture/recorded numeric bodies or tests were fetched during this scout.

## Public contracts and existing reuse seam

| Surface | Inspected contract | Boundary |
|---|---|---|
| `impl/fn.Hole.trace/routeMatch.mjs` lines8–14 | Reads `tk.s7.holes`; declares the existing TRACE_CALLS; calls `traceQueries(parts.call)('routeMatch', {})` and projects through existing `tracesOf`. | A thin integration wrapper, not a separate matcher or authorization for lab adoption. It inherits the shared call list, rather than declaring only its one actual query. |
| `ports/s7trace/traceSpace.mjs` lines165–170 | Registered `fn.q.trace.routeMatch({secondBends=true})` obtains `routeTableOn(store,{board})`, `tk.s7.sceneS4`, and `tk.s7.routeStart`, calls existing `routeMatchOf`, and emits holes/reached/secondBends counts. | Existing query/store/cache seam; do not build another query, row producer, sensor, or matcher. Running it consumes owner algorithms and scene data. |
| `ports/s7route/match.mjs` lines86–123 | `routeMatchOf(table,S,starts,{secondBends=true})` returns `{holes,assignment,widthPx}`; per-hole output retains basket index, vertices, rationale, polyScore, sensor-derived leg reading and score/prior/margin. No positive width or no holes returns an empty result with a condition. | Requires a full route table plus S7 scene `{lum,mask,W,H}` and route starts. It is not a saved scalar-only replay seam. |
| `ports/s7route/routeSpace.mjs` lines314–332,359–377 | Existing route table joins per-hole cached rows and contrast/sensor matrices, prior, testimony basket references and conditions. Store production depends on sceneS4, holes, starts, hallway, testimony and row addresses. | Reuse exact table and query only after a separate authorized owner packet. No lab-side table reconstruction or duplicate producer. |

Matching source implements one-to-one maximum total contrast-plus-on-axis-prior assignment, then coordinate refinement and hallway-sensor-based straight/second-bend selection. Its constants are explicit in MATCH: tau0.75, no-reading contrast-99, two refinement iterations and second-bend sensor gain0.15. These are algorithm policy, not independent calibrated physical truth. Source comments explicitly call uniform refinement after reassignment a deliberate divergence from the prototype. Comments claiming 72/72 judged development agreement are owner assertions, not this worker's executions or independently accepted results.

`tracesOf` sets its existing `reached` status from a non-null `end`; routeMatch's output `end` is the assignment basket index. Thus “reached” in this integration means an assigned modeled endpoint, not new physical route continuity/ownership evidence. The same source explicitly exports ACCEPTANCE as UNKNOWN and reserves acceptance to Sam. No defect is inferred merely from that status convention.

## Guard and failure decision

The route start remains derived from S3/S4-associated/recovered tee axes and badge geometry, while hallway width is learned from tee-to-badge image segments. Two raw measures share the scene/mask and route inputs. Those facts do not create independent positive/negative controls or independently fixed literal heading arms. The inspected changed paths provide no accepted exact full-frame transfer packet, independent controls, or exposure-aware frozen protocol. The previous historical Sam annotations remain real testimony; their existence is not denied and their previously unresolved transfer/control custody is not silently solved by this matcher.

The real44 producer-proof fields `artifactSchemas`, `dependencyPathSet`, `phaseImplementation` remain separately unresolved in the current lab boundary. This source-only result grants no producer/query/test/geometry/pixel authority and does not replay consumed E2021.

No concrete new lab-owned failure was demonstrated. Static inspection can motivate owner review of missing-reading/low-support behavior, but those paths are within the active-owner matcher, not the lab's consumers; this scout neither executes nor characterizes them as failing. The shared projector's assignment/reached convention likewise is owner contract, not a demonstrated lab regression. Lab17 claim projection and Lab16 saved-pair work are already complete and were not repeated. A synthetic matching/property test would duplicate active-owner work without answering physical admission, so none was proposed or run.

## Operations and limits

Only filename/text discovery, source/document reads, read-only Git status/identity checks, document hashes/byte counts, exact GitHub source/compare/commit-metadata reads, this scratch report writing, and JSON parsing of the two new report-metadata files occurred. No producer, query/store calculation, geometry, algorithm, product test, render, input/pixel read, install, Git mutation, connected write, publication, HH/PageRouter work, or subagent occurred. Active implementation sources were inspected transiently but no full algorithm source was persisted in this packet.

One reporting helper initially referenced unavailable `TextEncoder` and stopped before producing metrics; the next helper used UTF-8 string encoding to report source byte counts. This is an orchestration helper error, not a product failure or RED test. One broad filename/content search returned no matches (exit1); it was source discovery, not product behavior.

Root remains sole operational/publication owner. The next action is root disposition from all source/control scouts, not algorithm adoption. If no fresh independent admission packet or concrete lab-owned failure emerges, preserve existing accepted evidence and stop this cycle without numerical/consumer replay.
