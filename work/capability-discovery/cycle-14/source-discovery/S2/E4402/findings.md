# E4402 / S2 — source-only consumer-contract critique

Repository read-only at `f68b731e1050c2cfbab5b065f8f01768dfda4f19`. No product import, syntax check, test, query, pixel/decode/CV operation, dependency installation, network access, native operation, Git write, or source write was performed. Only this worker's assigned scratch output is written.

## Decision: HOLD actual-loader applicability; reuse existing narrow recipe evidence

The delivered isolatedBatch contract is intentionally six ordinary Uint8Arrays, fresh stores, immutable snapshots and trusted cache values. Its source preserves byte-derived sourceKey and producerKey in frozen bridge records (`recipe.mjs:24–55`). A consumer cannot infer support for arbitrary heterogeneous loader Parts from that result. No new recipe defect was found.

The actual loader seam is the frozen `{has,get,addresses}` object over the deserialized Map at `source-evidence/s4-run.mjs:50–58`. The facade snapshots enumeration and forwards Part identities (`board.mjs:5–27`), rather than validating/cloning Part types. The store hashes provider values at `store.mjs:270–276`. Thus applying the facade to the actual loader still needs an independently established Part-type/key-semantic applicability claim. We have not inspected/decode-loaded an actual serialized board and cannot assert its Part inventory.

### Concrete immutable type-alias risk, not an observed actual-loader defect

`store.mjs:157` explicitly excludes DataView from typed-array handling. At `158–165` a DataView instead falls through the generic enumerable-object path. An ordinary DataView with no enumerable own fields becomes `{}` independent of its viewed bytes. `canon.mjs:36–40` would know how to read a view's exact byte range, but that path is not used for a DataView value by contentKey. This is a source-predicted alias for a supported-by-JavaScript deserialized Part shape; actual occurrence in the archived loader is UNKNOWN.

The loader invokes Node v8 deserialize then Map without a Part-type validation boundary (`s4-run.mjs:57`). That source alone does not prove DataView occurs, and no original loader or query execution is authorized. This must therefore remain a HOLD/type-applicability question, not a promoted product defect, repair request, novel result, or instruction to spend runtime on another toy property.

### Smallest prospective falsifier and working control (NOT EXECUTED)

If a later packet explicitly needs to resolve this type boundary, use two arms of the *same real consumer registration*, not a mock hash or copied store:

1. A fabricated loader-shaped board contains exactly one declared root `tk.fixture.input`. Its complete addresses array, has/get methods and board are frozen. Each phase is a fresh board/store/root/backing buffer; one cache is shared only within its arm. All values remain immutable by caller discipline.
2. Register one synchronous Calculation with that root in `inParts`, one output, `calls:[]`, and a fixed function/body/codeSalt. It reads byte zero from a DataView via getUint8(0), or from a Uint8Array via `[0]`. No registered query, raster, image helper or original gateway is invoked.
3. Candidate arm: three fresh one-byte DataViews containing 1, 9, 1. Before evaluating outputs, compare their root content keys. Source predicts A=A=A and produced outputs 1,1,1 with cache flags false,true,true. The phase-two assertion `output === 9` is the discriminating falsifier. This does not mutate a single value or reuse a live store across snapshots.
4. Working supported-type control: three fresh ordinary Uint8Arrays containing 1, 9, 1, same loader/Calculation shape and separate empty arm cache. Source predicts root/producer keys A/B/A, outputs 1,9,1, and false,false,true.

The two arms establish only whether this unsupported/unknown actual-loader Part shape aliases at this consumer seam. They cannot establish presence in the real loader, correctness of original gateways, or any pixel/CV property. Prefer a read-only source/type inventory first; do not execute this purely because it is available.

### Explicitly rejected runtime direction

The facade forwards live has/get; Object.freeze does not deep-freeze Parts; store memoizes object hashes by identity. Mutation through a retained alias can stale keys. However, the delivered README already requires immutable values and fresh stores. Such a falsifier violates the precondition, so it is not a candidate defect and does not deserve another runtime spend. No stale-on-mutation run is proposed.

## Prior evidence versus this packet

Read existing `cycle-13/CURRENT.md`, author `evidence/E4308/result.json`, and independent `evidence/R4308/result.json`. They record two separately attributed 10/10 runs, 6→1→0 leaf/query work, equal totals171 and A/B/A aggregate lineage. These are prior recorded results, not a rerun or independent revalidation by E4402. Existing ordinary Uint8Array/complete-loader tests and same-answer assertions are not being relabeled as actual heterogeneous loader integration.

## Source pins (SHA-256)

Paths below are relative to the read-only repository root.

| Path | SHA-256 |
|---|---|
| work/capability-discovery/cycle-13/CURRENT.md | 2c4f857b73aa290c06fba5bd36ae4279fccc753357c44f93eda2f2d4b67a54e4 |
| experiments/capability-discovery/isolated-batch/recipe.mjs | 05182d53c3b03cce77b7601e0b14d8ff534462b63838651850c72316066b572f |
| experiments/capability-discovery/isolated-batch/recipe.test.mjs | 0bace347bd8c6132144b44b87cc22c494fd5179cf628b114a0ff0181514bad79 |
| experiments/capability-discovery/isolated-batch/same-answer.test.mjs | fd25e9476005a81340041c8cbd0c4fb46d36a98a9d26f43f0fd0c36d883b65a3 |
| experiments/capability-discovery/enumerable-board/board.mjs | 66cc93a4e742fa8ed9b3cfcba94d0d936bf73c907007c21f1e7af59061e62ad5 |
| experiments/capability-discovery/enumerable-board/board.test.mjs | 86ea244841fb47feee1fcdfe6d0b1be8b1b194dbf5f7ab11a3e8afde854cd1ef |
| experiments/capability-discovery/probes/root-inventory/source/fg/store.mjs | 122d624e0311e18f596db37bf292d9c31f47a364e75c8808ca6788c3449a3074 |
| experiments/capability-discovery/probes/root-inventory/source/fg/canon.mjs | 3cc0319f4678eaf8679adcbfaa9db054841417a966c079019b0f72e24ba24406 |
| experiments/capability-discovery/probes/root-inventory/source-evidence/s4-run.mjs | d75b516f1a414adf050e4fd4c740110160d6331d3b6e9092bcfb9e2c90295166 |
| work/capability-discovery/cycle-13/evidence/E4308/result.json | 24af4761ddbe4b9a9705994ca7c5544274431b7cdbdee915dd020c8c3f8cf8bd |
| work/capability-discovery/cycle-13/evidence/R4308/result.json | 24997dbd2c26db83616a1340643be111b873aa544b0d40ffbc1cbbcae8b88b2e |

No AGENTS.md/CLAUDE.md/GEMINI.md was found by repository inventory or AGENTS.md checks of the repository's workspace ancestors. Read root README/REVIEW and the delivered recipe/facade READMEs.
