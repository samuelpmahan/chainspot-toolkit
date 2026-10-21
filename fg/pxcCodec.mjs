/**
 * The toolkit's door to the PxC codec (node-only): node:v8 serialize / deserialize with typed arrays packed on write
 * and unpacked on read (source/provider/scripts/chainspot-lab/sweep/pxcCodec.mjs, which the provider's snapshot
 * capture/restore uses too). Every reader of an s3.pxc.bin, a CAS entry or an rgba artifact view decodes through here,
 * so a backing can change on disk without any Part changing in memory.
 *
 *   readPxC(file)          the snapshot's Parts as a Map (address -> value), old plain-v8 files included
 *   serialize / deserialize    drop-in for node:v8's
 */
import { readFileSync } from 'node:fs';
import { serialize, deserialize } from '../source/provider/scripts/chainspot-lab/sweep/pxcCodec.mjs';

export { serialize, deserialize };

/** An s3.pxc.bin (packed or plain node:v8) as a Map of address -> Part value. */
export const readPxC = (file) => new Map(deserialize(readFileSync(file)));
