import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as d from '../src/domain.js';
import * as w from '../src/workflows.js';
import {exportBackup,parseBackup} from '../src/backup.js';
import {nextScheduledRoundAt} from '../scripts/validate-round.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const oldRaw=read('data/releases/2026.10.04-regular.5/bank.json'),before=JSON.parse(oldRaw),bank=JSON.parse(read('data/releases/2026.10.04-regular.6/bank.json')),ledger=JSON.parse(read('docs/rounds/round-006.json'));
const oldIds=new Set(before.questions.map(q=>q.questionId)),added=bank.questions.filter(q=>!oldIds.has(q.questionId)),accepted=ledger.candidates.filter(c=>c.decision==='accepted');
const answer=q=>q.type==='written'?q.correctOptionId:Object.fromEntries(q.parts.map(p=>[p.partId,p.kind==='text'?p.accepted[0]:p.kind==='single'?p.correct[0]:[...p.correct].reverse()]));
const norm=s=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
test('round006 preserves all 283 regular records, fourteen seeds, options and sources from regular.5',()=>{
 assert.equal(createHash('sha256').update(oldRaw).digest('hex'),'77a312eb775786ccd069a5f1ec77d4ec96df8141eca657f0f594f02ac30820e1');
 assert.equal(before.questions.filter(q=>!q.testOnly).length,283);
 for(const [field,key]of [['questions','questionId'],['options','optionId'],['sources','id']])for(const old of before[field])assert.deepEqual(bank[field].find(v=>v[key]===old[key]),old);
 assert.equal(bank.questions.filter(q=>q.testOnly).length,14);assert.equal(ledger.baseline.bankVersion,before.bankVersion);
});
test('round006 adds exactly its terminal accepted goals and excludes every rejected candidate',()=>{
 assert.equal(ledger.status,'closed');assert.equal(ledger.counts.pending,0);assert.equal(ledger.counts.registered,ledger.counts.accepted+ledger.counts.rejected);assert(ledger.counts.registered<=58);
 assert.deepEqual(new Set(added.map(q=>q.questionId)),new Set(accepted.map(c=>c.questionId)));
 assert.equal(new Set(bank.questions.filter(q=>!q.testOnly).map(q=>q.templateId)).size,283+added.length);
 for(const c of ledger.candidates){assert(c.attemptCount<=3);assert.equal(c.attemptCount,c.cycles.length);assert(['accepted','rejected'].includes(c.decision));if(c.decision==='rejected')assert(!bank.questions.some(q=>q.questionId===c.questionId));}
 for(const q of added){const c=accepted.find(c=>c.questionId===q.questionId);assert.equal(q.revision,c.revision);assert.equal(q.testOnly,false);assert.equal(q.verificationStatus,'published');assert.equal(c.cycles.at(-1).outcome,'accepted');assert(Object.values(c.cycles.at(-1).gates).every(g=>g.result==='pass'));assert.notEqual(c.authorId,c.cycles.at(-1).gates.blindSolve.reviewerId);}
});
test('round006 consumes the scheduled 08:00 KST occurrence and closes before its fixed decision cutoff',()=>{
 assert(Date.parse(ledger.startedAt)>=Date.parse('2026-10-03T23:00:00Z'));assert.equal(nextScheduledRoundAt(ledger.startedAt),Date.parse('2026-10-04T03:00:00Z'));
 assert.equal(ledger.decisionDeadline,'2026-10-04T02:30:00Z');assert(Date.parse(ledger.closedAt)<=Date.parse(ledger.decisionDeadline));assert(Date.parse(bank.releasedAt)>=Date.parse(ledger.closedAt));assert.equal(ledger.baseline.sourceCommit,'3fd1c9c15a31735c1396d3af87bf4be9303aeb62');
 const prior=JSON.parse(read('docs/rounds/round-002.json')),rejected=prior.candidates.find(c=>c.candidateId==='r002-standards-p01');assert.equal(rejected.decision,'rejected');assert.equal(rejected.attemptCount,3);assert(!ledger.candidates.some(c=>c.learningGoalId===rejected.learningGoalId||c.templateId===rejected.templateId));
});
test('round006 new and reused explanations satisfy strict publication boundaries',()=>{
 d.validateBankForPublication(bank);d.validateExplanationAuthoring(bank,JSON.parse(read('data/releases/2026.10.02-regular.1/bank.json')));
 for(const q of added.filter(q=>q.type==='written'))for(const l of q.links){const o=bank.options.find(o=>o.optionId===l.optionId);assert(o.explanation.trim());assert.notEqual(q.explanation.trim(),o.explanation.trim());if(l.contextExplanation)assert.notEqual(l.contextExplanation.trim(),o.explanation.trim());}
});
test('round006 shared membership follows new links while historical option metadata remains exact',()=>{
 const membership=d.optionMembership(bank),shared=added.filter(q=>q.optionMode==='shared');
 for(const q of shared)for(const l of q.links){assert(membership[l.optionId].includes(q.questionId));const old=before.options.find(o=>o.optionId===l.optionId);if(old)assert.deepEqual(bank.options.find(o=>o.optionId===l.optionId),old);}
 for(const q of shared)for(const count of q.supportedOptionCounts)for(let seed=0;seed<32;seed++){const item=d.presentQuestion(bank,q,count,d.rng(seed));assert.equal(item.options.length,count);assert.equal(item.options.filter(o=>o.optionId===item.correctOptionId).length,1);assert.equal(d.grade(item,item.correctOptionId).status,'correct');}
});
test('round006 written presentations remain unique and grade by stable key across every option position',()=>{
 const bytes=JSON.stringify(bank);
 for(const q of added.filter(q=>q.type==='written'))for(const count of q.supportedOptionCounts)for(let seed=0;seed<32;seed++){const item=d.presentQuestion(bank,q,count,d.rng(seed));assert.equal(new Set(item.options.map(o=>norm(o.content))).size,count);for(const o of item.options)assert.equal(d.grade(item,o.optionId).status,o.optionId===item.correctOptionId?'correct':'wrong');}
 assert.equal(JSON.stringify(bank),bytes);
});
test('round006 practical part order, text acceptance and fixed scores survive choice shuffling and backups',()=>{
 for(const q of added.filter(q=>q.type==='practical'))for(let seed=0;seed<32;seed++){const item=d.presentQuestion(bank,q,5,d.rng(seed));assert.equal(d.grade(item,answer(item)).status,'correct');assert.deepEqual(item.parts.map(p=>p.partId),q.parts.map(p=>p.partId));for(const p of item.parts.filter(p=>p.kind!=='text'))assert.deepEqual(new Set(p.choices.map(c=>c.id)),new Set(q.parts.find(x=>x.partId===p.partId).choices.map(c=>c.id)));}
 const config=w.practiceConfig('practical',{count:2}),session=d.startSession(d.prepareSession(bank,config,[],93,'r006-backup'),100000);assert.deepEqual(parseBackup(exportBackup([session])).sessions[0],session);
});
test('round006 cumulative coverage supports balanced seed-free 100-question mocks and no seed top-up',()=>{
 const availability=w.mockAvailability(bank);assert.equal(availability.ready,true);
 for(let seed=0;seed<12;seed++){const session=d.prepareSession(bank,w.practiceConfig('written',{kind:'mock',count:100}),[],seed,'r006-mock-'+seed);assert.equal(session.items.length,100);assert(session.items.every(q=>!q.testOnly&&q.type==='written'&&q.options.length===5));for(const id of ['s1','s2','s3','s4','s5'])assert.equal(session.items.filter(q=>q.subjectId===id).length,20);assert.equal(new Set(session.items.map(q=>q.templateId)).size,100);}
 for(const id of ['s1','s2','s3','s4','s5']){const count=bank.questions.filter(q=>q.subjectId===id&&!q.testOnly).length,config=w.practiceConfig('written',{subjectId:id,count:count+1}),selection=w.practiceSelection(bank,config);assert.equal(selection.count,count);assert.throws(()=>d.prepareSession(selection.bank,config,[],5,'r006-insufficient-'+id),e=>e.code==='INSUFFICIENT');}
});
