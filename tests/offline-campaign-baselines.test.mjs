import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {validateRoundLedgers, validateReleaseLedger, validateJsonSchema, regularCoverage, loadRoundContext} from '../scripts/validate-round.mjs';
import {validateCampaignBaselines} from '../scripts/editorial-ledger.mjs';

const root=path.resolve(import.meta.dirname,'..'),hash=v=>createHash('sha256').update(v).digest('hex');
const json=v=>Buffer.from(JSON.stringify(v,null,2)+'\n'),clone=v=>structuredClone(v);
const template=JSON.parse(await fs.readFile(path.join(root,'docs/rounds/round-ledger.template.json')));
const originals=[],sources=new Map(),allBanks=new Map(),editorials=[];
for(let i=1;i<=6;i++) {
  const raw=await fs.readFile(path.join(root,`docs/rounds/round-${String(i).padStart(3,'0')}.json`)),ledger=JSON.parse(raw);
  originals.push(ledger);sources.set(ledger.roundId,raw);
}
for(const name of await fs.readdir(path.join(root,'docs/corrections')))if(/^editorial-\d+\.json$/.test(name))editorials.push(JSON.parse(await fs.readFile(path.join(root,'docs/corrections',name))));
for(const name of await fs.readdir(path.join(root,'data/releases')))try {allBanks.set(name,{raw:await fs.readFile(path.join(root,'data/releases',name,'bank.json'))});}catch(e){if(e.code!=='ENOENT')throw e;}
const now=Date.parse('2026-10-04T08:00:00Z'),artifact='a'.repeat(64),manifestHash='b'.repeat(64);
function fixture() {
  const ledgers=clone(originals),source=ledgers.at(-1),r=clone(template),bank=JSON.parse(allBanks.get(source.publication.bankVersion).raw);
  const evidence={roundId:source.roundId,bankVersion:bank.bankVersion,bankSha256:source.publication.bankSha256,ledgerSha256:hash(sources.get(source.roundId)),manifestSha256:manifestHash,baseCommit:source.baseline.sourceCommit,recordedAt:'2026-10-04T01:30:00Z',eligibleAt:'2026-10-04T01:40:00Z'};
  Object.assign(r,{roundId:'round-offline-007',status:'closed',startedAt:'2026-10-04T03:05:00Z',decisionDeadline:'2026-10-04T06:30:00Z',closedAt:'2026-10-04T03:10:00Z',summary:'Synthetic offline campaign regression fixture, never a publication.',noGapExplanation:'The synthetic fixture checks offline predecessor integrity without adding learning goals.'});
  r.baseline={sourceCommit:evidence.baseCommit,bankVersion:bank.bankVersion,bankSha256:evidence.bankSha256,regularWrittenBySubject:regularCoverage(bank).regularWrittenBySubject,regularPractical:regularCoverage(bank).regularPractical,offlinePredecessor:{artifactSha256:artifact,manifestSha256:manifestHash,ledgerSha256:evidence.ledgerSha256,roundId:source.roundId}};
  r.coverageAfter=clone(source.coverageAfter);ledgers.push(r);
  return {ledgers,r,source,bank,evidence,options:{banks:new Map(allBanks),editorials:clone(editorials),offlineBases:new Map([[artifact,evidence]]),ledgerSources:new Map(sources),now}};
}
function check(f){return validateRoundLedgers(f.ledgers,f.options);}
function pass(f){const result=check(f);assert.equal(result.ok,true,result.errors.join('\n'));}
function fail(f,pattern){const result=check(f);assert.equal(result.ok,false,'invalid offline campaign unexpectedly passed');if(pattern)assert.match(result.errors.join('\n'),pattern);}
function stage(f) {
  const bank=clone(f.bank);bank.bankVersion='fixture-offline.7';bank.releasedAt='2026-10-04T03:11:00Z';bank.changeSummary='Synthetic zero-addition staging fixture, not a public release.';
  const raw=json(bank);f.options.banks.set(bank.bankVersion,{raw});Object.assign(f.r.publication,{bankVersion:bank.bankVersion,bankSha256:hash(raw)});
  f.manifest={schemaVersion:1,bankVersion:bank.bankVersion,releasedAt:bank.releasedAt,file:`releases/${bank.bankVersion}/bank.json`,sha256:hash(raw),changeSummary:bank.changeSummary,finalRelease:false};return bank;
}

