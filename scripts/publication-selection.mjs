/** One reviewed post-materialization selection. Candidate decisions are never projected.
 * Raw immutable files and the reviewed pin are the authority; diagnostics and caller
 * objects cannot authorize publication, omit dependencies, or reactivate exclusions. */
import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {FREEZE_AT} from '../src/domain.js';
import {parseImmutableBank,quarantineHash,quarantineContentHash,quarantineFingerprint} from './prepublication-quarantine.mjs';

export const PUBLICATION_SELECTION_PATH='docs/publication-selections/round-041-selection-001.json';
// Independently authenticated exact bytes. An explicitly projected null pin is
// reserved for disposable historical fixtures and cannot authorize a selection.
export const PUBLICATION_SELECTION_PIN=Object.freeze({path:PUBLICATION_SELECTION_PATH,sha256:'8b6a937f4af4fc6513f1366277e6f0dfddb12cf1c53c78d824cf846199db3254'});
const MODULE_PATH='scripts/publication-selection.mjs';
const ORIGINAL_LEDGER_PATH='docs/rounds/round-041.json';
const ORIGINAL_LEDGER_SHA256='a76c5fe74e7f7b0fc1531d853962b8613d4131eb20508465a19894d362679cd6';
const ORIGINAL_BANK_VERSION='2026.10.10-regular.41';
const ORIGINAL_BANK_SHA256='e79345d85a7a296c1405404d1773d3d953fa39a1734d6831b01317e24184d9d7';
const ORIGINAL_BANK_PATH=`data/releases/${ORIGINAL_BANK_VERSION}/bank.json`;
const SELECTED_BANK_VERSION='2026.10.10-regular.41-selection.1';
const SELECTED_BANK_PATH=`data/releases/${SELECTED_BANK_VERSION}/bank.json`;
const BASELINE_VERSION='2026.10.09-regular.39';
const BASELINE_SHA256='42cc772d52de759ee9c292f2d47bd71aa5e0371c8679fa7992a218ee68cda919';
const BASELINE_PATH=`data/releases/${BASELINE_VERSION}/bank.json`;
const BASELINE_COMMIT='997f04e038336ceaeefbbe2ef5c319d2744c57a9';
const RETAINED_ID='r041-primary-s4-w01';
const EXCLUDED_IDS=['r041-primary-s2-w01','r041-primary-s3-w01'];
const REQUIRED_REGISTRIES=['normal-backup-root-trust','normal-backup-chain-trust','release-backup-trust','offline-chain-trust'].map(n=>`docs/deliveries/${n}.json`);
const authorities=new WeakMap(),identities=new WeakSet();
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const parseBank=raw=>parseImmutableBank(raw.toString());
const hex=/^(?!0{64}$)[a-f0-9]{64}$/;
const identifier=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/;
const fail=message=>{throw Error('publication selection: '+message);};
const sorted=values=>[...values].sort();
const safe=p=>typeof p==='string'&&/^[A-Za-z0-9._/-]+$/.test(p)&&!p.startsWith('/')&&!p.split('/').some(v=>!v||v==='.'||v==='..');
function keys(value,expected,label='record') {
  if(!value||typeof value!=='object'||Array.isArray(value)||!equal(sorted(Object.keys(value)),sorted(expected)))fail(`unexpected ${label} fields`);
}
function freeze(value) {
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;
}
function time(value,label) {
  const at=Date.parse(value);if(typeof value!=='string'||!Number.isFinite(at)||at>=FREEZE_AT)fail(`invalid ${label} time or final cutoff`);return at;
}
function current(now) {if(!Number.isFinite(now)||now>=FREEZE_AT)fail('current time must precede final cutoff');}
function plainRaw(raw) {
  if(typeof raw==='string')return Buffer.from(raw);
  if(Buffer.isBuffer(raw)&&Object.getPrototypeOf(raw)===Buffer.prototype)return Buffer.from(raw);
  fail('exact ordinary raw bytes required');
}
function snapshot(files) {
  if(!Array.isArray(files))fail('raw-file snapshot array required');
  const out=new Map();
  for(const file of files){if(!file||!safe(file.path)||out.has(file.path))fail('unsafe or duplicate snapshot path');out.set(file.path,plainRaw(file.raw));}
  return out;
}
function boundFile(files,p,digest,label) {
  const raw=files.get(p);if(!raw||hash(raw)!==digest)fail(`missing or changed ${label}: ${p}`);return raw;
}
function linked(bank,question) {
  return (question.links||[]).map(link=>{
    const options=(bank.options||[]).filter(option=>option.optionId===link.optionId&&option.revision===link.optionRevision);
    if(options.length!==1)fail('missing or duplicate exact linked option');return options[0];
  });
}
function manifestPaths(raw) {
  if(!raw)fail('missing public allowlist');
  const paths=raw.toString().split(/\r?\n/).map(p=>p.trim()).filter(p=>p&&!p.startsWith('#'));
  if(paths.some(p=>!safe(p))||new Set(paths).size!==paths.length)fail('unsafe or duplicate public allowlist');return new Set(paths);
}
function target(value,candidate,bank,excluded) {
  keys(value,['candidateId','questionId','revision','learningGoalId','templateId','lineageId','candidateSha256','contentSha256','identityFreeSha256','exclusiveOptionIds',...(excluded?['reasonCode','reason','publicationDisposition']:[])],'candidate target');
  if(!candidate||candidate.decision!=='accepted'||candidate.cycles?.at(-1)?.outcome!=='accepted'||candidate.publishedBankVersion!==null)fail('selection target must be the original accepted unpublished terminal candidate');
  for(const k of ['candidateId','questionId','learningGoalId','templateId','lineageId'])if(!identifier.test(value[k])||value[k]!==candidate[k])fail('candidate identity differs from original ledger');
  if(value.revision!==candidate.revision||!Number.isSafeInteger(value.revision)||value.revision<1||value.candidateSha256!==quarantineHash(candidate))fail('candidate revision or complete decision hash changed');
  const questions=bank.questions.filter(q=>q.questionId===value.questionId),question=questions[0];
  if(questions.length!==1||question.revision!==value.revision||question.testOnly!==false||question.type!=='written'||question.optionMode!=='exclusive')fail('target must identify exact original regular exclusive-option question');
  for(const k of ['questionId','learningGoalId','templateId','revision'])if(question[k]!==value[k])fail('original candidate and question identity mismatch');
  const options=linked(bank,question);
  if(!hex.test(value.contentSha256)||value.contentSha256!==quarantineContentHash(question,options)||!hex.test(value.identityFreeSha256)||value.identityFreeSha256!==quarantineFingerprint(question,options)||!Array.isArray(value.exclusiveOptionIds)||!equal(sorted(value.exclusiveOptionIds),sorted(options.map(o=>o.optionId))))fail('target content, collision fingerprint or exclusive options changed');
  if(excluded&&(value.publicationDisposition!=='excluded_reserved'||value.reasonCode!=='low_priority_narrow_rule'||typeof value.reason!=='string'||!value.reason.trim()))fail('exclusion must be terminal publication selection with a stated priority reason');
  return {target:value,question,options};
}
function hasOriginal(value) {
  if(typeof value==='string')return value==='round-041'||value===ORIGINAL_BANK_VERSION||value===ORIGINAL_BANK_SHA256;
  return !!value&&typeof value==='object'&&Object.values(value).some(hasOriginal);
}
function historicalBankInventory(record) {
  const inventory=new Map();
  for(const entry of record.nonDeliveryEvidence.registrySnapshots){
    if(!entry.path.startsWith('docs/publications/'))continue;
    for(const file of JSON.parse(entry.raw).remoteInventory||[]){
      if(!/^data\/releases\/[^/]+\/bank\.json$/.test(file.path))continue;
      if(!hex.test(file.sha256)||inventory.has(file.path)&&inventory.get(file.path)!==file.sha256)fail('conflicting historical bank evidence in checked publication snapshots');
      inventory.set(file.path,file.sha256);
    }
  }
  return inventory;
}
function reviewedLocalRecord() {
  if(!hex.test(PUBLICATION_SELECTION_PIN.sha256??''))fail('selection pin is pending independent exact-record review');
  const raw=readFileSync(path.resolve(import.meta.dirname,'..',PUBLICATION_SELECTION_PATH));
  if(hash(raw)!==PUBLICATION_SELECTION_PIN.sha256)fail('reviewed selection authority missing or changed');
  return JSON.parse(raw);
}
function exactHistoricalSnapshot(files) {
  // This is read-only archive evidence, never a current root dependency bypass.
  // Membership, every byte count, and every raw hash must match one previously
  // authenticated complete inventory. A manifest date or caller flag is useless.
  if(!files.has('PUBLICATION-MANIFEST.txt')||!files.has('data/manifest.json')||files.has(PUBLICATION_SELECTION_PATH)||files.has(ORIGINAL_LEDGER_PATH)||files.has(ORIGINAL_BANK_PATH)||files.has(SELECTED_BANK_PATH))return false;
  const record=reviewedLocalRecord();
  const matches=inventory=>{
    if(!Array.isArray(inventory)||!inventory.length||inventory.length!==files.size)return false;
    const seen=new Set();
    for(const file of inventory){
      if(!safe(file.path)||seen.has(file.path)||!hex.test(file.sha256)||!Number.isSafeInteger(file.bytes)||file.bytes<0)return false;
      const raw=files.get(file.path);if(!raw||raw.length!==file.bytes||hash(raw)!==file.sha256)return false;seen.add(file.path);
    }
    return seen.has('PUBLICATION-MANIFEST.txt')&&seen.has('data/manifest.json');
  };
  for(const entry of record.nonDeliveryEvidence.registrySnapshots)if(entry.path.startsWith('docs/publications/')&&matches(JSON.parse(entry.raw).remoteInventory))return true;
  for(const entry of record.nonDeliveryEvidence.registrySnapshots){
    if(!REQUIRED_REGISTRIES.includes(entry.path))continue;
    const registry=JSON.parse(entry.raw);
    for(const pin of registry.roots??registry.checkpoints??[]){
      if(!safe(pin.path)||!pin.path.startsWith('docs/deliveries/')||!hex.test(pin.sha256))fail('invalid historical delivery proof pin');
      const raw=readFileSync(path.resolve(import.meta.dirname,'..',pin.path));
      if(hash(raw)!==pin.sha256)fail('historical delivery proof changed');
      if(matches(JSON.parse(raw).completeManifest?.files))return true;
    }
  }
  return false;
}
function inspectRecord(raw,files,now) {
  current(now);const record=JSON.parse(raw);
  keys(record,['schemaVersion','kind','selectionId','roundId','decidedAt','reasonCode','directive','originalLedger','originalBank','baseline','originalProducer','nonDeliveryEvidence','retained','excluded','selectedBank','independentAssessment']);
  if(!equal(raw,json(record))||record.schemaVersion!==1||record.kind!=='post_materialization_pre_delivery_selection'||record.selectionId!=='round-041-selection-001'||record.roundId!=='round-041'||record.reasonCode!=='user_learning_priority_change')fail('noncanonical or unsupported selection record');
  keys(record.originalLedger,['path','sha256'],'original ledger');
  keys(record.originalBank,['version','path','sha256'],'original bank');
  keys(record.baseline,['version','sha256','sourceCommit'],'baseline');
  if(!equal(record.originalLedger,{path:ORIGINAL_LEDGER_PATH,sha256:ORIGINAL_LEDGER_SHA256})||!equal(record.originalBank,{version:ORIGINAL_BANK_VERSION,path:ORIGINAL_BANK_PATH,sha256:ORIGINAL_BANK_SHA256})||!equal(record.baseline,{version:BASELINE_VERSION,sha256:BASELINE_SHA256,sourceCommit:BASELINE_COMMIT}))fail('selection may bind only the reviewed exact original and online baseline');
  const ledgerRaw=boundFile(files,ORIGINAL_LEDGER_PATH,ORIGINAL_LEDGER_SHA256,'original ledger');
  const ledger=JSON.parse(ledgerRaw),original=parseBank(boundFile(files,ORIGINAL_BANK_PATH,ORIGINAL_BANK_SHA256,'retired original bank'));
  const baseline=parseBank(boundFile(files,BASELINE_PATH,BASELINE_SHA256,'original online baseline'));
  const decidedAt=time(record.decidedAt,'decision');
  if(ledger.status!=='closed'||ledger.roundId!=='round-041'||ledger.publication?.status!=='not_attempted'||ledger.publication.bankVersion!==ORIGINAL_BANK_VERSION||ledger.publication.bankSha256!==ORIGINAL_BANK_SHA256||ledger.publication.commit!==null||ledger.publication.verifiedAt!==null||decidedAt<time(ledger.closedAt,'original closure')||decidedAt>time(ledger.decisionDeadline,'original deadline')||decidedAt>now)fail('decision must follow exact unpublished closure within original deadline and current time');
  if(ledger.baseline.bankVersion!==BASELINE_VERSION||ledger.baseline.bankSha256!==BASELINE_SHA256||ledger.baseline.sourceCommit!==BASELINE_COMMIT||baseline.bankVersion!==BASELINE_VERSION||original.bankVersion!==ORIGINAL_BANK_VERSION)fail('original ledger or bank baseline identity mismatch');
  keys(record.directive,['sha256','issuedAt','summary'],'directive');
  if(!hex.test(record.directive.sha256)||typeof record.directive.summary!=='string'||!record.directive.summary.trim()||time(record.directive.issuedAt,'directive')<time(ledger.closedAt,'closure')||time(record.directive.issuedAt,'directive')>decidedAt)fail('missing contemporaneous user-directive digest');
  keys(record.originalProducer,['terminalSha256','completedAt','sourceInventorySha256','artifacts'],'original producer');
  const producer=record.originalProducer;
  if(!hex.test(producer.terminalSha256)||!hex.test(producer.sourceInventorySha256)||time(producer.completedAt,'producer completion')<time(original.releasedAt,'original release')||time(producer.completedAt,'producer completion')>decidedAt||!Array.isArray(producer.artifacts)||producer.artifacts.length!==2)fail('original producer completion and pair evidence required');
  for(const artifact of producer.artifacts){keys(artifact,['kind','sha256','bytes'],'producer artifact');if(!['delta','complete'].includes(artifact.kind)||!hex.test(artifact.sha256)||!Number.isSafeInteger(artifact.bytes)||artifact.bytes<=0)fail('invalid producer artifact');}
  if(new Set(producer.artifacts.map(a=>a.kind)).size!==2||new Set(producer.artifacts.map(a=>a.sha256)).size!==2)fail('distinct original delta and complete artifacts required');
  keys(record.nonDeliveryEvidence,['sha256','checkedAt','scope','baselineCommit','registrySnapshots','conclusion'],'non-delivery evidence');
  const absence=record.nonDeliveryEvidence;
  if(!hex.test(absence.sha256)||typeof absence.scope!=='string'||!absence.scope.trim()||absence.baselineCommit!==BASELINE_COMMIT||absence.conclusion!=='original041_not_present_in_checked_registries'||time(absence.checkedAt,'non-delivery observation')<Math.max(time(record.directive.issuedAt,'directive'),time(producer.completedAt,'producer completion'))||time(absence.checkedAt,'non-delivery observation')>decidedAt||!Array.isArray(absence.registrySnapshots))fail('reviewed bounded pre-delivery observation required');
  const registryPaths=new Set();
  for(const entry of absence.registrySnapshots){
    keys(entry,['path','sha256','raw'],'checked registry snapshot');
    if(!safe(entry.path)||!/^docs\/(?:deliveries|publications)\/.+\.json$/.test(entry.path)||registryPaths.has(entry.path)||typeof entry.raw!=='string'||!hex.test(entry.sha256)||hash(entry.raw)!==entry.sha256)fail('invalid checked registry raw bytes');
    if(hasOriginal(JSON.parse(entry.raw)))fail('original source was already present in a checked publication or delivery registry');registryPaths.add(entry.path);
  }
  if(REQUIRED_REGISTRIES.some(p=>!registryPaths.has(p))||![...registryPaths].some(p=>p.startsWith('docs/publications/')))fail('checked delivery and publication scope is incomplete');
  keys(record.independentAssessment,['sha256','reviewedAt','summary'],'independent assessment');
  // This is the genuine pedagogical assessment, which can precede the user's
  // later resume directive. Independent final raw-record review installs the pin.
  if(!hex.test(record.independentAssessment.sha256)||typeof record.independentAssessment.summary!=='string'||!record.independentAssessment.summary.trim()||time(record.independentAssessment.reviewedAt,'independent assessment')<time(ledger.closedAt,'original closure')||time(record.independentAssessment.reviewedAt,'independent assessment')>decidedAt)fail('independent selection assessment missing or future dated');
  if(!Array.isArray(record.retained)||!Array.isArray(record.excluded)||record.retained.length!==1||record.excluded.length!==2||record.retained[0]?.candidateId!==RETAINED_ID||!equal(sorted(record.excluded.map(t=>t.candidateId)),EXCLUDED_IDS))fail('selection must retain exactly the approved s4 candidate and reserve s2/s3 exclusions');
  const accepted=ledger.candidates.filter(c=>c.decision==='accepted');
  const all=[...record.retained,...record.excluded];
  if(new Set(all.map(t=>t.candidateId)).size!==all.length||!equal(sorted(all.map(t=>t.candidateId)),sorted(accepted.map(c=>c.candidateId))))fail('selection partition must equal original accepted history exactly');
  const retained=record.retained.map(t=>target(t,accepted.find(c=>c.candidateId===t.candidateId),original,false));
  const excluded=record.excluded.map(t=>target(t,accepted.find(c=>c.candidateId===t.candidateId),original,true));
  const optionIds=all.flatMap(t=>t.exclusiveOptionIds);
  if(new Set(optionIds).size!==optionIds.length||baseline.options.some(o=>optionIds.includes(o.optionId))||baseline.questions.some(q=>all.some(t=>q.questionId===t.questionId||q.templateId===t.templateId||q.learningGoalId===t.learningGoalId)))fail('target identities or exclusive options overlap baseline or each other');
  for(const t of all)if(original.questions.some(q=>q.questionId!==t.questionId&&(q.links||[]).some(l=>t.exclusiveOptionIds.includes(l.optionId))))fail('exclusive target option is referenced by another original question');
  keys(record.selectedBank,['version','path','sha256','releasedAt'],'selected bank');
  if(record.selectedBank.version!==SELECTED_BANK_VERSION||record.selectedBank.path!==SELECTED_BANK_PATH||!hex.test(record.selectedBank.sha256)||time(record.selectedBank.releasedAt,'selected release')<decidedAt||time(record.selectedBank.releasedAt,'selected release')>now)fail('selected bank requires its unique new version, hash and current release time');
  const selected=parseBank(boundFile(files,SELECTED_BANK_PATH,record.selectedBank.sha256,'selected bank'));
  verifyProjection(selected,baseline,original,retained,record);
  const detail={record,ledger,ledgerRaw,original,baseline,selected,retained,excluded,raw,historicalBanks:historicalBankInventory(record)};
  rejectExcluded(selected,detail);
  return detail;
}
function verifyProjection(selected,baseline,original,retained,record) {
  const variable=new Set(['bankVersion','releasedAt','changeSummary','roundId','contentCounts','questions','options','sources']);
  if(!equal(sorted(Object.keys(selected)),sorted(Object.keys(baseline))))fail('selected bank cannot add or remove top-level fields');
  for(const key of Object.keys(baseline))if(!variable.has(key)&&!equal(selected[key],baseline[key]))fail(`baseline metadata changed: ${key}`);
  if(selected.bankVersion!==record.selectedBank.version||selected.releasedAt!==record.selectedBank.releasedAt||selected.roundId!==record.roundId||typeof selected.changeSummary!=='string'||!selected.changeSummary.trim())fail('selected bank metadata mismatch');
  if(!equal(selected.questions,[...baseline.questions,...retained.map(t=>t.question)])||!equal(selected.options,[...baseline.options,...retained.flatMap(t=>t.options)]))fail('selected bank must be unchanged baseline plus exact retained question/options');
  const needed=new Set(retained.flatMap(t=>[...(t.question.sourceRefs||[]),...t.options.flatMap(o=>o.sourceRefs||[])]));
  const prior=new Set(baseline.sources.map(s=>s.id));
  const additions=original.sources.filter(s=>needed.has(s.id)&&!prior.has(s.id));
  if(!equal(selected.sources,[...baseline.sources,...additions])||[...needed].some(id=>!selected.sources.some(s=>s.id===id)))fail('selected source closure must preserve exact baseline and only required original new sources');
  const counts={testOnly:selected.questions.filter(q=>q.testOnly===true).length,regularWrittenBySubject:Object.fromEntries(baseline.subjects.map(s=>[s.id,selected.questions.filter(q=>q.testOnly===false&&q.type==='written'&&q.subjectId===s.id).length])),regularPractical:selected.questions.filter(q=>q.testOnly===false&&q.type==='practical').length};
  if(!equal(selected.contentCounts,counts))fail('selected content counts do not match exact questions');
}
function rejectExcluded(bank,detail) {
  if(bank.bankVersion===ORIGINAL_BANK_VERSION)fail('retired original bank cannot be active or explicit publication input');
  const targets=detail.record.excluded,ids=new Set(targets.flatMap(t=>t.exclusiveOptionIds));
  const optionFingerprint=option=>quarantineHash({content:option.content,explanation:option.explanation});
  const optionFingerprints=new Set((detail.excluded||[]).flatMap(t=>t.options.map(optionFingerprint)));
  const optionsById=new Map();
  for(const option of bank.options||[]){
    if(ids.has(option.optionId)||optionFingerprints.has(optionFingerprint(option)))fail('excluded exclusive option or renamed exact collision cannot be orphaned, shared or reintroduced');
    const bucket=optionsById.get(option.optionId)||[];bucket.push(option);optionsById.set(option.optionId,bucket);
  }
  const linkedForScan=question=>(question.links||[]).map(link=>{
    const options=(optionsById.get(link.optionId)||[]).filter(option=>option.optionId===link.optionId&&option.revision===link.optionRevision);
    if(options.length!==1)fail('missing or duplicate exact linked option');return options[0];
  });
  for(const question of bank.questions||[]){
    if(targets.some(t=>['questionId','learningGoalId','templateId'].some(k=>question[k]===t[k])))fail('excluded question or reserved identity cannot be reintroduced');
    const fingerprint=quarantineFingerprint(question,linkedForScan(question));
    if(targets.some(t=>t.identityFreeSha256===fingerprint))fail('excluded content collision cannot be renamed or reordered');
  }
  return bank;
}
/** Proposal diagnostics only. Even a successful result is not authority. */
export function validatePublicationSelectionRecord(raw,files,{now=Date.now()}={}) {
  try{inspectRecord(plainRaw(raw),snapshot(files),now);return freeze({ok:true,errors:[],status:'proposal_requires_independent_pin',authorized:false});}
  catch(error){return freeze({ok:false,errors:[error.message],status:'proposal_requires_independent_pin',authorized:false});}
}
function state(details,files) {
  const value=freeze({selections:details.map(d=>structuredClone(d.record)),selectionReferences:details.map(d=>({path:PUBLICATION_SELECTION_PATH,sha256:hash(d.raw)}))});
  authorities.set(value,{details,files});return value;
}
function authority(value) {const out=authorities.get(value);if(!out)fail('only raw-byte-derived private selection authority is accepted');return out;}
function requiresSelection(files) {
  // A modern installed authority never disappears when a caller removes its
  // records or rolls the manifest back. Historical fixtures explicitly project
  // an empty reviewed pin in their isolated module, preserving old assertions.
  if(hex.test(PUBLICATION_SELECTION_PIN.sha256??''))return true;
  if(files.has(PUBLICATION_SELECTION_PATH)||files.has(ORIGINAL_LEDGER_PATH)||files.has(ORIGINAL_BANK_PATH)||files.has(SELECTED_BANK_PATH))return true;
  const manifest=files.has('data/manifest.json')?JSON.parse(files.get('data/manifest.json')):null;
  if([ORIGINAL_BANK_VERSION,SELECTED_BANK_VERSION].includes(manifest?.bankVersion)||manifest?.sha256===ORIGINAL_BANK_SHA256)return true;
  // Only an explicitly empty isolated historical/synthetic pin reaches here.
  // Synthetic round998 is not real041; explicit actual identities and predecessor
  // references still cannot hide selection dependencies in an empty projection.
  for(const [p,raw] of files){
    if(!/^docs\/(?:rounds|corrections)\/.+\.json$/.test(p))continue;
    const ledger=JSON.parse(raw);
    if(ledger.roundId==='round-041'||[ORIGINAL_BANK_VERSION,SELECTED_BANK_VERSION].includes(ledger.publication?.bankVersion)||[ORIGINAL_BANK_VERSION,SELECTED_BANK_VERSION].includes(ledger.baseline?.bankVersion)||ledger.baseline?.offlinePredecessor?.roundId==='round-041'||ledger.selectionReference||(ledger.candidates||[]).some(c=>[RETAINED_ID,...EXCLUDED_IDS].includes(c.candidateId)||[RETAINED_ID,...EXCLUDED_IDS].includes(c.questionId)))return true;
  }
  return false;
}
/** Exact snapshot gate. The retired original is accepted only at its original
 * hash-bound historical path, never through an active manifest or alternate path. */
