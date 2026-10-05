import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {FREEZE_AT, validateBank, validateBankForPublication, validateExplanationAuthoring, isPublishedQuestion, presentQuestion} from '../src/domain.js';

import {historicalExplanationBaseline} from './explanation-authoring.mjs';
import {PUBLICATION_SYNCHRONIZATIONS, validatePublicationSynchronizations, resolveSynchronizedArtifacts, validateSynchronizationDeliveryProof} from './publication-sync.mjs';
import {validateEditorialHistory, validateEditorialTransition, validateCampaignBaselines} from './editorial-ledger.mjs';
export {editorialHash, editorialContent, editorialContentHash, editorialBlindPackage, editorialChangedPaths, editorialComponentStates} from './editorial-ledger.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
export const FINAL_DECISION_AT = Date.parse('2026-10-16T23:00:00+09:00');
const DEFAULT_SCHEMA = JSON.parse(readFileSync(path.join(ROOT, 'docs/rounds/round-ledger.schema.json'), 'utf8'));
const EDITORIAL_SCHEMA = JSON.parse(readFileSync(path.join(ROOT, 'docs/corrections/editorial-ledger.schema.json'), 'utf8'));
const SUBJECTS = ['s1', 's2', 's3', 's4', 's5'];
const GATES = ['blindSolve', 'sourceCheck', 'ambiguityCheck', 'authoringAccessibility', 'structuralCheck'];
const emptySubjects = () => Object.fromEntries(SUBJECTS.map(id => [id, 0]));
const digest = raw => createHash('sha256').update(raw).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);
const meaningful = value => typeof value === 'string' && value.trim().length > 0;
const safeRelative = value => meaningful(value) && !path.isAbsolute(value) && !value.includes('\\') && !value.split('/').some(p => !p || p === '.' || p === '..');

// Deliberately scoped to the checked-in schema, not a general JSON Schema implementation.
// An unimplemented keyword, format, external reference or schema change fails closed.
const KEYWORDS = new Set(['$schema', '$defs', '$ref', 'title', 'description', 'type', 'const', 'enum',
  'properties', 'required', 'additionalProperties', 'items', 'contains', 'minItems', 'maxItems',
  'uniqueItems', 'minimum', 'maximum', 'minLength', 'pattern', 'format', 'allOf', 'anyOf', 'if', 'then', 'else']);
function inspectSchema(schema, root, at = '#', stack = new Set()) {
  if (typeof schema === 'boolean') return;
  if (!object(schema)) throw new Error(`${at}: invalid schema node`);
  for (const key of Object.keys(schema)) if (!KEYWORDS.has(key)) throw new Error(`${at}: unsupported schema keyword ${key}`);
  if (schema.$schema && schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') throw new Error(`${at}: unsupported schema dialect`);
  if (schema.format && !['date-time', 'uri'].includes(schema.format)) throw new Error(`${at}: unsupported format ${schema.format}`);
  if (schema.type && ![schema.type].flat().every(t => ['object', 'array', 'string', 'integer', 'number', 'null', 'boolean'].includes(t))) throw new Error(`${at}: unsupported type`);
  if (schema.pattern) new RegExp(schema.pattern, 'u');
  if (schema.$ref) {
    if (!/^#\/\$defs\/[^/]+$/.test(schema.$ref) || !own(root.$defs || {}, schema.$ref.slice(8))) throw new Error(`${at}: unsupported or unresolved reference ${schema.$ref}`);
    if (stack.has(schema.$ref)) throw new Error(`${at}: recursive schema references are unsupported`);
    inspectSchema(root.$defs[schema.$ref.slice(8)], root, schema.$ref, new Set([...stack, schema.$ref]));
  }
  for (const key of ['properties', '$defs']) for (const [name, child] of Object.entries(schema[key] || {})) inspectSchema(child, root, `${at}/${key}/${name}`, stack);
  for (const key of ['items', 'contains', 'if', 'then', 'else', 'additionalProperties']) if (own(schema, key)) inspectSchema(schema[key], root, `${at}/${key}`, stack);
  for (const key of ['allOf', 'anyOf']) for (const [i, child] of (schema[key] || []).entries()) inspectSchema(child, root, `${at}/${key}/${i}`, stack);
}
function validDateTime(value) {
  // Operational timestamps are ordinary RFC3339 civil instants. Leap-second spellings
  // are rejected rather than silently normalized by Date.parse.
  const m = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!m) return false;
  const [, y, month, day, hour, minute, second, , offsetHour = '0', offsetMinute = '0'] = m;
  const year = Number(y), mon = Number(month), d = Number(day);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return mon >= 1 && mon <= 12 && d >= 1 && d <= days[mon - 1] && Number(hour) < 24 && Number(minute) < 60 && Number(second) < 60 && Number(offsetHour) < 24 && Number(offsetMinute) < 60 && Number.isFinite(Date.parse(value));
}
function matchesType(value, type) {
  return type === 'null' ? value === null : type === 'object' ? object(value) : type === 'array' ? Array.isArray(value) : type === 'integer' ? Number.isInteger(value) : type === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === type;
}
function evaluate(value, schema, root, at, errors) {
  const fail = message => errors.push(`${at}: ${message}`);
  if (schema === true) return;
  if (schema === false) return fail('value is forbidden');
  if (schema.$ref) evaluate(value, root.$defs[schema.$ref.slice(8)], root, at, errors);
  if (schema.type && ![schema.type].flat().some(type => matchesType(value, type))) fail(`expected type ${[schema.type].flat().join('|')}`);
  if (own(schema, 'const') && !isDeepStrictEqual(value, schema.const)) fail(`expected constant ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some(item => isDeepStrictEqual(value, item))) fail(`expected one of ${schema.enum.join(', ')}`);
  if (typeof value === 'number') {
    if (own(schema, 'minimum') && value < schema.minimum) fail(`minimum ${schema.minimum}`);
    if (own(schema, 'maximum') && value > schema.maximum) fail(`maximum ${schema.maximum}`);
  }
  if (typeof value === 'string') {
    if (own(schema, 'minLength') && [...value].length < schema.minLength) fail(`minimum length ${schema.minLength}`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) fail(`does not match ${schema.pattern}`);
    if (schema.format === 'date-time' && !validDateTime(value)) fail('invalid RFC3339 date-time');
    if (schema.format === 'uri') {
      try { if (/\s|%(?![A-Fa-f0-9]{2})/.test(value) || !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) throw new Error(); new URL(value); }
      catch { fail('invalid absolute URI'); }
    }
  }
  if (object(value)) {
    for (const key of schema.required || []) if (!own(value, key)) fail(`missing required property ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (own(schema.properties || {}, key)) evaluate(item, schema.properties[key], root, `${at}/${key}`, errors);
      else if (own(schema, 'additionalProperties')) evaluate(item, schema.additionalProperties, root, `${at}/${key}`, errors);
    }
  }
  if (Array.isArray(value)) {
    if (own(schema, 'minItems') && value.length < schema.minItems) fail(`minimum items ${schema.minItems}`);
    if (own(schema, 'maxItems') && value.length > schema.maxItems) fail(`maximum items ${schema.maxItems}`);
    if (schema.uniqueItems && value.some((item, i) => value.slice(0, i).some(other => isDeepStrictEqual(item, other)))) fail('items must be unique');
    if (own(schema, 'items')) value.forEach((item, i) => evaluate(item, schema.items, root, `${at}/${i}`, errors));
    if (schema.contains && !value.some(item => { const e = []; evaluate(item, schema.contains, root, at, e); return e.length === 0; })) fail('no item satisfies contains');
  }
  for (const child of schema.allOf || []) evaluate(value, child, root, at, errors);
  if (schema.anyOf && !schema.anyOf.some(child => { const e = []; evaluate(value, child, root, at, e); return e.length === 0; })) fail('no anyOf branch matches');
  if (schema.if) {
    const condition = []; evaluate(value, schema.if, root, at, condition);
    const branch = condition.length ? schema.else : schema.then;
    if (branch !== undefined) evaluate(value, branch, root, at, errors);
  }
}
export function validateJsonSchema(value, schema = DEFAULT_SCHEMA) {
  const errors = [];
  try { inspectSchema(schema, schema); evaluate(value, schema, schema, '$', errors); }
  catch (error) { errors.push(`schema: ${error.message}`); }
  return errors;
}

