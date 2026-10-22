# The first S7 grid sweep (2026-10-22)

Sam: "With ABFeatures I was able to grid search. I don't think you'll EVER reach that point."

This is the first grid run over the S7 knobs. Each knob is a declared arg of the step that reads it (`fg/store.mjs register
{ args }`), and `pxc sweep` runs the grid (`ports/s7trace/gridSweep.mjs`, `gridCell.mjs`).
- `pxc sweep --registry` lists every knob as `fn#knob`, with its unit, default, sweep values and stated assumption.
- A config is a sparse `{ fn: { knob: value } }`.

**Sweep `attempts/sweeps/s7-first-grid-knobs/`.** `results.md` and `results.json`, one cell per config x course under `cells/`.
The spec is `ports/s7trace/grids/first.json` and the code digest `8c4dd8de69ac239e`.

**Run on the options-object code: `attempts/sweeps/s7-first-grid/`.** The same 441 configs, before the knobs moved to their
steps (code `847b1c37ff3f7ee7`). Both runs give identical routes in all 7,056 config x course cells, and identical dev, Sam's six
and cross-view numbers for all 441 configs. That is the refactor's proof at grid scale.

Both run S7 only, on the existing attempts in `docs/evidence/dev-s1s4/ATTEMPTS` and `docs/evidence/validation-s7/ATTEMPTS`.

## The grid

Six knobs over the S7 default (`routeMatchKBendsSeq3SearchW`, the empty config), plus the evidence ranking crossed with every kept
config. Its twin shares the sequencing step's answer, so it costs only the final ranking.

| knob (`fn#knob`) | values | unit |
|---|---|---|
| `fn.q.trace.seqCells#firstLegs` | false / true | bool |
| `fn.q.trace.seqCells#refineStarts` | 1 / 3 / 5 | count |
| `fn.q.trace.seqCells#neighbours` | 3 / 5 | ranks (assumption `seqFirstRanks`) |
| bendGate: `seqCells#bendGain` and `fn.q.match.placeBends#gain` together | 0.03 / 0.05 / 0.08 | frac of visible sensor stations |
| `fn.q.trace.seqCells#turnKappa` | 5 / 10 / 20 | lum |
| `fn.q.match.followW#runW` | 2.4 / 3.4 / 4.4 | W |
| `fn.q.trace.routeMatch#evidenceRank` (crossed) | false / true | bool |

bendGate is one option over two knobs: the per-bend gate was one constant read by two steps.

The product is 648 configs. A seeded subsample took 220 of the 324 non-evidence combinations (seed 2026), each crossed with the
evidence ranking on and off. That gives 440 configs plus the S7 default. 2 were duplicates by hash (the named FirstLegs and
Evidence configs), and none was invalid. 441 configs x 16 courses = 7,056 cells. The courses are:
- dev with testimony: golden, lenard, townelake, heritage, alex;
- the 11 validation views.

Wall time was 3,372 s (56 min) with `--jobs 3 --chunk 40`.

## Cost per config x course (S7 routeMatch, s)

- **ownMs**, what a config costs alone once the shared Parts exist: mean 5.85, median 4.23, p90 15.0, max 30.8. The sum is
  41,290 s.
- **paidMs**, what the sweep paid. Configs on one store share every step answer whose knobs they share: mean 1.37, median 0.48,
  p90 2.86, max 36.7. The sum is 9,689 s, so sharing cut the work 4.3x.
- **Shared Parts** (the attempt load, scene, hallway, starts, straight verdicts, tables, first legs, evidence): 362 s over the
  course tasks.
- **Mean ownMs per course**:
  - coletocreekLazy 15.6, beaverranchFull 12.1, seatacFull 12.1, heritage 10.7;
  - fountainhillsLazy 8.9, beaverranchLazy 7.3, coletocreekFull 5.8, seatacCapture 5.2, beaverranchCapture 5.1;
  - coletocreekCapture 4.8, alex 4.3;
  - townelake 0.7, golden 0.6, fountainhillsCapture 0.5, lenard 0.0, fountainhillsFull 0.0.
- **The S7 default**: 140 s summed over the 16 courses (8.7 s per course).
- **Noise**: time differences under about 0.3 s per course are run-to-run noise. The two runs order the ties differently.

## Results (referents: results.md)

What each column means:
- **dev agree**: holes ending within 12 px of Sam's basket and inside W / 2 of his corridor. There are 75 judged holes on the 5
  dev courses.
- **bends**: Sam's bends hit / missed and our extra bends (same courses).
- **Sam's six**: `docs/evidence/validation-s7/sam-six.json`. The basket he called, and the hand-trace bends for Coleto 18 and
  SeaTac 19.
