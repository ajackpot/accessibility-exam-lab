import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as d from '../src/domain.js';
import * as w from '../src/workflows.js';
import * as b from '../src/backup.js';
const seed=JSON.parse(fs.readFileSync(new URL('../data/seed-bank-v4.json',import.meta.url),'utf8'));
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
// Synthetic clones exercise policy only; they are never written into a released bank.
function fixture(){const bank=d.copy(seed);bank.questions.push(...seed.questions.map(q=>({...d.copy(q),questionId:`qa-regular-${q.questionId}`,templateId:`qa-regular-${q.templateId}`,testOnly:false})));return bank;}
const config=(type='written',overrides={})=>w.practiceConfig(type,overrides);
const prepare=(bank,c,history=[])=>d.prepareSession(w.practiceSelection(bank,c,history).bank,c,history,13,'new-practice');
const correct=q=>q.type==='written'?q.correctOptionId:Object.fromEntries(q.parts.map(p=>[p.partId,p.kind==='text'?p.accepted[0]:p.kind==='single'?p.correct[0]:p.correct]));
function completed(bank,questions,{mode='untimed',wrong=false,id='history'}={}){let s=d.startSession(d.prepareSession({...bank,questions},config(questions[0].type,{count:questions.length,mode}),[],17,id),100000);for(const q of s.items)s=d.setAnswer(s,q.instanceId,wrong&&q.type==='written'?q.options.find(o=>o.optionId!==q.correctOptionId).optionId:correct(q),100001);return w.submitSelectedAnswers(s,100002);}
const extract=(start,end)=>app.slice(app.indexOf(start),app.indexOf(end));

test('fresh practice selects only eligible regular questions for both types and every requested scope',()=>{
 const bank=fixture(),before=JSON.stringify(bank);
 const configs=[config(),config('practical'),...d.SUBJECTS.flatMap(s=>[4,5].map(optionCount=>config('written',{subjectId:s.id,optionCount}))),...['implementation','inspection'].map(family=>config('practical',{family}))];
 for(const c of configs){const selection=w.practiceSelection(bank,c);assert.ok(selection.count>0);assert.equal(selection.testOnly,false);assert.equal(selection.count,d.eligibleQuestions(bank,c).filter(q=>!q.testOnly).length);assert.ok(selection.bank.questions.every(q=>!q.testOnly));const s=prepare(bank,{...c,count:selection.count});assert.ok(s.items.every(q=>!q.testOnly));assert.equal(s.items.length,selection.count);assert.equal(s.generatorVersion,'2');assert.equal(s.bankVersion,bank.bankVersion);}
 assert.equal(JSON.stringify(bank),before);
});

test('regular count shortage is explicit and never topped up with test seeds',()=>{
 const bank=fixture(),c=config('written',{subjectId:'s1',count:3});assert.equal(d.eligibleQuestions(bank,c).length,4);assert.equal(w.availableCount(bank,c),2);
 assert.throws(()=>prepare(bank,c),error=>error.code==='INSUFFICIENT'&&/요청한 3문항.*2개/.test(error.message));assert.equal(w.quickConfig(bank,'written',[],{subjectId:'s1'}).count,2);
});

test('zero regular eligibility has seed fallback only inside the requested scope',()=>{
 const bank=fixture();for(const q of bank.questions)if(!q.testOnly&&(q.subjectId==='s1'||q.family==='inspection'))q.verificationStatus='retired';
 for(const c of [config('written',{subjectId:'s1',count:2}),config('practical',{family:'inspection',count:2})]){const selection=w.practiceSelection(bank,c);assert.equal(selection.testOnly,true);assert.equal(selection.count,2);const session=prepare(bank,c);assert.ok(session.items.every(q=>q.testOnly));assert.equal(session.items.length,2);}
 assert.equal(w.practiceSelection(bank,config('written',{subjectId:'s2'})).testOnly,false);
});

test('option count, publication state and effective invalid corrections are respected before fallback',()=>{
 const bank=fixture(),regular=bank.questions.filter(q=>!q.testOnly&&q.subjectId==='s1');regular[0].supportedOptionCounts=[4];regular[1].verificationStatus='draft';
 assert.equal(w.practiceSelection(bank,config('written',{subjectId:'s1',optionCount:5})).testOnly,true);
 assert.equal(w.availableCount(bank,config('written',{subjectId:'s1',optionCount:4})),1);
 bank.corrections.push({kind:'invalid',questionId:regular[0].questionId,revision:regular[0].revision,effectiveAt:'2020-01-01T00:00:00Z'});
 assert.equal(w.practiceSelection(bank,config('written',{subjectId:'s1',optionCount:4})).testOnly,true);
});

