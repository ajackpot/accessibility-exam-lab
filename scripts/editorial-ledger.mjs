import {resolvePublicationIdentity, assertPublicationSelectionReference} from './publication-selection.mjs';
import {validateEvidenceLossCampaign} from './evidence-loss-block.mjs';
import {isDeepStrictEqual as equal} from 'node:util';
import {FREEZE_AT} from '../src/domain.js';
import {validatePublicationSynchronizations} from './publication-sync.mjs';
import {editorialHash,validateEditorialHistorySemantics} from './editorial-history-core.mjs';
export {EDITORIAL_GATES,editorialHash,editorialContent,editorialContentHash,editorialBlindPackage,editorialComponentStates,editorialChangedPaths,validateEditorialHistorySemantics,validateEditorialTransition} from './editorial-history-core.mjs';

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
export function validateCampaignBaselines(ledgers, {editorials=[], now=null, activeBankVersion=null, offlineBases=new Map(), ledgerSources=new Map(), synchronizations=[], banks=new Map(), publicationState=null, publicationSelections=null, deliveryCheckpointSources=new Map(), editorialSources=new Map(), editorialReports=new Map(), editorialSchema, reviewPackages=new Map(), availableFiles=null}={}) {
  const sync=validatePublicationSynchronizations(synchronizations,{ledgers,editorials,banks,ledgerSources,editorialSources,editorialReports,editorialSchema,reviewPackages,availableFiles,now,publicationState,activeBankVersion,publicationSelections,deliveryCheckpointSources});
  const errors=[...sync.errors,...validateEvidenceLossCampaign(ledgers,{banks,ledgerSources,now,publicationState,offlineBases,manifest:activeBankVersion?{bankVersion:activeBankVersion}:null}).errors],all=[...ledgers,...editorials],verified=[...all.filter(r=>r.publication?.status==='verified'&&Number.isFinite(Date.parse(r.publication.verifiedAt))),...sync.history];
  const identities=new Map();
  try { if(publicationSelections)for(const ledger of ledgers) identities.set(ledger,resolvePublicationIdentity(ledger,publicationSelections)); }
  catch(error) { return {ok:false,errors:[...errors,error.message]}; }
  const identityOf=record=>identities.get(record)||{effectiveBankVersion:record.publication?.bankVersion,effectiveBankSha256:record.publication?.bankSha256};
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
    let identity;
    try { identity=resolvePublicationIdentity(source,publicationSelections);assertPublicationSelectionReference(evidence.selectionReference,identity); } catch(error) {fail(error.message);continue;}
    if(original.status!=='closed'||original.publication?.status==='verified'||original.publication?.verifiedAt!==null||identity.effectiveBankVersion!==evidence.bankVersion||identity.effectiveBankSha256!==evidence.bankSha256||original.candidates?.some(c=>c.decision==='pending'||c.publishedBankVersion!==null)||Object.values(original.counts?.publishedRegularWrittenBySubject||{}).some(n=>n!==0)||original.counts?.publishedRegularPractical!==0) {fail('original source must be a closed unpublished ledger for the exact delivered bank');continue;}
    if(!Number.isFinite(recorded)||!Number.isFinite(eligible)||eligible<recorded||recorded<Date.parse(original.closedAt)||eligible>=FREEZE_AT||now!==null&&eligible>now) {fail('delivery evidence must follow closure and reconciliation eligibility, precede freeze and not be in the future');continue;}
    if(delivered.some(d=>d.roundId===evidence.roundId)) {fail('multiple delivered artifacts for one predecessor are ambiguous');continue;}
    delivered.push({...evidence,artifactSha256:artifact,source});
  }
  function requireLatest(record,at,phase) {
    const history=verified.filter(r=>r!==record&&!r.synchronizedRoundIds?.includes(record.roundId)&&!r.synchronizedEditorialIds?.includes(record.correctionRoundId)&&Date.parse(r.publication.verifiedAt)<=at).sort((a,b)=>Date.parse(b.publication.verifiedAt)-Date.parse(a.publication.verifiedAt));
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
        ancestor=all.find(r=>identityOf(r).effectiveBankVersion===ancestor.baseline?.bankVersion&&identityOf(r).effectiveBankSha256===ancestor.baseline?.bankSha256);
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
    if(activeBankVersion!==null && identityOf(r).effectiveBankVersion===activeBankVersion && r.publication.status!=='verified' && now!==null && !sync.history.some(h=>h.publication.bankVersion===activeBankVersion&&(h.synchronizedRoundIds.includes(r.roundId)||h.synchronizedEditorialIds?.includes(r.correctionRoundId))))requireLatest(r,now,'active-release');
  }
  if(activeBankVersion && now!==null) {
    const active=all.find(r=>identityOf(r).effectiveBankVersion===activeBankVersion),latest=verified.filter(r=>Date.parse(r.publication.verifiedAt)<=now).sort((a,b)=>Date.parse(b.publication.verifiedAt)-Date.parse(a.publication.verifiedAt))[0];
    if((!active || active.publication.status==='verified' || sync.history.some(h=>h.synchronizedRoundIds.includes(active?.roundId)||h.synchronizedEditorialIds?.includes(active?.correctionRoundId))) && latest && latest.publication.bankVersion!==activeBankVersion)errors.push('release: active verified manifest is older than the latest verified cumulative bank');
  }
  return {ok:errors.length===0,errors};
}
/** All identity, lifecycle and gate records are checked even before publication is attempted. */
export function validateEditorialHistory(editorials, options={}, helpers) {
  const {synchronizations=[],schema,editorialSchema=schema}=options;
  const sync=validatePublicationSynchronizations(synchronizations,{...options,editorials,editorialSchema});
  // Preserve the original wrapper's schema-first early return when evidence
  // already failed, including its exact error order and non-array diagnostic.
  if(sync.errors.length){
    if(!Array.isArray(editorials))return {ok:false,errors:['editorial ledgers must be an array']};
    const errors=[...sync.errors];
    for(const e of editorials)for(const error of helpers.validateJsonSchema(e,editorialSchema))errors.push(`${e?.correctionRoundId || 'editorial'}: ${error}`);
    return {ok:false,errors};
  }
  const result=validateEditorialHistorySemantics(editorials,{...options,schema:editorialSchema},helpers,sync.history);
  const errors=[...sync.errors,...result.errors];
  return {ok:errors.length===0,errors};
}
