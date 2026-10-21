import basketSpriteData from '../../../detectors/threeFactor/assets/basket-sprite.json';
import basketShellData from '../../../detectors/threeFactor/assets/basket-shell.json';
import {
	componentRef,
	materializeRasterComponentPixels,
	type BasketShellMargins,
	type ComponentRasterEvidence,
	type RasterComponentRef
} from '../../../detectors/threeFactor/componentAssembly';
import type { BrightDarkComponentFields } from '../../../detectors/threeFactor/componentField';
import { extractComponents, type ComponentStats } from '../../../detectors/threeFactor/components';
import type { Mask } from '../../../detectors/threeFactor/raster';
import { pxFn, pxKey, type PxC } from '../../../exec/board';
import { ComponentPxC } from '../../componentPxC';

interface BasketTemplate {
	readonly width: number;
	readonly height: number;
	readonly rows: readonly string[];
}

const template = basketSpriteData as BasketTemplate;
const templateWhiteOffsets = Uint32Array.from(
	template.rows.flatMap((row, y) =>
		[...row].flatMap((value, x) => (value === '1' ? [y * template.width + x] : []))
	)
);

/**
 * The basket sprite's dark frame (its shell), carried in as a prior: learned offline by overlapping every dev-course
 * member's frame in sprite frame (scripts/basket-shell-prior.mjs, the same overlapShellFrames / shellShapeOf below). The
 * sprite is screen-fixed, so its frame is one shape at every zoom (DOCTRINE: basket sprite 46 x 72 px, GLOBAL).
 */
interface BasketShellPrior {
	readonly schema: 'chainspot-basket-shell-prior@1';
	readonly width: number;
	readonly height: number;
	readonly margins: readonly number[];
	readonly rows: readonly string[];
	readonly provenance: { readonly members: number; readonly agreementMin: number; readonly [key: string]: unknown };
}

const shellPrior = basketShellData as BasketShellPrior;

/** The fraction of a family's members that must share a dark px for it to be part of their common frame. */
export const SHELL_AGREEMENT_MIN = 0.75;

/** A window in sprite frame: the body's bbox padded on every side by the body's own size (template px, screen-fixed). */
export interface ShellWindow {
	readonly width: number;
	readonly height: number;
	readonly bodyX: number;
	readonly bodyY: number;
}

/** Members' frames overlapped in sprite frame, registered on the bright body: how many members are dark at each px. */
export interface ShellOverlap {
	readonly window: ShellWindow;
	readonly memberCount: number;
	readonly agree: Uint16Array;
}

/** A frame shape: margins around the body, and the frame px in shell frame (width = body + left + right). */
export interface ShellShapeGeometry {
	readonly margins: BasketShellMargins;
	readonly offsets: Uint32Array;
	readonly areaPx: number;
}

export interface ShellShapeComparison {
	readonly marginsAgree: boolean;
	readonly learnedPx: number;
	readonly carriedPx: number;
	readonly sharedPx: number;
	readonly iou: number;
}

/**
 * px.baskets.shellShape: the frame shape every member's shell is read with. Learned when the members' overlapped frames
 * share a dark component that encloses the body (canopy contact is idiosyncratic per member, so it never reaches the
 * agreement); otherwise the carried prior. Both are kept, and compared when both exist.
 */
export interface BasketShellShape {
	readonly schema: 'chainspot-basket-shell-shape@1';
	readonly source: 'learned' | 'carried' | 'none';
	readonly agreementMin: number;
	readonly agreementCount: number;
	readonly overlap: ShellOverlap;
	readonly learned: ShellShapeGeometry | null;
	readonly learnedCondition: string | null;
	readonly carried: ShellShapeGeometry & { readonly members: number };
	readonly comparison: ShellShapeComparison | null;
	readonly margins: BasketShellMargins | null;
	readonly shellOffsets: Uint32Array;
}

export interface BasketFamilyMember {
	readonly body: ComponentStats;
	readonly areaRatio: number;
	readonly whiteCoverage: number;
}

export interface BasketFamily {
	readonly templateSize: readonly [number, number];
	readonly members: readonly BasketFamilyMember[];
}

export interface BasketShellMember {
	readonly candidate: BasketFamilyMember;
	readonly bbox: readonly [number, number, number, number];
	readonly blackPx: Uint32Array;
	/** The member's own dark px on the shape, over the shape's px: how well this member's frame matches it. */
	readonly shellCoverage: number;
}

export interface BasketShellFamily {
	readonly margins: BasketShellMargins | null;
	readonly shellOffsets: Uint32Array;
	readonly members: readonly BasketShellMember[];
}

