import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import {practiceSelection,sessionContentSummary} from '../src/workflows.js';
import * as d from '../src/domain.js';
import * as w from '../src/workflows.js';
import {exportBackup,parseBackup} from '../src/backup.js';
const source=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const extract=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const flush=()=>new Promise(setImmediate);
test('late completed explanation does not replace newer navigation',async()=>{
  const write=deferred(),screens=[];
  const s={sessionId:'old-result',status:'submitted',revision:1,config:{mode:'untimed'},revealed:{},answers:{q:'a'},bankVersion:'qa',items:[]};
  const item={instanceId:'q',questionId:'q',revision:1,type:'written',stem:'old'};
  const ctx={state:{session:s,store:{update:()=>write.promise},openGeneration:1},rememberRoute(){},canShowExplanation:()=>true,refreshSessions:async()=>{},node:()=>({}),button:()=>({}),actions:()=>({}),answerSummary:()=>'',renderMaterials:()=>({}),renderExplanation:()=>({}),screen:title=>screens.push(title)};
  vm.createContext(ctx);vm.runInContext(extract('async function renderReview(','async function renderPrompt(')+'\nglobalThis.review=renderReview;',ctx);
  const pending=ctx.review(s,item);ctx.state.openGeneration++;ctx.state.session=null;screens.push('HOME');write.resolve({...s,revealed:{q:true},revision:2});await pending;
  assert.deepEqual(screens,['HOME']);assert.equal(ctx.state.session,null);
});
test('navigation blocks late enqueues and cannot be overwritten by old Next',async()=>{
  const first=deferred(),second=deferred(),screens=[];let saved={sessionId:'A',status:'active',revision:0,currentIndex:0,config:{mode:'untimed'}};let writes=0;
  const state={queue:Promise.resolve(),session:structuredClone(saved),editor:{acquired:true,release(){}},storageFailed:false,openGeneration:0,noticeGeneration:0,store:{async update(id,rev,mut){await (++writes===1?first.promise:second.promise);saved=mut(structuredClone(saved));saved.revision=rev+1;return structuredClone(saved);}}};
  const ctx={state,clearTimeout(){},saveNoticeTimer:null,$:()=>({}),clearError(){},nowState:()=>({trusted:true,now:1}),announceSaved(){},announce(){},showError(){},releaseEditor:()=>{state.editor=null},window:{confirm:()=>true},renderSession:()=>screens.push('SESSION '+state.session.currentIndex)};
  vm.createContext(ctx);vm.runInContext(extract('function edit(','function collectVisibleDraft(')+extract('async function leave(','function rememberRoute(')+'\nObject.assign(globalThis,{edit,leave});',ctx);
  const save=ctx.edit(s=>({...s,answer:'first'}));await flush();const nav=ctx.leave(()=>screens.push('HOME'));
  const next=ctx.edit(s=>({...s,currentIndex:1}),{render:true});const nextOutcome=next.then(()=>true,()=>false);
  first.resolve();await nav;second.resolve();await save;await nextOutcome;
  assert.deepEqual(screens,['HOME']);assert.equal(state.session,null);assert.equal(writes,1);
});
test('overlapping same-session route restoration preserves the latest lock and view',async()=>{
  const reads=[],screens=[];const s={sessionId:'A',status:'active',config:{mode:'untimed'},items:[],warnings:[],clockTrusted:true};
  const state={session:s,queue:Promise.resolve(),openGeneration:0,editor:{acquired:true,release(){}},store:{session:()=>new Promise(r=>reads.push(r))}};let locks=0;
  const ctx={state,Date,performance,Set,clearError(){},rememberRoute:(name,args)=>state.route={name,args},releaseEditor:()=>{state.editor=null;},acquireEditor:async()=>{locks++;return{acquired:true,release(){}}},timeState:()=>({trusted:true,expired:false}),announce(){},renderSession:()=>{state.openGeneration++;screens.push('SESSION')},renderFinish:()=>{state.openGeneration++;screens.push('FINISH')},renderQuestionList:()=>{state.openGeneration++;screens.push('LIST')},history:{pushState(){}}};
  vm.createContext(ctx);vm.runInContext(extract('async function restoreRoute(',"window.addEventListener('popstate'")+extract('async function openSession(','function inputDisabled(')+'\nObject.assign(globalThis,{restoreRoute});',ctx);
  const first=ctx.restoreRoute({name:'session',args:{id:'A',view:'finish'}});await flush();const second=ctx.restoreRoute({name:'session',args:{id:'A',view:'list'}});await flush();
  reads[0](structuredClone(s));await first;reads[1](structuredClone(s));await second;
  assert.equal(screens.includes('FINISH'),false);assert.equal(screens.at(-1),'LIST');assert.equal(locks,1);assert.equal(state.editor?.acquired,true);
});

