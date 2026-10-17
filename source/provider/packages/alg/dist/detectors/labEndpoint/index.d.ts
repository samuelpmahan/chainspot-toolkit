import type { Detector } from '../../detect';
export declare const LAB_ENDPOINT_ALGO = "lab-quick-endpoints";
export declare const LAB_ENDPOINT_ALGO_VERSION = "1.0.0";
/**
 * LAB's fast mask/component endpoint pass behind the app's Detector contract.
 * It emits object observations and badge-label readings. Ownership association
 * is intentionally a later Detector pass over these stable detIds.
 */
export declare const labEndpointDetector: Detector;
