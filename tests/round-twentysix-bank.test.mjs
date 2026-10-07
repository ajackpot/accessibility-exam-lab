import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as d from '../src/domain.js';
import * as w from '../src/workflows.js';
import {exportBackup,parseBackup} from '../src/backup.js';
import {nextScheduledRoundAt,validateJsonSchema} from '../scripts/validate-round.mjs';
import {assertNoEvidenceLossContent} from '../scripts/evidence-loss-block.mjs';
import {assertNoQuarantinedContent} from '../scripts/prepublication-quarantine.mjs';
const raw=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const read=p=>JSON.parse(raw(p));
const hash=x=>createHash('sha256').update(x).digest('hex');
const oldPath='data/releases/2026.10.06-regular.25/bank.json',before=read(oldPath),ledger=read('docs/rounds/round-026.json'),bank=read('data/releases/2026.10.06-regular.26/bank.json');
const priorIds=new Set(before.questions.map(q=>q.questionId)),added=bank.questions.filter(q=>!priorIds.has(q.questionId)),accepted=ledger.candidates.filter(c=>c.decision==='accepted');
const answer=item=>item.type==='written'?item.correctOptionId:Object.fromEntries(item.parts.map(p=>[p.partId,p.kind==='text'?p.accepted[0]:p.kind==='single'?p.correct[0]:[...p.correct].reverse()]));

test('round026 keeps all866 delivered025 objects,14 seeds, editorial revisions and exact source banks',()=>{
 assert.equal(hash(raw(oldPath)),'5fbd569d6998e3c1850648640f41909cc924a0da37cf197df405fc47db92c8b9');
 assert.equal(before.questions.length,866);assert.equal(before.questions.filter(q=>!q.testOnly).length,852);
 for(const [field,key] of [['questions','questionId'],['options','optionId'],['sources','id']]){
  const map=new Map(bank[field].map(x=>[x[key],x]));assert.equal(map.size,bank[field].length);
  for(const old of before[field])assert.deepEqual(map.get(old[key]),old);
 }
 for(const field of ['subjects','corrections','syllabusVersion'])assert.deepEqual(bank[field],before[field]);
 assert.equal(bank.questions.filter(q=>q.testOnly).length,14);
});

test('round026 contains exactly terminal independently accepted new candidates, within the declared caps',()=>{
 assert.equal(ledger.status,'closed');assert.equal(ledger.counts.pending,0);assert.deepEqual(validateJsonSchema(ledger),[]);
 assert.equal(ledger.counts.registered,ledger.candidates.length);assert.equal(ledger.counts.registered,ledger.counts.accepted+ledger.counts.rejected);assert.equal(ledger.counts.accepted,accepted.length);
 assert(accepted.length>0);assert.deepEqual(new Set(added.map(q=>q.questionId)),new Set(accepted.map(c=>c.questionId)));
 assert.equal(bank.questions.filter(q=>!q.testOnly).length,852+accepted.length);
 assert.equal(new Set(bank.questions.map(q=>q.templateId)).size,bank.questions.length);
 for(const [subject,cap] of Object.entries(ledger.targets.writtenBySubject)){assert.equal(cap,10);assert(ledger.candidates.filter(c=>c.type==='written'&&c.subjectId===subject).length<=cap);}
 assert.equal(ledger.targets.practical,8);assert(ledger.candidates.filter(c=>c.type==='practical').length<=8);
 for(const c of ledger.candidates){
  assert(['accepted','rejected'].includes(c.decision));assert.equal(c.attemptCount,c.cycles.length);assert(c.attemptCount<=3&&c.lineageAttemptCount<=6);assert.equal(c.reopenCount,0);
  const exposed=new Set([c.authorId]);
  for(const [i,cy] of c.cycles.entries()){
   assert.equal(cy.cycle,i+1);assert(!exposed.has(cy.gates.blindSolve.reviewerId));assert(Date.parse(cy.startedAt)>=Date.parse(ledger.startedAt));assert(Date.parse(cy.startedAt)<=Date.parse(cy.finishedAt));assert(Date.parse(cy.finishedAt)<=Date.parse(ledger.closedAt));
   for(const g of Object.values(cy.gates))if(g.result!=='not_run')exposed.add(g.reviewerId);
   if(i<c.cycles.length-1)assert.equal(cy.outcome,'revise');
  }
  if(c.decision==='accepted'){const q=added.find(q=>q.questionId===c.questionId),last=c.cycles.at(-1);assert.equal(q.revision,c.revision);assert.equal(q.templateId,c.templateId);assert.equal(q.verificationStatus,'published');assert.equal(q.testOnly,false);assert.equal(last.outcome,'accepted');assert(Object.values(last.gates).every(g=>g.result==='pass'));}
  else assert(!added.some(q=>q.questionId===c.questionId));
 }
});

