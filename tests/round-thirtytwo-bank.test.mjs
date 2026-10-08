import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as d from '../src/domain.js';
import * as w from '../src/workflows.js';
import {exportBackup,parseBackup} from '../src/backup.js';
import {nextScheduledRoundAt,validateJsonSchema} from '../scripts/validate-round.mjs';
import {assertNoEvidenceLossContent} from '../scripts/evidence-loss-block.mjs';
import {assertNoQuarantinedContent} from '../scripts/prepublication-quarantine.mjs';
const raw=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const read=p=>JSON.parse(raw(p));
const hash=x=>createHash('sha256').update(x).digest('hex');
const oldPath='data/releases/2026.10.08-regular.31/bank.json',before=read(oldPath),ledger=read('docs/rounds/round-032.json'),bank=read('data/releases/2026.10.08-regular.32/bank.json');
const priorIds=new Set(before.questions.map(q=>q.questionId)),added=bank.questions.filter(q=>!priorIds.has(q.questionId)),accepted=ledger.candidates.filter(c=>c.decision==='accepted');
const answer=item=>item.type==='written'?item.correctOptionId:Object.fromEntries(item.parts.map(p=>[p.partId,p.kind==='text'?p.accepted[0]:p.kind==='single'?p.correct[0]:[...p.correct].reverse()]));

test('round032 keeps all922 public031 objects,14 seeds, editorial revisions and exact source banks',()=>{
 assert.equal(hash(raw(oldPath)),'39810e9b50c55b51af7875e96252f9132b0447d28e7edd1ff900c3124bb96fab');
 assert.equal(before.questions.length,922);assert.equal(before.questions.filter(q=>!q.testOnly).length,908);
 for(const [field,key] of [['questions','questionId'],['options','optionId'],['sources','id']]){
  const map=new Map(bank[field].map(x=>[x[key],x]));assert.equal(map.size,bank[field].length);
  for(const old of before[field])assert.deepEqual(map.get(old[key]),old);
 }
 for(const field of ['subjects','corrections','syllabusVersion'])assert.deepEqual(bank[field],before[field]);
 assert.equal(bank.questions.filter(q=>q.testOnly).length,14);
});

test('round032 contains exactly terminal independently accepted new candidates, within the declared caps',()=>{
 assert.equal(ledger.status,'closed');assert.equal(ledger.counts.pending,0);assert.deepEqual(validateJsonSchema(ledger),[]);
 assert.equal(ledger.counts.registered,ledger.candidates.length);assert.equal(ledger.counts.registered,ledger.counts.accepted+ledger.counts.rejected);assert.equal(ledger.counts.accepted,accepted.length);
 assert(accepted.length>0);assert.deepEqual(new Set(added.map(q=>q.questionId)),new Set(accepted.map(c=>c.questionId)));
 assert.equal(bank.questions.filter(q=>!q.testOnly).length,908+accepted.length);
 assert.equal(new Set(bank.questions.map(q=>q.templateId)).size,bank.questions.length);
 for(const [subject,cap] of Object.entries(ledger.targets.writtenBySubject)){assert(cap>=0&&cap<=10);assert(ledger.candidates.filter(c=>c.type==='written'&&c.subjectId===subject).length<=cap);}
 assert(ledger.targets.practical>=0&&ledger.targets.practical<=8);assert(ledger.candidates.filter(c=>c.type==='practical').length<=8);
 for(const c of ledger.candidates){
  assert(['accepted','rejected'].includes(c.decision));assert.equal(c.attemptCount,c.cycles.length);assert(c.attemptCount<=3&&c.lineageAttemptCount<=6);assert.equal(c.reopenCount,0);
  const exposed=new Set([c.authorId]);
  for(const [i,cy] of c.cycles.entries()){
   assert.equal(cy.cycle,i+1);assert(!exposed.has(cy.gates.blindSolve.reviewerId));assert(Date.parse(cy.startedAt)>=Date.parse(ledger.startedAt));assert(Date.parse(cy.startedAt)<=Date.parse(cy.finishedAt));assert(Date.parse(cy.finishedAt)<=Date.parse(ledger.closedAt));
   for(const g of Object.values(cy.gates))if(g.result!=='not_run')exposed.add(g.reviewerId);
   if(i<c.cycles.length-1)assert.equal(cy.outcome,'revise');
  }
  if(c.decision==='accepted'){const q=added.find(q=>q.questionId===c.questionId),last=c.cycles.at(-1);assert.equal(q.revision,c.revision);assert.equal(q.templateId,c.templateId);assert.equal(q.verificationStatus,'published');assert.equal(q.testOnly,false);assert.equal(last.outcome,'accepted');assert(Object.values(last.gates).every(g=>g.result==='pass'));}
  else assert(!added.some(q=>q.questionId===c.questionId));
 }
});

