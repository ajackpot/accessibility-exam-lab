import {retainHistoricalQuarantinePrefix} from './quarantine-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {quarantineHash,quarantineDecisionHash,quarantineContentHash,quarantineFingerprint} from '../scripts/prepublication-quarantine.mjs';
const ROOT=path.resolve(import.meta.dirname,'..'),sha=x=>createHash('sha256').update(x).digest('hex'),json=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const clone=x=>structuredClone(x),read=p=>fs.readFile(path.join(ROOT,p));
async function write(root,p,raw){await fs.mkdir(path.dirname(path.join(root,p)),{recursive:true});await fs.writeFile(path.join(root,p),raw);}
const trust={schemaVersion:1,kind:'reviewed_prepublication_quarantines',audits:[]};
const seedRaw=await read('data/releases/2026.10.02-seed.4/bank.json'),seed=JSON.parse(seedRaw);
const source=seed.sources[0];
function packageFor(suffix){
 const q=clone(seed.questions.find(q=>q.type==='written'&&q.subjectId==='s1'));
 Object.assign(q,{questionId:'synthetic-'+suffix,templateId:'synthetic-template-'+suffix,learningGoalId:'synthetic-goal-'+suffix,revision:1,testOnly:false,verificationStatus:'candidate',contentStage:'regular_candidate',stem:'Synthetic original '+suffix+' scenario.',explanation:'Synthetic '+suffix+' governing rationale.',sourceRefs:[source.id],reviewNote:'Synthetic fixture, not exam content.'});
 const options=q.links.map((link,i)=>({...clone(seed.options.find(o=>o.optionId===link.optionId)),optionId:q.questionId+'-option-'+i}));
 q.links=q.links.map((l,i)=>({...l,optionId:options[i].optionId,contextExplanation:'',compatibilitySetId:'synthetic-set-'+suffix}));
 return {question:q,options};
}
function candidate(p){const q=p.question;return {candidateId:q.questionId,lineageId:'lineage-'+q.questionId,learningGoalId:q.learningGoalId,subjectId:q.subjectId,type:q.type,questionId:q.questionId,revision:q.revision,templateId:q.templateId,authorId:'synthetic-author',evidence:[{sourceId:source.id,title:source.title,url:source.url,version:source.version,location:source.location,checkedAt:'2026-10-02T05:41:00Z',summary:'Synthetic primary-source check.',rights:'Synthetic fixture.'}],attemptCount:1,lineageAttemptCount:1,reopenCount:0,priorCandidateRefs:[],reopeningEvidence:[],cycles:[{cycle:1,revision:1,startedAt:'2026-10-02T05:42:00Z',finishedAt:'2026-10-02T05:43:00Z',gates:Object.fromEntries(['blindSolve','sourceCheck','ambiguityCheck','authoringAccessibility','structuralCheck'].map(g=>[g,{result:'pass',reviewerId:'synthetic-reviewer-'+g,summary:'Synthetic independent result.',evidenceRefs:[source.id]}])),outcome:'accepted',summary:'Synthetic completed outcome.'}],decision:'accepted',reasonCodes:['accepted_all_gates'],decisionSummary:'Synthetic accepted result.',publishedBankVersion:null};}
async function fixture(t){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'prepublication-quarantine-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 const sourceRoot=path.join(temp,'source'),registrationRoot=path.join(temp,'registration'),root=path.join(temp,'registered');
 const held=packageFor('held'),eligible=packageFor('eligible'),packages=new Map([held,eligible].map(p=>[p.question.questionId,p]));
 const r=JSON.parse(await read('docs/rounds/round-ledger.template.json'));Object.assign(r,{roundId:'round-synthetic',status:'closed',closedAt:'2026-10-02T05:45:00Z',candidates:[candidate(held),candidate(eligible)],summary:'Synthetic quarantine fixture.',noGapExplanation:'Synthetic fixture only.'});
 Object.assign(r.baseline,{sourceCommit:'a'.repeat(40),bankVersion:seed.bankVersion,bankSha256:sha(seedRaw)});Object.assign(r.counts,{registered:2,accepted:2,rejected:0,pending:0});
 const baseManifest={schemaVersion:1,bankVersion:seed.bankVersion,releasedAt:seed.releasedAt,file:`releases/${seed.bankVersion}/bank.json`,sha256:sha(seedRaw),changeSummary:seed.changeSummary,finalRelease:false};
 const prior=[['data/manifest.json',json(baseManifest)],['data/publication-state.json',json({finalized:false})],[`data/releases/${seed.bankVersion}/bank.json`,seedRaw]];
 const listed=['PUBLICATION-MANIFEST.txt',...prior.map(([p])=>p)];prior.push(['PUBLICATION-MANIFEST.txt',Buffer.from(listed.join('\n')+'\n')]);for(const [p,raw]of prior)await write(sourceRoot,p,raw);
 const evidenceBytes=new Map(),evidence=['original_author','accepted_review','defect_clarification','independent_release_review'].map(kind=>{const raw=Buffer.from('synthetic private evidence '+kind),s=sha(raw);evidenceBytes.set(s,raw);return {kind,sha256:s};});
 const c=r.candidates[0],target={candidateId:c.candidateId,questionId:c.questionId,revision:c.revision,learningGoalId:c.learningGoalId,templateId:c.templateId,lineageId:c.lineageId,candidateSha256:quarantineHash(c),contentSha256:quarantineContentHash(held.question,held.options),identityFreeSha256:quarantineFingerprint(held.question,held.options),exclusiveOptionIds:held.options.map(o=>o.optionId),targetPaths:['/question/explanation'],reasonCode:'synthetic_rationale_defect',reason:'Synthetic release-safety fixture only.',evidence};
 const audit={schemaVersion:1,kind:'pre_first_release_quarantine',auditId:'synthetic-safety',campaignId:r.campaignId,roundId:r.roundId,recordedAt:'2026-10-02T05:45:30Z',sourceDecisionSha256:quarantineDecisionHash(r),previousAuditSha256:null,priorTrustSha256:sha(json(trust)),boundary:{observedAt:'2026-10-02T05:45:00Z',manifestRaw:json(baseManifest).toString(),publicationStateRaw:json({finalized:false}).toString(),deliveredManifestRaw:json(baseManifest).toString(),deliveredPublicationStateRaw:json({finalized:false}).toString(),priorFiles:prior.map(([p,raw])=>({path:p,sha256:sha(raw),bytes:raw.length})),independentReviewSha256:evidence.at(-1).sha256},targets:[target]};
 // Synthetic authority is isolated at the module/filesystem boundary. Production
 // helpers expose no caller-supplied pin, whitelist, Boolean or trust override.
 await fs.cp(path.join(ROOT,'scripts'),path.join(registrationRoot,'scripts'),{recursive:true});await fs.cp(path.join(ROOT,'src'),path.join(registrationRoot,'src'),{recursive:true});
 await fs.copyFile(path.join(ROOT,'package.json'),path.join(registrationRoot,'package.json'));
 await write(registrationRoot,'docs/quarantines/trust.json',json(trust));
 await write(registrationRoot,'docs/deliveries/offline-chain-trust.json',json({schemaVersion:1,kind:'reviewed_independent_offline_chains',checkpoints:[]}));
 await write(registrationRoot,'docs/release-blocks/trust.json',json({schemaVersion:1,kind:'reviewed_evidence_loss_blocks',events:[]}));
 const unregistered=await import(pathToFileURL(path.join(registrationRoot,'scripts/prepublication-quarantine.mjs')));
 const registration={sourceRoot,deliveredRoot:sourceRoot,ledger:clone(r),candidatePackages:packages,evidenceBytes,now:Date.parse('2026-10-02T05:48:00Z')};
 const proposed=await unregistered.reviewQuarantineProposal(audit,registration);assert.equal(proposed.ok,true,proposed.errors.join('\n'));assert.equal(proposed.registered,false);
 await fs.cp(registrationRoot,root,{recursive:true});for(const p of ['docs/rounds/round-ledger.schema.json','docs/corrections/editorial-ledger.schema.json'])await write(root,p,await read(p));
 await write(root,'docs/quarantines/trust.json',json({...trust,audits:[proposed.pin]}));await write(root,proposed.pin.path,json(audit));
 for(const [p,raw]of prior)await write(root,p,raw);
 await write(root,'PUBLICATION-MANIFEST.txt',Buffer.from([...listed,'scripts/prepublication-quarantine.mjs','docs/quarantines/trust.json',proposed.pin.path,'scripts/validate-round.mjs','scripts/evidence-loss-block.mjs','docs/release-blocks/trust.json'].join('\n')+'\n'));
 const api=await import(pathToFileURL(path.join(root,'scripts/prepublication-quarantine.mjs'))),roundApi=await import(pathToFileURL(path.join(root,'scripts/validate-round.mjs'))),delivery=await import(pathToFileURL(path.join(root,'scripts/download-fallback.mjs'))),bankApi=await import(pathToFileURL(path.join(root,'scripts/bank-io.mjs')));
 const bank=clone(seed);Object.assign(bank,{bankVersion:'synthetic-quarantined-release',releasedAt:'2026-10-02T05:46:00Z'});const q=clone(eligible.question);Object.assign(q,{verificationStatus:'published',contentStage:'regular'});bank.questions.push(q);bank.options.push(...clone(eligible.options));const raw=json(bank);
 Object.assign(r.publication,{status:'not_attempted',commit:null,verifiedAt:null,url:null,bankVersion:bank.bankVersion,bankSha256:sha(raw),blockers:[]});
 const manifest={...baseManifest,bankVersion:bank.bankVersion,releasedAt:bank.releasedAt,file:`releases/${bank.bankVersion}/bank.json`,sha256:sha(raw)};
 const context={banks:new Map([[seed.bankVersion,{raw:seedRaw}],[bank.bankVersion,{raw}]]),ledgerSources:new Map([[r.roundId,json(r)]]),now:registration.now,manifest,publicationState:{finalized:false}};
 return {temp,sourceRoot,root,held,eligible,packages,r,audit,target,api,roundApi,delivery,bankApi,unregistered,registration,context,bank,manifest,pin:proposed.pin};
}

