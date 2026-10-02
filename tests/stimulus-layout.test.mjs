import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as d from '../src/domain.js';
import * as w from '../src/workflows.js';
import {parseBackup,exportBackup} from '../src/backup.js';
const root=new URL('../',import.meta.url);
const source=fs.readFileSync(new URL('src/app.js',root),'utf8');
const oldBank=JSON.parse(fs.readFileSync(new URL('data/seed-bank.json',root),'utf8'));
const previous=JSON.parse(fs.readFileSync(new URL('data/seed-bank-v2.json',root),'utf8'));
const bank=JSON.parse(fs.readFileSync(new URL('data/seed-bank-v3.json',root),'utf8'));
const current=JSON.parse(fs.readFileSync(new URL('data/seed-bank-v4.json',root),'utf8'));
const stimulusIds=['seed-w07','seed-w08','seed-p01','seed-p02','seed-p03','seed-p04'];
const extract=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
class E {
 constructor(tag,attrs={},children=[]){this.tag=tag;this.attrs=attrs;Object.assign(this,attrs);this.children=[];this.handlers={};this._text='';this.append(...children.flat(Infinity));}
 append(...children){this.children.push(...children.filter(x=>x!==null&&x!==undefined));}
 replaceChildren(...children){this.children=[];this._text='';this.append(...children);}
 addEventListener(k,fn){this.handlers[k]=fn;}
 setAttribute(k,v){this.attrs[k]=v;this[k]=v;}
 removeAttribute(k){delete this.attrs[k];delete this[k];}
 get textContent(){return this._text+this.children.map(x=>x instanceof E?x.textContent:String(x)).join('');}
 set textContent(v){this._text=String(v);this.children=[];}
 focus(){}
 setSelectionRange(a,b){this.selection=[a,b];}
 querySelectorAll(){return [];}
}
const node=(tag,attrs={},...children)=>new E(tag,attrs,children);
const walk=n=>n instanceof E?[n,...n.children.flatMap(walk)]:[];
const allText=n=>walk(n).map(x=>`${x._text} ${x.value??''} ${x.children.filter(c=>!(c instanceof E)).join(' ')}`).join('\n');
const byTag=(n,tag)=>walk(n).filter(x=>x.tag===tag);
function renderContext(item,{mode='untimed',feedbackAfter='confirm',answer,confirmed=false,revealed=false,status='active'}={}){
 const session={status,sessionId:'independent-ui',revision:0,config:{mode,feedbackAfter,type:item.type},items:[item],currentIndex:0,answers:answer===undefined?{}:{[item.instanceId]:answer},attempts:confirmed?[{instanceId:item.instanceId,grade:d.grade(item,answer)}]:[],revealed:{[item.instanceId]:revealed},flags:{},exported:{}};
 const ctx={...d,...w,node,state:{session,storageFailed:false},rememberRoute(){},subjectName:id=>id,remainingText:()=>'',nowState:()=>({remaining:100}),announce(){},renderHome(){},renderResult(){},edit(){},leave(){},copyText(){},renderFinish(){},renderQuestionList(){},renderExtend(){},renderConvert(){},renderPrompt(){},showError(){},select:(id,options,value)=>node('select',{id,value},...options.map(([v,t])=>node('option',{value:v},t))),labelInput:(label,input,help)=>node('div',{},node('label',{for:input.id},label),input,help||null),actions:(...children)=>node('div',{},children),button:(label,fn,attrs={})=>node('button',{...attrs,on:{click:fn}},label),screen:(title,...children)=>ctx.root=node('main',{},node('h2',{},title),children),outcomeName:{unconfirmed:'미확정',correct:'정답입니다',wrong:'오답입니다',partial:'부분점수입니다',unanswered:'미응답입니다'}};
 vm.createContext(ctx);
 vm.runInContext(extract('function inputDisabled(','async function moveQuestion(')+extract('function renderExplanation(','async function finishPractice(')+'\nObject.assign(globalThis,{renderSession,renderMaterials,renderExplanation});',ctx);
 return ctx;
}
function presented(qid,which=bank){return d.presentQuestion(which,which.questions.find(q=>q.questionId===qid),5,()=>0.5,qid);}
function legacy(qid){const q=presented(qid,oldBank);delete q.bankSchemaVersion;return q;}
function ui(item,opts){const ctx=renderContext(item,opts);ctx.renderSession();return ctx.root;}


