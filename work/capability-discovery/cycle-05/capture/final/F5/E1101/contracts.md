# E1101 exact source / public query contract

Status: read-only reconnaissance, not a probe result. Existing math and query APIs are reusable without modification. A fresh, separately reviewed default-OFF orchestration is still needed; neither existing composition nor the receipt grouper supplies these new observations.

Read: repository README.md and REVIEW.md; cycle-04 README.md, RESUME.md and next-packets.json; width provenance; root-inventory source identities; exact relevant math, query adapter, store registration/call/cache source; accepted composition recipe. The source manifest records the exact bytes and closure. No new mining, source mutation, import-time math, producer, query call, Git mutation, or external API execution occurred.

## Geometry, raster and mask common to the math

`O=[x,y]` is in image pixels, `phi` in radians, tangent `u=[cos(phi),sin(phi)]`, normal `n=[-sin(phi),cos(phi)]`. At tangent position t and normal position o, image location is `O+t*u+o*n`. There is no world scale, path identity, rotation correction, alpha muting or AA model.

Direct context: `{lum,W,H,mask,raster}`. `lumOf(raster)` averages RGB, ignoring alpha, and memoizes a Float64 luminance plane by raster object identity in a WeakMap. Use distinct immutable raster objects per fixture. Direct `profileAt` / `stationContrastAt` need lum/W/H/mask; `lossAt` additionally needs `raster.rgba` for samples.

Public raster is `{rgba,widthPx,heightPx}`; public mask is `null` or `{widthPx,heightPx,mask:Uint8Array}`. `ctxOf` actually reads raster dimensions and `mask.mask`; it does not validate matching dimensions. `rasterOf` checks only truthy raster/rgba and integer widthPx, not height, byte lengths, finiteness or positive width. Caller validation must freeze all of these. The source comment promising data conditions never throw is not a blanket invalid-input guarantee: malformed arguments can throw/allocate excessively. Do not generalize from supported condition returns.

Scalar plane interpolation is bilinear, nearest-clamped at the image boundary. A point is unavailable unless `x>1 && x<W-2 && y>1 && y<H-2`; inside this domain it is masked if bilinear mask value is strictly greater than 0.01. No mask generation/dilation happens in the query adapter. Masked samples are dropped, not assigned zero contrast or physical absence.

## Existing low-level operations

| Operation | Exact inputs/defaults | Output and guards |
| --- | --- | --- |
| `profileAt(c,O,phi,t0,t1,{lat0=0,step=1})` | t is `arange(t0,t1,step)`, exclusive upper endpoint. Fixed 241 normal offsets -30 through +30 inclusive, step .25; lat0 shifts sample positions, not returned offset labels. | `{prof:Float64Array,ok:Int32Array,nT}`; each prof element averages unmasked t samples at that normal offset; ok is its count. All masked gives NaN at that offset. Empty T gives `{prof:null,ok:null,nT:0}`. Not a per-t profile. |
| `edgePairOf({prof,ok,nT},Wexp,{tolW=3,latLim=12,minOk={count:8,ofStations:.2}})` | Wexp/tolW/latLim in pixels. `need=max(count,ofStations*nT)`; at least .6 of 241 offsets must have ok>=need. | null if no prof, insufficient good offsets, or no qualifying pair. Interpolate bad offsets, 5-tap zero-padded smooth, gradient/.25, zero six endpoint offsets and bad offsets; rising+falling local extrema, nominal grid pair width within tolerance and midpoint within latLim; maximize min-side gradient, strict better only. Subpixel parabolic adjustment follows grid gates, so returned subpixel width/midpoint need not obey exact pre-adjustment bounds. Returns `{lPx,rPx,cPx,wPx,score,gl,gr}`; first four normal pixels, latter RGB-mean levels/pixel. nT=1 cannot meet default count8. |
| `stationContrastAt(c,O,phi,ts,W,{band=[1,3],along=2})` | Explicit ts array; W in pixels. Five inside/outside distances 1,1.5,2,2.5,3 from each nominal edge; default tangent shifts -2,-1,0,1,2. | `{cl,cr}` Float64Arrays and `{okl,okr}` Uint8Arrays, length ts.length. Each side is mean(inside)-mean(outside), using up to25 unmasked samples per mean. Validity is strict `min(insideFraction,outsideFraction)>.5`; validity0 may coexist with finite contrast. No samples can yield NaN. No threshold, calibration, fit or identity claim. “Pointwise” means one value per declared station, with this nonlocal 5x5 support. |
| `lossAt(c,a)` | a: originPx,phiRad,t0Px,t1Px,stepPx=1,widthPx,profile=null,threshold=null,tauLum=8. It uses stationContrast defaults; bandPx/alongPx/lat0Px are not consumed. | schema `nctk-s6-path-loss-profile@1`; width<=0 returns condition `no corridor width`; no stations returns formatted no-stations condition. Otherwise combines bilateral valid minimum contrast, RGB overlay proxy/profile, diagnostic edge/overlay summaries, station arrays, corridor. Full keys below. |

