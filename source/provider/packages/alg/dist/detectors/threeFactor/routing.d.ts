import type { LegEvidence, SupportFieldEvidence } from './types';
import { type RibbonKnobs } from './ribbon';
/**
 * g5.routing knobs, threaded down as plain parameters. quantum/ring are the
 * bucketed priority queue's geometry: correctness requires
 * `ring * quantum` to exceed the maximum possible single-step edge weight
 * (`(1 + ribbon.costMultiplier) * Math.SQRT2`), or bucket indices wrap and
 * silently corrupt distances instead of erroring. That cross-feature
 * relationship can't live in a single knob's validate() (which only sees
 * its own value), so it's enforced in config.ts's resolveConfig instead —
 * see validateRoutingRingQuantum there.
 */
export interface RoutingKnobs {
    readonly quantum: number;
    readonly ring: number;
    readonly seedCostClamp: number;
    readonly seedClampRadiusCells: number;
}
export declare const DEFAULT_ROUTING_KNOBS: RoutingKnobs;
export interface RoutePoint {
    readonly id: string;
    readonly xPx: number;
    readonly yPx: number;
}
export declare function routeBadgeLegs(field: SupportFieldEvidence, badge: RoutePoint, tees: readonly RoutePoint[], baskets: readonly RoutePoint[], yOffsetPx: number, ribbonKnobs?: RibbonKnobs, routingKnobs?: RoutingKnobs): {
    tees: readonly LegEvidence[];
    baskets: readonly LegEvidence[];
};
