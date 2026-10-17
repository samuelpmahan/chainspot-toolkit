import type { RgbaRaster } from '../detect';
import type { CoordinateTransformLedger } from './ledger';
export interface CanonicalFrame extends RgbaRaster {
    readonly ledger: CoordinateTransformLedger;
}
