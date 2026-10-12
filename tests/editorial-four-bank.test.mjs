/** Focused editorial004 data/runtime regression. Install only with the genuinely closed source.
 * Synthetic saved sessions below are fixtures, never observations of learner history.
 * This file does not load the whole campaign or replace the genuine pair's release gate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as d from '../src/domain.js';
import * as w from '../src/workflows.js';
import {exportBackup,parseBackup,validateSession} from '../src/backup.js';
import {updateBank} from '../src/storage.js';
import {NEW_SESSION_ELIGIBILITY_POLICY as policy} from '../src/new-session-eligibility.js';
import {editorialContentHash,editorialBlindPackage,editorialComponentStates,editorialChangedPaths} from '../scripts/editorial-ledger.mjs';
import {readHistoricalExplanationBaseline} from '../scripts/explanation-authoring.mjs';
const root=new URL('../',import.meta.url),raw=p=>fs.readFileSync(new URL(p,root),'utf8'),read=p=>JSON.parse(raw(p));
const hash=x=>createHash('sha256').update(x).digest('hex'),persist=x=>JSON.parse(JSON.stringify(x));
const ledger=read('docs/corrections/editorial-004.json'),beforeRaw=raw('data/releases/2026.10.11-editorial.3/bank.json'),before=JSON.parse(beforeRaw);
const bankRaw=raw(`data/releases/${ledger.publication.bankVersion}/bank.json`),bank=JSON.parse(bankRaw),manifest=read('data/manifest.json');
const ids=['r019-policy-assistive-s5-w05','r019-policy-assistive-s5-w01'];
const revised=ledger.corrections.filter(c=>c.decision==='accepted').map(c=>c.questionId);
const oldById=new Map(before.questions.map(q=>[q.questionId,q])),byId=new Map(bank.questions.map(q=>[q.questionId,q]));
const clock=(at,fn)=>{const original=Date.now;Date.now=()=>at;try{return fn();}finally{Date.now=original;}};
const oldAt=Date.parse(ledger.startedAt)-1,newAt=Date.parse(bank.releasedAt)+1;
function prepared(source,id,count,seed,tag){return clock(source===before?oldAt:newAt,()=>d.prepareSession({...source,questions:[source.questions.find(q=>q.questionId===id)]},w.practiceConfig('written',{subjectId:'s5',count:1,optionCount:count}),[],seed,tag));}
function completed(session,correct,at){let out=d.startSession(session,at);const item=out.items[0],answer=correct?item.correctOptionId:item.options.find(o=>o.optionId!==item.correctOptionId).optionId;out=d.setAnswer(out,item.instanceId,answer,at+1);return d.confirmAnswer(out,item.instanceId,at+2);}

 test('editorial004 closure binds only the actual accepted immutable snapshots',()=>{
 assert.equal(hash(beforeRaw),'4a262a70eaa25bba13d4dd6b73d01896876d81913e4b19fdfbe406de0683b672');
 assert.equal(ledger.status,'closed');assert.equal(ledger.correctionRoundId,'editorial-004');assert.equal(ledger.kind,'accepted_content_editorial');
 assert.equal(ledger.decisionDeadline,'2026-10-12T06:00:00Z');assert(Date.parse(ledger.closedAt)<=Date.parse(ledger.decisionDeadline));
 assert(revised.length>=1&&revised.length<=2);assert.deepEqual(ledger.corrections.map(c=>c.questionId).sort(),[...ids].sort());assert(revised.every(id=>ids.includes(id)));assert.deepEqual(ledger.counts,{registered:2,accepted:revised.length,rejected:2-revised.length,pending:0,newRegular:0,revisedRegular:revised.length,publishedRevisedRegular:ledger.publication.status==='verified'?revised.length:0});
 assert.deepEqual([...ledger.changedQuestionIds].sort(),[...revised].sort());assert.deepEqual(ledger.changedOptionIds,[]);assert.deepEqual(ledger.changedPracticalChoiceIds,[]);
 assert.equal(bank.editorialRoundId,'editorial-004');assert.equal(bank.roundId,before.roundId);assert.equal(bank.roundId,'round-041');assert.notEqual(bank.bankVersion,before.bankVersion);assert(Date.parse(bank.releasedAt)>=Date.parse(ledger.closedAt));
 assert.equal(hash(bankRaw),ledger.publication.bankSha256);assert.equal(manifest.bankVersion,bank.bankVersion);assert.equal(manifest.sha256,hash(bankRaw));
 for(const id of revised){const c=ledger.corrections.find(c=>c.questionId===id),q=byId.get(id),last=c.cycles.at(-1),packageRaw=raw(last.reviewPackagePath),pkg=JSON.parse(packageRaw),item=pkg.items.find(i=>i.correctionId===c.correctionId);
  assert.equal(c.decision,'accepted');assert.equal(c.attemptCount,c.cycles.length);assert(c.attemptCount>=1&&c.attemptCount<=3);assert.equal(q.revision,oldById.get(id).revision+c.attemptCount);
  assert.equal(last.outcome,'accepted');assert(Object.values(last.gates).every(g=>g.result==='pass'));assert.equal(hash(packageRaw),last.reviewPackageSha256);
  assert.deepEqual(q,item.question);assert.deepEqual(q.links.map(l=>bank.options.find(o=>o.optionId===l.optionId)),item.options);
  assert.equal(editorialContentHash(bank,q),last.contentSha256);assert.equal(hash(JSON.stringify(editorialBlindPackage(bank,q))),last.blindPackageSha256);assert.deepEqual(editorialComponentStates(bank,q),last.componentStates);
  assert.deepEqual(editorialChangedPaths(before,bank,id),[...c.targetPaths].sort());
 }
 });

 test('all other objects/seeds/keys/code/goals and pinned selected041 history remain exact',()=>{
 assert.equal(bank.questions.length,971);assert.equal(bank.questions.filter(q=>!q.testOnly).length,957);assert.equal(bank.questions.filter(q=>q.testOnly).length,14);
 assert.deepEqual(bank.questions.map(q=>q.questionId),before.questions.map(q=>q.questionId));assert.deepEqual(bank.options,before.options);
 assert.deepEqual(bank.sources,before.sources);assert.equal(bank.sources.length,1322);
 for(const q of bank.questions){const old=oldById.get(q.questionId);if(!revised.includes(q.questionId)){assert.deepEqual(q,old);continue;}
  const normalized={...q,revision:old.revision,explanation:old.explanation};assert.deepEqual(normalized,old);
  assert.notEqual(q.explanation,old.explanation);assert.deepEqual(q.sourceRefs,old.sourceRefs);
 }
 const omit=b=>Object.fromEntries(Object.entries(b).filter(([k])=>!['bankVersion','releasedAt','changeSummary','editorialRoundId','questions','sources'].includes(k)));
 assert.deepEqual(omit(bank),omit(before));
 for(const [p,h] of [['docs/corrections/editorial-003.json','3f20e644742ef546f7867a9149e2b1afdc7d0c20961842ce4db14ce18c5195e9'],['docs/corrections/evidence/editorial-003-cycle-1.json','f7d3bec6e6e56533129ae4997fdecc37552f3f677b0139fa1a388fd3773984e3'],['docs/rounds/round-041.json','a76c5fe74e7f7b0fc1531d853962b8613d4131eb20508465a19894d362679cd6'],['data/releases/2026.10.10-regular.41/bank.json','e79345d85a7a296c1405404d1773d3d953fa39a1734d6831b01317e24184d9d7'],['docs/publication-selections/round-041-selection-001.json','8b6a937f4af4fc6513f1366277e6f0dfddb12cf1c53c78d824cf846199db3254']])assert.equal(hash(raw(p)),h);
 });

 test('each revised question receives strict structure and authoring checks with no historical exemption',async()=>{
 d.validateBankForPublication(bank);d.validateExplanationAuthoring(bank,await readHistoricalExplanationBaseline(root.pathname));
 for(const id of revised){const q=byId.get(id),mini={...bank,questions:[q],options:q.links.map(l=>bank.options.find(o=>o.optionId===l.optionId))};
  d.validateBankForPublication(mini);d.validateExplanationAuthoring(mini,null);assert(q.explanation.trim());assert(q.links.every(l=>!l.contextExplanation));
  for(const option of mini.options){assert(option.explanation.trim());assert.notEqual(option.explanation.trim(),q.explanation.trim());}
 }
 });

 test('exact accepted questions preserve 4/5-choice seeded order, stable keys and every answer grade',()=>{
 const originalBefore=JSON.stringify(before),originalAfter=JSON.stringify(bank);
 for(const id of revised)for(const count of [4,5]){const permutations=new Set(),correctPositions=new Set();for(let seed=0;seed<64;seed++){
  const old=d.presentQuestion(before,oldById.get(id),count,d.rng(seed),'fixture'),next=d.presentQuestion(bank,byId.get(id),count,d.rng(seed),'fixture');
  assert.deepEqual(persist(next.options),persist(old.options));assert.equal(next.correctOptionId,old.correctOptionId);
  assert.deepEqual(next.materials,old.materials);assert.equal(next.learningGoalRevision,old.learningGoalRevision);
  permutations.add(next.options.map(o=>o.optionId).join('|'));correctPositions.add(next.options.findIndex(o=>o.optionId===next.correctOptionId));
  for(const o of next.options){assert.deepEqual(d.grade(next,o.optionId),d.grade(old,o.optionId));assert.equal(d.grade(next,o.optionId).status,o.optionId===next.correctOptionId?'correct':'wrong');}
 }assert(permutations.size>1);assert(correctPositions.size>1);}
 assert.equal(JSON.stringify(before),originalBefore);assert.equal(JSON.stringify(bank),originalAfter);
 });

 test('synthetic pre-edit prepared sessions survive actual bank update, start, grading and persisted JSON backup unchanged',async()=>{
 for(const id of revised)for(const count of [4,5])for(const correct of [true,false]){
  const old=persist(prepared(before,id,count,37,`synthetic-old-${ids.indexOf(id)}-${count}-${correct}`)),oldSessionBytes=JSON.stringify(old),oldItemBytes=JSON.stringify(old.items),oldHash=await d.snapshotHash(old.items[0]);validateSession(old);
  const storedSessions=new Map([[old.sessionId,old]]),metas=new Map([['bank',{manifest:read('data/manifest.json'),bank:before}]]);
  // Real updateBank API stores only bank metadata. The session store fixture is JSON-persisted before use.
  metas.set('bank',{manifest:{...manifest,bankVersion:before.bankVersion,sha256:hash(beforeRaw)},bank:before});
  const fakeStore={meta:async key=>metas.get(key),putMeta:async(key,value)=>metas.set(key,value)};
  const fetcher=async url=>({ok:true,json:async()=>manifest,text:async()=>bankRaw});
  await updateBank(fakeStore,'https://example.invalid/',fetcher);assert.equal(metas.get('bank').bank.bankVersion,bank.bankVersion);
  assert.equal(JSON.stringify(storedSessions.get(old.sessionId)),oldSessionBytes);
  const reopened=parseBackup(exportBackup([storedSessions.get(old.sessionId)])).sessions[0];assert.deepEqual(reopened,old);assert.equal(JSON.stringify(reopened.items),oldItemBytes);assert.equal(await d.snapshotHash(reopened.items[0]),oldHash);
  const graded=completed(reopened,correct,newAt+100),stored=persist(graded),restored=parseBackup(exportBackup([stored])).sessions[0];
  assert.deepEqual(restored,stored);assert.equal(JSON.stringify(restored.items),oldItemBytes);assert.equal(await d.snapshotHash(restored.items[0]),oldHash);assert.equal(restored.attempts[0].grade.status,correct?'correct':'wrong');
  assert.deepEqual(restored.attempts[0].grade,d.grade(restored.items[0],restored.answers[restored.items[0].instanceId]));
  assert.equal(restored.items[0].explanation,oldById.get(id).explanation);assert.equal(restored.items[0].revision,oldById.get(id).revision);
  const fresh=persist(prepared(bank,id,count,37,`synthetic-new-${ids.indexOf(id)}-${count}-${correct}`));assert.equal(fresh.items[0].explanation,byId.get(id).explanation);assert.equal(fresh.items[0].revision,byId.get(id).revision);if(revised.includes(id))assert.notEqual(await d.snapshotHash(fresh.items[0]),oldHash);
  assert.deepEqual(fresh.items[0].options,reopened.items[0].options);assert.equal(fresh.items[0].correctOptionId,reopened.items[0].correctOptionId);
  const freshStored=persist(completed(fresh,correct,newAt+200));assert.deepEqual(parseBackup(exportBackup([freshStored])).sessions[0],freshStored);
  assert.deepEqual(freshStored.attempts[0].grade,restored.attempts[0].grade);
 }
 });

 test('current952 selectable items and both exclusion policies survive fresh practice, wrong retry and mock preparation',()=>{
 clock(newAt,()=>{
  const eligible=bank.questions.filter(q=>d.isNewSessionQuestion(bank,q)&&!q.testOnly);assert.equal(eligible.length,952);assert.equal(eligible.filter(q=>q.type==='written').length,872);assert.equal(eligible.filter(q=>q.type==='practical').length,80);
  assert.deepEqual(d.SUBJECTS.map(s=>eligible.filter(q=>q.subjectId===s.id).length),[121,205,181,208,157]);assert.deepEqual(w.mockAvailability(bank),w.mockAvailability(before));
  const excluded=new Set(policy.excluded.map(q=>q.questionId));assert.equal(excluded.size,5);
  for(const id of ['r041-primary-s2-w01','r041-primary-s3-w01'])assert(!byId.has(id));assert(byId.has('r041-primary-s4-w01'));
  const history=revised.map((id,i)=>completed(persist(prepared(before,id,5,41,`synthetic-history-${i}`)),false,newAt+300));
  for(const pool of ['all','new','wrong'])for(const optionCount of [4,5]){const config=w.practiceConfig('written',{pool,optionCount,count:1}),selected=w.practiceSelection(bank,config,history);assert(selected.bank.questions.every(q=>!excluded.has(q.questionId)&&!q.testOnly));if(selected.count){const s=d.prepareSession(selected.bank,config,history,41,`synthetic-pool-${pool}-${optionCount}`);assert(s.items.every(q=>!excluded.has(q.questionId)));}}
  const review=w.reviewPlan(bank,history,'written');assert.equal(review.available,revised.length);for(const group of review.groups){const session=d.prepareSession(group.bank,group.config,history,41,'synthetic-review-'+group.config.optionCount);assert(session.items.every(q=>revised.includes(q.questionId)&&q.revision===byId.get(q.questionId).revision));}
  const mock=d.prepareSession(bank,w.practiceConfig('written',{kind:'mock',count:100,mode:'timed'}),[],42,'synthetic-editorial-mock');assert.equal(mock.items.length,100);assert(mock.items.every(q=>!q.testOnly&&!excluded.has(q.questionId)));for(const subject of d.SUBJECTS)assert.equal(mock.items.filter(q=>q.subjectId===subject.id).length,20);
 });
 });
