# Reproduce the retained work

Run from the checkout root with Node24+ and Python3. The Python producers/renderers use NumPy, SciPy, Matplotlib and Pillow. The E301 native provider also needs its original decoder dependencies (`jpeg-js`0.4.4 and `pngjs`7.0.0; exact dependency manifests are in evidence/E301/source-manifest.json). In this environment they are found via `NODE_PATH="$CODEX_PRIMARY_RUNTIME_NODE_MODULES"`. No network is required once those dependencies and the original JPEG are available.

Every producer below writes into a **new scratch directory outside the checkout**. `stage-producer.py` copies exact producer/protocol bytes and uses symlinks to the existing immutable sources; it does not modify producer imports or claim an adapted producer has its original hash. The staging receipt records exact hashes and the source mapping. Retained evidence remains untouched. A staging receipt alone proves no replay; actual replay comparisons are separate.

## Current composition and CLI

The exact current source freeze is feature-manifest-E308.json, SHA256 `5b59dce1c7ae87f962c0305697ed883e423bd504fedce5851fb02242309dcf52`. Its `files` entries include the decimal-bank regression input and repair protocol. Verify these SHA256 values and the immutable vendor/guard identities before using the receipt as this checkpoint's evidence.

```sh
replayRoot=$(mktemp -d)
node --input-type=module - "$replayRoot/input.json" <<'JS'
import {writeFileSync} from 'node:fs';
import {trainingInput} from './experiments/capability-discovery/composition/training-fixtures.mjs';
const input=trainingInput(); input.image.data=Array.from(input.image.data);
writeFileSync(process.argv[2],JSON.stringify(input));
JS
node experiments/capability-discovery/composition/cli.mjs --input "$replayRoot/input.json" --out "$replayRoot/receipt.json" --inspect "$replayRoot/inspection.html"
node --test experiments/capability-discovery/composition/*.test.mjs
```

The exposed synthetic factory explicitly supplies `enabled:true`; an object without it executes no operations. CLI paths resolve from the current shell directory. The input field table is in experiments/capability-discovery/composition/README.md. Object-shaped input is the supported domain; top-level null is unsupported. Finite validation is not a resource bound for arbitrarily large inputs.

`training-positive.json` and `inspection.html` in this work directory are retained **E306 first-freeze** artifacts; their operation logs describe the original widthSearchAt composition. Generate a new scratch receipt with the current command above for the repaired direct-edgePairOf flow. Never overwrite the historical receipt to make its log appear current.

## Exposed E302 / E303 / E304 producers

Set one job and its corresponding worker before each fresh run:

| Job | Worker | Staged executable | Retained expected output |
| --- | --- | --- | --- |
| E302 | C3 | `probe.mjs` | `receipt.json` |
| E303 | C5 | `probe.mjs`, then `verify.mjs` | `measurements.json` |
| E304 | C4 | `prepare.py`, then `probe.mjs` | `measurements.json` |

For example, E302:

```sh
replayRoot=$(mktemp -d)
python work/capability-discovery/cycle-02/stage-producer.py --job E302 --out "$replayRoot/run"
node "$replayRoot/run/discovery-cycle02/C3/probe.mjs" > "$replayRoot/run.log"
cmp "$replayRoot/run/discovery-cycle02/C3/receipt.json" "$replayRoot/run/discovery-cycle02/C3/expected/receipt.json"
python "$replayRoot/run/discovery-cycle02/C3/render.py"
```

E303:

```sh
replayRoot=$(mktemp -d)
python work/capability-discovery/cycle-02/stage-producer.py --job E303 --out "$replayRoot/run"
node "$replayRoot/run/discovery-cycle02/C5/probe.mjs" > "$replayRoot/run.log"
node "$replayRoot/run/discovery-cycle02/C5/verify.mjs"
cmp "$replayRoot/run/discovery-cycle02/C5/measurements.json" "$replayRoot/run/discovery-cycle02/C5/expected/measurements.json"
```

E304 regenerates its prepared synthetic raster rather than retaining another1MB raster copy:

```sh
replayRoot=$(mktemp -d)
python work/capability-discovery/cycle-02/stage-producer.py --job E304 --out "$replayRoot/run"
python "$replayRoot/run/discovery-cycle02/C4/prepare.py"
node "$replayRoot/run/discovery-cycle02/C4/probe.mjs" > "$replayRoot/run.log"
cmp "$replayRoot/run/discovery-cycle02/C4/measurements.json" "$replayRoot/run/discovery-cycle02/C4/expected/measurements.json"
python "$replayRoot/run/discovery-cycle02/C4/render.py"
```

