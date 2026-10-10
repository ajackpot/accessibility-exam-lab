/** Prospective first-release exclusions. Never changes review decisions or repairs content. */
import fs from 'node:fs/promises';
import {AsyncLocalStorage} from 'node:async_hooks';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal,types} from 'node:util';
import {FREEZE_AT} from '../src/domain.js';
import reviewedTrust from '../docs/quarantines/trust.json' with {type:'json'};

// Parse representations only: no semantic result, trust, path, clock or freeze
// decision is cached. Each outer operation owns and discards its private store.
const bankParsingSession = new AsyncLocalStorage();
const typedArrayBuffer = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'buffer').get;
function ordinaryBuffer(raw) {
  if (!Buffer.isBuffer(raw) || Object.getPrototypeOf(raw) !== Buffer.prototype) return false;
  if (['toString','valueOf','buffer','length','byteLength','byteOffset','copy','constructor'].some(key => Object.hasOwn(raw,key)) || Object.hasOwn(raw,Symbol.toPrimitive)) return false;
  try { return !types.isSharedArrayBuffer(typedArrayBuffer.call(raw)); } catch { return false; }
}
export async function withBankParsingSession(root, operation) {
  const identity = path.resolve(root);
  const active = bankParsingSession.getStore();
  if (active?.root === identity && !active.closed) return operation();
  const session = {root:identity, buffers:new WeakMap(), strings:new Map(), closed:false, changed:false};
  return bankParsingSession.run(session, async () => {
    try { return await operation(); }
    finally { session.closed = true; session.buffers = null; session.strings = null; }
  });
}
function freezeJSON(value) {
  const pending = [value];
  while (pending.length) {
    const item = pending.pop();
    if (item && typeof item === 'object') {
      for (const child of Object.values(item)) pending.push(child);
      Object.freeze(item);
    }
  }
  return value;
}
// Evidence-loss historically uses JSON.parse(value), while other bank paths
// explicitly call value.toString(). Preserve that distinction for special input.
export function parseImmutableBankValue(raw) {
  return ordinaryBuffer(raw) || typeof raw === 'string' ? parseImmutableBank(raw) : JSON.parse(raw);
}
export function parseImmutableBank(raw) {
  const session = bankParsingSession.getStore();
  // Preserve standalone API behavior. Unusual caller-owned values are never
  // adopted as reusable byte authority, even inside a session.
  const buffer = ordinaryBuffer(raw);
  if (!session || session.closed || (!buffer && typeof raw !== 'string')) return JSON.parse(raw.toString());
  if (session.changed) throw new Error('Immutable bank bytes changed during parsing session');
  const entries = buffer ? session.buffers : session.strings;
  const previous = entries.get(raw);
  if (previous) {
    if (buffer && Buffer.compare(raw, previous.bytes) !== 0) {
      session.changed = true;
      throw new Error('Immutable bank bytes changed during parsing session');
    }
    return previous.value;
  }
  const bytes = buffer ? Buffer.from(raw) : raw;
  const value = freezeJSON(JSON.parse(bytes.toString()));
  entries.set(raw, {bytes, value});
  return value;
}

export const QUARANTINE_TRUST_PATH='docs/quarantines/trust.json';
const ROOT=path.resolve(import.meta.dirname,'..');
const hash=value=>createHash('sha256').update(value).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export const quarantineHash=value=>hash(JSON.stringify(canonical(value)));
/** Only truthful publication/reporting metadata may subsequently change. */
export function quarantineDecisionHash(ledger) {
  const copy=structuredClone(ledger);
  for(const key of ['publication','coverageAfter','validation','summary'])delete copy[key];
  if(copy.counts)for(const key of ['publishedRegularWrittenBySubject','publishedRegularPractical'])delete copy.counts[key];
  for(const c of copy.candidates||[])delete c.publishedBankVersion;
  return quarantineHash(copy);
}
const fail=message=>{throw Error('prepublication quarantine: '+message);};
const hex=/^[a-f0-9]{64}$/,id=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/;
const keys=(value,expected)=>{if(!value||Array.isArray(value)||!equal(Object.keys(value).sort(),[...expected].sort()))fail('unexpected audit fields');};
const time=value=>{const at=Date.parse(value);if(typeof value!=='string'||!Number.isFinite(at)||at>=FREEZE_AT)fail('invalid audit time or final cutoff');return at;};
const sorted=values=>[...values].sort();
const immutable=p=>p.startsWith('data/releases/')||/^data\/seed-bank(?:-v\d+)?\.json$/.test(p)||/^docs\/(?:rounds\/round-\d+\.(?:json|md)|corrections\/|publications\/)/.test(p)||(p.startsWith('docs/deliveries/')&&!p.endsWith('trust.json'))||/^docs\/quarantines\/(?!trust\.json)[^/]+\.json$/.test(p);
const safe=p=>typeof p==='string'&&/^[A-Za-z0-9._/-]+$/.test(p)&&!p.startsWith('/')&&!p.split('/').some(v=>!v||v==='.'||v==='..');

