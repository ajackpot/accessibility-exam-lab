import {completeManifestFormat} from './archive-format.mjs';
/** Reviewed independent offline chains. Read-only; a proposal is never delivery authority. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import reviewedTrust from '../docs/deliveries/offline-chain-trust.json' with {type:'json'};
import {FREEZE_AT} from '../src/domain.js';
import {parsePublicAllowlist, validateOfflineContinuation, foldDeliveryInventory, advanceReconciliationWait} from './download-fallback.mjs';
import {readDeliveredArchive, validateDeliveredArchiveEntries} from './release-backup-continuation.mjs';
export const OFFLINE_CHAIN_TRUST_PATH='docs/deliveries/offline-chain-trust.json';
const authorityRoot=path.resolve(import.meta.dirname,'..'),hash=b=>createHash('sha256').update(b).digest('hex'),json=o=>Buffer.from(JSON.stringify(o,null,2)+'\n');
const hex=/^[a-f0-9]{64}$/,commit=/^(?!0{40}$)[a-f0-9]{40}$/,name=/^[a-z0-9][a-z0-9-]{0,63}$/;
const fail=m=>{throw Error(m);},number=r=>/^round-\d+$/.test(r)?Number(r.slice(6)):NaN;
function keys(o,list){if(!o||Array.isArray(o)||!equal(Object.keys(o).sort(),[...list].sort()))fail('Unexpected independent-chain proof fields');}
function time(s){const n=Date.parse(s);if(typeof s!=='string'||!Number.isFinite(n)||n>=FREEZE_AT)fail('Invalid independent-chain chronology or final cutoff');return n;}
function open({now,manifest,publicationState}){if(!Number.isFinite(now)||now>=FREEZE_AT)fail('Final cutoff blocks independent continuation');if(manifest?.finalRelease!==false||publicationState?.finalized!==false)fail('Both persistent freeze markers must be explicit false');}
async function bytes(root,p){parsePublicAllowlist(p);for(let d=path.resolve(root);;d=path.dirname(d)){if((await fs.lstat(d)).isSymbolicLink())fail('Independent-chain root cannot be a symlink');if(d===path.dirname(d))break;}let d=path.resolve(root);for(const [i,v] of p.split('/').entries()){d=path.join(d,v);const s=await fs.lstat(d);if(s.isSymbolicLink()||(i===p.split('/').length-1?!s.isFile():!s.isDirectory()))fail('Independent-chain proof requires regular public files');}return fs.readFile(d);}
function inventory(files){if(!Array.isArray(files)||!files.length)fail('Exact source inventory required');parsePublicAllowlist(files.map(f=>f.path).join('\n'));for(const f of files){keys(f,['path','sha256','bytes']);if(!hex.test(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<0)fail('Invalid source inventory');}return new Map(files.map(f=>[f.path,f]));}
const immutable=p=>p.startsWith('data/releases/')||/^data\/seed-bank(?:-v\d+)?\.json$/.test(p)||/^docs\/(?:rounds\/round-\d+\.(?:json|md)|corrections\/|publications\/)/.test(p)||(p.startsWith('docs/deliveries/')&&p!==OFFLINE_CHAIN_TRUST_PATH)||/^docs\/quarantines\/(?!trust\.json)[^/]+\.json$/.test(p);
function registry(v){keys(v,['schemaVersion','kind','checkpoints']);if(v.schemaVersion!==1||v.kind!=='reviewed_independent_offline_chains'||!Array.isArray(v.checkpoints))fail('Invalid independent-chain registry');const tips=new Map(),seen=new Set();let last=0,at=0;for(const p of v.checkpoints){keys(p,['chainId','anchorSha256','roundId','path','sha256','previousProofSha256','verifiedAt']);const prev=tips.get(p.chainId);if(!name.test(p.chainId)||!hex.test(p.anchorSha256)||!hex.test(p.sha256)||seen.has(p.sha256)||!Number.isFinite(number(p.roundId))||number(p.roundId)<=last||time(p.verifiedAt)<=at||p.path!==`docs/deliveries/chains/${p.chainId}/${p.roundId}.json`||p.previousProofSha256!==(prev?.sha256??null)||prev&&prev.anchorSha256!==p.anchorSha256)fail('Reordered, forked or duplicate independent-chain registry');seen.add(p.sha256);tips.set(p.chainId,p);last=number(p.roundId);at=time(p.verifiedAt);}return v;}
const trusted=registry(structuredClone(reviewedTrust));
const prefix=n=>({...trusted,checkpoints:trusted.checkpoints.slice(0,n)});
function inspectAnchor(a,source,d){keys(a,['baseCommit','observedAt','manifestRaw','publicationStateRaw','allowlistRaw','remoteInventory']);const inv=inventory(a.remoteInventory),m=JSON.parse(a.manifestRaw),s=JSON.parse(a.publicationStateRaw);open({now:time(a.observedAt),manifest:m,publicationState:s});if(!commit.test(a.baseCommit)||a.baseCommit!==d.baseCommit||time(a.observedAt)!==time(d.baseVerifiedAt)||time(a.observedAt)<time(source.startedAt)||time(a.observedAt)>time(d.gitOutcome.observedAt)||source.baseline.offlinePredecessor||source.baseline.sourceCommit!==a.baseCommit||source.baseline.bankVersion!==m.bankVersion||source.baseline.bankSha256!==m.sha256||m.file!==`releases/${m.bankVersion}/bank.json`)fail('Independent root requires its exact fresh public anchor and baseline');for(const [p,raw] of [['data/manifest.json',a.manifestRaw],['data/publication-state.json',a.publicationStateRaw],['PUBLICATION-MANIFEST.txt',a.allowlistRaw]])if(inv.get(p)?.sha256!==hash(Buffer.from(raw))||inv.get(p)?.bytes!==Buffer.byteLength(raw))fail('Remote anchor inventory/raw bytes mismatch');if(inv.get(`data/releases/${m.bankVersion}/bank.json`)?.sha256!==m.sha256||!equal([...inv.keys()].sort(),parsePublicAllowlist(a.allowlistRaw).sort()))fail('Remote anchor allowlist/bank identity mismatch');return a;}
function inspectProof(p,pin,previous,context,prior){
 keys(p,['schemaVersion','kind','chainId','anchorSha256','anchor','previousProofSha256','priorTrustSha256','deltaArtifactSha256','completeArtifactSha256','libraryReceiptSha256','attachmentReceiptSha256','savedAt','attachmentAcceptedAt','verifiedAt','userOpenOrDownloadObserved','receipt','deltaManifest','completeManifest','runtimeManifestRaw','publicationStateRaw','sourceAllowlistRaw','uncertainty']);
 const {now,ledgers,ledgerSources}=context,d=p.deltaManifest,c=p.completeManifest,r=p.receipt,s=c?.sourceRelease,source=ledgers.find(l=>l.roundId===pin.roundId);
 if(p.schemaVersion!==1||p.kind!=='delivered_independent_offline_checkpoint'||p.chainId!==pin.chainId||p.anchorSha256!==pin.anchorSha256||p.previousProofSha256!==pin.previousProofSha256||p.verifiedAt!==pin.verifiedAt||p.userOpenOrDownloadObserved!==false||![p.deltaArtifactSha256,p.completeArtifactSha256,p.libraryReceiptSha256,p.attachmentReceiptSha256].every(v=>hex.test(v)))fail('Independent checkpoint identity mismatch');
 completeManifestFormat(c);keys(s,['roundId','deltaArtifactSha256','deltaManifestSha256','baseCommit','bankVersion','bankSha256','ledgerPath','ledgerSha256']);
 if(c.kind!=='complete_project_not_learner_import'||c.deliveryMode!=='download_only'||c.newlyPublishedRegular!==0||c.projectDirectory!=='project'||!equal(c.prerequisiteArtifacts,[])||c.packagingRevision!==null||!equal(c.files,c.frozenSourceInventory)||!equal(d.deletions,[]))fail('Exact standalone download pair required');
 if(!source||source.roundId!==s.roundId||s.roundId!==pin.roundId||source.status!=='closed'||source.publication.status==='verified'||source.publication.verifiedAt!==null||hash(ledgerSources.get(s.roundId)||Buffer.alloc(0))!==s.ledgerSha256||source.publication.bankVersion!==s.bankVersion||source.publication.bankSha256!==s.bankSha256||r.content?.ledgerSha256!==s.ledgerSha256||r.content?.bankVersion!==s.bankVersion||r.content?.bankSha256!==s.bankSha256||s.ledgerPath!==`docs/rounds/${s.roundId}.json`||s.deltaArtifactSha256!==p.deltaArtifactSha256||s.deltaManifestSha256!==hash(json(d))||r.artifactSha256!==p.deltaArtifactSha256||r.status!=='delivered'||r.recordedAt!==p.attachmentAcceptedAt||s.baseCommit!==d.baseCommit)fail('Exact original closed ledger, counters, bank and delivery required');
 const anchor=previous?.anchor??inspectAnchor(p.anchor,source,d);if(hash(json(anchor))!==p.anchorSha256||previous&&(p.anchor!==null||p.previousProofSha256!==previous.pin.sha256)||d.baseCommit!==anchor.baseCommit)fail('Independent chains cannot mix anchors or predecessors');
 const inv=inventory(c.files),priorInv=previous?inventory(previous.proof.completeManifest.files):inventory(anchor.remoteInventory);
 if(!equal(parsePublicAllowlist(p.sourceAllowlistRaw).sort(),[...inv.keys()].sort()))fail('Delivered full source inventory differs from allowlist');
 for(const [file,raw] of [['data/manifest.json',p.runtimeManifestRaw],['data/publication-state.json',p.publicationStateRaw],['PUBLICATION-MANIFEST.txt',p.sourceAllowlistRaw]])if(inv.get(file)?.sha256!==hash(Buffer.from(raw))||inv.get(file)?.bytes!==Buffer.byteLength(raw))fail('Delivered source marker or inventory bytes changed');
 const runtime=JSON.parse(p.runtimeManifestRaw);open({now:time(p.verifiedAt),manifest:runtime,publicationState:JSON.parse(p.publicationStateRaw)});
 if(runtime.bankVersion!==s.bankVersion||runtime.sha256!==s.bankSha256||runtime.file!==`releases/${s.bankVersion}/bank.json`||inv.get(s.ledgerPath)?.sha256!==s.ledgerSha256||inv.get(`data/releases/${s.bankVersion}/bank.json`)?.sha256!==s.bankSha256)fail('Delivered runtime bank/ledger mismatch');
 for(const [file,f] of priorInv)if(immutable(file)&&!equal(inv.get(file),f))fail('Immutable anchor or delivered history changed: '+file);
 if(previous&&inv.get(previous.pin.path)?.sha256!==previous.pin.sha256)fail('Delivered source must contain its exact predecessor proof');
 if(previous){const ref={artifactSha256:previous.proof.deltaArtifactSha256,manifestSha256:hash(json(previous.proof.deltaManifest)),ledgerSha256:previous.proof.completeManifest.sourceRelease.ledgerSha256,roundId:previous.pin.roundId};if(!equal(source.baseline.offlinePredecessor,ref)||time(source.startedAt)<previous.eligibleAt||d.schemaVersion!==2||r.parentDeliverySha256!==previous.proof.deltaArtifactSha256||!equal(p.uncertainty,previous.proof.uncertainty))fail('Successor skips, forks or predates its exact delivered predecessor');}
 else if(d.schemaVersion!==1||r.parentDeliverySha256!==null)fail('Independent root must retain its actual original timeout');
 const u=p.uncertainty;keys(u,['sourceArtifactSha256','sourceEvidenceSha256','reconciliationEvidenceSha256','wait']);if(![u.sourceArtifactSha256,u.sourceEvidenceSha256,u.reconciliationEvidenceSha256].every(v=>hex.test(v)))fail('Exact original uncertainty evidence hashes required');
 const first=previous?.receipts[0]??r,firstManifest=previous?.manifests.get(first.artifactSha256)??d;
 if(u.sourceArtifactSha256!==first.content.bankSha256||u.wait.artifactSha256!==first.artifactSha256||u.wait.state!=='skip_git_step'||time(u.wait.firstUnresolvedAt)<time(firstManifest.permissionNotifiedAt)||time(u.wait.firstUnresolvedAt)>time(firstManifest.gitOutcome.observedAt)||time(u.wait.skippedAt)>time(p.verifiedAt))fail('Original uncertainty identity or fixed reconciliation clock changed');advanceReconciliationWait(u.wait,{now:time(p.verifiedAt)});
 if(time(p.savedAt)<Math.max(time(source.closedAt),time(d.gitOutcome.observedAt),time(d.baseVerifiedAt))||time(p.attachmentAcceptedAt)<time(p.savedAt)||time(p.verifiedAt)<time(p.attachmentAcceptedAt)||time(p.verifiedAt)>now)fail('Checkpoint must follow source closure, actual saving, both attachments and completed verification');
 const expectedTrust=hash(json(prior));if(inv.has(OFFLINE_CHAIN_TRUST_PATH)){if(inv.get(OFFLINE_CHAIN_TRUST_PATH).sha256!==expectedTrust||p.priorTrustSha256!==expectedTrust)fail('Source must preserve exact prior independent-chain trust prefix');}else if(previous||prior.checkpoints.length||p.priorTrustSha256!==null)fail('Missing predecessor trust registry in delivered source');
 const receipts=[...(previous?.receipts??[]),r],manifests=new Map(previous?.manifests??[]);manifests.set(r.artifactSha256,d);
 const folded=foldDeliveryInventory(anchor.remoteInventory,receipts,manifests);if(!equal([...folded].sort(),[...inv].map(([p,f])=>[p,f.sha256]).sort()))fail('Complete inventory differs from exact remote anchor plus delta chain');
 const checked=validateOfflineContinuation(receipts,{manifests,ledgers:new Map(ledgerSources),banks:new Map([...context.banks].map(([v,e])=>[v,e.raw])),now,publicationState:context.publicationState,reconciliationHistory:[u.wait]});if(!checked.ok||!checked.canStartNewContent)fail('Invalid independent offline chain: '+[...checked.errors,...checked.continuationBlockers].join('; '));
 return {pin,proof:p,anchor,receipts,manifests,checked,eligibleAt:Math.max(time(p.verifiedAt),time(u.wait.skippedAt))};
}
// A returned Map is an observation from this validator, never caller authority.
const validatedChainMaps=new WeakMap();
const chainStamp=chains=>hash(json([...chains].map(([id,c])=>({id,pin:c.pin,proof:c.proof,anchor:c.anchor,receipts:c.receipts,manifests:[...c.manifests]}))));
function sealChains(chains){validatedChainMaps.set(chains,chainStamp(chains));return chains;}
export function assertValidatedIndependentOfflineChains(chains){
 if(!(chains instanceof Map)||!validatedChainMaps.has(chains)||validatedChainMaps.get(chains)!==chainStamp(chains))fail('Publication requires untouched fully validated independent chains, not a caller Map');
}
/** Trust is imported with this validator. Candidate registries must be exact prefixes,
 * and may not omit an already-reviewed source or successor dependency. */
