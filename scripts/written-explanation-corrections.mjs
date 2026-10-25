/** Local review only. This module never supplies a release authority or changes history. */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual as equal} from 'node:util';
import {validateBankForPublication,validateExplanationAuthoring} from '../src/domain.js';
import {readBankInput} from './bank-io.mjs';
import {runtimeIdentity,sourceInventory,assertSameSnapshot} from './source-snapshot.mjs';
import {practicalWrittenHash,readPracticalWrittenFile} from './practical-written-registration.mjs';
import {EDITORIAL_GATES,editorialContent,editorialContentHash,editorialBlindPackage,editorialHash,editorialComponentStates,editorialChangedPaths} from './editorial-history-core.mjs';

export const WRITTEN_EXPLANATION_CORRECTION=Object.freeze({
  id:'written-explanation-20261023',kind:'local_written_explanation_correction',
  baselineCommit:'55b8a16b63bf41707e33566a4d3b8a5ab00cc8f0',
  baselineVersion:'2026.10.22-practical-written.1',
  baselineSha256:'86acf4a514a1f67ae23cc8019560b4c57359a7195433110214f70b7e8c488986',
  manifestSha256:'0ff0fb4e22120dc05e9bbff5e1f93d7de02ee069c2c20ea0ace4ef1f431ca6b6',
  inventoryPath:'docs/analysis/2026-10-23-written-explanation-inventory.json',
  inventorySha256:'706517569452e5da6065f0af28ece7a5e4a68f9762447476f25991c015517620',
  bankVersion:'2026.10.23-written-explanation.local.1',
  startedAt:'2026-10-23T14:37:20.499383+00:00',
  decisionDeadline:'2026-10-23T18:37:20.499383+00:00'
});
const POLICY=WRITTEN_EXPLANATION_CORRECTION;
const ROOT=path.resolve(import.meta.dirname,'..');
const noAuthority=()=>({currentReleaseClearance:false,canStartNewContent:false,canPublish:false});
const fail=message=>{throw Error('Local written explanation correction: '+message);};
const without=(value,keys)=>Object.fromEntries(Object.entries(value).filter(([key])=>!keys.includes(key)));
const sameIds=(a,b)=>equal([...a].sort(),[...b].sort());
const nonempty=value=>typeof value==='string'&&value.trim().length>0;
function keys(value,expected,label){if(!value||typeof value!=='object'||Array.isArray(value)||!sameIds(Object.keys(value),expected))fail('Invalid '+label+' fields');}
function unique(values,label){if(!Array.isArray(values)||new Set(values).size!==values.length)fail('Duplicate or invalid '+label);}
function at(value,label){const n=Date.parse(value);if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT/.test(value)||!Number.isFinite(n))fail('Invalid '+label+' time');return n;}
function text(value,label){if(!nonempty(value))fail('Missing '+label);}
function exactBytes(raw,sha,label){if(!raw||practicalWrittenHash(raw)!==sha)fail(label+' bytes differ');}

/** The completed audit fixes membership; callers cannot turn an audit edit into new scope. */
export function writtenExplanationScope(inventoryRaw){
  exactBytes(inventoryRaw,POLICY.inventorySha256,'Completed inventory');
  const inventory=JSON.parse(inventoryRaw),items=inventory.questions.filter(q=>q.classification==='defect');
  unique(items.map(q=>q.questionId),'audited question IDs');
  if(items.length!==372||items.filter(q=>q.bundle==='confirmed').length!==368||items.filter(q=>q.repetition==='confirmed').length!==6)fail('Audited scope count mismatch');
  return new Map(items.map(q=>[q.questionId,q]));
}

