import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {validateEvidenceLossCampaign,validateEvidenceLossSnapshot,assertEvidenceLossPayload,assertEvidenceLossProvenance,assertNoEvidenceLossContent,evidenceLossQuestionFingerprint,evidenceLossOptionFingerprint,loadEvidenceLossDependencies} from '../scripts/evidence-loss-block.mjs';
import {quarantineHash,quarantineContentHash,quarantineFingerprint,validateQuarantineCampaign} from '../scripts/prepublication-quarantine.mjs';
import {loadRoundContext,validateRoundLedgers,validateReleaseLedger} from '../scripts/validate-round.mjs';
import {createDeliveryReceipt,reconcileGitOutcome} from '../scripts/download-fallback.mjs';
import {buildBank} from '../scripts/build.mjs';
const ROOT=path.resolve(import.meta.dirname,'..'),json=v=>Buffer.from(JSON.stringify(v,null,2)+'\n'),sha=b=>createHash('sha256').update(b).digest('hex'),clone=structuredClone,read=p=>fs.readFile(path.join(ROOT,p));
const trust=JSON.parse(await read('docs/release-blocks/trust.json')),pin=trust.events[0],event=JSON.parse(await read(pin.path)),ledgerRaw=await read(event.sourceLedger.path),ledger=JSON.parse(ledgerRaw),now=Date.parse(pin.recordedAt)+60000; // Explicit simulated audit clock; never execution proof
const bank22=JSON.parse(await read('data/releases/2026.10.06-regular.22/bank.json'));
let contextPromise;
const context=()=>contextPromise??=loadRoundContext(ROOT,null,{release:true,now:Date.now()});
async function files(){return Promise.all((await read('PUBLICATION-MANIFEST.txt')).toString().split(/\r?\n/).filter(p=>p&&!p.startsWith('#')).map(async p=>({path:p,raw:await read(p)})));}

test('exact original023 stays reservation-only beside the current eligible release and inherited19 holds',async()=>{
 assert.equal(sha(ledgerRaw),'b1ed48e8bc693774423891bf7a46bf31fcd19e96d55bf18422998c95bdd6cf28');assert.equal(sha(await read(pin.path)),pin.sha256);
 assert.equal(event.targets.length,19);assert.equal(event.targets.reduce((n,t)=>n+t.contentStates.length,0),20);assert.equal(event.targets.filter(t=>t.decision==='accepted').length,17);assert.equal(event.targets.filter(t=>t.decision==='rejected').length,2);
 const c=await context(),currentNow=Date.now(),before=sha(json(c.ledgers));assert.deepEqual(c.manifest,JSON.parse(await read('data/manifest.json')));assert.notEqual(c.manifest.bankVersion,event.reservedBank.bankVersion);assert.equal(c.banks.has(event.reservedBank.bankVersion),false);
 const block=validateEvidenceLossCampaign(c.ledgers,{...c,now:currentNow});assert.equal(block.ok,true,block.errors.join('\n'));assert.deepEqual(block.reservations.get(ledger.roundId),{accepted:17,rejected:2,releaseEligible:0,currentExecutionProof:false,deliveryProof:false,publicationProof:false});
 assert.equal(validateRoundLedgers(c.ledgers,{...c,now:currentNow}).ok,true);const release=validateReleaseLedger(c.ledgers,{...c,now:currentNow});assert.equal(release.ok,true,release.errors.join('\n'));
 assert.equal(validateQuarantineCampaign(c.ledgers,{...c,now:currentNow}).dispositions.get('round-022').quarantinedCandidateIds.length,19);assert.equal(sha(json(c.ledgers)),before);await assert.rejects(fs.access(path.join(ROOT,event.incidentReport.missingOriginalPath)),/ENOENT/);
});

test('omission, rewritten history, fabricated proof, reserved bank and baseline all fail closed',()=>{
 const base={ledgerSources:new Map([[ledger.roundId,ledgerRaw]]),now};assert.equal(validateEvidenceLossCampaign([ledger],base).ok,true);
 for(const change of [()=>[],()=>{const r=clone(ledger);r.validation[0].summary+=' tampered';return [r];},()=>{const r=clone(ledger);r.candidates[0].cycles[0].gates.blindSolve.summary+=' changed';return [r];}])assert.equal(validateEvidenceLossCampaign(change(),base).ok,false);
 assert.equal(validateEvidenceLossCampaign([ledger],{...base,ledgerSources:new Map()}).ok,false);
 for(const p of [{roundId:ledger.roundId},{bankVersion:event.reservedBank.bankVersion},{bankSha256:event.reservedBank.sha256}])assert.throws(()=>assertEvidenceLossProvenance(p),/blocked/);
 const future={roundId:'round-024',startedAt:'2026-10-06T15:00:00Z',baseline:{bankVersion:event.reservedBank.bankVersion},candidates:[]};assert.equal(validateEvidenceLossCampaign([ledger,future],base).ok,false);
 assert.throws(()=>assertNoEvidenceLossContent({...bank22,bankVersion:event.reservedBank.bankVersion}),/reserved bankVersion/);
});