test('round032 pins the verified normal remote031 baseline, bounded start and decision cutoff',()=>{
 assert(Date.parse(ledger.startedAt)>Date.parse('2026-10-08T07:02:21.345994+00:00'));assert(Date.parse(ledger.decisionDeadline)<=Date.parse('2026-10-08T10:00:00Z'));
 assert.equal(nextScheduledRoundAt(ledger.startedAt),Date.parse('2026-10-08T11:00:00Z'));
 assert.equal(ledger.manualStartException,undefined);assert.equal(ledger.scheduleSubstitution,undefined);assert.equal(ledger.baseline.offlinePredecessor,undefined);
 assert(Date.parse(ledger.startedAt)<=Date.parse(ledger.closedAt));assert(Date.parse(ledger.closedAt)<=Date.parse(ledger.decisionDeadline));assert(Date.parse(bank.releasedAt)>=Date.parse(ledger.closedAt));
 assert.equal(ledger.baseline.sourceCommit,'d6179e877c033dda52c87bfb5c2be8e5d42bb0cb');assert.equal(ledger.baseline.bankVersion,before.bankVersion);assert.equal(ledger.baseline.bankSha256,hash(raw(oldPath)));
 assert.deepEqual(ledger.baseline.regularWrittenBySubject,{s1:121,s2:193,s3:174,s4:194,s5:147});assert.equal(ledger.baseline.regularPractical,79);
 assert(Object.values(ledger.targets.writtenBySubject).every(n=>Number.isInteger(n)&&n>=0&&n<=10));
});

test('round032 never recycles held022 or evidence-lost023 content, identity or option reservations',()=>{
 assertNoQuarantinedContent(bank);assertNoEvidenceLossContent(bank);
 assert.equal(hash(raw('docs/rounds/round-023.json')),'b1ed48e8bc693774423891bf7a46bf31fcd19e96d55bf18422998c95bdd6cf28');
 const old=read('docs/rounds/round-023.json');assert.equal(old.counts.accepted,17);assert.equal(old.counts.rejected,2);assert.equal(old.candidates.reduce((n,c)=>n+c.attemptCount,0),20);
 for(const c of old.candidates)assert(!added.some(q=>[q.questionId,q.templateId,q.learningGoalId].some(x=>[c.questionId,c.templateId,c.learningGoalId,c.lineageId].includes(x))));
 assert(!fs.existsSync(new URL('../data/releases/2026.10.06-regular.23/bank.json',import.meta.url)));
 const oldOptions=new Set(before.options.map(o=>o.optionId)),oldSources=new Set(before.sources.map(s=>s.id));
 for(const o of bank.options.filter(o=>!oldOptions.has(o.optionId)))assert(added.some(q=>q.links?.some(l=>l.optionId===o.optionId)));
 for(const s of bank.sources.filter(s=>!oldSources.has(s.id)))assert(added.some(q=>q.sourceRefs.includes(s.id)));
});

test('round032 schema and strict explanation authoring retain only exact old exemptions',()=>{
 d.validateBankForPublication(bank);d.validateExplanationAuthoring(bank,read('data/releases/2026.10.02-regular.1/bank.json'));
 const membership=d.optionMembership(bank),oldOptions=new Set(before.options.map(o=>o.optionId));
 for(const o of bank.options)if(!oldOptions.has(o.optionId))assert.deepEqual([...o.memberQuestionIds].sort(),[...membership[o.optionId]].sort());
 for(const q of added){assert(q.explanation.trim());for(const l of q.links||[]){const o=bank.options.find(o=>o.optionId===l.optionId);assert(o.explanation.trim());assert.notEqual(o.explanation.trim(),q.explanation.trim());if(l.contextExplanation)assert.notEqual(o.explanation.trim(),l.contextExplanation.trim());}}
});

test('round032 written and practical presentations shuffle by stable IDs and grade exactly',()=>{
 const serialized=JSON.stringify(bank);
 for(const q of added)for(const count of q.type==='written'?q.supportedOptionCounts:[5]){
  const permutations=new Set(), practicalOrders=new Map((q.parts||[]).filter(p=>p.kind!=='text').map(p=>[p.partId,new Set()]));
  for(let seed=0;seed<128;seed++){
   const item=d.presentQuestion(bank,q,count,d.rng(seed));assert.equal(d.grade(item,answer(item)).status,'correct');
   if(q.type==='written'){assert.equal(item.options.length,count);assert.equal(new Set(item.options.map(o=>o.optionId)).size,count);permutations.add(item.options.map(o=>o.optionId).join('|'));for(const o of item.options)assert.equal(d.grade(item,o.optionId).status,o.optionId===item.correctOptionId?'correct':'wrong');}
   else{assert.deepEqual(item.parts.map(p=>p.partId),q.parts.map(p=>p.partId));assert.deepEqual(d.grade(item,{...answer(item),freeResponse:'독자 서술'}),d.grade(item,answer(item)));for(const p of item.parts){const old=q.parts.find(x=>x.partId===p.partId);assert.equal(p.points,old.points);if(p.kind==='text')assert.deepEqual(p.accepted,old.accepted);else{assert.deepEqual(p.correct,old.correct);assert.deepEqual(new Set(p.choices.map(c=>c.id)),new Set(old.choices.map(c=>c.id)));practicalOrders.get(p.partId).add(p.choices.map(c=>c.id).join('|'));const full=d.grade(item,answer(item));for(const choice of p.choices){const selected=p.kind==='single'?choice.id:[choice.id],same=p.correct.length===1&&p.correct[0]===choice.id,result=d.grade(item,{...answer(item),[p.partId]:selected});assert.equal(result.points,full.maxPoints-(same?0:p.points));assert.equal(result.status,same?'correct':result.points===0?'wrong':'partial');}if(p.kind==='multi'&&p.correct.length>1){const partial=d.grade(item,{...answer(item),[p.partId]:[p.correct[0]]});assert.equal(partial.points,full.maxPoints-p.points);assert.notEqual(partial.status,'correct');}}}}
  }
  if(q.type==='written')assert(permutations.size>1);else for(const [partId,orders] of practicalOrders){const part=q.parts.find(p=>p.partId===partId);if(part.choices.length>=2)assert(orders.size>1,'Practical choice order must vary: '+partId);}
 }
 assert.equal(JSON.stringify(bank),serialized);
});

