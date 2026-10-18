# S1-S4 on every dev course (fresh runs from git HEAD, 2026-10-18)

One attempt per course (`ATTEMPTS`):

- **Run:** `--until 4 --lanes s3-findfamily-structural-fix,s4.basketRecovery`,
  then `ports/s3assoc/run.mjs` and `ports/s4recover/run.mjs`.
- **Judge:** `ports/judge/judge.mjs --json` (`<course>.judge.json`).
- **Table:** `scoreboard.py` -> `scoreboard.md`.

How the judging works:

- Every stage is judged by one rule per kind: a tee is a TP within 8 px,
  a basket within 12 px.
- FP is judged only where Sam annotated all 18 holes.
- S4 tees are shown for the `greedyOccluded` branch; `pinned` and the
  no-badge-ray ablation are in the JSON.
- Acceptance is Sam's; this is agreement only.

The Lenard zooms are views of Lenard, not courses, so they are not
rows here.

## Results per course

| course | S1 badges | S2 baskets TP/FN/FP | S3 tees TP/FN/FP | S3 association right/wrong/none | after S4: baskets TP/FN/FP | after S4: tees TP/FN/FP | count closure after S4 (baskets, tees, of 18) |
|---|---|---|---|---|---|---|---|
| golden | 18 | 17/1/0 | 15/3/0 | 15/0/0 | 18/0/0 | 18/0/0 | 18, 18 |
| lenard | 18 | 16/2/0 | 17/1/0 | 17/0/0 | 18/0/0 | 18/0/0 | 18, 18 |
| townelake | 18 | 18/0/0 | 17/1/0 | 17/0/0 | 18/0/0 | 18/0/0 | 18, 18 |
| heritage | 18 | 15/3/0 | 14/4/0 | 14/0/0 | 18/0/0 | 17/1/0 | 18, 17 |
| alex (holes 6, 13, 16 annotated) | 18 | 3/0/- | 2/1/- | 2/0/0 | 3/0/- | 3/0/- | 18, 17 |
| northpark (no testimony) | 18 | - | - | - | - | - | 18, 17 |

Every recovered basket and tee that can be judged is correct and is for
the right hole: 6 baskets and 9 tees, 0 FP. On the 4 fully annotated
courses that leaves 1 miss in 72 tees and 0 in 72 baskets.

**Still missing after S4** (`s4-still-missing.png`): one tee each, and
each time S4 reports "no accepted pose".

- **heritage Tee 6** is entirely under Basket 5's sprite, with no visible
  pad pixel. A scorer that needs visible pixels cannot accept it. It needs
  entailment: badge ray, hallway, and lying wholly inside the occluder.
- **alex Tee 12** and **northpark Tee 5** are not yet inspected. Northpark
  Badge 4 sits on Hole 5's hallway just behind Badge 5, so Tee 5 being
  under Badge 4 is a hypothesis, not checked.

## Stage time (ms, from the run receipts)

| course | S0 | S1 | S2 | S3 | S4 tee recovery |
|---|---|---|---|---|---|
| golden | 1088 | 894 | 50 | 1006 | 5267 |
| lenard | 874 | 832 | 51 | 1134 | 191 |
| townelake | 618 | 687 | 51 | 919 | 188 |
| heritage | 571 | 898 | 49 | 798 | 461 |
| alex | 522 | 739 | 40 | 945 | 3425 |
| northpark | 592 | 595 | 52 | 908 | 346 |

- **First pass.** S0-S3 take 2.0-3.1 s per course.
- **S4 tee recovery** runs only for what is missing: 0.2-5.3 s.
- **Wall clock** for S0-S4 is about 16-22 s per course; the rest is
  harness overhead and is not profiled yet.
