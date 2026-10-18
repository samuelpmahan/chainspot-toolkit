# R1102 — independent E1102 protocol engineering review

Decision: **accepted**, bounded to the exact frozen protocol, generator and fixture-byte inventory below. This is engineering pre-producer acceptance, not root execution admission, scientific acceptance, or acceptance of F1's earlier mathematical document. F4 authored the reviewed protocol/pixels; F1 independently reviewed and reproduced them. No CV source was imported or invoked, and no measurement outputs were inspected.

## Exact subject

| Frozen F4 E1102 file | Independently verified SHA-256 |
| --- | --- |
| `protocol.json` | `3b7f1d2b166c759997c73f820c433ff653c84114e83c28af62c68ec003967ff5` |
| `generate.py` | `090cf61def38f85c74db72be01ae89150f7d5c38ea2ba4d289e9fb1b47e29dde` |
| `inventory.json` | `c103c508e5cb8668bbc5069620046c3f5b2c3eea05d018af9d17169e308529aa` |
| `result.json` | `1f005165fbc66f696554165bed36882f254089de2d182a2a13e15713934a13ab` |
| `geometry.canonical.json` | `919c0b93cdc8e90eaac25edd2da8df23beba55d86f265f6d69473fd4babd7b2c` |
| `protocol.canonical.json` | `42e4f8a44c39b58782f6050e47a1e5af63c1a8949c207d3aa02d217a07f73f2f` |

Source was read-only and freshly rehashed: pathSpace SHA-256 `d0fb2bf5076a386a5c362b8fe034ab49ba5318fda2bd21eb74d30334ed6a105e`; imported alpha contract SHA-256 `9d1f316af6af2887e0c59bd7a2b0bc13d3305a817cfb6efffb42c8f3b238396f`. Git identity remains coordinator testimony; no Git operation was performed by this reviewer.

## What actually ran

Copied only the frozen `protocol.json` and `generate.py` into `F1/R1102/reproduction`, then ran that fixture generator there once. A separate read-only Python check compared all18 source/copy files, independently evaluated every raster pixel against the declared geometry, evaluated every mask pixel against its declared region, verified all inventory hashes/lengths, validated every PNG chunk CRC and IHDR, decompressed the PNGs, and compared decoded RGBA bytes to the corresponding raw raster. All checks passed. The exact regenerated inventory hash equals the frozen inventory hash. The18 compared files comprise protocol+generator, inventory+two canonical declarations, and13 fixture files; this agrees with F4's16 retained generated-file count.

Every raster is491,520bytes with alpha255 and grayscale RGB100/145 only. Bright counts: intact11,520; gap2 11,460; gap6 11,340; ellipse21,108; capsule4,538. Mask counts: clear0ones/122,880zeros; gap6 1,920ones/120,960zeros; allHidden122,880ones/0zeros. The full-height mask is deliberately6*320 pixels, not merely the180 removed stripe pixels. Its support semantics are explicit and not inferred from display pixels.

## Geometry, support, seam and public API

The half-open stripe [145,175) is exactly integer rows145..174, with midpoint159.5. Nominal O.y160 intentionally preserves center−0.5; no hidden recentering is requested. Gap2 [191,193) and gap6 [189,195) unambiguously remove2 and6 integer columns. The +6 case moves O to(192,166), not the stripe. The observed edge pair may consequently remain within latLim12 while expected-width edge bands lose contrast; this is pose sensitivity, not physical absence or an automatic correction.

Station x184..199 and the five longitudinal taps extend contrast support to x182..201. Nominal profile and loss lateral support cover y130..190; the shifted case extends to y136..196. The enclosing union x182..201,y130..196 lies strictly within x>1,x<382,y>1,y<318. Bilinear boundary neighbors with nonzero weights are covered. Integer x samples make the full-height mask's longitudinal classification exact here; fractional lateral sampling does not change that full-height mask classification.

Independently checked capsule/intact pixel equality throughout x182..201,y130..190. This enclosing footprint includes all four nominal public-query footprints, so the capsule is a valid equality counterexample, not an independent positive path example. Independently checked every ellipse pixel in that footprint is bright; hence a flat nominal local profile and zero local band differences are coherent pre-call predictions. The capsule is not compared under the offset pose, as explicitly stated by the generator.

All four named operations exist in exact `PATH_QUERIES`. `lat0Px`, `tolPx`, `latLimPx`, `minOk`, `bandPx`, `alongPx`, `profile`, `threshold` and `tauLum` are the correct public keys for the declared respective queries. Common `widthPx` is caller-supplied nominal geometry, not a measured result. `lossAt`'s internal contrast defaults match the separately declared band[1,3]/along2; its public tau8 is historical diagnostic only. It is correct not to pass the stationContrast band overrides as if loss accepted them. No source change or private/new CV primitive is required.

## Predictions, falsifiers and bounded resources

The seven prediction groups cover all eight cases and preserve finite/null/visibility distinctions. The gap2 prediction explicitly allows five-tap dilution; gap6 includes an entirely interrupted five-tap window. The mask prediction correctly permits a supported10-station long profile while invalidating central local contrast support. Full-hidden declares null fractions and visibleCount0 without interpreting longestGapPx0 as continuity. Falsifier output must be retained without changing fixture bytes or parameters.

The declared budget is8 cases*4 public queries=32 public calls,16 stations each. Each profile uses241 offsets, each contrast band uses25 samples; there is no sweep, recursion, external service, network request, or image/CV producer in fixture generation. Stored raw rasters total2,457,600bytes, raw masks368,640bytes, PNGs5,422bytes. These are small bounded fixtures; this review does not claim measured timing, peak-memory profiling, or allocator efficiency.

No engineering blocker or required protocol amendment was found. The exact subject remains unchanged.

## Limits and downstream obligations

- This acceptance covers the frozen fixture/protocol engineering only. Root must separately admit execution and bind a runner's exact orchestration, source/dependency closure, request and output identities; this protocol does not authorize silently extending the old composition.
- Qualitative words such as “around” and “near” are not a frozen numerical equality tolerance. A future automated comparison must declare its arithmetic tolerance before measurement; retain raw fields regardless. This is a runner-comparison obligation, not permission to tune the fixed protocol after seeing data.
- Nonfinite contrast, invalid-side support, missing overlay background and public condition objects must remain distinguishable. JSON's NaN-to-null behavior alone is not adequate semantic tagging.
- Fixture reproduction is independent engineering replay, not independent course/scientific evidence. All scientific examples and old results are exposed; no heldout claim is made.
- No claim follows about same physical edge, semantic path identity, calibrated width, real-world generality, alpha renderer identity, physical gap length, default-ON behavior, promotion or human acceptance.

F1 is idle after delivering this bounded result. Only F6 may integrate or mutate source/Git.
