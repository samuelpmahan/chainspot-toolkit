import type { InputAsset } from '../g0/inputAsset';
/** Decode a PNG/JPEG file on disk to an InputAsset (RGBA pixels + content-addressed imageId). */
export declare function decodeNodeFile(filePath: string): Promise<InputAsset>;