test('hashes bind exact content while alias fingerprint ignores every identifier, metadata and choice ordering',()=>{
 const p=packageFor('fingerprint'),q=clone(p.question),options=clone(p.options),before=quarantineFingerprint(q,options),exact=quarantineContentHash(q,options);
 q.questionId='renamed';q.templateId='renamed-template';q.learningGoalId='renamed-goal';q.topicIds=['renamed-topic'];q.sourceRefs=['renamed-source'];q.revision=45;q.reviewNote='renamed review';q.verificationStatus='published';q.contentStage='regular';q.harmlessReviewMetadata={new:true};options[0].extraReviewTag='non-content';
 for(const [i,l]of q.links.entries()){options[i].optionId='renamed-option-'+i;options[i].revision++;l.optionId=options[i].optionId;l.optionRevision++;l.compatibilitySetId='renamed-set';}q.links.reverse();options.reverse();
 assert.equal(quarantineFingerprint(q,options),before);assert.notEqual(quarantineContentHash(q,options),exact);
 q.explanation+=' Meaningful extra text.';assert.notEqual(quarantineFingerprint(q,options),before);
 const practical=clone(seed.questions.find(q=>q.type==='practical'));const fingerprint=quarantineFingerprint(practical,[]);practical.questionId='new';for(const m of practical.materials||[])m.filename='renamed';for(const p of practical.parts){p.partId='renamed-'+p.partId;if(p.choices){const map=new Map(p.choices.map((c,i)=>[c.id,'new-'+i]));p.correct=p.correct?.map(id=>map.get(id));for(const c of p.choices)c.id=map.get(c.id);p.choices.reverse();}}assert.equal(quarantineFingerprint(practical,[]),fingerprint);
});

