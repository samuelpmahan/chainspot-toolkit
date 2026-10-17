/**
 * GeometricIdentity: joining competing branches by geometry, not by keys
 * (toolkit fg layer, browser-safe: no node:* import).
 *
 * Sam: "hashes are dumb; geometry is not hashable but just as
 * identifiable". Two implementations of one Calculation slot that admit
 * "the same tee" rarely produce the same object: one may carry a ring key,
 * the other a re-measured frame, a sub-pixel different center, or an
 * angle that differs by pi. What makes them the same thing is that their
 * POSES agree within a stated tolerance. So the join between fork-join
 * branches is an equality Contract over poses, never a hash or a key:
 *
 *   defineContract({ id, version, subject, tolerances, compare, describe? })
 *     id:         dotted name, e.g. 'tee.pose'
 *     version:    positive integer; the address is '<id>@<version>' (e.g.
 *                 'contracts/tee.pose@1'), so a changed tolerance is a new
 *                 Contract, never a silent edit to an old one
 *     subject:    what the Contract compares ('Tee pose: ring center, frame
 *                 angle')
 *     tolerances: the named numbers (plain JSON; recorded with every join)
 *     compare(a, b, tolerances) -> { ok, score, ...detail }
 *                 ok: equal under the Contract; score: a non-negative
 *                 closeness used only to rank competing matches (smaller is
 *                 closer); detail: the measured differences, recorded
 *
 *   geometricJoin({ sets: { [branch]: [member] }, contract })
 *     One-to-one identity classes across N branches. Branches are taken in
 *     name order; each branch's members are assigned to the existing
 *     classes they are Contract-equal to (complete linkage: equal to EVERY
 *     member already in the class), best score first, ties broken by member
 *     index then class index, so the result is deterministic and
 *     independent of the order members happened to be listed in within a
 *     score tie. A member that matches no free class opens a new class.
 *     Returns
 *       { contract: { address, subject, tolerances },
 *         branches: [names],
 *         identities: [{ id, members: { [branch]: index|null }, pairs: [...] }],
 *         matched:  [identity ids present in every branch],
 *         only:     { [branch]: [identity ids present in that branch alone] },
 *         partial:  [identity ids present in more than one but not all],
 *         ambiguous:[{ branch, index, candidates: [{ branch, index }] }]
 *                   (a member Contract-equal to more than one member of
 *                   another branch: the Contract is too loose for this pair),
 *         collisions:[{ branch, a, b }] (two members of ONE branch that are
 *                   Contract-equal to each other: the branch admitted one
 *                   thing twice) }
 *     identities are numbered in the order they were opened, which is
 *     branch name order then member order: stable for a fixed input.
 */
import { plain } from './canon.mjs';

const CONTRACT = Symbol.for('chainspot.fg.contract');
const ID = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/;

export function defineContract({ id, version, subject, tolerances, compare, describe = null }) {
  if (typeof id !== 'string' || !ID.test(id)) throw new Error(`defineContract: id ${JSON.stringify(id)} is not a dotted contract name`);
  if (!Number.isInteger(version) || version < 1) throw new Error(`defineContract ${id}: version must be a positive integer`);
  if (typeof subject !== 'string' || !subject) throw new Error(`defineContract ${id}: subject is required`);
  if (!tolerances || typeof tolerances !== 'object') throw new Error(`defineContract ${id}: tolerances must be an object of named numbers`);
  for (const [name, value] of Object.entries(tolerances))
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`defineContract ${id}: tolerance ${name} must be a finite non-negative number`);
  if (typeof compare !== 'function') throw new Error(`defineContract ${id}: compare(a, b, tolerances) is required`);
  const frozen = Object.freeze({ ...tolerances });
  const address = `contracts/${id}@${version}`;
  return Object.freeze({
    [CONTRACT]: true, id, version, address, subject, tolerances: frozen, describe,
    equal(a, b) {
      const out = compare(a, b, frozen);
      if (!out || typeof out.ok !== 'boolean' || typeof out.score !== 'number' || !(out.score >= 0))
        throw new Error(`${address}: compare must return { ok: boolean, score: number >= 0, ...detail }`);
      return out;
    },
    toJSON: () => ({ address, id, version, subject, tolerances: { ...frozen }, describe })
  });
}

