import {readSuccessor} from './successor-projection.mjs';
// Portable exact-byte public-main oracle; authenticated by the successor projection fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import {types} from 'node:util';
import * as main from './fixtures/public-main-9ae76b4/src/domain.js';
import * as draft from '../src/domain.js';
import {regularCoverage as mainCoverage} from './fixtures/public-main-9ae76b4/scripts/campaign-validation-primitives.mjs';
import {regularCoverage as draftCoverage} from '../scripts/campaign-validation-primitives.mjs';
import {fixture} from '../qa/fixture.mjs';
await readSuccessor(new URL('../',import.meta.url));
const presenter=bank=>draft.createCoveragePresenter(bank,types.isProxy);

const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const errorValue=e=>({name:e.name,code:e.code,message:e.message});
function call(present,bank,q,{count=5,seed=17,id=q.questionId,onRandom}={}) {
  const draw=main.rng(seed),trace=[];
  const random=()=>{const n=draw();trace.push(n);onRandom?.(trace.length,bank,q);return n;};
  try{return {snapshot:present(q,count,random,id),trace};}catch(e){return {error:errorValue(e),trace};}
}
function pair(make,{count=5,seed=17,id='instance'}={}) {
  const left=make(),right=make();
  const expected=call((...args)=>main.presentQuestion(left.bank,...args),left.bank,left.q,{count,seed,id});
  const actual=call(presenter(right.bank),right.bank,right.q,{count,seed,id});
  assert.deepEqual(actual,expected);return {actual,expected};
}
function countMaps(bank,operation) {
  const NativeMap=globalThis.Map,options=new Set(bank.options);let count=0;
  globalThis.Map=new Proxy(NativeMap,{construct(target,args,newTarget){
    const entries=args[0];
    if(Array.isArray(entries)&&entries.length===bank.options.length&&entries.every(p=>Array.isArray(p)&&p.length===2&&options.has(p[1])&&p[0]===p[1].optionId))count++;
    return Reflect.construct(target,args,newTarget);
  }});
  try{return {value:operation(),count};}finally{globalThis.Map=NativeMap;}
}
const small=()=>{const bank=fixture(1);return {bank,q:bank.questions[0]};};

