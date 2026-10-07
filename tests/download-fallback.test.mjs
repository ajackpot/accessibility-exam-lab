import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {GIT_PERMISSION_TIMEOUT_MS, startGitPermissionWait, advanceGitPermissionWait, assertGitWriteAllowed, reconcileGitOutcome, safePublicPath, parsePublicAllowlist, freezePublicDelta, writeDownloadZip, createDeliveryReceipt, validateDeliveryChain, samePublicDelta} from '../scripts/download-fallback.mjs';
const begin = Date.parse('2026-10-04T00:00:00Z'), deadline = begin + GIT_PERMISSION_TIMEOUT_MS, now = deadline + 1000;
const iso = n => new Date(n).toISOString();
const digest = raw => createHash('sha256').update(raw).digest('hex');
const commit = 'a'.repeat(40), expectedCommit = 'b'.repeat(40);
const waiting = () => startGitPermissionWait({roundId: 'round-006', executionId: 'round-006-main', notifiedAt: iso(begin), provider: 'git'});
const timedOut = () => advanceGitPermissionWait(waiting(), {now: deadline});
const outcome = () => reconcileGitOutcome({baseCommit: commit, observedHead: commit, observedAt: iso(now), refWrite: 'not_submitted', objects: 'none'});

test('10-minute wall clock starts at actual notification, with short polling and terminal expiry', () => {
  assert.equal(advanceGitPermissionWait(waiting(), {now: deadline - 1}).state, 'permission_wait');
  assert.equal(advanceGitPermissionWait(waiting(), {now: begin}).nextPollMs, 1000);
  assert.equal(advanceGitPermissionWait(waiting(), {now: deadline - 1}).nextPollMs, 1);
  assert.equal(timedOut().state, 'download_only');
  assert.equal(advanceGitPermissionWait(timedOut(), {now: now + 1000, response: 'approved'}).state, 'download_only');
  assert.equal(advanceGitPermissionWait(waiting(), {now: deadline, response: 'approved'}).state, 'download_only');
  assert.throws(() => assertGitWriteAllowed(timedOut(), {now}), /No further Git writes/);
});
test('approval before expiry still obeys final freeze and denial does not become timeout', () => {
  const approved = advanceGitPermissionWait(waiting(), {now: begin + 1, response: 'approved'});
  assert.equal(assertGitWriteAllowed(approved, {now, releasedAt: iso(begin)}), true);
  assert.throws(() => assertGitWriteAllowed(approved, {now, releasedAt: iso(begin), finalized: true}), /freeze/);
  assert.throws(() => assertGitWriteAllowed(approved, {now: Date.parse('2026-10-16T15:00:00Z'), releasedAt: iso(begin)}), /cutoff/);
  const denied = advanceGitPermissionWait(waiting(), {now: begin, response: 'denied'});
  assert.equal(advanceGitPermissionWait(denied, {now}).state, 'permission_denied');
  assert.throws(() => startGitPermissionWait({roundId: 'round-006', notifiedAt: iso(begin), provider: 'library'}), /Git permission/);
  assert.throws(() => startGitPermissionWait({roundId: 'round-005', notifiedAt: iso(begin), provider: 'git', alreadyVerified: true}), /unpublished/);
});
test('cancelled elicitation plus base head cannot settle a pending write', () => {
  const props = {baseCommit: commit, observedHead: commit, expectedCommit, observedAt: iso(now), cancellation: 'cancelled', objects: 'unknown'};
  assert.equal(reconcileGitOutcome({...props, refWrite: 'pending'}).refStatus, 'unknown');
  assert.equal(reconcileGitOutcome({...props, refWrite: 'unknown'}).refStatus, 'unknown');
  assert.equal(reconcileGitOutcome({...props, refWrite: 'settled_failed'}).refStatus, 'unchanged');
  assert.equal(reconcileGitOutcome({...props, observedHead: expectedCommit, refWrite: 'unknown'}).refStatus, 'applied');
  assert.equal(reconcileGitOutcome({...props, observedHead: 'c'.repeat(40), refWrite: 'settled_failed'}).refStatus, 'changed_other');
});
test('safe paths reject traversal, absolute paths, case aliases, secrets and Windows special names', () => {
  for (const name of ['../x', '/tmp/x', 'x\\y', 'x//y', '.git/config', 'docs/private/x', 'backups/u.json', 'raw-logs/x', 'x/CON.txt', 'x/a.', 'x/a:b', 'x/./a']) assert.equal(safePublicPath(name), false, name);
  assert.equal(safePublicPath('docs/rounds/round-006.json'), true);
  assert.equal(safePublicPath('src/backup.js'), true);
  assert.equal(safePublicPath('backup.json'), false);
  assert.throws(() => parsePublicAllowlist('README.md\nreadme.md\n'), /colliding/);
});
async function fixture(t, extra = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fallback-test-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const baseRoot = path.join(root, 'base'), workRoot = path.join(root, 'work');
  const initial = {'README.md': 'old\n', 'docs/old.md': 'unchanged\n', ...extra};
  initial['PUBLICATION-MANIFEST.txt'] = Object.keys(initial).concat('PUBLICATION-MANIFEST.txt').join('\n') + '\n';
  for (const dir of [baseRoot, workRoot]) for (const [name, raw] of Object.entries(initial)) { await fs.mkdir(path.dirname(path.join(dir, name)), {recursive: true}); await fs.writeFile(path.join(dir, name), raw); }
  await fs.writeFile(path.join(workRoot, 'README.md'), 'new\n');
  await fs.mkdir(path.join(workRoot, 'private')); await fs.writeFile(path.join(workRoot, 'private/secret.txt'), 'not public');
  const plan = {baseRoot, workRoot, baseCommit: commit, baseVerifiedAt: iso(begin - 1000), baseInventory: Object.entries(initial).map(([name, raw]) => ({path: name, sha256: digest(raw)})), reviewedSha256: {'README.md': digest('new\n')}, wait: timedOut(), gitOutcome: outcome(), now};
  return {root, initial, plan};
}
test('freeze includes only exact reviewed changed files and ZIP preserves paths', async t => {
  const {root, plan} = await fixture(t);
  const snapshot = await freezePublicDelta(plan);
  assert.deepEqual(snapshot.files.map(f => f.path), ['README.md']);
  assert.equal(snapshot.manifest.newlyPublishedRegular, 0);
  await assert.rejects(writeDownloadZip(snapshot, path.join(root, 'late.zip'), {now: Date.parse('2026-10-16T15:00:00Z')}), /cutoff blocks creating a new ZIP/);
  const output = path.join(root, 'round.zip'), artifact = await writeDownloadZip(snapshot, output);
  assert.equal(artifact.sha256, digest(await fs.readFile(output)));
  const listing = JSON.parse(execFileSync('python3', ['-c', 'import zipfile,json,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(json.dumps(z.namelist()))', output], {encoding: 'utf8'}));
  assert.deepEqual(listing, ['manifest.json', 'APPLY-KO.txt', 'files/README.md']);
  await assert.rejects(writeDownloadZip(snapshot, output), /EEXIST/);
  snapshot.files[0].raw[0] ^= 1;
  await assert.rejects(writeDownloadZip(snapshot, path.join(root, 'bad.zip')), /Frozen file bytes/);
});
test('a new allowlisted file and directory is included only with the exact reviewed allowlist', async t => {
  const {plan} = await fixture(t);
  await fs.writeFile(path.join(plan.workRoot, 'docs/new.md'), 'new document\n');
  await fs.appendFile(path.join(plan.workRoot, 'PUBLICATION-MANIFEST.txt'), 'docs/new.md\n');
  plan.reviewedSha256['docs/new.md'] = digest('new document\n');
  plan.reviewedSha256['PUBLICATION-MANIFEST.txt'] = digest(await fs.readFile(path.join(plan.workRoot, 'PUBLICATION-MANIFEST.txt')));
  const snapshot = await freezePublicDelta(plan);
  assert.equal(snapshot.files.find(f => f.path === 'docs/new.md').beforeSha256, null);
  delete plan.reviewedSha256['docs/new.md'];
  await assert.rejects(freezePublicDelta(plan), /lacks exact reviewed hash/);
});
test('deletions are explicit manifest entries without payload; historic banks cannot change', async t => {
  const {plan} = await fixture(t, {'data/releases/old/bank.json': '{"old":true}\n'});
  await fs.unlink(path.join(plan.workRoot, 'docs/old.md'));
  plan.reviewedSha256['docs/old.md'] = null;
  const allowPath = path.join(plan.workRoot, 'PUBLICATION-MANIFEST.txt');
  await fs.writeFile(allowPath, (await fs.readFile(allowPath, 'utf8')).replace('docs/old.md\n', ''));
  plan.reviewedSha256['PUBLICATION-MANIFEST.txt'] = digest(await fs.readFile(allowPath));
  const snapshot = await freezePublicDelta(plan);
  assert.equal(snapshot.manifest.deletions[0].path, 'docs/old.md');
  assert.equal(snapshot.manifest.deletions[0].beforeSha256, digest('unchanged\n'));
  await fs.writeFile(path.join(plan.workRoot, 'data/releases/old/bank.json'), '{}\n');
  await assert.rejects(freezePublicDelta(plan), /Immutable historical bank/);
});
test('tampered base, stale review, symlink and private allowlist fail closed', async t => {
  const {plan} = await fixture(t);
  plan.baseInventory[0].sha256 = 'f'.repeat(64);
  await assert.rejects(freezePublicDelta(plan), /base bytes mismatch/);
  plan.baseInventory[0].sha256 = digest('old\n');
  plan.reviewedSha256['README.md'] = digest('wrong\n');
  await assert.rejects(freezePublicDelta(plan), /reviewed hash/);
  plan.reviewedSha256['README.md'] = digest('new\n');
  await fs.unlink(path.join(plan.workRoot, 'README.md'));
  await fs.symlink('docs/old.md', path.join(plan.workRoot, 'README.md'));
  await assert.rejects(freezePublicDelta(plan), /Symlink/);
  await fs.appendFile(path.join(plan.workRoot, 'PUBLICATION-MANIFEST.txt'), 'private/secret.txt\n');
  await assert.rejects(freezePublicDelta(plan), /Unsafe/);
});
test('no-op, claimed unchanged pending write, missing reconciliation and late package are rejected', async t => {
  const {root, plan} = await fixture(t);
  await assert.rejects(freezePublicDelta({...plan, gitOutcome: {...outcome(), refWrite: 'pending'}}), /unsupported/);
  await assert.rejects(freezePublicDelta({...plan, gitOutcome: {...outcome(), observedAt: iso(begin)}}), /after timeout/);
  await assert.rejects(freezePublicDelta({...plan, now: Date.parse('2026-10-16T15:00:00Z')}), /cutoff/);
  await fs.writeFile(path.join(plan.workRoot, 'README.md'), 'old\n'); plan.reviewedSha256 = {};
  const snapshot = await freezePublicDelta(plan);
  await assert.rejects(writeDownloadZip(snapshot, path.join(root, 'noop.zip')), /No changed files/);
});
test('persistent freeze cannot be bypassed by making a download package', async t => {
  const {plan} = await fixture(t, {'data/publication-state.json': '{"finalized":true}\n'});
  await assert.rejects(freezePublicDelta(plan), /Persistent freeze/);
});
test('delivery status is separate; incomplete chain blocks content and reserves accepted goals', async t => {
  const {root, plan} = await fixture(t);
  const bank = Buffer.from(JSON.stringify({bankVersion: 'regular.6', questions: [{questionId: 'q6', templateId: 't6', revision: 1}]}));
  const ledger = Buffer.from(JSON.stringify({roundId: 'round-006', status: 'closed', publication: {status: 'pending', bankVersion: 'regular.6', bankSha256: digest(bank)}, candidates: [{decision: 'accepted', learningGoalId: 'goal-6', questionId: 'q6', templateId: 't6', revision: 1, publishedBankVersion: null}]}));
  for (const [name, raw] of [[`data/releases/regular.6/bank.json`, bank], ['docs/rounds/round-006.json', ledger]]) {
    await fs.mkdir(path.dirname(path.join(plan.workRoot, name)), {recursive: true});
    await fs.writeFile(path.join(plan.workRoot, name), raw);
    await fs.appendFile(path.join(plan.workRoot, 'PUBLICATION-MANIFEST.txt'), name + '\n');
    plan.reviewedSha256[name] = digest(raw);
  }
  plan.reviewedSha256['PUBLICATION-MANIFEST.txt'] = digest(await fs.readFile(path.join(plan.workRoot, 'PUBLICATION-MANIFEST.txt')));
  const snapshot = await freezePublicDelta(plan), artifact = await writeDownloadZip(snapshot, path.join(root, 'round.zip'));
  const receipt = createDeliveryReceipt({snapshot, artifact, status: 'delivery_failed', recordedAt: iso(now), content: {roundId: 'round-006', ledgerSha256: digest(ledger), bankVersion: 'regular.6', bankSha256: digest(bank), acceptedGoalIds: ['goal-6'], privateSecret: 'must be stripped'}});
  assert.equal(receipt.newlyPublishedRegular, 0); assert.equal(receipt.content.privateSecret, undefined);
  const automatic = createDeliveryReceipt({snapshot, artifact, recordedAt: iso(now)});
  assert.deepEqual(automatic.content.acceptedGoalIds, ['goal-6']);
  const opts = {manifests: new Map([[artifact.sha256, snapshot.manifest]]), ledgers: new Map([['round-006', ledger]]), banks: new Map([['regular.6', bank]])};
  assert.equal(validateDeliveryChain([{...receipt, content: null}], opts).ok, false);
  const pending = validateDeliveryChain([receipt], opts);
  assert.equal(pending.ok, true); assert.equal(pending.canStartNewContent, false); assert.deepEqual(pending.reservedLearningGoalIds, ['goal-6']);
  assert.equal(validateDeliveryChain([receipt], {...opts, resolvedArtifacts: new Set([artifact.sha256])}).canStartNewContent, true);
  assert.equal(validateDeliveryChain([receipt, receipt], opts).ok, false);
  assert.equal(validateDeliveryChain([{...receipt, parentDeliverySha256: 'e'.repeat(64)}], opts).ok, false);
  assert.equal(validateDeliveryChain([receipt], {...opts, banks: new Map()}).ok, false);
  assert.equal(validateDeliveryChain([receipt], {...opts, manifests: new Map([[artifact.sha256, {...snapshot.manifest, newlyPublishedRegular: 52}]])}).ok, false);
});