/** Read actual old decisions, including every earlier key-visible reviewer. No new decisions are inferred. */
export function readWrittenExplanationPredecessors(root,baseline,scope){
  const paths=[];
  for(const [directory,pattern]of [['docs/rounds',/^round-\d+\.json$/],['docs/corrections',/^editorial-\d+\.json$/]])
    for(const name of fs.readdirSync(path.join(root,directory)).sort())if(pattern.test(name))paths.push(`${directory}/${name}`);
  paths.push('docs/conversions/practical-written-001.json');
  const history=paths.map(relative=>{const raw=readPracticalWrittenFile(root,relative);return {path:relative,sha256:practicalWrittenHash(raw),value:JSON.parse(raw)};});
  const result=new Map();
  for(const [questionId]of scope){
    const question=baseline.questions.find(q=>q.questionId===questionId),matches=[],exposed=new Set();
    if(!question||question.testOnly!==false||question.type!=='written'||question.verificationStatus!=='published')fail('Predecessor is not existing published regular written: '+questionId);
    for(const source of history)for(const c of source.value.candidates??source.value.corrections??[]){
      if(c.questionId!==questionId)continue;
      if(c.authorId)exposed.add(c.authorId);
      for(const cycle of c.cycles??[]){
        for(const gate of Object.values(cycle.gates??{}))if(gate.result!=='not_run'&&gate.reviewerId)exposed.add(gate.reviewerId);
        if(cycle.blind?.reviewerId)exposed.add(cycle.blind.reviewerId);
      }
      if(c.sourceRefresh?.reviewerId)exposed.add(c.sourceRefresh.reviewerId);
      const revision=c.revision??c.cycles?.at(-1)?.revision;
      if(c.decision==='accepted'&&revision===question.revision)matches.push({ledgerPath:source.path,ledgerSha256:source.sha256,recordId:c.candidateId??c.correctionId,questionRevision:revision,contentSha256:editorialContentHash(baseline,question)});
    }
    if(matches.length!==1)fail('Expected one exact accepted predecessor: '+questionId);
    result.set(questionId,{reference:matches[0],keyExposedReviewerIds:[...exposed].sort()});
  }
  return result;
}

// These two already-audited bundle questions omitted the law identity before
// grading. Only an exact append of their existing fixed-edition metadata is
// permitted; this is not a general notes-edit allowance or a semantic approval.
const lawIdentityNotes=new Set(['r017-policy-accessibility-s1-w06','r021-policy-assistive-s1-w04']);
function validateLawIdentityNotes(before,question){
  if(lawIdentityNotes.has(question.questionId)&&!equal(question.notes,before.notes)&&!equal(question.notes,[...before.notes,`적용 법령과 고정판: ${before.standardVersion}.`]))fail('Only the exact existing law identity may be appended to notes: '+question.questionId);
}
function protectedQuestion(question,repetition){
  const out=without(question,['revision','explanation','explanationMode','explanationItems','links',...(repetition?['stem','notes']:[]),...(lawIdentityNotes.has(question.questionId)?['notes']:[])]);
  out.links=question.links.map(link=>without(link,['optionRevision','contextExplanation']));
  // One audited common-condition move needs an instruction label update. Actual material bytes remain protected.
  if(repetition&&question.questionId==='r030-advertising-typography-s4-w01')out.materials=question.materials.map(material=>without(material,['instruction']));
  return out;
}
function protectedOption(option,repetition){return without(option,['revision','explanation',...(repetition?['content']:[])]);}
function changedWithoutRevision(a,b){return !equal(without(a,['revision']),without(b,['revision']));}

