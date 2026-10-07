import {validateEvidenceLossCampaign,assertEvidenceLossProvenance} from './evidence-loss-block.mjs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {validateBank, validateBankForPublication, validateExplanationAuthoring, FREEZE_AT} from '../src/domain.js';
import {historicalExplanationBaseline} from './explanation-authoring.mjs';
import {validatePublicationSynchronizations} from './publication-sync.mjs';

export const EDITORIAL_GATES = ['blindSolve', 'sourceCheck', 'ambiguityCheck', 'authoringAccessibility', 'structuralCheck'];
export const editorialHash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const meaningful = s => typeof s === 'string' && s.trim().length > 0;
const without = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const sorted = list => [...list].sort();
const sameIds = (a, b) => equal(sorted(a), sorted(b));
const safePath = p => meaningful(p) && !p.startsWith('/') && !p.includes('\\') && !p.split('/').some(x => !x || x === '.' || x === '..');
const choiceList = q => (q.parts || []).flatMap(p => p.choices || []);
const objectRevision = o => o.revision ?? 1;
export function editorialContent(bank, question) {
  const q = typeof question === 'string' ? bank.questions.find(q => q.questionId === question) : question;
  return {question: q, options: (q?.links || []).map(l => bank.options.find(o => o.optionId === l.optionId))};
}
export function editorialContentHash(bank, question) { return editorialHash(editorialContent(bank, question)); }
/** Key-, source-, rationale- and semantic-ID-free solving material. Choice order is not author order. */
export function editorialBlindPackage(bank, question) {
  const q = typeof question === 'string' ? bank.questions.find(q => q.questionId === question) : question;
  const reorder = (values, key) => [...values].sort((a,b) => editorialHash(`${q.questionId}:${q.revision}:${a[key]}`).localeCompare(editorialHash(`${q.questionId}:${q.revision}:${b[key]}`)));
  const packageData = {stem:q.stem, notes:q.notes, materials:(q.materials || []).filter(m => m.purpose === 'question').map(m => ({filename:m.filename, content:m.content, instruction:m.instruction}))};
  if (q.type === 'written') packageData.choices = reorder(q.links.map(l => bank.options.find(o => o.optionId === l.optionId)), 'optionId').map((o,i) => ({label:String.fromCharCode(65+i), text:o.content}));
  else packageData.parts = q.parts.map((p,i) => ({label:`P${i+1}`, prompt:p.prompt, kind:p.kind, ...(p.choices ? {choices:reorder(p.choices,'id').map((o,j) => ({label:String.fromCharCode(65+j), text:o.text}))} : {})}));
  return packageData;
}
/** Component content excludes only its revision number, so every actual edit advances once. */
export function editorialComponentStates(bank, question) {
  const q=typeof question==='string'?bank.questions.find(q=>q.questionId===question):question;
  return [...(q.links||[]).map(l=>{const o=bank.options.find(o=>o.optionId===l.optionId);return {kind:'written_option',id:o.optionId,revision:o.revision,contentSha256:editorialHash(without(o,['revision']))};}),...choiceList(q).map(c=>({kind:'practical_choice',id:c.id,revision:objectRevision(c),contentSha256:editorialHash(without(c,['revision']))}))].sort((a,b)=>`${a.kind}/${a.id}`.localeCompare(`${b.kind}/${b.id}`));
}
function checkedReviewPackage(e,c,cycle,reviewPackages,bad) {
  const expected=`docs/corrections/evidence/${e.correctionRoundId}-cycle-${cycle.cycle}.json`;
  if(cycle.reviewPackagePath!==expected){bad('review package path must identify this exact editorial cycle');return null;}
  const entry=reviewPackages instanceof Map?reviewPackages.get(expected):reviewPackages[expected];
  const raw=entry?.raw??entry;
  if(typeof raw!=='string'&&!Buffer.isBuffer(raw)){bad('missing immutable review package bytes');return null;}
  if(editorialHash(raw)!==cycle.reviewPackageSha256){bad('immutable review package hash mismatch');return null;}
  try {
    const p=JSON.parse(raw.toString());
    if(p.evidenceSchemaVersion!==1||p.purpose!=='immutable_editorial_review_input'||p.correctionRoundId!==e.correctionRoundId||p.cycle!==cycle.cycle||!Array.isArray(p.items)||!equal(sorted(Object.keys(p)),sorted(['evidenceSchemaVersion','purpose','correctionRoundId','cycle','items'])))throw new Error('invalid package envelope');
    if(new Set(p.items.map(item=>item.correctionId)).size!==p.items.length)throw new Error('duplicate package correction');
    const expectedIds=e.corrections.filter(record=>record.cycles.some(review=>review.cycle===cycle.cycle)).map(record=>record.correctionId);
    if(!sameIds(p.items.map(item=>item.correctionId),expectedIds))throw new Error('package item allowlist differs from registered cycle corrections');
    for(const entry of p.items)if(!entry||!equal(sorted(Object.keys(entry)),sorted(['correctionId','question','options'])))throw new Error('unapproved payload in package item');
    const item=p.items.find(item=>item.correctionId===c.correctionId);
    if(!item||!equal(sorted(Object.keys(item)),sorted(['correctionId','question','options']))||item.question?.questionId!==c.questionId||item.question.revision!==cycle.revision||!Array.isArray(item.options))throw new Error('missing/mismatched correction snapshot');
    if(!sameIds(item.options.map(o=>o.optionId),(item.question.links||[]).map(l=>l.optionId)))throw new Error('snapshot options must exactly match question links');
    const mini={questions:[item.question],options:item.options};
    if(editorialContentHash(mini,item.question)!==cycle.contentSha256||editorialHash(editorialBlindPackage(mini,item.question))!==cycle.blindPackageSha256)throw new Error('snapshot differs from reviewed content/blind hash');
    if(!equal(editorialComponentStates(mini,item.question),cycle.componentStates))throw new Error('component states do not match immutable snapshot bytes');
    return mini;
  } catch(error){bad(`review package: ${error.message}`);return null;}
}
/** Exact authored field changes; bookkeeping-only edits are never a content correction. */
export function editorialChangedPaths(beforeBank, afterBank, questionId) {
  const before=editorialContent(beforeBank,questionId),after=editorialContent(afterBank,questionId),paths=[];
  function walk(a,b,at) {
    if(equal(a,b))return;
    if(a && b && typeof a==='object' && typeof b==='object' && Array.isArray(a)===Array.isArray(b)) {
      for(const key of new Set([...Object.keys(a),...Object.keys(b)])) {
        if(!Array.isArray(a) && ['revision','optionRevision','reviewNote'].includes(key))continue;
        walk(a[key],b[key],`${at}/${key}`);
      }
    } else paths.push(at);
  }
  walk(before.question,after.question,`/questions/${questionId}`);
  const old=new Map(before.options.filter(Boolean).map(o=>[o.optionId,o]));
  for(const o of after.options.filter(Boolean))walk(old.get(o.optionId),o,`/options/${o.optionId}`);
  return sorted(paths);
}
function protectedQuestion(q) {
  const out = without(q, ['revision','stem','notes','explanation','reviewNote','sourceRefs','links','parts','materials']);
  if (q.links) out.links = q.links.map(l => without(l,['optionRevision','contextExplanation']));
  if (q.parts) out.parts = q.parts.map(p => ({...without(p,['prompt','explanation','choices']), ...(p.choices ? {choices:p.choices.map(c => without(c,['text','explanation','revision']))} : {})}));
  if (q.materials) out.materials = q.materials.map(m => without(m,['instruction']));
  return out;
}
const protectedOption = o => without(o,['content','explanation','revision']);
function bankAt(banks, version, fail) {
  const item = banks instanceof Map ? banks.get(version) : banks[version];
  if (!item?.raw) { fail(`missing immutable bank bytes ${version}`); return null; }
  try { const bank = validateBank(JSON.parse(item.raw.toString())); if (bank.bankVersion !== version) throw new Error('path/version mismatch'); return {bank, hash:editorialHash(item.raw)}; }
  catch(error) { fail(`invalid immutable bank ${version}: ${error.message}`); return null; }
}

