# Two lanes: platform and algorithm

Two agents work the repo at once (Sam, 2026-10-18). They share `AGENTS.md`, `DOCTRINE.md` and the dev scoreboard; they
own different files; they coordinate through recorded results, never through each other's code.

| lane | owns | must show |
|---|---|---|
| **platform** (Claude) | `fg/**`, `scripts/**`, `docs/agents/**`, `AGENTS.md`, `CLAUDE.md`, `recipes/**`, `stages/**`, `ports/judge/**`, `ui/**` | identical output on every dev course after any change (`docs/evidence/dev-s1s4/ATTEMPTS`) |
| **algorithm** (ChatGPT / Codex) | `impl/**`, `ports/s4recover/**`, `ports/s3assoc/**`, `ports/early/s3FamilyFix.mjs`, `ports/early/s*Assembly.mjs`, `ports/early/basketRecovery.mjs` | the judged delta per course (TP/FN/FP, right/wrong hole), called before the run |

A change a lane needs in the other lane's files is a request (a note in the PR or to Sam), not an edit. A file both
lanes touch is a design question for Sam.

## The algorithm lane: how to start

Nothing is understood from the code alone. Run it, read what it wrote, then ask Sam what it is for.

1. **Run everything** (`AGENTS.md`, "Run everything"). Read the advisory boundary report it prints.
2. **Run golden end to end** and read the outputs before any code:
   - `node toolkit.mjs neat --recipe recipes/chainspot-s0-s7.json --specimen golden --until 4 --lanes s3-findfamily-structural-fix,s4.basketRecovery`, then the `next` command it prints;
   - `node ports/s3assoc/run.mjs --specimen golden --attempt <id>`;
   - `node ports/s4recover/run.mjs --specimen golden --attempt <id>`: open `s4recover.flipbook.html` (profile page, Part pages, pose frames), `instrumentation.json`, `cmp.fn.Tee.recover.json`;
   - `node ports/judge/judge.mjs --specimen golden --attempt <id>`.
3. **Repeat for the other five dev courses**, one subagent per course (see below). Then `node scripts/pxc.mjs state`:
   the derived matrix of every stage on every course (goal, expected, result, status, freshness). Compare with
   `docs/evidence/dev-s1s4/scoreboard.md`, the frozen record of S1-S4 on dev (2026-10-18); once `frozen.json` exists
   the matrix shows each row as same / changed / new against it.
4. **Then work with Sam on goals and motivations.** `DOCTRINE.md` holds his rulings; `stages/s*.json` holds each
   stage's `responsibility`. Ask him what each stage is for and why before proposing a signal. Implement his general
   rules as he gives them; no detours he did not ask for.
5. **Current frontier** (from the scoreboard): heritage Tee 6 still FN after S4; alex 17/18 tees; northpark unjudged
   (no testimony: cross-validate, `docs/evidence/crossval/`); S2 basket FNs (golden 6; lenard 9, 12; heritage 12,
   13, 17) are recovered by S4 `basketRecovery`.

## Rules the algorithm lane works under

- **Call the shot before the run.** For a behaviour change, write the predicted judged delta per course (which
  holes change from FN to TP, which stay) before running; grade it after. An uncalled change in the result is not
  a foul, it is a finding to investigate (alex Tee 12 fell out of a pose-search refactor and was real).
- **A refactor gives identical output on every dev course** before it is claimed: `node scripts/pxc.mjs state --retest`
  re-runs only the cells your change made stale, then every row reads `same` against `frozen.json`.
- **Testimony is optional and impeachable.** Sam's marks are often a few px off. A disagreement is a render to
  cross-reference by eye, never a verdict against the pipeline.
- **Render to decide.** Legible: labelled, coloured by status, with a legend. Sam often sees the differentiator in a
  picture.
- **Work in the system.** Parts by address from the PxC board; math as store queries (`fn.q.*`); state as an
  argument; data conditions recorded, never thrown. `node scripts/pxc.mjs explain boundary|parts|calculations`.
- **Numbers carry a unit and a referent** (what, on which course). Candidates are `Basket cX` until proven.

## Maximal subagents

Use as many parallel readers and runners as the work has independent pieces; keep one orchestrator.

- One subagent per dev course for runs, judging and reading outputs; one per stage for reading a stage's code
  against its outputs; one per file for inventories.
- Subagents are read-only unless the orchestrator assigns a file. Each reports findings with file:line, units and
  referents; the orchestrator verifies the top findings itself before acting on them.
- Reports go to the user with the render that supports them.

## Kickoff prompt (paste to start the lane)

> You are the algorithm lane of chainspot-toolkit. Read `AGENTS.md`, then `docs/agents/lanes.md`. Do not change
> code yet. Run the test suite, then run golden through S0-S4 plus association, recovery and the judge, and read the
> outputs (flipbooks, instrumentation, judge JSON). Fan out one subagent per dev course for the other five courses
> and one per stage to read each stage's code against what it produced. Report, with units and referents and
> renders, what each stage does on each course and where the results differ from `docs/evidence/dev-s1s4/scoreboard.md`.
> Then ask me what each stage is for and why, before proposing anything.
