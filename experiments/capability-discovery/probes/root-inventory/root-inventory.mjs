import { digest } from './source/fg/canon.mjs';

export const bindingHash = value => digest(value);
export const artifactHash = value => digest(value);
const HEX = /^[a-f0-9]{64}$/;
const hex = value => typeof value === 'string' && HEX.test(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const plain = value => value !== null && typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const requiredBinding = ['sourceSha256', 'canonicalSha256', 'codeClosureSha256', 'requestSha256', 'storeSourceSha256'];
const result = (status, reason, details = {}) => ({ schema: 'root-inventory-guard@2', status, reason,
  cacheReuseAuthorized: status === 'pass', scientificAcceptance: false, ...details });

function rowsOf(rows) {
  if (!Array.isArray(rows)) throw Error('root rows must be an array');
  const seen = new Set();
  return rows.map(row => {
    if (!plain(row) || !text(row.address) || !hex(row.key) || seen.has(row.address))
      throw Error('root address/key invalid or duplicate');
    seen.add(row.address);
    return [row.address, row.key];
  }).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
}
function validInputs(inputs) {
  if (!Array.isArray(inputs)) return false;
  const seen = new Set();
  return Array.from(inputs).every(row => Array.isArray(row) && row.length === 2 && text(row[0]) && hex(row[1]) &&
    !seen.has(row[0]) && Boolean(seen.add(row[0])));
}
function jsonValue(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if ((!Array.isArray(value) && !plain(value)) || seen.has(value)) return false;
  seen.add(value);
  const valid = (Array.isArray(value) ? Array.from(value) : Object.values(value)).every(v => jsonValue(v, seen));
  seen.delete(value);
  return valid;
}

/**
 * Consistency against an independently pinned owner inventory, never scientific acceptance.
 * Root owns trusted anchor ingestion; observed reads cannot establish full query-readable closure.
 * All potentially malformed input inspection stays within this classified-result boundary.
 */
export function assessRootInventory(input, trustAnchor) {
  try {
    if (!plain(input)) return result('fail', 'invalid-wrapper');
    const { binding, authoritativeManifest, producerReceipt } = input;
    if (producerReceipt == null) return result('unsupported', 'legacy-or-missing-root-key-material');
    if (!plain(producerReceipt)) return result('fail', 'invalid-producer-receipt');
    if (producerReceipt.keyMaterial == null) return result('unsupported', 'legacy-or-missing-root-key-material');
    const material = producerReceipt.keyMaterial;
    if (!plain(material)) return result('fail', 'invalid-root-key-material-shape');
    if (!Object.hasOwn(material, 'roots')) return result('unsupported', 'legacy-or-missing-root-key-material');
    if (authoritativeManifest != null && !plain(authoritativeManifest) || trustAnchor != null && !plain(trustAnchor))
      return result('fail', 'invalid-authority-shape');
    if (!authoritativeManifest || !trustAnchor ||
        ['manifestSha256','producerReceiptSha256','bindingSha256','issuer','scope','authorityPolicyId'].some(k => !Object.hasOwn(trustAnchor,k)))
      return result('unknown', 'no-independently-pinned-authoritative-inventory');
    if (!plain(binding) || requiredBinding.some(k => !Object.hasOwn(binding,k) || !hex(binding[k])))
      return result('fail', 'invalid-source-binding');
    if (!['manifestSha256','producerReceiptSha256','bindingSha256'].every(k => hex(trustAnchor[k])) ||
        !hex(authoritativeManifest.bindingSha256) || !hex(producerReceipt.bindingSha256) ||
        !['issuer','scope','authorityPolicyId'].every(k => text(trustAnchor[k]) && text(authoritativeManifest[k])))
      return result('fail', 'invalid-authority-or-binding-schema');
    if (authoritativeManifest.schema !== 'authoritative-readable-roots@1' ||
        producerReceipt.schema !== 'producer-root-key-witness@1' ||
        ['issuer','scope','authorityPolicyId'].some(k => authoritativeManifest[k] !== trustAnchor[k]))
      return result('fail', 'authority-or-schema-mismatch');
    if (!text(material.fn) || !hex(material.code) || !hex(material.roots) || !hex(producerReceipt.cacheKey) ||
        !validInputs(material.inputs) || !Object.hasOwn(material, 'args') || !jsonValue(material.args))
      return result('fail', 'invalid-root-key-material-schema');
    const authoritative = rowsOf(authoritativeManifest.rows), produced = rowsOf(producerReceipt.rootRows);
    const bh = bindingHash(binding);
    if (bh !== trustAnchor.bindingSha256 || bh !== authoritativeManifest.bindingSha256 || bh !== producerReceipt.bindingSha256)
      return result('fail', 'source-or-binding-mismatch');
    if (artifactHash(authoritativeManifest) !== trustAnchor.manifestSha256 ||
        artifactHash(producerReceipt) !== trustAnchor.producerReceiptSha256)
      return result('fail', 'artifact-hash-mismatch');
    const expected = new Map(authoritative), actual = new Map(produced);
    const missing = authoritative.filter(([a]) => !actual.has(a)).map(([a]) => a);
    const extra = produced.filter(([a]) => !expected.has(a)).map(([a]) => a);
    const changed = authoritative.filter(([a, k]) => actual.has(a) && actual.get(a) !== k).map(([a]) => a);
    if (missing.length || extra.length || changed.length)
      return result('fail', 'root-inventory-coverage-or-key-mismatch', { missing, extra, changed });
    const roots = digest(produced);
    if (material.roots !== roots) return result('fail', 'root-key-material-mismatch');
    if (producerReceipt.cacheKey !== digest(material)) return result('fail', 'producer-cache-key-mismatch');
    return result('pass', 'covers-independently-pinned-manifest', {
      bindingSha256: bh, rootsSha256: roots, rootsCount: authoritative.length,
      limitation: 'Authority truth/completeness and producer-code execution require external attestation; observed reads alone cannot prove closure.',
    });
  } catch (error) { return result('fail', 'malformed-inventory', { detail: error.message }); }
}
