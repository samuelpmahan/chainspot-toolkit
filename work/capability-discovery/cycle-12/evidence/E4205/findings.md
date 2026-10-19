# E4205 — bounded author implementation evidence

Three additive product files under `experiments/capability-discovery/isolated-batch/`:
`recipe.mjs` (56 lines), `recipe.test.mjs` (108), `README.md` (47). No pre-existing
repository file was edited; no Git/build/package/publication operation occurred.

## Actual runs (one each)

| Run | UTC start → finish | Exit | Observation |
| --- | --- | --- | --- |
| Original global-board locality RED | 2026-10-19 09:03:21.300 →09:03:21.525 | 1 | Real `6 !== 1` assertion; leaf/query counts6→6→0; not a missing module. |
| Authorized explicit two-file allowlist GREEN | 2026-10-19 09:06:51.910 →09:06:52.161 | 0 | 9 tests passed,0 failed; stdout53459B, stderr0B. |

The core original locality test/assertion body is byte-identical through its final
input-identity assertion. Candidate wiring changes `runBatch` from the actual
global-board function to `isolatedBatch`; an additional diagnostic follows the
unchanged body. Imports/control helper wiring differ as documented. The original
executed source was moved without byte changes to inert `baseline.test.mjs.txt`;
its original SHA remains the execution receipt's pin. E4203 is separately preserved
prediction-PASS evidence, not relabeled RED.

| New 18-byte fixture | Totals | Leaf computations | Query calls | Aggregate hits |
| --- | --- | --- | --- | --- |
| Isolated recipe | 171→234→171 | 6→1→0 | 6→1→0 | false→false→true |
| Whole-board Map control | 171→234→171 | 6→6→0 | 6→6→0 | false→false→true |
| Complete wrapped-loader control | 171→234→171 | 6→6→0 | 6→6→0 | false→false→true |

Only slot3 source/producer keys change in the isolated arm; five unaffected leaves
reuse, restored keys/output reuse, inputs stay unchanged. Global arms agree exactly
on values/source/producer/aggregate keys and cache flags (timings excluded).
Every recorded synthetic query/leaf/aggregate call is status`ok`, error`null`.
Additional control and Uint8/duplicate-order/exact-immutable-bridge tests are
FIRST-GREEN, not additional observed RED regressions. The six existing Lab11
scalar adapter tests passed in the same sole GREEN command.

Root read all written source and approved this exact allowlist after the required
actual-flow checkpoint. Runtime was bounded20s/5MiB; direct stdout/stderr and complete
argv/cwd/Node version/times/exit are in execution receipts. All12 selected source
pins match before/after. No candidate source changed after the GREEN run. The
module's stable actual nine-module closure salt is
`8c0b1b3490d5a77d67fd8a00eb0f27b86b58634746a5a9e3fe47785dc9ac830a`.
Effective query/leaf/aggregate code keys and lineage bridge/call keys are preserved
in raw stdout. No native queries, images/raster/CV, real stitching, browser bundle,
disk-CAS, hostile-provider/live mutation, performance, production/default or
code-change/view/equal-answer experiment claim. Independent review remains next.

Product SHA256: recipe `05182d53c3b03cce77b7601e0b14d8ff534462b63838651850c72316066b572f`;
test `0bace347bd8c6132144b44b87cc22c494fd5179cf628b114a0ff0181514bad79`;
README `8f36b44501d4c278c0b84aa979690c5b304d5bba0dedeea67d0d4f276f13391c`.
Execution SHA256: baseline `4308608d82a662b666b246d79d19695dba185c08563f1ada9812b55fd1e7d04d`;
GREEN `ab017e160ab86461ab03421898f81f423a4a0cc6994e1d0b6a7f8859f6402246`.