interface DetectFamilyArgs {
	readonly fields: BrightDarkComponentFields;
}

interface LearnShellShapeArgs {
	readonly family: BasketFamily;
	readonly fields: BrightDarkComponentFields;
}

interface FindShellFamilyArgs {
	readonly shape: BasketShellShape;
	readonly family: BasketFamily;
	readonly fields: BrightDarkComponentFields;
}

interface FindPxArgs {
	readonly member: BasketShellMember;
	readonly raster: ComponentRasterEvidence;
}

interface FoundBasketPx {
	readonly parts: readonly RasterComponentRef[];
	readonly px: Uint32Array;
	readonly whitePx: number;
	readonly blackPx: number;
}

export const BasketPxC = {
	family: pxKey<BasketFamily>('px.baskets.family'),
	shellShape: pxKey<BasketShellShape>('px.baskets.shellShape'),
	shellFamily: pxKey<BasketShellFamily>('px.baskets.shellFamily'),
	objects: pxKey<readonly Basket[]>('px.baskets')
} as const;

export const BasketFn = {
	detectFamily: pxFn<DetectFamilyArgs, BasketFamily>('fn.Basket.detectFamily'),
	learnShellShape: pxFn<LearnShellShapeArgs, BasketShellShape>('fn.Basket.learnShellShape'),
	findShellFamily: pxFn<FindShellFamilyArgs, BasketShellFamily>('fn.Basket.findShellFamily'),
	findPx: pxFn<FindPxArgs, FoundBasketPx>('fn.Basket.findPx')
} as const;

function countTemplateCoverage(body: ComponentStats, fields: BrightDarkComponentFields): number {
	let hit = 0;
	for (const offset of templateWhiteOffsets) {
		const x = offset % template.width;
		const y = (offset - x) / template.width;
		const global = (body.bboxY + y) * fields.bright.mask.width + body.bboxX + x;
		if (fields.bright.labels[global] === body.label) hit++;
	}
	return hit / Math.max(1, templateWhiteOffsets.length);
}

const detectFamilyCalculation = ({ fields }: DetectFamilyArgs): BasketFamily => {
	const members = fields.bright.components.flatMap((body) => {
		if (body.bboxW !== template.width || body.bboxH !== template.height) return [];
		const areaRatio = body.area / Math.max(1, templateWhiteOffsets.length);
		const whiteCoverage = countTemplateCoverage(body, fields);
		if (areaRatio < 0.96 || areaRatio > 1.03 || whiteCoverage < 0.96) return [];
		return [{ body, areaRatio, whiteCoverage } satisfies BasketFamilyMember];
	});
	return { templateSize: [template.width, template.height], members };
};

/** The sprite-frame window around a body: padded by the body's own width and height on each side. */
export function shellWindow(bodyWidth: number, bodyHeight: number): ShellWindow {
	return { width: 3 * bodyWidth, height: 3 * bodyHeight, bodyX: bodyWidth, bodyY: bodyHeight };
}

/** Overlap members' frames: each entry is a body and the dark mask of its own image (several images pool into one). */
export function overlapShellFrames(
	entries: readonly { readonly body: ComponentStats; readonly dark: Mask }[],
	window: ShellWindow
): ShellOverlap {
	const agree = new Uint16Array(window.width * window.height);
	for (const { body, dark } of entries) {
		const x0 = body.bboxX - window.bodyX;
		const y0 = body.bboxY - window.bodyY;
		for (let y = 0; y < window.height; y++) {
			const gy = y0 + y;
			if (gy < 0 || gy >= dark.height) continue;
			for (let x = 0; x < window.width; x++) {
				const gx = x0 + x;
				if (gx >= 0 && gx < dark.width && dark.data[gy * dark.width + gx]) agree[y * window.width + x]++;
			}
		}
	}
	return { window, memberCount: entries.length, agree };
}

/** How many of n members must agree (the same rounding the common shell has always used). */
export function shellAgreementCount(memberCount: number, agreementMin = SHELL_AGREEMENT_MIN): number {
	return Math.ceil(memberCount * agreementMin);
}

/**
 * The shape the members share: px dark in at least the agreement count, and of those the smallest 8-connected
 * component enclosing the body (the same smallest-enclosing rule as one member's shell, applied to their overlap).
 * Its bbox gives the margins; its frame px are every agreeing px inside them. Null when nothing encloses the body.
 */
