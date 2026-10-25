import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as d from '../src/domain.js';
import {fixture} from '../qa/fixture.mjs';
import {parseBackup,exportBackup,partitionBackups,validateSession} from '../src/backup.js';
import {fetchBank} from '../src/storage.js';

function bankFixture() {
  const bank=fixture(1);bank.schemaVersion=3;
  bank.questions=bank.questions.filter(q=>q.type==='written');
  for(const q of bank.questions)q.notes=[];
  const q=bank.questions[0];q.explanationMode='components';
  q.explanation='두 계산은 독립적으로 값을 구한다.';
  q.explanationItems=[
    {id:'sum',label:'1 + 1',result:'2',explanation:'두 정수의 합은 2이다.'},
    {id:'comparison',label:'2 > 3',result:'false',explanation:'2는 3보다 작으므로 거짓이다.'},
  ];
  for(const l of q.links){bank.options.find(o=>o.optionId===l.optionId).explanation='';delete l.contextExplanation;}
  return bank;
}
const config={type:'written',subjectId:'s1',mode:'untimed',kind:'practice',count:1,minutes:30,optionCount:5,pool:'all',family:'all',feedbackAfter:'confirm'};
const make=(bank=bankFixture(),overrides={})=>d.startSession(d.prepareSession(bank,{...config,...overrides},[],17,'components-session'),100000);
test('explicit components accept blank options, retain a required summary and pass strict changed-authoring',()=>{
  const b=bankFixture();d.validateBankForPublication(b);d.validateExplanationAuthoring(b);
  for(const l of b.questions[0].links)l.contextExplanation='';
  d.validateBank(b);d.validateExplanationAuthoring(b);
  for(const value of ['',undefined,null,' \n\t ']){const changed=d.copy(b);changed.questions[0].explanation=value;assert.throws(()=>d.validateBank(changed));}
});
test('ordinary missing explanations and blank orphan or mixed shared options remain invalid',()=>{
  for(const value of ['',undefined,null]){const b=bankFixture(),q=b.questions[1];b.options.find(o=>o.optionId===q.links[0].optionId).explanation=value;assert.throws(()=>d.validateBank(b));}
  const orphan=bankFixture();orphan.options.push({optionId:'orphan',revision:1,content:'orphan',explanation:''});assert.throws(()=>d.validateBank(orphan),/연결되지 않은/);
  const mixed=bankFixture(),[a,b]=mixed.questions;a.optionMode=b.optionMode='shared';b.links[0]={...a.links[0]};assert.throws(()=>d.validateBank(mixed),/일반 문항/);
});
test('component mode is explicit, schema3-written-only and cannot mask malformed data in a trusted baseline',()=>{
  for(const mutate of [b=>delete b.questions[0].explanationMode,b=>b.questions[0].explanationMode='component',b=>b.schemaVersion=2,b=>b.schemaVersion=1,b=>b.questions[0].type='practical']){
    const b=bankFixture();mutate(b);assert.throws(()=>d.validateBank(b));
    if(b.questions[0].type==='written')assert.throws(()=>d.validateExplanationAuthoring(b,b));
  }
});
test('component items require complete unique bounded targets, results and reasons',()=>{
  const mutations=[q=>q.explanationItems=[],q=>q.explanationItems.pop(),q=>q.explanationItems=Array(41).fill(q.explanationItems[0]),q=>q.explanationItems=null,q=>q.explanationItems[0]=null,q=>q.explanationItems[0].extra='hidden',q=>delete q.explanationItems[0].result,q=>q.explanationItems[0].id='한글',q=>q.explanationItems[1].id=q.explanationItems[0].id,q=>q.explanationItems[1].label=' 1 + 1 ',q=>q.explanationItems[0].label='x'.repeat(501),q=>q.explanationItems[0].result='x'.repeat(2001),q=>q.explanationItems[0].explanation='x'.repeat(10001)];
  for(const field of ['label','result','explanation'])for(const v of ['',null,' \n '])mutations.push(q=>q.explanationItems[0][field]=v);
  for(const mutate of mutations){const b=bankFixture();mutate(b.questions[0]);assert.throws(()=>d.validateBank(b));assert.throws(()=>d.validateExplanationAuthoring(b,b));}
});
test('components reject residual option or context explanations instead of silently hiding author errors',()=>{
  for(const value of [undefined,null,' ','정답이다.','남은 이유']){const b=bankFixture();b.options[0].explanation=value;assert.throws(()=>d.validateBank(b));assert.throws(()=>d.validateExplanationAuthoring(b,b));}
  for(const value of [null,' ','남은 이유']){const b=bankFixture();b.questions[0].links[0].contextExplanation=value;assert.throws(()=>d.validateBank(b));assert.throws(()=>d.validateExplanationAuthoring(b,b));}
  assert.deepEqual(d.optionExplanationParagraphs({explanation:'stale',contextExplanation:'stale'},{explanationMode:'components'}),[]);
});
test('shared component options require every member to use the same explicit blank contract',()=>{
  const b=bankFixture(),a=b.questions[0],second=d.copy(a);a.optionMode='shared';second.optionMode='shared';second.questionId='shared-components';second.templateId='shared-components';b.questions.push(second);d.validateBank(b);d.validateExplanationAuthoring(b);
  delete second.explanationMode;delete second.explanationItems;assert.throws(()=>d.validateBank(b),/일반 문항/);
});
test('four/five choice shuffling copies stable component order, keys and snapshot hashes without mutation',async()=>{
  const b=bankFixture(),q=b.questions[0],before=JSON.stringify(b),orders=new Set();
  for(const count of [4,5])for(let seed=1;seed<=12;seed++){
    const item=d.presentQuestion(b,q,count,d.rng(seed)),raw=JSON.stringify(item),hash=await d.snapshotHash(item);orders.add(item.options.map(o=>o.optionId).join());
    assert.deepEqual(item.explanationItems,q.explanationItems);assert.equal(d.grade(item,item.correctOptionId).status,'correct');
    item.options.forEach(o=>assert.deepEqual(d.optionExplanationParagraphs(o,item),[]));
    assert.equal(JSON.stringify(item),raw);assert.equal(await d.snapshotHash(item),hash);
  }
  assert(orders.size>2);assert.equal(JSON.stringify(b),before);
});
test('session and partitioned backup round trips preserve components, results, grades and unmodified legacy sessions',async()=>{
  let s=make();const q=s.items[0];s=d.setAnswer(s,q.instanceId,q.correctOptionId,100001);s=d.confirmAnswer(s,q.instanceId,100002);s=d.revealExplanation(s,q.instanceId,100003);s=d.finalize(s,'submitted',100004);
  const legacy=JSON.parse(await fs.readFile(new URL('../data/seed-bank.json',import.meta.url),'utf8'));
  const old=d.startSession(d.prepareSession(legacy,{...config,count:2},[],3,'legacy-session'),100000);const saved=[old,s],before=JSON.stringify(saved);
  saved.forEach(validateSession);assert.deepEqual(parseBackup(exportBackup(saved)).sessions,JSON.parse(before));
  assert.deepEqual(partitionBackups(saved,{maxSessions:1}).flatMap(p=>parseBackup(p.content).sessions),JSON.parse(before));
  assert.equal(JSON.stringify(saved),before);assert.equal(s.result.correct,1);
  const corrupt=d.copy(s);delete corrupt.items[0].explanationMode;assert.throws(()=>validateSession(corrupt));assert.throws(()=>parseBackup(exportBackup([corrupt])));
});
test('component explanations retain existing confirm/end/timed disclosure policy',()=>{
  for(const overrides of [{},{feedbackAfter:'end'},{mode:'timed'}]){
    let s=make(bankFixture(),overrides);const item=s.items[0];assert.equal(d.canShowExplanation(s,item),false);assert.throws(()=>d.revealExplanation(s,item.instanceId,100001));
    s=d.setAnswer(s,item.instanceId,item.correctOptionId,100002);
    if(s.config.mode==='untimed')s=d.confirmAnswer(s,item.instanceId,100003);
    assert.equal(d.canShowExplanation(s,item),s.config.mode==='untimed'&&s.config.feedbackAfter!=='end');
    s=d.finalize(s,'submitted',100004);assert.equal(d.canShowExplanation(s,item),true);
  }
});
test('manifest hash validation accepts valid components and refuses malformed downloaded contracts',async()=>{
  for(const bad of [false,true]){
    const b=bankFixture();if(bad)b.options[0].explanation='leftover';const raw=JSON.stringify(b),manifest={schemaVersion:1,bankVersion:b.bankVersion,releasedAt:b.releasedAt,file:`releases/${b.bankVersion}/bank.json`,sha256:await d.sha256(raw)};
    const fetcher=async url=>({ok:true,json:async()=>manifest,text:async()=>raw});
    if(bad)await assert.rejects(fetchBank('https://example.test/',fetcher));else assert.deepEqual((await fetchBank('https://example.test/',fetcher)).bank,b);
  }
});
test('renderer emits each component once and no empty option UI while ordinary explanations remain',async()=>{
  const source=await fs.readFile(new URL('../src/app.js',import.meta.url),'utf8');
  const node=(tag,attrs={},...children)=>({tag,attrs,children:children.flat(Infinity).filter(x=>x!=null),append(...more){this.children.push(...more.flat(Infinity).filter(x=>x!=null));}});
  const walk=n=>typeof n==='object'?[n,...n.children.flatMap(walk)]:[],texts=n=>typeof n==='object'?n.children.map(texts).join('\n'):String(n);
  const ctx={...d,node,renderMaterials:()=>null};vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function renderExplanation('),source.indexOf('async function finishPractice('))+'\nglobalThis.render=renderExplanation',ctx);
  const b=bankFixture(),q=b.questions[0],item=d.presentQuestion(b,q,5,d.rng(3)),before=JSON.stringify(item),tree=ctx.render(item,item.correctOptionId),text=texts(tree);
  assert.equal(walk(tree).filter(n=>n.attrs.class==='component-explanations').length,1);assert.equal(walk(tree).filter(n=>n.tag==='ol').length,1);
  for(const part of q.explanationItems)for(const value of [part.label,part.result,part.explanation])assert(text.includes(value));
  assert(!text.includes('정답 선택지'));assert(!text.includes('오답 선택지'));assert(!text.includes('공통 해설'));assert(!text.includes('해설 없음'));assert.equal(JSON.stringify(item),before);
  const ordinary=d.presentQuestion(b,b.questions[1],5,d.rng(3)),ordinaryText=texts(ctx.render(ordinary,ordinary.correctOptionId));assert(ordinaryText.includes('정답 선택지'));assert(!ordinaryText.includes('구성 항목별 해설'));
});

test('component labels preserve code-literal whitespace and Unicode differences',()=>{
  for(const labels of [['"a  b".length','"a b".length'],['"①"','"1"'],['"ＩＤ"','"ID"']]){const b=bankFixture();labels.forEach((label,i)=>b.questions[0].explanationItems[i].label=label);d.validateBank(b);d.validateExplanationAuthoring(b);}
});

test('practical extra links cannot authorize an empty standalone option explanation',()=>{
  const b=bankFixture(),practical=fixture(1).questions.find(q=>q.type==='practical');practical.notes=[];delete practical.materials;practical.links=[{optionId:'orphan',optionRevision:1,role:'correct',compatibilitySetId:'qa'}];b.questions.push(practical);b.options.push({optionId:'orphan',revision:1,content:'orphan',explanation:''});assert.throws(()=>d.validateBank(b),/구성 항목 필기 외/);
  const summary=bankFixture();summary.questions[0].explanation=' \n\t ';assert.throws(()=>d.validateExplanationAuthoring(summary,summary),/문항 전체 해설/);
});
