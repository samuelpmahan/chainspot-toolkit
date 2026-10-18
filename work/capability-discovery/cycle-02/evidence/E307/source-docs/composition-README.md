# Local ribbon evidence composition — experimental, default OFF

Node 24 runs this bounded, dependency-free recipe. It composes exact previously bundled Dev72 and JS operations; it adds no detector, weights, tracker, course classifier or production wiring.

```sh
node experiments/capability-discovery/composition/cli.mjs --input input.json --out receipt.json --inspect inspection.html
node --test experiments/capability-discovery/composition/*.test.mjs
```

`runComposition(input)` supports an object-shaped input; top-level `null` is outside its reviewed domain. Finite validation is not a practical resource envelope for arbitrarily large rasters or windows. `runComposition(input)` in `recipe.mjs` is the module entry point. Without `enabled:true`, it returns DISABLED and executes no operations. `training-fixtures.mjs#trainingInput` makes a small exposed synthetic input, with explicit enabled:true, for exploration; it is not independent evaluation. Serialize its `image.data` as `Array.from(input.image.data)` for JSON. CLI paths resolve from the shell directory; there are no network calls or repository writes unless the caller chooses those output paths.

Input fields are mandatory when enabled:

| Input | Contract |
| --- | --- |
| `frame` | Nonempty name for this image's pixel coordinates; all nested frame fields must equal it. |
| `image` | `{width,height,data,frame}` with complete finite RGBA bytes. The operation snapshots these bytes. Existing sources read RGB; alpha is retained and not muted or interpreted as physical transparency. |
| `provenance` | `{imageId,rgbaSha256,geometrySource}`. SHA256 binds raw RGBA bytes, not a JPEG file or semantic geometry. Geometry provenance is caller testimony. |
| `training` | `{frame,segments:[{tee:{xPx,yPx},badge:{xPx,yPx}}]}`. Finite nondegenerate segments; an explicit empty array is allowed to expose the legacy fallback. Straightness, tee/badge identity and renderer provenance are not inferred. |
| `stations` | `[{id,frame,xPx,yPx,headingRad,t0Px,t1Px}]`. Unique names, finite poses and nonempty longitudinal windows. Distances are relative to each station origin along its supplied heading. |
| `localWidthBank` | `{frame,scope:'LOCAL',valuesPx:[...]}`. Distinct positive same-image candidate widths; an explicit empty bank is allowed. No width supplies meter scale. |
| `occluders` | `{frame,boxes:[{bboxX,bboxY,bboxW,bboxH}]}`; finite, nonnegative box sizes. Boxes are caller-supplied known occluders. |
| `edgeSearch` | `{latLimPx,tolWidthPx}`; finite nonnegative explicit search settings. These are caller inputs, not learned physical constants. |

Execution order is input/frame/hash validation; exact vendor SHA256 verification; immutable snapshot; existing `lumOf`; Dev72 tee/badge width learner; existing `assessLocalWidth` without asserted calibration; then raw `profileAt` and, for every station/candidate width, Dev72 observation, existing paired-rail guard, and JS `edgePairOf` on the already computed profile with that exact requested width and the explicit tolerance/lateral limit. No arange or implicit width search expands the candidate bank. The source tolerance can admit nearby fitted widths relative to the requested width. R306 found that the original `[width,width+1,1]` range could enumerate two decimal values; E308 repaired the caller and retained its failing regression and original source freeze. Raw learner selection is diagnostic only. Calibration is always UNKNOWN/null and promoted=false. No `heldOutCheck`, qualification counts, calibrated policy, profile-boundary safety or certainty is invented.

The sensor and profile channels have different sampling semantics. Dev72 uses nearest RGB pixels, five tangent samples spanning ±4px, edge delta2.5px and lift reference45, with its original box-majority visibility rules. JS uses bilinear RGB mean profiles, fixed normal offsets −30..30px at .25px, its original smoothing/count guards, and an adapter that marks integer pixels inside the same boxes as 1. JS bilinearly interpolates that mask and masks values above .01. There is no dilation or AA muting. These are separate observations; their agreement is not confidence calibration.

Every station retains all four lane channels, rail/interior/combined scores, rail mode, raw longitudinal profile and visible counts, all candidate fits and nulls. The JS fit averages the declared longitudinal window: it does not prove paired edges at every sampled location. Only a finite positive two-edge fit exposes `candidateCenterMinusFitMidpointPx=-cPx`. The sign follows the source normal `[-sin(heading),cos(heading)]`. A missing fit reports midpoint UNKNOWN, never offset zero. The optional normalized offset divides by the explicit nominal candidate width and is labelled accordingly. Dev72 scores are dimensionless lifts; JS score/gl/gr are RGB-mean levels per pixel. Profile-boundary fits can be weak and biased; no safe-boundary or uncertainty claim is made.

Raw numeric defaults (including empty-bank40 and hidden first-candidate returns) remain diagnostics. Missing, mismatched or nonfinite input evidence executes no operations and returns UNKNOWN. Nonfinite diagnostic scores are encoded as `{numberKind:'nonfinite',value:'-Infinity'}` in CLI JSON instead of silently becoming null. Frozen-source hash failure or operation mutation of the RGBA snapshot stops execution as an integrity error.

A visible interior can yield combined1 while both rails are UNKNOWN. A shifted valid ribbon can score0 at the fixed pose but still fit two edges. A bright capsule can produce exactly the same local data as a ribbon, and ellipse training can uniquely select a convincing wrong width. The wrapper cannot reject all organic components or establish semantic path identity. No stage uses gradient strength, separated width scores, few turns, fit offsets or an independent evaluator to manufacture acceptance. C2 evaluation is procedurally withheld until the candidate freeze is released by the root; the test fixtures here are exposed training data.

`--inspect` writes a self-contained HTML table/profile inspection of the actual receipt. It includes raw visibility counts, source provenance and UNKNOWN states. The CLI does not recenter, rerun with changed parameters, follow a path or assign endpoints.
