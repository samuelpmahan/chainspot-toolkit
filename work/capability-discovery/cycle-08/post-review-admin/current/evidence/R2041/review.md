# R2041 / S4 — independent physical file audit

Decision: **accepted**, for the copied checkpoint's present physical engineering identities only. No test, project import, Git command/index refresh, copy, source edit, codec/value decode, producer/query/store/PATH/CV/build or rendering was performed by this reviewer.

## Actual checks

The main opaque audit ran2026-10-19T03:56:21.646Z–03:56:22.020Z. Every read checked regular type/nlink1, nonsymlink ancestors/final path, stable descriptor metadata and complete EOF. Every selected destination was compared byte-for-byte with its original source, and independently hashed SHA256/manual GitblobSHA1. Directory membership was additionally checked in a later read-only supplement.

| Scope | Independently observed |
|---|---|
| Selected new files |88 /510780B, exactly5 products+83 evidence including manifest |
| Modes |7 files100600;81 files100644; no permission normalization |
| Manifest |Exact original31545B;82 relative evidence rows and5 product pins deep-equal immutable map projections; self excluded |
| Runnable source |All4 products byte-exact to E2032 originals |
| Historical source |3 old `.mjs.txt` artifacts byte-exact and inert by suffix |
| Genuine empty files |3 actual0B stderr captures, including private100600 original |
| Prior files |All3757 /67009046B match pinned SHA256, manual GitblobSHA1 and current fullmode;0 mismatches |
| Auxiliary |Exact3 literal files retain pinned bytes/hash/fullmode100644, regular/nlink1; no contents interpreted |
| Whole physical file set |Exactly3848 =3757+3+88, equal at beginning/end; root .git only excluded |
| New directory set |Exactly16 derived directories, all40755, nonsymlink; no extra empty directory under either new prefix |
| Git metadata |Current opaque HEAD/ref/index bytes/hash/blob/fullmode agree with copy readback; index.lock absent |

All88 copied metadata rows also agree with the copier's readback. Complete sets of both new prefixes match the selected map plus one manifest. No folder waiver, auxiliary selection/staging or future admin coverage was inferred. No Git command ran and no semantic index/HEAD object audit is claimed.

## Exact authority/evidence bindings

- E2036/file-map.json33633B SHA7d7d8d033aa30611fb3d039d7b2516d6aa39402e075492279a22748406d86260:87 entries479235B.
- E2037/manifest.preview.json31545B SHA66437c565f0d35662b7f38ebe32b33224a47772b55b3cb1b802cdd9edb92977f:copied unchanged as manifest.json.
- Old3375 source-freeze.before.json866721B SHA0ed26380b6b39b6da944c358699f353657683bb338ebc1cc52fd6787d58d8a10 plus old382 commit-plan.v2.json146180B SHA4858425aebaf59bda5c5cada8aeb47be4a02152a22c329b087bd6bd3c14d2c6c define the3757 prior rows, not a newly invented baseline.
- E2041/realresult.json5097B SHA8fcf87d0f8fd66ed221e17a2125271c0bae0805fcf91cdee0b2c53c007cc4c9d and E2037B/copy-readback.json41749B SHAccae94bbee6ba99a50d66135b6dc71b5375342bfca7ea12c973bbb5a292cbe3d were parsed as metadata. All E2041 capture hashes match the receipt.
- Own audit.json48300B SHAc37885c217e720579ef3b2b6bcb66878fa70a686612b187e4fcae0dbb07dcc84 retains all88 current metadata rows, source bindings, counts, three auxiliary/Gitmetadata observations and exact aggregate serialization algorithms. Prior3757 tuple aggregate6bf25926854ac445dc7fe28503f3ff1db5b8dbada5ab6a52daf3e813ff82f47d; physical3848 path aggregate48453df8bab21b048ac46e45e2f16120a73e791c0b19405d518712c10bd9f611.

## Provenance, errors and scope

Actual copy/captures are E2041; the unmodified reviewed copier embeds E2037B in its readback. That distinction is expected, not a relabeling failure. The first E2037 attempt actually failed before copying at its old inventory guard; old3757 hash/mode and Gitmetadata checks were NOT_REACHED then. Later success and this independent current audit do not erase that failure. Its already reviewed receipt/raw history is reused, not claimed reexecuted here.

Two reviewer setup errors are preserved honestly: initial filename lookup requested nonexistent E2041/result.json (tool exit2) before locating realresult.json; then a builtin setup assertion used my unsupported full expansion of root's abbreviated8fcf... pin and failed(exit1) before physical audit. Actual8fcf87d0... was then explicitly confirmed by root, who authorized the same-scope readonly audit to resume. No input/source/old record was edited; no actual payload mismatch was established. These original tool outputs are TOOLTESTIMONY, not newly invented raw capture files. There was one completed full physical audit, not a retried copier/test.

Concurrent E2039 relocated tests and later NEWadmin are not consumed or accepted by this audit. All88 are accepted only at observed identity; adding anything later requires separate admission/audit. No staging, commit, export or publication authority follows. Check-time preservation is not atomicity/fsync, durability, race/crash/host isolation, RSS/cap sufficiency or physical/scientific/causal/producer closure. Original data/report/pixel bodies were opaque bytes where included in the prior file set, never interpreted or decoded. Historical E2007 tagged-text incident remains excluded; no blind-review claim.

Only NEW R2041 audit/review/result were written. Materialize separates setup failures, actual copier provenance and independent current physical checks. **HOLD after result; no further action authorized.**
