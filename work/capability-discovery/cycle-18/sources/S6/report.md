# Lab18 E4806 / S6 — new trace/corridor projection scout

## Result

Outcome: **mixed_change**. Negative for a new admitted lab-owned hard failure. Exact advanced-Claude commit `c67c2c232814048c5b0b074aff8b7e0f4651da93` introduces an old-schema corridor judge path with an explicit `bendsJudged: false` qualifier. Some summaries omit that qualifier. This is a source-backed active-owner projection observation, not an executed regression, a demonstrated lab-owned consumer failure, or permission to import/fix/rerun the active branch.

Physical admission remains HOLD. Route-to-testimony agreement is not physical acceptance, independently verified geometry, bend truth, frame/control admission, or new capability evidence.

## Source-backed trace

1. `ports/s7trace/judgeBends.mjs:35–43`: the new `!p.bends && p.centre` path judges the route while explicitly setting `bendsJudged: false`, `bendsSam: null`, and, on a reached trace, `note: 'old annotation schema: route judged on the corridor centreline (edges oriented by geometry); bends not judged'`. Missing/non-reached rows also mark bends unjudged.
2. `judgeBends.mjs:60–63`: aggregate bend fields sum `r[k] ?? 0` over judged route rows. An all-old-schema population therefore contributes zero to each bend count. This is a static data-flow inference, not a run or an observed real-course output.
3. `ports/s7trace/compare.mjs:68–72`: raw judge rows survive as `perBranch[n].rows`. The comparator does **not** destroy the underlying qualifiers globally.
4. `compare.mjs:110–115`: the per-hole display row explicitly selects fields but omits `bendsJudged` and `note`. It preserves route agreement and displays bend-count nulls, but does not explain the distinction between route judged and bends unjudged. Its per-hole title/verdict/receipt at 118–122 do not restore the qualifier.
5. `compare.mjs:87–96`: branch summary titles/ledger project the aggregate bend counts without a bend-judgment-scope field. The general legend at line 18 describes the dashed corridor as tee -> bends -> basket even though the new `samLine` can use sampled old-schema centreline points, which are not bend testimony.
6. `ports/s7trace/run.mjs:143–144,161–165`: the standalone overview labels retain hole/status/ok, not bend-judgment scope; CLI branch summaries print bend counts, also without the qualifier.
7. Counterevidence: `ports/s7trace/guarantees.mjs:69,74` spreads the full judge row into its judge ledger and returns the full rows. `run.mjs:128–132` preserves the comparison value, including raw branch rows, and 149–152 saves guarantee records. The full saved evidence can therefore retain the qualifier even when a summary does not. This rules out a claim of wholesale saved-evidence loss.

The source omission is concrete; whether a user-facing display misleads in an actual admitted output is untested here.

## Ownership and non-duplication

The changed corridor path belongs to the active Claude source owner at the exact commit above. A possible follow-up is to ask that owner to preserve the existing bend-unjudged qualifier and explanatory note alongside their route-agreement summaries, explicitly distinguishing sampled centreline points from bend testimony. That is a **proposal only**. It must not silently alter totals, acceptance/pointer rules, trace production, geometry, algorithms, or physical claims. Any lab-side reproduction or consumer change requires a separate bounded admission and suitable saved-input custody.

This is not the completed Lab17 heading-claim repair: different owner/commit, source fields (`bendsJudged`/`note`), and consumers (`s7trace`). Lab17's accepted heading-ablation evidence remains reusable under unchanged exact inputs. No new lab-owned hard failure was demonstrated, and this report does not nominate an authorized implementation task.

`fg/s7route/routeRender.mjs` was pinned and inspected as optional source context. No novel route-table finding is promoted; it is not among the changed files named by this commit response.

## What actually happened and did not happen

Read-only GitHub fetches used explicit commit refs. Source UTF-8 byte counts/SHA256 hashes and Git blob SHA1s were computed as opaque text; every computed blob matched the connector's returned SHA. The fetch_commit response supplied change context (including incidental diff text); no product module was imported or executed. Read-only local checks read cycle-17 CURRENT and git remote/status; the worktree was clean at that check.

Only this report, `sourcepins.json`, and `outcome.json` are written, under the assigned Lab18/S6 output directory. No branch modification, algorithm/producer/geometry execution, test command, pixel access, native query, scientific evaluation, commit/push, or HH work occurred. E4012 metadata/RGBA and consumed E2021 were not opened.

No runtime RED/GREEN, rendered artifact, visual legibility result, speedup, or physical acceptance is claimed. Systematic-debugging guided source-boundary tracing only; execution phases were not entered. Materialize guided separation of source observation, counterevidence, ownership, and unexecuted proposal.