/** Scope/identity checks run before semantic authoring checks, and cover every unchanged object too. */
export function validateWrittenExplanationTransition(baseline,bank,scope){
  if(bank.bankVersion!==POLICY.bankVersion||bank.localCorrectionId!==POLICY.id||['registrationId','roundId','editorialRoundId'].some(key=>Object.hasOwn(bank,key)))fail('Candidate must have its separate local identity');
  const mutable=['bankVersion','releasedAt','changeSummary','registrationId','localCorrectionId','questions','options'];
  if(!equal(without(baseline,mutable),without(bank,mutable)))fail('Protected bank metadata, sources, coverage or score corrections changed');
  if(!equal(baseline.questions.map(q=>q.questionId),bank.questions.map(q=>q.questionId))||!equal(baseline.options.map(o=>o.optionId),bank.options.map(o=>o.optionId)))fail('Question/option ID membership or order changed');
  text(bank.changeSummary,'candidate summary');
  if(at(bank.releasedAt,'candidate creation')<at(POLICY.startedAt,'start'))fail('Candidate creation predates work');
  const beforeOptions=new Map(baseline.options.map(o=>[o.optionId,o])),afterOptions=new Map(bank.options.map(o=>[o.optionId,o]));
  const changedQuestions=[],changedOptions=[],optionOwners=new Map();
  for(const q of bank.questions)for(const link of q.links??[]){if(!optionOwners.has(link.optionId))optionOwners.set(link.optionId,[]);optionOwners.get(link.optionId).push(q);}
  for(let i=0;i<bank.questions.length;i++){
    const q=bank.questions[i],before=baseline.questions[i],issue=scope.get(q.questionId);
    const optionChanged=(q.links??[]).some(l=>!equal(beforeOptions.get(l.optionId),afterOptions.get(l.optionId)));
    if(!issue){if(!equal(before,q)||optionChanged)fail('Unapproved question or practical/seed content changed: '+q.questionId);continue;}
    if(q.type!=='written'||q.testOnly!==false||q.verificationStatus!=='published'||q.optionMode!=='exclusive')fail('Correction must preserve exclusive published regular written identity: '+q.questionId);
    if(equal(before,q)&&!optionChanged)fail('Audited correction has no effective change: '+q.questionId);
    if(!equal(protectedQuestion(before,issue.repetition==='confirmed'),protectedQuestion(q,issue.repetition==='confirmed')))fail('Protected question, key, score, source or material changed: '+q.questionId);
    validateLawIdentityNotes(before,q);
    if(!Number.isInteger(q.revision)||q.revision<=before.revision||q.revision>before.revision+3)fail('Question revision must count one to three started cycles: '+q.questionId);
    if(issue.bundle==='confirmed'){
      if(q.explanationMode!=='components'||!Array.isArray(q.explanationItems)||q.explanationItems.length<2||q.explanationItems.length>40)fail('Missing component explanation: '+q.questionId);
      if(q.links.some(l=>l.contextExplanation!==undefined&&l.contextExplanation!==''))fail('Component link context must be absent or empty: '+q.questionId);
    }else if(!equal(q.explanationMode,before.explanationMode)||!equal(q.explanationItems,before.explanationItems))fail('Component mode outside the 368-question scope: '+q.questionId);
    if(!nonempty(q.explanation))fail('Question summary is mandatory: '+q.questionId);
    for(const link of q.links){
      const old=beforeOptions.get(link.optionId),option=afterOptions.get(link.optionId);
      if(!old||!option||!equal(protectedOption(old,issue.repetition==='confirmed'),protectedOption(option,issue.repetition==='confirmed')))fail('Protected option fields changed: '+link.optionId);
      if(issue.bundle==='confirmed'&&option.explanation!=='')fail('Component option explanation must be exactly empty: '+link.optionId);
      if(!Number.isInteger(option.revision)||option.revision<old.revision||option.revision>old.revision+3||link.optionRevision!==option.revision)fail('Option/link revision differs: '+link.optionId);
    }
    changedQuestions.push(q.questionId);
  }
  for(const option of bank.options){
    const old=beforeOptions.get(option.optionId);if(equal(old,option))continue;
    if(!changedWithoutRevision(old,option))fail('Revision-only option change: '+option.optionId);
    if(!(optionOwners.get(option.optionId)?.length)||optionOwners.get(option.optionId).some(q=>!scope.has(q.questionId)))fail('Changed option has an unreviewed member: '+option.optionId);
    changedOptions.push(option.optionId);
  }
  if(!sameIds(changedQuestions,[...scope.keys()]))fail('Changed question scope differs from the exact 372 audited defects');
  return {changedQuestionIds:changedQuestions,changedOptionIds:changedOptions,practicalPreserved:baseline.questions.filter(q=>q.type==='practical').length};
}

/** Hash helper for the actual frozen bytes. It does not mark any gate as executed. */
export function writtenExplanationCycleBinding(bank,questionId,cycle,reviewPackagePath,reviewPackageRaw){
  const q=bank.questions.find(q=>q.questionId===questionId);
  if(!q)fail('Missing cycle question: '+questionId);
  return {cycle,revision:q.revision,contentSha256:editorialContentHash(bank,q),blindPackageSha256:editorialHash(editorialBlindPackage(bank,q)),reviewPackagePath,reviewPackageSha256:practicalWrittenHash(reviewPackageRaw),componentStates:editorialComponentStates(bank,q)};
}

