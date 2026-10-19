# Closed original-evidence joint-fit argument planner — default OFF

This prototype helper binds retained original Lenard5 evidence and constructs a fixed48-slot joint fitted-center/fitted-width argument plan. It does **not** run stationContrast, create a store, identify a path, render, write artifacts, or provide a CLI. No production ABFeature/default-ON wiring or arbitrary geometry/root/evidence injection is exposed by its public entry.

## Exact adoption and engineering history

E2015 adopts E2012's original-evidence-plan.mjs (12666B, SHA256 `0b6f2bad20177cd965085b3fbf889c008205653c03bcb72280d41769e17a001a`) and plan-core.mjs (20323B, `52ea18fd97e0112bd8aee255b73743a79bb2ab9842b0ec828314bff9c1c26ea5`) byte-identically: no math, caps, default, pins or fixed-root changes. The73-test source derives from25563B SHA256 `83083e5ed749a76051bc7e88d1ded5dabadf01d687ccfa727f443b8bcec05589`; its **only** change is the codec import path to `../station-evidence/codec.mjs`. All existing3375 repository files remain untouched.

Historical chronology is retained: E2011's73 fabricated tests reached22 pass/51 fail; E2012 repaired the intended semantics without changing those tests; E2013's author command passed73/73; different-worker R2013 independently passed73/73 and accepted exact source/fabricated engineering only (receipt SHA256 `2b01e9f247a6d7c8d2640e60308797db2b4198f68c2beaf8603502b04146fca8`). These are two distinct executions, not146 distinct tests or original-data acceptance. The preserved test header “UNEXECUTED: no observed RED/GREEN” and core's “awaiting separately admitted GREEN” are historical construction text; they are not rewritten by later receipts. E2015 has **not run** the relocated tests, syntax checks, imports or helper.

## Closed entry and actual flow

```js
import { buildOriginalEvidencePlan } from './original-evidence-plan.mjs';
// Disabled is the default: missing/false own enabled returns DISABLED.
const request = {
  schema: 'cycle07-original-evidence-plan-request@1',
  enabled: true,
  token: 'cycle07-E2006-original-evidence-plan-v1'
};
// await buildOriginalEvidencePlan(request); // NOT ADMITTED by this adoption.
```

The entry statically imports Node builtins and its pure local core; importing definitions does not autostart the helper. The own enabled descriptor is checked before filesystem/source/native-value/codec I/O. Enabled accessors/nonbooleans are rejected without getter invocation; enabled requests require exactly the ordinary own enumerable data fields above. No caller output path, root, evidence, geometry, dependency or cap option exists. The literal token is an admission identifier, **not** durable cross-process spent-token enforcement.

An enabled call would, in order:

1. Verify exact fixed absolute protocol/input/raw-manifest/receipt/source22/original-protocol/attestation/shape-authority identities, every22 source body and all selected opaque raw bodies under bounded no-symlink descriptor/hash/EOF checks. Source22's declared100644 mode is checked as metadata, **not actual POSIX filesystem-mode verification**.
2. Bind original160-answer/176-callback manifest counts and48 slots (j=3*c+b), selecting96 fit/control fragments plus176 callback context fragments. Hash opaque bodies before importing the verified pure codec bytes. Encoded aggregates/fragments are retained under caps; whole native aggregate decode is not performed.
3. Select bounded tagged-wire metadata and small native records. Bind plannedQueries' ordered rawArgs, queryTrace's own state/error/nativeAnswer and separate callback.nativeEntry status/error/order/calculation/store/caller/site. Callbacks have **no args/rawArgs**; this is pinned-source attribution, not independent dynamic argument capture. Original profile local offset0 is seq0/capture1, lazy constant seq1/capture0; only offsets1..9 use seq/capture=offset+1.
4. Verify an inspectable inputIntegrityWitness with strategy `fixed16x10`: global canonical RGBA+strip-mask pre/post verification, request true/null, empty postErrors; then16 bounded snapshot records each with10 exact planIndex/post/verified checks, private null-or-strip masks and naturally materialized Part-key joins. There is no per-check error field. `postFiles` is a required root field, but its individual records are **not newly decoded/validated**; no full post-file audit is claimed.
5. Validate each raw nominal control before fit eligibility. Finite-invalid/NaN/-0 and numeric0/1 side flags remain unchanged. Source-impossible control +/-Infinity throws located lossless INTEGRITY_HOLD with raw value/answer/binding/query-state/callback status and no attached partial READY plan. A no-pair or unusable fit cannot hide that control HOLD.
6. Classify exact native fit records: seven primitive numbers all finite, raw wPx>0 and finite translated origin are eligible. Exact no-edge-pair and numeric-unusable retain skip reasons. Joint origin is unrounded `[Ox-cPx*Math.sin(phi), Oy+cPx*Math.cos(phi)]`, phi=-0.20539538918976738, raw wPx; no refined tol/latLim clamp, threshold, score/residual cutoff or winner selection. Derived args retain original windows/step/band[1,3]/along2/source-pixel frame.
7. Return a bounded detached lossless plan, encoded bytes/hash and bindings:48 slots, original fits/controls/attribution/witness, ordered derived args or null; execution states remain NOT_ATTEMPTED/NOT_EXECUTED with actualNewPATH/newStores/CV0. READY means planning, not any measurement.