test('seed.3 preserves all 14 IDs, scoring, source content and goals; only seven reviewed prompts change',async()=>{
 d.validateBank(bank);assert.equal(bank.bankVersion,'2026.10.02-seed.3');assert.equal(bank.questions.length,14);
 assert.deepEqual(bank.options,previous.options);assert.deepEqual(bank.sources,previous.sources);
 assert.deepEqual(bank.questions.map(q=>q.questionId),previous.questions.map(q=>q.questionId));
 for(const q of bank.questions){const prior=previous.questions.find(p=>p.questionId===q.questionId);assert(q.testOnly);const changed=stimulusIds.includes(q.questionId)||q.questionId==='seed-w05';assert.equal(q.revision,prior.revision+(changed?1:0));for(const key of ['links','parts','templateId','learningGoalRevision','referenceAnswer','rubric','sourceRefs','standardVersion','explanation'])assert.deepEqual(q[key],prior[key],`${q.questionId} ${key}`);assert.deepEqual(q.materials?.map(m=>[m.filename,m.content,m.purpose,m.focusLine]),prior.materials?.map(m=>[m.filename,m.content,m.purpose,m.focusLine]));if(!changed)assert.deepEqual(q,prior);else assert.notEqual(q.stem,prior.stem);}
 for(const [file,expected] of [['seed-bank.json','baa4ee31c10022e5f1325b66b2adf32bc2ef49fdb88a316ddd89acefe1532101'],['seed-bank-v2.json','5b6b3506888af368cc591e1c751651d16f154c43dde460a0ccbcc916e2b78eac']]){const raw=fs.readFileSync(new URL('data/'+file,root),'utf8');assert.equal(await d.sha256(raw),expected);assert.equal(fs.readFileSync(new URL('data/releases/'+JSON.parse(raw).bankVersion+'/bank.json',root),'utf8'),raw);}
});
test('publication rejects condition-only, hidden, missing action/type/reference and empty required materials',()=>{
 const edits=[(q,m)=>m.instruction='다음 보기의 다섯 선언만 경쟁하며 모두 작성자 일반 선언이다.',(q,m)=>{m.instruction='다음 보기의 코드를 읽고 답하시오.';},(q,m)=>{m.instruction='다음 보기의 자료를 읽고 답하시오.';q.stem=m.instruction;},(q,m)=>{m.instruction='코드를 읽고 답하시오.';q.stem=m.instruction;},(q,m)=>{m.instruction='다음 보기의 코드는 자료이다.';q.stem=m.instruction;},(q,m)=>m.content='  \n '];
 for(const edit of edits){const b=d.copy(current),q=b.questions.find(q=>q.questionId==='seed-w07');edit(q,q.materials[0]);assert.throws(()=>d.validateBankForPublication(b));}
});
test('publication rejects absent or explanation-only required stimuli and ambiguous multiple files',()=>{
 for(const edit of [q=>delete q.materials,q=>q.materials[0].purpose='explanation',q=>q.materials.push({...q.materials[0],filename:'other.html'}),q=>q.materials.push({...q.materials[0]})]){const b=d.copy(current),q=b.questions.find(q=>q.questionId==='seed-w07');edit(q);assert.throws(()=>d.validateBankForPublication(b));}
 const b=d.copy(current),q=b.questions.find(q=>q.questionId==='seed-w07');q.materials.push({...q.materials[0],filename:'second.html'});q.stem='다음 보기의 specificity.html 코드를 읽고 color 값을 고르시오. 다음 보기의 second.html 코드를 읽고 color 값을 고르시오.';q.materials[0].instruction='다음 보기의 specificity.html 코드를 읽고 color 값을 고르시오.';q.materials[1].instruction='다음 보기의 second.html 코드를 읽고 color 값을 고르시오.';assert.doesNotThrow(()=>d.validateBankForPublication(b));
});
test('strict publication gate never rejects compatible historical reading and backups',()=>{
 const config={type:'written',subjectId:'all',mode:'untimed',kind:'practice',count:10,minutes:30,optionCount:5,pool:'all',family:'all',feedbackAfter:'confirm'};
 for(const b of [oldBank,previous,bank,current]){assert.doesNotThrow(()=>d.validateBank(b));for(const type of ['written','practical']){const s=d.startSession(d.prepareSession(b,{...config,type,subjectId:type==='written'?'all':'practical',count:type==='written'?10:4},[],3,`snapshot-${b.bankVersion}-${type}`),100000);if(b===oldBank)for(const i of s.items)delete i.bankSchemaVersion;const before=exportBackup([s]);for(const i of s.items){d.questionPresentation(i);d.materialsFor(i,'question');ui(i);}assert.deepEqual(parseBackup(before).sessions,[s]);assert.deepEqual(JSON.parse(exportBackup([s])).sessions,JSON.parse(before).sessions);}}
 assert.throws(()=>d.validateBankForPublication(previous));
});
test('every written/practical stimulus is immediately between stem and answers in all four banks and modes',()=>{
 for(const b of [oldBank,previous,bank,current])for(const qid of stimulusIds)for(const mode of ['untimed','timed'])for(const count of [4,5]){const item=d.presentQuestion(b,b.questions.find(q=>q.questionId===qid),count,d.rng(1),qid),rendered=ui(item,{mode});const children=rendered.children,stem=children.findIndex(n=>n.attrs?.class==='question-stem'),box=children.findIndex(n=>n.attrs?.class==='question-stimulus');assert.equal(box,stem+1,`${b.bankVersion}/${qid}`);assert.equal(children[box].children[0].textContent,'보기');assert.equal(children[box+1].tag,item.type==='written'?'fieldset':'h3');assert.equal(item.type==='written'?children[box+1].children[0].textContent:children[box+1].textContent,item.type==='written'?'선택지':'실기 답안');assert(byTag(children[box],'textarea').some(n=>n.value===item.materials[0].content));assert(!byTag(children[box],'input').some(n=>['radio','checkbox'].includes(n.type)&&n.id!=='show-newlines'));const legends=byTag(rendered,'legend');assert(!legends.some(n=>n.textContent===item.stem));}
});
test('all reviewed legacy questions use one integrated display with separate notes without mutation',async()=>{
 for(const q of current.questions){const fresh=presented(q.questionId,current);assert.deepEqual(d.questionPresentation(fresh),{stem:q.stem,notes:q.notes});for(const old of [oldBank,previous,bank]){const item=presented(q.questionId,old),before=JSON.stringify(item),hash=await d.snapshotHash(item),display=d.questionPresentation(item);assert.deepEqual(display,{stem:q.stem,notes:q.notes},`${old.bankVersion}/${q.questionId}`);const rendered=ui(item),stem=walk(rendered).find(n=>n.attrs.class==='question-stem');assert.equal(stem.children[0].textContent,q.stem);assert(!stem.textContent.includes('보기 연결 안내'));assert.equal(JSON.stringify(item),before);assert.equal(await d.snapshotHash(item),hash);}}
 for(const old of [oldBank,previous,bank])for(const edit of [q=>q.bankVersion='unknown',q=>q.bankSchemaVersion=99,q=>q.revision++,q=>q.stem+=' ',q=>q.materials[0].content+=' ',q=>q.materials[0].filename='else.html',q=>q.materials[0].focusLine=1,q=>q.materials[0].instruction='Different',q=>q.notes=['추가 조건'],q=>q.standardVersion+=' changed']){const q=presented('seed-w07',old);edit(q);assert.deepEqual(d.questionPresentation(q),{stem:q.stem,notes:q.notes||[]});}
});
test('self-contained items have no empty stimulus, dangling bridge or full-stem legend',()=>{
 for(const b of [oldBank,previous,bank,current])for(const q of b.questions.filter(q=>!stimulusIds.includes(q.questionId))){const rendered=ui(presented(q.questionId,b));assert(!walk(rendered).some(n=>n.attrs.class==='question-stimulus'));assert(!allText(rendered).includes('보기 연결 안내:'));assert(!byTag(rendered,'legend').some(n=>n.textContent===q.stem));}
 assert(!bank.questions.find(q=>q.questionId==='seed-w05').stem.includes('바로 뒤'));
});
test('unknown legacy material is never promoted and still provides safe unsupported guidance',()=>{
 const q=presented('seed-w07',oldBank);q.materials[0].content+='Unknown';const rendered=ui(q);assert(!walk(rendered).some(n=>n.attrs.class==='question-stimulus'));assert(allText(rendered).includes('용도가 확인되지 않아'));assert(!allText(rendered).includes('보기 연결 안내:'));
});
test('stimulus code controls retain exact copying, line selection, file switching and nonexecution',()=>{
 const item=presented('seed-p01');item.materials.push({...item.materials[0],filename:'second.html',content:'<script>unsafe()</script>\nsecond'});const ctx=renderContext(item),copied=[];ctx.copyText=value=>copied.push(value);ctx.renderSession();const nodes=walk(ctx.root),area=nodes.find(n=>n.id==='source-code'),selector=nodes.find(n=>n.id==='code-file'),line=nodes.find(n=>n.id==='line-number');const click=label=>nodes.find(n=>n.tag==='button'&&n.textContent===label).attrs.on.click();click('원본 코드 전체 복사');assert.equal(copied[0],item.materials[0].content);line.value=2;click('줄로 이동');assert.equal(area.value.slice(...area.selection),item.materials[0].content.split('\n')[1]);selector.value='1';selector.handlers.change();assert.equal(area.value,item.materials[1].content);assert.equal(area.attrs['aria-label'],'보기 원본 코드: second.html (읽기 전용)');click('원본 코드 전체 복사');assert.equal(copied[1],item.materials[1].content);assert.equal(byTag(ctx.root,'script').length,0);assert(area.readOnly);const numbered=nodes.find(n=>n.id==='numbered-code'),toggle=nodes.find(n=>n.id==='show-newlines');assert(numbered.hidden);toggle.checked=true;toggle.handlers.change();assert.equal(numbered.hidden,false);assert(numbered.value.includes('1: <script>unsafe()</script> ↵'));
});
test('source copying uses integrated display and notes but never rewrites the item',()=>{
 const item=presented('seed-p01',previous),before=JSON.stringify(item),ctx=renderContext(item),copied=[];ctx.copyText=value=>copied.push(value);ctx.renderSession();walk(ctx.root).find(n=>n.tag==='button'&&n.textContent==='현재 과제 지시문 복사').attrs.on.click();assert.equal(copied[0],d.questionInstructionText(item));assert.equal(JSON.stringify(item),before);
});
test('answer-bearing w05 stays absent in timed, pregrade and delayed feedback across all releases',()=>{
 for(const b of [oldBank,previous,bank,current])for(const opts of [{mode:'timed'},{},{confirmed:true,revealed:true,feedbackAfter:'end'}]){const q=presented('seed-w05',b),rendered=ui(q,{...opts,answer:q.correctOptionId});assert.equal(byTag(rendered,'textarea').length,0);assert(!allText(rendered).includes('label-example.html'));assert(!walk(rendered).some(n=>n.attrs.class==='question-stimulus'));}
 const q=presented('seed-w05'),rendered=ui(q,{confirmed:true,revealed:true,answer:q.correctOptionId});assert(allText(rendered).includes('label-example.html'));assert(!walk(rendered).some(n=>n.attrs.class==='question-stimulus'));assert(walk(rendered).some(n=>n.attrs.class==='explanation-material'));
});
test('mixed question/explanation groups preserve unique IDs and separate names/file lists',()=>{
 const q=presented('seed-w07');q.materials.push({filename:'SECRET.html',content:'SECRET',purpose:'explanation'});const rendered=ui(q,{confirmed:true,revealed:true,answer:q.correctOptionId}),nodes=walk(rendered),ids=nodes.map(n=>n.id).filter(Boolean);assert.equal(ids.length,new Set(ids).size);assert(!nodes.find(n=>n.id==='code-file').textContent.includes('SECRET'));assert(nodes.find(n=>n.id==='explanation-code-file').textContent.includes('SECRET'));assert.equal(nodes.find(n=>n.id==='materials-heading').textContent,'보기');assert.equal(nodes.find(n=>n.id==='explanation-materials-heading').textContent,'해설 코드 자료');
});
test('independent AI export preserves original problem before code without display substitution',()=>{
 for(const b of [oldBank,previous,bank,current]){const s=d.startSession(d.prepareSession(b,w.practiceConfig('practical',{count:4}),[],1,'prompt-stimulus'),100000),q=s.items[0];q.materials.push({purpose:'explanation',filename:'SECRET.html',content:'SECRET-EXPLANATION'});const text=d.createPrompt(s,q,{includeReference:false});assert(text.includes(q.stem));assert(text.indexOf(q.stem)<text.indexOf('보기 코드 파일:'));assert(text.includes(q.materials[0].content));assert(!text.includes('SECRET-EXPLANATION'));assert(!text.includes(q.referenceAnswer));assert.throws(()=>d.createPrompt(s,q,{includeReference:true}));}
});
test('saved-answer review retains the same stem→stimulus→answer order across old and new banks',async()=>{
 for(const b of [oldBank,previous,bank,current])for(const qid of stimulusIds){const item=presented(qid,b),ctx=renderContext(item,{status:'submitted',revealed:true,answer:item.type==='written'?item.correctOptionId:{}});ctx.state.openGeneration=0;ctx.refreshSessions=async()=>{};ctx.answerSummary=()=> '저장 답';vm.runInContext(extract('async function renderReview(','async function renderPrompt(')+'\nglobalThis.review=renderReview;',ctx);await ctx.review(ctx.state.session,item);const children=ctx.root.children,stem=children.findIndex(n=>n.attrs?.class==='question-stem'),box=children.findIndex(n=>n.attrs?.class==='question-stimulus');assert.equal(box,stem+1);assert.equal(children[box+1].textContent,'저장된 사용자 답안');}
});