test('receipt reconciliation is oldest-first and manifest/content provenance cannot be invented', async t => {
  const {root, plan} = await fixture(t);
  const snapshot = await freezePublicDelta(plan), artifact = await writeDownloadZip(snapshot, path.join(root, 'one.zip'));
  const first = createDeliveryReceipt({snapshot, artifact, recordedAt: iso(now)});
  const nextSnapshot = {...snapshot, manifest: {...snapshot.manifest, roundId: 'round-007', parentDeliverySha256: artifact.sha256}};
  const secondArtifact = await writeDownloadZip(nextSnapshot, path.join(root, 'two.zip'));
  const second = createDeliveryReceipt({snapshot: nextSnapshot, artifact: secondArtifact, recordedAt: iso(now)});
  const manifests = new Map([[artifact.sha256, snapshot.manifest], [secondArtifact.sha256, nextSnapshot.manifest]]);
  assert.equal(validateDeliveryChain([first, second], {manifests}).ok, true);
  assert.equal(validateDeliveryChain([first, second], {manifests, resolvedArtifacts: new Set([secondArtifact.sha256])}).ok, false);
  assert.equal(validateDeliveryChain([first, second], {manifests, resolvedArtifacts: new Set([artifact.sha256, secondArtifact.sha256])}).canStartNewContent, true);
  const invented = {...first, content: {roundId: 'round-006', bankVersion: 'regular.6', ledgerSha256: 'e'.repeat(64), bankSha256: 'f'.repeat(64), acceptedGoalIds: []}};
  assert.equal(validateDeliveryChain([invented], {manifests}).ok, false);
});

