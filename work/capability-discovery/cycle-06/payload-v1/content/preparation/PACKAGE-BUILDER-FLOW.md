# E1524 prospective actual-flow checkpoint — NOT_RUN

Written helper: prepare-stage.py. No syntax/import/test/helper execution, staging, archive, final manifest, Git mutation or publication has occurred. This is a small prospective packaging helper, not product code; no TDD cycle or verified runtime behavior is claimed. Root explicitly prohibited tests/imports/producer execution during this preparation phase.

Entry: the exact prospective Python3.12 invocation in REPRODUCE.md, with root-reviewed allowlist SHA256 and an absent absolute stage outside the repository. Root must bind the helper hash itself in its execution admission before running it.

1. Parse only four explicit CLI arguments. Require the original canonical workspace and exact draft allowlist path. Read the allowlist as bytes and reject its digest/schema/status/workspace mismatch before decoding its entries.
2. Require an absolute absent output named `discovery-cycle06-stage-*` directly under the existing canonical workspace, outside the source repository and HH/PageRouter. The output directory is created only after all entries pass prechecks. Root selects the exact new stage path; the helper does not choose one or silently reuse a prefix.
3. For every entry, reject absolute/traversal/noncanonical destination names, backslashes, duplicate/reserved destinations and executable `.test.mjs` evidence names. Source path components may not be symlinks; each source must be a regular file with exact declared size/SHA256/mode. Only allowlisted entries are read, no recursive directory capture.
4. Exclusively create the stage. Reverify each source, copy its original body with `xb`, apply its mode, and independently read back exact bytes/mode. Source `.test.mjs` and captured `.mjs` aliases are already named `.txt` by the draft origin map, without changing their body bytes. No codec decode, project import, subprocess, query or archive library is used.
5. Recheck every source after copying and require unchanged allowlist bytes. Write separate DRAFT-ORIGIN-INDEX and DRAFT-STAGE-RECEIPT; these are path-only staging companions and not original evidence or final manifests. Verify the stage file set equals explicit entries plus the two draft receipts.
6. Print a compact actual draft-stage receipt only if execution reaches the end. On a failure, Python stops and retains the incomplete prefix; there is no cleanup/retry, source repair or permission escalation.

| Operation | Input | Transformation | Output |
|---|---|---|---|
| relative_name | Explicit source/destination name | Canonical relative-component checks | Safe relative name or first refusal |
| regular_body / verify_entry | Original workspace path + exact metadata | Nonsymlink/regular/size/SHA256/mode check | Unmodified bytes or first refusal |
| main copy loop | Reviewed allowlist + absent output | Exclusive byte copy, preserved mode, before/after checks | Draft exact aliases plus separately labeled origin/receipt |

This helper deliberately does not yet construct raw tar.zstd archives, a final manifest, self-contained image inputs, a portable G1 attestation or runnable replay wiring. Its checks are file-time engineering guards, not hostile-filesystem race protection or atomic/durable commit guarantees. No command has been run, so its runtime behavior remains unverified. Later archive construction requires a distinct exact builder/checkpoint and finalfreeze GO after comparison plus independent visual outcomes.

Review requested: accept this exact file-only draft staging flow and bind an exclusive stage path/digests, or return an amendment. Until then the helper remains NOT_RUN.