function packageFor(ledger,correction,cycle,read,cache){
  const expected=`evidence/cycle-${cycle.cycle}.json`;
  if(cycle.reviewPackagePath!==expected)fail('Review package must identify this local cycle');
  let pack=cache.get(expected);
  if(!pack){const raw=Buffer.from(read(expected));pack={raw,sha256:practicalWrittenHash(raw),value:JSON.parse(raw)};cache.set(expected,pack);}
  if(pack.sha256!==cycle.reviewPackageSha256)fail('Review package bytes differ');
  const p=pack.value;
  keys(p,['schemaVersion','kind','correctionId','cycle','items'],'review package');
  if(p.schemaVersion!==1||p.kind!=='local_written_explanation_review_input'||p.correctionId!==POLICY.id||p.cycle!==cycle.cycle)fail('Wrong review package envelope');
  unique(p.items.map(i=>i.question.questionId),'review package questions');
  const expectedIds=ledger.corrections.filter(c=>c.cycles.some(x=>x.cycle===cycle.cycle)).map(c=>c.questionId);
  if(!sameIds(p.items.map(i=>i.question.questionId),expectedIds))fail('Review package membership differs from registered cycles');
  const item=p.items.find(i=>i.question.questionId===correction.questionId);
  keys(item,['correctionId','question','options'],'review item');
  if(item.correctionId!==correction.correctionId||item.question.revision!==cycle.revision)fail('Review item identity/revision differs');
  unique(item.options.map(o=>o.optionId),'review options');
  if(!sameIds(item.question.links.map(l=>l.optionId),item.options.map(o=>o.optionId)))fail('Review option membership differs');
  const mini={questions:[item.question],options:item.options};
  const binding={cycle:cycle.cycle,revision:item.question.revision,contentSha256:editorialContentHash(mini,item.question),blindPackageSha256:editorialHash(editorialBlindPackage(mini,item.question)),reviewPackagePath:expected,reviewPackageSha256:pack.sha256,componentStates:editorialComponentStates(mini,item.question)};
  for(const [key,value]of Object.entries(binding))if(!equal(cycle[key],value))fail('Frozen cycle '+key+' differs: '+correction.questionId);
  return mini;
}

function gateEvidence(correction,cycle,name,gate,read,exposed,snapshot){
  keys(gate,['result','reviewerId','evidencePath','evidenceSha256'],'gate');
  if(!['pass','fail','not_run'].includes(gate.result))fail('Invalid gate result');
  if(gate.result==='not_run'){
    if(gate.reviewerId!==null||gate.evidencePath!==null||gate.evidenceSha256!==null)fail('Unrun gate cannot claim evidence');
    return null;
  }
  text(gate.reviewerId,'gate reviewer');
  if([correction.authorId,...(correction.coauthorIds??[])].includes(gate.reviewerId))fail('Executed gate reviewer is the author');
  const raw=read(gate.evidencePath);exactBytes(raw,gate.evidenceSha256,'Gate evidence');
  let evidence=JSON.parse(raw);
  if(evidence.kind==='local_written_explanation_gate_batch'){
    keys(evidence,['schemaVersion','kind','items'],'gate evidence batch');
    if(evidence.schemaVersion!==1||!Array.isArray(evidence.items))fail('Invalid evidence batch');
    unique(evidence.items.map(item=>`${item.correctionId}/${item.cycle}/${item.gate}`),'batch evidence identities');
    evidence=evidence.items.find(item=>item.correctionId===correction.correctionId&&item.cycle===cycle.cycle&&item.gate===name);
  }
  keys(evidence,['schemaVersion','kind','correctionId','cycle','revision','gate','reviewerId','result','contentSha256','blindPackageSha256','completedAt','summary','details'],'gate evidence');
  if(evidence.schemaVersion!==1||evidence.kind!=='local_written_explanation_gate'||evidence.correctionId!==correction.correctionId||evidence.cycle!==cycle.cycle||evidence.revision!==cycle.revision||evidence.gate!==name||evidence.reviewerId!==gate.reviewerId||evidence.result!==gate.result||evidence.contentSha256!==cycle.contentSha256||evidence.blindPackageSha256!==cycle.blindPackageSha256)fail('Gate evidence is not bound to this exact content/reviewer/result');
  const completed=at(evidence.completedAt,'gate completion');
  if(completed<at(cycle.startedAt,'cycle start')||completed>at(cycle.completedAt,'cycle completion'))fail('Gate evidence is outside the cycle');
  text(evidence.summary,'gate conclusion');
  if(!evidence.details||typeof evidence.details!=='object'||Array.isArray(evidence.details))fail('Missing gate details');
  if(name==='blindSolve'){
    if(exposed.has(gate.reviewerId)||evidence.details.keyExposedBeforeSolve!==false)fail('Blind reviewer was author or previously key-visible');
    text(evidence.details.answer,'blind reasoning');
    if(!Array.isArray(evidence.details.selectedOptionIds)||!evidence.details.selectedOptionIds.length)fail('Missing frozen blind answer IDs');
    unique(evidence.details.selectedOptionIds,'blind answers');
    for(const refName of ['input','submission']){
      const ref=evidence.details[refName];keys(ref,['path','sha256'],'blind '+refName+' reference');
      const bytes=read(ref.path);exactBytes(bytes,ref.sha256,'Blind '+refName);
      const payload=JSON.parse(bytes);
      if(refName==='input'){
        if(!equal(payload,editorialBlindPackage(snapshot,correction.questionId)))fail('Blind input contains different content or answer-bearing fields');
      }else{
        keys(payload,['reviewerId','submittedAt','selectedLabels','answer'],'blind submission');
        if(payload.reviewerId!==gate.reviewerId||payload.answer!==evidence.details.answer||at(payload.submittedAt,'blind submission')<at(cycle.startedAt,'cycle start')||at(payload.submittedAt,'blind submission')>completed)fail('Blind submission identity, reasoning or time differs');
        unique(payload.selectedLabels,'blind selected labels');
        const q=snapshot.questions[0],options=[...snapshot.options].sort((a,b)=>editorialHash(`${q.questionId}:${q.revision}:${a.optionId}`).localeCompare(editorialHash(`${q.questionId}:${q.revision}:${b.optionId}`)));
        if(payload.selectedLabels.some(label=>typeof label!=='string'||!/^[A-Z]$/.test(label)))fail('Invalid blind selected labels');
        const selected=payload.selectedLabels.map(label=>options[label.charCodeAt(0)-65]?.optionId);
        if(selected.some(id=>!id)||!sameIds(selected,evidence.details.selectedOptionIds))fail('Blind labels do not map to the frozen selected option IDs');
      }
    }
  }
  if(name==='sourceCheck'&&(!Array.isArray(evidence.details.sources)||!evidence.details.sources.length))fail('Source gate needs actual primary-source findings');
  return evidence;
}