test('ZIP boundary rejects private/unknown fields and incomplete permission metadata', async t => {
  const {root, plan} = await fixture(t), snapshot = await freezePublicDelta(plan);
  const clone = () => ({manifest: structuredClone(snapshot.manifest), files: snapshot.files.map(f => ({...f, raw: Buffer.from(f.raw)}))});
  const variants = [];
  let changed = clone(); changed.manifest.privateOperatorNote = 'private sentinel'; variants.push(changed);
  changed = clone(); changed.manifest.gitOutcome.privateRequestId = 'private sentinel'; variants.push(changed);
  changed = clone(); changed.manifest.files[0].privateNote = 'private sentinel'; variants.push(changed);
  changed = clone(); changed.files[0].privateNote = 'private sentinel'; variants.push(changed);
  changed = clone(); delete changed.manifest.permissionNotifiedAt; variants.push(changed);
  changed = clone(); changed.manifest.deletions = [{path: 'docs/a.md', beforeSha256: 'a'.repeat(64), sha256: null, bytes: 0, privateNote: 'private sentinel'}]; variants.push(changed);
  for (const [i, variant] of variants.entries()) await assert.rejects(writeDownloadZip(variant, path.join(root, `bad-${i}.zip`)), /Invalid or unrecognized/);
  assert.deepEqual((await fs.readdir(root)).sort(), ['base', 'work']);
});

