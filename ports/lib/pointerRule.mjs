// The "pointer rule" of a fork-join run: among the variants that ran, those whose judged result ties the best (lexicographic
// score vector, smaller is better), then the fastest standalone. A course without testimony takes the variant the annotated
// courses accepted (acceptedElsewhere); with none on record there is no pointer, and that is recorded, not thrown.
//
// One copy of what ports/s4recover, s5pair, s6straight and s7trace/run.mjs each carried; they differ only in the three
// things passed here.
//   judgedRule         the sentence stored as `acceptRule` when there is testimony
//   variantsOf(value)  where the per-variant judged numbers live in the comparison value (value.branches / value.variants)
//   score(variant)     the vector to minimise, e.g. (b) => [-(b.right ?? -1), b.wrong ?? Infinity]
//   excludeLaneNotRun  a variant whose lane did not run is not a candidate (s5, s6)
// Returns acceptRule({ acceptedElsewhere, judged }) -> accept(value, { names, branches, timingsMs }) with .rule and .decided.

export function pointerRule({ judgedRule, variantsOf, score, excludeLaneNotRun = false }) {
  return function acceptRule({ acceptedElsewhere = null, judged = true } = {}) {
    const rule = judged
      ? judgedRule
      : `no testimony: the variant the annotated courses accepted${acceptedElsewhere ? ` (${acceptedElsewhere})` : ' (none on record: no pointer)'}`;
    const accept = (value, { names, branches, timingsMs }) => {
      const variants = variantsOf(value);
      const live = names.filter((n) => !branches[n].error && !(excludeLaneNotRun && variants[n]?.laneNotRun));
      if (!judged) { accept.decided = acceptedElsewhere && live.includes(acceptedElsewhere) ? 'annotated courses' : 'nothing'; return accept.decided === 'nothing' ? null : acceptedElsewhere; }
      const vec = (n) => score(variants[n]);
      const cmpScore = (a, b) => { const A = vec(a), B = vec(b); for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return A[i] - B[i]; return 0; };
      const sorted = [...live].sort(cmpScore);
      if (!sorted.length) { accept.decided = 'nothing'; return null; }
      const tied = sorted.filter((n) => cmpScore(n, sorted[0]) === 0);
      accept.decided = tied.length > 1 ? `tie on judged result among ${tied.join(', ')}: fastest standalone` : 'best judged result';
      return tied.sort((a, b) => (timingsMs[a]?.ms ?? Infinity) - (timingsMs[b]?.ms ?? Infinity))[0];
    };
    accept.rule = rule; accept.decided = null;
    return accept;
  };
}
