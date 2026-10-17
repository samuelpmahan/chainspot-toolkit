/**
 * Synthetic PxC board for the fg tests: a Map-backed { get, has, set }
 * carrying one toy Part, 'px.blobs' = { width, height, blobs: [{ id, px }] }
 * on a 16x8 raster (flat indices, row-major). Four blobs of different
 * sizes and rows, so the two fn.toy.findFamily implementations
 * (impl/fn.toy.findFamily/) disagree on exactly one candidate.
 */
export const WIDTH = 16;
export const HEIGHT = 8;

export function createBoard(entries = []) {
  const map = new Map(entries);
  return {
    get: (address) => map.get(address),
    has: (address) => map.has(address),
    set: (address, value) => { map.set(address, value); },
    keys: () => [...map.keys()]
  };
}

export function rect(x, y, w, h, width = WIDTH) {
  const px = [];
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px.push(j * width + i);
  return px;
}

export function toyBlobs({ extra = [] } = {}) {
  return {
    width: WIDTH, height: HEIGHT,
    blobs: [
      { id: 'a', px: rect(1, 1, 3, 3) },   // 9 px, top half
      { id: 'b', px: rect(6, 1, 2, 2) },   // 4 px, top half
      { id: 'c', px: rect(10, 5, 4, 2) },  // 8 px, bottom half
      { id: 'd', px: rect(2, 5, 1, 2) },   // 2 px, bottom half
      ...extra
    ]
  };
}

export const toyBoard = (options) => createBoard([['px.blobs', toyBlobs(options)]]);