// Only later truthful publication reporting may differ from a delivered decision ledger.
// Attempts, candidate identity, decisions, baseline and every other field stay exact.
function decisionRecord(record) {
  const copy=structuredClone(record);
  delete copy.publication; delete copy.coverageAfter;
  if(copy.counts) {delete copy.counts.publishedRegularWrittenBySubject;delete copy.counts.publishedRegularPractical;}
  for(const candidate of copy.candidates||[])delete candidate.publishedBankVersion;
  return copy;
}

/** Shared cumulative ordering. Offline evidence permits staging, never Git authorization. */
export function validateCampaignBaselines(ledgers, {editorials=[], now=null, activeBankVersion=null, offlineBases=new Map(), ledgerSources=new Map(), synchronizations=[], banks=new Map(), publicationState=null}={}) {
  const sync=validatePublicationSynchronizations(synchronizations,{ledgers,banks,ledgerSources,now,publicationState,activeBankVersion});
  const errors=[...sync.errors,...validateEvidenceLossCampaign(ledgers,{banks,ledgerSources,now,publicationState,offlineBases,manifest:activeBankVersion?{bankVersion:activeBankVersion}:null}).errors],all=[...ledgers,...editorials],verified=[...all.filter(r=>r.publication?.status==='verified'&&Number.isFinite(Date.parse(r.publication.verifiedAt))),...sync.history];
  const delivered=[];
  if(!(offlineBases instanceof Map))errors.push('offline baselines must be a validated evidence Map');
  else for(const [artifact,evidence] of offlineBases) {
    const fail=message=>errors.push(`offline baseline ${evidence?.roundId||'<unknown>'}: ${message}`);
    // Historical subset audits may carry the full context's later receipts. They
    // are irrelevant until their source is loaded, explicitly referenced, or an
    // included round began after delivery. Never require future history to audit
    // earlier rounds; never ignore a missing predecessor for an actual successor.
    const recordedAt=Date.parse(evidence?.recordedAt);
    if(Number.isFinite(recordedAt)&&!ledgers.some(r=>r.roundId===evidence?.roundId)&&!all.some(r=>Date.parse(r.startedAt)>recordedAt||r.baseline?.offlinePredecessor?.artifactSha256===artifact||r.baseline?.offlinePredecessor?.roundId===evidence?.roundId))continue;
    if(!evidence || !/^[a-f0-9]{64}$/.test(artifact) || /^0+$/.test(artifact) || ['bankSha256','ledgerSha256','manifestSha256'].some(key=>!/^[a-f0-9]{64}$/.test(evidence[key])||/^0+$/.test(evidence[key])) || !/^[a-f0-9]{40}$/.test(evidence.baseCommit)||/^0+$/.test(evidence.baseCommit)) {fail('invalid exact artifact/hash/anchor evidence');continue;}
    const sources=ledgers.filter(r=>r.roundId===evidence.roundId),raw=ledgerSources instanceof Map?ledgerSources.get(evidence.roundId):null;
    if(sources.length!==1 || !(typeof raw==='string'||Buffer.isBuffer(raw))) {fail('full original campaign ledger source is missing or ambiguous');continue;}
    let original;
    try {original=JSON.parse(raw.toString());}catch {fail('invalid original ledger bytes');continue;}
    const recorded=Date.parse(evidence.recordedAt),eligible=Date.parse(evidence.eligibleAt),source=sources[0];
    if(!original||!Array.isArray(original.candidates)||editorialHash(raw)!==evidence.ledgerSha256 || original.roundId!==evidence.roundId || !equal(decisionRecord(original),decisionRecord(source))) {fail('original ledger hash or immutable decision/review history differs from loaded campaign');continue;}
    if(original.status!=='closed'||original.publication?.status==='verified'||original.publication?.verifiedAt!==null||original.publication?.bankVersion!==evidence.bankVersion||original.publication?.bankSha256!==evidence.bankSha256||original.candidates?.some(c=>c.decision==='pending'||c.publishedBankVersion!==null)||Object.values(original.counts?.publishedRegularWrittenBySubject||{}).some(n=>n!==0)||original.counts?.publishedRegularPractical!==0) {fail('original source must be a closed unpublished ledger for the exact delivered bank');continue;}
    if(!Number.isFinite(recorded)||!Number.isFinite(eligible)||eligible<recorded||recorded<Date.parse(original.closedAt)||eligible>=FREEZE_AT||now!==null&&eligible>now) {fail('delivery evidence must follow closure and reconciliation eligibility, precede freeze and not be in the future');continue;}
    if(delivered.some(d=>d.roundId===evidence.roundId)) {fail('multiple delivered artifacts for one predecessor are ambiguous');continue;}
    delivered.push({...evidence,artifactSha256:artifact,source});
  }
  function requireLatest(record,at,phase) {
    const history=verified.filter(r=>r!==record&&!r.synchronizedRoundIds?.includes(record.roundId)&&Date.parse(r.publication.verifiedAt)<=at).sort((a,b)=>Date.parse(b.publication.verifiedAt)-Date.parse(a.publication.verifiedAt));
    const latest=history[0],id=record.roundId||record.correctionRoundId,ref=record.baseline?.offlinePredecessor;
    if(history[1] && latest.publication.verifiedAt===history[1].publication.verifiedAt && latest.publication.bankVersion!==history[1].publication.bankVersion)errors.push(`${id}: cumulative publication order is ambiguous at ${phase}`);
    // Delivery must already have occurred when this round began. A delayed checkpoint
    // cannot retrospectively authorize work, even during a later release validation.
    const eligible=delivered.filter(d=>d.roundId!==record.roundId&&Date.parse(d.recordedAt)<Date.parse(record.startedAt)).sort((a,b)=>Date.parse(b.recordedAt)-Date.parse(a.recordedAt));
    const latestOffline=eligible[0];
    if(eligible[1]&&latestOffline.recordedAt===eligible[1].recordedAt)errors.push(`${id}: cumulative offline delivery order is ambiguous`);
    const unresolved=latestOffline&&!(latestOffline.source.publication?.status==='verified'&&Date.parse(latestOffline.source.publication.verifiedAt)<=at)&&!sync.history.some(h=>h.synchronizedRoundIds.includes(latestOffline.roundId)&&Date.parse(h.publication.verifiedAt)<=at);
    function verifiedIsOfflineAncestor() {
      let ancestor=latestOffline?.source; const seen=new Set();
      while(ancestor&&!seen.has(ancestor)) {
        seen.add(ancestor);
        if(ancestor.baseline?.bankVersion===latest?.publication.bankVersion&&ancestor.baseline?.bankSha256===latest?.publication.bankSha256)return true;
        ancestor=all.find(r=>r.publication?.bankVersion===ancestor.baseline?.bankVersion&&r.publication?.bankSha256===ancestor.baseline?.bankSha256);
      }
      return false;
    }
    // Oldest-first synchronization can verify an ancestor after its offline
    // descendant was delivered. That newer timestamp must not roll the chain back.
    // Conversely a divergent verified correction wins even if delivery was later.
    const preferOffline=unresolved&&(!latest||verifiedIsOfflineAncestor());
    if(ref) {
      const exact=delivered.find(d=>d.artifactSha256===ref.artifactSha256);
      if(!exact||['roundId','manifestSha256','ledgerSha256'].some(key=>exact[key]!==ref[key])||record.baseline.sourceCommit!==exact.baseCommit||record.baseline.bankVersion!==exact.bankVersion||record.baseline.bankSha256!==exact.bankSha256||exact.roundId===record.roundId||Date.parse(exact.recordedAt)>=Date.parse(record.startedAt)||Date.parse(exact.eligibleAt)>Date.parse(record.startedAt))errors.push(`${id}: ${phase} offline predecessor requires exact earlier delivered evidence, original ledger, elapsed reconciliation bound and verified Git anchor`);
      if(exact&&latestOffline&&exact.artifactSha256!==latestOffline.artifactSha256)errors.push(`${id}: ${phase} offline baseline must use the latest earlier delivered cumulative predecessor`);
      if(preferOffline) return;
      // A verified reconciliation of this same bank needs no rewritten decision ledger.
      if(latest&&exact&&latest.publication.bankVersion===exact.bankVersion&&latest.publication.bankSha256===exact.bankSha256)return;
    } else if(preferOffline) {
      errors.push(`${id}: ${phase} requires explicit offline predecessor for the latest earlier delivered cumulative bank`);
      return;
    }
    if(!latest)return;
    if(record.baseline?.bankVersion!==latest.publication.bankVersion || record.baseline?.bankSha256!==latest.publication.bankSha256)errors.push(`${id}: ${phase} baseline must be the latest verified cumulative campaign bank; stale baseline would roll back published content`);
  }
  for(const r of all) {
    requireLatest(r,Date.parse(r.startedAt),'round-start');
    if(r.publication?.status==='verified')requireLatest(r,Date.parse(r.publication.verifiedAt),'publication-order');
    if(r.publication?.bankVersion===activeBankVersion && r.publication.status!=='verified' && now!==null && !sync.history.some(h=>h.publication.bankVersion===activeBankVersion&&h.synchronizedRoundIds.includes(r.roundId)))requireLatest(r,now,'active-release');
  }
  if(activeBankVersion && now!==null) {
    const active=all.find(r=>r.publication?.bankVersion===activeBankVersion),latest=verified.filter(r=>Date.parse(r.publication.verifiedAt)<=now).sort((a,b)=>Date.parse(b.publication.verifiedAt)-Date.parse(a.publication.verifiedAt))[0];
    if((!active || active.publication.status==='verified' || sync.history.some(h=>h.synchronizedRoundIds.includes(active?.roundId))) && latest && latest.publication.bankVersion!==activeBankVersion)errors.push('release: active verified manifest is older than the latest verified cumulative bank');
  }
  return {ok:errors.length===0,errors};
}
/** All identity, lifecycle and gate records are checked even before publication is attempted. */
export function validateEditorialHistory(editorials, {ledgers=[], banks=new Map(), schema, now=null, nextRoundAt=null, publicationState=null, availableFiles=null, reviewPackages=new Map(), synchronizations=[], ledgerSources=new Map()}={}, helpers) {
  const sync=validatePublicationSynchronizations(synchronizations,{ledgers,banks,ledgerSources,now,publicationState});
  const errors=[...sync.errors], fail=(id,message) => errors.push(`${id || 'editorial'}: ${message}`);
  if (!Array.isArray(editorials)) return {ok:false,errors:['editorial ledgers must be an array']};
  for (const e of editorials) for (const error of helpers.validateJsonSchema(e,schema)) fail(e?.correctionRoundId,error);
  if (errors.length) return {ok:false,errors};
  const rounds=new Set(), corrections=new Set(), predecessors=new Map();
  for (const e of [...editorials].sort((a,b) => Date.parse(a.startedAt)-Date.parse(b.startedAt))) {
    const id=e.correctionRoundId, error=message=>fail(id,message), start=Date.parse(e.startedAt), deadline=Date.parse(e.decisionDeadline), close=e.closedAt===null?null:Date.parse(e.closedAt);
    if (rounds.has(id)) error('duplicate correctionRoundId'); rounds.add(id);
    const allStarts=[...editorials.filter(other=>other!==e),...ledgers].map(r=>Date.parse(r.startedAt)).filter(t=>t>start);
    const bound=Math.min(start+4*3600000,helpers.nextScheduledRoundAt(e.startedAt),nextRoundAt?Date.parse(nextRoundAt):Infinity,...(e.status==='running'?allStarts:[]),FREEZE_AT,helpers.FINAL_DECISION_AT);
    if (deadline<=start || deadline>bound) error('deadline must be within four hours, next round and campaign cutoff');
    if (close!==null && (close<start || close>deadline)) error('closure is outside decision window');
    if ((e.status==='closed') !== (close!==null)) error('status and closedAt disagree');
    if (now!==null && (start>now || close>now || (e.status==='running' && now>=deadline))) error('future execution or reached decision deadline');
    if (publicationState?.finalizedAt && (close??deadline)>Date.parse(publicationState.finalizedAt)) error('editorial work exceeds persistent freeze');
    if ([...ledgers,...editorials.filter(other=>other!==e)].some(r => { const otherStart=Date.parse(r.startedAt), otherEnd=Date.parse(r.status==='closed'?r.closedAt:r.decisionDeadline); return start<otherEnd && (close??deadline)>otherStart; })) error('editorial correction overlaps another active decision window');
    if (availableFiles && e.status==='closed' && !availableFiles.has(`docs/corrections/${id}.md`)) error('closed editorial ledger is missing public report');
    for (const v of e.validation) if (v.reportPath!==null && (!safePath(v.reportPath) || availableFiles && !availableFiles.has(v.reportPath))) error(`unsafe or missing validation report ${v.reportPath}`);
    const latestVerified=[...ledgers,...editorials,...sync.history].filter(r=>r.publication?.status==='verified' && Date.parse(r.publication.verifiedAt)<=start).sort((a,b)=>Date.parse(b.publication.verifiedAt)-Date.parse(a.publication.verifiedAt))[0];
    if(!latestVerified || latestVerified.publication.bankVersion!==e.baseline.bankVersion || latestVerified.publication.bankSha256!==e.baseline.bankSha256)error('baseline must be the latest verified cumulative campaign bank at editorial start; stale baselines cannot roll back other corrections');
    const baseline=bankAt(banks,e.baseline.bankVersion,error);
    if (baseline) {
      if (baseline.hash!==e.baseline.bankSha256 || /^0+$/.test(e.baseline.sourceCommit)) error('baseline hash/commit is not verified');
      if (Date.parse(baseline.bank.releasedAt)>start) error('baseline was released after editorial work began');
      const coverage=helpers.regularCoverage(baseline.bank,start);
      if (!equal(coverage.regularWrittenBySubject,e.baseline.regularWrittenBySubject) || coverage.regularPractical!==e.baseline.regularPractical) error('baseline coverage mismatch');
      if (!equal(coverage,e.coverageAfter)) error('editorial work cannot change cumulative coverage/mock eligibility');
    }
    const counts={registered:e.corrections.length,accepted:0,rejected:0,pending:0,newRegular:0,revisedRegular:0,publishedRevisedRegular:0};
    for (const c of e.corrections) {
      const bad=message=>error(`${c.correctionId}: ${message}`); counts[c.decision]++;
      const ref=c.priorAcceptedRef, predecessorKey=`${c.questionId}/${ref.questionRevision}/${ref.contentSha256}`;
      if (corrections.has(c.correctionId)) bad('duplicate correctionId'); corrections.add(c.correctionId);
      if(predecessors.has(predecessorKey)) bad('same accepted predecessor cannot fork or reset a failed correction under another ID or ledger');
      predecessors.set(predecessorKey,(predecessors.get(predecessorKey)||0)+c.attemptCount);
      if(predecessors.get(predecessorKey)>3)bad('same accepted predecessor exceeds three started editorial cycles');
      const originalRound=ledgers.find(r=>r.roundId===ref.roundId), editorialRound=editorials.find(r=>r.correctionRoundId===ref.roundId), priorRound=originalRound||editorialRound;
      const prior=originalRound?.candidates.find(p=>p.candidateId===ref.candidateId)||editorialRound?.corrections.find(p=>p.correctionId===ref.candidateId);
      const priorPath=originalRound?`docs/rounds/${ref.roundId}.json`:`docs/corrections/${ref.roundId}.json`;
      const original=bankAt(banks,ref.bankVersion,bad), before=baseline?.bank.questions.find(q=>q.questionId===c.questionId);
      const synchronizedPrior=sync.history.some(h=>Date.parse(h.publication.verifiedAt)<=start&&h.evidence.rounds.some(s=>s.roundId===ref.roundId&&s.bankVersion===ref.bankVersion&&s.bankSha256===ref.bankSha256));
      if (!prior || prior.decision!=='accepted' || priorRound.status!=='closed' || (!synchronizedPrior && (priorRound.publication.status!=='verified' || prior.publishedBankVersion!==ref.bankVersion)) || priorRound.publication.bankSha256!==ref.bankSha256 || ref.ledgerPath!==priorPath || priorRound===e || Date.parse(priorRound.publication.verifiedAt)>start) bad('priorAcceptedRef must match a genuinely accepted, verified earlier expansion/editorial decision');
      if (prior && (prior.questionId!==c.questionId || prior.templateId!==c.templateId || prior.learningGoalId!==c.learningGoalId || prior.revision!==ref.questionRevision || prior.type!==c.type || prior.subjectId!==c.subjectId)) bad('prior accepted identity/revision mismatch');
      if (original && (original.hash!==ref.bankSha256 || editorialContentHash(original.bank,c.questionId)!==ref.contentSha256)) bad('prior accepted content hash mismatch');
      if (!before || before.testOnly!==false || before.verificationStatus!=='published' || before.templateId!==c.templateId || before.learningGoalRevision!==c.learningGoalRevision || before.type!==c.type || before.subjectId!==c.subjectId) bad('correction must preserve an existing published regular learning goal');
      if (before && original && editorialContentHash(baseline.bank,before)!==editorialContentHash(original.bank,c.questionId)) bad('baseline question differs from its exact verified accepted predecessor');
      if (c.attemptCount!==c.cycles.length || c.revision!==(before?.revision??ref.questionRevision)+Math.max(1,c.attemptCount)) bad('every started cycle counts and each question revision must advance exactly once per attempt');
      const ev=new Map(c.evidence.map(v=>[v.sourceId,v])); if (ev.size!==c.evidence.length) bad('duplicate evidence sourceId');
      for (const source of c.evidence) if (Date.parse(source.checkedAt)>(close??deadline) || now!==null && Date.parse(source.checkedAt)>now) bad('evidence checked after decision/current time');
      const earlierCandidates=[...ledgers.flatMap(r=>r.candidates.filter(p=>p.questionId===c.questionId)),...editorials.filter(r=>r!==e&&Date.parse(r.startedAt)<start).flatMap(r=>r.corrections.filter(p=>p.questionId===c.questionId))];
      const exposed=new Set(earlierCandidates.flatMap(p=>[p.authorId,...p.cycles.flatMap(cycle=>Object.values(cycle.gates).filter(g=>g.result!=='not_run').map(g=>g.reviewerId))]));
      let previous=null, previousComponents=before?editorialComponentStates(baseline.bank,before):[];
      for (const [i,cycle] of c.cycles.entries()) {
        const snapshot=checkedReviewPackage(e,c,cycle,reviewPackages,bad);
        if(snapshot && before && !equal(protectedQuestion(before),protectedQuestion(snapshot.questions[0])))bad('reviewed cycle changed protected question identity/key/score/materials');
        if(snapshot && baseline)for(const option of snapshot.options){const original=baseline.bank.options.find(o=>o.optionId===option.optionId);if(!original||!equal(protectedOption(original),protectedOption(option)))bad('reviewed cycle changed protected option metadata');}
        const stateKey=s=>`${s.kind}/${s.id}`,oldStates=new Map(previousComponents.map(s=>[stateKey(s),s]));
        if(!sameIds(cycle.componentStates.map(stateKey),previousComponents.map(stateKey)))bad('reviewed components cannot add/remove IDs between cycles');
        for(const state of cycle.componentStates){const old=oldStates.get(stateKey(state));if(!old)continue;const expected=old.revision+(old.contentSha256===state.contentSha256?0:1);if(state.revision!==expected)bad('component content changed without exactly one revision advance, or unchanged content revision was changed');}
        previousComponents=cycle.componentStates;
        const begun=Date.parse(cycle.startedAt), end=cycle.finishedAt===null?null:Date.parse(cycle.finishedAt);
        if (cycle.cycle!==i+1 || cycle.revision!==(before?.revision??ref.questionRevision)+i+1) bad('cycle numbering/revisions must be contiguous without reset');
        if (begun<start || begun>deadline || end!==null&&(end<begun || end>(close??deadline)) || now!==null&&(begun>now || end>now)) bad('cycle execution exceeds decision/current-time window');
        if (previous && (previous.outcome!=='revise' || begun<Date.parse(previous.finishedAt))) bad('new cycle requires an earlier revise and ordered execution');
        if (cycle.outcome==='running' && (i!==c.cycles.length-1 || c.decision!=='pending' || e.status!=='running')) bad('only the last pending cycle can run');
        if (cycle.gates.blindSolve.result!=='not_run' && (cycle.gates.blindSolve.reviewerId===c.authorId || exposed.has(cycle.gates.blindSolve.reviewerId))) bad('blind reviewer is author or previously key-visible');
        for (const name of EDITORIAL_GATES) {
          const gate=cycle.gates[name];
          if (gate.result!=='not_run' && (!meaningful(gate.reviewerId) || gate.reviewerId===c.authorId)) bad('executed gates require independent reviewer identities');
          if (name==='sourceCheck' && gate.result==='pass' && !gate.evidenceRefs.length) bad('passed source gate requires primary evidence');
          for (const ref of gate.evidenceRefs) if (!ev.has(ref) || Date.parse(ev.get(ref).checkedAt)>(end??now??deadline)) bad('gate refers to missing or later evidence');
        }
        if (cycle.outcome==='accepted' && EDITORIAL_GATES.some(g=>cycle.gates[g].result!=='pass')) bad('accepted requires all gates on one content revision');
        if (cycle.outcome==='revise' && EDITORIAL_GATES.every(g=>cycle.gates[g].result==='pass')) bad('revise requires failed or unrun gate');
        for (const gate of Object.values(cycle.gates)) if (gate.result!=='not_run') exposed.add(gate.reviewerId);
        previous=cycle;
      }
      if (previous && (previous.revision!==c.revision || !(c.decision==='pending'?['running','revise'].includes(previous.outcome):previous.outcome===c.decision))) bad('final decision/revision differs from last cycle');
      if (c.decision==='accepted' && (!previous || !c.evidence.length || !equal(c.reasonCodes,['accepted_all_gates']))) bad('accepted correction requires complete evidence and accepted_all_gates');
      if (c.decision==='rejected' && (!c.reasonCodes.length || c.reasonCodes.includes('accepted_all_gates'))) bad('rejected correction needs a concrete failure');
      if (c.decision==='pending' && c.reasonCodes.length) bad('pending correction cannot claim final reasons');
      if (e.status==='closed' && c.decision==='pending') bad('closed correction cannot be pending');
      if (c.decision!=='accepted' && c.publishedBankVersion!==null) bad('only accepted corrections may be published');
      if (c.decision==='accepted') counts.revisedRegular++;
      if (c.publishedBankVersion!==null) { if (e.publication.status!=='verified' || c.publishedBankVersion!==e.publication.bankVersion) bad('published correction lacks verified release'); else counts.publishedRevisedRegular++; }
    }
    if (!equal(counts,e.counts)) error('editorial counts must distinguish registered/decided/revised, new zero, and actually published');
    if (e.publication.status==='verified') {
      const t=Date.parse(e.publication.verifiedAt);
      if(publicationState?.finalizedAt && t>Date.parse(publicationState.finalizedAt))error('verified publication is after persistent freeze');
      if (e.status!=='closed' || !Number.isFinite(t) || t<(close??start) || t>=FREEZE_AT || now!==null&&t>now || !e.publication.commit || /^0+$/.test(e.publication.commit) || !e.publication.url || e.publication.blockers.length) error('verified editorial publication requires real post-closure evidence before cutoff');
      const release=bankAt(banks,e.publication.bankVersion,error);
      if (release && release.hash!==e.publication.bankSha256) error('verified publication hash mismatch');
      if (release && Date.parse(release.bank.releasedAt)>t) error('hosted verification cannot precede bank release');
      if(e.corrections.some(c=>c.decision==='accepted' && c.publishedBankVersion!==e.publication.bankVersion) || e.counts.publishedRevisedRegular!==e.counts.accepted)error('verified publication must count every accepted published revision');
      if (release && baseline) validateEditorialTransition(e,baseline.bank,release.bank,{banks,now,...helpers},error);
    } else if (e.publication.verifiedAt!==null) error('unverified publication must not claim verification time');
  }
  return {ok:errors.length===0,errors};
}

