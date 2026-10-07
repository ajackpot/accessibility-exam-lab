import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadRoundContext, validateRoundLedgers, validateReleaseLedger, regularCoverage} from '../scripts/validate-round.mjs';
import {validateCampaignBaselines} from '../scripts/editorial-ledger.mjs';
import {validatePublicationSynchronizations, resolveSynchronizedArtifacts} from '../scripts/publication-sync.mjs';
import {validateSynchronizedDeliveryChain, validateOfflineContinuation} from '../scripts/download-fallback.mjs';
import {FREEZE_AT} from '../src/domain.js';
const root=path.resolve(import.meta.dirname,'..'),currentNow=Math.max(Date.now(),Date.parse('2026-10-04T12:00:00Z')),now=Date.parse('2026-10-04T12:00:00Z');
const loaded=await loadRoundContext(root,null,{release:true,now:currentNow});
const proof=loaded.synchronizations[0], clone=structuredClone;
// This is the immutable006–008 synchronization fixture, not a moving latest release.
const context={...loaded,ledgerSources:new Map([...loaded.ledgerSources].filter(([id])=>Number(id.slice(6))<=8)),synchronizations:[proof],offlineBases:new Map([...loaded.offlineBases].filter(([,e])=>Number(e.roundId.slice(6))<=8)),ledgers:loaded.ledgers.filter(r=>Number(r.roundId.slice(6))<=8),manifest:proof.manifest};
const index=JSON.parse(await fs.readFile(path.join(root,'docs/deliveries/offline-chain.json')));
function successor(start='2026-10-04T11:00:00Z') {
  const bank=JSON.parse(context.banks.get(proof.manifest.bankVersion).raw),coverage=regularCoverage(bank);
  return {roundId:'round-sync-test-009',startedAt:start,baseline:{sourceCommit:proof.commit,bankVersion:bank.bankVersion,bankSha256:proof.manifest.sha256,...coverage},publication:{status:'not_attempted',bankVersion:null}};
}
function order(r,changes={}) { return validateCampaignBaselines([...context.ledgers,r],{...context,now,...changes}); }
function assertFailure(result,pattern) { assert.equal(result.ok,false); if(pattern)assert.match(result.errors.join('\n'),pattern); }
test('verified payload is a separate current-state event; original006–008 stay byte-exact and unpublished historically',()=>{
  const before=context.ledgers.map(JSON.stringify),checked=validatePublicationSynchronizations(context.synchronizations,{...context,now});
  assert.equal(checked.ok,true,checked.errors.join('\n'));assert.equal(checked.history.length,1);
  assert.equal(checked.history[0].publication.bankVersion,'2026.10.04-regular.8');
  assert.equal(proof.counts.newlyPublicFromAnchor,120);assert.equal(proof.counts.regular,403);
  assert.equal(proof.remoteInventory.length,120);assert.equal(proof.liveAssets.length,29);
  for(const r of context.ledgers.filter(r=>['round-006','round-007','round-008'].includes(r.roundId))) {assert.equal(r.publication.status,'not_attempted');assert.equal(r.publication.verifiedAt,null);assert.ok(r.candidates.every(c=>c.publishedBankVersion===null));}
  assert.deepEqual(context.ledgers.map(JSON.stringify),before);
  const full=validateRoundLedgers(context.ledgers,{...context,now});assert.equal(full.ok,true,full.errors.join('\n'));
  assert.equal(validateReleaseLedger(context.ledgers,{...context,now}).ok,true);
});
test('later009 can use verified regular8, but absent/tampered/unvalidated sync proof and stale baselines cannot',()=>{
  const r=successor(),valid=order(r);assert.equal(valid.ok,true,valid.errors.join('\n'));
  assertFailure(order(r,{synchronizations:[]}),/offline predecessor|latest verified/);
  for(const change of [p=>p.commit='1'.repeat(40),p=>p.pages.conclusion='failure',p=>p.verifiedAt='2026-10-04T07:00:00Z',p=>p.rounds[0].originalLedgerSha256='1'.repeat(64),p=>p.liveAssets.pop(),p=>p.extraPrivateField='no']) {const p=clone(proof);change(p);assertFailure(order(r,{synchronizations:[p]}),/tampered/);}
  assertFailure(order(r,{synchronizations:new Map()}),/array/);
  const stale=successor();Object.assign(stale.baseline,{bankVersion:context.ledgers[4].publication.bankVersion,bankSha256:context.ledgers[4].publication.bankSha256});assertFailure(order(stale),/latest verified/);
});
test('future or during-round verification cannot retroactively authorize a baseline; original earlier histories remain valid',()=>{
  const earlier=Date.parse('2026-10-04T08:30:00Z');
  const c={...context,now:earlier};assert.equal(validatePublicationSynchronizations(c.synchronizations,c).history.length,0);
  assert.equal(validateRoundLedgers(context.ledgers,c).ok,true);
  assertFailure(order(successor('2026-10-04T08:30:00Z')),/offline predecessor|latest verified/);
  assertFailure(order(successor(),{now:earlier}),/offline predecessor|latest verified/);
});
test('newer divergent verified publication wins, and synced current manifest cannot roll back',()=>{
  const r=successor(),later={correctionRoundId:'editorial-sync-test',startedAt:'2026-10-04T09:00:00Z',baseline:clone(r.baseline),publication:{status:'verified',verifiedAt:'2026-10-04T10:00:00Z',bankVersion:'fixture-newer',bankSha256:'f'.repeat(64)}};
  assertFailure(order(r,{editorials:[...context.editorials,later]}),/latest verified/);
  for(const id of ['round-005','round-006','round-007']) {
    const source=context.ledgers.find(r=>r.roundId===id),bank=JSON.parse(context.banks.get(source.publication.bankVersion).raw);
    assertFailure(validateCampaignBaselines(context.ledgers,{...context,now,activeBankVersion:bank.bankVersion}),/older than the latest/);
    assertFailure(validateReleaseLedger(context.ledgers,{...context,now,manifest:{schemaVersion:1,bankVersion:bank.bankVersion,releasedAt:bank.releasedAt,sha256:source.publication.bankSha256,file:`releases/${bank.bankVersion}/bank.json`,changeSummary:bank.changeSummary,finalRelease:false}}));
  }
  assertFailure(validateCampaignBaselines(context.ledgers.filter(r=>r.roundId<='round-006'),{...context,now,activeBankVersion:'2026.10.04-regular.6',offlineBases:new Map()}),/exact original/);
});
test('sync evidence cannot reset original review limits or mask immutable byte changes',()=>{
  for(const mutate of [c=>c.ledgers.find(r=>r.roundId==='round-008').candidates[0].attemptCount=4,c=>c.ledgers.find(r=>r.roundId==='round-008').decisionDeadline='2026-10-05T00:00:00Z',c=>c.ledgerSources.set('round-008',Buffer.from('{}')),c=>c.banks.set(proof.manifest.bankVersion,{raw:Buffer.from('{}')})]) {
    const c={...context,ledgers:clone(context.ledgers),ledgerSources:new Map(context.ledgerSources),banks:new Map(context.banks),now}; mutate(c);
    assertFailure(validateRoundLedgers(c.ledgers,c));
  }
  assertFailure(validatePublicationSynchronizations(context.synchronizations,{...context,now,publicationState:{finalized:true,finalizedAt:'2026-10-04T08:00:00Z'}}),/freeze/);
});
test('exact receipts resolve current content publication without rewriting historical canPublish or old unknown outcome',async()=>{
  const opts={manifests:new Map(index.receipts.map((r,i)=>[r.artifactSha256,index.manifests[i]])),ledgers:context.ledgerSources,banks:new Map([...context.banks].map(([v,e])=>[v,e.raw])),now,publicationState:context.publicationState};
  const result=await validateSynchronizedDeliveryChain(index.receipts,{...opts,synchronizations:context.synchronizations,campaignContext:context});
  assert.equal(result.ok,true,result.errors.join('\n'));assert.deepEqual(result.unresolvedArtifacts,[]);assert.equal(result.canStartNewContent,true);
  const old=validateOfflineContinuation(index.receipts,opts);assert.equal(old.canPublish,false);assert.equal(old.newlyPublishedRegular,0);
  const forged=clone(index.receipts);forged[0].recordedAt='2026-10-04T00:00:00Z';assertFailure(resolveSynchronizedArtifacts(forged,{...context,now}),/exact original/);
  const expired=await validateSynchronizedDeliveryChain(index.receipts,{...opts,now:FREEZE_AT,synchronizations:context.synchronizations,campaignContext:context});assert.equal(expired.canStartNewContent,false);
  const frozen=await validateSynchronizedDeliveryChain(index.receipts,{...opts,publicationState:{finalized:true},synchronizations:context.synchronizations,campaignContext:context});assert.equal(frozen.canStartNewContent,false);
});
test('normal context loader fails closed on missing or tampered proof bytes',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'publication-sync-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  await fs.cp(root,dir,{recursive:true});const p=path.join(dir,'docs/publications/cumulative-006-008.json');
  await fs.appendFile(p,' ');await assert.rejects(loadRoundContext(dir,null,{release:true,now:currentNow}),/proof hash|immutable pre-quarantine history/);
  await fs.unlink(p);await assert.rejects(loadRoundContext(dir,null,{release:true,now:currentNow}),/ENOENT/);
});
