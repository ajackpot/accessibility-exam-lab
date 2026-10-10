/** Explicit publication use of an already registered normal-chain reconciliation.
 * Legacy events keep their original chronology and parent guards. This module
 * never registers evidence, resolves a stopped write, or authorizes publication.
 */
import {readFileSync,lstatSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import rootTrust from '../docs/deliveries/normal-backup-root-trust.json' with {type:'json'};
import chainTrust from '../docs/deliveries/normal-backup-chain-trust.json' with {type:'json'};
import {FREEZE_AT} from '../src/domain.js';
import {ANCESTOR_PUBLICATION_TRANSITION,validateNormalChainAncestorTransition} from './normal-chain-publication-ancestry.mjs';
export const RECONCILED_NORMAL_CHAIN_PUBLICATION_KIND='verified_reconciled_normal_chain_publication';
export const isReconciledNormalChainPublication=r=>r?.kind===RECONCILED_NORMAL_CHAIN_PUBLICATION_KIND;
const root=path.resolve(import.meta.dirname,'..'),H=b=>createHash('sha256').update(b).digest('hex'),J=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
const sha=/^(?!0{40}$)[a-f0-9]{40}$/,hex=/^(?!0{64}$)[a-f0-9]{64}$/;
const fail=m=>{throw Error('Reconciled normal publication: '+m);};
function keys(x,names){if(!x||Array.isArray(x)||!equal(Object.keys(x).sort(),[...names].sort()))fail('unexpected reconciliation fields');}
function instant(v){const n=Date.parse(v);if(typeof v!=='string'||!Number.isFinite(n)||n>=FREEZE_AT)fail('invalid actual chronology or final cutoff');return n;}
function pinned(pin){if(!pin||!hex.test(pin.sha256)||typeof pin.path!=='string'||!/^docs\/deliveries\/normal-(?:roots|chains)\/[A-Za-z0-9_./-]+\.json$/.test(pin.path)||pin.path.split('/').some(p=>p==='.'||p==='..'))fail('exact imported delivery pin required');let p=root;for(const part of pin.path.split('/')){p=path.join(p,part);if(lstatSync(p).isSymbolicLink())fail('delivery authority symlink forbidden');}const raw=readFileSync(p),proof=JSON.parse(raw);if(H(raw)!==pin.sha256||!equal(raw,J(proof))||proof.roundId!==pin.roundId)fail('original registered proof bytes changed');return {pin,proof,raw};}
function ledgerOf(entry,ledgers,ledgerSources){const s=entry.proof.completeManifest.sourceRelease,l=ledgers.find(l=>l.roundId===entry.pin.roundId),raw=ledgerSources.get(entry.pin.roundId);if(!l||!Buffer.isBuffer(raw)||H(raw)!==s.ledgerSha256||!equal(JSON.parse(raw),l)||s.roundId!==l.roundId||s.ledgerPath!==`docs/rounds/${l.roundId}.json`||l.publication.bankVersion!==s.bankVersion||l.publication.bankSha256!==s.bankSha256)fail('exact original delivered ledger required');return l;}
const anchorOf=p=>p.kind==='delivered_normal_release_root_checkpoint'?p.continuationAnchor:p.publicAnchor;
/** Validate the new event's exact shape and byte-bound original chronology.
 * Full activation additionally goes through the existing sealed-chain loader.
 */
export function validateReconciledNormalPublication(record,{ledgers,ledgerSources,previousPublication,treeFunction}){
 if(!isReconciledNormalChainPublication(record))fail('explicit reconciled event kind required');
 const r=record.reconciliation;keys(r,['schemaVersion','kind','transitionProof','sourceWindows','parentObservation','refUpdate']);keys(r.transitionProof,['path','sha256']);
 if(r.schemaVersion!==1||r.kind!=='registered_normal_chain_ancestor_publication'||!Array.isArray(record.rounds)||!record.rounds.length||!Array.isArray(r.sourceWindows)||r.sourceWindows.length!==record.rounds.length||!previousPublication||record.previousSynchronizationSha256!==H(J(previousPublication)))fail('exact linked predecessor and registered reconciliation required');
 const transitionPin=chainTrust.checkpoints.find(p=>p.path===r.transitionProof.path&&p.sha256===r.transitionProof.sha256),bridge=pinned(transitionPin),rootPin=rootTrust.roots.find(p=>p.sha256===transitionPin.rootProofSha256);
 const memberPins=[rootPin,...chainTrust.checkpoints.filter(p=>p.rootProofSha256===rootPin.sha256)],bridgeIndex=memberPins.findIndex(p=>p.sha256===transitionPin.sha256),requiredEnd=Math.max(bridgeIndex,...record.rounds.map(s=>memberPins.findIndex(p=>p.path===s.deliveryProof?.path&&p.sha256===s.deliveryProof?.sha256&&p.roundId===s.roundId)));
 const entries=memberPins.slice(0,requiredEnd+1).map(pinned);
 if(bridgeIndex<=0||bridge.proof.anchorTransition?.kind!==ANCESTOR_PUBLICATION_TRANSITION||bridge.proof.rootProofSha256!==rootPin.sha256)fail('registered explicit ancestor-transition successor required');
 const transition=bridge.proof.anchorTransition,anchor=anchorOf(bridge.proof),historical=anchorOf(entries[bridgeIndex-1].proof),lastAncestor=transition.evidence?.publications?.at(-1);
 if(lastAncestor?.sha256!==record.previousSynchronizationSha256||lastAncestor.path!==`docs/publications/${previousPublication.syncId}.json`||transition.sourceAnchorSha256!==H(J(historical))||transition.evidence.anchorCommit!==historical.baseCommit||transition.evidence.headCommit!==anchor.baseCommit)fail('reconciliation does not bind the exact intervening latest public event');
 const parent=r.parentObservation;keys(parent,['repository','ref','commit','tree','remoteInventory','observedAt','commitObservedAt','treeObservedAt','manifestObservedAt','publicationStateObservedAt','headResponseSha256','commitResponseSha256','treeResponseSha256','manifestResponseSha256','publicationStateResponseSha256']);
 if(parent.repository!==record.repository||parent.ref!=='refs/heads/main'||parent.commit!==record.parent||parent.commit!==anchor.baseCommit||!sha.test(parent.commit)||!sha.test(parent.tree)||!equal(parent.remoteInventory,transition.evidence.commits.at(-1).remoteInventory)||treeFunction(parent.remoteInventory)!==parent.tree||parent.tree!==transition.evidence.commits.at(-1).tree||['headResponseSha256','commitResponseSha256','treeResponseSha256','manifestResponseSha256','publicationStateResponseSha256'].some(k=>!hex.test(parent[k])))fail('actual fresh parent must be the exact registered reconciled anchor');
 const f=r.refUpdate;keys(f,['repository','ref','expectedSha','sha','force','submittedAt','completedAt','requestSha256','responseSha256']);const observed=instant(parent.observedAt),submitted=instant(f.submittedAt),completed=instant(f.completedAt),verified=instant(record.verifiedAt);
 if(f.repository!==record.repository||f.ref!=='refs/heads/main'||f.expectedSha!==record.parent||f.sha!==record.commit||f.force!==false||!hex.test(f.requestSha256)||!hex.test(f.responseSha256)||['observedAt','commitObservedAt','treeObservedAt','manifestObservedAt','publicationStateObservedAt'].some(k=>instant(parent[k])>submitted||submitted-instant(parent[k])>60000)||completed<submitted||completed>verified||instant(transitionPin.eligibleAt)>observed)fail('fresh leased nonforce ref and actual registration chronology required');
 const positions=[],earlyRoundIds=new Set();
 for(const [i,s]of record.rounds.entries()){
  const index=entries.findIndex(e=>e.pin.path===s.deliveryProof?.path&&e.pin.sha256===s.deliveryProof?.sha256&&e.pin.roundId===s.roundId);if(index<=0||i&&index!==positions.at(-1)+1)fail('exact contiguous registered successor suffix required');positions.push(index);
  const e=entries[index],previous=entries[index-1],l=ledgerOf(e,ledgers,ledgerSources),p=previous.proof,release=p.completeManifest.sourceRelease,w=r.sourceWindows[i];keys(w,['roundId','startedAt','decisionDeadline','closedAt','predecessorEligibleAt']);
  if(!equal(w,{roundId:l.roundId,startedAt:l.startedAt,decisionDeadline:l.decisionDeadline,closedAt:l.closedAt,predecessorEligibleAt:previous.pin.eligibleAt}))fail('original source window or eligibility was rewritten');
  const start=instant(l.startedAt),deadline=instant(l.decisionDeadline),close=instant(l.closedAt);
  if(start<instant(previous.pin.eligibleAt)||deadline<=start||deadline-start>14400000||close<start||close>deadline||instant(e.pin.eligibleAt)>observed||instant(e.proof.verificationCompletedAt)>instant(e.pin.eligibleAt)||l.status!=='closed'||l.publication.status!=='not_attempted'||e.proof.canPublish!==false||e.proof.newlyPublishedRegular!==0)fail('source was not closed and actually registered within its original bounds');
  const ref={roundId:previous.pin.roundId,artifactSha256:p.deltaArtifactSha256,manifestSha256:H(J(p.deltaManifest)),ledgerSha256:release.ledgerSha256};
  if(!equal(l.baseline.offlinePredecessor,ref)||l.baseline.sourceCommit!==anchorOf(p).baseCommit||l.baseline.bankVersion!==release.bankVersion||l.baseline.bankSha256!==release.bankSha256||e.proof.previousProofSha256!==previous.pin.sha256||s.originalLedgerSha256!==e.proof.completeManifest.sourceRelease.ledgerSha256||s.bankVersion!==e.proof.completeManifest.sourceRelease.bankVersion||s.bankSha256!==e.proof.completeManifest.sourceRelease.bankSha256)fail('original delivered predecessor/source bindings changed');
  if(start<instant(previousPublication.verifiedAt)){
   // Preserve the original historical-prefix exception exactly. A distinct,
   // bounded case covers a first source that began from its exact eligible
   // delivered predecessor, then itself registered that ancestor's publication.
   // Its own unchanged candidate window applies even if publication occurred
   // during review. Later sources and changed baselines cannot borrow this case.
   const historicalPrefix=index<bridgeIndex&&l.baseline.sourceCommit===historical.baseCommit&&anchorOf(e.proof).baseCommit===historical.baseCommit;
   const originalWindowTransitionSource=i===0&&index===bridgeIndex&&l.baseline.sourceCommit===historical.baseCommit&&release.bankVersion===previousPublication.manifest.bankVersion&&release.bankSha256===previousPublication.manifest.sha256&&equal(anchorOf(e.proof),anchor);
   if(!historicalPrefix&&!originalWindowTransitionSource)fail('earlier start is outside the registered historical-anchor prefix or exact original-window predecessor transition');earlyRoundIds.add(s.roundId);
  }
 }
 if(!positions.includes(bridgeIndex)||positions[0]>bridgeIndex||anchorOf(entries[positions.at(-1)].proof).baseCommit!==record.parent||!equal(anchorOf(entries[positions.at(-1)].proof).remoteInventory,anchor.remoteInventory))fail('published suffix must include and retain the exact reconciliation');
 const predecessor=entries[positions[0]-1].proof.completeManifest.sourceRelease;
 if(predecessor.bankVersion!==previousPublication.manifest.bankVersion||predecessor.bankSha256!==previousPublication.manifest.sha256)fail('publication must start at the exact verified delivered ancestor');
 const inv=new Map(record.remoteInventory.map(f=>[f.path,f]));
 for(const f of parent.remoteInventory){const next=inv.get(f.path);if(!next)fail('current public parent path removed');if((/^data\/(?:releases\/|seed-bank)/.test(f.path)||/^docs\/(?:rounds\/|corrections\/|publications\/|deliveries\/|quarantines\/|release-blocks\/|incidents\/)/.test(f.path)&&!f.path.endsWith('trust.json')||f.path.startsWith('docs/analysis/'))&&!equal(next,f))fail('current parent immutable or external support bytes changed');}
 for(const p of ['scripts/normal-chain-publication-event.mjs',transitionPin.path])if(!inv.has(p))fail('missing event/reconciliation dependency');
 return {earlyRoundIds,positions,bridgeIndex,bridge,entries};
}
/** Existing caller has authenticated the sealed chain and every exact source.
 * Re-use the original ancestry validator; never substitute a caller Boolean/Map.
 */
export function validateReconciledNormalChainMembership(record,{chain,positions,synchronizations,ledgers,ledgerSources,treeFunction}){
 const previousPublication=synchronizations.find(p=>H(J(p))===record.previousSynchronizationSha256),r=validateReconciledNormalPublication(record,{ledgers,ledgerSources,previousPublication,treeFunction});
 if(!equal(positions,r.positions)||chain.rootProofSha256!==r.bridge.pin.rootProofSha256||chain.sources.length<r.entries.length||chain.sources.slice(0,r.entries.length).some((s,i)=>s.proofSha256!==r.entries[i].pin.sha256||!equal(s.proof,r.entries[i].proof)))fail('source projection differs from the fully validated registered chain');
 const index=r.bridgeIndex,source=ledgerOf(r.bridge,ledgers,ledgerSources),previous=chain.sources[index-1],beforeAnchor=anchorOf(previous.proof),afterAnchor=anchorOf(r.bridge.proof);
 validateNormalChainAncestorTransition(r.bridge.proof.anchorTransition,{beforeAnchor,afterAnchor,chain,publicationPins:synchronizations.map(p=>({path:`docs/publications/${p.syncId}.json`,sha256:H(J(p))})),publicationRecords:synchronizations,source,previous,now:instant(r.bridge.proof.verificationCompletedAt)});
 return {kind:'exact_registered_reconciliation_validated',canPublish:false};
}
