# CV-free archive verification and staging

From the repository root:

```sh
python3 work/capability-discovery/cycle-05/verify-package.py --phase final
python3 work/capability-discovery/cycle-05/stage-replay.py --phase final --out /absolute/fresh/directory/outside/repository
```

Requires Python3 and zstd CLI; source capture used Node24 and zstd. These commands hash/read/decompress/write exact evidence only: no product, codec, CV, PNG decoder, generator, producer or renderer execution. Staging also creates a symlink to this complete repository, restores every indexed original name, emits separate `-portable` path-only companions where needed and records both hash sets. It never overwrites an existing output directory. Original exact manifests retain original absolute paths. Portable scripts do not automatically switch to portable manifest filenames. Do not execute restored scripts without a new scoped admission.

The capture index records omitted Lenard original PNG bodies explicitly. Staging cannot recover, fetch or decode them. Fresh source-pixel execution needs those originals separately, a newly reviewed minimal preset implementation, source freeze and independent review.

Actual aggregate regression command retained in F6/E1117 (already executed, not part of this byte-only staging):

```sh
node --test --test-reporter=tap experiments/capability-discovery/*.test.mjs experiments/capability-discovery/catalog/*.test.mjs experiments/capability-discovery/probes/*/*.test.mjs experiments/capability-discovery/composition/*.test.mjs experiments/capability-discovery/source-pixels/*.test.mjs experiments/capability-discovery/window-evidence/*.test.mjs experiments/capability-discovery/station-evidence/*.test.mjs
PYTHONDONTWRITEBYTECODE=1 python3 experiments/capability-discovery/source-pixels/stage-png.test.py
```

Results were172/172 and2/2, first runs, no repairs. Existing engineering controls do execute CV queries; their internal query total was not instrumented and must not be reported as zero. This differs from the fixed scientific producer's measured32PATH+8constant entries and its single authorized replay. Do not claim full repository green or rerun historical scientific grids under archival validation.

For a separately authorized fixed producer replay only, the exact CLI manifest is restored from F5/E1115. Use an explicitly selected portable manifest and a fresh output directory; no `--enable` flag exists. The current implementation accepts only synthetic8. Timing differences are expected and may not be normalized away; preserve raw traces/fragments and compare with the recorded R1115 timing-field policy. No replay is invoked by these instructions automatically.
