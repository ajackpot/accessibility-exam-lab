import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as d from '../src/domain.js';
import * as w from '../src/workflows.js';
import {exportBackup,parseBackup} from '../src/backup.js';
import {nextScheduledRoundAt} from '../scripts/validate-round.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const oldRaw=read('data/releases/2026.10.04-regular.7/bank.json'),before=JSON.parse(oldRaw),bank=JSON.parse(read('data/releases/2026.10.04-regular.8/bank.json')),ledger=JSON.parse(read('docs/rounds/round-008.json'));
const oldIds=new Set(before.questions.map(q=>q.questionId)),added=bank.questions.filter(q=>!oldIds.has(q.questionId)),accepted=ledger.candidates.filter(c=>c.decision==='accepted');
const answer=q=>q.type==='written'?q.correctOptionId:Object.fromEntries(q.parts.map(p=>[p.partId,p.kind==='text'?p.accepted[0]:p.kind==='single'?p.correct[0]:[...p.correct].reverse()]));
const norm=s=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
test('round008 preserves all 363 regular records, fourteen seeds, options and sources from regular.7',()=>{
 assert.equal(createHash('sha256').update(oldRaw).digest('hex'),'1b27d3e201cdaf177d1b1d353adc4e9b89b9d3f45596ee810037efd66bd00421');
 assert.equal(before.questions.filter(q=>!q.testOnly).length,363);
 for(const [field,key]of [['questions','questionId'],['options','optionId'],['sources','id']])for(const old of before[field])assert.deepEqual(bank[field].find(v=>v[key]===old[key]),old);
 assert.equal(bank.questions.filter(q=>q.testOnly).length,14);assert.equal(ledger.baseline.bankVersion,before.bankVersion);
});
test('round008 adds exactly its terminal accepted goals and excludes every rejected candidate',()=>{
 assert.equal(ledger.status,'closed');assert.equal(ledger.counts.pending,0);assert.equal(ledger.counts.registered,ledger.counts.accepted+ledger.counts.rejected);assert(ledger.counts.registered<=58);
 assert.deepEqual(new Set(added.map(q=>q.questionId)),new Set(accepted.map(c=>c.questionId)));
 assert.equal(new Set(bank.questions.filter(q=>!q.testOnly).map(q=>q.templateId)).size,363+added.length);
 for(const c of ledger.candidates){assert(c.attemptCount<=3);assert.equal(c.attemptCount,c.cycles.length);assert(['accepted','rejected'].includes(c.decision));if(c.decision==='rejected')assert(!bank.questions.some(q=>q.questionId===c.questionId));}
 for(const q of added){const c=accepted.find(c=>c.questionId===q.questionId);assert.equal(q.revision,c.revision);assert.equal(q.testOnly,false);assert.equal(q.verificationStatus,'published');assert.equal(c.cycles.at(-1).outcome,'accepted');assert(Object.values(c.cycles.at(-1).gates).every(g=>g.result==='pass'));assert.notEqual(c.authorId,c.cycles.at(-1).gates.blindSolve.reviewerId);}
});
test('round008 consumes the scheduled 16:00 KST occurrence and closes before its fixed decision cutoff',()=>{
 assert(Date.parse(ledger.startedAt)>=Date.parse('2026-10-04T07:00:00Z'));assert.equal(nextScheduledRoundAt(ledger.startedAt),Date.parse('2026-10-04T11:00:00Z'));
 assert.equal(ledger.decisionDeadline,'2026-10-04T10:30:00Z');assert(Date.parse(ledger.closedAt)<=Date.parse(ledger.decisionDeadline));assert(Date.parse(bank.releasedAt)>=Date.parse(ledger.closedAt));assert.equal(ledger.baseline.sourceCommit,'d8ee1c0dc1c04145d5a6752242b74b003f0e59c5');
 const prior=JSON.parse(read('docs/rounds/round-002.json')),rejected=prior.candidates.find(c=>c.candidateId==='r002-standards-p01');assert.equal(rejected.decision,'rejected');assert.equal(rejected.attemptCount,3);assert(!ledger.candidates.some(c=>c.learningGoalId===rejected.learningGoalId||c.templateId===rejected.templateId));
});
test('round008 new and reused explanations satisfy strict publication boundaries',()=>{
 d.validateBankForPublication(bank);d.validateExplanationAuthoring(bank,JSON.parse(read('data/releases/2026.10.02-regular.1/bank.json')));
 for(const q of added.filter(q=>q.type==='written'))for(const l of q.links){const o=bank.options.find(o=>o.optionId===l.optionId);assert(o.explanation.trim());assert.notEqual(q.explanation.trim(),o.explanation.trim());if(l.contextExplanation)assert.notEqual(l.contextExplanation.trim(),o.explanation.trim());}
});
test('round008 shared membership follows new links while historical option metadata remains exact',()=>{
 const membership=d.optionMembership(bank),shared=added.filter(q=>q.optionMode==='shared');
 for(const q of shared)for(const l of q.links){assert(membership[l.optionId].includes(q.questionId));const old=before.options.find(o=>o.optionId===l.optionId);if(old)assert.deepEqual(bank.options.find(o=>o.optionId===l.optionId),old);}
 for(const q of shared)for(const count of q.supportedOptionCounts)for(let seed=0;seed<32;seed++){const item=d.presentQuestion(bank,q,count,d.rng(seed));assert.equal(item.options.length,count);assert.equal(item.options.filter(o=>o.optionId===item.correctOptionId).length,1);assert.equal(d.grade(item,item.correctOptionId).status,'correct');}
});
test('round008 written presentations remain unique and grade by stable key across every option position',()=>{
 const bytes=JSON.stringify(bank);
 for(const q of added.filter(q=>q.type==='written'))for(const count of q.supportedOptionCounts)for(let seed=0;seed<32;seed++){const item=d.presentQuestion(bank,q,count,d.rng(seed));assert.equal(new Set(item.options.map(o=>norm(o.content))).size,count);for(const o of item.options)assert.equal(d.grade(item,o.optionId).status,o.optionId===item.correctOptionId?'correct':'wrong');}
 assert.equal(JSON.stringify(bank),bytes);
});
test('round008 practical part order, text acceptance and fixed scores survive choice shuffling and backups',()=>{
 for(const q of added.filter(q=>q.type==='practical'))for(let seed=0;seed<32;seed++){const item=d.presentQuestion(bank,q,5,d.rng(seed));assert.equal(d.grade(item,answer(item)).status,'correct');assert.deepEqual(item.parts.map(p=>p.partId),q.parts.map(p=>p.partId));for(const p of item.parts.filter(p=>p.kind!=='text'))assert.deepEqual(new Set(p.choices.map(c=>c.id)),new Set(q.parts.find(x=>x.partId===p.partId).choices.map(c=>c.id)));}
 const config=w.practiceConfig('practical',{count:2}),session=d.startSession(d.prepareSession(bank,config,[],93,'r008-backup'),100000);assert.deepEqual(parseBackup(exportBackup([session])).sessions[0],session);
});
test('round008 cumulative coverage supports balanced seed-free 100-question mocks and no seed top-up',()=>{
 const availability=w.mockAvailability(bank);assert.equal(availability.ready,true);
 for(let seed=0;seed<12;seed++){const session=d.prepareSession(bank,w.practiceConfig('written',{kind:'mock',count:100}),[],seed,'r008-mock-'+seed);assert.equal(session.items.length,100);assert(session.items.every(q=>!q.testOnly&&q.type==='written'&&q.options.length===5));for(const id of ['s1','s2','s3','s4','s5'])assert.equal(session.items.filter(q=>q.subjectId===id).length,20);assert.equal(new Set(session.items.map(q=>q.templateId)).size,100);}
 for(const id of ['s1','s2','s3','s4','s5']){const count=bank.questions.filter(q=>q.subjectId===id&&!q.testOnly).length,config=w.practiceConfig('written',{subjectId:id,count:count+1}),selection=w.practiceSelection(bank,config);assert.equal(selection.count,count);assert.throws(()=>d.prepareSession(selection.bank,config,[],5,'r008-insufficient-'+id),e=>e.code==='INSUFFICIENT');}
});

