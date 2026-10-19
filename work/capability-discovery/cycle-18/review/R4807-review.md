# R4807 / S4 — independent review of frozen S1 admission synthesis

Decision: **accepted**, scoped to the source-only current-admission verdict. No amendment to S1 is required. This does not admit an implementation, runtime falsifier, product test, consumer replay, physical claim or adoption of active-owner code.

## Fresh read and identity checks

This review freshly executed read-only `sha256sum`, `sed`, `jq` and file-name discovery commands. It read the complete frozen S1 verdict and policy, S6 report/pins, root's three retained source-content envelopes, and the E4802 timing qualification plus both referenced JSON records. Source content was decoded as opaque UTF-8 text through `jq -j` and hashed through `sha256sum`; no source was imported or invoked.

| Frozen review input | Fresh SHA256 observed |
|---|---|
| S1/admission-verdict.md | bc8d4618b067f2be25d2a8d25fde8727a175491e9852782d86ac9fc47119708e |
| S1/guard-policy.json | 502a12bbabb98e30499c1d6c11b9321bafb6b27ec6bfb94ca5f9bfb15471b85e |

Both match root's admission pins exactly. Root's retained source envelopes bind `samuelpmahan/chainspot-toolkit@c67c2c232814048c5b0b074aff8b7e0f4651da93`. Fresh decoded-content hashes match S6's exact source pins:

| Path | SHA256 | Pinned Git blob |
|---|---|---|
| ports/s7trace/compare.mjs | 29a5efeb39062f08ecd2193cdbb2dd4e9e54bd675c53b49243a60772591b7e29 | 15e742e619b9c31a91ef8d2e4841de02788f58c2 |
| ports/s7trace/judgeBends.mjs | 28886ae99592f568e9e28b3bec6d09e35ec55ee058c682267e44a7a79f6688ec | 7bd7f8ee7310f5e41b0912e2bd12ba3ed3093fe0 |
| ports/s7trace/guarantees.mjs | b40bdb271d53dd1a78abe0584f7217fa01d106f4b712da2122ae46bc72079464 | 119869e2c757f81f7a781e5cf9fe278c0066c2ad |

These are source identity checks, not operation/equivalence checks. R4807 did not independently refetch remote content or reconstruct the entire remote commit/tree/ref history.

## Findings supporting acceptance

1. **Fresh source is meaningful, not guard closure.** `judgeBends`35–43 adds old-schema centreline route judging while explicitly marking `bendsJudged:false` and `bendsSam:null`. This can enlarge route-judged coverage, but is not new bend testimony or independently established physical ribbon truth. The selected sources do not supply the required exact frame/crop custody, independent control ownership, literal independently fixed heading arms or accepted exposure policy. HOLD is therefore justified for this selected-source admission.

2. **Projection omission and counterevidence both survive synthesis.** `compare`110–115 explicitly selects per-hole display fields without `bendsJudged`/`note`;87–96 projects bend aggregates without judgment-scope metadata. However,68–72 retains raw judge rows in the comparison return, while `guarantees`69 spreads the complete row into its ledger and74 returns full rows. S1 correctly limits S6 to an active-owner summary projection observation, not wholesale saved-evidence loss. No rendered user impact, runtime regression, lab-owned runnable failure or authorized lab repair has been demonstrated by these selected source reads.

3. **No missing-data numerical promotion.** `judgeBends`60–63 sums null/missing bend fields as zero for aggregates. The preserved old-schema qualifier means those zeros must not become claims of zero real bends or complete bend success. S1 states source-only/not-verified operation and does not manufacture a pass rate, physical width, continuity or generalization result. Agreement is not acceptance.

4. **Admission wording is appropriately bounded.** I accept “FALSIFIED_BY_SELECTED_SOURCE_FOR_CURRENT_ADMISSION” only as rejection of the proposed admission on the current selected evidence. It is not an executed scientific falsifier or proof that no useful capability/lab-owned task can exist anywhere. Both frozen S1 files explicitly retain that scope. Existing operations remain reuse candidates only under separate admitted action; the stop rule does not require a duplicate sensor/judge or toy failure.

5. **Timing qualification remains intact.** Fresh hashes of `receipts/E4802.json` and `S2/outcome.json` respectively are `8b854dde7b864c8a142c8ca24a838b7e5cf925ad0c46ac96f6ab05ba326dee5e` and `d8ce1c218be900330ec8fe57d7e9df7107d08c7f79e07afbd4055c1e6bb8a0ee`, exactly matching `receipt-timing-qualification.json`. Both files exist and retain identical outcome/summary. The timing note explicitly says native completion preceded the worker's final disclosure amendment and preserves both versions without rewriting the original receipt. This review confirms record identity/retention and the disclosed qualification, not an independent reconstruction of wall-clock/native chronology. S1 does not conceal or relabel it as repeat execution.

## Independence and limits

I authored the earlier E4804 scout. R4807 reviews S1's separately authored frozen synthesis and independently inspects the retained S6 source/counterevidence; it is not a claim that E4804 has independently validated physical evidence. My earlier source observations remain source-only contributions. Other scouts' remote-source histories, fixture custody and broad-capture disclosures remain attributed synthesis inputs, not independently rerun audits in R4807.

No product source, tests, queries, algorithms, geometry or renderer was imported/executed. No pixels, E4012 metadata/RGBA, consumed E2021/token/R2021/old160 or real44 were opened. No adoption, branch/Git write, patch, native-state write, HH, publication or mutation of frozen S1/S2/S6/root records occurred. Only this review and its outcome JSON were written under S4. Physical/original-pixel/new-CV/real44 guards remain HOLD; all product/runtime actions remain NOT_ADMITTED. Root retains native completion/publication authority.
