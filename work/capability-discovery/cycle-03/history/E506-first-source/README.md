# Source-pixel ROI adapter — standalone, default OFF

This dependency-free Node module copies integer ROI pixels from caller-decoded full RGBA, transforms supplied original-frame geometry, checks conservative complete sampling support, and calls the accepted unchanged composition. It changes no CV math and has no production wiring. `enabled:true` is mandatory. PNG decoding is a separate explicit Pillow staging step. No image or course is hardcoded.

```python
# Caller staging, checked encoded bytes before decoding:
python experiments/capability-discovery/source-pixels/stage-png.py \
  --source EXISTING.png --expected-sha256 EXACT_PNG_SHA256 \
  --image-id CALLER_IMAGE_ID --frame ORIGINAL_FRAME --out NEW_source.json
```

The stager accepts single-frame RGB/RGBA PNG only, records Pillow's actual version and hashes encoded PNG and full decoded RGBA. RGB appends alpha255; RGB PNG with transparency metadata is explicitly unsupported, as are palette/grayscale/animated PNG. RGBA alpha bytes are copied unchanged. Stored pixel order is used: no EXIF orientation, ICC/gamma operation, resizing, compositing, clamping or alpha muting. Decoding is necessarily decoder-specific, with no cross-decoder equivalence claim. Output creation is exclusive; parent paths must exist. A missing source causes a file error; encoded-hash disagreement is a hard integrity error. The JS boundary does not receive encoded PNG bytes, so it labels that hash as caller/stager testimony.

```js
import { prepareSourcePixelRoi, runSourcePixelRoi } from './adapter.mjs';
const request = {
  enabled: true,
  source, // exactly the object from stage-png.py; also accepts caller-decoded RGBA
  roi: {xPx: 40, yPx: 50, widthPx: 300, heightPx: 250, frame: 'named-crop-frame'},
  geometry: {
    frame: 'ORIGINAL_FRAME', geometrySource: 'explicit caller testimony; identity unverified',
    training: {frame:'ORIGINAL_FRAME', segments:[
      {tee:{xPx:150,yPx:150},badge:{xPx:220,yPx:150}}
    ]},
    stations: [{id:'fixed-pose',frame:'ORIGINAL_FRAME',xPx:180,yPx:150,
      headingRad:0,t0Px:-12,t1Px:12}],
    localWidthBank:{frame:'ORIGINAL_FRAME',scope:'LOCAL',valuesPx:[24,30,36]},
    occluders:{frame:'ORIGINAL_FRAME',boxes:[]},
    edgeSearch:{latLimPx:3,tolWidthPx:1}
  }
};
const preparation = prepareSourcePixelRoi(request); // inspect exact frozen crop input, no CV calls
const receipt = runSourcePixelRoi(request); // prepare, verify accepted closure, run exact recipe
```

Coordinates are pixel centers in the named original frame. ROI bounds denote half-open row/column ranges `[xPx,xPx+widthPx)` and `[yPx,yPx+heightPx)`. Both dimensions and origin must be safe integers and completely in bounds. Crop frame must differ from original frame. Geometry contains exactly the existing composition training endpoints, station poses/windows, LOCAL width bank, known occluder boxes and edge settings. Unsupported keys/geometry return UNKNOWN before any composition operation. The adapter translates all tee/badge points, all station origins and all occluder box origins by `(-xPx,-yPx)`; it preserves heading, distances/windows, width values, box sizes and optional `kind`. Geometry testimony is not inferred or strengthened.

Preparation copies source bytes and geometry, verifies the full RGBA hash, then checks support. A conservative envelope covers each entire training segment, each station profile-window endpoint expanded30px in every direction, and each station sensor center expanded by `4 + max(2w/3,w/2+2.5)` for the largest effective candidate `w=max(1,width)`. The full-segment bound covers the exact frozen learner fractions `[.2,.35,.5,.65,.78]`. Every envelope must lie strictly within `x>1,y>1,x<cropWidth-2,y<cropHeight-2`. This guarantees a conservative complete source/crop footprint for the unchanged nearest-pixel sensor and bilinear profiles; it may reject usable crops. The endpoint for `t1` is included conservatively though source arange excludes it. No finite partial-sample result overrides support UNKNOWN. No box is clipped or resized. A huge occluder may extend beyond ROI while its exact translated containment and pixel-mask intersection remain valid.

A successful preparation returns recursively frozen plain objects/arrays, exact crop bytes, full/crop hashes, decoder testimony, named original/crop frames, source dimensions, integer ROI and reversible translation. Caller mutation cannot change that preparation. `runSourcePixelRoi` verifies all14 entries of the accepted C2 recipe manifest/guard/source closure before calling unchanged `runComposition`. Its receipt retains the entire raw composition result and support/provenance. Calibration and semantic identity remain UNKNOWN; promoted=false. Missing/malformed evidence returns UNKNOWN, and disabled calls execute no operations. Well-formed full RGBA hash disagreement, recipe closure mismatch or snapshot corruption throws `SourcePixelIntegrityError`. A claimed PNG hash is not evidence that the JS boundary decoded or verified that encoded file.

For same-operation controls, run the same request with full-size ROI at `(0,0)` in a separately named crop frame, then compare raw width rows, profiles/counts and candidate channels/fits against the cropped run. Compare geometry after applying the recorded translation; frame/pose metadata naturally differ. Pixels/hash must match exactly; fractional trigonometric calculations can vary at floating precision, so the exposed numeric control uses absolute tolerance1e-9 without creating an acceptance criterion. Synthetic tests are engineering controls, not scientific course evaluation. No score cutoff, width acceptance, path identity, physical scale or AA claim follows.

```sh
node --test experiments/capability-discovery/source-pixels/adapter.test.mjs
python experiments/capability-discovery/source-pixels/stage-png.test.py
```

Initial contract: `work/capability-discovery/cycle-03/evidence/E506/contract.json`. Actual-image integration is left to independent callers/reviewer after source freeze. During construction, two course producers accidentally messaged proposed geometry to the implementation owner; no course files/images/protocols were opened and no generic constants were changed in response. Course trials must be labelled exploratory and predeclared, not fully blind heldout evaluation.
