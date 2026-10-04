import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {BLOB_RETRY_TOOL, identifyGitBlob, initializeBlobRetryJournal, reserveBlobRetry} from '../scripts/blob-retry.mjs';
import {GIT_PERMISSION_TIMEOUT_MS, GIT_RECONCILIATION_TIMEOUT_MS} from '../scripts/download-fallback.mjs';
import {FREEZE_AT} from '../src/domain.js';

const NOW = Date.parse('2026-10-04T08:30:00Z');
const iso = value => new Date(value).toISOString();
const digest = value => createHash('sha256').update(value).digest('hex');
const operation = content => ({tool: BLOB_RETRY_TOOL, operation: 'create_blob', repository: 'example/exam-lab', encoding: 'utf-8', content});
function evidence(content = '한글\nhello\n') {
  const first = NOW - 3_600_000, unresolved = first + GIT_PERMISSION_TIMEOUT_MS;
  const oldOperation = operation(content);
  const original = {executionId: 'old-execution', operationId: 'old-blob-operation', operation: oldOperation, identity: identifyGitBlob(oldOperation), permissionWait: {roundId: 'round-006', executionId: 'old-execution', notifiedAt: iso(first), deadlineAt: iso(first + GIT_PERMISSION_TIMEOUT_MS), state: 'download_only', stoppedAt: iso(first + GIT_PERMISSION_TIMEOUT_MS), nextPollMs: 0}, reconciliation: {artifactSha256: 'a'.repeat(64), firstUnresolvedAt: iso(unresolved), deadlineAt: iso(unresolved + GIT_RECONCILIATION_TIMEOUT_MS), state: 'skip_git_step', skippedAt: iso(unresolved + GIT_RECONCILIATION_TIMEOUT_MS)}, outcomes: {blob: 'unknown', tree: 'not_submitted', commit: 'not_submitted', ref: 'not_submitted'}, localExecutionState: 'terminated', isolatedBlobOnly: true, evidenceReference: 'independent-original-evidence-001'};
  return {original, request: {type: 'explicit_human_request', reference: 'human-message-002', requestedAt: iso(NOW - 60_000), repository: oldOperation.repository}, attempt: {executionId: 'new-execution', operationId: 'new-blob-operation', operation: {...oldOperation}, permissionWait: null}, publication: {expectedHead: 'b'.repeat(40), observedHead: 'b'.repeat(40), observedAt: iso(NOW), localFinalized: false, remoteFinalized: false, releasedAt: iso(first), tree: 'not_submitted', commit: 'not_submitted', ref: 'not_submitted'}};
}
async function fixture(t, content) {
  t.mock.method(Date, 'now', () => NOW);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'blob-retry-test-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const props = {...evidence(content), directory: path.join(root, 'private-journal')};
  await initializeBlobRetryJournal(props);
  return props;
}
test('Git blob identity uses decoded bytes and Git header, preserving Unicode/newlines', () => {
  assert.equal(identifyGitBlob(operation('hello\n')).gitBlobSha, 'ce013625030ba8dba906f756967f9e9ca394464a');
  const utf = operation('한글\n'), encoded = {...utf, encoding: 'base64', content: Buffer.from(utf.content).toString('base64')};
  assert.deepEqual(identifyGitBlob(utf), identifyGitBlob(encoded));
  assert.equal(identifyGitBlob(utf).bytes, 7);
  assert.notDeepEqual(identifyGitBlob(utf), identifyGitBlob(operation('한글\r\n')));
  assert.notDeepEqual(identifyGitBlob(operation('é')), identifyGitBlob(operation('e\u0301')));
});
test('strict operation parsing rejects tree-inline, route aliases and encoding tricks', () => {
  for (const candidate of [
    {...operation('a'), operation: 'create_tree'}, {...operation('a'), tool: 'other_tool'},
    {...operation('a'), encoding: 'UTF-8'}, {...operation('a'), content: '\ud800'},
    {...operation('a'), encoding: 'base64', content: 'YQ'},
    {...operation('a'), encoding: 'base64', content: 'YQ==\n'},
    {...operation('a'), encoding: 'base64', content: 'YR=='},
    {...operation('a'), encoding: 'base64', content: '__8='},
    {...operation('a'), branch: 'main'}, {...operation('a'), tree: []},
    {...operation('a'), repository: 'example/exam-lab/../other'}
  ]) assert.throws(() => identifyGitBlob(candidate));
});
test('reservation is persisted before returning one exact operation; old evidence remains unknown', async t => {
  const props = await fixture(t), before = structuredClone(props);
  const result = await reserveBlobRetry(props);
  const persisted = await fs.readFile(result.claimPath);
  assert.equal(digest(persisted), result.claimSha256);
  assert.deepEqual(JSON.parse(persisted), result.started);
  assert.deepEqual(result.operation, props.attempt.operation);
  assert.equal(result.started.state, 'started');
  assert.equal(result.started.attemptNumber, 1);
  assert.equal(result.started.originalOutcome, 'unknown');
  assert.equal(result.started.retryOutcome, 'unknown');
  assert.deepEqual(props, before);
  assert.deepEqual(result.started.identity, props.original.identity);
  assert.equal((await fs.stat(result.claimPath)).mode & 0o777, 0o600);
});
test('at most one retry per request/object survives changed execution, restart and request timestamp', async t => {
  const props = await fixture(t);
  await reserveBlobRetry(props);
  for (const change of [() => {}, p => { p.attempt.executionId = 'third-execution'; p.attempt.operationId = 'third-operation'; }, p => { p.request.requestedAt = iso(NOW - 1000); }]) {
    const duplicate = structuredClone(props); change(duplicate);
    await assert.rejects(reserveBlobRetry(duplicate), /EEXIST/);
  }
  const reloaded = await import(`../scripts/blob-retry.mjs?restart=${Date.now()}`);
  await assert.rejects(reloaded.reserveBlobRetry(props), /EEXIST/);
});
test('concurrent calls have only one winner', async t => {
  const props = await fixture(t);
  const settled = await Promise.allSettled(Array.from({length: 6}, () => reserveBlobRetry(structuredClone(props))));
  assert.equal(settled.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(settled.filter(r => r.status === 'rejected' && r.reason.code === 'EEXIST').length, 5);
});
test('an independently new human request may consume its own single attempt without altering history', async t => {
  const props = await fixture(t), first = await reserveBlobRetry(props);
  const again = structuredClone(props); again.request.reference = 'human-message-003';
  again.attempt.executionId = 'next-explicit-execution'; again.attempt.operationId = 'next-explicit-blob';
  const second = await reserveBlobRetry(again);
  assert.notEqual(first.claimPath, second.claimPath);
  assert.equal(digest(await fs.readFile(first.claimPath)), first.claimSha256);
  assert.equal(second.started.originalOutcome, 'unknown');
  await assert.rejects(reserveBlobRetry(again), /EEXIST/);
});
test('missing journal, partial claim and reinitialization fail closed without repairs', async t => {
  const props = await fixture(t);
  await assert.rejects(initializeBlobRetryJournal(props), /EEXIST/);
  await assert.rejects(reserveBlobRetry({...props, directory: props.directory + '-missing'}), /ENOENT/);
  const result = await reserveBlobRetry(props);
  await fs.writeFile(result.claimPath, '{'); // Simulate a crashed partial write, never a new attempt.
  await assert.rejects(reserveBlobRetry(props), /EEXIST/);
  await fs.unlink(path.join(props.directory, 'original.json'));
  await assert.rejects(reserveBlobRetry(props), /ENOENT/);
  await assert.rejects(initializeBlobRetryJournal(props), /EEXIST/);
});
test('mutating repository, bytes, encoding or expected identity rejects before consuming attempt', async t => {
  const props = await fixture(t);
  for (const change of [
    p => { p.attempt.operation.repository = 'other/exam-lab'; },
    p => { p.attempt.operation.content += '\n'; },
    p => { p.attempt.operation.encoding = 'base64'; p.attempt.operation.content = Buffer.from(p.attempt.operation.content).toString('base64'); },
    p => { p.original.identity.bytes++; }, p => { p.original.identity.sha256 = '0'.repeat(64); },
    p => { p.original.identity.gitBlobSha = '0'.repeat(40); }
  ]) { const bad = structuredClone(props); change(bad); await assert.rejects(reserveBlobRetry(bad)); }
  assert.deepEqual(await fs.readdir(props.directory), ['original.json']);
});
test('original evidence is immutable even when changed bytes, clocks and identities are self-consistent', async t => {
  const props = await fixture(t);
  for (const change of [
    p => { p.original.operation.content += '!'; p.original.identity = identifyGitBlob(p.original.operation); p.attempt.operation = {...p.original.operation}; },
    p => { p.original.permissionWait.notifiedAt = iso(NOW - 4_000_000); p.original.permissionWait.deadlineAt = iso(NOW - 4_000_000 + GIT_PERMISSION_TIMEOUT_MS); },
    p => { p.original.reconciliation.firstUnresolvedAt = iso(NOW - 2_000_000); p.original.reconciliation.deadlineAt = iso(NOW - 2_000_000 + GIT_RECONCILIATION_TIMEOUT_MS); p.original.reconciliation.skippedAt = p.original.reconciliation.deadlineAt; },
    p => { p.original.operation.repository = 'other/exam-lab'; p.request.repository = 'other/exam-lab'; p.attempt.operation.repository = 'other/exam-lab'; },
    p => { p.original.operationId = 'reset-operation'; }
  ]) { const bad = structuredClone(props); change(bad); await assert.rejects(reserveBlobRetry(bad), /cannot be reset or replaced/); }
});
test('terminal original and explicit never-submitted tree, commit, ref evidence are mandatory', async t => {
  const props = await fixture(t);
  for (const change of [
    p => { p.original.permissionWait.state = 'permission_wait'; },
    p => { p.original.permissionWait.stoppedAt = null; },
    p => { p.original.permissionWait.deadlineAt = iso(NOW); },
    p => { p.original.outcomes.blob = 'settled_failed'; },
    p => { p.original.outcomes.tree = 'submitted'; },
    p => { p.original.outcomes.commit = 'unknown'; },
    p => { p.original.outcomes.ref = 'settled_success'; },
    p => { delete p.original.outcomes.tree; },
    p => { p.publication.ref = 'unknown'; },
    p => { p.publication.commit = 'submitted'; },
    p => { p.publication.tree = 'submitted'; },
    p => { p.original.reconciliation.state = 'reconciliation_wait'; },
    p => { p.original.reconciliation.deadlineAt = iso(NOW); },
    p => { p.original.reconciliation.skippedAt = iso(NOW + 1); }
  ]) { const bad = structuredClone(props); change(bad); await assert.rejects(reserveBlobRetry(bad)); }
});
test('recurring authority, old requests, future requests and old execution reuse are rejected', async t => {
  const props = await fixture(t);
  for (const change of [
    p => { p.request.type = 'recurring_automation'; },
    p => { p.request.reference = ''; },
    p => { p.request.repository = 'other/exam-lab'; },
    p => { p.request.requestedAt = p.original.permissionWait.stoppedAt; },
    p => { p.request.requestedAt = iso(NOW + 1); },
    p => { p.request.requestedAt = '2026-02-30T00:00:00Z'; },
    p => { p.attempt.executionId = p.original.executionId; },
    p => { p.attempt.operationId = p.original.operationId; },
    p => { p.attempt.retryCount = 0; },
    p => { p.original.retryCount = 0; }
  ]) { const bad = structuredClone(props); change(bad); await assert.rejects(reserveBlobRetry(bad)); }
});
test('permission timeout is insufficient without terminated local execution and no queued writes', async t => {
  const props = await fixture(t);
  for (const change of [
    p => { delete p.original.localExecutionState; },
    p => { p.original.localExecutionState = 'running'; },
    p => { p.original.localExecutionState = 'unknown'; },
    p => { delete p.original.isolatedBlobOnly; },
    p => { p.original.isolatedBlobOnly = false; }
  ]) {
    const bad = structuredClone(props); change(bad);
    await assert.rejects(reserveBlobRetry(bad));
    await assert.rejects(initializeBlobRetryJournal({...bad, directory: bad.directory + '-invalid'}));
  }
  assert.deepEqual(await fs.readdir(props.directory), ['original.json']);
});
test('fresh head, real current time and both persistent freeze observations remain mandatory', async t => {
  const props = await fixture(t);
  for (const change of [
    p => { p.publication.localFinalized = true; }, p => { p.publication.remoteFinalized = true; },
    p => { delete p.publication.remoteFinalized; },
    p => { p.publication.observedHead = 'c'.repeat(40); },
    p => { p.publication.observedAt = iso(NOW - 60_001); },
    p => { p.publication.observedAt = iso(NOW + 1); },
    p => { p.publication.releasedAt = iso(FREEZE_AT); },
    p => { p.publication.postFreezeCorrectionApproved = true; }
  ]) { const bad = structuredClone(props); change(bad); await assert.rejects(reserveBlobRetry(bad)); }
  t.mock.method(Date, 'now', () => FREEZE_AT);
  await assert.rejects(reserveBlobRetry({...props, now: NOW}), /Actual clock cutoff/);
});
test('new permission wait keeps its own ten-minute bound and cannot revive an old timeout', async t => {
  const props = await fixture(t);
  const wait = {roundId: 'round-008', executionId: props.attempt.executionId, notifiedAt: iso(NOW - 30_000), deadlineAt: iso(NOW - 30_000 + GIT_PERMISSION_TIMEOUT_MS), state: 'git_ready', stoppedAt: null, nextPollMs: 0};
  for (const change of [
    w => { w.state = 'permission_wait'; }, w => { w.state = 'download_only'; w.stoppedAt = iso(NOW); },
    w => { w.deadlineAt = iso(NOW); }, w => { w.executionId = props.original.executionId; },
    w => { w.notifiedAt = iso(NOW - 700_000); w.deadlineAt = iso(NOW - 100_000); },
    w => { w.notifiedAt = iso(NOW - 61_000); w.deadlineAt = iso(NOW - 61_000 + GIT_PERMISSION_TIMEOUT_MS); }
  ]) { const bad = structuredClone(props); bad.attempt.permissionWait = {...wait}; change(bad.attempt.permissionWait); await assert.rejects(reserveBlobRetry(bad)); }
  const result = await reserveBlobRetry({...props, attempt: {...props.attempt, permissionWait: wait}});
  assert.deepEqual(result.started.permissionWait, wait);
});
test('symlink directories or anchor substitutions cannot redirect the durable journal', async t => {
  const props = await fixture(t), alias = props.directory + '-alias';
  await fs.symlink(props.directory, alias);
  await assert.rejects(reserveBlobRetry({...props, directory: alias}), /symlinks/);
  const anchor = path.join(props.directory, 'original.json'), backup = path.join(props.directory, 'saved.json');
  await fs.rename(anchor, backup); await fs.symlink(backup, anchor);
  await assert.rejects(reserveBlobRetry(props), /regular unlinked file/);
});
test('corrupt journal and future journal timestamps fail closed', async t => {
  const props = await fixture(t), anchor = path.join(props.directory, 'original.json');
  const record = JSON.parse(await fs.readFile(anchor));
  await fs.writeFile(anchor, JSON.stringify({...record, originalSha256: 'f'.repeat(64)}));
  await assert.rejects(reserveBlobRetry(props), /Corrupt/);
  await fs.writeFile(anchor, JSON.stringify({...record, createdAt: iso(NOW + 1)}));
  await assert.rejects(reserveBlobRetry(props), /future-dated/);
});
test('caller mutation during disk I/O cannot replace the validated operation or authority', async t => {
  const props = await fixture(t), expected = structuredClone(props.attempt.operation);
  const pending = reserveBlobRetry(props);
  props.attempt.operation.content = 'changed after validation';
  props.attempt.operation.repository = 'other/repository';
  props.request.type = 'recurring_automation';
  const result = await pending;
  assert.deepEqual(result.operation, expected);
  assert.equal(result.started.request.type, 'explicit_human_request');
});
test('cutoff reached during claim I/O withholds operation and permanently consumes attempt', async t => {
  const props = await fixture(t);
  let calls = 0;
  t.mock.method(Date, 'now', () => ++calls < 3 ? NOW : FREEZE_AT);
  await assert.rejects(reserveBlobRetry(props), /Actual clock cutoff/);
  assert.equal((await fs.readdir(props.directory)).filter(name => name.startsWith('started-')).length, 1);
  t.mock.method(Date, 'now', () => NOW);
  await assert.rejects(reserveBlobRetry(props), /EEXIST/);
});
