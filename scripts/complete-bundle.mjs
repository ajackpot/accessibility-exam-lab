import {validatePublicationSelectionSnapshot,loadPublicationSelections,resolvePublicationIdentity,assertPublicationSelectionReference,assertNoPublicationExcludedContent} from './publication-selection.mjs';
import {completeManifestFormat,encodeSevenZip,decodeSevenZip,verifyArchiveFormat} from './archive-format.mjs';
import {validateNormalBackupChainSnapshot} from './normal-backup-chain.mjs';
import {validateNormalBackupRootSnapshot} from './normal-backup-root.mjs';
import {validateEvidenceLossSnapshot,assertEvidenceLossProvenance} from './evidence-loss-block.mjs';
import {validateQuarantineSnapshot} from './prepublication-quarantine.mjs';
/** Reviewed complete public snapshot packaging. No Git, network, upload or learner APIs. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {FREEZE_AT} from '../src/domain.js';
import {parsePublicAllowlist, safePublicPath, zipStored, writeDownloadZip} from './download-fallback.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const hex = /^[a-f0-9]{64}$/;
const fail = message => { throw new Error(message); };
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
// Private provenance for current writer checks; never serialized into the archive.
const completeSourceRoots=new WeakMap(),authorityRoot=path.resolve(import.meta.dirname,'..');
function keys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !equal(Object.keys(value).sort(), [...expected].sort())) fail(`Invalid ${label} fields`);
}
function inventory(entries) {
  if (!Array.isArray(entries) || !entries.length) fail('Complete reviewed inventory required');
  parsePublicAllowlist(entries.map(e => e.path).join('\n'));
  for (const e of entries) {
    keys(e, ['path','sha256','bytes'], 'inventory');
    if (!hex.test(e.sha256) || !Number.isSafeInteger(e.bytes) || e.bytes < 0) fail('Invalid inventory hash/size');
  }
  return [...entries].sort((a,b) => a.path.localeCompare(b.path));
}
async function readPublic(root, relative) {
  if (!safePublicPath(relative)) fail('Unsafe public path');
  const resolved = path.resolve(root);
  for (let cursor = resolved;; cursor = path.dirname(cursor)) {
    if ((await fs.lstat(cursor)).isSymbolicLink()) fail('Symlink root forbidden');
    if (cursor === path.dirname(cursor)) break;
  }
  let current = resolved;
  const parts = relative.split('/');
  for (const [i, part] of parts.entries()) {
    current = path.join(current, part); const stat = await fs.lstat(current);
    if (stat.isSymbolicLink() || (i === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())) fail(`Not a regular public file: ${relative}`);
  }
  return fs.readFile(current);
}
// A packaging-only overlay cannot alter runtime, data, original history or reports.
const policyPath = p => ['AGENTS.md','README.md','PUBLICATION-MANIFEST.txt','docs/PRD.md','docs/OPERATIONS.md','docs/DATA-CONTRACT.md','scripts/download-fallback.mjs','scripts/complete-bundle.mjs','tests/complete-bundle.test.mjs','scripts/blob-retry.mjs','tests/blob-retry.test.mjs','scripts/archive-format.mjs','scripts/sevenz-codec.py','scripts/release-bundle.mjs','scripts/release-backup-continuation.mjs','scripts/normal-backup-root.mjs','scripts/normal-backup-chain.mjs','scripts/offline-chain-continuation.mjs','tests/archive-format.test.mjs','tests/sevenz-codec.test.mjs','tests/release-bundle.test.mjs','tests/release-bundle-closure.test.mjs','tests/independent-offline-chains.test.mjs','tests/manual-round-eleven.test.mjs','tests/release-backup-successors.test.mjs','tests/normal-backup-continuation.test.mjs','tests/normal-backup-root.test.mjs','docs/packaging/packaging-policy-002.md'].includes(p);
function checkSource(source) {
  keys(source, ['roundId','deltaArtifactSha256','deltaManifestSha256','baseCommit','bankVersion','bankSha256','ledgerPath','ledgerSha256',...(Object.hasOwn(source,'selectionReference')?['selectionReference']:[])], 'source release');
  if (!/^(round|editorial)-\d+$/.test(source.roundId) || !/^[A-Za-z0-9_.-]+$/.test(source.bankVersion) || !/^[a-f0-9]{40}$/.test(source.baseCommit) || /^0+$/.test(source.baseCommit) || ![source.deltaArtifactSha256,source.deltaManifestSha256,source.bankSha256,source.ledgerSha256].every(v => hex.test(v)) || source.ledgerPath !== `docs/${source.roundId.startsWith('editorial-') ? 'corrections' : 'rounds'}/${source.roundId}.json`) fail('Invalid release identity');
}
function checkOverlay(base, files, policy) {
  const current = new Map(files.map(f => [f.path,f]));
  const old = new Map(base.map(f => [f.path,f]));
  for (const f of base) if (!current.has(f.path)) fail(`Complete snapshot dropped frozen file: ${f.path}`);
  const changes = files.filter(f => !old.has(f.path) || old.get(f.path).sha256 !== f.sha256).map(f => ({path:f.path,beforeSha256:old.get(f.path)?.sha256 ?? null,sha256:f.sha256,bytes:f.bytes}));
  if (!changes.length) { if (policy !== null) fail('Unnecessary packaging revision'); return; }
  keys(policy, ['revisionId','files'], 'packaging revision');
  if (!/^packaging-policy-\d+$/.test(policy.revisionId) || !equal(policy.files,changes) || changes.some(f => !policyPath(f.path))) fail('Packaging revision may change only exact reviewed support files');
}
/** Exact current policy dependency check; no publication or learner authority. */
export function checkNewSessionEligibilitySnapshot(files) {
  if(!Array.isArray(files))fail('Policy snapshot files required');
  const byPath=new Map(files.map(f=>[f.path,f]));
  if(byPath.size!==files.length)fail('Duplicate policy snapshot path');
  const policy='src/new-session-eligibility.js',report='docs/analysis/2026-10-10-existing-bank-value-terminal-decisions.json';
  const domain=byPath.get('src/domain.js')?.raw?.toString()??'';
  const manifestRaw=byPath.get('data/manifest.json')?.raw;
  const manifest=manifestRaw?JSON.parse(manifestRaw):null;
  const modern=domain.includes('new-session-eligibility.js')||byPath.has(policy)||byPath.has('docs/publication-selections/round-041-selection-001.json')||manifest?.bankVersion==='2026.10.10-regular.41-selection.1';
  if(!modern)return {feature:'historical_pre_policy'};
  const allow=byPath.get('PUBLICATION-MANIFEST.txt')?.raw;
  if(!allow)fail('Current policy allowlist required');
  const listed=new Set(parsePublicAllowlist(allow.toString()));
  for(const [p,digest]of [[policy,'a92cc9bd407741089027cc7d3a3fd2a060bcfa3b1f4d02b84ebd36865336a6cc'],[report,'c4443769d90c4b45a1d7e3a075f776744149e78733dacb6ee8493b6ceafc78f3']]){
    const raw=byPath.get(p)?.raw;if(!Buffer.isBuffer(raw)||!listed.has(p)||sha(raw)!==digest)fail('Exact new-session policy dependency required: '+p);
  }
  if(!domain.includes('new-session-eligibility.js'))fail('Current selected source must integrate new-session policy');
  return {feature:'existing-priority-001'};
}
function checkComplete(snapshot,now=null) {
  keys(snapshot, ['manifest','files'], 'complete snapshot');
  const {manifest:m,files} = snapshot;
  const format=completeManifestFormat(m);
  if (m.kind !== 'complete_project_not_learner_import' || !['download_only','release_backup'].includes(m.deliveryMode) || m.newlyPublishedRegular !== 0 || m.projectDirectory !== 'project' || !equal(m.prerequisiteArtifacts,[])) fail('Invalid standalone delivery contract');
  checkSource(m.sourceRelease); const base = inventory(m.frozenSourceInventory), entries = inventory(m.files);
  if (!equal(entries,m.files) || !equal(base,m.frozenSourceInventory) || !Array.isArray(files) || files.length !== entries.length) fail('Complete inventory ordering mismatch');
  checkOverlay(base,entries,m.packagingRevision);
  for (const [i,f] of files.entries()) {
    keys(f, ['path','sha256','bytes','raw'], 'complete frozen file');
    if (!Buffer.isBuffer(f.raw) || sha(f.raw) !== f.sha256 || f.raw.length !== f.bytes || !equal(entries[i],{path:f.path,sha256:f.sha256,bytes:f.bytes})) fail('Frozen complete bytes changed');
  }
  checkNewSessionEligibilitySnapshot(files);
  const byPath = new Map(files.map(f => [f.path,f]));
  const allow = byPath.get('PUBLICATION-MANIFEST.txt');
  if (!allow || !equal(parsePublicAllowlist(allow.raw.toString()).sort(), entries.map(e=>e.path).sort())) fail('Complete inventory must equal entire publication allowlist');
  const required=['.nojekyll','README.md','AGENTS.md','package.json','package-lock.json','index.html','style.css','src/app.js','src/domain.js','src/workflows.js','src/storage.js','src/backup.js','src/legacy-materials.js','src/legacy-question-display.js','src/reviewed-option-explanations.js','scripts/build.mjs','scripts/check.mjs','scripts/validate-bank.mjs','scripts/validate-round.mjs','scripts/release-guard.mjs','scripts/bank-io.mjs','scripts/editorial-ledger.mjs','scripts/explanation-authoring.mjs','scripts/download-fallback.mjs','scripts/complete-bundle.mjs','data/publication-state.json','docs/PRD.md','docs/OPERATIONS.md','docs/DATA-CONTRACT.md','tests/complete-bundle.test.mjs'];
  if(format==='7z')required.push('scripts/archive-format.mjs','scripts/sevenz-codec.py','tests/archive-format.test.mjs','tests/sevenz-codec.test.mjs');
  if(required.some(p=>!byPath.has(p)) || !files.some(f=>f.path.startsWith('qa/'))) fail('Incomplete standalone project prerequisites');
  const release=m.sourceRelease, manifest=JSON.parse(byPath.get('data/manifest.json')?.raw || 'null');
  const bank=byPath.get(`data/releases/${release.bankVersion}/bank.json`), ledger=byPath.get(release.ledgerPath);
  if (!manifest || manifest.bankVersion !== release.bankVersion || manifest.sha256 !== release.bankSha256 || manifest.file !== `releases/${release.bankVersion}/bank.json` || bank?.sha256 !== release.bankSha256 || ledger?.sha256 !== release.ledgerSha256) fail('Complete runtime manifest/bank/ledger identity mismatch');
  const b=JSON.parse(bank.raw), l=JSON.parse(ledger.raw);
  const selectionAuthority=validatePublicationSelectionSnapshot(files,{now:now??Date.now()}),identity=resolvePublicationIdentity(l,selectionAuthority);
  if(identity.selectionReference)assertPublicationSelectionReference(release.selectionReference,identity);else if(Object.hasOwn(release,'selectionReference'))fail('Unexpected selected source reference');
  if(identity.selectionReference&&(m.deliveryMode!=='release_backup'||format!=='7z'))fail('Selected COMPLETE requires release_backup schema-v2 7z');
  assertNoPublicationExcludedContent(b,selectionAuthority);
  if (b.bankVersion !== release.bankVersion || (l.roundId || l.correctionRoundId) !== release.roundId || l.status !== 'closed' || identity.effectiveBankVersion !== release.bankVersion || identity.effectiveBankSha256 !== release.bankSha256) fail('Complete release has no matching closed ledger');
  validateNormalBackupRootSnapshot(files,{now});
  validateNormalBackupChainSnapshot(files,{now,requireCurrentEligibility:true});
  validateEvidenceLossSnapshot(files,{now});
  assertEvidenceLossProvenance(m.sourceRelease);
  validateQuarantineSnapshot(files,{now});
  if (manifest.finalRelease || JSON.parse(byPath.get('data/publication-state.json')?.raw || 'null')?.finalized) fail('Persistent freeze blocks new complete packaging');
}
export async function freezeCompleteProject({workRoot, reviewedInventory, sourceRelease, frozenSourceInventory = reviewedInventory, packagingRevision = null, deliveryMode = 'download_only', archiveFormat = '7z', now = Date.now()}) {
  if (!Number.isFinite(now) || now >= FREEZE_AT) fail('Final cutoff blocks new complete packaging');
  if(!['7z','zip'].includes(archiveFormat))fail('Unsupported complete archive format');
  const entries=inventory(reviewedInventory), files=[];
  for (const e of entries) {
    const raw=await readPublic(workRoot,e.path);
    if (sha(raw)!==e.sha256 || raw.length!==e.bytes) fail(`Reviewed complete bytes mismatch: ${e.path}`);
    files.push({...e,raw:Buffer.from(raw)});
  }
  const snapshot={manifest:{schemaVersion:archiveFormat==='7z'?2:1,...(archiveFormat==='7z'?{archiveFormat:'7z'}:{}),kind:'complete_project_not_learner_import',deliveryMode,newlyPublishedRegular:0,projectDirectory:'project',prerequisiteArtifacts:[],sourceRelease:{...sourceRelease},frozenSourceInventory:inventory(frozenSourceInventory),packagingRevision:structuredClone(packagingRevision),files:entries},files};
  checkComplete(snapshot,now);completeSourceRoots.set(snapshot,path.resolve(workRoot));return snapshot;
}
export function completeInstructions(m) {
  const historical=`전체 적용본 / ${m.sourceRelease.roundId}\n\n이 ZIP 하나로 최신 프로젝트를 준비할 수 있습니다. 이전 회차 ZIP이나 변경분을 순서대로 적용할 필요가 없습니다.\n포함 은행: ${m.sourceRelease.bankVersion}\n은행 SHA-256: ${m.sourceRelease.bankSha256}\n\n1. 새 빈 폴더에 압축을 풉니다. project/ 폴더가 완전한 프로젝트 루트입니다.\n2. Node.js 22 이상과 Python 3이 있는 환경에서 project/ 안에서 npm run check, npm test, npm run build를 실행합니다. 별도 npm 패키지 설치는 필요하지 않습니다. 확인 후 npm run serve로 실행하고 http://localhost:4173/에 접속합니다. index.html을 파일로 직접 열지 않습니다.\n3. 기존 프로젝트/배포를 교체하려면 먼저 기존 프로젝트 파일과 앱에서 내보낸 학습 기록 백업을 별도 보관합니다. 빈 폴더에서 검증한 project/의 공개 파일만 기존과 같은 상대 경로로 배포하고, 관련 없는 사용자 파일이나 서버 설정을 삭제하지 않습니다. 기존 Git 작업 사본의 .git을 교체하거나 강제 push하지 않습니다. 충돌하는 자체 수정이 있으면 먼저 비교합니다.\n4. 브라우저의 저장 데이터·학습 기록을 지우지 않습니다. 같은 브라우저와 같은 사이트 주소(프로토콜·호스트·포트)를 유지해야 기존 기록에 계속 접근할 수 있습니다. 주소를 바꾸면 기록이 별도로 보일 수 있으므로 앱의 학습 기록 백업 기능으로 보존·복원합니다. 이 ZIP 자체는 앱의 학습 기록 가져오기에 넣지 않습니다.\n5. 전체본과 변경분은 같은 회차의 두 전달 방식입니다. 전체본을 사용했다면 해당 변경분을 다시 적용하지 않습니다. manifest.json에는 모든 프로젝트 경로·크기·SHA-256과 출처가 있습니다. 선행 ZIP 해시는 이력 확인용이며 설치 전제조건이 아닙니다.\n6. 이 파일 전달 자체는 GitHub/Pages 배포 완료를 뜻하지 않습니다. 자동 Git 작업은 하지 않으며 기존 권한·미확정 결과·최종 동결 제한을 유지합니다. 실제 공개 완료는 별도로 확인합니다.\n`;
  if(completeManifestFormat(m)==='zip')return historical;
  return historical.replace('이 ZIP 하나로','이 7z 하나로').replace('이 ZIP 자체는','이 7z 자체는').replace('1. 새 빈 폴더에 압축을 풉니다.', '1. 7z를 지원하는 일반 압축 해제 도구로 새 빈 폴더에 한 번 압축을 풉니다. 전용 복원 스크립트나 이전 압축 파일은 필요하지 않습니다.');
}
/** Historical schema-v1 ZIP writer; never silently relabels a schema-v2 payload. */
export async function writeCompleteZip(snapshot, outputPath, {now=Date.now()}={}) {
  if (!Number.isFinite(now) || now>=FREEZE_AT) fail('Final cutoff blocks new complete ZIP');
  checkComplete(snapshot,now);
  if(completeManifestFormat(snapshot.manifest)!=='zip')fail('Historical ZIP writer requires explicit schema-v1 ZIP snapshot');
  if(path.extname(outputPath).toLowerCase()!=='.zip')fail('Historical ZIP output requires .zip extension');
  const raw=zipStored([{name:'manifest.json',raw:json(snapshot.manifest)},{name:'APPLY-KO.txt',raw:Buffer.from(completeInstructions(snapshot.manifest))},...snapshot.files.map(f=>({name:`project/${f.path}`,raw:f.raw}))],{compress:true});
  await fs.writeFile(outputPath,raw,{flag:'wx'});
  return {path:outputPath,sha256:sha(raw),bytes:raw.length,manifestSha256:sha(json(snapshot.manifest)),fileCount:snapshot.files.length};
}
async function assertLiveCompleteFreeze(snapshot){
  const sourceRoot=completeSourceRoots.get(snapshot);if(!sourceRoot)fail('Current 7z writer requires the original frozen snapshot and source root');
  for(const root of new Set([authorityRoot,sourceRoot])){
    const manifest=JSON.parse(await readPublic(root,'data/manifest.json')),state=JSON.parse(await readPublic(root,'data/publication-state.json'));
    if(manifest.finalRelease!==false||state.finalized!==false)fail('Live authority/source freeze blocks complete 7z packaging');
  }
}
/** Current standalone transport. Verify the actual decoded bytes before writing. */
export async function writeCompleteArchive(snapshot,outputPath,{now=Date.now()}={}){
  if(!Number.isFinite(now)||now>=FREEZE_AT)fail('Final cutoff blocks new complete archive');
  checkComplete(snapshot,now);
  if(completeManifestFormat(snapshot.manifest)!=='7z'||path.extname(outputPath).toLowerCase()!=='.7z')fail('Current COMPLETE requires schema-v2 7z and .7z output');
  try{await fs.lstat(outputPath);fail('EEXIST: preserve immutable complete archive');}catch(e){if(e.code!=='ENOENT')throw e;}
  await assertLiveCompleteFreeze(snapshot);
  const entries=[{name:'manifest.json',raw:json(snapshot.manifest)},{name:'APPLY-KO.txt',raw:Buffer.from(completeInstructions(snapshot.manifest))},...snapshot.files.map(f=>({name:'project/'+f.path,raw:f.raw}))];
  const raw=encodeSevenZip(entries),decoded=decodeSevenZip(raw);verifyArchiveFormat(decoded,'7z');
  if(decoded.size!==entries.length||entries.some(e=>!decoded.get(e.name)?.equals(e.raw)))fail('Complete 7z exact decoded bytes differ');
  // Compression is potentially lengthy; recheck wall-clock and freeze after it.
  const completedNow=Math.max(now,Date.now());if(completedNow>=FREEZE_AT)fail('Final cutoff crossed during complete packaging');checkComplete(snapshot,completedNow);
  await assertLiveCompleteFreeze(snapshot);
  if(Date.now()>=FREEZE_AT)fail('Final cutoff crossed at complete write boundary');
  await fs.writeFile(outputPath,raw,{flag:'wx'});
  return {path:outputPath,archiveFormat:'7z',sha256:sha(raw),bytes:raw.length,manifestSha256:sha(json(snapshot.manifest)),fileCount:snapshot.files.length};
}
/** Mandatory future delivery pair. Partial preparation is never delivery. */
export async function writeOfflineDeliveryPair({deltaSnapshot, workRoot, reviewedInventory, deltaOutputPath, completeOutputPath, now=Date.now()}) {
  if (path.resolve(deltaOutputPath)===path.resolve(completeOutputPath)) fail('Delta and complete paths must differ');
  for (const name of [deltaOutputPath,completeOutputPath]) { try { await fs.lstat(name); fail('Output already exists; preserve immutable artifacts'); } catch(e) { if(e.code!=='ENOENT') throw e; } }
  // Check complete review bytes before creating either output.
  const entries=inventory(reviewedInventory);
  const selectedAuthority=await loadPublicationSelections(workRoot,{now});
  const currentManifest=JSON.parse(await readPublic(workRoot,'data/manifest.json'));
  for(const e of entries.filter(e=>/^docs\/rounds\/round-\d+\.json$/.test(e.path))){const id=resolvePublicationIdentity(JSON.parse(await readPublic(workRoot,e.path)),selectedAuthority);if(id.selectionReference&&id.effectiveBankVersion===currentManifest.bankVersion)fail('Selected release requires normal release_backup pair, not legacy timeout delivery');}
  for(const e of entries) { const raw=await readPublic(workRoot,e.path); if(sha(raw)!==e.sha256 || raw.length!==e.bytes) fail(`Reviewed complete bytes mismatch: ${e.path}`); }
  const entryMap=new Map(entries.map(e=>[e.path,e]));
  for(const e of deltaSnapshot.manifest.files) if(entryMap.get(e.path)?.sha256!==e.sha256 || entryMap.get(e.path)?.bytes!==e.bytes) fail('Delta and complete release bytes differ');
  for(const e of deltaSnapshot.manifest.deletions) if(entryMap.has(e.path)) fail('Complete release retains a deleted delta path');
  if(path.extname(deltaOutputPath).toLowerCase()!=='.zip'||path.extname(completeOutputPath).toLowerCase()!=='.7z')fail('Delivery pair requires DELTA.zip and COMPLETE.7z');
  const delta=await writeDownloadZip(deltaSnapshot,deltaOutputPath,{now});
  const m=JSON.parse(await readPublic(workRoot,'data/manifest.json'));
  const candidates=[];
  for(const e of entries.filter(e=>/^docs\/(?:rounds\/round-\d+|corrections\/editorial-\d+)\.json$/.test(e.path))) { const l=JSON.parse(await readPublic(workRoot,e.path)); if(l.publication?.bankVersion===m.bankVersion && l.publication?.bankSha256===m.sha256) candidates.push({path:e.path,id:l.roundId||l.correctionRoundId}); }
  if(candidates.length!==1) fail('Complete active release needs one exact source ledger');
  const ledgerPath=candidates[0].path;
  const sourceRelease={roundId:candidates[0].id,deltaArtifactSha256:delta.sha256,deltaManifestSha256:sha(json(deltaSnapshot.manifest)),baseCommit:deltaSnapshot.manifest.baseCommit,bankVersion:m.bankVersion,bankSha256:m.sha256,ledgerPath,ledgerSha256:sha(await readPublic(workRoot,ledgerPath))};
  const snapshot=await freezeCompleteProject({workRoot,reviewedInventory:entries,sourceRelease,now});
  const complete=await writeCompleteArchive(snapshot,completeOutputPath,{now});
  return {status:'prepared_not_delivered',delta,complete,completeManifest:snapshot.manifest};
}
/** Full-delivery receipts are separate from immutable delta provenance chains. */
export function createCompleteReceipt({snapshot,artifact,status='prepared',recordedAt}) {
  checkComplete(snapshot,Date.parse(recordedAt));
  if(!['prepared','delivered','delivery_failed'].includes(status)||!hex.test(artifact.sha256)||artifact.manifestSha256!==sha(json(snapshot.manifest))||typeof recordedAt!=='string'||!Number.isFinite(Date.parse(recordedAt))) fail('Invalid complete delivery receipt');
  return {receiptSchemaVersion:1,kind:'complete_project_delivery',artifactSha256:artifact.sha256,manifestSha256:artifact.manifestSha256,sourceDeltaArtifactSha256:snapshot.manifest.sourceRelease.deltaArtifactSha256,roundId:snapshot.manifest.sourceRelease.roundId,bankVersion:snapshot.manifest.sourceRelease.bankVersion,bankSha256:snapshot.manifest.sourceRelease.bankSha256,status,recordedAt,newlyPublishedRegular:0};
}
