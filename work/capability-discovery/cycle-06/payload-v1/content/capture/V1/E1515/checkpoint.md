# E1515 / V1 — comparator source checkpoint, execution withheld

Written only in assigned scratch `discovery-cycle06/V1/E1515`. No Git, repository source, native coordination, or E1512 file writes. No producer output read. No comparator import, syntax check, test, codec execution, production, replay, CV/PATH/store call, or image decode has been executed by this worker. Old test execution is not claimed.

## Preserved recovery evidence

Fresh E1515 inventory contained only `compare.test.mjs` (3,983 bytes); `compare.mjs` and draft transcript were absent. Its exact recovered bytes are preserved as `compare.test.pre-recovery.mjs`, SHA256 `cbf58a901f2b83b39627b3ac3b281c1624e7694963c5de6745aede7809476ff6`. The original partial file's before-preservation and preserved-copy hashes matched.

Frozen E1512 policy remains SHA256 `b146b7183e4aab0708792b7f72aa37790113ca8061f34c551ea590f24391027d`. Proposal SHA256 `77ac01d93638ceed7d8109a474d44318523d3e5c8ae4aeab86da2f20325cb2fb`; original result SHA256 `3e81d7123f5a929f52139495bba2a777648cdde8b74741678fe1d6a1fed121ab`. These were read, not edited.

## Written code

| File | SHA256 | Execution |
|---|---|---|
| compare.mjs | `4574213c39e1e075bcc2f7533985d4792db0c72153f2c3a8ae9eb4845f57b318` | NOT_RUN |
| compare.test.mjs | `a3ebf0782bb15ac5706ffa9e08583cc399b08fe8371cfbf63e7a97d08b2c715b` | NOT_RUN |
| compare.test.pre-recovery.mjs | `cbf58a901f2b83b39627b3ac3b281c1624e7694963c5de6745aede7809476ff6` | NOT_RUN; preservation only |

## Entry point

`comparePackages({ leftRoot, rightRoot, policyPath, admission, codec })`

No CLI wrapper is written. Importing the module loads only Node filesystem/path/crypto builtins and declares functions/constants; it performs no top-level filesystem reads. The accepted codec namespace is an explicit later-admitted argument, not imported by the comparator. Source files are later read as bytes for hashes, never imported.

| Input | Caller supplies | Comparator calculates | Output |
|---|---|---|---|
| Frozen policy | Exact policy path | 14,912-byte/SHA binding | Retained hash record or NOT_COMPARABLE |
| Source-shape clarification | Root-reviewed addendum path, bytes, digest, admitted:true | Raw addendum binding | Recorded separate authority; original policy defect retained |
| Admission | Exact absolute source root/manifest path, retained manifest/protocol/attestation Uint8Array bytes, Node executable, runtime identity, two independent outer observations | Pinned input metadata and exact expected request/source models | Expected success model and anchor/source hashes |
| Original/replay packages | Two distinct absolute external output roots | Fixed file-set/hash/manifest/receipt/wire/within-run validation | Two independently valid package views or failure |
| Cross-run values | Validated views | Exact raw value/answer bytes and decoded trees | Exact comparison checks |
| Cross-run clocks | Validated views | Only 722 sidecar and 176 calculation-fragment numeric leaves | Both raw numeric values, exact whitelist pointers, complete raw timing records |
| Derived bindings | Validated raw bytes and envelopes | Narrow already-proven file-binding consequences | Envelope check or first difference |

## Actual execution order

