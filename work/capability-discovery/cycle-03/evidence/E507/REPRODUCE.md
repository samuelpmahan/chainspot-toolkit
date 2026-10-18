# E507 HeritagePark fixed trial reproduction

This is one exploratory predeclared actual-image trial, not heldout route accuracy. The raw receipt retains crop and full-source outputs, all null fits and UNKNOWN width/identity. All nine source/crop edge fits are null; the paired-ribbon expectation failed. Numeric matching is a bounded control, not scientific equivalence.

Arguments make the retained caller portable. `REPO` is the unchanged accepted repository/source closure, `OUT` is a new scratch directory, and `ARTIFACTS` holds the retained E507 scripts and request-descriptor.json. Obtain the original PNG from git commit `49255331791b1245cf0f9cd699816175f94e70f2`, path `specimens/dev/HeritagePark-full.png`, blob `799879fb3a9dfcab7be373cbf74becd92aaf274a`, SHA256 `fb77ea132dd29136905088344ed35d170057dea2135e86b06f91e672bc4b2f7f`. Do not use the annotated figure as input. The original E502 frozen-protocol.json SHA256 is `ee4ac0852dfe1838c3d637ff967b65918ca9bb077ab9f1a6b2df9763ec3e916a`.

```sh
mkdir -p "$OUT"
git -C "$REPO" show 49255331791b1245cf0f9cd699816175f94e70f2:specimens/dev/HeritagePark-full.png > "$OUT/HeritagePark-full.png"
python "$ARTIFACTS/verify-inputs.py" "$REPO" "$PROTOCOL" "$OUT/integrity-before.json"
python "$REPO/experiments/capability-discovery/source-pixels/stage-png.py" --source "$OUT/HeritagePark-full.png" --expected-sha256 fb77ea132dd29136905088344ed35d170057dea2135e86b06f91e672bc4b2f7f --image-id HeritagePark-full@49255331791b1245cf0f9cd699816175f94e70f2 --frame HeritagePark-full@4925533:source-pixel-centres --out "$OUT/staged-source.json"
python "$ARTIFACTS/run-observed.py" "$OUT/process-resources.json" node "$ARTIFACTS/run-heritage.mjs" "$REPO" "$OUT/staged-source.json" "$ARTIFACTS/request-descriptor.json" "$OUT/receipt.json" "$OUT/caller-resources.json"
python "$ARTIFACTS/verify-inputs.py" "$REPO" "$PROTOCOL" "$OUT/integrity-after.json"
python "$ARTIFACTS/analyze-and-render.py" "$OUT" "$OUT/HeritagePark-full.png" "$PROTOCOL"
```

The mapping is fully described in request-descriptor.json: rename integer crop keys, add a distinct crop frame, preserve every station/window/training coordinate, width24/30/36 and edge setting, retain empty boxes, and strip only explanatory fields unsupported by the adapter. No tuning or automatic retries. Support failure must abstain, with zero calls and no crop enlargement. The accepted candidate manifest is `d31b7a4312ac1bfc4f76bc96fc278f8acad4f49f4b04283df0faa8e6dce54626`; legacy composition manifest remains `5b59dce1c7ae87f962c0305697ed883e423bd504fedce5851fb02242309dcf52`.

The original production attempt to launch `/usr/bin/time` failed before Node started because that executable is absent. It performed zero CV calls. The retained Python child-process wrapper then launched the sole actual Node adapter invocation. Renderer layout was adjusted after visual inspection; it rereads the same immutable receipt and recomputes no scores. Raw receipt generated once, two composition calls. Resource sidecars record actual elapsed time and maxRSS separately from scientific evidence; timings are not deterministic or allocator-causal.

Do not retain the giant staged full-RGBA JSON or duplicate original PNG in the repository package. Their source identities and hashes are recorded in source-stage-descriptor.json and caller-resources.json. Geometry messages were exposed to the adapter author before source freeze; this is predeclared exploratory evidence, not blind independence.
