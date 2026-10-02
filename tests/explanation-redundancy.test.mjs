import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as d from '../src/domain.js';
import {exportBackup,parseBackup} from '../src/backup.js';
import {readBankInput} from '../scripts/bank-io.mjs';
import {buildBank} from '../scripts/build.mjs';
import {validateReleaseLedger,loadRoundContext} from '../scripts/validate-round.mjs';
import {REVIEWED_OPTION_EXPLANATIONS} from '../src/reviewed-option-explanations.js';
const root=path.resolve(import.meta.dirname,'..');
// Historical0.2.8 behavior and carry-forward exceptions are fixed to immutable regular.1.
// Current editorial authoring/rendering is tested separately in editorial-bank.test.mjs.
const raw=await fs.readFile(path.join(root,'data/releases/2026.10.02-regular.1/bank.json'),'utf8'),bank=JSON.parse(raw);
const manifest={schemaVersion:1,bankVersion:bank.bankVersion,releasedAt:bank.releasedAt,file:`releases/${bank.bankVersion}/bank.json`,sha256:await d.sha256(raw),changeSummary:bank.changeSummary,finalRelease:false};
const common='동등 비교 연산의 결과는 피연산자 자체가 아니라 Boolean 값이다.';
const paragraphs=(context,role='distractor',explanation=common)=>d.optionExplanationParagraphs({explanation,contextExplanation:context,role});
const clean=source=>{const b=d.copy(source);for(const q of b.questions.filter(q=>q.type==='written'))for(const l of q.links)delete l.contextExplanation;return b;};
async function fixture(t,{baseline=true}={}) {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'exam-explanation-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.mkdir(path.join(dir,'data'),{recursive:true});
 if(baseline){await fs.mkdir(path.join(dir,'data/releases',manifest.bankVersion),{recursive:true});await fs.writeFile(path.join(dir,'data',manifest.file),raw);await fs.writeFile(path.join(dir,'data/manifest.json'),JSON.stringify(manifest));}
 return dir;
}
async function candidate(dir,body){const file=path.join(dir,'candidate.json');await fs.writeFile(file,JSON.stringify(body,null,2)+'\n');return file;}
test('role-matching explicit verdicts dedupe without repeated judgement or changed technical text',()=>{
 for(const [role,words]of [['distractor',['오답이다.','오답입니다.']],['correct',['정답이다.','정답입니다.']]])for(const word of words){assert.deepEqual(paragraphs(`${word} \n${common}`,role),[{label:null,text:common}]);assert.deepEqual(paragraphs(word,role),[{label:null,text:common}]);}
 assert.deepEqual(paragraphs(` 오답이다. ${common.replaceAll(' ','  ')} `),[{label:null,text:common}]);
 for(const role of ['correct',undefined,'unknown'])assert.equal(paragraphs(`오답이다. ${common}`,role??null).length,2);
 for(const prefix of ['오답이다: ','오답이다.'])assert.equal(paragraphs(prefix+common).length,2);
 for(const prefix of ['오답이다! ','틀렸다. ','이 경우 오답이다. '])assert.deepEqual(paragraphs(prefix+common),[{label:null,text:prefix+common}]);
});
test('exact complete common edge sentences display the full containing context including new conditions',()=>{
 const delta='다만 이 문제는 객체의 내부 상태 변경을 묻지 않는다.';
 for(const context of [common+' '+delta,delta+' '+common,'오답이다. '+common+' '+delta])assert.deepEqual(paragraphs(context),[{label:null,text:context.replace(/^오답이다\. /,'')}]);
 assert.equal(paragraphs('Boolean 값이다. 단, 반환이 완료된 경우이다.','distractor','Boolean 값이다').length,2);
 assert.equal(paragraphs('해설의 일부 '+common).length,2);
 assert.equal(paragraphs(common+'가 틀리다는 뜻은 아니다.').length,2);
 assert.equal(paragraphs('다른 전제. '+common+' 추가 문장.').length,2);
});
test('distinct meanings, case, compatibility characters, punctuation and negation are never fuzzy-deduped',()=>{
 for(const [a,b]of [['값은 true이다.','값은 false이다.'],['①이다.','1이다.'],['ＩＤ이다.','ID이다.'],['Boolean이다.','boolean이다.'],['==이다.','===이다.'],['같다.','같지 않다.'],['반드시 적용된다.','항상 적용되는 것은 아니다.']])assert.deepEqual(paragraphs(b,'distractor',a),[{label:'공통 해설',text:a},{label:'이 문제에서',text:b}]);
 assert.deepEqual(d.optionExplanationParagraphs({explanation:' Common  reason\n',contextExplanation:'Common reason'}),[{label:null,text:'Common  reason'}]);
 assert.deepEqual(d.optionExplanationParagraphs({explanation:' ',contextExplanation:'\n'}),[]);
});
test('all 300 immutable regular.1 links are audited: 190 repeated reasons become one, 110 distinct pairs remain',()=>{
 let singles=0,doubles=0,regularSingles=0,shared=0;
 for(const q of bank.questions.filter(q=>q.type==='written'))for(const l of q.links){const o={...bank.options.find(o=>o.optionId===l.optionId),...l},p=d.optionExplanationParagraphs(o);assert(p.every(p=>p.text.trim()));if(p.length===1){singles++;if(!q.testOnly)regularSingles++;}else{assert.equal(p.length,2);doubles++;}if(q.optionMode==='shared'){shared++;assert.equal(p.length,2);}}
 assert.deepEqual({singles,doubles,regularSingles,shared},{singles:190,doubles:110,regularSingles:150,shared:10});
});
test('all historical releases and shuffled four/five option snapshots retain hashes, keys and raw backups',async()=>{
 for(const version of ['2026.10.02-seed.1','2026.10.02-seed.2','2026.10.02-seed.3','2026.10.02-seed.4','2026.10.02-regular.1']){
  const original=await fs.readFile(path.join(root,'data/releases',version,'bank.json'),'utf8'),b=JSON.parse(original),before=await d.sha256(original);
  for(const q of b.questions.filter(q=>q.type==='written'))for(const count of [4,5]){const item=d.presentQuestion(b,q,count,d.rng(31)),hash=await d.snapshotHash(item),copy=JSON.stringify(item);for(let repeat=0;repeat<3;repeat++)item.options.forEach(d.optionExplanationParagraphs);assert.equal(JSON.stringify(item),copy);assert.equal(await d.snapshotHash(item),hash);assert.equal(d.grade(item,item.correctOptionId).status,'correct');}
  let s=d.startSession(d.prepareSession(b,{type:'written',subjectId:'all',mode:'untimed',kind:'practice',count:10,minutes:30,optionCount:5,pool:'all',family:'all',feedbackAfter:'confirm'},[],4,'restore-'+version),100000);
  const backup=exportBackup([s]);s.items.forEach(q=>q.options.forEach(d.optionExplanationParagraphs));assert.deepEqual(parseBackup(backup).sessions,[s]);assert.equal(await d.sha256(await fs.readFile(path.join(root,'data/releases',version,'bank.json'),'utf8')),before);
 }
 assert.equal(await d.sha256(raw),'3abb68de23d9b58755bd9c039df5c803775705c86df0256d59570fe3c3eea5e0');
});
test('optional context permits empty or absent fields while common explanation remains required',()=>{
 for(const value of ['',undefined]){const b=clean(bank);if(value==='')for(const q of b.questions.filter(q=>q.type==='written'))for(const l of q.links)l.contextExplanation='';assert.doesNotThrow(()=>d.validateBankForPublication(b));assert.doesNotThrow(()=>d.validateExplanationAuthoring(b));const q=b.questions.find(q=>q.type==='written'),item=d.presentQuestion(b,q,5,d.rng(1));assert(item.options.every(o=>d.optionExplanationParagraphs(o).length===1));}
 for(const value of [null,5,{},[]]){const b=clean(bank);b.questions.find(q=>q.type==='written').links[0].contextExplanation=value;assert.throws(()=>d.validateBank(b));}
 for(const value of ['',undefined]){const b=clean(bank);b.options[0].explanation=value;assert.throws(()=>d.validateBank(b));}
 for(const value of [' \n ','정답이다.']){const b=clean(bank),q=b.questions.find(q=>q.type==='written'),link=q.links.find(l=>l.role==='correct');b.options.find(o=>o.optionId===link.optionId).explanation=value;assert.throws(()=>d.validateExplanationAuthoring(b),/비어 있지 않은/);}
});
test('new/changed authoring rejects deterministic duplicate, verdict-only and common-containing contexts',()=>{
 const b=clean(bank),q=b.questions.find(q=>q.type==='written'),l=q.links[0],o=b.options.find(o=>o.optionId===l.optionId);o.explanation=common;l.role='correct';
 for(const value of [common,' 정답이다. '+common,'정답입니다.',common+' 추가 조건이다.','추가 조건이다. '+common]){l.contextExplanation=value;assert.throws(()=>d.validateExplanationAuthoring(b),/공통 해설/);}
 for(const value of ['',undefined,'새로 주어진 조건에서만 적용한다.']){l.contextExplanation=value;assert.doesNotThrow(()=>d.validateExplanationAuthoring(b));}
});
test('only entire unchanged accepted questions and linked options qualify for baseline carry-forward',()=>{
 assert.doesNotThrow(()=>d.validateExplanationAuthoring(bank,bank));
 for(const mutate of [b=>b.questions[0].revision++,b=>b.questions[0].stem+=' 새 조건.',b=>b.questions[0].testOnly=false,b=>b.options[0].revision++,b=>b.options[0].content+=' 변경']){const changed=d.copy(bank);mutate(changed);assert.throws(()=>d.validateExplanationAuthoring(changed,bank),/공통 해설/);}
 const changed=d.copy(bank);changed.bankVersion='synthetic-next';assert.doesNotThrow(()=>d.validateExplanationAuthoring(changed,bank));
 const fresh=d.copy(bank);assert.throws(()=>d.validateExplanationAuthoring(fresh),/공통 해설/);
});
test('explicit candidate CLI path uses hash-verified active baseline and never trusts candidate metadata',async t=>{
 const dir=await fixture(t),next=d.copy(bank);next.bankVersion='synthetic-next';const file=await candidate(dir,next);
 assert.equal((await readBankInput(dir,file)).bank.bankVersion,'synthetic-next');
 next.questions[0].revision++;next.historicalExplanations=true;next.explanationBaseline=bank.bankVersion;await candidate(dir,next);await assert.rejects(readBankInput(dir,file),/공통 해설/);
 const cleaned=clean(next);await candidate(dir,cleaned);assert.equal((await readBankInput(dir,file)).bank.bankVersion,'synthetic-next');
 await fs.writeFile(path.join(dir,'data',manifest.file),raw+' ');await assert.rejects(readBankInput(dir,file),/hash mismatch/);
 assert.equal(JSON.parse(await fs.readFile(path.join(dir,'data/manifest.json'),'utf8')).bankVersion,bank.bankVersion);
});
test('a missing baseline cannot grandfather duplicates and failed lint never writes a release or manifest',async t=>{
 const dir=await fixture(t,{baseline:false}),file=await candidate(dir,bank);await assert.rejects(buildBank(dir,file),/공통 해설/);await assert.rejects(fs.access(path.join(dir,'data/manifest.json')),/ENOENT/);
 const cleaned=clean(bank);cleaned.bankVersion='synthetic-clean';await candidate(dir,cleaned);assert.equal((await buildBank(dir,file)).manifest.bankVersion,'synthetic-clean');
});