/** Canonical complete question plus exactly its linked options, before release metadata changes. */
export function quarantineContent(question,options=[]) {
  if(!question||!Array.isArray(options))fail('exact question/options required');
  const linked=(question.links||[]).map(link=>{
    const found=options.filter(o=>o?.optionId===link.optionId);
    if(found.length!==1||found[0].revision!==link.optionRevision)fail('missing, duplicate or mismatched linked option');
    return found[0];
  });
  if(options.length!==linked.length||new Set(linked.map(o=>o.optionId)).size!==linked.length)fail('option payload is not exact');
  return {question,options:linked};
}
export const quarantineContentHash=(question,options)=>quarantineHash(quarantineContent(question,options));
/** Collision fingerprint, not semantic equivalence. IDs, source labels, review metadata,
 * revisions, material filenames and choice order cannot disguise the same held content. */
export function quarantineFingerprint(question,options=[]) {
  const content=quarantineContent(question,options);
  const order=values=>values.sort((a,b)=>{const x=JSON.stringify(canonical(a)),y=JSON.stringify(canonical(b));return x<y?-1:x>y?1:0;});
  // Explicit semantic projection: arbitrary extra metadata must not alter this
  // denial fingerprint. An evolving content schema requires independent review.
  const q={type:question.type,stem:question.stem,notes:question.notes||[],explanation:question.explanation,
    materials:order((question.materials||[]).map(m=>({content:m.content,purpose:m.purpose||'explanation',instruction:m.instruction||''})))};
  if(question.type==='written')q.links=order((question.links||[]).map(link=>{
    const option=content.options.find(o=>o.optionId===link.optionId);
    return {role:link.role,contextExplanation:link.contextExplanation||'',content:option.content,explanation:option.explanation};
  }));
  if(question.type==='practical'){
    q.parts=(question.parts||[]).map(part=>{
      const out={prompt:part.prompt,kind:part.kind,points:part.points,explanation:part.explanation};
      if(part.choices){
        if((part.correct||[]).some(v=>!part.choices.some(c=>c.id===v)))fail('invalid practical answer references');
        out.choices=order(part.choices.map(c=>({text:c.text,explanation:c.explanation||'',correct:(part.correct||[]).includes(c.id)})));
      }else{out.accepted=sorted(part.accepted||[]);out.normalization=part.normalization;}
      return out;
    });
    q.referenceAnswer=question.referenceAnswer||'';q.freeResponsePrompt=question.freeResponsePrompt||'';
    q.rubric=(question.rubric||[]).map(r=>({criterion:r.criterion,points:r.points,description:r.description}));
  }
  return quarantineHash(q);
}