test('finish confirmation waits for the current answer save and displays the submitted count',async()=>{
  const write=deferred(),screens=[];const state={openGeneration:0,queue:write.promise,session:{sessionId:'A',status:'active',config:{mode:'untimed'},items:[{instanceId:'q'}],answers:{},attempts:[]}};
  const ctx={state,rememberRoute(){},isAnswered:(_item,answer)=>!!answer,node:(tag,attrs,...children)=>({tag,children}),actions:(...children)=>children,button:(label)=>label,helpDetails:(...children)=>children,renderQuestionList(){},renderSession(){},homeLink(){},saveAndLeave(){},screen:(...parts)=>screens.push(parts),showError(){}};
  vm.createContext(ctx);vm.runInContext(extract('async function withSavedAnswers(','async function renderQuestionList(')+extract('async function renderFinish(','function renderExtend(')+'\nglobalThis.finish=renderFinish;',ctx);
  const pending=ctx.finish();assert.equal(screens.length,0);state.session.answers.q='selected';write.resolve();await pending;
  assert.match(JSON.stringify(screens),/답 입력 1개/);assert.match(JSON.stringify(screens),/이번에 채점할 답 1개/);assert.equal(state.transitioning,false);
});
test('a newer navigation cancels a waiting finish confirmation',async()=>{
  const write=deferred();let calls=0;const ctx={state:{openGeneration:0,queue:write.promise,session:{status:'active'}},showError(){}};
  vm.createContext(ctx);vm.runInContext(extract('async function withSavedAnswers(','async function renderQuestionList(')+'\nglobalThis.settle=withSavedAnswers;',ctx);
  const pending=ctx.settle(()=>calls++);ctx.state.openGeneration++;write.resolve();await pending;assert.equal(calls,0);assert.equal(ctx.state.transitioning,false);
});
test('repeated final submit clicks are coalesced until the one write completes',async()=>{
  const write=deferred();let writes=0;const ctx={state:{session:{status:'active'}},edit:async()=>{writes++;await write.promise;ctx.state.session.status='submitted';}};
  vm.createContext(ctx);vm.runInContext(extract('async function finishPractice(','async function renderFinish(')+'\nglobalThis.finish=finishPractice;',ctx);
  const first=ctx.finish();await ctx.finish();assert.equal(writes,1);write.resolve();await first;await ctx.finish();assert.equal(writes,1);
});

test('conversion keeps atomic storage in the queue without hijacking newer navigation or double applying',async()=>{
  const write=deferred();let writes=0,opened=0;const state={openGeneration:1,queue:Promise.resolve(),session:{sessionId:'A',status:'active',revision:0},store:{convert:async()=>{writes++;return write.promise;}}};
  const ctx={state,$:()=>null,openSession:async()=>opened++,announce(){}};vm.createContext(ctx);vm.runInContext(extract('async function convertPractice(','function renderConvert(')+'\nglobalThis.convert=convertPractice;',ctx);
  const pending=ctx.convert();await flush();await ctx.convert();assert.equal(writes,1);state.openGeneration++;state.leaving=true;write.resolve({old:{sessionId:'A',status:'converted'},next:{sessionId:'B'}});await pending;await state.queue;assert.equal(opened,0);assert.equal(state.converting,false);
});

test('conversion keeps Cancel disabled until the committed conversion settles',async()=>{
  const write=deferred(),controls={'convert-apply':{},'convert-cancel':{}};const ctx={state:{openGeneration:1,queue:Promise.resolve(),session:{sessionId:'A',status:'active',revision:0},store:{convert:async()=>write.promise}},$:id=>controls[id],openSession:async()=>{},announce(){}};
  vm.createContext(ctx);vm.runInContext(extract('async function convertPractice(','function renderConvert(')+'\nglobalThis.convert=convertPractice;',ctx);
  const pending=ctx.convert();await flush();assert.equal(controls['convert-cancel'].disabled,true);assert.equal(controls['convert-apply'].disabled,true);write.resolve({old:{sessionId:'A',status:'converted'},next:{sessionId:'B'}});await pending;assert.equal(ctx.state.converting,false);
});

