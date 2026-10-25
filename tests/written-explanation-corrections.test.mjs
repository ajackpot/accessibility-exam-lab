import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {WRITTEN_EXPLANATION_CORRECTION as policy,writtenExplanationScope,readWrittenExplanationPredecessors,validateWrittenExplanationTransition,writtenExplanationCycleBinding,validateWrittenExplanationCandidate} from '../scripts/written-explanation-corrections.mjs';
import {editorialBlindPackage,editorialHash,editorialChangedPaths} from '../scripts/editorial-history-core.mjs';

const root=path.resolve(import.meta.dirname,'..');
const inventoryRaw=fs.readFileSync(path.join(root,policy.inventoryPath));
const baselineRaw=fs.readFileSync(path.join(root,`data/releases/${policy.baselineVersion}/bank.json`));
const baseline=JSON.parse(baselineRaw),scope=writtenExplanationScope(inventoryRaw);
// These synthetic cycle tests retain the exact Oct23 predecessor envelope.
// The current Oct25 local manifest cannot substitute for that historical input.
const manifestRaw=Buffer.from(JSON.stringify({schemaVersion:1,bankVersion:baseline.bankVersion,releasedAt:baseline.releasedAt,file:`releases/${baseline.bankVersion}/bank.json`,sha256:policy.baselineSha256,changeSummary:baseline.changeSummary,finalRelease:false},null,2)+'\n');
assert.equal(editorialHash(manifestRaw),policy.manifestSha256,'Exact original predecessor manifest required');

// Deliberately synthetic, in-memory transition fixture. No semantic gate or publication is claimed.
function fixture(){
  const bank=structuredClone(baseline),options=new Map(bank.options.map(o=>[o.optionId,o]));
  bank.bankVersion=policy.bankVersion;bank.localCorrectionId=policy.id;delete bank.registrationId;
  bank.releasedAt=policy.startedAt;bank.changeSummary='Synthetic transition test only; no editorial decision.';
  for(const q of bank.questions){
    const issue=scope.get(q.questionId);if(!issue)continue;
    q.revision++;
    if(issue.bundle==='confirmed'){
      q.explanationMode='components';q.explanationItems=[
        {id:'component-1',label:'Synthetic A',result:'A',explanation:'Synthetic fixture A.'},
        {id:'component-2',label:'Synthetic B',result:'B',explanation:'Synthetic fixture B.'}
      ];
      for(const link of q.links){const option=options.get(link.optionId);if(option.explanation!==''){option.explanation='';option.revision++;}link.optionRevision=option.revision;delete link.contextExplanation;}
    }else {q.notes=[...q.notes,'Synthetic transition fixture only.'];for(const link of q.links)delete link.contextExplanation;}
  }
  return bank;
}

test('scope is the exact completed audit, including the two overlapping defects',()=>{
  assert.equal(scope.size,372);
  assert.equal([...scope.values()].filter(q=>q.bundle==='confirmed').length,368);
  assert.equal([...scope.values()].filter(q=>q.repetition==='confirmed').length,6);
  assert.equal([...scope.values()].filter(q=>q.bundle==='confirmed'&&q.repetition==='confirmed').length,2);
  const changed=JSON.parse(inventoryRaw);changed.questions.find(q=>q.classification==='normal').classification='defect';
  assert.throws(()=>writtenExplanationScope(Buffer.from(JSON.stringify(changed))),/inventory.*bytes differ/);
});

test('all 372 corrections resolve to one existing accepted revision and retain exposed reviewers',()=>{
  const predecessors=readWrittenExplanationPredecessors(root,baseline,scope);
  assert.equal(predecessors.size,372);
  for(const [questionId,value]of predecessors){
    assert.equal(value.reference.questionRevision,baseline.questions.find(q=>q.questionId===questionId).revision);
    assert.match(value.reference.ledgerSha256,/^[a-f0-9]{64}$/);
    assert.ok(value.keyExposedReviewerIds.length>0);
    assert.ok(value.reference.ledgerPath.startsWith('docs/'));
  }
});

