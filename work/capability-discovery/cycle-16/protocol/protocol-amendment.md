# R4607 minimality amendment

This separately recorded amendment applies to E4607 protocol SHA256 `6da57b85ba0f9142eab150d67f275ce993214494bd2ec791fc919026c4ad0cbe`. The original protocol remains unchanged. Root requested this amendment before implementation/execution; S3 accepts it as preserving the representation-consistency audit and its falsifier.

Replace only the requirement to copy the complete parsed original measurement into `result.evidence` with an explicitly disclosed audit-evidence projection. Do not duplicate the unchanged 1,808,041-byte old measurement/profiles in the new result.

The authoritative original remains the exact tracked repository artifact:

- Source base: local `f101061bd7547f0c350bc8c0f8ce126215047990`, canonical `c0f1205d3e3f66fc1a89fed5e4c3447e7f9045b2`, tree `403b74db31d121a559609ae6a2a3189fdf8de188`.
- Repository-relative path: `work/capability-discovery/cycle-09/evidence/E3012/measurement/measurement.json`.
- Bytes: `1808041`.
- SHA256: `fc5da1eb88c0bb572506e815e653c94ddc71ba6d66b8832d513e889477fa95b1`.

The result must retain all 12 row/all 60 slot identities in original order; frames, nominal widths, origins and saved edge/midpoint coordinates; all rawCandidate fields actually used by admission/comparisons including status, finite positive fit fields and both saved offset representations; all observed/unknown states, reasons and association/validation outcomes; saved row errors, run/isolate/completeFive context and saved prediction context; complete new descriptors or explicit errors, per-slot actual/expected/residual/status, all dependent-frame comparisons/unavailable cases, call counters and every failure.

For omitted old profile/rawStations/long-context material, retain unambiguous raw-context references bound to the authoritative path/hash and row index/ID plus JSON pointer. For example, a retained row may reference `/rows/0/rawStations` and its original row pointer `/rows/0`; global context may reference `/input/longContext` and `/predictions`. Keep the original parsed input unmodified in memory during the pass, but it need not be serialized wholesale into the result. Admission must still inspect retained rawStations station/frame identity and the unique matching nominal-width candidate against slot.rawCandidate; omission from the output is not permission to omit those checks.

Verify the original input's exact length/hash before any geometry and again after the single actual pass. Preserve dependency/new-source before/after custody as originally required. README, result qualifiers and CLI must plainly identify the output as an audit projection; never call it the complete original payload. The pinned original remains available for full context inspection.

All other protocol provisions remain unchanged: existing pinned describePath only; 12 attempted calls/all 60 slots/42 observed/18 unknown; literal null missing pairs; numerical tolerances; fitted-versus-nominal normalization separation; full single-pass retention before STOP on a failure; no retry/repair/tolerance changes; FIRSTGREEN expectation rather than fabricated RED; adapter fixtures are not an actual audit; separate written-flow checkpoint before tests/geometry; no duplicate reviewer geometry absent a fresh failure; symmetric-swap blindness; software-only meaning and physical claims UNKNOWN/HOLD.
