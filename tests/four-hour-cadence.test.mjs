import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {CAMPAIGN_SCHEDULE_VERSIONS, FOUR_HOUR_CADENCE_AT, FINAL_DECISION_AT, nextScheduledRoundAt, validateRoundLedgers, validateEditorialLedgers, validateReleaseLedger, loadRoundContext, regularCoverage} from '../scripts/validate-round.mjs';
import {FREEZE_AT} from '../src/domain.js';

// Synthetic schedule fixtures never claim content review or actual publication.
const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const template = JSON.parse(read('docs/rounds/round-ledger.template.json'));
const seedRaw = read('data/releases/2026.10.02-seed.4/bank.json');
const seed = JSON.parse(seedRaw), banks = new Map([[seed.bankVersion, {raw: seedRaw}]]);
const iso = value => new Date(value).toISOString();
function round(start = '2026-10-03T00:00:00+09:00', id = 'round-003', deadline = nextScheduledRoundAt(start)) {
  const r = structuredClone(template);
  Object.assign(r, {roundId: id, status: 'closed', startedAt: iso(Date.parse(start)), decisionDeadline: iso(deadline), closedAt: iso(Date.parse(start) + 60000), summary: 'Synthetic four-hour schedule test; no publication.', noGapExplanation: 'This zero-candidate synthetic fixture tests schedule limits, not real content coverage.'});
  Object.assign(r.baseline, {sourceCommit: 'a'.repeat(40), bankVersion: seed.bankVersion, bankSha256: hash(seedRaw)});
  return r;
}
function result(rounds, options = {}) { return validateRoundLedgers(rounds, {banks, ...options}); }
function pass(rounds, options) { const r = result(rounds, options); assert.equal(r.ok, true, r.errors.join('\n')); }
function fail(rounds, pattern, options) { const r = result(rounds, options); assert.equal(r.ok, false, 'invalid schedule passed'); assert.match(r.errors.join('\n'), pattern); }
async function historicalContext() {
  const context = await loadRoundContext(fileURLToPath(root));
  // Pin only the transition's real predecessors so later expansions do not turn
  // this historical regression into a stale-current-bank or future-clock test.
  const activeRaw = context.banks.get('2026.10.02-regular.2').raw, bank = JSON.parse(activeRaw.toString());
  return {...context,
    ledgers: context.ledgers.filter(r => ['round-001', 'round-002'].includes(r.roundId)),
    editorials: context.editorials.filter(e => e.correctionRoundId === 'editorial-001'),
    publicationState: {finalized: false},
    manifest: {schemaVersion: 1, bankVersion: bank.bankVersion, releasedAt: bank.releasedAt, file: `releases/${bank.bankVersion}/bank.json`, sha256: hash(activeRaw), changeSummary: bank.changeSummary, finalRelease: false}
  };
}

test('schedule versions switch at midnight KST without moving the old Oct 2 bounds', () => {
  assert.equal(FOUR_HOUR_CADENCE_AT, Date.parse('2026-10-02T15:00:00Z'));
  assert.deepEqual(CAMPAIGN_SCHEDULE_VERSIONS.map(v => v.version), ['legacy-12h', 'four-hour-v2']);
  assert.equal(CAMPAIGN_SCHEDULE_VERSIONS[0].effectiveUntil, FOUR_HOUR_CADENCE_AT);
  assert.equal(CAMPAIGN_SCHEDULE_VERSIONS[1].effectiveFrom, FOUR_HOUR_CADENCE_AT);
  for (const start of ['2026-10-02T05:40:00Z', '2026-10-02T10:30:00Z', '2026-10-02T10:59:59Z']) assert.equal(nextScheduledRoundAt(start), Date.parse('2026-10-02T11:00:00Z'));
  for (const start of ['2026-10-02T11:00:00Z', '2026-10-02T14:59:59.999Z']) assert.equal(nextScheduledRoundAt(start), FOUR_HOUR_CADENCE_AT);
  assert.equal(nextScheduledRoundAt('2026-10-03T00:00:00+09:00'), Date.parse('2026-10-02T19:00:00Z'));
  assert.ok(Number.isNaN(nextScheduledRoundAt('not-a-timestamp')));
});