test('only a registered exact audit yields eligible additions; history and accepted counts remain unchanged',async t=>{
 const f=await fixture(t),before=quarantineHash(f.r);const noTrust=f.unregistered.validateQuarantineCampaign([f.r],f.context);assert.equal(noTrust.dispositions.get(f.r.roundId).eligibleCandidateIds.length,2);
 const result=f.api.validateQuarantineCampaign([f.r],f.context);assert.equal(result.ok,true,result.errors.join('\n'));const d=result.dispositions.get(f.r.roundId);assert.deepEqual(d.counts,{accepted:2,quarantined:1,eligible:1});assert.deepEqual(d.auditSha256s,[f.pin.sha256]);assert.equal(quarantineHash(f.r),before);
 const release=f.roundApi.validateReleaseLedger([f.r],f.context);assert.equal(release.ok,true,release.errors.join('\n'));assert.deepEqual(release.disposition.counts,d.counts);
 const loaded=await f.api.loadQuarantineDependencies(f.root,{ledgers:[f.r],...f.context});assert.deepEqual(loaded.get(f.r.roundId).counts,d.counts);
 for(const mutate of [r=>r.candidates[0].revision++,r=>r.candidates[0].decision='rejected',r=>r.candidates[0].cycles.push(clone(r.candidates[0].cycles[0])),r=>r.candidates[0].publishedBankVersion=f.bank.bankVersion]){const r=clone(f.r);mutate(r);assert.equal(f.api.validateQuarantineCampaign([r],f.context).ok,false);}
 for(const changed of [{now:Date.parse('2026-10-02T05:44:00Z')},{now:Date.parse('2026-10-16T15:00:00Z')},{publicationState:{finalized:true}},{manifest:{...f.manifest,finalRelease:true}}])assert.equal(f.api.validateQuarantineCampaign([f.r],{...f.context,...changed}).ok,false);
});