/** Pure predicates. Inputs are evidence to check, never authenticated publication authority. */
export function validateWrittenExplanationCandidate({baselineRaw,manifestRaw,inventoryRaw,candidateRaw,ledger,read,predecessors,now=Date.now()}){
  exactBytes(baselineRaw,POLICY.baselineSha256,'Active baseline');exactBytes(manifestRaw,POLICY.manifestSha256,'Active manifest');
  const scope=writtenExplanationScope(inventoryRaw),baseline=JSON.parse(baselineRaw),bank=JSON.parse(candidateRaw);
  const transition=validateWrittenExplanationTransition(baseline,bank,scope);
  keys(ledger,['schemaVersion','kind','correctionId','authorization','baseline','startedAt','decisionDeadline','closedAt','status','candidateSha256','changedQuestionIds','changedOptionIds','corrections','publication'],'ledger');
  if(ledger.schemaVersion!==1||ledger.kind!==POLICY.kind||ledger.correctionId!==POLICY.id)fail('Wrong local ledger identity');
  if(!equal(ledger.authorization,{scope:'local_correction_and_validation',gitWriteAllowed:false,publicationAllowed:false,practicalChangesAllowed:false}))fail('Local authorization cannot grant Git/publication/practical changes');
  if(!equal(ledger.publication,{status:'not_attempted',commit:null,verifiedAt:null,url:null,newlyPublicRegular:0}))fail('Local ledger cannot claim publication');
  if(!equal(ledger.baseline,{sourceCommit:POLICY.baselineCommit,bankVersion:POLICY.baselineVersion,bankSha256:POLICY.baselineSha256,manifestSha256:POLICY.manifestSha256,inventorySha256:POLICY.inventorySha256}))fail('Local baseline identity differs');
  if(ledger.startedAt!==POLICY.startedAt||ledger.decisionDeadline!==POLICY.decisionDeadline)fail('Local review start/deadline changed');
  const started=at(ledger.startedAt,'start'),deadline=at(ledger.decisionDeadline,'deadline');
  if(!Number.isFinite(now)||started>now||at(bank.releasedAt,'candidate creation')>now)fail('Future work/candidate chronology');
  if(!['running','closed'].includes(ledger.status))fail('Unknown ledger status');
  const closed=ledger.closedAt===null?null:at(ledger.closedAt,'closure');
  if(ledger.status==='closed'?(closed===null||closed<started||closed>deadline||closed>now):closed!==null)fail('Invalid ledger closure');
  if(at(bank.releasedAt,'candidate creation')>deadline||closed!==null&&at(bank.releasedAt,'candidate creation')>closed)fail('Candidate creation exceeds the decision window');
  exactBytes(candidateRaw,ledger.candidateSha256,'Candidate');
  if(!sameIds(ledger.changedQuestionIds,transition.changedQuestionIds)||!sameIds(ledger.changedOptionIds,transition.changedOptionIds))fail('Actual changed IDs differ from ledger');
  unique(ledger.corrections.map(c=>c.questionId),'ledger question IDs');unique(ledger.corrections.map(c=>c.correctionId),'correction IDs');unique(ledger.corrections.map(c=>c.issueId),'issue IDs');
  if(!sameIds(ledger.corrections.map(c=>c.questionId),[...scope.keys()]))fail('Ledger must register exactly the 372 audited defects');
  const cache=new Map(),counts={registered:372,accepted:0,rejected:0,pending:0,newRegular:0,publishedRevisedRegular:0};
  for(const c of ledger.corrections){
    keys(c,['correctionId','issueId','questionId','issueTypes','defect','targetPaths','authorId',...(Object.hasOwn(c,'coauthorIds')?['coauthorIds']:[]),'priorAcceptedRef','attemptCount','revision','decision','cycles'],'correction');
    const before=baseline.questions.find(q=>q.questionId===c.questionId),after=bank.questions.find(q=>q.questionId===c.questionId),issue=scope.get(c.questionId),prior=predecessors?.get(c.questionId);
    for(const field of ['correctionId','issueId','defect','authorId'])text(c[field],field);
    if(c.coauthorIds!==undefined){unique(c.coauthorIds,'coauthor IDs');for(const author of c.coauthorIds){text(author,'coauthor');if(author===c.authorId)fail('Primary author duplicated as coauthor');}}
    if(!prior||!equal(c.priorAcceptedRef,prior.reference))fail('Missing or changed exact accepted predecessor: '+c.questionId);
    if(!sameIds(c.issueTypes,issue.issueTypes)||!sameIds(c.targetPaths,editorialChangedPaths(baseline,bank,c.questionId)))fail('Defect/target paths differ from audit or actual changes: '+c.questionId);
    if(!['accepted','rejected','pending'].includes(c.decision)||!Array.isArray(c.cycles)||c.cycles.length<1||c.cycles.length>3||c.attemptCount!==c.cycles.length||c.revision!==before.revision+c.attemptCount||after.revision!==c.revision)fail('Invalid decision/started cycle/revision count: '+c.questionId);
    if(ledger.status==='closed'&&c.decision==='pending')fail('Closed local ledger has pending review');
    const exposed=new Set([c.authorId,...(c.coauthorIds??[]),...prior.keyExposedReviewerIds]);
    let previous=editorialContent(baseline,before),lastEnd=started;
    for(const [index,cycle]of c.cycles.entries()){
      keys(cycle,['cycle','revision','startedAt','completedAt','outcome','contentSha256','blindPackageSha256','reviewPackagePath','reviewPackageSha256','componentStates','gates'],'cycle');
      if(cycle.cycle!==index+1||cycle.revision!==before.revision+index+1||!['accepted','rejected','revise','running'].includes(cycle.outcome)||index<c.cycles.length-1&&cycle.outcome!=='revise')fail('Cycle numbering/revisions/outcomes cannot reset');
      const start=at(cycle.startedAt,'cycle start'),end=cycle.completedAt===null?null:at(cycle.completedAt,'cycle completion');
      if(cycle.outcome==='running'?(end!==null||index!==c.cycles.length-1||c.decision!=='pending'||ledger.status!=='running'):end===null)fail('Invalid cycle completion or running status');
      if(start<lastEnd||start>deadline||start>now||end!==null&&(end<start||end>deadline||end>now||closed!==null&&end>closed))fail('Cycle exceeds real start/deadline/current time');
      const snapshot=packageFor(ledger,c,cycle,read,cache),q=snapshot.questions[0];
      if(!equal(protectedQuestion(before,issue.repetition==='confirmed'),protectedQuestion(q,issue.repetition==='confirmed')))fail('Frozen cycle changes protected question content');
      validateLawIdentityNotes(before,q);
      for(const option of snapshot.options){
        const old=previous.options.find(o=>o.optionId===option.optionId),base=baseline.options.find(o=>o.optionId===option.optionId);
        if(!old||!equal(protectedOption(base,issue.repetition==='confirmed'),protectedOption(option,issue.repetition==='confirmed'))||option.revision!==old.revision+(changedWithoutRevision(old,option)?1:0)||q.links.find(l=>l.optionId===option.optionId).optionRevision!==option.revision)fail('Option component revision/content changed outside its exact cycle');
      }
      keys(cycle.gates,EDITORIAL_GATES,'cycle gates');
      if(end===null&&Object.values(cycle.gates).some(g=>g.result!=='not_run'))fail('Running cycle cannot claim completed gates without a completed cycle');
      for(const name of EDITORIAL_GATES){
        const gate=cycle.gates[name],evidence=gateEvidence(c,cycle,name,gate,read,exposed,snapshot);
        if(name==='blindSolve'&&gate.result==='pass'&&!sameIds(evidence.details.selectedOptionIds,q.links.filter(l=>l.role==='correct').map(l=>l.optionId)))fail('Frozen blind answer differs from preserved key');
        if(name==='sourceCheck'&&evidence){
          for(const sourceId of q.sourceRefs){const source=baseline.sources.find(s=>s.id===sourceId),found=evidence.details.sources.find(s=>s.sourceId===sourceId);if(!found||['url','version','location'].some(key=>source[key]!==found[key])||!nonempty(found.finding))fail('Source evidence is missing its exact source identity and finding');}
        }
      }
      if(cycle.outcome==='accepted'&&EDITORIAL_GATES.some(name=>cycle.gates[name].result!=='pass'))fail('Accepted cycle needs all five actual gates');
      if(cycle.outcome==='revise'&&EDITORIAL_GATES.every(name=>cycle.gates[name].result==='pass'))fail('Revise cycle needs an unresolved gate');
      for(const gate of Object.values(cycle.gates))if(gate.result!=='not_run')exposed.add(gate.reviewerId);
      previous=editorialContent(snapshot,q);if(end!==null)lastEnd=end;
    }
    const last=c.cycles.at(-1);
    if(!equal(previous,editorialContent(bank,after)))fail('Candidate differs from the final frozen package: '+c.questionId);
    if(c.decision==='pending'?!['running','revise'].includes(last.outcome):last.outcome!==c.decision)fail('Decision differs from final cycle');
    counts[c.decision]++;
  }
  validateBankForPublication(bank);validateExplanationAuthoring(bank,baseline);
  const reviewComplete=ledger.status==='closed'&&counts.accepted===372;
  const blockers=[];
  if(!reviewComplete)blockers.push('All 372 corrections require closed accepted decisions on their exact final five-gate revision');
  if(now>deadline&&ledger.status!=='closed')blockers.push('Review deadline elapsed with unclosed decisions; remaining reviews cannot be started or backdated');
  return {ok:true,kind:'local_written_explanation_candidate_check',scopeId:POLICY.id,candidateSha256:practicalWrittenHash(candidateRaw),counts,reviewComplete,blockers,...transition,...noAuthority(),historicalChecks:'not_run',currentReleaseChecks:'not_run'};
}

