/** One explicitly approved conversion. Pure review/transition checks confer no publication authority. */
import {readFileSync,lstatSync,existsSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {validateBankForPublication,validateExplanationAuthoring} from '../src/domain.js';
import {validateCampaignJsonSchema} from './campaign-validation-primitives.mjs';
import {PRACTICAL_WRITTEN_HISTORY,PRACTICAL_WRITTEN_BASELINE_MANIFEST_RAW,PRACTICAL_WRITTEN_P1_REVIEWS,PRACTICAL_WRITTEN_P2_SCOPE} from './practical-written-baseline.mjs';

export const PRACTICAL_WRITTEN=Object.freeze({
  id:'practical-written-001',kind:'practical_to_written_registration',
  ledgerPath:'docs/conversions/practical-written-001.json',
  baselineCommit:'4536277093f80273dd9f5799b32990a74d260466',
  baselineVersion:'2026.10.14-editorial.5',baselineSha256:'42c3eed6dea79a03f78226b1887b93c71f11f0d3fb6fa63b5ba3c298a823edf2',
  baselineManifestSha256:'5d16fd0e2ff104f3a57b1a8b6ff3b431599475cdb0f1589125c065f11836596f',
  bankVersion:'2026.10.22-practical-written.1',approvedDay:'2026-10-22',
  authorizedAt:'2026-10-22T11:09:39.404937+00:00',
  decisionDeadline:'2026-10-22T14:16:00.872564+00:00'
});
export const P1_GROUPS=Object.freeze(['G01','G02','G03','G04','G05','G06','G07','G09','G10','G11','G12','G14','G15','G17','G18','G19']);
export const P2_GROUPS=Object.freeze(['G08','G13','G16','G20','G21','G22','G24','G25','G26','G27','G28','G29','G30','G31','G32','G33','G37','G40']);
// Exact closure independently compared with the original P1/P2 reviews and all
// 53 public inputs. An edited ledger cannot authorize a different registration.
export const PRACTICAL_WRITTEN_LEDGER_SHA256='06d1c11c9fa834709ae20c332402c81cc01f68d8151460e6d5333ea6729ff3b5';
const P1_ONCE=new Set(['G02','G03','G05','G11']);
const GATES=['blindSolve','sourceCheck','ambiguityCheck','authoringAccessibility','structuralCheck'];
const registrations=new WeakMap();
const hex=/^[a-f0-9]{64}$/,id=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const fail=message=>{throw Error('Practical-written registration: '+message);};
export const practicalWrittenHash=raw=>createHash('sha256').update(raw).digest('hex');
export function canonicalValue(value){
  if(Array.isArray(value))return value.map(canonicalValue);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonicalValue(value[k])]));
  return value;
}
export const canonicalHash=value=>practicalWrittenHash(JSON.stringify(canonicalValue(value)));
export const questionProjection=question=>Object.fromEntries(Object.entries(question).filter(([key])=>!['verificationStatus','reviewNote'].includes(key)));
function keys(value,expected,label){if(!value||typeof value!=='object'||Array.isArray(value)||!equal(Object.keys(value).sort(),[...expected].sort()))fail('Invalid '+label+' fields');}
function text(value,label){if(typeof value!=='string'||!value.trim()||/\/(?:workspace|root|tmp)\//.test(value))fail('Invalid public '+label);}
function time(value,label){const result=Date.parse(value);if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT/.test(value)||!Number.isFinite(result))fail('Invalid '+label+' time');return result;}
function digest(value,label){if(!hex.test(value)||/^0+$/.test(value))fail('Invalid '+label+' hash');}
function unique(values,label){if(!Array.isArray(values)||new Set(values).size!==values.length)fail('Duplicate or invalid '+label);}
export function readPracticalWrittenFile(root,relative){
  if(typeof relative!=='string'||path.isAbsolute(relative)||relative.includes('\\')||relative.split('/').some(p=>!p||p==='.'||p==='..'))fail('Unsafe relative path');
  let current=path.resolve(root);for(let p=current;;p=path.dirname(p)){if(lstatSync(p).isSymbolicLink())fail('Symlink root');if(p===path.dirname(p))break;}
  const parts=relative.split('/');for(const [i,part]of parts.entries()){current=path.join(current,part);const stat=lstatSync(current);if(stat.isSymbolicLink()||(i===parts.length-1?!stat.isFile():!stat.isDirectory()))fail('Nonregular evidence file');}
  return readFileSync(current);
}
export function hasPracticalWrittenRegistration(root){return existsSync(path.join(root,PRACTICAL_WRITTEN.ledgerPath));}
export function practicalWrittenBaselineManifest(){return JSON.parse(PRACTICAL_WRITTEN_BASELINE_MANIFEST_RAW);}
export function assertPracticalWrittenHistory(root){
  for(const entry of PRACTICAL_WRITTEN_HISTORY){const raw=readPracticalWrittenFile(root,entry.path);if(raw.length!==entry.bytes||practicalWrittenHash(raw)!==entry.sha256)fail('Immutable baseline history changed: '+entry.path);}
  const allowed=new Set(PRACTICAL_WRITTEN_HISTORY.filter(e=>e.path.startsWith('data/releases/')).map(e=>e.path.split('/')[2]));allowed.add(PRACTICAL_WRITTEN.bankVersion);
  for(const version of readdirSync(path.join(root,'data/releases')))if(!allowed.has(version))fail('Unapproved additional immutable bank: '+version);
}
export function assertPracticalWrittenHistorySnapshot(files){
  for(const entry of PRACTICAL_WRITTEN_HISTORY){const value=files.get(entry.path),raw=value?.raw??value;if(!raw||raw.length!==entry.bytes||practicalWrittenHash(raw)!==entry.sha256)fail('Archive changed immutable baseline history: '+entry.path);}
}
/** Identity only. Full history and candidate semantics are mandatory separate checks. */
export function readPracticalWrittenBoundary(root,now=Date.now()){
  const actual=Date.now();if(!Number.isFinite(now)||now>actual||actual<Date.parse(PRACTICAL_WRITTEN.approvedDay+'T00:00:00Z'))fail('Actual current time is outside approval');
  const ledgerRaw=readPracticalWrittenFile(root,PRACTICAL_WRITTEN.ledgerPath),ledger=JSON.parse(ledgerRaw);
  if(!hex.test(PRACTICAL_WRITTEN_LEDGER_SHA256??'')||practicalWrittenHash(ledgerRaw)!==PRACTICAL_WRITTEN_LEDGER_SHA256)fail('Closed registration is pending exact independent pin or has changed');
  if(ledger.kind!==PRACTICAL_WRITTEN.kind||ledger.registrationId!==PRACTICAL_WRITTEN.id||ledger.schemaVersion!==1||ledger.status!=='closed')fail('Exact closed conversion identity required');
  const expected={sourceCommit:PRACTICAL_WRITTEN.baselineCommit,bankVersion:PRACTICAL_WRITTEN.baselineVersion,bankSha256:PRACTICAL_WRITTEN.baselineSha256,manifestSha256:PRACTICAL_WRITTEN.baselineManifestSha256};
  if(!equal(ledger.baseline,expected)||ledger.result?.bankVersion!==PRACTICAL_WRITTEN.bankVersion)fail('Approved baseline/result identity differs');
  const approval=time(ledger.authorization?.authorizedAt,'approval'),registered=time(ledger.registeredAt,'registration');
  if(ledger.authorization?.authorizedAt!==PRACTICAL_WRITTEN.authorizedAt||approval>registered||registered>now||registered>actual||ledger.authorization?.scope!=='p1_registration_p2_review_and_public_release'||ledger.authorization?.practicalChangesAllowed!==false)fail('Approval scope or actual chronology differs');
  const state=JSON.parse(readPracticalWrittenFile(root,'data/publication-state.json'));
  if(!equal(state,{finalized:false}))fail('Persistent freeze blocks conversion');
  const manifestRaw=readPracticalWrittenFile(root,'data/manifest.json'),manifest=JSON.parse(manifestRaw),mhash=practicalWrittenHash(manifestRaw);
  const baselineRaw=readPracticalWrittenFile(root,`data/releases/${PRACTICAL_WRITTEN.baselineVersion}/bank.json`);
  if(practicalWrittenHash(baselineRaw)!==PRACTICAL_WRITTEN.baselineSha256)fail('Baseline bank bytes changed');
  const staged=mhash===PRACTICAL_WRITTEN.baselineManifestSha256;
  if(!staged&&(mhash!==ledger.result.manifestSha256||manifest.bankVersion!==PRACTICAL_WRITTEN.bankVersion||manifest.sha256!==ledger.result.bankSha256))fail('Active manifest is outside this conversion');
  if(manifest.finalRelease!==false||manifest.file!==`releases/${manifest.bankVersion}/bank.json`)fail('Invalid active manifest or freeze');
  const bankRaw=readPracticalWrittenFile(root,`data/${manifest.file}`);
  if(practicalWrittenHash(bankRaw)!==manifest.sha256)fail('Active bank hash mismatch');
  return {ledger,ledgerRaw,ledgerSha256:practicalWrittenHash(ledgerRaw),manifest,manifestRaw,bankRaw,baselineRaw,staged};
}

export function validatePracticalWrittenLedger(ledger,{read,baseline,now=Date.now()}={}){
  keys(ledger,['schemaVersion','kind','registrationId','authorization','baseline','status','registeredAt','batches','candidates','result','publication'],'ledger');
  const registrationSchema=JSON.parse(readFileSync(new URL('../docs/conversions/practical-written-registration.schema.json',import.meta.url)));
  const schemaErrors=validateCampaignJsonSchema(ledger,registrationSchema);if(schemaErrors.length)fail('Schema: '+schemaErrors.join('; '));
  if(ledger.schemaVersion!==1||ledger.kind!==PRACTICAL_WRITTEN.kind||ledger.registrationId!==PRACTICAL_WRITTEN.id||ledger.status!=='closed'||typeof read!=='function')fail('Invalid typed closed ledger');
  keys(ledger.authorization,['authorizedAt','scope','practicalChangesAllowed'],'authorization');
  if(ledger.authorization.scope!=='p1_registration_p2_review_and_public_release'||ledger.authorization.practicalChangesAllowed!==false)fail('Invalid authorization scope');
  const approved=time(ledger.authorization.authorizedAt,'approval'),registered=time(ledger.registeredAt,'registration');
  if(ledger.authorization.authorizedAt!==PRACTICAL_WRITTEN.authorizedAt||registered<approved||registered>now)fail('Invalid registration chronology');
  if(!equal(ledger.baseline,{sourceCommit:PRACTICAL_WRITTEN.baselineCommit,bankVersion:PRACTICAL_WRITTEN.baselineVersion,bankSha256:PRACTICAL_WRITTEN.baselineSha256,manifestSha256:PRACTICAL_WRITTEN.baselineManifestSha256}))fail('Invalid baseline');
  keys(ledger.result,['bankVersion','bankSha256','manifestSha256','acceptedQuestionIds'],'result');
  if(ledger.result.bankVersion!==PRACTICAL_WRITTEN.bankVersion)fail('Invalid target version');
  digest(ledger.result.bankSha256,'result bank');digest(ledger.result.manifestSha256,'result manifest');unique(ledger.result.acceptedQuestionIds,'accepted IDs');
  if(!equal(ledger.publication,{status:'not_attempted',commit:null,verifiedAt:null,url:null,newlyPublicRegular:0}))fail('Original registration cannot claim later publication');
  if(!Array.isArray(ledger.candidates)||ledger.candidates.length<16||ledger.candidates.length>34||!Array.isArray(ledger.batches)||!ledger.batches.length)fail('Invalid candidate/batch limits');
  unique(ledger.candidates.map(c=>c.candidateId),'candidate IDs');unique(ledger.candidates.map(c=>c.groupId),'group IDs');unique(ledger.batches.map(b=>b.batchId),'batch IDs');
  const originals=new Map(baseline.questions.map(q=>[q.questionId,q])),batchFor=new Map(),accepted=new Map(),snapshots=new Map();
  for(const b of ledger.batches){
    keys(b,['batchId','origin','startedAt','decisionDeadline','closedAt','candidateIds'],'batch');text(b.batchId,'batch ID');unique(b.candidateIds,'batch membership');
    const start=time(b.startedAt,'batch start'),deadline=time(b.decisionDeadline,'batch deadline'),closed=time(b.closedAt,'batch closure');
    if(deadline<=start||deadline>start+4*3600000||closed<start||closed>deadline||closed>registered)fail('Batch chronology or maximum four hours');
    if(b.origin==='p1_reused'){
      if(b.batchId!=='p1-reuse'||b.candidateIds.length!==16||start!==Date.parse('2026-10-21T07:02:30.820847+00:00')||deadline!==Date.parse('2026-10-21T09:02:30.820847+00:00')||closed!==Date.parse('2026-10-21T07:33:23.121095+00:00'))fail('P1 original chronology/membership changed');
    }else if(b.origin!=='p2_reviewed'||b.candidateIds.length>9||start<approved||deadline>Date.parse(PRACTICAL_WRITTEN.decisionDeadline))fail('P2 batch exceeds approved scope/deadline');
    const bySubject={};for(const candidateId of b.candidateIds){const c=ledger.candidates.find(x=>x.candidateId===candidateId);if(!c||c.origin!==b.origin||batchFor.has(candidateId))fail('Missing/ambiguous batch member');batchFor.set(candidateId,b);bySubject[c.subjectId]=(bySubject[c.subjectId]||0)+1;}
    if(Object.values(bySubject).some(n=>n>10))fail('Subject batch cap exceeded');
  }
  for(const c of ledger.candidates){
    keys(c,['candidateId','groupId','origin','subjectId','questionId','templateId','learningGoalId','authorId','originalPracticalRefs','priorWrittenIds','cycles','decision','reason',...(Object.hasOwn(c,'sourceRefresh')?['sourceRefresh']:[])],'candidate');
    const p1=c.origin==='p1_reused',groups=p1?P1_GROUPS:P2_GROUPS,b=batchFor.get(c.candidateId),expectedId=`pw${p1?'21':'22'}-${String(c.groupId).toLowerCase()}-w01`;
    if(!b||(!p1&&c.origin!=='p2_reviewed')||!groups.includes(c.groupId)||c.candidateId!==expectedId||c.questionId!==expectedId||!['s1','s2','s3','s4','s5'].includes(c.subjectId)||!id.test(c.templateId)||!id.test(c.learningGoalId)||!['accepted','rejected'].includes(c.decision))fail('Candidate outside approved identity/scope');
    if(p1){const binding={candidateId:c.candidateId,groupId:c.groupId,cycles:c.cycles,...(Object.hasOwn(c,'sourceRefresh')?{sourceRefresh:c.sourceRefresh}:{})};if(canonicalHash(binding)!==PRACTICAL_WRITTEN_P1_REVIEWS.find(p=>p.candidateId===c.candidateId)?.sha256)fail('Original P1 review projection changed');}
    text(c.authorId,'author ID');text(c.reason,'decision reason');unique(c.priorWrittenIds,'prior written IDs');
    for(const prior of c.priorWrittenIds)if(originals.get(prior)?.type!=='written')fail('Unknown prior written comparison');
    if(!Array.isArray(c.originalPracticalRefs)||!c.originalPracticalRefs.length)fail('Missing practical provenance');
    unique(c.originalPracticalRefs.map(r=>r.questionId),'practical provenance');
    for(const r of c.originalPracticalRefs){keys(r,['questionId','revision','sha256'],'practical reference');const q=originals.get(r.questionId);if(q?.type!=='practical'||q.revision!==r.revision||canonicalHash(q)!==r.sha256)fail('Practical provenance does not match immutable baseline');}
    if(!p1){const scope=PRACTICAL_WRITTEN_P2_SCOPE[c.groupId];if(!scope||c.subjectId!==scope.subjectId||c.templateId!==`pw22-template-${c.groupId.toLowerCase()}`||c.learningGoalId!==`pw22-goal-${c.groupId.toLowerCase()}`||!c.originalPracticalRefs.some(r=>r.questionId===scope.representativeId)||c.originalPracticalRefs.some(r=>!scope.originalIds.includes(r.questionId)))fail('P2 group must retain its selected representative and may not introduce held originals');}
    if(!Array.isArray(c.cycles)||!c.cycles.length||c.cycles.length>3||p1&&c.cycles.length!==(P1_ONCE.has(c.groupId)?1:2)||p1&&c.decision!=='accepted')fail('Started review count/history changed');
    const exposed=new Set([c.authorId]);let lastEnd=Date.parse(b.startedAt),previousRevision=0;
    for(const [index,cycle]of c.cycles.entries()){
      keys(cycle,['cycle','revision','startedAt','completedAt','outcome','input','originArtifacts','blind','gates'],'cycle');
      const start=time(cycle.startedAt,'review start'),end=time(cycle.completedAt,'review completion');
      if(cycle.cycle!==index+1||cycle.revision!==previousRevision+1||start<lastEnd||end<start||end>Date.parse(b.closedAt)||!['accepted','revise','rejected'].includes(cycle.outcome)||index<c.cycles.length-1&&cycle.outcome!=='revise')fail('Review count/revision/chronology/outcome mismatch');
      previousRevision=cycle.revision;lastEnd=end;
      keys(cycle.input,['path','sha256'],'review input reference');digest(cycle.input.sha256,'review input');
      if(cycle.input.path!==`docs/conversions/evidence/${PRACTICAL_WRITTEN.id}/${c.candidateId}-cycle-${cycle.cycle}.json`)fail('Unexpected review evidence path');
      const raw=read(cycle.input.path);if(practicalWrittenHash(raw)!==cycle.input.sha256)fail('Review input bytes mismatch');
      const p=JSON.parse(raw);keys(p,['schemaVersion','kind','registrationId','candidateId','cycle','question','options','sources'],'review input');
      if(p.schemaVersion!==1||p.kind!=='practical_written_review_input'||p.registrationId!==PRACTICAL_WRITTEN.id||p.candidateId!==c.candidateId||p.cycle!==cycle.cycle||p.question.questionId!==c.questionId||p.question.revision!==cycle.revision||p.question.type!=='written'||p.question.subjectId!==c.subjectId||p.question.templateId!==c.templateId||p.question.learningGoalId!==c.learningGoalId||p.question.testOnly!==false||!['candidate','reviewed'].includes(p.question.verificationStatus))fail('Review snapshot candidate binding mismatch');
      unique(p.options.map(o=>o.optionId),'snapshot options');unique(p.sources.map(s=>s.id),'snapshot sources');
      if(!equal([...p.question.links.map(l=>l.optionId)].sort(),p.options.map(o=>o.optionId).sort())||!equal([...p.question.sourceRefs].sort(),p.sources.map(s=>s.id).sort()))fail('Incomplete or extra reviewed options/sources');
      if(!Array.isArray(cycle.originArtifacts)||!cycle.originArtifacts.length)fail('Missing original evidence provenance');
      for(const a of cycle.originArtifacts){keys(a,['label','sha256'],'origin artifact');text(a.label,'origin artifact label');digest(a.sha256,'origin artifact');}
      keys(cycle.blind,['reviewerId','keyExposedBeforeSolve','inputSha256','answerSha256','selectedOptionId'],'blind evidence');text(cycle.blind.reviewerId,'blind reviewer');
      if(cycle.blind.keyExposedBeforeSolve!==false||exposed.has(cycle.blind.reviewerId))fail('Blind reviewer is not independent/key-unexposed');
      digest(cycle.blind.inputSha256,'blind input');digest(cycle.blind.answerSha256,'frozen blind answer');
      keys(cycle.gates,GATES,'review gates');
      for(const gate of GATES){const g=cycle.gates[gate];keys(g,['result','reviewerId','summary'],'gate');if(!['pass','fail','not_run'].includes(g.result))fail('Invalid gate result');text(g.reviewerId,'gate reviewer');text(g.summary,'gate summary');if(g.result!=='not_run'&&['sourceCheck','ambiguityCheck','authoringAccessibility'].includes(gate)&&g.reviewerId===c.authorId)fail('Source and semantic review must be independent from the author');}
      if(cycle.gates.blindSolve.reviewerId!==cycle.blind.reviewerId)fail('Blind gate reviewer mismatch');
      const correct=p.question.links.filter(l=>l.role==='correct').map(l=>l.optionId);
      if(cycle.gates.blindSolve.result==='pass'&&(correct.length!==1||correct[0]!==cycle.blind.selectedOptionId))fail('Blind answer/key mismatch');
      if(cycle.outcome==='accepted'&&GATES.some(g=>cycle.gates[g].result!=='pass'))fail('Accepted review is not all-gates-pass');
      for(const g of Object.values(cycle.gates))if(g.result!=='not_run')exposed.add(g.reviewerId);
      snapshots.set(c.candidateId,p);
    }
    if(p1&&P1_ONCE.has(c.groupId)){
      const s=c.sourceRefresh;keys(s,['input','reviewerId','completedAt','priorQuestionAndOptionsUnchanged','originArtifactSha256','result','summary'],'source refresh');keys(s.input,['path','sha256'],'source refresh input');
      if(s.input.path!==`docs/conversions/evidence/${PRACTICAL_WRITTEN.id}/${c.candidateId}-cycle-1-source-refresh.json`||s.priorQuestionAndOptionsUnchanged!==true||s.result!=='pass'||s.reviewerId===c.authorId||time(s.completedAt,'source refresh')<time(c.cycles[0].startedAt,'first review')||Date.parse(s.completedAt)>Date.parse(b.closedAt))fail('Invalid unchanged P1 source refresh');
      text(s.reviewerId,'source reviewer');text(s.summary,'source refresh summary');digest(s.originArtifactSha256,'original source refresh');digest(s.input.sha256,'source refresh input');
      const raw=read(s.input.path);if(practicalWrittenHash(raw)!==s.input.sha256)fail('Source refresh bytes mismatch');const p=JSON.parse(raw),prior=snapshots.get(c.candidateId);
      keys(p,['schemaVersion','kind','registrationId','candidateId','cycle','question','options','sources'],'source refresh snapshot');
      if(p.schemaVersion!==1||p.kind!=='practical_written_review_input'||p.registrationId!==PRACTICAL_WRITTEN.id||p.candidateId!==c.candidateId||p.cycle!==1||!equal(p.question,prior.question)||!equal(p.options,prior.options)||!equal(p.sources.map(x=>x.id).sort(),[...p.question.sourceRefs].sort()))fail('Source refresh changes question/options or source membership');
      snapshots.set(c.candidateId,p);
    }else if(Object.hasOwn(c,'sourceRefresh'))fail('Source refresh is limited to the exact four unchanged P1 reviews');
    if(c.cycles.at(-1).outcome!==c.decision)fail('Final decision differs from terminal review');
    if(c.decision==='accepted')accepted.set(c.questionId,c);
  }
  if(P1_GROUPS.some(g=>!ledger.candidates.some(c=>c.origin==='p1_reused'&&c.groupId===g))||ledger.candidates.filter(c=>c.origin==='p2_reviewed').length>18||batchFor.size!==ledger.candidates.length)fail('Required P1 or bounded P2 membership mismatch');
  if(!equal([...accepted.keys()].sort(),[...ledger.result.acceptedQuestionIds].sort()))fail('Accepted list differs from final decisions');
  return {accepted,snapshots};
}

export function validatePracticalWrittenTransition(ledger,{baseline,bank,read,now=Date.now()}={}){
  const review=validatePracticalWrittenLedger(ledger,{baseline,read,now});validateBankForPublication(bank);validateExplanationAuthoring(bank,baseline);
  if(baseline.questions.length!==971||baseline.questions.filter(q=>q.type==='practical').length!==84||bank.bankVersion!==PRACTICAL_WRITTEN.bankVersion||time(bank.releasedAt,'release')<time(ledger.registeredAt,'registration')||Date.parse(bank.releasedAt)>now)fail('Invalid baseline count, target version or release chronology');
  for(const key of Object.keys(baseline).filter(k=>!['bankVersion','releasedAt','changeSummary','questions','options','sources','roundId','editorialRoundId','contentCounts'].includes(k)))if(!equal(bank[key],baseline[key]))fail('Existing bank metadata changed: '+key);
  for(const key of Object.keys(bank))if(!Object.hasOwn(baseline,key)&&key!=='registrationId')fail('Unreviewed bank metadata: '+key);
  if(bank.registrationId!==PRACTICAL_WRITTEN.id||Object.hasOwn(bank,'roundId')||Object.hasOwn(bank,'editorialRoundId'))fail('New bank must name only its typed registration owner');
  const contentCounts={testOnly:bank.questions.filter(q=>q.testOnly).length,regularWrittenBySubject:Object.fromEntries(['s1','s2','s3','s4','s5'].map(s=>[s,bank.questions.filter(q=>!q.testOnly&&q.type==='written'&&q.subjectId===s).length])),regularPractical:bank.questions.filter(q=>!q.testOnly&&q.type==='practical').length};
  if(!equal(bank.contentCounts,contentCounts))fail('Content counts differ from actual bank');
  for(const [kind,key]of [['questions','questionId'],['options','optionId'],['sources','id']])if(!equal(bank[kind].slice(0,baseline[kind].length),baseline[kind]))fail('Existing '+kind+' changed, removed or reordered');
  const added=bank.questions.slice(baseline.questions.length),newOptions=bank.options.slice(baseline.options.length),newSources=bank.sources.slice(baseline.sources.length),oldTemplates=new Set(baseline.questions.map(q=>q.templateId));
  if(!equal(added.map(q=>q.questionId).sort(),[...review.accepted.keys()].sort()))fail('Actual added questions differ from accepted allowlist');
  const expectedOptions=new Map(),expectedSources=new Map(),oldOptions=new Map(baseline.options.map(o=>[o.optionId,o])),oldSources=new Map(baseline.sources.map(s=>[s.id,s]));
  for(const q of added){const c=review.accepted.get(q.questionId),p=review.snapshots.get(c.candidateId);if(q.type!=='written'||q.verificationStatus!=='published'||q.testOnly!==false||!equal(questionProjection(q),questionProjection(p.question))||typeof q.reviewNote!=='string'||!q.reviewNote.includes(PRACTICAL_WRITTEN.ledgerPath)||!q.reviewNote.includes(c.candidateId)||oldTemplates.has(q.templateId))fail('Published question differs from accepted review: '+q.questionId);oldTemplates.add(q.templateId);
    for(const [values,existing,expected,key]of [[p.options,oldOptions,expectedOptions,'optionId'],[p.sources,oldSources,expectedSources,'id']])for(const value of values){const prior=existing.get(value[key])??expected.get(value[key]);if(prior&&!equal(prior,value))fail('Reviewed component identity collision');if(!existing.has(value[key]))expected.set(value[key],value);}
  }
  for(const [actual,expected,key]of [[newOptions,expectedOptions,'optionId'],[newSources,expectedSources,'id']])if(actual.length!==expected.size||actual.some(v=>!equal(v,expected.get(v[key]))))fail('Added components are not exactly the accepted reviewed union');
  return {ok:true,accepted:added.length,p1:added.filter(q=>q.questionId.startsWith('pw21-')).length,p2:added.filter(q=>q.questionId.startsWith('pw22-')).length,practicalPreserved:84,total:bank.questions.length};
}
export function loadPracticalWrittenRegistration(root,{bankRaw=null,manifestRaw=null,now=Date.now()}={}){
  const boundary=readPracticalWrittenBoundary(root,now);assertPracticalWrittenHistory(root);
  const listed=new Set(readPracticalWrittenFile(root,'PUBLICATION-MANIFEST.txt').toString().split(/\r?\n/).map(p=>p.trim()).filter(p=>p&&!p.startsWith('#')));
  if(!listed.has(PRACTICAL_WRITTEN.ledgerPath)||!listed.has('docs/conversions/practical-written-registration.schema.json'))fail('Registration or schema absent from public allowlist');
  const read=relative=>{if(!listed.has(relative))fail('Unlisted review dependency: '+relative);return readPracticalWrittenFile(root,relative);};
  const raw=bankRaw??(boundary.staged?readPracticalWrittenFile(root,`data/releases/${PRACTICAL_WRITTEN.bankVersion}/bank.json`):boundary.bankRaw);
  if(practicalWrittenHash(raw)!==boundary.ledger.result.bankSha256)fail('Target bank bytes differ from registration');
  const bank=JSON.parse(raw),baseline=JSON.parse(boundary.baselineRaw);
  const result=validatePracticalWrittenTransition(boundary.ledger,{baseline,bank,read,now});
  if(manifestRaw){const m=JSON.parse(manifestRaw);if(practicalWrittenHash(manifestRaw)!==boundary.ledger.result.manifestSha256||m.sha256!==practicalWrittenHash(raw)||m.bankVersion!==bank.bankVersion||m.releasedAt!==bank.releasedAt||m.changeSummary!==bank.changeSummary||m.finalRelease!==false||m.schemaVersion!==1||m.file!==`releases/${bank.bankVersion}/bank.json`)fail('Target manifest differs from registered bank');}
  const loaded={...boundary,bank,baseline,result};registrations.set(loaded,{root:path.resolve(root),ledgerSha256:boundary.ledgerSha256,ledgerRaw:Buffer.from(boundary.ledgerRaw)});return loaded;
}
export function refreshPracticalWrittenRegistration(value,{bankRaw,manifestRaw,now=Date.now()}={}){
  const entry=registrations.get(value);if(!entry)fail('Registration context must originate from exact public files');
  const fresh=loadPracticalWrittenRegistration(entry.root,{bankRaw,manifestRaw,now});if(fresh.ledgerSha256!==entry.ledgerSha256)fail('Registration changed after context load');return fresh;
}
/** Ownership only, including after a validated packaging scratch root is removed. */
export function resolvePracticalWrittenIdentity(value){
  const entry=registrations.get(value);if(!entry||practicalWrittenHash(value.ledgerRaw)!==entry.ledgerSha256||!equal(value.ledger,JSON.parse(entry.ledgerRaw)))fail('Untampered file-derived registration context required');
  return {ledger:JSON.parse(entry.ledgerRaw),ledgerPath:PRACTICAL_WRITTEN.ledgerPath,identity:{effectiveBankVersion:value.ledger.result.bankVersion,effectiveBankSha256:value.ledger.result.bankSha256}};
}
/** Archive identity only. Full snapshot, history and current-window checks remain mandatory. */
export function assertPracticalWrittenArchiveSource(source){
  keys(source,['kind','registrationId','deltaArtifactSha256','deltaManifestSha256','baseCommit','bankVersion','bankSha256','ledgerPath','ledgerSha256'],'conversion source release');
  if(source.kind!=='practical_written_registered_release'||source.registrationId!==PRACTICAL_WRITTEN.id||source.baseCommit!==PRACTICAL_WRITTEN.baselineCommit||source.bankVersion!==PRACTICAL_WRITTEN.bankVersion||source.ledgerPath!==PRACTICAL_WRITTEN.ledgerPath)fail('Invalid typed conversion release identity');
  for(const key of ['deltaArtifactSha256','deltaManifestSha256','bankSha256','ledgerSha256'])digest(source[key],key);
}
