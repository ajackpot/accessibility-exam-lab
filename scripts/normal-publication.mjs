/** Semantic checks for a separately reviewed normal publication event.
 * This module does not authenticate external observations, register a pin, write
 * Git, or grant publication clearance. Only the pinned caller activates history. */
import {isReconciledNormalChainPublication,validateReconciledNormalPublication} from './normal-chain-publication-event.mjs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import quarantineTrust from '../docs/quarantines/trust.json' with {type:'json'};
import blockTrust from '../docs/release-blocks/trust.json' with {type:'json'};
import independentTrust from '../docs/deliveries/offline-chain-trust.json' with {type:'json'};
import normalRootTrust from '../docs/deliveries/normal-backup-root-trust.json' with {type:'json'};
import normalChainTrust from '../docs/deliveries/normal-backup-chain-trust.json' with {type:'json'};
import backupTrust from '../docs/deliveries/release-backup-trust.json' with {type:'json'};
import {FREEZE_AT,validateBank,isPublishedQuestion} from '../src/domain.js';
import {assertNoQuarantinedContent} from './prepublication-quarantine.mjs';
import {assertEvidenceLossProvenance,assertNoEvidenceLossContent} from './evidence-loss-block.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const git=(kind,b)=>createHash('sha1').update(Buffer.concat([Buffer.from(`${kind} ${b.length}\0`),b])).digest('hex');
const sha=/^[a-f0-9]{40}$/,sha256=/^[a-f0-9]{64}$/;
export const NORMAL_PUBLICATION_KIND='verified_normal_publication';
export const NORMAL_SOURCE_KEYS=['kind','roundId','ledgerPath','originalLedgerSha256','bankVersion','bankSha256','baseline','accepted','originalPublicationStatus','quarantined','eligible','newlyPublicRegular'];
export const NORMAL_CHAIN_PUBLICATION_KIND='verified_normal_chain_publication';
export const NORMAL_CHAIN_SOURCE_KEYS=['kind','roundId','ledgerPath','originalLedgerSha256','bankVersion','bankSha256','accepted','originalPublicationStatus','quarantined','eligible','newlyPublicRegular','artifactSha256','manifestSha256','deliveredAt','deliveryVerifiedAt','deliveryProof','attachmentReceiptSha256'];
export const isNormalChainPublication=record=>record?.kind===NORMAL_CHAIN_PUBLICATION_KIND||isReconciledNormalChainPublication(record);
export const isNormalPublication=record=>record?.kind===NORMAL_PUBLICATION_KIND;
/** Compute the exact regular-file Git tree, including nested directory trees. */
export function normalPublicationTree(inventory) {
 const root=new Map();
 for(const f of inventory){let node=root;const parts=f.path.split('/');for(const part of parts.slice(0,-1)){if(node.has(part)&&!(node.get(part) instanceof Map))throw Error('Publication inventory path collision');if(!node.has(part))node.set(part,new Map());node=node.get(part);}const name=parts.at(-1);if(node.has(name))throw Error('Publication inventory path collision');node.set(name,f.gitBlob);}
 const tree=node=>git('tree',Buffer.concat([...node].sort(([a,x],[b,y])=>Buffer.compare(Buffer.from(a+(x instanceof Map?'/':'')),Buffer.from(b+(y instanceof Map?'/':'')))).map(([name,value])=>Buffer.concat([Buffer.from(`${value instanceof Map?'40000':'100644'} ${name}\0`),Buffer.from(value instanceof Map?tree(value):value,'hex')]))));
 return tree(root);
}
export function validateNormalPublication(record,{ledgers,banks,ledgerSources,inventory,previousPublication}) {
 const chain=isNormalChainPublication(record),reconciled=isReconciledNormalChainPublication(record);
 const keys=['schemaVersion','syncId','kind','previousSynchronizationSha256','verifiedAt','repository','commit','parent','tree','commitUrl','pages','siteUrl','manifest','manifestSha256','runtimeManifestRaw','publicationStateRaw','counts','writtenBySubject','rounds','remoteInventory','liveAssets','limitations',...(reconciled?['reconciliation']:[])];
 if(!equal(Object.keys(record).sort(),keys.sort())||record.schemaVersion!==1||!previousPublication||record.repository!==previousPublication.repository||record.siteUrl!==previousPublication.siteUrl||![record.commit,record.parent,record.tree].every(v=>sha.test(v)&&v!=='0'.repeat(40))||record.commit===record.parent||record.commitUrl!==`https://github.com/${record.repository}/commit/${record.commit}`)throw Error('Normal publication requires exact event fields and actual payload identity');
 const at=Date.parse(record.verifiedAt),p=record.pages;
 if(!Number.isFinite(at)||at>=FREEZE_AT||!p||!equal(Object.keys(p).sort(),['conclusion','headSha','runId','status','url'])||!Number.isSafeInteger(p.runId)||p.runId<=0||p.headSha!==record.commit||p.status!=='completed'||p.conclusion!=='success'||p.url!==`https://github.com/${record.repository}/actions/runs/${p.runId}`)throw Error('Normal publication requires exact-head successful Pages before cutoff');
 if(!Array.isArray(record.rounds)||!record.rounds.length||!chain&&record.rounds.length!==1)throw Error('Normal publication requires exact frozen ledger sources');
 const reconciliation=reconciled?validateReconciledNormalPublication(record,{ledgers,ledgerSources,previousPublication,treeFunction:normalPublicationTree}):null;
 const s=record.rounds.at(-1);
 for(const source of record.rounds){
  const l=ledgers.find(l=>l.roundId===source.roundId),raw=ledgerSources.get(source.roundId);
  assertEvidenceLossProvenance(source);
  if(!equal(Object.keys(source).sort(),[...(chain?NORMAL_CHAIN_SOURCE_KEYS:NORMAL_SOURCE_KEYS)].sort())||source.kind!==(chain?'normal_delivered_checkpoint':'normal_frozen_ledger')||!l||l.status!=='closed'||!chain&&l.baseline.offlinePredecessor||l.publication.status!=='not_attempted'||l.publication.blockers.length||source.originalPublicationStatus!==l.publication.status||source.ledgerPath!==`docs/rounds/${source.roundId}.json`||!raw||hash(raw)!==source.originalLedgerSha256||!equal(JSON.parse(raw),l)||!Number.isFinite(Date.parse(l.closedAt))||Date.parse(l.closedAt)>at||Date.parse(l.startedAt)<Date.parse(previousPublication.verifiedAt)&&!reconciliation?.earlyRoundIds.has(source.roundId))throw Error('Normal publication requires exact closed unpublished ledger sources');
  const baseline={sourceCommit:l.baseline.sourceCommit,bankVersion:l.baseline.bankVersion,bankSha256:l.baseline.bankSha256};
  if(!chain&&(!equal(source.baseline,baseline)||record.parent!==baseline.sourceCommit)||l.publication.bankVersion!==source.bankVersion||l.publication.bankSha256!==source.bankSha256)throw Error('Normal publication must bind its exact public baseline, payload parent and frozen bank');
  if(source===record.rounds[0]&&(baseline.bankVersion!==previousPublication.manifest.bankVersion||baseline.bankSha256!==previousPublication.manifest.sha256))throw Error('Normal publication must start at the exact previous public bank');
  for(const [path,raw,expected]of [[source.ledgerPath,ledgerSources.get(source.roundId),source.originalLedgerSha256],[`data/releases/${source.bankVersion}/bank.json`,banks.get(source.bankVersion)?.raw,source.bankSha256],[`data/releases/${baseline.bankVersion}/bank.json`,banks.get(baseline.bankVersion)?.raw,baseline.bankSha256]])if(!raw||hash(raw)!==expected||inventory.get(path)?.sha256!==expected||inventory.get(path)?.bytes!==raw.length||record.remoteInventory.find(f=>f.path===path)?.gitBlob!==git('blob',raw))throw Error('Normal publication inventory must preserve exact ledger and baseline/current bank bytes');
 }
 if(record.remoteInventory.some(f=>!sha.test(f.gitBlob))||normalPublicationTree(record.remoteInventory)!==record.tree)throw Error('Normal publication requires the complete exact Git tree inventory');
 const previousRaw=Buffer.from(JSON.stringify(previousPublication,null,2)+'\n'),previousFile=inventory.get(`docs/publications/${previousPublication.syncId}.json`);
 if(previousFile?.sha256!==hash(previousRaw)||previousFile?.bytes!==previousRaw.length||record.remoteInventory.find(f=>f.path===previousFile?.path)?.gitBlob!==git('blob',previousRaw))throw Error('Normal publication must retain its exact linked previous publication event');
 for(const f of previousPublication.remoteInventory.filter(f=>/^data\/(releases\/|seed-bank)/.test(f.path)||/^docs\/(rounds\/round-\d+\.(json|md)$|corrections\/|publications\/|quarantines\/|release-blocks\/|incidents\/|deliveries\/)/.test(f.path)&&!f.path.endsWith('trust.json')))if(!equal(inventory.get(f.path),{path:f.path,bytes:f.bytes,sha256:f.sha256})||f.gitBlob&&record.remoteInventory.find(n=>n.path===f.path)?.gitBlob!==f.gitBlob)throw Error('Normal publication must preserve immutable prior publication history');
 for(const [path,registry,key]of [['docs/quarantines/trust.json',quarantineTrust,'audits'],['docs/release-blocks/trust.json',blockTrust,'events'],['docs/deliveries/offline-chain-trust.json',independentTrust,'checkpoints'],['docs/deliveries/release-backup-trust.json',backupTrust,'checkpoints'],...(chain?[['docs/deliveries/normal-backup-root-trust.json',normalRootTrust,'roots'],['docs/deliveries/normal-backup-chain-trust.json',normalChainTrust,'checkpoints']]:[])]){
  const prefixes=Array.from({length:registry[key].length+1},(_,n)=>({...registry,[key]:registry[key].slice(0,n)}));
  const matches=(f,v)=>{const raw=Buffer.from(JSON.stringify(v,null,2)+'\n');return f?.sha256===hash(raw)&&f?.bytes===raw.length;};
  const previous=previousPublication.remoteInventory.find(f=>f.path===path);
  const prior=chain&&!previous&&path.startsWith('docs/deliveries/normal-backup-')?0:prefixes.findIndex(v=>matches(previous,v));
  if(prior<0||!prefixes.slice(prior).some(v=>matches(inventory.get(path),v)&&record.remoteInventory.find(f=>f.path===path)?.gitBlob===git('blob',Buffer.from(JSON.stringify(v,null,2)+'\n'))&&v[key].every(pin=>inventory.get(pin.path)?.sha256===pin.sha256)))throw Error('Normal publication must preserve reviewed protection and delivery trust prefixes');
 }
 for(const [path,text]of [['data/manifest.json',record.runtimeManifestRaw],['data/publication-state.json',record.publicationStateRaw]]){
  if(typeof text!=='string')throw Error('Normal publication requires exact raw freeze markers');
  const raw=Buffer.from(text),f=inventory.get(path);
  if(f?.sha256!==hash(raw)||f?.bytes!==raw.length||record.remoteInventory.find(f=>f.path===path)?.gitBlob!==git('blob',raw))throw Error('Normal publication freeze-marker bytes differ from payload');
 }
 if(!equal(JSON.parse(record.runtimeManifestRaw),record.manifest)||JSON.parse(record.publicationStateRaw).finalized!==false)throw Error('Normal publication payload must be explicitly unfrozen');
 const manifest=inventory.get('data/manifest.json');
 if(!equal(Object.keys(record.manifest).sort(),['bankVersion','changeSummary','file','finalRelease','releasedAt','schemaVersion','sha256'])||record.manifest.schemaVersion!==1||typeof record.manifest.changeSummary!=='string'||!record.manifest.changeSummary.trim()||!sha256.test(record.manifestSha256)||manifest?.sha256!==record.manifestSha256||record.manifest.finalRelease!==false||record.manifest.bankVersion!==s.bankVersion||record.manifest.sha256!==s.bankSha256||record.manifest.file!==`releases/${s.bankVersion}/bank.json`)throw Error('Normal publication must bind the active unfrozen runtime manifest');
 const live=new Map();
 for(const f of record.liveAssets){if(!equal(Object.keys(f).sort(),['bytes','http','path','sha256','url'])||live.has(f.path)||f.http!==200||f.url!==new URL(f.path,record.siteUrl).href||!equal(inventory.get(f.path),{path:f.path,bytes:f.bytes,sha256:f.sha256}))throw Error('Normal publication live bytes must match unique payload files');live.set(f.path,f);}
 const required=[...record.remoteInventory.filter(f=>/\.(?:html|css|js)$/.test(f.path)||/^data\/releases\/.*\/bank\.json$/.test(f.path)).map(f=>f.path),...record.rounds.flatMap(s=>[s.ledgerPath,...(chain?[s.deliveryProof.path]:[])]),'data/manifest.json','data/publication-state.json'];
 if(required.some(path=>!live.has(path)))throw Error('Normal publication requires live runtime, all immutable banks, ledger and freeze-marker bytes');
}

