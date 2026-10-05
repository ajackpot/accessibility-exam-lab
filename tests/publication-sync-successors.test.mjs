/** Real reviewed publication evidence; synthetic successor inputs are never executed or published. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadRoundContext,validateRoundLedgers,validateReleaseLedger,regularCoverage,auditHistoricalRelease} from '../scripts/validate-round.mjs';
import {validateCampaignBaselines} from '../scripts/editorial-ledger.mjs';
import {validatePublicationSynchronizations,validatePublicationEvidenceOrder,validateSynchronizationDeliveryProof} from '../scripts/publication-sync.mjs';
import {FREEZE_AT} from '../src/domain.js';
const root=path.resolve(import.meta.dirname,'..'),hash=b=>createHash('sha256').update(b).digest('hex'),json=o=>JSON.stringify(o,null,2)+'\n';
const loaded=await loadRoundContext(root,null,{release:true}),proof=loaded.synchronizations.at(-1),now=Date.now();
const publicationPath=`docs/publications/${proof.syncId}.json`;
function failed(result,pattern){assert.equal(result.ok,false);if(pattern)assert.match(result.errors.join('\n'),pattern);}
function successor(start=new Date(Date.parse(proof.verifiedAt)+1).toISOString()){
 const bank=JSON.parse(loaded.banks.get(proof.manifest.bankVersion).raw);
 return {roundId:'round-publication-baseline-fixture',startedAt:start,baseline:{sourceCommit:proof.commit,bankVersion:bank.bankVersion,bankSha256:proof.manifest.sha256,...regularCoverage(bank)},publication:{status:'not_attempted',bankVersion:null}};
}

test('reviewed successor publication preserves every original ledger, bank and uncertainty byte',()=>{
 assert.ok(proof.previousSynchronizationSha256,'A genuinely reviewed successor event must be registered before this closure is complete');
 const before=loaded.ledgers.map(json),banks=[...loaded.banks].map(([v,e])=>[v,hash(e.raw)]);
 const result=validatePublicationSynchronizations(loaded.synchronizations,{...loaded,now});assert.equal(result.ok,true,result.errors.join('\n'));assert.equal(result.history.at(-1).publication.bankVersion,proof.manifest.bankVersion);
 assert.equal(validateRoundLedgers(loaded.ledgers,{...loaded,now}).ok,true);assert.equal(validateReleaseLedger(loaded.ledgers,{...loaded,now}).ok,true);
 for(const s of proof.rounds){const ledger=loaded.ledgers.find(r=>r.roundId===s.roundId);assert.equal(ledger.publication.status,'not_attempted');assert.equal(ledger.publication.verifiedAt,null);assert(ledger.candidates.every(c=>c.publishedBankVersion===null));assert.equal(hash(loaded.ledgerSources.get(s.roundId)),s.originalLedgerSha256);assert.equal(hash(loaded.banks.get(s.bankVersion).raw),s.bankSha256);}
 const bank=JSON.parse(loaded.banks.get(proof.manifest.bankVersion).raw),regular=bank.questions.filter(q=>!q.testOnly),prior=loaded.synchronizations.at(-2);
 assert.equal(proof.counts.regular,regular.length);assert.equal(proof.counts.written,regular.filter(q=>q.type==='written').length);assert.equal(proof.counts.practical,regular.filter(q=>q.type==='practical').length);assert.equal(proof.counts.testOnly,bank.questions.filter(q=>q.testOnly).length);assert.equal(proof.counts.newlyPublicFromAnchor,regular.length-prior.counts.regular);assert.equal(proof.rounds.reduce((n,s)=>n+s.accepted,0),proof.counts.newlyPublicFromAnchor);
 assert.deepEqual(loaded.ledgers.map(json),before);assert.deepEqual([...loaded.banks].map(([v,e])=>[v,hash(e.raw)]),banks);
});
test('new normal baseline uses latest public bank only after actual verification',()=>{
 const r=successor(),base={...loaded,now};assert.equal(validateCampaignBaselines([...loaded.ledgers,r],base).ok,true);
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
 async function mutate(file,fn,re){const target=path.join(dir,file),original=await fs.readFile(target);try{await fn(target,original);await assert.rejects(loadRoundContext(dir,null,{release:true}),re);}finally{await fs.writeFile(target,original);}}
 await mutate(publicationPath,p=>fs.unlink(p),/ENOENT/);
 await mutate(publicationPath,(p,b)=>fs.writeFile(p,Buffer.concat([b,Buffer.from(' ')])),/proof hash/);
 await mutate(proof.rounds.at(-1).deliveryProof.path,p=>fs.unlink(p),/ENOENT|dependency/);
 await mutate(proof.rounds.at(-1).deliveryProof.path,(p,b)=>fs.writeFile(p,Buffer.concat([b,Buffer.from(' ')])),/tampered/);
 await mutate('PUBLICATION-MANIFEST.txt',(p,b)=>fs.writeFile(p,b.toString().split('\n').filter(v=>v!==publicationPath).join('\n')),/dependency/);
 for(const [file,key] of [['data/manifest.json','finalRelease'],['data/publication-state.json','finalized']])await mutate(file,(p,b)=>fs.writeFile(p,json({...JSON.parse(b),[key]:true})),/freeze/);
 await assert.rejects(loadRoundContext(dir,null,{release:true,now:FREEZE_AT}),/cutoff|freeze/);
 await assert.rejects(auditHistoricalRelease(dir),/exact independently pinned/);
});