test('full current snapshot rejects missing event, registry, original ledger, incident, impersonation and wrong basename',async()=>{
 const full=await files(),currentNow=Date.now();assert.equal(validateEvidenceLossSnapshot(full,{now:currentNow}).ok,true);
 for(const p of ['docs/release-blocks/trust.json',pin.path,event.sourceLedger.path,event.incidentReport.path,'scripts/validate-round.mjs'])assert.throws(()=>validateEvidenceLossSnapshot(full.filter(f=>f.path!==p),{now:currentNow}),/evidence-loss/);
 const stripped=full.filter(f=>f.path!=='scripts/validate-round.mjs').map(f=>f.path==='PUBLICATION-MANIFEST.txt'?{...f,raw:Buffer.from(f.raw.toString().replace('scripts/validate-round.mjs\n',''))}:f);assert.throws(()=>validateEvidenceLossSnapshot(stripped,{now:currentNow}),/registry dependency/);
 const changed=full.map(f=>f.path===event.sourceLedger.path?{...f,raw:Buffer.concat([f.raw,Buffer.from(' ')])}:f);assert.throws(()=>validateEvidenceLossSnapshot(changed,{now:currentNow}),/evidence-loss/);
 assert.throws(()=>validateEvidenceLossSnapshot([...full,{path:event.incidentReport.missingOriginalPath,raw:Buffer.from('Invented original report')}],{now:currentNow}),/impersonated/);
 assert.throws(()=>assertEvidenceLossPayload(ledgerRaw,'docs/rounds/round-999.json'),/wrong basename/);
 const tail=full.map(f=>f.path==='docs/release-blocks/trust.json'?{...f,raw:json({...trust,events:[]})}:f);assert.throws(()=>validateEvidenceLossSnapshot(tail,{now:currentNow}),/tail omitted/);
});

test('freeze and current-time bounds stay enforced; ordinary preincident history needs no future event',()=>{
 const args={ledgerSources:new Map([[ledger.roundId,ledgerRaw]]),now};
 for(const changes of [{now:Date.parse('2026-10-06T13:00:00Z')},{now:Date.parse('2026-10-16T15:00:00Z')},{manifest:{finalRelease:true}},{publicationState:{finalized:true}}])assert.equal(validateEvidenceLossCampaign([ledger],{...args,...changes}).ok,false);
 assert.equal(validateEvidenceLossCampaign([],{now:Date.parse('2026-10-06T08:50:00Z')}).ok,true);
});

test('unrelated024 may follow exact022 while accepted023 goals remain reserved and rejected reopening gets no new authority',()=>{
 const args={ledgerSources:new Map([[ledger.roundId,ledgerRaw]]),now:Date.parse('2026-10-06T15:30:00Z')};
 const next={roundId:'round-024',startedAt:'2026-10-06T15:00:00Z',baseline:clone(ledger.baseline),publication:{bankVersion:'2026.10.07-regular.24'},candidates:[]};assert.equal(validateEvidenceLossCampaign([ledger,next],args).ok,true);
 next.candidates=[{...clone(ledger.candidates.find(c=>c.decision==='accepted')),candidateId:'synthetic-alias'}];assert.equal(validateEvidenceLossCampaign([ledger,next],args).ok,false);
 const rejected=ledger.candidates.find(c=>c.decision==='rejected');next.candidates=[{...clone(rejected),candidateId:'synthetic-reopened',revision:rejected.revision+1,reopenCount:1,reopeningEvidence:[{sourceId:'synthetic-unverified-new-evidence'}],priorCandidateRefs:[{roundId:ledger.roundId,candidateId:rejected.candidateId}]}];
 // This denial-only layer does not grant permission: complete validateRoundLedgers
 // still enforces real primary evidence, exact references, 3/6 limits and timing.
 assert.equal(validateEvidenceLossCampaign([ledger,next],args).ok,true);assert.doesNotThrow(()=>assertEvidenceLossPayload(json(next),'docs/rounds/round-024.json'));
 next.candidates[0].reopeningEvidence=[];assert.equal(validateEvidenceLossCampaign([ledger,next],args).ok,false);
});

