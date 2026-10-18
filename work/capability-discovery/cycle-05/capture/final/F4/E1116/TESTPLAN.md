# E1116 test plan — written, not executed

Scope: four non-CV synthetic renderer unit vectors authored before implementation. Test1 fixed eight-case protocol/order; test2 protocol/name tamper refusal; test3 unattempted-row SVG placeholders and no image/script tags; test4 exact-wire HTML escaping. These vectors do not import vendor, query or input-image code. No test or renderer import/execution is admitted until root's raw-trace acceptance and explicit GO.

After that GO, proposed bounded verification:

1. `node --test discovery-cycle05/F4/E1116/renderer.test.mjs`; preserve first complete output, exit code and failures. No red-before-implementation execution claim: root explicitly gated execution.
2. Verify the root-supplied exact value-trace and timing-sidecar expected SHA256. A wrong-hash attempt must fail before decoding/render/output-directory creation; retain its original failure separately. It must never invoke a producer.
3. Run renderer once against the root-reviewed original encoded trace and sidecar with exact expected hashes. Output exclusive NEW directory containing page1/page2 SVG, complete raw tagged inspection HTML and initial render manifest. No source-pixel input path is supplied.
4. If existing standard CairoSVG is available, rasterize each produced SVG externally to1500x1440 PNG, preserving actual command/version/stdout/stderr. No install, AI image, browser, image processing of source pixels or CV call. If unavailable, report SVG-only result and ask root for the bounded rendering route.
5. Inspect both PNGs visually for chart/label/legend/caveat clipping and semantic fidelity. Any correction becomes a separately retained source/output version, never a CV rerun or trace alteration. Finalizer hashes existing outputs and emits a separate final manifest (no overwrite of initial manifest).
6. Bind exact trace+sidecar+codec+renderer+SVG/PNG/HTML hashes and report actual test/render counts. Scientific/path/physical-edge/width/human acceptance remains UNKNOWN; no self-acceptance of the full bundle.

No actual tests, syntax checks, imports, trace reads, rasterization or rendering have occurred at this checkpoint.