test('late initial save never replaces a newer screen and start cancellation is guarded',async()=>{
  const write=deferred();let opened=0,updates=0;const ctx={practiceSelection,state:{openGeneration:1,store:{insert:()=>write.promise,update:async()=>{updates++;return{sessionId:'B'};}}},document:{querySelectorAll:()=>[]},clearError(){},refreshSessions:async()=>{},prepareSession:()=>({sessionId:'B'}),openSession:async()=>opened++,announce(){},showError(error){throw error;}};
  vm.createContext(ctx);vm.runInContext(extract('async function startPractice(','async function renderWrong(')+'\nglobalThis.start=startPractice;',ctx);
  const pending=ctx.start({});await flush();ctx.state.openGeneration++;write.resolve();await pending;assert.equal(opened,0);assert.equal(updates,1);assert.equal(ctx.state.starting,false);assert.match(source,/data-cancel-start/);assert.match(source,/if\(!state.starting\)return renderHome/);
});

test('already-visible history labels refresh when a background timed session expires',()=>{
  let expired=false;const link={textContent:'이어서 풀기',getAttribute:name=>name==='data-session-link'?'A':'false'};
  const ctx={state:{sessions:[{sessionId:'A'}]},document:{querySelectorAll:()=>[link]},sessionLinkText:()=>expired?'만료 결과 보기':'이어서 풀기'};
  vm.createContext(ctx);vm.runInContext(extract('function refreshSessionLinkLabels(','async function renderHome(')+'\nglobalThis.refresh=refreshSessionLinkLabels;',ctx);
  ctx.refresh();assert.equal(link.textContent,'이어서 풀기');expired=true;ctx.refresh();assert.equal(link.textContent,'만료 결과 보기');
});

test('prepared timed home metadata shows configured minutes, never a null epoch deadline',()=>{
  const ctx={sessionContentSummary,typeLabel:()=> '필기',sessionNavigation:()=>({status:'prepared'}),date:()=> '1970-01-01'};
  vm.createContext(ctx);vm.runInContext(extract('function sessionLabel(','function sessionLinkText(')+'\nglobalThis.label=sessionLabel;',ctx);
  const text=ctx.label({status:'prepared',config:{type:'written',mode:'timed',minutes:30},attempts:[],items:[{}],expiresAt:null,currentIndex:0});
  assert.match(text,/시간제 30분/);assert.match(text,/아직 시작하지 않음/);assert.doesNotMatch(text,/1970|까지/);
});

// Run the actual setup/route handlers with DOM-like controls and the immutable,
// fully unlocked regular bank. No browser storage or learner records are used.
const setupBank=JSON.parse(fs.readFileSync(new URL('../data/releases/2026.10.02-regular.2/bank.json',import.meta.url),'utf8'));
function setupHarness(type='written',overrides={},minutesEdited,sessions=[]){
  const elements=[],starts=[];
  const node=(tag,attrs={},...children)=>{
    const el={tag,attrs,children:children.flat(Infinity),handlers:{},...attrs,addEventListener(event,fn){this.handlers[event]=fn;}};
    let value=String(attrs.value??'');Object.defineProperty(el,'value',{get:()=>value,set:v=>{value=String(v);}});
    Object.defineProperty(el,'selectedOptions',{get:()=>el.children.filter(c=>c.value===el.value)});
    if(attrs.on)Object.assign(el.handlers,attrs.on);elements.push(el);return el;
  };
  const ctx={...d,...w,state:{bank:setupBank,sessions,openGeneration:0},node,history:{replaceState(value){this.state=value;},pushState(value){this.state=value;}},
    clearError(){},showError(error){ctx.error=error;},announce(){},renderHome(){},
    rememberRoute(name,args){ctx.state.route={name,args};},leave:async fn=>{await fn();return true;},
    select:(id,options,value)=>node('select',{id,value},options.map(([value,textContent])=>node('option',{value,textContent}))),
    labelInput:(label,input,help)=>node('div',{label},input,help),actions:(...children)=>node('div',{},children),
    button:(textContent,fn,attrs={})=>node('button',{...attrs,textContent,on:{click:fn}}),helpDetails:(...children)=>node('details',{},children),
    screen:(title,...children)=>{ctx.root=node('main',{title},children);},startPractice:async config=>{starts.push(structuredClone(config));}};
  vm.createContext(ctx);vm.runInContext(extract('async function restoreRoute(',"window.addEventListener('popstate'")+extract('function renderSetup(','async function openSession(')+'\nObject.assign(globalThis,{renderSetup,restoreRoute});',ctx);
  const get=id=>elements.findLast(el=>el.id===id);
  const change=(id,value,event='change')=>{const el=get(id);el.value=value;return el.handlers[event]();};
  const submit=()=>elements.findLast(el=>el.tag==='form').handlers.submit({preventDefault(){}});
  ctx.renderSetup(type,overrides,minutesEdited);
  return {ctx,get,change,submit,starts,elements,route:()=>structuredClone(ctx.state.route)};
}

