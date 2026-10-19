# S7 after S5: 18x18 score, match, then hallway-sensor bends (prototype, 2026-10-19)

Sam: "after S5 you ONLY need to solve badge -> basket"; "start from 18x18 matching, first ensure 18/18 associations";
"the POINT of score -> rank -> match is to prevent all that"; "assignment + bend refinement passes using the hallway sensor".

Inputs: S3 + S4 tees (S5 pairs every one with its badge), S2 + S4 baskets. Runs on the recorded s7main tracker helpers
(`docs/evidence/s7main`: course.py, contrast.py, polyscore.py, badgeseed.py, teebadge.py, s3first.py judge) with
`after_s4.py` adding S4's tees and baskets.

1. **Associations**: every badge's tee within 8 px of Sam's tee (18/18 on all four courses).
2. **Score** every hole x every basket by render-and-score edge contrast (lum/px) over its best straight or one-bend
   route, the bend on the tee axis past the badge (`match18.py`).
3. **Prior** (packet E03, verified): the nearest BasketPoint on the tee ray past the badge within W/2 gets +15.
4. **Match** one-to-one (Hungarian) over the whole matrix: no greedy claims.
5. **Bends** by the hallway sensor (per-station edge test, both edges step > 8 lum at the hallway width; reading = pass
   fraction): straight if it reads >= 0.75, else the contrast one-bend route; a second bend only when the one-bend reads
   < 0.75 and the two-bend reads >= 0.75 and gains >= 0.15 (`match6.py`, packet E05).

| course | hallway width | baskets right | routes inside Sam's corridor (max off <= W/2, end at his basket) |
|---|---|---|---|
| golden | 41.5 px | 18/18 | 18/18 |
| lenard | 35.8 px | 18/18 | 18/18 |
| townelake | 36.8 px | 18/18 | 18/18 |
| heritage | 31.2 px | 18/18 | 18/18 (with hole 8 straight, the 2026-10-18 correction) |

What did not work, kept as evidence: the greedy tracer then match (heritage 11/18); the sensor fraction as the
assignment score (a short route with 26 visible stations reads 1.00 and steals a basket: `match2.py`); a second bend
accepted on +2 lum/px of contrast alone (golden 4 and 6 left the corridor).
Next: graduate as Parts (route table = scoring, these rules = matching) and run northpark and alex.