test('later catch-up has a new execution identity and cannot reset or duplicate its prior fallback', async t => {
  const {plan} = await fixture(t), original = await freezePublicDelta(plan);
  assert.throws(() => startGitPermissionWait({roundId: 'round-006', executionId: 'round-006-main', provider: 'git', notifiedAt: iso(now), previousExecutions: [timedOut()]}), /never reset/);
  const catchupWait = startGitPermissionWait({roundId: 'round-006', executionId: 'round-007-catchup-round-006', provider: 'git', notifiedAt: iso(now), previousExecutions: [timedOut()]});
  assert.equal(catchupWait.roundId, 'round-006');
  assert.notEqual(catchupWait.executionId, timedOut().executionId);
  assert.equal(advanceGitPermissionWait(timedOut(), {now: now + 1, response: 'approved'}).state, 'download_only');
  const catchup = {...original.manifest, executionId: catchupWait.executionId};
  assert.equal(samePublicDelta(original.manifest, catchup), true);
  await assert.rejects(freezePublicDelta({...plan, parentDeliverySha256: 'f'.repeat(64), parentManifest: original.manifest}), /No new changed bytes/);
});

test('reporting-only closure delivers four changed files without re-delivering the unchanged bank', async t => {
  const bank = '{"bankVersion":"regular.6","questions":[]}\n';
  const before = {roundId: 'round-006', status: 'closed', publication: {status: 'committed_unverified', bankVersion: 'regular.6', bankSha256: digest(bank), commit, verifiedAt: null}, candidates: [{decision: 'accepted', learningGoalId: 'goal-6', questionId: 'q6', revision: 1, publishedBankVersion: null}], counts: {accepted: 1, publishedRegularWrittenBySubject: {s1: 0}, publishedRegularPractical: 0}, coverageAfter: {count: 0}, validation: []};
  const {root, plan} = await fixture(t, {'data/releases/regular.6/bank.json': bank, 'docs/rounds/round-006.json': JSON.stringify(before), 'docs/rounds/round-006.md': 'before report', 'docs/VALIDATION.md': 'before validation'});
  const after = structuredClone(before); after.publication.status = 'verified'; after.publication.verifiedAt = iso(begin); after.candidates[0].publishedBankVersion = 'regular.6'; after.counts.publishedRegularWrittenBySubject.s1 = 1; after.coverageAfter.count = 1; after.validation = [{status: 'pass'}];
  for (const [name, raw] of [['docs/rounds/round-006.json', JSON.stringify(after)], ['docs/rounds/round-006.md', 'after report'], ['docs/VALIDATION.md', 'after validation']]) { await fs.writeFile(path.join(plan.workRoot, name), raw); plan.reviewedSha256[name] = digest(raw); }
  const snapshot = await freezePublicDelta(plan);
  assert.equal(snapshot.manifest.deliveryScope, 'reporting_only');
  await assert.rejects(freezePublicDelta({...plan, wait: {...plan.wait, roundId: 'round-999'}}), /original content round/);
  await assert.rejects(writeDownloadZip({...snapshot, manifest: {...snapshot.manifest, roundId: 'round-999'}}, path.join(root, 'wrong-round.zip')), /original content round/);
  assert.equal(snapshot.files.length, 4);
  assert.equal(snapshot.files.some(f => f.path.endsWith('bank.json')), false);
  const artifact = await writeDownloadZip(snapshot, path.join(root, 'closure.zip'));
  const receipt = createDeliveryReceipt({snapshot, artifact, recordedAt: iso(now)});
  assert.equal(receipt.content, null); assert.equal(receipt.newlyPublishedRegular, 0);
  assert.equal(JSON.parse(snapshot.files.find(f => f.path.endsWith('round-006.json')).raw).counts.publishedRegularWrittenBySubject.s1, 1);
  assert.equal(validateDeliveryChain([receipt], {manifests: new Map([[artifact.sha256, snapshot.manifest]])}).ok, true);
  after.candidates[0].decision = 'rejected';
  const altered = JSON.stringify(after); await fs.writeFile(path.join(plan.workRoot, 'docs/rounds/round-006.json'), altered); plan.reviewedSha256['docs/rounds/round-006.json'] = digest(altered);
  await assert.rejects(freezePublicDelta(plan), /preserve accepted decisions/);
});