export async function loadIndependentOfflineChains(root,context){
 const offlineBases=new Map(context.offlineBases),deliveryCheckpointSources=new Map(context.deliveryCheckpointSources),chains=new Map();
 let raw;try{raw=await bytes(root,OFFLINE_CHAIN_TRUST_PATH);}catch(e){if(e.code!=='ENOENT')throw e;}
 let validator='';try{validator=(await bytes(root,'scripts/validate-round.mjs')).toString();}catch(e){if(e.code!=='ENOENT')throw e;}
 const modern=validator.includes('loadIndependentOfflineChains');
 if(!raw&&modern)fail('Missing independent-chain trust registry');
 const local=raw?registry(JSON.parse(raw)):prefix(0);if(!equal(local,prefix(local.checkpoints.length))||raw&&!equal(raw,json(local)))fail('Unreviewed or rewritten independent-chain trust registry');
 const allow=new Set(parsePublicAllowlist((await bytes(root,'PUBLICATION-MANIFEST.txt')).toString()));
 if(modern||raw)for(const p of ['scripts/validate-round.mjs','scripts/offline-chain-continuation.mjs',OFFLINE_CHAIN_TRUST_PATH]){if(!allow.has(p))fail('Independent-chain dependency absent from allowlist');await bytes(root,p);}
 for(const pin of trusted.checkpoints.slice(local.checkpoints.length)){
  const knownRaw=await bytes(authorityRoot,pin.path);if(hash(knownRaw)!==pin.sha256)fail('Trusted independent checkpoint is missing or changed');
  const known=JSON.parse(knownRaw),deliveredAt=time(known.attachmentAcceptedAt);
  // Identity changes cannot hide a later expansion/editorial from a delivered
  // source. Use its authenticated delivery boundary, never only numeric IDs.
  if([...context.ledgers,...(context.editorials??[])].some(l=>number(l.roundId)>number(pin.roundId)||Date.parse(l.startedAt)>=deliveredAt||l.baseline?.offlinePredecessor?.roundId===pin.roundId))fail('Missing reviewed independent checkpoint for later successor');
  if(context.ledgers.some(l=>l.roundId===pin.roundId)&&hash(context.ledgerSources.get(pin.roundId)||Buffer.alloc(0))!==known.completeManifest.sourceRelease.ledgerSha256)fail('Previously delivered source cannot be rewritten by omitting its checkpoint');
 }
 // Legacy partial ledger audits need no active runtime manifest. Modern source
 // trees and any registered evidence must still carry its real freeze marker.
 if(modern||raw){if(context.manifest?.finalRelease===true||context.publicationState?.finalized===true)fail('Current persistent freeze blocks independent continuation');context={...context,manifest:JSON.parse(await bytes(root,'data/manifest.json')),publicationState:JSON.parse(await bytes(root,'data/publication-state.json'))};open(context);}
 if(!local.checkpoints.length)return {offlineBases,deliveryCheckpointSources,chains:sealChains(chains)};open(context);
 for(const [i,pin] of local.checkpoints.entries()){
  if(!allow.has(pin.path))fail('Independent checkpoint absent from allowlist');const b=await bytes(root,pin.path);if(hash(b)!==pin.sha256)fail('Missing, mutated or unreviewed independent proof');const p=JSON.parse(b);if(!equal(b,json(p)))fail('Noncanonical independent proof');
  const next=inspectProof(p,pin,chains.get(pin.chainId),context,prefix(i));
  for(const chain of chains.values())if(chain.anchor.baseCommit===next.anchor.baseCommit&&!equal(chain.anchor.remoteInventory,next.anchor.remoteInventory))fail('Same remote commit cannot identify conflicting anchor inventories');
  for(const f of p.completeManifest.files.filter(f=>immutable(f.path))){const b=await bytes(root,f.path);if(hash(b)!==f.sha256||b.length!==f.bytes)fail('Immutable delivered source changed: '+f.path);}
  const base={...next.checked.offlineBases.get(p.deltaArtifactSha256),eligibleAt:new Date(next.eligibleAt).toISOString()};
  if(offlineBases.has(p.deltaArtifactSha256)||[...offlineBases.values()].some(e=>e.roundId===base.roundId||e.bankVersion===base.bankVersion))fail('Duplicate offline artifact, round or bank across independent chains');
  offlineBases.set(p.deltaArtifactSha256,base);deliveryCheckpointSources.set(pin.roundId,b);chains.set(pin.chainId,next);
 }
 return {offlineBases,deliveryCheckpointSources,chains:sealChains(chains)};
}
/** Original external receipts must still be independently reviewed before pinning.
 * This function verifies archives/campaign and returns only a sanitized proposal. */
