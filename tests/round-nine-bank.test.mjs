import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as d from '../src/domain.js';
import * as w from '../src/workflows.js';
import {exportBackup,parseBackup} from '../src/backup.js';
import {nextScheduledRoundAt} from '../scripts/validate-round.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const oldRaw=read('data/releases/2026.10.04-regular.8/bank.json'),before=JSON.parse(oldRaw),bank=JSON.parse(read('data/releases/2026.10.04-regular.9/bank.json')),ledger=JSON.parse(read('docs/rounds/round-009.json'));
const oldIds=new Set(before.questions.map(q=>q.questionId)),added=bank.questions.filter(q=>!oldIds.has(q.questionId)),accepted=ledger.candidates.filter(c=>c.decision==='accepted');
const answer=q=>q.type==='written'?q.correctOptionId:Object.fromEntries(q.parts.map(p=>[p.partId,p.kind==='text'?p.accepted[0]:p.kind==='single'?p.correct[0]:[...p.correct].reverse()]));
const norm=s=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
test('round009 preserves all 403 regular records, fourteen seeds, options and sources from regular.8',()=>{
 assert.equal(createHash('sha256').update(oldRaw).digest('hex'),'ee533f5e4a546d14b7f2624700fb8d0dd0a47601290f9de9147f769ebf93feab');
 assert.equal(before.questions.filter(q=>!q.testOnly).length,403);
 for(const [field,key]of [['questions','questionId'],['options','optionId'],['sources','id']])for(const old of before[field])assert.deepEqual(bank[field].find(v=>v[key]===old[key]),old);
 assert.equal(bank.questions.filter(q=>q.testOnly).length,14);assert.equal(ledger.baseline.bankVersion,before.bankVersion);
});
test('round009 adds exactly its terminal accepted goals and excludes every rejected candidate',()=>{
 assert.equal(ledger.status,'closed');assert.equal(ledger.counts.pending,0);assert.equal(ledger.counts.registered,ledger.counts.accepted+ledger.counts.rejected);assert(ledger.counts.registered<=58);
 assert.deepEqual(new Set(added.map(q=>q.questionId)),new Set(accepted.map(c=>c.questionId)));
 assert.equal(new Set(bank.questions.filter(q=>!q.testOnly).map(q=>q.templateId)).size,403+added.length);
 for(const c of ledger.candidates){assert(c.attemptCount<=3);assert.equal(c.attemptCount,c.cycles.length);assert(['accepted','rejected'].includes(c.decision));if(c.decision==='rejected')assert(!bank.questions.some(q=>q.questionId===c.questionId));}
 for(const q of added){const c=accepted.find(c=>c.questionId===q.questionId);assert.equal(q.revision,c.revision);assert.equal(q.testOnly,false);assert.equal(q.verificationStatus,'published');assert.equal(c.cycles.at(-1).outcome,'accepted');assert(Object.values(c.cycles.at(-1).gates).every(g=>g.result==='pass'));assert.notEqual(c.authorId,c.cycles.at(-1).gates.blindSolve.reviewerId);}
});
test('round009 records the exact authorized manual start and closes before its fixed decision cutoff',()=>{
 assert.equal(ledger.startedAt,'2026-10-04T08:54:06Z');assert.equal(ledger.manualStartException.kind,'explicit_user_requested_next_round');assert.equal(nextScheduledRoundAt(ledger.startedAt),Date.parse('2026-10-04T11:00:00Z'));
 assert.equal(ledger.decisionDeadline,'2026-10-04T10:30:00Z');assert(Date.parse(ledger.closedAt)<=Date.parse(ledger.decisionDeadline));assert(Date.parse(bank.releasedAt)>=Date.parse(ledger.closedAt));assert.equal(ledger.baseline.sourceCommit,'50fd2807a0ff8fc2c10cbf2628f65d0ca53065c2');
 const prior=JSON.parse(read('docs/rounds/round-002.json')),rejected=prior.candidates.find(c=>c.candidateId==='r002-standards-p01');assert.equal(rejected.decision,'rejected');assert.equal(rejected.attemptCount,3);assert(!ledger.candidates.some(c=>c.learningGoalId===rejected.learningGoalId||c.templateId===rejected.templateId));
});
test('round009 new and reused explanations satisfy strict publication boundaries',()=>{
 d.validateBankForPublication(bank);d.validateExplanationAuthoring(bank,JSON.parse(read('data/releases/2026.10.02-regular.1/bank.json')));
 for(const q of added.filter(q=>q.type==='written'))for(const l of q.links){const o=bank.options.find(o=>o.optionId===l.optionId);assert(o.explanation.trim());assert.notEqual(q.explanation.trim(),o.explanation.trim());if(l.contextExplanation)assert.notEqual(l.contextExplanation.trim(),o.explanation.trim());}
});
test('round009 shared membership follows new links while historical option metadata remains exact',()=>{
 const membership=d.optionMembership(bank),shared=added.filter(q=>q.optionMode==='shared');
 for(const q of shared)for(const l of q.links){assert(membership[l.optionId].includes(q.questionId));const old=before.options.find(o=>o.optionId===l.optionId);if(old)assert.deepEqual(bank.options.find(o=>o.optionId===l.optionId),old);}
 for(const q of shared)for(const count of q.supportedOptionCounts)for(let seed=0;seed<32;seed++){const item=d.presentQuestion(bank,q,count,d.rng(seed));assert.equal(item.options.length,count);assert.equal(item.options.filter(o=>o.optionId===item.correctOptionId).length,1);assert.equal(d.grade(item,item.correctOptionId).status,'correct');}
});
test('round009 written presentations remain unique and grade by stable key across every option position',()=>{
 const bytes=JSON.stringify(bank);
 for(const q of added.filter(q=>q.type==='written'))for(const count of q.supportedOptionCounts)for(let seed=0;seed<32;seed++){const item=d.presentQuestion(bank,q,count,d.rng(seed));assert.equal(new Set(item.options.map(o=>norm(o.content))).size,count);for(const o of item.options)assert.equal(d.grade(item,o.optionId).status,o.optionId===item.correctOptionId?'correct':'wrong');}
 assert.equal(JSON.stringify(bank),bytes);
});
test('round009 practical part order, text acceptance and fixed scores survive choice shuffling and backups',()=>{
 for(const q of added.filter(q=>q.type==='practical'))for(let seed=0;seed<32;seed++){const item=d.presentQuestion(bank,q,5,d.rng(seed));assert.equal(d.grade(item,answer(item)).status,'correct');assert.deepEqual(item.parts.map(p=>p.partId),q.parts.map(p=>p.partId));for(const p of item.parts.filter(p=>p.kind!=='text'))assert.deepEqual(new Set(p.choices.map(c=>c.id)),new Set(q.parts.find(x=>x.partId===p.partId).choices.map(c=>c.id)));}
 const config=w.practiceConfig('practical',{count:2}),session=d.startSession(d.prepareSession(bank,config,[],93,'r009-backup'),100000);assert.deepEqual(parseBackup(exportBackup([session])).sessions[0],session);
});
test('round009 cumulative coverage supports balanced seed-free 100-question mocks and no seed top-up',()=>{
 const availability=w.mockAvailability(bank);assert.equal(availability.ready,true);
 for(let seed=0;seed<12;seed++){const session=d.prepareSession(bank,w.practiceConfig('written',{kind:'mock',count:100}),[],seed,'r009-mock-'+seed);assert.equal(session.items.length,100);assert(session.items.every(q=>!q.testOnly&&q.type==='written'&&q.options.length===5));for(const id of ['s1','s2','s3','s4','s5'])assert.equal(session.items.filter(q=>q.subjectId===id).length,20);assert.equal(new Set(session.items.map(q=>q.templateId)).size,100);}
 for(const id of ['s1','s2','s3','s4','s5']){const count=bank.questions.filter(q=>q.subjectId===id&&!q.testOnly).length,config=w.practiceConfig('written',{subjectId:id,count:count+1}),selection=w.practiceSelection(bank,config);assert.equal(selection.count,count);assert.throws(()=>d.prepareSession(selection.bank,config,[],5,'r009-insufficient-'+id),e=>e.code==='INSUFFICIENT');}
});

