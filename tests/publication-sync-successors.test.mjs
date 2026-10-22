/** Real reviewed publication evidence; synthetic successor inputs are never executed or published. */
import test, {after} from 'node:test';
import {createOwnedHistoricalAuthority,createOwnedHistoricalSource} from './historical-authority-fixtures.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {loadRoundContext,regularCoverage,auditHistoricalRelease} from '../scripts/validate-round.mjs';
import {FREEZE_AT} from '../src/domain.js';
const root=path.resolve(import.meta.dirname,'..'),hash=b=>createHash('sha256').update(b).digest('hex'),json=o=>JSON.stringify(o,null,2)+'\n';
const loaded=await loadRoundContext(root,null,{release:true}),proof=loaded.synchronizations.find(e=>e.syncId==='cumulative-009-017');
const laterAuthorities=loaded.synchronizations.slice(loaded.synchronizations.indexOf(proof)+1);
loaded.synchronizations=loaded.synchronizations.slice(0,loaded.synchronizations.indexOf(proof)+1);
// This historical delivery fixture excludes later normal remote-backed rounds
// whose genuine baseline authority is deliberately outside this event prefix.
const excludedFixtureRounds=new Set(loaded.ledgers.filter(l=>!l.baseline?.offlinePredecessor&&laterAuthorities.some(e=>l.baseline?.bankVersion===e.manifest.bankVersion&&Date.parse(l.startedAt)>=Date.parse(e.verifiedAt))).map(l=>l.roundId));
// A delivered descendant cannot retain a baseline whose normal source was
// removed with its later publication authority. Keep unrelated offline chains.
let excludedMore;
do{excludedMore=false;for(const l of loaded.ledgers){if(excludedFixtureRounds.has(l.baseline?.offlinePredecessor?.roundId)&&!excludedFixtureRounds.has(l.roundId)){excludedFixtureRounds.add(l.roundId);excludedMore=true;}}}while(excludedMore);
loaded.ledgers=loaded.ledgers.filter(l=>!excludedFixtureRounds.has(l.roundId));
const fixtureTip=loaded.ledgers.filter(l=>l.publication?.bankVersion&&l.publication.status==='not_attempted').sort((a,b)=>Date.parse(a.startedAt)-Date.parse(b.startedAt)).at(-1),fixtureBank=JSON.parse(loaded.banks.get(fixtureTip.publication.bankVersion).raw);
loaded.manifest={...loaded.manifest,bankVersion:fixtureBank.bankVersion,releasedAt:fixtureBank.releasedAt,file:`releases/${fixtureBank.bankVersion}/bank.json`,sha256:fixtureTip.publication.bankSha256,changeSummary:fixtureBank.changeSummary};

// The existing event prefix retains its independent offline descendants but
// ends before later editorial authorities. This boundary binds fixture inputs;
// it never replaces any production validator's existing now argument.
// Every retained closed round and its delivered checkpoint must already exist
// at this owned historical observation; the next authority is still excluded.
const fixtureRoundIds=new Set(loaded.ledgers.map(l=>l.roundId));
const fixtureTimes=[Date.parse(proof.verifiedAt),
 ...loaded.ledgers.flatMap(l=>[l.startedAt,l.closedAt].filter(Boolean).map(Date.parse)),
 ...[...loaded.offlineBases.values()].filter(e=>fixtureRoundIds.has(e.roundId)).flatMap(e=>[e.recordedAt,e.eligibleAt].map(Date.parse)),
 ...[...loaded.deliveryCheckpointSources].filter(([id])=>fixtureRoundIds.has(id)).map(([,raw])=>Date.parse(JSON.parse(raw).verifiedAt))];
