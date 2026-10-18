# E1544 construction checkpoint — NOT_RUN

Written in `prepare-export.v1.mjs`:147lines/10586bytes, SHA256 `ed7920523765cf7dd64378fd5904e16ba7fc0e98a7fd761b7123b2f5b76e5c87`. This is a lean derivative of the fully read `hh-cycle13/H1/E1806/prepare-export-v2.mjs`, not another exporter framework. Only scratch construction/file reading/hashing occurred. No Git command, import/evaluation, syntax check, test, compression, export, CV, repository/native/remote write occurred.

The brainstorming/MEP skills paused construction after read-only reconnaissance. Root explicitly approved this exact bounded design and the1,000,000B index cap before source writing. The checkpoint skill now holds execution for root's full independent source read. Tests/TDD execution are intentionally NOT_RUN under root's explicit construction-only/no-tests packet; no GREEN or working-export claim follows from this source artifact.

## Proposed entry point — not executed

```text
node /workspace/scratch/8528bb251845/discovery-cycle06/R1/E1544/prepare-export.v1.mjs /absolute/root-reviewed-export-config.json
```

The root-reviewed config does not exist as an admitted execution artifact from this assignment. Root will later pin actual commit/tree/branch/repository, manifest and output before admitting any call.

## Caller-supplied config

| Field | Exact role |
|---|---|
| `commit`, `tree` | Lowercase immutable40hex commit and expected tree. `HEAD` is never input. |
| `repo`, `branch` | Canonical absolute workspace repository and exact expected current branch. |
| `parent` | Must equal canonical local `be67d44a653c79ca61efae99934e90475a9aba5e`. |
| `parentTree` | Must equal canonical local `87dfd9aebb09050d1c56e39d54d9a9920b93341c`. |
| `allowedExact` | Exactly the five `experiments/capability-discovery/lenard5-station-evidence/{README.md,cli.mjs,cli.test.mjs,recipe.mjs,recipe.test.mjs}` paths, no extras/duplicates. |
| `allowedPrefixes` | Exactly `["work/capability-discovery/cycle-06/"]`. |
| `expectedHashes` | SHA256 map containing all five exact source pins; optional extra pins must also lie within the allowlist. |
| `frozenManifest`, `frozenManifestSha256` | Committed package manifest path within cycle06prefix and exact SHA256. |
| `manifestArrayRelative`, `manifestPrefix` | Same interpretation as `tools/verify-git-transport.mjs`: array paths are already repo-relative unless the flag is truthy; relative arrays and object-map manifest keys prepend `manifestPrefix`. Root supplies the correct prefix. All final manifest entry paths must remain within cycle06prefix. |
| `canonicalRemoteParentReportedOnly` | Optional null/40hex caller-reported remote parent. It is not substituted for the actual canonical local parent and is not inferred, fetched, authenticated or written. |
| `output` | Absolute canonical new scratch directory under this workspace, outside `repo`, with an existing canonical parent. It must not exist, including as a dangling symlink. |

## Actual written execution order

