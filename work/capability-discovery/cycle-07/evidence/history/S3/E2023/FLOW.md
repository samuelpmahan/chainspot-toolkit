# E2023 — Lab7 read-only Git exporter, construction checkpoint

Written in `prepare-export.v1.mjs` (147 lines). No exporter execution, syntax check, project import, Git command/write, package export, helper call, original-value/body read or decode occurred. Only the prior exporter source, metadata and the new source/diff were inspected. The prior 147-line Lab6 source is preserved at SHA256 `ed7920523765cf7dd64378fd5904e16ba7fc0e98a7fd761b7123b2f5b76e5c87`; its prior actual success is root testimony, not a Lab7 result.

## Mechanical adaptation

The full diff changes only provenance comment, fixed local parent `4f24d50391927e0e50220690ea8ececec79e0bb4`, fixed parent tree `27616cbaac38b1b916fc337d22dd8f7cab5a7736`, package prefix `work/capability-discovery/cycle-07/`, four fixed source paths below, diagnostic count language and output schema `cycle07-readonly-git-export/v1`.

The four sources are exactly:

- `experiments/capability-discovery/joint-fit-original-plan/original-evidence-plan.mjs`
- `experiments/capability-discovery/joint-fit-original-plan/plan-core.mjs`
- `experiments/capability-discovery/joint-fit-original-plan/plan.test.mjs`
- `experiments/capability-discovery/joint-fit-original-plan/README.md`

Every source requires an explicit64hex expected SHA256. The unchanged prior implementation also validates every additional supplied expectedHashes entry against actual allowed Git blobs; it does not reconstruct metadata or silently substitute current working-tree text. No final source hashes are guessed here.

## Future entry point — NOT RUN / NOT ADMITTED

```sh
node /workspace/scratch/8528bb251845/discovery-cycle07/S3/E2023/prepare-export.v1.mjs /absolute/future-root-reviewed-config.json
```

The config path is illustrative only, not a created file or execution approval. S1 must first create the accepted physical package and sole Lab-repository commit. Only then can a future exact config bind that actual commit/tree, branch, frozen manifest path/hash/native format, expected source hashes and NEW output directory. Root review, independent S2 review and separate export GO must precede that command.

## Actual written execution order

1. Read absolute config, require<=65536B, fatal UTF8 with byte-exact roundtrip, and explicit immutable40hex `cfg.commit`/`cfg.tree`. Require fixed parent/tree and exact four-source/prefix allowlists; all four source hashes must be64hex. Require canonical workspace repository and an absent canonical scratch output outside it. No dynamic HEAD selector is accepted: HEAD/branch are later equality guards against explicit cfg.commit/cfg.branch.
2. Require package frozen-manifest path and SHA256. `canonicalRemoteParentReportedOnly` remains null/40hex caller testimony, never inferred, authenticated or used to write a remote parent. No remote access, commit reconstruction or Git mutation appears in this exporter.
3. Invoke only bounded read-only Git commands with64MiB `maxBuffer`: rev-parse, symbolic-ref, rev-list, ls-tree, diff-tree and cat-file. Check exact actual commit object/HEAD/branch, one exact local parent, fixed parent tree and actual cfg.tree. Parse actual NUL-delimited full tree and changed paths; all four sources must be changed, and every changed path must be one of those sources or under the package prefix. No rename shortcut or missing/deleted/unsupported blob is accepted.
4. Read actual Git blob objects, recompute their Git blob SHA1 framing, and verify every supplied expected SHA256. Load the frozen manifest from its actual blob and check exact configured SHA256. Preserve native `manifest.files` handling, not a fabricated replacement: array entries can be path-relative when `manifestArrayRelative` and `manifestPrefix` specify that native S1 format; the inherited object-map branch uses its existing prefix semantics. Each resolved entry must remain under cycle07 prefix and match actual blob SHA256 and optional byte count. The future S1 manifest shape/relative prefix must be inspected and exactly configured; no manifest, normalized copy or final config is minted here.
5. Export every actual changed blob with its real mode, Git blob SHA1, SHA256 and byteLength. Fatal UTF8 plus exact roundtrip decides text eligibility; arbitrary bytes fall back to base64. Text chunks start at12000 Unicode code points and split adaptively if their ASCII JSON envelope exceeds60000B. Binary chunks use36000B and retain per-chunk byte count/hash/base64. No native evidence/codec/numeric evaluation is added.
6. Assemble an ASCII-escaped transport index from the actual Git identities and generated segment identities; require<=1000000B. Bounds remain prior60000B per segment,1000000B index and64MiB Git command buffer. These are unchanged guards, not a whole-process RSS/total-export certification. Only after validation/preparation create the fresh output nonrecursively, then write segment files and transport.json exclusively with `wx`. Partial output on write failure remains; no cleanup/retry or cap raise is implemented or authorized.
7. Print the small summary using `localCommit: cfg.commit` (unchanged correct variable), fixed/actual parent/tree values, actual changed blob/segment counts, index size/hash, output and `gitMutation:'none'`. No HH14 undefined localCommit regression is introduced. Console summary is not proof of remote publication or runtime success before execution.

| Stage | Caller supplies | Exporter derives from actual bytes/objects |
|---|---|---|
| Admission/config | Exact immutable commit/tree/branch, fixed parent/tree, four hashes, exact allowlists | Canonical paths and equality guards |
| Manifest binding | S1 native frozen manifest path/hash/relative format | Actual blob hashes/optional byte counts |
| Segments | No reconstructed content | Actual changed Git blobs, UTF8 roundtrip or base64 and<=60000B envelopes |
| Index/output | NEW scratch output |<=1000000B transport index, exclusive files and small actual-identity summary |

## Explicit boundaries / review HOLD

S1 alone owns Lab repository packaging and Git writes; root owns connected publication. E2023 creates no config, manifest, commit, export package, ROOT GO, services, PR, main/defaultON/deploy change, HH14 integration or original helper run. Local source parent/tree pins are not canonical remote-parent proof. Exporting byte-exact package artifacts would not make original images/replays portable, approve numerical eligibility, run a producer or establish scientific/physical acceptance.

Root must fully read source/FULL.diff/FLOW/result, then obtain independent S2 source review. Actual export must wait accepted physical package, exactly one S1 commit and separate root GO. Checkpoint pauses here; no syntax/import/export run is requested or implied.
