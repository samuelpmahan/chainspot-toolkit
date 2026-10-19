# R4205 independent review — accepted

No blocking findings for the exact default-OFF synthetic recipe and approved nine-test scope. No repository edits or Git mutation. No native queries, real pixels, CV, gateways, broad test glob or additional product executions.

## Exact source and baseline preservation

- Reviewed product SHA256s: recipe `05182d53c3b03cce77b7601e0b14d8ff534462b63838651850c72316066b572f`; test `0bace347bd8c6132144b44b87cc22c494fd5179cf628b114a0ff0181514bad79`; README `8f36b44501d4c278c0b84aa979690c5b304d5bba0dedeea67d0d4f276f13391c`.
- Preserved original baseline source SHA `738e95c1d8c4a4ff1bf52577d4f53e82bf03bf3a6282aa73e109abce08012139`. Its original execution JSON records exit1, `6 !== 1`, computations/queries `[6,6,0]`; I inspected that capture rather than repeating the baseline run.
- The first test's original entire callback/test body is byte-identical after removing only the new two-line isolated diagnostic. Both compared bodies hash to `7e74a058993d6c37d1b723a51b681d1b57efaf3521067e0a4d1ff08e3d262e27`; no assertion was weakened or removed. Imports/implementation selection and fixture-independent control salt appropriately differ outside that body.
- Actual complete local static closure is recipe + board + store/canon/pxset/render/png/alphaRender + alpha contract: nine modules. Inspected their import declarations: every relative import is in this closure; builtins are Node fs/crypto, with actual Node version in execution metadata. No dynamic import seam found. Source hashes independently reconstruct captured salt `8c0b1b3490d5a77d67fd8a00eb0f27b86b58634746a5a9e3fe47785dc9ac830a`, identical across the three snapshots and not derived from snapshot bytes.
- Every upload gets a fresh independent one-root store, not a branch; same fn/root/output addresses and exact address query args. No slot label or mutable snapshot state is captured by the query/leaf. Root bytes are addressed Parts; actual query/helper/bridge/aggregate source participates in salt.
- Exact immutable bridge fields are `value,unit,sourceKey,producerKey`; keyOf(ROOT) and keyOf(LEAF) supply the two keys. The aggregate is a seventh fresh store with six fixed-order declared bridge inputs and `calls:[]`, reading only io.in. This deliberately transports lineage-bearing records, not the leaf provenance graphs.

## One independent approved run

Command: `node --test experiments/capability-discovery/isolated-batch/recipe.test.mjs experiments/capability-discovery/enumerable-board/board.test.mjs`.

Started `2026-10-19T09:10:37.519Z`, ended `2026-10-19T09:10:37.729Z`; exit0, signal/error null. Node `v24.19.0`; timeout20s, maxBuffer5MiB. Direct child Buffer captures: stdout53,456B, stderr0B. All12 before/after source pins identical. Nine tests passed, zero failures/cancellations/skips/todo. The metadata-only follow-up parsed this capture and source bytes; it did not execute product code a second time.

| Actual captured arm | Leaf computations | Query calls | Totals | Aggregate cached |
|---|---|---|---|---|
| isolated | `[6,1,0]` | `[6,1,0]` | `[171,234,171]` | `[false,false,true]` |
| whole-board Map | `[6,6,0]` | `[6,6,0]` | `[171,234,171]` | `[false,false,true]` |
| whole-board wrapped loader | `[6,6,0]` | `[6,6,0]` | `[171,234,171]` | `[false,false,true]` |

Raw isolated outputs retain ordered values `[6,15,24,33,42,51]`, changed slot3=87, unit `byte-value sum`, count6/unit `uploads`. Only isolated slot3 source/producer keys change; all six global producer keys change, while only slot3 global source key changes. All restored bridges are exact; aggregate original/restored keys match and differ from changed key. All raw call statuses are ok. Old adapter regressions pass including original1→9→1, unrelated warm reuse, restore query0, forwarding/identity and enumeration errors. New rejection/duplicate-slot/frozen-summary contracts are FIRST-GREEN only.

## Boundaries retained

Caller-owned Uint8Array/backing-buffer immutability and trusted in-process cache remain preconditions; no runtime enforcement is claimed. Instrumentation is mutable sidecar data, not hashed semantic output. The entire source file set must stay unchanged after import. Equal bytes may share leaf work while six ordered slots remain. Code-change, view, equal-answer and adversarial runtime controls were not run or newly claimed. This demonstrates selective reuse in the finite synthetic consumer composition; broad global behavior is correct and unchanged, not a repaired core bug, performance result, browser bundle, production integration or real-image/stitching/CV proof.

Evidence: `execution.json`, direct `stdout.txt`/`stderr.txt`, `source-comparison.json`, `observations.json`; `capture.mjs` is the single-run capture mechanism and `inspect-capture.mjs` only analyzes saved evidence.
