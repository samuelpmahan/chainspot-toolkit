# E1512 / V1 — premeasurement independent replay comparator policy

Status: source-only predeclaration. No producer/replay/comparator implementation or execution is authorized by this packet. `replay-policy.json` is the normative structured policy; this note explains the boundaries. If a future implementation cannot satisfy a clause, stop with the exact conflict before any attempted widening. No outputs were inspected to choose this policy.

The five current source hashes match the frozen R1507 closure. All five sources were reread as text; relevant unchanged store entry/clock logic was reread to identify timing leaves. No new-source/vendor/store module was imported, valid input inspected, decoder executed or measurement queried. No repository/Git/native changes occurred; only this assigned scratch packet is written.

## Exact comparison

The value trace has no permitted nondeterministic leaf. Its raw tagged bytes must be identical across the two separately admitted runs, as must all160 answer fragments if both runs actually complete. Compare all decoded fields too, preserving exact order, object kinds, arrays, null, nonfinite tags, negative zero, typed constructors and typed elements. No tolerance, normalizer, truncation, sort, root-path rewriting, schema projection or post-output choice is allowed.

The sidecar and176 callback fragments have a narrow clock exception:

| Root | Only cross-run numeric differences permitted |
|---|---|
| decoded timing-sidecar.json | `/intervals/{i}/start`, `/intervals/{i}/end`, `/intervals/{i}/elapsed` |
| decoded timing-sidecar.json | `/calculationLog/{j}/nativeEntry/elapsedMs` |
| decoded fragments/calculation-{j}.json | `/nativeEntry/elapsedMs` |

Indices are bounded by independently validated successful shape, not arbitrary wildcards. Every excluded number still exists, is finite/nonnegative and source-consistent. Interval elapsed must exactly equal end-start, end>=start and adjacent recorded intervals cannot overlap/reverse. Native elapsed uses unchanged store rounding to0.001ms; the nested constant cannot take longer than its outer profile in that same rounded clock. No cross-run duration bound or speedup claim follows. `computedMs` stays exact null because this fixed route has no store-cache-keyed query/outPart invocation; `cached` remains exact false. Do not waive the entire native entry or whole calculation log as nondeterministic.

Raw timings, callback ordering, files and their hashes remain retained in full for each run. An ephemeral comparison mask never modifies either original. The native log has no args/result fields: exact arguments are the planned raw objects, and exact answers are the query rows/fragments. Do not manufacture missing native instrumentation or issue an extra query to collect it.

## Independent per-run validity precedes pair equality

The source-derived success model predicts16 comparisons,160 attempted/completed PATH calls,0 failed calls,16 constant plus160 PATH callback captures,176 callbacks,182 wrapper intervals,160 answer fragments and338 legacy manifest artifacts. These are predictions used to validate future recorded observations—not observations already made, and never filler for missing entries. Any partial/refused/encoding/integrity/output failure is retained and stops successful-replay classification; equality of two partial traces is not a successful replay.

Validate literal group/window/bank order and all raw args. Require every provenance/input/source check, source hash, mask-null distinction, native state/cache/emits/parent/depth/seq and count to match the source model and the other run. Callback order remains `[1,0,2..10]` per fresh store, not seq-sorted. Query planIndex is10*c+k. There are no guessed native measurement values: all future raw answers must compare exactly, whether finite, nonfinite, fitted or native null/condition. All source/request/runtime metadata stays exact; same manifest bytes/path, source root and Node/platform/arch are prerequisites.

Wrapper interval order is fixed by source: first validation,file-preflight,first snapshot,source-before-import,import,source-after-import; then comparison0's10 query intervals; then each remaining comparison's snapshot and10 queries; final source-after-run. Formula: query interval11*c+6+k; snapshot2 at c0, otherwise11*c+5; final source-after-run181. This is a source-derived ordering check, not a fabricated observed timing trace.

## Artifact hashes are evidence, not fields to erase

Validate each complete package's raw files against its own legacy manifest and CLI receipt, including names/ordinals/order/kinds/IDs/lengths/SHA256, before cross-run comparison. Timing sidecar and callback fragment lengths/hashes can naturally change with their permitted numeric leaves. Those exact dependent manifest/receipt bindings are recalculated and verified per run; they are not a generic hash-ignore whitelist. Value-trace and answer fragment byte hashes must remain identical cross-run. Only a file that has passed the narrow timing comparator may explain a different binding. The two raw external manifests/receipts and any CLI stdout remain fully retained; their bindings must exactly refer to that run's actual bytes.

Later outer command evidence must establish actual process exit, exact argv, raw stdout/stderr and chronology independently. The source receipt's intendedExitCode is not observed exit. Shell/driver timing receipts are outside this source-derived semantic comparison and cannot be silently filtered using a broad time-name rule. Any future outer instrumentation must be separately predeclared. No extra files, unexpected errors or changed runtime environment are silently accepted.

## Deferred work

This packet supplies policy and a nonexecutable comparator proposal only. A later native packet must separately approve/hash a pure output-reader/comparator driver and its bounded engineering validation before use. It may decode retained outputs using the unchanged codec; it must not import the recipe/CLI/product, query/replay CV to compare, decode source imagery, modify artifacts or retry production. Its report must expose every compared hash and whitelist path, each PASS/FAIL/NOT_RUN, first exact unexpected difference and both retained raw values. Matching except declared clock leaves means engineering replay consistency only; scientific/human/path/continuity/calibrated-width acceptance stays UNKNOWN.
