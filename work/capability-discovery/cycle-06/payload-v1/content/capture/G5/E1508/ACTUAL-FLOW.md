# E1508 G5 CLI actual-flow checkpoint

Written after root's source review and scoped NONCV GO, before the admitted checks below; not an earlier construction timestamp. Tests were written first, implementation second; neither was executed before root review. No observed red is claimed. A hash-only shell call hung without output and was terminated; its retry reported `exec-server transport disconnected`. Root then observed recovery; G5's single recovered readback matched root hashes. Those incidents are infrastructure testimony, not product/test failures and caused no repeated source writes.

Implementation: `chainspot-discovery-lab/experiments/capability-discovery/lenard5-station-evidence/cli.mjs`, SHA a711ab50bc50bd3f69e61656f12002d41d901e19d7db4e8a9b3b5eb188457ffa.

Tests: same directory `cli.test.mjs`, SHA 2bc624f45cd47a73f79f864483c89da4794361a6638acec22cf432c816f3ec96.

Entry: `node .../cli.mjs run --manifest FILE.json --out NEWDIR`. This actual entry is NOT admitted for a valid input here. Only syntax and the seven NONCV tests are admitted.

1. `runLenard5CLI(args)` checks exact five-argument grammar and nonempty, NUL-free, <=4096-character path strings. It resolves requested paths and reserves the unchanged `createArtifactWriter(outDir)` NEW directory before invoking the runner.
2. It calls G6's `runLenard5Evidence` once with exactly `{schema:'cycle06-lenard5-request@1',enabled:true,manifestPath:absolute}`. No CLI input loader, decode, arbitrary geometry or generic enable flags exist. Unexpected runner errors skip writer execution and get a best-effort RUNNER_FAILED receipt; no fabricated trace is created.
3. `persistLenard5Result` calls the accepted writer once. Its legacy cycle05 artifact manifest, exclusive writes, original fragments, serialization errors and prefix-retention behavior are unchanged. No retry or overwrite occurs.
4. Output binding opens only the known emitted artifact-manifest and manifest-listed allowed output paths. File descriptors are checked regular/bounded, read in <=64KiB chunks and closed in finally; metadata retention is <=131072 bytes and each artifact <=33554432. It hashes actual manifest bytes and listed files, checks status/schema/path/duplicate/digest/size agreement, and preserves binding failures separately without erasing the original writer error. This is hash-time observation, not hostile-filesystem or execution attestation.
5. A separate `cli-receipt.json` uses wx with schema cycle06-lenard5-cli-receipt@1, requested input path (declaration only), input-verification authority in the runner trace, run/writer/terminal statuses, actual output bindings and intended exit code only. It neither rewrites nor relabels the legacy manifest. A receipt write failure preserves prior files and first error. Only external process receipts may assert observed exit.
6. Direct invocation prints a compact terminal summary and sets process.exitCode. Imported use has no automatic run. No source image enters CLI code; no CV/store/PATH operation is implemented here. Shared machinery imports old writer/codec definitions, not a product producer.

| Admitted operation | Inputs | Expected outputs | Boundary |
|---|---|---|---|
| CLI syntax check | reviewed cli.mjs and armed preload argument | raw stdout/stderr/observed exit | no code evaluation claimed |
| test syntax check | reviewed cli.test.mjs and armed preload argument | raw stdout/stderr/observed exit | no code evaluation claimed |
| seven NONCV tests | malformed paths/args, missing manifest, fabricated writer+codec data | TAP, raw stderr tripwire, observed exit | no valid original input or positive CV call |

The seven prepared tests cover malformed grammar, existing output preservation, missing-manifest zero-attempt refusal, fabricated legacy/hash/nonfinite/-0/null/Uint8 roundtrip plus one-shot behavior, aggregate encode-failure fragment retention, mid-output collision prefix, receipt collision. Temporary test directories are test-owned and removed by each test's after hook. Import tripwire is G6's reviewed no-product-tripwire.mjs, denying probes/provider module imports; it is NOT source-read/store-call instrumentation. No full-repository green, scientific/path acceptance, producer readiness or Git/publication claim follows.

Root has already accepted this flow for the bounded checks recorded in prospective-commands.json. Stop on first observed failure, preserve it, no repair or rerun without new admission. Explicit source-path handback occurs only after admitted checks and result evidence.
