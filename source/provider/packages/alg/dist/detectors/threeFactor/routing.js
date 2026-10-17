"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ROUTING_KNOBS = void 0;
exports.routeBadgeLegs = routeBadgeLegs;
const ribbon_1 = require("./ribbon");
const DX = [-1, 0, 1, -1, 1, -1, 0, 1];
const DY = [-1, -1, -1, 0, 0, 1, 1, 1];
const STEP = [Math.SQRT2, 1, Math.SQRT2, 1, 1, Math.SQRT2, 1, Math.SQRT2];
exports.DEFAULT_ROUTING_KNOBS = {
    quantum: 0.125,
    ring: 64,
    seedCostClamp: 1.4,
    seedClampRadiusCells: 6
};
function flood(field, source, ribbonKnobs, routingKnobs) {
    const cost = (0, ribbon_1.buildSupportCost)(field, ribbonKnobs);
    const size = field.width * field.height;
    const distance = new Float64Array(size).fill(Infinity);
    const previous = new Int32Array(size).fill(-1);
    const done = new Uint8Array(size);
    const local = new Float32Array(cost);
    const sx = Math.max(0, Math.min(field.width - 1, Math.round(source.xPx / field.scale)));
    const sy = Math.max(0, Math.min(field.height - 1, Math.round(source.yPx / field.scale)));
    const seedRadius = routingKnobs.seedClampRadiusCells;
    for (let dy = -seedRadius; dy <= seedRadius; dy++)
        for (let dx = -seedRadius; dx <= seedRadius; dx++) {
            if (dx * dx + dy * dy > seedRadius * seedRadius)
                continue;
            const x = sx + dx;
            const y = sy + dy;
            if (x < 0 || y < 0 || x >= field.width || y >= field.height)
                continue;
            const cell = y * field.width + x;
            if (local[cell] > routingKnobs.seedCostClamp)
                local[cell] = routingKnobs.seedCostClamp;
        }
    const queues = Array.from({ length: routingKnobs.ring }, () => []);
    const seed = sy * field.width + sx;
    distance[seed] = 0;
    queues[0].push(seed);
    let pending = 1;
    let cursor = 0;
    while (pending > 0) {
        const queue = queues[cursor % routingKnobs.ring];
        if (!queue.length) {
            cursor++;
            continue;
        }
        const current = queue.pop();
        pending--;
        if (done[current])
            continue;
        const scheduled = Math.floor(distance[current] / routingKnobs.quantum);
        if (scheduled > cursor) {
            queues[scheduled % routingKnobs.ring].push(current);
            pending++;
            continue;
        }
        done[current] = 1;
        const x = current % field.width;
        const y = Math.floor(current / field.width);
        for (let k = 0; k < 8; k++) {
            const nx = x + DX[k];
            const ny = y + DY[k];
            if (nx < 0 || ny < 0 || nx >= field.width || ny >= field.height)
                continue;
            const next = ny * field.width + nx;
            if (done[next])
                continue;
            const candidate = distance[current] + 0.5 * (local[current] + local[next]) * STEP[k];
            if (candidate < distance[next]) {
                distance[next] = candidate;
                previous[next] = current;
                queues[Math.floor(candidate / routingKnobs.quantum) % routingKnobs.ring].push(next);
                pending++;
            }
        }
    }
    return { distance, previous };
}
function pathFor(field, flooded, point, yOffsetPx) {
    const x = Math.max(0, Math.min(field.width - 1, Math.round(point.xPx / field.scale)));
    const y = Math.max(0, Math.min(field.height - 1, Math.round((point.yPx - yOffsetPx) / field.scale)));
    const goal = y * field.width + x;
    if (!Number.isFinite(flooded.distance[goal])) {
        return { endpointId: point.id, geodesic: Infinity, path: [], reachable: false };
    }
    const cells = [];
    for (let cell = goal; cell >= 0; cell = flooded.previous[cell]) {
        cells.push(cell);
        if (cell === flooded.previous[cell])
            break;
    }
    cells.reverse();
    return {
        endpointId: point.id,
        geodesic: flooded.distance[goal],
        path: cells.map((cell) => [
            (cell % field.width) * field.scale,
            Math.floor(cell / field.width) * field.scale + yOffsetPx
        ]),
        reachable: true
    };
}
function routeBadgeLegs(field, badge, tees, baskets, yOffsetPx, ribbonKnobs = ribbon_1.DEFAULT_RIBBON_KNOBS, routingKnobs = exports.DEFAULT_ROUTING_KNOBS) {
    const flooded = flood(field, { ...badge, yPx: badge.yPx - yOffsetPx }, ribbonKnobs, routingKnobs);
    return {
        tees: tees.map((tee) => pathFor(field, flooded, tee, yOffsetPx)),
        baskets: baskets.map((basket) => pathFor(field, flooded, basket, yOffsetPx))
    };
}
//# sourceMappingURL=routing.js.map