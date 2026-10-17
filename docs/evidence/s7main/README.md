# Hallways solved S3-first (Sam's order) and the content-addressed step cache

This is a parallel copy of the hallway tracker (`docs/evidence/s7edge`),
reordered as tee -> badge -> 0-bend holes by the 3-point straight test ->
n-bend holes by pathfinding (`s3first.py`):
1. **Course width** is learned from every TEE -> BADGE segment (always
   straight, because the badge precedes the first bend), with straight holes
   as the fallback (`teebadge.py`).
   - Golden 41.58 px, lenard 35.75 px, townelake 36.83 px, alex 33.60 px,
     heritage 31.03 px.
   - Where a course also has straight holes, the two measures agree within
     0.13 px.
2. **3-point STRAIGHT holes** are verified as one tee-cap -> BasketPoint
   segment, reading visible stations only.
3. **Other holes with an S3 tee** are traced from the pad's cap along its
   axis.
4. **Holes without a visible tee** fall back to badge-only seeding.

**Judge (Sam's S7 pass condition):** the trace ends at the hole's basket and
its centreline never leaves the hallway, i.e. max distance from Sam's
corridor <= W/2. Bend offsets are reported, never gated.

| course | agrees with Sam | failing holes |
|---|---|---|
| golden | 16/18 | 5, 6 (the cluster) |
| lenard | 16/18 | 9, 12 (their baskets are not in S2: S4's job) |
| townelake | 16/18 | 11, 16 (bent, trace lost) |
| heritage | 5/18 | bent traces lost; tees 5, 6, 10, 15 hidden (needs S4) |
| alex | no testimony | |

Golden hole 9 diagnosis: its hallway (tee -> its basket point, 242.9 px)
is covered by:
- hole 8's basket C1/C2 strokes, 0-75 px along;
- badge 9, 99-157 px;
- its own C2 ring, 150-162 px;
- its own C1 ring, 196-210 px;
- its own basket sprite, 168-243 px.

Verification must read the clear stretches, not a window centred on the
badge.

## Cache (`pxcache.py`)

Key = sha256(step, source bytes of the files the step depends on,
canonical inputs). Proof on townelake:

| run | change | recomputed | reused | time | output sha256 |
|---|---|---|---|---|---|
| 1 | cold | 21 steps | 0 | 84.4 s | a67f738719ab59ee |
| 2 | nothing | 0 | 21 | 0.8 s (-99.1%, ~105x) | a67f738719ab59ee |
| 3 | edit badgeseed.py | 1 badge seed | 20 | 15.6 s | a67f738719ab59ee |
| 4 | move hole 7's tee 0.5 px | 3 traces, refine, badge seed | width, 15 straight checks | 79.5 s | 6dd3a9f925c0edaf |
| 5 | revert | 0 | 21 | 0.8 s | a67f738719ab59ee |

Known over-broad dependency: every trace depends on every tee, because a
trace never turns onto another tee's hallway. Narrowing it to nearby tees is
a later speed-up.

## Two independent geometric signals

Measured on 76 real pads: a random angle at the real position lines up with
its own badge (z <= 3, 40-230 px) in 1.7% of draws, and with any badge in
3.9%. The true angle does 76/76. The centroid-segment signal is therefore
worth ~60x for "this pose belongs to this badge" and ~26x for "this is a
real tee". It is independent of the pad-fit evidence, so the likelihood
ratios multiply.
