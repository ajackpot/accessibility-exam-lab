/** Local-only guard for one explicitly requested, identical content-addressed blob retry.
 * No Git/network calls. This does not authorize a tree, commit, ref, or publication.
 * Keep one private persistent journal per original operation. Never delete, replace,
 * relocate or reinitialize it to regain an attempt; missing/corrupt state is a blocker.
 * Evidence and human authority must be independently verified by the operator.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {FREEZE_AT, releaseAllowed} from '../src/domain.js';
import {GIT_PERMISSION_TIMEOUT_MS, GIT_RECONCILIATION_TIMEOUT_MS} from './download-fallback.mjs';

export const BLOB_RETRY_TOOL = 'mcp__codex_apps__github_create_blob';
export const MAX_BLOB_RETRY_OBSERVATION_AGE_MS = 60_000;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(message); };
const hex = /^[a-f0-9]{64}$/;
const gitSha = /^[a-f0-9]{40}$/;
const id = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/;
const repository = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const json = value => Buffer.from(JSON.stringify(canonical(value), null, 2) + '\n');
function keys(value, expected, label) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || !isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort())) fail(`Invalid or unrecognized ${label} fields`);
}
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) fail('Invalid timestamp');
  const at = Date.parse(value);
  if (!Number.isFinite(at) || new Date(at).toISOString() !== value.replace(/(?<!\.\d{3})Z$/, '.000Z')) fail('Invalid timestamp');
  return at;
}
function clock() {
  const now = Date.now();
  if (!Number.isSafeInteger(now) || now >= FREEZE_AT) fail('Actual clock cutoff blocks blob retry');
  return now;
}
function decode(operation) {
  keys(operation, ['tool', 'operation', 'repository', 'encoding', 'content'], 'blob operation');
  if (operation.tool !== BLOB_RETRY_TOOL || operation.operation !== 'create_blob' || !repository.test(operation.repository)) fail('Only the original repository create_blob operation is eligible');
  if (typeof operation.content !== 'string') fail('Blob content must be an explicit string');
  if (operation.encoding === 'utf-8') {
    if (!operation.content.isWellFormed()) fail('Malformed UTF-8 content');
    return Buffer.from(operation.content, 'utf8');
  }
  // A repeated-group regexp over multi-megabyte banks can exhaust the JS stack.
  // Validate the alphabet/length in linear time, then enforce exact canonical
  // padding and pad bits with the unchanged decode/re-encode equality below.
  if (operation.encoding !== 'base64' || operation.content.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(operation.content)) fail('Noncanonical blob encoding');
  const raw = Buffer.from(operation.content, 'base64');
  if (raw.toString('base64') !== operation.content) fail('Noncanonical base64 content');
  return raw;
}
export function identifyGitBlob(operation) {
  const raw = decode(operation);
  return {bytes: raw.length, sha256: hash(raw), gitBlobSha: createHash('sha1').update(Buffer.from(`blob ${raw.length}\0`)).update(raw).digest('hex')};
}
function checkWait(wait, now, executionId, terminal) {
  keys(wait, ['roundId', 'executionId', 'notifiedAt', 'deadlineAt', 'state', 'stoppedAt', 'nextPollMs'], 'permission wait');
  const start = instant(wait.notifiedAt), deadline = instant(wait.deadlineAt);
  if (!id.test(wait.roundId) || wait.executionId !== executionId || deadline !== start + GIT_PERMISSION_TIMEOUT_MS || start > now || wait.nextPollMs !== 0) fail('Permission clock or execution cannot be reset');
  if (terminal) {
    if (wait.state !== 'download_only' || instant(wait.stoppedAt) < deadline || instant(wait.stoppedAt) > now) fail('Original execution must be persistently terminal download_only');
  } else if (wait.state !== 'git_ready' || wait.stoppedAt !== null || now >= deadline) fail('New execution permission is not ready or has expired');
}
function checkOriginal(original, now) {
  keys(original, ['executionId', 'operationId', 'operation', 'identity', 'permissionWait', 'reconciliation', 'outcomes', 'localExecutionState', 'isolatedBlobOnly', 'evidenceReference'], 'original evidence');
  if (!id.test(original.executionId) || !id.test(original.operationId) || !id.test(original.evidenceReference)) fail('Original operation and independent evidence references are required');
  if (original.localExecutionState !== 'terminated' || original.isolatedBlobOnly !== true) fail('Original local execution must be terminated with no queued downstream Git writes');
  keys(original.identity, ['bytes', 'sha256', 'gitBlobSha'], 'original blob identity');
  const identity = identifyGitBlob(original.operation);
  if (!Number.isSafeInteger(original.identity.bytes) || !hex.test(original.identity.sha256) || !gitSha.test(original.identity.gitBlobSha) || !isDeepStrictEqual(identity, original.identity)) fail('Original decoded byte length, SHA256 or Git blob SHA mismatch');
  checkWait(original.permissionWait, now, original.executionId, true);
  keys(original.outcomes, ['blob', 'tree', 'commit', 'ref'], 'original outcomes');
  if (original.outcomes.blob !== 'unknown' || ['tree', 'commit', 'ref'].some(key => original.outcomes[key] !== 'not_submitted')) fail('Only an unknown isolated blob with no submitted tree/commit/ref is eligible');
  const r = original.reconciliation;
  keys(r, ['artifactSha256', 'firstUnresolvedAt', 'deadlineAt', 'state', 'skippedAt'], 'original reconciliation');
  if (!hex.test(r.artifactSha256) || instant(r.deadlineAt) !== instant(r.firstUnresolvedAt) + GIT_RECONCILIATION_TIMEOUT_MS || r.state !== 'skip_git_step' || instant(r.skippedAt) < instant(r.deadlineAt) || instant(r.skippedAt) > now) fail('Original bounded reconciliation must stay terminal without a clock reset');
  // The content hash pins bytes without putting the whole payload into the journal.
  return {...structuredClone(original), operation: {tool: original.operation.tool, operation: original.operation.operation, repository: original.operation.repository, encoding: original.operation.encoding}};
}
function checkRequest(request, original, now) {
  keys(request, ['type', 'reference', 'requestedAt', 'repository'], 'new human request');
  if (request.type !== 'explicit_human_request' || !id.test(request.reference) || request.repository !== original.operation.repository) fail('A new explicit human request for this repository is required; recurring authority is insufficient');
  if (instant(request.requestedAt) <= instant(original.permissionWait.stoppedAt) || instant(request.requestedAt) > now) fail('Human request must follow the terminal original execution and cannot be future-dated');
}
function checkAttempt({original, request, attempt, publication}, now) {
  const anchor = checkOriginal(original, now);
  checkRequest(request, original, now);
  keys(attempt, ['executionId', 'operationId', 'operation', 'permissionWait'], 'retry attempt');
  if (!id.test(attempt.executionId) || !id.test(attempt.operationId) || attempt.executionId === original.executionId || attempt.operationId === original.operationId) fail('Retry requires a distinct new execution and operation');
  const after = identifyGitBlob(attempt.operation);
  if (attempt.operation.repository !== original.operation.repository || attempt.operation.encoding !== original.operation.encoding || !isDeepStrictEqual(after, original.identity) || !decode(original.operation).equals(decode(attempt.operation))) fail('Retry must preserve repository, encoding and exact decoded bytes/length/SHA256/Git blob SHA');
  if (attempt.permissionWait !== null) {
    checkWait(attempt.permissionWait, now, attempt.executionId, false);
    if (instant(attempt.permissionWait.notifiedAt) < instant(request.requestedAt)) fail('New permission wait cannot precede its human request');
  }
  keys(publication, ['expectedHead', 'observedHead', 'observedAt', 'localFinalized', 'remoteFinalized', 'releasedAt', 'tree', 'commit', 'ref'], 'fresh publication evidence');
  const observed = instant(publication.observedAt);
  if (!gitSha.test(publication.expectedHead) || /^0+$/.test(publication.expectedHead) || publication.observedHead !== publication.expectedHead || observed < instant(request.requestedAt) || observed > now || now - observed > MAX_BLOB_RETRY_OBSERVATION_AGE_MS) fail('Fresh matching remote head observation is required');
  if (publication.localFinalized !== false || publication.remoteFinalized !== false || !releaseAllowed({now, finalized: publication.localFinalized || publication.remoteFinalized, releasedAt: publication.releasedAt}) || instant(publication.releasedAt) > now) fail('Publication cutoff or persistent freeze blocks blob retry');
  if (['tree', 'commit', 'ref'].some(key => publication[key] !== 'not_submitted')) fail('Submitted or unknown tree/commit/ref blocks isolated blob retry');
  return anchor;
}
async function directoryWithoutLinks(directory) {
  const absolute = path.resolve(directory);
  for (let cursor = absolute; ; cursor = path.dirname(cursor)) {
    const stat = await fs.lstat(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Journal path must be a real directory with no symlinks');
    if (cursor === path.dirname(cursor)) break;
  }
  return absolute;
}
async function syncDirectory(directory) {
  const handle = await fs.open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}
async function writeOnce(file, value) {
  const handle = await fs.open(file, 'wx', 0o600);
  // Any partial write stays in place and blocks reuse. Never delete a failed claim.
  try { await handle.writeFile(json(value)); await handle.sync(); } finally { await handle.close(); }
}
async function readAnchor(directory) {
  const file = path.join(directory, 'original.json'), stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) fail('Original journal anchor must be a regular unlinked file');
  const stored = JSON.parse(await fs.readFile(file, 'utf8'));
  keys(stored, ['schemaVersion', 'createdAt', 'original', 'originalSha256'], 'journal anchor');
  if (stored.schemaVersion !== 1 || !hex.test(stored.originalSha256) || hash(json(stored.original)) !== stored.originalSha256 || instant(stored.createdAt) > clock()) fail('Corrupt or future-dated original journal anchor');
  return stored;
}
/** Provision ONCE after independent evidence review, in private persistent storage.
 * An existing directory (even empty/partial) is never repaired or reset here.
 */
