import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as d from '../src/domain.js';
import * as w from '../src/workflows.js';
import {parseBackup,exportBackup} from '../src/backup.js';
const bank=JSON.parse(await fs.readFile(new URL('../data/seed-bank.json',import.meta.url),'utf8'));
const make=(overrides={},id='flow',seed=3)=>d.startSession(d.prepareSession(bank,w.practiceConfig('written',{count:2,...overrides}),[],seed,id),100000);
const correct=item=>item.type==='written'?item.correctOptionId:Object.fromEntries(item.parts.map(p=>[p.partId,p.kind==='text'?p.accepted[0]:p.kind==='single'?p.correct[0]:p.correct]));
const wrong=item=>item.type==='written'?item.options.find(o=>o.optionId!==item.correctOptionId).optionId:{[item.parts[0].partId]:item.parts[0].kind==='text'?'definitely-wrong':item.parts[0].choices.find(o=>!item.parts[0].correct.includes(o.id))?.id};
test('task quick starts are feasible and disclose small untimed defaults, without needing reduction',()=>{for(const type of ['written','practical']){const c=w.quickConfig(bank,type);assert.equal(c.count,type==='written'?5:2);assert.equal(c.mode,'untimed');assert.equal(d.prepareSession(bank,c).items.length,c.count);}assert.equal(w.quickConfig(null,'written').count,0);assert.equal(w.quickConfig(bank,'written',[],{subjectId:'s1'}).count,2);});
test('setup timer defaults follow written scope, independent of count or timing mode',()=>{
  for(const mode of ['timed','untimed'])for(const count of [1,5,20,100]){
    for(const subjectId of ['all','s1','s2','s3','s4','s5']){
      const config=w.practiceConfig('written',{subjectId,count,mode}),before=d.copy(config);
      assert.equal(w.defaultSetupMinutes(config),subjectId==='all'?150:30);assert.deepEqual(config,before);
    }
    assert.equal(w.defaultSetupMinutes(w.practiceConfig('written',{kind:'mock',count,mode})),150);
    for(const family of ['all','implementation','inspection'])assert.equal(w.defaultSetupMinutes(w.practiceConfig('practical',{family,count,mode})),30);
  }
});
test('same-scope retries preserve supplied historical and custom minutes without changing sessions',()=>{
  for(const mode of ['timed','untimed'])for(const subjectId of ['all','s1'])for(const minutes of [30,90,150]){
    const saved=make({mode,subjectId,minutes}),before=d.copy(saved);
    const retry=w.quickConfig(bank,saved.config.type,[saved],{...saved.config,pool:'all',kind:'practice'});
    assert.equal(retry.minutes,minutes);assert.equal(retry.mode,mode);assert.equal(retry.subjectId,subjectId);
    assert(!Object.hasOwn(retry,'minutesEdited'));assert.deepEqual(saved,before);
  }
});
test('availability counts unique goals and excludes mock test seeds',()=>{assert.equal(w.availableCount(bank,w.practiceConfig('written')),10);assert.equal(w.mockAvailability(bank).ready,false);assert.ok(w.mockAvailability(bank).counts.every(c=>c.count===0));const dup=d.copy(bank);dup.questions.push({...dup.questions[0],questionId:'different-id'});assert.equal(w.availableCount(dup,w.practiceConfig('written')),10);});
test('final submission grades selected untimed drafts once, preserves existing attempts and snapshots',()=>{let s=make();const [a,b]=s.items;s=d.setAnswer(s,a.instanceId,correct(a),100001);s=d.confirmAnswer(s,a.instanceId,100002);s=d.revealExplanation(s,a.instanceId,100003);s=d.setAnswer(s,b.instanceId,wrong(b),100004);const prior=d.copy(s.attempts[0]),items=d.copy(s.items);const end=w.submitSelectedAnswers(s,100005);assert.equal(end.status,'submitted');assert.equal(end.attempts.length,2);assert.deepEqual(end.attempts[0],prior);assert.deepEqual(end.items,items);assert.equal(end.result.correct,1);assert.equal(end.result.wrong,1);assert.deepEqual(w.submitSelectedAnswers(end,100006),end);assert.deepEqual(parseBackup(exportBackup([end])).sessions,[end]);});
test('blank and free-response-only input stays ungraded on final submission',()=>{const blank=w.submitSelectedAnswers(make(),100004);assert.equal(blank.attempts.length,0);assert.equal(blank.result.unanswered,2);let s=make({type:'practical',subjectId:'practical',count:1});s=d.setAnswer(s,s.items[0].instanceId,{freeResponse:'My narrative only'},100001);const end=w.submitSelectedAnswers(s,100002);assert.equal(end.attempts.length,0);assert.equal(end.answers[s.items[0].instanceId].freeResponse,'My narrative only');assert.equal(w.reviewEntries([end]).length,0);});
test('final submission preserves exposure and practical partial grading, without changing stats separation',()=>{let s=make({type:'practical',subjectId:'practical',count:1});const q=s.items[0],answers=correct(q);delete answers[q.parts.at(-1).partId];s=d.setAnswer(s,q.instanceId,answers,100001);s.exported[q.instanceId]=true;const end=w.submitSelectedAnswers(s,100002);assert.equal(end.attempts[0].grade.status,'partial');assert.equal(end.attempts[0].exportedBefore,true);assert.equal(w.reviewEntries([end]).length,1);assert.equal(d.statistics([end],{mode:'untimed',type:'practical'}).first.count,0);});
test('timed submission and expiration retain existing domain behavior',()=>{let s=make({mode:'timed',minutes:1});s=d.setAnswer(s,s.items[0].instanceId,correct(s.items[0]),100001);assert.deepEqual(w.submitSelectedAnswers(s,100002),d.finalize(s,'submitted',100002));assert.deepEqual(w.submitSelectedAnswers(s,160001),d.finalize(s,'expired',160001));});
test('wrong review counts only wrong/partial latest answered outcomes, with correct clearing the goal',()=>{let s=make({},'wrong');s=d.setAnswer(s,s.items[0].instanceId,wrong(s.items[0]),100001);s=w.submitSelectedAnswers(s,100002);assert.equal(w.reviewEntries([s]).length,1);let next=make({},'right');next=d.setAnswer(next,next.items[0].instanceId,correct(next.items[0]),100003);next=w.submitSelectedAnswers(next,100004);assert.equal(w.reviewEntries([s,next]).length,0);});
test('later unanswered and unconfirmed outcomes do not erase earlier confirmed wrong',()=>{let s=make({},'wrong');s=d.setAnswer(s,s.items[0].instanceId,wrong(s.items[0]),100001);s=w.submitSelectedAnswers(s,100002);const blank=d.finalize(make({},'blank'),'submitted',100010);assert.equal(w.reviewEntries([s,blank]).length,1);assert.equal(w.reviewEntries([blank]).length,0);});
test('active timed drafts and abandoned timed input never leak into review; confirmed untimed remains',()=>{let t=make({mode:'timed'},'timed');t=d.setAnswer(t,t.items[0].instanceId,wrong(t.items[0]),100001);assert.equal(w.reviewEntries([t,d.finalize(t,'abandoned',100002)]).length,0);let u=make({},'untimed');u=d.setAnswer(u,u.items[0].instanceId,wrong(u.items[0]),100001);u=d.confirmAnswer(u,u.items[0].instanceId,100002);assert.equal(w.reviewEntries([u]).length,1);assert.equal(w.reviewEntries([d.finalize(u,'abandoned',100003)]).length,1);});
test('result-scoped review never brings in unrelated errors or another type',()=>{let s=make({subjectId:'s1'},'source');s=d.setAnswer(s,s.items[0].instanceId,wrong(s.items[0]),100001);s=w.submitSelectedAnswers(s,100002);let other=make({subjectId:'s2'},'other');other=d.setAnswer(other,other.items[0].instanceId,wrong(other.items[0]),100003);other=w.submitSelectedAnswers(other,100004);const scoped=w.reviewPlan(bank,[s],'written');assert.equal(scoped.available,1);const result=d.prepareSession(scoped.bank,scoped.config,[s,other]);assert.equal(result.items[0].questionId,s.items[0].questionId);assert.equal(w.reviewPlan(bank,[s],'practical').available,0);assert.equal(w.reviewPlan(bank,[s,other],'written').available,2);});
test('retired, invalid and changed-goal errors remain readable but cannot be silently replaced on retry',()=>{let s=make({},'source');s=d.setAnswer(s,s.items[0].instanceId,wrong(s.items[0]),100001);s=w.submitSelectedAnswers(s,100002);for(const change of ['retired','invalid','revision']){const changed=d.copy(bank),q=changed.questions.find(q=>q.questionId===s.items[0].questionId);if(change==='revision')q.learningGoalRevision++;else q.verificationStatus=change;const p=w.reviewPlan(changed,[s],'written');assert.equal(p.entries.length,1);assert.equal(p.available,0);assert.equal(p.unavailable.length,1);}});
test('history starts in test classification when only sample records exist',()=>{assert.equal(w.historyClassification([]),'false');assert.equal(w.historyClassification([make()]),'true');const s=make();s.items[0].testOnly=false;assert.equal(w.historyClassification([s]),'false');});
test('all executable workflow imports use the release cache version and are publish-listed',async()=>{const text=await fs.readFile(new URL('../src/workflows.js',import.meta.url),'utf8');assert.ok(text.includes(`domain.js?v=${d.APP_VERSION}`));const manifest=await fs.readFile(new URL('../PUBLICATION-MANIFEST.txt',import.meta.url),'utf8');assert.ok(manifest.includes('src/workflows.js'));});