1. Read and hash-bind the frozen policy. Require and bind root's separately reviewed source-shape addendum. An absent gate yields NOT_COMPARABLE, never original-policy PASS.
2. Verify retained protocol and attestation bytes against fixed digests/lengths. Parse the retained small manifest and hash-bound attestation as ordinary JSON; derive the exact source-known request binding, including all six supplied-file identities, staging/decoder testimony and resource/settings/claim strings. No image, PNG, RGBA or mask body is loaded.
3. Read/hash the five frozen Lenard files, unchanged legacy codec/writer/recipe, and nine physical closure files. Build exact expected sourceBinding records from those byte identities, never execute them.
4. For each output root independently, reject missing/extra files, unexpected directories and symlinks. Read ordinary pretty JSON artifact manifest (not tagged codec). Require its exact schema/status/ordered338 metadata. Bind each artifact's actual byte length/digest before decode. Decode only wire artifacts using caller-supplied unchanged codec and its unchanged limits; require re-encoding to reproduce exact wire bytes.
5. Independently require successful trace/sidecar shape, exact fixed160-query plan, predicted completion counts, native capture order/metadata/cache/null fields, all182 interval metadata/arithmetic/order constraints, native rounding and nested-duration constraint, source/request/integrity checks, actual Part-key consistency, exact claims. Compare each answer fragment to its own query row and each calculation fragment to its own raw sidecar capture.
6. Read ordinary pretty JSON CLI receipt and require every field to match the source model and its own manifest/artifact bindings. Validate each supplied outer record's exact argv, observed exit0, exact one-line stdout and empty stderr. Preserve stream hashes.
7. Compare value trace and160 answers byte-exact and tree-exact. Compare sidecar and176 callback fragments with only the frozen bounded numeric leaf sets. Unknown keys, order/type/constructor differences, missing/null changes, NaN/null, signed zero and all unlisted elapsed/computed fields remain exact failures.
8. Only after those files pass, allow their individually verified dependent bytes/SHA values in manifest/receipt to differ. Other envelope fields remain exact. Rehash frozen sources after comparison.
9. Return MATCH_EXCEPT_DECLARED_TIMING only after all checks pass. Otherwise report FAIL or NOT_COMPARABLE, the first stage/pointer and native raw values, known hashes, and explicit NOT_RUN remaining checks. Report is an in-memory value tree, not ordinary-JSON-safe serialization; caller must preserve NaN/-0/typed values losslessly. The comparator does not write or retry anything.

## Explicit boundaries and retained defect

E1512 `exactProvenanceAndIntegrity[4]` ambiguously assigns `error:null` to per-query checks. Frozen recipe pushes exactly `{planIndex,post,verified}`; snapshot record has `error:null`. E1512 is not changed. Code follows the actual frozen source shape but refuses successful comparison without root's reviewed append-only addendum. Root supplies the separately admitted addendum digest; this is not output-informed tolerance widening.

The external packet remains responsible for authenticating the supplied codec namespace, observations/runtime identity, original-before-replay chronology, fresh external directory reservation, immutable artifact retention, and exact single replay admission. The comparator verifies retained evidence contents and physical source hashes, not execution authenticity. It cannot manufacture trustworthy outer observations. Source hash identity is not executed-code authentication.

Eleven hand-declared NONCV helper tests cover exact tree semantics, narrow timing leaves, finite/arithmetic/order/rounding constraints, literal plan geometry, missing captures, byte/hash guards, ordinary document parsing, strict native capture metadata/order, whitelist bounds, artifact ordinals and null-mask declarations. They contain no measured answers. Full synthetic file-package integration fixtures are not written or claimed; actual comparison and replay remain separately deferred.

## Prospective commands — NOT EXECUTED

```
node --check discovery-cycle06/V1/E1515/compare.mjs
node --check discovery-cycle06/V1/E1515/compare.test.mjs
node --test discovery-cycle06/V1/E1515/compare.test.mjs
```

Do not run the preserved recovery copy as an additional hidden test suite. Await root's explicit GO and reviewed source-shape addendum before any syntax/import/test validation. Actual ONE160 replay and independent comparison require a separate later packet; no warmup, corrective retry, or hidden replay is included here. Scientific/human/path/continuity/calibrated-width acceptance remains UNKNOWN.

Review requested: Is this exact actual flow, source-shape-clarification gate, and bounded NONCV command set approved for the next separately admitted validation step?