export function shellShapeOf(
	overlap: ShellOverlap,
	bodyWidth: number,
	bodyHeight: number,
	agreementMin = SHELL_AGREEMENT_MIN
): ShellShapeGeometry | null {
	const { window, agree, memberCount } = overlap;
	if (!memberCount) return null;
	const need = shellAgreementCount(memberCount, agreementMin);
	const data = new Uint8Array(agree.length);
	for (let i = 0; i < agree.length; i++) data[i] = agree[i] >= need ? 1 : 0;
	const { components } = extractComponents({ width: window.width, height: window.height, data });
	const shell = components
		.filter(
			(c) =>
				c.bboxX <= window.bodyX &&
				c.bboxY <= window.bodyY &&
				c.bboxX + c.bboxW >= window.bodyX + bodyWidth &&
				c.bboxY + c.bboxH >= window.bodyY + bodyHeight
		)
		.sort((a, b) => a.bboxW * a.bboxH - b.bboxW * b.bboxH || b.area - a.area || a.label - b.label)[0];
	if (!shell) return null;
	const margins: BasketShellMargins = [
		window.bodyX - shell.bboxX,
		window.bodyY - shell.bboxY,
		shell.bboxX + shell.bboxW - (window.bodyX + bodyWidth),
		shell.bboxY + shell.bboxH - (window.bodyY + bodyHeight)
	];
	const offsets: number[] = [];
	for (let y = 0; y < shell.bboxH; y++)
		for (let x = 0; x < shell.bboxW; x++)
			if (data[(shell.bboxY + y) * window.width + shell.bboxX + x]) offsets.push(y * shell.bboxW + x);
	return { margins, offsets: Uint32Array.from(offsets), areaPx: shell.area };
}

const carriedShape: ShellShapeGeometry & { readonly members: number } = (() => {
	const offsets: number[] = [];
	shellPrior.rows.forEach((row, y) => [...row].forEach((v, x) => v === '1' && offsets.push(y * shellPrior.width + x)));
	const [left, top, right, bottom] = shellPrior.margins;
	return {
		margins: [left, top, right, bottom],
		offsets: Uint32Array.from(offsets),
		areaPx: offsets.length,
		members: shellPrior.provenance.members
	};
})();

/** Learned vs carried, in window coordinates (their margins may differ). */
function compareShapes(
	learned: ShellShapeGeometry,
	carried: ShellShapeGeometry,
	window: ShellWindow,
	bodyWidth: number
): ShellShapeComparison {
	const inWindow = ({ margins: [left, top, right], offsets }: ShellShapeGeometry): Set<number> => {
		const width = bodyWidth + left + right;
		return new Set(
			Array.from(offsets, (o) => {
				const x = o % width;
				return (window.bodyY - top + (o - x) / width) * window.width + window.bodyX - left + x;
			})
		);
	};
	const a = inWindow(learned);
	const b = inWindow(carried);
	let shared = 0;
	for (const p of a) if (b.has(p)) shared++;
	return {
		marginsAgree: learned.margins.every((v, i) => v === carried.margins[i]),
		learnedPx: a.size,
		carriedPx: b.size,
		sharedPx: shared,
		iou: shared / Math.max(1, a.size + b.size - shared)
	};
}

const learnShellShapeCalculation = ({ family, fields }: LearnShellShapeArgs): BasketShellShape => {
	const [bodyWidth, bodyHeight] = family.templateSize;
	const window = shellWindow(bodyWidth, bodyHeight);
	const overlap = overlapShellFrames(
		family.members.map(({ body }) => ({ body, dark: fields.dark.mask })),
		window
	);
	const learned = shellShapeOf(overlap, bodyWidth, bodyHeight);
	const source = !family.members.length ? 'none' : learned ? 'learned' : 'carried';
	const chosen = source === 'learned' ? learned : source === 'carried' ? carriedShape : null;
	return {
		schema: 'chainspot-basket-shell-shape@1',
		source,
		agreementMin: SHELL_AGREEMENT_MIN,
		agreementCount: shellAgreementCount(family.members.length),
		overlap,
		learned,
		learnedCondition: !family.members.length
			? 'no basket family members'
			: learned
				? null
				: 'no agreeing dark component encloses the body: the carried prior is used',
		carried: carriedShape,
		comparison: learned ? compareShapes(learned, carriedShape, window, bodyWidth) : null,
		margins: chosen ? chosen.margins : null,
		shellOffsets: chosen ? chosen.offsets : new Uint32Array()
	};
};

