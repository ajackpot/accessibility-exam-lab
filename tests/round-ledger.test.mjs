import {createSyntheticValidator} from './quarantine-fixtures.mjs';
import {validatePublicationSynchronizations,validateIndependentSynchronizationSources} from '../scripts/publication-sync.mjs';
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateJsonSchema, validateReleaseLedger, validateRoundLedger, validateRoundLedgers, regularCoverage, nextScheduledRoundAt, loadRoundContext} from '../scripts/validate-round.mjs';

const syntheticValidator=await createSyntheticValidator();
after(syntheticValidator.cleanup);

const schema = JSON.parse(await fs.readFile(new URL('../docs/rounds/round-ledger.schema.json', import.meta.url), 'utf8'));
const template = JSON.parse(await fs.readFile(new URL('../docs/rounds/round-ledger.template.json', import.meta.url), 'utf8'));
const seedRaw = await fs.readFile(new URL('../data/releases/2026.10.02-seed.4/bank.json', import.meta.url), 'utf8');
const seed = JSON.parse(seedRaw);
const hash = raw => createHash('sha256').update(raw).digest('hex');
const clone = value => structuredClone(value);
const banks = () => new Map([[seed.bankVersion, {raw: seedRaw}]]);
const source = seed.sources[0];
const evidence = () => ({sourceId: source.id, title: source.title, url: source.url, version: source.version, location: source.location, checkedAt: '2026-10-02T05:41:00Z', summary: 'Synthetic fixture evidence summary, not real research.', rights: 'Synthetic test fixture.'});
function candidate(decision = 'accepted') {
  const gates = Object.fromEntries(['blindSolve', 'sourceCheck', 'ambiguityCheck', 'authoringAccessibility', 'structuralCheck'].map(name => [name, {result: 'pass', reviewerId: `reviewer-${name}-1`, summary: 'Synthetic independent test result.', evidenceRefs: [source.id]}]));
  if (decision === 'rejected') gates.structuralCheck.result = 'fail';
  return {candidateId: 'candidate-one', lineageId: 'lineage-one', learningGoalId: 'goal-one', subjectId: 's1', type: 'written', questionId: 'regular-one', revision: 1, templateId: 'template-one', authorId: 'author-one', evidence: [evidence()], attemptCount: 1, lineageAttemptCount: 1, reopenCount: 0, priorCandidateRefs: [], reopeningEvidence: [], cycles: [{cycle: 1, revision: 1, startedAt: '2026-10-02T05:42:00Z', finishedAt: '2026-10-02T05:43:00Z', gates, outcome: decision, summary: 'Synthetic outcome summary.'}], decision, reasonCodes: [decision === 'accepted' ? 'accepted_all_gates' : 'structural_invalid'], decisionSummary: 'Synthetic final conclusion.', publishedBankVersion: null};
}
function round(candidates = [candidate()]) {
  const r = clone(template);
  Object.assign(r, {roundId: 'round-test-001', status: 'closed', closedAt: '2026-10-02T05:45:00Z', candidates, summary: 'Synthetic ledger regression fixture; never a release.'});
  Object.assign(r.baseline, {sourceCommit: 'a'.repeat(40), bankVersion: seed.bankVersion, bankSha256: hash(seedRaw)});
  r.counts.registered = candidates.length;
  for (const decision of ['accepted', 'rejected', 'pending']) r.counts[decision] = candidates.filter(c => c.decision === decision).length;
  r.noGapExplanation = 'This synthetic fixture covers validator behavior only; remaining real content coverage is outside this test.';
  return r;
}
function validate(r, options = {}) { return syntheticValidator.round.validateRoundLedger(r, {schema, banks: banks(), ...options}); }
function passes(r, options) { const result = validate(r, options); assert.equal(result.ok, true, result.errors.join('\n')); return result; }
function fails(r, pattern, options) { const result = validate(r, options); assert.equal(result.ok, false, 'mutation unexpectedly passed'); assert.match(result.errors.join('\n'), pattern); }
function revision(c, outcome, reviewerSuffix = '2') {
  const cycle = clone(c.cycles.at(-1)); cycle.cycle++; cycle.revision++;
  cycle.startedAt = '2026-10-02T05:44:00Z'; cycle.finishedAt = '2026-10-02T05:44:30Z'; cycle.outcome = outcome;
  for (const [name, gate] of Object.entries(cycle.gates)) { gate.result = 'pass'; gate.reviewerId = `reviewer-${name}-${reviewerSuffix}`; }
  c.cycles.push(cycle); c.attemptCount++; c.lineageAttemptCount++; c.revision++;
  return cycle;
}
function publicationFixture() {
  const r = round(), bank = clone(seed), c = r.candidates[0];
  bank.bankVersion = 'fixture-regular.1'; bank.releasedAt = '2026-10-02T05:46:00Z';
  const q = clone(seed.questions.find(q => q.type === 'written' && q.subjectId === 's1'));
  Object.assign(q, {questionId: c.questionId, templateId: c.templateId, revision: c.revision, testOnly: false, sourceRefs: [source.id]});
  q.links = q.links.map(link => { const original = seed.options.find(o => o.optionId === link.optionId), optionId = `fixture-${link.optionId}`; bank.options.push({...clone(original), optionId}); return {...link, optionId, contextExplanation:''}; });
  bank.questions.push(q);
  const raw = JSON.stringify(bank); const entries = banks(); entries.set(bank.bankVersion, {raw});
  r.publication = {status: 'verified', commit: 'b'.repeat(40), bankVersion: bank.bankVersion, bankSha256: hash(raw), verifiedAt: '2026-10-02T05:47:00Z', url: 'https://example.org/fixture/', blockers: []};
  c.publishedBankVersion = bank.bankVersion;
  r.counts.publishedRegularWrittenBySubject.s1 = 1; r.coverageAfter.regularWrittenBySubject.s1 = 1;
  return {r, bank, entries, q};
}
function replaceBank(fixture) { const raw = JSON.stringify(fixture.bank); fixture.entries.set(fixture.bank.bankVersion, {raw}); fixture.r.publication.bankSha256 = hash(raw); }
function reopeningFixture() {
  const first = round([candidate('rejected')]), c = candidate('rejected');
  c.candidateId = 'candidate-reopened'; c.reopenCount = 1; c.revision = 2; c.cycles[0].revision = 2;
  c.priorCandidateRefs = [{roundId: first.roundId, candidateId: first.candidates[0].candidateId, ledgerPath: `docs/rounds/${first.roundId}.json`, attemptCount: 1, decision: 'rejected', reasonCodes: ['structural_invalid'], summary: 'Actual predecessor rejected on first review.'}];
  c.lineageAttemptCount = 2;
  const fresh = {...evidence(), sourceId: 'fresh-source', location: 'New primary-source exception', checkedAt: '2026-10-02T11:01:00Z'};
  c.evidence = [fresh]; c.reopeningEvidence = [clone(fresh)];
  c.cycles[0].startedAt = '2026-10-02T11:02:00Z'; c.cycles[0].finishedAt = '2026-10-02T11:03:00Z';
  for (const [name, g] of Object.entries(c.cycles[0].gates)) { g.reviewerId = `fresh-${name}`; g.evidenceRefs = ['fresh-source']; }
  const second = round([c]); Object.assign(second, {roundId: 'round-test-002', startedAt: '2026-10-02T11:00:00Z', decisionDeadline: '2026-10-02T15:00:00Z', closedAt: '2026-10-02T11:04:00Z'});
  return {first, second, c};
}

