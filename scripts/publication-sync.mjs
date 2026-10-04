/** Append-only, reviewed external publication evidence. No Git, network or history writes. */
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {FREEZE_AT} from '../src/domain.js';
const hash = raw => createHash('sha256').update(raw).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
// Adding another publication requires independently verified external evidence and
// a reviewed pin. Caller-supplied booleans, Maps, timestamps or checksums are not proof.
export const PUBLICATION_SYNCHRONIZATIONS = Object.freeze([
  Object.freeze({path:'docs/publications/cumulative-006-008.json', sha256:'50f08325d272954d9cb9d8f25c945ec71a2032f6a70f0869bba3e9a402c3aae0'})
]);
function trusted(record) {
  return record && PUBLICATION_SYNCHRONIZATIONS.some(pin => hash(json(record)) === pin.sha256);
}
/** Original history remains authoritative. Only a separate post-verification event
 * is added to cumulative ordering; old ledgers/counters are never synthesized. */
export function validatePublicationSynchronizations(synchronizations = [], {ledgers = [], banks = new Map(), ledgerSources = new Map(), now = null, publicationState = null, activeBankVersion = null} = {}) {
  const errors = [], history = [], seen = new Set();
  if (!Array.isArray(synchronizations)) return {ok:false, errors:['publication synchronizations must be an array of pinned evidence'], history};
  for (const record of synchronizations) {
    if (!trusted(record)) { errors.push('publication synchronization proof is absent, unreviewed or tampered'); continue; }
    if (seen.has(record.syncId)) { errors.push('duplicate publication synchronization'); continue; }
    seen.add(record.syncId);
    const at = Date.parse(record.verifiedAt);
    if (!Number.isFinite(at) || at >= FREEZE_AT || publicationState?.finalizedAt && at > Date.parse(publicationState.finalizedAt)) { errors.push('publication synchronization violates final cutoff or persistent freeze'); continue; }
    // Reproducible audits at an earlier instant cannot consume later proof.
    if (now !== null && at > now) continue;
    const relevant = activeBankVersion !== null || record.rounds.every(s => ledgers.some(r => r.roundId === s.roundId)) || ledgers.some(r => Date.parse(r.startedAt) >= at);
    if (!relevant) continue; // unrelated earlier subset audit
    const before = errors.length;
    for (const source of record.rounds) {
      const matches = ledgers.filter(r => r.roundId === source.roundId);
      const raw = ledgerSources instanceof Map ? ledgerSources.get(source.roundId) : null;
      const bankRaw = (banks instanceof Map ? banks.get(source.bankVersion) : banks?.[source.bankVersion])?.raw;
      if (!raw || hash(raw) !== source.originalLedgerSha256 || matches.length !== 1 || !equal(JSON.parse(raw.toString()), matches[0])) errors.push(`${source.roundId}: synchronization requires exact original closed ledger and unchanged review history`);
      if (!bankRaw || hash(bankRaw) !== source.bankSha256) errors.push(`${source.roundId}: synchronization requires exact immutable bank bytes`);
      if (Date.parse(source.deliveredAt) > at || matches[0] && Date.parse(matches[0].closedAt) > at) errors.push(`${source.roundId}: synchronization must follow delivery and decision closure`);
    }
    if (errors.length !== before) continue;
    history.push({syncId:record.syncId, synchronizedRoundIds:record.rounds.map(s => s.roundId), publication:{status:'verified', verifiedAt:record.verifiedAt, bankVersion:record.manifest.bankVersion, bankSha256:record.manifest.sha256, commit:record.commit, url:record.siteUrl}, evidence:record});
  }
  return {ok:errors.length === 0, errors, history};
}
/** Resolve only exact original delivery artifacts covered by a checked publication.
 * This describes current content publication, never the outcome of an old Git call.
 * Pass the full campaign context; do not pass a fabricated resolvedArtifacts Set. */
export function resolveSynchronizedArtifacts(receipts, {synchronizations = [], ...context} = {}) {
  const result = validatePublicationSynchronizations(synchronizations, context);
  const resolvedArtifacts = new Set(), errors = [...result.errors];
  if (!Array.isArray(receipts)) return {ok:false, errors:['receipt array required'], resolvedArtifacts};
  for (const receipt of receipts) {
    const proof = result.history.flatMap(h => h.evidence.rounds).find(s => s.artifactSha256 === receipt?.artifactSha256);
    if (!proof) continue;
    if (hash(json(receipt)) !== proof.receiptSha256 || receipt.manifestSha256 !== proof.manifestSha256) errors.push('synchronized artifact receipt is not the exact original delivered evidence');
    else resolvedArtifacts.add(proof.artifactSha256);
  }
  if (errors.length) resolvedArtifacts.clear();
  return {ok:errors.length === 0, errors, resolvedArtifacts};
}