test('round026 pins actual23:03 start,02:00 cutoff and genuine delivered025 predecessor',()=>{
 assert.equal(ledger.startedAt,'2026-10-06T23:03:47.278047+00:00');assert.equal(ledger.decisionDeadline,'2026-10-07T02:00:00Z');
 assert.equal(nextScheduledRoundAt(ledger.startedAt),Date.parse('2026-10-07T03:00:00Z'));assert.equal(ledger.manualStartException,undefined);assert.equal(ledger.scheduleSubstitution,undefined);
 assert(Date.parse(ledger.startedAt)<=Date.parse(ledger.closedAt));assert(Date.parse(ledger.closedAt)<=Date.parse(ledger.decisionDeadline));assert(Date.parse(bank.releasedAt)>=Date.parse(ledger.closedAt));
 assert.equal(ledger.baseline.sourceCommit,'04dcdf53384590a12159601d76029b1b8a13bb4f');assert.equal(ledger.baseline.bankVersion,before.bankVersion);assert.equal(ledger.baseline.bankSha256,hash(raw(oldPath)));
 assert.deepEqual(ledger.baseline.regularWrittenBySubject,{s1:115,s2:184,s3:163,s4:182,s5:133});assert.equal(ledger.baseline.regularPractical,75);
 const proof=read('docs/deliveries/chains/public-regular17/round-025.json');assert.equal(proof.receipt.status,'delivered');assert(Date.parse(proof.verifiedAt)<Date.parse(ledger.startedAt));
 assert.deepEqual(ledger.baseline.offlinePredecessor,{artifactSha256:proof.deltaArtifactSha256,manifestSha256:proof.receipt.manifestSha256,ledgerSha256:proof.receipt.content.ledgerSha256,roundId:'round-025'});
 assert.equal(proof.receipt.content.bankSha256,hash(raw(oldPath)));assert.equal(proof.deltaManifest.gitOutcome.objects,'unknown');assert.equal(proof.deltaManifest.gitOutcome.refWrite,'not_submitted');
 assert.equal(proof.uncertainty.wait.firstUnresolvedAt,'2026-10-05T16:53:14Z');assert.equal(proof.uncertainty.wait.deadlineAt,'2026-10-05T17:03:14Z');assert.equal(proof.uncertainty.wait.skippedAt,'2026-10-05T17:03:49.145Z');
});

test('round026 never recycles held022 or evidence-lost023 content, identity or option reservations',()=>{
 assertNoQuarantinedContent(bank);assertNoEvidenceLossContent(bank);
 assert.equal(hash(raw('docs/rounds/round-023.json')),'b1ed48e8bc693774423891bf7a46bf31fcd19e96d55bf18422998c95bdd6cf28');
 const old=read('docs/rounds/round-023.json');assert.equal(old.counts.accepted,17);assert.equal(old.counts.rejected,2);assert.equal(old.candidates.reduce((n,c)=>n+c.attemptCount,0),20);
 for(const c of old.candidates)assert(!added.some(q=>[q.questionId,q.templateId,q.learningGoalId].some(x=>[c.questionId,c.templateId,c.learningGoalId,c.lineageId].includes(x))));
 assert(!fs.existsSync(new URL('../data/releases/2026.10.06-regular.23/bank.json',import.meta.url)));
 const oldOptions=new Set(before.options.map(o=>o.optionId)),oldSources=new Set(before.sources.map(s=>s.id));
 for(const o of bank.options.filter(o=>!oldOptions.has(o.optionId)))assert(added.some(q=>q.links?.some(l=>l.optionId===o.optionId)));
 for(const s of bank.sources.filter(s=>!oldSources.has(s.id)))assert(added.some(q=>q.sourceRefs.includes(s.id)));
});

