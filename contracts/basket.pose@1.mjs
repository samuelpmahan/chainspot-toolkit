/**
 * contracts/basket.pose@1: when two Basket findings are the SAME basket.
 *
 * Geometric identity: the bbox centers lie within centerPx and the bbox
 * width and height each agree within sizePx. A basket is a fixed sprite on
 * a course, so its box is its pose; there is no angle.
 *
 * Fields read (any one frame, the same for both members):
 *   bbox: [x, y, w, h]
 *
 * Versioning: any change to a tolerance or a field is basket.pose@2.
 * Browser-safe.
 */
import { defineContract } from '../fg/identity.mjs';

const r4 = (v) => Math.round(v * 1e4) / 1e4;

export default defineContract({
  id: 'basket.pose',
  version: 1,
  subject: 'Basket pose: bbox center (px) and bbox size (px), one shared frame',
  tolerances: { centerPx: 2, sizePx: 2 },
  describe: 'same basket iff |bbox center_a - bbox center_b| <= 2 px and |w_a - w_b|, |h_a - h_b| <= 2 px',
  compare(a, b, { centerPx, sizePx }) {
    const [ax, ay, aw, ah] = a.bbox, [bx, by, bw, bh] = b.bbox;
    const centerDistPx = Math.hypot(ax + aw / 2 - (bx + bw / 2), ay + ah / 2 - (by + bh / 2));
    const sizeDiffPx = Math.max(Math.abs(aw - bw), Math.abs(ah - bh));
    const ok = centerDistPx <= centerPx && sizeDiffPx <= sizePx;
    const score = Math.max(centerDistPx / (centerPx || 1), sizeDiffPx / (sizePx || 1));
    return { ok, score, centerDistPx: r4(centerDistPx), sizeDiffPx: r4(sizeDiffPx) };
  }
});