test('public API keeps defaults, length, result and RNG trace on the actual main oracle',()=>{
  assert.equal(draft.presentQuestion.length,main.presentQuestion.length);
  const bank=freeze(fixture(1));
  for(const q of bank.questions)for(const count of [4,5])for(const seed of [0,1,29,128]){
    assert.deepEqual(call((...args)=>draft.presentQuestion(bank,...args),bank,q,{count,seed}),call((...args)=>main.presentQuestion(bank,...args),bank,q,{count,seed}));
  }
  const random=Math.random;try{Math.random=()=>0;assert.deepEqual(draft.presentQuestion(bank,bank.questions[0]),main.presentQuestion(bank,bank.questions[0]));}finally{Math.random=random;}
});
test('private presenter keeps exact frozen written/practical snapshots and RNG order',()=>{
  const bank=freeze(fixture(1)),present=presenter(bank);
  for(const q of bank.questions)for(const count of [4,5])for(const seed of [0,1,29,128]){
    assert.deepEqual(call(present,bank,q,{count,seed}),call((...args)=>main.presentQuestion(bank,...args),bank,q,{count,seed}));
  }
});
test('only one option Map per frozen coverage invocation; public API and mutable banks rebuild',()=>{
  const frozen=freeze(fixture(20)),mutable=fixture(20);
  const a=countMaps(frozen,()=>mainCoverage(frozen)),b=countMaps(frozen,()=>draftCoverage(frozen));
  assert.deepEqual(b.value,a.value);assert.equal(a.count,100);assert.equal(b.count,1);
  assert.equal(countMaps(frozen,()=>draftCoverage(frozen)).count,1);
  assert.equal(countMaps(mutable,()=>draftCoverage(mutable)).count,100);
  assert.equal(countMaps(frozen,()=>{draft.presentQuestion(frozen,frozen.questions[0]);draft.presentQuestion(frozen,frozen.questions[1]);}).count,2);
  const noDetector=draft.createCoveragePresenter(frozen);
  assert.equal(countMaps(frozen,()=>{noDetector(frozen.questions[0]);noDetector(frozen.questions[1]);}).count,2);
});
test('fresh snapshots, sources, option copies and choices; caller result edits cannot poison next result',()=>{
  const bank=freeze(fixture(1)),q=bank.questions[0],present=presenter(bank);
  const a=call(present,bank,q),b=call(present,bank,q);
  assert.deepEqual(a,b);assert.notEqual(a.snapshot,b.snapshot);assert.notEqual(a.snapshot.sources[0],b.snapshot.sources[0]);assert.notEqual(a.snapshot.options[0],b.snapshot.options[0]);
  a.snapshot.options[0].content='changed';a.snapshot.sources[0].title='changed';
  assert.deepEqual(call(present,bank,q),b);
});
test('duplicate option IDs retain Map last value semantics',()=>{
  const result=pair(()=>{const {bank,q}=small();bank.options.push({...bank.options[0],content:'last duplicate value'});freeze(bank);return {bank,q};});
  assert.equal(result.actual.snapshot.options.find(o=>o.optionId===result.actual.snapshot.correctOptionId).content,'last duplicate value');
});
for(const [name,change] of [
  ['missing correct link',({q})=>{q.links[0].optionId='absent';}],
  ['missing distractor links',({q})=>{q.links[1].optionId='absent1';q.links[2].optionId='absent2';}],
  ['duplicate normalized content',({bank})=>{bank.options[1].content=bank.options[0].content;bank.options[2].content=bank.options[0].content;}],
  ['missing links field',({q})=>{delete q.links;}],
  ['invalid content value',({bank})=>{bank.options[0].content=null;}],
  ['missing source reference',({q})=>{q.sourceRefs=['absent'];}]
])test(`matches exact main result/error and RNG for ${name}`,()=>pair(()=>{const value=small();change(value);freeze(value.bank);return value;}));
test('unsupported count fails before reading options, source failure still comes first',()=>{
  for(const sourceFailure of [false,true]){
    const make=()=>{const {bank,q}=small();Object.defineProperty(bank,'options',{get(){throw Error('options must not be read');}});if(sourceFailure)Object.defineProperty(bank,'sources',{get(){throw Error('source first');}});return {bank,q};};
    const {actual}=pair(make,{count:7});assert.equal(actual.trace.length,0);assert.equal(actual.error.message,sourceFailure?'source first':'이 문항은 선택한 선택지 수를 지원하지 않습니다.');
  }
});
test('practical presentation never reads options',()=>pair(()=>{const bank=fixture(1),q=bank.questions.at(-1);Object.defineProperty(bank,'options',{get(){throw Error('unused options');}});return {bank,q};}));
test('mutable IDs and array replacement are seen on the next call, including RNG mutation',()=>{
  const scenario=useDraft=>{const bank=fixture(1),q=bank.questions[0],present=useDraft?presenter(bank):(...args)=>main.presentQuestion(bank,...args);
    const results=[];results.push(call(present,bank,q,{onRandom(n){if(n===1){bank.options[0].content='changed during draw';}}}));
    bank.options[0].optionId='new-id';q.links[0].optionId='new-id';results.push(call(present,bank,q));
    bank.options=freeze(bank.options.map(o=>({...o})));results.push(call(present,bank,q));
    bank.options=freeze(bank.options.map(o=>({...o,content:o.content+' replacement'})));results.push(call(present,bank,q));return results;};
  assert.deepEqual(scenario(true),scenario(false));
});
test('mutable questions re-run choicePlans after cached index, with no successful-result cache',()=>{
  const scenario=useDraft=>{const bank=fixture(1);freeze(bank.options);const q=bank.questions[0],present=useDraft?presenter(bank):(...args)=>main.presentQuestion(bank,...args);const a=call(present,bank,q);q.links[0].optionId='absent';const b=call(present,bank,q);q.links[0].optionId=bank.options[0].optionId;const c=call(present,bank,q);return [a,b,c];};
  assert.deepEqual(scenario(true),scenario(false));
});
test('partly frozen inputs, own map methods and optionId accessors rebuild every time',()=>{
  for(const variant of ['array-only','option-id-getter','own-map','index-getter']){
    const scenario=useDraft=>{const bank=fixture(1);let reads=0;
      if(variant==='option-id-getter'){const option=bank.options[0],id=option.optionId;Object.defineProperty(option,'optionId',{get(){reads++;return id;},enumerable:true});}
      if(variant==='own-map')Object.defineProperty(bank.options,'map',{value:function(fn){reads++;return Array.prototype.map.call(this,fn);}});
      if(variant==='index-getter'){const option=bank.options[0];Object.defineProperty(bank.options,'0',{get(){reads++;return option;},enumerable:true});}
      if(variant!=='array-only')bank.options.forEach(Object.freeze);Object.freeze(bank.options);
      const present=useDraft?presenter(bank):(...args)=>main.presentQuestion(bank,...args),q=bank.questions[0];
      return {results:[call(present,bank,q),call(present,bank,q)],reads};};
    assert.deepEqual(scenario(true),scenario(false),variant);
  }
});
test('a failed option Map construction is retried, retaining the exact error',()=>{
  const scenario=useDraft=>{const bank=fixture(1),q=bank.questions[0];let attempts=0;bank.options.map=function(fn){if(++attempts===1)throw Error('first map failure');return Array.prototype.map.call(this,fn);};const present=useDraft?presenter(bank):(...args)=>main.presentQuestion(bank,...args);return {results:[call(present,bank,q),call(present,bank,q)],attempts};};
  assert.deepEqual(scenario(true),scenario(false));
});
test('unused Proxy option throwing only during eligibility cannot turn success into failure',()=>{
  const scenario=useDraft=>{const bank=fixture(20);bank.options.forEach(Object.freeze);bank.options.push(new Proxy({optionId:'unused',content:'unused'},{getPrototypeOf(){throw Error('eligibility-only');}}));Object.freeze(bank.options);return (useDraft?draftCoverage:mainCoverage)(bank);};
  assert.deepEqual(scenario(true),scenario(false));assert.equal(scenario(true).mockEligible,true);
});
test('Proxy inspection traps cannot introduce mutations and Proxy array map reads are never cached',()=>{
  for(const variant of ['unused-option','array']){
    const scenario=useDraft=>{const bank=fixture(20);let mapReads=0,reflectionReads=0;
      if(variant==='unused-option'){bank.options.push(new Proxy({optionId:'unused',content:'unused'},{getPrototypeOf(){reflectionReads++;bank.questions[0].links=[];return Object.prototype;}}));bank.options.slice(0,-1).forEach(Object.freeze);}
      else bank.options.forEach(Object.freeze);
      Object.freeze(bank.options);
      if(variant==='array')bank.options=new Proxy(bank.options,{get(target,key,receiver){if(key==='map'){mapReads++;return function(fn){return Array.prototype.map.call(target,fn);};}return Reflect.get(target,key,receiver);}});
      return {result:(useDraft?draftCoverage:mainCoverage)(bank),mapReads,reflectionReads};};
    const actual=scenario(true),expected=scenario(false);assert.deepEqual(actual,expected);assert.equal(actual.reflectionReads,0);if(variant==='array')assert.equal(actual.mapReads,100);
  }
});
test('changes to Array mapping constructor/species disable reuse without executing extra getters',()=>{
  for(const location of ['constructor','species']){
    const scenario=useDraft=>{const bank=freeze(fixture(1)),q=bank.questions[0],present=useDraft?presenter(bank):(...args)=>main.presentQuestion(bank,...args);
      const first=call(present,bank,q);let reads=0;const object=location==='constructor'?Array.prototype:Array,key=location==='constructor'?'constructor':Symbol.species,previous=Object.getOwnPropertyDescriptor(object,key);
      try {Object.defineProperty(object,key,{configurable:true,get(){reads++;return Array;}});const second=call(present,bank,q);return {first,second,reads};}finally{Object.defineProperty(object,key,previous);}};
    assert.deepEqual(scenario(true),scenario(false));
  }
});
test('source changes after a frozen index hit remain fresh',()=>{
  const scenario=useDraft=>{const bank=fixture(1);freeze(bank.options);const q=bank.questions[0],present=useDraft?presenter(bank):(...args)=>main.presentQuestion(bank,...args);const first=call(present,bank,q);bank.sources[0].title='updated source';bank.bankVersion='updated-version';return [first,call(present,bank,q)];};
  assert.deepEqual(scenario(true),scenario(false));
});
test('regularCoverage retains correction timestamps, duplicate templates, failed first variant and mutable effects',()=>{
  for(const at of ['2026-10-01','2026-10-03']){
    const bank=fixture(20),q=bank.questions[0];bank.questions.unshift({...structuredClone(q),links:[]});bank.corrections=[{questionId:q.questionId,revision:q.revision,kind:'invalid',effectiveAt:'2026-10-02T00:00:00Z'}];freeze(bank);
    assert.deepEqual(draftCoverage(bank,Date.parse(at)),mainCoverage(bank,Date.parse(at)));
  }
});