test('actual schema applies refs, const, types, conditional gates and formats', () => {
  assert.deepEqual(validateJsonSchema(round(), schema), []);
  for (const mutate of [r => r.policy.maxCycles = 4, r => r.unexpected = true, r => delete r.candidates[0].authorId, r => r.startedAt = '2026-02-30T05:40:00Z', r => r.candidates[0].cycles[0].gates.blindSolve.result = 'not_run', r => r.candidates[0].evidence[0].url = 'file:///tmp/source']) {
    const r = round(); mutate(r); assert.ok(validateJsonSchema(r, schema).length);
  }
});
test('schema evaluator fails closed for unknown keywords even in an untaken branch', () => {
  const changed = clone(schema); changed.allOf.push({if: {const: 'never'}, then: {unevaluatedProperties: false}});
  assert.match(validateJsonSchema(round(), changed).join('\n'), /unsupported schema keyword/);
  assert.deepEqual(validateJsonSchema(['😀'], {type: 'array', uniqueItems: true, items: {type: 'string', minLength: 1}}), []);
  assert.ok(validateJsonSchema([{a: 1, b: 2}, {b: 2, a: 1}], {uniqueItems: true}).length);
});
test('closed accepted-unpublished and zero-attempt rejected decisions are valid', () => {
  const result = passes(round()); assert.ok(result.warnings.some(w => w.includes('do not establish deployment')));
  const c = candidate('rejected'); c.cycles = []; c.attemptCount = c.lineageAttemptCount = 0; c.reasonCodes = ['infrastructure_incomplete']; passes(round([c]));
});
test('counts and attempt count cannot be targets or omit started reviews', () => {
  const r = round(); r.counts.registered = 50; fails(r, /actual count 1/);
  r.counts.registered = 1; r.candidates[0].attemptCount = 2; fails(r, /every started cycle/);
});
test('cycle numbering, final revision and final outcome must agree', () => {
  for (const [mutate, pattern] of [[c => c.cycles[0].cycle = 2, /contiguous/], [c => c.revision = 2, /final revision/], [c => { c.decision = 'rejected'; c.reasonCodes = ['round_deadline']; }, /last cycle outcome/]]) { const r = round(); mutate(r.candidates[0]); fails(r, pattern); }
});
test('revision after terminal outcome cannot revive an accepted/rejected candidate', () => {
  const r = round(); revision(r.candidates[0], 'accepted'); fails(r, /earlier revise/);
});
test('accepted revision is a complete fresh review, not a union of partial gates', () => {
  const c = candidate(); c.cycles[0].outcome = 'revise'; c.cycles[0].gates.structuralCheck.result = 'fail';
  const last = revision(c, 'accepted'); passes(round([c]));
  last.gates.blindSolve.result = 'not_run'; fails(round([c]), /constant "pass"/);
});
test('author and every previously key-visible reviewer are excluded from blind solving', () => {
  const r = round(), c = r.candidates[0]; c.cycles[0].gates.blindSolve.reviewerId = c.authorId; fails(r, /blind reviewer/);
  c.cycles[0].gates.blindSolve.reviewerId = 'blind-original'; c.cycles[0].outcome = 'revise'; c.cycles[0].gates.structuralCheck.result = 'fail';
  const next = revision(c, 'accepted'); next.gates.blindSolve.reviewerId = c.cycles[0].gates.sourceCheck.reviewerId; fails(r, /previously key-visible/);
});
test('evidence references and executed reviewer identities are checked', () => {
  const r = round(); r.candidates[0].cycles[0].gates.sourceCheck.evidenceRefs = ['invented']; fails(r, /unknown evidence/);
  r.candidates[0].cycles[0].gates.sourceCheck.evidenceRefs = []; fails(r, /needs evidence/);
  const rejected = round([candidate('rejected')]); rejected.candidates[0].cycles[0].gates.structuralCheck.reviewerId = null; fails(rejected, /reviewer identity/);
});
test('running cycles count immediately; only the last cycle can be running', () => {
  const c = candidate(); c.decision = 'pending'; c.reasonCodes = []; c.cycles[0].outcome = 'running'; c.cycles[0].finishedAt = null;
  const r = round([c]); r.status = 'running'; r.closedAt = null; passes(r);
  const next = revision(c, 'running'); next.finishedAt = null; fails(r, /only the last cycle|earlier revise/);
});
test('third running cycle is allowed until deadline, but third completed revise is forbidden', () => {
  const c = candidate(); c.cycles[0].outcome = 'revise'; c.cycles[0].gates.structuralCheck.result = 'fail';
  const second = revision(c, 'revise'); second.gates.structuralCheck.result = 'fail';
  const third = revision(c, 'running', '3'); third.startedAt = '2026-10-02T05:44:40Z'; third.finishedAt = null;
  c.decision = 'pending'; c.reasonCodes = [];
  const r = round([c]); r.status = 'running'; r.closedAt = null; passes(r);
  third.outcome = 'revise'; third.finishedAt = '2026-10-02T05:44:50Z'; fails(r, /expected one of|contains/);
});
test('closed rounds cannot leave pending or running candidates', () => {
  const c = candidate(); c.decision = 'pending'; c.reasonCodes = []; c.cycles[0].outcome = 'running'; c.cycles[0].finishedAt = null;
  fails(round([c]), /expected one of|constant 0/);
});
test('four-hour, next scheduled round and freeze bounds cannot be extended', () => {
  const r = round(); r.decisionDeadline = '2026-10-02T09:40:01Z'; fails(r, /four hours/);
  r.decisionDeadline = '2026-10-02T09:40:00Z'; fails(r, /next round/, {nextRoundAt: '2026-10-02T07:00:00Z'});
  assert.equal(nextScheduledRoundAt('2026-10-02T05:40:00Z'), Date.parse('2026-10-02T11:00:00Z'));
  assert.equal(nextScheduledRoundAt('2026-10-16T11:00:00Z'), Date.parse('2026-10-16T14:30:00Z'));
});
test('future evidence/cycles, late closure, expired running status fail', () => {
  const r = round(); r.closedAt = '2026-10-02T10:00:00Z'; fails(r, /closure/);
  r.closedAt = '2026-10-02T05:45:00Z'; r.candidates[0].evidence[0].checkedAt = '2026-10-02T05:44:00Z'; fails(r, /checked after this gate/);
  const running = round([]); running.status = 'running'; running.closedAt = null; fails(running, /deadline reached/, {now: Date.parse('2026-10-02T09:40:00Z')});
});
test('cross-ledger identifiers and overlapping rounds cannot reset histories', () => {
  const a = round(), b = round([]); b.roundId = 'round-test-002'; b.startedAt = '2026-10-02T06:00:00Z'; b.closedAt = '2026-10-02T06:10:00Z'; b.decisionDeadline = '2026-10-02T10:00:00Z';
  const result = validateRoundLedgers([a, b], {banks: banks()}); assert.match(result.errors.join('\n'), /overlapping/);
  assert.match(validateRoundLedgers([a, clone(a)], {banks: banks()}).errors.join('\n'), /duplicate roundId|duplicate campaign candidateId/);
});
test('one reopening links actual rejection, attempts, same lineage and genuinely different evidence tuple', () => {
  const f = reopeningFixture(); passes(f.second, {otherLedgers: [f.first]});
  f.c.lineageAttemptCount = 1; fails(f.second, /actual predecessor cycles/, {otherLedgers: [f.first]});
  f.c.lineageAttemptCount = 2; f.c.priorCandidateRefs[0].attemptCount = 3; fails(f.second, /misstates actual review history/, {otherLedgers: [f.first]});
});
test('reopening cannot reread old evidence or reuse a previous key-visible reviewer', () => {
  const f = reopeningFixture(); f.c.reopeningEvidence[0].location = source.location; f.c.evidence[0].location = source.location;
  fails(f.second, /rereads/, {otherLedgers: [f.first]});
  const g = reopeningFixture(); g.c.cycles[0].gates.blindSolve.reviewerId = g.first.candidates[0].cycles[0].gates.ambiguityCheck.reviewerId;
  fails(g.second, /previously key-visible/, {otherLedgers: [g.first]});
});
test('renamed IDs and a second reopening cannot bypass campaign cap', () => {
  const f = reopeningFixture(); f.c.lineageId = 'new-lineage'; fails(f.second, /resets lineageId/, {otherLedgers: [f.first]});
  const g = reopeningFixture(), third = clone(g.second); third.roundId = 'round-test-003'; third.candidates[0].candidateId = 'third-candidate';
  assert.match(validateRoundLedgers([g.first, g.second, third], {banks: banks()}).errors.join('\n'), /exceeds one reopening/);
});
test('missing predecessor and unsafe prior path fail closed', () => {
  const f = reopeningFixture(); fails(f.second, /missing campaign predecessor/);
  f.c.priorCandidateRefs[0].ledgerPath = '../round.json'; fails(f.second, /actual predecessor ledger/, {otherLedgers: [f.first]});
});
test('hash checks use actual immutable bytes and reject missing or dishonest parsed banks', () => {
  const r = round(); fails(r, /missing immutable bank/, {banks: new Map()});
  r.baseline.bankSha256 = 'c'.repeat(64); fails(r, /hash mismatch/);
  const entries = banks(); entries.set(seed.bankVersion, {raw: seedRaw, bank: {...seed, bankVersion: 'lie'}}); fails(round(), /parsed bank does not match/, {banks: entries});
});
test('verified new bank counts only accepted regular published new templates', () => {
  const f = publicationFixture(); passes(f.r, {banks: f.entries});
  f.r.counts.publishedRegularWrittenBySubject.s1 = 10; fails(f.r, /new public counts/, {banks: f.entries});
});
test('commit-only and blocked publication cannot claim public counts or a published candidate', () => {
  const f = publicationFixture(); f.r.publication.status = 'committed_unverified'; f.r.publication.verifiedAt = null;
  fails(f.r, /publishedBankVersion null|new public counts/, {banks: f.entries});
  const r = round(); r.publication.status = 'blocked'; r.publication.blockers = ['Hosting not verified.']; passes(r);
});
test('publication hash, source identities and seed preservation cannot be falsified', () => {
  const f = publicationFixture(); f.r.publication.bankSha256 = 'd'.repeat(64); fails(f.r, /published bank hash mismatch/, {banks: f.entries});
  const g = publicationFixture(); g.bank.questions[0].testOnly = false; replaceBank(g); fails(g.r, /existing question changed/, {banks: g.entries});
  const h = publicationFixture(); h.r.candidates[0].evidence[0].location = 'Unreviewed substitute'; fails(h.r, /bank source differs/, {banks: h.entries});
});
test('seed templates and duplicate variants cannot inflate regular publication', () => {
  const f = publicationFixture(); f.q.templateId = seed.questions[0].templateId; f.r.candidates[0].templateId = f.q.templateId; replaceBank(f);
  fails(f.r, /duplicate\/seed template/, {banks: f.entries});
});
test('verified timestamp must follow closure, be real and precede freeze', () => {
  const f = publicationFixture(); f.r.publication.verifiedAt = '2026-10-02T05:44:00Z'; fails(f.r, /verification must follow closure/, {banks: f.entries});
  f.r.publication.verifiedAt = '2026-10-16T15:00:00Z'; fails(f.r, /precede final freeze/, {banks: f.entries});
});
test('coverage is recomputed and five-choice capability is required in every subject', () => {
  const r = round(); r.coverageAfter.mockEligible = true; fails(r, /coverage\/mock eligibility/);
  const bank = clone(seed); bank.questions = [];
  for (const subject of ['s1', 's2', 's3', 's4', 's5']) for (let i = 0; i < 20; i++) {
    const q = clone(seed.questions.find(q => q.type === 'written' && q.subjectId === subject)); q.testOnly = false; q.questionId = `${subject}-${i}`; q.templateId = `${subject}-${i}`; bank.questions.push(q);
  }
  assert.equal(regularCoverage(bank).mockEligible, true);
  bank.questions.at(-1).supportedOptionCounts = [4]; assert.equal(regularCoverage(bank).mockEligible, false);
  bank.questions.push(clone(bank.questions[0])); assert.equal(regularCoverage(bank).regularWrittenBySubject.s1, 20);
});
test('closed gaps require concrete plans, valid candidate refs, no automatic reopening', () => {
  const r = round(); r.noGapExplanation = '완료'; fails(r, /no-gap explanation/);
  r.nextRoundGaps = [{gapId: 'gap-one', category: 'coverage', subjectIds: ['s1'], learningGoalIds: ['goal-one'], candidateIds: ['candidate-one'], finding: 'Specific missing primary exception.', neededEvidenceOrCounterexample: 'Open the precise versioned exception.', nextAction: 'Find an original source with this exception.', completionCriterion: 'Document the exact source condition.', priority: 'high', reopenEligible: true}];
  fails(r, /cannot be marked reopenEligible/);
  r.nextRoundGaps[0].reopenEligible = false; passes(r);
  r.nextRoundGaps[0].candidateIds = ['unknown']; fails(r, /unknown\/future gap/);
});
test('blank summaries, placeholders and missing/unsafe public reports are rejected', () => {
  const r = round(); r.summary = '  '; fails(r, /blank-only/);
  r.summary = 'REPLACE-RESULT'; fails(r, /placeholder/);
  const s = round(); s.validation = [{check: 'structure', result: 'pass', summary: 'Synthetic validation.', reportPath: '../private.md'}]; fails(s, /unsafe reportPath/);
  fails(round(), /missing its public Markdown report/, {availableFiles: new Set()});
});
test('CLI context reads every ledger, excludes schema/template, and never falls back from a missing bank', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'round-ledger-test-')); t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.mkdir(path.join(root, 'docs/rounds'), {recursive: true}); await fs.mkdir(path.join(root, 'data'), {recursive: true});
  const r = round();
  for (const [file, value] of [['docs/rounds/round-ledger.schema.json', schema], ['docs/rounds/round-ledger.template.json', template], [`docs/rounds/${r.roundId}.json`, r], ['data/publication-state.json', {finalized: false}]]) await fs.writeFile(path.join(root, file), JSON.stringify(value));
  await fs.writeFile(path.join(root, `docs/rounds/${r.roundId}.md`), 'Synthetic report.');
  await fs.cp(new URL('../docs/publications',import.meta.url),path.join(root,'docs/publications'),{recursive:true});
  await fs.writeFile(path.join(root,'PUBLICATION-MANIFEST.txt'),['PUBLICATION-MANIFEST.txt',...(await fs.readdir(path.join(root,'docs/publications'))).map(p=>'docs/publications/'+p)].join('\n')+'\n');
  const context = await loadRoundContext(root,null,{now:Date.parse('2026-10-02T05:50:00Z')}); assert.equal(context.ledgers.length, 1); assert.equal(context.banks.size, 0);
  assert.match(validateRoundLedgers(context.ledgers, context).errors.join('\n'), /missing immutable bank/);
  // Later event bytes remain authenticated, but this explicit Oct2 read cannot
  // resolve them or demand sources that are unrelated to its one-ledger subset.
  const at=Date.parse('2026-10-02T05:50:00Z'),future=context.synchronizations.find(e=>e.rounds.some(s=>s.deliveryProof?.path.startsWith('docs/deliveries/chains/')));
  assert.ok(future);assert.equal(context.resolvedArtifacts.size,0);assert.equal(context.independentOfflineChains.size,0);
  const history=validatePublicationSynchronizations(context.synchronizations,{...context,now:at});assert.equal(history.ok,true,history.errors.join('\n'));assert.deepEqual(history.history,[]);
  const membership=options=>validateIndependentSynchronizationSources(context.synchronizations,context.independentOfflineChains,context.deliveryCheckpointSources,options);
  for(const options of [undefined,{ledgers:context.ledgers,release:false},{ledgers:context.ledgers,now:Date.parse(future.verifiedAt),release:false},{ledgers:context.ledgers,now:at,release:true},{ledgers:future.rounds.map(s=>({roundId:s.roundId})),now:at,release:false},{ledgers:[{roundId:'later-fixture',startedAt:future.verifiedAt}],now:at,release:false}])await assert.rejects(membership(options),/synchronization delivery proof/);
  const file=path.join(root,`docs/publications/${future.syncId}.json`),original=await fs.readFile(file);await fs.appendFile(file,' ');
  await assert.rejects(loadRoundContext(root,null,{now:at}),/proof hash/);await fs.writeFile(file,original);

});

