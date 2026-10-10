/** Selection regression uses exact reviewed source bytes. Synthetic publication
 * pins and delivery proofs exist only in disposable copies, never the project. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {loadPublicationSelections,resolvePublicationIdentity,validatePublicationSelectionSnapshot,assertNoPublicationExcludedContent} from '../scripts/publication-selection.mjs';
import {PUBLICATION_SYNCHRONIZATIONS,validatePublicationSynchronizations,validatePublicationSynchronizationSemantics} from '../scripts/publication-sync.mjs';
import {normalPublicationTree,NORMAL_SOURCE_KEYS,SELECTED_NORMAL_SOURCE_KEYS} from '../scripts/normal-publication.mjs';
import {regularCoverage,editorialContentHash,validateJsonSchema,nextScheduledRoundAt,FINAL_DECISION_AT} from '../scripts/validate-round.mjs';
const root=path.resolve(import.meta.dirname,'..'),J=v=>Buffer.from(JSON.stringify(v,null,2)+'\n'),H=b=>createHash('sha256').update(b).digest('hex'),G=b=>createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`),b])).digest('hex');
const read=(p,base=root)=>fs.readFile(path.join(base,p));
const inventory=files=>[...files].map(([path,raw])=>({path,bytes:raw.length,sha256:H(raw),gitBlob:G(raw)}));
function refresh(event,files){event.remoteInventory=inventory(files);event.tree=normalPublicationTree(event.remoteInventory);event.liveAssets=event.remoteInventory.map(f=>({path:f.path,url:new URL(f.path,event.siteUrl).href,http:200,bytes:f.bytes,sha256:f.sha256}));}
let fixturePromise;
function fixture(){return fixturePromise??=buildFixture();}
async function buildFixture(){
 // API-only fixture: read exact public bytes. The separately reviewed pair owns
 // the single full campaign/release integration gate; do not duplicate it here.
 const context={ledgers:[],ledgerSources:new Map(),banks:new Map(),synchronizations:[],publicationState:JSON.parse(await read('data/publication-state.json')),publicationSelections:await loadPublicationSelections(root),deliveryCheckpointSources:new Map()};
 for(const name of await fs.readdir(path.join(root,'docs/rounds')))if(/^round-\d+\.json$/.test(name)){const raw=await read('docs/rounds/'+name),ledger=JSON.parse(raw);context.ledgers.push(ledger);context.ledgerSources.set(ledger.roundId,raw);}
 for(const name of await fs.readdir(path.join(root,'data/releases')))context.banks.set(name,{raw:await read(`data/releases/${name}/bank.json`)});
 for(const pin of PUBLICATION_SYNCHRONIZATIONS)context.synchronizations.push(JSON.parse(await read(pin.path)));
 const ledger=context.ledgers.find(l=>l.roundId==='round-041'),identity=resolvePublicationIdentity(ledger,context.publicationSelections),bank=JSON.parse(context.banks.get(identity.effectiveBankVersion).raw),prior=context.synchronizations.at(-1);
 const files=new Map();for(const p of (await read('PUBLICATION-MANIFEST.txt')).toString().split(/\r?\n/).filter(p=>p&&!p.startsWith('#')))files.set(p,await read(p));
 const manifest=JSON.parse(files.get('data/manifest.json')),at=Math.max(Date.parse(bank.releasedAt)+60000,Date.parse(ledger.closedAt)+60000);
 const source={kind:'normal_frozen_ledger',roundId:ledger.roundId,ledgerPath:`docs/rounds/${ledger.roundId}.json`,originalLedgerSha256:H(context.ledgerSources.get(ledger.roundId)),bankVersion:identity.effectiveBankVersion,bankSha256:identity.effectiveBankSha256,baseline:{sourceCommit:ledger.baseline.sourceCommit,bankVersion:ledger.baseline.bankVersion,bankSha256:ledger.baseline.bankSha256},accepted:3,originalPublicationStatus:'not_attempted',quarantined:0,eligible:1,newlyPublicRegular:1,selectionReference:identity.selectionReference,publicationExcluded:2};
 const regular=bank.questions.filter(q=>!q.testOnly),event={schemaVersion:1,syncId:'synthetic-selected-041',kind:'verified_normal_publication',previousSynchronizationSha256:H(J(prior)),verifiedAt:new Date(at).toISOString(),repository:prior.repository,commit:'1'.repeat(40),parent:ledger.baseline.sourceCommit,tree:null,commitUrl:`https://github.com/${prior.repository}/commit/${'1'.repeat(40)}`,pages:{runId:1,headSha:'1'.repeat(40),status:'completed',conclusion:'success',url:`https://github.com/${prior.repository}/actions/runs/1`},siteUrl:prior.siteUrl,manifest,manifestSha256:H(files.get('data/manifest.json')),runtimeManifestRaw:files.get('data/manifest.json').toString(),publicationStateRaw:files.get('data/publication-state.json').toString(),counts:{regular:regular.length,written:regular.filter(q=>q.type==='written').length,practical:regular.filter(q=>q.type==='practical').length,testOnly:bank.questions.filter(q=>q.testOnly).length,total:bank.questions.length,newlyPublicFromAnchor:1},writtenBySubject:Object.fromEntries(['s1','s2','s3','s4','s5'].map(s=>[s,regular.filter(q=>q.type==='written'&&q.subjectId===s).length])),rounds:[source],remoteInventory:[],liveAssets:[],limitations:['Synthetic semantic fixture only; no actual publication or delivery.']};
 refresh(event,files);Object.assign(context,{manifest,now:at});return {context,files,ledger,identity,bank,prior,event,at};
}
function pendingEditorial(f,originalRound,candidate,start=f.at+60000){
 const bankVersion=originalRound.roundId==='round-041'?f.identity.effectiveBankVersion:originalRound.publication.bankVersion,raw=f.context.banks.get(bankVersion).raw,original=JSON.parse(raw),q=original.questions.find(q=>q.questionId===candidate.questionId),coverage=regularCoverage(f.bank);
 const c={correctionId:'synthetic-selection-editorial-item',issueId:'synthetic-wording-review',questionId:q.questionId,templateId:q.templateId,learningGoalId:candidate.learningGoalId,learningGoalRevision:q.learningGoalRevision,type:q.type,subjectId:q.subjectId,priorAcceptedRef:{roundId:originalRound.roundId,candidateId:candidate.candidateId,ledgerPath:`docs/rounds/${originalRound.roundId}.json`,bankVersion,bankSha256:H(raw),questionRevision:q.revision,contentSha256:editorialContentHash(original,q)},defect:'Synthetic fixture defect for editorial provenance validation.',revision:q.revision+1,authorId:'synthetic-fresh-editorial-author',evidence:structuredClone(candidate.evidence),optionChanges:[],practicalChoiceChanges:[],attemptCount:0,cycles:[],decision:'pending',reasonCodes:[],decisionSummary:'Synthetic planned review; no started review or publication.',publishedBankVersion:null,targetPaths:[`/questions/${q.questionId}/explanation`]};
 return {ledgerSchemaVersion:1,kind:'accepted_content_editorial',campaignId:'2026-exam-final',correctionRoundId:'editorial-selected-fixture',prdVersion:'1.9',timezone:'Asia/Seoul',status:'running',startedAt:new Date(start).toISOString(),decisionDeadline:new Date(Math.min(start+300000,Date.parse('2026-10-10T15:00:00Z'))).toISOString(),closedAt:null,policy:{maxCycles:3,maxRoundHours:4,newKnowledgeItems:0},baseline:{sourceCommit:f.event.commit,bankVersion:f.bank.bankVersion,bankSha256:H(f.context.banks.get(f.bank.bankVersion).raw),regularWrittenBySubject:coverage.regularWrittenBySubject,regularPractical:coverage.regularPractical},changedQuestionIds:[q.questionId],changedOptionIds:[],changedPracticalChoiceIds:[],corrections:[c],counts:{registered:1,accepted:0,rejected:0,pending:1,newRegular:0,revisedRegular:0,publishedRevisedRegular:0},coverageAfter:coverage,publication:{status:'not_attempted',commit:null,bankVersion:null,bankSha256:null,verifiedAt:null,url:null,blockers:[]},validation:[],nextAction:'Synthetic fixture only.',summary:'Synthetic selected publication editorial provenance fixture.'};
}
async function isolated(t,f,{registerRoot=false}={}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'selected-consumers-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.cp(root,dir,{recursive:true});
 const files=new Map(f.files),event=structuredClone(f.event),context={...f.context,deliveryCheckpointSources:new Map(f.context.deliveryCheckpointSources)};
 if(registerRoot){
  const p='docs/deliveries/normal-roots/round-041.json',registryPath='docs/deliveries/normal-backup-root-trust.json',registry=JSON.parse(files.get(registryPath));
  const sourceRelease={roundId:'round-041',ledgerPath:'docs/rounds/round-041.json',ledgerSha256:event.rounds[0].originalLedgerSha256,bankVersion:f.identity.effectiveBankVersion,bankSha256:f.identity.effectiveBankSha256,deltaArtifactSha256:'c'.repeat(64),deltaManifestSha256:'d'.repeat(64),baseCommit:f.ledger.baseline.sourceCommit,selectionReference:f.identity.selectionReference};
  const baseline=JSON.parse(context.banks.get(f.ledger.baseline.bankVersion).raw),anchorFiles=new Map([['data/manifest.json',J({...f.event.manifest,bankVersion:baseline.bankVersion,file:`releases/${baseline.bankVersion}/bank.json`,sha256:f.ledger.baseline.bankSha256,releasedAt:baseline.releasedAt,changeSummary:baseline.changeSummary})],['data/publication-state.json',files.get('data/publication-state.json')],[`data/releases/${baseline.bankVersion}/bank.json`,context.banks.get(baseline.bankVersion).raw]]);
  anchorFiles.set('PUBLICATION-MANIFEST.txt',Buffer.from([...anchorFiles.keys(),'PUBLICATION-MANIFEST.txt'].sort().join('\n')+'\n'));
  const flat=map=>[...map].map(([path,raw])=>({path,bytes:raw.length,sha256:H(raw)})).sort((a,b)=>a.path.localeCompare(b.path)),all=flat(files),old=flat(anchorFiles),oldMap=new Map(old.map(f=>[f.path,f]));
  const anchor={baseCommit:f.ledger.baseline.sourceCommit,observedAt:f.ledger.startedAt,manifestRaw:anchorFiles.get('data/manifest.json').toString(),publicationStateRaw:anchorFiles.get('data/publication-state.json').toString(),allowlistRaw:anchorFiles.get('PUBLICATION-MANIFEST.txt').toString(),remoteInventory:old},stamp=n=>new Date(f.at+n).toISOString();
  const delta={schemaVersion:1,kind:'developer_patch_not_learner_import',deliveryMode:'release_backup',roundId:'round-041',baseCommit:f.ledger.baseline.sourceCommit,baseVerifiedAt:f.ledger.startedAt,preparedAt:stamp(-5000),gitPublicationStatus:'not_attempted',publicationCommit:null,bankVersion:f.identity.effectiveBankVersion,bankSha256:f.identity.effectiveBankSha256,newlyPublishedByPackaging:0,prerequisiteArtifacts:[],selectionReference:f.identity.selectionReference,files:all.filter(v=>oldMap.get(v.path)?.sha256!==v.sha256).map(v=>({...v,beforeSha256:oldMap.get(v.path)?.sha256??null})),deletions:[]};
  sourceRelease.deltaManifestSha256=H(J(delta));
  const registryPaths=['docs/deliveries/release-backup-trust.json','docs/deliveries/offline-chain-trust.json','docs/deliveries/normal-backup-root-trust.json','docs/deliveries/normal-backup-chain-trust.json','docs/quarantines/trust.json','docs/release-blocks/trust.json'];
  const proof={schemaVersion:1,kind:'delivered_normal_release_root_checkpoint',roundId:'round-041',deltaArtifactSha256:sourceRelease.deltaArtifactSha256,completeArtifactSha256:'b'.repeat(64),privateEvidence:{libraryReceiptSha256:'c'.repeat(64),attachmentReceiptSha256:'d'.repeat(64),uploadResultSha256:'e'.repeat(64),archiveAuditSha256:'f'.repeat(64),sourceCheckpointSha256:'1'.repeat(64),terminalEvidenceSha256:null},archiveVerifiedAt:stamp(-4000),attachmentAcceptedAt:stamp(-3000),verificationCompletedAt:stamp(-2000),newlyPublishedRegular:0,canPublish:false,userOpenOrDownloadObserved:false,sourceAnchor:anchor,continuationAnchor:structuredClone(anchor),anchorTransition:{parentCommit:f.ledger.baseline.sourceCommit,evidenceSha256:'2'.repeat(64),changedPaths:[]},priorTrustSha256:H(files.get(registryPath)),preservedRegistries:registryPaths.map(path=>({path,raw:files.get(path).toString()})),completeManifest:{schemaVersion:2,archiveFormat:'7z',kind:'complete_project_not_learner_import',deliveryMode:'release_backup',newlyPublishedRegular:0,projectDirectory:'project',prerequisiteArtifacts:[],sourceRelease,frozenSourceInventory:structuredClone(all),packagingRevision:null,files:all},deltaManifest:delta,runtimeManifestRaw:files.get('data/manifest.json').toString(),publicationStateRaw:files.get('data/publication-state.json').toString(),sourceAllowlistRaw:files.get('PUBLICATION-MANIFEST.txt').toString(),stoppedPublisher:null};
  const raw=J(proof),registeredAt=stamp(-1000);registry.roots.push({roundId:'round-041',path:p,sha256:H(raw),sourceAnchorSha256:H(J(anchor)),continuationAnchorSha256:H(J(anchor)),registeredAt,eligibleAt:registeredAt});
  files.set(p,raw);files.set(registryPath,J(registry));context.deliveryCheckpointSources.set('round-041',raw);refresh(event,files);
 }
 for(const [p,raw]of files){await fs.mkdir(path.dirname(path.join(dir,p)),{recursive:true});await fs.writeFile(path.join(dir,p),raw);}
 const events=[...context.synchronizations,event],code=(await read('scripts/publication-sync.mjs')).toString().replace(/export const PUBLICATION_SYNCHRONIZATIONS = Object.freeze\(\[[\s\S]*?\n\]\);/,`export const PUBLICATION_SYNCHRONIZATIONS = Object.freeze([\n${events.map(e=>`Object.freeze({path:'docs/publications/${e.syncId}.json',sha256:'${H(J(e))}'})`).join(',\n')}\n]);`);
 await fs.writeFile(path.join(dir,'scripts/publication-sync.mjs'),code);
 const authority=await import(pathToFileURL(path.join(dir,'scripts/publication-selection.mjs')).href);context.publicationSelections=await authority.loadPublicationSelections(dir);
 const api=await import(pathToFileURL(path.join(dir,'scripts/publication-sync.mjs')).href),editorialApi=await import(pathToFileURL(path.join(dir,'scripts/editorial-ledger.mjs')).href);
 return {dir,files,event,context,api,editorialApi,events};
}

test('selected release resolves original history without changing accepted/quarantined counts',async()=>{
 const f=await fixture();assert.deepEqual(f.identity.counts,{accepted:3,quarantined:0,publicationExcluded:2,eligible:1});
 assert.deepEqual(NORMAL_SOURCE_KEYS,['kind','roundId','ledgerPath','originalLedgerSha256','bankVersion','bankSha256','baseline','accepted','originalPublicationStatus','quarantined','eligible','newlyPublicRegular']);assert.deepEqual(SELECTED_NORMAL_SOURCE_KEYS,[...NORMAL_SOURCE_KEYS,'selectionReference','publicationExcluded']);
 const identity=resolvePublicationIdentity(f.ledger,f.context.publicationSelections);assert.equal(identity.effectiveBankVersion,f.bank.bankVersion);assert.equal(identity.effectiveBankSha256,H(f.context.banks.get(f.bank.bankVersion).raw));assert.deepEqual(identity.originalLedger,f.ledger);
 assert.equal(assertNoPublicationExcludedContent(f.bank,f.context.publicationSelections,f.context.banks.get(f.bank.bankVersion).raw),f.bank);assert.equal(H(f.context.ledgerSources.get('round-041')),'a76c5fe74e7f7b0fc1531d853962b8613d4131eb20508465a19894d362679cd6');
 const original=JSON.parse(f.context.banks.get(f.identity.originalBankVersion).raw),manifest={...f.context.manifest,bankVersion:original.bankVersion,file:`releases/${original.bankVersion}/bank.json`,sha256:f.identity.originalBankSha256,releasedAt:original.releasedAt,changeSummary:original.changeSummary};
 assert.throws(()=>assertNoPublicationExcludedContent(original,f.context.publicationSelections));assert.throws(()=>resolvePublicationIdentity(f.ledger,new Map()));
 const changed=new Map(f.files);changed.set('data/manifest.json',J(manifest));assert.throws(()=>validatePublicationSelectionSnapshot([...changed].map(([path,raw])=>({path,raw})),{now:f.at}),/reactivate retired original/);
});

test('selected direct event semantic positive and targeted negatives are separate from publication authority',async()=>{
 const f=await fixture();assert.equal(validatePublicationSynchronizationSemantics(f.event,f.context,f.prior).ok,true);
 assert.equal(validatePublicationSynchronizations([...f.context.synchronizations,f.event],f.context).ok,false,'unpinned event cannot activate publication');
 const cases=[['wrong C parent',e=>e.parent='a'.repeat(40)],['wrong selected bank',e=>e.rounds[0].bankVersion=f.identity.originalBankVersion],['changed ledger hash',e=>e.rounds[0].originalLedgerSha256='a'.repeat(64)],['wrong accepted',e=>e.rounds[0].accepted=1],['wrong quarantine',e=>e.rounds[0].quarantined=2],['wrong exclusions',e=>e.rounds[0].publicationExcluded=0],['wrong eligible',e=>e.rounds[0].eligible=3],['wrong newly public',e=>e.rounds[0].newlyPublicRegular=3],['wrong selection reference',e=>e.rounds[0].selectionReference.sha256='a'.repeat(64)],['ordinary downgrade',e=>{delete e.rounds[0].selectionReference;delete e.rounds[0].publicationExcluded;}],['wrong Pages head',e=>e.pages.headSha='a'.repeat(40)],['missing live selection',e=>e.liveAssets=e.liveAssets.filter(a=>a.path!==f.identity.selectionReference.path)],['changed selection inventory bytes',e=>{e.remoteInventory.find(a=>a.path===f.identity.selectionReference.path).bytes++;e.tree=normalPublicationTree(e.remoteInventory);}]];
 for(const kind of ['verified_normal_chain_publication','verified_reconciled_normal_chain_publication','verified_cumulative_publication'])cases.push([`stripped ${kind}`,e=>{e.kind=kind;delete e.rounds[0].selectionReference;delete e.rounds[0].publicationExcluded;}]);
 for(const [name,mutate]of cases){const event=structuredClone(f.event);mutate(event);assert.throws(()=>validatePublicationSynchronizationSemantics(event,f.context,f.prior),undefined,name);}
});

test('production editorial history API preserves old C provenance and requires genuine earlier selected event',async t=>{
 // This public production API owns baseline/time/priorAcceptedRef validation.
 // It is not a successful full validateEditorialLedgers/campaign wrapper run.
 const f=await fixture(),x=await isolated(t,f),schema=JSON.parse(await read('docs/corrections/editorial-ledger.schema.json')),helpers={validateJsonSchema,regularCoverage,nextScheduledRoundAt,FINAL_DECISION_AT};
 const check=(e,synchronizations=x.events)=>x.editorialApi.validateEditorialHistory([e],{...x.context,schema,synchronizations,now:Date.parse(e.startedAt)+1000},helpers);
 const old=f.context.ledgers.find(l=>l.roundId==='round-039'),retained=f.ledger.candidates.find(c=>f.identity.eligibleCandidateIds.includes(c.candidateId));
 for(const [source,candidate]of [[old,old.candidates.find(c=>c.decision==='accepted')],[f.ledger,retained]]){
  const e=pendingEditorial(f,source,candidate),result=check(e);assert.equal(result.ok,true,result.errors.join('\n'));assert.equal(e.corrections[0].priorAcceptedRef.roundId,source.roundId);
  const noEvent=check(e,f.context.synchronizations);assert.equal(noEvent.ok,false);
  const untrustedEvent=structuredClone(x.event);untrustedEvent.pages.runId++;const unpinnedEditorial=check(e,[...f.context.synchronizations,untrustedEvent]);assert.equal(unpinnedEditorial.ok,false);
  const same=pendingEditorial(f,source,candidate,f.at);assert.equal(check(same).ok,false,'equality with event verification must not start editorial');
  const earlier=pendingEditorial(f,source,candidate,f.at-1);assert.equal(check(earlier).ok,false);
  const unpinned=validatePublicationSynchronizations([...f.context.synchronizations,f.event],f.context);assert.equal(unpinned.ok,false);
 }
 const selected=pendingEditorial(f,f.ledger,retained),excluded=f.ledger.candidates.find(c=>f.identity.excludedReservedCandidateIds.includes(c.candidateId));
 selected.corrections[0].priorAcceptedRef.candidateId=excluded.candidateId;assert.equal(check(selected).ok,false,'excluded ref cannot impersonate retained candidate');
 const changed=pendingEditorial(f,f.ledger,retained);changed.corrections[0].priorAcceptedRef.contentSha256='a'.repeat(64);assert.equal(check(changed).ok,false);
 const original=pendingEditorial(f,f.ledger,retained);original.corrections[0].priorAcceptedRef.bankVersion=f.identity.originalBankVersion;original.corrections[0].priorAcceptedRef.bankSha256=f.identity.originalBankSha256;assert.equal(check(original).ok,false);
});

test('registered selected root preserves exact proof and trust prefixes while parent stays C',async t=>{
 const f=await fixture(),x=await isolated(t,f,{registerRoot:true}),check=(event=x.event,context=x.context)=>x.api.validatePublicationSynchronizationSemantics(event,context,f.prior);
 const rootApi=await import(pathToFileURL(path.join(x.dir,'scripts/normal-backup-root.mjs')).href);assert.equal(rootApi.inspectNormalBackupRootProof(JSON.parse(x.context.deliveryCheckpointSources.get('round-041')),f.ledger,x.context.publicationSelections).bankVersion,f.identity.effectiveBankVersion);
 assert.equal(check().ok,true);const bad=structuredClone(x.event);bad.parent='a'.repeat(40);assert.throws(()=>check(bad),/parent|baseline/);
 assert.throws(()=>check(x.event,{...x.context,deliveryCheckpointSources:new Map()}),/registered exact normal root/);
 for(const p of ['docs/deliveries/normal-roots/round-041.json','docs/deliveries/normal-backup-root-trust.json','docs/deliveries/normal-backup-chain-trust.json',f.identity.selectionReference.path]){const e=structuredClone(x.event);e.remoteInventory=e.remoteInventory.filter(a=>a.path!==p);e.liveAssets=e.liveAssets.filter(a=>a.path!==p);e.tree=normalPublicationTree(e.remoteInventory);assert.throws(()=>check(e),undefined,p);}
 // A future root registration must not be required by earlier genuine events.
 assert.equal(x.api.validatePublicationSynchronizations(f.context.synchronizations,x.context).ok,true);
});

test('later ordinary publication retains exact selection, original bank and original ledger',async()=>{
 const f=await fixture(),files=new Map(f.files),ledger=structuredClone(f.ledger),bank=structuredClone(f.bank),event=structuredClone(f.event);
 Object.assign(ledger,{roundId:'round-042',startedAt:new Date(f.at+60000).toISOString(),closedAt:new Date(f.at+120000).toISOString(),candidates:[]});
 ledger.baseline={...ledger.baseline,sourceCommit:f.event.commit,bankVersion:f.bank.bankVersion,bankSha256:f.identity.effectiveBankSha256};
 Object.assign(bank,{bankVersion:'synthetic-selected-successor',roundId:'round-042',releasedAt:new Date(f.at+120000).toISOString()});
 const raw=J(bank);ledger.publication={...ledger.publication,bankVersion:bank.bankVersion,bankSha256:H(raw)};const ledgerRaw=J(ledger);
 files.set(`docs/publications/${f.event.syncId}.json`,J(f.event));files.set('docs/rounds/round-042.json',ledgerRaw);files.set(`data/releases/${bank.bankVersion}/bank.json`,raw);
 const manifest={...f.event.manifest,bankVersion:bank.bankVersion,file:`releases/${bank.bankVersion}/bank.json`,sha256:H(raw),releasedAt:bank.releasedAt};files.set('data/manifest.json',J(manifest));
 const source={kind:'normal_frozen_ledger',roundId:ledger.roundId,ledgerPath:'docs/rounds/round-042.json',originalLedgerSha256:H(ledgerRaw),bankVersion:bank.bankVersion,bankSha256:H(raw),baseline:{sourceCommit:f.event.commit,bankVersion:f.bank.bankVersion,bankSha256:f.identity.effectiveBankSha256},accepted:0,originalPublicationStatus:'not_attempted',quarantined:0,eligible:0,newlyPublicRegular:0};
 Object.assign(event,{syncId:'synthetic-selected-successor',previousSynchronizationSha256:H(J(f.event)),verifiedAt:new Date(f.at+180000).toISOString(),parent:f.event.commit,commit:'2'.repeat(40),commitUrl:`https://github.com/${event.repository}/commit/${'2'.repeat(40)}`,rounds:[source],manifest,manifestSha256:H(J(manifest)),runtimeManifestRaw:J(manifest).toString(),counts:{...event.counts,newlyPublicFromAnchor:0}});event.pages.headSha=event.commit;files.set('PUBLICATION-MANIFEST.txt',Buffer.from([...files.keys()].sort().join('\n')+'\n'));refresh(event,files);
 const context={...f.context,publicationSelections:validatePublicationSelectionSnapshot([...files].map(([path,raw])=>({path,raw})),{now:f.at+180000}),ledgers:[...f.context.ledgers,ledger],ledgerSources:new Map([...f.context.ledgerSources,['round-042',ledgerRaw]]),banks:new Map([...f.context.banks,[bank.bankVersion,{raw}]])};
 assert.equal(validatePublicationSynchronizationSemantics(event,context,f.event).ok,true);
 for(const p of [f.identity.selectionReference.path,'docs/rounds/round-041.json',`data/releases/${f.identity.originalBankVersion}/bank.json`]){const bad=structuredClone(event);bad.remoteInventory=bad.remoteInventory.filter(v=>v.path!==p);bad.liveAssets=bad.liveAssets.filter(v=>v.path!==p);bad.tree=normalPublicationTree(bad.remoteInventory);assert.throws(()=>validatePublicationSynchronizationSemantics(bad,context,f.event),/immutable prior publication history/);}
});