test('real setup defaults whole/mock to 150 and subjects to 30 through both timing modes',async()=>{
  const h=setupHarness();assert.equal(h.get('minutes').value,'150');assert.equal(h.get('minutes').disabled,true);
  for(const mode of ['timed','untimed','timed']){
    h.change('mode',mode);
    for(const subject of ['s1','s2','s3','s4','s5','all']){h.change('subject',subject);assert.equal(h.get('minutes').value,subject==='all'?'150':'30');}
    h.change('subject','s1');h.change('kind','mock');assert.equal(h.get('subject').value,'all');assert.equal(h.get('subject').disabled,true);
    assert.equal(h.get('count').value,'100');assert.equal(h.get('option-count').value,'5');assert.equal(h.get('minutes').value,'150');
    assert.equal(h.get('minutes').disabled,mode==='untimed');
    assert.equal(h.elements.findLast(el=>el.label==='제한 시간 (분)').hidden,mode==='untimed');
    assert.match(h.get('setup-summary').textContent,mode==='timed'?/150분 시간제/:/시간 제한 없음/);
    await h.submit();const config=h.starts.at(-1);assert.equal(config.minutes,150);assert.equal(config.mode,mode);assert(!Object.hasOwn(config,'minutesEdited'));
    const prepared=d.prepareSession(setupBank,config,[],3,'setup-mock'),active=d.startSession(prepared,100000);
    assert.equal(active.items.length,100);assert(active.items.every(q=>!q.testOnly&&q.options.length===5));
    for(const subject of d.SUBJECTS)assert.equal(active.items.filter(q=>q.subjectId===subject.id).length,20);
    assert.equal(active.expiresAt,mode==='timed'?100000+150*60000:null);
    h.change('kind','practice');assert.equal(h.get('subject').disabled,false);assert.equal(h.get('minutes').value,'150');
    h.change('subject','s2');assert.equal(h.get('minutes').value,'30');h.change('subject','all');assert.equal(h.get('minutes').value,'150');
  }
});

test('explicit 30, 90 and 150 survive scope, mode and unrelated setup changes',async()=>{
  for(const minutes of [30,90,150])for(const subjectId of ['s1','all']){
    const h=setupHarness('written',{subjectId});h.change('mode','timed');h.change('minutes',minutes,'input');
    assert.equal(h.route().args.minutesEdited,true);
    for(const mode of ['untimed','timed']){
      h.change('mode',mode);h.change('subject','all');h.change('kind','mock');assert.equal(h.get('minutes').value,String(minutes));
      h.change('kind','practice');h.change('subject','s2');h.change('subject','all');h.change('pool','new');h.change('feedback','end');h.change('option-count','4');h.change('count','3','input');
      assert.equal(h.get('minutes').value,String(minutes));await h.submit();assert.equal(h.starts.at(-1).minutes,minutes);
    }
  }
});

test('setup route restoration carries explicit duration intent separately from session config',async()=>{
  for(const edited of [false,true]){
    const h=setupHarness('written',{subjectId:'s1'});h.change('mode','timed');
    if(edited)h.change('minutes','30','input');const subject=h.route();h.change('kind','mock');const mock=h.route();
    await h.ctx.restoreRoute(subject);assert.equal(h.get('minutes').value,'30');h.change('subject','all');assert.equal(h.get('minutes').value,edited?'30':'150');
    await h.ctx.restoreRoute(mock);assert.equal(h.get('kind').value,'mock');assert.equal(h.get('minutes').value,edited?'30':'150');
    assert.equal(h.route().args.minutesEdited,edited);assert(!Object.hasOwn(h.route().args.config,'minutesEdited'));
  }
  const legacy=setupHarness();await legacy.ctx.restoreRoute({name:'setup',args:{type:'written',config:w.practiceConfig('written',{mode:'timed',minutes:30})}});
  legacy.change('kind','mock');assert.equal(legacy.get('minutes').value,'30');assert.equal(legacy.route().args.minutesEdited,true);
});