export function validatePublicationSelectionSnapshot(files,{now=Date.now()}={}) {
  const byPath=snapshot(files),selectionPaths=[...byPath.keys()].filter(p=>p.startsWith('docs/publication-selections/'));
  if(selectionPaths.some(p=>p!==PUBLICATION_SELECTION_PATH))fail('unknown or unreviewed selection file');
  if(!byPath.has(PUBLICATION_SELECTION_PATH)&&hex.test(PUBLICATION_SELECTION_PIN.sha256??'')&&exactHistoricalSnapshot(byPath))return state([],byPath);
  if(!requiresSelection(byPath))return state([],byPath);
  current(now);
  if(!hex.test(PUBLICATION_SELECTION_PIN.sha256??''))fail('selection pin is pending independent exact-record review');
  const raw=boundFile(byPath,PUBLICATION_SELECTION_PATH,PUBLICATION_SELECTION_PIN.sha256,'reviewed selection record');
  const listed=manifestPaths(byPath.get('PUBLICATION-MANIFEST.txt'));
  for(const p of [MODULE_PATH,PUBLICATION_SELECTION_PATH,ORIGINAL_LEDGER_PATH,ORIGINAL_BANK_PATH,BASELINE_PATH,SELECTED_BANK_PATH,'data/manifest.json'])if(!listed.has(p)||!byPath.has(p))fail('selection dependency missing or unlisted: '+p);
  const detail=inspectRecord(raw,byPath,now),manifest=JSON.parse(byPath.get('data/manifest.json'));
  if(manifest.schemaVersion!==1||typeof manifest.finalRelease!=='boolean'||typeof manifest.changeSummary!=='string'||!manifest.changeSummary.trim())fail('invalid active manifest schema or summary');
  if(manifest.bankVersion===ORIGINAL_BANK_VERSION||manifest.sha256===ORIGINAL_BANK_SHA256)fail('active manifest cannot reactivate retired original bank');
  if(manifest.bankVersion===SELECTED_BANK_VERSION&&(manifest.file!==`releases/${SELECTED_BANK_VERSION}/bank.json`||manifest.sha256!==detail.record.selectedBank.sha256||manifest.releasedAt!==detail.record.selectedBank.releasedAt))fail('selected active manifest identity mismatch');
  const activePath=`data/${manifest.file}`,active=byPath.get(activePath);
  if(!active||hash(active)!==manifest.sha256)fail('active selected or successor bank must be present and hash bound');
  const activeBank=parseBank(active);
  if(activeBank.bankVersion!==manifest.bankVersion||activeBank.releasedAt!==manifest.releasedAt||activeBank.changeSummary!==manifest.changeSummary)fail('active bank metadata does not match manifest');
  if(!Number.isFinite(Date.parse(activeBank.releasedAt))||Date.parse(activeBank.releasedAt)<Date.parse(detail.record.selectedBank.releasedAt))fail('active bank cannot roll back before the effective selection');
  rejectExcluded(activeBank,detail);
  for(const [p,raw] of byPath){
    if(!/^data\/releases\/[^/]+\/bank\.json$/.test(p))continue;
    if(p===ORIGINAL_BANK_PATH&&hash(raw)===ORIGINAL_BANK_SHA256)continue;
    if(detail.historicalBanks.has(p)){
      if(hash(raw)!==detail.historicalBanks.get(p))fail('immutable pre-selection public bank changed: '+p);
      continue;
    }
    const bank=parseBank(raw);
    if(hash(raw)===ORIGINAL_BANK_SHA256||bank.bankVersion===ORIGINAL_BANK_VERSION)fail('retired original bank is permitted only at its exact historical path');
    if(bank.bankVersion===SELECTED_BANK_VERSION&&p!==SELECTED_BANK_PATH)fail('selected bank cannot be relocated');
    // Only exact independently recorded earlier bytes skip this content pass.
    // Unknown later or backdated banks remain subject to all exclusions.
    rejectExcluded(bank,detail);
  }
  return state([detail],byPath);
}
async function bytes(root,relative) {
  if(!safe(relative))fail('unsafe dependency path');
  for(let p=path.resolve(root);;p=path.dirname(p)){if((await fs.lstat(p)).isSymbolicLink())fail('symbolic link dependency root');if(p===path.dirname(p))break;}
  let p=path.resolve(root);const parts=relative.split('/');
  for(const [i,part] of parts.entries()){p=path.join(p,part);const st=await fs.lstat(p);if(st.isSymbolicLink()||(i===parts.length-1?!st.isFile():!st.isDirectory()))fail('selection requires regular dependency files');}
  return fs.readFile(p);
}
/** Fresh file reads on each call; authority is never a caller-owned Map or cache. */
export async function loadPublicationSelections(root,{now=Date.now()}={}) {
  const allow=await bytes(root,'PUBLICATION-MANIFEST.txt'),listed=manifestPaths(allow);
  const files=[{path:'PUBLICATION-MANIFEST.txt',raw:allow}];
  let historicalBanks=new Map();
  if(hex.test(PUBLICATION_SELECTION_PIN.sha256??'')){
    if(!listed.has(PUBLICATION_SELECTION_PATH))fail('reviewed selection record omitted from allowlist');
    const raw=await bytes(root,PUBLICATION_SELECTION_PATH);
    if(hash(raw)!==PUBLICATION_SELECTION_PIN.sha256)fail('missing or changed reviewed selection record');
    historicalBanks=historicalBankInventory(JSON.parse(raw));
  }
  // Keep exact source ledgers and selection dependencies. Previously published
  // bank bytes are hash-checked against the reviewed observation inventory and
  // discarded; the normal campaign gate still validates their full semantics.
  const required=new Set([MODULE_PATH,PUBLICATION_SELECTION_PATH,ORIGINAL_LEDGER_PATH,ORIGINAL_BANK_PATH,BASELINE_PATH,SELECTED_BANK_PATH,'data/manifest.json','scripts/bank-io.mjs','scripts/validate-round.mjs']);
  for(const p of listed){
    if(p==='PUBLICATION-MANIFEST.txt')continue;
    if(!required.has(p)&&!/^docs\/(?:rounds|corrections)\/.+\.json$/.test(p)&&!/^data\/releases\/[^/]+\/bank\.json$/.test(p)&&!p.startsWith('docs/publication-selections/'))continue;
    const raw=await bytes(root,p);
    if(historicalBanks.has(p)&&!required.has(p)){if(hash(raw)!==historicalBanks.get(p))fail('immutable pre-selection public bank changed: '+p);continue;}
    files.push({path:p,raw});
  }
  const selectedContext=requiresSelection(new Map(files.map(f=>[f.path,f.raw])));
  for(const p of [MODULE_PATH,ORIGINAL_LEDGER_PATH,ORIGINAL_BANK_PATH,PUBLICATION_SELECTION_PATH,SELECTED_BANK_PATH,'scripts/bank-io.mjs','scripts/validate-round.mjs']){
    if(listed.has(p))continue;
    try{const raw=await bytes(root,p);if([ORIGINAL_LEDGER_PATH,ORIGINAL_BANK_PATH,PUBLICATION_SELECTION_PATH,SELECTED_BANK_PATH].includes(p)||selectedContext&&(p===MODULE_PATH||raw.toString().includes('loadPublicationSelections')))fail('present selection dependency omitted from allowlist: '+p);}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  try{for(const name of await fs.readdir(path.join(root,'docs/publication-selections')))if(`docs/publication-selections/${name}`!==PUBLICATION_SELECTION_PATH||!listed.has(PUBLICATION_SELECTION_PATH))fail('unknown or unlisted selection dependency');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  return validatePublicationSelectionSnapshot(files,{now});
}
export function resolvePublicationIdentity(originalLedger,validatedState=null) {
  const held=validatedState===null?null:authority(validatedState);
  if(!originalLedger||typeof originalLedger!=='object')fail('original ledger required');
  const detail=held?.details.find(d=>d.ledger.roundId===originalLedger.roundId);
  if(detail&&!equal(originalLedger,detail.ledger))fail('original ledger cannot be mutated or projected');
  if(!detail&&(originalLedger.roundId==='round-041'||[ORIGINAL_BANK_VERSION,SELECTED_BANK_VERSION].includes(originalLedger.publication?.bankVersion)))fail('original041 requires its validated publication selection');
  const accepted=originalLedger.candidates?.filter(c=>c.decision==='accepted').map(c=>c.candidateId)||[];
  const masquerading=(originalLedger.candidates||[]).some(c=>[RETAINED_ID,...EXCLUDED_IDS].includes(c.candidateId)||[RETAINED_ID,...EXCLUDED_IDS].includes(c.questionId));
  if(!detail&&masquerading)fail('original041 candidates cannot masquerade as an ordinary ledger');
  const ledgerPath=originalLedger.correctionRoundId?`docs/corrections/${originalLedger.correctionRoundId}.json`:`docs/rounds/${originalLedger.roundId}.json`;
  const raw=detail?.ledgerRaw??held?.files.get(ledgerPath);
  if(held&&!raw)fail('resolved identity requires its exact original raw ledger source');
  if(raw&&!equal(JSON.parse(raw),originalLedger))fail('original ledger differs from raw source');
  const identity=freeze({originalLedger:structuredClone(originalLedger),originalLedgerSha256:raw?hash(raw):null,selectionReference:detail?{path:PUBLICATION_SELECTION_PATH,sha256:hash(detail.raw)}:null,effectiveBankVersion:detail?.record.selectedBank.version??originalLedger.publication?.bankVersion??null,effectiveBankSha256:detail?.record.selectedBank.sha256??originalLedger.publication?.bankSha256??null,acceptedCandidateIds:accepted,eligibleCandidateIds:detail?detail.record.retained.map(t=>t.candidateId):accepted,excludedReservedCandidateIds:detail?detail.record.excluded.map(t=>t.candidateId):[],counts:{accepted:accepted.length,quarantined:0,publicationExcluded:detail?.record.excluded.length??0,eligible:detail?.record.retained.length??accepted.length},originalBankVersion:originalLedger.publication?.bankVersion??null,originalBankSha256:originalLedger.publication?.bankSha256??null,baselineSourceCommit:originalLedger.baseline?.sourceCommit??null});
  identities.add(identity);return identity;
}
export function assertNoPublicationExcludedContent(bank,validatedState=null,raw=null) {
  const held=validatedState===null?null:authority(validatedState);
  if(!held?.details.length&&(bank?.bankVersion===ORIGINAL_BANK_VERSION||bank?.bankVersion===SELECTED_BANK_VERSION||bank?.roundId==='round-041'||(bank?.questions||[]).some(q=>[RETAINED_ID,...EXCLUDED_IDS].includes(q.questionId))))fail('round041 bank requires complete selection authority');
  if(held?.details.length){for(const detail of held.details){
    if(bank?.bankVersion===detail.record.selectedBank.version&&(!equal(bank,detail.selected)||raw!==null&&hash(plainRaw(raw))!==detail.record.selectedBank.sha256))fail('selected bank input must preserve exact reviewed content and raw identity');
    rejectExcluded(bank,detail);
  }}
  else if(hex.test(PUBLICATION_SELECTION_PIN.sha256??'')){
    // Legacy callers need no new state, but null cannot become an opt-out for
    // renamed excluded content. Only this module's reviewed raw record supplies
    // the denial fingerprints; no caller object is used as authority.
    const record=reviewedLocalRecord();
    const originalRaw=readFileSync(path.resolve(import.meta.dirname,'..',ORIGINAL_BANK_PATH));
    if(hash(originalRaw)!==ORIGINAL_BANK_SHA256)fail('reviewed original exclusion content missing or changed');
    const original=parseBank(originalRaw);
    const excluded=record.excluded.map(t=>({options:original.options.filter(o=>t.exclusiveOptionIds.includes(o.optionId))}));
    rejectExcluded(bank,{record,excluded});
  }
  return bank;
}
export function assertPublicationSelectionReference(reference,identity) {
  if(!identities.has(identity))fail('reference validation requires a resolved identity');
  if(identity.selectionReference){keys(reference,['path','sha256'],'selection reference');if(!equal(reference,identity.selectionReference))fail('selection reference does not bind the reviewed raw record');}
  else if(reference!==undefined&&reference!==null)fail('ordinary release cannot claim a selection reference');
  return identity;
}
export function publicationSelectionFiles(validatedState) {
  return authority(validatedState).details.map(d=>({path:PUBLICATION_SELECTION_PATH,raw:Buffer.from(d.raw)}));
}
