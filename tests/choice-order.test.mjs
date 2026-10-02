import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as d from '../src/domain.js';
import {practiceConfig,submitSelectedAnswers} from '../src/workflows.js';
import {exportBackup,parseBackup,validateSession} from '../src/backup.js';
const bank=JSON.parse(fs.readFileSync(new URL('../data/seed-bank-v4.json',import.meta.url),'utf8'));
const config=(type='practical',extra={})=>practiceConfig(type,{count:type==='practical'?4:10,...extra});
const prepared=(seed=1,type='practical',extra={})=>d.prepareSession(bank,config(type,extra),[],seed,`order-${seed}-${type}`);
const make=(seed=1,type='practical',extra={})=>d.startSession(prepared(seed,type,extra),100000);
const answer=q=>q.type==='written'?q.correctOptionId:Object.fromEntries(q.parts.map(p=>[p.partId,p.kind==='text'?p.accepted[0]:p.kind==='single'?p.correct[0]:[...p.correct].reverse()]));
const choices=s=>s.items.map(q=>[q.questionId,q.type==='written'?q.options.map(o=>o.optionId):q.parts.map(p=>[p.partId,p.choices?.map(c=>c.id)])]);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

test('Fisher–Yates maps the 24 four-choice draw combinations to every permutation exactly once',()=>{
 const input=freeze(['a','b','c','d']),permutations=new Set();
 for(let a=0;a<4;a++)for(let b=0;b<3;b++)for(let c=0;c<2;c++){const draws=[a/4,b/3,c/2];const result=d.shuffled(input,()=>draws.shift());assert.equal(draws.length,0);assert.deepEqual([...result].sort(),input);permutations.add(result.join(''));}
 assert.equal(permutations.size,24);assert.deepEqual(input,['a','b','c','d']);
});
test('every practical single/multi part shuffles once, preserving exact membership, keys, part order and bank bytes',()=>{
 const source=JSON.stringify(bank),immutable=freeze(d.copy(bank)),positions=new Map();
 for(let seed=0;seed<256;seed++){const s=d.prepareSession(immutable,config(),[],seed,`practical-${seed}`);for(const q of s.items){const original=bank.questions.find(o=>o.questionId===q.questionId);assert.deepEqual(q.parts.map(p=>p.partId),original.parts.map(p=>p.partId));assert.deepEqual(q.materials,original.materials);for(const [i,p]of q.parts.entries()){const old=original.parts[i];if(p.kind==='text'){assert.deepEqual(p,old);continue;}assert.deepEqual({...p,choices:old.choices},old);assert.deepEqual([...p.choices].sort((a,b)=>a.id.localeCompare(b.id)),[...old.choices].sort((a,b)=>a.id.localeCompare(b.id)));for(const c of p.choices){const key=`${q.questionId}/${p.partId}/${c.id}`,seen=positions.get(key)||new Set();seen.add(p.choices.findIndex(o=>o.id===c.id));positions.set(key,seen);}}}}
 for(const seen of positions.values())assert.equal(seen.size,4);assert.equal(JSON.stringify(bank),source);assert.equal(JSON.stringify(immutable),source);
});
test('written exclusive/shared four/five options keep randomized exact-ID grading at every display position',()=>{
 const coverage=new Map();for(const count of [4,5])for(let seed=0;seed<128;seed++){const s=prepared(seed,'written',{optionCount:count});for(const q of s.items){assert.equal(q.options.length,count);assert.equal(new Set(q.options.map(o=>o.optionId)).size,count);assert.equal(q.options.filter(o=>o.optionId===q.correctOptionId).length,1);for(const o of q.options)assert.equal(d.grade(q,o.optionId).status,o.optionId===q.correctOptionId?'correct':'wrong');const key=`${q.optionMode}/${count}`,seen=coverage.get(key)||new Set();seen.add(q.options.findIndex(o=>o.optionId===q.correctOptionId));coverage.set(key,seen);}}
 for(const mode of ['exclusive','shared'])for(const count of [4,5])assert.equal(coverage.get(`${mode}/${count}`).size,count);
});
test('generator 2 reproduces same seed/config/bank, while new retry seeds may draw another order',()=>{
 assert.equal(d.GENERATOR_VERSION,'2');for(const type of ['written','practical']){const a=prepared(7,type),b=prepared(7,type);assert.deepEqual(a.items,b.items);assert.deepEqual(choices(a),choices(b));assert.notDeepEqual(choices(a),choices(prepared(8,type)));assert.equal(a.generatorVersion,'2');}
});
test('single and multi correctness follows stable IDs for every seed; multi selection order is irrelevant',()=>{
 for(let seed=0;seed<128;seed++)for(const q of prepared(seed).items){assert.equal(d.grade(q,answer(q)).status,'correct');for(const p of q.parts.filter(p=>p.kind!=='text')){const check=value=>d.grade(q,{[p.partId]:value}).parts.find(g=>g.partId===p.partId);if(p.kind==='single'){for(const c of p.choices)assert.equal(check(c.id).correct,p.correct.includes(c.id));}else{assert(check([...p.correct]).correct);assert(check([...p.correct].reverse()).correct);for(const value of [[],p.correct.slice(1),[...p.correct,p.correct[0]],[...p.correct,p.choices.find(c=>!p.correct.includes(c.id)).id],['unknown']])assert.equal(check(value).correct,false);}}}
});
test('start, answer, grade, JSON reload, backup, finalize and timed conversion preserve snapshot order and scoring',()=>{
 for(const type of ['written','practical']){const p=prepared(12,type),before=d.copy(p.items);let s=d.startSession(p,100000);for(const q of s.items){s=d.setAnswer(s,q.instanceId,answer(q),100001);s=d.confirmAnswer(s,q.instanceId,100002);}assert.deepEqual(s.items,before);assert(s.attempts.every(a=>a.grade.status==='correct'));s=submitSelectedAnswers(s,100003);const restored=parseBackup(exportBackup([JSON.parse(JSON.stringify(s))])).sessions[0];assert.deepEqual(restored,s);assert.deepEqual(restored.items,before);assert.equal(restored.result.correct,s.items.length);
 let timed=make(12,type,{mode:'timed',minutes:30});for(const q of timed.items)timed=d.setAnswer(timed,q.instanceId,answer(q),100001);const converted=d.convertToUntimed(timed,'converted-order-'+type,100002);for(const next of [converted.old,converted.next]){assert.deepEqual(next.items,timed.items);assert.deepEqual(next.answers,timed.answers);validateSession(next);}}
});
test('old generator-1 fixed practical snapshots remain byte-equivalent through restore, review and grading',()=>{
 let old=make(31);old.appVersion='0.2.5';old.generatorVersion='1';for(const q of old.items)q.parts=d.copy(bank.questions.find(x=>x.questionId===q.questionId).parts);const snapshot=JSON.stringify(old.items),restored=parseBackup(exportBackup([old])).sessions[0];assert.deepEqual(restored,old);for(const q of restored.items){d.questionPresentation(q);d.createPrompt(restored,q,{includeReference:false});old=d.confirmAnswer(d.setAnswer(old,q.instanceId,answer(q),100001),q.instanceId,100002);}assert.equal(JSON.stringify(old.items),snapshot);assert.equal(JSON.stringify(restored.items),snapshot);assert(old.attempts.every(a=>a.grade.status==='correct'));assert.equal(parseBackup(exportBackup([old])).sessions[0].generatorVersion,'1');
});
test('AI choices and selected text follow stored order without internal IDs or pregrade answer keys',()=>{
 let s=make(45);const q=s.items.find(q=>q.questionId==='seed-p04');for(const p of q.parts){p.partId='INTERNAL-PART-'+p.partId;if(p.choices){const ids=new Map(p.choices.map((c,i)=>[c.id,`INTERNAL-CHOICE-${p.partId}-${i}`]));p.correct=p.correct.map(id=>ids.get(id));p.choices=p.choices.map(c=>({...c,id:ids.get(c.id)}));}}const a=answer(q);a.freeResponse='  내 서술\n <code> & 🙂  ';s=d.setAnswer(s,q.instanceId,a,100001);const before=JSON.stringify(s),independent=d.createPrompt(s,q,{includeReference:false});assert(!independent.includes('INTERNAL-'));assert(!independent.includes(q.referenceAnswer));assert(!independent.includes('고정 답안 참고 키 시작'));assert(!independent.includes('서술형 평가 기준 시작'));assert(independent.includes(a.freeResponse));const shown=q.parts.flatMap(p=>[p.prompt,...(p.choices||[]).map(c=>c.text)]).join('\n\n');assert(independent.includes(shown));const fixed=JSON.parse(independent.split('사용자 고정 답안 (항목·선택 내용, 표시 순서): ')[1]);assert.deepEqual(fixed,q.parts.map(p=>({항목:p.prompt,답안:d.selectedChoiceTexts(p,a[p.partId])})));assert(!d.createPrompt(s,q,{includeReference:false,blank:true}).includes('사용자 고정 답안'));assert.equal(JSON.stringify(s),before);
 s=d.confirmAnswer(s,q.instanceId,100002);const comparison=d.createPrompt(s,q);for(const p of q.parts)assert(comparison.includes(d.selectedChoiceTexts(p,p.correct).join(' / ')));assert(!comparison.includes('INTERNAL-'));
});
test('AI typed fixed answers remain exact Unicode and whitespace while choice answers become visible text',()=>{
 let s=make(1);const q=s.items.find(q=>q.questionId==='seed-p01'),typed='  속성\n\t<code> "&" 🙂  ',a=Object.fromEntries(q.parts.filter(p=>p.kind==='text').map(p=>[p.partId,typed]));s=d.setAnswer(s,q.instanceId,a,100001);const text=d.createPrompt(s,q,{includeReference:false}),fixed=JSON.parse(text.split('사용자 고정 답안 (항목·선택 내용, 표시 순서): ')[1]);assert.equal(fixed.length,2);assert(fixed.every(p=>p.답안===typed));
});
test('legacy concise display accepts choice permutation only, never changed membership/content/keys/parts',()=>{
 for(const file of ['seed-bank.json','seed-bank-v2.json','seed-bank-v3.json']){const old=JSON.parse(fs.readFileSync(new URL('../data/'+file,import.meta.url),'utf8')),q=d.presentQuestion(old,old.questions.find(q=>q.questionId==='seed-p04'),5,d.rng(41));const expected=bank.questions.find(q=>q.questionId==='seed-p04');assert.equal(d.questionPresentation(q).stem,expected.stem);for(const change of [q=>q.parts.reverse(),q=>q.parts[0].choices[0].text+=' changed',q=>q.parts[0].choices[0].id='other',q=>q.parts[0].choices[0]=d.copy(q.parts[0].choices[1]),q=>q.parts[0].choices.pop(),q=>q.parts[0].correct=['other'],q=>q.parts[0].points++,q=>q.parts[0].choices[0].extra='extra']){const changed=d.copy(q);change(changed);assert.equal(d.questionPresentation(changed).stem,changed.stem);}}
});
