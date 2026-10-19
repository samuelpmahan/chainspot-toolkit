# E4413 / S6 — captured-data audit

Artifact-only audit passed (renderer exit0). Inspected PNG is 1400×700, legible without clipped hashes: display uses explicitly shortened identities; complete identities and rows are in [audit.json](sandbox:/workspace/scratch/86659bbafcce/lab14/S6/E4413/audit.json) and [audit.tsv](sandbox:/workspace/scratch/86659bbafcce/lab14/S6/E4413/audit.tsv).

![Captured A/B/A2 ranked alternatives](sandbox:/workspace/scratch/86659bbafcce/lab14/S6/E4413/view.png)

Exact captured full rows, every raw/leg/factor field, group ordering, score/rank values, disk artifact bytes, base64 bytes, receipt hash refs, real SHA256 and PCR testimony relationships match the frozen four-row oracle. No ranking or PCR was recomputed.

| Captured bridge phase | Candidate rows (score, rank) | Artifact bytes | Artifact SHA256 | PCR runResultId |
| --- | --- | --- | --- | --- |
| A | a1(.9,1), a3(.6,2), a2(.6,3); b1(.8,1) | 2949 | 35e426e6edbcddad6e048e526a2e6a0ed6c6d90a8d9cdedcc00479811f64be3e | 889dbad132f77dde27a2546ef9827e03acdefb35946031ba554b7eaa0783b500 |
| B | a1(.9,1), a2(.65,2), a3(.6,3); b1(.8,1) | 2950 | 5d3b921b08ae7be8e5fdd0d4d35cb386e64fa03f527329661f5eb513ab1c64a3 | d637786ff5803fe9c14a3eb61a7f3231a5bbcb9a737d7daf013981fc6a645427 |
| A2 | same as A | 2949 | 35e426e6edbcddad6e048e526a2e6a0ed6c6d90a8d9cdedcc00479811f64be3e | 889dbad132f77dde27a2546ef9827e03acdefb35946031ba554b7eaa0783b500 |

Baseline desired capture exit1/3pass/1fail is the missing-capability failure (zero artifacts instead of one), not a ranking defect. Existing OFF rows retain correct ranking and disclosed equal opaque-PCR identity. Green capture exit0/4pass/0fail retains full alternatives. Winner-only control emits 1539 bytes/two rows, all phases hash `def91c02a1df75e2ffa68afbe06fd79b9fc2d62cbab8117486c2629baed42802`, PCR `868e41500f9aefe6be64e93554ffe953937473f0d13a08135d42f215671da5b1`; it loses alternatives and fails their identity condition. OFF-after-bridge still has no artifacts and equal opaque-PCR identity.

Captured source records, not a rerun: [baseline runtime.json](sandbox:/workspace/scratch/86659bbafcce/lab14/S1/E4411/baseline/runtime.json), [green runtime.json](sandbox:/workspace/scratch/86659bbafcce/lab14/S1/E4412/green/runtime.json). Exact source/raw hashes and artifact file paths are retained in audit.json.

Rendering provenance: initial convert failed with missing rsvg-convert; no PNG was created. Existing installed sharp then converted the unchanged generated SVG successfully; both attempts and stream-custody limits are retained in [conversion.json](sandbox:/workspace/scratch/86659bbafcce/lab14/S6/E4413/conversion.json), not hidden or overwritten. PNG SHA256 `7f35a322b98f8df7741a79bceab85769d2e9b3e271f6517a4fe96c4f7ab2bdd2`.

Scope: display and captured-record audit only. No provider import, producer/query/CV/decode execution, original-image access, ranking/PCR recomputation, source/repository/Git/native write, scientific-pixel or geometry claim. Broader E4412 regression is outside this audit. Native-image/Real44query HOLD unchanged.
