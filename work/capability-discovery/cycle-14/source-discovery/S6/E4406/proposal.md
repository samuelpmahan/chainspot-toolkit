# E4406 / S6 — source-only consumer-seam review

Outcome: insufficient_evidence. Execution and implementation HOLD. No runtime failure was observed. The strongest bounded local proposal is an actual `assignment.ranking` → ordered candidate materialization → PCR identity integration, not another byte-sum/cache property. It is a missing consumer evidence capability, not a demonstrated core defect. S3 independently owns the primary ranking proposal; this document supplies a source critique and a separately specified prospective oracle, not adoption of other-owner implementation.

## Evidence and ownership

Inspected Lab repository: `/workspace/scratch/8528bb251845/chainspot-discovery-lab`, root-supplied local checkpoint `f68b731e1050c2cfbab5b065f8f01768dfda4f19`; no Git command or remote verification performed. `EXPORT-README.md` identifies unmodified provider source under `source/provider/`, pinned provider base `5433854c72b1dc5aa420934d91e16458c2abe09f`. Lab owns additive experiments, not provider/core/default changes.

Lab13 CURRENT requires consumer-seam/nonduplication review before more toy properties; its scalar and equal-answer properties do not prove native loader integration. The archived root-inventory store is pinned to platform ref `49255331791b1245cf0f9cd699816175f94e70f2`. Its archived s4-run has missing relative FG imports in the Lab, so it is not an executable native-loader integration here.

Root permitted narrow source-only inspection of active other-owner `/workspace/scratch/d9fd796f268d/chainspot-87a5f41`. AGENTS and DOCTRINE were read; narrow FG source listing and `fg/legacy.mjs` source inspection did not establish a new authorized native integration. Its source is not imported, copied, adopted, executed, mutated, or treated as ours. S5 owns nonduplication audit.

## Exact local source and flow

- `source/provider/packages/alg/src/exec/operations.ts:483–501`: actual operation `assignment.ranking`, input `assignment.scoredPairs`, output `assignment.rankedByBadge`, binding `fn.rankTeeBasketPairsByBadge`, calls existing `rankPairsByBadge`.
- `.../detectors/threeFactor/assignment.ts:67–69,187–202`: group by raw.badgeId in first-appearance order; each group's rows sort descending score, then descending raw.supportMean, then pairId.localeCompare; fresh outer rows receive rank index+1. No scoring/routing/selection required.
- `.../exec/gateway.ts:87–102,124–171`: Map is not an array-like shape probe; runtime artifact extractor is an existing injected boundary. Artifacts must enter the actual receipt through this gateway, not be appended afterward.
- `.../exec/operations.ts:970–1079`: no default assignment.ranking extractor. The source explicitly calls extractors representative, not exhaustive.
- `.../exec/pcr.ts:29–31,35–48,69–85`: PCR identity includes artifact content hashes but excludes probes and opaque board values. Its published limitation expressly requires Materialization. Consequently same PCR identity with changed ranking Maps is a limitation control, not a newly discovered bug.
- `.../exec/sink.ts:18–25,37–60`: createNullSink emits empty sha256 strings. Any candidate must use createMemorySink or another real hashing sink. Merely adding an extractor with the default sink will not establish content identity.
- `.../exec/compile.ts:45–51`: paramsHash belongs to the caller's canonical input identity. Holding it fixed while changing fabricated intermediate inputs is an explicitly synthetic fixture, not evidence of an actual native input collision.

## Frozen prospective fabricated integration

Scope one operation only. Use unchanged local CommonJS `dist/exec/{operations,gateway,board,sink,pcr}.js` and its unchanged static import closure. Obtain the existing operation spec, operationImpls, and operationCalculationBindings by `assignment.ranking`; do not reproduce ranking math or inject a replacement operation. Construct one synthetic one-op plan with fixed named fixture fingerprint and paramsHash omitted; this is not compileExecutionPlan output from a real image. Context supplies only `span('assignment') => () => {}`; other context operations must throw if reached. Gateway uses fresh createExecBoard and createMemorySink per phase. No real loader, original query, pixels, scoring, routing, matching, native planner, or CV invocation.

