# Golden testimony

`DashsTrack-full.annotation.json` is **Sam's hand annotation** of the golden
specimen (Dash's track, `IMG_5641.jpg`, source sha256
`e6616738640eee1d05d8cc2b59dd657f24b4a5a01dc2f68571b7e44c6f372b8a`).
It was authored by Sam, by hand; it is testimony, not a detector output, and
it is copied here byte for byte (sha256
`8b861acd38ca07ddfdf123daf5e3ee5445b84dc137f043897e87b96a34721c85`).

- Frame: the annotation frame is the **source** frame (1290 x 2091). The
  canonical raster is the S0 crop; canonical y = source y - `upperRowsRemoved`
  from the S0 crop receipt (4 on golden). Consumers read the receipt rather
  than hard-coding 4.
- Used by `fg.s3.teeFamily.precision` (lane `s3-findfamily-forkjoin`): each
  admitted tee is judged against `holes[].tee.{xPx,yPx}`.
- Acceptance stays Sam's. Agreement with this file is reported as evidence;
  no judge built on it claims acceptance.
- Do not edit. A corrected annotation is a new file with its own hash.
