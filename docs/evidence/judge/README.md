# Judge: named confusion counts instead of x/y (`ports/judge/judge.mjs`)

`node ports/judge/judge.mjs --specimen NAME --attempt ID [--json]`

Per stage the judge reports:
- N found;
- TP / FN / FP, each named (`Basket ca = Basket 9 (1.09 px)`, `FN: Tee 3`);
- for association, N correct / incorrect / not associated;
- for the 3-point straight test, TP / FP / FN / TN.

Each miss gets the stage that owns it:
- an S3 tee whose pad footprint touches an owned sprite is (partly) hidden,
  so S4 recovers it; a fully visible one is S3's bug;
- a straight hole whose basket S2 did not find is S4's.

FP is only judged where Sam annotated every hole. On alex (3 bent holes
annotated) the other detections are "unjudged", never errors. Agreement
only: acceptance stays Sam's. Full output: `report.txt`.

| course | S2 baskets found: TP / FN / FP | S3 tees found: TP / FN / FP | S3 association: correct / incorrect / none | S5 straight: TP / FP / FN / TN |
|---|---|---|---|---|
| golden | 17: 17 / 1 (Basket 6) / 0 | 15: 15 / 3 / 0 | 15 / 0 / 0 | 6 / 3 / 1 / 5 |
| lenard | 16: 16 / 2 (Baskets 9, 12) / 0 | 17: 17 / 1 / 0 | 17 / 0 / 0 | 15 / 0 / 2 / 0 |
| townelake | 18: 18 / 0 / 0 | 17: 17 / 1 / 0 | 17 / 0 / 0 | 14 / 1 / 0 / 2 |
| heritage | 15: 15 / 3 (Baskets 12, 13, 17) / 0 | 14: 14 / 4 / 0 | 14 / 0 / 0 | 0 / 3 / 1 / 10 |
| alex (holes 6, 13, 16) | 15: 3 / 0 / unjudged (12) | 13: 2 / 1 / unjudged (11) | 2 / 0 / 0 | 0 / 0 / 0 / 2 |

S3 tee FN, by owner:
- **(Partly) hidden, so S4:** golden Tee 12, townelake Tee 13, heritage Tees
  5, 6, 10, 15, alex Tee 13.
- **Fully visible, so S3 missed it:** golden Tees 3 and 5, lenard Tee 3. In
  each, a semi-transparent C1/C2 ring stroke crosses the white frame
  (`s3-missed-visible-tees.png`). That is a concrete S3 work item.

S5 straight FN: every one is a straight hole whose basket is missing from
S2 (golden 6, lenard 9 and 12, heritage 17), so S4's. S5 straight FP (bent
called straight): golden 7, 14, 15; townelake 16; heritage 1, 8, 9. The
hallway must reject these.
