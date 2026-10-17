import type { InputAsset } from '../g0/inputAsset';
/** Decode a browser File to an InputAsset (RGBA pixels + content-addressed imageId). */
export declare function decodeBrowserFile(file: File): Promise<InputAsset>;
