/** Append-only, reviewed external publication evidence. No Git, network or history writes. */
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {isNormalPublication, isNormalChainPublication, NORMAL_SOURCE_KEYS, NORMAL_CHAIN_SOURCE_KEYS, validateNormalPublication, validateNormalBankTransition} from './normal-publication.mjs';
import {FREEZE_AT} from '../src/domain.js';
import normalRootTrust from '../docs/deliveries/normal-backup-root-trust.json' with {type:'json'};
import normalChainTrust from '../docs/deliveries/normal-backup-chain-trust.json' with {type:'json'};
import backupTrust from '../docs/deliveries/release-backup-trust.json' with {type:'json'};
import independentTrust from '../docs/deliveries/offline-chain-trust.json' with {type:'json'};
import quarantineTrust from '../docs/quarantines/trust.json' with {type:'json'};
import blockTrust from '../docs/release-blocks/trust.json' with {type:'json'};
import {validateQuarantineCampaign} from './prepublication-quarantine.mjs';
import {assertEvidenceLossProvenance, assertEvidenceLossPayload} from './evidence-loss-block.mjs';
const hash = raw => createHash('sha256').update(raw).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
// Adding another publication requires independently verified external evidence and
// a reviewed pin. Caller-supplied booleans, Maps, timestamps or checksums are not proof.
export const PUBLICATION_SYNCHRONIZATIONS = Object.freeze([
  Object.freeze({path:'docs/publications/cumulative-006-008.json', sha256:'50f08325d272954d9cb9d8f25c945ec71a2032f6a70f0869bba3e9a402c3aae0'}),
  Object.freeze({path:'docs/publications/cumulative-009-017.json', sha256:'fe147c597a5a5f155d6a65e7e9fd641e6a38f9c8d0db1147f513d1b2943959e2'}),
  Object.freeze({path:'docs/publications/cumulative-018-027.json', sha256:'1c4130dcdc2b873d061f193977d5a1b6ffb17f2ec8952df2df55614edc5ed6ab'})
]);
function trusted(record) {
  return record && PUBLICATION_SYNCHRONIZATIONS.some(pin => hash(json(record)) === pin.sha256);
}
/** Exact reviewed publication data is append-only. The original event remains
 * byte-for-byte unchanged; later events link its hash rather than replacing it. */
export function validatePublicationEvidenceOrder(records) {
  if (!Array.isArray(records)) throw Error('publication synchronizations must be an array of pinned evidence');
  for (const [index, record] of records.entries()) {
    if (!record || hash(json(record)) !== PUBLICATION_SYNCHRONIZATIONS[index]?.sha256) throw Error('Missing, reordered, unreviewed or tampered publication synchronization proof');
    if (index && (record.previousSynchronizationSha256 !== PUBLICATION_SYNCHRONIZATIONS[index-1].sha256 || Date.parse(record.verifiedAt) <= Date.parse(records[index-1].verifiedAt))) throw Error('Branched or reordered publication synchronization evidence');
  }
}
/** A delivery checkpoint remains the original proof, with its original public
 * anchor and unknown outcome. This only binds it to a separately verified event. */