/** Fail-closed editorial-only changes, separate from immutable expansion transitions. */
export function validateEditorialTransition(e, baseline, bank, context, fail) {
  const accepted=new Map(e.corrections.filter(c=>c.decision==='accepted').map(c=>[c.questionId,c]));
  if (e.status!=='closed' || e.corrections.some(c=>c.decision==='pending')) fail('editorial release requires closed decisions');
  if(!accepted.size)fail('editorial release needs at least one accepted substantive correction');
  if (!sameIds(baseline.questions.map(q=>q.questionId),bank.questions.map(q=>q.questionId)) || !sameIds(baseline.options.map(o=>o.optionId),bank.options.map(o=>o.optionId))) fail('editorial release cannot add/remove question or option IDs');
  if (!equal(without(baseline,['bankVersion','releasedAt','changeSummary','editorialRoundId','questions','options','sources']),without(bank,['bankVersion','releasedAt','changeSummary','editorialRoundId','questions','options','sources']))) fail('editorial release changed protected bank metadata, coverage or score-correction mapping');
  if (bank.editorialRoundId!==e.correctionRoundId) fail('bank must explicitly identify its editorial ledger');
  if (bank.bankVersion===baseline.bankVersion || Date.parse(bank.releasedAt)<Date.parse(e.closedAt??e.startedAt) || Date.parse(bank.releasedAt)>=FREEZE_AT || context.now!==null && context.now!==undefined && Date.parse(bank.releasedAt)>context.now) fail('editorial release needs a new version inside campaign window');
  const beforeOptions=new Map(baseline.options.map(o=>[o.optionId,o])), currentOptions=new Map(bank.options.map(o=>[o.optionId,o]));
  const oldQuestions=new Map(baseline.questions.map(q=>[q.questionId,q])), changedQuestions=[],changedOptions=[],changedChoices=[];
  const sourceMap=new Map(bank.sources.map(s=>[s.id,s]));
  for (const source of baseline.sources) if (!equal(source,sourceMap.get(source.id))) fail(`historical source changed or removed: ${source.id}`);
  for (const q of bank.questions) {
    const before=oldQuestions.get(q.questionId); if (!before) continue;
    const relatedChanged=(q.links||[]).some(l=>!equal(beforeOptions.get(l.optionId),currentOptions.get(l.optionId)));
    if (equal(before,q) && !relatedChanged) { if (accepted.has(q.questionId)) fail(`accepted correction has no effective content change: ${q.questionId}`); continue; }
    changedQuestions.push(q.questionId); const c=accepted.get(q.questionId);
    if (!c || q.testOnly!==false) { fail(`changed question lacks accepted editorial decision or is a seed: ${q.questionId}`); continue; }
    if (!equal(protectedQuestion(before),protectedQuestion(q)) || q.learningGoalRevision!==c.learningGoalRevision) fail(`protected identity/key/score/material/goal changed: ${q.questionId}`);
    const targetPaths=editorialChangedPaths(baseline,bank,q.questionId);
    if (!targetPaths.length || !sameIds(targetPaths,c.targetPaths||[])) fail(`substantive authored changes must exactly match targetPaths: ${q.questionId}`);
    if (q.revision!==c.revision || q.revision!==before.revision+c.attemptCount) fail(`question revision must advance with every review attempt: ${q.questionId}`);
    if (new Set(q.sourceRefs).size!==q.sourceRefs.length || before.sourceRefs.some(id=>!q.sourceRefs.includes(id))) fail(`source references may expand but never remove prior evidence: ${q.questionId}`);
    const last=c.cycles.at(-1);
    if (!last || last.outcome!=='accepted' || EDITORIAL_GATES.some(g=>last.gates[g].result!=='pass') || last.contentSha256!==editorialContentHash(bank,q) || last.blindPackageSha256!==editorialHash(editorialBlindPackage(bank,q))) fail(`accepted gates are not bound to exact final question/options/blind content: ${q.questionId}`);
    for (const id of q.sourceRefs) {
      const source=sourceMap.get(id), evidence=c.evidence.find(s=>s.sourceId===id);
      if (!source || !evidence || ['url','version','location'].some(key=>source[key]!==evidence[key])) fail(`revised question lacks matching reviewed primary evidence: ${q.questionId}/${id}`);
    }
    const oldChoiceMap=new Map(choiceList(before).map(c=>[c.id,c])), choiceChanges=[];
    for (const choice of choiceList(q)) {
      const old=oldChoiceMap.get(choice.id); if (!old || equal(old,choice)) continue;
      changedChoices.push(choice.id); choiceChanges.push(choice.id);
      const change=c.practicalChoiceChanges.find(v=>v.id===choice.id);
      if (!change || (!Number.isInteger(choice.revision) || choice.revision<=objectRevision(old) || choice.revision>objectRevision(old)+c.attemptCount) || !matchesChange(change,old,choice)) fail(`changed practical choice has stale/forged revision or hash: ${choice.id}`);
    }
    if (!sameIds(choiceChanges,c.practicalChoiceChanges.map(v=>v.id))) fail(`practical choice change allowlist differs from actual changes: ${q.questionId}`);
    const optionChanges=(q.links||[]).filter(l=>!equal(beforeOptions.get(l.optionId),currentOptions.get(l.optionId))).map(l=>l.optionId);
    if (!sameIds(optionChanges,c.optionChanges.map(v=>v.id))) fail(`option change allowlist differs from actual changes: ${q.questionId}`);
    for (const change of c.optionChanges) if (!matchesChange(change,beforeOptions.get(change.id),currentOptions.get(change.id))) fail(`option change revision/hash mismatch: ${change.id}`);
  }
  for (const o of bank.options) {
    const before=beforeOptions.get(o.optionId); if (!before || equal(before,o)) continue;
    changedOptions.push(o.optionId);
    const affected=bank.questions.filter(q=>(q.links||[]).some(l=>l.optionId===o.optionId));
    const maxAdvance=Math.min(...affected.map(q=>accepted.get(q.questionId)?.attemptCount??0));
    if (!equal(protectedOption(before),protectedOption(o)) || !Number.isInteger(o.revision) || o.revision<=before.revision || o.revision>before.revision+maxAdvance) fail(`protected option metadata or revision changed: ${o.optionId}`);
    const members=bank.questions.filter(q=>(q.links||[]).some(l=>l.optionId===o.optionId));
    if (!members.length || members.some(q=>!accepted.has(q.questionId) || q.testOnly!==false)) fail(`every affected option member requires accepted correction: ${o.optionId}`);
  }
  if (!sameIds(changedQuestions,e.changedQuestionIds) || !sameIds(changedQuestions,[...accepted.keys()])) fail('changed question allowlist differs from actual accepted changes');
  if (!sameIds(changedOptions,e.changedOptionIds)) fail('changed option allowlist differs from actual changes');
  if (!sameIds(changedChoices,e.changedPracticalChoiceIds)) fail('changed practical-choice allowlist differs from actual changes');
  for (const source of bank.sources.filter(s=>!baseline.sources.some(old=>old.id===s.id))) if (!bank.questions.some(q=>accepted.has(q.questionId)&&q.sourceRefs.includes(source.id))) fail(`new source is not tied to a reviewed correction: ${source.id}`);
  try { validateBankForPublication(bank); validateExplanationAuthoring(bank,historicalExplanationBaseline(context.banks)); } catch(error) { fail(`editorial bank publication/strict explanation authoring: ${error.message}`); }
  if (!equal(context.regularCoverage(baseline),context.regularCoverage(bank))) fail('editorial release changed cumulative regular/mock coverage');
}
function matchesChange(change,before,after) { return before && after && change.beforeRevision===objectRevision(before) && change.afterRevision===objectRevision(after) && change.beforeSha256===editorialHash(before) && change.afterSha256===editorialHash(after); }
