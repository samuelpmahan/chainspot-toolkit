# Receipt-only ordered window evidence — default OFF

`groupWindowEvidence` hashes exact supplied UTF-8 receipt bytes and joins caller-declared station IDs to complete raw long/ordered-short station objects in both existing source-pixel branches. It imports only Node crypto. It performs no image loading, CV, coordinate conversion, scoring, fitting, source verification, filesystem/network I/O or automatic station generation.

```js
import { groupWindowEvidence } from './group.mjs';
const grouped = groupWindowEvidence({
  enabled: true,
  expectedReceiptSha256: exactExternallyRetainedReceiptDigest,
  receiptBytes, // Uint8Array or Buffer; exact serialized accepted receipt, not reconstructed JSON
  groups: [{id:'declared-comparison',longStationId:'long',orderedShortStationIds:['short-2','short-1']}]
});
```

The caller supplies bytes/hash and explicit group declarations only. No descriptor, geometry metadata, threshold, width selector or paths are accepted. Disabled calls do not parse bytes. Enabled malformed inputs return `UNKNOWN`, `UNCLASSIFIED_INVALID_INPUT`, `projection:null` and an explicit reason; hash disagreement has `errorClass:'INTEGRITY_MISMATCH'`. This helper's error envelope does not change the accepted adapter's throwing integrity behavior.

`EXECUTED` requires consistent paired branches, call count2, crop/source execution order, operation-label counts/concatenation, matching station/width sequences, finite linkage poses/windows and the retained equivalence object. Top-level `UNKNOWN` can be executed: all profiles, empty candidate banks, nulls and tagged nonfinite diagnostics remain intact. Current-schema branchless `UNKNOWN`/`DISABLED` receipts with empty operations, absent execution and explicit reason are `NOT_EXECUTED`; no measurement rows are invented and group IDs remain unverified. Contradictory shapes are invalid, not normalized.

`receipt` is the complete unmodified parsed receipt, including ungrouped stations and every source/crop difference. `projection` contains `crop` and `originalSource` raw station references in declared group/short order. Candidate order remains unchanged; no width or winning branch is selected. Cross-group station reuse is explicit and allowed. Raw objects are references within the retained parsed receipt. `receiptBytes` is a reference to the supplied bytes: the helper does not mutate it, but the caller must retain those original bytes unchanged. JSON serialization of the result's byte-array property is not a replacement receipt file; the bound exact bytes/digest remain authoritative.

Byte identity and structural consistency do not authenticate actual execution, source provenance, protocol timing or geometry truth. No continuity, physical-edge identity, path identity, calibrated width, scientific acceptance or AA benefit follows. In particular nT<8 structurally cannot satisfy the unchanged fitter guard; a null is never proof of a missing physical edge. Identical-pose Dev72 channels repeat regardless of profile window, and averaged profiles can use different visible longitudinal samples at different offsets. Original-world sample lattices/coverage remain caller-protocol evidence, not a helper computation. Both raw source/crop branches and fixed1e-9 equivalence differences are retained without repair.

Pure tests use hand-authored receipt-shaped fixtures and the exact retained E811 B preparation-refusal receipt, not CV runs or scientific cases. `fixtures/E811-B.json` is byte-identical to that exposed engineering control (SHA256 `daa7e63665a4c658489483e712b3133547b1ba23a13c1529084d221766d91974`). Sparse one-hole and partial-hole short-ID arrays are malformed, even when refusal IDs are unverified; every label index must be an own, nonempty string slot.

```sh
node --test experiments/capability-discovery/window-evidence/group.test.mjs
```

This new subtree leaves accepted d31b source pixels and5b59 composition unchanged. No production/default-ON wiring, CLI runner, persistence or publication is included. E812 checkpoint/review evidence is maintained separately from this reusable source.
