import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {canonicalHash,questionProjection,validatePracticalWrittenLedger,validatePracticalWrittenTransition,practicalWrittenHash,assertPracticalWrittenArchiveSource,PRACTICAL_WRITTEN,P1_GROUPS,P2_GROUPS} from '../scripts/practical-written-registration.mjs';
import {currentCutoffBlocks} from '../scripts/current-release-authority.mjs';
import {FREEZE_AT} from '../src/domain.js';
import {PRACTICAL_WRITTEN_HISTORY,PRACTICAL_WRITTEN_P1_REVIEWS} from '../scripts/practical-written-baseline.mjs';
const root=path.resolve(import.meta.dirname,'..');
function reviewedFixture(){
  const p=PRACTICAL_WRITTEN,candidates=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/practical-written-p1-review.json'))).candidates;
  const baseline=JSON.parse(fs.readFileSync(path.join(root,`data/releases/${p.baselineVersion}/bank.json`))),bank=structuredClone(baseline),now=Date.now(),at=new Date(now).toISOString();
  Object.assign(bank,{bankVersion:p.bankVersion,releasedAt:at,changeSummary:'Synthetic in-memory registration regression; no publication.',registrationId:p.id});delete bank.roundId;delete bank.editorialRoundId;
  const read=relative=>fs.readFileSync(path.join(root,relative));
  for(const c of candidates){const input=c.sourceRefresh?.input??c.cycles.at(-1).input,pack=JSON.parse(read(input.path));bank.questions.push({...pack.question,verificationStatus:'published',reviewNote:`${p.ledgerPath} ${c.candidateId}`});for(const o of pack.options)if(!bank.options.some(x=>x.optionId===o.optionId))bank.options.push(o);for(const s of pack.sources)if(!bank.sources.some(x=>x.id===s.id))bank.sources.push(s);}
  bank.contentCounts={testOnly:bank.questions.filter(q=>q.testOnly).length,regularWrittenBySubject:Object.fromEntries(['s1','s2','s3','s4','s5'].map(s=>[s,bank.questions.filter(q=>!q.testOnly&&q.type==='written'&&q.subjectId===s).length])),regularPractical:bank.questions.filter(q=>!q.testOnly&&q.type==='practical').length};
  const raw=JSON.stringify(bank,null,2)+'\n',manifest={schemaVersion:1,bankVersion:bank.bankVersion,releasedAt:bank.releasedAt,file:`releases/${bank.bankVersion}/bank.json`,sha256:practicalWrittenHash(raw),changeSummary:bank.changeSummary,finalRelease:false};
  const ledger={schemaVersion:1,kind:p.kind,registrationId:p.id,authorization:{authorizedAt:p.authorizedAt,scope:'p1_registration_p2_review_and_public_release',practicalChangesAllowed:false},baseline:{sourceCommit:p.baselineCommit,bankVersion:p.baselineVersion,bankSha256:p.baselineSha256,manifestSha256:p.baselineManifestSha256},status:'closed',registeredAt:at,batches:[{batchId:'p1-reuse',origin:'p1_reused',startedAt:'2026-10-21T07:02:30.820847+00:00',decisionDeadline:'2026-10-21T09:02:30.820847+00:00',closedAt:'2026-10-21T07:33:23.121095+00:00',candidateIds:candidates.map(c=>c.candidateId)}],candidates,result:{bankVersion:p.bankVersion,bankSha256:manifest.sha256,manifestSha256:practicalWrittenHash(JSON.stringify(manifest,null,2)+'\n'),acceptedQuestionIds:candidates.map(c=>c.questionId)},publication:{status:'not_attempted',commit:null,verifiedAt:null,url:null,newlyPublicRegular:0}};
  return {ledger,baseline,bank,read,now};
}