test('nineteen independently reviewed exact display overrides retain one existing field and fail closed on source changes',async()=>{
 let checked=0;
 for(const rule of REVIEWED_OPTION_EXPLANATIONS){const q=bank.questions.find(q=>q.questionId===rule.originalQuestion.questionId);for(const entry of rule.options){
  const item={...d.presentQuestion(bank,q,5,d.rng(27)),previouslyExposed:false},option=item.options.find(o=>o.optionId===entry.original.optionId),before=JSON.stringify(item),hash=await d.snapshotHash(item);
  assert.deepEqual(d.optionExplanationParagraphs(option,item),[{label:null,text:entry.original[entry.displayField]}]);assert.deepEqual(d.optionExplanationParagraphs(option,{...item,bankVersion:'future-cumulative.2'}),[{label:null,text:entry.original[entry.displayField]}]);assert.equal(d.optionExplanationParagraphs(option).length,2);checked++;
  for(const mutate of [i=>i.bankSchemaVersion=2,i=>i.questionId+='-unknown',i=>i.revision++,i=>i.templateId+='-unknown',i=>i.learningGoalRevision++,i=>i.stem+=' 다른 조건.',i=>i.notes.push('새 조건'),i=>i.correctOptionId='unknown',i=>i.unknownCondition='new',i=>i.materials=[{filename:'changed.html',content:'new'}]]){const copy=d.copy(item);mutate(copy);assert.equal(d.optionExplanationParagraphs(option,copy).length,2);}
  for(const mutate of [o=>o.optionId+='-unknown',o=>o.revision++,o=>o.content+=' 변경',o=>o.explanation+=' 별개 조건.',o=>o.contextExplanation+=' 별개 조건.',o=>o.role=o.role==='correct'?'distractor':'correct',o=>o.unknownCondition='new']){const copy=d.copy(option);mutate(copy);assert.equal(d.optionExplanationParagraphs(copy,item).length,2);}
  assert.equal(JSON.stringify(item),before);assert.equal(await d.snapshotHash(item),hash);
 }}
 assert.equal(checked,19);assert.equal(REVIEWED_OPTION_EXPLANATIONS.flatMap(r=>r.options).filter(e=>e.displayField==='explanation').length,15);
});
test('actual prepared session fields preserve all 209 single/91 distinct paragraphs through backup restore',()=>{
 const config={type:'written',subjectId:'all',mode:'untimed',kind:'practice',count:60,minutes:30,optionCount:5,pool:'all',family:'all',feedbackAfter:'confirm'};
 const session=d.startSession(d.prepareSession(bank,config,[],21,'all-options'),100000),before=JSON.stringify(session),restored=parseBackup(exportBackup([session])).sessions[0];
 for(const source of [session,restored]){const sizes=source.items.flatMap(item=>item.options.map(option=>d.optionExplanationParagraphs(option,item).length));assert.equal(sizes.filter(n=>n===1).length,209);assert.equal(sizes.filter(n=>n===2).length,91);}
 assert.equal(JSON.stringify(session),before);
});
test('manually staged future manifest cannot bypass authoring lint through default build or release gate',async t=>{
 const dir=await fixture(t),next=d.copy(bank);next.bankVersion='synthetic-staged';next.questions[0].revision++;
 const badRaw=JSON.stringify(next),badManifest={...manifest,bankVersion:next.bankVersion,file:`releases/${next.bankVersion}/bank.json`,sha256:await d.sha256(badRaw)};
 await fs.mkdir(path.join(dir,'data/releases',next.bankVersion),{recursive:true});await fs.writeFile(path.join(dir,'data',badManifest.file),badRaw);await fs.writeFile(path.join(dir,'data/manifest.json'),JSON.stringify(badManifest));
 await assert.rejects(buildBank(dir),/공통 해설/);
 const context=await loadRoundContext(root,null,{release:true});context.banks.set(next.bankVersion,{raw:badRaw});const result=validateReleaseLedger(context.ledgers,{manifest:badManifest,banks:context.banks});assert.equal(result.ok,false);assert.match(result.errors.join(' '),/explanation authoring/);
 const knownChanged=d.copy(bank);knownChanged.questions[0].revision++;const changedRaw=JSON.stringify(knownChanged);await fs.writeFile(path.join(dir,'data',manifest.file),changedRaw);await fs.writeFile(path.join(dir,'data/manifest.json'),JSON.stringify({...manifest,sha256:await d.sha256(changedRaw)}));await assert.rejects(buildBank(dir),/Historical explanation baseline hash mismatch/);
});