C6 executed the staged E302, E303 and E304 commands and each `cmp` succeeded. Their copied producers remained byte-identical. Render commands regenerate figures in scratch; C6 did not rerender them during this staging check. The independent R302/R303/R304 reports retain their own actual replay/inspection scope.

## E301 native counterfactual producer

The original JPEG is an explicit external source prerequisite, omitted from this package to avoid duplicating the634-file provider/JPEG closure. Supply an original IMG_5641.jpg with SHA256 `e6616738640eee1d05d8cc2b59dd657f24b4a5a01dc2f68571b7e44c6f372b8a`. The exact recovered source Git blob is `ffdd790992dbb0f971e72204c440c0e4c4559216` at platform ref `49255331791b1245cf0f9cd699816175f94e70f2`. If that object exists locally, `git cat-file blob ffdd790992dbb0f971e72204c440c0e4c4559216 > /scratch/path/IMG_5641.jpg` recovers it; a checkout lacking that object still requires the original JPEG. Do not substitute a visually similar or reencoded JPEG.

```sh
replayRoot=$(mktemp -d)
python work/capability-discovery/cycle-02/stage-producer.py --job E301 --out "$replayRoot/run" --source-jpeg /absolute/path/to/IMG_5641.jpg
NODE_PATH="$CODEX_PRIMARY_RUNTIME_NODE_MODULES" node "$replayRoot/run/discovery-cycle02/C1/counterfactual.mjs" "$replayRoot/run/discovery-cycle02/C1/provider" IMG_5641 badge-9 tee-7 > "$replayRoot/run.log"
python "$replayRoot/run/discovery-cycle02/C1/render.py"
```

The helper reconstructs the producer's original relative prior-receipt layout under scratch/discovery-swarm/W2 using the earlier preserved baseline/heading inputs. It stages provider files as links to the existing source/provider plus the explicitly verified JPEG. No producer path literal changes are needed. All634 staged provider entries were hash-checked successfully by C6. C6 did not rerun the ten already reviewed variants during ADMIN. R301 performed a fresh-process replay with only two prior-receipt path relocations; its adapted producer hash is explicitly different. Its comparison excludes only execution time and that recorded producer hash; every other receipt field matches. A new run can change `executionUtc`; it must preserve raw traces, source/config/canonical/field identities and UNKNOWN outcomes.

## Original AMEND and repaired regression

The first source freeze remains feature-manifest.json (`9ecd8863…`), with exact old files retained at history/E306-first-freeze/. The independent R306 AMEND and its old output are in reviews/R306/. The exact reviewer JSON input is evidence/E308/counterexample-input.json. The old range enumerates31.01 and32.010000000000005; the repaired direct operation evaluates31.01 alone and returns no edge pair at tolerance1.

To execute the old CLI without changing its producer bytes, reconstruct its original relative source seam in scratch:

```sh
replayRoot=$(mktemp -d)
python - "$replayRoot/old" <<'PY'
from pathlib import Path
import shutil,sys
repo=Path.cwd();out=Path(sys.argv[1]);shutil.copytree(repo/'work/capability-discovery/cycle-02/history/E306-first-freeze',out)
(out/'experiments/capability-discovery/probes').symlink_to(repo/'experiments/capability-discovery/probes',target_is_directory=True)
PY
node "$replayRoot/old/experiments/capability-discovery/composition/cli.mjs" --input work/capability-discovery/cycle-02/evidence/E308/counterexample-input.json --out "$replayRoot/old-counterexample.json"
node experiments/capability-discovery/composition/cli.mjs --input work/capability-discovery/cycle-02/evidence/E308/counterexample-input.json --out "$replayRoot/repaired-counterexample.json"
```

The old red log and repaired green log are retained separately in verification/E308-red.log and verification/E308-green.log. The original called-shot is historical and unchanged; called-shot-E308.json records the repair prediction before regression execution. No independent C2 evaluation is implied by these exposed counterexample runs.

## E309 exposed AA/sampler probe

The candidate recipe is not involved. E309 retains16 exposed horizontal fixtures/64 poses. Its protocol, exact producer, full raw numeric receipt and result are in evidence/E309/. Stage it without rewriting the frozen protocol:

```sh
replayRoot=$(mktemp -d)
python work/capability-discovery/cycle-02/stage-producer.py --job E309 --out "$replayRoot/run"
node "$replayRoot/run/discovery-cycle02/C1/E309/probe.mjs" > "$replayRoot/run.log"
cmp "$replayRoot/run/discovery-cycle02/C1/E309/receipt.json" "$replayRoot/run/discovery-cycle02/C1/E309/expected/receipt.json"
```

