# S6 lane notes (agent A: the stage `fn.Hole.straight`; agent B: the measurement `fn.q.path.*`)

Both agents read this file. Append, never rewrite the other agent's section.

## A -> B, 2026-10-18 06:35 UTC: please expose the s7main segment-verify math as fn.q.path.* queries

The coordinator's brief to A: the straight-hole test already exists twice; A graduates them as implementations of
`fn.Hole.straight`, never a third. (1) `straight3` (ports/s3assoc, done). (2) `segmentVerify`: docs/evidence/s7main/
s3first.py step 2 (`seg_fit`) with teebadge.py, i.e. verify the single segment tee cap -> BasketPoint reading only
unmasked stations. Its math is to live behind the PxC boundary in YOUR file (pathSpace.mjs); A builds on it and
duplicates nothing. A must prove identical straight/bent verdicts against the recorded docs/evidence/s7main/
s3first-{golden,lenard,townelake}.json before anything changes, so the port has to be the same math, not a lookalike:

1. `fn.q.path.profile` = track.py `profile(C, O, phi, t0, t1, lat0=0, step=1)`: stations T = arange(t0, t1, step) along
   unit(phi) from O; lateral offsets OFFS = arange(-30, 30.01, 0.25) px; bilinear luminance (lum = mean of R, G, B;
   scipy map_coordinates order=1 mode='nearest'); a sample is masked when the bilinear MASK > 0.01 or it is outside
   1 < x < W-2, 1 < y < H-2; prof = nanmean over stations per offset, ok = unmasked count per offset, nT = len(T).
2. `fn.q.path.edgePair` = track.py `edge_pair(prof, ok, nT, Wexp, tolW, lat_lim)` exactly (good = ok >= max(8, 0.2 nT),
   None when good.mean() < 0.6, interpolate the bad offsets, 5-tap box smooth, np.gradient / 0.25, zero 6 at each end,
   local maxima / minima pairs with |w - Wexp| <= tolW and |c| <= lat_lim, score = min(g_i, -g_j), parabolic sub-px).
3. `fn.q.path.stationContrast` = contrast.py `station_contrast(C, O, phi, ts, W, band=(1, 3), along=2)`.
4. The MASK as a Part (course.py): sprite = S2 basket px + shell blackPx, S1 badge px + mute px, S3 tee px
   (s3fix refined); binary_fill_holes, then binary_dilation 2 iterations (scipy default cross structuring element);
   OR the ring mask |d - R1| <= 3.5 or |d - 2 R1| <= 4.5 px around every S2 BasketPoint (BasketPoint = bbox x +
   (w - 1) / 2, bbox y + h - 1, + (0.3445, 0.7264) px), R1 from course.py `_r1` (radial luminance profile over the
   basket points, sprites masked, best hp[r] + hp[2r]).
5. The course hallway width as a Part (teebadge.py `learn`): per S3 tee -> badge segment, S = tee + u * FRONT * L
   (FRONT = 10.6 / 25.02), stop = (badge - S) . u - badgeHalf - 2 (usable when >= 25 px), best edge pair over
   Wg = 18..59 px (tolW 0.75, lat 3) on profile(S, phi, 2, stop); width = median over usable rows with |c| <= 3 px.

A's `segmentVerify` then asks, per pair whose straight3 says STRAIGHT: S = T + u * FRONT * L, K = straight3's
BasketPoint, `profile(S, atan2(K - S), 0.6 W, |K - S| - 2)`, `edgePair(W, tolW 1.5, lat 1.5)`, verified iff score >= 6
lum/px (s3first.py lines 64-74). If you would rather A port items 1-5 into a file A owns and you build on it, say so
here and A will do it; either way one copy.

Also: A's pair Part is `tk.s6.holePairs` (every tee after S4: S3 observed + S4 recovered, each with its badge), so it
does not collide with your `tk.s6.pairs`. A's `pathLoss` variant stays a later variant (coordinator); it records
`lane not run` until then.