test('round032 snapshots, exact user text, timers and AI disclosure remain unchanged by new data',async()=>{
 for(const q of added)for(const optionCount of q.type==='written'?q.supportedOptionCounts:[5]){
  const cfg=w.practiceConfig(q.type,{count:1,subjectId:q.subjectId,optionCount});let s=d.startSession(d.prepareSession({...bank,questions:[q]},cfg,[],97,q.questionId+'-qa-'+optionCount),1000);
  const item=s.items[0],snapshot=JSON.stringify(item),sha=await d.snapshotHash(item),prose='  원문\n Ａ 한글 <script>텍스트</script>  ';
  assert(!d.canShowExplanation(s,item));if(q.type==='practical')assert.throws(()=>d.createPrompt(s,item,{includeReference:true}));
  s=d.setAnswer(s,item.instanceId,q.type==='practical'?{...answer(item),freeResponse:prose}:answer(item),1001);
  if(q.type==='practical'){const prompt=d.createPrompt(s,item,{includeReference:false});assert(prompt.includes(prose));assert(!prompt.includes('고정 답안 참고 키 시작'));}
  s=d.confirmAnswer(s,item.instanceId,1002);assert.deepEqual(d.confirmAnswer(s,item.instanceId,1003),s);const restored=parseBackup(exportBackup([s])).sessions[0];assert.equal(JSON.stringify(restored),JSON.stringify(s));assert.equal(JSON.stringify(restored.items[0]),snapshot);assert.equal(await d.snapshotHash(restored.items[0]),sha);
  let timed=d.startSession(d.prepareSession({...bank,questions:[q]},{...cfg,mode:'timed',minutes:1},[],97,q.questionId+'-timed-'+optionCount),1000);timed=d.setAnswer(timed,timed.items[0].instanceId,answer(timed.items[0]),1001);if(q.type==='practical')for(const includeReference of [true,false])assert.throws(()=>d.createPrompt(timed,timed.items[0],{includeReference}));
  const changed=d.convertToUntimed(timed,q.questionId+'-untimed-'+optionCount,1002);assert.deepEqual(changed.next.items,timed.items);assert.deepEqual(changed.next.answers,timed.answers);const expired=d.finalize(timed,'expired',61001);assert.equal(expired.endedAt,timed.expiresAt);assert.deepEqual(d.finalize(expired,'expired',99999),expired);
 }
});


// Candidate ceilings are not acceptance quotas.
test('round032 preserves public031 decisions and separate historical publication accounting',()=>{
 assert(ledger.candidates.length<=Object.values(ledger.targets.writtenBySubject).reduce((a,b)=>a+b,0)+ledger.targets.practical);
 assert.equal(hash(raw('docs/rounds/round-031.json')),'e5b590fd2995dd2863a4a81d9d31cedb5dd6a36ab2b24578cdaab829fb7cb1a7');
 const predecessor=read('docs/rounds/round-031.json');assert.equal(predecessor.counts.accepted,14);assert.equal(predecessor.candidates.reduce((sum,c)=>sum+c.attemptCount,0),17);
 assert.equal(hash(raw('docs/publications/cumulative-028-031.json')),'447ba055dace66219430b1a31ca51759581afcfdc3ec7986acc05fb1832f694e');
 assert.equal(ledger.publication.status,'not_attempted');assert.equal(ledger.counts.publishedRegularPractical,0);
 assert.deepEqual(ledger.counts.publishedRegularWrittenBySubject,{s1:0,s2:0,s3:0,s4:0,s5:0});
 for(const candidate of ledger.candidates)assert.equal(candidate.publishedBankVersion,null);
 for(const field of ['commit','verifiedAt','url'])assert.equal(ledger.publication[field],null);
 assert.deepEqual(ledger.coverageAfter,{regularWrittenBySubject:{s1:121,s2:193,s3:174,s4:194,s5:147},regularPractical:79,mockEligible:true});
});
