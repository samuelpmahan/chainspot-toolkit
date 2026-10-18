# Executed and resume commands

Run commands from the repository root unless a directory is stated. Source identity and data scope are in the receipts. These commands do not grant new dispatch authority.

Executed bounded checks:

```sh
node --test experiments/capability-discovery/plan.test.mjs experiments/capability-discovery/probes/width/recipe.test.mjs experiments/capability-discovery/probes/root-inventory/root-inventory.test.mjs experiments/capability-discovery/catalog/catalog.test.mjs
node experiments/capability-discovery/probes/width/probe.mjs --out ABSOLUTE_NEW_RECEIPT
node experiments/capability-discovery/probes/root-inventory/falsifier.mjs
```

From `experiments/capability-discovery/catalog`:

```sh
node validate.mjs
node probes/cheap.mjs
python3 probes/edge.py
```

The catalog Node probe creates a temporary `.runtime` import mirror. It is generated state and excluded from the publication manifest. The width probe resolves relative output paths against its own directory; use an absolute path when retaining a new scratch receipt. The legacy runner reports its E202 probe-definition ID; the E207 repair wrapper records the actual repair execution packet separately.

Executed fresh renderer check:

```sh
python3 experiments/capability-discovery/evidence/replay/render_trace_comparison.py --source EXACT_ORIGINAL_JPEG --out NEW_RENDER_DIRECTORY
```

The source JPEG must match SHA-256 `e6616738640eee1d05d8cc2b59dd657f24b4a5a01dc2f68571b7e44c6f372b8a`. It is not duplicated in this work record. The renderer checks receipts and source; it performs no provider CV or ownership judgement.

Executed full suite once on the E201 candidate and once on untouched main: `node --test`. E201 88 passed/6 failed; untouched main 39 passed/6 failed. The same six missing-evidence failures are listed in the retained logs. Focused E207 checks passed85/85; E211 core checks passed33/33 plus29 review-derived probes. The justified final all-five-Lab-test-file run passed95/95 after that core correction. The full repository suite was not repeated without a new concern.

Planner/native boundary:

```sh
node experiments/capability-discovery/plan.mjs --policy FRESH_POLICY --state FRESH_STATE --artifacts VERIFIED_ARTIFACT_ROOT --now FRESH_ISO_TIME --expect-revision EXPECTED_REVISION
python3.12 -m pip install -r experiments/capability-discovery/requirements.txt
python3.12 experiments/capability-discovery/native-probe.py init --spec NEW_READY_SPEC --state NEW_NATIVE_STATE
python3.12 experiments/capability-discovery/native-probe.py solve --state NEW_NATIVE_STATE --output-dir NEW_SOLVES
```

The actual cycle used the already installed pinned dependency via an explicit scratch PYTHONPATH; native dependency was 1.0.4. Native `init`/`solve` write their explicit state/output paths, never call an agent API, and do not implement arbitrary extraction dependencies. Root gates first and alone performs actual reservation/spawn/start/finish.

Native bundles are stored as lossless `*.bundle.base64` text. Decode a selected file with standard base64 decoding into a new scratch `.bundle`; verify the decoded SHA-256 against `capture-manifest.json` before using it. The accepted solve JSON remains directly inspectable. No failed solve was dispatched.