assert(fixtureTimes.every(Number.isFinite),'Retained historical fixture timestamps must be finite');
const fixtureBoundary=Math.max(...fixtureTimes);
assert(fixtureBoundary<Math.min(...laterAuthorities.map(e=>Date.parse(e.verifiedAt))),'Retained delivery must precede the excluded next authority');
assert(fixtureBoundary<Date.parse('2026-10-10T11:52:01.012Z'),'Historical fixture remains before the existing selection boundary');
// Pure assertions below own this historical prefix; current-loader tests retain the actual clock.
const now=fixtureBoundary;
loaded.editorials=loaded.editorials.filter(e=>Date.parse(e.startedAt)<=fixtureBoundary);
const authority=await createOwnedHistoricalAuthority({after});
const {validateRoundLedgers,validateReleaseLedger}=authority.round;
const {validatePublicationSynchronizations,validatePublicationEvidenceOrder,validateSynchronizationDeliveryProof}=authority.publication;
loaded.publicationSelections=authority.bindHistoricalSelection({...loaded,now:fixtureBoundary});
function validateCampaignBaselines(ledgers,options) {
 const binding=authority.bindSyntheticRoundSources({historicalLedgers:loaded.ledgers,historicalSources:loaded.ledgerSources,syntheticLedgers:ledgers.filter(r=>r.roundId==='round-publication-baseline-fixture'),validationSources:options.ledgerSources,at:fixtureBoundary});
 return authority.editorial.validateCampaignBaselines(ledgers,{...options,...binding});
}
const publicationPath=`docs/publications/${proof.syncId}.json`;
function failed(result,pattern){assert.equal(result.ok,false);if(pattern)assert.match(result.errors.join('\n'),pattern);}
function successor(start=new Date(Date.parse(proof.verifiedAt)+1).toISOString()){
 const bank=JSON.parse(loaded.banks.get(proof.manifest.bankVersion).raw);
 return {roundId:'round-publication-baseline-fixture',startedAt:start,baseline:{sourceCommit:proof.commit,bankVersion:bank.bankVersion,bankSha256:proof.manifest.sha256,...regularCoverage(bank)},publication:{status:'not_attempted',bankVersion:null}};
}

