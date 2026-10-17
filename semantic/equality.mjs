import { createHash } from 'node:crypto';

export const CRISP_IDENTITY = 'crisp-byte-identity@1';
export const PART_EQUALITY = 's5-row-part-equals@1.0.0';
export const GEOMETRY_EQUALITY = 's5-row-geometry-observation-equals@1.0.0';

const rowIdentityKeys = ['teeId', 'badgeId', 'basketId', 's5MeasuredRelationId'];
const geometryKeys = ['sign', 'u', 'teeCenter', 'badgeCenter', 'templateTop', 'topAlongPx', 'topSignedPerpPx', 'topProvenance'];
const expectedStatus = 'TWO_RAY_ZERO_BEND_GEOMETRY_CANDIDATE_UNOWNED';

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function pick(value, keys) {
  return Object.fromEntries(keys.map(key => [key, value[key]]));
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

function requiredObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

export function selectedRowPart(document, selector) {
  requiredObject(document, 'document');
  if (document.schema !== 'chainspot-s6-two-ray@1') throw new Error(`unsupported row schema: ${document.schema}`);
  const rows = document.rows;
  if (!Array.isArray(rows)) throw new TypeError('document.rows must be an array');
  const matches = rows.filter(row => row.teeId === selector.teeId && row.badgeId === selector.badgeId && row.basketId === selector.basketId);
  if (matches.length !== 1) throw new Error(`expected exactly one selected row; found ${matches.length}`);
  return matches[0];
}

function guardedPair(leftDocument, rightDocument, selector) {
  if (leftDocument.schema !== rightDocument.schema || leftDocument.imageId !== rightDocument.imageId ||
      leftDocument.sourceSha256 !== rightDocument.sourceSha256 || leftDocument.paramsHash !== rightDocument.paramsHash) {
    throw new Error('source identity guard failed');
  }
  const left = selectedRowPart(leftDocument, selector);
  const right = selectedRowPart(rightDocument, selector);
  if (left.status !== expectedStatus || right.status !== expectedStatus) throw new Error('selected row status guard failed');
  if (left.teeId !== right.teeId || left.badgeId !== right.badgeId || left.basketId !== right.basketId || left.id !== right.id ||
      left.s5MeasuredRelationId !== right.s5MeasuredRelationId) throw new Error('selected row identity guard failed');
  for (const row of [left, right]) {
    if (!Array.isArray(row.u) || row.u.length !== 2 || !row.u.every(Number.isFinite)) throw new Error('selected row u guard failed');
  }
  return { left, right };
}

/** Java-equals-like structural value equality over the complete parsed selected row Part. */
export function parsedPartEquals(leftDocument, rightDocument, selector, contract = PART_EQUALITY) {
  if (contract !== PART_EQUALITY) throw new Error(`unsupported equality contract: ${contract}`);
  const { left, right } = guardedPair(leftDocument, rightDocument, selector);
  return canonical(left) === canonical(right);
}

/** Equality of the declared geometry observation, subordinate to source/status/identity guards. */
export function geometryObservationEquals(leftDocument, rightDocument, selector, contract = GEOMETRY_EQUALITY) {
  if (contract !== GEOMETRY_EQUALITY) throw new Error(`unsupported equality contract: ${contract}`);
  const { left, right } = guardedPair(leftDocument, rightDocument, selector);
  return canonical(pick(left, geometryKeys)) === canonical(pick(right, geometryKeys));
}

export function compareBytesAndGeometry(leftBytes, rightBytes, selector) {
  const leftDoc = JSON.parse(Buffer.from(leftBytes).toString('utf8'));
  const rightDoc = JSON.parse(Buffer.from(rightBytes).toString('utf8'));
  return {
    contracts: { parsedPart: PART_EQUALITY, geometryObservation: GEOMETRY_EQUALITY },
    leftSha256: sha256(leftBytes),
    rightSha256: sha256(rightBytes),
    crisp: { contract: CRISP_IDENTITY, equal: sha256(leftBytes) === sha256(rightBytes) },
    candidatePartEqual: parsedPartEquals(leftDoc, rightDoc, selector),
    geometryObservationEqual: geometryObservationEquals(leftDoc, rightDoc, selector),
  };
}
