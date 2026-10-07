/** Narrow bridge from exact delivered normal backups. Never rewrites manifests or performs Git. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import reviewedCheckpointTrust from '../docs/deliveries/release-backup-trust.json' with {type:'json'};
import {inflateRawSync} from 'node:zlib';
import {isDeepStrictEqual as equal} from 'node:util';
import {FREEZE_AT} from '../src/domain.js';
import {parsePublicAllowlist, advanceGitPermissionWait, advanceReconciliationWait} from './download-fallback.mjs';
const hash = b => createHash('sha256').update(b).digest('hex');
const json = o => Buffer.from(JSON.stringify(o,null,2)+'\n');
const fail = message => {throw Error(message);};
export const NORMAL_BACKUP_PATH = 'docs/deliveries/normal-backup-009.json';
// Empty until actual terminal evidence and durable reconciliation skip have been independently reviewed.
export const NORMAL_BACKUP_PROOF_SHA256 = '09d3204e96048f6d8ff57dd4616caa8c95d161690e2a4592e3fa090142604f9e';
export const NORMAL_BACKUP_SKIP_SHA256 = 'da7c93180ae2fa4c904fc25aa38fe1540c71fc6fcbf146627a74731ec98316de';
const TERMINAL_EVIDENCE_SHA256 = '5b65013b4a67b182855cb6438453478e307f690d67ff5f3a42995565b5e0c658';
export const NORMAL_BACKUP_PINS = Object.freeze({
 delta:'b149e25ccbef96e7aacb4aed769ef5b89d0eb36c136e8de6f0328664dda63a24',
 complete:'d26394d80b6bc122674b972b955b6523159cf5c156d798806b9bc9303469ec27',
 deltaManifest:'fb2f4906cccdf42d15c958de9567af1d042240ebd57ce36ecfd520aa5e62b95d',
 completeManifest:'f97249f93b07e1e55e532064dd05919e36631a56aa8edc667cf1de5abaf37c0f',
 ledger:'6d62f1f3d2f8ed6343b5e4e05f523338395dc3396ad5b7d3eaa67345cbaa0bde',
 libraryReceipt:'5c86f4efe75d876c542eb68d0a6b5757ac8a7197c6e9aadbb723ae4efba7e468',
 attachmentReceipt:'18341c270ef0a9885bfff28787358b4163817189526db0aebb0897de4c8a321c'
});
function keys(o, expected) {if(!o||!equal(Object.keys(o).sort(),expected.sort()))fail('Unexpected continuation proof fields');}
function crc32(raw){let c=0xffffffff;for(const byte of raw){c^=byte;for(let i=0;i<8;i++)c=c&1?(c>>>1)^0xedb88320:c>>>1;}return(c^0xffffffff)>>>0;}
/** The reviewed archive writer uses unencrypted, single-disk ZIP32 with no descriptors. */
function archive(raw, pin){
 if(!Buffer.isBuffer(raw)||hash(raw)!==pin)fail('Exact delivered ZIP hash required');
 if(raw.length<22)fail('Truncated delivered ZIP');
 const entries=new Map(),headers=[];let at=0;
 while(at+30<=raw.length&&raw.readUInt32LE(at)===0x04034b50){
  const flag=raw.readUInt16LE(at+6),method=raw.readUInt16LE(at+8),crc=raw.readUInt32LE(at+14),packed=raw.readUInt32LE(at+18),size=raw.readUInt32LE(at+22),nl=raw.readUInt16LE(at+26),xl=raw.readUInt16LE(at+28);
  if(flag!==0x800||raw.readUInt16LE(at+4)!==20||xl!==0||![0,8].includes(method)||size>32*1024*1024||at+30+nl+xl+packed>raw.length)fail('Unsupported or truncated delivered ZIP entry');
  const filename=raw.subarray(at+30,at+30+nl);if(!nl||filename.some(b=>b<0x21||b>0x7e))fail('Delivered ZIP filenames must use safe ASCII bytes');
  const name=filename.toString('ascii');parsePublicAllowlist(name.replace(/^(?:files|project)\//,''));if([...entries.keys()].some(p=>p.toLowerCase()===name.toLowerCase()))fail('Duplicate archive path');
  const start=at+30+nl+xl,end=start+packed,b=method===8?inflateRawSync(raw.subarray(start,end),{maxOutputLength:Math.max(1,size)}):raw.subarray(start,end);
  if(b.length!==size||crc32(b)!==crc)fail('Delivered ZIP CRC/size mismatch');entries.set(name,b);headers.push({name,flag,method,crc,packed,size,offset:at});at=end;
 }
 const directoryAt=at;
 for(const h of headers){
  if(at+46>raw.length||raw.readUInt32LE(at)!==0x02014b50)fail('Missing delivered ZIP central directory');
  const nl=raw.readUInt16LE(at+28),xl=raw.readUInt16LE(at+30),cl=raw.readUInt16LE(at+32),end=at+46+nl+xl+cl,attributes=raw.readUInt32LE(at+38);
  if(raw.readUInt16LE(at+4)!==20||raw.readUInt16LE(at+6)!==20||xl!==0||cl!==0||raw.readUInt16LE(at+36)!==0||attributes!==0)fail('Delivered ZIP requires writer metadata: regular nonspecial files, no extras/comments');
  if(end>raw.length||raw.readUInt16LE(at+8)!==h.flag||raw.readUInt16LE(at+10)!==h.method||raw.readUInt32LE(at+16)!==h.crc||raw.readUInt32LE(at+20)!==h.packed||raw.readUInt32LE(at+24)!==h.size||raw.readUInt16LE(at+34)!==0||raw.readUInt32LE(at+42)!==h.offset||raw.subarray(at+46,at+46+nl).toString('utf8')!==h.name)fail('Delivered ZIP central/local entries differ');
  at=end;
 }
 if(at+22!==raw.length||raw.readUInt32LE(at)!==0x06054b50||raw.readUInt16LE(at+4)!==0||raw.readUInt16LE(at+6)!==0||raw.readUInt16LE(at+8)!==headers.length||raw.readUInt16LE(at+10)!==headers.length||raw.readUInt32LE(at+12)!==at-directoryAt||raw.readUInt32LE(at+16)!==directoryAt||raw.readUInt16LE(at+20)!==0)fail('Invalid delivered ZIP end/inventory');
 return entries;
}
function inspectArchive(entries,manifest,prefix){
 const expected=['manifest.json','APPLY-KO.txt',...manifest.files.map(f=>prefix+f.path)].sort();
 if(!equal([...entries.keys()].sort(),expected))fail('ZIP inventory differs from exact manifest');
 parsePublicAllowlist(manifest.files.map(f=>f.path).join('\n'));
 for(const f of manifest.files){const b=entries.get(prefix+f.path);if(b.length!==f.bytes||hash(b)!==f.sha256)fail('ZIP file hash differs: '+f.path);}
}
function timing(proof,now,publicationState){
 if(!Number.isFinite(now)||now>=FREEZE_AT||publicationState?.finalized)fail('Final cutoff or persistent freeze blocks normal-backup continuation');
 const terminal=proof.terminal;
 keys(terminal,['permissionWait','gitOutcome','reconciliation','sourceEvidenceSha256','sourceTerminalSha256','sourceObservationSha256','sourceReconciliationSha256']);
 const wait=terminal.permissionWait,outcome=terminal.gitOutcome,reconciliation=terminal.reconciliation;
 keys(wait,['roundId','executionId','notifiedAt','deadlineAt','state','stoppedAt']);
 keys(outcome,['refStatus','observedHead','expectedCommit','observedAt','refWrite','objects','cancellation']);
 if(reconciliation)keys(reconciliation,['artifactSha256','firstUnresolvedAt','deadlineAt','state','skippedAt']);
 if(wait?.roundId!=='round-009'||wait.state!=='download_only'||wait.notifiedAt!=='2026-10-04T09:51:07Z'||Date.parse(wait.deadlineAt)!==Date.parse('2026-10-04T10:01:07Z')||!wait.stoppedAt)fail('Actual terminal permission timeout evidence required');
 // Validate terminal clocks at their recorded instant; do not synthesize a future event.
 advanceGitPermissionWait(wait,{now:Date.parse(wait.stoppedAt)});
 if(outcome?.refWrite!=='not_submitted'||outcome.expectedCommit!==null||!['none','created','unknown'].includes(outcome.objects)||outcome.observedHead!==proof.deltaManifest.baseCommit||outcome.refStatus!=='unchanged'||Date.parse(outcome.observedAt)<Date.parse(wait.stoppedAt))fail('Conflicting or unverified ref outcome blocks continuation');
 if(terminal.sourceEvidenceSha256!==TERMINAL_EVIDENCE_SHA256||terminal.sourceTerminalSha256!=='9832b9755a695f90acf4c207d138c4ba4a183c79cbd8c629bf24dc5eb5d13c28'||terminal.sourceObservationSha256!=='79001e5d570cc6007638bc773cce9590989cacbc4646c4629554fdc305279581')fail('Original terminal source evidence hash required');
 let eligible=Math.max(Date.parse(proof.verifiedAt),Date.parse(proof.attachmentAcceptedAt),Date.parse(wait.stoppedAt),Date.parse(outcome.observedAt));
 if(outcome.objects==='unknown'){
  if(!reconciliation||reconciliation.artifactSha256!==NORMAL_BACKUP_PINS.delta||reconciliation.firstUnresolvedAt!=='2026-10-04T10:02:05.215Z')fail('Original independent reconciliation clock required');
  if(reconciliation.state==='skip_git_step'?(terminal.sourceReconciliationSha256!==NORMAL_BACKUP_SKIP_SHA256||!NORMAL_BACKUP_SKIP_SHA256):terminal.sourceReconciliationSha256!==null)fail('Exact durable skip source hash required');
  advanceReconciliationWait(reconciliation,{now:Math.max(Date.parse(reconciliation.firstUnresolvedAt),Date.parse(reconciliation.skippedAt)||0)});
  eligible=Math.max(eligible,Date.parse(reconciliation.deadlineAt),Date.parse(reconciliation.skippedAt)||0);
 }else if(reconciliation!==null)fail('Unexpected unresolved reconciliation evidence');
 return {eligibleAt:new Date(eligible).toISOString(),eligible:now>=eligible&&(outcome.objects!=='unknown'||reconciliation.state==='skip_git_step'),observed:now>=Date.parse(wait.stoppedAt)};
}
function inspectProof(proof){
 keys(proof,['schemaVersion','kind','deltaArtifactSha256','completeArtifactSha256','libraryReceiptSha256','attachmentReceiptSha256','attachmentAcceptedAt','userOpenOrDownloadObserved','verifiedAt','deltaManifest','completeManifest','terminal']);
 if(proof.schemaVersion!==1||proof.kind!=='normal_release_backup_continuation'||proof.deltaArtifactSha256!==NORMAL_BACKUP_PINS.delta||proof.completeArtifactSha256!==NORMAL_BACKUP_PINS.complete||proof.libraryReceiptSha256!==NORMAL_BACKUP_PINS.libraryReceipt||proof.attachmentReceiptSha256!==NORMAL_BACKUP_PINS.attachmentReceipt||proof.attachmentAcceptedAt!=='2026-10-04T09:51:07.219995Z'||proof.userOpenOrDownloadObserved!==false||hash(json(proof.deltaManifest))!==NORMAL_BACKUP_PINS.deltaManifest||hash(json(proof.completeManifest))!==NORMAL_BACKUP_PINS.completeManifest)fail('Missing or changed delivered normal backup proof');
 if(!Number.isFinite(Date.parse(proof.verifiedAt))||Date.parse(proof.verifiedAt)<Date.parse(proof.attachmentAcceptedAt))fail('Actual completed verification checkpoint required');
 if(proof.deltaManifest.deliveryMode!=='release_backup'||proof.completeManifest.deliveryMode!=='release_backup'||proof.completeManifest.sourceRelease.ledgerSha256!==NORMAL_BACKUP_PINS.ledger)fail('Original normal manifests must remain unchanged');
}
export function parseNormalBackupProof(raw){
 if(!Buffer.isBuffer(raw)||!NORMAL_BACKUP_PROOF_SHA256||hash(raw)!==NORMAL_BACKUP_PROOF_SHA256)fail('Exact normal-backup proof bytes are absent, unreviewed or tampered');
 return JSON.parse(raw);
}
/** Read-only validation against full original history; inactive evidence never emits a future baseline. */
export function validateNormalBackupContinuation(proof,{now=Date.now(),publicationState=null,manifest=null,ledgers=[],ledgerSources=new Map(),banks=new Map(),offlineBases=new Map()}={}){
 if(!NORMAL_BACKUP_PROOF_SHA256||hash(json(proof))!==NORMAL_BACKUP_PROOF_SHA256)fail('Normal-backup proof is absent, unreviewed or tampered');
 inspectProof(proof);
 if(!manifest||manifest.finalRelease!==false)fail('Missing manifest or persistent manifest freeze blocks normal-backup continuation');
 if(!publicationState||publicationState.finalized!==false)fail('Missing publication state or persistent freeze blocks normal-backup continuation');
 const state=timing(proof,now,publicationState),source=proof.completeManifest.sourceRelease;
 const sources=ledgers.filter(l=>l.roundId===source.roundId),raw=ledgerSources.get(source.roundId);
 // Earlier subset audits cannot consume future delivery evidence.
 if(now<Date.parse(proof.attachmentAcceptedAt)||!sources.length&&!ledgers.some(l=>Date.parse(l.startedAt)>Date.parse(proof.attachmentAcceptedAt)||l.baseline?.offlinePredecessor?.roundId===source.roundId))return {canStartNewContent:false,canPublish:false,eligibleAt:state.eligibleAt,offlineBase:null};
 if(sources.length!==1||!raw||hash(raw)!==source.ledgerSha256||!equal(JSON.parse(raw),sources[0]))fail('Original final009 ledger and all decisions must remain exact');
 const inventory=new Map(proof.completeManifest.files.map(f=>[f.path,f]));
 for(const [version,entry] of banks){const f=inventory.get(`data/releases/${version}/bank.json`);if(f&&hash(entry.raw)!==f.sha256)fail('Historical immutable bank changed');}
 for(const f of proof.completeManifest.files.filter(f=>/^docs\/rounds\/round-\d+\.json$/.test(f.path))){const id=path.basename(f.path,'.json'),bytes=ledgerSources.get(id);if(!bytes||hash(bytes)!==f.sha256)fail('Original campaign ledger is missing or changed');}
 if(!banks.has(source.bankVersion)||hash(banks.get(source.bankVersion).raw)!==source.bankSha256)fail('Exact delivered regular9 bank required');
 if([...offlineBases].some(([artifact,e])=>artifact===NORMAL_BACKUP_PINS.delta||e.roundId===source.roundId))fail('Duplicate or conflicting normal-backup baseline');
 if(!state.eligible)return {canStartNewContent:false,canPublish:false,eligibleAt:state.eligibleAt,offlineBase:null};
 const offlineBase={roundId:source.roundId,bankVersion:source.bankVersion,bankSha256:source.bankSha256,ledgerSha256:source.ledgerSha256,manifestSha256:NORMAL_BACKUP_PINS.deltaManifest,baseCommit:source.baseCommit,recordedAt:proof.attachmentAcceptedAt,eligibleAt:state.eligibleAt};
 return {canStartNewContent:true,canPublish:false,eligibleAt:state.eligibleAt,offlineBase,artifactSha256:NORMAL_BACKUP_PINS.delta,newlyPublishedRegular:0,reservedLearningGoalIds:sources[0].candidates.filter(c=>c.decision==='accepted').map(c=>c.learningGoalId).sort()};
}
/** Archive-only fallback cannot authorize current work. Verify the importing
 * authority at the real current boundary before and after an exact historical
 * audit; absent proof is never enough to take this route successfully. */
async function validateDeliveredArchiveCampaign(root,now) {
 const {loadRoundContext,validateReleaseLedger,auditHistoricalRelease}=await import('./validate-round.mjs');
 const {PUBLICATION_SYNCHRONIZATIONS}=await import('./publication-sync.mjs');
 let missing=false;
 for(const pin of PUBLICATION_SYNCHRONIZATIONS)try{await fs.lstat(path.join(root,pin.path));}catch(error){if(error.code!=='ENOENT')throw error;missing=true;}
 if(!missing) {
  const context=await loadRoundContext(root,null,{release:true,now});
  const checked=validateReleaseLedger(context.ledgers,{...context,now});
  if(!checked.ok)fail('Invalid full delivered campaign: '+checked.errors.join('; '));
  return;
 }
 const current=async()=>{
  const authority=path.resolve(import.meta.dirname,'..'),at=Date.now();
  checkOpen({now:at,manifest:JSON.parse(await publicBytes(authority,'data/manifest.json')),publicationState:JSON.parse(await publicBytes(authority,'data/publication-state.json'))});
  const context=await loadRoundContext(authority,null,{release:true,now:at});
  const checked=validateReleaseLedger(context.ledgers,{...context,now:at});
  if(!checked.ok)fail('Current authority failed full release gate: '+checked.errors.join('; '));
 };
 await current();
 const historical=await auditHistoricalRelease(root);
 if(!historical.ok)fail('Invalid exact historical delivered campaign: '+historical.errors.join('; '));
 await current();
}
/** Private preparation: exact ZIPs and original private receipts in, sanitized proof out.
 * Caller must independently review and pin the actual terminal evidence before installing proof.
 * No output file, upload, Git operation or permission request is performed here. */
export async function prepareNormalBackupContinuation({deltaZip,completeZip,libraryReceiptRaw,attachmentReceiptRaw,terminalEvidenceRaw,reconciliationRaw=null,now=Date.now()}){
 if(hash(libraryReceiptRaw)!==NORMAL_BACKUP_PINS.libraryReceipt||hash(attachmentReceiptRaw)!==NORMAL_BACKUP_PINS.attachmentReceipt)fail('Exact verified Library and attachment evidence required');
 if(!Buffer.isBuffer(terminalEvidenceRaw)||hash(terminalEvidenceRaw)!==TERMINAL_EVIDENCE_SHA256)fail('Exact actual publisher timeout evidence required');
 const actual=JSON.parse(terminalEvidenceRaw);
 let reconciliation={artifactSha256:actual.reconciliation.artifactSha256,firstUnresolvedAt:actual.reconciliation.firstUnresolvedAt,deadlineAt:actual.reconciliation.deadlineAt,state:'reconciliation_wait',skippedAt:null};
 if(reconciliationRaw!==null){
  if(!Buffer.isBuffer(reconciliationRaw)||!NORMAL_BACKUP_SKIP_SHA256||hash(reconciliationRaw)!==NORMAL_BACKUP_SKIP_SHA256)fail('Exact actual durable reconciliation skip required');
  const skipped=JSON.parse(reconciliationRaw);
  if(skipped.artifactSha256!==reconciliation.artifactSha256||skipped.firstUnresolvedAt!==reconciliation.firstUnresolvedAt||skipped.deadlineAt!==reconciliation.deadlineAt||skipped.state!=='skip_git_step'||Date.parse(skipped.skippedAt)>now)fail('Reconciliation cannot reset its original clock or skip early');
  reconciliation=skipped;
 }
 const terminal={permissionWait:{roundId:actual.roundId,executionId:actual.executionId,notifiedAt:actual.permissionNotificationAt,deadlineAt:actual.permissionDeadlineAt,state:actual.status,stoppedAt:actual.terminalAt},gitOutcome:{refStatus:'unchanged',observedHead:actual.gitOutcome.observedHead,expectedCommit:null,observedAt:actual.gitOutcome.observedAt,refWrite:actual.gitOutcome.ref,objects:actual.gitOutcome.blob.outcome,cancellation:actual.gitOutcome.cancellation.requestStatus},reconciliation,sourceEvidenceSha256:hash(terminalEvidenceRaw),sourceTerminalSha256:'9832b9755a695f90acf4c207d138c4ba4a183c79cbd8c629bf24dc5eb5d13c28',sourceObservationSha256:'79001e5d570cc6007638bc773cce9590989cacbc4646c4629554fdc305279581',sourceReconciliationSha256:reconciliationRaw===null?null:hash(reconciliationRaw)};
 const saved=JSON.parse(libraryReceiptRaw),attached=JSON.parse(attachmentReceiptRaw);
 if(saved.status!=='library_saved_attachment_pending'||attached.status!=='native_attachments_accepted'||!equal(saved.artifacts,attached.artifacts))fail('Both original attachments must be accepted');
 const delta=archive(deltaZip,NORMAL_BACKUP_PINS.delta),complete=archive(completeZip,NORMAL_BACKUP_PINS.complete),deltaManifest=JSON.parse(delta.get('manifest.json')),completeManifest=JSON.parse(complete.get('manifest.json'));
 const proof={schemaVersion:1,kind:'normal_release_backup_continuation',deltaArtifactSha256:NORMAL_BACKUP_PINS.delta,completeArtifactSha256:NORMAL_BACKUP_PINS.complete,libraryReceiptSha256:hash(libraryReceiptRaw),attachmentReceiptSha256:hash(attachmentReceiptRaw),attachmentAcceptedAt:attached.attachmentAcceptedAt,userOpenOrDownloadObserved:attached.userOpenOrDownloadObserved,verifiedAt:new Date(now).toISOString(),deltaManifest,completeManifest,terminal};
 inspectProof(proof);timing(proof,now,null);
 if(Date.parse(terminal.permissionWait.stoppedAt)>now||Date.parse(terminal.gitOutcome.observedAt)>now)fail('Premature terminal evidence');
 inspectArchive(delta,deltaManifest,'files/');inspectArchive(complete,completeManifest,'project/');
 if(!equal(parsePublicAllowlist(complete.get('project/PUBLICATION-MANIFEST.txt').toString()).sort(),completeManifest.files.map(f=>f.path).sort()))fail('Full inventory must equal original allowlist');
 for(const f of deltaManifest.files)if(!equal(delta.get('files/'+f.path),complete.get('project/'+f.path)))fail('Delta/full content differs');
 // Full campaign validation uses the delivered snapshot, never workspace-only evidence.
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'normal-backup-verified-'));
 try{
  for(const f of completeManifest.files){const p=path.join(root,f.path);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,complete.get('project/'+f.path),{flag:'wx'});}
  await validateDeliveredArchiveCampaign(root,now);
 }finally{await fs.rm(root,{recursive:true,force:true});}
 // Completion is an observed wall-clock checkpoint, never a caller-invented eligibility time.
 proof.verifiedAt=new Date().toISOString();
 return proof;
}