export async function prepareIndependentOfflineContinuation({chainId,anchor=null,deltaZip,completeZip,libraryReceiptRaw,attachmentReceiptRaw,terminalEvidenceRaw=null,reconciliationRaw=null,now=Date.now()}){
 if(!name.test(chainId)||![deltaZip,completeZip,libraryReceiptRaw,attachmentReceiptRaw].every(Buffer.isBuffer))fail('Exact pair and original private receipts required');
 const current=async()=>open({now:Date.now(),manifest:JSON.parse(await bytes(authorityRoot,'data/manifest.json')),publicationState:JSON.parse(await bytes(authorityRoot,'data/publication-state.json'))});await current();
 const saved=JSON.parse(libraryReceiptRaw),attached=JSON.parse(attachmentReceiptRaw),kinds=new Set(),ids=new Set();
 if(saved.schemaVersion!==1||attached.schemaVersion!==1||saved.status!=='library_saved_attachment_pending'||attached.status!=='native_attachments_accepted'||saved.roundId!==attached.roundId||saved.savedAt!==attached.savedAt||!equal(saved.artifacts,attached.artifacts)||saved.newlyPublishedByDelivery!==0||attached.newlyPublishedByDelivery!==0||attached.deliveryMode!=='download_only'||attached.publicationCountsChangedByDelivery!==false||attached.userOpenOrDownloadObserved!==false||saved.artifacts?.length!==2||attached.attachments?.length!==2)fail('Actual saved pair and both native attachments required');
 for(const a of saved.artifacts){const b=a.kind==='delta'?deltaZip:a.kind==='complete'?completeZip:null;if(!b||kinds.has(a.kind)||typeof a.library_file_id!=='string'||!a.library_file_id.trim()||ids.has(a.library_file_id)||hash(b)!==a.sha256||b.length!==a.bytes)fail('Private receipt pair differs from exact archives');kinds.add(a.kind);ids.add(a.library_file_id);}
 kinds.clear();let last=0;for(const a of attached.attachments){keys(a,['kind','library_file_id','messageId','acceptedAt']);if(kinds.has(a.kind)||!saved.artifacts.some(f=>f.kind===a.kind&&f.library_file_id===a.library_file_id)||typeof a.messageId!=='string'||!a.messageId.trim()||time(a.acceptedAt)<time(saved.savedAt)||time(a.acceptedAt)>now)fail('Actual acceptance for each saved artifact required');kinds.add(a.kind);last=Math.max(last,time(a.acceptedAt));}if(last!==time(attached.attachmentAcceptedAt))fail('Pair acceptance must equal the later native attachment');
 const delta=readDeliveredArchive(deltaZip,hash(deltaZip)),complete=readDeliveredArchive(completeZip,hash(completeZip)),d=JSON.parse(delta.get('manifest.json')),c=JSON.parse(complete.get('manifest.json'));
 if(!equal(delta.get('manifest.json'),json(d))||!equal(complete.get('manifest.json'),json(c)))fail('Canonical exact archive manifests required');validateDeliveredArchiveEntries(delta,d,'files/');validateDeliveredArchiveEntries(complete,c,'project/');for(const f of d.files)if(!equal(delta.get('files/'+f.path),complete.get('project/'+f.path)))fail('Mixed delta/full source bytes');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'independent-delivery-'));
 try{
  for(const f of c.files){const target=path.join(root,f.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,complete.get('project/'+f.path),{flag:'wx'});}
  const {loadRoundContext,validateReleaseLedger}=await import('./validate-round.mjs');
  const context=await loadRoundContext(root,null,{release:true,now});open({...context,now});
  const priorRaw=complete.get('project/'+OFFLINE_CHAIN_TRUST_PATH);if(priorRaw&&!equal(priorRaw,json(trusted))||!priorRaw&&trusted.checkpoints.length)fail('Delivered source must contain the entire reviewed trust registry');
  const previous=context.independentOfflineChains.get(chainId),source=context.ledgers.find(l=>l.roundId===c.sourceRelease.roundId);
  if(saved.roundId!==source?.roundId||attached.publicationAtPreparation!==source?.publication.status)fail('Private receipts name a different original source');
  let uncertainty=previous?.proof.uncertainty;
  if(!previous){
   if(!Buffer.isBuffer(terminalEvidenceRaw)||!Buffer.isBuffer(reconciliationRaw))fail('Original terminal and durable reconciliation evidence required');const t=JSON.parse(terminalEvidenceRaw),rawWait=JSON.parse(reconciliationRaw);
   const operation={create_blob:{outcome:'blobOutcome',later:['treeSubmitted','commitSubmitted','refSubmitted']},create_tree:{outcome:'treeOutcome',later:['commitSubmitted','refSubmitted']},create_commit:{outcome:'commitOutcome',later:['refSubmitted']},update_ref:{outcome:'refOutcome',later:[]}}[t.operation];
   if(!operation||t[operation.outcome]!=='unknown'||operation.later.some(k=>t[k]!==false)||t.followupGitWritesAllowed!==false||typeof t.refSubmitted!=='boolean'||t.refSubmitted===false&&d.gitOutcome.refWrite!=='not_submitted'||t.operation==='update_ref'&&(d.gitOutcome.refWrite!=='unknown'||d.gitOutcome.refStatus!=='unknown')||t.operation!=='update_ref'&&d.gitOutcome.objects!=='unknown')fail('Original uncertain operation and submitted Git stages contradict the frozen outcome');
   if(rawWait.artifactSha256!==t.artifactSha256||rawWait.roundId!==t.roundId||rawWait.reconciliationStatus!=='deadline_reached_skip_unresolved_git_step'||rawWait.originalOutcome!=='unknown'||rawWait.status!==t.status||rawWait.permissionNotificationAt!==t.permissionNotificationAt||rawWait.permissionDeadlineAt!==t.permissionDeadlineAt||time(rawWait.recordedAt)<time(rawWait.skippedAt))fail('Exact durable original-operation reconciliation skip required');
   const w={artifactSha256:hash(deltaZip),firstUnresolvedAt:rawWait.firstUnresolvedAt,deadlineAt:rawWait.reconciliationDeadlineAt,state:'skip_git_step',skippedAt:rawWait.skippedAt};
   if(t.roundId!==source.roundId||t.status!=='download_only'||t.recordedAt!==d.gitStoppedAt||t.permissionNotificationAt!==d.permissionNotifiedAt||t.permissionDeadlineAt!==d.permissionDeadlineAt||t.artifactSha256!==source.publication.bankSha256||t.firstUnresolvedAt!==w.firstUnresolvedAt||time(t.reconciliationDeadlineAt)!==time(w.deadlineAt)||w.artifactSha256!==hash(deltaZip))fail('Terminal evidence or original operation-to-delivery reconciliation binding differs');
   uncertainty={sourceArtifactSha256:t.artifactSha256,sourceEvidenceSha256:hash(terminalEvidenceRaw),reconciliationEvidenceSha256:hash(reconciliationRaw),wait:w};
  }else if(anchor!==null||terminalEvidenceRaw!==null||reconciliationRaw!==null)fail('Successor must preserve its original anchor and uncertainty, never create a new timeout');
  const s=c.sourceRelease,receipt={receiptSchemaVersion:1,artifactSha256:hash(deltaZip),parentDeliverySha256:d.parentDeliverySha256,roundId:s.roundId,executionId:d.executionId,baseCommit:d.baseCommit,status:'delivered',recordedAt:attached.attachmentAcceptedAt,newlyPublishedRegular:0,content:{roundId:s.roundId,ledgerPath:s.ledgerPath,ledgerSha256:s.ledgerSha256,bankVersion:s.bankVersion,bankSha256:s.bankSha256,acceptedGoalIds:source.candidates.filter(c=>c.decision==='accepted').map(c=>c.learningGoalId).sort()},manifestSha256:hash(json(d))};
  const p={schemaVersion:1,kind:'delivered_independent_offline_checkpoint',chainId,anchorSha256:previous?.pin.anchorSha256??hash(json(anchor)),anchor,previousProofSha256:previous?.pin.sha256??null,priorTrustSha256:priorRaw?hash(priorRaw):null,deltaArtifactSha256:hash(deltaZip),completeArtifactSha256:hash(completeZip),libraryReceiptSha256:hash(libraryReceiptRaw),attachmentReceiptSha256:hash(attachmentReceiptRaw),savedAt:saved.savedAt,attachmentAcceptedAt:attached.attachmentAcceptedAt,verifiedAt:new Date(now).toISOString(),userOpenOrDownloadObserved:false,receipt,deltaManifest:d,completeManifest:c,runtimeManifestRaw:complete.get('project/data/manifest.json').toString(),publicationStateRaw:complete.get('project/data/publication-state.json').toString(),sourceAllowlistRaw:complete.get('project/PUBLICATION-MANIFEST.txt').toString(),uncertainty};
  const pin=()=>({chainId,anchorSha256:p.anchorSha256,roundId:s.roundId,path:`docs/deliveries/chains/${chainId}/${s.roundId}.json`,sha256:hash(json(p)),previousProofSha256:p.previousProofSha256,verifiedAt:p.verifiedAt});
  inspectProof(p,pin(),previous,{...context,now},trusted);
  // At native acceptance the source's own proof was not yet eligible. The complete
  // source and current authority are checked without retroactively authorizing it.
  const checked=validateReleaseLedger(context.ledgers,{...context,now});if(!checked.ok)fail('Invalid delivered full campaign: '+checked.errors.join('; '));
  const active=await loadRoundContext(authorityRoot,null,{release:true,now:Date.now()}),gate=validateReleaseLedger(active.ledgers,{...active,now:Date.now()});if(!gate.ok)fail('Current authority campaign failed: '+gate.errors.join('; '));
  await current();p.verifiedAt=new Date().toISOString();if(time(p.verifiedAt)<now)fail('Completion cannot precede supplied verification time');inspectProof(p,pin(),previous,{...context,now:Date.now()},trusted);
  const record=pin(),next=registry({...trusted,checkpoints:[...trusted.checkpoints,record]});return {status:'proposed_requires_independent_receipt_review',proof:p,proofRaw:json(p),trustRecord:record,trustRegistryRaw:json(next)};
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