Native Object.prototype records use exact own enumerable data key **sets**, with no hidden/symbol/accessor/undefined extras; ordinary arrays remain dense. Raw argument insertion order is a separate strict contract. Contrast support exports only stationsCount N and per-side ok flags; internal inside/outside support fractions are NOT_EXPORTED/UNKNOWN and must not be reconstructed via extra queries/pixels.

## Limits and nonportability

The entry still pins `/workspace/scratch/8528bb251845`, external `discovery-cycle06/G5/E1510/producer-v1` original evidence and cycle07 authority files. A fresh clone/new commit alone does not supply those exact bodies/paths. No remap, regenerated attestation, digest bypass, original image/plane/mask read or portable-original replay is implemented. The accepted original fixed160 recipe and separate E2012 runner/helper paths remain unchanged.

Unchanged guards:8MiB aggregate read budget; fixed prospective3,644,326B/304 descriptor-body reads excluding outside runner audit pins;2MiB public encoded output; per selected wire32768B/8192 encoded nodes, native codec depth32; encoded aggregate depth40/500000 nodes; answer8192B/callback2048B read bounds. Generic codec hard ceilings remain unchanged. Fabricated73 coverage does **not** exercise valid enabled real-root/source22/aggregate/fragment prehash, full aggregate counters or public2MiB output/detachment sufficiency. No peak RSS, concurrency/race resistance, execution authentication, actual original read total or full POSIX-mode proof follows.

No original fits/controls/conditional44 eligibility or new native measurement was observed by adoption. Same exposed pixels/fitted geometry remain dependent; joint c+w cannot isolate causes. Scientific/human/path/physical-edge/calibrated-width/continuity acceptance stays **UNKNOWN**. Source adoption ownership is not independent scientific review. Future CV producer G1–G6, durable token/writer/cumulative16MiB controls, source review and explicit admission remain separate.

## Next gate and prior evidence

Root must read exact adoption hashes, the one-import diff, all3375 before/after freeze and actual flow before separately admitting ONE relocated73-test command; a different worker reviews later. No test or enabled-helper GO is included here.

Reuse [Lab6 delivery evidence](../../../work/capability-discovery/cycle-06/delivery-v1/README.md) and its [648-file payload manifest](../../../work/capability-discovery/cycle-06/payload-v1/package-manifest.json), SHA256 `1d083ffd9f9eb4bd6082c4fe2427ab4a8ccc909144ec92b39c5baa9389c42873`. Root-supplied Lab6 published checkpoint `bae599193610f87b7809d06ab508b033c7241d83`, tree `27616cbaac38b1b916fc337d22dd8f7cab5a7736`, is a publication identity, not freshly remote-verified here; older delivery prose remains chronology. A later minimal cycle07 package should add only this source/tests/docs and bounded actual adoption/review/test receipts, linking prior Lab6 raw160/archive evidence rather than duplicating it. No Git stage/commit/export/publication/main/deploy or release is authorized by this README.
