import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as d from '../src/domain.js';
import * as w from '../src/workflows.js';
import {exportBackup,parseBackup} from '../src/backup.js';
const bank=JSON.parse(fs.readFileSync(new URL('../data/releases/2026.10.02-regular.1/bank.json',import.meta.url),'utf8'));
const seed=JSON.parse(fs.readFileSync(new URL('../data/seed-bank-v4.json',import.meta.url),'utf8'));
const ledger=JSON.parse(fs.readFileSync(new URL('../docs/rounds/round-001.json',import.meta.url),'utf8'));
const regular=bank.questions.filter(q=>!q.testOnly),answer=q=>q.type==='written'?q.correctOptionId:Object.fromEntries(q.parts.map(p=>[p.partId,p.kind==='text'?p.accepted[0]:p.kind==='single'?p.correct[0]:[...p.correct].reverse()]));
const norm=s=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
test('first regular bank contains exactly the accepted independent goals, separately from fourteen seeds',()=>{
 d.validateBankForPublication(bank);assert.equal(bank.schemaVersion,3);assert.equal(bank.questions.length,72);assert.equal(regular.length,58);assert.equal(new Set(regular.map(q=>q.templateId)).size,58);assert.equal(bank.questions.filter(q=>q.testOnly).length,14);
 assert.equal(ledger.status,'closed');assert.equal(ledger.counts.accepted,58);assert.equal(ledger.counts.rejected,0);assert.equal(ledger.counts.pending,0);
 assert.deepEqual(new Set(regular.map(q=>q.questionId)),new Set(ledger.candidates.filter(c=>c.decision==='accepted').map(c=>c.questionId)));
 for(const q of regular){const c=ledger.candidates.find(c=>c.questionId===q.questionId);assert.equal(q.verificationStatus,'published');assert.equal(q.revision,c.revision);assert.equal(q.templateId,c.templateId);assert(c.cycles.at(-1).outcome==='accepted');assert(Object.values(c.cycles.at(-1).gates).every(g=>g.result==='pass'));assert.match(q.reviewNote,/round-001/);}
 for(const id of ['s1','s2','s3','s4','s5'])assert.equal(regular.filter(q=>q.subjectId===id).length,10);assert.equal(regular.filter(q=>q.type==='practical').length,8);
});
test('all historical seed inputs/releases and every seed object stay byte/value identical',()=>{
 const hashes=['baa4ee31c10022e5f1325b66b2adf32bc2ef49fdb88a316ddd89acefe1532101','5b6b3506888af368cc591e1c751651d16f154c43dde460a0ccbcc916e2b78eac','92b98f94a82451b80cb75008d2ca688a205b60c4f0df3930e788542efc85acee','46c18e0ed3265a1de768f1d08bbeb4e6ada571293aae9c19c0766093df973d99'];
 for(const [i,name]of ['seed-bank.json','seed-bank-v2.json','seed-bank-v3.json','seed-bank-v4.json'].entries())for(const file of [`data/${name}`,`data/releases/2026.10.02-seed.${i+1}/bank.json`])assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../'+file,import.meta.url))).digest('hex'),hashes[i]);
 for(const [key,id]of [['questions','questionId'],['options','optionId'],['sources','id']])for(const original of seed[key])assert.deepEqual(bank[key].find(x=>x[id]===original[id]),original);
});
test('accepted written pools have complete explanations, matching membership and zero orphan options',()=>{
 const members=d.optionMembership(bank),old=new Set(seed.options.map(o=>o.optionId));
 for(const o of bank.options.filter(o=>!old.has(o.optionId))){assert(o.explanation.trim());assert.deepEqual(o.memberQuestionIds,members[o.optionId]);assert(members[o.optionId].length>0);}
 for(const q of regular.filter(q=>q.type==='written')){assert.deepEqual(q.supportedOptionCounts,[4,5]);assert(q.links.every(l=>l.contextExplanation.trim()));assert(q.sourceRefs.every(id=>bank.sources.some(s=>s.id===id)));}
 for(const q of regular.filter(q=>q.type==='practical'))for(const p of q.parts){assert(p.explanation.trim());for(const c of p.choices||[])assert(c.explanation.trim());}
});
test('6400 written presentations retain one keyed answer, full four/five membership and no duplicate meaning labels',()=>{
 const before=JSON.stringify(bank);let checked=0;
 for(const q of regular.filter(q=>q.type==='written'))for(const count of [4,5])for(let seed=0;seed<64;seed++){const item=d.presentQuestion(bank,q,count,d.rng(seed));assert.equal(item.options.length,count);assert.equal(new Set(item.options.map(o=>norm(o.content))).size,count);assert.equal(new Set(item.options.map(o=>o.equivalenceGroupId||o.optionId)).size,count);assert.equal(item.options.filter(o=>o.optionId===item.correctOptionId).length,1);for(const o of item.options)assert.equal(d.grade(item,o.optionId).status,o.optionId===item.correctOptionId?'correct':'wrong');checked++;}
 assert.equal(checked,6400);assert.equal(JSON.stringify(bank),before);
});
test('every regular practical part grades stable IDs/sets/text after independent choice shuffling',()=>{
 for(const q of regular.filter(q=>q.type==='practical'))for(let seed=0;seed<64;seed++){const item=d.presentQuestion(bank,q,5,d.rng(seed));assert.equal(d.grade(item,answer(item)).status,'correct');assert.deepEqual(item.parts.map(p=>p.partId),q.parts.map(p=>p.partId));for(const p of item.parts.filter(p=>p.kind!=='text')){const original=q.parts.find(x=>x.partId===p.partId);assert.deepEqual(p.correct,original.correct);assert.deepEqual(new Set(p.choices.map(c=>c.id)),new Set(original.choices.map(c=>c.id)));if(p.kind==='multi'){const wrong={...answer(item),[p.partId]:[...p.correct,p.correct[0]]};assert.equal(d.grade(item,wrong).parts.find(x=>x.partId===p.partId).correct,false);}}}
});
test('actual regular practice excludes seed top-up and the 100-question mock remains locked',()=>{
 for(const id of ['s1','s2','s3','s4','s5']){const config=w.practiceConfig('written',{subjectId:id,count:10}),selection=w.practiceSelection(bank,config);assert.equal(selection.count,10);assert(!selection.testOnly);const session=d.prepareSession(selection.bank,config,[],13,'actual-'+id);assert(session.items.every(q=>!q.testOnly));assert.throws(()=>d.prepareSession(selection.bank,{...config,count:11},[],13,'too-many'),e=>e.code==='INSUFFICIENT');}
 const available=w.mockAvailability(bank);assert.equal(available.ready,false);assert(available.counts.every(s=>s.count===10));assert.throws(()=>d.prepareSession(bank,w.practiceConfig('written',{kind:'mock',count:100}),[],13,'mock'),e=>e.code==='MOCK_UNAVAILABLE');
});
test('new regular snapshots restore exactly and actual practical AI references remain gated',()=>{
 for(const type of ['written','practical']){const config=w.quickConfig(bank,type),selection=w.practiceSelection(bank,config);let session=d.startSession(d.prepareSession(selection.bank,config,[],23,'round-trip-'+type),100000);const before=JSON.stringify(session.items);for(const q of session.items){if(type==='practical'){const blind=d.createPrompt(session,q,{includeReference:false});assert(!blind.includes('참고 서술 답안 시작'));assert(!blind.includes('고정 답안 참고 키 시작'));assert.throws(()=>d.createPrompt(session,q,{includeReference:true}));}session=d.setAnswer(session,q.instanceId,answer(q),100001);session=d.confirmAnswer(session,q.instanceId,100002);}assert.equal(JSON.stringify(session.items),before);const restored=parseBackup(exportBackup([session])).sessions[0];assert.deepEqual(restored,session);assert.equal(d.statistics([restored],{type,testOnly:false}).first.count,session.items.length);assert.equal(d.statistics([restored],{type,testOnly:true}).first.count,0);}
});