function manifestFor(f) { return {schemaVersion: 1, finalRelease: false, changeSummary: f.bank.changeSummary, bankVersion: f.bank.bankVersion, releasedAt: f.bank.releasedAt, file: `releases/${f.bank.bankVersion}/bank.json`, sha256: f.r.publication.bankSha256}; }
test('release gate requires closed explicit ledger and all-gates-pass accepted additions', () => {
  const f = publicationFixture(); const options = {manifest: manifestFor(f), banks: f.entries};
  assert.equal(validateReleaseLedger([f.r], options).ok, true);
  f.r.status = 'running'; assert.match(validateReleaseLedger([f.r], options).errors.join('\n'), /closed ledger/);
  f.r.status = 'closed'; f.r.candidates[0].cycles[0].gates.blindSolve.result = 'not_run';
  assert.match(validateReleaseLedger([f.r], options).errors.join('\n'), /all-gates-pass/);
});
test('release gate permits accepted staged decisions without pretending hosted verification', () => {
  const f = publicationFixture(); f.r.publication.status = 'not_attempted'; f.r.publication.verifiedAt = null; f.r.publication.commit = null; f.r.publication.url = null;
  f.r.candidates[0].publishedBankVersion = null; f.r.counts.publishedRegularWrittenBySubject.s1 = 0; f.r.coverageAfter.regularWrittenBySubject.s1 = 0;
  passes(f.r, {banks: f.entries}); assert.equal(validateReleaseLedger([f.r], {manifest: manifestFor(f), banks: f.entries}).ok, true);
  f.r.publication.bankVersion = null; assert.match(validateReleaseLedger([f.r], {manifest: manifestFor(f), banks: f.entries}).errors.join('\n'), /explicit publication.bankVersion/);
});
test('release gate accepts historical seed-only active bank but rejects manifest tampering', () => {
  const manifest = {schemaVersion: 1, finalRelease: false, changeSummary: seed.changeSummary, bankVersion: seed.bankVersion, releasedAt: seed.releasedAt, file: `releases/${seed.bankVersion}/bank.json`, sha256: hash(seedRaw)};
  assert.equal(validateReleaseLedger([], {manifest, banks: banks()}).ok, true);
  manifest.sha256 = 'e'.repeat(64); assert.equal(validateReleaseLedger([], {manifest, banks: banks()}).ok, false);
});
test('later valid reopening does not retroactively invalidate a prior gap plan', () => {
  const f = reopeningFixture(); f.first.nextRoundGaps = [{gapId: 'prior-gap', category: 'primary_evidence', subjectIds: ['s1'], learningGoalIds: ['goal-one'], candidateIds: ['candidate-one'], finding: 'An unresolved original exception needs research.', neededEvidenceOrCounterexample: 'Locate a new authoritative source addressing the failed condition.', nextAction: 'Research the missing primary exception.', completionCriterion: 'New primary evidence resolves the original rejection.', priority: 'high', reopenEligible: true}];
  passes(f.second, {otherLedgers: [f.first]});
});

