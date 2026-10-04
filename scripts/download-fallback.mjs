/** Operator-side, local-only publication fallback. No Git, network, upload or learner API. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {releaseAllowed, FREEZE_AT} from '../src/domain.js';

export const GIT_PERMISSION_TIMEOUT_MS = 10 * 60 * 1000;
export const MAX_PERMISSION_POLL_MS = 1000;
const hex = /^[a-f0-9]{64}$/;
const commit = /^[a-f0-9]{40}$/;
const id = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const fail = message => { throw new Error(message); };
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) fail('Invalid timestamp');
  return Date.parse(value);
}
function nowValue(value) { if (!Number.isFinite(value)) fail('Invalid current time'); return value; }
function requireCommit(value) { if (!commit.test(value) || /^0+$/.test(value)) fail('A verified real base commit is required'); }

/** Start at the actual Git-provider approval notification, never the task/call start. */
export function startGitPermissionWait({roundId, executionId, notifiedAt, provider, alreadyVerified = false, previousExecutions = []}) {
  if (!id.test(roundId) || !id.test(executionId) || provider !== 'git' || alreadyVerified) fail('Only an unpublished Git permission wait can start fallback');
  if (!Array.isArray(previousExecutions) || previousExecutions.some(previous => previous.executionId === executionId)) fail('An existing execution must resume its persisted state, never reset its wait');
  const at = instant(notifiedAt);
  return {roundId, executionId, notifiedAt, deadlineAt: new Date(at + GIT_PERMISSION_TIMEOUT_MS).toISOString(), state: 'permission_wait', stoppedAt: null};
}

/** Persist each returned state before further actions. Terminal timeout never reopens. */
export function advanceGitPermissionWait(wait, {now = Date.now(), response = null} = {}) {
  nowValue(now);
  const begin = instant(wait.notifiedAt), deadline = instant(wait.deadlineAt);
  if (!id.test(wait.roundId) || !id.test(wait.executionId) || deadline !== begin + GIT_PERMISSION_TIMEOUT_MS || now < begin) fail('Invalid permission wait clock');
  if (wait.state === 'download_only' && (instant(wait.stoppedAt) < deadline || instant(wait.stoppedAt) > now)) fail('Invalid terminal timeout timestamp');
  if (!['permission_wait', 'git_ready', 'download_only', 'permission_denied'].includes(wait.state)) fail('Invalid permission wait state');
  if (wait.state !== 'permission_wait') return {...wait, nextPollMs: 0};
  // Wall-clock expiry wins even if an old response is first observed after expiry.
  if (now >= deadline) return {...wait, state: 'download_only', stoppedAt: new Date(now).toISOString(), nextPollMs: 0};
  if (response === 'approved') return {...wait, state: 'git_ready', nextPollMs: 0};
  if (response === 'denied') return {...wait, state: 'permission_denied', stoppedAt: new Date(now).toISOString(), nextPollMs: 0};
  if (response !== null) fail('Unknown permission response');
  return {...wait, nextPollMs: Math.min(MAX_PERMISSION_POLL_MS, deadline - now)};
}

/** This gate supplements, and never replaces, release:check and remote freeze checks. */
export function assertGitWriteAllowed(wait, {now = Date.now(), finalized = false, releasedAt} = {}) {
  const current = advanceGitPermissionWait(wait, {now});
  if (current.state !== 'git_ready') fail('No further Git writes allowed for this round');
  if (!releaseAllowed({now, finalized, releasedAt})) fail('Publication cutoff or persistent freeze blocks Git write');
  return true;
}

/** Cancelling an approval prompt proves nothing about an already submitted write. */
export function reconcileGitOutcome({baseCommit, observedHead = null, expectedCommit = null, observedAt, refWrite = 'unknown', objects = 'unknown', cancellation = 'not_available'}) {
  requireCommit(baseCommit); instant(observedAt);
  for (const value of [observedHead, expectedCommit]) if (value !== null) requireCommit(value);
  if (!['not_submitted', 'settled_failed', 'settled_success', 'pending', 'unknown'].includes(refWrite) || !['none', 'created', 'unknown'].includes(objects) || !['not_available', 'not_requested', 'cancelled', 'already_resolved', 'expired', 'uncertain'].includes(cancellation)) fail('Invalid reconciliation evidence');
  let refStatus = 'unknown';
  if (expectedCommit && observedHead === expectedCommit) refStatus = 'applied';
  else if (observedHead === baseCommit && ['not_submitted', 'settled_failed'].includes(refWrite)) refStatus = 'unchanged';
  else if (observedHead && observedHead !== baseCommit && !['pending', 'unknown'].includes(refWrite)) refStatus = 'changed_other';
  return {refStatus, observedHead, expectedCommit, observedAt, refWrite, objects, cancellation};
}

