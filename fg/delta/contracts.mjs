/**
 * Identity Contracts the Δ layer joins objects with (browser-safe).
 *
 * tee.pose@1 is reused as-is (contracts/tee.pose@1.mjs). Badges, baskets
 * and components have no fitted angle, so they join on their box:
 * object.box@1 = same object iff box centers lie within 2 px and widths and
 * heights each agree within 2 px. Same versioning rule as tee.pose: a changed
 * tolerance is object.box@2.
 */
import { defineContract } from '../identity.mjs';
import teePose from '../../contracts/tee.pose@1.mjs';

export const boxCenter = (b) => [b[0] + b[2] / 2, b[1] + b[3] / 2];

export const objectBox = defineContract({
  id: 'object.box',
  version: 1,
  subject: 'Object box: bbox center (px) and bbox size (px), canonical raster frame',
  tolerances: { centerPx: 2, sizePx: 2 },
  describe: 'same object iff |center_a - center_b| <= 2 px and |w_a - w_b|, |h_a - h_b| <= 2 px',
  compare(a, b, { centerPx, sizePx }) {
    const [ax, ay] = boxCenter(a.bbox), [bx, by] = boxCenter(b.bbox);
    const centerDistPx = Math.hypot(ax - bx, ay - by);
    const sizeDiffPx = Math.max(Math.abs(a.bbox[2] - b.bbox[2]), Math.abs(a.bbox[3] - b.bbox[3]));
    const ok = centerDistPx <= centerPx && sizeDiffPx <= sizePx;
    return { ok, score: Math.max(centerDistPx / (centerPx || 1), sizeDiffPx / (sizePx || 1)), centerDistPx: Math.round(centerDistPx * 1e4) / 1e4, sizeDiffPx };
  }
});

export { teePose };
export const CONTRACTS = { 'tee.pose': teePose, 'object.box': objectBox };
