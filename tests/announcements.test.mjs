import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as d from '../src/domain.js';
import * as w from '../src/workflows.js';
import * as b from '../src/backup.js';
const source=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const bank=JSON.parse(fs.readFileSync(new URL('../data/seed-bank-v4.json',import.meta.url),'utf8'));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{resolve,promise};};
const flush=()=>new Promise(setImmediate);
const answer=q=>q.type==='written'?q.correctOptionId:Object.fromEntries(q.parts.map(p=>[p.partId,p.kind==='text'?p.accepted[0]:p.kind==='single'?p.correct[0]:p.correct]));
// Deliberately small DOM model: tests observe application mutations and focus, not
// screen-reader speech. Real browser/AT acceptance remains a separate checklist.
function harness({type='written',mode='untimed',feedbackAfter='confirm',count=2}={}){
 const events=[],frames=[];let document;
 class Element{
  constructor(tag,text=''){this.tag=tag;this.attrs={};this.children=[];this.parent=null;this.handlers={};this.dataset={};this._text=text;this.value='';this.disabled=false;}
  get childNodes(){return this.children;} get isConnected(){return this===document.body||!!this.parent?.isConnected;}
  get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
  set textContent(value){for(const child of this.children)child.parent=null;this.children=[];this._text=String(value);if(this.id==='status'&&value)events.push({kind:'status',text:String(value)});}
  append(...children){for(let child of children.flat(Infinity)){if(child==null)continue;if(!(child instanceof Element))child=new Element('#text',String(child));child.parent=this;this.children.push(child);}}
  replaceChildren(...children){this.textContent='';this.append(...children);if(this.id==='alert'&&children.length)events.push({kind:'alert',text:this.textContent});}
  setAttribute(key,value){this.attrs[key]=String(value);if(key==='class')this.className=value;else if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;else this[key]=value;}
  getAttribute(key){return this.attrs[key]??null;} removeAttribute(key){delete this.attrs[key];}
  addEventListener(name,fn){this.handlers[name]=fn;} focus(){document.activeElement=this;events.push({kind:'focus',id:this.id,text:this.textContent});} select(){} setSelectionRange(){}
  contains(target){return target===this||this.children.some(c=>c.contains(target));}
  matches(selector){
   selector=selector.trim();if(selector.includes(' ')){const [parent,child]=selector.split(' ');return this.matches(child)&&this.parentChain().some(p=>p.matches(parent));}
   if(selector==='textarea:not([readonly])')return this.tag==='textarea'&&!this.readOnly;
   const checked=selector.endsWith(':checked');if(checked)selector=selector.slice(0,-8);
   const attr=selector.match(/\[([^=\]]+)(?:="([^"]*)")?\]/);if(attr){selector=selector.replace(attr[0],'');if(attr[1] in this?attr[2]!==undefined&&this[attr[1]]!==attr[2]:this.getAttribute(attr[1])===null)return false;}
   const match=selector.startsWith('#')?this.id===selector.slice(1):selector.startsWith('.')?(this.className||'').split(' ').includes(selector.slice(1)):!selector||this.tag===selector;
   return match&&(!checked||this.checked);
  }
  parentChain(){return this.parent?[this.parent,...this.parent.parentChain()]:[];}
  querySelectorAll(selector){return this.children.flatMap(c=>[c,...c.querySelectorAll('*')]).filter(c=>selector==='*'||selector.split(',').some(s=>c.matches(s)));}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  get selectedOptions(){return this.children.filter(c=>c.value===this.value);}
 }
 document={body:new Element('body'),activeElement:null,title:'',hidden:false,createElement:tag=>new Element(tag),createTextNode:text=>new Element('#text',text),addEventListener(){},getElementById(id){return this.body.querySelector('#'+id);},querySelectorAll(selector){return this.body.querySelectorAll(selector);},querySelector(selector){return this.body.querySelector(selector);}};
 for(const id of ['main','navigation','status','alert','version','content-context']){const el=new Element('div');el.id=id;document.body.append(el);}
 document.activeElement=document.body;
 const ctx={...d,...w,...b,Node:Element,document,window:{addEventListener(){},confirm:()=>true},history:{state:null,pushState(value){this.state=value;},replaceState(value){this.state=value;}},Date,performance,crypto,structuredClone,queueMicrotask,requestAnimationFrame:fn=>frames.push(fn),setTimeout,clearTimeout,setInterval(){},console,navigator:{clipboard:{writeText:async()=>{}}},URL,Blob};
 vm.createContext(ctx);vm.runInContext(source.replace(/^import .*;\n/gm,'').replace(/\nbootstrap\(\);\s*$/,'')+'\nObject.assign(globalThis,{state,renderSession,edit,gradeCurrentAnswer,retrySave,announce,screen,showError,clearError,button,timerTick,moveQuestion,gradingFeedback,gradeOutcomeMessage,finishPractice,saveAndLeave,copyText});',ctx);
 const state=ctx.state;state.bank=bank;state.session=d.startSession(d.prepareSession(bank,w.practiceConfig(type,{mode,feedbackAfter,count}),[],1,'announcement-fixture'),Date.now());state.editor={acquired:true,release(){}};
 let writes=0,saved=state.session;state.store={async update(id,revision,mutate){writes++;const candidate=mutate(d.copy(state.session));if(state.testGate)await state.testGate.promise;if(state.testFailure)throw state.testFailure;saved={...candidate,revision:revision+1};return saved;},async sessions(){return[saved];}};
 const get=id=>document.getElementById(id),runFrames=()=>{for(const fn of frames.splice(0))fn();},statuses=()=>events.filter(e=>e.kind==='status').map(e=>e.text);
 return{ctx,state,document,events,get,runFrames,statuses,get writes(){return writes;},choose(){const q=state.session.items[state.session.currentIndex];state.session=d.setAnswer(state.session,q.instanceId,answer(q));},async show(){ctx.renderSession();await flush();events.length=0;},async grade(){const item=state.session.items[state.session.currentIndex],control=get('grade-answer');control.focus();events.length=0;await control.handlers.click({currentTarget:control});await flush();runFrames();return item;}};
}

