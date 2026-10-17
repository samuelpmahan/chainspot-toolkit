# ChainSpot policy replay

This isolated source is pinned to ChainSpot `5433854c72b1dc5aa420934d91e16458c2abe09f`. `targets/s7-baseline.json` names the existing Golden H7 diagnostic. `targets/s7-heading.json` composes that path with `overlays/s5-axis.json`, which supplies the sealed S6 row and selects one heading invocation Tick. Authoring identity is a path; file hashes establish content identity. The compiler derives dependency edges from those files. The provider bundle is a deliberately coarse dependency.

The toolkit script calls four peer policies: `neat` closes the selected file paths and writes an immutable checkpoint; `kompoze` validates the base, overlay, dependencies and first-class Tick; `crisp` hashes target files, Run Args and selected Tick and verifies any proposed evidence reuse; `tidy` reports checkpoint change, target source match, result evidence, process status and human acceptance separately. `dependencies/smartsync.mjs` stages only the closed manifest for the existing ZIP `root_sync.py`; the existing `localci_test.py` checks its exact-ID fresh extraction before invoking `run`. The run script then verifies a fresh fork file by file, installs from the pinned package lock, and invokes the old `width-probe.mjs` unchanged. Its output is process and receipt evidence, not new gateway Calculation tracing. Dependencies are pinned but npm installation is not claimed offline or hermetic.

From this directory:

```sh
node --test models.test.mjs provider-adapter.test.mjs
node toolkit.mjs neat --files targets/s7-baseline.json,targets/s7-heading.json
node toolkit.mjs kompoze --target targets/s7-heading.json
node toolkit.mjs crisp --target targets/s7-heading.json
node toolkit.mjs run --target targets/s7-baseline.json
node toolkit.mjs run --target targets/s7-heading.json
node toolkit.mjs tidy --target targets/s7-heading.json
node toolkit.mjs compare --target targets/s7-heading.json
node toolkit.mjs package --out /new/path/outside/this/source
```

The package command produces the input directory for the existing agent-serviced scripts. Run `python root_sync.py --push --dir PACKAGE_DIR --folder DRIVE_FOLDER_ID`; after its exact-ID roundtrip receipt is complete, run `python localci_test.py --receipt RECEIPT --folder DRIVE_FOLDER_ID --test-cmd 'node toolkit.mjs run --target targets/s7-heading.json'`. Queue servicing is an agent operation, not a shell-native Drive credential or background service. The LocalCI command exits nonzero on a failed Attempt. The package contains the source, immutable checkpoint and pointer, no `node_modules` or prior Attempts. Installation from the lockfile occurs in the new test fork.

The existing transport is separately saved: [script/agent queue guide](https://drive.google.com/file/d/1J_UHymYzkV5aeBAUWlGLLoC0oJUoELz9/view) and [tool source ZIP](https://drive.google.com/file/d/1VWuAEZkB4XLtZnpTnKAPFsakvPMmCUqk/view), SHA-256 `d32a8a7a3c36e763bfc650ced2fd1beb621100c2565b0811053f966ebeef97f0`. It is required for new Drive ZIP roundtrips, not for local `replay.mjs` after source acquisition.

In local isolated forks, baseline executed and its original width bank stopped at **27.75 px, zero bends, `unknown/petered-out`**. Isolated 50/55 banks reached 37 px but the expanded actual bank remained 27.75 px and unknown. The heading Overlay executed with sealed row SHA-256 `1117c583dc87e861d7de237a2d6f86b72041925d3b1d44c42b0534dc68683fc8`; it reached **64.75 px, one bend, `unknown/petered-out`**. Both runs checked the original JPEG SHA-256 `e6616738640eee1d05d8cc2b59dd657f24b4a5a01dc2f68571b7e44c6f372b8a`, reproduced the baseline support field exactly and emitted native `width-probe.json` receipts. The technical executions passed; arrival, basket ownership and human geometry acceptance remain **UNKNOWN**.

The three executable projections consume one checkpoint/declaration/request/Attempt/evidence fact set. On the same heading request, the inventory can identify path and content state but needs Attempt evidence to claim execution; the graph closes the base, overlay, row, Tick, script and pinned provider and identifies target-specific stale dependencies, but needs lineage to claim actual invocation; lineage retains older and current Attempts, exact Run Args, receipt metrics and evidence freshness, but needs the graph to explain why an input invalidates a target. `compare` emits those native answers and explicit joins, with no winner score. A bounded next S7 check could test badge-exit seed/direction against negative crossing examples; that is a proposal, not an accepted route.

Evidence probes on separate copies: changing only the sealed row left baseline evidence reusable and blocked heading as stale; tampering with baseline evidence changed `crisp` to RUN and `tidy` to MISSING; wrong provider base and absent row rejected before execution. An unsupported badge produced a retained failed Attempt and nonzero CLI exit. These copied scenarios do not alter the pinned source or old provider.

`semantic/` is an additive opt-in equality probe. Its named `@1.0.0` comparisons distinguish byte identity, parsed selected Part equality, geometry-observation equality, native trace equality and complete receipt identity on actual formatting-only and u-axis variants. The formatting case keeps the trace but has a different row and receipt hash; the axis case changes the trace. Strict `crisp` reuse remains unchanged. The suggested `x.y.z` information/correction interpretation and rendered neat label/lifecycle are unratified recipe metadata; no tidy version writer or neat semantic revision manager is implemented. See [semantic/REVIEW.md](semantic/REVIEW.md) for the unresolved third-axis name marker.