function localFiles(ledgerPath,candidatePath){
  const directory=path.dirname(path.resolve(ledgerPath)),candidate=path.resolve(candidatePath);
  if(candidate!==path.join(directory,'bank.json')||path.basename(ledgerPath)!=='ledger.json')fail('Use a separate local directory containing ledger.json and bank.json');
  if(directory===ROOT||[path.join(ROOT,'data'),path.join(ROOT,'docs','corrections')].some(protectedPath=>directory===protectedPath||directory.startsWith(protectedPath+path.sep)))fail('Local candidate may not alias active/immutable bank or historical editorial locations');
  const reads=new Map(),read=relative=>{const raw=readPracticalWrittenFile(directory,relative);if(reads.has(relative)&&!raw.equals(reads.get(relative)))fail('Review input changed within invocation: '+relative);reads.set(relative,raw);return raw;};
  return {read,reads,directory,candidateRaw:read('bank.json'),ledgerRaw:read('ledger.json')};
}

/** Inspection is intentionally narrower than integration; its output labels unrun history gates. */
export function inspectWrittenExplanationFiles({root=ROOT,ledgerPath,candidatePath}){
  const files=localFiles(ledgerPath,candidatePath),inventoryRaw=readPracticalWrittenFile(root,POLICY.inventoryPath),baselineRaw=readPracticalWrittenFile(root,`data/releases/${POLICY.baselineVersion}/bank.json`),manifestRaw=readPracticalWrittenFile(root,'data/manifest.json');
  const scope=writtenExplanationScope(inventoryRaw),predecessors=readWrittenExplanationPredecessors(root,JSON.parse(baselineRaw),scope);
  const result=validateWrittenExplanationCandidate({baselineRaw,manifestRaw,inventoryRaw,candidateRaw:files.candidateRaw,ledger:JSON.parse(files.ledgerRaw),read:files.read,predecessors});
  for(const relative of files.reads.keys())files.read(relative);
  return result;
}