export const isContract = (value) => Boolean(value && value[CONTRACT]);

export function geometricJoin({ sets, contract }) {
  if (!isContract(contract)) throw new Error('geometricJoin: contract must be a defineContract() value');
  if (!sets || typeof sets !== 'object') throw new Error('geometricJoin: sets must be { branch: [member] }');
  const names = Object.keys(sets).sort();
  for (const n of names) if (!Array.isArray(sets[n])) throw new Error(`geometricJoin: branch ${n} members must be a list`);

  const identities = [];
  const ambiguous = [];
  const collisions = [];
  for (const name of names) {
    const members = sets[name];
    // collisions inside one branch
    for (let a = 0; a < members.length; a++)
      for (let b = a + 1; b < members.length; b++)
        if (contract.equal(members[a], members[b]).ok) collisions.push({ branch: name, a, b });
    // ambiguity against every earlier branch
    for (const other of names.slice(0, names.indexOf(name))) {
      for (let i = 0; i < members.length; i++) {
        const candidates = sets[other].map((m, j) => (contract.equal(members[i], m).ok ? { branch: other, index: j } : null)).filter(Boolean);
        if (candidates.length > 1) ambiguous.push({ branch: name, index: i, candidates });
      }
      for (let j = 0; j < sets[other].length; j++) {
        const candidates = members.map((m, i) => (contract.equal(sets[other][j], m).ok ? { branch: name, index: i } : null)).filter(Boolean);
        if (candidates.length > 1) ambiguous.push({ branch: other, index: j, candidates });
      }
    }
    // candidate (member, class) pairs under complete linkage
    const options = [];
    for (let i = 0; i < members.length; i++) {
      identities.forEach((identity, c) => {
        if (identity.members[name] !== null) return;
        let worst = 0;
        const pairs = [];
        for (const [b, j] of Object.entries(identity.members)) {
          if (j === null) continue;
          const result = contract.equal(members[i], sets[b][j]);
          if (!result.ok) return;
          worst = Math.max(worst, result.score);
          const { ok, score, ...detail } = result;
          pairs.push({ a: { branch: b, index: j }, b: { branch: name, index: i }, score, detail });
        }
        options.push({ i, c, score: worst, pairs });
      });
    }
    options.sort((x, y) => (x.score - y.score) || (x.i - y.i) || (x.c - y.c));
    const takenMember = new Set();
    const takenClass = new Set();
    for (const option of options) {
      if (takenMember.has(option.i) || takenClass.has(option.c)) continue;
      takenMember.add(option.i); takenClass.add(option.c);
      identities[option.c].members[name] = option.i;
      identities[option.c].pairs.push(...option.pairs);
    }
    for (let i = 0; i < members.length; i++) {
      if (takenMember.has(i)) continue;
      identities.push({ id: identities.length, members: Object.fromEntries(names.map((n) => [n, n === name ? i : null])), pairs: [] });
    }
  }
  const present = (identity) => names.filter((n) => identity.members[n] !== null);
  return plain({
    contract: { address: contract.address, subject: contract.subject, tolerances: contract.tolerances },
    branches: names,
    identities,
    matched: identities.filter((x) => present(x).length === names.length).map((x) => x.id),
    only: Object.fromEntries(names.map((n) => [n, identities.filter((x) => present(x).length === 1 && x.members[n] !== null).map((x) => x.id)])),
    partial: identities.filter((x) => present(x).length > 1 && present(x).length < names.length).map((x) => x.id),
    ambiguous,
    collisions
  });
}