1. Read absolute config file; require at most65536bytes, fatalUTF8 with `ignoreBOM:true` and byte-exact roundtrip before JSON parsing. Check commit/tree, fixed local ancestry, exact source/prefix allowlist, source hashes, canonical repo/output parent and absence. No output directory is made here.
2. Read only actual Git facts: immutable commit object, current HEAD, actual current branch, single-parent ancestry, canonical local parent tree and requested commit tree. Reject mismatches. No fetch/reset/checkout/index/metadata reconstruction or remote operation exists.
3. Read complete recursive tree and complete parent-to-commit changed paths with NUL-delimited Git output, fatal UTF8 byte-roundtrip and safe exact path parsing. `--no-renames` makes a rename expose its deleted old path; any deletion/missing target, symlink/submodule/nonblob or mode outside100644/100755 ultimately refuses. All five source paths must be changed; every changed path must belong to the exact five or package prefix. No newline splitting/trimming of path records or path normalization occurs.
4. Read actual immutable Git blobs by blobSHA1; recompute Git blobSHA1 with exact `blob <length>\0` header. Check config source/additionalSHA256 pins. Read committed frozen manifest, bind its exact digest, parse its supported files-array or files-object shape, then check each listed original blob's SHA256 and optional byte count. It does not rewrite package source files or build a package.
5. For every changed blob, retain exact mode, Git blobSHA1, SHA256 and original byte length. Choose text only when fatal UTF8 `ignoreBOM:true` decode and exact UTF8 re-encoding preserve every byte, including BOM and line endings. Otherwise choose binary. No original data is normalized.
6. Start text slices at at most12000Unicode codepoints (`Array.from`, so surrogate pairs are not split). Serialize actual ASCII JSON envelopes with actual segment indices/count. In each pass split every oversized text slice in halves and repeat with updated count until every envelope fits60000bytes. This is pre-write adaptation, not a failed-write retry or cap raise. An unsplittable/oversized binary envelope refuses.
7. Binary pieces are36000bytes except the last.36000 is divisible by3; intermediate base64 chunks have no padding, so concatenated base64 remains valid. Each piece records chunkByteLength/chunkSha256. Both encoding kinds retain the existing identity/segmentIndex/segmentCount fields.
8. Prepare all final ASCII segment buffers, their exact byte lengths/SHA256 and `sourceFiles`/`segmentFiles` entries in memory. Serialize the complete ASCII `transport.json` index and require at most1,000,000bytes. All segment/index size checks precede output creation and every write.
9. Create output with nonrecursive `mkdir`, then write every segment and `transport.json` using `writeFile(...,{flag:'wx'})` only. Print a JSON summary with actual local identities, file/segment counts, maximum segment bytes, exact index length/hash and output path. There is no remote/production write operation.

## Invocation map

| Stage | Arguments/input | Output |
|---|---|---|
| Config/file guards | Absolute root config; fixed local ancestry and allowlist | Validated caller values or terminal error |
| Read-only Git facts | `rev-parse`, `symbolic-ref`, `rev-list`, NUL `ls-tree`/`diff-tree`, immutable `cat-file blob` | Actual local commit/branch/parent/tree/complete changed set/blob bytes+modes |
| Source/manifest binding | Config expected hashes and committed manifest | Exact original byte/hash correspondence, not package/scientific acceptance |
| Text/binary encoding | Exact blob bytes and identity | <=60000B ASCII JSON buffers with compatible source/segment fields |
| Final write | New config-selected scratch output | Exclusive transport pieces plus <=1000000B `transport.json` |

Shared machinery automatically computes identity hashes, uses codepoint-safe chunking, adaptively sizes real envelopes, checks all caps before output, and preserves exclusive writes. Caller supplies actual identity/manifest facts and remains responsible for reviewing/admitting their meaning. Existing verifier cap1000000bytes is matched exactly, not the slightly larger binary1MiB.

## Compatibility, inspection and failure limits

The fully read `tools/verify-git-transport.mjs` expects `localCommit/localParent/localParentTree/localTree`, `changedPaths`, `sourceFiles` and `segmentFiles`; this source emits them with the unchanged per-file and per-piece fields. `tools/read-transport-piece.mjs` consumes the same per-file encoding/chunks fields. Their code was not changed or run. The verifier additionally requires a clean worktree and performs its own actual Git/manifest checks later; exporter construction does not claim those passed. The exporter's index schema is cycle06-specific, and those consumers do not require the old HH schema string.

No output exists from this exporter now. A later successful export becomes inspectable through `transport.json`, indexed segment byte/hash records and stdout summary, then a separately admitted independent verifier/read-piece run. Actual compatibility and transport counts are UNKNOWN until execution.

Any source/config/Git/hash/mode/path/cap failure throws and stops; no output is created until every prepared envelope/index cap check passes. A later mkdir/write failure leaves the exact first partial output in place; it is not overwritten, deleted, retried, recompressed or cap-adjusted. Git subprocess failures are terminal, with later runner responsible for preserving original stdout/stderr/actual exit. Git output is bounded per command at64MiB; all prepared transport buffers are in memory, not streaming. No hostile concurrent-filesystem/HEAD-race authentication, runtime deadline, remote authentication or new authority model is claimed.

Review requested: root must fully read this exact source/FLOW and pin the config and source hash before any separately admitted actual export. Does this match the reversible read-only transport preparation intended? **STOP: no execution/self-approval/publication authority is implied.** G6 remains sole repository/Git-state owner.