- **cross-view**: Full / Lazy holes whose route length in R1 is within 15 % of the Capture view's. 133 holes are compared.
- **s per course**: ownMs summed over the 16 courses, divided by 16.

| config | deviation from the S7 default | dev agree | bends | Sam's six | cross-view | s per course |
|---|---|---|---|---|---|---|
| `ac25a16fd792` | none (the S7 default) | 75/75 | 31/1/1 | 6/6 | 123/133 | 8.7 |
| `68b054b13caf` | seqCells firstLegs (routeMatchKBendsSeq3SearchWFirstLegs) | 75/75 | 31/1/1 | 6/6 | 126/133 | 4.1 |
| `79a9e16498e7` | routeMatch evidenceRank (routeMatchKBendsSeq3SearchWEvidence) | 75/75 | 31/1/1 | 6/6 | 123/133 | 4.3 |
| `dc328e3681ab` | seqCells firstLegs, neighbours 5 | 75/75 | 31/1/1 | 6/6 | 127/133 | 4.2 |

- **Shortlist.** 159 of the 441 configs pass both filters: no dev regression against the default on any course, and Sam's six all
  right. All 441 get Sam's six right. The other 282 regress a dev course. 64 reach 127/133 cross-view, and none goes higher.
- **Top 10.** All 10 are 127/133 with 75/75 and 31/1/1, at 3.7-4.2 s per course. Every one has first legs on and neighbours 5.
  - Ranked by time, the fastest are `12bf3442aa3c` and `24ad853ed0a2` (refineStarts 1, turnKappa 5 lum, with and without the
    evidence ranking).
  - The simplest is `dc328e3681ab`, rank 12: first legs and neighbours 5, nothing else.
- **Pareto front** over dev agree, bend errors, Sam's six, cross-view and time: 8 configs, all with first legs on.
  - Five trade a heritage bend for a few tenths of a second per course (3.3-3.6 s), all at gate 0.08: 30/2/1 or 30/2/2.
  - Three keep the dev bends: `12bf3442aa3c` (127/133), `cb188a3242c3` (126/133) and `82c2df6b1ddb` (125/133).

What the knobs do (means over the 440 grid configs; a regression is any dev course worse than the default):
- **Per-bend gate.** At 0.08, all 146 of its configs regress: heritage bends hit 18 -> 17.
- **Refine starts.** refineStarts 1 regresses 116 of 152: golden 17/18 plus an extra bend, which is golden 5, the reason the
  default has 3. It passes in exactly the 36 configs with turnKappa 5 lum and a gate other than 0.08. That is an interaction a
  one-sibling-at-a-time comparison does not show: the lower turning price keeps golden 5 at one bend without the extra refine
  starts.
- **Turning price.** turnKappa 20 lum lowers cross-view to a mean of 119.8, against 125.4 at 10 and 125.0 at 5, and costs more
  time.
- **Follower run.** runW 4.4 W is the slowest for no gain; 2.4 W is the cheapest.
- **Evidence ranking.** On or off, the metrics are identical on average.
- **First legs.** On raises cross-view by 2.1 on average.
- **Neighbourhood.** neighbours 5 removes the seqFirstRanks widenings: 48 holes widened on 10 courses under the default.

## Verdict against the default (agreement with these measures, not acceptance: acceptance is Sam's)

The grid finds configs that beat the S7 default:
- dev is the same (75/75, 31/1/1);
- Sam's six are the same (6/6);
- cross-view rises from 123 to 127 of 133;
- they are about 2x faster.

They also beat `routeMatchKBendsSeq3SearchWFirstLegs` (126/133). FirstLegs fixes seatacFull 16 and beaverranchLazy 3/17/20, but
it moves beaverranchLazy 1 and 21: 1 goes Basket cr -> cs and 21 goes Basket cs -> cr, and hole 1 then disagrees with its
Capture view.

With neighbours 5 as well (`dc328e3681ab`), beaverranchLazy 1 and 21 keep the default's baskets, and 3/17/20 stay fixed. The
six holes still disagreeing:
- beaverranchLazy 2;
- coletocreekLazy 7 and 14;
- fountainhillsLazy 14;
- seatacFull 10 and 11, the known swap.

Its routes differ from the default only on beaverranchLazy, seatacCapture and seatacFull.

Cross-view is ground-truth free and not yet calibrated on annotated courses (AGENTS.md). The default pointer is unchanged.
`dc328e3681ab` is the candidate to render and put to Sam: `{ 'fn.q.trace.seqCells': { firstLegs: true, neighbours: 5 } }`.