test('invalid edited minutes survive route restoration and remain available for correction',async()=>{
  for(const invalid of ['','0','-1','1.5','1441']){
    const h=setupHarness();h.change('mode','timed');h.change('minutes',invalid,'input');h.change('subject','s1');h.change('kind','mock');
    const route=h.route();assert.equal(route.args.minutesValue,invalid);assert(!Object.hasOwn(route.args.config,'minutesValue'));
    await h.ctx.restoreRoute(route);
    assert.equal(h.get('minutes').value,invalid);assert(h.elements.filter(el=>el.attrs['data-start']==='setup').slice(-2).every(el=>el.disabled));
    assert.match(h.get('setup-error').textContent,/시간은 1~1440분의 정수/);
    h.change('mode','untimed');assert.equal(h.get('minutes').disabled,true);assert(h.elements.filter(el=>el.attrs['data-start']==='setup').slice(-2).every(el=>!el.disabled));
    h.change('mode','timed');assert.equal(h.get('minutes').value,invalid);h.change('minutes','90','input');assert(h.elements.filter(el=>el.attrs['data-start']==='setup').slice(-2).every(el=>!el.disabled));
  }
});

test('practical setup keeps its existing short-set time and explicit edits',()=>{
  for(const minutes of [undefined,30,90,150]){
    const h=setupHarness('practical',minutes===undefined?{}:{minutes});
    for(const mode of ['timed','untimed','timed'])for(const family of ['all','implementation','inspection']){
      h.change('mode',mode);h.change('family',family);assert.equal(h.get('minutes').value,String(minutes??30));
    }
  }
});

test('new setup leaves all saved statuses, snapshots, deadlines and backups unchanged',async()=>{
  const sessions=[];
  for(const minutes of [30,90,150])for(const mode of ['timed','untimed']){
    const config=w.practiceConfig('written',{mode,minutes,count:2});
    const prepare=status=>d.prepareSession(setupBank,config,[],4,`preserve-${mode}-${minutes}-${status}`);
    const start=status=>{let s=d.startSession(prepare(status),100000);s=d.setAnswer(s,s.items[0].instanceId,s.items[0].correctOptionId,100001);return mode==='untimed'?d.confirmAnswer(s,s.items[0].instanceId,100002):s;};
    sessions.push(prepare('prepared'),start('active'),d.finalize(start('submitted'),'submitted',100003),d.finalize(start('abandoned'),'abandoned',100003));
    if(mode==='timed'){const active=start('expired');sessions.push(d.finalize(active,'expired',active.expiresAt),...Object.values(d.convertToUntimed(start('converted'),`converted-${minutes}`,100003)));}
  }
  sessions.forEach(s=>{s.appVersion='0.2.8';});
  const before=JSON.stringify(sessions),hashes=await Promise.all(sessions.flatMap(s=>s.items.map(d.snapshotHash)));
  for(const session of sessions){
    const h=setupHarness('written',session.config,undefined,sessions);h.ctx.state.store={insert(){throw Error('Unexpected write');},update(){throw Error('Unexpected write');}};
    for(const mode of ['timed','untimed']){h.change('mode',mode);h.change('subject','s1');h.change('kind','mock');assert.equal(h.get('minutes').value,String(session.config.minutes));}
    assert.equal(JSON.stringify(sessions),before);
  }
  assert.deepEqual(await Promise.all(sessions.flatMap(s=>s.items.map(d.snapshotHash))),hashes);
  assert.deepEqual(parseBackup(exportBackup(sessions)).sessions,JSON.parse(before));
});

test('failed starts preserve timer values and edit intent for retry',async()=>{
  for(const minutes of [undefined,30,90,150]){
    const h=setupHarness();h.change('kind','mock');h.change('mode','timed');if(minutes!==undefined)h.change('minutes',minutes,'input');
    Object.assign(h.ctx,{document:{querySelectorAll:()=>h.elements.filter(el=>el.attrs['data-start']||el.attrs['data-cancel-start'])},refreshSessions:async()=>{},openSession:async()=>{throw Error('Unexpected open');}});
    h.ctx.state.store={insert:async()=>{throw Error('Synthetic unavailable storage');},update:async()=>{throw Error('Unexpected update');}};
    vm.runInContext(extract('async function startPractice(','async function renderWrong(')+'\nglobalThis.startPractice=startPractice;',h.ctx);
    const before=h.route();await h.submit();assert.match(h.ctx.error.message,/Synthetic unavailable storage/);assert.equal(h.ctx.state.starting,false);assert.deepEqual(h.route(),before);
    h.change('mode','untimed');h.change('mode','timed');assert.equal(h.get('minutes').value,String(minutes??150));
    h.change('kind','practice');h.change('subject','s1');assert.equal(h.get('minutes').value,String(minutes??30));
  }
});