test('the separate local transition preserves IDs, ordering, sources and all 84 practical originals',()=>{
  const bank=fixture(),result=validateWrittenExplanationTransition(baseline,bank,scope);
  assert.equal(result.changedQuestionIds.length,372);assert.equal(result.practicalPreserved,84);
  assert.deepEqual(bank.questions.filter(q=>q.type==='practical'),baseline.questions.filter(q=>q.type==='practical'));
  assert.deepEqual(bank.sources,baseline.sources);
  assert.notEqual(bank.bankVersion,baseline.bankVersion);
  assert.equal(Object.hasOwn(bank,'registrationId'),false);
});

test('local transition rejects unauthorized practical, seed, key, material, source and scope edits',()=>{
  for(const mutate of [
    bank=>{bank.questions.find(q=>q.type==='practical').explanation+=' changed';},
    bank=>{bank.questions.find(q=>q.testOnly).explanation+=' changed';},
    bank=>{bank.questions.find(q=>scope.has(q.questionId)).links[0].role='invalid';},
    bank=>{bank.questions.find(q=>scope.has(q.questionId)&&q.materials?.length).materials[0].content+=' changed';},
    bank=>{bank.sources[0].url+=' changed';},
    bank=>{bank.questions.push(structuredClone(bank.questions[0]));},
    bank=>{bank.questions.reverse();},
    bank=>{bank.registrationId='practical-written-001';},
    bank=>{bank.bankVersion=baseline.bankVersion;},
    bank=>{bank.questions.find(q=>scope.has(q.questionId)).stem+=' changed';},
    bank=>{bank.questions.find(q=>scope.has(q.questionId)).revision+=3;},
    bank=>{const q=bank.questions.find(q=>scope.get(q.questionId)?.bundle==='confirmed');bank.options.find(o=>o.optionId===q.links[0].optionId).explanation='not empty';},
    bank=>{bank.questions.find(q=>scope.get(q.questionId)?.bundle==='confirmed').links[0].contextExplanation='not empty';}
  ])assert.throws(()=>validateWrittenExplanationTransition(baseline,mutateAndReturn(mutate),scope));
  function mutateAndReturn(mutate){const bank=fixture();mutate(bank);return bank;}
});

test('option wording moves and material instruction changes stay inside their audited scope',()=>{
  const allowed=fixture(),q=allowed.questions.find(q=>q.questionId==='r030-advertising-typography-s4-w01');
  q.materials[0].instruction+=' Synthetic instruction-only test.';
  assert.doesNotThrow(()=>validateWrittenExplanationTransition(baseline,allowed,scope));
  const denied=fixture(),other=denied.questions.find(q=>scope.get(q.questionId)?.bundle==='confirmed'&&scope.get(q.questionId)?.repetition!=='confirmed');
  denied.options.find(o=>o.optionId===other.links[0].optionId).content+=' changed';
  assert.throws(()=>validateWrittenExplanationTransition(baseline,denied,scope),/Protected option fields/);
});

test('only the two identified law omissions accept one exact existing-edition note without changing prior conditions',()=>{
  const ids=['r017-policy-accessibility-s1-w06','r021-policy-assistive-s1-w04'];
  for(const id of ids){
    const before=baseline.questions.find(q=>q.questionId===id),note=`적용 법령과 고정판: ${before.standardVersion}.`;
    const allowed=fixture(),q=allowed.questions.find(q=>q.questionId===id);q.notes.push(note);
    assert.doesNotThrow(()=>validateWrittenExplanationTransition(baseline,allowed,scope));
    assert.deepEqual(q.notes.slice(0,-1),before.notes);
    for(const mutate of [
      q=>{q.notes[0]+=' changed';},q=>{q.notes.unshift(note);},q=>{q.notes.push(note);},
      q=>{q.notes[q.notes.length-1]+=' 정답은 A이다.';},q=>{q.notes[q.notes.length-1]=note.replace('2019/882','2016/2102');},
      q=>{q.standardVersion+=' changed';},q=>{q.stem+=' changed';},q=>{q.sourceRefs=[];}
    ]){const denied=structuredClone(allowed);mutate(denied.questions.find(q=>q.questionId===id));assert.throws(()=>validateWrittenExplanationTransition(baseline,denied,scope));}
  }
  const denied=fixture(),other=denied.questions.find(q=>scope.get(q.questionId)?.bundle==='confirmed'&&scope.get(q.questionId)?.repetition!=='confirmed'&&!ids.includes(q.questionId));
  other.notes.push(`적용 법령과 고정판: ${other.standardVersion}.`);
  assert.throws(()=>validateWrittenExplanationTransition(baseline,denied,scope),/Protected question/);
});

