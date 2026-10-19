# R4105 — accepted, scoped scalar adapter

No blocking source findings. Reviewed full `board.mjs`, `board.test.mjs`, and README at the requested hashes.

- Mechanical comparison proves the complete original baseline test body/assertions unchanged except the store's relative import, adapter import, and explicit loader-only adapter wiring.
- Preserved baseline raw JSON records exit 1: Map control GREEN; genuine loader RED (`1 !== 9`, changed root key but stale dependent key/hit). Separate baseline text files are reconstructed, not direct Buffers; the recorded stderr JSON is empty despite the text file's known transcription newline. No baseline rerun.
- ONE independent same-six-test run: **6/6 pass**, exit 0, stderr 0 B, stdout 2096 B, observed outer wall 195.391 ms. Direct child Buffers and before/after source pins are retained in `stdout.txt`, `stderr.txt`, `execution.json`. All source pins unchanged.
- Both Map and wrapped loader give 1→9→1; changed input recomputes, restoring 1 is warm with zero query calls; explicitly unrelated work remains warm.
- Four additional contract tests are FIRST-GREEN coverage only. Source/test checks cover receiver binding, Part identity, fresh key iterators, valid empty boards, duplicate/missing/invalid enumerated addresses and methods. Existing malformed `keys` fails instead of silently falling back to `addresses`.

Boundary: address-list completeness and board/Part immutability are trusted caller preconditions, not proven by this façade. README states them clearly. Snapshot enumeration cannot support live mutation; broad query-root invalidation remains broad. Actual native loaders, raster/CV, original queries, disk CAS, hostile providers and production wiring were not executed or proved. Default OFF, no production/Git changes. HOLD.
