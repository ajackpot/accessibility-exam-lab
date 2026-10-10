import {encodeSevenZip,decodeSevenZip,archiveSignature} from '../scripts/archive-format.mjs';
import {retainHistoricalQuarantinePrefix,pruneHistoricalFixtureHistory} from './quarantine-fixtures.mjs';
/** Synthetic archives/receipts only. No network, external attachment or publication. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {parsePublicAllowlist,zipStored} from '../scripts/download-fallback.mjs';
import {readDeliveredArchive} from '../scripts/release-backup-continuation.mjs';
import {FREEZE_AT} from '../src/domain.js';
const root=path.resolve(import.meta.dirname,'..'),H=b=>createHash('sha256').update(b).digest('hex'),J=o=>Buffer.from(JSON.stringify(o,null,2)+'\n'),trust='docs/deliveries/offline-chain-trust.json';
const read=(d,p)=>fs.readFile(path.join(d,p)),api=(d,n)=>import(pathToFileURL(path.join(d,`scripts/${n}.mjs`)).href);
async function write(d,p,b){await fs.mkdir(path.dirname(path.join(d,p)),{recursive:true});await fs.writeFile(path.join(d,p),b);}
async function allow(d,add=[],remove=[]){const list=parsePublicAllowlist((await read(d,'PUBLICATION-MANIFEST.txt')).toString());await write(d,'PUBLICATION-MANIFEST.txt',[...new Set([...list.filter(p=>!remove.includes(p)),...add])].join('\n')+'\n');}
async function inv(d){return Promise.all(parsePublicAllowlist((await read(d,'PUBLICATION-MANIFEST.txt')).toString()).map(async p=>{const b=await read(d,p);return {path:p,sha256:H(b),bytes:b.length};}));}
async function context(d,authority=d){return (await api(authority,'validate-round')).loadRoundContext(d,null,{release:true,now:Date.now()});}
async function verify(d,authority=d){const v=await api(authority,'validate-round'),c=await context(d,authority),g=v.validateReleaseLedger(c.ledgers,{...c,now:Date.now()});assert.equal(g.ok,true,g.errors.join('\n'));return c;}
function privateReceipts(pair,roundId,at){const artifacts=['delta','complete'].map(kind=>({kind,library_file_id:'synthetic-'+roundId+'-'+kind,sha256:pair[kind].sha256,bytes:pair[kind].bytes})),saved={schemaVersion:1,roundId,status:'library_saved_attachment_pending',savedAt:new Date(at-2000).toISOString(),newlyPublishedByDelivery:0,artifacts},attached={...saved,status:'native_attachments_accepted',attachmentAcceptedAt:new Date(at-1000).toISOString(),attachments:artifacts.map(a=>({kind:a.kind,library_file_id:a.library_file_id,messageId:'synthetic-not-delivered',acceptedAt:new Date(at-1000).toISOString()})),deliveryMode:'download_only',publicationAtPreparation:'not_attempted',publicationCountsChangedByDelivery:false,userOpenOrDownloadObserved:false};return {libraryReceiptRaw:J(saved),attachmentReceiptRaw:J(attached)};}
async function install(d,p){await write(d,p.trustRecord.path,p.proofRaw);await write(d,trust,p.trustRegistryRaw);await allow(d,[p.trustRecord.path]);}
async function author(d,n,previous){const v=await api(d,'validate-round'),c=await context(d),b=c.offlineBases.get(previous.proof.deltaArtifactSha256),bank=JSON.parse(c.banks.get(b.bankVersion).raw),r=JSON.parse(await read(d,'docs/rounds/round-ledger.template.json')),start=n===19?'2026-10-05T19:00:00Z':'2026-10-05T23:00:00Z',at=Date.parse(start),id=`round-${String(n).padStart(3,'0')}`;Object.assign(r,{roundId:id,status:'closed',startedAt:start,decisionDeadline:new Date(at+3*3600000).toISOString(),closedAt:new Date(at+60000).toISOString(),summary:'Synthetic zero-addition continuation fixture.',noGapExplanation:'Synthetic validation of reviewed independent delivery only.'});r.baseline={sourceCommit:b.baseCommit,bankVersion:b.bankVersion,bankSha256:b.bankSha256,regularWrittenBySubject:v.regularCoverage(bank).regularWrittenBySubject,regularPractical:v.regularCoverage(bank).regularPractical,offlinePredecessor:{artifactSha256:previous.proof.deltaArtifactSha256,manifestSha256:b.manifestSha256,ledgerSha256:b.ledgerSha256,roundId:b.roundId}};r.coverageAfter=v.regularCoverage(JSON.parse(c.banks.get('2026.10.05-regular.17').raw));bank.bankVersion='synthetic-independent.'+n;bank.roundId=id;bank.releasedAt=new Date(at+120000).toISOString();bank.changeSummary='Synthetic fixture only.';const raw=J(bank);Object.assign(r.publication,{bankVersion:bank.bankVersion,bankSha256:H(raw)});await write(d,`data/releases/${bank.bankVersion}/bank.json`,raw);await write(d,`docs/rounds/${id}.json`,J(r));await write(d,`docs/rounds/${id}.md`,'Synthetic fixture only.\n');await write(d,'data/manifest.json',J({schemaVersion:1,bankVersion:bank.bankVersion,releasedAt:bank.releasedAt,file:`releases/${bank.bankVersion}/bank.json`,sha256:H(raw),changeSummary:bank.changeSummary,finalRelease:false}));await allow(d,[`data/releases/${bank.bankVersion}/bank.json`,`docs/rounds/${id}.json`,`docs/rounds/${id}.md`]);}
function altered(input,mutate){const delta=readDeliveredArchive(input.deltaZip,H(input.deltaZip)),full=readDeliveredArchive(input.completeZip,H(input.completeZip)),d=JSON.parse(delta.get('manifest.json')),c=JSON.parse(full.get('manifest.json'));mutate(d,c,delta,full);delta.set('manifest.json',J(d));const dz=zipStored([...delta].map(([name,raw])=>({name,raw})),{compress:true});c.sourceRelease.deltaArtifactSha256=H(dz);c.sourceRelease.deltaManifestSha256=H(J(d));full.set('manifest.json',J(c));const cz=encodeSevenZip([...full].map(([name,raw])=>({name,raw}))),saved=JSON.parse(input.libraryReceiptRaw),attached=JSON.parse(input.attachmentReceiptRaw);for(const r of [saved,attached])for(const a of r.artifacts){const b=a.kind==='delta'?dz:cz;a.sha256=H(b);a.bytes=b.length;}return {...input,deltaZip:dz,completeZip:cz,libraryReceiptRaw:J(saved),attachmentReceiptRaw:J(attached)};}

test('independent public anchor carries delivered018 into synthetic019 and020 without historical splicing',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-05T17:15:00Z')});
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'independent-chains-'));t.after(()=>fs.rm(tmp,{recursive:true,force:true}));
 const source=path.join(tmp,'source18');await fs.cp(root,source,{recursive:true});
 // Only this disposable fixture resets its independently reviewed trust data.
 // Real later checkpoints and ledgers must never authenticate synthetic018.
 await pruneHistoricalFixtureHistory(source,{temporaryRoot:tmp,maxRound:18,at:Date.now(),checkpoints:'none'});
 await write(source,trust,J({schemaVersion:1,kind:'reviewed_independent_offline_chains',checkpoints:[]}));
 await retainHistoricalQuarantinePrefix(source,Date.now());
 const source18BankRaw=await read(source,'data/releases/2026.10.05-regular.18/bank.json'),source18Bank=JSON.parse(source18BankRaw);
 await write(source,'data/manifest.json',J({schemaVersion:1,bankVersion:source18Bank.bankVersion,releasedAt:source18Bank.releasedAt,file:`releases/${source18Bank.bankVersion}/bank.json`,sha256:H(source18BankRaw),changeSummary:source18Bank.changeSummary,finalRelease:false}));


 // Ordinary loading must still reject unlisted future history when test-only
 // pruning is deliberately bypassed. No allowlist entry masks the injection.
 const futurePath='docs/rounds/round-099.json',injectedFuture=JSON.parse(await read(source,'docs/rounds/round-018.json'));
 Object.assign(injectedFuture,{roundId:'round-099',startedAt:'2026-10-15T19:00:00Z',decisionDeadline:'2026-10-15T22:00:00Z',closedAt:'2026-10-15T19:01:00Z'});
 await write(source,futurePath,J(injectedFuture));
 try {await assert.rejects(context(source),/round-099\/startedAt: recorded round execution is in the future/);}
 finally {await fs.rm(path.join(source,futurePath));}

 const base=path.join(tmp,'public17');await fs.cp(source,base,{recursive:true});const bank17=JSON.parse(await read(base,'data/releases/2026.10.05-regular.17/bank.json')),remove=['docs/rounds/round-018.json','docs/rounds/round-018.md','data/releases/2026.10.05-regular.18/bank.json'];for(const p of remove)await fs.rm(path.join(base,p));await allow(base,[],remove);await write(base,'data/manifest.json',J({schemaVersion:1,bankVersion:bank17.bankVersion,releasedAt:bank17.releasedAt,file:`releases/${bank17.bankVersion}/bank.json`,sha256:H(await read(base,`data/releases/${bank17.bankVersion}/bank.json`)),changeSummary:bank17.changeSummary,finalRelease:false}));
 const head='04dcdf53384590a12159601d76029b1b8a13bb4f',observation='2026-10-05T17:05:00Z';
 const anchor={baseCommit:head,observedAt:observation,manifestRaw:(await read(base,'data/manifest.json')).toString(),publicationStateRaw:(await read(base,'data/publication-state.json')).toString(),allowlistRaw:(await read(base,'PUBLICATION-MANIFEST.txt')).toString(),remoteInventory:await inv(base)};
 let prior=null,previousRoot=base,last=source;const proposals=[],inputs=[],contexts=[];
 for(const n of [18,19,20]){
  const d=n===18?source:path.join(tmp,'source'+n);if(n!==18){await fs.cp(last,d,{recursive:true});await install(d,prior);t.mock.timers.setTime(Date.parse(n===19?'2026-10-05T19:15:00Z':'2026-10-05T23:15:00Z'));await author(d,n,prior);}
  contexts.push(await verify(d));const low=await api(d,'download-fallback'),bundle=await api(d,'complete-bundle');const baseInventory=await inv(previousRoot),workInventory=await inv(d),before=new Map(baseInventory.map(f=>[f.path,f.sha256])),reviewed=Object.fromEntries(workInventory.filter(f=>before.get(f.path)!==f.sha256).map(f=>[f.path,f.sha256]));
  const outcome={refStatus:'unchanged',observedHead:head,expectedCommit:null,observedAt:n===18?observation:new Date(Date.now()-300000).toISOString(),refWrite:'not_submitted',objects:'unknown',cancellation:'already_resolved'},wait={roundId:'round-018',executionId:'synthetic-root18',notifiedAt:'2026-10-05T16:42:50Z',deadlineAt:'2026-10-05T16:52:50Z',state:'download_only',stoppedAt:'2026-10-05T16:54:53.943Z'};
  let continuation=null;if(prior){const c=await context(d),chain=c.independentOfflineChains.get('synthetic-anchor17');continuation={receipts:chain.receipts,manifests:chain.manifests,ledgers:c.ledgerSources,banks:new Map([...c.banks].map(([v,e])=>[v,e.raw])),remoteInventory:anchor.remoteInventory,publicationState:c.publicationState,reconciliationHistory:[chain.proof.uncertainty.wait]};}
  const frozen=await low.freezePublicDelta({baseRoot:previousRoot,workRoot:d,baseCommit:head,baseVerifiedAt:n===18?observation:outcome.observedAt,baseInventory,reviewedSha256:reviewed,wait:n===18?wait:null,gitOutcome:outcome,parentDeliverySha256:prior?.proof.deltaArtifactSha256??null,parentManifest:prior?.proof.deltaManifest??null,continuation,roundId:`round-${String(n).padStart(3,'0')}`,executionId:'synthetic-successor'+n,now:Date.now()-3000});
  const pair=await bundle.writeOfflineDeliveryPair({deltaSnapshot:frozen,workRoot:d,reviewedInventory:workInventory,deltaOutputPath:path.join(tmp,`d${n}.zip`),completeOutputPath:path.join(tmp,`c${n}.7z`),now:Date.now()-3000});
  const terminal={operation:'create_blob',blobOutcome:'unknown',treeSubmitted:false,commitSubmitted:false,refSubmitted:false,followupGitWritesAllowed:false,roundId:'round-018',status:'download_only',recordedAt:wait.stoppedAt,permissionNotificationAt:wait.notifiedAt,permissionDeadlineAt:wait.deadlineAt,artifactSha256:frozen.files.find(f=>f.path==='data/releases/2026.10.05-regular.18/bank.json')?.sha256,firstUnresolvedAt:'2026-10-05T16:53:14Z',reconciliationDeadlineAt:'2026-10-05T17:03:14Z'},skip={...terminal,recordedAt:'2026-10-05T17:03:49.145Z',reconciliationStatus:'deadline_reached_skip_unresolved_git_step',originalOutcome:'unknown',skippedAt:'2026-10-05T17:03:49.145Z'};
  const input={chainId:'synthetic-anchor17',anchor:n===18?anchor:null,deltaZip:await fs.readFile(pair.delta.path),completeZip:await fs.readFile(pair.complete.path),...privateReceipts(pair,`round-${String(n).padStart(3,'0')}`,Date.now()),terminalEvidenceRaw:n===18?J(terminal):null,reconciliationRaw:n===18?J(skip):null,now:Date.now()},module=await api(d,'offline-chain-continuation');
  if(n===18){
   const one=JSON.parse(input.attachmentReceiptRaw);one.attachments.pop();await assert.rejects(module.prepareIndependentOfflineContinuation({...input,attachmentReceiptRaw:J(one)}),/both native/);
   const prepared=JSON.parse(input.attachmentReceiptRaw);prepared.status='prepared';await assert.rejects(module.prepareIndependentOfflineContinuation({...input,attachmentReceiptRaw:J(prepared)}),/both native/);
   await assert.rejects(module.prepareIndependentOfflineContinuation({...input,completeZip:Buffer.from('wrong')}),/exact archives/);
   await assert.rejects(module.prepareIndependentOfflineContinuation(altered(input,(d,c,delta,full)=>full.set('project/extra.txt',Buffer.from('extra')))),/inventory differs/);
   await assert.rejects(module.prepareIndependentOfflineContinuation(altered(input,(d,c,delta)=>delta.delete('files/'+d.files[0].path))),/inventory differs/);
   const duplicate=JSON.parse(input.attachmentReceiptRaw);duplicate.attachments[1]={...duplicate.attachments[0]};await assert.rejects(module.prepareIndependentOfflineContinuation({...input,attachmentReceiptRaw:J(duplicate)}),/each saved artifact/);
   const early=JSON.parse(input.attachmentReceiptRaw);early.attachments[0].acceptedAt='2026-10-05T15:00:00Z';await assert.rejects(module.prepareIndependentOfflineContinuation({...input,attachmentReceiptRaw:J(early)}),/each saved artifact/);
  }
  prior=await module.prepareIndependentOfflineContinuation(input);proposals.push(prior);inputs.push(input);assert.equal(prior.status,'proposed_requires_independent_receipt_review');assert.equal(prior.proof.uncertainty.wait.firstUnresolvedAt,'2026-10-05T16:53:14Z');assert.equal(prior.proof.uncertainty.wait.deadlineAt,'2026-10-05T17:03:14Z');assert.equal(prior.proof.deltaManifest.permissionNotifiedAt,n===18?wait.notifiedAt:undefined);assert.ok(!prior.proofRaw.toString().includes('synthetic-not-delivered'));assert.equal(prior.proof.deltaManifest.baseCommit,head);assert.deepEqual(prior.proof.completeManifest.prerequisiteArtifacts,[]);previousRoot=d;last=d;
 }
 const final=path.join(tmp,'reviewed20');await fs.cp(last,final,{recursive:true});await install(final,prior);const c=await verify(final);assert.equal(c.offlineBases.get(prior.proof.deltaArtifactSha256).roundId,'round-020');assert.ok(c.offlineBases.size>3);assert.equal(c.synchronizations.find(e=>e.syncId==='cumulative-009-017').manifest.bankVersion,'2026.10.05-regular.17');
 const v=await api(final,'validate-round');
 const independent=await api(final,'offline-chain-continuation'),newArtifacts=new Set(proposals.map(p=>p.proof.deltaArtifactSha256)),baseContext={...c,offlineBases:new Map([...c.offlineBases].filter(([a])=>!newArtifacts.has(a))),deliveryCheckpointSources:new Map([...c.deliveryCheckpointSources].filter(([r])=>!proposals.some(p=>p.trustRecord.roundId===r)))};
 // Re-pin deliberately invalid synthetic evidence in disposable authorities. This
 // tests semantic validation beyond the outer hash; production trust stays empty.
 const mutations=[
  ['foreign anchor',p=>{p.anchor.baseCommit='f'.repeat(40);p.anchorSha256=H(J(p.anchor));}],
  ['anchor collision',p=>p.anchor.remoteInventory.push({...p.anchor.remoteInventory[0]})],
  ['late proof',p=>{p.verifiedAt=p.savedAt;}],
  ['saving before closure',p=>{p.savedAt='2026-10-05T15:30:00Z';}],
  ['reset uncertainty',p=>{p.uncertainty.wait.firstUnresolvedAt=p.deltaManifest.gitOutcome.observedAt;}],
  ['early skip',p=>{p.uncertainty.wait.skippedAt=p.uncertainty.wait.firstUnresolvedAt;}],
  ['prepared claim',p=>{p.receipt.status='prepared';}],
  ['forked root',p=>{p.receipt.parentDeliverySha256='a'.repeat(64);}],
  ['mixed ledger',p=>{p.completeManifest.sourceRelease.ledgerSha256='a'.repeat(64);}],
  ['source inventory omission',p=>{p.sourceAllowlistRaw=p.sourceAllowlistRaw.replace('README.md\n','');}],
  ['base collision',p=>{p.deltaManifest.files[0].beforeSha256='f'.repeat(64);p.receipt.manifestSha256=H(J(p.deltaManifest));p.completeManifest.sourceRelease.deltaManifestSha256=p.receipt.manifestSha256;}],
  ['source runtime freeze',p=>{const m=JSON.parse(p.runtimeManifestRaw);m.finalRelease=true;p.runtimeManifestRaw=J(m).toString();for(const list of [p.completeManifest.files,p.completeManifest.frozenSourceInventory]){const f=list.find(f=>f.path==='data/manifest.json');f.sha256=H(Buffer.from(p.runtimeManifestRaw));f.bytes=Buffer.byteLength(p.runtimeManifestRaw);}}],
  ['source state freeze',p=>{const m=JSON.parse(p.publicationStateRaw);m.finalized=true;p.publicationStateRaw=J(m).toString();for(const list of [p.completeManifest.files,p.completeManifest.frozenSourceInventory]){const f=list.find(f=>f.path==='data/publication-state.json');f.sha256=H(Buffer.from(p.publicationStateRaw));f.bytes=Buffer.byteLength(p.publicationStateRaw);}}]
 ];
 for(const [label,mutate] of mutations)await t.test(label,async()=>{
  const d=path.join(tmp,'repinned-'+label.replaceAll(' ','-'));await fs.cp(source,d,{recursive:true});
  const p=structuredClone(proposals[0].proof);mutate(p);const pin={...proposals[0].trustRecord,sha256:H(J(p)),anchorSha256:p.anchorSha256,verifiedAt:p.verifiedAt};
  await write(d,pin.path,J(p));await write(d,trust,J({schemaVersion:1,kind:'reviewed_independent_offline_chains',checkpoints:[pin]}));await allow(d,[pin.path]);
  await assert.rejects(async()=>{const a=await api(d,'offline-chain-continuation');await a.loadIndependentOfflineChains(d,{...contexts[0],now:Date.now()});});await fs.rm(d,{recursive:true,force:true});
 });
 for(const [label,mutate] of [
  ['missing registry',d=>fs.rm(path.join(d,trust))],
  ['mutated proof',d=>write(d,proposals[0].trustRecord.path,Buffer.concat([proposals[0].proofRaw,Buffer.from(' ')]))],
  ['omitted predecessor',async d=>{const x=JSON.parse(await read(d,trust));x.checkpoints.splice(0,1);await write(d,trust,J(x));}],
  ['stale registry',d=>write(d,trust,J({schemaVersion:1,kind:'reviewed_independent_offline_chains',checkpoints:[]}))],
  ['duplicate registry pin',async d=>{const x=JSON.parse(await read(d,trust));x.checkpoints.push({...x.checkpoints.at(-1)});await write(d,trust,J(x));}],
  ['changed counter',async d=>{const p='docs/rounds/round-018.json',r=JSON.parse(await read(d,p));r.candidates[0].attemptCount=0;await write(d,p,J(r));}],
  ['mutated bank',d=>write(d,'data/releases/2026.10.05-regular.18/bank.json',Buffer.from('{}'))],
  ['manifest freeze',async d=>{const m=JSON.parse(await read(d,'data/manifest.json'));m.finalRelease=true;await write(d,'data/manifest.json',J(m));}],
  ['state freeze',async d=>{const m=JSON.parse(await read(d,'data/publication-state.json'));m.finalized=true;await write(d,'data/publication-state.json',J(m));}],
  ['dependency hidden',d=>allow(d,[],['scripts/offline-chain-continuation.mjs'])],
  ['validator removed',d=>fs.rm(path.join(d,'scripts/validate-round.mjs'))],
  ['adapter removed',d=>fs.rm(path.join(d,'scripts/offline-chain-continuation.mjs'))],
  ['runtime manifest removed',d=>fs.rm(path.join(d,'data/manifest.json'))]
 ])await t.test(label,async()=>{const d=path.join(tmp,label.replaceAll(' ','-'));await fs.cp(final,d,{recursive:true});await mutate(d);await assert.rejects(independent.loadIndependentOfflineChains(d,{...baseContext,manifest:null,publicationState:JSON.parse(await read(d,'data/publication-state.json')),now:Date.now()}));});
 await assert.rejects(v.loadRoundContext(final,null,{release:true,now:FREEZE_AT}),/cutoff|freeze/i);
 const next=JSON.parse(await read(final,'docs/rounds/round-ledger.template.json')),tip=c.offlineBases.get(prior.proof.deltaArtifactSha256),tipBank=JSON.parse(c.banks.get(tip.bankVersion).raw);
 Object.assign(next,{roundId:'round-021',status:'closed',startedAt:'2026-10-06T03:00:00Z',decisionDeadline:'2026-10-06T06:30:00Z',closedAt:'2026-10-06T03:01:00Z',summary:'Synthetic undelivered successor baseline check.',noGapExplanation:'Synthetic only.'});next.baseline={sourceCommit:tip.baseCommit,bankVersion:tip.bankVersion,bankSha256:tip.bankSha256,regularWrittenBySubject:v.regularCoverage(tipBank).regularWrittenBySubject,regularPractical:v.regularCoverage(tipBank).regularPractical,offlinePredecessor:{artifactSha256:prior.proof.deltaArtifactSha256,manifestSha256:tip.manifestSha256,ledgerSha256:tip.ledgerSha256,roundId:tip.roundId}};next.coverageAfter=structuredClone(c.ledgers.at(-1).coverageAfter);
 const checkNext=r=>v.validateRoundLedgers([...c.ledgers,r],{...c,availableFiles:new Set([...c.availableFiles,'docs/rounds/round-021.md']),now:Date.parse('2026-10-06T03:02:00Z')});const validNext=checkNext(next);assert.equal(validNext.ok,true,validNext.errors.join('\n'));
 for(const [label,mutate] of [
  ['stale successor predecessor',r=>{const b=c.offlineBases.get(proposals[0].proof.deltaArtifactSha256);r.baseline={...r.baseline,bankVersion:b.bankVersion,bankSha256:b.bankSha256,offlinePredecessor:{artifactSha256:proposals[0].proof.deltaArtifactSha256,manifestSha256:b.manifestSha256,ledgerSha256:b.ledgerSha256,roundId:b.roundId}};}],
  ['foreign successor predecessor',r=>{r.baseline.offlinePredecessor.artifactSha256='f'.repeat(64);}],
  ['foreign successor commit',r=>{r.baseline.sourceCommit='f'.repeat(40);}],
  ['rollback to online root',r=>{delete r.baseline.offlinePredecessor;}]
 ])await t.test(label,()=>{const r=structuredClone(next);mutate(r);const g=checkNext(r);assert.equal(g.ok,false);assert.match(g.errors.join('\n'),/predecessor|latest|baseline/);});

 for(const kind of ['renamed round','renamed editorial'])await t.test(kind+' cannot omit delivered tip',async()=>{
  const d=path.join(tmp,kind.replaceAll(' ','-')+'-omitted-tip');await fs.cp(final,d,{recursive:true});const old=JSON.parse(await read(d,trust));old.checkpoints.pop();await write(d,trust,J(old));
  const renamed=structuredClone(next);renamed.roundId='round-000';renamed.baseline=structuredClone(c.ledgers.find(r=>r.roundId==='round-020').baseline);
  const supplied=kind==='renamed round'?{ledgers:[...c.ledgers,renamed]}:{editorials:[...c.editorials,{correctionRoundId:'editorial-000',startedAt:renamed.startedAt,baseline:renamed.baseline}]};
  await assert.rejects(independent.loadIndependentOfflineChains(d,{...baseContext,...supplied,now:Date.parse('2026-10-06T03:02:00Z')}),/Missing reviewed independent checkpoint/);await fs.rm(d,{recursive:true,force:true});
 });
 // A valid delivered record never retroactively authorizes a start before proof review.
 const g=structuredClone(c.ledgers),future=g.find(r=>r.roundId==='round-020');future.startedAt=proposals[1].proof.attachmentAcceptedAt;const bad=v.validateRoundLedgers(g,{...c,now:Date.now()});assert.equal(bad.ok,false);assert.match(bad.errors.join('\n'),/eligible|predecessor|schedule|cadence/);
});


test('historical fixture boundary uses actual files and refuses unsafe roots before mutation',async t=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'historical-boundary-test-'));t.after(()=>fs.rm(tmp,{recursive:true,force:true}));
 const d=path.join(tmp,'copy'),at=Date.parse('2026-10-04T12:00:00Z');
 const ledger=(roundId,bankVersion)=>J({roundId,startedAt:'2026-10-02T00:00:00Z',baseline:{bankVersion:'seed'},publication:{bankVersion}});
 const contents=new Map([
  ['docs/rounds/round-009.json',ledger('round-009','kept')],['docs/rounds/round-009.md',Buffer.from('kept')],
  ['docs/rounds/round-097.json',ledger('round-097','future-unusual-name')],['docs/rounds/round-097.md',Buffer.from('unlisted future')],
  ['docs/rounds/round-098.json',ledger('round-098','kept')],
  ['data/releases/seed/bank.json',Buffer.from('seed')],['data/releases/kept/bank.json',Buffer.from('kept bank')],
  ['data/releases/future-unusual-name/bank.json',Buffer.from('unlisted future bank')],
  ['data/releases/synthetic-regular.96/bank.json',Buffer.from('listed future bank')],
  ['docs/deliveries/checkpoints/round-009.json',Buffer.from('old checkpoint')],
  ['docs/deliveries/checkpoints/round-097.json',Buffer.from('unlisted future checkpoint')],
  ['docs/deliveries/chains/future.json',Buffer.from('unlisted chain')],['README.md',Buffer.from('unrelated')]
 ]);
 for(const [file,raw] of contents)await write(d,file,raw);
 const listed=['PUBLICATION-MANIFEST.txt','docs/rounds/round-009.json','docs/rounds/round-009.md','data/releases/seed/bank.json','data/releases/kept/bank.json','data/releases/synthetic-regular.96/bank.json','docs/deliveries/checkpoints/round-009.json','README.md'];
 await write(d,'PUBLICATION-MANIFEST.txt',listed.join('\n')+'\n');
 const realHistory=(await fs.readdir(path.join(root,'docs/rounds'))).filter(file=>/^round-\d+\.(?:json|md)$/.test(file));
 const sourceBefore=new Map(await Promise.all(realHistory.map(async file=>[file,H(await read(root,'docs/rounds/'+file))])));
 await assert.rejects(pruneHistoricalFixtureHistory(root,{temporaryRoot:tmp,maxRound:9,at}),/owned temporary/);
 await assert.rejects(pruneHistoricalFixtureHistory(d,{temporaryRoot:tmp,maxRound:NaN,at}),/explicit boundary/);
 await assert.rejects(pruneHistoricalFixtureHistory(d,{temporaryRoot:tmp,maxRound:9,at:NaN}),/explicit boundary/);
 await fs.symlink(root,path.join(d,'source-link'));
 await assert.rejects(pruneHistoricalFixtureHistory(d,{temporaryRoot:tmp,maxRound:9,at}),/symbolic links/);
 await fs.unlink(path.join(d,'source-link'));
 const alias=path.join(tmp,'alias');await fs.symlink(d,alias);
 await assert.rejects(pruneHistoricalFixtureHistory(alias,{temporaryRoot:tmp,maxRound:9,at}),/root or ancestor.*symbolic link/);
 await fs.mkdir(path.join(d,'child'));
 await assert.rejects(pruneHistoricalFixtureHistory(path.join(alias,'child'),{temporaryRoot:tmp,maxRound:9,at}),/root or ancestor.*symbolic link/);
 await assert.rejects(pruneHistoricalFixtureHistory(d,{temporaryRoot:alias,maxRound:9,at}),/root or ancestor.*symbolic link/);
 await fs.unlink(alias);

 for(const [file,raw] of contents)assert.deepEqual(await read(d,file),raw);
 const removed=await pruneHistoricalFixtureHistory(d,{temporaryRoot:tmp,maxRound:9,at});
 for(const file of ['docs/rounds/round-097.json','docs/rounds/round-097.md','docs/rounds/round-098.json','data/releases/future-unusual-name/bank.json','data/releases/synthetic-regular.96/bank.json','docs/deliveries/checkpoints/round-097.json','docs/deliveries/chains/future.json'])assert.ok(removed.includes(file),file);
 for(const [file,raw] of contents)if(removed.includes(file))await assert.rejects(fs.stat(path.join(d,file)),{code:'ENOENT'});else assert.deepEqual(await read(d,file),raw);
 assert.deepEqual(parsePublicAllowlist((await read(d,'PUBLICATION-MANIFEST.txt')).toString()),listed.filter(file=>!removed.includes(file)));
 for(const [file,hash] of sourceBefore)assert.equal(H(await read(root,'docs/rounds/'+file)),hash,file);
 const wrongClock=JSON.parse(await read(d,'docs/rounds/round-009.json'));wrongClock.startedAt='2026-10-06T00:00:00Z';await write(d,'docs/rounds/round-009.json',J(wrongClock));
 await assert.rejects(pruneHistoricalFixtureHistory(d,{temporaryRoot:tmp,maxRound:9,at}),/historical clock/);
});
