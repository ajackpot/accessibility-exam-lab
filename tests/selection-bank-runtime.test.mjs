/** Selected bank runtime regression; original all3 regression remains unchanged. */
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
const oldPath='data/releases/2026.10.09-regular.39/bank.json',before=read(oldPath),ledger=read('docs/rounds/round-041.json'),bank=read('data/releases/2026.10.10-regular.41-selection.1/bank.json');
const priorIds=new Set(before.questions.map(q=>q.questionId)),added=bank.questions.filter(q=>!priorIds.has(q.questionId)),accepted=ledger.candidates.filter(c=>c.decision==='accepted');
const answer=item=>item.type==='written'?item.correctOptionId:Object.fromEntries(item.parts.map(p=>[p.partId,p.kind==='text'?p.accepted[0]:p.kind==='single'?p.correct[0]:[...p.correct].reverse()]));

test('selected041 keeps all970 verified039 objects,14 seeds, editorial revisions and exact source banks',()=>{
 assert.equal(hash(raw(oldPath)),'42cc772d52de759ee9c292f2d47bd71aa5e0371c8679fa7992a218ee68cda919');
 assert.equal(before.questions.length,970);assert.equal(before.questions.filter(q=>!q.testOnly).length,956);
 for(const [field,key] of [['questions','questionId'],['options','optionId'],['sources','id']]){
  const map=new Map(bank[field].map(x=>[x[key],x]));assert.equal(map.size,bank[field].length);
  for(const old of before[field])assert.deepEqual(map.get(old[key]),old);
 }
 for(const field of ['subjects','corrections','syllabusVersion'])assert.deepEqual(bank[field],before[field]);
 assert.equal(bank.questions.filter(q=>q.testOnly).length,14);
});

test('selected041 schema and strict explanation authoring retain only exact old exemptions',()=>{
 d.validateBankForPublication(bank);d.validateExplanationAuthoring(bank,read('data/releases/2026.10.02-regular.1/bank.json'));
 const membership=d.optionMembership(bank),oldOptions=new Set(before.options.map(o=>o.optionId));
 for(const o of bank.options)if(!oldOptions.has(o.optionId))assert.deepEqual([...o.memberQuestionIds].sort(),[...membership[o.optionId]].sort());
 for(const q of added){assert(q.explanation.trim());for(const l of q.links||[]){const o=bank.options.find(o=>o.optionId===l.optionId);assert(o.explanation.trim());assert.notEqual(o.explanation.trim(),q.explanation.trim());if(l.contextExplanation)assert.notEqual(o.explanation.trim(),l.contextExplanation.trim());}}
});

test('selected041 written and practical presentations shuffle by stable IDs and grade exactly',()=>{
 const serialized=JSON.stringify(bank);
 for(const q of added)for(const count of q.type==='written'?q.supportedOptionCounts:[5]){
  const permutations=new Set(), practicalOrders=new Map((q.parts||[]).filter(p=>p.kind!=='text').map(p=>[p.partId,new Set()]));
  for(let seed=0;seed<128;seed++){
   const item=d.presentQuestion(bank,q,count,d.rng(seed));assert.equal(d.grade(item,answer(item)).status,'correct');
   if(q.type==='written'){assert.equal(item.options.length,count);assert.equal(new Set(item.options.map(o=>o.optionId)).size,count);permutations.add(item.options.map(o=>o.optionId).join('|'));for(const o of item.options)assert.equal(d.grade(item,o.optionId).status,o.optionId===item.correctOptionId?'correct':'wrong');}
   else{assert.deepEqual(item.parts.map(p=>p.partId),q.parts.map(p=>p.partId));assert.deepEqual(d.grade(item,{...answer(item),freeResponse:'독자 서술'}),d.grade(item,answer(item)));for(const p of item.parts){const old=q.parts.find(x=>x.partId===p.partId);assert.equal(p.points,old.points);if(p.kind==='text')assert.deepEqual(p.accepted,old.accepted);else{assert.deepEqual(p.correct,old.correct);assert.deepEqual(new Set(p.choices.map(c=>c.id)),new Set(old.choices.map(c=>c.id)));practicalOrders.get(p.partId).add(p.choices.map(c=>c.id).join('|'));const full=d.grade(item,answer(item));for(const choice of p.choices){const selected=p.kind==='single'?choice.id:[choice.id],same=p.correct.length===1&&p.correct[0]===choice.id,result=d.grade(item,{...answer(item),[p.partId]:selected});assert.equal(result.points,full.maxPoints-(same?0:p.points));assert.equal(result.status,same?'correct':result.points===0?'wrong':'partial');}if(p.kind==='multi'&&p.correct.length>1){const partial=d.grade(item,{...answer(item),[p.partId]:[p.correct[0]]});assert.equal(partial.points,full.maxPoints-p.points);assert.notEqual(partial.status,'correct');}}}}
  }
  if(q.type==='written')assert(permutations.size>1);else for(const [partId,orders] of practicalOrders){const part=q.parts.find(p=>p.partId===partId);if(part.choices.length>=2)assert(orders.size>1,'Practical choice order must vary: '+partId);}
 }
 assert.equal(JSON.stringify(bank),serialized);
});