test('round009 public008 baseline retains separate synchronization evidence and original offline histories',()=>{
 assert.equal(ledger.baseline.bankVersion,'2026.10.04-regular.8');assert.equal(ledger.baseline.offlinePredecessor,undefined);
 const proof=JSON.parse(read('docs/publications/cumulative-006-008.json'));
 assert.equal(proof.commit,ledger.baseline.sourceCommit);assert.equal(proof.manifest.sha256,ledger.baseline.bankSha256);
 for(const id of ['round-006','round-007','round-008']){const r=JSON.parse(read('docs/rounds/'+id+'.json'));assert.equal(r.publication.status,'not_attempted');assert(r.candidates.every(c=>c.publishedBankVersion===null));}
 if(ledger.publication.status==='verified')return;
 assert.equal(ledger.counts.publishedRegularPractical,0);assert(Object.values(ledger.counts.publishedRegularWrittenBySubject).every(n=>n===0));
 assert.deepEqual(ledger.coverageAfter.regularWrittenBySubject,{s1:61,s2:76,s3:72,s4:78,s5:69});assert.equal(ledger.coverageAfter.regularPractical,47);
 for(const c of ledger.candidates)assert.equal(c.publishedBankVersion,null);
});

test('round009 preserves the terminal round007 CSS import rejection without recreating its goal',()=>{
 const previous=JSON.parse(read('docs/rounds/round-007.json'));
 const rejected=previous.candidates.filter(c=>c.decision==='rejected');assert.equal(rejected.length,1);assert.equal(rejected[0].attemptCount,3);
 assert(!ledger.candidates.some(c=>c.learningGoalId===rejected[0].learningGoalId||c.templateId===rejected[0].templateId));
 assert(!bank.questions.some(q=>q.questionId===rejected[0].questionId));
});

test('round009 preserves the terminal008 CSS text-indent rejection and exact original history',()=>{
 const raw=read('docs/rounds/round-008.json');assert.equal(createHash('sha256').update(raw).digest('hex'),'65e117b3c940ace648ac152b56ecedbdb90c5593b12306f0d449f829ab11d128');
 const rejected=JSON.parse(raw).candidates.filter(c=>c.decision==='rejected');assert.equal(rejected.length,1);assert.equal(rejected[0].attemptCount,1);
 assert(!ledger.candidates.some(c=>c.learningGoalId===rejected[0].learningGoalId||c.templateId===rejected[0].templateId));
 assert(!bank.questions.some(q=>q.questionId===rejected[0].questionId));
});