const independentKind = 'delivered_independent_offline_checkpoint';
const sourceKeys = ['roundId','ledgerPath','originalLedgerSha256','bankVersion','bankSha256','accepted','originalPublicationStatus','artifactSha256','manifestSha256','deliveredAt','deliveryVerifiedAt','deliveryProof','receiptSha256','quarantined','eligible','newlyPublicRegular'];
const safePath = p => typeof p === 'string' && /^[A-Za-z0-9._/-]+$/.test(p) && !p.startsWith('/') && !p.split('/').some(v => !v || v === '.' || v === '..');
function checkedInventory(record) {
  if (!Array.isArray(record.remoteInventory) || !record.remoteInventory.length) throw Error('Exact publication inventory required');
  const inventory = new Map();
  for (const f of record.remoteInventory) {
    if (!f || !equal(Object.keys(f).sort(), Object.hasOwn(f,'gitBlob')?['bytes','gitBlob','path','sha256']:['bytes','path','sha256']) || Object.hasOwn(f,'gitBlob')&&!/^[a-f0-9]{40}$/.test(f.gitBlob) || !safePath(f.path) || inventory.has(f.path) || !/^[a-f0-9]{64}$/.test(f.sha256) || !Number.isSafeInteger(f.bytes) || f.bytes < 0) throw Error('Unsafe, duplicate or invalid publication inventory');
    assertEvidenceLossProvenance({bankVersion:/^data\/releases\/([^/]+)\/bank\.json$/.exec(f.path)?.[1],bankSha256:f.sha256});
    if(blockTrust.events.some(pin=>f.path===`docs/rounds/${pin.roundId}.md`))throw Error('Published inventory cannot invent the missing original blocked-round report');
    inventory.set(f.path,{path:f.path,bytes:f.bytes,sha256:f.sha256});
  }
  return inventory;
}
export function validateSynchronizationDeliveryProof(record, source, raw) {
  // Denial is unconditional, including direct callers outside the context loader.
  assertEvidenceLossProvenance(source);
  const ref=source?.deliveryProof;
  if (!trusted(record) || !record.rounds.some(s=>equal(s,source)) || !ref || !safePath(ref.path) || !Buffer.isBuffer(raw) || hash(raw)!==ref.sha256) throw Error('Missing, unreviewed or tampered synchronization delivery proof');
  const p=JSON.parse(raw), release=p.completeManifest?.sourceRelease;
  assertEvidenceLossProvenance(release); assertEvidenceLossProvenance(p.receipt?.content);
  assertEvidenceLossPayload(raw,ref.path);
  if(isNormalChainPublication(record))return validateNormalChainDeliveryProof(record,source,p,raw);
  if (!equal(raw,Buffer.from(json(p))) || !['normal_release_backup_continuation','delivered_release_backup_checkpoint',independentKind].includes(p.kind) || !release || release.roundId!==source.roundId || release.ledgerSha256!==source.originalLedgerSha256 || release.bankVersion!==source.bankVersion || release.bankSha256!==source.bankSha256 || p.deltaArtifactSha256!==source.artifactSha256 || hash(json(p.deltaManifest))!==source.manifestSha256 || p.attachmentAcceptedAt!==source.deliveredAt || p.verifiedAt!==source.deliveryVerifiedAt || !Number.isFinite(Date.parse(p.verifiedAt)) || Date.parse(p.verifiedAt)>Date.parse(record.verifiedAt)) throw Error('Publication must bind the exact original delivered ledger, bank, artifacts and chronology');
  const inventory=checkedInventory(record);
  for (const [path,sha256] of [[ref.path,ref.sha256],[`docs/rounds/${source.roundId}.json`,source.originalLedgerSha256],[`data/releases/${source.bankVersion}/bank.json`,source.bankSha256]]) if(inventory.get(path)?.sha256!==sha256) throw Error('Published inventory must preserve exact delivery dependencies');
  if (inventory.get(ref.path).bytes!==raw.length) throw Error('Published delivery proof byte length mismatch');
  if (p.kind===independentKind) {
    if (!equal(Object.keys(source).sort(),[...sourceKeys].sort()) || source.ledgerPath!==release.ledgerPath) throw Error('Independent publication source fields must be exact');
    const pin=independentTrust.checkpoints.find(pin=>pin.path===ref.path);
    if (!pin || pin.sha256!==ref.sha256 || pin.roundId!==source.roundId || ['chainId','anchorSha256','previousProofSha256','verifiedAt'].some(k=>pin[k]!==p[k])) throw Error('Independent publication requires exact reviewed chain, anchor and predecessor pin');
    const r=p.receipt;
    if (!r || hash(json(r))!==source.receiptSha256 || r.status!=='delivered' || r.recordedAt!==p.attachmentAcceptedAt || r.roundId!==source.roundId || r.artifactSha256!==source.artifactSha256 || r.manifestSha256!==source.manifestSha256 || r.content?.roundId!==source.roundId || r.content?.ledgerPath!==release.ledgerPath || r.content?.ledgerSha256!==source.originalLedgerSha256 || r.content?.bankVersion!==source.bankVersion || r.content?.bankSha256!==source.bankSha256 || release.deltaArtifactSha256!==p.deltaArtifactSha256 || release.deltaManifestSha256!==source.manifestSha256 || p.completeManifest.kind!=='complete_project_not_learner_import' || p.completeManifest.deliveryMode!=='download_only' || !/^[a-f0-9]{64}$/.test(p.completeArtifactSha256) || !equal(p.completeManifest.files,p.completeManifest.frozenSourceInventory)) throw Error('Independent publication must bind its exact delivered receipt and complete artifact');
    // Delivered protection evidence is immutable even when the later payload adds
    // its own source checkpoint. Do not demand future evidence from old archives.
    for (const f of p.completeManifest.files.filter(f=>!f.path.endsWith('/trust.json')&&(f.path.startsWith('data/releases/') || /^data\/seed-bank(?:-v\d+)?\.json$/.test(f.path) || /^docs\/(?:rounds\/round-\d+\.(?:json|md)|corrections\/|publications\/|quarantines\/|release-blocks\/|incidents\/)/.test(f.path) || f.path.startsWith('docs/deliveries/')&&!f.path.endsWith('trust.json')))) {
      if (!equal(inventory.get(f.path),f)) throw Error('Published inventory must preserve exact immutable history, quarantine and release-block evidence');
    }
  }
  if (p.kind===independentKind) {
    for (const [path,registry,key] of [['docs/quarantines/trust.json',quarantineTrust,'audits'],['docs/release-blocks/trust.json',blockTrust,'events']]) {
      const original=p.completeManifest.files.find(f=>f.path===path);
      if (!original) continue;
      const prefixes=Array.from({length:registry[key].length+1},(_,n)=>({...registry,[key]:registry[key].slice(0,n)}));
      const prior=prefixes.findIndex(v=>hash(json(v))===original.sha256&&Buffer.byteLength(json(v))===original.bytes);
      if (prior<0 || !prefixes.slice(prior).some(v=>inventory.get(path)?.sha256===hash(json(v))&&inventory.get(path)?.bytes===Buffer.byteLength(json(v))&&v[key].every(pin=>inventory.get(pin.path)?.sha256===pin.sha256))) throw Error('Published inventory must preserve exact quarantine and release-block trust prefixes');
    }
    if (source.bankVersion===record.manifest.bankVersion) {
      const raw=Buffer.from(p.runtimeManifestRaw),file=inventory.get('data/manifest.json');
      if (!equal(JSON.parse(raw),record.manifest) || hash(raw)!==record.manifestSha256 || file?.sha256!==hash(raw) || file?.bytes!==raw.length) throw Error('Published runtime manifest must be the exact delivered tip manifest');
    }
    const position=independentTrust.checkpoints.findIndex(pin=>pin.path===ref.path);
    const registry=inventory.get('docs/deliveries/offline-chain-trust.json');
    if (!independentTrust.checkpoints.slice(position).some((_,offset)=>{
      const prefix={...independentTrust,checkpoints:independentTrust.checkpoints.slice(0,position+offset+1)},raw=Buffer.from(json(prefix));
      return registry?.sha256===hash(raw)&&registry?.bytes===raw.length&&prefix.checkpoints.every(pin=>inventory.get(pin.path)?.sha256===pin.sha256);
    })) throw Error('Published inventory must retain the exact reviewed independent trust prefix');
  }
  return p;
}
/** Normal release receipts remain private hashes, never synthetic legacy receipts.
 * The pinned proof and its original trust chain are still independently required. */
