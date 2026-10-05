import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash}from'node:crypto';
import * as d from '../src/domain.js';
import * as w from '../src/workflows.js';
import {exportBackup,parseBackup}from'../src/backup.js';
import {nextScheduledRoundAt}from'../scripts/validate-round.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),oldRaw=read('data/releases/2026.10.04-regular.10/bank.json'),before=JSON.parse(oldRaw),bank=JSON.parse(read('data/releases/2026.10.04-regular.11/bank.json')),ledger=JSON.parse(read('docs/rounds/round-011.json'));
const oldIds=new Set(before.questions.map(q=>q.questionId)),added=bank.questions.filter(q=>!oldIds.has(q.questionId)),accepted=ledger.candidates.filter(c=>c.decision==='accepted');
const answer=q=>q.type==='written'?q.correctOptionId:Object.fromEntries(q.parts.map(p=>[p.partId,p.kind==='text'?p.accepted[0]:p.kind==='single'?p.correct[0]:[...p.correct].reverse()]));
const norm=s=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
test('round011 preserves exact010 477regular and14seeds with every source and option',()=>{
 assert.equal(createHash('sha256').update(oldRaw).digest('hex'),'50b6131f1ffb174bf4a459b0a91a2498465c0dccea0e4aee30259f195086b214');assert.equal(before.questions.filter(q=>!q.testOnly).length,477);
 for(const[field,key]of[['questions','questionId'],['options','optionId'],['sources','id']])for(const old of before[field])assert.deepEqual(bank[field].find(x=>x[key]===old[key]),old);
 assert.equal(bank.questions.filter(q=>q.testOnly).length,14);assert.equal(ledger.baseline.bankVersion,before.bankVersion);
});
test('round011 adds exactly terminal accepted goals and never pending or rejected items',()=>{
 assert.equal(ledger.status,'closed');assert.equal(ledger.counts.pending,0);assert.equal(ledger.counts.registered,ledger.counts.accepted+ledger.counts.rejected);assert(ledger.counts.registered<=58);
 assert.deepEqual(new Set(added.map(q=>q.questionId)),new Set(accepted.map(c=>c.questionId)));assert.equal(new Set(bank.questions.filter(q=>!q.testOnly).map(q=>q.templateId)).size,477+added.length);
 for(const c of ledger.candidates){assert.equal(c.attemptCount,c.cycles.length);assert(c.attemptCount<=3);assert(c.lineageAttemptCount<=6);assert(['accepted','rejected'].includes(c.decision));if(c.decision==='rejected')assert(!bank.questions.some(q=>q.questionId===c.questionId));}
 for(const q of added){const c=accepted.find(c=>c.questionId===q.questionId);assert.equal(q.revision,c.revision);assert.equal(q.verificationStatus,'published');assert.equal(q.testOnly,false);assert.equal(c.cycles.at(-1).outcome,'accepted');assert(Object.values(c.cycles.at(-1).gates).every(g=>g.result==='pass'));assert.notEqual(c.authorId,c.cycles.at(-1).gates.blindSolve.reviewerId);}
});
test('round011 uses exact manual011 start and closes before14:30 without consuming15UTC',()=>{
 assert.equal(ledger.startedAt,'2026-10-04T13:08:49Z');assert.equal(ledger.manualStartException.manualStartedAt,ledger.startedAt);assert.equal(ledger.manualStartException.requestedAt,'2026-10-04T12:41:51Z');assert.equal(nextScheduledRoundAt(ledger.startedAt),Date.parse('2026-10-04T15:00:00Z'));assert.equal(ledger.decisionDeadline,'2026-10-04T14:30:00Z');assert(Date.parse(ledger.closedAt)<=Date.parse(ledger.decisionDeadline));assert(Date.parse(bank.releasedAt)>=Date.parse(ledger.closedAt));assert.equal(ledger.baseline.sourceCommit,'500811b7ee226f33cfb598df42c6cb347b935d28');
});
test('round011 strict publication/explanation gates preserve old exceptions without extending them',()=>{
 d.validateBankForPublication(bank);d.validateExplanationAuthoring(bank,JSON.parse(read('data/releases/2026.10.02-regular.1/bank.json')));
 for(const q of added.filter(q=>q.type==='written'))for(const l of q.links){const o=bank.options.find(o=>o.optionId===l.optionId);assert(o.explanation.trim());assert.notEqual(q.explanation.trim(),o.explanation.trim());if(l.contextExplanation)assert.notEqual(l.contextExplanation.trim(),o.explanation.trim());}
});
test('round011 source options and randomized keys are immutable with correct membership',()=>{
 const raw=JSON.stringify(bank),membership=d.optionMembership(bank);
 for(const q of added.filter(q=>q.type==='written'))for(const count of q.supportedOptionCounts)for(let seed=0;seed<48;seed++){const item=d.presentQuestion(bank,q,count,d.rng(seed));assert.equal(item.options.length,count);assert.equal(new Set(item.options.map(o=>norm(o.content))).size,count);for(const o of item.options)assert.equal(d.grade(item,o.optionId).status,o.optionId===item.correctOptionId?'correct':'wrong');}
 for(const q of added)for(const l of q.links||[])assert(membership[l.optionId].includes(q.questionId));assert.equal(JSON.stringify(bank),raw);
});
test('round011 practical shuffle preserves part order, text boundaries, keys and backup',()=>{
 for(const q of added.filter(q=>q.type==='practical'))for(let seed=0;seed<48;seed++){const item=d.presentQuestion(bank,q,5,d.rng(seed));assert.equal(d.grade(item,answer(item)).status,'correct');assert.deepEqual(item.parts.map(p=>p.partId),q.parts.map(p=>p.partId));for(const p of item.parts.filter(p=>p.kind!=='text'))assert.deepEqual(new Set(p.choices.map(x=>x.id)),new Set(q.parts.find(x=>x.partId===p.partId).choices.map(x=>x.id)));}
 const session=d.startSession(d.prepareSession(bank,w.practiceConfig('practical',{count:2}),[],103,'r011-backup'),100000);assert.deepEqual(parseBackup(exportBackup([session])).sessions[0],session);
});
test('round011 balanced100 mocks remain seedfree and insufficient selections never top up',()=>{
 assert.equal(w.mockAvailability(bank).ready,true);
 for(let seed=0;seed<16;seed++){const s=d.prepareSession(bank,w.practiceConfig('written',{kind:'mock',count:100}),[],seed,'r011-mock-'+seed);assert.equal(s.items.length,100);assert(s.items.every(q=>!q.testOnly&&q.type==='written'&&q.options.length===5));for(const id of ['s1','s2','s3','s4','s5'])assert.equal(s.items.filter(q=>q.subjectId===id).length,20);assert.equal(new Set(s.items.map(q=>q.templateId)).size,100);}
 for(const id of ['s1','s2','s3','s4','s5']){const n=bank.questions.filter(q=>q.subjectId===id&&!q.testOnly).length,c=w.practiceConfig('written',{subjectId:id,count:n+1}),selection=w.practiceSelection(bank,c);assert.equal(selection.count,n);assert.throws(()=>d.prepareSession(selection.bank,c,[],5,'r011-insufficient-'+id),e=>e.code==='INSUFFICIENT');}
});
test('round011 exact delivered010 predecessor and actual public008 coverage stay separate',()=>{
 assert.deepEqual(ledger.baseline.offlinePredecessor,{artifactSha256:'2adda630c19c950165a1000fd7c55e38363f6be4d022edecd1644ab4e865ff8b',manifestSha256:'409830ea355d2a546926be79e15dea07a44400ae0241dbd183a711b3e88ca7c0',ledgerSha256:'d15cbd2e5d56f79893920cecc922d8a12709b928e572fa720da8b3bb5545a63b',roundId:'round-010'});
 assert.equal(createHash('sha256').update(read('docs/rounds/round-010.json')).digest('hex'),ledger.baseline.offlinePredecessor.ledgerSha256);
 if(ledger.publication.status==='verified')return;assert.equal(ledger.counts.publishedRegularPractical,0);assert(Object.values(ledger.counts.publishedRegularWrittenBySubject).every(n=>n===0));assert.deepEqual(ledger.coverageAfter.regularWrittenBySubject,{s1:61,s2:76,s3:72,s4:78,s5:69});assert.equal(ledger.coverageAfter.regularPractical,47);for(const c of ledger.candidates)assert.equal(c.publishedBankVersion,null);
});
test('round011 does not recreate terminal002,007,008 rejected learning goals',()=>{
 for(const id of ['round-002','round-007','round-008'])for(const c of JSON.parse(read('docs/rounds/'+id+'.json')).candidates.filter(c=>c.decision==='rejected')){assert(!ledger.candidates.some(x=>x.learningGoalId===c.learningGoalId||x.templateId===c.templateId));assert(!bank.questions.some(q=>q.questionId===c.questionId));}
});