test('quarantined identities, renamed content, orphan/shared options and historical banks fail closed',async t=>{
 const f=await fixture(t);for(const kind of ['identity','renamed','option','historical']){
  const bank=clone(f.bank),p=clone(f.held);
  if(kind==='renamed'){p.question.questionId='alias';p.question.templateId='alias';p.question.learningGoalId='alias';p.question.sourceRefs=['other'];p.question.reviewNote='other';p.question.revision++;for(const [i,l]of p.question.links.entries()){p.options[i].optionId='alias-'+i;l.optionId='alias-'+i;l.compatibilitySetId='alias';}p.question.links.reverse();p.options.reverse();}
  if(kind!=='option')bank.questions.push(p.question);bank.options.push(...p.options);
  const entries=new Map(f.context.banks);entries.set(kind==='historical'?'historical-held':bank.bankVersion,{raw:json(bank)});
  const checked=f.api.validateQuarantineCampaign([f.r],{...f.context,banks:entries});assert.equal(checked.ok,false,kind);assert.match(checked.errors.join('\n'),/held content|held exclusive/);
 }
 const alias=clone(f.r.candidates[0]);alias.candidateId='alias';alias.questionId='alias';const r=clone(f.r);r.candidates.push(alias);assert.match(f.api.validateQuarantineCampaign([r],f.context).errors.join('\n'),/reintroduced|terminal decision history/);
 const inputs=path.join(f.temp,'held-bank.json'),b=clone(f.bank);b.questions.push(f.held.question);b.options.push(...f.held.options);await fs.writeFile(inputs,json(b));await assert.rejects(f.bankApi.readBankInput(f.root,inputs),/held content/);
});

test('unregistered proposal checks exact private evidence, shared options, previously released content and both freeze markers',async t=>{
 const f=await fixture(t);
 for(const [label,change]of [['wrong hash',a=>a.targets[0].contentSha256='f'.repeat(64)],['wrong identity',a=>a.targets[0].questionId='wrong'],['unknown field',a=>a.targets[0].allow=true],['future',a=>a.recordedAt='2026-10-02T06:00:00Z'],['frozen source',a=>a.boundary.publicationStateRaw='{"finalized":true}'],['frozen delivery',a=>a.boundary.deliveredManifestRaw=JSON.stringify({...JSON.parse(a.boundary.deliveredManifestRaw),finalRelease:true})]]){const a=clone(f.audit);change(a);const checked=await f.unregistered.reviewQuarantineProposal(a,f.registration);assert.equal(checked.ok,false,label);}
 for(const publication of [{...f.registration.ledger.publication,status:'committed_unverified'},{...f.registration.ledger.publication,bankVersion:'already-staged'},{...f.registration.ledger.publication,commit:'a'.repeat(40)}])assert.equal((await f.unregistered.reviewQuarantineProposal(f.audit,{...f.registration,ledger:{...f.registration.ledger,publication}})).ok,false);
 const missing=new Map(f.registration.evidenceBytes);missing.delete(f.target.evidence[0].sha256);assert.equal((await f.unregistered.reviewQuarantineProposal(f.audit,{...f.registration,evidenceBytes:missing})).ok,false);
 const packages=structuredClone(f.packages),other=packages.get(f.eligible.question.questionId),held=packages.get(f.held.question.questionId);other.question.links=clone(held.question.links);other.options=clone(held.options);assert.match((await f.unregistered.reviewQuarantineProposal(f.audit,{...f.registration,candidatePackages:packages})).errors.join('\n'),/overlap/);
 const otherRoot=path.join(f.temp,'changed-delivered');await fs.cp(f.sourceRoot,otherRoot,{recursive:true});await write(otherRoot,'data/publication-state.json',json({finalized:true}));assert.match((await f.unregistered.reviewQuarantineProposal(f.audit,{...f.registration,deliveredRoot:otherRoot})).errors.join('\n'),/freeze markers/);
});