/** Frozen normal ledgers stay historically unpublished, so validate their bank
 * transition here even after a successor makes this event historical. */
export function validateNormalBankTransition(record,ledger,current,baseline,disposition) {
 assertNoEvidenceLossContent(baseline);assertNoEvidenceLossContent(current);assertNoQuarantinedContent(baseline);assertNoQuarantinedContent(current);
 validateBank(baseline);validateBank(current);
 const released=Date.parse(current.releasedAt);
 if(current.bankVersion===baseline.bankVersion||!Number.isFinite(released)||released<Date.parse(ledger.closedAt)||released>Date.parse(record.verifiedAt)||released>=FREEZE_AT||(!isNormalChainPublication(record)||record.manifest.bankVersion===current.bankVersion)&&(record.manifest.releasedAt!==current.releasedAt||record.manifest.changeSummary!==current.changeSummary))throw Error('Normal publication bank must follow closure and precede verified publication/cutoff');
 for(const [before,after,key]of [[baseline.questions,current.questions,'questionId'],[baseline.options,current.options,'optionId'],[baseline.sources,current.sources,'id']]){
  const index=new Map(after.map(v=>[v[key],v]));
  for(const value of before)if(!equal(value,index.get(value[key])))throw Error('Normal publication must preserve every existing question, option and source');
 }
 const oldIds=new Set(baseline.questions.map(q=>q.questionId)),templates=new Set(baseline.questions.map(q=>q.templateId));
 const eligible=new Map(ledger.candidates.filter(c=>disposition.eligibleCandidateIds.includes(c.candidateId)).map(c=>[c.questionId,c]));
 for(const q of current.questions.filter(q=>!oldIds.has(q.questionId))){
  const c=eligible.get(q.questionId),last=c?.cycles.at(-1);
  if(!c||c.decision!=='accepted'||['revision','templateId','type','subjectId'].some(k=>c[k]!==q[k])||last?.outcome!=='accepted'||last.revision!==q.revision||['blindSolve','sourceCheck','ambiguityCheck','authoringAccessibility','structuralCheck'].some(g=>last.gates[g]?.result!=='pass')||q.testOnly!==false||!isPublishedQuestion(current,q,released)||templates.has(q.templateId))throw Error('Normal publication additions require exact eligible all-gates-pass unique regular candidates');
  templates.add(q.templateId);
  for(const id of q.sourceRefs){const e=c.evidence.find(e=>e.sourceId===id),source=current.sources.find(s=>s.id===id);if(!e||!source||['url','version','location'].some(k=>e[k]!==source[k]))throw Error('Normal publication requires exact reviewed primary source evidence');}
 }
}
