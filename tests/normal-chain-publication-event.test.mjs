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

// Self-contained PUBLIC/SYNTHETIC regression. Original036 ledger chronology and
// predecessor bank are public immutable inputs. Every later anchor observation,
// archive identifier, receipt, proof/pin, ref and Pages result below is synthetic;
// this never creates delivery evidence or invokes the production chain loader.
test('early original-window transition source: public036-shaped synthetic regression',async t=>{
 const {tmpdir}=await import('node:os'),{pathToFileURL}=await import('node:url');
 const dir=fs.mkdtempSync(path.join(tmpdir(),'synthetic-early-transition-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 for(const p of ['scripts','src','docs','package.json'])fs.cpSync(path.join(root,p),path.join(dir,p),{recursive:true});
 const clone=structuredClone,trustPath='docs/deliveries/normal-backup-chain-trust.json',newPath='docs/deliveries/normal-chains/round-032/round-036.json';
 const public35=allEvents.find(e=>e.syncId==='reconciled-033-035');assert.ok(public35,'exact public035 event required');
 const originalTrust=JSON.parse(read(trustPath)),pastPins=originalTrust.checkpoints.filter(p=>p.rootProofSha256!==rootPin.sha256||['round-033','round-034','round-035'].includes(p.roundId));
 const sameRoot=[rootPin,...pastPins.filter(p=>p.rootProofSha256===rootPin.sha256)],pastProofs=sameRoot.map(p=>JSON.parse(read(p.path))),predecessor=pastProofs.at(-1),historical=predecessor.publicAnchor;
 const publicLedger=JSON.parse(read('docs/rounds/round-036.json')),bankRaw=read(`data/releases/${publicLedger.publication.bankVersion}/bank.json`),bank36=JSON.parse(bankRaw);
 const marker={schemaVersion:1,bankVersion:bank36.bankVersion,file:`releases/${bank36.bankVersion}/bank.json`,sha256:H(bankRaw),releasedAt:bank36.releasedAt,changeSummary:bank36.changeSummary,finalRelease:false},markerRaw=J(marker).toString(),stateRaw=predecessor.publicationStateRaw;
 const eventPath='docs/publications/reconciled-033-035.json',publicRef={path:eventPath,sha256:H(J(public35))};
 const supportFiles=new Map(public35.remoteInventory.map(f=>[f.path,clone(f)]));
 const add=(map,p,b)=>map.set(p,{path:p,bytes:b.length,sha256:H(b),gitBlob:G(b)});
 add(supportFiles,eventPath,J(public35));add(supportFiles,'scripts/publication-sync.mjs',Buffer.from('// SYNTHETIC support registration bytes, never executable evidence\n'));
 const allowRaw='# SYNTHETIC support allowlist, not actual observations\n'+[...supportFiles.keys()].sort().join('\n')+'\n';add(supportFiles,'PUBLICATION-MANIFEST.txt',Buffer.from(allowRaw));
 const supportRows=[...supportFiles.values()],supportCommit='7'.repeat(40),supportTree=normalPublicationTree(supportRows),observed='2026-10-09T01:00:00Z',supportAt='2026-10-09T00:59:00Z';
 const after={baseCommit:supportCommit,observedAt:observed,manifestRaw:public35.runtimeManifestRaw,publicationStateRaw:public35.publicationStateRaw,allowlistRaw:allowRaw,remoteInventory:supportRows.map(({gitBlob,...f})=>f)};
 const startCommit=clone(bridge.anchorTransition.evidence.commits.at(-1));startCommit.supportVerification=null;startCommit.observedAt=observed;
 const livePaths=['PUBLICATION-MANIFEST.txt','scripts/publication-sync.mjs',eventPath,'data/manifest.json','data/publication-state.json',`data/${public35.manifest.file}`];
 const ancestry={schemaVersion:1,kind:'verified_normal_chain_publication_ancestry',anchorCommit:historical.baseCommit,headCommit:supportCommit,observedAt:observed,headResponseSha256:'a'.repeat(64),publications:[publicRef],commits:[startCommit,{commit:public35.commit,parent:public35.parent,tree:public35.tree,remoteInventory:public35.remoteInventory,observedAt:observed,requestSha256:'b'.repeat(64),responseSha256:'c'.repeat(64),supportVerification:null},{commit:supportCommit,parent:public35.commit,tree:supportTree,remoteInventory:supportRows,observedAt:observed,requestSha256:'d'.repeat(64),responseSha256:'e'.repeat(64),supportVerification:{verifiedAt:supportAt,pages:{runId:1,headSha:supportCommit,status:'completed',conclusion:'success',url:`https://github.com/${public35.repository}/actions/runs/1`,completedAt:supportAt},liveAssets:livePaths.map(path=>{const f=supportFiles.get(path);return {path,url:new URL(path,public35.siteUrl).href,http:200,bytes:f.bytes,sha256:f.sha256,observedAt:supportAt};}),evidenceSha256:'f'.repeat(64)}}]};
 const sourceFiles=new Map(allPaths.map(p=>[p,read(p)])),publicBanks=new Map(allPaths.filter(p=>/^data\/releases\/[^/]+\/bank\.json$/.test(p)).map(p=>{const raw=read(p);return [JSON.parse(raw).bankVersion,{raw}];}));
 function prepare(mutate=()=>{}){
  const ledger=clone(publicLedger),proof=clone(predecessor),syntheticBank=clone(bank36);
  Object.assign(proof,{roundId:ledger.roundId,previousProofSha256:sameRoot.at(-1).sha256,publicAnchor:clone(after),anchorTransition:{kind:'verified_normal_chain_ancestor_publication',sourceAnchorSha256:H(J(historical)),evidence:clone(ancestry)},attachmentAcceptedAt:'2026-10-09T01:18:00Z',verificationCompletedAt:'2026-10-09T01:19:00Z',deltaArtifactSha256:'a'.repeat(64),completeArtifactSha256:'b'.repeat(64),runtimeManifestRaw:markerRaw,publicationStateRaw:stateRaw});
  proof.privateEvidence.attachmentReceiptSha256='c'.repeat(64);
  proof.completeManifest.sourceRelease={...proof.completeManifest.sourceRelease,roundId:ledger.roundId,baseCommit:supportCommit,bankVersion:ledger.publication.bankVersion,bankSha256:ledger.publication.bankSha256,ledgerPath:'docs/rounds/round-036.json'};
  proof.completeManifest.files=[...sourceFiles].map(([path,b])=>({path,bytes:b.length,sha256:H(b)}));
  mutate({ledger,proof,bank:syntheticBank});
  const syntheticBankRaw=J(syntheticBank),syntheticMarker={...marker,sha256:H(syntheticBankRaw),releasedAt:syntheticBank.releasedAt};ledger.publication.bankSha256=H(syntheticBankRaw);proof.completeManifest.sourceRelease.bankSha256=H(syntheticBankRaw);proof.runtimeManifestRaw=J(syntheticMarker).toString();proof.completeManifest.sourceRelease.ledgerSha256=H(J(ledger));
  const raw=J(proof),pin={rootProofSha256:rootPin.sha256,roundId:ledger.roundId,path:newPath,sha256:H(raw),previousProofSha256:sameRoot.at(-1).sha256,registeredAt:'2026-10-09T01:20:00Z',eligibleAt:'2026-10-09T01:20:00Z'},trust={...clone(originalTrust),checkpoints:[...clone(pastPins),pin]};
  fs.writeFileSync(path.join(dir,newPath),raw);fs.writeFileSync(path.join(dir,trustPath),J(trust));return {ledger,proof,raw,pin,trust,bank:syntheticBank,bankRaw:syntheticBankRaw};
 }
 prepare();
 const api=await import(pathToFileURL(path.join(dir,'scripts/normal-chain-publication-event.mjs'))),normal=await import(pathToFileURL(path.join(dir,'scripts/normal-publication.mjs'))),authority=(await import(pathToFileURL(path.join(dir,trustPath)),{with:{type:'json'}})).default;
 function fresh(mutate){
  const f=prepare(mutate),{ledger:l,proof:p,pin}=f,activeMarkerRaw=p.runtimeManifestRaw,activeMarker=JSON.parse(activeMarkerRaw),fixtureBanks=new Map(publicBanks);fixtureBanks.set(l.publication.bankVersion,{raw:f.bankRaw});authority.checkpoints.splice(0,authority.checkpoints.length,...f.trust.checkpoints);
  const rawLedgers=new Map(ledgerSources);rawLedgers.set(l.roundId,J(l));const exactLedgers=[...rawLedgers.values()].map(b=>JSON.parse(b));
  const files=new Map(sourceFiles);files.set(newPath,f.raw);files.set(trustPath,J(f.trust));files.set('docs/rounds/round-036.json',J(l));files.set('data/manifest.json',Buffer.from(activeMarkerRaw));files.set('data/publication-state.json',Buffer.from(stateRaw));files.set(`data/releases/${l.publication.bankVersion}/bank.json`,f.bankRaw);
  const inventory=[...files].map(([path,b])=>({path,bytes:b.length,sha256:H(b),gitBlob:G(b)})),commit='6'.repeat(40),release=p.completeManifest.sourceRelease;
  const source={kind:'normal_delivered_checkpoint',roundId:l.roundId,ledgerPath:release.ledgerPath,originalLedgerSha256:release.ledgerSha256,bankVersion:release.bankVersion,bankSha256:release.bankSha256,accepted:l.counts.accepted,originalPublicationStatus:l.publication.status,quarantined:0,eligible:l.counts.accepted,newlyPublicRegular:l.counts.accepted,artifactSha256:p.deltaArtifactSha256,manifestSha256:H(J(p.deltaManifest)),deliveredAt:p.attachmentAcceptedAt,deliveryVerifiedAt:p.verificationCompletedAt,deliveryProof:{path:newPath,sha256:pin.sha256},attachmentReceiptSha256:p.privateEvidence.attachmentReceiptSha256};
  const regular=bank36.questions.filter(q=>!q.testOnly),oldIds=new Set(JSON.parse(publicBanks.get(public35.manifest.bankVersion).raw).questions.map(q=>q.questionId));
  const event={schemaVersion:1,syncId:'SYNTHETIC-early-036',kind:RECONCILED_NORMAL_CHAIN_PUBLICATION_KIND,previousSynchronizationSha256:H(J(public35)),verifiedAt:'2026-10-09T01:21:03Z',repository:public35.repository,commit,parent:supportCommit,tree:normalPublicationTree(inventory),commitUrl:`https://github.com/${public35.repository}/commit/${commit}`,pages:{runId:1,headSha:commit,status:'completed',conclusion:'success',url:`https://github.com/${public35.repository}/actions/runs/1`},siteUrl:public35.siteUrl,manifest:activeMarker,manifestSha256:H(Buffer.from(activeMarkerRaw)),runtimeManifestRaw:activeMarkerRaw,publicationStateRaw:stateRaw,counts:{regular:regular.length,written:regular.filter(q=>q.type==='written').length,practical:regular.filter(q=>q.type==='practical').length,testOnly:bank36.questions.length-regular.length,total:bank36.questions.length,newlyPublicFromAnchor:regular.filter(q=>!oldIds.has(q.questionId)).length},writtenBySubject:Object.fromEntries(['s1','s2','s3','s4','s5'].map(id=>[id,regular.filter(q=>q.type==='written'&&q.subjectId===id).length])),rounds:[source],remoteInventory:inventory,liveAssets:inventory.map(f=>({path:f.path,url:new URL(f.path,public35.siteUrl).href,http:200,bytes:f.bytes,sha256:f.sha256})),limitations:['SYNTHETIC branch regression only; no actual delivery, registration or publication'],reconciliation:{schemaVersion:1,kind:'registered_normal_chain_ancestor_publication',transitionProof:{path:newPath,sha256:pin.sha256},sourceWindows:[{roundId:l.roundId,startedAt:l.startedAt,decisionDeadline:l.decisionDeadline,closedAt:l.closedAt,predecessorEligibleAt:sameRoot.at(-1).eligibleAt}],parentObservation:{repository:public35.repository,ref:'refs/heads/main',commit:supportCommit,tree:supportTree,remoteInventory:supportRows,observedAt:'2026-10-09T01:21:00Z',commitObservedAt:'2026-10-09T01:21:00Z',treeObservedAt:'2026-10-09T01:21:00Z',manifestObservedAt:'2026-10-09T01:21:00Z',publicationStateObservedAt:'2026-10-09T01:21:00Z',headResponseSha256:'a'.repeat(64),commitResponseSha256:'b'.repeat(64),treeResponseSha256:'c'.repeat(64),manifestResponseSha256:'d'.repeat(64),publicationStateResponseSha256:'e'.repeat(64)},refUpdate:{repository:public35.repository,ref:'refs/heads/main',expectedSha:supportCommit,sha:commit,force:false,submittedAt:'2026-10-09T01:21:01Z',completedAt:'2026-10-09T01:21:02Z',requestSha256:'f'.repeat(64),responseSha256:'9'.repeat(64)}}};
  const chainPins=[...sameRoot,pin],proofs=[...pastProofs,p],chain={rootProofSha256:rootPin.sha256,sources:chainPins.map((pin,i)=>({roundId:pin.roundId,pin,proof:proofs[i],proofSha256:pin.sha256,offlineBase:{...proofs[i].completeManifest.sourceRelease}}))};
  const context={ledgers:exactLedgers,ledgerSources:rawLedgers,previousPublication:public35,treeFunction:normalPublicationTree};
  return {event,context,run:()=>api.validateReconciledNormalPublication(event,context),semantic:()=>normal.validateNormalPublication(event,{...context,banks:fixtureBanks,inventory:new Map(inventory.map(({gitBlob,...f})=>[f.path,f]))}),bankTransition:()=>normal.validateNormalBankTransition(event,l,f.bank,JSON.parse(fixtureBanks.get(l.baseline.bankVersion).raw),{eligibleCandidateIds:l.candidates.filter(c=>c.decision==='accepted').map(c=>c.candidateId)}),membership:()=>api.validateReconciledNormalChainMembership(event,{chain,positions:[4],synchronizations:allEvents.slice(0,allEvents.indexOf(public35)+1),ledgers:exactLedgers,ledgerSources:rawLedgers,treeFunction:normalPublicationTree})};
 }
 await t.test('valid actual036-shaped original window and predecessor; synthetic later transition',()=>{const f=fresh(),r=f.run();assert.deepEqual([...r.earlyRoundIds],['round-036']);assert.deepEqual(r.positions,[4]);assert.equal(f.event.counts.newlyPublicFromAnchor,6);assert.equal(publicLedger.startedAt,'2026-10-08T23:16:51.104699+00:00');assert.equal(publicLedger.closedAt,'2026-10-09T00:15:51.326Z');f.semantic();f.bankTransition();assert.equal(f.membership().canPublish,false);});
 await t.test('valid synthetic closure after ancestor publication within unchanged own deadline',()=>{const f=fresh(x=>{x.ledger.closedAt='2026-10-09T00:22:00Z';x.bank.releasedAt='2026-10-09T00:22:00.001Z';});assert.deepEqual([...f.run().earlyRoundIds],['round-036']);f.semantic();f.bankTransition();assert.equal(f.membership().canPublish,false);});
 for(const [name,mutate]of [
  ['closure after own original deadline',x=>x.ledger.closedAt='2026-10-09T02:00:00.001Z'],
  ['start before predecessor eligibility',x=>x.ledger.startedAt='2026-10-08T20:55:33.738Z'],
  ['wrong delivered predecessor',x=>x.ledger.baseline.offlinePredecessor.artifactSha256='f'.repeat(64)],
  ['rewritten historical baseline anchor',x=>x.ledger.baseline.sourceCommit=supportCommit],
  ['wrong transition anchor',x=>x.proof.publicAnchor.baseCommit='8'.repeat(40)]
 ])await t.test('rejects '+name,()=>assert.throws(fresh(mutate).run,/Reconciled normal publication/));
 await t.test('rejects unregistered transition proof',()=>{const f=fresh();f.event.reconciliation.transitionProof.sha256='f'.repeat(64);assert.throws(f.run,/Reconciled normal publication/);});
 await t.test('shared ancestry rejects forged support Pages even after fixture repinning',()=>assert.throws(fresh(x=>x.proof.anchorTransition.evidence.commits.at(-1).supportVerification.pages.conclusion='failure').membership,/Normal-chain ancestry: exact support Pages chronology/));
 await t.test('legacy normal-chain kind still rejects early source',()=>{const f=fresh();f.event.kind='verified_normal_chain_publication';delete f.event.reconciliation;assert.throws(f.semantic,/exact closed unpublished ledger sources/);});
});