test('missing, modified, unlisted or reordered trust/audit/history cannot authorize omission',async t=>{
 const f=await fixture(t);for(const [label,mutate]of [
  ['missing audit',d=>fs.rm(path.join(d,f.pin.path))],
  ['modified audit',d=>write(d,f.pin.path,json({...f.audit,reason:'unapproved'}))],
  ['removed trust',d=>fs.rm(path.join(d,'docs/quarantines/trust.json'))],
  ['empty prefix',d=>write(d,'docs/quarantines/trust.json',json(trust))],
  ['unlisted proof',async d=>write(d,'PUBLICATION-MANIFEST.txt',(await fs.readFile(path.join(d,'PUBLICATION-MANIFEST.txt'),'utf8')).replace(f.pin.path+'\n',''))],
  ['changed historical bank',d=>write(d,`data/releases/${seed.bankVersion}/bank.json`,Buffer.from('{}'))]
 ]){const d=path.join(f.temp,label.replaceAll(' ','-'));await fs.cp(f.root,d,{recursive:true});await mutate(d);await assert.rejects(f.api.loadQuarantineDependencies(d,{ledgers:[f.r],...f.context}),undefined,label);}
 await assert.rejects(f.api.loadQuarantineDependencies(f.root,{ledgers:[],...f.context}),/original source ledger/);
 assert.equal(f.api.validateQuarantineCampaign([],{...f.context}).ok,false,'current effective audit requires its missing source ledger');
 const historical=f.api.validateQuarantineCampaign([],{banks:new Map([[seed.bankVersion,{raw:seedRaw}]]),now:Date.parse('2026-10-02T05:00:00Z')});assert.equal(historical.ok,true);const missing=new Map(f.context.banks);missing.delete(seed.bankVersion);assert.match(f.api.validateQuarantineCampaign([f.r],{...f.context,banks:missing}).errors.join('\n'),/whole-history/);
});

test('affected release cannot predate its audit, and unrelated release/reporting metadata does not rewrite decisions',async t=>{
 const f=await fixture(t),r=clone(f.r),bank=clone(f.bank);bank.releasedAt='2026-10-02T05:45:00Z';const raw=json(bank),banks=new Map(f.context.banks);banks.set(bank.bankVersion,{raw});r.publication.bankSha256=sha(raw);
 assert.match(f.api.validateQuarantineCampaign([r],{...f.context,banks}).errors.join('\n'),/release predates/);
 const reported=clone(f.r);reported.summary='Updated public report';reported.validation=[];reported.publication.url='https://example.org/synthetic/';reported.candidates[1].publishedBankVersion=reported.publication.bankVersion;
 assert.equal(quarantineDecisionHash(reported),f.audit.sourceDecisionSha256);assert.equal(f.api.validateQuarantineCampaign([reported],f.context).ok,true);
 for(const mutate of [l=>l.closedAt='2026-10-02T05:45:01Z',l=>l.counts.accepted--,l=>l.policy.maxCycles++,l=>l.candidates[1].cycles[0].summary+=' changed']){const l=clone(f.r);mutate(l);assert.match(f.api.validateQuarantineCampaign([l],f.context).errors.join('\n'),/terminal decision history/);}
});

