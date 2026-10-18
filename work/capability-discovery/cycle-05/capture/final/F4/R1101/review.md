# R1101 — independent source-contract review

Decision: **accepted** for source reconnaissance only. No implementation, measurement, protocol, runtime trace, integration, publication or scientific acceptance is granted.

## Exact reviewed bytes

| F5/E1101 artifact | SHA256 |
| --- | --- |
| result.json | 521dce9a8636d658cd35e0485b8a697a1143373edf5d55f31444d4b2df6cf3f8 |
| source-manifest.json | 9d659231df8e5ce72552a0501a1e240d9f68842a6d8c1b5d2e073141472d1cb5 |
| contracts.md | 200a1d935d4baaf11bdeedbf684b84c38c013137085e77250751109d768813e6 |
| exactpublic-example-proposal.md | 8b4dbc469151a4e8d0c6b71fe8deaf3cf843345cdf7642a133dbb41848f28f30 |

The raw result uses `packet:E1101`, not `job_id`; root's separate preflight normalization is not a worker-source defect and does not alter the reviewed raw bytes. No native rejection is inferred.

## Independent checks

All nine physical module paths passed byte-length, SHA256, Git-blob SHA1 and exact static-import-list verification. They have eight distinct byte identities because the two alpha-contract paths are byte-identical. Static closure is seven gateway paths plus two path-math paths, with no `fg/profile.mjs` import. No product module was imported. All five preserved-observed files rehash; catalog has 16 operations and recipes has three recipes. HEAD/tree remain `036d3e14416c40266917c51a0fe8d03785b050f3` / `e21271ef77a501d4f41d1c9456ce1d23a87c5add`, with clean repository status. Published identity remains dispatch testimony, not independently verified here.

## Contract findings

1. `pathSpace.mjs#profileAt` averages unmasked tangent stations separately at each of 241 offsets. `PATH_QUERIES.profile` returns compact offset metadata, ordinary profile/count arrays and station count; it changes native NaN to null. `PATH_QUERIES.edgePair` recomputes its own profile rather than consuming the prior answer. The packet correctly describes support gates, pre-subpixel width/center gates and no guaranteed single-station fit.
2. `stationContrastAt` uses 25 default sample positions per inside/outside mean per side: five tangent taps and five distances. Masks drop samples; the side-valid rule is strictly greater than 0.5 for both inside/outside fractions. Finite raw contrast can coexist with invalidity. Zero surviving samples yield NaN; validity is retained separately. Public keys are exactly `leftLum,rightLum,okLeft,okRight,stationsCount`, with ordinary arrays preserving raw NaN before serialization. The table's sentence “No samples can yield NaN” is read as zero surviving samples; “Zero surviving samples yield NaN” would be editorially clearer, but its surrounding raw-NaN statements are unambiguous.
3. Masked availability requires strict interior `x>1,x<W-2,y>1,y<H-2`; sampled mask is hidden only when bilinear value exceeds 0.01. The adapter uses raster dimensions and `mask.mask` without checking matching mask dimensions. It performs no automatic mask dilation. RGB luminance ignores alpha. These source facts support the packet's caller-validation warning.
4. `lossAt` ignores bandPx/alongPx/lat0Px, reruns default station contrast, and repeats samples/overlay work. Edge-visible means both side flags; historical pass is raw minimum strictly greater than tau8, not rounded display minimum. Masked/unavailable stations end visible-failure runs. With no visible stations, fractions remain null even if native longest gap is zero. Gap objects are capped at eight in station output. Typed corridor arrays and proxy-overlay qualification are correctly described. None of these fields establishes physical path identity, calibrated width or independent evidence.
5. `createPartStore` does not register PATH_QUERIES automatically. Its constant inputs are lazy, write-once Parts, but values are not deep-frozen. `registerQueries` resolves every top-level string via store.get, uses a private answer Map keyed by exact function plus JSON.stringify(rawArgs), returns computed/cached emits, and shares nested answer objects. Fresh stores/private immutable bytes are needed. Query answer-cache emits and the general store cache's `entry.cached/key` are different. Public query count excludes the actual lazy constant invocation; the packet correctly calls this out.
6. The proposed public invocation syntax, scalar/array arguments and defaults match source. Missing string Parts throw before a missing-raster condition; `raster:null` can reach the native condition. The source's broad “never thrown” comment is not a safe-invalid-input contract. Future code must validate dense arrays, bytes, dimensions, finite geometry and bounded resource costs before imports/calls, and preserve raw nested typed/nonfinite values before JSON or generic canon normalization.

Exact four-query native unit strings, to be retained rather than replaced by display labels:

| Public query | Native unit |
| --- | --- |
| fn.q.path.profile | lum (mean of R, G, B) per lateral offset (px); ok: unmasked station count |
| fn.q.path.edgePair | px (l, r, c, w: lateral offsets); score, gl, gr: lum/px |
| fn.q.path.stationContrast | lum per station (inside band minus outside band), per side |
| fn.q.path.loss | fractions of visible stations; longest gaps px; contrast lum; overlay fraction |

## Protocol boundary

The F5 five-case example uses different brightness/capsule parameters and is explicitly unexecuted and unfrozen. It is not accepted as the main experiment and must not replace F4/E1102's eight-case protocol (file SHA256 `3b7f1d2b166c759997c73f820c433ff653c84114e83c28af62c68ec003967ff5`, canonical SHA256 `42e4f8a44c39b58782f6050e47a1e5af63c1a8949c207d3aa02d217a07f73f2f`). The main protocol's original integer pixel coordinates and -0.5 seam remain intact. Its producer admission still requires independent protocol critique and root GO.

No blocking contract defect found. No production/source changes requested; no new framework proposed. Query, CV, producer, test and product-import counts are all zero for this review. Only the requested scratch review artifacts were written.
