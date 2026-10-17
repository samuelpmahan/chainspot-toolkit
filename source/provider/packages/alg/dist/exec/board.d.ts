import type { OperationSpec, PxWriteTestimony, SlotRef } from './contract';
export interface PxKey<T> {
    readonly address: SlotRef;
    readonly __value?: T;
}
export interface PxFn<Args, Result> {
    readonly address: `fn.${string}`;
    readonly __args?: Args;
    readonly __result?: Result;
}
export type PxCalculation<Args, Result> = (args: Args) => Result;
export declare function pxKey<T>(address: SlotRef): PxKey<T>;
export declare function pxFn<Args, Result>(address: `fn.${string}`): PxFn<Args, Result>;
/**
 * PxC's browser-safe address space.  ExecBoard remains as a compatibility
 * name because this is the existing production board evolving in place, not
 * a second synchronized store.
 */
export interface PxC {
    get<T>(slot: SlotRef | PxKey<T>): T;
    has(slot: SlotRef | PxKey<unknown>): boolean;
    set<T>(slot: SlotRef | PxKey<T>, value: T): void;
    register<Args, Result>(fn: PxFn<Args, Result>, calculate: PxCalculation<Args, Result>): void;
    call<Args, Result>(fn: PxFn<Args, Result>, args: Args): Result;
}
export type ExecBoard = PxC;
export declare function createExecBoard(): PxC;
/**
 * Wraps a board so every get()/set() call made through the wrapper during
 * one operation's run is recorded — the gateway's source for `actualConsumes`/
 * `actualProduces` on that operation's Receipt (see contract.ts). The
 * underlying board is untouched; this is a one-shot recorder, not a
 * persistent proxy.
 */
export declare function trackAccess(board: PxC, tick: Pick<OperationSpec, 'id' | 'consumes'>): {
    tracked: PxC;
    consumed: Set<SlotRef>;
    produced: Set<SlotRef>;
    writes: PxWriteTestimony[];
};