export async function initializeBlobRetryJournal({directory, original, request}) {
  ({original, request} = structuredClone({original, request}));
  const now = clock(), pinned = checkOriginal(original, now);
  checkRequest(request, original, now);
  const parent = await directoryWithoutLinks(path.dirname(path.resolve(directory)));
  const absolute = path.join(parent, path.basename(directory));
  await fs.mkdir(absolute, {mode: 0o700});
  const anchor = {schemaVersion: 1, createdAt: new Date(now).toISOString(), original: pinned, originalSha256: hash(json(pinned))};
  await writeOnce(path.join(absolute, 'original.json'), anchor);
  await syncDirectory(absolute); await syncDirectory(parent);
  return {directory: absolute, originalSha256: anchor.originalSha256};
}
/** Reserve before any submission. A successful return consumes the sole attempt,
 * including if submission later fails, times out, is ambiguous or never happens.
 * Caller must submit only this returned operation once and keep existing permission
 * timeouts and release guards. This never resumes/settles the old unknown execution.
 */
export async function reserveBlobRetry({directory, original, request, attempt, publication}) {
  // Snapshot before the first await; caller mutation must never change validated bytes.
  ({original, request, attempt, publication} = structuredClone({original, request, attempt, publication}));
  const now = clock(), pinned = checkAttempt({original, request, attempt, publication}, now);
  const absolute = await directoryWithoutLinks(directory), stored = await readAnchor(absolute);
  if (!isDeepStrictEqual(stored.original, pinned) || stored.originalSha256 !== hash(json(pinned))) fail('Original evidence, timestamps and counters cannot be reset or replaced');
  if (instant(stored.createdAt) > now) fail('Journal clock moved backwards');
  const key = hash(json({repository: original.operation.repository, requestReference: request.reference, gitBlobSha: original.identity.gitBlobSha}));
  const claimPath = path.join(absolute, `started-${key}.json`);
  const started = {schemaVersion: 1, state: 'started', attemptNumber: 1, startedAt: new Date(now).toISOString(), request: structuredClone(request), executionId: attempt.executionId, operationId: attempt.operationId, originalSha256: stored.originalSha256, repository: original.operation.repository, encoding: original.operation.encoding, identity: {...original.identity}, originalOutcome: 'unknown', retryOutcome: 'unknown', permissionWait: structuredClone(attempt.permissionWait), publication: structuredClone(publication)};
  const operation = structuredClone(attempt.operation);
  await writeOnce(claimPath, started);
  await syncDirectory(absolute);
  // If validation expires during disk I/O, consume the attempt but withhold the operation.
  checkAttempt({original, request, attempt: {...attempt, operation}, publication}, clock());
  return {claimPath, claimSha256: hash(json(started)), started, operation};
}
