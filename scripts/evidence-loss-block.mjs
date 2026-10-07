/** Denial-only reservations after evidence loss. Never certifies review, delivery or publication. */
import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {FREEZE_AT} from '../src/domain.js';
import {quarantineHash,quarantineFingerprint} from './prepublication-quarantine.mjs';
import reviewedTrust from '../docs/release-blocks/trust.json' with {type:'json'};
const ROOT=path.resolve(import.meta.dirname,'..');
export const EVIDENCE_LOSS_TRUST_PATH='docs/release-blocks/trust.json';
const hash=b=>createHash('sha256').update(b).digest('hex'),json=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
const fail=m=>{throw Error('evidence-loss release block: '+m);};
const hex=/^[a-f0-9]{64}$/,id=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/;
const safe=p=>typeof p==='string'&&/^[A-Za-z0-9._/-]+$/.test(p)&&!p.startsWith('/')&&!p.split('/').some(v=>!v||v==='.'||v==='..');
const keys=(o,k)=>{if(!o||!equal(Object.keys(o).sort(),[...k].sort()))fail('unexpected registry/event fields');};
function registry(v){
 keys(v,['schemaVersion','kind','events']);if(v.schemaVersion!==1||v.kind!=='reviewed_evidence_loss_blocks'||!Array.isArray(v.events))fail('invalid registry');
 let last=-Infinity;const seen=new Set();
 for(const p of v.events){keys(p,['eventId','roundId','path','sha256','recordedAt']);const at=Date.parse(p.recordedAt);if(!id.test(p.eventId)||!id.test(p.roundId)||p.path!==`docs/release-blocks/${p.eventId}.json`||!hex.test(p.sha256)||!Number.isFinite(at)||at<=last||at>=FREEZE_AT||seen.has(p.eventId)||seen.has(p.roundId))fail('invalid or reordered trust pin');last=at;seen.add(p.eventId);seen.add(p.roundId);}
 return v;
}
const trusted=registry(structuredClone(reviewedTrust)),prefix=n=>({...trusted,events:trusted.events.slice(0,n)});
function event(raw,pin,index){
 if(hash(raw)!==pin.sha256)fail('missing, tampered or unreviewed event');const e=JSON.parse(raw);
 keys(e,['schemaVersion','kind','eventId','campaignId','roundId','recordedAt','previousEventSha256','priorTrustSha256','sourceLedger','reservedBank','incidentReport','targets']);
 if(!equal(raw,json(e))||e.schemaVersion!==1||e.kind!=='evidence_loss_release_block'||['eventId','roundId','recordedAt'].some(k=>e[k]!==pin[k])||!id.test(e.campaignId)||e.previousEventSha256!==(trusted.events[index-1]?.sha256??null)||e.priorTrustSha256!==hash(json(prefix(index))))fail('invalid or branched event');
 keys(e.sourceLedger,['path','sha256']);keys(e.reservedBank,['bankVersion','sha256']);keys(e.incidentReport,['path','sha256','missingOriginalPath','disposition']);
 if(e.sourceLedger.path!==`docs/rounds/${e.roundId}.json`||!hex.test(e.sourceLedger.sha256)||!id.test(e.reservedBank.bankVersion)||!hex.test(e.reservedBank.sha256)||!/^docs\/incidents\/[A-Za-z0-9_.-]+\.md$/.test(e.incidentReport.path)||!hex.test(e.incidentReport.sha256)||e.incidentReport.missingOriginalPath!==`docs/rounds/${e.roundId}.md`||e.incidentReport.disposition!=='reservation_only_missing_original_report'||!Array.isArray(e.targets)||!e.targets.length)fail('invalid exact ledger, bank or incident binding');
 const seen=new Set(),options=new Set();
 for(const t of e.targets){
  keys(t,['candidateId','questionId','learningGoalId','templateId','lineageId','revision','decision','attemptCount','candidateHistorySha256','contentSha256','identityFreeSha256','exclusiveOptionIds','contentStates']);
  if(['candidateId','questionId','learningGoalId','templateId','lineageId'].some(k=>!id.test(t[k]))||seen.has(t.candidateId)||!Number.isSafeInteger(t.revision)||t.revision<1||!Number.isSafeInteger(t.attemptCount)||t.attemptCount<1||!['accepted','rejected'].includes(t.decision)||!hex.test(t.candidateHistorySha256)||!Array.isArray(t.exclusiveOptionIds)||t.exclusiveOptionIds.some(v=>!id.test(v)||options.has(v))||new Set(t.exclusiveOptionIds).size!==t.exclusiveOptionIds.length)fail('invalid candidate reservation');
  if(t.decision==='accepted'?!hex.test(t.contentSha256)||!hex.test(t.identityFreeSha256):t.contentSha256!==null||t.identityFreeSha256!==null)fail('invalid accepted fingerprint or rejected evidence');
  if(!Array.isArray(t.contentStates)||t.contentStates.length!==t.attemptCount||t.contentStates.some(s=>!Number.isSafeInteger(s.revision)||!hex.test(s.contentSha256)||!hex.test(s.identityFreeSha256)||!hex.test(s.authorPackageSha256)||!hex.test(s.questionIdentityFreeSha256)||!Array.isArray(s.optionIdentityFreeSha256s)||s.optionIdentityFreeSha256s.some(v=>!hex.test(v))))fail('missing started-revision content fingerprint');
  for(const state of t.contentStates)keys(state,['revision','contentSha256','identityFreeSha256','authorPackageSha256','questionIdentityFreeSha256','optionIdentityFreeSha256s']);
  seen.add(t.candidateId);t.exclusiveOptionIds.forEach(v=>options.add(v));
 }
 return e;
}
function events(){return trusted.events.map((p,i)=>({pin:p,event:event(readFileSync(path.join(ROOT,p.path)),p,i)}));}
export const evidenceLossQuestionFingerprint=q=>quarantineFingerprint({...q,type:q.type==='written'?'evidence_loss_written':q.type,links:[]},[]);
export const evidenceLossOptionFingerprint=o=>quarantineHash({content:o.content,explanation:o.explanation});
const checkedBanks=new Set(),checkedPayloads=new Set();
const identity=(a,b)=>['candidateId','questionId','learningGoalId','templateId','lineageId'].some(k=>a?.[k]!==undefined&&a[k]===b[k]);
const relevant=(e,ledgers,now)=>now!==null&&now!==undefined&&now>=Date.parse(e.recordedAt)||(ledgers||[]).some(r=>r.roundId===e.roundId||Date.parse(r.startedAt)>=Date.parse(e.recordedAt)||(r.candidates||[]).some(c=>e.targets.some(t=>identity(c,t))));
/** Unconditional deny: even a caller-supplied past clock cannot release held content. */
export function assertNoEvidenceLossContent(bank){
 const all=events();if(!all.length)return bank;const digest=hash(JSON.stringify(bank));if(checkedBanks.has(digest))return bank;
 for(const {event:e}of all){
  if(bank.bankVersion===e.reservedBank.bankVersion)fail('reserved bankVersion cannot be a release or baseline');
  const options=new Map((bank.options||[]).map(o=>[o.optionId,o])),fingerprints=new Set(e.targets.flatMap(t=>[t.identityFreeSha256,...t.contentStates.map(s=>s.identityFreeSha256)]).filter(Boolean)),questionPrints=new Set(e.targets.flatMap(t=>t.contentStates.map(s=>s.questionIdentityFreeSha256))),optionPrints=new Set(e.targets.flatMap(t=>t.contentStates.flatMap(s=>s.optionIdentityFreeSha256s))); 
  for(const q of bank.questions||[])if(e.targets.some(t=>t.decision==='accepted'?identity(q,t):q.questionId===t.questionId&&q.revision<=t.revision)||questionPrints.has(evidenceLossQuestionFingerprint(q))||fingerprints.has(quarantineFingerprint(q,(q.links||[]).map(l=>options.get(l.optionId)))))fail('blocked content or renamed collision: '+q.questionId);
  const held=new Set(e.targets.flatMap(t=>t.exclusiveOptionIds));if((bank.options||[]).some(o=>held.has(o.optionId)||optionPrints.has(evidenceLossOptionFingerprint(o))))fail('blocked exclusive options cannot be shared or orphaned');
 }
 checkedBanks.add(digest);return bank;
}
export function isEvidenceLossReservedLedger(raw,relative){return events().some(({event:e})=>relative===e.sourceLedger.path&&hash(raw)===e.sourceLedger.sha256);}
/** Receipts/checkpoints/synchronizations cannot manufacture an eligible predecessor. */
export function assertEvidenceLossProvenance(value){
 for(const {event:e}of events())if(value&&(value.roundId===e.roundId||value.bankVersion===e.reservedBank.bankVersion||value.bankSha256===e.reservedBank.sha256))fail('blocked round cannot provide delivery, publication or predecessor proof');
 return value;
}
/** Public payload scan is extension/path-independent, including nested proof payloads. */
export function assertEvidenceLossPayload(raw,relative=''){
 const all=events(),sha=hash(raw),cacheKey=relative+':'+sha;if(checkedPayloads.has(cacheKey))return;
 if(relative===EVIDENCE_LOSS_TRUST_PATH){const local=registry(JSON.parse(raw));if(!equal(local,prefix(local.events.length))||!equal(Buffer.from(raw),json(local)))fail('unreviewed registry payload');return;}
 for(const {pin,event:e}of all){
  if(sha===e.reservedBank.sha256)fail('private recovered bank bytes cannot enter an outgoing payload');
  for(const binding of [e.sourceLedger,e.incidentReport,{path:pin.path,sha256:pin.sha256}])if(sha===binding.sha256){if(relative!==binding.path)fail('reserved evidence has the wrong basename or path');return;}
 }
 let value;try{value=JSON.parse(raw);}catch{return;}
 const targets=all.flatMap(({event:e})=>e.targets),questionPrints=new Set(targets.flatMap(t=>t.contentStates.map(s=>s.questionIdentityFreeSha256))),optionPrints=new Set(targets.flatMap(t=>t.contentStates.flatMap(s=>s.optionIdentityFreeSha256s))),heldOptions=new Set(targets.flatMap(t=>t.exclusiveOptionIds));
 function inspect(v){if(typeof v==='string'&&/^\s*[\[{]/.test(v)){let nested;try{nested=JSON.parse(v);}catch{return;}inspect(nested);return;}if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(inspect);return;}if(v.type&&typeof v.stem==='string'&&(targets.some(t=>t.decision==='accepted'?identity(v,t):v.questionId===t.questionId&&v.revision<=t.revision)||questionPrints.has(evidenceLossQuestionFingerprint(v))))fail('blocked standalone question or renamed content');if(typeof v.content==='string'&&typeof v.explanation==='string'&&(heldOptions.has(v.optionId)||optionPrints.has(evidenceLossOptionFingerprint(v))))fail('blocked standalone option or renamed content');if(Array.isArray(v.questions)&&Array.isArray(v.options))assertNoEvidenceLossContent(v);if(v.question&&Array.isArray(v.options))assertNoEvidenceLossContent({questions:[v.question],options:v.options});if(v.bankVersion!==undefined||v.bankSha256!==undefined||v.receiptSchemaVersion!==undefined||v.artifactSha256!==undefined||v.ledgerSchemaVersion!==undefined)for(const {event:e}of all)if(v.roundId===e.roundId||v.bankVersion===e.reservedBank.bankVersion||v.bankSha256===e.reservedBank.sha256)fail('blocked delivery/publication/predecessor payload');Object.values(v).forEach(inspect);}
 inspect(value);checkedPayloads.add(cacheKey);
}
/** Full source bytes bind every original decision, validation summary and publication field. */
export function validateEvidenceLossCampaign(ledgers,{banks=new Map(),ledgerSources=new Map(),now=null,manifest=null,publicationState=null,offlineBases=new Map()}={}){
 const errors=[],reportDispositions=new Map(),reservations=new Map();
 try{
  if(now!==null&&!Number.isFinite(now))fail('invalid current clock');
  if(manifest)assertNoEvidenceLossContent(manifest);
  for(const [,entry]of banks instanceof Map?banks:Object.entries(banks)){const raw=entry.raw??entry;assertNoEvidenceLossContent(JSON.parse(raw));}
  for(const [,p]of offlineBases instanceof Map?offlineBases:[])assertEvidenceLossProvenance(p);
  for(const {event:e}of events()){
   if(!relevant(e,ledgers,now))continue;
   const matches=ledgers.filter(r=>r.roundId===e.roundId),raw=ledgerSources.get(e.roundId);
   if(matches.length!==1||!raw||hash(raw)!==e.sourceLedger.sha256||!equal(matches[0],JSON.parse(raw)))fail('missing or changed full original source ledger');
   const r=matches[0];if(r.campaignId!==e.campaignId||r.status!=='closed'||Date.parse(e.recordedAt)<Date.parse(r.closedAt)||r.publication?.status!=='not_attempted'||r.publication?.verifiedAt!==null||r.publication.bankVersion!==e.reservedBank.bankVersion||r.publication.bankSha256!==e.reservedBank.sha256||r.candidates.length!==e.targets.length)fail('source reservation differs from original terminal ledger');
   if(now!==null&&(now<Date.parse(e.recordedAt)||now>=FREEZE_AT||manifest?.finalRelease||publicationState?.finalized))fail('current time or freeze blocks reservation-only continuation');
   for(const t of e.targets){const c=r.candidates.find(c=>c.candidateId===t.candidateId);if(!c||!equal(c.cycles.map(s=>s.revision),t.contentStates.map(s=>s.revision))||quarantineHash(c)!==t.candidateHistorySha256||['questionId','learningGoalId','templateId','lineageId','revision','decision','attemptCount'].some(k=>c[k]!==t[k]))fail('candidate identity or complete review history changed');}
   for(const other of ledgers){if(other!==r&&(other.candidates||[]).some(c=>e.targets.some(t=>identity(c,t)&&!(t.decision==='rejected'&&c.candidateId!==t.candidateId&&c.reopenCount===1&&c.reopeningEvidence?.length&&c.priorCandidateRefs?.some(ref=>ref.roundId===e.roundId&&ref.candidateId===t.candidateId)))))fail('reserved goal, template, lineage or candidate reintroduced');if(other.baseline?.bankVersion===e.reservedBank.bankVersion||other.baseline?.offlinePredecessor?.roundId===e.roundId)fail('blocked source cannot be a baseline');if(other!==r&&other.publication?.bankVersion===e.reservedBank.bankVersion)fail('reserved bankVersion reused');}
   if(hash(readFileSync(path.join(ROOT,e.incidentReport.path)))!==e.incidentReport.sha256)fail('missing or changed incident report');
   reportDispositions.set(e.roundId,e.incidentReport.missingOriginalPath);reservations.set(e.roundId,{accepted:e.targets.filter(t=>t.decision==='accepted').length,rejected:e.targets.filter(t=>t.decision==='rejected').length,releaseEligible:0,currentExecutionProof:false,deliveryProof:false,publicationProof:false});
  }
 }catch(error){errors.push(error.message);}
 return {ok:!errors.length,errors,reportDispositions,reservations};
}
async function bytes(root,relative){
 if(!safe(relative))fail('unsafe evidence path');for(let p=path.resolve(root);;p=path.dirname(p)){if((await fs.lstat(p)).isSymbolicLink())fail('symlink evidence root');if(path.dirname(p)===p)break;}
 let p=path.resolve(root);for(const [i,part]of relative.split('/').entries()){p=path.join(p,part);const st=await fs.lstat(p);if(st.isSymbolicLink()||(i===relative.split('/').length-1?!st.isFile():!st.isDirectory()))fail('nonregular evidence path');}return fs.readFile(p);
}
export function validateEvidenceLossSnapshot(files,{now=null}={}){
 const byPath=new Map(files.map(f=>[f.path,Buffer.from(f.raw)])),raw=byPath.get(EVIDENCE_LOSS_TRUST_PATH),modern=byPath.get('scripts/validate-round.mjs')?.toString().includes('loadEvidenceLossDependencies');
 if(modern&&!raw)fail('missing registry dependency');const local=raw?registry(JSON.parse(raw)):prefix(0);
 if(!equal(local,prefix(local.events.length))||raw&&!equal(raw,json(local)))fail('unreviewed or rewritten trust prefix');
 const ledgers=[],ledgerSources=new Map(),banks=new Map();
 for(const [p,b]of byPath){assertEvidenceLossPayload(b,p);if(/^docs\/rounds\/round-\d+\.json$/.test(p)){const r=JSON.parse(b);if(p!==`docs/rounds/${r.roundId}.json`)fail('ledger basename mismatch');ledgers.push(r);ledgerSources.set(r.roundId,b);}const v=/^data\/releases\/([^/]+)\/bank\.json$/.exec(p)?.[1];if(v)banks.set(v,{raw:b});}
 const all=events();for(const {event:e}of all.slice(local.events.length))if(relevant(e,ledgers,now))fail('mandatory registry tail omitted');
 if(modern||raw){const allow=byPath.get('PUBLICATION-MANIFEST.txt')?.toString().split(/\r?\n/).map(p=>p.trim());for(const p of [EVIDENCE_LOSS_TRUST_PATH,'scripts/evidence-loss-block.mjs',...(local.events.length?['scripts/validate-round.mjs']:[])])if(!byPath.has(p)||!allow?.includes(p))fail('registry dependency missing from allowlist');}
 for(const [i,p]of local.events.entries()){
  const e=event(byPath.get(p.path)??Buffer.alloc(0),p,i);for(const binding of [e.sourceLedger,e.incidentReport,{path:p.path,sha256:p.sha256}])if(!byPath.has(binding.path)||hash(byPath.get(binding.path))!==binding.sha256||!byPath.get('PUBLICATION-MANIFEST.txt')?.toString().split(/\r?\n/).includes(binding.path))fail('missing or changed ledger/event/incident dependency');
  if(byPath.has(e.incidentReport.missingOriginalPath))fail('missing original report cannot be replaced or impersonated');
 }
 const result=validateEvidenceLossCampaign(ledgers,{banks,ledgerSources,now,manifest:byPath.has('data/manifest.json')?JSON.parse(byPath.get('data/manifest.json')):null,publicationState:byPath.has('data/publication-state.json')?JSON.parse(byPath.get('data/publication-state.json')):null});
 if(!result.ok)fail(result.errors.join('; '));return result;
}
/** Root discovery reads the complete allowlist; dropping all event files never clears a current block. */
export async function loadEvidenceLossDependencies(root,{now=Date.now()}={}){
 const listed=(await bytes(root,'PUBLICATION-MANIFEST.txt')).toString().split(/\r?\n/).map(p=>p.trim()).filter(p=>p&&!p.startsWith('#'));
 if(new Set(listed).size!==listed.length)fail('duplicate allowlist paths');const files=[];
 for(const p of listed)files.push({path:p,raw:await bytes(root,p)});
 // A listed-only scan must not allow a present validator to disappear from the inventory.
 let validator='';try{validator=(await bytes(root,'scripts/validate-round.mjs')).toString();}catch(error){if(error.code!=='ENOENT')throw error;}
 if(validator.includes('loadEvidenceLossDependencies')&&!listed.includes('scripts/validate-round.mjs'))fail('validator omitted from allowlist');
 const result=validateEvidenceLossSnapshot(files,{now});
 for(const {event:e}of events())if(result.reservations.has(e.roundId)){let found=false;try{await fs.lstat(path.join(root,e.incidentReport.missingOriginalPath));found=true;}catch(error){if(error.code!=='ENOENT')throw error;}if(found)fail('missing original report cannot be replaced or impersonated, even when unlisted');}
 return result;
}
