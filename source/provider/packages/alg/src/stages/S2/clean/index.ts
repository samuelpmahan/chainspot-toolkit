import type { CompositeResult } from '../../../g0/composite';
import { canonicalJson } from '../../../detectors/threeFactor/hash';
import { nullFeatureContext } from '../../../detectors/threeFactor/features/types';
import type { PxC } from '../../../exec/board';
import type { CompiledExecutionPlan } from '../../../exec/compile';
import type { OperationSpec, TickTestimony } from '../../../exec/contract';
import { executeCompiledPlan, type OperationRuntime } from '../../../exec/gateway';
import { composePcr, type Pcr } from '../../../exec/pcr';
import { sha256HexSyncText } from '../../../exec/sha256';
import { createMemorySink } from '../../../exec/sink';
import { ComponentPxC } from '../../componentPxC';
import {
	Basket,
	BasketFn,
	BasketPxC,
	registerBasket,
	type BasketFamily,
	type BasketShellFamily,
	type BasketShellShape
} from './Basket';

export { Basket, BasketFn, BasketPxC } from './Basket';

export const S2_DETECT_FAMILY_TICK: OperationSpec = {
	id: 'Basket.detectFamily',
	kind: 'compute',
	gate: 'S2',
	unit: 'Basket',
	consumes: [ComponentPxC.fields.address],
	produces: [BasketPxC.family.address],
	calculations: [BasketFn.detectFamily.address],
	accessConformance: 'exact',
	note: 'Basket queries generic bright components for the current white-body family.'
};

export const S2_LEARN_SHELL_SHAPE_TICK: OperationSpec = {
	id: 'Basket.learnShellShape',
	kind: 'compute',
	gate: 'S2',
	unit: 'Basket',
	consumes: [BasketPxC.family.address, ComponentPxC.fields.address],
	produces: [BasketPxC.shellShape.address],
	calculations: [BasketFn.learnShellShape.address],
	accessConformance: 'exact',
	note: "Overlap the members' dark frames in sprite frame and keep what they share (learned), else the carried dev-course prior."
};

export const S2_FIND_SHELL_FAMILY_TICK: OperationSpec = {
	id: 'Basket.findShellFamily',
	kind: 'compute',
	gate: 'S2',
	unit: 'Basket',
	consumes: [BasketPxC.shellShape.address, BasketPxC.family.address, ComponentPxC.fields.address],
	produces: [BasketPxC.shellFamily.address],
	calculations: [BasketFn.findShellFamily.address],
	accessConformance: 'exact',
	note: "Read every member's shell as the shell shape on its own dark px; dark px off the shape are not its shell."
};

export const S2_FIND_PX_TICK: OperationSpec = {
	id: 'Basket.findPx',
	kind: 'transform',
	gate: 'S2',
	unit: 'Basket',
	consumes: [BasketPxC.shellFamily.address, ComponentPxC.fields.address],
	produces: [BasketPxC.objects.address],
	calculations: [BasketFn.findPx.address],
	accessConformance: 'exact',
	note: 'Construct Basket objects from exact bright-body and dark-shell component pixels.'
};

const S2_OPS = [S2_DETECT_FAMILY_TICK, S2_LEARN_SHELL_SHAPE_TICK, S2_FIND_SHELL_FAMILY_TICK, S2_FIND_PX_TICK] as const;
const S2_PLAN: CompiledExecutionPlan = {
	ops: S2_OPS,
	bindings: {},
	planFingerprint: sha256HexSyncText(canonicalJson({ candidate: 'S2-baskets', ops: S2_OPS }))
};

function detectFamily(pxc: PxC): void {
	pxc.set(BasketPxC.family, Basket.detectFamily(pxc));
}

function learnShellShape(pxc: PxC): void {
	pxc.set(BasketPxC.shellShape, Basket.learnShellShape(pxc));
}