Construct three fresh immutable full ScoredPairEvidence snapshots before calls. Shared full-row factory fills all RawPairEvidence and PairFactorBreakdown fields with explicitly fabricated finite values; teeLeg/basketLeg are `{endpointId:'fixture-end',geodesic:0,path:[],reachable:true}`, all path/support measurements not used by ranking are fixed0, efficiency is1, failureReason:null, factors are nine fixed0.5 fields. Input rank is0. IDs are fixture-only and do not assert hole identity. Each phase input order:

| Row | badgeId | teeId/basketId | A score | B score | raw.supportMean |
| --- | --- | --- | --- | --- | --- |
| fixture-a2 | fixture-badge-a | fixture-tee-a2 / fixture-basket-a2 | 0.6 | 0.65 | 0.4 |
| fixture-b1 | fixture-badge-b | fixture-tee-b1 / fixture-basket-b1 | 0.8 | 0.8 | 0.5 |
| fixture-a3 | fixture-badge-a | fixture-tee-a3 / fixture-basket-a3 | 0.6 | 0.6 | 0.8 |
| fixture-a1 | fixture-badge-a | fixture-tee-a1 / fixture-basket-a1 | 0.9 | 0.9 | 0.5 |

Restored phase A2 has fresh objects exactly equal by content to A. All remaining full-row fields are identical across phases. All numeric fields remain finite and JSON-safe. Freeze field names and full fixture literal in the later construction before any execution; do not silently choose different values.

Hand-derived outputs, group insertion order `[fixture-badge-a,fixture-badge-b]`:

- A and A2: badge-a rows `[fixture-a1 rank1, fixture-a3 rank2, fixture-a2 rank3]`; badge-b `[fixture-b1 rank1]`.
- B: badge-a `[fixture-a1 rank1, fixture-a2 rank2, fixture-a3 rank3]`; badge-b unchanged.
- Winner identities remain fixture-a1 and fixture-b1 in all phases. Losing alternatives changed; winner-only export is insufficient.
- Actual receipt reads exactly assignment.scoredPairs, writes new-address assignment.rankedByBadge, calculation binding remains actual fn.rankTeeBasketPairsByBadge; no expected timings.

Proposed additive extractor serializes a versioned object `{schema:'lab14-ranked-alternatives@1',groups:[{badgeId,rows:[FULL ranked ScoredPairEvidence rows]}]}` using the Map's explicit ordered entries, retaining every row, nested raw/factors, score, and rank. Do not JSON.stringify(Map) directly (which erases groups). Emit one candidateSet artifact at a fixed fixture-specific ID; gateway sends bytes to createMemorySink. Leave default ARTIFACT_EXTRACTORS, ranking arithmetic and provider code unchanged; inject the explicit opt-in extractor through OperationRuntime only.

Expected candidate identities: artifact bytes/hash A != B, A == A2; PCR runResultId A != B, A == A2; actual ranked Maps match the above oracle; values and byte snapshots remain unchanged after execution. No literal digest is predicted without running. Baseline without extractor has no ranking artifact, no Map shape probe, and equal PCR IDs across phases by the documented identity scope. Baseline does not establish a defect or new RED.

Counterexample/negative control: a winner-only extractor emits just the two rank1 rows. Its bytes and real artifact hashes remain equal across A/B/A2. A shared assertion requiring changed alternatives to yield changed artifact hash must reject that lossy control, while the full-row extractor must pass. Another falsifier is using createNullSink: empty hashes cannot count as passed evidence. No production mutation is needed.