export const MANUAL_CHECKS = [
  'Recorded timestamps, role identities and summaries are declarations, not proof of actual execution or independent key-blind review. All completed prior gate reviewers are conservatively treated as key-visible.',
  'Primary-source authority, source reading, licensing, scope, answer correctness, hidden semantic duplicate learning goals, concrete revisions and whether new evidence resolves the rejection require independent human/semantic review.',
  'Hash/count checks verify supplied local immutable bank bytes; they do not establish deployment, remote commit ancestry, hosted-byte identity, a complete untampered campaign history or preservation of learner sessions.',
  'Nonempty gap plans and exposure-safe public summaries still require semantic, privacy and secret review. Structural checks do not establish Windows/NVDA accessibility testing.',
  'The effective-dated campaign schedule is a fixed bound: legacy 08:00/20:00 Asia/Seoul before 2026-10-03 00:00 KST, then every four hours at 00/04/08/12/16/20 KST. An earlier actual scheduled start must be supplied with --next-round-at. No live scheduler is queried.'
];

/** Actual published regular unique templates, with constructible five-choice mock eligibility. */
export function regularCoverage(bank, at = Date.parse(bank.releasedAt)) {
  const written = emptySubjects(), fiveChoice = emptySubjects();
  const seen = new Set(), fiveSeen = new Set(); let practical = 0;
  for (const q of bank.questions) {
    if (q.testOnly !== false || !isPublishedQuestion(bank, q, at)) continue;
    if (!seen.has(q.templateId)) { seen.add(q.templateId); if (q.type === 'written') written[q.subjectId]++; else practical++; }
    if (q.type === 'written' && !fiveSeen.has(q.templateId) && q.supportedOptionCounts?.includes(5)) {
      try { presentQuestion(bank, q, 5, () => 0); fiveSeen.add(q.templateId); fiveChoice[q.subjectId]++; } catch { /* Not constructible, so not mock eligible. */ }
    }
  }
  return {regularWrittenBySubject: written, regularPractical: practical, mockEligible: SUBJECTS.every(id => fiveChoice[id] >= 20)};
}

/** Occurrence versions are effective-dated; do not reinterpret immutable Oct 2 history. */
export const FOUR_HOUR_CADENCE_AT = Date.parse('2026-10-03T00:00:00+09:00');
export const CAMPAIGN_SCHEDULE_VERSIONS = Object.freeze([
  Object.freeze({version: 'legacy-12h', effectiveFrom: Date.parse('2026-10-02T20:00:00+09:00'), effectiveUntil: FOUR_HOUR_CADENCE_AT, hours: Object.freeze([8, 20])}),
  Object.freeze({version: 'four-hour-v2', effectiveFrom: FOUR_HOUR_CADENCE_AT, effectiveUntil: FREEZE_AT, hours: Object.freeze([0, 4, 8, 12, 16, 20])})
]);
const scheduledRoundStarts = CAMPAIGN_SCHEDULE_VERSIONS.flatMap(version => {
  const starts = [];
  for (let day = 2; day <= 16; day++) for (const hour of version.hours) {
    const at = Date.parse(`2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+09:00`);
    if (at >= version.effectiveFrom && at < version.effectiveUntil) starts.push(at);
  }
  return starts;
}).sort((a, b) => a - b);
// The finalizer is a bound only, never another content-expansion occurrence.
const campaignBounds = [...scheduledRoundStarts, Date.parse('2026-10-16T23:30:00+09:00')];
export function nextScheduledRoundAt(startedAt) {
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return NaN;
  return campaignBounds.find(at => at > start) ?? FREEZE_AT;
}
const evidenceIdentity = e => `${e.url.replace(/#.*$/, '')}|${e.version.trim()}|${e.location.trim()}`;
function walkStrings(value, visit, at = '$') {
  if (typeof value === 'string') visit(value, at);
  else if (Array.isArray(value)) value.forEach((v, i) => walkStrings(v, visit, `${at}/${i}`));
  else if (object(value)) for (const [k, v] of Object.entries(value)) walkStrings(v, visit, `${at}/${k}`);
}

/** Pure validation. banks maps version to {raw: string|Buffer, bank?: object}; raw bytes are authoritative.
 * Pass ALL campaign ledgers, not only a reopened candidate's selected ancestors.
 * now is optional for reproducible historical validation; the CLI always supplies the real current clock.
 */