test('passive answer, navigation, flag, and exposure saves never emit successful-save status',async()=>{
 const h=harness();await h.show();const q=h.state.session.items[0];
 await h.ctx.edit((s,now)=>d.setAnswer(s,q.instanceId,answer(q),now));await h.ctx.edit(s=>{s.flags[q.instanceId]=true;return s;});await h.ctx.edit(s=>{s.exported[q.instanceId]=true;return s;});await h.ctx.moveQuestion(1);h.runFrames();
 assert.deepEqual(h.statuses(),[]);assert(!source.includes('답안과 진행 상태를 저장했습니다.'));assert(!source.includes('announceSaved'));
});
test('written correct and wrong each emit one committed numbered verdict without title focus',async()=>{
 for(const kind of ['correct','wrong']){const h=harness();const q=h.state.session.items[0];if(kind!=='unanswered')h.state.session=d.setAnswer(h.state.session,q.instanceId,kind==='correct'?answer(q):q.options.find(o=>o.optionId!==q.correctOptionId).optionId);await h.show();const control=h.get('grade-answer'),title=h.get('view-title'),docTitle=h.document.title;await h.grade();assert.deepEqual(h.statuses(),[`1번 문항. ${d.itemJudgement(kind)}`]);assert.equal(h.document.activeElement,control);assert(control.isConnected);assert.equal(control.disabled,false);assert.equal(control.getAttribute('aria-disabled'),'true');assert.equal(control.textContent,'채점 완료');assert.equal(h.get('view-title'),title);assert.equal(h.document.title,docTitle);assert.equal(h.events.some(e=>e.kind==='focus'),false);assert(h.get('grading-feedback').textContent.includes(d.itemJudgement(kind)));}
});
test('practical partial outcome is announced while free response remains ungraded',async()=>{
 const h=harness({type:'practical'}),q=h.state.session.items[0],a=answer(q);delete a[q.parts.at(-1).partId];a.freeResponse='자유 서술';h.state.session=d.setAnswer(h.state.session,q.instanceId,a);await h.show();await h.grade();const g=h.state.session.attempts[0].grade;assert.deepEqual(h.statuses(),[`1번 문항. 부분 정답입니다. ${g.maxPoints}점 중 ${g.points}점입니다.`]);assert(h.get('grading-feedback').textContent.includes('자유 서술은 미채점'));
});
test('consecutive same verdicts on different questions each emit their numbered event',async()=>{
 const h=harness();for(const q of h.state.session.items)h.state.session=d.setAnswer(h.state.session,q.instanceId,answer(q));await h.show();await h.grade();const first=h.statuses();await h.ctx.moveQuestion(1);await flush();await h.grade();assert.deepEqual([...first,...h.statuses()],['1번 문항. 정답입니다.','2번 문항. 정답입니다.']);assert.equal(h.state.session.attempts.length,2);
});
test('in-flight and completed repeated grade activation do not repeat writes or verdicts',async()=>{
 const h=harness();h.choose();await h.show();const gate=deferred();h.state.testGate=gate;const q=h.state.session.items[0],control=h.get('grade-answer');const first=h.ctx.gradeCurrentAnswer(q,control);await flush();await h.ctx.gradeCurrentAnswer(q,control);assert.equal(h.writes,1);gate.resolve();await first;h.runFrames();await h.ctx.gradeCurrentAnswer(q,control);h.runFrames();assert.equal(h.writes,1);assert.equal(h.statuses().length,1);
});
test('render, question revisit and existing-attempt hydration never replay a verdict',async()=>{
 const h=harness();h.choose();await h.show();await h.grade();h.events.length=0;h.ctx.renderSession();await h.ctx.moveQuestion(1);await h.ctx.moveQuestion(0);h.runFrames();assert.deepEqual(h.statuses(),[]);assert.equal(h.get('status').textContent,'');assert.equal(h.get('grade-answer').textContent,'채점 완료');
});
test('delayed feedback reports completion only and timed grading has no action or result',async()=>{
 const h=harness({feedbackAfter:'end'}),q=h.state.session.items[0];h.state.session=d.setAnswer(h.state.session,q.instanceId,answer(q));await h.show();await h.grade();assert.deepEqual(h.statuses(),['1번 문항 채점을 마쳤습니다. 정답과 해설은 연습 종료 후 확인할 수 있습니다.']);assert.equal(h.get('main').querySelectorAll('.feedback').length,0);
 const timed=harness({mode:'timed'});await timed.show();assert.equal(timed.get('grade-answer'),null);await timed.ctx.gradeCurrentAnswer(timed.state.session.items[0],{isConnected:true});timed.runFrames();assert.equal(timed.writes,0);assert.deepEqual(timed.statuses(),[]);
});
test('navigation during grading and after commit before RAF cancels stale feedback',async()=>{
 for(const beforeCommit of [true,false]){const h=harness();h.choose();await h.show();const q=h.state.session.items[0],control=h.get('grade-answer');if(beforeCommit)h.state.testGate=deferred();const pending=h.ctx.gradeCurrentAnswer(q,control);await flush();if(!beforeCommit)await pending;h.ctx.screen('다른 화면');h.state.testGate?.resolve();await pending;h.runFrames();assert.deepEqual(h.statuses(),[]);assert.equal(h.document.title,'다른 화면 · 웹접근성 2급 연습실');}
});
test('failed grading emits one actionable alert, never a success verdict',async()=>{
 const h=harness();h.choose();await h.show();h.state.testFailure=new Error('저장 공간 부족');await h.grade();assert.deepEqual(h.statuses(),[]);assert.equal(h.events.filter(e=>e.kind==='alert').length,1);assert(h.get('alert').textContent.includes('저장 다시 시도'));assert(h.get('alert').textContent.includes('긴급 백업'));assert.equal(h.state.session.attempts.length,0);assert.equal(h.state.unsaved.attempts.length,1);
});
test('explicit retry first committing a grade announces recovery plus verdict once with valid focus',async()=>{
 const h=harness(),q=h.state.session.items[0];h.state.session=d.setAnswer(h.state.session,q.instanceId,answer(q));await h.show();h.state.testFailure=new Error('저장 실패');await h.grade();h.state.testFailure=null;const retry=h.get('alert').querySelectorAll('button').find(b=>b.textContent==='저장 다시 시도');retry.focus();h.events.length=0;await h.ctx.retrySave();h.runFrames();assert.deepEqual(h.statuses(),['미저장 입력을 저장했습니다. 1번 문항. 정답입니다.']);assert.equal(h.document.activeElement,h.get('grade-answer'));assert(h.document.activeElement.isConnected);assert.equal(h.events.filter(e=>e.kind==='focus'&&e.id==='view-title').length,0);h.events.length=0;await h.ctx.retrySave();h.ctx.renderSession();h.runFrames();assert.deepEqual(h.statuses(),[]);
});
test('delayed retry preserves hidden result and ordinary recovery never repeats an existing verdict',async()=>{
 for(const delayed of [false,true]){const h=harness({feedbackAfter:delayed?'end':'confirm'});h.choose();await h.show();if(!delayed){await h.grade();h.events.length=0;h.state.unsaved=d.copy(h.state.session);h.state.storageFailed=true;}else{h.state.testFailure=new Error('failure');await h.grade();h.state.testFailure=null;}await h.ctx.retrySave();h.runFrames();assert(!h.statuses().some(s=>s.includes('답을 제출하지 않았습니다.')));assert.equal(h.statuses().at(-1),delayed?'미저장 입력을 저장했습니다. 1번 문항 채점을 마쳤습니다. 정답과 해설은 연습 종료 후 확인할 수 있습니다.':'미저장 입력을 저장했습니다.');}
});
test('an expired storage-failed timer warns once rather than every tick',async()=>{
 const h=harness({mode:'timed'});await h.show();h.state.session.expiresAt=Date.now()-1;h.state.storageFailed=true;for(let i=0;i<3;i++){await h.ctx.timerTick();h.runFrames();}assert.equal(h.statuses().length,1);assert(h.statuses()[0].includes('저장 실패로 확정하지 못했습니다'));
});
test('newer screen cancels old title focus, and errors cancel queued polite success',async()=>{
 const h=harness();h.ctx.screen('첫 화면');h.ctx.screen('둘째 화면');await flush();assert.equal(h.events.filter(e=>e.kind==='focus').length,1);assert.equal(h.document.activeElement.textContent,'둘째 화면');h.ctx.announce('old success');h.ctx.showError(new Error('새 오류'));h.runFrames();assert.deepEqual(h.statuses(),[]);
});
test('copy and explicit save-and-leave still announce useful completion',async()=>{
 const h=harness();await h.show();await h.ctx.copyText('text');h.runFrames();assert.deepEqual(h.statuses(),['클립보드에 복사했습니다.']);await h.ctx.saveAndLeave();h.runFrames();assert.equal(h.statuses().at(-1),'진행 상태를 저장했습니다. 홈에서 이어 풀 수 있습니다.');
});
test('bulk finish emits no individual-result stream and session help is static in both modes',async()=>{
 for(const mode of ['untimed','timed']){const h=harness({mode});await h.show();assert(h.get('main').textContent.includes('답안과 진행 상태는 이 브라우저에 자동 저장됩니다.'));await h.ctx.finishPractice();h.runFrames();assert.deepEqual(h.statuses(),[]);assert.equal(h.state.session.status,'submitted');}
});

test('blank current answer stays ungraded with actionable validation; legitimate unanswered outcome wording remains explicit',async()=>{
 const h=harness();await h.show();await h.grade();assert.equal(h.state.session.attempts.length,0);assert.deepEqual(h.statuses(),[]);assert.equal(h.events.filter(e=>e.kind==='alert').length,1);assert(h.get('alert').textContent.includes('답을 입력하거나 선택한 뒤 확정하세요.'));
 const q=h.state.session.items[0],completed=d.finalize({...h.state.session,config:{...h.state.session.config,mode:'timed'}},'submitted');assert.equal(h.ctx.gradeOutcomeMessage(completed,q),'1번 문항. 답을 제출하지 않았습니다.');
});
