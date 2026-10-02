import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
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
  const ctx={state,rememberRoute(){},isAnswered:(_item,answer)=>!!answer,node:(tag,attrs,...children)=>({tag,children}),actions:(...children)=>children,button:(label)=>label,helpDetails:(...children)=>children,renderQuestionList(){},renderSession(){},homeLink(){},screen:(...parts)=>screens.push(parts),showError(){}};
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
  const write=deferred();let opened=0,updates=0;const ctx={state:{openGeneration:1,store:{insert:()=>write.promise,update:async()=>{updates++;return{sessionId:'B'};}}},document:{querySelectorAll:()=>[]},clearError(){},refreshSessions:async()=>{},prepareSession:()=>({sessionId:'B'}),openSession:async()=>opened++,announce(){},showError(error){throw error;}};
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
  const ctx={typeLabel:()=> '필기',sessionNavigation:()=>({status:'prepared'}),date:()=> '1970-01-01'};
  vm.createContext(ctx);vm.runInContext(extract('function sessionLabel(','function sessionLinkText(')+'\nglobalThis.label=sessionLabel;',ctx);
  const text=ctx.label({status:'prepared',config:{type:'written',mode:'timed',minutes:30},attempts:[],items:[{}],expiresAt:null,currentIndex:0});
  assert.match(text,/시간제 30분/);assert.match(text,/아직 시작하지 않음/);assert.doesNotMatch(text,/1970|까지/);
});
