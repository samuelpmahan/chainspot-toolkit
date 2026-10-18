# E1200 scratch transport actual-flow checkpoint

Written only; no import, syntax test, self-test, Git commit/stage/export or source/CV execution. The immutable392-entry manifest and its checksum remain untouched during R1199 audit. This helper adapts the actual HH8 ASCII JSON text/base64 segmentation pattern, retaining exact whitespace/codepoints and reassembling every blob.

Entry: `node prepare-export.mjs ACTUAL_COMMIT NEW_SCRATCH_OUTPUT ROOT_APPROVAL_JSON`, only after accepted R1199 and a later explicit root GO. Approval supplies actual localCommit, exact accepted reviewPath/reviewSha256, and separately frozen postReviewManifest path/hash. No approval is fabricated now.

1. Read approval and exact review body; require E1200/root_go and R1199 accepted hash binding.
2. Read Git only: actual HEAD/branch/clean status, single local parent036d3e, base treee21271. Verify accepted manifest3569cc,392 entries and SHA256SUMS f13fc4. Read separately indexed post-review additions and their approved manifest hash.
3. Read all accepted committed blobs/hashes and all2062 prior committed bytes. Require additions only and exact changed path set =392 accepted entries +manifest/checksums +post-review additions/manifest. Allowed paths are exactly seven new source names and cycle05 package subtree.
4. Exclusively create fresh scratch output, never inside repo. Read each actual Git blob and recompute Git SHA1+SHA256. Store UTF8 Unicode-codepoint chunks (4000 codepoints) as ASCII JSON; binary chunks are36000 raw bytes with independent base64. Every segment≤60000 bytes. Original textual whitespace is not normalized.
5. Reread segments, concatenate decoded bytes and verify original bytes/Git blob SHA1. Final transport index≤1MB binds local commit/parent/tree, expected canonical remote parentb17fdb/common base tree, accepted source/package/postreview/review hashes, every file/segment identity.
6. Print exact counts/hashes. Root alone uses connected publication after fresh refs and exact tree verification. No shell push/fetch/reset/force, remote metadata reconstruction, PR/main/deploy or release/defaultON mutation.

The helper cannot create the local commit; F6 remains sole eventual source/Git owner and waits separate audit/commit GO. It makes only scratch file writes and read-only Git calls when later authorized. Native worker snapshots remain historical; release/retirement after actual final jobs/publication must be separately recorded, not pretended inside the old frozen payload. No worker remains alive between invocations by implication.