test('explicit build path refuses reserved023 before writing any new manifest or immutable bank',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'evidence-loss-build-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'data'));const input=path.join(root,'renamed-input.json');await fs.writeFile(input,json({...bank22,bankVersion:event.reservedBank.bankVersion}));await assert.rejects(buildBank(root,input),/evidence-loss.*reserved bankVersion/);await assert.rejects(fs.access(path.join(root,'data/manifest.json')),/ENOENT/);
});

async function synthetic(t,recordedAt='2026-10-06T09:10:00Z',extraStateFields={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'evidence-loss-synthetic-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));for(const p of ['src','scripts'])await fs.cp(path.join(ROOT,p),path.join(root,p),{recursive:true});await fs.copyFile(path.join(ROOT,'package.json'),path.join(root,'package.json'));
 async function write(p,raw){await fs.mkdir(path.dirname(path.join(root,p)),{recursive:true});await fs.writeFile(path.join(root,p),raw);}
 await write('docs/quarantines/trust.json',json({schemaVersion:1,kind:'reviewed_prepublication_quarantines',audits:[]}));
 const q=clone(bank22.questions.find(q=>q.type==='written')),options=q.links.map(l=>clone(bank22.options.find(o=>o.optionId===l.optionId)));Object.assign(q,{questionId:'synthetic-held',templateId:'synthetic-held-template',learningGoalId:'synthetic-held-goal',stem:'Synthetic unique held scenario.',explanation:'Synthetic governing rule for exact scenario.'});for(const [i,o]of options.entries()){o.optionId='synthetic-option-'+i;o.content='Synthetic option '+i;o.explanation='Synthetic option reason '+i;q.links[i].optionId=o.optionId;}
 const c={candidateId:q.questionId,questionId:q.questionId,learningGoalId:q.learningGoalId,templateId:q.templateId,lineageId:'synthetic-lineage',revision:q.revision,decision:'accepted',attemptCount:1,cycles:[{revision:q.revision}]};const r={roundId:'round-synthetic',campaignId:'synthetic',status:'closed',closedAt:'2026-10-06T09:00:00Z',publication:{status:'not_attempted',verifiedAt:null,bankVersion:'synthetic-blocked',bankSha256:'b'.repeat(64)},candidates:[c]},rRaw=json(r),report=Buffer.from('Synthetic incident.');
 const trust={schemaVersion:1,kind:'reviewed_evidence_loss_blocks',events:[]};const e={schemaVersion:1,kind:'evidence_loss_release_block',eventId:'synthetic-event',campaignId:r.campaignId,roundId:r.roundId,recordedAt,previousEventSha256:null,priorTrustSha256:sha(json(trust)),sourceLedger:{path:'docs/rounds/round-synthetic.json',sha256:sha(rRaw)},reservedBank:{bankVersion:'synthetic-blocked',sha256:'b'.repeat(64)},incidentReport:{path:'docs/incidents/synthetic.md',sha256:sha(report),missingOriginalPath:'docs/rounds/round-synthetic.md',disposition:'reservation_only_missing_original_report'},targets:[{...Object.fromEntries(['candidateId','questionId','learningGoalId','templateId','lineageId','revision','decision','attemptCount'].map(k=>[k,c[k]])),candidateHistorySha256:quarantineHash(c),contentSha256:quarantineContentHash(q,options),identityFreeSha256:quarantineFingerprint(q,options),exclusiveOptionIds:options.map(o=>o.optionId),contentStates:[{revision:q.revision,contentSha256:quarantineContentHash(q,options),identityFreeSha256:quarantineFingerprint(q,options),authorPackageSha256:'a'.repeat(64),questionIdentityFreeSha256:evidenceLossQuestionFingerprint(q),optionIdentityFreeSha256s:options.map(evidenceLossOptionFingerprint),...extraStateFields}]}]};
 const pin={eventId:e.eventId,roundId:e.roundId,path:'docs/release-blocks/synthetic-event.json',sha256:sha(json(e)),recordedAt:e.recordedAt};trust.events.push(pin);await write('docs/release-blocks/trust.json',json(trust));await write(pin.path,json(e));await write(e.sourceLedger.path,rRaw);await write(e.incidentReport.path,report);
 return {root,pin,e,api:await import(pathToFileURL(path.join(root,'scripts/evidence-loss-block.mjs'))),q,options,r,rRaw};
}

test('renamed bank, standalone questions/options, changed extensions and nested Raw payloads cannot replay blocked content',async t=>{
 const {api,q,options}=await synthetic(t);const alias=clone(q),opts=clone(options);alias.questionId='new-q';alias.templateId='new-template';alias.learningGoalId='new-goal';alias.revision++;alias.sourceRefs=['new-source'];alias.reviewNote='Changed metadata';for(const [i,o]of opts.entries()){o.optionId='new-option-'+i;alias.links[i].optionId=o.optionId;}alias.links.reverse();opts.reverse();
 for(const data of [{bankVersion:'alias-bank',questions:[alias],options:opts},{question:alias,options:opts},alias,{questions:[alias]},opts[0],{embeddedRaw:JSON.stringify({questions:[alias],options:opts})}])assert.throws(()=>api.assertEvidenceLossPayload(json(data),'docs/renamed.txt'),/blocked/);
 assert.throws(()=>api.assertNoEvidenceLossContent({questions:[],options:opts}),/blocked/);alias.explanation+=' Substantively new content.';alias.stem+=' Different problem.';assert.doesNotThrow(()=>api.assertNoEvidenceLossContent({questions:[{...alias,links:[]}],options:[]}));
});

test('actual root rejects an unlisted counterfeit report and deleted round-validator dependencies',async t=>{
 const currentNow=Date.now(),root=await fs.mkdtemp(path.join(os.tmpdir(),'evidence-loss-unlisted-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 for(const f of await files()){await fs.mkdir(path.dirname(path.join(root,f.path)),{recursive:true});await fs.writeFile(path.join(root,f.path),f.raw);}
 await fs.writeFile(path.join(root,event.incidentReport.missingOriginalPath),'This is not the lost original report.');await assert.rejects(loadEvidenceLossDependencies(root,{now:currentNow}),/even when unlisted/);
 await fs.rm(path.join(root,event.incidentReport.missingOriginalPath));await fs.rm(path.join(root,'scripts/validate-round.mjs'));const allow=path.join(root,'PUBLICATION-MANIFEST.txt');await fs.writeFile(allow,(await fs.readFile(allow,'utf8')).replace('scripts/validate-round.mjs\n',''));await assert.rejects(buildBank(root),/registry dependency/);
 for(const p of ['docs/release-blocks/trust.json',pin.path,event.sourceLedger.path]){await fs.rm(path.join(root,p));await fs.writeFile(allow,(await fs.readFile(allow,'utf8')).replace(p+'\n',''));}await assert.rejects(buildBank(root),/mandatory registry tail/);
});

test('a warm exact-byte denial cache never masks subsequent authority tampering or impossible chronology',async t=>{
 const f=await synthetic(t);const payload=json({ordinary:'safe'});assert.doesNotThrow(()=>f.api.assertEvidenceLossPayload(payload,'docs/safe.json'));await fs.appendFile(path.join(f.root,f.pin.path),' ');assert.throws(()=>f.api.assertEvidenceLossPayload(payload,'docs/safe.json'),/tampered/);
 const extra=await synthetic(t,'2026-10-06T09:10:00Z',{unreviewedExtra:'must not leak raw content'});assert.throws(()=>extra.api.assertEvidenceLossPayload(payload,'docs/safe.json'),/unexpected registry\/event fields/);
 const early=await synthetic(t,'2026-10-06T08:55:00Z');assert.equal(early.api.validateEvidenceLossCampaign([early.r],{ledgerSources:new Map([[early.r.roundId,early.rRaw]]),now:Date.parse('2026-10-06T09:30:00Z')}).ok,false);
});

function emptyNext(){
 const r=clone(ledger);Object.assign(r,{roundId:'round-024',startedAt:'2026-10-06T15:00:00Z',decisionDeadline:'2026-10-06T18:30:00Z',closedAt:'2026-10-06T15:05:00Z',candidates:[],validation:[],nextRoundGaps:[],noGapExplanation:'Synthetic test only: independently scoped source survey found no candidate ready for release.',summary:'Synthetic next-occurrence simulation. No real content authored or reviewed.'});Object.assign(r.counts,{registered:0,accepted:0,rejected:0,pending:0});r.publication={status:'not_attempted',bankVersion:null,bankSha256:null,commit:null,verifiedAt:null,url:null,blockers:[]};return r;
}
test('complete campaign accepts an unrelated next scheduled024 from actual delivered022',async()=>{
 const c=await context(),next=emptyNext(),fixtureNow=Date.parse('2026-10-06T15:30:00Z');
 // Explicit historical simulation, not a reload of the current source at a past clock.
 // Derive the active manifest and bank inventory from the verified delivered predecessor.
 const predecessorRaw=c.deliveryCheckpointSources.get(ledger.baseline.offlinePredecessor.roundId);assert(predecessorRaw);
 const predecessor=JSON.parse(predecessorRaw),manifest=JSON.parse(predecessor.runtimeManifestRaw);
 assert.equal(predecessor.deltaArtifactSha256,ledger.baseline.offlinePredecessor.artifactSha256);assert.equal(manifest.bankVersion,bank22.bankVersion);assert.equal(manifest.sha256,ledger.baseline.bankSha256);assert(Date.parse(predecessor.verifiedAt)<=fixtureNow);
 const historical=c.ledgers.filter(r=>Date.parse(r.startedAt)<=Date.parse(ledger.startedAt)),historicalIds=new Set(historical.map(r=>r.roundId));assert(historicalIds.has(ledger.roundId));assert(!historicalIds.has(next.roundId));
 const bankEntries=predecessor.completeManifest.files.filter(f=>/^data\/releases\/[^/]+\/bank\.json$/.test(f.path)),banks=new Map();
 for(const entry of bankEntries){const version=entry.path.split('/')[2],bank=c.banks.get(version);assert(bank);assert.equal(sha(bank.raw),entry.sha256);assert.equal(bank.raw.length,entry.bytes);banks.set(version,bank);}
 const ledgers=[...historical,next],ledgerSources=new Map([...c.ledgerSources].filter(([id])=>historicalIds.has(id)));ledgerSources.set(next.roundId,json(next));
 const args={...c,manifest,banks,now:fixtureNow,ledgerSources,editorials:c.editorials.filter(e=>Date.parse(e.startedAt)<=fixtureNow),synchronizations:c.synchronizations.filter(s=>Date.parse(s.verifiedAt)<=fixtureNow),offlineBases:new Map([...c.offlineBases].filter(([,b])=>Date.parse(b.eligibleAt)<=fixtureNow)),deliveryCheckpointSources:new Map([...c.deliveryCheckpointSources].filter(([,raw])=>Date.parse(JSON.parse(raw).verifiedAt)<=fixtureNow)),publicationState:JSON.parse(predecessor.publicationStateRaw),availableFiles:new Set([...c.availableFiles,'docs/rounds/round-024.md'])};
 const result=validateRoundLedgers(ledgers,args);assert.equal(result.ok,true,result.errors.join('\n'));const release=validateReleaseLedger(ledgers,args);assert.equal(release.ok,true,release.errors.join('\n'));assert.equal(next.baseline.offlinePredecessor.roundId,'round-022');
});
test('first024 content delta may carry exact reservation-only023 history beside its one active ledger',()=>{
 const r=emptyNext(),b={...clone(bank22),bankVersion:'synthetic-regular.24',releasedAt:'2026-10-06T15:06:00Z'},bankRaw=json(b);r.publication.bankVersion=b.bankVersion;r.publication.bankSha256=sha(bankRaw);
 const meta=(p,raw)=>({path:p,beforeSha256:null,sha256:sha(raw),bytes:raw.length,raw});const entries=[meta(event.sourceLedger.path,ledgerRaw),meta('docs/rounds/round-024.json',json(r)),meta(`data/releases/${b.bankVersion}/bank.json`,bankRaw)];
 const baseCommit='a'.repeat(40),manifest={schemaVersion:1,kind:'developer_patch_not_learner_import',deliveryMode:'download_only',deliveryScope:'content',reportingEvidence:null,roundId:r.roundId,executionId:'synthetic-024',baseCommit,baseVerifiedAt:'2026-10-06T15:00:00Z',parentDeliverySha256:null,permissionNotifiedAt:'2026-10-06T15:00:00Z',permissionDeadlineAt:'2026-10-06T15:10:00Z',gitStoppedAt:'2026-10-06T15:10:00Z',gitOutcome:reconcileGitOutcome({baseCommit,observedHead:baseCommit,observedAt:'2026-10-06T15:10:01Z',refWrite:'not_submitted',objects:'none'}),newlyPublishedRegular:0,files:entries.map(({raw,...f})=>f),deletions:[]};
 const receipt=createDeliveryReceipt({snapshot:{manifest,files:entries},artifact:{sha256:'c'.repeat(64)},recordedAt:'2026-10-06T15:11:00Z'});assert.equal(receipt.content.roundId,'round-024');assert.deepEqual(receipt.content.acceptedGoalIds,[]);assert.equal(receipt.status,'prepared');
 const other=meta('docs/rounds/round-025.json',json({...r,roundId:'round-025'}));assert.throws(()=>createDeliveryReceipt({snapshot:{manifest:{...manifest,files:[...manifest.files,(({raw,...f})=>f)(other)]},files:[...entries,other]},artifact:{sha256:'d'.repeat(64)},recordedAt:'2026-10-06T15:11:00Z'}),/exactly one active ledger/);
});
