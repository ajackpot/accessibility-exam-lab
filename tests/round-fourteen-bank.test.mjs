import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash}from'node:crypto';
import * as d from '../src/domain.js';
import * as w from '../src/workflows.js';
import {exportBackup,parseBackup}from'../src/backup.js';
import {nextScheduledRoundAt}from'../scripts/validate-round.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),oldRaw=read('data/releases/2026.10.05-regular.13/bank.json'),before=JSON.parse(oldRaw),ledger=JSON.parse(read('docs/rounds/round-014.json')),bank=JSON.parse(read('data/releases/'+ledger.publication.bankVersion+'/bank.json'));
const oldIds=new Set(before.questions.map(q=>q.questionId)),added=bank.questions.filter(q=>!oldIds.has(q.questionId)),accepted=ledger.candidates.filter(c=>c.decision==='accepted');
const answer=q=>q.type==='written'?q.correctOptionId:Object.fromEntries(q.parts.map(p=>[p.partId,p.kind==='text'?p.accepted[0]:p.kind==='single'?p.correct[0]:[...p.correct].reverse()]));
const norm=s=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
test('round014 preserves exact013 561regular and14seeds with every source and option',()=>{
 assert.equal(createHash('sha256').update(oldRaw).digest('hex'),'e4ce0f0c47fe71715caaf154ceab90407882b8a4ed4468a9f374927d1f95bbdc');assert.equal(before.questions.filter(q=>!q.testOnly).length,561);
 for(const[field,key]of[['questions','questionId'],['options','optionId'],['sources','id']])for(const old of before[field])assert.deepEqual(bank[field].find(x=>x[key]===old[key]),old);
 assert.deepEqual(bank.corrections,before.corrections);assert.deepEqual(bank.subjects,before.subjects);assert.equal(bank.syllabusVersion,before.syllabusVersion);
 assert.equal(bank.questions.filter(q=>q.testOnly).length,14);assert.equal(ledger.baseline.bankVersion,before.bankVersion);
});
test('round014 adds exactly terminal accepted goals and never pending or rejected items',()=>{
 assert.equal(ledger.status,'closed');assert.equal(ledger.counts.pending,0);assert.equal(ledger.counts.registered,ledger.counts.accepted+ledger.counts.rejected);assert.equal(ledger.counts.registered,ledger.candidates.length);assert.equal(ledger.counts.accepted,accepted.length);assert(ledger.counts.registered<=58);for(const cap of Object.values(ledger.targets.writtenBySubject))assert(Number.isInteger(cap)&&cap>=0&&cap<=10);assert(Number.isInteger(ledger.targets.practical)&&ledger.targets.practical>=0&&ledger.targets.practical<=8);
 for(const [id,cap]of Object.entries(ledger.targets.writtenBySubject))assert(ledger.candidates.filter(c=>c.type==='written'&&c.subjectId===id).length<=cap);assert(ledger.candidates.filter(c=>c.type==='practical').length<=ledger.targets.practical);
 assert.equal(bank.questions.filter(q=>!q.testOnly).length,before.questions.filter(q=>!q.testOnly).length+accepted.length);
 for(const id of ['s1','s2','s3','s4','s5'])assert.equal(added.filter(q=>q.type==='written'&&q.subjectId===id).length,accepted.filter(c=>c.type==='written'&&c.subjectId===id).length);
 assert.equal(added.filter(q=>q.type==='practical').length,accepted.filter(c=>c.type==='practical').length);
 assert.deepEqual(new Set(added.map(q=>q.questionId)),new Set(accepted.map(c=>c.questionId)));assert.equal(new Set(bank.questions.filter(q=>!q.testOnly).map(q=>q.templateId)).size,561+added.length);
 for(const c of ledger.candidates){assert.equal(c.attemptCount,c.cycles.length);assert(c.attemptCount<=3);assert(c.lineageAttemptCount<=6);assert(['accepted','rejected'].includes(c.decision));if(c.decision==='rejected')assert(!bank.questions.some(q=>q.questionId===c.questionId));}
 for(const q of added){const c=accepted.find(c=>c.questionId===q.questionId);assert.equal(q.revision,c.revision);assert.equal(q.verificationStatus,'published');assert.equal(q.testOnly,false);assert.equal(c.cycles.at(-1).outcome,'accepted');assert(Object.values(c.cycles.at(-1).gates).every(g=>g.result==='pass'));assert.notEqual(c.authorId,c.cycles.at(-1).gates.blindSolve.reviewerId);}
});
test('round014 preserves scheduled23UTC occurrence and actual120second delay with02:30deadline',()=>{
 assert.equal(ledger.startedAt,'2026-10-04T23:02:00Z');assert.equal(ledger.manualStartException,undefined);assert.equal(ledger.scheduleSubstitution,undefined);
 assert.equal(Date.parse(ledger.startedAt)-Date.parse('2026-10-04T23:00:00Z'),120000);assert.equal(nextScheduledRoundAt(ledger.startedAt),Date.parse('2026-10-05T03:00:00Z'));
 assert.equal(ledger.decisionDeadline,'2026-10-05T02:30:00Z');assert(Date.parse(ledger.closedAt)>=Date.parse(ledger.startedAt));assert(Date.parse(ledger.closedAt)<=Date.parse(ledger.decisionDeadline));assert(Date.parse(bank.releasedAt)>=Date.parse(ledger.closedAt));
 assert.equal(ledger.baseline.sourceCommit,'500811b7ee226f33cfb598df42c6cb347b935d28');assert(Date.parse(ledger.startedAt)<Date.parse(ledger.decisionDeadline));assert(Date.parse(ledger.decisionDeadline)<nextScheduledRoundAt(ledger.startedAt));
});
test('round014 strict publication/explanation gates preserve old exceptions without extending them',()=>{
 d.validateBankForPublication(bank);d.validateExplanationAuthoring(bank,JSON.parse(read('data/releases/2026.10.02-regular.1/bank.json')));
 for(const q of added.filter(q=>q.type==='written'))for(const l of q.links){const o=bank.options.find(o=>o.optionId===l.optionId);assert(o.explanation.trim());assert.notEqual(q.explanation.trim(),o.explanation.trim());if(l.contextExplanation)assert.notEqual(l.contextExplanation.trim(),o.explanation.trim());}
});
test('round014 source options and randomized keys are immutable with correct membership',()=>{
 const raw=JSON.stringify(bank),membership=d.optionMembership(bank);
 for(const q of added.filter(q=>q.type==='written'))for(const count of q.supportedOptionCounts)for(let seed=0;seed<48;seed++){const item=d.presentQuestion(bank,q,count,d.rng(seed));assert.equal(item.options.length,count);assert.equal(new Set(item.options.map(o=>norm(o.content))).size,count);for(const o of item.options)assert.equal(d.grade(item,o.optionId).status,o.optionId===item.correctOptionId?'correct':'wrong');}
 for(const q of added)for(const l of q.links||[])assert(membership[l.optionId].includes(q.questionId));assert.equal(JSON.stringify(bank),raw);
});
test('round014 practical shuffle preserves part order, text boundaries, keys and backup',()=>{
 for(const q of added.filter(q=>q.type==='practical'))for(let seed=0;seed<48;seed++){const item=d.presentQuestion(bank,q,5,d.rng(seed));assert.equal(d.grade(item,answer(item)).status,'correct');assert.deepEqual(item.parts.map(p=>p.partId),q.parts.map(p=>p.partId));for(const p of item.parts.filter(p=>p.kind!=='text'))assert.deepEqual(new Set(p.choices.map(x=>x.id)),new Set(q.parts.find(x=>x.partId===p.partId).choices.map(x=>x.id)));}
 for(const q of added.filter(q=>q.type==='practical')){const session=d.startSession(d.prepareSession({...bank,questions:[q]},w.practiceConfig('practical',{count:1}),[],103,'r014-preanswer-'+q.questionId),100000),item=session.items[0];assert.equal(d.canShowExplanation(session,item),false);const prompt=d.createPrompt(session,item,{includeReference:false});assert(!prompt.includes('고정 답안 참고 키 시작'));assert(!prompt.includes('참고 서술 답안 시작'));assert.throws(()=>d.createPrompt(session,item,{includeReference:true}));}
 const session=d.startSession(d.prepareSession(bank,w.practiceConfig('practical',{count:2}),[],103,'r014-backup'),100000);assert.deepEqual(parseBackup(exportBackup([session])).sessions[0],session);
});
test('round014 balanced100 mocks remain seedfree and insufficient selections never top up',()=>{
 assert.equal(w.mockAvailability(bank).ready,true);
 for(let seed=0;seed<16;seed++){const s=d.prepareSession(bank,w.practiceConfig('written',{kind:'mock',count:100}),[],seed,'r014-mock-'+seed);assert.equal(s.items.length,100);assert(s.items.every(q=>!q.testOnly&&q.type==='written'&&q.options.length===5));for(const id of ['s1','s2','s3','s4','s5'])assert.equal(s.items.filter(q=>q.subjectId===id).length,20);assert.equal(new Set(s.items.map(q=>q.templateId)).size,100);}
 for(const id of ['s1','s2','s3','s4','s5']){const n=bank.questions.filter(q=>q.subjectId===id&&!q.testOnly).length,c=w.practiceConfig('written',{subjectId:id,count:n+1}),selection=w.practiceSelection(bank,c);assert.equal(selection.count,n);assert.throws(()=>d.prepareSession(selection.bank,c,[],5,'r014-insufficient-'+id),e=>e.code==='INSUFFICIENT');}
});
test('round014 exact delivered013 predecessor and actual public008 coverage stay separate',()=>{
 assert.deepEqual(ledger.baseline.offlinePredecessor,{artifactSha256:'cc51766fb87e627037f99050330c391e1ee56743651f62ea0c47695a9b138bf6',manifestSha256:'422309d8368c78a58b0b4a151902c18818ac97cb27417047c9421adae2e669d4',ledgerSha256:'cbdb8d9d4ea3d7e8f790da64ca5e68bc0b258be66d4578f58972c8a43d021c80',roundId:'round-013'});
 assert.equal(createHash('sha256').update(read('docs/rounds/round-013.json')).digest('hex'),ledger.baseline.offlinePredecessor.ledgerSha256);
 if(ledger.publication.status==='verified')return;assert.equal(ledger.counts.publishedRegularPractical,0);assert(Object.values(ledger.counts.publishedRegularWrittenBySubject).every(n=>n===0));assert.deepEqual(ledger.coverageAfter.regularWrittenBySubject,{s1:61,s2:76,s3:72,s4:78,s5:69});assert.equal(ledger.coverageAfter.regularPractical,47);for(const c of ledger.candidates)assert.equal(c.publishedBankVersion,null);
});
test('round014 does not recreate terminal002,007,008 rejected learning goals',()=>{
 for(const id of ['round-002','round-007','round-008'])for(const c of JSON.parse(read('docs/rounds/'+id+'.json')).candidates.filter(c=>c.decision==='rejected')){assert(!ledger.candidates.some(x=>x.learningGoalId===c.learningGoalId||x.templateId===c.templateId));assert(!bank.questions.some(q=>q.questionId===c.questionId));}
});

