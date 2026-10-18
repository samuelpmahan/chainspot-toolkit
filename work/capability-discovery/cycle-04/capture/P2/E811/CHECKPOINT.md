# E811 checkpoint — awaiting root GO

Written in `caller.mjs` and `protocol.json`. Only the hash-only source descriptor,
file SHA256 reads and caller syntax check have executed. There is no PNG file,
staged source, adapter call, CV result, rendering or publication yet.

Entry point after root GO:

```sh
node /workspace/scratch/8528bb251845/discovery-cycle04/P2/E811/caller.mjs --execute-frozen
```

1. Verify this caller and the five frozen source/manifest hashes.
2. Build the prehashed128×128 PNG, write it once, then call unchanged staging once.
3. Reuse that exact staged source in both complete requests and hash those files
   before any CV call. Geometry is identical; only the ROI changes.
4. Invoke the accepted adapter once for A and once for B in fresh processes.
   Native V8 coverage records actual function entry counts without editing source.
5. Keep receipts, raw logs, execution fields, candidate absence and support refusal
   distinct; hash every output. No rendering or adaptive rerun is wired.

| Invocation | Supplied parts | Predicted retained evidence |
| --- | --- | --- |
| PNG staging | Same opaque gray100 PNG; fixed imageId/frame | Verified encoded/fullRGBA hashes and decoder testimony |
| A | ROI16,16,96,96; empty bank/training; fixed center station | UNKNOWN with two recipe branches, two profiles and zero candidate rows |
| B | ROI60,60,8,8; otherwise identical | UNKNOWN preparation refusal, no branches and zero recipe calls |

The adapter automatically verifies the unchanged accepted14-entry recipe closure
on A's supported path and retains full-original/crop controls. The caller supplies
all source, geometry, empty-bank and ROI choices; it does not infer widths or
interpret missing candidate rows as null fits. B is expected to stop before that
recipe guard or any composition call.

Results become inspectable as raw JSON/log/coverage files; no visual renderer is
included. Hash-only PNG construction is predeclaration, not decoded staging or a
CV producer. This is exposed engineering characterization of R806M1, not new
scientific evidence or implementation of P6's optional helper.

Root: is this the exact flow to release? Execution remains paused until GO.
