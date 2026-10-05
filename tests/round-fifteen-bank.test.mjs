import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as d from '../src/domain.js';
import * as w from '../src/workflows.js';
import {exportBackup,parseBackup} from '../src/backup.js';
import {nextScheduledRoundAt} from '../scripts/validate-round.mjs';
const raw=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const read=p=>JSON.parse(raw(p));
const hash=b=>createHash('sha256').update(b).digest('hex');
const oldPath='data/releases/2026.10.05-regular.14/bank.json';
const before=read(oldPath),ledger=read('docs/rounds/round-015.json');
const bank=read(`data/releases/${ledger.publication.bankVersion}/bank.json`);
const oldIds=new Set(before.questions.map(q=>q.questionId));
const added=bank.questions.filter(q=>!oldIds.has(q.questionId));
const accepted=ledger.candidates.filter(c=>c.decision==='accepted');
const answer=item=>item.type==='written'?item.correctOptionId:Object.fromEntries(item.parts.map(p=>[p.partId,p.kind==='text'?p.accepted[0]:p.kind==='single'?p.correct[0]:[...p.correct].reverse()]));
const normalize=s=>s.normalize('NFKC').replace(/\s+/g,' ').trim();

test('round015 preserves all604 old objects,14 seeds, sources, options and editorial revisions',()=>{
 assert.equal(hash(raw(oldPath)),'26221e173dd1d0ebd65195401375fff1689059227bb8eacc2b00e52d4c1f3607');
 assert.equal(before.questions.length,604);assert.equal(before.questions.filter(q=>!q.testOnly).length,590);
 for(const [field,key] of [['questions','questionId'],['options','optionId'],['sources','id']]){
  const current=new Map(bank[field].map(x=>[x[key],x]));
  assert.equal(current.size,bank[field].length);
  for(const old of before[field])assert.deepEqual(current.get(old[key]),old);
 }
 assert.equal(bank.questions.filter(q=>q.testOnly).length,14);
 for(const field of ['subjects','corrections','syllabusVersion'])assert.deepEqual(bank[field],before[field]);
});

test('round015 contains exactly terminal accepted additions within registered ceilings',()=>{
 assert.equal(ledger.status,'closed');assert.equal(ledger.counts.pending,0);
 assert.equal(ledger.counts.registered,ledger.candidates.length);
 assert.equal(ledger.counts.registered,ledger.counts.accepted+ledger.counts.rejected);
 assert.equal(ledger.counts.accepted,accepted.length);
 assert.deepEqual(new Set(added.map(q=>q.questionId)),new Set(accepted.map(c=>c.questionId)));
 assert.equal(bank.questions.filter(q=>!q.testOnly).length,590+accepted.length);
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
   const q=added.find(q=>q.questionId===c.questionId),last=c.cycles.at(-1);
   assert.equal(q.revision,c.revision);assert.equal(q.templateId,c.templateId);
   assert.equal(q.testOnly,false);assert.equal(q.verificationStatus,'published');
   assert.equal(last.outcome,'accepted');assert.equal(last.revision,c.revision);
   assert(Object.values(last.gates).every(g=>g.result==='pass'));
  }else assert(!added.some(q=>q.questionId===c.questionId));
 }
});

test('round015 pins03UTC scheduled occurrence, actual11-second delay and06:30 cutoff',()=>{
 assert.equal(ledger.startedAt,'2026-10-05T03:00:11Z');
 assert.equal(Date.parse(ledger.startedAt)-Date.parse('2026-10-05T03:00:00Z'),11000);
 assert.equal(ledger.manualStartException,undefined);assert.equal(ledger.scheduleSubstitution,undefined);
 assert.equal(ledger.decisionDeadline,'2026-10-05T06:30:00Z');
 assert.equal(nextScheduledRoundAt(ledger.startedAt),Date.parse('2026-10-05T07:00:00Z'));
 assert(Date.parse(ledger.startedAt)<=Date.parse(ledger.closedAt));
 assert(Date.parse(ledger.closedAt)<=Date.parse(ledger.decisionDeadline));
 assert(Date.parse(bank.releasedAt)>=Date.parse(ledger.closedAt));
 assert.equal(ledger.baseline.sourceCommit,'500811b7ee226f33cfb598df42c6cb347b935d28');
 assert.equal(ledger.baseline.bankVersion,before.bankVersion);
 assert.equal(ledger.baseline.bankSha256,hash(raw(oldPath)));
 assert.deepEqual(ledger.baseline.regularWrittenBySubject,{s1:83,s2:127,s3:109,s4:115,s5:92});
 assert.equal(ledger.baseline.regularPractical,64);
});