test('exact earlier delivered006 permits cumulative offline007 without any published count or history rewrite',()=>{
  const f=fixture(),before=JSON.stringify(f.ledgers);pass(f);assert.equal(JSON.stringify(f.ledgers),before);
  assert.equal(f.r.publication.status,'not_attempted');assert.equal(f.r.counts.publishedRegularPractical,0);
  assert.deepEqual(f.r.coverageAfter,f.source.coverageAfter);assert.notDeepEqual(f.r.coverageAfter,regularCoverage(f.bank));
});
test('offline predecessor schema requires exactly the artifact, manifest, ledger hashes and round identity',()=>{
  for(const mutate of [r=>delete r.baseline.offlinePredecessor.ledgerSha256,r=>r.baseline.offlinePredecessor.manifestSha256='a'.repeat(63),r=>r.baseline.offlinePredecessor.roundId='../round-006',r=>r.baseline.offlinePredecessor.status='verified',r=>r.baseline.offlinePredecessor=null]){const f=fixture();mutate(f.r);assert.ok(validateJsonSchema(f.r).length);}
});
test('missing delivery evidence or original campaign source never weakens the online latest-bank guard',()=>{
  const f=fixture();f.options.offlineBases.clear();fail(f,/exact earlier delivered|latest verified/);
  const g=fixture();g.options.ledgerSources.delete(g.source.roundId);fail(g,/original campaign ledger source/);
  const h=fixture();h.ledgers.splice(5,1);fail(h,/original campaign ledger source/);
});
test('artifact, manifest, ledger, bank and actual Git anchor must all match exact validated evidence',()=>{
  for(const mutate of [f=>f.r.baseline.offlinePredecessor.artifactSha256='c'.repeat(64),f=>f.r.baseline.offlinePredecessor.manifestSha256='c'.repeat(64),f=>f.r.baseline.offlinePredecessor.ledgerSha256='c'.repeat(64),f=>f.r.baseline.offlinePredecessor.roundId='round-005',f=>f.r.baseline.sourceCommit='c'.repeat(40),f=>f.r.baseline.bankSha256='c'.repeat(64),f=>f.r.baseline.bankVersion=f.source.baseline.bankVersion]){const f=fixture();mutate(f);fail(f,/offline predecessor/);}
});
test('frozen bytes and complete immutable decision history cannot be reset behind matching receipt identity',()=>{
  const f=fixture();f.options.ledgerSources.set(f.source.roundId,json(f.source));f.evidence.ledgerSha256='c'.repeat(64);fail(f,/original ledger hash/);
  for(const mutate of [f=>f.source.candidates[0].attemptCount=0,f=>f.source.candidates[0].decision='rejected',f=>f.source.candidates[0].cycles[0].summary+=' changed',f=>f.source.baseline.sourceCommit='c'.repeat(40),f=>f.source.counts.accepted--]){const g=fixture();mutate(g);const result=validateCampaignBaselines(g.ledgers,g.options);assert.equal(result.ok,false);assert.match(result.errors.join('\n'),/immutable decision\/review history/);}
});
test('future, delayed and not-yet-eligible delivery evidence cannot retroactively authorize a round start',()=>{
  for(const mutate of [f=>f.evidence.recordedAt='2026-10-04T03:05:00Z',f=>f.evidence.recordedAt='2026-10-04T03:06:00Z',f=>f.evidence.eligibleAt='2026-10-04T03:05:01Z',f=>f.evidence.eligibleAt='2026-10-04T09:00:00Z',f=>delete f.evidence.eligibleAt,f=>f.evidence.recordedAt='2026-10-04T00:40:00Z']){const f=fixture();mutate(f);fail(f,/offline predecessor|delivery evidence/);}
  const boundary=fixture();boundary.evidence.eligibleAt=boundary.r.startedAt;pass(boundary);
});
test('downloaded accepted coverage cannot become actual public coverage or public counts',()=>{
  const f=fixture();f.r.coverageAfter=regularCoverage(f.bank);fail(f,/actual verified bank/);
  const g=fixture();g.r.counts.publishedRegularWrittenBySubject.s1=1;fail(g,/new public counts/);
  const h=fixture();h.source.candidates[0].publishedBankVersion=h.bank.bankVersion;fail(h,/unverified publication/);
});
test('delivered chain requires its newest earlier predecessor and rejects a silent return to the remote anchor',()=>{
  const f=fixture(),bank=stage(f),raw=json(f.r),next=clone(f.r),second='d'.repeat(64);
  f.options.ledgerSources.set(f.r.roundId,raw);
  const proof={...f.evidence,roundId:f.r.roundId,bankVersion:bank.bankVersion,bankSha256:hash(json(bank)),ledgerSha256:hash(raw),manifestSha256:'e'.repeat(64),recordedAt:'2026-10-04T03:25:00Z',eligibleAt:'2026-10-04T03:35:00Z'};
  f.options.offlineBases.set(second,proof);
  Object.assign(next,{roundId:'round-offline-008',startedAt:'2026-10-04T07:00:00Z',decisionDeadline:'2026-10-04T10:30:00Z',closedAt:'2026-10-04T07:05:00Z'});next.publication=clone(template.publication);f.ledgers.push(next);
  fail(f,/latest earlier delivered cumulative predecessor/);
  next.baseline.bankVersion=proof.bankVersion;next.baseline.bankSha256=proof.bankSha256;next.baseline.offlinePredecessor={artifactSha256:second,manifestSha256:proof.manifestSha256,ledgerSha256:proof.ledgerSha256,roundId:proof.roundId};pass(f);
  delete next.baseline.offlinePredecessor;fail(f,/requires explicit offline predecessor/);
});
test('normal online guard remains unchanged without offline evidence and rejects later verified divergence',()=>{
  const f=fixture();f.options.offlineBases.clear();delete f.r.baseline.offlinePredecessor;fail(f,/latest verified cumulative/);
  f.ledgers.pop();pass(f);
  const g=fixture(),later=clone(g.source);later.roundId='round-verified-divergence';later.publication={...later.publication,status:'verified',bankVersion:'different-bank',bankSha256:'f'.repeat(64),verifiedAt:'2026-10-04T02:30:00Z'};
  const result=validateCampaignBaselines([...g.ledgers,later],g.options);assert.equal(result.ok,false);assert.match(result.errors.join('\n'),/latest verified cumulative/);
});
test('offline staging does not synthesize hosted verification and still preserves every bank record',()=>{
  const f=fixture(),bank=stage(f),before=JSON.stringify(f.ledgers);
  const good=validateReleaseLedger(f.ledgers,{...f.options,manifest:f.manifest});assert.equal(good.ok,true,good.errors.join('\n'));assert.equal(JSON.stringify(f.ledgers),before);
  bank.questions[0].stem+=' mutation';const raw=json(bank);f.options.banks.set(bank.bankVersion,{raw});f.r.publication.bankSha256=f.manifest.sha256=hash(raw);
  const bad=validateReleaseLedger(f.ledgers,{...f.options,manifest:f.manifest});assert.equal(bad.ok,false);assert.match(bad.errors.join('\n'),/changed or removed|invalid active bank/);
});
test('offline evidence does not relax final freeze, deadline, or review history caps',()=>{
  const f=fixture();f.r.startedAt='2026-10-16T15:00:00Z';f.r.closedAt='2026-10-16T15:01:00Z';f.r.decisionDeadline='2026-10-16T16:00:00Z';fail(f,/final freeze|decision cutoff/);
  const g=fixture();g.r.decisionDeadline='2026-10-04T07:00:01Z';fail(g,/four hours|next round/);
  const h=fixture();h.source.candidates[0].attemptCount=4;fail(h,/maximum 3|immutable decision\/review history/);
});
test('offline context rejects untrusted index shape and traversal before consulting evidence',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'offline-context-'));
  try {
    await fs.mkdir(path.join(temp,'docs/rounds'),{recursive:true});await fs.mkdir(path.join(temp,'docs/deliveries'),{recursive:true});await fs.mkdir(path.join(temp,'data'),{recursive:true});
    await fs.cp(path.join(root,'docs/publications'),path.join(temp,'docs/publications'),{recursive:true});
    // Loader evidence dependencies are explicitly listed even in this malformed-index fixture.
    await fs.writeFile(path.join(temp,'PUBLICATION-MANIFEST.txt'),['PUBLICATION-MANIFEST.txt',...(await fs.readdir(path.join(temp,'docs/publications'))).map(p=>'docs/publications/'+p)].join('\n')+'\n');
    await fs.copyFile(path.join(root,'docs/rounds/round-ledger.schema.json'),path.join(temp,'docs/rounds/round-ledger.schema.json'));
    await fs.writeFile(path.join(temp,'data/publication-state.json'),'{}');
    await fs.writeFile(path.join(temp,'docs/deliveries/offline-chain.json'),json({schemaVersion:1,receipts:[],manifests:[],ledgerPaths:[],extra:true}));
    await assert.rejects(loadRoundContext(temp,null,{now}),/Invalid public offline delivery index/);
    const receipt={artifactSha256:artifact,manifestSha256:hash(json({})),content:{roundId:'round-006'}};
    await fs.writeFile(path.join(temp,'docs/deliveries/offline-chain.json'),json({schemaVersion:1,receipts:[receipt],manifests:[{}],ledgerPaths:['../secret.json']}));
    await assert.rejects(loadRoundContext(temp,null,{now}),/Unsafe, duplicate or non-frozen/);
  } finally {await fs.rm(temp,{recursive:true,force:true});}
});

