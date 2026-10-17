import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { digest, sha } from '../facts.mjs';
import { verifiedEvidence } from '../recipes/closure.mjs';

/** Decide whether a target-specific request needs execution; evidence bytes must still exist. */
export async function crisp(root, resolved, previousAttempts = []) {
  const fingerprint = digest(resolved.files, resolved.args, resolved.tickPaths);
  for (const attempt of previousAttempts.slice().reverse()) {
    if (attempt.fingerprint !== fingerprint || attempt.execution !== 'PASS' || !attempt.evidence?.length) continue;
    let valid = true;
    for (const entry of attempt.evidence) {
      const data = await readFile(join(root, entry.path)).catch(() => null);
      if (!data || sha(data) !== entry.sha256) { valid = false; break; }
    }
    if (valid) return {decision:'REUSE',fingerprint,attemptId:attempt.id,reason:'Matching target inputs, Run Args, Tick path and verified evidence bytes'};
  }
  return {decision:'RUN',fingerprint,reason:'No verified successful evidence for this exact target digest'};
}

/** Cache a whole prefix only while all native receipt bytes still verify. */
export async function crispStages(root,resolved,attempts=[]) {
  for(const attempt of attempts.slice().reverse()) {
    if(attempt.schema!=='nctk-stage-attempt@1'||attempt.fingerprint!==resolved.fingerprint||attempt.execution!=='PASS')continue;
    if(await verifiedEvidence(root,attempt.evidence))return {decision:'REUSE',fingerprint:resolved.fingerprint,
      attemptId:attempt.id,reason:'Exact source, prefix, lanes, runtime closure and native evidence hashes match'};
  }
  return {decision:'RUN',fingerprint:resolved.fingerprint,reason:'No verified result for this exact recipe prefix and evidence'};
}