test('round015 pins exact delivered014 predecessor, checkpoint and immutable trust prefix',()=>{
 assert.deepEqual(ledger.baseline.offlinePredecessor,{
  artifactSha256:'81c0945ad2f119196a8062eae9ff9dfa766093c1697622ca1004ab6c2343677c',
  manifestSha256:'1a060239b508db56146899580081ec897f34d997e92230df9187d1857d7383ff',
  ledgerSha256:'4f2550ec833980ac3c412cbfb1062e80e9475d37a4795abfbbc1184b2984ecd9',roundId:'round-014'
 });
 assert.equal(hash(raw('docs/rounds/round-014.json')),ledger.baseline.offlinePredecessor.ledgerSha256);
 const p='docs/deliveries/checkpoints/round-014.json',proof=read(p),trust=read('docs/deliveries/release-backup-trust.json');
 assert.equal(hash(raw(p)),'6dd039b325a7d278a69d5c78ec094f79fd16261e5fbaad905921bc74849e6370');
 assert.equal(proof.verifiedAt,'2026-10-05T01:44:49.485Z');
 assert(Date.parse(proof.verifiedAt)<Date.parse(ledger.startedAt));
 assert.deepEqual(trust.checkpoints.slice(0,5).map(x=>[x.roundId,x.sha256,x.predecessorProofSha256]),[
  ['round-010','a00f2b35b2a63a171097bf0535d7968584f6dc40a9411b401f432e1d884dd917','09d3204e96048f6d8ff57dd4616caa8c95d161690e2a4592e3fa090142604f9e'],
  ['round-011','7eae43bdc8b68b43d76264a14a19ca16e27e180b4f3a0d99afc9776e43f24714','a00f2b35b2a63a171097bf0535d7968584f6dc40a9411b401f432e1d884dd917'],
  ['round-012','9f8746a287d6970110f6931d8d689eb04f35b8616076148eaa4cfff0c4b7f1cd','7eae43bdc8b68b43d76264a14a19ca16e27e180b4f3a0d99afc9776e43f24714'],
  ['round-013','47ffa61415346b88943a1cbc7ca2ad97a851ab3b102c21a90f0af74510500e1b','9f8746a287d6970110f6931d8d689eb04f35b8616076148eaa4cfff0c4b7f1cd'],
  ['round-014','6dd039b325a7d278a69d5c78ec094f79fd16261e5fbaad905921bc74849e6370','47ffa61415346b88943a1cbc7ca2ad97a851ab3b102c21a90f0af74510500e1b']
 ]);
 assert.equal(proof.origin.gitOutcome.objects,'unknown');
 assert.equal(proof.origin.reconciliation.state,'skip_git_step');
 assert.equal(proof.origin.reconciliation.firstUnresolvedAt,'2026-10-04T10:02:05.215Z');
 assert.equal(proof.origin.reconciliation.deadlineAt,'2026-10-04T10:12:05.215Z');
});

test('round015 strict structure and explanations preserve historical exemptions without widening them',()=>{
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

test('round015 new written options shuffle, remain unique and grade through stable IDs',()=>{
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

test('round015 practical shuffle preserves part order and exact key sets without grading free prose',()=>{
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

test('round015 backup, time conversion and AI boundaries keep exact question and user text',async()=>{
 for(const q of added.filter(q=>q.type==='practical')){
  const config=w.practiceConfig('practical',{count:1});
  let session=d.startSession(d.prepareSession({...bank,questions:[q]},config,[],101,'r015-ai-'+q.questionId),1000);
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
  const timed=d.startSession(d.prepareSession({...bank,questions:[q]},{...config,mode:'timed'},[],101,'r015-timed-'+q.questionId),1000);
  for(const includeReference of [true,false])assert.throws(()=>d.createPrompt(timed,timed.items[0],{includeReference}));
  const converted=d.convertToUntimed(timed,'r015-converted-'+q.questionId,1001);
  assert.deepEqual(converted.next.items,timed.items);assert.equal(converted.old.attempts.length,0);
 }
});

test('round015 balanced100 mocks exclude seeds and scarce regular selections never top up',()=>{
 assert.equal(w.mockAvailability(bank).ready,true);
 for(let seed=0;seed<16;seed++){
  const s=d.prepareSession(bank,w.practiceConfig('written',{kind:'mock',count:100}),[],seed,'r015-mock-'+seed);
  assert.equal(s.items.length,100);assert(s.items.every(q=>q.type==='written'&&!q.testOnly&&q.options.length===5));
  assert.equal(new Set(s.items.map(q=>q.templateId)).size,100);
  for(const id of ['s1','s2','s3','s4','s5'])assert.equal(s.items.filter(q=>q.subjectId===id).length,20);
 }
 for(const id of ['s1','s2','s3','s4','s5']){
  const config=w.practiceConfig('written',{subjectId:id,count:1}),selected=w.practiceSelection(bank,config);
  assert(selected.bank.questions.every(q=>!q.testOnly));
  assert.throws(()=>d.prepareSession(selected.bank,{...config,count:selected.count+1},[],2,'r015-too-many-'+id),e=>e.code==='INSUFFICIENT');
 }
});

test('round015 keeps delivered learning totals separate from403 actually public regular items',()=>{
 if(ledger.publication.status==='verified')return;
 assert.equal(ledger.publication.status,'not_attempted');assert.equal(ledger.publication.commit,null);
 assert.equal(ledger.publication.verifiedAt,null);assert.equal(ledger.counts.publishedRegularPractical,0);
 assert(Object.values(ledger.counts.publishedRegularWrittenBySubject).every(n=>n===0));
 assert.deepEqual(ledger.coverageAfter.regularWrittenBySubject,{s1:61,s2:76,s3:72,s4:78,s5:69});
 assert.equal(ledger.coverageAfter.regularPractical,47);
 for(const c of ledger.candidates)assert.equal(c.publishedBankVersion,null);
});

test('round015 does not reopen terminal rejected goals or duplicate prior goal identities',()=>{
 for(let n=1;n<=14;n++){
  const old=read(`docs/rounds/round-${String(n).padStart(3,'0')}.json`);
  for(const c of old.candidates){
   assert(!ledger.candidates.some(x=>x.learningGoalId===c.learningGoalId||x.templateId===c.templateId));
   if(c.decision==='rejected')assert(!bank.questions.some(q=>q.questionId===c.questionId));
  }
 }
});
