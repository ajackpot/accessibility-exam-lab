/** Actual immutable source inputs; publication/ref values below are synthetic
 * unit fixtures, never observations, installed pins, or publication authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {normalPublicationTree,validateNormalPublication,validateNormalBankTransition} from '../scripts/normal-publication.mjs';
import {PUBLICATION_SYNCHRONIZATIONS,validatePublicationSynchronizations,validateNormalChainSynchronizationSources} from '../scripts/publication-sync.mjs';
import {RECONCILED_NORMAL_CHAIN_PUBLICATION_KIND,validateReconciledNormalPublication,validateReconciledNormalChainMembership} from '../scripts/normal-chain-publication-event.mjs';
import {loadNormalBackupChains} from '../scripts/normal-backup-chain.mjs';
const root=path.resolve(import.meta.dirname,'..'),read=p=>fs.readFileSync(path.join(root,p)),J=v=>Buffer.from(JSON.stringify(v,null,2)+'\n'),H=b=>createHash('sha256').update(b).digest('hex'),G=b=>createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`),b])).digest('hex');
const allPaths=read('PUBLICATION-MANIFEST.txt').toString().split(/\r?\n/).filter(p=>p&&!p.startsWith('#'));
const rows=allPaths.map(path=>{const raw=read(path);return {path,bytes:raw.length,sha256:H(raw),gitBlob:G(raw)};}),inventory=new Map(rows.map(({gitBlob,...r})=>[r.path,r]));
const ledgerSources=new Map(allPaths.filter(p=>/^docs\/rounds\/round-\d+\.json$/.test(p)).map(p=>{const raw=read(p);return [JSON.parse(raw).roundId,raw];})),ledgers=[...ledgerSources.values()].map(b=>JSON.parse(b));
const allEvents=PUBLICATION_SYNCHRONIZATIONS.map(p=>JSON.parse(read(p.path))),priorIndex=allEvents.findIndex(e=>e.syncId==='normal-032');assert.ok(priorIndex>=0,'exact historical public32 event required');
const events=allEvents.slice(0,priorIndex+1),previous=events.at(-1),pins=JSON.parse(read('docs/deliveries/normal-backup-chain-trust.json')).checkpoints;
const bridgePin=pins.find(p=>p.roundId==='round-034'),bridge=JSON.parse(read(bridgePin.path)),rootPin=JSON.parse(read('docs/deliveries/normal-backup-root-trust.json')).roots.find(p=>p.sha256===bridgePin.rootProofSha256);
const members=[rootPin,...pins.filter(p=>p.rootProofSha256===bridgePin.rootProofSha256)].map(pin=>({pin,proof:JSON.parse(read(pin.path))}));
const sources=members.filter(e=>['round-033','round-034'].includes(e.pin.roundId));
const banks=new Map(['2026.10.08-regular.32','2026.10.08-regular.33','2026.10.08-regular.34'].map(v=>[v,{raw:read(`data/releases/${v}/bank.json`)}]));
const bank=JSON.parse(banks.get('2026.10.08-regular.34').raw),baseline=JSON.parse(banks.get('2026.10.08-regular.32').raw),manifest=JSON.parse(bridge.runtimeManifestRaw);
// This fixture models the exact delivered034 tip, even when the real source
// has advanced to035 or later. Do not mix a current active marker with bank34.
const historicalMarkers=new Map([['data/manifest.json',Buffer.from(bridge.runtimeManifestRaw)],['data/publication-state.json',Buffer.from(bridge.publicationStateRaw)]]);
for(const [name,raw]of historicalMarkers){const i=rows.findIndex(f=>f.path===name);assert.ok(i>=0);rows[i]={path:name,bytes:raw.length,sha256:H(raw),gitBlob:G(raw)};}
const now=Date.now(),iso=n=>new Date(n).toISOString();
function fixture(){
 const parent=bridge.anchorTransition.evidence.commits.at(-1),rounds=sources.map(({pin,proof})=>{const s=proof.completeManifest.sourceRelease,l=ledgers.find(l=>l.roundId===pin.roundId);return {kind:'normal_delivered_checkpoint',roundId:pin.roundId,ledgerPath:s.ledgerPath,originalLedgerSha256:s.ledgerSha256,bankVersion:s.bankVersion,bankSha256:s.bankSha256,accepted:l.counts.accepted,originalPublicationStatus:l.publication.status,quarantined:0,eligible:l.counts.accepted,newlyPublicRegular:l.counts.accepted,artifactSha256:proof.deltaArtifactSha256,manifestSha256:H(J(proof.deltaManifest)),deliveredAt:proof.attachmentAcceptedAt,deliveryVerifiedAt:proof.verificationCompletedAt,deliveryProof:{path:pin.path,sha256:pin.sha256},attachmentReceiptSha256:proof.privateEvidence.attachmentReceiptSha256};});
 const regular=bank.questions.filter(q=>!q.testOnly),oldIds=new Set(baseline.questions.map(q=>q.questionId)),commit='1'.repeat(40);
 const record={schemaVersion:1,syncId:'synthetic-reconciled-033-034',kind:RECONCILED_NORMAL_CHAIN_PUBLICATION_KIND,previousSynchronizationSha256:H(J(previous)),verifiedAt:iso(now),repository:previous.repository,commit,parent:parent.commit,tree:normalPublicationTree(rows),commitUrl:`https://github.com/${previous.repository}/commit/${commit}`,pages:{runId:1,headSha:commit,status:'completed',conclusion:'success',url:`https://github.com/${previous.repository}/actions/runs/1`},siteUrl:previous.siteUrl,manifest,manifestSha256:H(historicalMarkers.get('data/manifest.json')),runtimeManifestRaw:bridge.runtimeManifestRaw,publicationStateRaw:bridge.publicationStateRaw,counts:{regular:regular.length,written:regular.filter(q=>q.type==='written').length,practical:regular.filter(q=>q.type==='practical').length,testOnly:bank.questions.length-regular.length,total:bank.questions.length,newlyPublicFromAnchor:regular.filter(q=>!oldIds.has(q.questionId)).length},writtenBySubject:Object.fromEntries(['s1','s2','s3','s4','s5'].map(s=>[s,regular.filter(q=>q.type==='written'&&q.subjectId===s).length])),rounds,remoteInventory:rows,liveAssets:rows.map(f=>({path:f.path,url:new URL(f.path,previous.siteUrl).href,http:200,bytes:f.bytes,sha256:f.sha256})),limitations:['Synthetic unit fixture only; no actual Git request, Pages observation, event pin or publication authority'],reconciliation:{schemaVersion:1,kind:'registered_normal_chain_ancestor_publication',transitionProof:{path:bridgePin.path,sha256:bridgePin.sha256},sourceWindows:sources.map(({pin})=>{const l=ledgers.find(l=>l.roundId===pin.roundId),i=members.findIndex(e=>e.pin.sha256===pin.sha256);return {roundId:l.roundId,startedAt:l.startedAt,decisionDeadline:l.decisionDeadline,closedAt:l.closedAt,predecessorEligibleAt:members[i-1].pin.eligibleAt};}),parentObservation:{repository:previous.repository,ref:'refs/heads/main',commit:parent.commit,tree:parent.tree,remoteInventory:parent.remoteInventory,observedAt:iso(now-2000),commitObservedAt:iso(now-2000),treeObservedAt:iso(now-2000),manifestObservedAt:iso(now-2000),publicationStateObservedAt:iso(now-2000),headResponseSha256:'a'.repeat(64),commitResponseSha256:'b'.repeat(64),treeResponseSha256:'c'.repeat(64),manifestResponseSha256:'d'.repeat(64),publicationStateResponseSha256:'e'.repeat(64)},refUpdate:{repository:previous.repository,ref:'refs/heads/main',expectedSha:parent.commit,sha:commit,force:false,submittedAt:iso(now-1500),completedAt:iso(now-1000),requestSha256:'f'.repeat(64),responseSha256:'9'.repeat(64)}}};
 return structuredClone(record);
}
const context=()=>({ledgers,ledgerSources,previousPublication:previous,treeFunction:normalPublicationTree});
const semantic=record=>validateNormalPublication(record,{ledgers,ledgerSources,banks,inventory:new Map(record.remoteInventory.map(({gitBlob,...r})=>[r.path,r])),previousPublication:previous});
test('new kind preserves real pre-public033 chronology and exact delivered suffix, parent, counts and historical bytes',()=>{const e=fixture(),before=H(J([...ledgerSources].map(([id,b])=>[id,H(b)]))),r=validateReconciledNormalPublication(e,context());assert.deepEqual([...r.earlyRoundIds],['round-033']);assert.deepEqual(r.positions,[1,2]);semantic(e);assert.equal(e.counts.newlyPublicFromAnchor,12);assert.equal(e.counts.regular,927);assert.equal(H(J([...ledgerSources].map(([id,b])=>[id,H(b)]))),before);assert.equal(ledgers.find(l=>l.roundId==='round-033').startedAt,'2026-10-08T11:16:14.654168+00:00');});
test('legacy kind cannot borrow the new chronology exception or extra field',()=>{const e=fixture();e.kind='verified_normal_chain_publication';assert.throws(()=>semantic(e),/exact event fields/);delete e.reconciliation;assert.throws(()=>semantic(e),/exact closed unpublished ledger sources/);});
test('unregistered synthetic event cannot activate through the real public entrypoint',()=>{const r=validatePublicationSynchronizations([...events,fixture()],{ledgers,ledgerSources,banks,now,activeBankVersion:bank.bankVersion,publicationState:{finalized:false}});assert.equal(r.ok,false);assert.match(r.errors.join(';'),/unreviewed|reordered|tampered/);});
const cases=[
 ['caller trust flag',e=>e.reconciliation.trusted=true],
 ['wrong bridge proof',e=>e.reconciliation.transitionProof.sha256='f'.repeat(64)],
 ['legacy/non-transition proof',e=>e.reconciliation.transitionProof={path:sources[0].pin.path,sha256:sources[0].pin.sha256}],
 ['forged intervening publication',e=>e.previousSynchronizationSha256='f'.repeat(64)],
 ['rewritten033 start',e=>e.reconciliation.sourceWindows[0].startedAt=previous.verifiedAt],
 ['rewritten deadline',e=>e.reconciliation.sourceWindows[0].decisionDeadline=iso(now)],
 ['rewritten close',e=>e.reconciliation.sourceWindows[0].closedAt=iso(now)],
 ['wrong predecessor eligibility',e=>e.reconciliation.sourceWindows[0].predecessorEligibleAt=iso(now)],
 ['dropped033 source',e=>{e.rounds.shift();e.reconciliation.sourceWindows.shift();}],
 ['dropped reconciliation source',e=>{e.rounds.pop();e.reconciliation.sourceWindows.pop();}],
 ['reordered sources',e=>{e.rounds.reverse();e.reconciliation.sourceWindows.reverse();}],
 ['duplicate source',e=>{e.rounds.push(e.rounds[0]);e.reconciliation.sourceWindows.push(e.reconciliation.sourceWindows[0]);}],
 ['rewritten source ledger hash',e=>e.rounds[0].originalLedgerSha256='f'.repeat(64)],
 ['foreign fresh parent',e=>{e.parent='a'.repeat(40);e.reconciliation.parentObservation.commit=e.parent;e.reconciliation.refUpdate.expectedSha=e.parent;}],
 ['stale parent over60seconds',e=>e.reconciliation.parentObservation.observedAt=iso(now-62000)],
 ['parent observed after submission',e=>e.reconciliation.parentObservation.observedAt=iso(now-1200)],
 ['other parent ref',e=>e.reconciliation.parentObservation.ref='refs/heads/other'],
 ['other ref update',e=>e.reconciliation.refUpdate.ref='refs/heads/other'],
 ['other parent repository',e=>e.reconciliation.parentObservation.repository='other/repo'],
 ['other ref repository',e=>e.reconciliation.refUpdate.repository='other/repo'],
 ['stale commit observation',e=>e.reconciliation.parentObservation.commitObservedAt=iso(now-62000)],
 ['stale tree observation',e=>e.reconciliation.parentObservation.treeObservedAt=iso(now-62000)],
 ['stale manifest observation',e=>e.reconciliation.parentObservation.manifestObservedAt=iso(now-62000)],
 ['stale freeze observation',e=>e.reconciliation.parentObservation.publicationStateObservedAt=iso(now-62000)],
 ['force update',e=>e.reconciliation.refUpdate.force=true],
 ['wrong ref lease',e=>e.reconciliation.refUpdate.expectedSha='b'.repeat(40)],
 ['wrong ref target',e=>e.reconciliation.refUpdate.sha='b'.repeat(40)],
 ['ref outcome after verification',e=>e.reconciliation.refUpdate.completedAt=iso(now+1)],
 ['missing raw head response hash',e=>e.reconciliation.parentObservation.headResponseSha256=null],
 ['missing freeze-state response hash',e=>delete e.reconciliation.parentObservation.publicationStateResponseSha256],
 ['future registration at parent boundary',e=>{e.reconciliation.parentObservation.observedAt='2026-10-08T16:40:00Z';e.reconciliation.refUpdate.submittedAt='2026-10-08T16:40:01Z';}],
 ['final cutoff',e=>e.verifiedAt='2026-10-16T15:00:00Z'],
 ['different original parent inventory',e=>{const p=e.reconciliation.parentObservation;p.remoteInventory[0].sha256='f'.repeat(64);}],
 ['removed current support event',e=>{e.remoteInventory=e.remoteInventory.filter(f=>f.path!=='docs/publications/normal-032.json');e.tree=normalPublicationTree(e.remoteInventory);}],
 ['changed immutable current bank',e=>{e.remoteInventory.find(f=>f.path==='data/releases/2026.10.08-regular.32/bank.json').sha256='f'.repeat(64);}],
 ['removed helper dependency',e=>e.remoteInventory=e.remoteInventory.filter(f=>f.path!=='scripts/normal-chain-publication-event.mjs')],
 ['removed own reconciliation proof',e=>e.remoteInventory=e.remoteInventory.filter(f=>f.path!==bridgePin.path)]
];
for(const [name,mutate]of cases)test('rejects '+name,()=>{const e=fixture();mutate(e);assert.throws(()=>validateReconciledNormalPublication(e,context()),/Reconciled normal publication/);});
test('normal publication still rejects wrong Pages head, missing live proof and finalized markers',()=>{for(const mutate of [e=>e.pages.headSha='a'.repeat(40),e=>e.liveAssets=e.liveAssets.filter(f=>f.path!==bridgePin.path),e=>e.publicationStateRaw='{"finalized":true}\n']){const e=fixture();mutate(e);assert.throws(()=>semantic(e));}});
test('new kind still rejects duplicate learning templates in the original bank-transition gate',()=>{const e=fixture(),l=ledgers.find(l=>l.roundId==='round-034'),b=JSON.parse(banks.get(l.baseline.bankVersion).raw),current=structuredClone(bank),old=new Set(b.questions.map(q=>q.questionId));current.questions.find(q=>!old.has(q.questionId)).templateId=b.questions.find(q=>!q.testOnly).templateId;assert.throws(()=>validateNormalBankTransition(e,l,current,b,{eligibleCandidateIds:l.candidates.filter(c=>c.decision==='accepted').map(c=>c.candidateId)}),/exact eligible|unique regular/);});
test('sealed chain phase reuses actual registered034 ancestry and refuses a caller Map at the aggregate boundary',async()=>{
 const loaded=await loadNormalBackupChains(root,{now,offlineBases:new Map(),deliveryCheckpointSources:new Map()}),chain=loaded.chains.get(bridgePin.rootProofSha256),e=fixture();
 const r=validateReconciledNormalChainMembership(e,{chain,positions:[1,2],synchronizations:events,ledgers,ledgerSources,treeFunction:normalPublicationTree});assert.equal(r.canPublish,false);
 await assert.rejects(validateNormalChainSynchronizationSources(events,new Map(loaded.chains),loaded.deliveryCheckpointSources,{ledgers,ledgerSources,now,release:true}),/untouched fully validated/);
 const longer=structuredClone(chain);longer.sources.push({roundId:'synthetic-unrelated-later-member'});assert.equal(validateReconciledNormalChainMembership(e,{chain:longer,positions:[1,2],synchronizations:events,ledgers,ledgerSources,treeFunction:normalPublicationTree}).canPublish,false,'later unrelated members do not rewrite an exact historical event prefix');
 const bad=structuredClone(chain);bad.sources[1].proofSha256='f'.repeat(64);assert.throws(()=>validateReconciledNormalChainMembership(e,{chain:bad,positions:[1,2],synchronizations:events,ledgers,ledgerSources,treeFunction:normalPublicationTree}),/fully validated registered chain/);
});
