# E1520 V2 — v3 condition-null checkpoint, NOT RUN

## Written in / actual work

`renderer-proposal.v3.mjs` SHA256 `a5f8ee7b60cdf7d4593bf1658e3ae6415dd0bf50f7cb128af810924dc7a29e2b`.

`renderer-engineering.v3.test.mjs` SHA256 `ab8eeda8a73981381706c9148d21afdeac536c5a690673a312a665b03ad7f627`.

These are versioned scratch files only. The v2 source (`620b804e80f16d9f8419ec7a6ab695592689862136c5e9917a67ff9c356e4a4c`) and v2 test (`5ceced183288255c1744673e52e31e8debaef618cbd6c9aad2270858f2cc8022`) were rehashed unchanged. V1 is not changed. No final E1520 receipt is written yet: root requested that only after an actually admitted test phase if this packet is extended.

No syntax check, module import, test, projection/string render, producer output read, codec decode, actual renderer output, source pixel/PNG access, product/Git/native/helper action or visual QA has occurred. Only source/review text reads, byte hashes, text diff and file construction occurred.

## Source finding verified

R2/R1518/result.json was read fully (SHA256 `64012f5868d79b03006970371cab7fc9f2d6ad657dbb5ed533c4422d34d7e041`). Relevant read-only pathSpace source shows its normal loss return explicitly contains `condition:null` alongside full edge/overlay/stations/corridor values. V2's own-property-only outcome discriminator classified it as `native condition: null`, causing compact SVG/HTML numeric suppression while detailed records stayed numeric. This is source/control-flow evidence, not a current producer observation.

Source authority remains the frozen `pathSpace.mjs` SHA256 `d0fb2bf5076a386a5c362b8fe034ab49ba5318fda2bd21eb74d30334ed6a105e`; relevant normal-loss, corridor and overlay metadata excerpts were read as text only. Units/settings/raw authority remain unchanged: loss fractions of visible stations, gaps px, contrast lum, overlay fraction; tau8 is an existing historical native setting, not a new threshold or acceptance rule.

## Entry points — future only

Real renderer remains `renderTrustedPacket({packetPath,packetSha256,outDir})` or its unchanged three CLI flags with the v3 filename. It is not admitted here. Its externally trusted input hashes, codec gating, literal validation, NEW output and raw-authority boundaries are unchanged.

Proposed bounded test entry after separate explicit root GO:

`node --test discovery-cycle06/V2/E1520/renderer-engineering.v3.test.mjs`

This imports v3 and performs synthetic in-memory validation/SVG/HTML/CSV string projection; therefore it is execution/rendering, despite no real output directory or files. Root has not yet admitted this invocation. No command in this document is an instruction to auto-run.

## Numbered actual source flow if later admitted

1. All trusted-reader/hash-before-codec-decode and fixed16/160 retained-row validation flow is inherited byte-for-byte from v2 apart from header/export/discriminator lines. No producer/recipe/CV/pixel runtime route is added.
2. `nativeOutcome` still checks missing answer first, then literal native null. Only a plain object owning a nonempty string `condition` is now a condition outcome. Literal `condition:null` falls through to `native value`. It does not rewrite the original field or envelope/value references, and it performs no metric calculation or scientific acceptance check.
3. The previously repaired attempted-identity and edgePair structural checks are unchanged, as are shared records, native counts, null/NaN/infinity/-0 handling, all width banks/16 anchors, raw links and UNKNOWN claims.
4. Existing SVG/HTML value-only branches now receive `native value` for a normal loss object; they quote its already-retained numeric edge/overlay fields. Detailed records and CSV formatting are unchanged. The existing pure `csv(records)` function is additionally named-exported so the one new fixture can assert the actual CSV token projection, not merely a copy of formatting logic. No CSV implementation/runtime behavior changes.
5. The v3 test preserves all previous twelve cases, changing only test-file header/module target and importing the existing CSV stage. Exactly one thirteenth test is added: a hand-declared full normal-loss object with source-shaped `condition:null`, base/support metadata, edge/overlay scalar objects, alpha metadata, agreementCounts, explicit sixteen-station arrays/gap lists, and typed corridor buffers with declared source shape. Illustrative literals are synthetic retained engineering data, not measured/derived scientific evidence. No native scalar is computed to build expected outcomes.
6. That new test checks `native value`, original object/corridor references and condition:null retention; expected numeric SVG strings and HTML cells; literal exact descriptive-record scalar tokens; and literal CSV rows for native count and null threshold. It also checks absence of the erroneous `native condition: null`. All thirteen tests are currently unexecuted; no RED/GREEN/PASS result is claimed.

## Invocation table

| Boundary | Inputs / arguments | Intended output | Invocations |
|---|---|---|---:|
| Real trusted renderer | Later root packet/digest/NEW directory | Original authorized report flow | 0 |
| Synthetic fixture | Hand-declared retained native loss, no producer | Full supported loss-shaped object | 0 |
| Validator/model | Existing synthetic fixed16/160 declarations | Original-reference rows and explicit outcome | 0 |
| String projectors | Same model/records and synthetic bindings | SVG/HTML/CSV assertion subjects only | 0 |
| Codec/product/query/pixels | Never supplied | No route used | 0 |

## Shared machinery / inspection / limits

The caller/root supplies execution authority and later, for real rendering, exact independent raw acceptance plus concrete trusted packet/hash. The model and existing projectors supply common labels/records automatically. A future admitted test would expose assertion results on stdout/stderr; it would not create report files, render real producer data, prove visual layout, or establish any scientific identity/continuity/calibration/acceptance.

Review this exact source/test checkpoint before any syntax/import/test/projection GO. If root admits a small red comparator, preserve original versions and specify the exact fixture/comparator/capture scope separately; none is authored or run by this checkpoint. Root alone performs native lifecycle actions. Hold for root's bounded execution extension; do not auto-run and do not write the final receipt before that admitted phase.
