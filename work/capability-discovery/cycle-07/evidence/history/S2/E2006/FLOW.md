# E2006 — construction flow / review checkpoint

Status: design only; root construction approval pending. Source and tests are not yet written, and nothing has run. MEP/brainstorming is used to freeze the closed seam before implementation; tests-first construction honors root's explicit no-execution restriction, so no observed RED/GREEN claim will be made.

## Mise-en-Plase

What Pre-Prep established: E2001 pins48 slots and96 original answers; E2002 source paths distinguish plannedQueries rawArgs, queryTrace state/error/nativeAnswer, nested nativeEntry status/error, and absent callback args. Original recipe provides per-store11 callbacks with lazy constant seq1 exiting before profile seq0, then sequential queries.

Alignment-critical interpretations: bind raw arguments by source-derived attribution, not nonexistent dynamic callback fields. Parse encoded wire trees without full native aggregate decode. No original plane files, imports of CV modules, or arbitrary caller answers/geometry. Fixed absolute root remains nonportable.

Recommendation and alternatives: one small pure core plus one default-OFF fixed I/O entry. Prefer this to full aggregate decode (unnecessary large native materialization) or copied historical scalar tokens (not exact native inputs).

Scope/non-goals: only E2006 scratch source/tests/docs, no repository writes or actual execution. Return detached lossless48-slot plan; no producer/writer/CLI.

Acceptance/proof at The Pass: exact source/contract/test/FLOW hashes, complete actual-flow walkthrough, genuine result with all execution counts0, explicit proposed cap and attribution limits. Later independent review and separately admitted fabricated NONCV tests precede any original numeric decode.

Exact actions if fired: author tests first; implement closed guard and bounded prehash pipeline; implement canonical tagged-wire selection and exact fragment joins; classify fit/validate controls/build ordered arguments; cap lossless detached output; document actual code flow. Do not run commands importing/checking/testing these modules.

Head Chef's Call requested: root's explicit approval of this construction design only. Status: HOLD before helper implementation.

## Intended interface (pending approval)

`await buildOriginalEvidencePlan({schema:'cycle07-original-evidence-plan-request@1',enabled:true,token:'cycle07-E2006-original-evidence-plan-v1'})`.

Token is an exact request/admission identifier, not durable cross-process spent-token enforcement. Helper writes no file. An external later admitted runner must reserve its one-shot token/output before enabling. Future producer budgets are outside this helper.

Tests import only Node builtins, code under test, and pinned pure codec definitions; no source/PATH/store recipe imports. Tests will be authored before implementation and left UNEXECUTED. The pure core receives already-bound encoded evidence internally; the public enabled entry accepts no evidence/geometry/root injection.
