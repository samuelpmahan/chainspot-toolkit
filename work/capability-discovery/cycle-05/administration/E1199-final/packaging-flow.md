# E1199 administrative helper actual-flow checkpoint (not a CV run)

Written: capture-package.mjs SHA2565338ff570f18ff8716aa01bbee86fd931f51c6cb1a156ba14867a19b768e6572; verify-package.py045651b08cf3bc776ba1c764d9355fdf79de2d49ac9929c1c05f1d2c6eb9e3ba; stage-replay.pya814a3b992e0d26ffe52b9df01b18d04cb734abdb0355eec7be79f6112dc5851. Only source writing/read/hash inspection has occurred at this checkpoint; no helper execution or capture phase. Root found and corrected the initial storage-path collision by source inspection; exact first helper ef48a1f196d74aebc1b5eceb59e5622ecf2514e0fda71862a3474d9a9bbc0dcc remains separate, not falsely labelled a failed execution.

Root has since accepted R1115/R1116 and inspected both original PNG figures. Therefore ONE actual final capture is proposed; no artificial initial phase is created. Optional initial/final mechanics merely support truthful earlier snapshots if one actually existed.

## Invocation table

| Command / operation | Inputs | Actual work / outputs |
| --- | --- | --- |
| node capture-package.mjs FROM TO final | Exact current discovery-cycle05; prior2062 inventory/source7 freeze; new cycle05 package | Hash old/source boundary; read regular files; omit3 large deferred Lenard PNGs with identities; dedup exact byte hashes; zstd only beneficial large data; verify decompression; exclusive phase-qualified storage; final original-name index+phase pointer; explicit nonrecursive admin/history copies; hash boundary again |
| python3 verify-package.py --phase final | Selected exact capture index, stored bytes, old/source manifests; package-manifest if present | Verify stored/original byte count/SHA256 and all old2062/new7; verify payload when available; report counts, no semantic/execution inference |
| python3 stage-replay.py --phase final --out NEW_OUTSIDE_CHECKOUT | Exact selected captured bytes/index | Restore exact original names/bytes; symlink existing complete repo; separately write path-only code and explicit disk-manifest companions and their hashes; create stage receipt; do not execute any restored file |

No product, codec, CV, PNG decoder, fixture generator, producer, renderer or native solver is imported/called by these helpers. zstd reads bytes only. No Git mutation/network/service write. Existing accepted source and frozen original evidence are never changed.

## Storage and phase rules

New content is always stored at capture/final/original-path (or capture/initial/original-path only for a real earlier phase); archival executable source suffix .txt and optional .zst are storage mappings only. Exact SHA aliases may point across original paths/phases. Mutable state whose content changes receives a different final path rather than colliding/overwriting an earlier snapshot. The selected final index restores the latest snapshot at its original name. --phase initial, if that phase really exists, restores that distinct older set. Captured state is historical and never live dispatch permission.

All raw producer/replay fragments and differing timing-bearing artifacts are retained. Original tagged bytes are not parsed/reencoded for storage. Code/CLI manifest portable companions replace only old base paths and are distinctly named; original manifests/traces retain exact bytes. Portable scripts do not silently switch to portable manifests. No execution/equality attestation is inherited after path changes.

No redundant giant reviewer fixture copies are stored twice: exact aliases restore their names from the authoritative bytes. Raw synthetic RGBA/masks are actually retained losslessly compressed, not guessed/regenerated. Only3 deferred/unexecuted Lenard original PNG bodies are omitted, with Git source object/encoded/RGBA/decoder metadata and explicit missing-body limitation; stager never fetches/decodes/reconstructs them.

## Pending administrative execution / handoff

Need root confirmation of current5338 helper's small explicit admin-copy addition after reviewed phase-path fix. Then execute the one final capture, CV-free verifier and fresh scratch stage, retaining exact outputs/statuses/hashes. Final source/payload manifest/checksums and all validation artifacts must be independently audited before any separately admitted local Git checkpoint/root connected publication. F6 remains actually reserved ADMIN; no owner release, PR/main/deploy/defaultON or scientific acceptance is claimed.
