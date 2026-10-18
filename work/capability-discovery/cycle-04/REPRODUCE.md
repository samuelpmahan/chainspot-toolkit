# Verify and stage cycle04

From the repository root, use Node24.19.0 and Python3; Pillow12.3.0 is the recorded source decoder. The helper is direct Node ESM with built-in crypto, so a compile target is not applicable. No root package/build manifest exists; no Bazel/hermetic/offline-install claim is made.

```sh
python3 work/capability-discovery/cycle-04/verify-package.py
node --test --test-reporter=tap experiments/capability-discovery/window-evidence/group.test.mjs
node --test --test-reporter=tap experiments/capability-discovery/*.test.mjs experiments/capability-discovery/catalog/*.test.mjs experiments/capability-discovery/probes/*/*.test.mjs experiments/capability-discovery/composition/*.test.mjs experiments/capability-discovery/source-pixels/*.test.mjs experiments/capability-discovery/window-evidence/*.test.mjs
PYTHONDONTWRITEBYTECODE=1 python3 experiments/capability-discovery/source-pixels/stage-png.test.py
node --test --test-reporter=tap
```

Expected bounded gates:17/130/2 pass. Last command intentionally remains red with the same17 named fixture/archive-import failures as the untouched base, not full-repository green. Exact commands/raw stdout/exit codes are preserved in E813 and root baseline captures.

`administration/capture-index.json` maps every original relative path to its storage, original filename, byte count and SHA256. Large JSON/HTML/log originals are losslessly zstd-compressed using the existing installed CLI: each entry also binds codec, stored byte count and stored SHA256. Stage and verifier decompress and assert the exact original bytes/hash; the package manifest hashes stored bytes. PNGs remain directly inspectable. `.mjs.txt` is an archival filename only: stage restores original names into fresh scratch, never modifies frozen declarations/receipts. Identical reviewer bytes may reference one authoritative stored producer file. Existing prior executable histories remain untouched; only new archive filenames avoid unintended test discovery. `zstd` must be installed to verify/stage compressed captures; no new dependency service is introduced.

```sh
python3 work/capability-discovery/cycle-04/stage-replay.py --out /NEW/absolute/scratch/cycle04-stage
```

Use a nonexistent path outside checkout. This restores exact captured originals and creates separate `-portable.mjs`/`-portable.py` companions only when recorded absolute paths change. Companion hashes/adaptations are in stage-receipt.json; originals keep exact bytes. No producer, adapter, recipe, renderer, native solver, Git fetch/commit/push or scientific rerun executes. Recorded one-shot caller output guards remain active. Re-running a scientific caller is a separately authorized, newly identified execution, not an automatic consequence of staging.

Large encoded source PNGs and raw pixel/request JSON are omitted with exact identities. Non-executable bulk descriptors preserve exact nonpixel prefix/suffix, array whitespace, RGBA hash and length. Optional reconstruction:

```sh
python3 work/capability-discovery/cycle-04/stage-replay.py --out /NEW/absolute/scratch/cycle04-full-stage --with-bulk
```

This requires the exact two platform PNG Git blobs already available locally (source-manifest), Pillow, and Node. It never fetches. It verifies encoded PNG and decoded RGBA hashes, invokes the frozen synthetic fixture generator only to recover known pixel bytes, and reconstructs omitted JSON using exact recorded serialization, checking original byte length/SHA256 before writing. The E811 uniform PNG is retained. Decoder/fixture-generator execution is real pixel recovery, not CV, an independent scientific observation, or authenticated proof of old protocol timing. Decoder differences fail the exact hash check. Bulk reconstruction can allocate substantial memory/disk proportional to full images and restored arrays.

Raw complete receipts, all candidate rows, native entry-range evidence and key scientific figures remain present without bulk reconstruction; the read-only verifier directly checks executed UNKNOWN A has two branches/two recipes and refusal B has none/zero. It validates identity/shape, not source semantics or scientific truth. No runtime helper filesystem/network I/O is added by these separately named administrative tools.

The package manifest excludes its own bytes and SHA256SUMS to avoid circular identities. Its listed payload includes the active helper closure plus the entire cycle04 package. A separately recorded actual commit/tree after later authorization must bind this exact payload; no future commit/tree is predicted here.