export function safePublicPath(value) {
  if (typeof value !== 'string' || value.length > 240 || !value || /[^A-Za-z0-9._/-]/.test(value) || value.startsWith('/') || value.includes('\\')) return false;
  const parts = value.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || p.endsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) return false;
  if (parts.some(p => p.startsWith('.') && !['.nojekyll', '.gitignore'].includes(value))) return false;
  if (value === 'src/backup.js') return true; // Reviewed runtime module, not a learner backup export.
  return !parts.some(p => /^(?:private|secrets?|credentials?|backups?|user-records?|learner-records?|raw-logs?|blind-packages?|author-drafts?)(?:\.|$)/i.test(p));
}
function checkPaths(paths) {
  if (!Array.isArray(paths) || new Set(paths.map(p => p.toLowerCase())).size !== paths.length || paths.some(p => !safePublicPath(p))) fail('Unsafe, duplicate or case-colliding public path');
}
export function parsePublicAllowlist(raw) {
  const paths = raw.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  checkPaths(paths); return paths;
}
async function regularFile(root, relative, optional = false) {
  const resolved = path.resolve(root);
  // No symlink in the supplied root or any ancestor, including directory links.
  for (let cursor = resolved; ; cursor = path.dirname(cursor)) {
    const stat = await fs.lstat(cursor);
    if (stat.isSymbolicLink()) fail('Symlink root is forbidden');
    if (path.dirname(cursor) === cursor) break;
  }
  let current = resolved;
  for (const [index, part] of relative.split('/').entries()) {
    current = path.join(current, part);
    let stat;
    try { stat = await fs.lstat(current); } catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
    if (stat.isSymbolicLink()) fail(`Symlink is forbidden: ${relative}`);
    if (index < relative.split('/').length - 1 ? !stat.isDirectory() : !stat.isFile()) fail(`Not a regular public file: ${relative}`);
  }
  return fs.readFile(current);
}
const protectedBank = p => /^data\/(?:releases\/|seed-bank(?:-v\d+)?\.json$)/.test(p);

/** Freeze exactly reviewed changed/added bytes against a read-only verified export.
 * baseInventory comes from that exact remote commit, not from the candidate tree.
 * Reviewed hashes are an operator attestation; semantic/privacy review remains required.
 */