/** Reviewed trust DATA, loaded with this validator rather than from caller options.
 * A proposed checkpoint is not trusted until its original external receipts and
 * exact archives have been independently reviewed and this append-only registry
 * has been installed in a NEW work tree. Never rewrite the already delivered ZIP.
 * Hashes authenticate reviewed bytes, not the truth of a self-authored receipt. */
export const RELEASE_BACKUP_TRUST_PATH='docs/deliveries/release-backup-trust.json';
const hex=/^[a-f0-9]{64}$/;
const roundNumber=id=>/^round-\d+$/.test(id)?Number(id.slice(6)):NaN;
const immutable=p=>p.startsWith('data/releases/')||/^data\/seed-bank(?:-v\d+)?\.json$/.test(p)||/^docs\/(?:rounds\/round-\d+\.(?:json|md)|corrections\/(?:editorial-\d+\.(?:json|md)|evidence\/))/.test(p)||(p.startsWith('docs/deliveries/')&&p!==RELEASE_BACKUP_TRUST_PATH)||/^docs\/publications\/.*\.(?:json|md)$/.test(p)||/^docs\/quarantines\/(?!trust\.json)[^/]+\.json$/.test(p);
function trustRegistry(value){
 keys(value,['schemaVersion','rootProofSha256','checkpoints']);
 if(value.schemaVersion!==1||value.rootProofSha256!==NORMAL_BACKUP_PROOF_SHA256||!Array.isArray(value.checkpoints))fail('Invalid reviewed checkpoint trust root');
 let previous=NORMAL_BACKUP_PROOF_SHA256,number=9;const seen=new Set();
 for(const pin of value.checkpoints){
  keys(pin,['roundId','path','sha256','predecessorProofSha256','verifiedAt']);
  if(!hex.test(pin.sha256)||seen.has(pin.sha256)||pin.predecessorProofSha256!==previous||roundNumber(pin.roundId)<=number||!Number.isFinite(roundNumber(pin.roundId))||pin.path!==`docs/deliveries/checkpoints/${pin.roundId}.json`||!Number.isFinite(Date.parse(pin.verifiedAt))||Date.parse(pin.verifiedAt)>=FREEZE_AT)fail('Reordered, branched or invalid reviewed checkpoint trust');
  seen.add(pin.sha256);previous=pin.sha256;number=roundNumber(pin.roundId);
 }
 return value;
}
// Deep clone: imported JSON is never returned or exposed as a mutable trust Map.
const trusted=trustRegistry(structuredClone(reviewedCheckpointTrust));
async function publicBytes(root,relative){
 parsePublicAllowlist(relative);
 for(let p=path.resolve(root);;p=path.dirname(p)){if((await fs.lstat(p)).isSymbolicLink())fail('Checkpoint root cannot be a symlink');if(path.dirname(p)===p)break;}
 let p=path.resolve(root);const parts=relative.split('/');
 for(const [i,part] of parts.entries()){p=path.join(p,part);const st=await fs.lstat(p);if(st.isSymbolicLink()||(i===parts.length-1?!st.isFile():!st.isDirectory()))fail('Checkpoint requires regular public files');}
 return fs.readFile(p);
}
function beforeTrust(index){return {...trusted,checkpoints:trusted.checkpoints.slice(0,index)};}
function checkOpen({now,publicationState,manifest}){
 if(!Number.isFinite(now)||now>=FREEZE_AT)fail('Final cutoff blocks delivered continuation');
 if(publicationState?.finalized!==false||manifest?.finalRelease!==false)fail('Both persistent freeze markers must be present and false');
}
function inspectSuccessor(p,previous,source){
 keys(p,['schemaVersion','kind','rootProofSha256','predecessor','priorTrustSha256','deltaArtifactSha256','completeArtifactSha256','libraryReceiptSha256','attachmentReceiptSha256','attachmentAcceptedAt','verifiedAt','userOpenOrDownloadObserved','deltaManifest','completeManifest','runtimeManifestRaw','origin']);
 keys(p.predecessor,['roundId','artifactSha256','proofSha256']);
 if(p.schemaVersion!==1||p.kind!=='delivered_release_backup_checkpoint'||p.rootProofSha256!==NORMAL_BACKUP_PROOF_SHA256||!equal(p.origin,previous.origin)||!equal(p.predecessor,{roundId:previous.roundId,artifactSha256:previous.artifactSha256,proofSha256:previous.proofSha256})||![p.priorTrustSha256,p.deltaArtifactSha256,p.completeArtifactSha256,p.libraryReceiptSha256,p.attachmentReceiptSha256].every(v=>hex.test(v))||p.userOpenOrDownloadObserved!==false)fail('Invalid checkpoint, predecessor or original uncertainty origin');
 const d=p.deltaManifest,c=p.completeManifest,s=c?.sourceRelease;
 keys(d,['schemaVersion','kind','deliveryMode','roundId','baseCommit','baseVerifiedAt','preparedAt','gitPublicationStatus','publicationCommit','bankVersion','bankSha256','newlyPublishedByPackaging','prerequisiteArtifacts','files','deletions']);
 keys(c,['schemaVersion','kind','deliveryMode','newlyPublishedRegular','projectDirectory','prerequisiteArtifacts','sourceRelease','frozenSourceInventory','packagingRevision','files']);
 keys(s,['roundId','deltaArtifactSha256','deltaManifestSha256','baseCommit','bankVersion','bankSha256','ledgerPath','ledgerSha256']);
 if(d.schemaVersion!==1||c.schemaVersion!==1||d.kind!=='developer_patch_not_learner_import'||c.kind!=='complete_project_not_learner_import'||d.deliveryMode!=='release_backup'||c.deliveryMode!=='release_backup'||c.projectDirectory!=='project'||d.newlyPublishedByPackaging!==0||c.newlyPublishedRegular!==0||!equal(d.prerequisiteArtifacts,[])||!equal(c.prerequisiteArtifacts,[])||!equal(d.deletions,[])||c.packagingRevision!==null||!equal(c.frozenSourceInventory,c.files))fail('Exact normal delta and standalone full delivery required');
 if(s.deltaArtifactSha256!==p.deltaArtifactSha256||s.deltaManifestSha256!==hash(json(d))||s.roundId!==d.roundId||s.bankVersion!==d.bankVersion||s.bankSha256!==d.bankSha256||s.baseCommit!==d.baseCommit||s.baseCommit!==previous.baseCommit||s.ledgerPath!==`docs/rounds/${s.roundId}.json`||roundNumber(s.roundId)<=roundNumber(previous.roundId))fail('Checkpoint release identity or verified public anchor mismatch');
 for(const [files,delta] of [[c.files,false],[d.files,true]]){
  if(!Array.isArray(files)||!files.length)fail('Missing exact archive inventory');
  parsePublicAllowlist(files.map(f=>f.path).join('\n'));
  for(const f of files){keys(f,delta?['path','sha256','bytes','beforeSha256']:['path','sha256','bytes']);if(!hex.test(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<0||delta&&f.beforeSha256!==null&&!hex.test(f.beforeSha256))fail('Invalid checkpoint inventory hashes');}
 }
 const inventory=new Map(c.files.map(f=>[f.path,f]));
 const predecessorPath=previous.proofSha256===NORMAL_BACKUP_PROOF_SHA256?NORMAL_BACKUP_PATH:`docs/deliveries/checkpoints/${previous.roundId}.json`;
 if(inventory.get(RELEASE_BACKUP_TRUST_PATH)?.sha256!==p.priorTrustSha256||inventory.get(NORMAL_BACKUP_PATH)?.sha256!==NORMAL_BACKUP_PROOF_SHA256||inventory.get(predecessorPath)?.sha256!==previous.proofSha256)fail('Archive must preserve exact predecessor proof and prior trust registry');
 for(const [p,f] of previous.immutableInventory){const current=inventory.get(p);if(!current||current.sha256!==f.sha256||current.bytes!==f.bytes)fail('Immutable predecessor archive history changed: '+p);}
 if([...previous.anchorInventory.keys()].some(p=>!inventory.has(p)))fail('Cumulative backup cannot drop original public anchor paths');
 const cumulative=c.files.filter(f=>previous.anchorInventory.get(f.path)!==f.sha256).map(f=>({...f,beforeSha256:previous.anchorInventory.get(f.path)??null}));
 if(!equal(d.files,cumulative))fail('Cumulative delta must match exact original public anchor before/after hashes');
 for(const f of d.files){const match=inventory.get(f.path);if(!match||match.sha256!==f.sha256||match.bytes!==f.bytes)fail('Checkpoint delta/full inventory mismatch');}
 const times=[p.attachmentAcceptedAt,p.verifiedAt,d.preparedAt,d.baseVerifiedAt,source?.startedAt,source?.closedAt].map(Date.parse);
 if(times.some(t=>!Number.isFinite(t))||times[1]<times[0]||times[0]<times[2]||times[2]<times[5]||times[3]>times[2]||times[3]<times[4]||times[1]>=FREEZE_AT||times[4]<Date.parse(previous.eligibleAt))fail('Checkpoint times require actual delivery, completed review and a fresh round public anchor');
 if(!source||source.roundId!==s.roundId||source.status!=='closed'||source.publication.status!=='not_attempted'||source.publication.verifiedAt!==null||source.publication.commit!==null||d.gitPublicationStatus!==source.publication.status||d.publicationCommit!==null||source.publication.bankVersion!==s.bankVersion||source.publication.bankSha256!==s.bankSha256||!equal(source.baseline.offlinePredecessor,{artifactSha256:previous.artifactSha256,manifestSha256:previous.manifestSha256,ledgerSha256:previous.ledgerSha256,roundId:previous.roundId})||source.baseline.bankVersion!==previous.bankVersion||source.baseline.bankSha256!==previous.bankSha256||source.baseline.sourceCommit!==previous.baseCommit)fail('Exact unpublished closed successor ledger and predecessor required');
 const runtime=JSON.parse(p.runtimeManifestRaw);
 if(hash(Buffer.from(p.runtimeManifestRaw))!==inventory.get('data/manifest.json')?.sha256||runtime.finalRelease!==false||runtime.bankVersion!==s.bankVersion||runtime.sha256!==s.bankSha256||inventory.get(s.ledgerPath)?.sha256!==s.ledgerSha256||inventory.get(`data/releases/${s.bankVersion}/bank.json`)?.sha256!==s.bankSha256)fail('Exact source runtime manifest, bank and ledger required');
 return {roundId:s.roundId,artifactSha256:p.deltaArtifactSha256,proofSha256:hash(json(p)),manifestSha256:hash(json(d)),ledgerSha256:s.ledgerSha256,bankVersion:s.bankVersion,bankSha256:s.bankSha256,baseCommit:s.baseCommit,recordedAt:p.attachmentAcceptedAt,eligibleAt:p.verifiedAt,origin:p.origin,anchorInventory:previous.anchorInventory,immutableInventory:new Map(c.files.filter(f=>immutable(f.path)).map(f=>[f.path,f]))};
}
function bootstrap(proof){const s=proof.completeManifest.sourceRelease,delta=new Map(proof.deltaManifest.files.map(f=>[f.path,f])),anchorInventory=new Map(proof.completeManifest.files.filter(f=>!delta.has(f.path)||delta.get(f.path).beforeSha256!==null).map(f=>[f.path,delta.has(f.path)?delta.get(f.path).beforeSha256:f.sha256]));return {roundId:s.roundId,artifactSha256:NORMAL_BACKUP_PINS.delta,proofSha256:NORMAL_BACKUP_PROOF_SHA256,manifestSha256:NORMAL_BACKUP_PINS.deltaManifest,ledgerSha256:s.ledgerSha256,bankVersion:s.bankVersion,bankSha256:s.bankSha256,baseCommit:s.baseCommit,eligibleAt:proof.verifiedAt,origin:proof.terminal,anchorInventory,immutableInventory:new Map(proof.completeManifest.files.filter(f=>immutable(f.path)).map(f=>[f.path,f]))};}
/** The candidate tree, not only the importing authority, must contain every
 * modern continuation dependency. Exact pre-adapter archives remain auditable. */
export async function validateReleaseBackupDependencies(root){
 const code=async p=>{try{return (await publicBytes(root,p)).toString();}catch(e){if(e.code==='ENOENT')return '';throw e;}};
 const validator=await code('scripts/validate-round.mjs'),continuation=await code('scripts/release-backup-continuation.mjs');
 const modern=validator.includes('loadReleaseBackupContinuations')||continuation.includes('release-backup-trust.json');
 if(!modern)return false;
 const allow=new Set(parsePublicAllowlist((await publicBytes(root,'PUBLICATION-MANIFEST.txt')).toString()));
 const raw=await publicBytes(root,RELEASE_BACKUP_TRUST_PATH),local=trustRegistry(JSON.parse(raw));
 if(!equal(local,beforeTrust(local.checkpoints.length))||!equal(raw,json(local)))fail('Unreviewed or rewritten checkpoint trust registry');
 for(const p of ['scripts/release-backup-continuation.mjs',RELEASE_BACKUP_TRUST_PATH,NORMAL_BACKUP_PATH,...local.checkpoints.map(pin=>pin.path)]){
  if(!allow.has(p))fail('Modern continuation dependency missing from reviewed allowlist: '+p);
  let b;try{b=await publicBytes(root,p);}catch(e){if(p===NORMAL_BACKUP_PATH&&e.code==='ENOENT')fail('Missing exact normal-backup offline predecessor proof for successor');throw e;}
  const pin=local.checkpoints.find(pin=>pin.path===p);
  if(pin&&hash(b)!==pin.sha256)fail('Missing, tampered or unreviewed delivered checkpoint bytes');
 }
 return true;
}
/** Called only after the pinned009 bootstrap. All checkpoint trust comes from
 * the reviewed registry shipped with this module; workspace self-pins are refused. */
export async function loadReleaseBackupContinuations(root,context){
 const {now,ledgers,ledgerSources}=context,offlineBases=new Map(context.offlineBases),deliveryCheckpointSources=new Map();checkOpen(context);
 const raw=await publicBytes(root,RELEASE_BACKUP_TRUST_PATH);
 const local=trustRegistry(JSON.parse(raw));
 if(!equal(local,beforeTrust(local.checkpoints.length))||raw&&!equal(raw,json(local)))fail('Unreviewed or rewritten checkpoint trust registry');
 for(const pin of trusted.checkpoints.slice(local.checkpoints.length)){
  if(ledgers.some(l=>roundNumber(l.roundId)>roundNumber(pin.roundId)||l.baseline?.offlinePredecessor?.roundId===pin.roundId))fail('Missing reviewed delivered checkpoint for later successor');
  // A source archive predates its own checkpoint. That historical exception may
  // not rewrite a round whose exact bytes are already registered by this authority.
  if(ledgers.some(l=>l.roundId===pin.roundId)){
   const knownRaw=await publicBytes(path.resolve(import.meta.dirname,'..'),pin.path);
   if(hash(knownRaw)!==pin.sha256)fail('Trusted authority checkpoint is missing or changed');
   const known=JSON.parse(knownRaw).completeManifest.sourceRelease;
   if(hash(ledgerSources.get(pin.roundId)||Buffer.alloc(0))!==known.ledgerSha256)fail('Previously delivered source ledger cannot be rewritten by omitting its checkpoint');
  }
 }
 if(!local.checkpoints.length)return {checkpoints:[],offlineBases,deliveryCheckpointSources};
 const rootProof=parseNormalBackupProof(await publicBytes(root,NORMAL_BACKUP_PATH));
 let previous=bootstrap(rootProof);const checkpoints=[];
 if(!offlineBases.has(previous.artifactSha256))fail('Eligible pinned original continuation required');
 for(const [index,pin] of local.checkpoints.entries()){
  const proofRaw=await publicBytes(root,pin.path);
  if(hash(proofRaw)!==pin.sha256)fail('Missing, tampered or unreviewed delivered checkpoint bytes');
  deliveryCheckpointSources.set(pin.roundId,proofRaw);
  const p=JSON.parse(proofRaw),source=ledgers.find(l=>l.roundId===pin.roundId);
  if(!equal(proofRaw,json(p))||p.priorTrustSha256!==hash(json(beforeTrust(index)))||p.verifiedAt!==pin.verifiedAt||p.predecessor.proofSha256!==pin.predecessorProofSha256||p.completeManifest.sourceRelease.roundId!==pin.roundId)fail('Reordered or changed checkpoint trust linkage');
  const next=inspectSuccessor(p,previous,source);
  if(hash(ledgerSources.get(pin.roundId)||Buffer.alloc(0))!==next.ledgerSha256)fail('Original successor ledger or review counters changed');
  for(const f of p.completeManifest.files.filter(f=>immutable(f.path))){const b=await publicBytes(root,f.path);if(hash(b)!==f.sha256||b.length!==f.bytes)fail('Immutable delivered history changed: '+f.path);}
  if(offlineBases.has(next.artifactSha256)||[...offlineBases.values()].some(b=>b.roundId===next.roundId||b.bankVersion===next.bankVersion))fail('Duplicate delivered round, artifact or immutable version');
  const {proofSha256,origin,artifactSha256,anchorInventory,immutableInventory,...offlineBase}=next;if(now>=Date.parse(next.eligibleAt))offlineBases.set(artifactSha256,offlineBase);checkpoints.push(p);previous=next;
 }
 // Check each source as an active release as well as the final full campaign.
 // This also checks immutable item preservation across intermediate successors.
 const {validateReleaseLedger}=await import('./validate-round.mjs');
 for(const p of checkpoints){
  // Audit this frozen source at its actual archive preparation boundary, not as
  // today's active release. Later publications remain authenticated but inactive.
  // The full current campaign is independently checked by loadRoundContext.
  const at=Math.min(now,Date.parse(p.deltaManifest.preparedAt));
  const historicalLedgers=ledgers.filter(r=>Date.parse(r.startedAt)<=at);
  const historicalEditorials=context.editorials.filter(r=>Date.parse(r.startedAt)<=at);
  const historicalBases=new Map([...offlineBases].filter(([,e])=>Date.parse(e.eligibleAt)<=at&&historicalLedgers.some(r=>r.roundId===e.roundId)));
  const check=validateReleaseLedger(historicalLedgers,{...context,now:at,editorials:historicalEditorials,offlineBases:historicalBases,deliveryCheckpointSources,manifest:JSON.parse(p.runtimeManifestRaw)});
  if(!check.ok)fail('Invalid delivered successor campaign: '+check.errors.join('; '));
 }
 return {checkpoints,offlineBases,deliveryCheckpointSources};
}
/** Private preparation only: returns a PROPOSED proof/trust append, never writes,
 * uploads or changes the frozen source. An independent operator must match the
 * original saved/attachment tool results to these private receipt hashes. */
export async function prepareReleaseBackupContinuation({deltaZip,completeZip,libraryReceiptRaw,attachmentReceiptRaw,now=Date.now()}){
 if(![deltaZip,completeZip,libraryReceiptRaw,attachmentReceiptRaw].every(Buffer.isBuffer))fail('Original ZIP and private receipt bytes required');
 const authorityRoot=path.resolve(import.meta.dirname,'..');
 const currentFreeze=async time=>checkOpen({now:time,publicationState:JSON.parse(await publicBytes(authorityRoot,'data/publication-state.json')),manifest:JSON.parse(await publicBytes(authorityRoot,'data/manifest.json'))});
 await currentFreeze(now);
 const saved=JSON.parse(libraryReceiptRaw),attached=JSON.parse(attachmentReceiptRaw);
 if(saved.schemaVersion!==1||attached.schemaVersion!==1||saved.status!=='library_saved_attachment_pending'||attached.status!=='native_attachments_accepted'||saved.roundId!==attached.roundId||saved.savedAt!==attached.savedAt||!equal(saved.artifacts,attached.artifacts)||saved.newlyPublishedByDelivery!==0||attached.newlyPublishedByDelivery!==0||attached.deliveryMode!=='release_backup'||attached.publicationCountsChangedByDelivery!==false||attached.userOpenOrDownloadObserved!==false)fail('Actual saved pair and accepted native attachment receipts required');
 const kinds=new Set(),identities=new Set();
 if(!Array.isArray(saved.artifacts)||saved.artifacts.length!==2)fail('Both actual delivery artifacts required');
 for(const a of saved.artifacts){const b=a.kind==='delta'?deltaZip:a.kind==='complete'?completeZip:null;if(!b||kinds.has(a.kind)||typeof a.library_file_id!=='string'||!a.library_file_id.trim()||identities.has(a.library_file_id)||a.sha256!==hash(b)||a.bytes!==b.length)fail('Private receipt does not identify exact delivered pair');kinds.add(a.kind);identities.add(a.library_file_id);}
 if(!Array.isArray(attached.attachments)||attached.attachments.length!==2)fail('Both native artifact attachments must have actual acceptance evidence');
 const attachmentKinds=new Set();let lastAcceptance=0;
 for(const a of attached.attachments){
  keys(a,['kind','library_file_id','messageId','acceptedAt']);
  if(attachmentKinds.has(a.kind)||!saved.artifacts.some(f=>f.kind===a.kind&&f.library_file_id===a.library_file_id)||typeof a.messageId!=='string'||!a.messageId.trim()||!Number.isFinite(Date.parse(a.acceptedAt))||Date.parse(a.acceptedAt)>now)fail('Exact native acceptance for each saved artifact required');
  attachmentKinds.add(a.kind);lastAcceptance=Math.max(lastAcceptance,Date.parse(a.acceptedAt));
 }
 if(Date.parse(attached.attachmentAcceptedAt)!==lastAcceptance)fail('Pair acceptance must be the later actual native attachment');
 if(!Number.isFinite(Date.parse(saved.savedAt))||!Number.isFinite(Date.parse(attached.attachmentAcceptedAt))||Date.parse(saved.savedAt)>now||Date.parse(attached.attachmentAcceptedAt)>now)fail('Actual nonfuture delivery times required');
 const delta=archive(deltaZip,hash(deltaZip)),complete=archive(completeZip,hash(completeZip)),d=JSON.parse(delta.get('manifest.json')),c=JSON.parse(complete.get('manifest.json'));
 if(!equal(delta.get('manifest.json'),json(d))||!equal(complete.get('manifest.json'),json(c)))fail('Exact canonical archive manifest bytes required');
 inspectArchive(delta,d,'files/');inspectArchive(complete,c,'project/');
 if(!equal(parsePublicAllowlist(complete.get('project/PUBLICATION-MANIFEST.txt').toString()).sort(),c.files.map(f=>f.path).sort()))fail('Full delivered inventory must equal allowlist');
 for(const f of d.files)if(!equal(delta.get('files/'+f.path),complete.get('project/'+f.path)))fail('Delivered delta/full bytes differ');
 if(Date.parse(saved.savedAt)<Date.parse(d.preparedAt)||attached.attachments.some(a=>Date.parse(a.acceptedAt)<Date.parse(saved.savedAt)))fail('Artifact preparation must precede saving and each native acceptance');
 if(saved.roundId!==c.sourceRelease.roundId||attached.publicationAtPreparation!==d.gitPublicationStatus)fail('Receipts name a different release');
 const priorRaw=complete.get('project/'+RELEASE_BACKUP_TRUST_PATH);
 if(!priorRaw||!equal(priorRaw,json(trusted)))fail('Delivered snapshot must preserve the entire reviewed predecessor trust registry');
 const rootProof=parseNormalBackupProof(complete.get('project/'+NORMAL_BACKUP_PATH));
 let previous=bootstrap(rootProof);
 for(const pin of trusted.checkpoints){const b=complete.get('project/'+pin.path);if(!b||hash(b)!==pin.sha256)fail('Delivered predecessor proof missing or changed');const p=JSON.parse(b);previous=inspectSuccessor(p,previous,JSON.parse(complete.get('project/'+p.completeManifest.sourceRelease.ledgerPath)));}
 const source=JSON.parse(complete.get('project/'+c.sourceRelease.ledgerPath));
 const p={schemaVersion:1,kind:'delivered_release_backup_checkpoint',rootProofSha256:NORMAL_BACKUP_PROOF_SHA256,predecessor:{roundId:previous.roundId,artifactSha256:previous.artifactSha256,proofSha256:previous.proofSha256},priorTrustSha256:hash(priorRaw),deltaArtifactSha256:hash(deltaZip),completeArtifactSha256:hash(completeZip),libraryReceiptSha256:hash(libraryReceiptRaw),attachmentReceiptSha256:hash(attachmentReceiptRaw),attachmentAcceptedAt:attached.attachmentAcceptedAt,verifiedAt:new Date(now).toISOString(),userOpenOrDownloadObserved:false,deltaManifest:d,completeManifest:c,runtimeManifestRaw:complete.get('project/data/manifest.json').toString(),origin:rootProof.terminal};
 inspectSuccessor(p,previous,source);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'delivered-successor-'));
 try{
  for(const f of c.files){const target=path.join(root,f.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,complete.get('project/'+f.path),{flag:'wx'});}
  await validateDeliveredArchiveCampaign(root,now);
 }finally{await fs.rm(root,{recursive:true,force:true});}
 await currentFreeze(Date.now());
 p.verifiedAt=new Date().toISOString();inspectSuccessor(p,previous,source);
 if(Date.parse(p.verifiedAt)<now)fail('Verification cannot precede supplied audit time');
 const proofRaw=json(p),trustRecord={roundId:source.roundId,path:`docs/deliveries/checkpoints/${source.roundId}.json`,sha256:hash(proofRaw),predecessorProofSha256:previous.proofSha256,verifiedAt:p.verifiedAt};
 if(trusted.checkpoints.some(pin=>pin.roundId===trustRecord.roundId))fail('Already reviewed delivery cannot be checkpointed twice');
 return {status:'proposed_requires_independent_receipt_review',proof:p,proofRaw,trustRecord,trustRegistryRaw:json(trustRegistry({...trusted,checkpoints:[...trusted.checkpoints,trustRecord]}))};
}

// Shared read-only ZIP validation for independently anchored delivery proofs.
export {archive as readDeliveredArchive, inspectArchive as validateDeliveredArchiveEntries};