function findShellFamily(pxc: PxC): void {
	pxc.set(BasketPxC.shellFamily, Basket.findShellFamily(pxc));
}

function findPx(pxc: PxC): void {
	pxc.set(BasketPxC.objects, Basket.findPx(pxc));
}

const S2_RUNTIME: OperationRuntime = {
	implementations: new Map([
		[S2_DETECT_FAMILY_TICK.id, detectFamily],
		[S2_LEARN_SHELL_SHAPE_TICK.id, learnShellShape],
		[S2_FIND_SHELL_FAMILY_TICK.id, findShellFamily],
		[S2_FIND_PX_TICK.id, findPx]
	]),
	calculationBindings: new Map([
		[
			S2_DETECT_FAMILY_TICK.id,
			[{ address: BasketFn.detectFamily.address, calculate: Basket.detectFamily }]
		],
		[
			S2_LEARN_SHELL_SHAPE_TICK.id,
			[{ address: BasketFn.learnShellShape.address, calculate: Basket.learnShellShape }]
		],
		[
			S2_FIND_SHELL_FAMILY_TICK.id,
			[{ address: BasketFn.findShellFamily.address, calculate: Basket.findShellFamily }]
		],
		[S2_FIND_PX_TICK.id, [{ address: BasketFn.findPx.address, calculate: Basket.findPx }]]
	])
};

export interface S2Subtraction {
	readonly widthPx: number;
	readonly heightPx: number;
	readonly rgba: Uint8ClampedArray;
	readonly basketPx: number;
	readonly overlapPx: number;
	readonly remainingOpaquePx: number;
}

export function materializeS2Subtraction(
	image: CompositeResult,
	baskets: readonly Basket[]
): S2Subtraction {
	const px = new Set<number>();
	let visits = 0;
	for (const basket of baskets)
		for (const pixel of basket.px) {
			visits++;
			px.add(pixel);
		}
	const rgba = new Uint8ClampedArray(image.rgba);
	for (const pixel of px) rgba[pixel * 4 + 3] = 0;
	let remainingOpaquePx = 0;
	for (let pixel = 0; pixel < image.widthPx * image.heightPx; pixel++)
		if (rgba[pixel * 4 + 3] !== 0) remainingOpaquePx++;
	return {
		widthPx: image.widthPx,
		heightPx: image.heightPx,
		rgba,
		basketPx: px.size,
		overlapPx: visits - px.size,
		remainingOpaquePx
	};
}

export interface S2BasketsCandidateRun {
	readonly pxc: PxC;
	readonly image: CompositeResult;
	readonly family: BasketFamily;
	readonly shellShape: BasketShellShape;
	readonly shellFamily: BasketShellFamily;
	readonly baskets: readonly Basket[];
	readonly plan: CompiledExecutionPlan;
	readonly testimonies: readonly TickTestimony[];
	readonly pcr: Pcr;
}

export function executeS2BasketsCandidate(pxc: PxC): S2BasketsCandidateRun {
	if (!pxc.has(ComponentPxC.fields))
		throw new Error(`S2 requires PxC address '${ComponentPxC.fields.address}'.`);
	registerBasket(pxc);
	const testimonies = executeCompiledPlan(
		S2_PLAN,
		pxc,
		nullFeatureContext,
		createMemorySink(),
		S2_RUNTIME
	);
	const pcr = composePcr(
		{
			id: 'S2.baskets-candidate',
			title: 'Components → Basket objects',
			tickIds: S2_PLAN.ops.map((operation) => operation.id)
		},
		S2_PLAN,
		testimonies
	);
	return {
		pxc,
		image: pxc.get(ComponentPxC.image),
		family: pxc.get(BasketPxC.family),
		shellShape: pxc.get(BasketPxC.shellShape),
		shellFamily: pxc.get(BasketPxC.shellFamily),
		baskets: pxc.get(BasketPxC.objects),
		plan: S2_PLAN,
		testimonies,
		pcr
	};
}