function pendingFixture(){
  const bank=fixture(),predecessors=readWrittenExplanationPredecessors(root,baseline,scope),files=new Map(),encode=value=>Buffer.from(JSON.stringify(value));
  const corrections=[...scope].map(([questionId,issue])=>({correctionId:'correction-'+questionId,issueId:'issue-'+questionId,questionId,issueTypes:issue.issueTypes,defect:'Synthetic fixture defect, no decision claimed.',targetPaths:editorialChangedPaths(baseline,bank,questionId),authorId:'synthetic-author',priorAcceptedRef:predecessors.get(questionId).reference,attemptCount:1,revision:bank.questions.find(q=>q.questionId===questionId).revision,decision:'pending',cycles:[]}));
  const packagePath='evidence/cycle-1.json',pack={schemaVersion:1,kind:'local_written_explanation_review_input',correctionId:policy.id,cycle:1,items:corrections.map(c=>{const question=bank.questions.find(q=>q.questionId===c.questionId);return {correctionId:c.correctionId,question,options:question.links.map(l=>bank.options.find(o=>o.optionId===l.optionId))};})};
  files.set(packagePath,encode(pack));
  for(const c of corrections)c.cycles=[{...writtenExplanationCycleBinding(bank,c.questionId,1,packagePath,files.get(packagePath)),startedAt:policy.startedAt,completedAt:null,outcome:'running',gates:Object.fromEntries(['blindSolve','sourceCheck','ambiguityCheck','authoringAccessibility','structuralCheck'].map(name=>[name,{result:'not_run',reviewerId:null,evidencePath:null,evidenceSha256:null}]))}];
  const candidateRaw=encode(bank),transition=validateWrittenExplanationTransition(baseline,bank,scope);
  const ledger={schemaVersion:1,kind:policy.kind,correctionId:policy.id,authorization:{scope:'local_correction_and_validation',gitWriteAllowed:false,publicationAllowed:false,practicalChangesAllowed:false},baseline:{sourceCommit:policy.baselineCommit,bankVersion:policy.baselineVersion,bankSha256:policy.baselineSha256,manifestSha256:policy.manifestSha256,inventorySha256:policy.inventorySha256},startedAt:policy.startedAt,decisionDeadline:policy.decisionDeadline,closedAt:null,status:'running',candidateSha256:editorialHash(candidateRaw),changedQuestionIds:transition.changedQuestionIds,changedOptionIds:transition.changedOptionIds,corrections,publication:{status:'not_attempted',commit:null,verifiedAt:null,url:null,newlyPublicRegular:0}};
  return {baselineRaw,manifestRaw,inventoryRaw,candidateRaw,ledger,predecessors,read:relative=>{assert.ok(files.has(relative),'Requested test evidence must exist');return files.get(relative);},now:Date.parse(policy.startedAt)+60000};
}

test('frozen pending packages remain explicitly incomplete with every release permission false',()=>{
  const result=validateWrittenExplanationCandidate(pendingFixture());
  assert.equal(result.ok,true);assert.equal(result.reviewComplete,false);
  assert.equal(result.counts.pending,372);assert.equal(result.counts.accepted,0);
  for(const key of ['currentReleaseClearance','canStartNewContent','canPublish'])assert.equal(result[key],false);
  assert.equal(result.historicalChecks,'not_run');assert.equal(result.currentReleaseChecks,'not_run');
  assert.ok(result.blockers.length>0);
});

test('law-note restrictions reject forbidden frozen notes even when the current candidate notes are unchanged',()=>{
  const f=pendingFixture(),packagePath='evidence/cycle-1.json',pack=JSON.parse(f.read(packagePath));
  const item=pack.items.find(item=>item.question.questionId==='r017-policy-accessibility-s1-w06');
  item.question.notes.push('A new answer-bearing condition is not the approved law identity.');
  const raw=Buffer.from(JSON.stringify(pack)),read=f.read;f.read=p=>p===packagePath?raw:read(p);
  for(const c of f.ledger.corrections)c.cycles[0].reviewPackageSha256=editorialHash(raw);
  const c=f.ledger.corrections.find(c=>c.questionId===item.question.questionId);
  Object.assign(c.cycles[0],writtenExplanationCycleBinding({questions:[item.question],options:item.options},c.questionId,1,packagePath,raw));
  assert.throws(()=>validateWrittenExplanationCandidate(f),/Only the exact existing law identity/);
});