E309's independent R309 review is accepted and retained at reviews/R309/; its own fresh-process receipt/stdout reproduce byte-for-byte. C6 did not rerun this newly reviewed probe during ADMIN. Analytic coverage fixture equations are construction, not a new detector signal; saturated source channels and reduced numerical ties are not physical calibration. Do not rerun the one-time `prepare.py` to rewrite the frozen protocol.

## Released E305 / E307 evaluation

Root released these artifacts for packaging only **after** E307 completed on the accepted unchanged5b59 candidate. They were procedurally withheld during candidate development; they are now exposed for all future work. No candidate tuning follows this release.

Retained E305 files include the original deterministic generator, protocol,31-entry freeze manifest, inspection/validation and case/byte-manifest JSON. Per-fixture RGBA/PNG/mask/contactsheet files are regenerated. E307 retains its original adapter and adapter-freeze protocol, source-closure binding, exact seven raw CLI receipts and argv log, measurements, report producer, scientific figure and result. Seven HTML pages and large adapted RGBA JSON inputs are regenerable and omitted.

`adapter.py` originally hardcodes the original checkout location. `stage-evaluation.py` retains that file verbatim at its original SHA256 `15d73841039700f7ed180db3ba22b536c5a72e571f408166f1f9c02eaf0df165` and creates **adapter-portable.py** by replacing only its `REPO=Path(...)` literal. The staging receipt records the portable file's different hash and exact path mapping. Do not describe the path-adapted file as the original adapter bytes. A scratch source mirror uses symlinks to exact frozen files and the retained E307 composition README snapshot. Executable candidate, RGBA, geometry/mask conversions and tolerances are unchanged.

```sh
replayRoot=$(mktemp -d)
python work/capability-discovery/cycle-02/stage-evaluation.py --out "$replayRoot/run"
python "$replayRoot/run/discovery-cycle02/C2/heldout/generate.py"
python "$replayRoot/run/discovery-cycle02/C2/E307/adapter-portable.py"
cmp "$replayRoot/run/discovery-cycle02/C2/E307/input-manifest.json" "$replayRoot/run/discovery-cycle02/C2/E307/expected/input-manifest.json"
cmp "$replayRoot/run/discovery-cycle02/C2/E307/source-closure.json" "$replayRoot/run/discovery-cycle02/C2/E307/expected/source-closure.json"
python - "$replayRoot/run/discovery-cycle02/C2/E307" <<'PY'
from pathlib import Path
import json,subprocess,sys
r=Path(sys.argv[1]);cli=r/'candidate/experiments/capability-discovery/composition/cli.mjs'
for row in json.loads((r/'input-manifest.json').read_text())['inputs']:
 ident=row['id'];output=r/'receipts'/(ident+'.json');html=r/'html'/(ident+'.html')
 subprocess.run(['node',str(cli),'--input',str(r/row['inputFile']),'--out',str(output),'--inspect',str(html)],check=True)
 assert output.read_bytes()==(r/'expected/receipts'/(ident+'.json')).read_bytes(),ident
PY
python "$replayRoot/run/discovery-cycle02/C2/E307/report.py"
```

The original adapter checks every31-entry frozen input hash before any candidate call. C6 actually regenerated all31 entries and all seven adapted inputs in scratch, and both input-manifest/source-closure `cmp` checks succeeded; it did not rerun the seven candidate calls during ADMIN. The original E307 and independent R307 reports record their actual seven calls. CLI stdout contains chosen output paths, so it changes under staging; raw receipt bytes are the comparison above. Rendering the scientific figure requires the Python dependencies noted earlier. Parsed HTML content is not a browser screenshot; the retained browser attempt could not launch missing Chromium.

The adapter converts the frozen integer+0.5 pixel-center frame to native index centers by subtracting0.5 from anchors/queries. It converts half-open mask boxes to inclusive integer-center boxes while preserving the unavailable integer pixels. Source Dev72 continuous box-majority sampling and JS bilinear mask semantics remain distinct; no continuous-mask equivalence is claimed. `latLim12,tolWidth3` are existing source defaults explicitly supplied, not accepted physical constants.

The frozen requested raw band luminance means, all alternative edge-pair enumeration and profile-boundary safety/calibration flags are **unsupported by the candidate API**. Full profiles, visible counts, normalized lane channels and one source-selected fit per requested width are retained. Do not count unsupported channels as passing evidence, reinterpret synthetic labels as physical truth, or tune on these now exposed cases and call them independent again.