test('new-goal selection prefers remaining regular goals and explicitly falls back only when exhausted',()=>{
 const bank=fixture(),regular=bank.questions.filter(q=>!q.testOnly&&q.subjectId==='s1'),c=config('written',{subjectId:'s1',pool:'new',count:1});
 const first=completed(bank,[regular[0]]);let selection=w.practiceSelection(bank,c,[first]);assert.equal(selection.count,1);assert.equal(selection.testOnly,false);assert.equal(prepare(bank,c,[first]).items[0].questionId,regular[1].questionId);
 const all=completed(bank,regular);selection=w.practiceSelection(bank,c,[all]);assert.equal(selection.count,2);assert.equal(selection.testOnly,true);assert.ok(prepare(bank,c,[all]).items[0].testOnly);
});

test('selection counts unique regular templates and never counts duplicate variants as more knowledge',()=>{
 const bank=fixture(),regular=bank.questions.find(q=>!q.testOnly&&q.type==='written');bank.questions.push({...d.copy(regular),questionId:'qa-same-goal-variant'});
 assert.equal(w.availableCount(bank,config()),10);const s=prepare(bank,config('written',{count:10}));assert.equal(new Set(s.items.map(q=>q.templateId)).size,10);
});

test('mock gate ignores all test seeds and remains closed below twenty regular goals per subject',()=>{
 const bank=fixture(),c=config('written',{kind:'mock',count:100});assert.equal(w.mockAvailability(bank).ready,false);assert.ok(w.mockAvailability(bank).counts.every(s=>s.count===2));assert.equal(w.availableCount(bank,c),10);assert.throws(()=>prepare(bank,c),error=>error.code==='MOCK_UNAVAILABLE');
 const noRegular=w.practiceSelection(seed,c);assert.equal(noRegular.count,0);assert.equal(noRegular.testOnly,false);
});

test('legacy seed-only and empty banks retain honest small defaults without schema additions',()=>{
 for(const type of ['written','practical']){const c=w.quickConfig(seed,type),selection=w.practiceSelection(seed,c);assert.equal(c.count,type==='written'?5:2);assert.equal(selection.testOnly,true);assert.deepEqual(Object.keys(c).sort(),Object.keys(config(type)).sort());assert.ok(prepare(seed,c).items.every(q=>q.testOnly));}
 assert.deepEqual(w.practiceSelection(null,config()),{bank:null,count:0,testOnly:false});assert.equal(w.quickConfig({...seed,questions:[]},'written').count,0);
});

test('mixed session labels and result notices count each classification without changing saved data',()=>{
 const bank=fixture(),session=completed(bank,[bank.questions[0],bank.questions.find(q=>!q.testOnly&&q.type==='written')]),before=JSON.stringify(session),summary=w.sessionContentSummary(session);
 assert.equal(summary.regular,1);assert.equal(summary.tests,1);assert.equal(summary.label,'일반 학습 1문항 · 체험용 테스트 1문항');assert.match(summary.notice,/함께 포함/);assert.match(summary.notice,/전체 점수.*모든 문항/);assert.match(summary.notice,/문항별로 나누어 집계/);assert.doesNotMatch(summary.notice,/^체험용 테스트 문항의 결과/);assert.equal(JSON.stringify(session),before);
 const regular=w.sessionContentSummary({items:session.items.filter(q=>!q.testOnly)}),testOnly=w.sessionContentSummary({items:session.items.filter(q=>q.testOnly)});assert.equal(regular.notice,null);assert.equal(regular.label,'일반 학습 1문항');assert.match(testOnly.notice,/^체험용 테스트 문항의 결과/);
});

test('mixed-session statistics stay separated while totals and snapshots remain intact',()=>{
 const bank=fixture(),session=completed(bank,[bank.questions[0],bank.questions.find(q=>!q.testOnly&&q.type==='written')]),before=JSON.stringify(session);
 assert.equal(session.result.total,2);assert.equal(session.result.correct,2);assert.equal(d.statistics([session],{mode:'untimed',type:'written',testOnly:false}).first.count,1);assert.equal(d.statistics([session],{mode:'untimed',type:'written',testOnly:true}).first.count,1);w.sessionContentSummary(session);assert.equal(JSON.stringify(session),before);
});