test('round026 schema and strict explanation authoring retain only exact old exemptions',()=>{
 d.validateBankForPublication(bank);d.validateExplanationAuthoring(bank,read('data/releases/2026.10.02-regular.1/bank.json'));
 const membership=d.optionMembership(bank),oldOptions=new Set(before.options.map(o=>o.optionId));
 for(const o of bank.options)if(!oldOptions.has(o.optionId))assert.deepEqual([...o.memberQuestionIds].sort(),[...membership[o.optionId]].sort());
 for(const q of added){assert(q.explanation.trim());for(const l of q.links||[]){const o=bank.options.find(o=>o.optionId===l.optionId);assert(o.explanation.trim());assert.notEqual(o.explanation.trim(),q.explanation.trim());if(l.contextExplanation)assert.notEqual(o.explanation.trim(),l.contextExplanation.trim());}}
});

test('round026 written and practical presentations shuffle by stable IDs and grade exactly',()=>{
 const serialized=JSON.stringify(bank);
 for(const q of added)for(const count of q.type==='written'?q.supportedOptionCounts:[5]){
  const permutations=new Set();
  for(let seed=0;seed<128;seed++){
   const item=d.presentQuestion(bank,q,count,d.rng(seed));assert.equal(d.grade(item,answer(item)).status,'correct');
   if(q.type==='written'){assert.equal(item.options.length,count);assert.equal(new Set(item.options.map(o=>o.optionId)).size,count);permutations.add(item.options.map(o=>o.optionId).join('|'));for(const o of item.options)assert.equal(d.grade(item,o.optionId).status,o.optionId===item.correctOptionId?'correct':'wrong');}
   else{assert.deepEqual(item.parts.map(p=>p.partId),q.parts.map(p=>p.partId));assert.deepEqual(d.grade(item,{...answer(item),freeResponse:'독자 서술'}),d.grade(item,answer(item)));for(const p of item.parts){const old=q.parts.find(x=>x.partId===p.partId);assert.equal(p.points,old.points);if(p.kind==='text')assert.deepEqual(p.accepted,old.accepted);else{assert.deepEqual(p.correct,old.correct);assert.deepEqual(new Set(p.choices.map(c=>c.id)),new Set(old.choices.map(c=>c.id)));}}}
  }
  if(q.type==='written')assert(permutations.size>1);
 }
 assert.equal(JSON.stringify(bank),serialized);
});

test('round026 snapshots, exact user text, timers and AI disclosure remain unchanged by new data',async()=>{
 for(const q of added){
  const cfg=w.practiceConfig(q.type,{count:1,subjectId:q.subjectId,optionCount:5});let s=d.startSession(d.prepareSession({...bank,questions:[q]},cfg,[],97,q.questionId+'-qa'),1000);
  const item=s.items[0],snapshot=JSON.stringify(item),sha=await d.snapshotHash(item),prose='  원문\n Ａ 한글 <script>텍스트</script>  ';
  assert(!d.canShowExplanation(s,item));if(q.type==='practical')assert.throws(()=>d.createPrompt(s,item,{includeReference:true}));
  s=d.setAnswer(s,item.instanceId,q.type==='practical'?{...answer(item),freeResponse:prose}:answer(item),1001);
  if(q.type==='practical'){const prompt=d.createPrompt(s,item,{includeReference:false});assert(prompt.includes(prose));assert(!prompt.includes('고정 답안 참고 키 시작'));}
  s=d.confirmAnswer(s,item.instanceId,1002);assert.deepEqual(d.confirmAnswer(s,item.instanceId,1003),s);const restored=parseBackup(exportBackup([s])).sessions[0];assert.equal(JSON.stringify(restored),JSON.stringify(s));assert.equal(JSON.stringify(restored.items[0]),snapshot);assert.equal(await d.snapshotHash(restored.items[0]),sha);
  let timed=d.startSession(d.prepareSession({...bank,questions:[q]},{...cfg,mode:'timed',minutes:1},[],97,q.questionId+'-timed'),1000);timed=d.setAnswer(timed,timed.items[0].instanceId,answer(timed.items[0]),1001);if(q.type==='practical')for(const includeReference of [true,false])assert.throws(()=>d.createPrompt(timed,timed.items[0],{includeReference}));
  const changed=d.convertToUntimed(timed,q.questionId+'-untimed',1002);assert.deepEqual(changed.next.items,timed.items);assert.deepEqual(changed.next.answers,timed.answers);const expired=d.finalize(timed,'expired',61001);assert.equal(expired.endedAt,timed.expiresAt);assert.deepEqual(d.finalize(expired,'expired',99999),expired);
 }
});