test('release gate rejects malformed manifest envelope instead of coercing or repairing it', () => {
  const f = publicationFixture(), original = manifestFor(f);
  for (const mutation of [{schemaVersion: 2}, {schemaVersion: undefined}, {finalRelease: 'false'}, {finalRelease: undefined}, {finalRelease: 0}, {changeSummary: null}, {changeSummary: ''}, {changeSummary: 'different summary'}]) {
    const manifest = {...original, ...mutation};
    assert.equal(validateReleaseLedger([f.r], {manifest, banks: f.entries}).ok, false, JSON.stringify(mutation));
  }
});

test('final-day candidate decisions must close by 23:00 KST before the 23:30 finalizer', () => {
  const r = round([]);
  r.startedAt = '2026-10-16T11:00:00Z';
  r.decisionDeadline = '2026-10-16T14:00:00Z';
  r.closedAt = '2026-10-16T14:00:00Z';
  passes(r);
  r.decisionDeadline = '2026-10-16T14:00:00.001Z';
  fails(r, /final-day 23:00 KST decision cutoff/);
  r.startedAt = '2026-10-16T14:10:00Z';
  r.decisionDeadline = '2026-10-16T14:20:00Z';
  r.closedAt = '2026-10-16T14:15:00Z';
  fails(r, /final-day 23:00 KST decision cutoff/);
});