function validateNormalChainDeliveryProof(record,source,p,raw){
 const ref=source.deliveryProof,root=p.kind==='delivered_normal_release_root_checkpoint',pins=root?normalRootTrust.roots:normalChainTrust.checkpoints,pin=pins.find(v=>v.path===ref.path),release=p.completeManifest?.sourceRelease;
 if(!equal(Object.keys(ref).sort(),['path','sha256'])||!equal(Object.keys(source).sort(),[...NORMAL_CHAIN_SOURCE_KEYS].sort())||source.kind!=='normal_delivered_checkpoint'||!['delivered_normal_release_root_checkpoint','delivered_normal_release_successor_checkpoint'].includes(p.kind)||!pin||pin.sha256!==ref.sha256||pin.roundId!==source.roundId||!equal(raw,Buffer.from(json(p)))||!release||release.roundId!==source.roundId||release.ledgerPath!==source.ledgerPath||release.ledgerSha256!==source.originalLedgerSha256||release.bankVersion!==source.bankVersion||release.bankSha256!==source.bankSha256||p.deltaArtifactSha256!==source.artifactSha256||hash(json(p.deltaManifest))!==source.manifestSha256||p.attachmentAcceptedAt!==source.deliveredAt||p.verificationCompletedAt!==source.deliveryVerifiedAt||p.privateEvidence.attachmentReceiptSha256!==source.attachmentReceiptSha256||!Number.isFinite(Date.parse(p.verificationCompletedAt))||Date.parse(pin.eligibleAt)>Date.parse(record.verifiedAt)||Date.parse(p.verificationCompletedAt)>Date.parse(pin.eligibleAt)||!root&&(pin.rootProofSha256!==p.rootProofSha256||pin.previousProofSha256!==p.previousProofSha256))throw Error('Normal-chain publication requires exact reviewed delivered proof, receipt hash and chronology');
 const inventory=checkedInventory(record),remote=new Map(record.remoteInventory.map(f=>[f.path,f]));
 for(const [path,bytes,sha256]of [[ref.path,raw,ref.sha256]])if(inventory.get(path)?.sha256!==sha256||inventory.get(path)?.bytes!==bytes.length||remote.get(path)?.gitBlob!==createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`),bytes])).digest('hex'))throw Error('Normal-chain publication must preserve exact delivered proof bytes');
 for(const f of p.completeManifest.files.filter(f=>/^data\/(?:releases\/|seed-bank)/.test(f.path)||/^docs\/(?:rounds\/round-\d+\.(?:json|md)$|corrections\/|publications\/|deliveries\/|quarantines\/|release-blocks\/|incidents\/)/.test(f.path)&&!f.path.endsWith('trust.json')))if(!equal(inventory.get(f.path),f))throw Error('Normal-chain publication must retain all immutable delivered history');
 for(const [path,registry,key]of [['docs/quarantines/trust.json',quarantineTrust,'audits'],['docs/release-blocks/trust.json',blockTrust,'events'],['docs/deliveries/offline-chain-trust.json',independentTrust,'checkpoints'],['docs/deliveries/release-backup-trust.json',backupTrust,'checkpoints'],['docs/deliveries/normal-backup-root-trust.json',normalRootTrust,'roots'],['docs/deliveries/normal-backup-chain-trust.json',normalChainTrust,'checkpoints']]){
  const original=p.completeManifest.files.find(f=>f.path===path),prefixes=Array.from({length:registry[key].length+1},(_,n)=>({...registry,[key]:registry[key].slice(0,n)}));
  const matches=(f,v)=>f?.sha256===hash(json(v))&&f?.bytes===Buffer.byteLength(json(v));
  const prior=original?prefixes.findIndex(v=>matches(original,v)):0;
  if(prior<0||!prefixes.slice(prior).some(v=>matches(inventory.get(path),v)&&v[key].every(pin=>inventory.get(pin.path)?.sha256===pin.sha256)&&(path!==(root?'docs/deliveries/normal-backup-root-trust.json':'docs/deliveries/normal-backup-chain-trust.json')||v[key].some(v=>v.sha256===pin.sha256))))throw Error('Normal-chain publication requires preserved exact reviewed trust prefixes including its own checkpoint');
 }
 if(source.bankVersion===record.manifest.bankVersion&&(record.runtimeManifestRaw!==p.runtimeManifestRaw||record.publicationStateRaw!==p.publicationStateRaw))throw Error('Normal-chain publication requires exact delivered tip freeze markers');
 return p;
}
/** A sealed fully validated chain supplies membership, not a caller Map or receipt. */
export async function validateNormalChainSynchronizationSources(synchronizations,chains,deliveryCheckpointSources,dependencyContext={}){
 const {assertValidatedNormalBackupChains}=await import('./normal-backup-chain.mjs');assertValidatedNormalBackupChains(chains);validatePublicationEvidenceOrder(synchronizations);
 for(const record of synchronizations){
  if(!isNormalChainPublication(record)||!requiresSynchronizationDeliveryDependencies(record,dependencyContext))continue;
  let chain=null,position=-1;
  for(const source of record.rounds){const p=validateSynchronizationDeliveryProof(record,source,deliveryCheckpointSources.get(source.roundId)),root=p.kind==='delivered_normal_release_root_checkpoint'?source.deliveryProof.sha256:p.rootProofSha256,c=chains.get(root),i=c?.sources.findIndex(s=>s.proofSha256===source.deliveryProof.sha256);
   if(!c||i<0||chain&&(chain!==c||i!==position+1)||!equal(c.sources[i].proof,p))throw Error('Normal publication sources must be contiguous members of one fully validated chain');chain=c;position=i;
  }
  const p=chain.sources[position].proof,anchor=p.kind==='delivered_normal_release_root_checkpoint'?p.continuationAnchor:p.publicAnchor;
  if(record.parent!==anchor.baseCommit)throw Error('Normal-chain publication parent must match its exact reviewed public anchor');
  const inventory=checkedInventory(record);
  if(anchor.remoteInventory.some(f=>!inventory.has(f.path)||f.path.startsWith('docs/analysis/')&&!equal(inventory.get(f.path),f)))throw Error('Normal-chain publication must retain every public anchor path and exact reviewed analysis');
 }
}
/** Only an explicitly historical, non-release, unrelated partial ledger read may
 * omit later delivery dependencies. This does not activate or resolve an event.
 * Current/release/source-complete contexts and default callers remain strict. */
export function requiresSynchronizationDeliveryDependencies(record, {ledgers = [], now = null, release = true} = {}) {
  const at=Date.parse(record.verifiedAt);
  return !(release===false && Number.isFinite(now) && now<at &&
    !record.rounds.every(s=>ledgers.some(r=>r.roundId===s.roundId)) &&
    !ledgers.some(r=>Date.parse(r.startedAt)>=at));
}
/** Run only after loadIndependentOfflineChains has authenticated each full chain.
 * No publication claim supplies an anchor, receipt, manifest or resolution. */
export async function validateIndependentSynchronizationSources(synchronizations, chains, deliveryCheckpointSources, dependencyContext = {}) {
  const {assertValidatedIndependentOfflineChains}=await import('./offline-chain-continuation.mjs');
  assertValidatedIndependentOfflineChains(chains);
  validatePublicationEvidenceOrder(synchronizations);
  for (const record of synchronizations) for (const source of record.rounds) {
    if (!requiresSynchronizationDeliveryDependencies(record,dependencyContext) || !source.deliveryProof?.path.startsWith('docs/deliveries/chains/')) continue;
    const raw=deliveryCheckpointSources.get(source.roundId);
    const p=validateSynchronizationDeliveryProof(record,source,raw),chain=chains.get(p.chainId);
    if (!chain || hash(json(chain.anchor))!==p.anchorSha256 || !chain.receipts.some(r=>equal(r,p.receipt)) || !equal(chain.manifests.get(p.deltaArtifactSha256),p.deltaManifest)) throw Error('Publication source is not a member of its fully validated independent chain');
  }
}
function validateIndependentPublicationCounts(record, {ledgers,banks,ledgerSources}, previousPublication) {
  const independent=record.rounds.some(s=>s.deliveryProof?.path?.startsWith('docs/deliveries/chains/') || independentTrust.checkpoints.some(pin=>pin.roundId===s.roundId||pin.sha256===s.deliveryProof?.sha256));
  const chain=isNormalChainPublication(record),normal=isNormalPublication(record)||chain;
  if (!independent && !normal) return;
  if (!previousPublication || record.rounds.some(s=>!equal(Object.keys(s).sort(),[...(chain?NORMAL_CHAIN_SOURCE_KEYS:normal?NORMAL_SOURCE_KEYS:sourceKeys)].sort()))) throw Error('Independent publication requires complete source fields and a linked prior verified publication');
  const quarantine=validateQuarantineCampaign(ledgers,{banks,ledgerSources});
  if (!quarantine.ok) throw Error(quarantine.errors.join('; '));
  const bank=version=>JSON.parse(banks.get(version)?.raw ?? 'null');
  const sources=new Set(),newIds=new Set(); let previous=null;
  for (const source of record.rounds) {
    assertEvidenceLossProvenance(source);
    if (sources.has(source.roundId)) throw Error('Duplicate independent publication source');
    sources.add(source.roundId);
    const ledger=ledgers.find(l=>l.roundId===source.roundId),current=bank(source.bankVersion),baseline=bank(ledger?.baseline?.bankVersion),d=quarantine.dispositions.get(source.roundId);
    if (!ledger || !current || !baseline || !d || source.originalPublicationStatus!==ledger.publication.status || source.accepted!==d.counts.accepted || source.quarantined!==d.counts.quarantined || source.eligible!==d.counts.eligible) throw Error('Publication accepted, quarantined and eligible counts must retain original validated dispositions');
    if (normal) validateNormalBankTransition(record,ledger,current,baseline,d);
    if (previous && (ledger.baseline.bankVersion!==previous.bankVersion || ledger.baseline.bankSha256!==previous.bankSha256)) throw Error('Independent publication sources must retain their exact cumulative order');
    const priorIds=new Set(baseline.questions.map(q=>q.questionId)),added=current.questions.filter(q=>!q.testOnly&&!priorIds.has(q.questionId));
    const eligible=ledger.candidates.filter(c=>d.eligibleCandidateIds.includes(c.candidateId));
    if (source.newlyPublicRegular!==added.length || added.length!==eligible.length || !equal(added.map(q=>q.questionId).sort(),eligible.map(c=>c.questionId).sort())) throw Error('Publication additions must equal exact eligible original candidates');
    for (const q of added) {if(newIds.has(q.questionId))throw Error('Duplicate newly public content');newIds.add(q.questionId);}
    previous=source;
  }
  const first=ledgers.find(l=>l.roundId===record.rounds[0].roundId);
  if(first.baseline.bankVersion!==previousPublication.manifest.bankVersion||first.baseline.bankSha256!==previousPublication.manifest.sha256)throw Error('Independent publication must start at the exact linked prior verified public bank');
  const anchor=bank(previousPublication.manifest.bankVersion),final=bank(record.manifest.bankVersion);
  if (!final || previous.bankVersion!==record.manifest.bankVersion || previous.bankSha256!==record.manifest.sha256 || hash(banks.get(final.bankVersion).raw)!==record.manifest.sha256) throw Error('Publication tip must be the exact final source bank');
  const regular=final.questions.filter(q=>!q.testOnly),anchorIds=new Set(anchor.questions.filter(q=>!q.testOnly).map(q=>q.questionId)),actualNew=regular.filter(q=>!anchorIds.has(q.questionId));
  const counts={regular:regular.length,written:regular.filter(q=>q.type==='written').length,practical:regular.filter(q=>q.type==='practical').length,testOnly:final.questions.filter(q=>q.testOnly).length,total:final.questions.length,newlyPublicFromAnchor:actualNew.length};
  const subjects=Object.fromEntries(['s1','s2','s3','s4','s5'].map(s=>[s,regular.filter(q=>q.type==='written'&&q.subjectId===s).length]));
  if (!equal(record.counts,counts) || !equal(record.writtenBySubject,subjects) || !equal([...newIds].sort(),actualNew.map(q=>q.questionId).sort()) || [...anchorIds].some(id=>!regular.some(q=>q.questionId===id))) throw Error('Publication totals and newly-public count must match exact cumulative bank content');
}

/** Original history remains authoritative. Only a separate post-verification event
 * is added to cumulative ordering; old ledgers/counters are never synthesized. */
export function validatePublicationSynchronizations(synchronizations = [], {ledgers = [], banks = new Map(), ledgerSources = new Map(), now = null, publicationState = null, activeBankVersion = null} = {}) {
  const errors = [], history = [], seen = new Set();
  try { validatePublicationEvidenceOrder(synchronizations); } catch(error) { return {ok:false, errors:[error.message], history}; }
  for (const record of synchronizations) {
    if (!trusted(record)) { errors.push('publication synchronization proof is absent, unreviewed or tampered'); continue; }
    if (!Array.isArray(record.rounds) || !record.rounds.length) { errors.push('Publication synchronization requires original delivered sources'); continue; }
    if (!['verified_cumulative_publication','verified_normal_publication','verified_normal_chain_publication'].includes(record.kind) || !isNormalPublication(record) && record.rounds.some(s=>s.kind==='normal_frozen_ledger' || !isNormalChainPublication(record)&&s.kind==='normal_delivered_checkpoint' || record.previousSynchronizationSha256 && (!s.deliveryProof || !safePath(s.deliveryProof.path) || !/^[a-f0-9]{64}$/.test(s.deliveryProof.sha256)))) { errors.push('Unknown or mismatched publication event/source kind'); continue; }
    if (seen.has(record.syncId)) { errors.push('duplicate publication synchronization'); continue; }
    seen.add(record.syncId);
    const at = Date.parse(record.verifiedAt);
    try { assertEvidenceLossPayload(Buffer.from(json(record))); for(const source of record.rounds) assertEvidenceLossProvenance(source); } catch(error) { errors.push(error.message); continue; }
    if (!Number.isFinite(at) || at >= FREEZE_AT || publicationState?.finalizedAt && at > Date.parse(publicationState.finalizedAt)) { errors.push('publication synchronization violates final cutoff or persistent freeze'); continue; }
    // Future evidence is authenticated, but cannot authorize an earlier round.
    // A complete supplied source is still byte-checked before it becomes active.
    const relevant = activeBankVersion !== null && (now === null || at <= now) || record.rounds.every(s => ledgers.some(r => r.roundId === s.roundId)) || ledgers.some(r => Date.parse(r.startedAt) >= at);
    if (!relevant) continue; // unrelated earlier subset audit
    const before = errors.length;
    for (const source of record.rounds) {
      const matches = ledgers.filter(r => r.roundId === source.roundId);
      const raw = ledgerSources instanceof Map ? ledgerSources.get(source.roundId) : null;
      const bankRaw = (banks instanceof Map ? banks.get(source.bankVersion) : banks?.[source.bankVersion])?.raw;
      if (!raw || hash(raw) !== source.originalLedgerSha256 || matches.length !== 1 || !equal(JSON.parse(raw.toString()), matches[0])) errors.push(`${source.roundId}: synchronization requires exact original closed ledger and unchanged review history`);
      if (!bankRaw || hash(bankRaw) !== source.bankSha256) errors.push(`${source.roundId}: synchronization requires exact immutable bank bytes`);
      if (Date.parse(source.deliveredAt) > at || matches[0] && Date.parse(matches[0].closedAt) > at) errors.push(`${source.roundId}: synchronization must follow delivery and decision closure`);
    }
    try { if(isNormalPublication(record)||isNormalChainPublication(record)) validateNormalPublication(record,{ledgers,banks,ledgerSources,inventory:checkedInventory(record),previousPublication:synchronizations.find(prior=>hash(json(prior))===record.previousSynchronizationSha256)}); validateIndependentPublicationCounts(record,{ledgers,banks,ledgerSources},synchronizations.find(prior=>hash(json(prior))===record.previousSynchronizationSha256)); } catch(error) { errors.push(error.message); }
    if (errors.length !== before || now !== null && at > now) continue;
    history.push({syncId:record.syncId, synchronizedRoundIds:record.rounds.map(s => s.roundId), publication:{status:'verified', verifiedAt:record.verifiedAt, bankVersion:record.manifest.bankVersion, bankSha256:record.manifest.sha256, commit:record.commit, url:record.siteUrl}, evidence:record});
  }
  return {ok:errors.length === 0, errors, history};
}
/** Resolve only exact original delivery artifacts covered by a checked publication.
 * This describes current content publication, never the outcome of an old Git call.
 * Pass the full campaign context; do not pass a fabricated resolvedArtifacts Set. */
export function resolveSynchronizedArtifacts(receipts, {synchronizations = [], ...context} = {}) {
  const result = validatePublicationSynchronizations(synchronizations, context);
  const resolvedArtifacts = new Set(), errors = [...result.errors];
  if (!Array.isArray(receipts)) return {ok:false, errors:['receipt array required'], resolvedArtifacts};
  for (const receipt of receipts) {
    const proof = result.history.flatMap(h => h.evidence.rounds).find(s => !['normal_frozen_ledger','normal_delivered_checkpoint'].includes(s.kind) && typeof s.artifactSha256==='string' && s.artifactSha256 === receipt?.artifactSha256);
    if (!proof) continue;
    if (hash(json(receipt)) !== proof.receiptSha256 || receipt.manifestSha256 !== proof.manifestSha256) errors.push('synchronized artifact receipt is not the exact original delivered evidence');
    else resolvedArtifacts.add(proof.artifactSha256);
  }
  if (errors.length) resolvedArtifacts.clear();
  return {ok:errors.length === 0, errors, resolvedArtifacts};
}
