/** Deterministic JSON: object keys recursively sorted, arrays in order. */
export declare function canonicalJson(value: unknown): string;
export declare function sha256Hex(text: string): Promise<string>;