test('later verification of an offline ancestor cannot roll back a still-unresolved delivered descendant',()=>{
  const f=fixture(),bank=stage(f),raw=json(f.r),next=clone(f.r),second='d'.repeat(64);
  f.options.ledgerSources.set(f.r.roundId,raw);
  const proof={...f.evidence,roundId:f.r.roundId,bankVersion:bank.bankVersion,bankSha256:hash(json(bank)),ledgerSha256:hash(raw),manifestSha256:'e'.repeat(64),recordedAt:'2026-10-04T03:25:00Z',eligibleAt:'2026-10-04T03:35:00Z'};
  f.options.offlineBases.set(second,proof);
  Object.assign(next,{roundId:'round-offline-008',startedAt:'2026-10-04T07:00:00Z',decisionDeadline:'2026-10-04T10:30:00Z',closedAt:'2026-10-04T07:05:00Z'});next.publication=clone(template.publication);
  Object.assign(next.baseline,{bankVersion:proof.bankVersion,bankSha256:proof.bankSha256,offlinePredecessor:{artifactSha256:second,manifestSha256:proof.manifestSha256,ledgerSha256:proof.ledgerSha256,roundId:proof.roundId}});f.ledgers.push(next);
  Object.assign(f.source.publication,{status:'verified',commit:'f'.repeat(40),verifiedAt:'2026-10-04T04:00:00Z'});
  for(const c of f.source.candidates.filter(c=>c.decision==='accepted')) {
    c.publishedBankVersion=f.source.publication.bankVersion;
    if(c.type==='written')f.source.counts.publishedRegularWrittenBySubject[c.subjectId]++;
    else f.source.counts.publishedRegularPractical++;
  }
  f.source.coverageAfter=regularCoverage(f.bank);next.coverageAfter=regularCoverage(f.bank);
  pass(f);
  const result=validateCampaignBaselines(f.ledgers,f.options);assert.equal(result.ok,true,result.errors.join('\n'));
  delete next.baseline.offlinePredecessor;next.baseline.bankVersion=f.source.publication.bankVersion;next.baseline.bankSha256=f.source.publication.bankSha256;
  const reset=validateCampaignBaselines(f.ledgers,f.options);assert.equal(reset.ok,false);assert.match(reset.errors.join('\n'),/requires explicit offline predecessor/);
});
