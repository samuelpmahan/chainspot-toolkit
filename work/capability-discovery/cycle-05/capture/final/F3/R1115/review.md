# R1115 — independent E1115 retained-result review and one replay

Decision: accepted for bounded engineering evidence. F3 inspected the actual CLI/recipe flow, reviewed retained native outputs without trusting author summaries, and executed exactly one separately authorized CLI replay on the SAME manifest into a NEW exclusive directory. No tuning, fixture/source/Git writes, extra queries, render, Lenard run or second replay occurred. Scientific/human/path/physical-edge/calibrated-width acceptance remains UNKNOWN; promoted=false.

## Actual replay

`replay-command.json` records the exact executable/argv/cwd before launch; `replay-start.json` records its start. The replay used F5's original absolute manifest, not a copied/reconstructed manifest. The CLI loaded and hash-checked the pinned raw files, reserved its new output directory before queries, and used the unchanged registered PartStore route. Raw child stdout/stderr and process status are retained. Exit0, no stderr; observed subprocess bounds2026-10-18T15:05:34.705Z..15:05:35.924Z. The launcher elapsed1218.926081ms is a local process-observation interval, not a CV benchmark.

Actual additional reviewer execution:32 requested/attempted/completed PATH calls,0 failures;8 lazy constants;40 native Calculation entries. These are replay executions in addition to E1115's original32/8/40, not a claim that validation is non-CV or that a second scientific source run was produced. No query beyond that frozen matrix was added.

## Independent findings

| Review | Observed |
| --- | --- |
| Raw value replay | Entire321477-byte tagged value trace is BYTE IDENTICAL to original, SHA25676cf61ee3be3cd56faa0fc7274d5a3a5b898fe954dc73571092549487fa11eb2 |
| Metadata/path seam | The same manifest keeps all11 supplied-file paths/hashes identical. New output directory appears in CLI stdout/artifact location, not valueTrace. No path normalization or metadata exclusion was needed |
| Sidecar replay | Every non-timing field matches exactly, including runtime metadata and all native entry fields; only215 explicitly named timing fields excluded,175 changed |
| Allowed timing paths | calculationLog[i].nativeEntry.elapsedMs/computedMs and intervals[i].start/end/elapsed ONLY; original/replay timing values and complete sidecar hashes retained |
| Artifacts | All74 manifest entries rehash correctly per run; all32 answer and40 Calculation fragments per run equal their aggregate decoded counterparts |
| Native order/cache | Per case completion order1,0,2,3,4; constant seq1,parent0,depth1,caller lazy:px.image.cropped,outParts raster then mask; PATH key:null,cached:false with separate emits.computed1; no cache-hit/freshness claim |
| Part keys | Both actual64hex materialized root Part keys present and stable through all4 answers per case; they match snapshot integrity provenance; no key-triggering extra call |
| Integrity | All7 frozen wrapper files,9 vendor module paths, protocol/numeric policy, original result/trace/sidecar/manifest and8 fixture files unchanged across32 bound identities; all per-query snapshot/source checks verify |
| Analytic checks | 1949 finite comparisons, all signed/absolute residual0 under frozen absolute1e-9. Additional exact structural/value checks retain nulls, NaN, flags, constructor/order/length; no tolerance for structure |

The retained review script reports54270 exact-check invocations; this is a driver counter, not independent evidence count. It checked every241 profile value/count per case, both16-station contrast lanes/flags, every expected fit field/condition, all2928 corridor bytes plus16 hidden-center bytes per case, historical edge denominators/fractions/gaps, proxy/null semantics, raw answer/log fragments, integrity records and replay metadata. Complete finite residuals and timing pairs are in review-evidence.json. F5's reported346 selected checks were not assumed or reused as the review oracle.

| Case | Observed diagnostic and limitation |
| --- | --- |
| intact | fit30,c=-.5,score36; raw bilateral45;16/16 historical tau8 passes |
| gap2 | fit30,c=-.5,score31.5; minimum27; all16 still exceed8, so a true pixel interruption is not flagged by that diagnostic |
| gap6 | fit30,c=-.5,score22.5 while t=-1,0 contrast0;14/16 pass; reported run2 is not six-column physical gap size |
| largeBrightEllipse | flat profile145, no pair condition, contrasts0, longest sampled failure run16; rejecting this distractor does not prove specificity |
| organicCapsule | ENTIRE nativeAnswer objects for all4 queries equal intact exactly, including all values/units/emits, not just selected scores; semantic path identity is unestablished |
| normalOffsetPlus6 | fit30,c=-6.5 with nominal-edge band contrasts0; demonstrates fixed-pose sensitivity, not physical absence or automatic correction |
| maskedGap6 | profile count10 everywhere; t=-3,-2,1,2 raw45 with validity0; t=-1,0 NaN/0;10 visible passes and no visible failed run do not restore continuity |
| allHidden | source public profile nulls/count0, no pair condition, station NaN/flags0, edge visibleCount0 and null fractions; longestGap0 is missing evidence, not proof of no interruption |

All loss corridors preserve Uint8Array types and actual source-rounded color bytes even when hidden; no alpha muting or zero filling. The no-profile overlay remains a white-brightness proxy with threshold:null/agreementCounts:null. Historical tau8 is not promoted to a new classifier. COMPLETED records actual execution, not scientific success; all scientific/identity claims stay UNKNOWN.

## Scope, retained history and gate

No prediction mismatch, replay non-timing difference or integrity failure was found. The initial read-only lookup used `sidecar.json` rather than actual `timing-sidecar.json`; it failed before replay, then the actual artifact was located and correctly hash-bound. No source/artifact was changed to resolve that path lookup. Both the one replay and the retained-byte review script succeeded on their first execution without repair/retry.

This review supports root's trace-only renderer gate for the exact original trace and sidecar. It does not itself admit or execute rendering, publication, Lenard, new queries or scientific acceptance. Replay shares the same fixtures/source and confirms bounded software repeatability, not independent physical evidence or real-course performance. Hash equality is content identity, not cryptographic execution attestation. Error/mutation branches were not injected during the valid replay; earlier E1114 preflight/codec tests are separate evidence and were not rerun here.
