import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as d from '../src/domain.js';
import {practiceConfig,mockAvailability} from '../src/workflows.js';
import {exportBackup,parseBackup} from '../src/backup.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const oldRaw=read('data/releases/2026.10.02-editorial.1/bank.json'),before=JSON.parse(oldRaw),bank=JSON.parse(read('data/releases/2026.10.02-regular.2/bank.json')),ledger=JSON.parse(read('docs/rounds/round-002.json'));
const oldIds=new Set(before.questions.map(q=>q.questionId)),added=bank.questions.filter(q=>!oldIds.has(q.questionId));
const answer=q=>q.type==='written'?q.correctOptionId:Object.fromEntries(q.parts.map(p=>[p.partId,p.kind==='text'?p.accepted[0]:p.kind==='single'?p.correct[0]:p.correct]));
test('round002 preserves the exact latest editorial baseline and all its objects',()=>{
 assert.equal(createHash('sha256').update(oldRaw).digest('hex'),'0d6f624cf75d6fed7fb95b4f2b0ce995df9b73b8475ebab805d42cb9fcad12f2');
 for(const [field,key]of [['questions','questionId'],['options','optionId'],['sources','id']])for(const old of before[field])assert.deepEqual(bank[field].find(v=>v[key]===old[key]),old);
 assert.equal(bank.questions.filter(q=>q.testOnly).length,14);assert.equal(ledger.baseline.bankVersion,before.bankVersion);
});
test('round002 additions are exactly terminal accepted new goals, not editorial revisions or seeds',()=>{
 assert.equal(ledger.status,'closed');assert.equal(ledger.counts.registered,58);assert.equal(ledger.counts.pending,0);
 assert.deepEqual(new Set(added.map(q=>q.questionId)),new Set(ledger.candidates.filter(c=>c.decision==='accepted').map(c=>c.questionId)));
 assert.equal(new Set(bank.questions.filter(q=>!q.testOnly).map(q=>q.templateId)).size,58+added.length);
 for(const q of added){const c=ledger.candidates.find(c=>c.questionId===q.questionId);assert.equal(q.revision,c.revision);assert.equal(q.testOnly,false);assert.equal(q.verificationStatus,'published');assert(c.attemptCount>=1&&c.attemptCount<=3);assert.equal(c.attemptCount,c.cycles.length);assert.equal(c.cycles.at(-1).outcome,'accepted');assert(Object.values(c.cycles.at(-1).gates).every(g=>g.result==='pass'));}
});
test('round002 new explanation fields remain strict and genuinely optional',()=>{
 d.validateBankForPublication(bank);d.validateExplanationAuthoring(bank,JSON.parse(read('data/releases/2026.10.02-regular.1/bank.json')));
 for(const q of added.filter(q=>q.type==='written'))for(const l of q.links){const o=bank.options.find(o=>o.optionId===l.optionId);assert(o.explanation.trim());assert.notEqual(q.explanation.trim(),o.explanation.trim());if(l.contextExplanation)assert.notEqual(l.contextExplanation.trim(),o.explanation.trim());}
});
test('the actual two shared search goals reuse five neutral options with different correct roles',()=>{
 const shared=added.filter(q=>q.optionMode==='shared');assert.equal(shared.length,2);assert.deepEqual(new Set(shared[0].links.map(l=>l.optionId)),new Set(shared[1].links.map(l=>l.optionId)));assert.notEqual(shared[0].links.find(l=>l.role==='correct').optionId,shared[1].links.find(l=>l.role==='correct').optionId);
 for(const q of shared)for(const count of [4,5])for(let seed=0;seed<32;seed++){const item=d.presentQuestion(bank,q,count,d.rng(seed));assert.equal(item.options.length,count);assert.equal(item.options.filter(o=>o.optionId===item.correctOptionId).length,1);assert.equal(d.grade(item,item.correctOptionId).status,'correct');}
});
test('later shared membership is derived from links without rewriting existing option metadata',()=>{
 const fixture=structuredClone(bank),base=fixture.questions.find(q=>q.optionMode==='shared'&&!q.testOnly),third={...structuredClone(base),questionId:'synthetic-round003-shared',templateId:'synthetic-round003-shared-goal'};fixture.questions.push(third);const options=JSON.stringify(fixture.options);d.validateBankForPublication(fixture);
 for(const link of third.links)assert(d.optionMembership(fixture)[link.optionId].includes(third.questionId));assert.equal(JSON.stringify(fixture.options),options);
 for(const count of [4,5])assert.equal(d.presentQuestion(fixture,third,count,d.rng(count)).options.length,count);
});
test('actual twenty-per-subject regular coverage opens a seed-free 100-question mock',()=>{
 const availability=mockAvailability(bank);assert.equal(availability.ready,true);assert(availability.counts.every(s=>s.count===20));
 for(let seed=0;seed<12;seed++){const session=d.prepareSession(bank,practiceConfig('written',{kind:'mock',count:100}),[],seed,'r002-mock-'+seed);assert.equal(session.items.length,100);assert(session.items.every(q=>!q.testOnly&&q.type==='written'&&q.options.length===5));for(const id of ['s1','s2','s3','s4','s5'])assert.equal(session.items.filter(q=>q.subjectId===id).length,20);assert.equal(new Set(session.items.map(q=>q.templateId)).size,100);}
});
test('all new practical fixed answers grade by stable IDs and survive snapshot backup',()=>{
 for(const q of added.filter(q=>q.type==='practical'))for(let seed=0;seed<24;seed++){const item=d.presentQuestion(bank,q,5,d.rng(seed));assert.equal(d.grade(item,answer(item)).status,'correct');assert.deepEqual(item.parts.map(p=>p.partId),q.parts.map(p=>p.partId));}
 const config=practiceConfig('practical',{count:2}),session=d.startSession(d.prepareSession(bank,config,[],42,'r002-backup'),100000);assert.deepEqual(parseBackup(exportBackup([session])).sessions[0],session);
});
