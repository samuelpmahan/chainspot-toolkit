# Reproduce cycle03 without altering frozen evidence

Use Node24 (recorded24.19.0), Python3 and Pillow (recorded12.3.0). Matplotlib is required only for the retained scientific renderers. No package install/network request is part of reproduction. The source adapter is standalone and OFF unless explicitly enabled. Existing source-only recipe5b59 and accepted E506 candidate d31b are immutable.

Run engineering checks from repository root:

```sh
node --test experiments/capability-discovery/source-pixels/adapter.test.mjs
PYTHONDONTWRITEBYTECODE=1 python experiments/capability-discovery/source-pixels/stage-png.test.py
node --test experiments/capability-discovery/composition/*.test.mjs
```

Root's exact aggregate113-test command and log are retained in `native/root-verification.json` and `native/root-lab-tests.log`. Those are engineering checks. Full repository green is not claimed; six previously recorded missing-fixture failures remain outside this additive scope.

Stage a fresh scratch workspace outside the checkout:

```sh
python work/capability-discovery/cycle-03/stage-replay.py --out /ABS/NEW_SCRATCH
```

The helper verifies every captured artifact, recreates `discovery-cycle03/D1..D6`, symlinks this exact checkout as `chainspot-discovery-lab`, and preserves every original byte at its original filename. When executable caller path literals or the E510 path pin need relocation, it writes a separate `-portable` companion and records both hashes; choose that companion for relocated execution. Frozen closure files, including E511 freeze.py, remain exact. Frozen declarations, coordinates, widths, windows, masks, settings, manifests and measurement receipts remain exact. These staged native records are historical and never authorize scheduling. Staging executes no CV, renderers or native solver.

For actual-image calls, add `--with-source-images`. This extracts the four exact existing platform Git blobs into scratch only and verifies encoded PNG hashes from [source-manifest.json](source-manifest.json). It performs no fetch. If an object is absent, obtain that exact platform source through an independently authorized route; never substitute a resized, annotated, color-adjusted or alternate screenshot. Full PNGs and giant fullRGBA JSON are deliberately excluded from this evidence package. Decode with the frozen `stage-png.py` and preserve source image/frame identifiers from the fixed protocol. The stager verifies encoded SHA before decode and records actual Pillow version; native8-bit RGB/RGBA single-frame PNG only. Raw PNG/full RGBA/crop hashes have different referents.

Actual producers are retained under `evidence/E507`, `evidence/E508`, `evidence/E509`; stage recreates their original D2/D3/D4 locations. Use the recorded caller interfaces there. E508 is directly portable:

```sh
bash /ABS/NEW_SCRATCH/discovery-cycle03/D3/E508/run.sh \
  /ABS/REPO \
  /ABS/NEW_SCRATCH/discovery-cycle03/D3/protocol.json \
  /ABS/NEW_SCRATCH/discovery-cycle03/D3/source/Lenard-full.png \
  /ABS/NEW_SECOND_OUTPUT
```

E507 and E509 callers retain their exact path/argument interfaces and per-run request descriptors; run them only in a fresh output location after staging. A caller's supported-field projection removes human explanation fields only and records that mapping. It must never change frozen numeric values or geometry to obtain sampling support. E508's original trial abstains before any composition call because its training endpoint envelopes exceed the ROI. No widened-crop retry is included or authorized by this package.

The separately named E510 portable renderer selects the separately named portable path pin; original renderer and original pin remain exact. No frozen helper or manifest is rewritten to make its hash check pass.

The fixed E506 numeric seam can be replayed with `node work/capability-discovery/cycle-03/evidence/E506/seam-probe.mjs` only after copying its producer into scratch or directing its stdout to a new scratch file. R506 probes are retained under `reviews/R506` and reconstructed at `discovery-cycle03/D5/review-R506`. Their original source/protocol hashes remain authoritative; relocated script hashes are separately recorded. E510's renderer is reconstructed at `discovery-cycle03/D1/figure-E510/render_figure.py`; its fixed input pin is reconstructed at the scratch cycle root. Rendering the retained receipt is different from replaying the fitter. Historical text saying R506 pending remains original evidence; latest accepted review is a separate record.

Compare actual raw support, provenance, original-frame `sourceComposition`, crop `composition`, and every `equivalence.differences` entry. Serialize receipts with the exported existing `preserveNonFinite` replacer; bare JSON serialization silently loses NaN/infinity meanings. Every supported run performs two actual recipe calls and retains both raw results; unsupported support runs perform zero. MATCHED_DECLARED_CONTROL is a numerical diagnostic only, not physical or semantic equivalence. A discrete fit or nearest-pixel channel jump makes equivalence UNKNOWN despite exact pixel copying. Keep null, NaN, infinities and missing fields distinct.

Full request bytes and giant staged source JSON are hash-bound without being packaged. Regenerate them through exact stager/caller interfaces and compare the recorded source/request/descriptor/run hashes at their stated scope. Decoder/runtime changes can change serialized staged bytes; do not call that byte identity without verifying. Wall time, process resources, timestamps and absolute argv paths are contextual observations and are expected to differ on a replay. They do not establish allocator acceleration. Reproduction itself is not blanket permission to rerun scientific trials, tune parameters, publish, merge or deploy.

E511 is a separate ROI-only full-frame diagnostic, not a retry or correction of E508. Its exact protocol, pre-run freeze and caller live under `evidence/E511`, reconstructed as `discovery-cycle03/V2/E511`. Use `bash run.sh REPOSITORY_ROOT PROTOCOL_JSON DESCRIPTOR_JSON VERIFIED_STAGED_SOURCE_JSON FRESH_OUTPUT_DIRECTORY`. Regenerate the exact existing Lenard source staging through the frozen Pillow stager (imageId/frame from E508) and verify staged JSON hash0ff967ec... from the full recorded descriptor; do not regenerate or edit the E511 pre-run declaration. Full-frame source/crop bytes have the same RGBA hash. The caller verifies every unchanged geometry field and only the five declared ROI/crop-frame differences before its two unchanged recipe calls.
