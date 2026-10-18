# E1116 actual written renderer flow — checkpoint, execution paused

Written: `renderer.mjs`, `renderer.test.mjs` and `TESTPLAN.md` in this scratch directory. No module import/test/syntax execution, producer-output read, SVG/HTML creation, rasterization or PNG inspection has run. No repository/Git/native writes; F6 retains sole integration ownership.

## Entry point after separate root GO

```sh
node discovery-cycle05/F4/E1116/renderer.mjs --trace REVIEWED_VALUE_TRACE --trace-sha EXPECTED_SHA256 --sidecar REVIEWED_SIDECAR --sidecar-sha EXPECTED_SHA256 --out EXCLUSIVE_NEW_DIRECTORY
```

The caller must supply root-accepted original trace and sidecar paths and their exact expected hashes. There are no image/RGBA/mask, pose/width/window or producer arguments.

## Actual execution order

1. Runtime imports only Node fs/crypto/path plus the admitted codec module. It never imports recipe, CLI, PartStore or CV. There are no network, browser, image or process-spawning imports.
2. Read the two original encoded files, enforce32MiB/4MiB size caps and verify both expected SHA256 before either decode. Check codec file bytes match the admitted codec SHA256. Wrong hash fails without decoding, output directory or any producer fallback.
3. Decode through the admitted raw tagged codec. Validate trace/sidecar schemas, exact frozen protocol,32 planned/retained rows in fixed four-query/eight-case order, width30, retained original poses/windows, supported row states and UNKNOWN claims. Completed profile/contrast arrays receive shape/flag checks; unattempted/thrown rows retain missing-evidence labels, never invented zeros.
4. Build two1500x1440 SVG pages in memory, exactly four cases each. Each row has averaged profile plus all241 support counts at left; raw left/right station contrast and separate side-validity lanes at right. Plot axes scale only retained finite values for layout. Finite invalid values get hollow gray markers and never join evidence lines. Nonfinite values retain textual numeric-kind labels. Historical native tau is a dashed diagnostic reference, not a classifier.
5. Show native edgePair fit/condition and native loss visible denominator/pass/loss fractions/longest gap without refitting, scoring or changing semantics. Native losses, typed corridor and every unplotted native field remain in the complete original tagged-wire HTML inspection.
6. Build static escaped HTML containing complete exact original value-trace and sidecar wire text. This retains every raw query answer/unit/emits, argument, metadata, nonfinite tag and typed Uint8Array constructor/length/element. No application framework, script, source image or external resource is included.
7. Reserve an exclusive NEW output directory only after input validation and in-memory display generation. Exclusively write page-1.svg, page-2.svg, inspection.html and an external initial manifest binding original inputs, codec, renderer, source-freeze declaration and each output SHA256. If a write fails, retain existing partial files and report failure; no producer rerun or output overwrite.
8. Standard CairoSVG rasterization is intentionally **external and not implemented/executed by this Node module**. After separately admitted conversion of the two exact SVGs, `node renderer.mjs --finalize-pngs OUTPUT_DIRECTORY` verifies existing SVG/HTML/renderer/codec identities, hashes both PNGs, checks their PNG dimensions, and exclusively writes a separate render-manifest-final.json. It preserves the initial manifest and records PNG derivation as external testimony, not attested execution.

## Invocation / artifact table

| Operation | Inputs | Outputs |
| --- | --- | --- |
| verify / decode | original encoded trace+sidecar; expected hashes; admitted codec | decoded native value trees; no CV |
| plot / inspection | retained native fields only; fixed display layout |2SVG strings and complete original-wire HTML |
| exclusive write | generated display strings |2SVG,1HTML,initial hashmanifest |
| external CairoSVG (later) |2exact produced SVGs |2PNG; actual tool evidence separately retained |
| PNG finalizer (later) | existing manifest/SVG/HTML/PNG; admitted renderer+codec identities | separate final hashmanifest |

## Boundaries / review gate

- Root's independent R1115 raw-trace acceptance is required before any producer output is read or rendering executed. This checkpoint does not grant that acceptance.
- Tests were authored first but have not executed. No first-green, red, syntax, rendering or image-quality success claim is made.
- No scientific score, fit, width selection, pose correction, path/physical-edge identity or acceptance graphic is computed. Axis scaling and SVG layout are display operations only.
- Images are output-only rasterizations of produced SVGs. No source PNG/RGBA/mask is accepted or read by this renderer.
- Source-freeze identity0a235…da4b is a root-bound declaration printed in the figure/manifest, not a fresh seven-source-file read or execution attestation.
- Final bundle needs independent review; F4 will not self-accept its renderer/scientific bundle.

Root: please review this actual written flow. Execution remains paused until R1115 raw acceptance and your scoped GO, including bounded renderer tests and SVG/PNG creation.