const findShellFamilyCalculation = ({ shape, family, fields }: FindShellFamilyArgs): BasketShellFamily => {
	const { margins, shellOffsets } = shape;
	if (!margins) {
		return { margins: null, shellOffsets: new Uint32Array(), members: [] };
	}
	const [left, top, right] = margins;
	const shellWidth = family.templateSize[0] + left + right;
	const shellHeight = family.templateSize[1] + top + margins[3];
	return {
		margins,
		shellOffsets,
		members: family.members.map((candidate) => {
			const x0 = candidate.body.bboxX - left;
			const y0 = candidate.body.bboxY - top;
			// the member's shell is the shape, read on the member's own dark px; dark px off the shape (canopy contact) are not its
			const blackPx = Uint32Array.from(
				Array.from(shellOffsets).flatMap((offset) => {
					const x = offset % shellWidth;
					const y = (offset - x) / shellWidth;
					const pixel = (y0 + y) * fields.dark.mask.width + x0 + x;
					return fields.dark.mask.data[pixel] ? [pixel] : [];
				})
			);
			return {
				candidate,
				bbox: [x0, y0, shellWidth, shellHeight] as const,
				blackPx,
				shellCoverage: blackPx.length / Math.max(1, shellOffsets.length)
			};
		})
	};
};

const findPxCalculation = ({ member, raster }: FindPxArgs): FoundBasketPx => {
	const body = componentRef('bright', member.candidate.body);
	const white = materializeRasterComponentPixels(body, raster);
	const px = Uint32Array.from([...white, ...member.blackPx].sort((a, b) => a - b));
	return {
		parts: [body],
		px,
		whitePx: white.length,
		blackPx: member.blackPx.length
	};
};

export function registerBasket(pxc: PxC): void {
	pxc.register(BasketFn.detectFamily, detectFamilyCalculation);
	pxc.register(BasketFn.learnShellShape, learnShellShapeCalculation);
	pxc.register(BasketFn.findShellFamily, findShellFamilyCalculation);
	pxc.register(BasketFn.findPx, findPxCalculation);
}

export interface BasketHas {
	readonly detectFamily: {
		readonly fn: typeof BasketFn.detectFamily.address;
		readonly body: RasterComponentRef;
	};
	readonly findShellFamily: {
		readonly fn: typeof BasketFn.findShellFamily.address;
		readonly margins: BasketShellMargins;
		readonly blackPx: Uint32Array;
	};
	readonly findPx: {
		readonly fn: typeof BasketFn.findPx.address;
		readonly body: RasterComponentRef;
	};
}

export class Basket {
	readonly bbox: readonly [number, number, number, number];
	readonly has: BasketHas;
	readonly px: Uint32Array;
	readonly whitePx: number;
	readonly blackPx: number;

	private constructor(
		member: BasketShellMember,
		found: FoundBasketPx,
		margins: BasketShellMargins
	) {
		const body = found.parts[0];
		if (!body) throw new Error('Basket requires a bright body.');
		this.bbox = member.bbox;
		this.px = found.px;
		this.whitePx = found.whitePx;
		this.blackPx = found.blackPx;
		this.has = {
			detectFamily: {
				fn: BasketFn.detectFamily.address,
				body: componentRef('bright', member.candidate.body)
			},
			findShellFamily: { fn: BasketFn.findShellFamily.address, margins, blackPx: member.blackPx },
			findPx: { fn: BasketFn.findPx.address, body }
		};
	}

	static detectFamily(pxc: PxC): BasketFamily {
		return pxc.call(BasketFn.detectFamily, { fields: pxc.get(ComponentPxC.fields) });
	}

	static learnShellShape(pxc: PxC): BasketShellShape {
		return pxc.call(BasketFn.learnShellShape, {
			family: pxc.get(BasketPxC.family),
			fields: pxc.get(ComponentPxC.fields)
		});
	}

	static findShellFamily(pxc: PxC): BasketShellFamily {
		return pxc.call(BasketFn.findShellFamily, {
			shape: pxc.get(BasketPxC.shellShape),
			family: pxc.get(BasketPxC.family),
			fields: pxc.get(ComponentPxC.fields)
		});
	}

	static findPx(pxc: PxC): readonly Basket[] {
		const shellFamily = pxc.get(BasketPxC.shellFamily);
		// read before the early exit: the tick declares px.components and its access is exact, so an image with no shell
		// family records zero baskets (a data condition) instead of failing the run's access check (BeaverRanch-full, 2026-10-21)
		const fields = pxc.get(ComponentPxC.fields);
		if (!shellFamily.margins) return [];
		const raster: ComponentRasterEvidence = {
			width: fields.bright.mask.width,
			height: fields.bright.mask.height,
			topPx: 0,
			brightLabels: fields.bright.labels,
			darkLabels: fields.dark.labels
		};
		return shellFamily.members.map((member) => {
			const found = pxc.call(BasketFn.findPx, { member, raster });
			return new Basket(member, found, shellFamily.margins!);
		});
	}
}
