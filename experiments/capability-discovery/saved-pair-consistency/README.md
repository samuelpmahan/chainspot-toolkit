# Saved pair/scalar consistency — default OFF

An opt-in composition of existing dependency-free `describePath`, not new geometry or a producer. It checks agreement between E3012's already saved projected edge pairs and saved scalar midpoint offsets. No existing loader/default is changed.

`runSavedPairAudit()` returns DISABLED before inspecting other fields or reading/importing anything. The enabled request is exactly `{schema:'saved-pair-consistency-request@1',enabled:true,runId,measurementBytes}`. Only pinned E3012 bytes (1,808,041 bytes, SHA256 `fc5da1eb88c0bb572506e815e653c94ddc71ba6d66b8832d513e889477fa95b1`) are admitted. The geometry dependency hash is checked before import, after import and after the pass. New-source and input before/after hashes are retained; the CLI also rechecks the original file.

All12 rows/all60 ordered slots are mandatory:42 observed and18 unknown. Per row, one existing describePath call receives all five origins and same-slot observed edge pairs or literal null. No width/support inputs, gap filling, fit, score, rank, query, countTurns, pixel access or upstream replay. Fitted full-width normalization is compared to absolute saved pixel offset divided by fitted edgeFit.wPx; the signed saved nominal42/50 ratio stays separate. Absolute numerical tolerance is1e-9, not a physical threshold.

Output is an explicitly labeled **audit-field projection, not the complete original payload**. It retains all audit-used slot/candidate fields, association outcomes, saved errors/run/isolate/prediction context, complete returned descriptors/errors and every comparison. Raw profiles, rawStations and long context remain in the authoritative tracked original, referenced by repository-relative path/hash/source-base plus JSON pointers. No duplicate1.8MB payload is written. Exact original bytes are authoritative, not JSON reserialization.

After separate written-flow checkpoint approval, the sole author actual pass is:

```sh
node --test experiments/capability-discovery/saved-pair-consistency/recipe.test.mjs
node experiments/capability-discovery/saved-pair-consistency/cli.mjs audit --enabled --input work/capability-discovery/cycle-09/evidence/E3012/measurement/measurement.json --run-id E4608-firstgreen --out /workspace/scratch/afc0d51965a8/lab16/S1/E4608/firstgreen
```

Tests are small fabricated adapter guards only; no E3012 read or geometry execution. FIRSTGREEN is expected; there is no demonstrated current consumer defect or fabricated missing-module RED. The CLI creates a fresh exclusive directory, writes `result.json`, then reports that same captured result to `cli.txt`/stdout without another geometry pass. Non-CONSISTENT output exits1. Every per-row error is retained and later rows are still attempted once. Above-tolerance results require STOP after complete retention, before repair, tolerance changes or rerun, for independent validation. No renderer is implemented or authorized here; later display must consume the exact captured result only.

The saved8.090622377680736px short1 offset already contradicts nominal-origin-equals-fitted-midpoint; that is not newly discovered producer evidence. Crop/source views differ by `[400,1010]` and are dependent. Paired scalar/coordinate representations share their fitted source. Symmetric left/right swaps are invisible to midpoint/Euclidean/absolute-offset comparisons. Even a CONSISTENT result establishes no fit correctness, physical edge/path identity, calibrated width, continuity, AA, ownership, confidence, causality or generalization: all remain UNKNOWN/HOLD. Returned incidental polyline lengths/turns are not interpreted as physical routes. This is trusted fixed-artifact engineering, not hostile-input authentication, a security sandbox or a general serializer.
