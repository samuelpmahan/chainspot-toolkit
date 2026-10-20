/**
 * fn.q.s0.purple: the share of a capture's canonical pixels that are the UDisc round view's purple walk line (Sam, 2026-10-20: "find
 * purple and it's thrown"). The walk line is a violet stroke with a white core; its colour was measured on the walk line of therecThrown,
 * dashs5612 and dashs5613 (101 000 px in therecThrown): hue 254-263 deg (1st-99th percentile, median 260), saturation 0.41-0.72, value
 * 0.53-0.81, median RGB (101, 66, 179). The blue pins and the straight-line overlay sit at 210 deg and the course map's own colours do not
 * reach 250 deg, so the band is hue 250-270 deg, S >= 0.35, V >= 0.45. A capture is thrown when the purple share is at least THROWN_CUT.
 * Units: share = purple px / canonical px (fraction of the image); pixels = count (px) in the canonical frame.
 */
export const PURPLE = Object.freeze({ hueMinDeg: 250, hueMaxDeg: 270, satMin: 0.35, valMin: 0.45 });
/** the cut, in the middle of the measured gap: 17 clean captures have 0 purple px, the 5 thrown ones 0.50-3.8 % (lowest: the Dash overview), so 0.25 %: thrown = purple share >= this (fraction of canonical px) */
export const THROWN_CUT = 0.0025;

export function purpleShare({ widthPx, heightPx, rgba }, band = PURPLE) {
  let n = 0;
  const total = widthPx * heightPx;
  for (let i = 0, p = 0; i < total; i++, p += 4) {
    const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2], v = r > g ? (r > b ? r : b) : g > b ? g : b;
    if (v < band.valMin * 255) continue;
    const mn = r < g ? (r < b ? r : b) : g < b ? g : b, d = v - mn;
    if (d < band.satMin * v) continue;
    const hue = (v === r ? ((g - b) / d) % 6 : v === g ? 2 + (b - r) / d : 4 + (r - g) / d) * 60, h = hue < 0 ? hue + 360 : hue;
    if (h >= band.hueMinDeg && h <= band.hueMaxDeg) n++;
  }
  return { share: n / total, pixels: n, canonicalPixels: total, band, unit: 'share: fraction of canonical px; pixels: px' };
}
export const PURPLE_QUERIES = Object.freeze({
  'fn.q.s0.purple': ({ a }) => { const r = purpleShare(a); return { value: { ...r, thrown: r.share >= THROWN_CUT, cut: THROWN_CUT }, unit: 'share: fraction of canonical px (purple px / all px); pixels: px; thrown: purple share >= cut' }; }
});