test('offline eligibility excludes only held additions while reserving every original accepted goal',async t=>{
 const f=await fixture(t),ledgerRaw=json(f.r),bankRaw=json(f.bank),artifact='a'.repeat(64),commit='b'.repeat(40),recordedAt='2026-10-02T05:58:00Z',now=Date.parse('2026-10-02T06:09:00Z');
 const files=[{path:`docs/rounds/${f.r.roundId}.json`,beforeSha256:null,sha256:sha(ledgerRaw),bytes:ledgerRaw.length},{path:`data/releases/${f.bank.bankVersion}/bank.json`,beforeSha256:null,sha256:sha(bankRaw),bytes:bankRaw.length}];
 const m={schemaVersion:1,kind:'developer_patch_not_learner_import',deliveryMode:'download_only',deliveryScope:'content',reportingEvidence:null,roundId:f.r.roundId,executionId:'synthetic-execution',baseCommit:commit,baseVerifiedAt:'2026-10-02T05:47:00Z',parentDeliverySha256:null,permissionNotifiedAt:'2026-10-02T05:47:00Z',permissionDeadlineAt:'2026-10-02T05:57:00Z',gitStoppedAt:'2026-10-02T05:57:00Z',gitOutcome:f.delivery.reconcileGitOutcome({baseCommit:commit,observedHead:commit,observedAt:'2026-10-02T05:57:01Z',refWrite:'not_submitted',objects:'none'}),newlyPublishedRegular:0,files,deletions:[]};
 const receipt={receiptSchemaVersion:1,artifactSha256:artifact,parentDeliverySha256:null,roundId:f.r.roundId,executionId:m.executionId,baseCommit:commit,status:'delivered',recordedAt,newlyPublishedRegular:0,content:{roundId:f.r.roundId,ledgerPath:files[0].path,ledgerSha256:sha(ledgerRaw),bankVersion:f.bank.bankVersion,bankSha256:sha(bankRaw),acceptedGoalIds:f.r.candidates.map(c=>c.learningGoalId).sort()},manifestSha256:sha(json(m))};
 const options={manifests:new Map([[artifact,m]]),ledgers:new Map([[f.r.roundId,ledgerRaw]]),banks:new Map([...f.context.banks].map(([v,e])=>[v,e.raw])),now,publicationState:{finalized:false}};
 const checked=f.delivery.validateOfflineContinuation([receipt],options);assert.equal(checked.ok,true,checked.errors.join('\n'));assert.equal(checked.canStartNewContent,true);assert.equal(checked.canPublish,false);assert.equal(checked.newlyPublishedRegular,0);assert.deepEqual(checked.reservedLearningGoalIds,receipt.content.acceptedGoalIds);
 const omitted=clone(receipt);omitted.content.acceptedGoalIds=omitted.content.acceptedGoalIds.filter(v=>v!==f.held.question.learningGoalId);assert.equal(f.delivery.validateDeliveryChain([omitted],options).ok,false);
 const altered=new Map(options.ledgers),r=clone(f.r);r.candidates[0].attemptCount++;altered.set(r.roundId,json(r));assert.equal(f.delivery.validateOfflineContinuation([receipt],{...options,ledgers:altered}).ok,false);
});

test('frozen complete bytes require the same exact audit, original source and eligible content',async t=>{
 const f=await fixture(t),files=[];
 for(const p of ['scripts/validate-round.mjs','scripts/prepublication-quarantine.mjs','docs/quarantines/trust.json',f.pin.path,`data/releases/${seed.bankVersion}/bank.json`])files.push({path:p,raw:await fs.readFile(path.join(f.root,p))});
 files.push({path:`docs/rounds/${f.r.roundId}.json`,raw:json(f.r)},{path:`data/releases/${f.bank.bankVersion}/bank.json`,raw:json(f.bank)},{path:'data/manifest.json',raw:json(f.manifest)},{path:'data/publication-state.json',raw:json({finalized:false})});
 assert.equal(f.api.validateQuarantineSnapshot(files,{now:f.context.now}).ok,true);
 for(const [p,key]of [['data/manifest.json','finalRelease'],['data/publication-state.json','finalized']]){
  assert.throws(()=>f.api.validateQuarantineSnapshot(files.filter(x=>x.path!==p),{now:f.context.now}),/explicit false freeze markers/);
  for(const value of [null,undefined,0,'false']){const altered=files.map(x=>{if(x.path!==p)return x;const v=JSON.parse(x.raw);if(value===undefined)delete v[key];else v[key]=value;return {...x,raw:json(v)};});assert.throws(()=>f.api.validateQuarantineSnapshot(altered,{now:f.context.now}),/explicit false freeze markers/);}
 }

 for(const p of [f.pin.path,`docs/rounds/${f.r.roundId}.json`,'docs/quarantines/trust.json'])assert.throws(()=>f.api.validateQuarantineSnapshot(files.filter(x=>x.path!==p),{now:f.context.now}),/quarantine/);
 const hidden=files.filter(x=>x.path!==f.pin.path).map(x=>x.path==='docs/quarantines/trust.json'?{...x,raw:json(trust)}:x);assert.throws(()=>f.api.validateQuarantineSnapshot(hidden,{now:f.context.now}),/mandatory trusted audit tail/);
 const b=clone(f.bank);b.questions.push(f.held.question);b.options.push(...f.held.options);assert.throws(()=>f.api.validateQuarantineSnapshot(files.map(x=>x.path===`data/releases/${b.bankVersion}/bank.json`?{...x,raw:json(b)}:x),{now:f.context.now}),/held content/);
});

