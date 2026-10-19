# R2023 — accepted source-only exporter adaptation

Decision: **accepted**, for exact E2023 exporter source only. No mandatory exporter amendment found. This does not approve the unfinished copy-helper repair, final physical manifest, commit/config, or any actual export run. All runtime gates remain HOLD.

Reviewed complete new147-line exporter10612B SHA256 `826088766cfe4e840860ee1c213f1a895a6c77ca4bcbae6279c02f0881f6ca25`, complete old Lab6 exporter10586B SHA256 `ed7920523765cf7dd64378fd5904e16ba7fc0e98a7fd761b7123b2f5b76e5c87`, full retained diff/FLOW/result, and a fresh ordinary source diff. No Git command was used. Prior Lab6 success is root testimony, not a replay or new runtime evidence.

## Findings

| Exact E2023 lines | Independent source finding |
|---|---|
|1,9–13,40–41,73,134|Fresh diff contains only intended provenance comment, fixed parent4f24d50391927e0e50220690ea8ececec79e0bb4/tree27616cbaac38b1b916fc337d22dd8f7cab5a7736, cycle07 prefix, four joint-fit paths, five-to-four diagnostics and schema. No operational algorithm change. |
|14,25–34|Unchanged60000B serialized segment,1000000B index,64MiB per Git-command buffer and65536B config-size checks. Fatal UTF8 plus byte roundtrip preserved. Config cap is checked after readFile, not a bounded-read/RSS claim. |
|36–50,58–73|Explicit immutable cfg.commit/tree required; HEAD/branch are equality guards. Exact single local parent and actual trees required; four required changed sources plus only cycle07-prefix changes. Canonical repository/fresh external scratch output and safe relative paths retained. Caller-reported remote parent is not authenticated or reconstructed. |
|65–93|Reads actual Git tree/blob objects using read-only argument-array commands. Blob type/mode100644 or100755, recomputed framed Git SHA1, source SHA256, manifest blob SHA256 and per-entry SHA256/optional byte count preserved. No canonical object or metadata reconstruction. All four source hash keys required; optional additional supplied allowed package hash keys are also checked, not silently ignored. |
|87–94|Native input contract remains manifest.files, not entries/archivedPath. For files[] with package-relative path, require reviewed cfg.manifestArrayRelative:true and cfg.manifestPrefix exactly `work/capability-discovery/cycle-07/` including slash. Repository-root-relative files[] uses false and already-prefixed paths, never absolute filesystem paths. The inherited object-map branch always concatenates manifestPrefix. Resolved path safety/prefix is checked. Do not invent a normalized manifest merely to fit this interface. |
|97–133|All actual changed blobs, actual modes/hash/length retained. UTF8 roundtrip or base64 preserves original bytes;12000-code-point text chunks adaptively split and36000B binary chunks carry base64/length/hash. Final serialized envelope guard remains60000B, including post-split segment counts. No codec/native numerical evaluation. |
|134–147|Index uses actual identities and cfg.commit; final console also correctly uses localCommit:cfg.commit. No undefined localCommit regression. Validate/prepare before nonrecursive fresh mkdir and wx file writes. Failure may retain partial output; no cleanup, retry or cap raise. |

## Manifest mismatch and pending configuration

The preserved E2022 draft copy script SHA256 `110bbc0e4dbdf858a346114760b5bf79abe9f9dc93deb83f4dbb092ea5e63f47` constructs `entries:[{archivedPath,...}]` at its manifest declaration. That cannot satisfy exporter lines87–89: manifest.files would be absent. This is a caller/copy-manifest mismatch caught before execution, not a reason to change the accepted exporter. Root reports an unexecuted versioned copy-helper repair to files[].path; that future version has **not** been reviewed or approved in this packet. No actual frozen native manifest exists as a reviewed input here.

For a future accepted files[] package-relative format, source-derived config requirements are: actual frozen manifest Git path/hash; manifestArrayRelative:true; manifestPrefix:`work/capability-discovery/cycle-07/`; exact four allowed source paths; allowedPrefixes containing only that package prefix; exact four hashes below; actual final commit/tree/branch; exact fixed parent/tree; canonical repository and absent output directory outside it. Neither cfg.manifestPrefix nor the boolean is independently schema-typed here; their concrete reviewed values and resulting paths must be checked, not inferred from a draft's name. Future package completeness and native metadata acceptance belong to separate copy/audit/config review.

Fresh source-only file hashing/stat agrees with accepted E2015 metadata (all POSIX644):

| Filename under experiments/capability-discovery/joint-fit-original-plan/ | Bytes | SHA256 |
|---|---:|---|
|original-evidence-plan.mjs|12666|0b6f2bad20177cd965085b3fbf889c008205653c03bcb72280d41769e17a001a|
|plan-core.mjs|20323|52ea18fd97e0112bd8aee255b73743a79bb2ab9842b0ec828314bff9c1c26ea5|
|plan.test.mjs|25500|44d810e1e0a19cb41afcc3ef0d085b364fc5fde52d278bdca6a049f4e0c270cb|
|README.md|8587|bf185d3c0e93763395c4c843d760c9439b4521a95c78aafe63536fefd17ca7bf|

These are current source byte pins, not proof they are present in a future commit. Future export must revalidate actual Git blobs at the accepted sole S1 commit. Final commit/tree/source manifest/config pins were not invented. Permission metadata and Git executable projection remain distinct; exporter preserves Git mode, not all physical POSIX bits.

## Limits and unperformed work

Inherited canonical path checks/exclusive writes are useful guards, not adversarial race/authentication/crash-durability guarantees. Prepared arrays and segments remain in memory; caps are per serialized object/per-command buffer, not aggregate export or process-memory bounds. Config/manifest JSON parsing is ordinary metadata parsing, not a generic hostile-input sandbox. None of these inherited limits was newly broadened.

Actual actions: source/JSON metadata reads, opaque source hashes/stats and ordinary diff only; writes only S2/R2023 review/receipt. No syntax check, module import, test, exporter run, Git command/write, new helper call, original plan/value body read, native decode, CV/render, repository/native mutation or publication. No runtime success is claimed. Preserve old/new exporter exact. HOLD until accepted physical package/independent copied-byte audit, exactly one S1 commit, complete exact root-reviewed config, and separate root export GO.