`lossAt` base fields: `schema,originPx,phiRad,t0Px,t1Px,stepPx,widthPx,tauLum`; normal output adds `condition:null,stationsCount,edge,overlay,agreementCounts,stations,corridor`.

- edge: `measure,visibleCount,passCount,passFrac,lossFrac,longestGapPx,gapsCount,medianContrastLum`. A station is edge-visible iff both side-valid flags are1; compares unrounded min contrast strictly `>tauLum`. Reported min and summaries use r3 rounding.
- overlay: `measure,alpha,threshold,visibleCount,meanOverlayFrac,medianOverlayFrac,passFrac,lossFrac,longestGapPx,gapsCount,noBackgroundCount`. Without supplied fitted path profile, it is explicitly white-overlay brightness PROXY, not learned alpha. Background is per-channel median at integer offsets W/2 < |offset| <= W; insufficient background or hidden center yields null. With threshold null, overlay pass/loss/gaps and agreementCounts remain null.
- stations: `tPx,edgeMinLum,overlayFrac,edgeGapsPx,overlayGapsPx`; only the first8 sorted gaps are retained here, although count/longest summarize all. It does NOT retain raw bilateral contrasts or their two flags; call stationContrast separately to retain them.
- corridor: `widthPx,heightPx,offsetsPx,ribbonHalfPx,rgbLevel,hiddenCenter,layout`; rgbLevel and hiddenCenter remain typed arrays. Its width is station count, not longitudinal span in pixels.
- Fail runs end on masked/unavailable stations. `lengthPx=consecutiveFailCount*stepPx`, not direct physical endpoint distance. With no visible evidence, edge longestGapPx can be0 while pass/loss fractions are null; zero is not proof of continuity. tauLum8 is historical diagnostic, not calibration or fresh acceptance.

## Public PATH_QUERIES table

All table entries take one object. At minimum supply raster and supported finite geometry. Common raster/mask are removed before the math arguments. Direct table calls return `{value,unit}`; registered store calls add `emits`.

| Exact public name | Additional accepted fields | Exact value shape / condition |
| --- | --- | --- |
| `fn.q.path.profile` | originPx,phiRad,t0Px,t1Px; lat0Px=0,stepPx=1 | `{offsetsPx:[-30,30,.25],profLum:number-or-null[241],okCount:number[241],stationsCount}`. offsetsPx is range metadata, not241 offsets. Empty gives `{condition:'no stations',stationsCount:0}`. NaN explicitly converted to null. Unit: lum meanRGB per normal offset; unmasked station count. |
| `fn.q.path.edgePair` | profile geometry plus widthPx; tolPx=3,latLimPx=12,minOk defaults | Computes its OWN profile then edgePairOf; does not accept a previously returned profile. Fit keys same as low-level; null becomes `{condition:'no edge pair'}`. Unit: normal pixels; score/gl/gr lum/px. |
| `fn.q.path.stationContrast` | originPx,phiRad,t0Px,t1Px,widthPx; stepPx=1,bandPx=[1,3],alongPx=2 | `{leftLum,rightLum,okLeft,okRight,stationsCount}` as ordinary arrays. These are NOT cl/cr/okl/okr. Unlike profile, Array.from has no NaN->null mapping; retain explicit nonfinite encoding in any eventual serialization rather than silently losing meaning. No explicit no-stations condition; arrays can be empty. |
| `fn.q.path.width` | originPx,phiRad,t0Px,t1Px; widthsPx=[18,60,1],tolPx=.75,latLimPx=3,minOk defaults | Reuses one default-step profile across width bank; ignores lat0Px/stepPx. Best fit plus `wgPx`, or `{condition:'no edge pair at any width'}`. Not calibrated width. |
| `fn.q.path.overlayFraction` | originPx,phiRad,t0Px,t1Px,widthPx; stepPx=1,profile=null | `nctk-s6-overlay-fraction@1`: kind,alpha,background,stationsCount,hiddenCount,noBackgroundCount,minBackgroundCount,overlayFrac. width<=0 -> `{condition:'no corridor width'}`. Unit overlay fraction, but proxy is brightness. |
| `fn.q.path.samples` | originPx,phiRad,t0Px,t1Px,widthPx; stepPx=1 | `nctk-s6-path-samples@1`: stationsCount,windowPx,lateralReachPx,offsetsPx,hiddenCount,layout,centerRgbLevel,lateralRgbLevel,hiddenCenter,hiddenLateral. Typed arrays retained. windowPx is half-width. width<=0 -> condition. Unit RGB level per station/normal offset. |
| `fn.q.path.loss` | lossAt a exactly as above | lossAt object above; unit fractions of visible stations, longest gaps pixels, contrast lum, overlay fraction. Does not expose full bilateral arrays. |

