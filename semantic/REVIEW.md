# Versioned semantic equality probe

## Implemented contract

`equality.mjs` defines two named value comparisons over the unique selected row in a parsed `chainspot-s6-two-ray@1` document:

- `s5-row-part-equals@1.0.0` compares the complete selected parsed row object. Object property order and JSON whitespace do not matter; arrays and scalar values retain exact order/value semantics.
- `s5-row-geometry-observation-equals@1.0.0` compares only `sign`, `u`, `teeCenter`, `badgeCenter`, `templateTop`, `topAlongPx`, `topSignedPerpPx`, and `topProvenance`.

Both comparisons require matching source identity (`schema`, `imageId`, `sourceSha256`, `paramsHash`), a unique selector match, the expected unowned candidate status, matching selected-row identity, and finite two-component `u`. The geometry projection is a separate observation, not proof that the full row Part or any receipt is reusable.

`crisp-byte-identity@1` remains the strict/default policy. The probe retains SHA-256 for each byte sequence even where parsed Part equality succeeds. It writes no files and reports both byte and semantic outcomes.

## Bounded result

On the sealed input, selector `tee-7 / badge-9 / basket-10` selects `s6ray:tee-7:plus:badge-9:basket-10`, status `TWO_RAY_ZERO_BEND_GEOMETRY_CANDIDATE_UNOWNED`, with `u=[0.9988529936399652,0.04788211666666081]`. A formatting-only serialization changed the document hash from `1117c583dc87e861d7de237a2d6f86b72041925d3b1d44c42b0534dc68683fc8` to `ffa4c8a08ced7da97d92a426835af3378fe4e01ae9437ca4d90cd3fc8a611d92`: crisp reports unequal bytes, while complete parsed-Part and geometry-observation equality both report equal. Altering the selected `u` axis changes the byte hash and makes both equality comparisons false.

The sealed S6 file is 705,980 bytes. Its top-level `sourceSha256` identifies the source JPEG (`e6616738640eee1d05d8cc2b59dd657f24b4a5a01dc2f68571b7e44c6f372b8a`); its file-byte SHA-256 is a distinct value (`1117c583…83fc8`). The existing native S7 baseline output is 14,383 bytes and its acceptance remains `UNKNOWN`.

I also ran the existing S7 heading probe in three separate isolated provider copies. The baseline row and a three-space formatting-only rewrite produce the same trace summary (`unknown` / `petered-out`, 64.75 px, one bend, and the same next probe point), while their complete native receipt bytes differ (6,353 vs. 6,355 bytes; different SHA-256) because the receipt records row-byte provenance and path. The changed-axis variant changes `u[1]` from `0.04788211666666081` to `0.04888211666666081`, records a different row hash and heading (2.7445° to 2.8017°), and changes the next probe point, while remaining `unknown` / `petered-out` at 64.75 px and one bend. All three runs exited 0 and wrote receipts; none accepts a route or ownership. Detailed hashes, trace summaries, Part/geometry comparisons, and whole-receipt inequality are in `native-comparison.json`.

Neither the baseline nor heading native S7 output can be treated as the same receipt after semantic row equality: native provenance binds the row bytes (`rowFileSha256`) as well as other identities. A consumer adopting semantic equality must issue a new attestation/receipt that names the equality contract and still records original byte hashes. This probe does not claim whole-receipt equivalence.

## Versioning boundary

The `@1.0.0` labels name the implemented equality Contracts; the probe verifies those behaviors against fixtures. They do not prove automatic compatibility, compatibility with future versions, or that a producer follows the named behavior. Equality Contract versioning is separate from data/knowledge revision. A candidate data/knowledge tuple is `x.y.z`: `x` changes when meaning/Contract changes, `y` adds information, and `z` corrects an existing claim. A correction can invalidate prior compatibility regardless of digit. This convention is proposed and unratified.

Keep a neat label and work lifecycle as separate manifest fields; a compact human display may render `x.y.z-<neat-label>_<work-lifecycle-state>`. The third-axis name remains unresolved: `{DescriptiveLabel: semantic third-axis name}`. Example recipe metadata:

```json
{
  "equalityContract": "s5-row-part-equals",
  "version": { "x": 1, "y": 0, "z": 0 },
  "neatLabel": "row-part",
  "workLifecycleState": "PROPOSED",
  "thirdAxis": { "DescriptiveLabel": "semantic third-axis name" },
  "byteIdentity": "sha256-required",
  "automaticReuse": false
}
```

No version writer or automatic reuse rule is implemented. Hashes, equality results, and evidence decide compatibility; the label alone never does. Any change to selected fields, guards, or equality semantics needs explicit review and new tests.

## Run

```sh
node --test semantic/equality.test.mjs
node semantic/probe.mjs source/chainspot-teams/s7/input/IMG_5641-rows.json
```