test('all 84 four-hour occurrences use the six KST clock hours through Oct 16 20:00', () => {
  const starts = [];
  for (let day = 3; day <= 16; day++) for (const hour of [0, 4, 8, 12, 16, 20]) starts.push(Date.parse(`2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+09:00`));
  assert.equal(starts.length, 84);
  for (let i = 0; i < starts.length; i++) {
    assert.equal(nextScheduledRoundAt(iso(starts[i] - 1)), starts[i]);
    const next = i === starts.length - 1 ? Date.parse('2026-10-16T23:30:00+09:00') : starts[i + 1];
    assert.equal(nextScheduledRoundAt(iso(starts[i])), next);
    pass([round(iso(starts[i]), `round-fixture-${i}`, Math.min(starts[i] + 4 * 3600000, next, FINAL_DECISION_AT))]);
  }
});

test('a delayed start cannot carry a four-hour deadline past the next nominal occurrence', () => {
  const r = round('2026-10-03T02:00:00+09:00');
  pass([r]);
  r.decisionDeadline = '2026-10-03T04:00:00.001+09:00';
  fail([r], /next round/);
  r.decisionDeadline = '2026-10-03T06:00:00+09:00';
  fail([r], /next round/);
});

test('the next four-hour slot is available but early closure cannot create duplicate occurrences', () => {
  const first = round(); first.decisionDeadline = '2026-10-03T01:00:00+09:00';
  const repeated = round('2026-10-03T01:00:00+09:00', 'renamed-round');
  fail([first, repeated], /four-hour occurrence already consumed/);
  const next = round('2026-10-03T04:00:00+09:00', 'round-004');
  pass([first, next]);
  fail([first, {...structuredClone(first), roundId: 'duplicate-at-midnight'}], /four-hour occurrence already consumed/);
});

test('four-hour, earlier-next, current-clock, persistent-freeze and cycle caps still apply', () => {
  const r = round(); r.decisionDeadline = '2026-10-03T04:00:00.001+09:00'; fail([r], /four hours/);
  fail([round()], /next round/, {nextRoundAt: '2026-10-03T03:00:00+09:00'});
  pass([round()], {nextRoundAt: '2026-10-03T12:00:00+09:00'});
  fail([round()], /future/, {now: FOUR_HOUR_CADENCE_AT - 1});
  const running = round(); running.status = 'running'; running.closedAt = null;
  fail([running], /deadline reached/, {now: Date.parse(running.decisionDeadline)});
  fail([running], /persistent early freeze/, {publicationState: {finalized: true, finalizedAt: '2026-10-03T03:00:00+09:00'}});
  const policy = round(); policy.policy.maxCycles = 4; fail([policy], /constant 3/);
  policy.policy.maxCycles = 3; policy.policy.maxRoundHours = 5; fail([policy], /constant 4/);
});

test('the last regular round retains 23:00 decisions, 23:30 finalizer and midnight freeze', () => {
  const r = round('2026-10-16T20:00:00+09:00', 'round-final-fixture', FINAL_DECISION_AT);
  pass([r]);
  r.decisionDeadline = '2026-10-16T23:00:00.001+09:00'; fail([r], /23:00 KST/);
  assert.equal(nextScheduledRoundAt(r.startedAt), Date.parse('2026-10-16T23:30:00+09:00'));
  assert.equal(nextScheduledRoundAt('2026-10-16T23:30:00+09:00'), FREEZE_AT);
  assert.equal(FREEZE_AT, Date.parse('2026-10-17T00:00:00+09:00'));
  fail([round('2026-10-16T23:30:00+09:00', 'not-a-content-round', FREEZE_AT)], /23:00 KST/);
  fail([round('2026-10-17T00:00:00+09:00', 'after-freeze', FREEZE_AT + 60000)], /at or after final freeze/);
});