test('the complete real public allowlist can produce a changed-file-only package', async t => {
  const repo = path.resolve(import.meta.dirname, '..');
  const names = parsePublicAllowlist(await fs.readFile(path.join(repo, 'PUBLICATION-MANIFEST.txt'), 'utf8'));
  assert.ok(names.includes('src/backup.js'));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fallback-real-public-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const baseRoot = path.join(root, 'base'), workRoot = path.join(root, 'work'), baseInventory = [];
  for (const name of names) {
    const raw = await fs.readFile(path.join(repo, name)); baseInventory.push({path: name, sha256: digest(raw)});
    for (const directory of [baseRoot, workRoot]) { await fs.mkdir(path.dirname(path.join(directory, name)), {recursive: true}); await fs.writeFile(path.join(directory, name), raw); }
  }
  await fs.appendFile(path.join(workRoot, 'README.md'), '\nLocal helper test only.\n');
  const currentManifest=JSON.parse(await fs.readFile(path.join(repo,'data/manifest.json')));
  // This current-tree fixture must be after every included evidence event, not
  // merely after the unchanged active bank. Its clock is simulated, not a receipt.
  const blockPins=JSON.parse(await fs.readFile(path.join(repo,'docs/release-blocks/trust.json'))).events;
  const currentBegin=Math.max(begin,Date.parse(currentManifest.releasedAt)+60_000,...blockPins.map(p=>Date.parse(p.recordedAt)+60_000)),currentNow=currentBegin+GIT_PERMISSION_TIMEOUT_MS+1000;
  const currentWait=advanceGitPermissionWait(startGitPermissionWait({roundId:'round-fixture-current',executionId:'current-allowlist-fixture',notifiedAt:iso(currentBegin),provider:'git'}),{now:currentBegin+GIT_PERMISSION_TIMEOUT_MS});
  const currentOutcome=reconcileGitOutcome({baseCommit:commit,observedHead:commit,observedAt:iso(currentNow),refWrite:'not_submitted',objects:'none'});
  const snapshot = await freezePublicDelta({baseRoot, workRoot, baseInventory, baseCommit: commit, baseVerifiedAt: iso(currentBegin-1), reviewedSha256: {'README.md': digest(await fs.readFile(path.join(workRoot, 'README.md')))}, wait:currentWait,gitOutcome:currentOutcome,now:currentNow});
  assert.deepEqual(snapshot.files.map(f => f.path), ['README.md']);
  const artifact = await writeDownloadZip(snapshot, path.join(root, 'real.zip'),{now:currentNow});
  assert.ok(artifact.bytes > 0);
});

