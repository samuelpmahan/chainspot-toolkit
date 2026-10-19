/** Opt-in façade for a trusted, complete, immutable provider board. No Part values are copied. */
export function enumerableBoard(board) {
  if (!board || typeof board.has !== 'function' || typeof board.get !== 'function')
    throw new TypeError('enumerableBoard requires board.has and board.get methods');
  let addresses;
  if ('keys' in board) {
    if (typeof board.keys !== 'function') throw new TypeError('board.keys must be a function');
    const keys = board.keys();
    if (!keys || typeof keys[Symbol.iterator] !== 'function') throw new TypeError('board.keys() must return an iterable');
    addresses = [...keys];
  } else {
    if (!Array.isArray(board.addresses)) throw new TypeError('board.addresses must be a complete address array');
    addresses = [...board.addresses];
  }
  const seen = new Set();
  for (const address of addresses) {
    if (typeof address !== 'string' || address.length === 0) throw new TypeError('board enumeration contains an invalid address');
    if (seen.has(address)) throw new TypeError(`board enumeration contains duplicate address: ${address}`);
    if (!board.has(address)) throw new TypeError(`board enumeration names a missing address: ${address}`);
    seen.add(address);
  }
  Object.freeze(addresses);
  return Object.freeze({
    has(...args) { return board.has(...args); },
    get(...args) { return board.get(...args); },
    addresses,
    keys() { return addresses.values(); }
  });
}
