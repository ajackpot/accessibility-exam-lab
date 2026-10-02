/** UI task contracts. Domain grading, saved schemas and immutable snapshots stay unchanged. */
import {eligibleQuestions,isPublishedQuestion,SUBJECTS,confirmAnswer,finalize,isAnswered,timeState} from './domain.js?v=0.2.2';
export const typeLabel=type=>type==='written'?'필기':'실기';
export function practiceConfig(type,overrides={}) {
  return {type,subjectId:type==='written'?'all':'practical',mode:'untimed',kind:'practice',optionCount:5,count:type==='written'?5:2,minutes:30,pool:'all',family:'all',feedbackAfter:'confirm',...overrides};
}
export function availableCount(bank,config,history=[]) {
  return bank?new Set(eligibleQuestions(bank,config,history).map(q=>q.templateId)).size:0;
}
export function quickConfig(bank,type,history=[],overrides={}) {
  const config=practiceConfig(type,overrides);
  if(type==='written'&&!Object.hasOwn(overrides,'optionCount')&&availableCount(bank,config,history)===0)config.optionCount=4;
  return {...config,count:Math.min(config.count,availableCount(bank,config,history))};
}
export function mockAvailability(bank) {
  const counts=SUBJECTS.map(s=>({id:s.id,name:s.name,count:new Set((bank?.questions||[]).filter(q=>q.subjectId===s.id&&isPublishedQuestion(bank,q)&&!q.testOnly&&q.supportedOptionCounts?.includes(5)).map(q=>q.templateId)).size}));
  return {ready:counts.every(s=>s.count>=20),counts};
}
const goalKey=item=>`${item.templateId}@${item.learningGoalRevision}`;
/** Latest graded, answered outcome per goal. Blank/draft answers never erase a prior error. */
export function reviewEntries(sessions) {
  const latest=new Map();
  for(const session of sessions) {
    if(session.config.mode==='timed'&&!['submitted','expired'].includes(session.status))continue;
    for(const item of session.items) {
      const attempt=session.attempts.find(a=>a.instanceId===item.instanceId);
      if(!attempt||!['correct','wrong','partial'].includes(attempt.grade.status))continue;
      const at=attempt?.confirmedAt??session.endedAt??session.createdAt;
      const entry={key:goalKey(item),item,session,status:attempt?.grade.status||'unconfirmed',at};
      if(!latest.has(entry.key)||at>=latest.get(entry.key).at)latest.set(entry.key,entry);
    }
  }
  return [...latest.values()].filter(e=>e.status!=='correct').sort((a,b)=>b.at-a.at);
}
export function reviewBank(bank,entries,type) {
  if(!bank)return null;
  const keys=new Set(entries.filter(e=>e.item.type===type).map(e=>e.key));
  return {...bank,questions:bank.questions.filter(q=>keys.has(goalKey(q))&&q.type===type)};
}
export function reviewPlan(bank,sessions,type) {
  const entries=reviewEntries(sessions).filter(e=>e.item.type===type),scoped=reviewBank(bank,entries,type);
  const groups=[],eligible=new Set();
  for(const optionCount of type==='written'?[5,4]:[5]){
    // Mixed banks retain every valid goal, split only when the saved schema needs a uniform option count.
    const groupBank=scoped?{...scoped,questions:scoped.questions.filter(q=>!eligible.has(goalKey(q)))}:null;
    const config=practiceConfig(type,{optionCount,count:500});
    const questions=groupBank?eligibleQuestions(groupBank,config):[];
    const count=new Set(questions.map(q=>q.templateId)).size;
    questions.forEach(q=>eligible.add(goalKey(q)));
    if(count){config.count=Math.min(500,count);groups.push({bank:groupBank,config,count:config.count});}
  }
  const first=groups[0]||{bank:scoped,config:practiceConfig(type,{count:0})};
  return {entries,bank:first.bank,config:first.config,groups,available:eligible.size,unavailable:entries.filter(e=>!eligible.has(e.key))};
}
export function historyClassification(sessions) {
  return sessions.some(s=>s.items.some(q=>!q.testOnly))?'false':sessions.some(s=>s.items.some(q=>q.testOnly))?'true':'false';
}

/** Confirm selected untimed drafts and finish in one storage transaction. */
export function submitSelectedAnswers(session,now=Date.now()) {
  let next=session;
  if(next.status==='active'&&next.config.mode==='untimed')for(const item of next.items) {
    if(!next.attempts.some(a=>a.instanceId===item.instanceId)&&isAnswered(item,next.answers[item.instanceId]))next=confirmAnswer(next,item.instanceId,now);
  }
  return finalize(next,'submitted',now);
}

/** Display the destination before opening; do not mutate/finalize stored history here. */
export function sessionNavigation(session,now=Date.now()) {
  if(session.status==='prepared')return {action:'시작 대기 확인',status:'prepared'};
  if(session.status==='active')return session.config.mode==='timed'&&timeState(session,now).expired?{action:'만료 결과 보기',status:'expired'}:{action:'이어서 풀기',status:'active'};
  return {action:'결과·답안 보기',status:session.status};
}