function registry(value) {
  keys(value,['schemaVersion','kind','audits']);
  if(value.schemaVersion!==1||value.kind!=='reviewed_prepublication_quarantines'||!Array.isArray(value.audits))fail('invalid trust registry');
  const seen=new Set();let last=-Infinity;
  for(const pin of value.audits){
    keys(pin,['auditId','roundId','path','sha256','recordedAt']);
    if(!id.test(pin.auditId)||!id.test(pin.roundId)||pin.path!==`docs/quarantines/${pin.auditId}.json`||!hex.test(pin.sha256)||seen.has(pin.auditId)||time(pin.recordedAt)<=last)fail('duplicate, reordered or invalid trust pin');
    seen.add(pin.auditId);last=time(pin.recordedAt);
  }
  return value;
}
const trusted=registry(structuredClone(reviewedTrust));
const prefix=n=>({...trusted,audits:trusted.audits.slice(0,n)});
function audit(raw,pin,index) {
  if(hash(raw)!==pin.sha256)fail('missing, tampered or unreviewed audit bytes');
  const a=JSON.parse(raw);
  keys(a,['schemaVersion','kind','auditId','campaignId','roundId','recordedAt','sourceDecisionSha256','previousAuditSha256','priorTrustSha256','boundary','targets']);
  if(!equal(raw,json(a))||a.schemaVersion!==1||a.kind!=='pre_first_release_quarantine'||a.auditId!==pin.auditId||a.roundId!==pin.roundId||a.recordedAt!==pin.recordedAt||!hex.test(a.sourceDecisionSha256)||!id.test(a.campaignId)||a.previousAuditSha256!==(trusted.audits[index-1]?.sha256??null)||a.priorTrustSha256!==hash(json(prefix(index)))||!Array.isArray(a.targets)||!a.targets.length)fail('invalid or branched audit');
  const b=a.boundary;keys(b,['observedAt','manifestRaw','publicationStateRaw','deliveredManifestRaw','deliveredPublicationStateRaw','priorFiles','independentReviewSha256']);
  if(time(b.observedAt)>time(a.recordedAt)||!hex.test(b.independentReviewSha256)||!Array.isArray(b.priorFiles)||!b.priorFiles.length)fail('missing independently reviewed first-release boundary');
  for(const raw of [b.manifestRaw,b.deliveredManifestRaw])if(JSON.parse(raw).finalRelease!==false)fail('source or delivered manifest was frozen');
  for(const raw of [b.publicationStateRaw,b.deliveredPublicationStateRaw])if(JSON.parse(raw).finalized!==false)fail('source or delivered publication state was frozen');
  const paths=new Set();
  for(const f of b.priorFiles){keys(f,['path','sha256','bytes']);if(!safe(f.path)||paths.has(f.path)||!hex.test(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<0)fail('invalid boundary inventory');paths.add(f.path);}
  for(const [p,raw]of [['data/manifest.json',b.manifestRaw],['data/publication-state.json',b.publicationStateRaw]])if(!b.priorFiles.some(f=>f.path===p&&f.sha256===hash(raw)&&f.bytes===Buffer.byteLength(raw)))fail('source boundary markers are not hash-bound');
  const seen=new Set(),options=new Set();
  for(const t of a.targets){
    keys(t,['candidateId','questionId','revision','learningGoalId','templateId','lineageId','candidateSha256','contentSha256','identityFreeSha256','exclusiveOptionIds','targetPaths','reasonCode','reason','evidence']);
    if(['candidateId','questionId','learningGoalId','templateId','lineageId'].some(k=>!id.test(t[k]))||!Number.isSafeInteger(t.revision)||t.revision<1||['candidateSha256','contentSha256','identityFreeSha256'].some(k=>!hex.test(t[k]))||seen.has(t.candidateId)||!Array.isArray(t.exclusiveOptionIds)||new Set(t.exclusiveOptionIds).size!==t.exclusiveOptionIds.length||t.exclusiveOptionIds.some(v=>!id.test(v)||options.has(v))||!Array.isArray(t.targetPaths)||!t.targetPaths.length||t.targetPaths.some(v=>typeof v!=='string'||!v.startsWith('/question/'))||!id.test(t.reasonCode)||typeof t.reason!=='string'||!t.reason.trim()||!Array.isArray(t.evidence)||!t.evidence.length)fail('invalid or overlapping quarantine target');
    for(const e of t.evidence){keys(e,['kind','sha256']);if(!['original_author','accepted_review','defect_clarification','independent_release_review'].includes(e.kind)||!hex.test(e.sha256))fail('invalid private-evidence digest');}
    if(!['original_author','accepted_review','defect_clarification','independent_release_review'].every(kind=>t.evidence.some(e=>e.kind===kind)))fail('missing independent original/defect evidence');
    seen.add(t.candidateId);t.exclusiveOptionIds.forEach(v=>options.add(v));
  }
  return a;
}
function trustedAudits(){return trusted.audits.map((pin,i)=>({pin,audit:audit(readFileSync(path.join(ROOT,pin.path)),pin,i)}));}
const candidateIdentity=(c,t)=>['candidateId','questionId','learningGoalId','templateId','lineageId'].some(k=>c[k]===t[k]);
const bankIdentity=(q,t)=>['questionId','templateId','learningGoalId'].some(k=>q[k]===t[k]);
const linkedOptions=(bank,q)=>(q.links||[]).map(l=>bank.options.find(o=>o.optionId===l.optionId));
/** Checks a proposed audit against actual private inputs and both source trees.
 * This read-only helper cannot register a pin, authorize omission or certify the
 * semantics/independence of its reviewer. A separate exact-byte review is required. */
export async function reviewQuarantineProposal(proposal,{sourceRoot,deliveredRoot,ledger,candidatePackages,evidenceBytes,now=Date.now()}={}) {
  const errors=[];let pin;
  try {
    pin={auditId:proposal.auditId,roundId:proposal.roundId,path:`docs/quarantines/${proposal.auditId}.json`,sha256:hash(json(proposal)),recordedAt:proposal.recordedAt};
    const a=audit(json(proposal),pin,trusted.audits.length),b=a.boundary;
    if(!Number.isFinite(now)||now>=FREEZE_AT||time(a.recordedAt)>now||!ledger||ledger.status!=='closed'||ledger.roundId!==a.roundId||ledger.campaignId!==a.campaignId||!['not_attempted','blocked'].includes(ledger.publication.status)||['commit','bankVersion','bankSha256','verifiedAt'].some(k=>ledger.publication[k]!==null)||time(a.recordedAt)<Date.parse(ledger.closedAt)||time(b.observedAt)<Date.parse(ledger.startedAt))fail('proposal requires the current closed unpublished round before cutoff');
    if(!(candidatePackages instanceof Map)||candidatePackages.size!==ledger.candidates.length||!(evidenceBytes instanceof Map))fail('all exact candidate packages and private evidence bytes are required');
    for(const [root,m,s]of [[sourceRoot,b.manifestRaw,b.publicationStateRaw],[deliveredRoot,b.deliveredManifestRaw,b.deliveredPublicationStateRaw]]){
      if(!root||!equal(await bytes(root,'data/manifest.json'),Buffer.from(m))||!equal(await bytes(root,'data/publication-state.json'),Buffer.from(s)))fail('fresh source/delivered freeze markers differ from the proposal');
    }
    const sourcePaths=(await bytes(sourceRoot,'PUBLICATION-MANIFEST.txt')).toString().split(/\r?\n/).map(v=>v.trim()).filter(v=>v&&!v.startsWith('#'));
    if(!equal(sorted(sourcePaths),sorted(b.priorFiles.map(f=>f.path))))fail('first-release inventory must equal the complete prior public allowlist');
    if(quarantineDecisionHash(ledger)!==a.sourceDecisionSha256)fail('original source closure or terminal decision history changed');
    if(sourcePaths.includes(QUARANTINE_TRUST_PATH)){if(hash(await bytes(sourceRoot,QUARANTINE_TRUST_PATH))!==a.priorTrustSha256)fail('source does not carry the exact prior trust prefix');}
    else if(trusted.audits.length)fail('source omitted previous quarantine trust');
    const previousBanks=[];
    for(const f of b.priorFiles){const raw=await bytes(sourceRoot,f.path);if(raw.length!==f.bytes||hash(raw)!==f.sha256)fail('source inventory changed: '+f.path);if(/^data\/releases\/[^/]+\/bank\.json$/.test(f.path))previousBanks.push(JSON.parse(raw));}
    if(!previousBanks.length)fail('whole historical bank inventory is missing');
    if(!evidenceBytes.has(b.independentReviewSha256)||hash(evidenceBytes.get(b.independentReviewSha256))!==b.independentReviewSha256)fail('independent initial registration evidence is missing or changed');
    for(const c of ledger.candidates){
      const p=candidatePackages.get(c.candidateId);
      if(!p||p.question.questionId!==c.questionId||p.question.revision!==c.revision)fail('candidate package identity/revision mismatch');
      quarantineContent(p.question,p.options);
    }
    for(const t of a.targets){
      const c=ledger.candidates.find(c=>c.candidateId===t.candidateId),p=candidatePackages.get(t.candidateId);
      if(!c||c.decision!=='accepted'||c.publishedBankVersion!==null||quarantineHash(c)!==t.candidateSha256||['questionId','revision','learningGoalId','templateId','lineageId'].some(k=>c[k]!==t[k])||c.cycles.at(-1)?.outcome!=='accepted'||Date.parse(c.cycles.at(-1).finishedAt)>time(a.recordedAt))fail('proposal is not the exact accepted terminal candidate');
      if(p.question.testOnly!==false||p.question.type==='written'&&p.question.optionMode!=='exclusive'||quarantineContentHash(p.question,p.options)!==t.contentSha256||quarantineFingerprint(p.question,p.options)!==t.identityFreeSha256||!equal(sorted(p.options.map(o=>o.optionId)),sorted(t.exclusiveOptionIds)))fail('proposal content hash, exclusive options or collision fingerprint mismatch');
      for(const other of candidatePackages.values())if(other!==p&&(other.question.links||[]).some(l=>t.exclusiveOptionIds.includes(l.optionId)))fail('held options overlap another candidate');
      for(const bank of previousBanks){
        if(bank.questions.some(q=>bankIdentity(q,t)||quarantineFingerprint(q,linkedOptions(bank,q))===t.identityFreeSha256)||(bank.options||[]).some(o=>t.exclusiveOptionIds.includes(o.optionId)))fail('target or options already exist in an immutable bank');
      }
      for(const e of t.evidence)if(!evidenceBytes.has(e.sha256)||hash(evidenceBytes.get(e.sha256))!==e.sha256)fail('original or independent private evidence is missing or changed');
    }
  }catch(error){errors.push(error.message);}
  return {ok:!errors.length,errors,status:'proposal_requires_independent_registration',registered:false,pin};
}
export function assertNoQuarantinedContent(bank) {
  const targets=trustedAudits().flatMap(({audit:a})=>a.targets);
  if(!targets.length)return bank;
  const fingerprints=new Set(targets.map(t=>t.identityFreeSha256)),optionIds=new Set(targets.flatMap(t=>t.exclusiveOptionIds));
  const options=new Map((bank.options||[]).map(o=>[o.optionId,o]));
  for(const q of bank.questions||[])if(targets.some(t=>bankIdentity(q,t))||fingerprints.has(quarantineFingerprint(q,(q.links||[]).map(l=>options.get(l.optionId)))))fail(`held content or renamed collision in bank: ${q.questionId}`);
  if((bank.options||[]).some(o=>optionIds.has(o.optionId)))fail('held exclusive options cannot be released, shared or orphaned');
  return bank;
}
const checkedBankHashes=new Set();

/** Original accepted records stay reserved. No caller-supplied exclusion list is trusted. */
export function validateQuarantineCampaign(ledgers,{banks=new Map(),ledgerSources=new Map(),now=null,publicationState=null,manifest=null}={}) {
  const errors=[],dispositions=new Map();
  for(const r of ledgers||[]){const accepted=r.candidates?.filter(c=>c.decision==='accepted').map(c=>c.candidateId)||[];dispositions.set(r.roundId,{roundId:r.roundId,acceptedCandidateIds:accepted,quarantinedCandidateIds:[],eligibleCandidateIds:[...accepted],auditSha256s:[]});}
  if(!trusted.audits.length){for(const d of dispositions.values())d.counts={accepted:d.acceptedCandidateIds.length,quarantined:0,eligible:d.eligibleCandidateIds.length};return {ok:true,errors,dispositions};}
  try {
    const entries=banks instanceof Map?[...banks]:Object.entries(banks);
    const parsed=entries.map(([v,e])=>[v,parseImmutableBank(e.raw??e),e.raw??e]);
    for(const [,bank,raw]of parsed){const sha=hash(raw);if(!checkedBankHashes.has(sha)){assertNoQuarantinedContent(bank);checkedBankHashes.add(sha);}}
    for(const {pin,audit:a}of trustedAudits()){
      const source=ledgers.find(r=>r.roundId===a.roundId);
      const relevant=source||now!==null&&now>=time(a.recordedAt)||ledgers.some(r=>Date.parse(r.startedAt)>=time(a.recordedAt)||(r.candidates||[]).some(c=>a.targets.some(t=>candidateIdentity(c,t))));
      if(!relevant)continue;
      if(!source||source.campaignId!==a.campaignId)fail('missing original source round in campaign');
      if(quarantineDecisionHash(source)!==a.sourceDecisionSha256)fail('original source closure or terminal decision history changed');
      if(now!==null&&(!Number.isFinite(now)||now<time(a.recordedAt)))fail('future audit cannot authorize an earlier release');
      if(now!==null&&(now>=FREEZE_AT||publicationState?.finalized||manifest?.finalRelease))fail('current freeze or cutoff blocks quarantine eligibility');
      if(time(a.boundary.observedAt)<Date.parse(source.startedAt))fail('boundary observation predates this round');
      for(const f of a.boundary.priorFiles){
        let raw;
        const version=/^data\/releases\/([^/]+)\/bank\.json$/.exec(f.path)?.[1];
        const round=/^docs\/rounds\/(round-[^.]+)\.json$/.exec(f.path)?.[1];
        if(version)raw=entries.find(([v])=>v===version)?.[1];
        else if(round)raw=ledgerSources.get(round);
        else continue;
        raw=raw?.raw??raw;
        if(!raw||hash(raw)!==f.sha256||Buffer.byteLength(raw)!==f.bytes)fail('missing or changed whole-history first-release evidence: '+f.path);
      }
      const released=parsed.find(([version])=>version===source.publication?.bankVersion)?.[1];
      if(released&&Date.parse(released.releasedAt)<time(a.recordedAt))fail('release predates its quarantine audit');
      const d=dispositions.get(a.roundId);
      for(const t of a.targets){
        const c=source.candidates.find(c=>c.candidateId===t.candidateId),last=c?.cycles?.at(-1);
        if(!c||c.decision!=='accepted'||c.publishedBankVersion!==null||quarantineHash(c)!==t.candidateSha256||['questionId','learningGoalId','templateId','lineageId','revision'].some(k=>c[k]!==t[k])||last?.outcome!=='accepted'||last.revision!==c.revision||Date.parse(last.finishedAt)>time(a.recordedAt))fail('original terminal candidate/revision/history changed or was published');
        if(ledgers.some(r=>(r.candidates||[]).some(other=>other!==c&&candidateIdentity(other,t))))fail('quarantined goal, template, lineage or candidate reintroduced');
        if(d.quarantinedCandidateIds.includes(c.candidateId))fail('duplicate or conflicting quarantine alias');
        d.quarantinedCandidateIds.push(c.candidateId);d.eligibleCandidateIds=d.eligibleCandidateIds.filter(v=>v!==c.candidateId);
      }
      d.auditSha256s.push(pin.sha256);
    }
  }catch(error){errors.push(error.message);}
  for(const d of dispositions.values())d.counts={accepted:d.acceptedCandidateIds.length,quarantined:d.quarantinedCandidateIds.length,eligible:d.eligibleCandidateIds.length};
  return {ok:!errors.length,errors,dispositions};
}

/** Checks the actual frozen complete bytes before packaging, without consulting
 * mutable candidate files or trusting an exclusion list from a caller. */
export function validateQuarantineSnapshot(files,{now=null}={}) {
  const byPath=new Map(files.map(f=>[f.path,f.raw])),raw=byPath.get(QUARANTINE_TRUST_PATH);
  const modern=byPath.get('scripts/validate-round.mjs')?.toString().includes('loadQuarantineDependencies');
  if(modern&&!raw)fail('frozen source omitted its trust registry');
  const local=raw?registry(JSON.parse(raw)):prefix(0);
  if(!equal(local,prefix(local.audits.length))||raw&&!equal(raw,json(local)))fail('frozen source has an unreviewed trust prefix');
  if((modern||raw)&&!byPath.has('scripts/prepublication-quarantine.mjs'))fail('frozen source omitted its quarantine validator');
  if(!trusted.audits.length)return {ok:true,errors:[],dispositions:new Map()};
  if(local.audits.length&&(!byPath.has('data/manifest.json')||!byPath.has('data/publication-state.json')||JSON.parse(byPath.get('data/manifest.json'))?.finalRelease!==false||JSON.parse(byPath.get('data/publication-state.json'))?.finalized!==false))fail('frozen quarantine packaging requires both explicit false freeze markers');
  for(const [i,pin]of local.audits.entries()){
    if(!byPath.has(pin.path))fail('frozen source omitted a required audit');
    const a=audit(byPath.get(pin.path),pin,i);
    for(const f of a.boundary.priorFiles.filter(f=>immutable(f.path))){const b=byPath.get(f.path);if(!b||hash(b)!==f.sha256||b.length!==f.bytes)fail('frozen source changed immutable pre-quarantine history');}
  }
  const banks=new Map(),ledgers=[],ledgerSources=new Map();
  for(const [p,raw]of byPath){
    const version=/^data\/releases\/([^/]+)\/bank\.json$/.exec(p)?.[1];
    const round=/^docs\/rounds\/(round-[^.]+)\.json$/.exec(p)?.[1];
    if(version)banks.set(version,{raw});
    if(round&&!['round-ledger.schema','round-ledger.template'].includes(round)){const ledger=JSON.parse(raw);if(ledger.ledgerSchemaVersion){ledgers.push(ledger);ledgerSources.set(ledger.roundId,raw);}}
  }
  for(const {audit:a}of trustedAudits().slice(local.audits.length))if(now!==null&&now>=time(a.recordedAt)||ledgers.some(r=>r.roundId===a.roundId||Date.parse(r.startedAt)>=time(a.recordedAt)||(r.candidates||[]).some(c=>a.targets.some(t=>candidateIdentity(c,t)))))fail('frozen source omitted a mandatory trusted audit tail');
  if(local.audits.some(pin=>!ledgers.some(r=>r.roundId===pin.roundId)))fail('frozen installed audit is missing its original source ledger');
  const checked=validateQuarantineCampaign(ledgers,{banks,ledgerSources,now,manifest:byPath.has('data/manifest.json')?JSON.parse(byPath.get('data/manifest.json')):null,publicationState:byPath.has('data/publication-state.json')?JSON.parse(byPath.get('data/publication-state.json')):null});
  if(!checked.ok)fail(checked.errors.join('; '));
  return checked;
}

async function bytes(root,relative){
  if(!safe(relative))fail('unsafe evidence path');
  for(let p=path.resolve(root);;p=path.dirname(p)){if((await fs.lstat(p)).isSymbolicLink())fail('symlink evidence root');if(path.dirname(p)===p)break;}
  let p=path.resolve(root);for(const [i,part]of relative.split('/').entries()){p=path.join(p,part);const s=await fs.lstat(p);if(s.isSymbolicLink()||(i===relative.split('/').length-1?!s.isFile():!s.isDirectory()))fail('nonregular evidence path');}
  return fs.readFile(p);
}
/** A candidate root can carry only an exact trusted prefix. Old exact archives
 * predating an audit need no future files and receive no current release authority. */
export async function loadQuarantineDependencies(root,context={}) {
  let raw;try{raw=await bytes(root,QUARANTINE_TRUST_PATH);}catch(e){if(e.code!=='ENOENT')throw e;}
  let validator='';try{validator=(await bytes(root,'scripts/validate-round.mjs')).toString();}catch(e){if(e.code!=='ENOENT')throw e;}
  const modern=validator.includes('loadQuarantineDependencies');
  if(modern&&!raw)fail('missing quarantine trust registry');
  const local=raw?registry(JSON.parse(raw)):prefix(0);
  if(!equal(local,prefix(local.audits.length))||raw&&!equal(raw,json(local)))fail('unreviewed, rewritten or reordered trust prefix');
  const allowed=modern||raw?new Set((await bytes(root,'PUBLICATION-MANIFEST.txt')).toString().split(/\r?\n/).map(v=>v.trim()).filter(v=>v&&!v.startsWith('#'))):new Set();
  if(modern||raw)for(const p of [QUARANTINE_TRUST_PATH,'scripts/prepublication-quarantine.mjs'])if(!allowed.has(p))fail('quarantine dependency absent from allowlist');
  const all=trustedAudits();
  for(const {pin,audit:a}of all.slice(local.audits.length))if(context.now!==null&&context.now!==undefined&&context.now>=time(a.recordedAt)||(context.ledgers||[]).some(r=>r.roundId===a.roundId||Date.parse(r.startedAt)>=time(a.recordedAt)||(r.candidates||[]).some(c=>a.targets.some(t=>candidateIdentity(c,t)))))fail('missing mandatory quarantine audit for source or successor');
  for(const [i,pin]of local.audits.entries()){
    if(!allowed.has(pin.path))fail('audit absent from reviewed allowlist');
    const a=audit(await bytes(root,pin.path),pin,i);
    if(!(context.ledgers||[]).some(r=>r.roundId===a.roundId))fail('registered audit requires its original source ledger');
    for(const f of a.boundary.priorFiles.filter(f=>immutable(f.path))){const b=await bytes(root,f.path);if(hash(b)!==f.sha256||b.length!==f.bytes)fail('immutable pre-quarantine history changed: '+f.path);}
  }
  const checked=validateQuarantineCampaign(context.ledgers||[],context);
  if(!checked.ok)fail(checked.errors.join('; '));
  return checked.dispositions;
}