export function validateRoundLedgers(ledgers, {schema = DEFAULT_SCHEMA, banks = new Map(), now = null, nextRoundAt = null, publicationState = null, availableFiles = null, editorials = [], offlineBases = new Map(), ledgerSources = new Map(), synchronizations = [], deliveryCheckpointSources = new Map()} = {}) {
  const errors = [], rounds = [], warnings = [...MANUAL_CHECKS];
  const fail = (round, at, message) => errors.push(`${round?.roundId || '<unknown-round>'}${at}: ${message}`);
  if (!Array.isArray(ledgers)) return {ok: false, errors: ['ledgers must be an array'], warnings, rounds};
  for (const ledger of ledgers) {
    const schemaErrors = validateJsonSchema(ledger, schema);
    if (schemaErrors.length) errors.push(...schemaErrors.map(e => `${ledger?.roundId || '<unknown-round>'}: ${e}`));
    else rounds.push(ledger);
  }
  // Do not draw campaign conclusions from a partial set after a schema failure.
  if (errors.length) return {ok: false, errors, warnings, rounds: []};
  const roundById = new Map(), candidatesById = new Map(), goals = new Map(), lineages = new Map(), templates = new Map(), questionIds = new Map();
  const bankCache = new Map();
  function bankRecord(version, round, at, publication = false) {
    const entry = banks instanceof Map ? banks.get(version) : banks[version];
    if (!entry || !(typeof entry.raw === 'string' || Buffer.isBuffer(entry.raw))) { fail(round, at, `missing immutable bank bytes for ${version}`); return null; }
    let cached = bankCache.get(version);
    if (!cached) {
      try {
        const rawBank = JSON.parse(entry.raw.toString());
        validateBank(rawBank);
        if (rawBank.bankVersion !== version) throw new Error('bankVersion does not match immutable path');
        if (entry.bank && !isDeepStrictEqual(entry.bank, rawBank)) throw new Error('parsed bank does not match raw bytes');
        cached = {bank: rawBank, hash: digest(entry.raw)}; bankCache.set(version, cached);
      } catch (error) { fail(round, at, `invalid immutable bank ${version}: ${error.message}`); return null; }
    }
    if (publication) try { validateBankForPublication(cached.bank); } catch (error) { fail(round, at, `publication bank structure: ${error.message}`); }
    return cached;
  }
  for (const round of rounds) {
    if (roundById.has(round.roundId)) fail(round, '', 'duplicate roundId'); else roundById.set(round.roundId, round);
    for (const candidate of round.candidates) {
      const record = {round, candidate};
      if (candidatesById.has(candidate.candidateId)) fail(round, '/candidates', `duplicate campaign candidateId ${candidate.candidateId}`); else candidatesById.set(candidate.candidateId, record);
      for (const [map, id] of [[goals, candidate.learningGoalId], [lineages, candidate.lineageId], [templates, candidate.templateId], [questionIds, candidate.questionId]]) {
        if (id === null) continue;
        if (!map.has(id)) map.set(id, []); map.get(id).push(record);
      }
    }
  }
  for (const [id, records] of lineages) if (new Set(records.map(r => r.candidate.learningGoalId)).size !== 1) fail(records[0].round, '/candidates', `lineage ${id} disguises different learningGoalIds`);
  for (const [kind, map] of [['templateId', templates], ['questionId', questionIds]]) for (const [id, records] of map) {
    if (new Set(records.map(r => r.candidate.learningGoalId)).size !== 1) fail(records[0].round, '/candidates', `${kind} ${id} reused with renamed learning goal`);
  }
  for (const [id, records] of goals) {
    if (records.length > 2 || records.filter(r => r.candidate.reopenCount === 1).length > 1) fail(records[0].round, '/candidates', `learning goal ${id} exceeds one reopening`);
    if (new Set(records.map(r => r.candidate.lineageId)).size !== 1) fail(records[0].round, '/candidates', `learning goal ${id} resets lineageId`);
    if (records.reduce((sum, r) => sum + r.candidate.attemptCount, 0) > 6) fail(records[0].round, '/candidates', `learning goal ${id} exceeds six lineage cycles`);
    if (records.length > 1 && records.filter(r => r.candidate.reopenCount === 0).length !== 1) fail(records[0].round, '/candidates', `learning goal ${id} has duplicate originals or missing original`);
  }
  const consumedOccurrences = new Set(), consumedFourHourSlots = new Set();
  const ordered = [...rounds].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  for (const replacement of ordered.filter(r => r.scheduleSubstitution)) {
    const effective = Date.parse(replacement.scheduleSubstitution.effectiveStart);
    const nextOccurrence = nextScheduledRoundAt(replacement.scheduleSubstitution.supersededStart);
    for (const other of ordered) if (other !== replacement && Date.parse(other.startedAt) >= effective && Date.parse(other.startedAt) < nextOccurrence)
      fail(other, '/startedAt', 'scheduled occurrence already consumed by schedule substitution');
  }
  // Historical009 and manual011 have separate exact authorizations. Neither
  // consumes or renames a scheduled occurrence, nor changes a closed ledger.
  const authorizedManualNine = round => {
    const e=round?.manualStartException, prior=ordered.find(r=>r.roundId==='round-008');
    const raw=ledgerSources instanceof Map?ledgerSources.get('round-008'):null;
    return !!e && round.roundId==='round-009' && round.campaignId==='2026-exam-final'
      && round.startedAt==='2026-10-04T08:54:06Z' && e.requestedAt===round.startedAt
      && e.kind==='explicit_user_requested_next_round' && e.previousRoundId==='round-008'
      && e.previousClosedAt==='2026-10-04T07:56:30.743478+00:00'
      && e.nextScheduledStart==='2026-10-04T11:00:00Z'
      && round.decisionDeadline==='2026-10-04T10:30:00Z' && !round.scheduleSubstitution
      && prior?.status==='closed' && prior.closedAt===e.previousClosedAt
      && raw && digest(raw)==='65e117b3c940ace648ac152b56ecedbdb90c5593b12306f0d449f829ab11d128'
      && round.baseline.bankVersion==='2026.10.04-regular.8'
      && round.baseline.bankSha256==='ee533f5e4a546d14b7f2624700fb8d0dd0a47601290f9de9147f769ebf93feab'
      && round.baseline.sourceCommit==='50fd2807a0ff8fc2c10cbf2628f65d0ca53065c2';
  };
  const authorizedManualEleven = round => {
    const e=round?.manualStartException, prior=ordered.find(r=>r.roundId==='round-010');
    const raw=ledgerSources instanceof Map?ledgerSources.get('round-010'):null;
    const proofRaw=deliveryCheckpointSources instanceof Map?deliveryCheckpointSources.get('round-010'):null;
    const artifact='2adda630c19c950165a1000fd7c55e38363f6be4d022edecd1644ab4e865ff8b';
    const delivered=offlineBases instanceof Map?offlineBases.get(artifact):null;
    const ledgerHash='d15cbd2e5d56f79893920cecc922d8a12709b928e572fa720da8b3bb5545a63b';
    const proofHash='a00f2b35b2a63a171097bf0535d7968584f6dc40a9411b401f432e1d884dd917';
    const bankHash='50b6131f1ffb174bf4a459b0a91a2498465c0dccea0e4aee30259f195086b214';
    const manifestHash='409830ea355d2a546926be79e15dea07a44400ae0241dbd183a711b3e88ca7c0';
    const sourceCommit='500811b7ee226f33cfb598df42c6cb347b935d28';
    // Hash the original local evidence; a Boolean, fabricated map entry or altered
    // loaded predecessor cannot substitute for the independently reviewed bytes.
    if(!raw||!(typeof raw==='string'||Buffer.isBuffer(raw))||digest(raw)!==ledgerHash
      ||!proofRaw||!(typeof proofRaw==='string'||Buffer.isBuffer(proofRaw))||digest(proofRaw)!==proofHash)return false;
    return !!e && round.roundId==='round-011' && round.campaignId==='2026-exam-final'
      && e.requestedAt==='2026-10-04T12:41:51Z'
      && round.startedAt==='2026-10-04T13:08:49Z' && e.manualStartedAt===round.startedAt
      && e.kind==='explicit_user_requested_next_round' && e.previousRoundId==='round-010'
      && e.previousClosedAt==='2026-10-04T11:44:42+00:00'
      && e.previousLedgerSha256===ledgerHash && e.previousDeliveryCheckpointSha256===proofHash
      && e.previousDeliveryVerifiedAt==='2026-10-04T12:27:05.849Z'
      && e.nextScheduledStart==='2026-10-04T15:00:00Z'
      && round.decisionDeadline==='2026-10-04T14:30:00Z' && !round.scheduleSubstitution
      && prior?.status==='closed' && prior.closedAt===e.previousClosedAt
      && isDeepStrictEqual(JSON.parse(raw.toString()),prior)
      && round.baseline.bankVersion==='2026.10.04-regular.10'
      && round.baseline.bankSha256===bankHash && round.baseline.sourceCommit===sourceCommit
      && isDeepStrictEqual(round.baseline.offlinePredecessor,{artifactSha256:artifact,manifestSha256:manifestHash,ledgerSha256:ledgerHash,roundId:'round-010'})
      && isDeepStrictEqual(delivered,{roundId:'round-010',manifestSha256:manifestHash,ledgerSha256:ledgerHash,bankVersion:'2026.10.04-regular.10',bankSha256:bankHash,baseCommit:sourceCommit,recordedAt:'2026-10-04T12:25:19.586507+00:00',eligibleAt:e.previousDeliveryVerifiedAt})
      && Date.parse(e.requestedAt)<=Date.parse(round.startedAt)
      && Date.parse(e.previousDeliveryVerifiedAt)<=Date.parse(round.startedAt);
  };
  const authorizedManual = round => authorizedManualNine(round)||authorizedManualEleven(round);
  for (const r of ordered) if(r.manualStartException&&!authorizedManual(r))
    fail(r,'/manualStartException','not an authorized exact round-009 or round-011 manual start');
  for (const [roundIndex, round] of ordered.entries()) {
    const start = Date.parse(round.startedAt), deadline = Date.parse(round.decisionDeadline), close = round.closedAt === null ? null : Date.parse(round.closedAt);
    if (start >= FOUR_HOUR_CADENCE_AT && start < FREEZE_AT && !authorizedManual(round)) {
      const occurrence = FOUR_HOUR_CADENCE_AT + Math.floor((start - FOUR_HOUR_CADENCE_AT) / (4 * 3600000)) * 4 * 3600000;
      if (consumedFourHourSlots.has(occurrence)) fail(round, '/startedAt', 'scheduled four-hour occurrence already consumed by another regular round; resume the existing round');
      consumedFourHourSlots.add(occurrence);
    }
    const nextLoaded = ordered[roundIndex + 1];
    let scheduledBound = nextScheduledRoundAt(round.startedAt);
    if (round.scheduleSubstitution) {
      const substitution = round.scheduleSubstitution;
      const valid = round.roundId === 'round-002' && round.campaignId === '2026-exam-final'
        && round.startedAt === '2026-10-02T10:30:00Z'
        && substitution.effectiveStart === round.startedAt
        && substitution.supersededStart === '2026-10-02T11:00:00Z';
      if (!valid) fail(round, '/scheduleSubstitution', 'not the authorized round-002 schedule replacement');
      else scheduledBound = nextScheduledRoundAt(substitution.supersededStart);
      if (consumedOccurrences.has(substitution.supersededStart)) fail(round, '/scheduleSubstitution', 'scheduled occurrence already consumed');
      consumedOccurrences.add(substitution.supersededStart);
    }
    // A newly requested manual successor cannot rewrite an already-closed
    // predecessor's historical planned deadline. Its exact actual closure is
    // checked above; every other successor retains the ordinary deadline bound.
    const nextIsAuthorizedManual=nextLoaded&&authorizedManual(nextLoaded)&&nextLoaded.manualStartException.previousRoundId===round.roundId;
    const nextBound = Math.min(scheduledBound, nextLoaded&&!nextIsAuthorizedManual ? Date.parse(nextLoaded.startedAt) : Infinity, nextRoundAt === null ? Infinity : Date.parse(nextRoundAt));
    if (!Number.isFinite(nextBound)) fail(round, '/decisionDeadline', 'invalid next-round timestamp');
    if (deadline <= start || deadline > start + 4 * 3600000 || deadline > nextBound || deadline > FREEZE_AT || deadline > FINAL_DECISION_AT) fail(round, '/decisionDeadline', 'deadline must be after start and no later than four hours, next round, final freeze, or the final-day 23:00 KST decision cutoff');
    if (start >= FREEZE_AT) fail(round, '/startedAt', 'round begins at or after final freeze');
    if (nextLoaded && !nextIsAuthorizedManual && Date.parse(nextLoaded.startedAt) < deadline) fail(round, '/decisionDeadline', 'overlapping campaign rounds');
    if (round.status === 'running' && close !== null) fail(round, '/closedAt', 'running round must not claim a closedAt');
    if (close !== null && (close < start || close > deadline)) fail(round, '/closedAt', 'closure must be inside the decision window');
    if (now !== null && (start > now || (close !== null && close > now))) fail(round, '/startedAt', 'recorded round execution is in the future');
    if (now !== null && round.status === 'running' && now >= deadline) fail(round, '/status', 'deadline reached: running round must close with no pending decisions');
    if (publicationState?.finalized && publicationState.finalizedAt && (start >= Date.parse(publicationState.finalizedAt) || (close ?? deadline) > Date.parse(publicationState.finalizedAt))) fail(round, '/decisionDeadline', 'round exceeds the persistent early freeze');
    walkStrings(round, (text, at) => { if (!text.trim()) fail(round, at, 'blank-only strings are not public conclusions'); if (/\b(?:REPLACE-[A-Z-]+|TEMPLATE ONLY)\b/.test(text)) fail(round, at, 'template placeholder remains'); });
    if (/^0+$/.test(round.baseline.sourceCommit) || /^0+$/.test(round.baseline.bankSha256)) fail(round, '/baseline', 'placeholder commit/hash is not verified evidence');
    if (availableFiles && round.status === 'closed' && !availableFiles.has(`docs/rounds/${round.roundId}.md`)) fail(round, '', 'closed round is missing its public Markdown report');
    for (const record of round.validation) if (record.reportPath !== null && (!safeRelative(record.reportPath) || (availableFiles && !availableFiles.has(record.reportPath)))) fail(round, '/validation', `missing or unsafe reportPath ${record.reportPath}`);
    const actualCounts = {registered: round.candidates.length, accepted: 0, rejected: 0, pending: 0};
    for (const candidate of round.candidates) {
      const at = `/candidates/${candidate.candidateId}`; actualCounts[candidate.decision]++;
      if (candidate.attemptCount !== candidate.cycles.length) fail(round, at, 'attemptCount must equal every started cycle');
      const evidence = new Map();
      for (const e of candidate.evidence) {
        if (evidence.has(e.sourceId)) fail(round, at, `duplicate evidence sourceId ${e.sourceId}`);
        evidence.set(e.sourceId, e);
        if (Date.parse(e.checkedAt) > (close ?? deadline) || (now !== null && Date.parse(e.checkedAt) > now)) fail(round, at, `evidence ${e.sourceId} checked after decision/current time`);
      }
      let prior = null;
      if (candidate.reopenCount === 0) {
        if (candidate.priorCandidateRefs.length || candidate.reopeningEvidence.length || candidate.lineageAttemptCount !== candidate.attemptCount) fail(round, at, 'original candidate must not reset or import lineage counts');
      } else {
        const ref = candidate.priorCandidateRefs[0]; prior = ref && candidatesById.get(ref.candidateId);
        if (!prior || prior.round.roundId !== ref.roundId) fail(round, at, 'reopening references a missing campaign predecessor');
        else {
          const p = prior.candidate;
          if (prior.round === round || prior.round.status !== 'closed' || Date.parse(prior.round.closedAt) > start || Date.parse(prior.round.startedAt) >= start) fail(round, at, 'reopening must follow a closed earlier round');
          if (p.decision !== 'rejected' || p.reopenCount !== 0 || p.learningGoalId !== candidate.learningGoalId || p.lineageId !== candidate.lineageId) fail(round, at, 'reopening must reference the original rejected candidate in the same goal and lineage');
          if (ref.attemptCount !== p.attemptCount || ref.decision !== p.decision || !isDeepStrictEqual([...ref.reasonCodes].sort(), [...p.reasonCodes].sort())) fail(round, at, 'prior reference misstates actual review history');
          if (ref.ledgerPath !== `docs/rounds/${prior.round.roundId}.json`) fail(round, at, 'prior ledgerPath must identify the actual predecessor ledger');
          if (candidate.lineageAttemptCount !== p.attemptCount + candidate.attemptCount) fail(round, at, 'lineageAttemptCount must include actual predecessor cycles');
          if (candidate.questionId !== null && candidate.questionId === p.questionId && candidate.revision <= p.revision) fail(round, at, 'reopened same questionId must advance revision');
          const old = new Set(p.evidence.map(evidenceIdentity));
          for (const e of candidate.reopeningEvidence) {
            if (old.has(evidenceIdentity(e))) fail(round, at, 'reopening evidence merely rereads the same primary source location/version');
            if (!isDeepStrictEqual(evidence.get(e.sourceId), e)) fail(round, at, 'reopening evidence must occur unchanged in candidate evidence');
            if (Date.parse(e.checkedAt) < Date.parse(prior.round.closedAt)) fail(round, at, 'reopening evidence predates the previous final decision');
          }
        }
      }
      const exposed = new Set(prior ? [prior.candidate.authorId, ...prior.candidate.cycles.flatMap(c => Object.values(c.gates).filter(g => g.result !== 'not_run').map(g => g.reviewerId))] : []);
      let previous = null;
      for (const [i, cycle] of candidate.cycles.entries()) {
        const cycleAt = `${at}/cycles/${i}`;
        const cycleStart = Date.parse(cycle.startedAt), cycleEnd = cycle.finishedAt === null ? null : Date.parse(cycle.finishedAt);
        if (cycle.outcome === 'running' && (i !== candidate.cycles.length - 1 || candidate.decision !== 'pending' || round.status !== 'running')) fail(round, cycleAt, 'only the last cycle of a running pending candidate can be running');
        if (cycle.cycle !== i + 1) fail(round, cycleAt, 'cycle numbering must be contiguous from 1');
        if (cycleStart < start || cycleStart > deadline || (cycleEnd !== null && (cycleEnd < cycleStart || cycleEnd > (close ?? deadline))) || (now !== null && (cycleStart > now || (cycleEnd !== null && cycleEnd > now)))) fail(round, cycleAt, 'cycle execution must finish inside the decision window/current time');
        if (previous && (previous.outcome !== 'revise' || cycle.revision <= previous.revision || cycleStart < Date.parse(previous.finishedAt))) fail(round, cycleAt, 'new cycles require an earlier revise, a newer revision and ordered execution');
        const blind = cycle.gates.blindSolve;
        if (blind.result !== 'not_run' && (blind.reviewerId === candidate.authorId || exposed.has(blind.reviewerId))) fail(round, cycleAt, 'blind reviewer is author or previously key-visible');
        for (const gateName of GATES) {
          const gate = cycle.gates[gateName];
          if (gate.result !== 'not_run' && !meaningful(gate.reviewerId)) fail(round, `${cycleAt}/${gateName}`, 'executed gate requires a reviewer identity');
          for (const ref of gate.evidenceRefs) if (!evidence.has(ref)) fail(round, `${cycleAt}/${gateName}`, `unknown evidence reference ${ref}`);
          if (gate.result === 'pass' && gateName === 'sourceCheck' && !gate.evidenceRefs.length) fail(round, `${cycleAt}/${gateName}`, 'passed source check needs evidence references');
          for (const ref of gate.evidenceRefs) if (evidence.has(ref) && Date.parse(evidence.get(ref).checkedAt) > (cycleEnd ?? now ?? deadline)) fail(round, `${cycleAt}/${gateName}`, 'evidence was checked after this gate cycle');
        }
        if (cycle.outcome === 'accepted' && GATES.some(g => cycle.gates[g].result !== 'pass')) fail(round, cycleAt, 'accepted requires all gates on the same revision');
        if (cycle.outcome === 'revise' && GATES.every(g => cycle.gates[g].result === 'pass')) fail(round, cycleAt, 'revise requires a concrete failed or unrun gate');
        for (const gate of Object.values(cycle.gates)) if (gate.result !== 'not_run' && gate.reviewerId !== null) exposed.add(gate.reviewerId);
        previous = cycle;
      }
      if (previous && previous.revision !== candidate.revision) fail(round, at, 'final revision differs from last reviewed revision');
      if (previous && !(candidate.decision === 'pending' ? ['revise', 'running'].includes(previous.outcome) : previous.outcome === candidate.decision)) fail(round, at, 'last cycle outcome differs from final decision');
      if (candidate.decision === 'pending' && candidate.reasonCodes.length) fail(round, at, 'pending candidate must not claim final reason codes');
      if (candidate.decision !== 'accepted' && candidate.publishedBankVersion !== null) fail(round, at, 'only accepted candidates can be published');
    }
    for (const [key, value] of Object.entries(actualCounts)) if (round.counts[key] !== value) fail(round, `/counts/${key}`, `expected actual count ${value}`);
    if (round.status === 'closed' && actualCounts.pending) fail(round, '/counts', 'closed round cannot contain pending candidates');
    const gapIds = new Set();
    for (const gap of round.nextRoundGaps) {
      if (gapIds.has(gap.gapId)) fail(round, '/nextRoundGaps', `duplicate gapId ${gap.gapId}`); gapIds.add(gap.gapId);
      for (const id of gap.candidateIds) {
        const record = candidatesById.get(id);
        if (!record || Date.parse(record.round.startedAt) > start) fail(round, '/nextRoundGaps', `unknown/future gap candidate ${id}`);
        else if (gap.reopenEligible && (record.candidate.decision !== 'rejected' || record.candidate.reopenCount !== 0 || (goals.get(record.candidate.learningGoalId)?.filter(item => Date.parse(item.round.startedAt) <= start).length ?? 0) > 1)) fail(round, '/nextRoundGaps', `candidate ${id} cannot be marked reopenEligible`);
      }
      if (gap.reopenEligible && gap.candidateIds.length === 0) fail(round, '/nextRoundGaps', 'reopenEligible requires an identified rejected candidate');
      for (const id of gap.candidateIds) {
        const c = candidatesById.get(id)?.candidate;
        if (c && (!gap.subjectIds.includes(c.subjectId) || !gap.learningGoalIds.includes(c.learningGoalId))) fail(round, '/nextRoundGaps', `gap does not identify subject/learning goal of ${id}`);
      }
      // A future, not-yet-registered learningGoalId may legitimately be a coverage gap.
      for (const key of ['finding', 'neededEvidenceOrCounterexample', 'nextAction', 'completionCriterion']) if (/^(?:done|complete(?:d)?|none|n\/?a|ok|완료|없음|해당\s*없음)[.!\s]*$/i.test(gap[key])) fail(round, '/nextRoundGaps', `formal placeholder is not a concrete ${key}`);
    }
    if (round.status === 'closed' && round.nextRoundGaps.length === 0 && (!meaningful(round.noGapExplanation) || /^(?:done|complete(?:d)?|none|n\/?a|ok|완료|없음|해당\s*없음)[.!\s]*$/i.test(round.noGapExplanation))) fail(round, '/noGapExplanation', 'no-gap explanation must state reviewed scope and evidence');

    const baseline = bankRecord(round.baseline.bankVersion, round, '/baseline');
    if (baseline) {
      if (baseline.hash !== round.baseline.bankSha256) fail(round, '/baseline/bankSha256', 'immutable baseline bank hash mismatch');
      if (Date.parse(baseline.bank.releasedAt) > start) fail(round, '/baseline', 'baseline bank was released after this round began');
      const coverage = regularCoverage(baseline.bank, start);
      if (!isDeepStrictEqual(coverage.regularWrittenBySubject, round.baseline.regularWrittenBySubject) || coverage.regularPractical !== round.baseline.regularPractical) fail(round, '/baseline', 'baseline regular counts do not match actual unique published templates');
    }
    const published = round.publication.status === 'verified';
    const publication = published ? bankRecord(round.publication.bankVersion, round, '/publication', true) : null;
    const actualNew = {written: emptySubjects(), practical: 0};
    if (!published) {
      if (round.publication.verifiedAt !== null) fail(round, '/publication/verifiedAt', 'unverified publication cannot claim verification time');
      for (const candidate of round.candidates) if (candidate.publishedBankVersion !== null) fail(round, '/candidates', 'unverified publication must leave publishedBankVersion null');
    } else {
      const verified = Date.parse(round.publication.verifiedAt);
      if (round.status !== 'closed') fail(round, '/publication', 'verified publication requires closed candidate decisions');
      if (verified < (close ?? start) || verified >= FREEZE_AT || (now !== null && verified > now)) fail(round, '/publication/verifiedAt', 'verification must follow closure and precede final freeze/current time');
      if (publicationState?.finalizedAt && verified > Date.parse(publicationState.finalizedAt)) fail(round, '/publication/verifiedAt', 'verification is after persistent freeze');
      if (round.publication.blockers.length) fail(round, '/publication/blockers', 'verified publication cannot retain active blockers');
      if (/^0+$/.test(round.publication.commit) || /^0+$/.test(round.publication.bankSha256)) fail(round, '/publication', 'placeholder commit/hash is not publication evidence');
      if (publication) {
        if (publication.hash !== round.publication.bankSha256) fail(round, '/publication/bankSha256', 'immutable published bank hash mismatch');
        if (publication.bank.bankVersion === round.baseline.bankVersion) fail(round, '/publication', 'new publication must use a new immutable bankVersion');
        if (Date.parse(publication.bank.releasedAt) < (close ?? start) || Date.parse(publication.bank.releasedAt) > verified) fail(round, '/publication', 'bank release must follow decision closure and precede hosted verification');
      }
      if (publication && baseline) {
        const currentQuestions = new Map(publication.bank.questions.map(q => [q.questionId, q]));
        const oldQuestions = new Map(baseline.bank.questions.map(q => [q.questionId, q]));
        const oldTemplates = new Set(baseline.bank.questions.map(q => q.templateId));
        const currentOptions = new Map(publication.bank.options.map(o => [o.optionId, o]));
        const currentSources = new Map(publication.bank.sources.map(s => [s.id, s]));
        for (const q of baseline.bank.questions) if (!isDeepStrictEqual(currentQuestions.get(q.questionId), q)) fail(round, '/publication', `existing question changed or removed: ${q.questionId}`);
        for (const o of baseline.bank.options) if (!isDeepStrictEqual(currentOptions.get(o.optionId), o)) fail(round, '/publication', `existing option changed or removed: ${o.optionId}`);
        for (const s of baseline.bank.sources) if (!isDeepStrictEqual(currentSources.get(s.id), s)) fail(round, '/publication', `existing source changed or removed: ${s.id}`);
        const accepted = new Map(round.candidates.filter(c => c.decision === 'accepted').map(c => [c.questionId, c]));
        const newSeen = new Set();
        for (const q of publication.bank.questions.filter(q => !oldQuestions.has(q.questionId))) {
          const c = accepted.get(q.questionId);
          if (!c || c.publishedBankVersion !== publication.bank.bankVersion || c.revision !== q.revision || c.templateId !== q.templateId || c.type !== q.type || c.subjectId !== q.subjectId || q.testOnly !== false || !isPublishedQuestion(publication.bank, q, verified)) {
            fail(round, '/publication', `new bank question lacks matching accepted published regular decision: ${q.questionId}`); continue;
          }
          if (q.sourceRefs.some(id => !c.evidence.some(e => e.sourceId === id))) fail(round, '/publication', `question sourceRefs lack candidate evidence: ${q.questionId}`);
          for (const id of q.sourceRefs) {
            const source = currentSources.get(id), evidence = c.evidence.find(e => e.sourceId === id);
            if (source && evidence && ['url', 'version', 'location'].some(key => source[key] !== evidence[key])) fail(round, '/publication', `bank source differs from reviewed evidence: ${id}`);
          }
          if (oldTemplates.has(q.templateId) || newSeen.has(q.templateId)) { fail(round, '/publication', `duplicate/seed template cannot count as a new regular question: ${q.templateId}`); continue; }
          newSeen.add(q.templateId); if (q.type === 'written') actualNew.written[q.subjectId]++; else actualNew.practical++;
        }
        for (const c of round.candidates.filter(c => c.publishedBankVersion !== null)) {
          if (c.publishedBankVersion !== publication.bank.bankVersion || !currentQuestions.has(c.questionId) || oldQuestions.has(c.questionId)) fail(round, '/publication', `published candidate is not a new question in this bank: ${c.candidateId}`);
        }
      }
    }
    if (!isDeepStrictEqual(actualNew.written, round.counts.publishedRegularWrittenBySubject) || actualNew.practical !== round.counts.publishedRegularPractical) fail(round, '/counts', 'new public counts differ from verified accepted regular unique templates');
    let actualBank = publication || (!published ? baseline : null);
    if (!published && round.baseline.offlinePredecessor) {
      const synchronizedHistory=validatePublicationSynchronizations(synchronizations,{ledgers:rounds,banks,ledgerSources,now:close??start,publicationState}).history;
      const latestVerified = [...rounds,...editorials,...synchronizedHistory].filter(r=>r.publication?.status==='verified'&&Date.parse(r.publication.verifiedAt)<=(close??start)).sort((a,b)=>Date.parse(b.publication.verifiedAt)-Date.parse(a.publication.verifiedAt))[0];
      if (latestVerified) actualBank=bankRecord(latestVerified.publication.bankVersion,round,'/coverageAfter');
      else {
        // The first offline source retains its real remote baseline. Walk that
        // immutable chain rather than treating downloaded accepted items as public.
        let anchor=round; const seen=new Set();
        while(anchor?.baseline.offlinePredecessor&&!seen.has(anchor.roundId)) {seen.add(anchor.roundId);anchor=roundById.get(anchor.baseline.offlinePredecessor.roundId);}
        actualBank=anchor&&!anchor.baseline.offlinePredecessor?bankRecord(anchor.baseline.bankVersion,round,'/coverageAfter'):null;
        if(!actualBank)fail(round,'/coverageAfter','missing genuine verified remote coverage anchor for offline continuation');
      }
    }
    if (actualBank) {
      const coverage = regularCoverage(actualBank.bank, published ? Date.parse(round.publication.verifiedAt) : (close ?? start));
      if (!isDeepStrictEqual(round.coverageAfter, coverage)) fail(round, '/coverageAfter', 'coverage/mock eligibility differs from actual verified bank');
    }
  }
  errors.push(...validateCampaignBaselines(rounds,{editorials,now,offlineBases,ledgerSources,synchronizations,banks,publicationState}).errors);
  return {ok: errors.length === 0, errors, warnings, rounds: rounds.map(r => ({roundId: r.roundId, status: r.status, candidates: r.candidates.length, publication: r.publication.status}))};
}
export function validateRoundLedger(ledger, options = {}) {
  return validateRoundLedgers([...(options.otherLedgers || []), ledger], options);
}

