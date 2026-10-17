/**
 * Cross-verify loop (fg/attention layer, browser-safe): join a vision
 * agent's answers to the receipt's claims, and SEPARATELY to testimony.
 *
 *   crossVerify(packet, answers) -> { rows, summary }
 *     packet   attention.json (blind or with testimony; region ids are the same)
 *     answers  { answers: [{ id, answer: 'yes' | 'no' | 'unsure', says, why, objects? }] }
 *              `says` is the receipt polarity the question tested:
 *              'is' / 'covers' (the receipt asserts yes) or 'isNot' (asserts no)
 *   row: { id, rank, question, receiptClaim, vision: { answer, why }, agreesWithReceipt,
 *          testimony: [rows] | null, agreesWithTestimony, receiptAgreesWithTestimony }
 *
 * The vision answer never reads testimony; testimony is joined afterwards,
 * by region id, from whichever packet carries it. Acceptance stays Sam's:
 * these are agreements, not verdicts.
 */
const asserts = (says) => (says === 'isNot' ? 'no' : 'yes');

export function crossVerify(packet, answers) {
  const byId = new Map(packet.regions.map((r) => [r.id, r]));
  const rows = (answers.answers ?? []).map((a) => {
    const r = byId.get(a.id);
    if (!r) return { id: a.id, error: 'region not in packet' };
    const receiptSays = asserts(a.says);
    const agreesWithReceipt = a.answer === 'unsure' ? null : a.answer === receiptSays;
    const t = r.testimony?.rows?.length ? r.testimony.rows : null;
    // testimony's own polarity about the same objects: a near point means "is"
    const testimonyIs = t ? t.some((x) => (x.says === 'is') === x.agrees) : null;
    const tApplies = t && a.says !== 'covers';
    return {
      id: a.id, rank: r.rank, step: r.step, question: r.question?.text ?? null,
      receiptClaim: r.claims.slice(0, -1), receiptSays,
      vision: { answer: a.answer, why: a.why },
      agreesWithReceipt,
      testimony: t, uncoveredTestimony: r.testimony?.uncovered ?? [],
      agreesWithTestimony: tApplies && a.answer !== 'unsure' ? (a.answer === 'yes') === testimonyIs : null,
      receiptAgreesWithTestimony: tApplies ? (receiptSays === 'yes') === testimonyIs : null
    };
  });
  const count = (k, v) => rows.filter((x) => x[k] === v).length;
  return {
    rows,
    summary: {
      answered: rows.length,
      visionVsReceipt: { agree: count('agreesWithReceipt', true), disagree: count('agreesWithReceipt', false), unsure: count('agreesWithReceipt', null) },
      visionVsTestimony: { agree: count('agreesWithTestimony', true), disagree: count('agreesWithTestimony', false), notCovered: count('agreesWithTestimony', null) },
      receiptVsTestimony: { agree: count('receiptAgreesWithTestimony', true), disagree: count('receiptAgreesWithTestimony', false), notCovered: count('receiptAgreesWithTestimony', null) },
      disagreements: rows.filter((x) => x.agreesWithReceipt === false).map((x) => x.id)
    }
  };
}