test('reviewed successor publication preserves every original ledger, bank and uncertainty byte',()=>{
 assert.ok(proof.previousSynchronizationSha256,'A genuinely reviewed successor event must be registered before this closure is complete');
 const before=loaded.ledgers.map(json),banks=[...loaded.banks].map(([v,e])=>[v,hash(e.raw)]);
 const result=validatePublicationSynchronizations(loaded.synchronizations,{...loaded,now});assert.equal(result.ok,true,result.errors.join('\n'));assert.equal(result.history.find(e=>e.syncId===proof.syncId).publication.bankVersion,proof.manifest.bankVersion);
 const roundCheck=validateRoundLedgers(loaded.ledgers,{...loaded,now});assert.equal(roundCheck.ok,true,roundCheck.errors.join('\n'));const releaseCheck=validateReleaseLedger(loaded.ledgers,{...loaded,now});assert.equal(releaseCheck.ok,true,releaseCheck.errors.join('\n'));
 for(const s of proof.rounds){const ledger=loaded.ledgers.find(r=>r.roundId===s.roundId);assert.equal(ledger.publication.status,'not_attempted');assert.equal(ledger.publication.verifiedAt,null);assert(ledger.candidates.every(c=>c.publishedBankVersion===null));assert.equal(hash(loaded.ledgerSources.get(s.roundId)),s.originalLedgerSha256);assert.equal(hash(loaded.banks.get(s.bankVersion).raw),s.bankSha256);}
 const bank=JSON.parse(loaded.banks.get(proof.manifest.bankVersion).raw),regular=bank.questions.filter(q=>!q.testOnly),prior=loaded.synchronizations.find(e=>e.syncId==='cumulative-006-008');
 assert.equal(proof.counts.regular,regular.length);assert.equal(proof.counts.written,regular.filter(q=>q.type==='written').length);assert.equal(proof.counts.practical,regular.filter(q=>q.type==='practical').length);assert.equal(proof.counts.testOnly,bank.questions.filter(q=>q.testOnly).length);assert.equal(proof.counts.newlyPublicFromAnchor,regular.length-prior.counts.regular);assert.equal(proof.rounds.reduce((n,s)=>n+s.accepted,0),proof.counts.newlyPublicFromAnchor);
 assert.deepEqual(loaded.ledgers.map(json),before);assert.deepEqual([...loaded.banks].map(([v,e])=>[v,hash(e.raw)]),banks);
});
test('new normal baseline uses latest public bank only after actual verification',()=>{
 const r=successor(),base={...loaded,now},baselineCheck=validateCampaignBaselines([...loaded.ledgers,r],base);assert.equal(baselineCheck.ok,true,baselineCheck.errors.join('\n'));
 failed(validateCampaignBaselines([...loaded.ledgers,r],{...base,synchronizations:loaded.synchronizations.slice(0,-1)}),/offline predecessor|latest verified/);
 failed(validateCampaignBaselines([...loaded.ledgers,successor(new Date(Date.parse(proof.verifiedAt)-1).toISOString())],base),/offline predecessor|latest verified/);
 const earlier={...loaded,now:Date.parse(proof.verifiedAt)-1};const future=validatePublicationSynchronizations(loaded.synchronizations,earlier);assert.equal(future.ok,true,future.errors.join('\n'));assert(!future.history.some(h=>h.syncId===proof.syncId));
 const stale=successor();stale.baseline.bankVersion=loaded.synchronizations[0].manifest.bankVersion;stale.baseline.bankSha256=loaded.synchronizations[0].manifest.sha256;failed(validateCampaignBaselines([...loaded.ledgers,stale],base),/latest verified/);
 failed(validateReleaseLedger(loaded.ledgers,{...loaded,now,manifest:loaded.synchronizations[0].manifest}),/older than the latest/);
});
test('proof ordering, branch, Boolean/Map substitution, future tamper and original review changes fail closed',()=>{
 for(const values of [true,new Map(),[...loaded.synchronizations].reverse(),[proof], [...loaded.synchronizations,proof]])assert.throws(()=>validatePublicationEvidenceOrder(values),/array|Missing|reordered|tampered/);
 for(const alter of [p=>p.previousSynchronizationSha256='1'.repeat(64),p=>p.commit='1'.repeat(40),p=>p.pages.conclusion='failure',p=>p.verifiedAt=new Date(FREEZE_AT).toISOString(),p=>p.rounds.pop(),p=>p.rounds.reverse(),p=>p.rounds[0].deliveryProof.sha256='1'.repeat(64)]){
  const list=structuredClone(loaded.synchronizations);alter(list.at(-1));failed(validatePublicationSynchronizations(list,{...loaded,now:Date.parse(proof.verifiedAt)-1}),/tampered|reordered/);
 }
 const ledgers=structuredClone(loaded.ledgers);ledgers.at(-1).candidates[0].attemptCount=4;failed(validateRoundLedgers(ledgers,{...loaded,now}));
 const sources=new Map(loaded.ledgerSources);sources.set(proof.rounds.at(-1).roundId,Buffer.from('{}'));failed(validatePublicationSynchronizations(loaded.synchronizations,{...loaded,ledgerSources:sources,now}),/exact original/);
 const future=Date.parse(proof.verifiedAt)-1;failed(validatePublicationSynchronizations(loaded.synchronizations,{...loaded,ledgerSources:sources,now:future}),/exact original/);
 const banks=new Map(loaded.banks);banks.set(proof.manifest.bankVersion,{raw:Buffer.from('{}')});failed(validatePublicationSynchronizations(loaded.synchronizations,{...loaded,banks,now:future}),/exact immutable/);
});
test('original delivery checkpoints are byte-bound and preserve the fixed unknown origin',async()=>{
 for(const s of proof.rounds){const raw=await fs.readFile(path.join(root,s.deliveryProof.path)),p=validateSynchronizationDeliveryProof(proof,s,raw);assert.equal(p.terminal?.gitOutcome.objects??p.origin.gitOutcome.objects,'unknown');assert.equal(p.terminal?.reconciliation.firstUnresolvedAt??p.origin.reconciliation.firstUnresolvedAt,'2026-10-04T10:02:05.215Z');assert.throws(()=>validateSynchronizationDeliveryProof(proof,s,Buffer.concat([raw,Buffer.from(' ')])),/tampered/);}
});
test('current loader requires all current proof dependencies and both freeze fields',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'publication-successor-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.cp(root,dir,{recursive:true});
 // Every mutation is restored. The added typed error alternatives name the exact altered input.
 async function mutate(file,fn,re){const target=path.join(dir,file),original=await fs.readFile(target);try{await fn(target,original);await assert.rejects(loadRoundContext(dir,null,{release:true}),re);}finally{await fs.writeFile(target,original);}}
 await mutate(publicationPath,p=>fs.unlink(p),/ENOENT/);
 await mutate(publicationPath,(p,b)=>fs.writeFile(p,Buffer.concat([b,Buffer.from(' ')])),/proof hash|immutable pre-quarantine history changed: docs\/publications\/cumulative-009-017\.json|^Error: Practical-written registration: Immutable baseline history changed: docs\/publications\/cumulative-009-017\.json$/);
 await mutate(proof.rounds.at(-1).deliveryProof.path,p=>fs.unlink(p),/ENOENT|dependency/);
 await mutate(proof.rounds.at(-1).deliveryProof.path,(p,b)=>fs.writeFile(p,Buffer.concat([b,Buffer.from(' ')])),/tampered|immutable pre-quarantine history changed: docs\/deliveries\/checkpoints\/round-017\.json|^Error: Practical-written registration: Immutable baseline history changed: docs\/deliveries\/checkpoints\/round-017\.json$/);
 await mutate('PUBLICATION-MANIFEST.txt',(p,b)=>fs.writeFile(p,b.toString().split('\n').filter(v=>v!==publicationPath).join('\n')),/dependency/);
 // Current conversion ownership rejects the modified exact manifest before its inner freeze guard.
 for(const [file,key,expected] of [
  ['data/manifest.json','finalRelease',/^Error: Practical-written registration: Active manifest is outside this conversion$/],
  ['data/publication-state.json','finalized',/^Error: Practical-written registration: Persistent freeze blocks conversion$/]
 ])await mutate(file,(p,b)=>fs.writeFile(p,json({...JSON.parse(b),[key]:true})),expected);
 // FREEZE_AT predates the new registration; this is the current typed chronology rejection.
 await assert.rejects(loadRoundContext(dir,null,{release:true,now:FREEZE_AT}),{name:'Error',message:'Practical-written registration: Approval scope or actual chronology differs'});
 // Preserve the separate legacy loader freeze/cutoff assertions on exact, test-owned
 // pre-conversion source. An earlier outer rejection above is not inner execution.
 const historical=await createOwnedHistoricalSource(t);
 const historicalRound=await import(pathToFileURL(path.join(historical,'scripts/validate-round.mjs')).href);
 const historicalManifest=JSON.parse(await fs.readFile(path.join(historical,'data/manifest.json')));
 const historicalNow=Date.parse(historicalManifest.releasedAt)+1;
 assert(historicalNow<FREEZE_AT,'Historical fixture must precede the unchanged cutoff');
 for(const [file,key] of [['data/manifest.json','finalRelease'],['data/publication-state.json','finalized']]){
  const target=path.join(historical,file),original=await fs.readFile(target);
  try{await fs.writeFile(target,json({...JSON.parse(original),[key]:true}));await assert.rejects(historicalRound.loadRoundContext(historical,null,{release:true,now:historicalNow}),/freeze/);}
  finally{await fs.writeFile(target,original);}
 }
 await assert.rejects(historicalRound.loadRoundContext(historical,null,{release:true,now:FREEZE_AT}),/cutoff|freeze/);
 // Separate membership rejection from the independently pinned inventory check.
 // The temporary exact copy intentionally contains only the stated public files;
 // real local-only history remains untouched in both root and this loader copy.
 const exact=await fs.mkdtemp(path.join(os.tmpdir(),'publication-exact-inventory-'));t.after(()=>fs.rm(exact,{recursive:true,force:true}));
 const listed=(await fs.readFile(path.join(dir,'PUBLICATION-MANIFEST.txt'),'utf8')).split(/\r?\n/).map(p=>p.trim()).filter(p=>p&&!p.startsWith('#'));
 for(const file of listed){const target=path.join(exact,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(dir,file),target);}
 const extra=path.join(exact,'unlisted-fixture.txt');await fs.writeFile(extra,'Intentional extra file for membership rejection.\n');
 await assert.rejects(auditHistoricalRelease(exact),/^Error: Historical archive has extra, missing or unlisted source files$/);
 await fs.unlink(extra);
 await assert.rejects(auditHistoricalRelease(exact),/exact independently pinned/);
});