test('registered current source keeps full campaign context through legacy and independent delivery chains',async t=>{
 const registry=JSON.parse(await read('docs/quarantines/trust.json'));
 if(!registry.audits.length){t.skip('No installed audit in this pre-integration synthetic baseline');return;}
 const {loadRoundContext,validateReleaseLedger}=await import('../scripts/validate-round.mjs');
 const {validateOfflineContinuation}=await import('../scripts/download-fallback.mjs');
 const context=await loadRoundContext(ROOT,null,{release:true,now:Date.now()}),gate=validateReleaseLedger(context.ledgers,{...context,now:Date.now()});assert.equal(gate.ok,true,gate.errors.join('\n'));
 for(const pin of registry.audits){const a=JSON.parse(await read(pin.path)),d=context.quarantineDispositions.get(pin.roundId);assert.ok(d?.auditSha256s.includes(pin.sha256));assert.equal(d.counts.eligible,d.counts.accepted-d.counts.quarantined);for(const target of a.targets)assert.ok(d.quarantinedCandidateIds.includes(target.candidateId));}
 const index=JSON.parse(await read('docs/deliveries/offline-chain.json')),manifests=new Map();
 for(const receipt of index.receipts){const m=index.manifests.find(m=>sha(json(m))===receipt.manifestSha256);assert.ok(m);manifests.set(receipt.artifactSha256,m);}
 for(const file of index.ledgerPaths){const raw=await read(file),r=JSON.parse(raw);assert.deepEqual(context.ledgerSources.get(r.roundId),raw,'legacy receipt ledger bytes stay exact');}
 const options={manifests,ledgers:new Map(context.ledgerSources),banks:new Map([...context.banks].map(([v,e])=>[v,e.raw])),now:Date.now(),publicationState:context.publicationState};
 const current=validateOfflineContinuation(index.receipts,options);assert.equal(current.ok,true,current.errors.join('\n'));
 const omitted=new Map(options.ledgers);omitted.delete(registry.audits.at(-1).roundId);assert.match(validateOfflineContinuation(index.receipts,{...options,ledgers:omitted}).errors.join('\n'),/missing original source round/);
 // The independent source chain is separately loaded from its own exact proofs.
 const independent=JSON.parse(await read('docs/deliveries/offline-chain-trust.json'));if(independent.checkpoints.length)assert.ok(context.independentOfflineChains.size>0);
});


test('historical fixture isolation retains exact earlier pins and never edits live authority',async t=>{
 const f=await fixture(t),file=path.join(f.root,'docs/quarantines/trust.json'),before=await fs.readFile(file);
 await assert.rejects(retainHistoricalQuarantinePrefix(ROOT,Date.parse(f.audit.recordedAt)),/disposable temporary/);
 await retainHistoricalQuarantinePrefix(f.root,Date.parse(f.audit.recordedAt));assert.deepEqual(await fs.readFile(file),before);
 await retainHistoricalQuarantinePrefix(f.root,Date.parse(f.audit.recordedAt)-1);assert.deepEqual(JSON.parse(await fs.readFile(file)).audits,[]);await assert.rejects(fs.stat(path.join(f.root,f.pin.path)),{code:'ENOENT'});assert.equal((await fs.readFile(path.join(f.root,'PUBLICATION-MANIFEST.txt'),'utf8')).includes(f.pin.path),false);
});