test('the published round and editorial history remains byte-identical and passes the new guard', async () => {
  const expected = {
    'docs/rounds/round-001.json': 'c75d8afae8bb42ee8892e6c755585d7d6240be0e004e7c2078af2e568424ecea',
    'docs/rounds/round-001.md': '32009e6899c5e79eb26b53926969804eb0f27ef113f1501dc2b788a850226e56',
    'docs/rounds/round-002.json': 'c17964b6914eda23559f2c1435a6f0113a767ae8ecf7e7637ad1dca2269affda',
    'docs/rounds/round-002.md': '0297f7c619b5bb720a89e8116e12e9455d3b5c2e64ef9a2e2d526a71f6f09996',
    'docs/corrections/editorial-001.json': '9c8687564fa07f3bb78409cbb42cd0e7ad366c707c6fd4582945c51b776fb7aa',
    'docs/corrections/editorial-001.md': 'b84f8a8f3db4b0fe469ac5665f9288595a88882284d1fb42d5d02ff2b83b06f4',
    'docs/corrections/evidence/editorial-001-cycle-1.json': 'ce9fc9dc9d5dc93f03eda4dce2d566f2c732ad53858d29ba62e32fbc6460a2c4',
    'docs/corrections/evidence/editorial-001-cycle-2.json': '045a2312d707e1358e12a85b774ad34e2f7352e91cd72771195eddf5fcc52a22',
    'data/releases/2026.10.02-regular.2/bank.json': 'c79139eaee12943dc65b8cbcaeda37b62254b379ef367ab9a57c2fded3beed54'
  };
  for (const [file, sha256] of Object.entries(expected)) assert.equal(hash(read(file)), sha256, file);
  const context = await historicalContext();
  const history = validateReleaseLedger(context.ledgers, {...context, now: Date.parse('2026-10-02T14:00:00Z')});
  assert.equal(history.ok, true, history.errors.join('\n'));
});

test('round-003 at midnight follows the actual round-002 without rewriting any historical record', async () => {
  const context = await historicalContext();
  const activeRaw = context.banks.get('2026.10.02-regular.2').raw;
  const coverage = regularCoverage(JSON.parse(activeRaw.toString()));
  const r = round();
  Object.assign(r.baseline, {bankVersion: '2026.10.02-regular.2', bankSha256: hash(activeRaw), regularWrittenBySubject: coverage.regularWrittenBySubject, regularPractical: coverage.regularPractical});
  r.coverageAfter = coverage;
  const checked = validateRoundLedgers([...context.ledgers, r], {...context, availableFiles: null, now: FOUR_HOUR_CADENCE_AT + 120000});
  assert.equal(checked.ok, true, checked.errors.join('\n'));
});

test('editorial review shares the effective four-hour bound without changing historical ledgers', async () => {
  const context = await historicalContext();
  const activeRaw = context.banks.get('2026.10.02-regular.2').raw, coverage = regularCoverage(JSON.parse(activeRaw.toString()));
  const e = structuredClone(context.editorials[0]);
  Object.assign(e, {correctionRoundId: 'editorial-four-hour-fixture', startedAt: '2026-10-03T02:00:00+09:00', decisionDeadline: '2026-10-03T04:00:00+09:00', closedAt: '2026-10-03T02:01:00+09:00', changedQuestionIds: [], changedOptionIds: [], changedPracticalChoiceIds: [], corrections: [], counts: {registered: 0, accepted: 0, rejected: 0, pending: 0, newRegular: 0, revisedRegular: 0, publishedRevisedRegular: 0}, coverageAfter: coverage, publication: {status: 'not_attempted', commit: null, bankVersion: null, bankSha256: null, verifiedAt: null, url: null, blockers: []}, validation: [], summary: 'Synthetic empty editorial schedule fixture; no content or publication.'});
  Object.assign(e.baseline, {bankVersion: '2026.10.02-regular.2', bankSha256: hash(activeRaw), regularWrittenBySubject: coverage.regularWrittenBySubject, regularPractical: coverage.regularPractical});
  const check = () => validateEditorialLedgers([...context.editorials, e], {...context, availableFiles: null});
  const valid = check(); assert.equal(valid.ok, true, valid.errors.join('\n'));
  e.decisionDeadline = '2026-10-03T04:00:00.001+09:00';
  const invalid = check(); assert.equal(invalid.ok, false); assert.match(invalid.errors.join('\n'), /next round/);
});
