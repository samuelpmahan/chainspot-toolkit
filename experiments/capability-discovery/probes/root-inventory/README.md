# Root inventory probe pack

This portable scratch pack evaluates cache-root evidence consistency and reproduces the adapter defect at exact platform commit `49255331791b1245cf0f9cd699816175f94e70f2`. It changes no production files and fixes no cache implementation.

Run with Node 22 or newer:

```sh
node --test root-inventory.test.mjs
node falsifier.mjs
```

`source/` is the eight-file static import closure for the unmodified store and profiler, extracted from the exact Git ref. `source-identities.json` records every file hash and Git blob. `source-evidence/s4-run.mjs` preserves the actual addresses-only adapter source. No build, network, repository checkout, external package, corpus, or generated native result is required.

## Guard contract

`assessRootInventory({binding, authoritativeManifest, producerReceipt}, trustAnchor)` returns `pass`, `fail`, `unknown`, or `unsupported`. All non-pass outcomes forbid cache reuse for this proposed guard. These outcomes are probe evidence, never scientific acceptance.

The trusted coordinator must independently pin the authority policy, issuer, scope, source/request/code binding digest, authoritative manifest digest, and immutable producer receipt digest. Pass the anchor from trusted policy, never from a producer's own receipt. Hashes identify exact canonical JSON documents using the bundled store's canonicalizer. The authoritative manifest must come from an inventory owner who knows the full query-readable provider-root set and constant roots. A query's observed read subset is useful to falsify completeness, but cannot establish complete closure. A caller boolean, an existing `keys()` method, or a self-issued manifest is insufficient. With no independently authoritative inventory, the guard returns unknown.

The guard compares complete authoritative address/key rows to producer-enumerated rows and checks exact binding, root digest and cache key material. A pass means consistency with the pinned authoritative manifest. It cannot prove that the inventory owner was truthful, that roots were immutable during execution, or that producer execution matched its recorded material; those require external attestation. It does not certify arbitrary code closure. Existing legacy receipts have no root-key material and remain unsupported for root proof; do not synthesize it after the fact.

Manifest shape: `schema: authoritative-readable-roots@1`, `issuer`, `scope`, `authorityPolicyId`, `bindingSha256`, `rows: [{address,key}]`. Producer shape: `schema: producer-root-key-witness@1`, `bindingSha256`, `rootRows`, `keyMaterial: {fn,code,args,inputs,roots}`, `cacheKey`. `binding` requires sourceSha256, canonicalSha256, codeClosureSha256, requestSha256 and storeSourceSha256. The test authority is an explicitly synthetic fixture; no real authority manifest is supplied by this pack.

## Observations and boundaries

The W6 falsifier uses independent stores sharing one cache, unchanged constants/code/args, and changed synthetic pixel bytes `[1,2,3]` to `[9,9,9]`. The actual `{has,get,addresses}` adapter and deliberately incomplete `keys()` return stale6 instead of27. Map and complete keys recompute27; same pixels hit correctly; changed constants, explicit pixel inParts and separate caches avoid this collision. These observations establish a narrow root-inventory defect, not current six-course poisoning.

`evidence/W4-observation.json` and the unchanged `W4-independent-repro.mjs` are independent prior W4 evidence: separate four-byte synthetic pixels produced stale10 instead of36. W6 does not label those prior observations as its own run. `evidence/W4-provenance.json` binds the copied artifact bytes. Constants can incidentally separate current courses. Mutation of objects after identity-memoized hashing is a separate invariant this inventory guard does not repair.

W3 may integrate the directory under `experiments/capability-discovery/probes/root-inventory`. This pack itself performs no source edits, Git operations, dispatch, acceptance, or publication.

Guard schema revision 2 repairs initial R206 AMEND: digest/key fields must be primitive64hex strings; wrappers, authority fields, root rows, material and input pairs are checked before classified use. Malformed material returns fail; absent legacy material remains unsupported and absent authority remains unknown. Initial `result.json`, `tests.log`, observations and source snapshots are preserved as historical evidence. Current `repair-E207.json` records the revised wrapper tests; it supplies no real authoritative inventory.
