import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import * as d from '../src/domain.js';
import {parseBackup,exportBackup} from '../src/backup.js';
const original=JSON.parse(await fs.readFile(new URL('../data/seed-bank.json',import.meta.url),'utf8'));
const current=JSON.parse(await fs.readFile(new URL('../data/seed-bank-v2.json',import.meta.url),'utf8'));
const config={type:'written',subjectId:'all',mode:'untimed',kind:'practice',count:10,minutes:30,optionCount:5,pool:'all',family:'all',feedbackAfter:'confirm'};
const make=(bank=current,overrides={})=>d.startSession(d.prepareSession(bank,{...config,...overrides},[],1,'feedback-policy'),100000);
const item=(bank,qid)=>d.presentQuestion(bank,bank.questions.find(q=>q.questionId===qid),5,d.rng(1));
const answer=q=>q.type==='written'?q.correctOptionId:Object.fromEntries(q.parts.map(p=>[p.partId,p.kind==='text'?p.accepted[0]:p.kind==='single'?p.correct[0]:p.correct]));
const confirm=(s,q)=>d.confirmAnswer(d.setAnswer(s,q.instanceId,answer(q),100001),q.instanceId,100002);
const stimulusIds=['seed-w07','seed-w08','seed-p01','seed-p02','seed-p03','seed-p04'];
test('corrected release keeps 14 test seeds, original keys and original immutable bytes',async()=>{
 d.validateBank(current);assert.equal(current.schemaVersion,2);assert.equal(current.questions.length,14);
 assert.deepEqual(current.questions.map(q=>q.questionId),original.questions.map(q=>q.questionId));
 for(const q of current.questions){const old=original.questions.find(o=>o.questionId===q.questionId);assert(q.testOnly);assert.equal(q.stem,old.stem);assert.equal(q.learningGoalRevision,old.learningGoalRevision);assert.deepEqual(q.links,old.links);assert.deepEqual(q.parts,old.parts);assert.equal(q.revision,old.revision+(old.materials?.length?1:0));}
 assert.equal(await fs.readFile(new URL('../data/seed-bank.json',import.meta.url),'utf8'),await fs.readFile(new URL('../data/releases/2026.10.02-seed.1/bank.json',import.meta.url),'utf8'));
 assert.equal(await d.sha256(await fs.readFile(new URL('../data/seed-bank.json',import.meta.url),'utf8')),'baa4ee31c10022e5f1325b66b2adf32bc2ef49fdb88a316ddd89acefe1532101');
});
test('schema2 requires a material purpose and exact stem instruction for question stimuli',()=>{
 for(const mutate of [m=>delete m.purpose,m=>m.purpose='guess',m=>delete m.instruction,m=>m.instruction='not in the stem',m=>m.instruction=' ']){const b=d.copy(current);mutate(b.questions.find(q=>q.questionId==='seed-w07').materials[0]);assert.throws(()=>d.validateBank(b));}
 assert.doesNotThrow(()=>d.validateBank(original));
});
test('written explanatory sample is separated while all code-reading and practical tasks retain stimulus',()=>{
 for(const bank of [original,current]){assert.equal(d.hasUnclassifiedMaterials(item(bank,'seed-w05')),false);assert.equal(d.materialsFor(item(bank,'seed-w05'),'question').length,0);assert.equal(d.materialsFor(item(bank,'seed-w05'),'explanation').length,1);for(const qid of stimulusIds){assert.equal(d.materialsFor(item(bank,qid),'question').length,1,qid);assert.equal(d.materialsFor(item(bank,qid),'explanation').length,0,qid);}}
});
test('unknown legacy content defaults to explanation without overwriting snapshot, including same-ID edited material',async()=>{
 const q=item(original,'seed-w07'),before=JSON.stringify(q),hash=await d.snapshotHash(q);d.materialsFor(q,'question');assert.equal(JSON.stringify(q),before);assert.equal(await d.snapshotHash(q),hash);
 for(const mutate of [q=>q.bankVersion='unknown',q=>q.revision++,q=>q.stem+=' Changed',q=>q.materials[0].filename='other.html',q=>q.materials[0].content+='\n',q=>q.materials[0].focusLine=1]){const edited=d.copy(q);mutate(edited);assert.equal(d.hasUnclassifiedMaterials(edited),true);assert.equal(d.materialsFor(edited,'question').length,0);assert.equal(d.materialsFor(edited,'explanation').length,1);}
});
test('old schema1 and new schema2 snapshot backups roundtrip without virtual migration writes',()=>{
 for(const bank of [original,current]){const s=make(bank,{type:'practical',subjectId:'practical',count:4});if(bank===original)for(const q of s.items)delete q.bankSchemaVersion;const raw=exportBackup([s]);for(const q of s.items)d.materialsFor(q,'question');assert.deepEqual(JSON.parse(exportBackup([s])).sessions,JSON.parse(raw).sessions);assert.deepEqual(parseBackup(raw).sessions,[s]);}
 const s=make(current,{type:'practical',subjectId:'practical',count:4});delete s.items[0].materials[0].purpose;assert.throws(()=>parseBackup(exportBackup([s])));
});
test('duplicate explanation text is read once, blanks omitted, distinct and Unicode-specific reasons preserved',()=>{
 assert.deepEqual(d.optionExplanationParagraphs({explanation:' Same  reason\n',contextExplanation:'Same reason'}),[{label:null,text:'Same  reason'}]);
 assert.deepEqual(d.optionExplanationParagraphs({explanation:' \n ',contextExplanation:'Only context'}),[{label:null,text:'Only context'}]);
 assert.deepEqual(d.optionExplanationParagraphs({explanation:'Only common',contextExplanation:null}),[{label:null,text:'Only common'}]);
 assert.deepEqual(d.optionExplanationParagraphs({explanation:'  ',contextExplanation:'\t'}),[]);
 for(const [explanation,contextExplanation] of [['Common definition','Specific reason'],['속성값은 ①입니다','속성값은 1입니다'],['ＩＤ와 일치합니다','ID와 일치합니다']])assert.equal(d.optionExplanationParagraphs({explanation,contextExplanation}).length,2);
 const q=item(current,'seed-w03');assert(q.options.some(o=>d.optionExplanationParagraphs(o).length===2));
});
test('single-item judgement uses sentences and leaves practical partial/unanswered explicit',()=>{
 assert.equal(d.itemJudgement('correct'),'정답입니다.');assert.equal(d.itemJudgement('wrong'),'오답입니다.');assert.equal(d.itemJudgement('partial'),'부분 정답입니다.');assert.equal(d.itemJudgement('unanswered'),'답을 제출하지 않았습니다.');
});
test('explanation permission requires grading and respects delayed and timed feedback across routes',()=>{
 let s=make(),q=s.items[0];assert.equal(d.canShowExplanation(s,q),false);assert.throws(()=>d.revealExplanation(s,q.instanceId));s=confirm(s,q);assert.equal(d.canShowExplanation(s,q),true);assert.equal(d.revealExplanation(s,q.instanceId).revealed[q.instanceId],true);
 s.config.feedbackAfter='end';assert.equal(d.canShowExplanation(s,q),false);assert.throws(()=>d.revealExplanation(s,q.instanceId));s=d.finalize(s,'submitted',100003);assert.equal(d.canShowExplanation(s,q),true);
 const timed=make(current,{mode:'timed'});assert.equal(d.canShowExplanation(timed,timed.items[0]),false);assert.throws(()=>d.revealExplanation(timed,timed.items[0].instanceId));
 const prepared=d.prepareSession(current,config,[],1,'prepared');assert.equal(d.canShowExplanation(prepared,prepared.items[0]),false);
});
test('AI materials use same purpose policy; pregrade independent excludes reference/code even through direct calls',()=>{
 let s=make(current,{type:'practical',subjectId:'practical',count:4}),q=s.items[0];q.materials.push({filename:'answer.html',content:'SECRET_REFERENCE_CODE',purpose:'explanation'});
 const independent=d.createPrompt(s,q,{includeReference:false});assert(independent.includes(q.materials[0].content));assert(!independent.includes('SECRET_REFERENCE_CODE'));assert(!independent.includes(q.referenceAnswer));assert.throws(()=>d.createPrompt(s,q,{includeReference:true}));
 s=confirm(s,q);assert(d.createPrompt(s,q).includes('SECRET_REFERENCE_CODE'));assert(!d.createPrompt(s,q,{includeReference:false}).includes('SECRET_REFERENCE_CODE'));
 s.config.feedbackAfter='end';assert.throws(()=>d.createPrompt(s,q));assert.doesNotThrow(()=>d.createPrompt(s,q,{includeReference:false}));s=d.finalize(s,'submitted',100003);assert(d.createPrompt(s,q).includes('SECRET_REFERENCE_CODE'));
 s=make(current,{type:'practical',subjectId:'practical',count:4,mode:'timed'});for(const includeReference of [true,false])assert.throws(()=>d.createPrompt(s,s.items[0],{includeReference}));
});