/** Pre-publication gate: no hosted-verification claim is manufactured for a staged release. */
export function validateEditorialLedgers(editorials, options = {}) {
  const result = validateEditorialHistory(editorials, {...options, schema: options.editorialSchema || EDITORIAL_SCHEMA}, {validateJsonSchema, regularCoverage, nextScheduledRoundAt, FINAL_DECISION_AT});
  result.errors.push(...validateCampaignBaselines(options.ledgers||[],{editorials,now:options.now??null,offlineBases:options.offlineBases,ledgerSources:options.ledgerSources,synchronizations:options.synchronizations,banks:options.banks,publicationState:options.publicationState}).errors); result.ok=result.errors.length===0; return result;
}
export function validateReleaseLedger(ledgers, {manifest, banks = new Map(), editorials = [], editorialSchema = EDITORIAL_SCHEMA, ...historyOptions} = {}) {
  const errors = [], fail = message => errors.push(`release: ${message}`);
  const get = version => banks instanceof Map ? banks.get(version) : banks[version];
  if (!manifest || manifest.schemaVersion !== 1 || typeof manifest.finalRelease !== 'boolean' || !meaningful(manifest.changeSummary)) return {ok: false, errors: ['release: invalid active manifest schema, summary or finalRelease']};
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(manifest.bankVersion) || manifest.file !== `releases/${manifest.bankVersion}/bank.json`) return {ok: false, errors: ['release: invalid active manifest path/version']};
  const active = get(manifest.bankVersion);
  if (!active?.raw) return {ok: false, errors: ['release: missing active immutable bank bytes']};
  let bank;
  try { bank = validateBankForPublication(JSON.parse(active.raw.toString())); } catch (error) { return {ok: false, errors: [`release: invalid active bank: ${error.message}`]}; }
  if (bank.changeSummary !== manifest.changeSummary) fail('active manifest change summary does not match bank');
  if (bank.bankVersion !== manifest.bankVersion || bank.releasedAt !== manifest.releasedAt || digest(active.raw) !== manifest.sha256) fail('active manifest version/release/hash does not match bank bytes');
  try { validateExplanationAuthoring(bank, historicalExplanationBaseline(banks)); } catch(error) { fail(`explanation authoring: ${error.message}`); }
  errors.push(...validateCampaignBaselines(ledgers,{editorials,now:historyOptions.now??null,activeBankVersion:bank.bankVersion,offlineBases:historyOptions.offlineBases,ledgerSources:historyOptions.ledgerSources,synchronizations:historyOptions.synchronizations,banks,publicationState:historyOptions.publicationState}).errors);
  const regular = bank.questions.filter(q => q.testOnly === false && q.verificationStatus === 'published');
  // Historical seed-only releases do not invent a regular expansion round.
  if (!regular.length) {
    if ([...ledgers,...editorials].some(r=>r.publication?.status==='verified')) fail('seed-only active bank cannot replace verified regular campaign content');
    return {ok: errors.length === 0, errors};
  }
  const matching = ledgers.filter(r => r.publication?.bankVersion === bank.bankVersion);
  const matchingEditorials = editorials.filter(r => r.publication?.bankVersion === bank.bankVersion);
  if (matchingEditorials.length) {
    if (matching.length || matchingEditorials.length !== 1) return {ok:false, errors:[...errors, 'release: exactly one expansion OR editorial ledger must identify an active bank']};
    const history = validateEditorialLedgers(editorials, {ledgers, banks, editorialSchema, ...historyOptions});
    errors.push(...history.errors);
    const e = matchingEditorials[0];
    if (['blocked','skipped'].includes(e.publication.status) || e.publication.blockers.length) fail('editorial release has publication blockers');
    if (e.publication.bankSha256 !== manifest.sha256) fail('editorial ledger publication hash must match manifest');
    const baselineRaw = get(e.baseline.bankVersion)?.raw;
    if (!baselineRaw) fail('editorial baseline is missing');
    else {
      try { const baseline = validateBank(JSON.parse(baselineRaw.toString())); validateEditorialTransition(e, baseline, bank, {banks, regularCoverage, now:historyOptions.now}, fail); }
      catch(error) { fail(`editorial baseline/transition: ${error.message}`); }
    }
    return {ok: errors.length === 0, errors};
  }
  if (matching.length !== 1) return {ok: false, errors: [...errors, 'release: active regular bank requires exactly one explicit publication.bankVersion ledger reference']};
  const round = matching[0];
  if(round.baseline?.offlinePredecessor || historyOptions.synchronizations?.length) {
    // The offline staging entry point is also a full-history gate. A caller must
    // not bypass review counters/lineages by invoking only validateReleaseLedger.
    errors.push(...validateRoundLedgers(ledgers,{banks,editorials,...historyOptions}).errors);
  }
  if (round.status !== 'closed' || round.candidates.some(c => c.decision === 'pending')) fail('active regular bank requires a closed ledger with no pending decisions');
  const sync=validatePublicationSynchronizations(historyOptions.synchronizations,{ledgers,banks,...historyOptions,activeBankVersion:bank.bankVersion});
  errors.push(...sync.errors);
  const synchronized=sync.history.some(h=>h.publication.bankVersion===bank.bankVersion&&h.publication.bankSha256===manifest.sha256&&h.synchronizedRoundIds.includes(round.roundId));
  if (!synchronized && (['blocked', 'skipped'].includes(round.publication.status) || round.publication.blockers.length)) fail('active regular bank has unresolved publication blockers');
  if (round.publication.bankSha256 !== manifest.sha256) fail('ledger publication.bankSha256 must match the active staged bank');
  const baselineRaw = get(round.baseline.bankVersion)?.raw;
  if (!baselineRaw) return {ok: false, errors: [...errors, 'release: missing immutable baseline bank bytes']};
  let baseline;
  try { baseline = validateBank(JSON.parse(baselineRaw.toString())); } catch (error) { return {ok: false, errors: [...errors, `release: invalid baseline bank: ${error.message}`]}; }
  if (digest(baselineRaw) !== round.baseline.bankSha256) fail('baseline hash mismatch');
  const oldQuestions = new Map(baseline.questions.map(q => [q.questionId, q]));
  const oldTemplates = new Set(baseline.questions.map(q => q.templateId));
  const currentQuestions = new Map(bank.questions.map(q => [q.questionId, q]));
  for (const [kind, before, after, key] of [['question', baseline.questions, bank.questions, 'questionId'], ['option', baseline.options, bank.options, 'optionId'], ['source', baseline.sources, bank.sources, 'id']]) {
    const current = new Map(after.map(v => [v[key], v]));
    for (const value of before) if (!isDeepStrictEqual(value, current.get(value[key]))) fail(`existing ${kind} changed or removed: ${value[key]}`);
  }
  const accepted = new Map(round.candidates.filter(c => c.decision === 'accepted').map(c => [c.questionId, c]));
  const seen = new Set();
  for (const q of bank.questions.filter(q => !oldQuestions.has(q.questionId))) {
    const c = accepted.get(q.questionId), last = c?.cycles.at(-1);
    if (!c || c.revision !== q.revision || c.templateId !== q.templateId || c.type !== q.type || c.subjectId !== q.subjectId || last?.outcome !== 'accepted' || last.revision !== q.revision || GATES.some(g => last.gates[g].result !== 'pass') || q.testOnly !== false || !isPublishedQuestion(bank, q, Date.parse(bank.releasedAt))) { fail(`new question is not an accepted all-gates-pass regular candidate: ${q.questionId}`); continue; }
    if (oldTemplates.has(q.templateId) || seen.has(q.templateId)) fail(`duplicate/seed template is not a regular addition: ${q.templateId}`);
    seen.add(q.templateId);
    for (const id of q.sourceRefs) {
      const e = c.evidence.find(e => e.sourceId === id), source = bank.sources.find(s => s.id === id);
      if (!e || !source || ['url', 'version', 'location'].some(key => e[key] !== source[key])) fail(`new question lacks matching reviewed primary evidence: ${q.questionId}/${id}`);
    }
  }
  for (const c of round.candidates.filter(c => c.decision === 'accepted')) if (!currentQuestions.has(c.questionId)) fail(`accepted candidate is absent from staged release: ${c.candidateId}`);
  if (bank.bankVersion === baseline.bankVersion || Date.parse(bank.releasedAt) < Date.parse(round.closedAt ?? round.startedAt) || Date.parse(bank.releasedAt) >= FREEZE_AT || historyOptions.now !== null && historyOptions.now !== undefined && Date.parse(bank.releasedAt) > historyOptions.now) fail('staged release must be a new bank after decision closure and before campaign freeze/current time');
  return {ok: errors.length === 0, errors};
}