test('round008 offline predecessor and public coverage remain separate',()=>{
 assert.equal(ledger.baseline.offlinePredecessor.roundId,'round-007');
 assert.equal(ledger.baseline.offlinePredecessor.artifactSha256,'6a7c6e7488003917dc6e85d962787f4392c5248f71238c28d2defbc94c526449');
 if(ledger.publication.status==='verified')return;
 assert.equal(ledger.counts.publishedRegularPractical,0);
 assert(Object.values(ledger.counts.publishedRegularWrittenBySubject).every(n=>n===0));
 assert.deepEqual(ledger.coverageAfter.regularWrittenBySubject,{s1:46,s2:50,s3:50,s4:50,s5:49});
 assert.equal(ledger.coverageAfter.regularPractical,38);
 for(const c of ledger.candidates)assert.equal(c.publishedBankVersion,null);
});

test('round008 preserves the terminal round007 CSS import rejection without recreating its goal',()=>{
 const previous=JSON.parse(read('docs/rounds/round-007.json'));
 const rejected=previous.candidates.filter(c=>c.decision==='rejected');assert.equal(rejected.length,1);assert.equal(rejected[0].attemptCount,3);
 assert(!ledger.candidates.some(c=>c.learningGoalId===rejected[0].learningGoalId||c.templateId===rejected[0].templateId));
 assert(!bank.questions.some(q=>q.questionId===rejected[0].questionId));
});
