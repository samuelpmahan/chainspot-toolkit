# The first S7 grid sweep (2026-10-22)

Sam: "With ABFeatures I was able to grid search. I don't think you'll EVER reach that point." This is the first grid run with
the S7 feature registry (`ports/s7route/features.mjs`) and `pxc sweep` (`ports/s7trace/gridSweep.mjs`, `gridCell.mjs`).

- Sweep `attempts/sweeps/s7-first-grid/`: `results.md` and `results.json`, one cell per config x course under `cells/`.
  The spec is `ports/s7trace/grids/first.json`.
- Follow-up `attempts/sweeps/s7-first-grid-followup/`, spec `ports/s7trace/grids/followup.json`: first legs and ranks 5 alone.

Both run S7 only, on the existing attempts in `docs/evidence/dev-s1s4/ATTEMPTS` and `docs/evidence/validation-s7/ATTEMPTS`.
Code digest `847b1c37ff3f7ee7`.

## The grid

Six knobs over the S7 default (`routeMatchKBendsSeq3SearchW`), plus the evidence ranking crossed with every kept config. Its
twin shares the sequencing's cells, so it costs only the final ranking.

| knob (registry) | values | unit |
|---|---|---|
| `firstLegs` (enabled) | off / on | toggle |
| `kBends.refineStarts` | 1 / 3 / 5 | count |
| `neighbourhood.ranks` | 3 / 5 | ranks |
| `bendGate.gainFrac` (the per-bend gate) | 0.03 / 0.05 / 0.08 | frac of visible sensor stations |
| `turnPrice.kappaLum` | 5 / 10 / 20 | lum |
| `follower.runW` | 2.4 / 3.4 / 4.4 | W |
| `evidenceRank` (enabled, crossed) | off / on | toggle |

The product is 648 configs. A seeded subsample took 110 of the 324 non-evidence combinations (seed 2026), then resumed to
220. The resumed sample is a superset, the same permutation's first 220. Each was crossed with the evidence ranking on and off.
That gives 440 configs plus the S7 default. 2 were duplicates by hash (the named FirstLegs and Evidence configs), and none
was invalid. 441 configs x 16 courses = 7,056 cells. The courses are:
- dev with testimony: golden, lenard, townelake, heritage, alex;
- the 11 validation views.

Wall time was 3,426 s (57 min) with `--jobs 3 --chunk 40`, over two runs of the command: 1,697 s and 1,729 s. A stopped first
attempt computed 133 cells in about 2 min, and the next run resumed them.

## Cost per config x course (S7 routeMatch, s)

- **ownMs**, what a config costs alone once the shared Parts exist: mean 5.66, median 4.19, p90 14.8, max 29.4. The sum is
  39,943 s over the 7,056 cells.
- **paidMs**, what the sweep paid. Configs on one store reuse the follower's steps and the sequencing's cells: mean 1.45, median
  0.47, p90 2.98, max 33.9. The sum is 10,211 s, so sharing cut the work 3.9x.
- **Shared Parts**: the attempt load, scene, hallway, starts, straight verdicts, tables, first legs and evidence. They took
  370 s over 64 course tasks.
- **Mean ownMs per course**:
  - seatacFull 11.7, beaverranchFull 11.5, coletocreekLazy 15.5, heritage 10.0;
  - fountainhillsLazy 8.6, beaverranchLazy 7.0, coletocreekFull 5.5, beaverranchCapture 5.1, seatacCapture 5.1;
  - coletocreekCapture 4.7, alex 4.1;
  - townelake 0.7, golden 0.6, fountainhillsCapture 0.5, lenard 0.0, fountainhillsFull 0.0.