/** Calls the ordinary current and historical gates as written, with actual time and no candidate input override. */
export async function validateWrittenExplanationFiles({root=ROOT,ledgerPath,candidatePath}){
  const files=localFiles(ledgerPath,candidatePath);
  const runtime=runtimeIdentity(),before=await sourceInventory(root);
  const active=await readBankInput(root);
  exactBytes(Buffer.from(active.raw),POLICY.baselineSha256,'Validated current baseline');
  const {withCurrentReleaseAuthority}=await import('./current-release-authority.mjs');
  const {withBankParsingSession}=await import('./prepublication-quarantine.mjs');
  const {loadRoundContext,validateRoundLedgers,validateEditorialLedgers,validateReleaseLedger}=await import('./validate-round.mjs');
  await withCurrentReleaseAuthority({root},()=>withBankParsingSession(root,async()=>{
    const {ledgers,...context}=await loadRoundContext(root,null,{release:true});
    for(const [name,run]of [
      ['historical rounds',()=>validateRoundLedgers(ledgers,{...context,now:Date.now()})],
      ['historical editorials',()=>validateEditorialLedgers(context.editorials,{...context,ledgers,now:Date.now()})],
      ['current release',()=>validateReleaseLedger(ledgers,{...context,now:Date.now()})]
    ]){const checked=run();if(!checked.ok)fail(name+': '+checked.errors.join('; '));}
  }));
  const result=inspectWrittenExplanationFiles({root,ledgerPath,candidatePath});
  for(const relative of files.reads.keys())files.read(relative);
  exactBytes(readPracticalWrittenFile(root,'data/manifest.json'),POLICY.manifestSha256,'Final active manifest');
  exactBytes(readPracticalWrittenFile(root,`data/releases/${POLICY.baselineVersion}/bank.json`),POLICY.baselineSha256,'Final active baseline');
  assertSameSnapshot(before,await sourceInventory(root),runtime,runtimeIdentity());
  return {...result,kind:'local_written_explanation_integrated_check',historicalChecks:'pass',currentReleaseChecks:'pass',...noAuthority()};
}

export async function main(args=process.argv.slice(2)){
  const [command,ledgerPath,candidatePath,...extra]=args;
  if(!['inspect','validate'].includes(command)||!ledgerPath||!candidatePath||extra.length)fail('Usage: node scripts/written-explanation-corrections.mjs <inspect|validate> /local/ledger.json /local/bank.json');
  const result=command==='inspect'?inspectWrittenExplanationFiles({ledgerPath,candidatePath}):await validateWrittenExplanationFiles({ledgerPath,candidatePath});
  console.log(JSON.stringify({status:result.reviewComplete?'LOCAL_REVIEW_COMPLETE':'LOCAL_REVIEW_INCOMPLETE',...result},null,2));
  if(!result.reviewComplete)process.exitCode=1;
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error(JSON.stringify({status:'FAIL',errors:[error.message],...noAuthority()}));process.exitCode=1;});
