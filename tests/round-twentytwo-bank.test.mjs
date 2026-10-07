import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as d from '../src/domain.js';
import * as w from '../src/workflows.js';
import {exportBackup,parseBackup} from '../src/backup.js';
import {nextScheduledRoundAt} from '../scripts/validate-round.mjs';
import {validateQuarantineCampaign,assertNoQuarantinedContent} from '../scripts/prepublication-quarantine.mjs';
const raw=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const read=p=>JSON.parse(raw(p));
const hash=b=>createHash('sha256').update(b).digest('hex');
const oldPath='data/releases/2026.10.06-regular.21/bank.json';
const before=read(oldPath),ledger=read('docs/rounds/round-022.json');
const bank=read(`data/releases/${ledger.publication.bankVersion}/bank.json`);
const oldIds=new Set(before.questions.map(q=>q.questionId));
const added=bank.questions.filter(q=>!oldIds.has(q.questionId));
const accepted=ledger.candidates.filter(c=>c.decision==='accepted');
const ledgerSources=new Map(fs.readdirSync(new URL('../docs/rounds/',import.meta.url)).filter(n=>/^round-\d+\.json$/.test(n)).map(n=>{const raw=fs.readFileSync(new URL('../docs/rounds/'+n,import.meta.url));return [JSON.parse(raw).roundId,raw];}));
const allLedgers=[...ledgerSources.values()].map(b=>JSON.parse(b));
const allBanks=new Map(fs.readdirSync(new URL('../data/releases/',import.meta.url),{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>[x.name,{raw:fs.readFileSync(new URL('../data/releases/'+x.name+'/bank.json',import.meta.url))}]));
const quarantineResult=validateQuarantineCampaign(allLedgers,{banks:allBanks,ledgerSources,now:Date.now(),manifest:read('data/manifest.json'),publicationState:read('data/publication-state.json')});
assert(quarantineResult.ok,quarantineResult.errors.join('\n'));
const disposition=quarantineResult.dispositions.get('round-022');
const held=new Set(disposition.quarantinedCandidateIds);
const eligible=accepted.filter(c=>disposition.eligibleCandidateIds.includes(c.candidateId));
const answer=item=>item.type==='written'?item.correctOptionId:Object.fromEntries(item.parts.map(p=>[p.partId,p.kind==='text'?p.accepted[0]:p.kind==='single'?p.correct[0]:[...p.correct].reverse()]));
const normalize=s=>s.normalize('NFKC').replace(/\s+/g,' ').trim();

test('round022 preserves all825 old objects,14 seeds, sources, options and editorial revisions',()=>{
 assert.equal(hash(raw(oldPath)),'da5181bc4f2987dfeb8ea487e8004134fecb36b178b031a04161c1339a38f7d7');
 assert.equal(before.questions.length,825);assert.equal(before.questions.filter(q=>!q.testOnly).length,811);
 for(const [field,key] of [['questions','questionId'],['options','optionId'],['sources','id']]){
  const current=new Map(bank[field].map(x=>[x[key],x]));
  assert.equal(current.size,bank[field].length);
  for(const old of before[field])assert.deepEqual(current.get(old[key]),old);
 }
 assert.equal(bank.questions.filter(q=>q.testOnly).length,14);
 for(const field of ['subjects','corrections','syllabusVersion'])assert.deepEqual(bank[field],before[field]);
});

test('round022 contains exactly validated eligible additions while held acceptance remains immutable',()=>{
 assert.equal(ledger.status,'closed');assert.equal(ledger.counts.pending,0);
 assert.equal(ledger.counts.registered,ledger.candidates.length);
 assert.equal(ledger.counts.registered,ledger.counts.accepted+ledger.counts.rejected);
 assert.equal(ledger.counts.accepted,accepted.length);
 assert.deepEqual(new Set(added.map(q=>q.questionId)),new Set(eligible.map(c=>c.questionId)));
 assert.equal(bank.questions.filter(q=>!q.testOnly).length,811+eligible.length);
 assert.equal(new Set(bank.questions.map(q=>q.questionId)).size,bank.questions.length);
 assert.equal(new Set(bank.questions.map(q=>q.templateId)).size,bank.questions.length);
 for(const [subject,cap] of Object.entries(ledger.targets.writtenBySubject)){
  assert(Number.isInteger(cap)&&cap>=0&&cap<=10);
  assert(ledger.candidates.filter(c=>c.type==='written'&&c.subjectId===subject).length<=cap);
 }
 assert(Number.isInteger(ledger.targets.practical)&&ledger.targets.practical>=0&&ledger.targets.practical<=8);
 assert(ledger.candidates.filter(c=>c.type==='practical').length<=ledger.targets.practical);
 for(const c of ledger.candidates){
  assert(['accepted','rejected'].includes(c.decision));assert.equal(c.attemptCount,c.cycles.length);
  assert(c.attemptCount<=3&&c.lineageAttemptCount<=6);assert.equal(c.reopenCount,0);
  const keyExposed=new Set([c.authorId]);
  for(const [i,cy] of c.cycles.entries()){
   assert.equal(cy.cycle,i+1);assert(!keyExposed.has(cy.gates.blindSolve.reviewerId));
   assert(Date.parse(cy.startedAt)>=Date.parse(ledger.startedAt));
   assert(Date.parse(cy.startedAt)<=Date.parse(cy.finishedAt));
   assert(Date.parse(cy.finishedAt)<=Date.parse(ledger.closedAt));
   for(const gate of Object.values(cy.gates))if(gate.result!=='not_run')keyExposed.add(gate.reviewerId);
   if(i<c.cycles.length-1)assert.equal(cy.outcome,'revise');
  }
  if(c.decision==='accepted'){
   if(held.has(c.candidateId)){assert(!added.some(q=>q.questionId===c.questionId));continue;}
   const q=added.find(q=>q.questionId===c.questionId),last=c.cycles.at(-1);
   assert.equal(q.revision,c.revision);assert.equal(q.templateId,c.templateId);
   assert.equal(q.testOnly,false);assert.equal(q.verificationStatus,'published');
   assert.equal(last.outcome,'accepted');assert.equal(last.revision,c.revision);
   assert(Object.values(last.gates).every(g=>g.result==='pass'));
  }else assert(!added.some(q=>q.questionId===c.questionId));
 }
});

test('round022 pins07UTC occurrence, actual47-second start delay and10:30 cutoff',()=>{
 assert.equal(ledger.startedAt,'2026-10-06T07:00:47Z');
 assert.equal(Date.parse(ledger.startedAt)-Date.parse('2026-10-06T07:00:00Z'),47000);
 assert.equal(ledger.manualStartException,undefined);assert.equal(ledger.scheduleSubstitution,undefined);
 assert.equal(ledger.decisionDeadline,'2026-10-06T10:30:00Z');
 assert.equal(nextScheduledRoundAt(ledger.startedAt),Date.parse('2026-10-06T11:00:00Z'));
 assert(Date.parse(ledger.startedAt)<=Date.parse(ledger.closedAt));
 assert(Date.parse(ledger.closedAt)<=Date.parse(ledger.decisionDeadline));
 assert(Date.parse(bank.releasedAt)>=Date.parse(ledger.closedAt));
 assert.equal(ledger.baseline.sourceCommit,'04dcdf53384590a12159601d76029b1b8a13bb4f');
 assert.equal(ledger.baseline.bankVersion,before.bankVersion);
 assert.equal(ledger.baseline.bankSha256,hash(raw(oldPath)));
 assert.deepEqual(ledger.baseline.regularWrittenBySubject,{s1:112,s2:178,s3:154,s4:169,s5:126});
 assert.equal(ledger.baseline.regularPractical,72);
});

test('round022 pins exact delivered021 predecessor without rewriting public017 or unknown history',()=>{
 const proofPath='docs/deliveries/chains/public-regular17/round-021.json',proof=read(proofPath);
 assert.equal(hash(raw(proofPath)),'1727996883b9277ee2446caf8d52ef85254b4bbf42cfbaa4d44a815e5b39bb17');
 assert.deepEqual(ledger.baseline.offlinePredecessor,{artifactSha256:proof.deltaArtifactSha256,manifestSha256:proof.receipt.manifestSha256,ledgerSha256:proof.receipt.content.ledgerSha256,roundId:'round-021'});
 assert.equal(proof.receipt.status,'delivered');assert(Date.parse(proof.verifiedAt)<Date.parse(ledger.startedAt));
 assert.equal(proof.receipt.content.bankVersion,before.bankVersion);assert.equal(proof.receipt.content.bankSha256,hash(raw(oldPath)));
 assert.equal(hash(raw('docs/rounds/round-021.json')),'9f1cd52e1bc12ea03b8cbcde2679d488e061448bb3c77d9cbc41f46f50613b8a');
 assert.equal(proof.deltaManifest.gitOutcome.objects,'unknown');assert.equal(proof.deltaManifest.gitOutcome.refWrite,'not_submitted');
 assert.equal(proof.uncertainty.wait.firstUnresolvedAt,'2026-10-05T16:53:14Z');assert.equal(proof.uncertainty.wait.deadlineAt,'2026-10-05T17:03:14Z');assert.equal(proof.uncertainty.wait.skippedAt,'2026-10-05T17:03:49.145Z');
 const event=read('docs/publications/cumulative-009-017.json');
 assert.equal(hash(raw('docs/publications/cumulative-009-017.json')),'fe147c597a5a5f155d6a65e7e9fd641e6a38f9c8d0db1147f513d1b2943959e2');
 assert.equal(event.manifest.bankVersion,'2026.10.05-regular.17');
});

test('round022 preserves historical acceptance but blocks all19 withheld revisions and orphan additions',()=>{
 assert.equal(disposition.counts.accepted,31);assert.equal(disposition.counts.quarantined,19);assert.equal(disposition.counts.eligible,12);
 assert.equal(accepted.length,31);assert.equal(eligible.length,12);assert.equal(ledger.counts.rejected,1);
 assert.equal(eligible.filter(c=>c.type==='written').length,10);assert.equal(eligible.filter(c=>c.type==='practical').length,2);
 assertNoQuarantinedContent(bank);
 for(const id of held){const c=ledger.candidates.find(c=>c.candidateId===id);assert.equal(c.decision,'accepted');assert.equal(c.cycles.at(-1).outcome,'accepted');assert(!bank.questions.some(q=>q.questionId===c.questionId||q.learningGoalId===c.learningGoalId||q.templateId===c.templateId));}
 const oldOptionIds=new Set(before.options.map(o=>o.optionId)),oldSourceIds=new Set(before.sources.map(s=>s.id));
 for(const o of bank.options.filter(o=>!oldOptionIds.has(o.optionId)))assert(added.some(q=>q.links?.some(l=>l.optionId===o.optionId)));
 for(const source of bank.sources.filter(s=>!oldSourceIds.has(s.id)))assert(added.some(q=>q.sourceRefs.includes(source.id)));
});

test('round022 strict structure and explanations preserve historical exemptions without widening them',()=>{
 d.validateBankForPublication(bank);
 d.validateExplanationAuthoring(bank,read('data/releases/2026.10.02-regular.1/bank.json'));
 const membership=d.optionMembership(bank),oldOptions=new Set(before.options.map(o=>o.optionId));
 for(const o of bank.options)if(!oldOptions.has(o.optionId))assert.deepEqual([...o.memberQuestionIds].sort(),[...membership[o.optionId]].sort());
 for(const q of added.filter(q=>q.type==='written'))for(const link of q.links){
  const option=bank.options.find(o=>o.optionId===link.optionId);
  assert(option.explanation.trim());assert.notEqual(option.explanation.trim(),q.explanation.trim());
  if(link.contextExplanation)assert.notEqual(option.explanation.trim(),link.contextExplanation.trim());
 }
});

test('round022 new written options shuffle, remain unique and grade through stable IDs',()=>{
 const serialized=JSON.stringify(bank);
 for(const q of added.filter(q=>q.type==='written'))for(const count of q.supportedOptionCounts){
  const keyPositions=new Set();
  for(let seed=0;seed<64;seed++){
   const item=d.presentQuestion(bank,q,count,d.rng(seed));
   assert.equal(item.options.length,count);assert.equal(new Set(item.options.map(o=>normalize(o.content))).size,count);
   keyPositions.add(item.options.findIndex(o=>o.optionId===item.correctOptionId));
   for(const o of item.options)assert.equal(d.grade(item,o.optionId).status,o.optionId===item.correctOptionId?'correct':'wrong');
  }
  assert(keyPositions.size>1);
 }
 assert.equal(JSON.stringify(bank),serialized);
});

test('round022 practical shuffle preserves part order and exact key sets without grading free prose',()=>{
 for(const q of added.filter(q=>q.type==='practical'))for(let seed=0;seed<64;seed++){
  const item=d.presentQuestion(bank,q,5,d.rng(seed));
  assert.equal(d.grade(item,answer(item)).status,'correct');
  assert.deepEqual(item.parts.map(p=>p.partId),q.parts.map(p=>p.partId));
  assert.deepEqual(d.grade(item,{...answer(item),freeResponse:'다른 자유 서술'}),d.grade(item,answer(item)));
  for(const p of item.parts){
   const original=q.parts.find(x=>x.partId===p.partId);assert.equal(p.points,original.points);
   if(p.kind==='text')assert.deepEqual(p.accepted,original.accepted);
   else{
    assert.deepEqual(new Set(p.choices.map(c=>c.id)),new Set(original.choices.map(c=>c.id)));
    assert.deepEqual(p.correct,original.correct);
   }
  }
 }
});

test('round022 backup, time conversion and AI boundaries keep exact question and user text',async()=>{
 for(const q of added.filter(q=>q.type==='practical')){
  const config=w.practiceConfig('practical',{count:1});
  let session=d.startSession(d.prepareSession({...bank,questions:[q]},config,[],101,'r022-ai-'+q.questionId),1000);
  const item=session.items[0],saved=JSON.stringify(item),hash=await d.snapshotHash(item);
  const response='  원문\n <script>텍스트</script> Ａ  ';
  assert.equal(d.canShowExplanation(session,item),false);
  assert.throws(()=>d.createPrompt(session,item,{includeReference:true}));
  session=d.setAnswer(session,item.instanceId,{...answer(item),freeResponse:response},1001);
  const prompt=d.createPrompt(session,item,{includeReference:false});
  assert(prompt.includes(response));assert(!prompt.includes('고정 답안 참고 키 시작'));
  assert(!d.createPrompt(session,item,{includeReference:false,blank:true}).includes(response));
  session=d.confirmAnswer(session,item.instanceId,1002);
  const restored=parseBackup(exportBackup([session])).sessions[0];
  assert.deepEqual(restored,session);assert.equal(JSON.stringify(restored.items[0]),saved);
  assert.equal(await d.snapshotHash(restored.items[0]),hash);
  assert(d.createPrompt(restored,restored.items[0],{includeReference:true}).includes(item.referenceAnswer));
  const timed=d.startSession(d.prepareSession({...bank,questions:[q]},{...config,mode:'timed'},[],101,'r022-timed-'+q.questionId),1000);
  for(const includeReference of [true,false])assert.throws(()=>d.createPrompt(timed,timed.items[0],{includeReference}));
  const converted=d.convertToUntimed(timed,'r022-converted-'+q.questionId,1001);
  assert.deepEqual(converted.next.items,timed.items);assert.equal(converted.old.attempts.length,0);
 }
});

test('round022 balanced100 mocks exclude seeds and scarce regular selections never top up',()=>{
 assert.equal(w.mockAvailability(bank).ready,true);
 for(let seed=0;seed<16;seed++){
  const s=d.prepareSession(bank,w.practiceConfig('written',{kind:'mock',count:100}),[],seed,'r022-mock-'+seed);
  assert.equal(s.items.length,100);assert(s.items.every(q=>q.type==='written'&&!q.testOnly&&q.options.length===5));
  assert.equal(new Set(s.items.map(q=>q.templateId)).size,100);
  for(const id of ['s1','s2','s3','s4','s5'])assert.equal(s.items.filter(q=>q.subjectId===id).length,20);
 }
 for(const id of ['s1','s2','s3','s4','s5']){
  const config=w.practiceConfig('written',{subjectId:id,count:1}),selected=w.practiceSelection(bank,config);
  assert(selected.bank.questions.every(q=>!q.testOnly));
  assert.throws(()=>d.prepareSession(selected.bank,{...config,count:selected.count+1},[],2,'r022-too-many-'+id),e=>e.code==='INSUFFICIENT');
 }
});

test('round022 keeps new accepted totals separate from684 actually public baseline items',()=>{
 if(ledger.publication.status==='verified')return;
 assert.equal(ledger.publication.status,'not_attempted');assert.equal(ledger.publication.commit,null);
 assert.equal(ledger.publication.verifiedAt,null);assert.equal(ledger.counts.publishedRegularPractical,0);
 assert(Object.values(ledger.counts.publishedRegularWrittenBySubject).every(n=>n===0));
 assert.deepEqual(ledger.coverageAfter.regularWrittenBySubject,{s1:98,s2:148,s3:128,s4:138,s5:103});
 assert.equal(ledger.coverageAfter.regularPractical,69);
 for(const c of ledger.candidates)assert.equal(c.publishedBankVersion,null);
});

test('round022 does not reopen terminal rejected goals or duplicate prior goal identities',()=>{
 for(let n=1;n<=21;n++){
  const old=read(`docs/rounds/round-${String(n).padStart(3,'0')}.json`);
  for(const c of old.candidates){
   assert(!ledger.candidates.some(x=>x.learningGoalId===c.learningGoalId||x.templateId===c.templateId));
   if(c.decision==='rejected')assert(!bank.questions.some(q=>q.questionId===c.questionId));
  }
 }
});
