/** Real immutable delivery inputs; synthetic publication authority stays disposable. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {normalPublicationTree,validateNormalBankTransition} from '../scripts/normal-publication.mjs';
import {PUBLICATION_SYNCHRONIZATIONS,validateSynchronizationDeliveryProof} from '../scripts/publication-sync.mjs';
const root=path.resolve(import.meta.dirname,'..'),J=o=>Buffer.from(JSON.stringify(o,null,2)+'\n'),H=b=>createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFile(path.join(root,p)),G=b=>createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`),b])).digest('hex');

test('normal-chain publication binds exact delivered lineage without inventing receipts or changing stopped history',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'normal-chain-publication-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.cp(root,dir,{recursive:true});
 const roots=JSON.parse(await read('docs/deliveries/normal-backup-root-trust.json')),chain=JSON.parse(await read('docs/deliveries/normal-backup-chain-trust.json'));
 const rootPin=roots.roots.at(-1),pins=[rootPin,...chain.checkpoints.filter(p=>p.rootProofSha256===rootPin.sha256)],proofs=await Promise.all(pins.map(async p=>JSON.parse(await read(p.path)))),tip=proofs.at(-1),tipRound=tip.roundId;
 const allEvents=await Promise.all(PUBLICATION_SYNCHRONIZATIONS.map(async p=>JSON.parse(await read(p.path)))),anchorManifest=JSON.parse(proofs[0].sourceAnchor.manifestRaw),priorIndex=allEvents.findLastIndex(e=>e.manifest.bankVersion===anchorManifest.bankVersion&&e.manifest.sha256===anchorManifest.sha256);assert.ok(priorIndex>=0,'exact root public bank must have verified prior event');
 const events=allEvents.slice(0,priorIndex+1),previous=events.at(-1),sourceCode=(await read('scripts/publication-sync.mjs')).toString();
 const files=new Map();for(const p of (await read('PUBLICATION-MANIFEST.txt')).toString().split(/\r?\n/).filter(p=>p&&!p.startsWith('#')))files.set(p,await read(p));
 const removed=[];
 for(const [p,raw]of files)if(/^docs\/rounds\/round-\d+\.json$/.test(p)&&JSON.parse(raw).roundId>tipRound){const l=JSON.parse(raw);removed.push(p,p.replace(/json$/,'md'),`data/releases/${l.publication.bankVersion}/bank.json`);}
 for(const p of removed){files.delete(p);await fs.rm(path.join(dir,p),{force:true});}
 files.set('data/manifest.json',Buffer.from(tip.runtimeManifestRaw));files.set('data/publication-state.json',Buffer.from(tip.publicationStateRaw));files.set('PUBLICATION-MANIFEST.txt',Buffer.from([...files.keys()].sort().join('\n')+'\n'));
 const rounds=proofs.map((p,i)=>{const s=p.completeManifest.sourceRelease,l=JSON.parse(files.get(s.ledgerPath));return {kind:'normal_delivered_checkpoint',roundId:s.roundId,ledgerPath:s.ledgerPath,originalLedgerSha256:s.ledgerSha256,bankVersion:s.bankVersion,bankSha256:s.bankSha256,accepted:l.counts.accepted,originalPublicationStatus:l.publication.status,quarantined:0,eligible:l.counts.accepted,newlyPublicRegular:l.counts.accepted,artifactSha256:p.deltaArtifactSha256,manifestSha256:H(J(p.deltaManifest)),deliveredAt:p.attachmentAcceptedAt,deliveryVerifiedAt:p.verificationCompletedAt,deliveryProof:{path:pins[i].path,sha256:pins[i].sha256},attachmentReceiptSha256:p.privateEvidence.attachmentReceiptSha256};});
 const inventory=[...files].map(([path,raw])=>({path,bytes:raw.length,sha256:H(raw),gitBlob:G(raw)})),manifest=JSON.parse(tip.runtimeManifestRaw),bank=JSON.parse(files.get(`data/${manifest.file}`)),regular=bank.questions.filter(q=>!q.testOnly),now=Date.now();
 const event={schemaVersion:1,syncId:'synthetic-normal-chain-publication',kind:'verified_normal_chain_publication',previousSynchronizationSha256:H(J(previous)),verifiedAt:new Date(now).toISOString(),repository:previous.repository,commit:'1'.repeat(40),parent:(tip.publicAnchor??tip.continuationAnchor).baseCommit,tree:normalPublicationTree(inventory),commitUrl:`https://github.com/${previous.repository}/commit/${'1'.repeat(40)}`,pages:{runId:1,headSha:'1'.repeat(40),status:'completed',conclusion:'success',url:`https://github.com/${previous.repository}/actions/runs/1`},siteUrl:previous.siteUrl,manifest,manifestSha256:H(files.get('data/manifest.json')),runtimeManifestRaw:tip.runtimeManifestRaw,publicationStateRaw:tip.publicationStateRaw,counts:{regular:regular.length,written:regular.filter(q=>q.type==='written').length,practical:regular.filter(q=>q.type==='practical').length,testOnly:bank.questions.length-regular.length,total:bank.questions.length,newlyPublicFromAnchor:regular.length-previous.counts.regular},writtenBySubject:Object.fromEntries(['s1','s2','s3','s4','s5'].map(s=>[s,regular.filter(q=>q.subjectId===s&&q.type==='written').length])),rounds,remoteInventory:inventory,liveAssets:inventory.map(f=>({path:f.path,url:new URL(f.path,previous.siteUrl).href,http:200,bytes:f.bytes,sha256:f.sha256})),limitations:['Synthetic fixture only; no external observations or publication authority']};
 function repin(e){return sourceCode.replace(/export const PUBLICATION_SYNCHRONIZATIONS = Object.freeze\(\[[\s\S]*?\n\]\);/,`export const PUBLICATION_SYNCHRONIZATIONS = Object.freeze([\n${[...events,e].map(v=>"  Object.freeze({path:'docs/publications/"+v.syncId+".json',sha256:'"+H(J(v))+"'})").join(',\n')}\n]);`);}
 assert.throws(()=>validateSynchronizationDeliveryProof(event,rounds[0],J(proofs[0])),/unreviewed/);
 for(const [p,raw]of files){await fs.mkdir(path.dirname(path.join(dir,p)),{recursive:true});await fs.writeFile(path.join(dir,p),raw);}
 const eventPath=`docs/publications/${event.syncId}.json`;await fs.writeFile(path.join(dir,eventPath),J(event));await fs.appendFile(path.join(dir,'PUBLICATION-MANIFEST.txt'),eventPath+'\n');await fs.writeFile(path.join(dir,'scripts/publication-sync.mjs'),repin(event));
 const api=await import(pathToFileURL(path.join(dir,'scripts/publication-sync.mjs')).href),validator=await import(pathToFileURL(path.join(dir,'scripts/validate-round.mjs')).href),c=await validator.loadRoundContext(dir,null,{release:true,now});
 const result=api.validatePublicationSynchronizations([...events,event],{...c,now});assert.equal(result.ok,true,result.errors.join('\n'));assert.equal(result.history.at(-1).publication.bankVersion,manifest.bankVersion);
 assert.equal(api.validatePublicationSynchronizations([...events,event],{...c,now:now-1}).history.some(h=>h.syncId===event.syncId),false);
 assert.equal(validator.validateReleaseLedger(c.ledgers,{...c,now}).ok,true);
 for(const s of rounds){assert.equal(H(c.ledgerSources.get(s.roundId)),s.originalLedgerSha256);assert.equal(c.ledgers.find(l=>l.roundId===s.roundId).publication.status,'not_attempted');assert.equal(c.resolvedArtifacts.has(s.artifactSha256),false);}
 for(const [i,p]of proofs.entries()){assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir,pins[i].path))),p);assert.equal(p.canPublish,false);assert.equal(p.newlyPublishedRegular,0);}
 assert.equal(proofs[0].stoppedPublisher.writesPermanentlyStopped,true);assert.equal(proofs[0].stoppedPublisher.outcome,'unknown');
 await assert.rejects(api.validateNormalChainSynchronizationSources([...events,event],new Map(c.normalBackupChains),c.deliveryCheckpointSources,{ledgers:c.ledgers,now,release:true}),/untouched fully validated/);
 const immutableBank=structuredClone(bank);immutableBank.questions[0].stem+=' changed';const finalLedger=c.ledgers.find(l=>l.roundId===tipRound);assert.throws(()=>validateNormalBankTransition(event,finalLedger,immutableBank,JSON.parse(c.banks.get(finalLedger.baseline.bankVersion).raw),c.quarantineDispositions.get(tipRound)),/preserve/);
 const cases=[
  ['extra nested proof fields',e=>e.rounds[0].deliveryProof.receiptSha256='f'.repeat(64)],
  ['missing anchor analysis',e=>{const path=(tip.publicAnchor??tip.continuationAnchor).remoteInventory.find(f=>f.path.startsWith('docs/analysis/')).path;e.remoteInventory=e.remoteInventory.filter(f=>f.path!==path);e.tree=normalPublicationTree(e.remoteInventory);}],
  ['changed anchor analysis',e=>{e.remoteInventory.find(f=>f.path.startsWith('docs/analysis/')).sha256='f'.repeat(64);e.tree=normalPublicationTree(e.remoteInventory);}],
  ['receipt hash substitution',e=>e.rounds[0].attachmentReceiptSha256='f'.repeat(64)],
  ['old receipt fabrication',e=>{e.rounds[0].receiptSha256=e.rounds[0].attachmentReceiptSha256;delete e.rounds[0].attachmentReceiptSha256;}],
  ['wrong proof registration',e=>e.rounds[0].deliveryProof.path=e.rounds.at(-1).deliveryProof.path],
  ['reordered lineage',e=>e.rounds.reverse()],
  ['missing predecessor',e=>e.rounds.shift()],
  ['wrong public parent',e=>e.parent='a'.repeat(40)],
  ['missing own trust prefix',e=>{e.remoteInventory=e.remoteInventory.filter(f=>f.path!=='docs/deliveries/normal-backup-chain-trust.json');e.tree=normalPublicationTree(e.remoteInventory);} ],
  ['changed historical proof inventory',e=>e.remoteInventory.find(f=>f.path===pins[0].path).sha256='a'.repeat(64)],
  ['wrong eligible/new totals',e=>e.rounds.at(-1).newlyPublicRegular++],
  ['wrong Pages head',e=>e.pages.headSha='a'.repeat(40)],
  ['missing live proof',e=>e.liveAssets=e.liveAssets.filter(f=>f.path!==pins[0].path)],
  ['frozen delivered marker',e=>e.publicationStateRaw='{"finalized":true}\n'],
  ['reclassified root as independent',e=>e.kind='verified_cumulative_publication']
 ];
 let n=0;for(const [name,mutate]of cases){const e=structuredClone(event);mutate(e);const f=path.join(dir,`scripts/normal-chain-fixture-${++n}.mjs`);await fs.writeFile(f,repin(e));const a=await import(pathToFileURL(f).href);if(name.includes('anchor analysis'))await assert.rejects(a.validateNormalChainSynchronizationSources([...events,e],c.normalBackupChains,c.deliveryCheckpointSources,{ledgers:c.ledgers,now,release:true}),/retain every public anchor path/);if(name==='extra nested proof fields')assert.throws(()=>a.validateSynchronizationDeliveryProof(e,e.rounds[0],c.deliveryCheckpointSources.get(e.rounds[0].roundId)),/exact reviewed delivered proof/);if(name==='reclassified root as independent')assert.equal(a.validatePublicationSynchronizations([...events,e],{...c,now}).ok,false,'aggregate entrypoint must reject normal-chain source masquerade');let failure=null;try{for(const s of e.rounds)a.validateSynchronizationDeliveryProof(e,s,c.deliveryCheckpointSources.get(s.roundId));await a.validateNormalChainSynchronizationSources([...events,e],c.normalBackupChains,c.deliveryCheckpointSources,{ledgers:c.ledgers,now,release:true});const r=a.validatePublicationSynchronizations([...events,e],{...c,now});if(!r.ok)failure=r.errors.join('; ');}catch(error){failure=error.message;}assert.ok(failure,name);}
});