- **The S7 default**: 136 s summed over the 16 courses (8.5 s per course). FirstLegs takes 62 s.

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
| `1fd844d6ebfa` | none (the S7 default) | 75/75 | 31/1/1 | 6/6 | 123/133 | 8.5 |
| `28ea336a7671` | firstLegs on (routeMatchKBendsSeq3SearchWFirstLegs) | 75/75 | 31/1/1 | 6/6 | 126/133 | 3.9 |
| `76e5f455a172` | evidenceRank on (routeMatchKBendsSeq3SearchWEvidence) | 75/75 | 31/1/1 | 6/6 | 123/133 | 6.9 |
| `db7d5790b53a` | firstLegs on; neighbourhood ranks 5 | 75/75 | 31/1/1 | 6/6 | 127/133 | 4.0 |

- **Shortlist.** 159 of the 441 configs pass both filters: no dev regression against the default on any course, and Sam's six all
  right. All 441 get Sam's six right. 64 reach 127/133 cross-view, and none goes higher.
- **Top 10.** All 10 are 127/133 with 75/75 and 31/1/1, ranked by time, 3.6-4.0 s per course. Every one has first legs on and
  ranks 5.
  - The fastest is `4a6ee3acb876` (refineStarts 1, ranks 5, kappa 5 lum, first legs on), and its evidence twin `c9ba5f573ff5`.
  - The simplest is `db7d5790b53a`: first legs on with ranks 5. It is rank 9, and it was also run alone in the follow-up.
- **Pareto front** over dev agree, bend errors, Sam's six, cross-view and time: 6 configs, all with first legs on.
  - `c9ba5f573ff5` and `c48d6638c557` (cross-view 125/133, 3.4 s) keep the dev bends.
  - The other four trade a dev bend for time. They have gain 0.08: heritage loses a bend hit (30/2/1 or 30/2/2).

What the knobs do (means over the 440 grid configs; a regression is any dev course worse than the default):
- **Per-bend gate.** gainFrac 0.08 regresses all 146 of its configs: heritage bends hit 18 -> 17.
- **Refine starts.** refineStarts 1 regresses 116 of 152: golden 17/18 plus an extra bend, which is golden 5 again, the reason
  the default has 3. It passes in exactly the 36 configs with kappa 5 lum and a gain other than 0.08. This is an interaction
  no one-sibling-at-a-time comparison would have shown: the lower turning price keeps golden 5 at one bend without the extra
  refine starts.
- **Turning price.** kappa 20 lum lowers cross-view to a mean of 119.8, against 125.4 at 10 and 125.0 at 5, and costs 112 s
  against 85 s.
- **Follower run.** runW 4.4 W costs 118 s against 83 s at 3.4 W, for no gain. 2.4 W is the cheapest (69 s).
- **Evidence ranking.** On or off, the metrics are identical on average (123.5 cross-view either way).
- **First legs.** On raises cross-view by 2.1 on average.
- **Neighbourhood.** Ranks 5 removes the seqFirstRanks widenings: 48 holes widened on 10 courses under the default, none at 5.

## Verdict against the default (agreement with these measures, not acceptance: acceptance is Sam's)

The grid finds configs that beat the S7 default:
- dev is the same (75/75, 31/1/1);
- Sam's six are the same (6/6);
- cross-view rises from 123 to 127 of 133;
- they are about 2x faster.

They also beat `routeMatchKBendsSeq3SearchWFirstLegs` (126/133). FirstLegs fixes seatacFull 16 and beaverranchLazy 3/17/20, but
it moves beaverranchLazy 1 and 21: 1 goes Basket cr -> cs and 21 goes Basket cs -> cr, and hole 1 then disagrees with its
Capture view.

With ranks 5 as well (`db7d5790b53a`), beaverranchLazy 1 and 21 keep the default's baskets (cr and cs), and 3/17/20 are still
fixed. The six holes still disagreeing:
- beaverranchLazy 2;
- coletocreekLazy 7 and 14;
- fountainhillsLazy 14;
- seatacFull 10 and 11, the known swap.

The routes of `db7d5790b53a` differ from the default only on beaverranchLazy, seatacCapture and seatacFull.

Cross-view is ground-truth free and not yet calibrated on annotated courses (AGENTS.md). The default pointer is unchanged.
`db7d5790b53a` is the candidate to render and put to Sam: first legs on, ranks 5.