test('round014 pins exact delivered013 checkpoint and preserves its immutable trust prefix',()=>{
 const raw=read('docs/deliveries/checkpoints/round-013.json'),hash=createHash('sha256').update(raw).digest('hex'),proof=JSON.parse(raw),trust=JSON.parse(read('docs/deliveries/release-backup-trust.json'));
 assert.equal(hash,'47ffa61415346b88943a1cbc7ca2ad97a851ab3b102c21a90f0af74510500e1b');assert.equal(proof.verifiedAt,'2026-10-04T20:02:59.892Z');assert(Date.parse(proof.verifiedAt)<Date.parse(ledger.startedAt));
 assert.deepEqual(trust.checkpoints.slice(0,4).map(p=>[p.roundId,p.sha256,p.predecessorProofSha256]),[["round-010","a00f2b35b2a63a171097bf0535d7968584f6dc40a9411b401f432e1d884dd917","09d3204e96048f6d8ff57dd4616caa8c95d161690e2a4592e3fa090142604f9e"],["round-011","7eae43bdc8b68b43d76264a14a19ca16e27e180b4f3a0d99afc9776e43f24714","a00f2b35b2a63a171097bf0535d7968584f6dc40a9411b401f432e1d884dd917"],["round-012","9f8746a287d6970110f6931d8d689eb04f35b8616076148eaa4cfff0c4b7f1cd","7eae43bdc8b68b43d76264a14a19ca16e27e180b4f3a0d99afc9776e43f24714"],["round-013","47ffa61415346b88943a1cbc7ca2ad97a851ab3b102c21a90f0af74510500e1b","9f8746a287d6970110f6931d8d689eb04f35b8616076148eaa4cfff0c4b7f1cd"]]);
 assert.equal(proof.origin.gitOutcome.objects,'unknown');assert.equal(proof.origin.reconciliation.state,'skip_git_step');assert.equal(proof.origin.reconciliation.firstUnresolvedAt,'2026-10-04T10:02:05.215Z');assert.equal(proof.origin.reconciliation.deadlineAt,'2026-10-04T10:12:05.215Z');
 assert.deepEqual(ledger.baseline.regularWrittenBySubject,{s1:80,s2:118,s3:104,s4:110,s5:88});assert.equal(ledger.baseline.regularPractical,61);
});