test('mixed four-only and five-only wrong goals each have a non-overlapping retry group',()=>{
  const mixed=d.copy(bank),a=mixed.questions.find(q=>q.type==='written'&&q.subjectId==='s1'),b=mixed.questions.find(q=>q.type==='written'&&q.subjectId==='s2');a.supportedOptionCounts=[4];b.supportedOptionCounts=[5];
  const history=[a,b].map((q,index)=>{let s=d.startSession(d.prepareSession({...mixed,questions:[q]},w.practiceConfig('written',{count:1,optionCount:q.supportedOptionCounts[0]}),[],1,`mixed-${index}`),100000);s=d.setAnswer(s,s.items[0].instanceId,wrong(s.items[0]),100001);return w.submitSelectedAnswers(s,100002);});
  const plan=w.reviewPlan(mixed,history,'written');assert.equal(plan.available,2);assert.equal(plan.unavailable.length,0);assert.equal(plan.groups.length,2);const ids=plan.groups.flatMap(g=>d.prepareSession(g.bank,g.config,history).items.map(q=>q.questionId));assert.equal(new Set(ids).size,2);assert.deepEqual(new Set(ids),new Set([a.questionId,b.questionId]));
});

test('saved-session links expose expired destinations at the exact deadline without mutating records',()=>{
  const timed=make({mode:'timed',minutes:1}),before=d.copy(timed);
  assert.deepEqual(w.sessionNavigation(timed,159999),{action:'이어서 풀기',status:'active'});
  assert.deepEqual(w.sessionNavigation(timed,160000),{action:'만료 결과 보기',status:'expired'});
  assert.deepEqual(w.sessionNavigation(timed,160001),{action:'만료 결과 보기',status:'expired'});assert.deepEqual(timed,before);
  assert.equal(w.sessionNavigation(make(),99999999).action,'이어서 풀기');
  assert.deepEqual(w.sessionNavigation({...timed,status:'prepared',expiresAt:null},99999999),{action:'시작 대기 확인',status:'prepared'});
  assert.equal(w.sessionNavigation(d.finalize(timed,'submitted',100010),100011).action,'결과·답안 보기');
});
