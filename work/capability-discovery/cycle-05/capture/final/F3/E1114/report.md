# E1114 — first independent frozen-vector execution

Outcome: confirmed_reuse, bounded codec/preflight behavior only. All20 E1112 groups /59 concrete variants met their predeclared expectations on the first run, exit0, with no repair or rerun. This is not whole-implementation self-acceptance or a scientific result. Node v24.19.0 emitted an experimental-loader deprecation warning; it is preserved in the raw stdout and did not prevent guard execution.

| Executed check | Actual result |
| --- | --- |
| C01–C05 | 5 successful native-tree and UTF8+LF wire roundtrips, including NaN/-0/±Infinity/null, finite doubles, Uint8 corridor, native tag lookalikes, own __proto__, null prototype/order, shared acyclic subtrees |
| C06–C15 | 42 explicit ValueCodecError refusals; no accidental RangeError/JS getter throw accepted as success |
| Getter sentinels | 6 vectors,0 getter reads;3 codec +2 disabled +1 enabled-accessor |
| I16–I20 | 12 inspectStationRequest +12 invalid/disabled runStationEvidence invocations; no READY/positive request passed to run |
| Each wrapper result | requested/attempted/completed/failed PATH and capture counters all0; sourceBinding/requestBinding null; no snapshots, query rows or Calculation entries |
| Downstream guard | 0 forbidden vendor-import attempts; no block log generated; no phase beyond validation in wrapper results |
| Hash stability | All7 frozen source files plus source-freeze/vector/plan/freeze IDs matched before and after; all8 retained fixture files matched and remained unchanged |

Actual subject invocations: encodeValue26, decodeValue22, encodeBytes9, decodeBytes5, inspectStationRequest12, runStationEvidence12. The42 expected refusals include malformed/duplicate tags and object pairs, sparse/excess properties, accessors/symbols, unsupported types, cycles/undefined and resource/depth/node/typed-byte/file-byte overflow. No vector was skipped or reported unsupported; the admitted native-tree decoder APIs existed. Resource checks used encodeBytes where the promised cap applies to serialized file size, not merely the intermediate native encoded tree.

Actual wrapper error observations: two tampered-input variants returned INPUT_HASH_MISMATCH with run status INTEGRITY_FAILED; one protocol mismatch returned PROTOCOL_MISMATCH; seven malformed-enabled/preset variants returned INVALID_REQUEST; two absent/false enabled variants returned DISABLED. The dual cap/preset violation selected INVALID_REQUEST, permitted by the frozen priority-unspecified oracle. Disabled wrappers recorded no intervals; enabled invalid bodies recorded validation only. Getter-based enabled rejection recorded no validation-body interval. No raw scientific refusal/condition or partial PATH answer was fabricated.

## Reproduction and evidence

The exact first command is retained in commands.txt. first-run.mjs and block-vendor-loader.mjs were written before execution and remain unchanged. The loader refuses any /probes/ resolution; the driver additionally refuses to run a request inspected as READY. Only the codec and recipe definition modules were imported from product source. No vendor, CV or PartStore code was imported. Reading the seven-file manifest bytes for hash checks is not execution of those files.

Retained first.stdout.log includes all59 variant records and final summary. first-run-results.json includes complete rows, invocation counters, input fixture hashes and before/after source IDs. File hashes are listed in result.json. The driver compares recursive native values with Object.is and own-key/prototype/type checks, not lossy JSON equality. It also checks Object.prototype descriptors after each case. The immutable E1112 vectors were not edited.

## Limits

No adversarial falsifier was observed within these59 exposed engineering vectors. This does not prove universal codec security, all cap boundary behavior, malicious Proxy resistance, real-world sample correctness, registered-route/native log fidelity, complete renderer fidelity or implementation acceptance. No positive enabled request, query, producer, image decode or rendering was run. ZeroCV is supported by the actual invalid-request traces, source inspection of the preflight boundary and the zero-attempt vendor-import guard, not simply absence of a measurement answer. No source/Git/native state writes or extra queries occurred. F4's independent whole-code review and root's later producer admission remain separate authorities.
