# E4409 / S2 — accepted exact test-first baseline source

Decision: **source GO for the separately assigned bounded baseline capture only**. No blocking source/protocol finding. This review is not execution permission, a runtime result, or acceptance of an adapter: `adapter.mjs` is intentionally absent. An eventual bridge implementation needs its own exact-source review before execution.

No imports, syntax checks, tests, producer/query/CV/pixel/decode execution, network, package changes, subagents, repository/Git writes, native state operations, or canonical receipt writes occurred. Only assigned S2/E4409 review artifacts are written.

## Exact source/protocol read

Read complete S6 E4406 proposal and result; S3 E4403 result including actual gateway/PCR/sink protocol; actual source `types.ts:234–279`, `assignment.ts:67–69,187–202`, `operations.ts:483–501`, `gateway.ts:26–50,124–172`, `board.ts:52–78,87–134`, `sink.ts:18–53`, `pcr.ts:29–48,51–85`, `compile.ts:45–52`; and all four new E4407 files. S1's final test revision strengthened OFF-after-bridge artifact absence/PCR assertions; that final revision was reread and hashed below.

## Important checks

- **Actual executor and producer, not a second ranker.** The helper verifies dependency coverage and hashes before requiring frozen CommonJS provider code. It obtains the real operation/spec/implementation/binding; the one-op plan schedules only `assignment.ranking`. Context allows only `span('assignment')`. Gateway computes, injects artifacts before receipt completion, and composePcr consumes its testimony. The consumer contains no ranking comparator or invocation of rankPairsByBadge outside the existing operation.
- **Full finite JSON-safe row contract.** Fixture and independent expected-row literal contain all `ScoredPairEvidence` fields and all source-named raw/leg/factor fields. Raw fields are pairId, badgeId, teeId, basketId, teeLeg, basketLeg, supportMean, supportMin, supportedFraction, worstWindowMean, weakSpanCount, weakSpanLongestPx, pathLengthPx, straightDistancePx, efficiency, endpointSupportTee, endpointSupportBasket, failureReason. Each leg contains endpointId/geodesic/path/reachable; all nine factor names match the interface. Finite literals, empty paths, explicit null failureReason and input rank0 match S6's frozen fabricated proposal. README explicitly limits applicability to these complete finite JSON-safe rows, excluding arbitrary Maps/typed arrays/undefined/nonfinite/hostile inputs. No universal serializer framework is needed for this baseline.
- **Correct independent oracle.** Four input rows are a2,b1,a3,a1. First-appearance group order is a,b. A/A2 have a1(rank1),a3(rank2),a2(rank3); B has a1(rank1),a2(rank2),a3(rank3); b1 remains rank1. Only a2 score changes .6→.65→.6. Complete expected raw/factor values are separately stated, not derived from output or a production serializer. Full equality catches missing/extra/changed fields and array/group/rank order. A/A2 fresh nested identities and all snapshots' deep freezing are explicit. Existing ranking shallow-copies ranked outer rows, preserving nested values without modifying them.
- **Losers matter.** Winner identities a1,b1 remain unchanged. The deliberately lossy test-only winner extractor traverses the already-produced Map, runs through the same actual gateway/memory sink/PCR, then must fail the same alternative-change assertion specifically at unequal artifact hashes. It is not a replacement producer, manufactured product mutation, or unrelated mock hash test.
- **Correct RED boundary.** Baseline never imports the absent adapter. The desired test first verifies the real full ranking oracle, then is predicted to fail on `artifacts.length === 1` with zero actual artifacts. Four tests are planned; predicted 3 pass/1 fail is not observed evidence. Dependency/import failure, context reach, fixture mismatch, or a different assertion failure cannot count as the desired missing-capability RED.
- **Identity/sink limits stay explicit.** Source PCR excludes opaque Map values and probes; equality in OFF under a fixed synthetic fingerprint and omitted paramsHash is disclosed scope, not a native image/input collision or ranking defect. Every successful helper run uses actual createMemorySink; hashes are independently recomputed and checked against receipt artifact refs. The existing createNullSink returns empty hashes and is therefore not evidence of content identity; this fixture does not use it or propose modifying it.
- **Default OFF and no mutation.** Planned bridge branch requires omitted and explicit-false enablement to return the original runtime; ON output must match full expected rows and artifact bytes, and OFF-after-bridge must still have zero artifacts and equal opaque PCR identities. Actual adapter behavior remains unreviewed until the file exists. Empty/single/lexical-tie/missing-input cases characterize unchanged producer boundaries, not new RED evidence or bridge behavior.
- **Bounded capture/custody.** Capture refuses existing output directories/files, launches one explicit absolute test path with baseline/bridge arm and no glob, timeout20s/max5MiB, saves direct stdout/stderr, timestamps/status/signal/error, pre/post source pins, exact artifact bytes and runtime testimony. Required CommonJS modules are checked against the frozen conservative dependency manifest; no install/rebuild/substitution fallback exists. Any source/dependency mismatch fails capture.

## Exact accepted SHA-256

All four new paths are under `experiments/capability-discovery/ranked-evidence/` in the read-only Lab repository.

| File | SHA-256 |
|---|---|
| fixture.mjs | eec0a017df87dbf99d4e36bb94d32cc16df43119a5fade88da0490ec3ddd8219 |
| integration.test.mjs | 904a1403c034ca5cbcdb0db5e11b5ff9f73a850a4878c040330c24dc1b24aa57 |
| capture.mjs | c52809216af9fde77ac9a0a5e5238b54dead6159e872fc864aea05f4fc103046 |
| README.md | 1ab7afc2b029a51b2639ee2544178f30bade7ed5c57c8303edecc8a3e8587728 |

Dependency manifest `/workspace/scratch/86659bbafcce/lab14/S1/E4407/dependencies.before.json`: `b0094d7dae7171370cc1aa4c8b62f7034472d1e5cfdeaa20f56a58e7441fc324`. Its declared scope is full alg/dist plus provider package/lock and alg CommonJS package boundary; import availability is not yet verified. Manifest source coverage is enforced by the capture helper, not asserted as observed runtime by this review.

S6 proposal SHA `ef402cdf2fb9934c3b622e10b15e62d3c1d458bc27e592edc4d960b780a93c5f`; S3 result SHA `25e2e98758c1f96ac911af1da2d400a717e512053aaaf401e113ea3e92593c42`. Actual contract types SHA `c9c4b914b9de990333f9e84bafba98f4cb86a9a57485b24599d7a1fecf5d81fa`, ranking source SHA `2f56a606fce6543ca96bcd1a1b2300af4e2ce0c29f2c27fd9378bc76f065946e`, gateway SHA `c79e00b91378f2af3717fb99c6c4ae76ad226098f97acc595822e35a04584e6f`, sink SHA `ef75def6f64ede0e702a769cb3923b60f910c2bdb17f66b7a68490ac2b7610e9`, PCR SHA `ba214fc58bafc3e703892a7e9160d131b07806f19a83772af98f8d1c946d3e54`.

Real44query/pixels HOLD and production/default behavior remain unchanged. Candidate evidence is not selection, endpoint ownership, hole identity, physical truth, human acceptance or performance evidence.
