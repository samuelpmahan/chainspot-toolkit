# Cycle05 — standalone station measurements

This is a bounded engineering checkpoint, not a detector or scientific release. The seven-file default-OFF station-evidence recipe reuses the existing public profile/edgePair/stationContrast/loss queries through the actual PartStore/registerQueries gateway. Existing 2062 tracked files and their composition/source-pixel/window contracts are unchanged.

## What actually ran

| Evidence | Actual result | Limits |
| --- | --- | --- |
| E1115 fixed synthetic producer | 8 cases, 32 PATH calls + 8 lazy constants; full answers and completion trace retained | All eight cases exposed; no heldout claim |
| R1115 independent replay | Exact tagged trace byte-identical; timing-bearing sidecar differs only in explicitly compared timing fields | Reproducibility, not independent physical evidence |
| E1116 / R1116 figures | Two SVG/PNG figures, complete raw-wire HTML, independent display review accepted; root viewed both original PNGs | No HTML browser visual QA; no producer in renderer |
| E1117 aggregate tests | 172 Node tests and 2 Python stager tests passed; first aggregate invocation of this exact172-test command | The42 new tests had already run; prior130 tests have history. Not full-repository green: 17 historical broad-suite failures were not rerun or cleared |
| E1114 adversarial checks | 59 bounded malformed/roundtrip/disabled variants retained | Engineering controls, not science |

The organic capsule and intact strip produce identical native answers across all four public queries. The 2px gap still passes the historical contrast proxy; the 6px gap has only two failed stations. Masked stations and all-hidden answers remain UNKNOWN, not continuity success. No semantic path identity, calibrated threshold, confidence fusion, physical width calibration, causal allocator gain, production readiness or human acceptance follows from these observations.

## Reusable operation and applicability

The current entry point is `experiments/capability-discovery/station-evidence/recipe.mjs#runStationEvidence`; the CLI is `node experiments/capability-discovery/station-evidence/cli.mjs run --manifest FILE.json --out NEWDIR`. Omitted/false `enabled` returns disabled with no source/pixel reads or vendor imports beyond inspecting the enabled descriptor. Enabled input is ONLY the frozen `synthetic8` protocol: 384×320 integer pixel-center coordinates, fixed eight cases, exact five RGBA buffers and three masks. The recipe deliberately rejects arbitrary images, geometry and Lenard presets.

The guarded flow is validate → private snapshot/hash → verify nine source modules → import → rehash → fresh store for each case → one combined lazy raster/mask constant → unchanged public PATH queries → post-hash. No cache repeat call is substituted for a measurement. Part keys, full raw answers, actual completion order, cached fields, native elapsed and outer call interval are distinct. The outer interval includes immediate onCall codec work and is not pure algorithm timing.

Positions, widths and path lengths are pixels; heading is radians; RGB proxy values are arithmetic RGB brightness units, not alpha. The station support is t∈[-8,8), step1, width30. Historical threshold8 is descriptive only. NaN/±Infinity/-0/null and Uint8 arrays are tagged without JSON collisions. Native profile already replaces some nonfinite values with null; that prior loss is not reversed. Native contrast nonfinite values and visibility masks remain distinct from zeros and failure.

Failure conditions include source/input hash mismatch, malformed/empty/sparse/unsupported input, resource overflow, protocol mismatch, existing output directory, mutation after snapshot, missing exact source closure or query failure. Preserve refusal and partial traces; do not silently repair, retune or substitute a fixture. The exact protocol is F4/E1102 `3b7f1d2b166c759997c73f820c433ff653c84114e83c28af62c68ec003967ff5`; gateway/codec addendum is F5/E1110 executable contract `645cd963d2815d49fbb543ffa4916acd70c545ca345f3b1cf8013b84c337dbb4`; seven-source freeze is `0a2351f595fd72d55af79fccb4532deb1b58125a2c440e37d6276fba5d21da4b`.

## Exact archive, not reconstructed history

`administration/capture-index-final.json` maps original paths to exact original/stored hashes and lengths. Byte-identical duplicates alias one stored object; beneficial zstd compression is lossless and checked. Executable evidence bodies have archival `.txt` suffixes, not modified source. `stage-replay.py` restores original names and separately labels path-only portable companions. Original trace bytes are never reencoded. See REPRODUCE.md for CV-free checks.

Only one real final capture exists. Active E1199 administration is captured explicitly/nonrecursively; later audit, ownership and publication receipts must be separately indexed rather than fabricated inside this freeze. Native snapshots are historical, not dispatch authority. Initial six-worker allocation is historical; current discovery registry has four workers, and HH9 has two separately active contexts. No free-slot or fixed-vs-adaptive performance claim is made.

Large Lenard3/4/5 original PNG bodies are deliberately omitted with exact Git object, encoded/RGBA identity and decoder testimony in the index. They are NOT restored or independently replayable from this package. The Lenard5 source-pixel protocol was reviewed but remains unexecuted and unsupported by the current recipe; crop inspection was not cropped measurement. Obtain exact originals only through separately admitted existing sources before proposing that extension.

Preserved historical failures include the E1105 raw result schema/native-finish rejection (root tool-transcript testimony only, no fabricated exported stderr), E1101 preflight normalization before finish (not a rejected run), the E1115 first inspection-helper path error before trace import, actual reviewer read-harness diagnostics, adversarial loader warnings, CairoSVG absence and approved Inkscape conversion warnings. Administrative phase-path and alias-cache findings were caught by source review before execution; first helper bodies are retained, not mislabeled failed runs.

Root accepted raw replay, display review and original PNG inspection before archival GO. Package acceptance, Git checkpoint and connected publication are separate gates; no commit, PR, main merge, deploy or default-ON is implied here. See RESUME.md and next-packets.json.