test('selected041 snapshots, exact user text, timers and AI disclosure remain unchanged by new data',async()=>{
 for(const q of added)for(const optionCount of q.type==='written'?q.supportedOptionCounts:[5]){
  const cfg=w.practiceConfig(q.type,{count:1,subjectId:q.subjectId,optionCount});let s=d.startSession(d.prepareSession({...bank,questions:[q]},cfg,[],97,q.questionId+'-qa-'+optionCount),1000);
  const item=s.items[0],snapshot=JSON.stringify(item),sha=await d.snapshotHash(item),prose='  원문\n Ａ 한글 <script>텍스트</script>  ';
  assert(!d.canShowExplanation(s,item));if(q.type==='practical')assert.throws(()=>d.createPrompt(s,item,{includeReference:true}));
  s=d.setAnswer(s,item.instanceId,q.type==='practical'?{...answer(item),freeResponse:prose}:answer(item),1001);
  if(q.type==='practical'){const prompt=d.createPrompt(s,item,{includeReference:false});assert(prompt.includes(prose));assert(!prompt.includes('고정 답안 참고 키 시작'));}
  s=d.confirmAnswer(s,item.instanceId,1002);assert.deepEqual(d.confirmAnswer(s,item.instanceId,1003),s);const restored=parseBackup(exportBackup([s])).sessions[0];assert.equal(JSON.stringify(restored),JSON.stringify(s));assert.equal(JSON.stringify(restored.items[0]),snapshot);assert.equal(await d.snapshotHash(restored.items[0]),sha);
  let timed=d.startSession(d.prepareSession({...bank,questions:[q]},{...cfg,mode:'timed',minutes:1},[],97,q.questionId+'-timed-'+optionCount),1000);timed=d.setAnswer(timed,timed.items[0].instanceId,answer(timed.items[0]),1001);if(q.type==='practical')for(const includeReference of [true,false])assert.throws(()=>d.createPrompt(timed,timed.items[0],{includeReference}));
  const changed=d.convertToUntimed(timed,q.questionId+'-untimed-'+optionCount,1002);assert.deepEqual(changed.next.items,timed.items);assert.deepEqual(changed.next.answers,timed.answers);const expired=d.finalize(timed,'expired',61001);assert.equal(expired.endedAt,timed.expiresAt);assert.deepEqual(d.finalize(expired,'expired',99999),expired);
 }
});



test('selected041 exposes exactly957 regular items and excludes both terminal publication targets',()=>{
 assert.equal(bank.questions.length,971);assert.equal(bank.questions.filter(q=>!q.testOnly).length,957);assert.equal(added.length,1);assert.equal(added[0].questionId,'r041-primary-s4-w01');
 assert.deepEqual(added[0],read('data/releases/2026.10.10-regular.41/bank.json').questions.find(q=>q.questionId===added[0].questionId));
 for(const id of ['r041-primary-s2-w01','r041-primary-s3-w01'])assert(!bank.questions.some(q=>q.questionId===id));
 const ids=new Set();for(const subjectId of ['s1','s2','s3','s4','s5'])for(const q of d.eligibleQuestions(bank,w.practiceConfig('written',{subjectId,count:500,optionCount:5})))ids.add(q.questionId);
 assert(ids.has('r041-primary-s4-w01'));assert(!ids.has('r041-primary-s2-w01'));assert(!ids.has('r041-primary-s3-w01'));
 assert.equal(hash(raw('docs/rounds/round-041.json')),'a76c5fe74e7f7b0fc1531d853962b8613d4131eb20508465a19894d362679cd6');
});