test('ordinary staged release cannot predate closed decisions or use a future actual timestamp',()=>{
 for(const releasedAt of ['2026-10-02T05:44:59Z','2026-10-02T05:50:00Z']){
  const f=publicationFixture();f.bank.releasedAt=releasedAt;replaceBank(f);
  const result=validateReleaseLedger([f.r],{manifest:manifestFor(f),banks:f.entries,now:Date.parse('2026-10-02T05:49:00Z')});
  assert.equal(result.ok,false);assert.match(result.errors.join('\n'),/after decision closure|current time/);
 }
 const f=publicationFixture();f.bank.releasedAt='2026-10-02T05:50:00Z';replaceBank(f);
 const historical=validateReleaseLedger([f.r],{manifest:manifestFor(f),banks:f.entries});
 assert.equal(historical.ok,true,historical.errors.join('\n'));
});
test('verified ordinary history requires its bank to follow final decision closure',()=>{
 const f=publicationFixture();f.bank.releasedAt='2026-10-02T05:44:59Z';replaceBank(f);
 const result=validateRoundLedger(f.r,{schema,banks:f.entries,now:Date.parse('2026-10-02T06:00:00Z')});
 assert.equal(result.ok,false);assert.match(result.errors.join('\n'),/follow decision closure/);
});