test('resolved delivery may have a bounded later editorial successor but no unresolved or stale fork', async t => {
  const {root, plan} = await fixture(t), template = await freezePublicDelta(plan);
  async function episode({roundId, executionId, version, questionRevision, editorial = false, parent = null, prior = null, suffix}) {
    const bank = Buffer.from(JSON.stringify({bankVersion: version, questions: [{questionId: 'q6', templateId: 't6', revision: questionRevision}]}));
    const record = {decision: 'accepted', learningGoalId: 'goal-6', questionId: 'q6', templateId: 't6', revision: questionRevision, publishedBankVersion: null, ...(prior ? {priorAcceptedRef: prior} : {})};
    const ledger = Buffer.from(JSON.stringify({...(editorial ? {kind: 'accepted_content_editorial', correctionRoundId: roundId, corrections: [record]} : {roundId, candidates: [record]}), status: 'closed', publication: {status: 'blocked', bankVersion: version, bankSha256: digest(bank)}}));
    const entries = [[`data/releases/${version}/bank.json`, bank], [`docs/${editorial ? 'corrections' : 'rounds'}/${roundId}.json`, ledger]].map(([name, raw]) => ({path: name, beforeSha256: null, sha256: digest(raw), bytes: raw.length, raw}));
    const snapshot = {manifest: {...template.manifest, roundId, executionId, deliveryScope: 'content', parentDeliverySha256: parent, files: entries.map(({raw, ...metadata}) => metadata)}, files: entries};
    const artifact = await writeDownloadZip(snapshot, path.join(root, `${suffix}.zip`));
    const receipt = createDeliveryReceipt({snapshot, artifact, recordedAt: iso(now)});
    return {snapshot, artifact, receipt, ledger, bank};
  }
  const first = await episode({roundId: 'round-006', executionId: 'round-006-main', version: 'regular.6', questionRevision: 1, suffix: 'first'});
  const prior = {roundId: 'round-006', bankVersion: 'regular.6', bankSha256: digest(first.bank), questionRevision: 1};
  const second = await episode({roundId: 'editorial-002', executionId: 'editorial-002-main', version: 'editorial.2', questionRevision: 2, editorial: true, parent: first.artifact.sha256, prior, suffix: 'second'});
  const opts = {manifests: new Map([[first.artifact.sha256, first.snapshot.manifest], [second.artifact.sha256, second.snapshot.manifest]]), ledgers: new Map([['round-006', first.ledger], ['editorial-002', second.ledger]]), banks: new Map([['regular.6', first.bank], ['editorial.2', second.bank]])};
  assert.equal(validateDeliveryChain([first.receipt, second.receipt], opts).ok, false);
  const legitimate = validateDeliveryChain([first.receipt, second.receipt], {...opts, resolvedArtifacts: new Set([first.artifact.sha256])});
  assert.equal(legitimate.ok, true); assert.deepEqual(legitimate.reservedLearningGoalIds, ['goal-6']);
  assert.equal(validateDeliveryChain([first.receipt, second.receipt], {...opts, resolvedArtifacts: new Set([first.artifact.sha256, second.artifact.sha256])}).canStartNewContent, true);
  const stale = await episode({roundId: 'editorial-002', executionId: 'editorial-002-main', version: 'editorial.2', questionRevision: 2, editorial: true, parent: first.artifact.sha256, prior: {...prior, questionRevision: 9}, suffix: 'stale'});
  opts.manifests.set(stale.artifact.sha256, stale.snapshot.manifest); opts.ledgers.set('editorial-002', stale.ledger);
  assert.equal(validateDeliveryChain([first.receipt, stale.receipt], {...opts, resolvedArtifacts: new Set([first.artifact.sha256])}).ok, false);
});
