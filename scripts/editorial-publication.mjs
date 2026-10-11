/** Pure, non-authorizing sibling event checks. No pin, delivery or Git authority. */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {isDeepStrictEqual as equal} from 'node:util';
import {FREEZE_AT,validateBank} from '../src/domain.js';
import {regularCoverage} from './campaign-validation-primitives.mjs';
import {normalPublicationTree} from './normal-publication.mjs';
import {validateEditorialTransition} from './editorial-history-core.mjs';
import {assertNoPublicationExcludedContent} from './publication-selection.mjs';
import {assertNoQuarantinedContent} from './prepublication-quarantine.mjs';
import {assertNoEvidenceLossContent,assertEvidenceLossProvenance} from './evidence-loss-block.mjs';
import quarantineTrust from '../docs/quarantines/trust.json' with {type:'json'};
import blockTrust from '../docs/release-blocks/trust.json' with {type:'json'};
import independentTrust from '../docs/deliveries/offline-chain-trust.json' with {type:'json'};
import normalRootTrust from '../docs/deliveries/normal-backup-root-trust.json' with {type:'json'};
import normalChainTrust from '../docs/deliveries/normal-backup-chain-trust.json' with {type:'json'};
import backupTrust from '../docs/deliveries/release-backup-trust.json' with {type:'json'};
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const blob=raw=>createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${raw.length}\0`),raw])).digest('hex');
const sha=/^[a-f0-9]{40}$/,sha256=/^[a-f0-9]{64}$/;
const rawOf=entry=>{const raw=entry?.raw??entry;return typeof raw==='string'?Buffer.from(raw):Buffer.isBuffer(raw)?raw:null;};
export const EDITORIAL_PUBLICATION_KIND='verified_normal_editorial_publication';
export const EDITORIAL_SOURCE_KIND='editorial_frozen_ledger';
export const EDITORIAL_SOURCE_KEYS=Object.freeze(['kind','correctionRoundId','ledgerPath','originalLedgerSha256','bankVersion','bankSha256','baseline','originalPublicationStatus','accepted','publishedRevisedRegular','newlyPublicRegular']);
export const isEditorialPublication=record=>record?.kind===EDITORIAL_PUBLICATION_KIND;
const editorialSchemaRaw=readFileSync(new URL('../docs/corrections/editorial-ledger.schema.json',import.meta.url));
const eventKeys=['schemaVersion','syncId','kind','previousSynchronizationSha256','verifiedAt','repository','commit','parent','tree','commitUrl','pages','siteUrl','manifest','manifestSha256','runtimeManifestRaw','publicationStateRaw','counts','writtenBySubject','rounds','remoteInventory','liveAssets','limitations'];

/** Check the exact typed source, complete payload and transition. Lifecycle checks
 * are performed separately by the synchronization loop using its private prefix.
 * Calling this function, even successfully, never authenticates any history. */
export function validateEditorialPublication(record,{ledgers=[],editorials=[],banks=new Map(),ledgerSources=new Map(),editorialSources=new Map(),reviewPackages=new Map(),editorialReports=new Map(),inventory,previousPublication,publicationSelections=null}) {
 if(!isEditorialPublication(record)||!equal(Object.keys(record).sort(),[...eventKeys].sort())||record.schemaVersion!==1||!previousPublication||record.repository!==previousPublication.repository||record.siteUrl!==previousPublication.siteUrl||![record.commit,record.parent,record.tree].every(v=>sha.test(v)&&v!=='0'.repeat(40))||record.commit===record.parent||record.commitUrl!==`https://github.com/${record.repository}/commit/${record.commit}`)throw Error('Editorial publication requires exact sibling event fields and actual payload identity');
 const at=Date.parse(record.verifiedAt),p=record.pages;
 if(!Number.isFinite(at)||at>=FREEZE_AT||!p||!equal(Object.keys(p).sort(),['conclusion','headSha','runId','status','url'])||!Number.isSafeInteger(p.runId)||p.runId<=0||p.headSha!==record.commit||p.status!=='completed'||p.conclusion!=='success'||p.url!==`https://github.com/${record.repository}/actions/runs/${p.runId}`)throw Error('Editorial publication requires exact-head successful Pages before cutoff');
 if(!Array.isArray(record.rounds)||record.rounds.length!==1)throw Error('Editorial publication requires exactly one typed frozen source');
 const s=record.rounds[0];
 if(!s||!equal(Object.keys(s).sort(),[...EDITORIAL_SOURCE_KEYS].sort())||s.kind!==EDITORIAL_SOURCE_KIND||!/^editorial-\d+$/.test(s.correctionRoundId)||s.ledgerPath!==`docs/corrections/${s.correctionRoundId}.json`)throw Error('Editorial publication source kind, owner, fields and canonical path must be exact');
 const owners=editorials.filter(e=>e.correctionRoundId===s.correctionRoundId),e=owners[0],raw=rawOf(editorialSources.get(s.correctionRoundId));
 if(owners.length!==1||!e||e.kind!=='accepted_content_editorial'||ledgers.some(l=>l.roundId===s.correctionRoundId||l.correctionRoundId===s.correctionRoundId)||!raw||hash(raw)!==s.originalLedgerSha256||!equal(JSON.parse(raw),e)||e.status!=='closed'||e.publication.status!=='not_attempted'||e.publication.verifiedAt!==null||e.publication.commit!==null||e.publication.url!==null||e.publication.blockers.length||e.corrections.some(c=>c.decision==='pending'||c.publishedBankVersion!==null)||e.counts.pending!==0||e.counts.newRegular!==0||e.counts.publishedRevisedRegular!==0||s.originalPublicationStatus!=='not_attempted')throw Error('Editorial publication requires one exact closed unpublished editorial owner and unchanged original review history');
 if(!Number.isFinite(Date.parse(e.startedAt))||!Number.isFinite(Date.parse(e.closedAt))||Date.parse(e.startedAt)>Date.parse(e.closedAt)||Date.parse(e.closedAt)>at||Date.parse(previousPublication.verifiedAt)>=Date.parse(e.startedAt))throw Error('Editorial publication requires genuinely earlier predecessor, start and closure chronology');
 const baseline={sourceCommit:e.baseline.sourceCommit,bankVersion:e.baseline.bankVersion,bankSha256:e.baseline.bankSha256};
 if(!equal(s.baseline,baseline)||record.parent!==baseline.sourceCommit||baseline.bankVersion!==previousPublication.manifest.bankVersion||baseline.bankSha256!==previousPublication.manifest.sha256||s.bankVersion!==e.publication.bankVersion||s.bankSha256!==e.publication.bankSha256)throw Error('Editorial publication must bind the original public baseline, actual parent and exact frozen bank');
 const accepted=e.corrections.filter(c=>c.decision==='accepted').length;
 if(!accepted||s.accepted!==accepted||s.publishedRevisedRegular!==accepted||e.counts.accepted!==accepted||e.counts.revisedRegular!==accepted||s.newlyPublicRegular!==0)throw Error('Editorial publication revised counts must equal exact accepted corrections and new count must be zero');
 if(!(inventory instanceof Map)||!Array.isArray(record.remoteInventory)||record.remoteInventory.some(f=>!sha.test(f.gitBlob))||normalPublicationTree(record.remoteInventory)!==record.tree)throw Error('Editorial publication requires the complete exact Git tree inventory');
 const remote=new Map(record.remoteInventory.map(f=>[f.path,f]));
 const bind=(path,entry,expected=null)=>{const bytes=rawOf(entry);if(!bytes||expected!==null&&hash(bytes)!==expected||inventory.get(path)?.sha256!==hash(bytes)||inventory.get(path)?.bytes!==bytes.length||remote.get(path)?.gitBlob!==blob(bytes))throw Error(`Editorial publication requires exact raw dependency bytes: ${path}`);return bytes;};
 for(const [path,bytes,expected]of [[s.ledgerPath,raw,s.originalLedgerSha256],[`data/releases/${s.bankVersion}/bank.json`,banks.get(s.bankVersion),s.bankSha256],[`data/releases/${baseline.bankVersion}/bank.json`,banks.get(baseline.bankVersion),baseline.bankSha256]])bind(path,bytes,expected);
 bind(`docs/publications/${previousPublication.syncId}.json`,json(previousPublication));
 bind('docs/corrections/editorial-ledger.schema.json',editorialSchemaRaw);
 for(const f of previousPublication.remoteInventory.filter(f=>/^data\/(releases\/|seed-bank)/.test(f.path)||/^docs\/(rounds\/round-\d+\.(json|md)$|corrections\/|publications\/|publication-selections\/|quarantines\/|release-blocks\/|incidents\/|deliveries\/)/.test(f.path)&&!f.path.endsWith('trust.json')))if(!equal(inventory.get(f.path),{path:f.path,bytes:f.bytes,sha256:f.sha256})||f.gitBlob&&remote.get(f.path)?.gitBlob!==f.gitBlob)throw Error('Editorial publication must preserve immutable prior publication history');
 for(const [path,registry,key]of [['docs/quarantines/trust.json',quarantineTrust,'audits'],['docs/release-blocks/trust.json',blockTrust,'events'],['docs/deliveries/offline-chain-trust.json',independentTrust,'checkpoints'],['docs/deliveries/release-backup-trust.json',backupTrust,'checkpoints'],['docs/deliveries/normal-backup-root-trust.json',normalRootTrust,'roots'],['docs/deliveries/normal-backup-chain-trust.json',normalChainTrust,'checkpoints']]){
  const prefixes=Array.from({length:registry[key].length+1},(_,n)=>({...registry,[key]:registry[key].slice(0,n)}));
  const matches=(f,v)=>f?.sha256===hash(json(v))&&f?.bytes===json(v).length,previous=previousPublication.remoteInventory.find(f=>f.path===path),prior=!previous&&path.startsWith('docs/deliveries/normal-backup-')?0:prefixes.findIndex(v=>matches(previous,v));
  if(prior<0||!prefixes.slice(prior).some(v=>matches(inventory.get(path),v)&&remote.get(path)?.gitBlob===blob(json(v))&&v[key].every(pin=>inventory.get(pin.path)?.sha256===pin.sha256)&&registry[key].filter(pin=>Date.parse(pin.registeredAt)<=at).every(pin=>v[key].some(p=>p.sha256===pin.sha256))))throw Error('Editorial publication must preserve reviewed protection and delivery trust prefixes');
 }
 // Exact payload membership prevents a sliced source list from hiding an older
 // consumed editorial cycle, reviewer exposure, predecessor or original report.
 const asOf=editorials.filter(item=>Date.parse(item.startedAt)<=at),required=new Set();
 for(const f of record.remoteInventory){
  const correction=/^docs\/corrections\/(editorial-\d+)\.json$/.exec(f.path),round=/^docs\/rounds\/(round-\d+)\.json$/.exec(f.path);
  if(correction&&!asOf.some(item=>item.correctionRoundId===correction[1]))throw Error('Editorial publication is missing its complete as-of editorial source set');
  if(round){const matches=ledgers.filter(item=>item.roundId===round[1]);if(matches.length!==1||Date.parse(matches[0].startedAt)>at||!equal(JSON.parse(bind(f.path,ledgerSources.get(round[1]))),matches[0]))throw Error('Editorial publication is missing exact prior regular review history');}
 }
 for(const item of asOf){
  const path=`docs/corrections/${item.correctionRoundId}.json`;
  if(!equal(JSON.parse(bind(path,editorialSources.get(item.correctionRoundId))),item))throw Error('Editorial publication as-of ledger differs from original bytes');required.add(path);
  for(const path of new Set([`docs/corrections/${item.correctionRoundId}.md`,...item.validation.map(v=>v.reportPath).filter(Boolean)])){bind(path,editorialReports.get(path));required.add(path);}
  for(const cycle of item.corrections.flatMap(c=>c.cycles)){bind(cycle.reviewPackagePath,reviewPackages.get(cycle.reviewPackagePath),cycle.reviewPackageSha256);required.add(cycle.reviewPackagePath);}
 }
 for(const [path,text]of [['data/manifest.json',record.runtimeManifestRaw],['data/publication-state.json',record.publicationStateRaw]]){if(typeof text!=='string')throw Error('Editorial publication requires exact raw freeze markers');bind(path,Buffer.from(text));required.add(path);}
 if(!equal(JSON.parse(record.runtimeManifestRaw),record.manifest)||JSON.parse(record.publicationStateRaw).finalized!==false)throw Error('Editorial publication payload must be explicitly unfrozen');
 if(!equal(Object.keys(record.manifest).sort(),['bankVersion','changeSummary','file','finalRelease','releasedAt','schemaVersion','sha256'])||record.manifest.schemaVersion!==1||typeof record.manifest.changeSummary!=='string'||!record.manifest.changeSummary.trim()||!sha256.test(record.manifestSha256)||inventory.get('data/manifest.json')?.sha256!==record.manifestSha256||record.manifest.finalRelease!==false||record.manifest.bankVersion!==s.bankVersion||record.manifest.sha256!==s.bankSha256||record.manifest.file!==`releases/${s.bankVersion}/bank.json`)throw Error('Editorial publication must bind the active unfrozen runtime manifest');
 const live=new Map();
 if(!Array.isArray(record.liveAssets))throw Error('Editorial publication requires observed live assets');
 for(const f of record.liveAssets){if(!equal(Object.keys(f).sort(),['bytes','http','path','sha256','url'])||live.has(f.path)||f.http!==200||f.url!==new URL(f.path,record.siteUrl).href||!equal(inventory.get(f.path),{path:f.path,bytes:f.bytes,sha256:f.sha256}))throw Error('Editorial publication live bytes must match unique payload files');live.set(f.path,f);}
 for(const f of record.remoteInventory.filter(f=>/\.(?:html|css|js)$/.test(f.path)||/^data\/releases\/.*\/bank\.json$/.test(f.path)))required.add(f.path);
 if([...required].some(path=>!live.has(path)))throw Error('Editorial publication requires live runtime, immutable banks, original ledgers, packages, reports and freeze markers');
 const current=validateBank(JSON.parse(rawOf(banks.get(s.bankVersion)))),before=validateBank(JSON.parse(rawOf(banks.get(baseline.bankVersion))));
 for(const bank of [before,current]){assertNoPublicationExcludedContent(bank,publicationSelections);assertNoQuarantinedContent(bank);assertNoEvidenceLossContent(bank);assertEvidenceLossProvenance(bank);}
 if(!Number.isFinite(Date.parse(current.releasedAt))||Date.parse(current.releasedAt)>at||record.manifest.releasedAt!==current.releasedAt||record.manifest.changeSummary!==current.changeSummary)throw Error('Editorial publication must follow exact frozen bank release');
 const transition=[];validateEditorialTransition(e,before,current,{banks,now:at,regularCoverage},message=>transition.push(message));if(transition.length)throw Error(transition.join('; '));
 const regular=current.questions.filter(q=>!q.testOnly),counts={regular:regular.length,written:regular.filter(q=>q.type==='written').length,practical:regular.filter(q=>q.type==='practical').length,testOnly:current.questions.filter(q=>q.testOnly).length,total:current.questions.length,newlyPublicFromAnchor:0},subjects=Object.fromEntries(['s1','s2','s3','s4','s5'].map(id=>[id,regular.filter(q=>q.type==='written'&&q.subjectId===id).length]));
 if(!equal(record.counts,counts)||!equal(record.writtenBySubject,subjects))throw Error('Editorial publication totals must retain exact cumulative content and zero new questions');
 return {ok:true,currentReleaseClearance:false,canStartNewContent:false};
}
