/** Disposable synthetic publication authorities only. No network or production pin writes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {loadRoundContext,validateReleaseLedger} from '../scripts/validate-round.mjs';
import {validateQuarantineCampaign} from '../scripts/prepublication-quarantine.mjs';
import {FREEZE_AT} from '../src/domain.js';
const root=path.resolve(import.meta.dirname,'..'),J=o=>Buffer.from(JSON.stringify(o,null,2)+'\n'),H=b=>createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFile(path.join(root,p)),loaded=await loadRoundContext(root,null,{release:true});
const trust=JSON.parse(await read('docs/deliveries/offline-chain-trust.json')),syncSource=(await read('scripts/publication-sync.mjs')).toString();
const originalEvents=loaded.synchronizations.filter(e=>!e.rounds.some(s=>Object.hasOwn(s,'eligible')));
const dispositions=validateQuarantineCampaign(loaded.ledgers,loaded).dispositions;
const sourceProofs=new Map();
const rounds=await Promise.all(trust.checkpoints.map(async pin=>{
 const raw=await read(pin.path),p=JSON.parse(raw),s=p.completeManifest.sourceRelease,l=loaded.ledgers.find(l=>l.roundId===s.roundId),d=dispositions.get(s.roundId);sourceProofs.set(s.roundId,raw);
 return {roundId:s.roundId,ledgerPath:s.ledgerPath,originalLedgerSha256:s.ledgerSha256,bankVersion:s.bankVersion,bankSha256:s.bankSha256,accepted:d.counts.accepted,originalPublicationStatus:l.publication.status,artifactSha256:p.deltaArtifactSha256,manifestSha256:H(J(p.deltaManifest)),deliveredAt:p.attachmentAcceptedAt,deliveryVerifiedAt:p.verifiedAt,deliveryProof:{path:pin.path,sha256:pin.sha256},receiptSha256:H(J(p.receipt)),quarantined:d.counts.quarantined,eligible:d.counts.eligible,newlyPublicRegular:d.counts.eligible};
}));
const finalProof=JSON.parse(sourceProofs.get(rounds.at(-1).roundId)),manifest=JSON.parse(finalProof.runtimeManifestRaw),bank=JSON.parse(loaded.banks.get(manifest.bankVersion).raw),regular=bank.questions.filter(q=>!q.testOnly);
const synthetic={...structuredClone(originalEvents.at(-1)),syncId:'synthetic-independent-publication',previousSynchronizationSha256:H(J(originalEvents.at(-1))),verifiedAt:new Date(Date.now()-1).toISOString(),commit:'1'.repeat(40),parent:'2'.repeat(40),tree:'3'.repeat(40),commitUrl:'https://example.invalid/synthetic',pages:{runId:1,headSha:'1'.repeat(40),status:'completed',conclusion:'success',url:'https://example.invalid/synthetic'},manifest,manifestSha256:H(Buffer.from(finalProof.runtimeManifestRaw)),counts:{regular:regular.length,written:regular.filter(q=>q.type==='written').length,practical:regular.filter(q=>q.type==='practical').length,testOnly:bank.questions.length-regular.length,total:bank.questions.length,newlyPublicFromAnchor:regular.length-684},writtenBySubject:Object.fromEntries(['s1','s2','s3','s4','s5'].map(s=>[s,regular.filter(q=>q.type==='written'&&q.subjectId===s).length])),rounds,remoteInventory:await Promise.all((await read('PUBLICATION-MANIFEST.txt')).toString().split(/\r?\n/).filter(p=>p&&!p.startsWith('#')).map(async p=>{const raw=await read(p);return {path:p,bytes:raw.length,sha256:H(raw)};})),liveAssets:[],limitations:['Synthetic test only, never external publication evidence']};
// This event publishes the delivered ancestor; the current tree may already have a later descendant.
Object.assign(synthetic.remoteInventory.find(f=>f.path==='data/manifest.json'),{bytes:Buffer.byteLength(finalProof.runtimeManifestRaw),sha256:H(Buffer.from(finalProof.runtimeManifestRaw))});
const lists=e=>[...originalEvents,e];
function repin(source,event){return source.replace(/export const PUBLICATION_SYNCHRONIZATIONS = Object.freeze\(\[[\s\S]*?\n\]\);/,`export const PUBLICATION_SYNCHRONIZATIONS = Object.freeze([\n${[...originalEvents,event].map(e=>"  Object.freeze({path:'docs/publications/"+e.syncId+".json',sha256:'"+H(J(e))+"'})").join(',\n')}\n]);`);}
const fail=r=>assert.equal(r.ok,false,r.errors?.join('\n'));

test('independent publication binds original31/19/12 disposition and all delivered receipts without changing clocks',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sync-independent-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.cp(root,dir,{recursive:true});
 const eventPath='docs/publications/synthetic-independent-publication.json';await fs.writeFile(path.join(dir,eventPath),J(synthetic));await fs.appendFile(path.join(dir,'PUBLICATION-MANIFEST.txt'),eventPath+'\n');await fs.writeFile(path.join(dir,'scripts/publication-sync.mjs'),repin(syncSource,synthetic));
 const api=await import(pathToFileURL(path.join(dir,'scripts/publication-sync.mjs')).href),v=await import(pathToFileURL(path.join(dir,'scripts/validate-round.mjs')).href);
 const before=[...loaded.ledgerSources].map(([k,b])=>[k,H(b)]),c=await v.loadRoundContext(dir,null,{release:true});
 assert.equal(v.validateReleaseLedger(c.ledgers,{...c,now:Date.now()}).ok,true);
 const s22=synthetic.rounds.find(s=>s.roundId==='round-022');assert.deepEqual([s22.accepted,s22.quarantined,s22.eligible,s22.newlyPublicRegular],[31,19,12,12]);
 assert.equal(JSON.parse(sourceProofs.get('round-022')).receipt.content.acceptedGoalIds.length,31);
 const chain=[...c.independentOfflineChains.values()][0];for(const r of chain.receipts)assert(c.resolvedArtifacts.has(r.artifactSha256));
 const delivery=await import(pathToFileURL(path.join(dir,'scripts/download-fallback.mjs')).href);
 const resolved=await delivery.validateSynchronizedDeliveryChain(chain.receipts,{manifests:chain.manifests,ledgers:c.ledgerSources,banks:new Map([...c.banks].map(([v,e])=>[v,e.raw])),now:Date.now(),publicationState:c.publicationState,synchronizations:c.synchronizations,campaignContext:c});
 assert.equal(resolved.ok,true,resolved.errors.join('\n'));assert.equal(resolved.reservedLearningGoalIds.length,19);assert.equal(resolved.canStartNewContent,true);
 assert.deepEqual([...c.resolvedArtifacts].sort(),[...new Set([...loaded.resolvedArtifacts,...chain.receipts.map(r=>r.artifactSha256)])].sort());assert.equal(chain.checked.canPublish,false);assert.equal(chain.proof.uncertainty.wait.firstUnresolvedAt,'2026-10-05T16:53:14Z');
 assert.deepEqual([...c.ledgerSources].map(([k,b])=>[k,H(b)]),before);assert.equal(c.manifest.bankVersion,loaded.manifest.bankVersion,'publishing an ancestor must not roll back a delivered descendant');
 for(const s of synthetic.rounds){api.validateSynchronizationDeliveryProof(synthetic,s,sourceProofs.get(s.roundId));assert.throws(()=>api.validateSynchronizationDeliveryProof(synthetic,s,Buffer.concat([sourceProofs.get(s.roundId),Buffer.from(' ')])),/tampered/);}
 const source26=synthetic.rounds.at(-1);const forged=structuredClone(chain.receipts);forged.at(-1).recordedAt='2026-10-01T00:00:00Z';fail(api.resolveSynchronizedArtifacts(forged,{...c,synchronizations:lists(synthetic),now:Date.now()}));
 const at=Date.parse(synthetic.verifiedAt);for(const [now,active]of [[at-1,false],[at,true],[at+1,true]]){const result=api.validatePublicationSynchronizations(lists(synthetic),{...c,now});assert.equal(result.ok,true,result.errors.join('\n'));assert.equal(result.history.some(h=>h.syncId===synthetic.syncId),active);}
 await assert.rejects(api.validateIndependentSynchronizationSources(lists(synthetic),new Map(c.independentOfflineChains),c.deliveryCheckpointSources),/fully validated/);
 const originalReceipt=chain.receipts[0];chain.receipts[0]={...originalReceipt,status:'prepared'};
 await assert.rejects(api.validateIndependentSynchronizationSources(lists(synthetic),c.independentOfflineChains,c.deliveryCheckpointSources),/fully validated/);chain.receipts[0]=originalReceipt;

 const missing=new Map(c.deliveryCheckpointSources);missing.delete(source26.roundId);await assert.rejects(api.validateIndependentSynchronizationSources(lists(synthetic),c.independentOfflineChains,missing),/tampered/);
 const frozen=api.validatePublicationSynchronizations(lists(synthetic),{...c,now:Date.now(),publicationState:{finalized:true,finalizedAt:new Date(at-1).toISOString()}});fail(frozen);
 await assert.rejects(v.loadRoundContext(dir,null,{release:true,now:FREEZE_AT}),/freeze|cutoff/);
 for(const mutate of [p=>p.receipt.status='prepared',p=>p.completeArtifactSha256='0'.repeat(64),p=>p.completeManifest.sourceRelease.roundId='round-023',p=>p.extra={receiptSchemaVersion:1,roundId:'round-023'}]){const s=synthetic.rounds[0],p=JSON.parse(sourceProofs.get(s.roundId));mutate(p);assert.throws(()=>api.validateSynchronizationDeliveryProof(synthetic,s,J(p)));}
 // Every actual archive replay is optional input to this test-only authority;
 // fixture bytes never become a real publication event or new delivery proof.
 if(process.env.PUBLICATION_ARCHIVE_FIXTURES){
  const archives=JSON.parse(await fs.readFile(process.env.PUBLICATION_ARCHIVE_FIXTURES));const a=await import(pathToFileURL(path.join(dir,'scripts/release-backup-continuation.mjs')).href);
  for(const fixture of archives){const source=[...originalEvents.flatMap(e=>e.rounds),...synthetic.rounds].find(s=>s.roundId===fixture.roundId),proofRaw=sourceProofs.get(fixture.roundId)??await read(source.deliveryProof.path);const raw=await fs.readFile(fixture.completeZip),p=JSON.parse(proofRaw),entries=a.readDeliveredArchive(raw,p.completeArtifactSha256),m=JSON.parse(entries.get('manifest.json'));a.validateDeliveredArchiveEntries(entries,m,'project/');const original=await fs.mkdtemp(path.join(os.tmpdir(),'sync-exact-archive-'));t.after(()=>fs.rm(original,{recursive:true,force:true}));for(const f of m.files){const target=path.join(original,f.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,entries.get('project/'+f.path));}
   const result=await v.auditHistoricalRelease(original);assert.equal(result.ok,true,result.errors.join('\n'));assert.equal(result.currentReleaseClearance,false);assert.equal(result.canStartNewContent,false);assert.equal(result.roundId,fixture.roundId);assert(!entries.has('project/'+source.deliveryProof.path));
   const marker=path.join(original,'README.md'),bytes=await fs.readFile(marker);await fs.appendFile(marker,' ');await assert.rejects(v.auditHistoricalRelease(original),/exact independently pinned/);await fs.writeFile(marker,bytes);await fs.writeFile(path.join(original,'extra.txt'),'extra');await assert.rejects(v.auditHistoricalRelease(original),/extra, missing or unlisted/);await fs.unlink(path.join(original,'extra.txt'));
  }
 }
 // Repinned invalid event fields exercise semantic guards beyond the outer SHA.
 let serial=0;
 for(const [name,change,check]of [
  ['accepted12',e=>e.rounds.find(s=>s.roundId==='round-022').accepted=12,'counts'],
  ['eligible31',e=>e.rounds.find(s=>s.roundId==='round-022').eligible=31,'counts'],
  ['held newly public',e=>e.rounds.find(s=>s.roundId==='round-022').newlyPublicRegular=31,'counts'],
  ['inflated total',e=>e.counts.regular++,'counts'],
  ['subject total',e=>e.writtenBySubject.s1++,'counts'],
  ['omitted predecessor',e=>e.rounds.splice(1,1),'counts'],
  ['omitted all sources',e=>{e.rounds=[];e.counts.newlyPublicFromAnchor=9999;},'counts'],
  ['omitted first source',e=>{e.rounds.shift();e.counts.newlyPublicFromAnchor-=26;},'counts'],
  ['missing all count fields',e=>{for(const s of e.rounds){delete s.eligible;delete s.quarantined;delete s.newlyPublicRegular;}e.counts.newlyPublicFromAnchor=9999;},'counts'],
  ['duplicate source',e=>e.rounds.push(e.rounds[0]),'counts'],
  ['blocked023',e=>e.rounds[0].roundId='round-023','counts'],
  ['nested blocked023',e=>e.nested={receipt:{receiptSchemaVersion:1,roundId:'round-023'}},'counts'],
  ['invented023 report',e=>e.remoteInventory.push({path:'docs/rounds/round-023.md',bytes:0,sha256:H(Buffer.alloc(0))}),'proof'],
  ['restored023 bank',e=>{const l=loaded.ledgers.find(l=>l.roundId==='round-023');e.remoteInventory.push({path:`data/releases/${l.publication.bankVersion}/bank.json`,bytes:1,sha256:l.publication.bankSha256});},'proof'],
  ['extra source field',e=>e.rounds[0].extra='unknown','proof'],
  ['wrong receipt',e=>e.rounds[0].receiptSha256='0'.repeat(64),'proof'],
  ['receipt omitted',e=>delete e.rounds[0].receiptSha256,'proof'],
  ['wrong checkpoint path',e=>e.rounds[0].deliveryProof.path=e.rounds[1].deliveryProof.path,'proof'],
  ['unsafe checkpoint path',e=>e.rounds[0].deliveryProof.path='../outside','proof'],
  ['wrong dependency',e=>e.remoteInventory.find(f=>f.path===e.rounds[0].ledgerPath).sha256='0'.repeat(64),'proof'],
  ['omitted block evidence',e=>e.remoteInventory=e.remoteInventory.filter(f=>!f.path.startsWith('docs/release-blocks/')),'lastProof'],
  ['omitted quarantine evidence',e=>e.remoteInventory=e.remoteInventory.filter(f=>!f.path.startsWith('docs/quarantines/')),'lastProof'],
  ['duplicate inventory',e=>e.remoteInventory.push(e.remoteInventory[0]),'proof'],
  ['extra inventory field',e=>e.remoteInventory[0].secret='unknown','proof'],
 ]){const event=structuredClone(synthetic);change(event);const file=path.join(dir,`scripts/synthetic-publication-${++serial}.mjs`);await fs.writeFile(file,repin(syncSource,event));const m=await import(pathToFileURL(file).href);if(check==='counts')fail(m.validatePublicationSynchronizations(lists(event),{...c,now:Date.now()}));else{const s=check==='lastProof'?event.rounds.at(-1):event.rounds[0];assert.throws(()=>m.validateSynchronizationDeliveryProof(event,s,sourceProofs.get(s.roundId)),undefined,name);}}
});