Every query with failed rasterOf returns `{value:{schema:'nctk-s6-path@1',condition:'<shortName>: no raster (pass raster: \'px.image.cropped\')'},unit:'condition'}`. Registering with a nonexistent string Part does NOT reach this condition: default resolver store.get throws first. A supported missing-raster condition can instead be requested with `raster:null`.

## Actual public gateway (fg/store.mjs)

`createPartStore()` does NOT auto-register PATH_QUERIES. Explicitly call `registerQueries(store,PATH_QUERIES)` then `store.call(exactName,args,{caller})`. `store.constant(fn,{'px.image.cropped':raster,'tk.s6.pathMask':mask})` declares lazy write-once root Parts. Default resolution applies `store.get` to each top-level string argument only. Nested strings are not recursively resolved; all top-level strings are interpreted as Part refs, not arbitrary prose. Use numeric geometry and arrays, null profile/threshold. No undeclared invented frame or case label string in query args. Keep metadata outside args.

`registerQueries` creates one private answers Map per registration. Cache key is literal `${fn} ${JSON.stringify(args)}` over raw args. On miss, resolve top-level strings, call table entry, require a value member plus string unit, store answer, return spread answer plus `{emits:{computed:1}}`. On hit, return same nested value via spread plus `{emits:{cached:1}}`; no deep clone or immutability enforcement. Key order can create misses. Equal references do not prove equal raster bytes if an object is mutated. Fresh store and fresh immutable raster/mask per case avoid accidental inter-case answer reuse; preserve first-call telemetry if later cached-call controls are admitted.

These registrations have no outParts. Therefore the general PartStore output-content cache (`call` key requires spec.outParts.length) is not this answer cache; query call instrumentation entry.cached need not become true just because returned emits.cached=1. Each call is still instrumented. Do not claim root-inventory or persistent cross-run safety from this local answer Map. The existing root-inventory falsifier is retained, not rerun or repaired.

## Needed separate probe closure and reporting

Freeze caller-side finite/safe resource validation; exact raw fixture/mask hashes; raster dimensions and named frame; immutable bytes and per-case store; exact module hashes; calls and argument objects; raw return envelope and nonfinite/typed-array encoding; public names and invocation counts; exact source alias and producer request binding; and renderer readback that displays all bilateral arrays/flags, averaged profile/counts, fit/null/condition and optional historical loss diagnostic without replacing them by a new classifier.

Public profile+edgePair calls compute the profile twice; gateway cache cannot reuse the profile across DIFFERENT names. If a later wrapper instead computes profileAt once and calls edgePairOf directly, that is a different explicitly named orchestration, not a faithful claim that the public table shared the profile. Existing composition computes one profile directly but calls neither stationContrastAt nor lossAt and has no leftLum/rightLum fields.

Review/admission gates remain root-owned. F6 is the eventual sole source/Git owner. F5's source reconnaissance cannot accept its own later review. See the separate exact public example proposal; no test result or expected numeric output is fabricated here.
