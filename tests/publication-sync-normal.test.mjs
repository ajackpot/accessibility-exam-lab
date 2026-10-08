import {retainHistoricalQuarantinePrefix} from './quarantine-fixtures.mjs';
/** Synthetic authorities exist only in disposable test copies; no real pin writes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {loadRoundContext,regularCoverage} from '../scripts/validate-round.mjs';
import {validatePublicationSynchronizations} from '../scripts/publication-sync.mjs';
import {normalPublicationTree,validateNormalBankTransition} from '../scripts/normal-publication.mjs';
import {gitBlobSha} from '../scripts/sha-only-tree.mjs';
const root=path.resolve(import.meta.dirname,'..'),J=o=>Buffer.from(JSON.stringify(o,null,2)+'\n'),H=b=>createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFile(path.join(root,p));
// Read fixture bytes cheaply; the positive case below still executes the full loader.
const loaded={ledgers:[],ledgerSources:new Map(),banks:new Map(),synchronizations:[],publicationState:JSON.parse(await read('data/publication-state.json'))};
for(const file of await fs.readdir(path.join(root,'docs/rounds')))if(/^round-\d+\.json$/.test(file)){const raw=await read('docs/rounds/'+file),l=JSON.parse(raw);loaded.ledgers.push(l);loaded.ledgerSources.set(l.roundId,raw);}
for(const v of await fs.readdir(path.join(root,'data/releases'))){const raw=await read('data/releases/'+v+'/bank.json');loaded.banks.set(v,{raw});}
for(const id of ['cumulative-006-008','cumulative-009-017','cumulative-018-027'])loaded.synchronizations.push(JSON.parse(await read('docs/publications/'+id+'.json')));
const legacyReceipts=JSON.parse(await read('docs/deliveries/offline-chain.json')).receipts;
loaded.resolvedArtifacts=new Set([...legacyReceipts.map(r=>r.artifactSha256),...loaded.synchronizations.flatMap(e=>e.rounds.filter(s=>s.deliveryProof?.path.startsWith('docs/deliveries/chains/')).map(s=>s.artifactSha256))]);
const events=loaded.synchronizations,prior=events.at(-1),sourceCode=(await read('scripts/publication-sync.mjs')).toString();
const at=Date.parse('2026-10-07T11:02:00Z');
function repin(event){return sourceCode.replace(/export const PUBLICATION_SYNCHRONIZATIONS = Object.freeze\(\[[\s\S]*?\n\]\);/,`export const PUBLICATION_SYNCHRONIZATIONS = Object.freeze([\n${[...events,event].map(e=>"  Object.freeze({path:'docs/publications/"+e.syncId+".json',sha256:'"+H(J(e))+"'})").join(',\n')}\n]);`);}

test('normal frozen-ledger publication has independent authority and never invents delivery resolution',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'normal-publication-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.cp(root,dir,{recursive:true});
 await retainHistoricalQuarantinePrefix(dir,at);
 const fixtureRead=p=>fs.readFile(path.join(dir,p)),future=(await fixtureRead('PUBLICATION-MANIFEST.txt')).toString().split(/\r?\n/).filter(p=>/^docs\/rounds\/round-0(?:2[89]|[3-9]\d)\./.test(p)||/^data\/releases\/[^/]+-regular\.(?:2[89]|[3-9]\d)\//.test(p));
 for(const p of future)await fs.rm(path.join(dir,p),{force:true});await fs.writeFile(path.join(dir,'PUBLICATION-MANIFEST.txt'),(await fixtureRead('PUBLICATION-MANIFEST.txt')).toString().split(/\r?\n/).filter(p=>!future.includes(p)).join('\n'));
 const bank=JSON.parse(loaded.banks.get(prior.manifest.bankVersion).raw);bank.bankVersion='synthetic-normal-publication';bank.releasedAt='2026-10-07T11:01:00Z';const bankRaw=J(bank),bankPath=`data/releases/${bank.bankVersion}/bank.json`;
 const ledger=structuredClone(loaded.ledgers.find(l=>l.roundId==='round-027'));
 Object.assign(ledger,{roundId:'round-028',startedAt:'2026-10-07T11:00:00Z',decisionDeadline:'2026-10-07T14:00:00Z',closedAt:'2026-10-07T11:01:00Z',candidates:[],validation:[]});
 ledger.baseline={sourceCommit:'2'.repeat(40),bankVersion:prior.manifest.bankVersion,bankSha256:prior.manifest.sha256,...regularCoverage(bank)};
 delete ledger.baseline.mockEligible;
 ledger.counts={...ledger.counts,registered:0,accepted:0,rejected:0,pending:0};ledger.coverageAfter=regularCoverage(bank);ledger.publication={...ledger.publication,bankVersion:bank.bankVersion,bankSha256:H(bankRaw)};
 const ledgerRaw=J(ledger),manifest={...prior.manifest,bankVersion:bank.bankVersion,releasedAt:bank.releasedAt,file:`releases/${bank.bankVersion}/bank.json`,sha256:H(bankRaw)},manifestRaw=J(manifest),stateRaw=await read('data/publication-state.json');
 const source={kind:'normal_frozen_ledger',roundId:ledger.roundId,ledgerPath:`docs/rounds/${ledger.roundId}.json`,originalLedgerSha256:H(ledgerRaw),bankVersion:bank.bankVersion,bankSha256:H(bankRaw),baseline:{sourceCommit:ledger.baseline.sourceCommit,bankVersion:ledger.baseline.bankVersion,bankSha256:ledger.baseline.bankSha256},accepted:0,originalPublicationStatus:'not_attempted',quarantined:0,eligible:0,newlyPublicRegular:0};
 const files=new Map();for(const p of (await fixtureRead('PUBLICATION-MANIFEST.txt')).toString().split(/\r?\n/).filter(p=>p&&!p.startsWith('#')))files.set(p,await fixtureRead(p));
 files.set(bankPath,bankRaw);files.set(source.ledgerPath,ledgerRaw);files.set('docs/rounds/round-028.md',Buffer.from('Synthetic fixture only\n'));files.set('data/manifest.json',manifestRaw);
 // Keep the synthetic payload allowlist exact, excluding its later support event.
 files.set('PUBLICATION-MANIFEST.txt',Buffer.from([...files.keys()].sort().join('\n')+'\n'));
 const inventory=[...files].map(([path,raw])=>({path,bytes:raw.length,sha256:H(raw),gitBlob:gitBlobSha(raw)}));
 const event={schemaVersion:1,syncId:'synthetic-normal-publication',kind:'verified_normal_publication',previousSynchronizationSha256:H(J(prior)),verifiedAt:new Date(at).toISOString(),repository:prior.repository,commit:'1'.repeat(40),parent:ledger.baseline.sourceCommit,tree:normalPublicationTree(inventory),commitUrl:`https://github.com/${prior.repository}/commit/${'1'.repeat(40)}`,pages:{runId:1,headSha:'1'.repeat(40),status:'completed',conclusion:'success',url:`https://github.com/${prior.repository}/actions/runs/1`},siteUrl:prior.siteUrl,manifest,manifestSha256:H(manifestRaw),runtimeManifestRaw:manifestRaw.toString(),publicationStateRaw:stateRaw.toString(),counts:{...prior.counts,newlyPublicFromAnchor:0},writtenBySubject:prior.writtenBySubject,rounds:[source],remoteInventory:inventory,liveAssets:inventory.map(f=>({path:f.path,url:new URL(f.path,prior.siteUrl).href,http:200,bytes:f.bytes,sha256:f.sha256})),limitations:['Synthetic test only']};
 const ledgers=[...loaded.ledgers.filter(l=>l.roundId<'round-028'),ledger],ledgerSources=new Map([...loaded.ledgerSources].filter(([id])=>id<'round-028'));ledgerSources.set(ledger.roundId,ledgerRaw);const banks=new Map(loaded.banks);banks.set(bank.bankVersion,{raw:bankRaw});
 const context={...loaded,ledgers,ledgerSources,banks,manifest,now:at};
 assert.equal(validatePublicationSynchronizations([...events,event],context).ok,false,'production trust rejects synthetic authority');
 for(const [p,raw]of files){await fs.mkdir(path.dirname(path.join(dir,p)),{recursive:true});await fs.writeFile(path.join(dir,p),raw);}
 const eventPath=`docs/publications/${event.syncId}.json`;await fs.writeFile(path.join(dir,eventPath),J(event));await fs.appendFile(path.join(dir,'PUBLICATION-MANIFEST.txt'),eventPath+'\n');await fs.writeFile(path.join(dir,'scripts/publication-sync.mjs'),repin(event));
 const api=await import(pathToFileURL(path.join(dir,'scripts/publication-sync.mjs')).href),validator=await import(pathToFileURL(path.join(dir,'scripts/validate-round.mjs')).href);
 for(const mutate of [b=>b.questions.pop(),b=>b.questions[0].stem+=' changed',b=>b.options[0].explanation+=' changed',b=>b.sources[0].title+=' changed',b=>b.releasedAt='2026-10-07T10:59:00Z',b=>b.releasedAt='2026-10-07T11:03:00Z',b=>b.bankVersion=prior.manifest.bankVersion]){const altered=structuredClone(bank);mutate(altered);assert.throws(()=>validateNormalBankTransition(event,ledger,altered,JSON.parse(loaded.banks.get(prior.manifest.bankVersion).raw),{eligibleCandidateIds:[]}));}
 for(const [registry,key]of [['docs/quarantines/trust.json','audits'],['docs/release-blocks/trust.json','events']]){const trust=JSON.parse(await read(registry)),e=JSON.parse(await read(trust[key][0].path)),b=structuredClone(bank);b.questions[0].questionId=e.targets[0].questionId;assert.throws(()=>validateNormalBankTransition(event,ledger,b,JSON.parse(loaded.banks.get(prior.manifest.bankVersion).raw),{eligibleCandidateIds:[]}));}
 const extra=structuredClone(bank),q=structuredClone(extra.questions.find(q=>!q.testOnly));q.questionId='synthetic-unregistered-question';q.templateId='synthetic-unregistered-template';extra.questions.push(q);assert.throws(()=>validateNormalBankTransition(event,ledger,extra,JSON.parse(loaded.banks.get(prior.manifest.bankVersion).raw),{eligibleCandidateIds:[]}));
 const result=api.validatePublicationSynchronizations([...events,event],context);assert.equal(result.ok,true,result.errors.join('\n'));assert.equal(result.history.at(-1).publication.bankVersion,bank.bankVersion);
 const c=await validator.loadRoundContext(dir,null,{release:true,now:at});assert.equal(validator.validateReleaseLedger(c.ledgers,{...c,now:at}).ok,true);
 assert.equal([...c.offlineBases.values()].some(b=>b.roundId===ledger.roundId||b.bankVersion===bank.bankVersion),false);assert.equal(c.deliveryCheckpointSources.has(ledger.roundId),false);assert.deepEqual([...c.resolvedArtifacts].sort(),[...loaded.resolvedArtifacts].sort());
 assert.equal(api.resolveSynchronizedArtifacts([{}],{...context,synchronizations:[...events,event]}).resolvedArtifacts.size,0);
 assert.equal(api.validatePublicationSynchronizations([...events,event],{...context,now:at-1}).history.some(h=>h.syncId===event.syncId),false);
 assert.throws(()=>api.validateSynchronizationDeliveryProof(event,source,ledgerRaw),/delivery proof/);
 assert.deepEqual(ledgerRaw,J(c.ledgers.find(l=>l.roundId===ledger.roundId)));
 // A normal payload is not silently reclassified as a historical delivered ZIP.
 const archive=await fs.mkdtemp(path.join(os.tmpdir(),'normal-payload-audit-'));t.after(()=>fs.rm(archive,{recursive:true,force:true}));for(const [p,raw]of files){await fs.mkdir(path.dirname(path.join(archive,p)),{recursive:true});await fs.writeFile(path.join(archive,p),raw);}
 await assert.rejects(validator.auditHistoricalRelease(archive),/exact independently pinned/);
 let n=0;
 for(const [name,mutate]of [
  ['missing trust',e=>{e.remoteInventory=e.remoteInventory.filter(f=>f.path!=='docs/quarantines/trust.json');e.liveAssets=e.liveAssets.filter(f=>f.path!=='docs/quarantines/trust.json');e.tree=normalPublicationTree(e.remoteInventory);}],['deleted previous event',e=>{const p=`docs/publications/${prior.syncId}.json`;e.remoteInventory=e.remoteInventory.filter(f=>f.path!==p);e.liveAssets=e.liveAssets.filter(f=>f.path!==p);e.tree=normalPublicationTree(e.remoteInventory);}],
  ['unknown kind',e=>e.kind='other'],['missing kind',e=>delete e.kind],['delivery masquerade',e=>e.kind='verified_cumulative_publication'],['zero commit',e=>{e.commit='0'.repeat(40);e.commitUrl=`https://github.com/${e.repository}/commit/${e.commit}`;e.pages.headSha=e.commit;}],['mismatched Git blob',e=>{e.remoteInventory.find(f=>f.path===bankPath).gitBlob='a'.repeat(40);e.tree=normalPublicationTree(e.remoteInventory);}],
  ['wrong parent',e=>e.parent='a'.repeat(40)],['wrong tree',e=>e.tree='a'.repeat(40)],['wrong Pages head',e=>e.pages.headSha='a'.repeat(40)],['failed Pages',e=>e.pages.conclusion='failure'],
  ['missing live bank',e=>e.liveAssets=e.liveAssets.filter(f=>f.path!==bankPath)],['altered live bytes',e=>e.liveAssets[0].bytes++],['duplicate live',e=>e.liveAssets.push(e.liveAssets[0])],['missing inventory',e=>e.remoteInventory.pop()],['duplicate inventory',e=>e.remoteInventory.push(e.remoteInventory[0])],
  ['fabricated delivery',e=>e.rounds[0].deliveryProof={path:'fake',sha256:'a'.repeat(64)}],['bad baseline',e=>e.rounds[0].baseline.bankSha256='a'.repeat(64)],['wrong ledger',e=>e.rounds[0].originalLedgerSha256='a'.repeat(64)],['wrong accepted',e=>e.rounds[0].accepted++],['wrong additions',e=>e.rounds[0].newlyPublicRegular++],['wrong total',e=>e.counts.regular++],['blocked source',e=>e.rounds[0].roundId='round-023'],['frozen payload',e=>e.publicationStateRaw='{"finalized":true}'],['future cutoff',e=>e.verifiedAt='2026-10-17T00:00:00Z'],['private extra',e=>e.extra='no'],
 ]){const e=structuredClone(event);mutate(e);const p=path.join(dir,`scripts/normal-fixture-${++n}.mjs`);await fs.writeFile(p,repin(e));const a=await import(pathToFileURL(p).href);const r=a.validatePublicationSynchronizations([...events,e],context);assert.equal(r.ok,false,name);}
 await fs.appendFile(path.join(dir,eventPath),' ');await assert.rejects(validator.loadRoundContext(dir,null,{release:true,now:at}),/proof hash/);
});