test('notes are a named list after the single stem, before stimulus or choices, and empty notes have no heading',()=>{
 for(const b of [oldBank,previous,bank,current])for(const q of b.questions){const rendered=ui(presented(q.questionId,b)),nodes=walk(rendered),wrapper=nodes.find(n=>n.attrs.class==='question-stem'),expected=current.questions.find(x=>x.questionId===q.questionId);assert.equal(wrapper.children[0].textContent,expected.stem);const section=wrapper.children.find(n=>n.attrs?.class==='question-notes');if(expected.notes.length){assert(section);assert.equal(section.attrs['aria-labelledby'],'question-notes-heading');assert.equal(section.children[0].textContent,'참고 사항');assert.deepEqual(byTag(section,'li').map(n=>n.textContent),expected.notes);}else{assert(!section);assert(!allText(rendered).includes('참고 사항'));}assert(!allText(rendered).includes('보기 연결 안내'));}
});
test('unknown legacy display remains verbatim, including added notes and self-contained added material',()=>{
 for(const old of [oldBank,previous,bank]){for(const id of ['seed-w01','seed-p01']){const item=presented(id,old);item.materials=[...(item.materials||[]),{filename:'extra.txt',content:'Unknown',purpose:'question'}];assert.equal(d.questionPresentation(item).stem,item.stem);}const item=presented('seed-w07',old);item.notes=['extra condition'];const rendered=ui(item),wrapper=walk(rendered).find(n=>n.attrs.class==='question-stem');assert.equal(wrapper.children[0].textContent,item.stem);assert.deepEqual(byTag(wrapper,'li').map(n=>n.textContent),item.notes);}
});
