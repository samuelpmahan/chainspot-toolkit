# E506 actual written flow before ordinary tests

Written implementation: `experiments/capability-discovery/source-pixels/adapter.mjs`, separate `stage-png.py`, README and synthetic contract tests. No adapter/test/stager has yet been executed, no image rendered and no Git commit/push performed. Existing composition remains unchanged. The checkpoint skill is applied; root/user already authorizes ordinary short contract tests after this actual-flow report.

Entry: `prepareSourcePixelRoi(request)` for crop inspection; `runSourcePixelRoi(request)` to call unchanged composition.

1. Without explicit enabled:true return DISABLED, no source or CV calls.
2. Validate complete decoded RGBA, source PNG/full RGBA hashes, decoder name/version, distinct crop frame/in-bounds integer ROI, and exact supported original-frame geometry fields. Missing/malformed/unsupported evidence returns UNKNOWN with zero operations.
3. Copy bytes, decoder testimony, ROI and all geometry. Hash copied full RGBA; disagreement with well-formed supplied hash throws integrity error.
4. Build source-derived conservative support envelopes for all training segment endpoints, station sensor centers and profile window endpoints. Any missing full crop support returns UNKNOWN with zero operations and explicit failures.
5. Copy exact contiguous RGBA row spans into crop. Translate training endpoints/station origins/occluder origins by integer ROI origin; preserve all scalar geometry. Hash crop and return frozen exact prepared recipe input/provenance.
6. For run only, verify exact accepted5b59 manifest bytes and all14 frozen source/guard/files. Call unchanged recipe with prepared crop bytes and translated geometry. Verify crop hash remains unchanged and freeze raw receipt.
7. Separate Pillow stage verifies caller-selected PNG encoded hash before RGB/RGBA decode; rejects other modes or RGB transparency metadata; records actual decoder version and no orientation/color/size changes. It writes a new source JSON only when caller runs it explicitly.

| Invocation | Input | Actual calculation | Output |
| --- | --- | --- | --- |
| stage-png.py | caller PNG + expected SHA + frame/id | encoded SHA, explicit RGB/RGBA decode, full RGBA SHA | source object; no ROI/CV |
| prepareSourcePixelRoi | source + integer ROI + original geometry | full hash, support, exact row copies, integer translation, crop hash | immutable prepared input or DISABLED/UNKNOWN |
| runSourcePixelRoi | same request | preparation,14-file closure verification, accepted runComposition | support/provenance + every raw composition channel |

Caller owns source/decoder/geometry testimony and named frames. Shared machinery automatically verifies available hashes, snapshots, transforms every supported geometry type and preserves UNKNOWN/negative outputs. Inspect `prepared.input` and receipt support/provenance/composition directly; no new CLI/HTML is needed because existing composition consumers can consume prepared input. Stager is separate and PNG encoded bytes are unavailable to the JS adapter, so encoded hash is explicitly testimony there. Unsupported geometry is rejected. Support bound is conservative and may abstain on otherwise usable crops. No actual course integration, semantic acceptance, calibrated width or production wiring is claimed. Two accidental producer geometry messages are disclosed; no course artifacts were opened and constants remain source-derived from prior frozen contract.