test('cycle evidence rejects invented acceptance, stale packages, author reviews and reset revisions',()=>{
  for(const [mutate,expected]of [
    [f=>{const c=f.ledger.corrections[0];c.decision='accepted';c.cycles[0].outcome='accepted';c.cycles[0].completedAt=new Date(f.now).toISOString();},/all five actual gates/],
    [f=>{f.ledger.corrections[0].cycles[0].reviewPackageSha256='a'.repeat(64);},/Review package bytes differ/],
    [f=>{f.ledger.corrections[0].cycles[0].contentSha256='a'.repeat(64);},/Frozen cycle contentSha256/],
    [f=>{f.ledger.corrections[0].cycles[0].componentStates[0].revision++;},/Frozen cycle componentStates/],
    [f=>{f.ledger.corrections[0].attemptCount=0;},/started cycle/],
    [f=>{const c=f.ledger.corrections[0],cycle=c.cycles[0];cycle.outcome='revise';cycle.completedAt=new Date(f.now).toISOString();cycle.gates.blindSolve={result:'pass',reviewerId:c.authorId,evidencePath:'forged.json',evidenceSha256:'a'.repeat(64)};},/reviewer is the author/],
    [f=>{const c=f.ledger.corrections[0],cycle=c.cycles[0];c.coauthorIds=['synthetic-coauthor'];cycle.outcome='revise';cycle.completedAt=new Date(f.now).toISOString();cycle.gates.blindSolve={result:'pass',reviewerId:'synthetic-coauthor',evidencePath:'forged.json',evidenceSha256:'a'.repeat(64)};},/reviewer is the author/],
    [f=>{f.ledger.publication.status='verified';},/cannot claim publication/],
    [f=>{f.ledger.authorization.publicationAllowed=true;},/cannot grant/],
    [f=>{f.ledger.corrections[0].priorAcceptedRef={...f.ledger.corrections[0].priorAcceptedRef,recordId:'new-id'};},/exact accepted predecessor/]
  ]){const f=pendingFixture();mutate(f);assert.throws(()=>validateWrittenExplanationCandidate(f),expected);}
});

test('cycle binding changes for content bytes, revisions and raw package whitespace without leaking keys into blind input',()=>{
  const bank=fixture(),questionId=[...scope.keys()][0],raw=Buffer.from('{"synthetic":true}\n');
  const binding=writtenExplanationCycleBinding(bank,questionId,1,'evidence/cycle-1.json',raw);
  assert.equal(binding.revision,baseline.questions.find(q=>q.questionId===questionId).revision+1);
  const whitespace=writtenExplanationCycleBinding(bank,questionId,1,'evidence/cycle-1.json',Buffer.concat([raw,Buffer.from(' ')]));
  assert.notEqual(binding.reviewPackageSha256,whitespace.reviewPackageSha256);
  const blind=editorialBlindPackage(bank,questionId);
  assert.equal(binding.blindPackageSha256,editorialHash(blind));
  for(const key of ['questionId','explanation','explanationItems','explanationMode','sourceRefs','role','revision'])assert.equal(Object.hasOwn(blind,key),false);
  assert.ok(blind.choices.every(choice=>Object.keys(choice).sort().join(',')==='label,text'));
  bank.questions.find(q=>q.questionId===questionId).explanation+=' changed after review';
  assert.notEqual(writtenExplanationCycleBinding(bank,questionId,1,'evidence/cycle-1.json',raw).contentSha256,binding.contentSha256);
});

test('a fabricated ledger never bypasses baseline bytes or obtains publication authority',()=>{
  const candidateRaw=Buffer.from(JSON.stringify(fixture()));
  for(const bytes of [Buffer.from('{}'),Buffer.concat([baselineRaw,Buffer.from(' ')])])assert.throws(()=>validateWrittenExplanationCandidate({baselineRaw:bytes,manifestRaw,inventoryRaw,candidateRaw,ledger:{approved:true},read:()=>Buffer.from('{}')}),/Active baseline bytes differ/);
  assert.throws(()=>validateWrittenExplanationCandidate({baselineRaw,manifestRaw,inventoryRaw,candidateRaw,ledger:{approved:true},read:()=>Buffer.from('{}')}),/Invalid ledger fields/);
});