test('exact legacy seed wrong-review groups bypass fresh regular preference without mixing other goals',()=>{
 const bank=fixture(),old=completed(seed,[seed.questions[0]],{wrong:true,id:'seed-error'}),plan=w.reviewPlan(bank,[old],'written');assert.equal(plan.available,1);assert.equal(plan.groups.length,1);
 const s=d.prepareSession(plan.groups[0].bank,plan.groups[0].config,[old],13,'seed-review');assert.equal(s.items[0].questionId,old.items[0].questionId);assert.equal(s.items[0].testOnly,true);assert.deepEqual(new Set(s.items.map(q=>q.questionId)),new Set(old.items.map(q=>q.questionId)));
});

test('mixed wrong-review groups include exact selected regular and seed goals together',()=>{
 const bank=fixture(),old=completed(bank,[bank.questions[0],bank.questions.find(q=>!q.testOnly&&q.type==='written')],{wrong:true}),plan=w.reviewPlan(bank,[old],'written');assert.equal(plan.available,2);const s=d.prepareSession(plan.bank,plan.config,[old],13,'mixed-review');assert.equal(w.sessionContentSummary(s).regular,1);assert.equal(w.sessionContentSummary(s).tests,1);assert.deepEqual(new Set(s.items.map(q=>q.questionId)),new Set(old.items.map(q=>q.questionId)));
});

test('old seed snapshots, answers, scores and choice order survive backup and timed conversion unchanged',async()=>{
 const old=completed(seed,[seed.questions[0]],{id:'old-seed'});old.appVersion='0.2.6';const before=JSON.stringify(old),hash=await d.sha256(before);assert.deepEqual(b.parseBackup(b.exportBackup([old])).sessions,[old]);
 let timed=d.startSession(d.prepareSession(seed,config('practical',{count:2,mode:'timed'}),[],23,'old-timed'),100000);timed=d.setAnswer(timed,timed.items[0].instanceId,correct(timed.items[0]),100001);timed.appVersion='0.2.6';const snapshot=d.copy(timed.items),answers=d.copy(timed.answers),converted=d.convertToUntimed(timed,'converted',100002);assert.deepEqual(converted.next.items,snapshot);assert.deepEqual(converted.next.answers,answers);assert.deepEqual(b.parseBackup(b.exportBackup([converted.old,converted.next])).sessions,[converted.old,converted.next]);assert.equal(await d.sha256(JSON.stringify(old)),hash);
});

test('app start scopes fresh practice after refreshed history but respects explicit review banks',async()=>{
 const bank=fixture(),stored=[];let refreshedHistory=[];const ctx={state:{bank,sessions:[],openGeneration:1,store:{insert:async s=>stored.push(s),update:async(id,revision,mut)=>mut(stored.find(s=>s.sessionId===id))}},document:{querySelectorAll:()=>[]},clearError(){},refreshSessions:async()=>{ctx.state.sessions=refreshedHistory;},practiceSelection:w.practiceSelection,prepareSession:d.prepareSession,startSession:d.startSession,openSession:async()=>{},announce(){},showError(error){throw error;}};
 vm.createContext(ctx);vm.runInContext(extract('async function startPractice(','async function renderWrong(')+'\nglobalThis.start=startPractice;',ctx);
 await ctx.start(config('written',{count:2}));assert.ok(stored[0].items.every(q=>!q.testOnly));await ctx.start(config('written',{count:1}),{...bank,questions:[bank.questions[0]]});assert.equal(stored[1].items[0].testOnly,true);
 await assert.rejects(ctx.start(config('written',{subjectId:'s1',count:3})),/요청한 3문항.*2개/);assert.equal(stored.length,2);
 refreshedHistory=[completed(bank,bank.questions.filter(q=>!q.testOnly&&q.subjectId==='s1'))];await ctx.start(config('written',{subjectId:'s1',pool:'new',count:1}));assert.equal(stored[2].items[0].testOnly,true);
});

