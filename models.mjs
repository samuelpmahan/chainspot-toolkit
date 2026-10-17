const UNKNOWN = 'UNKNOWN';
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` :
  value && typeof value === 'object' ? `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}` : JSON.stringify(value ?? null);
const same = (a, b) => canonical(a) === canonical(b);
const grouped = (rows, key) => {
  const map = new Map();
  for (const row of rows ?? []) map.set(row[key], [...(map.get(row[key]) ?? []), row]);
  return map;
};
const byPath = (facts) => new Map((facts.checkpoint?.files ?? []).map((file) => [file.path, file]));

function compareHash(expected, current, absentReason = 'path is absent from current facts') {
  if (!expected?.sha256 || !current?.sha256) return { state: UNKNOWN, reason: absentReason };
  const match = expected.sha256 === current.sha256;
  return { state: match ? 'CURRENT' : 'STALE', reason: match ? 'content hash matches' : 'content hash differs' };
}

export function projectInventory(facts) {
  const current = grouped(facts.checkpoint?.files, 'path');
  const declarations = grouped(facts.declarations, 'path');
  const paths = [...new Set([...current.keys(), ...declarations.keys()])].sort();
  const files = paths.map((path) => {
    const checkpointFiles = current.get(path) ?? [];
    const declared = declarations.get(path) ?? [];
    const duplicate = checkpointFiles.length > 1 || declared.length > 1;
    const state = duplicate ? UNKNOWN : declared.length && checkpointFiles.length ? compareHash(declared[0], checkpointFiles[0]).state :
      declared.length ? 'DECLARED_BUT_ABSENT' : 'UNDECLARED';
    return { path, checkpoint: checkpointFiles.length === 1 ? checkpointFiles[0] : checkpointFiles.length ? checkpointFiles : null, declaration: declared.length === 1 ? declared[0] : declared.length ? declared : null, duplicate, freshness: state };
  });
  return { checkpointId: facts.checkpoint?.id ?? UNKNOWN, base: facts.checkpoint?.base ?? UNKNOWN, files,
    changes: facts.checkpoint?.changes ?? UNKNOWN,
    changedPaths: facts.checkpoint?.changes?.map?.((change) => change.path) ?? UNKNOWN };
}

export function projectGraph(facts) {
  const declarations = grouped(facts.declarations, 'path');
  const current = byPath(facts);
  const knownFileOrDirectory = (path) => current.has(path) || [...current.keys()].some((filePath) => filePath.startsWith(`${path}/`));
  const nodes = (facts.declarations ?? []).map((d) => {
    const duplicates = declarations.get(d.path).length > 1;
    const state = duplicates ? { state: UNKNOWN, reason: 'duplicate declaration path' } : compareHash(d, current.get(d.path));
    return { path: d.path, kind: d.kind, target: d.target ?? d.name ?? UNKNOWN, ticks: d.ticks ?? UNKNOWN,
      freshness: state.state, freshnessReason: state.reason, duplicate: duplicates,
      dependencies: [...new Set(d.dependencies ?? [])].sort() };
  }).sort((a, b) => a.path.localeCompare(b.path));
  const edges = [];
  for (const node of nodes) for (const path of node.dependencies) edges.push({ from: node.path, to: path,
    known: (declarations.has(path) && declarations.get(path).length === 1) || (!declarations.has(path) && knownFileOrDirectory(path)) });
  const closure = (path) => {
    const seen = new Set(); const unknown = new Set(); const stack = [path];
    while (stack.length) { const p = stack.pop(); if (seen.has(p)) continue; seen.add(p);
      const ds = declarations.get(p) ?? [];
      if (ds.length === 0 && knownFileOrDirectory(p)) continue;
      if (ds.length !== 1) { unknown.add(p); continue; }
      for (const dep of ds[0].dependencies ?? []) stack.push(dep);
    }
    return { paths: [...seen].filter((p) => (declarations.has(p) && declarations.get(p).length === 1) || (!declarations.has(p) && knownFileOrDirectory(p))).sort(), unknownPaths: [...unknown].sort() };
  };
  return { checkpointId: facts.checkpoint?.id ?? UNKNOWN, nodes, edges, closure };
}

function requestForQuery(facts, query) {
  const matches = (facts.requests ?? []).filter((r) => r.target === query.target && same(r.args, query.args) &&
    (query.selectedTicks === undefined || same(r.selectedTicks, query.selectedTicks)) &&
    (query.fingerprint === undefined || r.fingerprint === query.fingerprint));
  return matches.length === 1 ? matches[0] : null;
}

function requestsForSignature(facts, query) {
  return (facts.requests ?? []).filter((r) => r.target === query.target && same(r.args, query.args) &&
    (query.selectedTicks === undefined || same(r.selectedTicks, query.selectedTicks)));
}

function consensus(values) {
  const known = [...new Set(values.filter((x) => x !== UNKNOWN))];
  return known.length > 1 ? 'AMBIGUOUS' : known[0] ?? UNKNOWN;
}

export function projectLineage(facts) {
  const evidenceCurrent = new Map((facts.evidenceFiles ?? []).map((file) => [file.path, file]));
  const requests = new Map((facts.requests ?? []).map((r) => [r.id, r]));
  const attempts = (facts.attempts ?? []).map((a) => {
    const request = requests.get(a.requestId) ?? null;
    const evidence = (a.evidence ?? []).map((ev) => ({ path: ev.path, ...compareHash(ev, evidenceCurrent.get(ev.path), 'evidence path/hash unavailable in current evidence facts') }));
    const fingerprint = a.fingerprint && request?.fingerprint ? (a.fingerprint === request.fingerprint ? 'CURRENT' : 'STALE') : UNKNOWN;
    const freshness = evidence.length === 0 ? UNKNOWN : evidence.some((e) => e.state === 'STALE') ? 'STALE_EVIDENCE' :
      evidence.some((e) => e.state === UNKNOWN) ? UNKNOWN : fingerprint === 'STALE' ? 'STALE_TARGET' : fingerprint === 'CURRENT' ? 'CURRENT' : UNKNOWN;
    return { id: a.id, requestId: a.requestId, checkpointId: a.checkpointId ?? UNKNOWN, request,
      status: a.status ?? UNKNOWN, execution: a.status === 'SUCCESS' || a.status === 'completed' ? 'SUCCEEDED' : a.status === 'FAILED' || a.status === 'failed' ? 'FAILED' : UNKNOWN,
      nativeObservation: a.nativeObservation ?? UNKNOWN, acceptance: a.acceptance ?? UNKNOWN, fingerprint: a.fingerprint ?? UNKNOWN, evidence, freshness };
  });
  const acceptance = (requestId) => {
    const request = requests.get(requestId);
    const scoped = attempts.filter((a) => a.requestId === requestId && (!request?.fingerprint || a.fingerprint === request.fingerprint));
    return consensus(scoped.map((a) => a.acceptance));
  };
  return { checkpointId: facts.checkpoint?.id ?? UNKNOWN, attempts, acceptance,
    forRequest(requestId) { return attempts.filter((a) => a.requestId === requestId); } };
}

/** Return each projection's native answer and explicit joins for each shared query. */
export function compareModels(facts, queries) {
  const inventory = projectInventory(facts), graph = projectGraph(facts), lineage = projectLineage(facts);
  const results = (queries ?? []).map((query, index) => {
    const request = requestForQuery(facts, query);
    const signatureRequests = requestsForSignature(facts, query);
    const attempts = signatureRequests.flatMap((r) => lineage.forRequest(r.id));
    const fingerprint = query.fingerprint ?? request?.fingerprint;
    const requestAttempts = request ? lineage.forRequest(request.id) : [];
    const currentAttempts = fingerprint ? requestAttempts.filter((a) => a.fingerprint === fingerprint) : requestAttempts;
    const priorAttempts = attempts.map((a) => ({ ...a, freshness: fingerprint && a.fingerprint !== fingerprint ? 'STALE_TARGET' : a.freshness }));
    const invPaths = query.path ? inventory.files.filter((f) => f.path === query.path) : [];
    const graphAnswer = query.path ? { closure: graph.closure(query.path), freshness: graph.nodes.find((n) => n.path === query.path)?.freshness ?? UNKNOWN } : UNKNOWN;
    const invAnswer = query.path ? invPaths.length === 1 ? { freshness: invPaths[0].freshness, changed: inventory.changes === UNKNOWN ? UNKNOWN : inventory.changedPaths.includes(query.path) } : UNKNOWN : UNKNOWN;
    const lineageAnswer = priorAttempts.length ? priorAttempts.map((a) => ({ attemptId: a.id, execution: a.execution,
      nativeObservation: a.nativeObservation, freshness: a.freshness, evidence: a.evidence })) : UNKNOWN;
    const acceptance = request ? fingerprint ? consensus(currentAttempts.map((a) => a.acceptance)) : UNKNOWN : UNKNOWN;
    return { index, query, answers: { inventory: invAnswer, graph: graphAnswer,
      lineage: { priorAttempts: lineageAnswer, execution: currentAttempts.length ? consensus(currentAttempts.map((a) => a.execution)) : UNKNOWN },
      humanAcceptance: acceptance },
      joins: { uniqueRequest: request ? request.id : UNKNOWN, requiredDeclarationPath: query.path ?? UNKNOWN,
        targetFingerprint: fingerprint ?? UNKNOWN, attemptIds: priorAttempts.map((a) => a.id), checkpointId: facts.checkpoint?.id ?? UNKNOWN } };
  });
  return { results };
}