export async function freezePublicDelta({baseRoot, workRoot, baseCommit, baseVerifiedAt, baseInventory, reviewedSha256, wait, gitOutcome, parentDeliverySha256 = null, parentManifest = null, now = Date.now()}) {
  requireCommit(baseCommit);
  if (instant(baseVerifiedAt) > nowValue(now)) fail('Base verification is in the future');
  if (now >= FREEZE_AT) fail('Final cutoff blocks creating a new fallback package');
  const state = advanceGitPermissionWait(wait, {now});
  if (state.state !== 'download_only' || instant(state.stoppedAt) < instant(state.deadlineAt)) fail('Download fallback requires a persisted expired wait');
  if (parentDeliverySha256 !== null && !hex.test(parentDeliverySha256)) fail('Invalid parent delivery hash');
  if (!gitOutcome || instant(gitOutcome.observedAt) < instant(state.stoppedAt) || instant(gitOutcome.observedAt) > now) fail('Read-only Git reconciliation after timeout is required');
  const observed = reconcileGitOutcome({baseCommit, observedHead: gitOutcome.observedHead, expectedCommit: gitOutcome.expectedCommit, observedAt: gitOutcome.observedAt, refWrite: gitOutcome.refWrite, objects: gitOutcome.objects, cancellation: gitOutcome.cancellation});
  if (observed.refStatus !== gitOutcome.refStatus) fail('Git outcome claim is unsupported by its evidence');
  if (!Array.isArray(baseInventory)) fail('Verified base inventory is required');
  checkPaths(baseInventory.map(f => f.path));
  const baseline = new Map();
  for (const entry of baseInventory) {
    if (!hex.test(entry.sha256)) fail('Invalid base inventory hash');
    const raw = await regularFile(baseRoot, entry.path);
    if (hash(raw) !== entry.sha256) fail(`Verified base bytes mismatch: ${entry.path}`);
    baseline.set(entry.path, raw);
  }
  if (baseline.has('data/publication-state.json') && JSON.parse(baseline.get('data/publication-state.json')).finalized) fail('Persistent freeze blocks new fallback packages');
  const workState = await regularFile(workRoot, 'data/publication-state.json', true);
  if (workState && JSON.parse(workState).finalized) fail('Persistent freeze blocks new fallback packages');
  const oldAllow = parsePublicAllowlist((baseline.get('PUBLICATION-MANIFEST.txt') || fail('Missing verified base allowlist')).toString());
  if (oldAllow.some(p => !baseline.has(p)) || baseline.size !== oldAllow.length) fail('Base inventory must exactly match its public allowlist');
  const allowRaw = await regularFile(workRoot, 'PUBLICATION-MANIFEST.txt');
  const allow = parsePublicAllowlist(allowRaw.toString());
  if (!allow.includes('PUBLICATION-MANIFEST.txt')) fail('Candidate allowlist must include itself');
  const files = [], deletions = [];
  for (const name of [...new Set([...oldAllow, ...allow])].sort()) {
    const before = baseline.get(name) ?? null;
    const raw = await regularFile(workRoot, name, true);
    // Deletions require both an absent file and explicit reviewed null hash below.
    if (!allow.includes(name) && raw !== null) fail(`Removed allowlist file still exists: ${name}`);
    if (allow.includes(name) && raw === null) fail(`Allowlisted file is missing: ${name}`);
    if (before && raw?.equals(before)) continue;
    if (before && protectedBank(name)) fail(`Immutable historical bank cannot change or be deleted: ${name}`);
    const afterHash = raw === null ? null : hash(raw);
    if (!Object.hasOwn(reviewedSha256 || {}, name) || reviewedSha256[name] !== afterHash) fail(`Changed file lacks exact reviewed hash: ${name}`);
    const metadata = {path: name, beforeSha256: before === null ? null : hash(before), sha256: afterHash, bytes: raw?.length ?? 0};
    if (raw === null) deletions.push(metadata); else files.push({...metadata, raw: Buffer.from(raw)});
  }
  const changedPaths = [...files, ...deletions].map(f => f.path).sort();
  if (Object.keys(reviewedSha256 || {}).sort().join('\n') !== changedPaths.join('\n')) fail('Review allowlist must exactly match the changed/added/deleted paths');
  const {deliveryScope, reportingEvidence} = classifyDelta(files, baseline, state.roundId);
  const manifest = {schemaVersion: 1, kind: 'developer_patch_not_learner_import', deliveryMode: 'download_only', deliveryScope, reportingEvidence, roundId: state.roundId, executionId: state.executionId, baseCommit, baseVerifiedAt, parentDeliverySha256, permissionNotifiedAt: state.notifiedAt, permissionDeadlineAt: state.deadlineAt, gitStoppedAt: state.stoppedAt, gitOutcome: observed, newlyPublishedRegular: 0, files: files.map(({raw, ...f}) => f), deletions};
  if (parentDeliverySha256 !== null) {
    if (!parentManifest) fail('A prior frozen manifest is required to avoid duplicate delivery');
    if (samePublicDelta(manifest, parentManifest)) fail('No new changed bytes: reuse the existing artifact without duplicate attachment');
  }
  return {manifest, files};
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('\n') !== [...keys].sort().join('\n')) fail(`Invalid or unrecognized ${label} fields`);
}
const fileKeys = ['path', 'beforeSha256', 'sha256', 'bytes'];
const contentPath = name => /^data\/releases\/[^/]+\/bank\.json$/.test(name) || /^docs\/(?:rounds\/round-\d+|corrections\/editorial-\d+)\.json$/.test(name);
const ledgerPath = name => /^docs\/(?:rounds\/round-\d+|corrections\/editorial-\d+)\.json$/.test(name);
const bankPath = name => /^data\/releases\/[^/]+\/bank\.json$/.test(name);
function needsContent(manifest) { return manifest.deliveryScope === 'content'; }
function decisionFields(ledger) {
  const copy = structuredClone(ledger);
  for (const key of ['publication', 'coverageAfter', 'validation', 'summary']) delete copy[key];
  if (copy.counts) for (const key of ['publishedRegularWrittenBySubject', 'publishedRegularPractical', 'publishedRevisedRegular']) delete copy.counts[key];
  for (const record of [...(copy.candidates || []), ...(copy.corrections || [])]) delete record.publishedBankVersion;
  return copy;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function decisionDigest(ledger) { return hash(json(canonical(decisionFields(ledger)))); }
function classifyDelta(files, baseline, roundId) {
  if (files.some(f => bankPath(f.path))) return {deliveryScope: 'content', reportingEvidence: null};
  const ledgers = files.filter(f => ledgerPath(f.path));
  if (!ledgers.length) return {deliveryScope: 'supporting_files', reportingEvidence: null};
  if (ledgers.length !== 1) fail('Reporting-only delta must close one original ledger');
  const file = ledgers[0], beforeRaw = baseline.get(file.path), after = JSON.parse(file.raw);
  if (!beforeRaw) fail('A new content ledger cannot be disguised as reporting-only');
  const before = JSON.parse(beforeRaw), publication = after.publication;
  const editorial = after.kind === 'accepted_content_editorial', originalRoundId = editorial ? after.correctionRoundId : after.roundId;
  if (originalRoundId !== roundId || file.path !== `docs/${editorial ? 'corrections' : 'rounds'}/${roundId}.json`) fail('Reporting-only identity differs from original content round');
  const bank = baseline.get(`data/releases/${publication?.bankVersion}/bank.json`);
  if (!bank || hash(bank) !== publication?.bankSha256 || before.publication?.bankVersion !== publication.bankVersion || before.status !== 'closed' || after.status !== 'closed' || publication.status !== 'verified' || !isDeepStrictEqual(decisionFields(before), decisionFields(after))) fail('Reporting-only closure must preserve accepted decisions and an already remote bank');
  requireCommit(publication.commit); instant(publication.verifiedAt);
  return {deliveryScope: 'reporting_only', reportingEvidence: {ledgerPath: file.path, baselineLedgerSha256: hash(beforeRaw), bankVersion: publication.bankVersion, bankSha256: publication.bankSha256, publicationCommit: publication.commit, verifiedAt: publication.verifiedAt, decisionSha256: decisionDigest(after)}};
}
function checkManifest(manifest) {
  exactKeys(manifest, ['schemaVersion', 'kind', 'deliveryMode', 'deliveryScope', 'reportingEvidence', 'roundId', 'executionId', 'baseCommit', 'baseVerifiedAt', 'parentDeliverySha256', 'permissionNotifiedAt', 'permissionDeadlineAt', 'gitStoppedAt', 'gitOutcome', 'newlyPublishedRegular', 'files', 'deletions'], 'manifest');
  if (manifest.schemaVersion !== 1 || manifest.kind !== 'developer_patch_not_learner_import' || manifest.deliveryMode !== 'download_only' || manifest.newlyPublishedRegular !== 0 || !id.test(manifest.roundId) || !id.test(manifest.executionId) || manifest.parentDeliverySha256 !== null && !hex.test(manifest.parentDeliverySha256)) fail('Invalid download-only manifest');
  requireCommit(manifest.baseCommit); instant(manifest.baseVerifiedAt);
  if (!['supporting_files', 'content', 'reporting_only'].includes(manifest.deliveryScope)) fail('Invalid delivery scope');
  const begin = instant(manifest.permissionNotifiedAt), deadline = instant(manifest.permissionDeadlineAt), stopped = instant(manifest.gitStoppedAt);
  if (deadline !== begin + GIT_PERMISSION_TIMEOUT_MS || stopped < deadline) fail('Invalid manifest permission timing');
  exactKeys(manifest.gitOutcome, ['refStatus', 'observedHead', 'expectedCommit', 'observedAt', 'refWrite', 'objects', 'cancellation'], 'Git outcome');
  const outcome = reconcileGitOutcome({baseCommit: manifest.baseCommit, ...manifest.gitOutcome});
  if (outcome.refStatus !== manifest.gitOutcome.refStatus || instant(outcome.observedAt) < stopped) fail('Unsupported manifest Git outcome');
  if (!Array.isArray(manifest.files) || !Array.isArray(manifest.deletions)) fail('Invalid manifest path lists');
  checkPaths([...manifest.files, ...manifest.deletions].map(f => f.path));
  const expectedScope = manifest.files.some(f => bankPath(f.path)) ? 'content' : manifest.files.some(f => ledgerPath(f.path)) ? 'reporting_only' : 'supporting_files';
  if (manifest.deliveryScope !== expectedScope) fail('Delivery scope does not match changed files');
  if (expectedScope === 'reporting_only') {
    const proof = manifest.reportingEvidence;
    exactKeys(proof, ['ledgerPath', 'baselineLedgerSha256', 'bankVersion', 'bankSha256', 'publicationCommit', 'verifiedAt', 'decisionSha256'], 'reporting evidence');
    const ledger = manifest.files.find(f => f.path === proof.ledgerPath);
    if (![ `docs/rounds/${manifest.roundId}.json`, `docs/corrections/${manifest.roundId}.json` ].includes(proof.ledgerPath)) fail('Reporting-only path differs from original content round');
    if (manifest.files.filter(f => ledgerPath(f.path)).length !== 1 || !ledger || !hex.test(proof.baselineLedgerSha256) || ledger.beforeSha256 !== proof.baselineLedgerSha256 || !hex.test(proof.bankSha256) || !hex.test(proof.decisionSha256) || !id.test(proof.bankVersion)) fail('Invalid reporting-only evidence');
    requireCommit(proof.publicationCommit); instant(proof.verifiedAt);
  } else if (manifest.reportingEvidence !== null) fail('Unexpected reporting evidence');
  for (const [deletion, entries] of [[false, manifest.files], [true, manifest.deletions]]) for (const entry of entries) {
    exactKeys(entry, fileKeys, 'file metadata');
    if (entry.beforeSha256 !== null && !hex.test(entry.beforeSha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0) fail('Invalid file baseline hash/size');
    if (deletion ? !hex.test(entry.beforeSha256) || entry.sha256 !== null || entry.bytes !== 0 || protectedBank(entry.path) || contentPath(entry.path) : !hex.test(entry.sha256)) fail('Invalid file/deletion hash');
  }
}
export function samePublicDelta(left, right) {
  checkManifest(left); checkManifest(right);
  const delta = m => JSON.stringify({baseCommit: m.baseCommit, files: [...m.files].sort((a, b) => a.path.localeCompare(b.path)), deletions: [...m.deletions].sort((a, b) => a.path.localeCompare(b.path))});
  return delta(left) === delta(right);
}
function checkSnapshot(snapshot) {
  exactKeys(snapshot, ['manifest', 'files'], 'snapshot');
  const {manifest, files} = snapshot; checkManifest(manifest);
  if (!Array.isArray(files) || files.length !== manifest.files.length) fail('Frozen files differ from manifest');
  if (manifest.deliveryScope === 'reporting_only') {
    const proof = manifest.reportingEvidence, ledger = JSON.parse(files.find(f => f.path === proof.ledgerPath).raw);
    const editorial = ledger.kind === 'accepted_content_editorial';
    if ((editorial ? ledger.correctionRoundId : ledger.roundId) !== manifest.roundId || proof.ledgerPath !== `docs/${editorial ? 'corrections' : 'rounds'}/${manifest.roundId}.json`) fail('Reporting-only ledger differs from original content round');
    if (ledger.publication?.status !== 'verified' || ledger.publication.bankVersion !== proof.bankVersion || ledger.publication.bankSha256 !== proof.bankSha256 || ledger.publication.commit !== proof.publicationCommit || ledger.publication.verifiedAt !== proof.verifiedAt || decisionDigest(ledger) !== proof.decisionSha256) fail('Reporting-only frozen ledger differs from verified evidence');
  }
  for (const [i, file] of files.entries()) {
    exactKeys(file, [...fileKeys, 'raw'], 'frozen file');
    if (!Buffer.isBuffer(file.raw) || hash(file.raw) !== file.sha256 || file.raw.length !== file.bytes) fail('Frozen file bytes changed');
    if (fileKeys.some(key => file[key] !== manifest.files[i][key])) fail('Frozen manifest differs from files');
  }
}
function contentProvenance(snapshot) {
  if (!needsContent(snapshot.manifest)) return null;
  const ledgers = snapshot.files.filter(f => /^docs\/(?:rounds\/round-\d+|corrections\/editorial-\d+)\.json$/.test(f.path));
  if (ledgers.length !== 1) fail('Content delta needs exactly one frozen operational ledger');
  const file = ledgers[0], ledger = JSON.parse(file.raw), editorial = ledger.kind === 'accepted_content_editorial';
  const roundId = editorial ? ledger.correctionRoundId : ledger.roundId;
  const records = editorial ? ledger.corrections : ledger.candidates;
  const bankVersion = ledger.publication?.bankVersion;
  const bank = snapshot.files.find(f => f.path === `data/releases/${bankVersion}/bank.json`);
  if (!bank || roundId !== snapshot.manifest.roundId || ledger.status !== 'closed' || ledger.publication.status === 'verified' || ledger.publication.bankSha256 !== bank.sha256 || !Array.isArray(records) || records.some(c => !['accepted', 'rejected'].includes(c.decision))) fail('Content delta lacks a closed unpublished exact ledger/bank');
  return {roundId, ledgerPath: file.path, ledgerSha256: file.sha256, bankVersion, bankSha256: bank.sha256, acceptedGoalIds: records.filter(c => c.decision === 'accepted').map(c => c.learningGoalId).sort()};
}

const crcTable = Array.from({length: 256}, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ n >>> 1 : n >>> 1; return n >>> 0; });
function crc32(bytes) { let n = 0xffffffff; for (const b of bytes) n = crcTable[(n ^ b) & 255] ^ n >>> 8; return (n ^ 0xffffffff) >>> 0; }
function zipStored(entries) {
  const local = [], central = []; let offset = 0;
  if (entries.length > 65535) fail('ZIP32 entry limit exceeded');
  for (const {name, raw} of entries) {
    const filename = Buffer.from(name), crc = crc32(raw);
    if (raw.length > 0xffffffff || offset + raw.length > 0xffffffff) fail('ZIP32 size limit exceeded');
    const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x800, 6); head.writeUInt16LE(33, 12); head.writeUInt32LE(crc, 14); head.writeUInt32LE(raw.length, 18); head.writeUInt32LE(raw.length, 22); head.writeUInt16LE(filename.length, 26);
    local.push(head, filename, raw);
    const dir = Buffer.alloc(46); dir.writeUInt32LE(0x02014b50); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0x800, 8); dir.writeUInt16LE(33, 14); dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(raw.length, 20); dir.writeUInt32LE(raw.length, 24); dir.writeUInt16LE(filename.length, 28); dir.writeUInt32LE(offset, 42);
    central.push(dir, filename); offset += head.length + filename.length + raw.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
function koreanInstructions(manifest) {
  return `개발자용 변경 파일 묶음 / 다운로드 전용\n\n이 ZIP은 학습 기록 백업이나 앱 가져오기 파일이 아닙니다. Git 공개 완료를 뜻하지 않으며 신규 공개 문항 수는 0입니다.\n기준 Git 커밋: ${manifest.baseCommit}\n콘텐츠 회차: ${manifest.roundId}\n실행: ${manifest.executionId}\n확인된 Git ref 상태: ${manifest.gitOutcome.refStatus} (unknown이면 반영 여부 미확정)\n\n1. 기준 커밋의 별도 로컬 작업 복사본을 준비하고 기존 기록을 보존합니다. 실제 Git 상태가 unknown/applied/changed_other이면 먼저 읽기 전용으로 반영 여부를 확인하며 재전송하지 않습니다.\n2. manifest.json의 경로·beforeSha256를 현재 파일과 대조합니다. 다르면 덮어쓰지 않습니다. parentDeliverySha256가 있으면 선행 묶음과 이력을 먼저 확인합니다.\n3. files/ 아래 변경·추가 파일만 같은 상대 경로로 복사합니다. 기존 파일을 백업하고 각 sha256를 대조합니다. deletions는 명시된 파일과 기존 해시를 확인한 뒤에만 수동 삭제합니다.\n4. npm run check 및 npm test를 실행합니다. 앱의 학습 기록 가져오기 기능에 ZIP/manifest를 넣거나 브라우저 저장 기록을 지우지 않습니다.\n5. 자동 Git 작업은 하지 않습니다. 추후 허용된 정상 회차나 사용자 재시도에서 현재 원격 head·동결·전체 이력과 release:check를 다시 확인합니다. 최종 동결 이후 신규 누적본을 공개하지 않습니다.\n\nLibrary 업로드·첨부 실패는 전달 실패로 별도 보고합니다. 서명된 비공개 다운로드 URL을 대신 보내지 않습니다.\n`;
}
export async function writeDownloadZip(snapshot, outputPath, {now = Date.now()} = {}) {
  if (nowValue(now) >= FREEZE_AT) fail('Final cutoff blocks creating a new ZIP; reuse only an already fixed artifact');
  checkSnapshot(snapshot);
  const {manifest, files} = snapshot;
  contentProvenance(snapshot);
  if (!files.length && !manifest.deletions.length) fail('No changed files: reuse the existing artifact without duplicate attachment');
  const raw = zipStored([{name: 'manifest.json', raw: json(manifest)}, {name: 'APPLY-KO.txt', raw: Buffer.from(koreanInstructions(manifest))}, ...files.map(f => ({name: `files/${f.path}`, raw: f.raw}))]);
  await fs.writeFile(outputPath, raw, {flag: 'wx'});
  return {path: outputPath, sha256: hash(raw), bytes: raw.length, changedPaths: manifest.files.map(f => f.path), deletedPaths: manifest.deletions.map(f => f.path)};
}

/** Separate append-only delivery receipt; never mutate a frozen candidate to claim publication. */
export function createDeliveryReceipt({snapshot, artifact, status = 'prepared', recordedAt, content = null}) {
  checkSnapshot(snapshot); instant(recordedAt);
  if (!['prepared', 'delivered', 'delivery_failed'].includes(status) || !hex.test(artifact.sha256)) fail('Invalid artifact delivery result');
  const derived = contentProvenance(snapshot);
  if (content !== null && (!derived || ['roundId', 'ledgerSha256', 'bankVersion', 'bankSha256'].some(key => content[key] !== derived[key]) || JSON.stringify([...(content.acceptedGoalIds || [])].sort()) !== JSON.stringify(derived.acceptedGoalIds))) fail('Supplied content provenance differs from frozen bytes');
  return {receiptSchemaVersion: 1, artifactSha256: artifact.sha256, parentDeliverySha256: snapshot.manifest.parentDeliverySha256, roundId: snapshot.manifest.roundId, executionId: snapshot.manifest.executionId, baseCommit: snapshot.manifest.baseCommit, status, recordedAt, newlyPublishedRegular: 0, content: derived, manifestSha256: hash(json(snapshot.manifest))};
}

/** Receipts reserve accepted goals even after upload failure; they never count as published.
 * Missing content/history, forks, or an unresolved ref outcome block later expansion.
 */
export function validateDeliveryChain(receipts, {manifests = new Map(), ledgers = new Map(), banks = new Map(), resolvedArtifacts = new Set()} = {}) {
  const errors = [], seen = new Set(), goals = new Map(); let previous = null;
  const unresolved = [];
  for (const receipt of receipts) {
    const bad = message => errors.push(`${receipt?.roundId || 'delivery'}: ${message}`);
    if (!receipt || receipt.receiptSchemaVersion !== 1 || !hex.test(receipt.artifactSha256) || seen.has(receipt.artifactSha256) || receipt.parentDeliverySha256 !== previous || receipt.newlyPublishedRegular !== 0 || !['prepared', 'delivered', 'delivery_failed'].includes(receipt.status)) { bad('invalid, missing, reordered or duplicate receipt chain'); continue; }
    const manifest = manifests.get(receipt.artifactSha256);
    try {
      exactKeys(receipt, ['receiptSchemaVersion', 'artifactSha256', 'parentDeliverySha256', 'roundId', 'executionId', 'baseCommit', 'status', 'recordedAt', 'newlyPublishedRegular', 'content', 'manifestSha256'], 'receipt');
      if (receipt.content) exactKeys(receipt.content, ['roundId', 'ledgerPath', 'ledgerSha256', 'bankVersion', 'bankSha256', 'acceptedGoalIds'], 'content provenance');
      if (manifest) checkManifest(manifest);
    } catch (error) { bad(error.message); continue; }
    if (!manifest || hash(json(manifest)) !== receipt.manifestSha256 || manifest.parentDeliverySha256 !== previous || manifest.baseCommit !== receipt.baseCommit || manifest.roundId !== receipt.roundId || manifest.executionId !== receipt.executionId || manifest.deliveryMode !== 'download_only' || manifest.newlyPublishedRegular !== 0) bad('missing or changed frozen manifest');
    if (manifest && needsContent(manifest) && !receipt.content) bad('content-bearing delivery is missing accepted provenance');
    if (receipt.content) {
      const content = receipt.content, raw = ledgers.get(content.roundId), bankRaw = banks.get(content.bankVersion);
      if (content.roundId !== receipt.roundId || !manifest?.files.some(f => f.path === content.ledgerPath && f.sha256 === content.ledgerSha256) || !manifest?.files.some(f => f.path === `data/releases/${content.bankVersion}/bank.json` && f.sha256 === content.bankSha256)) bad('accepted content is not in this exact frozen public delta');
      if (!raw || hash(raw) !== content.ledgerSha256 || !bankRaw || hash(bankRaw) !== content.bankSha256) bad('missing or changed immutable accepted ledger/bank');
      else {
        try {
          const ledger = JSON.parse(raw), bank = JSON.parse(bankRaw);
          const editorial = ledger.kind === 'accepted_content_editorial';
          const records = editorial ? ledger.corrections : ledger.candidates;
          const accepted = records?.filter(c => c.decision === 'accepted') || [];
          const expectedPath = editorial ? `docs/corrections/${content.roundId}.json` : `docs/rounds/${content.roundId}.json`;
          if (content.ledgerPath !== expectedPath || (editorial ? ledger.correctionRoundId : ledger.roundId) !== content.roundId || ledger.status !== 'closed' || ledger.publication.status === 'verified' || bank.bankVersion !== content.bankVersion || ledger.publication.bankVersion !== content.bankVersion || ledger.publication.bankSha256 !== content.bankSha256 || JSON.stringify(accepted.map(c => c.learningGoalId).sort()) !== JSON.stringify([...content.acceptedGoalIds].sort())) bad('offline content provenance is not a closed unpublished accepted round');
          for (const c of accepted) {
            const previousGoal = goals.get(c.learningGoalId);
            if (previousGoal) {
              const ref = c.priorAcceptedRef;
              if (!editorial || !resolvedArtifacts.has(previousGoal.artifactSha256) || !ref || ref.roundId !== previousGoal.roundId || ref.bankVersion !== previousGoal.bankVersion || ref.bankSha256 !== previousGoal.bankSha256 || ref.questionRevision !== previousGoal.revision || c.questionId !== previousGoal.questionId || c.revision <= previousGoal.revision) bad('accepted offline learning goal duplicated, forked or unresolved');
            }
            goals.set(c.learningGoalId, {artifactSha256: receipt.artifactSha256, roundId: content.roundId, bankVersion: content.bankVersion, bankSha256: content.bankSha256, questionId: c.questionId, revision: c.revision});
            if (c.publishedBankVersion !== null || !bank.questions.some(q => q.questionId === c.questionId && q.templateId === c.templateId && q.revision === c.revision)) bad('accepted offline question is missing or wrongly claims publication');
          }
        } catch { bad('invalid frozen ledger/bank JSON'); }
      }
    }
    if (!resolvedArtifacts.has(receipt.artifactSha256)) unresolved.push(receipt.artifactSha256);
    seen.add(receipt.artifactSha256); previous = receipt.artifactSha256;
  }
  // resolvedArtifacts must be supplied only after remote ancestry, exact bytes, Pages,
  // and the original complete campaign/release validators all pass. No local proof.
  for (const value of resolvedArtifacts) if (!seen.has(value)) errors.push('Unknown resolved artifact');
  const resolvedOrder = receipts.map(r => resolvedArtifacts.has(r.artifactSha256));
  if (resolvedOrder.some((resolved, i) => resolved && resolvedOrder.slice(0, i).includes(false))) errors.push('Pending deliveries must reconcile oldest-first');
  return {ok: !errors.length, errors, unresolvedArtifacts: unresolved, reservedLearningGoalIds: [...goals].filter(([, reservation]) => !resolvedArtifacts.has(reservation.artifactSha256)).map(([goal]) => goal).sort(), canStartNewContent: !errors.length && !unresolved.length};
}

// Pure helpers intentionally do not poll, cancel prompts, publish, upload or change status.
// CLI packages only a private plan with actual wall-clock expiry and exclusive output.
export async function main(args = process.argv.slice(2)) {
  if (args.length !== 2) fail('Usage: node scripts/download-fallback.mjs PRIVATE-PLAN.json OUTPUT.zip');
  const plan = JSON.parse(await fs.readFile(args[0], 'utf8'));
  delete plan.now;
  const snapshot = await freezePublicDelta({...plan, now: Date.now()});
  const artifact = await writeDownloadZip(snapshot, args[1]);
  console.log(JSON.stringify({status: 'prepared_not_delivered', ...artifact, manifest: snapshot.manifest}, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