Preserved working cases: empty input yields Map with no groups and a valid nonempty encoded empty-groups artifact; single row gets rank1; equal scores use supportMean; exact score/support tie uses pairId lexical order; duplicate badge grouping and input immutability remain unchanged. These are FIRST-GREEN contracts, not historical REDs. A minimal later regression allowlist should retain existing Lab11/12/13 tests unchanged, but its actual command needs separate Root approval.

## Dependency and runnable gate

Proposed later test path: `experiments/capability-discovery/ranked-alternatives/integration.test.mjs`; command `node --test experiments/capability-discovery/ranked-alternatives/integration.test.mjs` from the Lab root. No file at that path was created. Local package declares commonjs; use createRequire anchored at the pinned provider package to load its dist code. No rebuild, install, tsx, new dependency, live other-owner imports, or runtime source transformation.

Before that command is runnable/authorized: Root selects this seam; S5 resolves nonduplication; owner approves use of existing provider operation in a Lab-only opt-in experiment; exact full fixture/new source and transitive static require closure must be frozen and reviewed; execution receives its own native assignment and bounded capture. This source job did not enumerate/hash the entire transitive provider closure and therefore does not assert an execution-ready closure. HOLD until those gates. Real44queryHOLD remains unchanged.

## Local SHA256 pins actually inspected

| Path | SHA256 |
| --- | --- |
| work/capability-discovery/cycle-13/CURRENT.md | 2c4f857b73aa290c06fba5bd36ae4279fccc753357c44f93eda2f2d4b67a54e4 |
| experiments/capability-discovery/probes/root-inventory/source/fg/store.mjs | 122d624e0311e18f596db37bf292d9c31f47a364e75c8808ca6788c3449a3074 |
| source/provider/packages/alg/src/exec/pcr.ts | ba214fc58bafc3e703892a7e9160d131b07806f19a83772af98f8d1c946d3e54 |
| source/provider/packages/alg/src/exec/gateway.ts | c79e00b91378f2af3717fb99c6c4ae76ad226098f97acc595822e35a04584e6f |
| source/provider/packages/alg/src/exec/operations.ts | 5bb9f97e0e8e235fa3e80a32761a701cdcfc107369565e3ec77e5ea6b95a26b8 |
| source/provider/packages/alg/src/exec/board.ts | 3f6bad3c444ec8e1c107f96336b8d863bce0125f39fe39cb5a225fcfb1866675 |
| source/provider/packages/alg/src/detectors/threeFactor/assignment.ts | 2f56a606fce6543ca96bcd1a1b2300af4e2ce0c29f2c27fd9378bc76f065946e |
| source/provider/packages/alg/src/detectors/threeFactor/types.ts | c9c4b914b9de990333f9e84bafba98f4cb86a9a57485b24599d7a1fecf5d81fa |
| source/provider/packages/alg/dist/exec/pcr.js | a1fcd9d7d27cedc2e4f9f74d4fcc6825347e23c36f62828ea98bbf9fb75e1ddd |
| source/provider/packages/alg/dist/exec/gateway.js | 8c4652362d9739316b80dbd3f23dc595d8ff532d5ac9e8d11637df30d8915c97 |
| source/provider/packages/alg/dist/exec/operations.js | 98e0d01066ef07948e6cf92b9a3e5f10fede36c83789ab8d44c11b5a84bece54 |
| source/provider/packages/alg/dist/detectors/threeFactor/assignment.js | 9f18504ad128684f2fcf5ea520d36c77892f1a592a7f8815bcf625619f27bff9 |
| source/provider/packages/alg/dist/exec/board.js | 0849480a10add759328b41f23ad77f3eeae75f69ed8a15affaf94bb570702716 |
| source/provider/packages/alg/dist/exec/sink.js | a840ab8b7808da678d7defc91aad21a7a7ead7a2e183f0dc278dc8d50edd9552 |

Only source/text/path discovery and SHA256 reads occurred. No imports, tests, query/producer/CV/pixel/decode execution, original-image access, consumed planner/grid/replay, Git operations, network, new dependencies, repository mutations, or native/canonical receipt writes.