test('canonical review hashes sort nested keys while preserving Unicode and array order',()=>{
  assert.equal(canonicalHash({z:[{나:2,a:1}],a:'한글'}),canonicalHash({a:'한글',z:[{a:1,나:2}]}));
  assert.notEqual(canonicalHash(['a','b']),canonicalHash(['b','a']));
  assert.notEqual(canonicalHash({text:'a b'}),canonicalHash({text:'a  b'}));
});
test('published projection permits only the two documented question metadata fields',()=>{
  const q={questionId:'x',revision:2,stem:'질문',testOnly:false,verificationStatus:'reviewed',reviewNote:'private review'};
  assert.deepEqual(questionProjection(q),questionProjection({...q,verificationStatus:'published',reviewNote:'public ledger'}));
  for(const [key,value]of [['revision',3],['stem','다른 질문'],['testOnly',true]])assert.notDeepEqual(questionProjection(q),questionProjection({...q,[key]:value}));
});
test('approval does not reopen the campaign clock or accept caller flags',()=>{
  assert.equal(currentCutoffBlocks(Date.now()),true);
  assert.equal(currentCutoffBlocks(Date.now(),{approved:true,postFreezeCorrectionApproved:true}),true);
  assert.equal(currentCutoffBlocks(FREEZE_AT-1),false);
  assert.throws(()=>validatePracticalWrittenLedger({kind:PRACTICAL_WRITTEN.kind,approved:true},{baseline:{questions:[]},read:()=>Buffer.from('{}')}),/Invalid ledger fields/);
});
test('scope and history pins include exactly sixteen reviewed P1 and eighteen P2 groups',()=>{
  assert.equal(P1_GROUPS.length,16);assert.equal(P2_GROUPS.length,18);
  assert.equal(new Set([...P1_GROUPS,...P2_GROUPS]).size,34);
  for(const held of ['G23','G34','G35','G36','G38','G39'])assert.equal(P2_GROUPS.includes(held),false);
  assert.equal(PRACTICAL_WRITTEN_P1_REVIEWS.length,16);
  assert.ok(PRACTICAL_WRITTEN_HISTORY.some(e=>e.path==='docs/corrections/editorial-005.json'));
  assert.ok(PRACTICAL_WRITTEN_HISTORY.some(e=>e.path==='docs/publications/editorial-005.json'));
  assert.ok(PRACTICAL_WRITTEN_HISTORY.some(e=>e.path==='docs/incidents/2026-10-06-round-023-evidence-loss.md'));
  assert.ok(PRACTICAL_WRITTEN_HISTORY.every(e=>e.path!=='data/manifest.json'));
});
test('typed archive source cannot alias an old round or editorial owner',()=>{
  const p=PRACTICAL_WRITTEN,s={kind:'practical_written_registered_release',registrationId:p.id,baseCommit:p.baselineCommit,bankVersion:p.bankVersion,ledgerPath:p.ledgerPath,deltaArtifactSha256:'1'.repeat(64),deltaManifestSha256:'2'.repeat(64),bankSha256:'3'.repeat(64),ledgerSha256:'4'.repeat(64)};
  assert.doesNotThrow(()=>assertPracticalWrittenArchiveSource(s));
  for(const changed of [{roundId:p.id},{registrationId:'editorial-005'},{baseCommit:'f'.repeat(40)},{bankVersion:p.baselineVersion},{ledgerPath:'docs/corrections/editorial-005.json'},{selectionReference:{}},{bankSha256:'0'.repeat(64)}])assert.throws(()=>assertPracticalWrittenArchiveSource({...s,...changed}));
});
test('exact P1 reuse preserves 28 cycles, four source refreshes and all 84 practical originals',()=>{
  const f=reviewedFixture();assert.deepEqual(validatePracticalWrittenTransition(f.ledger,f),{ok:true,accepted:16,p1:16,p2:0,practicalPreserved:84,total:987});
  assert.equal(f.ledger.candidates.reduce((n,c)=>n+c.cycles.length,0),28);
  assert.equal(f.ledger.candidates.filter(c=>c.sourceRefresh).length,4);
});
test('a new manifest or accepted list cannot authorize changed original or extra content',()=>{
  for(const mutate of [
    f=>{f.bank.questions[0].stem+=' changed';},
    f=>{f.bank.questions.find(q=>q.type==='practical').stem+=' changed';},
    f=>{f.bank.options[0].content+=' changed';},
    f=>{f.bank.sources[0].evidence+=' changed';},
    f=>{f.bank.questions.pop();},
    f=>{f.bank.options.push({...f.bank.options.at(-1),optionId:'unapproved-extra'});},
    f=>{f.bank.registrationId='other';},
    f=>{f.bank.roundId='round-042';},
    f=>{f.bank.questions.at(-1).explanation+=' unreviewed';}
  ]){const f=reviewedFixture();mutate(f);assert.throws(()=>validatePracticalWrittenTransition(f.ledger,f));}
});
test('review cycles, reviewer identities, input bytes and source refreshes cannot be laundered',()=>{
  for(const mutate of [
    f=>{f.ledger.candidates[0].cycles.shift();},
    f=>{Object.values(f.ledger.candidates.flatMap(c=>c.cycles).find(c=>Object.values(c.gates).some(g=>g.result==='fail')).gates).find(g=>g.result==='fail').result='pass';},
    f=>{f.ledger.candidates[0].cycles[1].blind.reviewerId=f.ledger.candidates[0].authorId;},
    f=>{delete f.ledger.candidates.find(c=>c.sourceRefresh).sourceRefresh;},
    f=>{f.ledger.candidates.find(c=>c.sourceRefresh).sourceRefresh.priorQuestionAndOptionsUnchanged=false;},
    f=>{const read=f.read;f.read=p=>Buffer.concat([read(p),Buffer.from(' ')]);},
    f=>{f.ledger.publication.status='verified';},
    f=>{f.ledger.authorization.authorizedAt='2026-10-21T00:00:00Z';}
  ]){const f=reviewedFixture();mutate(f);assert.throws(()=>validatePracticalWrittenTransition(f.ledger,f));}
});
test('an approved P2 group cannot borrow an excluded practical original',()=>{
  const f=reviewedFixture(),c=structuredClone(f.ledger.candidates[0]),q=f.baseline.questions.find(q=>q.questionId==='r005-internet-html-p01');
  Object.assign(c,{candidateId:'pw22-g08-w01',questionId:'pw22-g08-w01',origin:'p2_reviewed',groupId:'G08',templateId:'pw22-template-g08',learningGoalId:'pw22-goal-g08',originalPracticalRefs:[{questionId:q.questionId,revision:q.revision,sha256:canonicalHash(q)}]});
  f.ledger.candidates.push(c);f.ledger.result.acceptedQuestionIds.push(c.questionId);
  const closedAt=new Date(Math.min(f.now,Date.parse(PRACTICAL_WRITTEN.decisionDeadline))).toISOString();
  f.ledger.batches.push({batchId:'p2-a',origin:'p2_reviewed',startedAt:PRACTICAL_WRITTEN.authorizedAt,decisionDeadline:PRACTICAL_WRITTEN.decisionDeadline,closedAt,candidateIds:[c.candidateId]});
  assert.throws(()=>validatePracticalWrittenLedger(f.ledger,f),/P2 group must retain/);
});