test('quoted/backticked literal whitespace is preserved in comparison, display and the new-authoring gate',()=>{
 const pairs=[
  ['문자열 "a  b"를 비교한다.','문자열 "a b"를 비교한다.'],
  ["문자열 'a\tb'를 비교한다.","문자열 'a b'를 비교한다."],
  ['코드 `a  b`를 비교한다.','코드 `a b`를 비교한다.'],
  ['<div title="a  b">이다.','<div title="a b">이다.'],
  ['문자열 “a  b”를 비교한다.','문자열 “a b”를 비교한다.'],
  [String.raw`문자열 "a\"  b"를 비교한다.`,String.raw`문자열 "a\" b"를 비교한다.`],
  ['열린 "a  b','열린 "a b'],
  ['열린 "a  ','열린 "a '],
  ['return\nx','return x'],
  ['return\tx','return x'],
  ['정규식 /a  b/이다.','정규식 /a b/이다.'],
 ];
 for(const [a,b]of pairs){assert.deepEqual(paragraphs(b,'distractor',a),[{label:'공통 해설',text:a},{label:'이 문제에서',text:b}]);const authored=clean(bank),q=authored.questions.find(q=>q.type==='written'),l=q.links[0],o=authored.options.find(o=>o.optionId===l.optionId);o.explanation=a;l.contextExplanation=b;assert.doesNotThrow(()=>d.validateExplanationAuthoring(authored));}
 const text='문자열 "a  b"를  비교한다.';assert.deepEqual(paragraphs('문자열  "a  b"를 비교한다.','distractor',text),[{label:null,text}]);
 assert.deepEqual(paragraphs('오답이다. 열린 "a  ','distractor','열린 "a  '),[{label:null,text:'열린 "a  '}]);
});
