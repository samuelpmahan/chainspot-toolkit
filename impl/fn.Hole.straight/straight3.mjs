/**
 * fn.Hole.straight / straight3: Sam's 3-point straight test, per tee-badge pair after S4. A hole is straight when the
 * tee centre, the badge centre and a BasketPoint are collinear (TLS max residual <= ASSOC_BOUNDS.straight3TlsPx); the
 * basket is the first one the line reaches. A MATCHING RULE over tk.s6.pairFeatures (ports/s6straight/matching.mjs): the
 * scoring half (tk.s6.feature.geometry, fn.q.hole.straight3Point = ports/s3assoc/associate.mjs straight3Test) wrote the
 * lateral / along / TLS columns; this rule applies the 1.5 px bound. The test cannot tell a bent hole from a straight
 * one whose basket no stage found: that case is recorded as bent with its evidence (sent to pathfinding, the safe side).
 */
import { straight3Rule } from '../../ports/s6straight/matching.mjs';

export const reads = ['tk.s6.pairFeatures'];
export const calls = [];

export default function straight3(parts) { return straight3Rule(parts.get('tk.s6.pairFeatures')); }