async function readOfflinePublicFile(root, relative) {
  if(!safeRelative(relative))throw new Error(`Unsafe offline evidence path: ${relative}`);
  let current=path.resolve(root);
  for(let ancestor=current;;ancestor=path.dirname(ancestor)) {
    if((await fs.lstat(ancestor)).isSymbolicLink())throw new Error('Offline evidence root cannot be a symlink');
    if(path.dirname(ancestor)===ancestor)break;
  }
  for(const [index,part] of relative.split('/').entries()) {
    current=path.join(current,part); const stat=await fs.lstat(current);
    if(stat.isSymbolicLink()||(index===relative.split('/').length-1?!stat.isFile():!stat.isDirectory()))throw new Error(`Offline evidence must be a regular public file: ${relative}`);
  }
  return fs.readFile(current);
}

export async function loadRoundContext(root = ROOT, input = null, options = {}) {
  return loadContext(root,input,options);
}
/** Read-only reconstruction of an exact original delivered source. No supplied
 * date/Boolean/Map selects this exception and no current release context escapes.
 * Source bytes, full inventory and boundary all come from independently pinned
 * external-delivery evidence linked to an independently pinned publication. */
export async function auditHistoricalRelease(root) {
  const listed=(await readOfflinePublicFile(root,'PUBLICATION-MANIFEST.txt')).toString().split(/\r?\n/).map(p=>p.trim()).filter(p=>p&&!p.startsWith('#'));
  if(new Set(listed).size!==listed.length)throw new Error('Duplicate historical archive allowlist path');
  const actual=[];
  async function walk(directory,prefix='') {
    for(const entry of await fs.readdir(directory,{withFileTypes:true})) {
      const relative=prefix+entry.name;
      if(entry.isDirectory())await walk(path.join(directory,entry.name),relative+'/');
      else if(entry.isFile())actual.push(relative);
      else throw new Error('Historical archive requires regular files and directories only');
    }
  }
  await walk(root);
  if(!isDeepStrictEqual(actual.sort(),[...listed].sort()))throw new Error('Historical archive has extra, missing or unlisted source files');
  for(const pin of PUBLICATION_SYNCHRONIZATIONS) {
    const raw=await readOfflinePublicFile(ROOT,pin.path);
    if(digest(raw)!==pin.sha256)throw new Error('Publication authority proof hash mismatch');
    const event=JSON.parse(raw);if(!event.previousSynchronizationSha256)continue;
    for(const source of event.rounds) {
      const sourceRaw=await readOfflinePublicFile(ROOT,source.deliveryProof.path);
      const proof=validateSynchronizationDeliveryProof(event,source,sourceRaw),inventory=proof.completeManifest.files;
      if(inventory.length!==listed.length||inventory.some(f=>!listed.includes(f.path)))continue;
      let exact=true;
      for(const f of inventory) {
        let b;try{b=await readOfflinePublicFile(root,f.path);}catch(e){if(e.code!=='ENOENT')throw e;exact=false;break;}
        if(b.length!==f.bytes||digest(b)!==f.sha256){exact=false;break;}
      }
      if(!exact)continue;
      const asOf=proof.deltaManifest.preparedAt,at=Date.parse(asOf);
      if(!Number.isFinite(at)||at>=Date.parse(event.verifiedAt)||at>=FREEZE_AT)throw new Error('Historical archive must predate publication evidence and final cutoff');
      const context=await loadContext(root,null,{release:true,now:at},{publicationProofSha256:pin.sha256});
      const checked=validateReleaseLedger(context.ledgers,{...context,now:at});
      return {...checked,kind:'exact_historical_delivery_audit',asOf,roundId:source.roundId,sourceProofSha256:source.deliveryProof.sha256,currentReleaseClearance:false,canStartNewContent:false};
    }
  }
  throw new Error('Historical audit requires an exact independently pinned complete source inventory');
}
async function loadContext(root = ROOT, input = null, {release = false, now = Date.now()} = {}, historicalSnapshot = null) {
  const directory = path.join(root, 'docs/rounds');
  const paths = (await fs.readdir(directory)).filter(name => /^round-.*\.json$/.test(name) && !['round-ledger.schema.json', 'round-ledger.template.json'].includes(name)).map(name => path.join(directory, name));
  const editorialDirectory = path.join(root, 'docs/corrections');
  let editorialPaths=[];
  try { editorialPaths=(await fs.readdir(editorialDirectory)).filter(name=>/^editorial-.*\.json$/.test(name) && !['editorial-ledger.schema.json','editorial-ledger.template.json'].includes(name)).map(name=>path.join(editorialDirectory,name)); }
  catch(error) { if(error.code!=='ENOENT')throw error; }
  if (input && !paths.includes(path.resolve(input)) && !editorialPaths.includes(path.resolve(input))) {
    const data=JSON.parse(await fs.readFile(path.resolve(input),'utf8'));
    (data.kind==='accepted_content_editorial'?editorialPaths:paths).push(path.resolve(input));
  }
  const ledgers = [], editorials=[],ledgerSources=new Map();
  for (const file of paths.sort()) {
    const raw=await fs.readFile(file),round = JSON.parse(raw.toString());
    if (path.dirname(file) === directory && path.basename(file) !== `${round.roundId}.json`) throw new Error(`Ledger filename does not match roundId: ${file}`);
    ledgers.push(round); ledgerSources.set(round.roundId,raw);
  }
  for (const file of editorialPaths.sort()) {
    const e=JSON.parse(await fs.readFile(file,'utf8'));
    if(path.dirname(file)===editorialDirectory && path.basename(file)!==`${e.correctionRoundId}.json`)throw new Error(`Editorial filename does not match correctionRoundId: ${file}`);
    editorials.push(e);
  }
  const schema = JSON.parse(await fs.readFile(path.join(directory, 'round-ledger.schema.json'), 'utf8'));
  const manifest = release ? JSON.parse(await fs.readFile(path.join(root, 'data/manifest.json'), 'utf8')) : null;
  const banks = new Map();
  for (const version of new Set([...[...ledgers,...editorials].flatMap(r => [r.baseline?.bankVersion, r.publication?.bankVersion]), ...editorials.flatMap(e=>e.corrections.map(c=>c.priorAcceptedRef.bankVersion)), manifest?.bankVersion].filter(Boolean))) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(version)) throw new Error(`Invalid immutable bank version ${version}`);
    const file = path.join(root, 'data/releases', version, 'bank.json');
    try { banks.set(version, {raw: await fs.readFile(file)}); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const reviewPackages=new Map();
  for(const file of new Set(editorials.flatMap(e=>e.corrections.flatMap(c=>c.cycles.map(cycle=>cycle.reviewPackagePath))).filter(Boolean))) {
    if(!safeRelative(file)||!/^docs\/corrections\/evidence\/[^/]+-cycle-[123]\.json$/.test(file))throw new Error(`Unsafe editorial review package path: ${file}`);
    try{reviewPackages.set(file,{raw:await fs.readFile(path.join(root,file))});}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const availableFiles = new Set();
  for (const file of new Set([...ledgers.flatMap(r => [`docs/rounds/${r.roundId}.md`, ...((r.validation || []).map(v => v.reportPath).filter(Boolean))]), ...editorials.flatMap(e=>[`docs/corrections/${e.correctionRoundId}.md`, ...((e.validation||[]).map(v=>v.reportPath).filter(Boolean))])])) {
    if (!safeRelative(file)) continue;
    try { if ((await fs.stat(path.join(root, file))).isFile()) availableFiles.add(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const publicationState = JSON.parse(await fs.readFile(path.join(root, 'data/publication-state.json'), 'utf8'));
  const synchronizations=[];
  const listed=new Set((await readOfflinePublicFile(root,'PUBLICATION-MANIFEST.txt')).toString().split(/\r?\n/).map(p=>p.trim()).filter(p=>p&&!p.startsWith('#')));
  for(const pin of PUBLICATION_SYNCHRONIZATIONS) {
    // Only auditHistoricalRelease can supply this already authenticated boundary.
    // Ordinary current loading never permits an absent reviewed publication.
    if(historicalSnapshot?.publicationProofSha256===pin.sha256)break;
    const raw=await readOfflinePublicFile(root,pin.path);
    if(digest(raw)!==pin.sha256)throw new Error('Publication synchronization proof hash mismatch');
    if(!listed.has(pin.path))throw new Error('Publication synchronization dependency missing from reviewed allowlist');
    const record=JSON.parse(raw.toString());
    const relevant=record.rounds.every(s=>ledgers.some(r=>r.roundId===s.roundId))||ledgers.some(r=>Date.parse(r.startedAt)>=Date.parse(record.verifiedAt));
    if(record.previousSynchronizationSha256&&relevant)for(const source of record.rounds) {
      if(!listed.has(source.deliveryProof?.path))throw new Error('Publication delivery proof dependency missing from reviewed allowlist');
      validateSynchronizationDeliveryProof(record,source,await readOfflinePublicFile(root,source.deliveryProof.path));
    }
    synchronizations.push(record);
  }
  let offlineBases=new Map(),deliveryCheckpointSources=new Map(),indexRaw,resolvedArtifacts=new Set();
  try {indexRaw=await readOfflinePublicFile(root,'docs/deliveries/offline-chain.json');}catch(error){if(error.code!=='ENOENT')throw error;}
  if(indexRaw) {
    const index=JSON.parse(indexRaw.toString()),keys=['schemaVersion','receipts','manifests','ledgerPaths'];
    if(!object(index)||!isDeepStrictEqual(Object.keys(index).sort(),keys.sort())||index.schemaVersion!==1||!Array.isArray(index.receipts)||!Array.isArray(index.manifests)||!Array.isArray(index.ledgerPaths)||!index.receipts.length||index.receipts.length!==index.manifests.length)throw new Error('Invalid public offline delivery index');
    const manifests=new Map(),frozenLedgers=new Map(),seenPaths=new Set();
    for(const receipt of index.receipts) {
      const matches=index.manifests.filter(m=>digest(Buffer.from(JSON.stringify(m,null,2)+'\n'))===receipt?.manifestSha256);
      if(matches.length!==1||manifests.has(receipt?.artifactSha256))throw new Error('Offline receipt must match exactly one frozen manifest');
      manifests.set(receipt.artifactSha256,matches[0]);
    }
    for(const relative of index.ledgerPaths) {
      if(typeof relative!=='string'||!/^docs\/deliveries\/[a-f0-9]{64}\/ledger\.json$/.test(relative)||seenPaths.has(relative))throw new Error('Unsafe, duplicate or non-frozen offline ledger path');
      seenPaths.add(relative);
      const artifact=relative.split('/')[2],receipt=index.receipts.find(r=>r.artifactSha256===artifact);
      if(!receipt?.content)throw new Error('Frozen offline ledger has no exact content receipt');
      const raw=await readOfflinePublicFile(root,relative),ledger=JSON.parse(raw.toString());
      if(ledger.roundId!==receipt.content.roundId||frozenLedgers.has(ledger.roundId))throw new Error('Frozen offline ledger identity is missing or duplicated');
      frozenLedgers.set(ledger.roundId,raw);ledgerSources.set(ledger.roundId,raw);
    }
    const {validateOfflineContinuation}=await import('./download-fallback.mjs');
    const offline=validateOfflineContinuation(index.receipts,{manifests,ledgers:frozenLedgers,banks:new Map([...banks].map(([version,entry])=>[version,entry.raw])),now,publicationState});
    if(!offline.ok||!(offline.offlineBases instanceof Map))throw new Error(`Invalid offline delivery evidence: ${(offline.errors||[]).join('; ')}`);
    offlineBases=offline.offlineBases;
    const resolution=resolveSynchronizedArtifacts(index.receipts,{synchronizations,ledgers,banks,ledgerSources,now,publicationState});
    if(!resolution.ok)throw new Error(resolution.errors.join('; '));
    resolvedArtifacts=resolution.resolvedArtifacts;
  }
  // A delivered normal backup keeps its original manifests and chain. A separate
  // pinned terminal event may add its exact predecessor before full-history gates.
  const {NORMAL_BACKUP_PATH,NORMAL_BACKUP_PROOF_SHA256,NORMAL_BACKUP_PINS,parseNormalBackupProof,validateNormalBackupContinuation,loadReleaseBackupContinuations,validateReleaseBackupDependencies}=await import('./release-backup-continuation.mjs');
  const modernContinuation=await validateReleaseBackupDependencies(root);
  let normalRaw;
  try {normalRaw=await readOfflinePublicFile(root,NORMAL_BACKUP_PATH);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(!normalRaw&&NORMAL_BACKUP_PROOF_SHA256&&ledgers.some(r=>Date.parse(r.startedAt)>Date.parse('2026-10-04T09:51:07.219995Z')))throw new Error('Missing exact normal-backup offline predecessor proof for successor');
  if(normalRaw) {
    // Ordinary ledger loads also need the real current manifest freeze marker.
    // Do not confuse release:false (output selection) with permission to ignore it.
    const continuationManifest=manifest??JSON.parse(await readOfflinePublicFile(root,'data/manifest.json'));
    const normal=validateNormalBackupContinuation(parseNormalBackupProof(normalRaw),{now,publicationState,manifest:continuationManifest,ledgers,ledgerSources,banks,offlineBases});
    if(normal.offlineBase)offlineBases.set(normal.artifactSha256,normal.offlineBase);
    if(modernContinuation) {
      const continuation=await loadReleaseBackupContinuations(root,{now,publicationState,manifest:continuationManifest,ledgers,ledgerSources,banks,offlineBases,schema,availableFiles,editorials,reviewPackages,synchronizations});
      offlineBases=continuation.offlineBases;deliveryCheckpointSources=continuation.deliveryCheckpointSources;
    }
  }
  if(indexRaw||normalRaw) {
    const complete=validateRoundLedgers(ledgers,{schema,banks,now,publicationState,availableFiles,editorials,offlineBases,ledgerSources,synchronizations,deliveryCheckpointSources});
    const editorial=validateEditorialLedgers(editorials,{ledgers,banks,now,publicationState,availableFiles,reviewPackages,offlineBases,ledgerSources,synchronizations});
    if(!complete.ok||!editorial.ok)throw new Error(`Offline evidence requires the full valid campaign history: ${[...complete.errors,...editorial.errors].join('; ')}`);
  }
  return {ledgers, editorials, schema, banks, reviewPackages, availableFiles, publicationState, manifest, offlineBases, ledgerSources, synchronizations, resolvedArtifacts, deliveryCheckpointSources};
}
export async function main(args = process.argv.slice(2)) {
  let input = null, nextRoundAt = null, release = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--release') { release = true; continue; }
    if (args[i] === '--next-round-at' && args[i + 1] && validDateTime(args[i + 1])) { nextRoundAt = args[++i]; continue; }
    if (!args[i].startsWith('-') && input === null) { input = args[i]; continue; }
    throw new Error('Usage: node scripts/validate-round.mjs [round.json] [--release] [--next-round-at RFC3339]');
  }
  const {ledgers, ...context} = await loadRoundContext(ROOT, input, {release});
  const result = validateRoundLedgers(ledgers, {...context, now: Date.now(), nextRoundAt});
  const editorialResult = validateEditorialLedgers(context.editorials, {...context, ledgers, now: Date.now(), nextRoundAt});
  result.errors.push(...editorialResult.errors); result.ok = result.ok && editorialResult.ok;
  result.editorials = context.editorials.map(e=>({correctionRoundId:e.correctionRoundId,status:e.status,corrections:e.corrections.length,publication:e.publication.status}));
  if (release && result.ok) { const gate = validateReleaseLedger(ledgers, {...context, now:Date.now(), nextRoundAt}); result.errors.push(...gate.errors); result.ok = gate.ok; }
  console.log(JSON.stringify({status: result.ok ? (ledgers.length ? 'PASS' : 'NO_ROUNDS') : 'FAIL', ...result}, null, 2));
  if (!result.ok) process.exitCode = 1;
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(JSON.stringify({status: 'FAIL', errors: [error.message]})); process.exitCode = 1; });
}
