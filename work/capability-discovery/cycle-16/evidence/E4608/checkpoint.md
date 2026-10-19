# E4608 written-flow checkpoint — STOP before execution

Written only: four new files under `experiments/capability-discovery/saved-pair-consistency/` in `/workspace/scratch/86659bbafcce/chainspot-discovery-lab`. Tests were written before production code, but none ran; no runtime RED, GREEN, syntax-check, recipe import, geometry call, render or publication is claimed. No tracked file changed, Git write or HH action occurred.

## Exact new source pins

| File | Bytes | SHA256 |
|---|---:|---|
| recipe.mjs | 13965 | `00e0e4d251d85ae64f04210d2db03e5ba7492187abc540b414f3ff86a28d689b` |
| recipe.test.mjs | 2740 | `cbf9f613fb37014dd434acb9c7dfdba336ad13ff784462ea99f12a0ddf75a931` |
| cli.mjs | 2152 | `7e69d20890ed6c6fe30bf07eeaf6d5a19a4a3edbc1806a23c7f12ee706ad4d3f` |
| README.md | 3787 | `498b6672a354fb806750dabf1a9ad42c93a105a96c80dafd292af729c604a466` |

The existing geometry source remains SHA256 `ba89598ffc830cb2da862b96abefdd16305e244b4737315be65b189b8f982b34`. The only saved measurement accepted is E3012,1808041 bytes/SHA256 `fc5da1eb88c0bb572506e815e653c94ddc71ba6d66b8832d513e889477fa95b1`. Original protocol and separate amendment hashes are embedded in the result; they were not rewritten.

## Entry and actual order

API: `await runSavedPairAudit({schema:'saved-pair-consistency-request@1',enabled:true,runId:'E4608-firstgreen',measurementBytes})`.

1. Module import loads Node fs/crypto only and declares constants/functions; no I/O or geometry import occurs. Missing/false own boolean `enabled` returns DISABLED before other fields. The CLI likewise returns DISABLED unless `--enabled` is present.
2. Enabled API validates closed data request, run ID and exact saved byte length/hash; parses those bytes only; validates saved schema/run/params and exactly12 rows. `prepareRow` checks fixed row/group/frame/nominal-width identity, ordered five slots, exact OBSERVED/UNKNOWN pattern, finite origins, unique rawStation identity/frame/pose and exact selected rawCandidate equality. All rows are admitted before any geometry import.
3. `prepareRow` constructs all five original origins and the same-slot left/right pair or literal null. It retains all audit-used rawCandidate fit/midpoint fields, slot reasons and association outcomes. No width/support argument is supplied. Output retains context/JSON pointers into the authoritative original rather than duplicating1.8MB old profiles/rawStations.
4. Source hashes of the four new files and existing geometry are collected; the dependency hash must match. Only then dynamically import existing geometry and immediately rehash sources. No product/gateway/provider code is imported.
5. Loop exactly12 prepared rows once. Increment attempted before each `describePath` call, completed after successful return. Retain full descriptor and compare samples with the saved midpoint coordinates, fitted width, absolute saved scalar distance, and fitted-width ratio at tolerance1e-9. Retain both signed saved scalar representations and nominal width separately. Missing samples remain UNKNOWN. A row error is captured and remaining rows are still attempted once; no retry.
6. Compare the six crop/source result pairs as dependent representation/custody checks with declared `[400,1010]` translation and all missing/unavailable cases. Preserve all actual/expected/residual/check records, saved predictions, run/isolate/error context and the already-saved short1 nonzero-offset counterexample. Overall status is CONSISTENT, INCONSISTENT, ERROR or REFUSED; available consistency is not physical success.
7. Finally rehash supplied input bytes and source closure, retaining before/after pins and errors. The CLI separately rereads/rehashes the actual original input file after the call. The API parsed original is never changed or wholesale reserialized into output.
8. CLI reserves a fresh exclusive output directory before input read, calls the audit once and writes `result.json` with exclusive creation. It hashes those result bytes, then writes `cli.txt` and stdout rows from the same captured object, without another geometry call. Non-CONSISTENT sets exit1. No overwrite, implicit retry or renderer exists.

## Invocation table

| Invocation | Input | Actual arguments | Output |
|---|---|---|---|
| Disabled API/CLI | gate only | missing/false own enabled | DISABLED; no source/input I/O or geometry |
| 4 focused tests, if admitted | small fabricated request/row metadata | disabled getter; wrong slot group; fixed UNKNOWN null; wrong byte length | adapter guard assertions only; zero E3012 reads/geometry calls |
| One author saved audit, if admitted | exact E3012 bytes, all12 rows/all60 slots | existing describePath once per row; five origins; named frame; same-slot observed pair/null; no width/support |12 full descriptors or explicit errors;42 observed/18 UNKNOWN; every scalar/coordinate check |
| CLI report | that returned result object and exact serialized bytes/hash | no numerical geometry invocation | result.json, cli.txt, stdout; non-CONSISTENT exit1 |

## Frozen exact commands awaiting approval

Working directory `/workspace/scratch/86659bbafcce/chainspot-discovery-lab`:

```sh
node --test experiments/capability-discovery/saved-pair-consistency/recipe.test.mjs
node experiments/capability-discovery/saved-pair-consistency/cli.mjs audit --enabled --input work/capability-discovery/cycle-09/evidence/E3012/measurement/measurement.json --run-id E4608-firstgreen --out /workspace/scratch/afc0d51965a8/lab16/S1/E4608/firstgreen
```

The test command does not read the original or call the actual saved audit. The audit command is one author invocation/12 attempted saved geometry calls after successful admission. Its run/output identity changes the illustrative E4607 label only, not oracle/tolerance/selectors. No run output directory has been created.

## Boundaries and review

FIRSTGREEN expected, not claimed. No demonstrated seam defect and no missing-module RED. Existing describePath equations are not copied. Fixtures exercise actual adapter guards, not synthetic physical evidence. No general serializer/security framework or pipeline wiring was added. Independent review should inspect retained source/result, not duplicate geometry absent fresh failure. Symmetric left/right swaps are invisible to the Euclidean/absolute-offset oracle. Same-fit representations, translated views and exposed group names do not establish physical edges/path, fit correctness, calibrated width, continuity, AA, ownership, confidence, causality or generalization; all remain UNKNOWN/HOLD.

If the actual pass yields any mismatch/error, retain complete single-pass evidence and STOP before any repair, tolerance/source change or rerun for independent validation. No own-worker acceptance. No rendering until separate next admission; any later display must read the exact retained result and cannot recompute geometry.

Review requested: does this actual written flow match the approved protocol plus amendment, and may these exact focused-test and single-audit commands run? STOPPED pending root decision.