test('rendered home/history labels and result notices report a mixed saved session accurately',async()=>{
 const bank=fixture(),session=completed(bank,[bank.questions[0],bank.questions.find(q=>!q.testOnly&&q.type==='written')]),screens=[];
 const ctx={state:{bank:null,sessions:[session]},sessionContentSummary:w.sessionContentSummary,sessionNavigation:w.sessionNavigation,typeLabel:w.typeLabel,sessionResult:d.sessionResult,reviewEntries:w.reviewEntries,statusName:{submitted:'최종 제출'},outcomeName:{correct:'정답'},date:()=> 'date',fmt:value=>String(value),subjectName:id=>id,rememberRoute(){},node:(tag,attrs,...children)=>({tag,attrs,children}),button:label=>label,actions:(...children)=>children,homeLink:()=> '홈으로',screen:(...children)=>screens.push(children)};
 vm.createContext(ctx);vm.runInContext(extract('function sessionLabel(','function sessionLink(')+extract('async function renderResult(','async function renderReview(')+'\nObject.assign(globalThis,{sessionLabel,sessionLinkText,renderResult});',ctx);
 assert.match(ctx.sessionLinkText(session),/일반 학습 1문항 · 체험용 테스트 1문항/);assert.match(ctx.sessionLinkText(session,true),/일반 학습 1문항 · 체험용 테스트 1문항/);await ctx.renderResult(session);const text=JSON.stringify(screens);assert.match(text,/함께 포함된 결과/);assert.doesNotMatch(text,/체험용 테스트 문항의 결과입니다/);assert.match(text,/전체 2문항/);
});

function setupHarness(bank){
 const nodes=new Map(),all=[];let ctx;
 function node(tag,attrs={},...children){const el={tag,attrs,children:children.flat(Infinity),handlers:{},value:String(attrs.value??''),disabled:!!attrs.disabled,hidden:!!attrs.hidden,_text:'',addEventListener(event,fn){this.handlers[event]=fn;},append(...children){this.children.push(...children);}};Object.defineProperty(el,'textContent',{get(){return this._text+this.children.map(c=>typeof c==='object'?c.textContent??'':String(c)).join('');},set(value){this._text=String(value);this.children=[];}});Object.defineProperty(el,'selectedOptions',{get(){return this.children.filter(c=>c.value===this.value);}});if(attrs.id)nodes.set(attrs.id,el);all.push(el);return el;}
 function select(id,values,value){const el=node('select',{id},...values.map(([value,text])=>node('option',{value},text)));el.value=String(value);return el;}
 function button(text,fn,attrs={}){const el=node('button',attrs,text);el.handlers.click=fn;return el;}
 ctx={state:{bank,sessions:[],openGeneration:1},quickConfig:w.quickConfig,practiceSelection:w.practiceSelection,availableCount:w.availableCount,mockAvailability:w.mockAvailability,SUBJECTS:d.SUBJECTS,typeLabel:w.typeLabel,clearError(){},showError(error){throw error;},rememberRoute(){},select,node,button,labelInput:(label,input)=>node('label',{},label,input),actions:(...children)=>node('div',{},...children),helpDetails:(...children)=>node('details',{},...children),history:{replaceState(){}},screen(){},announce(){}};
 vm.createContext(ctx);vm.runInContext(extract('function renderSetup(','async function openSession(')+'\nglobalThis.setup=renderSetup;',ctx);return {ctx,nodes,all};
}

test('setup shows regular-only availability, preserves excessive input, and clearly discloses scoped seed fallback',()=>{
 const bank=fixture();bank.questions.filter(q=>!q.testOnly&&q.subjectId==='s2').forEach(q=>q.verificationStatus='retired');const {ctx,nodes,all}=setupHarness(bank);ctx.setup('written',{subjectId:'s1'});
 const count=nodes.get('count'),starts=all.filter(el=>el.attrs['data-start']==='setup'),availability=nodes.get('availability');assert.equal(Number(count.value),2);assert.match(availability.textContent,/일반 학습 2문항/);assert.ok(starts.every(el=>!el.disabled));
 count.value='3';count.handlers.input();assert.equal(count.value,'3');assert.ok(starts.every(el=>el.disabled));assert.match(nodes.get('setup-error').textContent,/2 이하/);
 all.find(el=>el.textContent==='가능한 문항 수로 바꾸기').handlers.click();assert.equal(Number(count.value),2);assert.ok(starts.every(el=>!el.disabled));
 const subject=nodes.get('subject');subject.value='s2';subject.handlers.change();assert.match(availability.textContent,/일반 학습 문항이 없어 체험용 테스트 2문항/);assert.match(nodes.get('setup-summary').textContent,/체험용 테스트/);assert.equal(Number(count.value),2);assert.ok(starts.every(el=>!el.disabled));
});
