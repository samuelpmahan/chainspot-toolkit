# E1519 / V1 — bounded R1515 repair checkpoint, NOT_RUN

Only E1519 scratch files were authored. E1515 originals remain byte-exact. No syntax check, comparator/test import, test, codec execution, output read, producer, replay, CV/PATH/store call, source/Git/native mutation or helper occurred. Frozen source was read as text only; synthetic fixture paths name no accessed files.

## Bindings

| Artifact | Bytes | SHA256 |
|---|---:|---|
| E1519/compare.mjs | 33761 | `359f5e177cf1bb3cf0c65212445086ce9f19374fae279d3f40ffba55f9994acd` |
| E1519/compare.test.mjs | 20406 | `961fe42bb21690d7ea485ac50a18681f1d64321758815384e60db6caeaa8c3b0` |
| E1515/compare.mjs, preserved original | 32786 | `4574213c39e1e075bcc2f7533985d4792db0c72153f2c3a8ae9eb4845f57b318` |
| E1515/compare.test.mjs, preserved original | 7730 | `a3ebf0782bb15ac5706ffa9e08583cc399b08fe8371cfbf63e7a97d08b2c715b` |
| R2/R1515/result.json, fully read findings | — | `d97409f1094771df6fc9684134ba8a8211990e94c59a5d663c40fe3ae0caac21` |
| V1/E1512/replay-policy.json, unchanged | 14912 | `b146b7183e4aab0708792b7f72aa37790113ca8061f34c551ea590f24391027d` |
| replay-source-shape-addendum.v1.json | — | `3537cdce221ab424672097ed6d8530afaf94128d66ddb3dc38a8d3490407232b` |
| replay-source-shape-admission.v1.json | — | `8c6360ba697cebcd798b23deff6b1688cf2010eff1ee6036e452ca1bdde7f8ae` |

E1515 checkpoint/result hashes also freshly match `1f1144a2d297afd6d9f53393c2bb66e52e48ff367ab4bbefbed7e909b5744320` and `5c404ade68cb465befd517eb2e7c9ee7f3d61184ce38d6e12ef0477190ca1f83`. No E1515 bytes were replaced. The accepted source-shape clarification remains separate from the original defective preproducer policy, not an original-policy PASS.

## Entry and actual flow

`comparePackages({leftRoot,rightRoot,policyPath,admission,codec})` remains the only filesystem-reading entry. Module declarations import only Node builtins, with no top-level I/O or product/codec import. All E1515 policy/anchor/source/file-set/raw-hash/wire/within-run/cross-run/outer-evidence/source-rehash flow remains unchanged except the following two repairs and the versioned report label.

1. During admission, `isExternalRoot(sourceRoot, root)` computes `relative(sourceRoot, root)`. A path is outside only when the result is literal `..`, starts with `..` plus the platform separator, or is absolute. Thus internal `..inside` and `...` components do not escape containment. Existing later absolute-root and nonsymlink checks remain.
2. During each independent `validateRun`, immediately after the query row's own key order is checked, `validateNativeAnswer(row.nativeAnswer, '/queryTrace/n/nativeAnswer')` runs before the row's nativeAnswer becomes its own expected tree.
3. The answer must be a nonnull ordinary object with own enumerable data fields `value`, `unit`, and `emits`. Unit must be a string; emits must tree-equal `{computed:1}`. These facts come from the unchanged store's successful fresh-query spread and computed-emits wrapper, reread as text at lines181–204.
4. The checker does not inspect, transform, classify or constrain the scientific payload inside `value`; null, condition/fit objects, NaN, either infinity, negative zero and exact Uint8Array values remain available to the unchanged exact-byte/tree comparison. Other answer envelope fields are not dropped or normalized. Unknown differences still fail later exact equality.
5. The original row identity/state/error checks, fragment-to-answer equality, canonical codec validation and cross-run raw answer/value equality remain unchanged. The only permitted numeric timing leaves and their arithmetic/rounding/order constraints are unchanged. No new tolerance exists.
6. Report schema is versioned `E1519-pure-comparison@1`. It still returns native raw values and must not be serialized with ordinary JSON as a purported lossless representation.

| Invocation | Inputs | Calculation | Output |
|---|---|---|---|
| isExternalRoot | Source/output absolute path strings | Component-aware lexical relative-path test | Boolean used by admission guard |
| validateRun | Complete decoded trace/sidecar plus independently supplied expected anchors/runtime | Existing success model plus new successful-answer envelope precheck | Return normally or first exact pointer failure |
| comparePackages | Explicit roots, policy, root-admitted anchors/addendum/codec and outer observations | Existing complete retained-artifact comparison with the two repaired guards | MATCH_EXCEPT_DECLARED_TIMING, FAIL or NOT_COMPARABLE report |

## Written tests, NOT_RUN

The original eleven tests remain in the new file; four additional tests make fifteen declared tests:

- Full hand-declared `validateRun` positive fixture: 160 query rows, 16 snapshots each with ten exact source-shape checks, full trace/sidecar/runtime/request/source-binding anchor objects, 176 callback entries and 182 interval records. No files are opened, no codec is invoked, and no actual producer answer or pixel is present. Synthetic source/attestation anchor labels are intentionally not actual execution or input authenticity evidence.
- Positive envelope payload examples retain native null, condition/fit-null, NaN, infinities, negative zero and Uint8Array bytes. These are engineering examples, not query-specific measurement-schema claims.
- Mutation rejection exercises literal null nativeAnswer, missing own value, inherited value, non-string unit, wrong computed emits, cached emits and absent emits through the actual `validateRun` entry.
- Other full-fixture mutations exercise count, request binding, source binding, extra per-check error key, nonnull snapshot error and wrong resolved Part key.
- Lexical path cases distinguish internal `..inside/original` from actual parent/sibling output roots. Namespace-style imports allow a separately authorized test file to target the preserved old module without failing module linkage because a newly added named export is absent; old-source red checks have NOT_RUN.

The fixture is validator-level coverage, not a full file-package integration test. It does not prove independently authenticated input/source anchors, wire bytes, artifact hashes, outer process observations or query-specific math. The previously disclosed external root authority for codec authentication, observations/runtime, chronology/fresh roots and immutable raw evidence remains.

## Prospective commands, withheld

```
node --check discovery-cycle06/V1/E1519/compare.mjs
node --check discovery-cycle06/V1/E1519/compare.test.mjs
node --test discovery-cycle06/V1/E1519/compare.test.mjs
```

These commands have NOT_RUN. Any old-original-path red check is separately bounded by root's later actual packet and must not modify E1515 originals. Root will authorize independent R2 re-review and bounded NONCV execution after reviewing this checkpoint. No actual producer-output read or ONE160 replay is authorized here.
