import {createSyntheticValidator} from './quarantine-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {startReconciliationWait, advanceReconciliationWait, validateOfflineContinuation, validateDeliveryChain, foldDeliveryInventory, assessGitSyncPlan, createDeliveryReceipt, writeDownloadZip, freezePublicDelta} from '../scripts/download-fallback.mjs';
const root = path.resolve(import.meta.dirname, '..');
const sha = raw => createHash('sha256').update(raw).digest('hex');
const rawJson = value => Buffer.from(JSON.stringify(value,null,2)+'\n');
const at = Date.parse('2026-10-04T04:00:00Z');
const checkpoint = JSON.parse(await fs.readFile(path.join(root,'docs/deliveries/offline-chain.json')));
// Historical regressions deliberately use the frozen006 prefix. Later delivered
// checkpoints must not silently change their synthetic007 inputs or historical clock.
async function fixture({throughRound='round-006',now=at}={}) {
  const last=checkpoint.receipts.findIndex(r=>r.roundId===throughRound);
  assert(last>=0,`Missing exact historical predecessor ${throughRound}`);
  const receipts = structuredClone(checkpoint.receipts.slice(0,last+1));
  const artifacts=new Set(receipts.map(r=>r.artifactSha256));
  const manifests = new Map(receipts.map((r,i) => [r.artifactSha256, structuredClone(checkpoint.manifests[i])]));
  const ledgers = new Map();
  for (const filename of checkpoint.ledgerPaths.filter(name=>artifacts.has(name.split('/')[2]))) { const raw = await fs.readFile(path.join(root,filename)); ledgers.set(JSON.parse(raw).roundId,raw); }
  const banks = new Map();
  for (const raw of ledgers.values()) {
    const ledger = JSON.parse(raw);
    for (const version of [ledger.baseline.bankVersion,ledger.publication.bankVersion]) banks.set(version,await fs.readFile(path.join(root,'data/releases',version,'bank.json')));
  }
  banks.set('2026.10.02-regular.1',await fs.readFile(path.join(root,'data/releases/2026.10.02-regular.1/bank.json')));
  return {receipts,manifests,ledgers,banks,now,publicationState:{finalized:false}};
}
function call(f,extra={}) {return validateOfflineContinuation(f.receipts,{...f,...extra});}
function replaceManifest(f,edit) {
  const r=f.receipts[0], m=f.manifests.get(r.artifactSha256); edit(m);r.manifestSha256=sha(rawJson(m));
}
test('one persistent ten-minute reconciliation clock survives execution changes and late outcomes', () => {
  const artifactSha256='a'.repeat(64), start=Date.parse('2026-10-04T01:00:00Z');
  const wait=startReconciliationWait({artifactSha256,firstUnresolvedAt:new Date(start).toISOString()});
  assert.equal(advanceReconciliationWait(wait,{now:start+599999}).state,'reconciliation_wait');
  const skipped=advanceReconciliationWait(wait,{now:start+600000});
  assert.equal(skipped.state,'skip_git_step');
  const resumed=startReconciliationWait({artifactSha256,firstUnresolvedAt:'2026-10-04T03:00:00Z',previous:[wait,skipped]});
  assert.deepEqual(resumed,skipped);
  assert.deepEqual(advanceReconciliationWait(resumed,{now:at,response:'late_success'}),skipped);
  assert.throws(()=>advanceReconciliationWait({...wait,deadlineAt:'2026-10-04T02:00:00Z'},{now:at}),/clock/);
});
test('exact delivered006 becomes eligible at original deadline, retaining unknown object and41 reservations', async () => {
  const f=await fixture(),result=call(f);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(result.canStartNewContent,true);assert.equal(result.canPublish,false);assert.equal(result.newlyPublishedRegular,0);
  assert.equal(result.offlineBase.bankVersion,'2026.10.04-regular.6');
  assert.equal(result.offlineBase.eligibleAt,'2026-10-04T01:37:54.486Z');
  assert.equal(result.reservedLearningGoalIds.length,41);
  assert.equal(f.manifests.get(f.receipts[0].artifactSha256).gitOutcome.objects,'unknown');
  assert.equal(validateDeliveryChain(f.receipts,f).canStartNewContent,true);
  const deadline=Date.parse(result.reconciliation[0].deadlineAt);
  assert.equal(call(f,{now:deadline-1}).canStartNewContent,false);
  assert.equal(call(f,{now:deadline}).canStartNewContent,true);
});
test('unknown ref cannot freeze research forever or become a false remote publication',async()=>{
  const f=await fixture();replaceManifest(f,m=>{m.gitOutcome.refWrite='pending';m.gitOutcome.refStatus='unknown';});
  const result=call(f);assert.equal(result.canStartNewContent,true);assert.equal(result.canPublish,false);
  replaceManifest(f,m=>{m.gitOutcome.refWrite='settled_success';m.gitOutcome.expectedCommit='c'.repeat(40);m.gitOutcome.observedHead='c'.repeat(40);m.gitOutcome.refStatus='applied';});
  assert.equal(call(f).canStartNewContent,true);assert.equal(call(f).newlyPublishedRegular,0);
  assert.equal(f.receipts[0].newlyPublishedRegular,0);
});
test('missing delivery, mutated banks/ledgers and freeze fail closed',async()=>{
  for(const status of ['prepared','delivery_failed']){const f=await fixture();f.receipts[0].status=status;assert.equal(call(f).canStartNewContent,false);}
  let f=await fixture();f.banks.set(f.receipts[0].content.bankVersion,Buffer.from('{}'));assert.equal(call(f).ok,false);
  f=await fixture();f.ledgers.set('round-006',Buffer.from('{}'));assert.equal(call(f).ok,false);
  f=await fixture();assert.equal(call(f,{publicationState:{finalized:true}}).canStartNewContent,false);
  assert.equal(call(f,{now:Date.parse('2026-10-16T15:00:00Z')}).canStartNewContent,false);
});
async function successor(f,{duplicateGoal=false,mutatePrevious=false}={}){
  const previous=f.receipts.at(-1),source=JSON.parse(f.ledgers.get(previous.roundId));
  const bank=JSON.parse(f.banks.get(previous.content.bankVersion));
  const q=structuredClone(bank.questions.find(q=>q.questionId===source.candidates.find(c=>c.decision==='accepted').questionId));
  q.questionId='test-offline-007';q.templateId='test-offline-template-007';q.learningGoalId='test-offline-goal-007';
  for(const [index,link] of q.links.entries()){const option=structuredClone(bank.options.find(o=>o.optionId===link.optionId));option.optionId=`test-offline-option-${index}`;option.memberQuestionIds=[q.questionId];link.optionId=option.optionId;bank.options.push(option);}
  bank.questions.push(q);
  if(mutatePrevious)bank.questions[0].stem+=' changed';
  bank.bankVersion='2026.10.04-offline.test.7';bank.releasedAt='2026-10-04T03:00:00Z';
  const bankRaw=rawJson(bank),record={...structuredClone(source.candidates.find(c=>c.decision==='accepted')),questionId:q.questionId,templateId:q.templateId,learningGoalId:duplicateGoal?source.candidates[0].learningGoalId:'test-offline-goal-007'};
  const ledger={roundId:'round-007',status:'closed',startedAt:'2026-10-04T02:00:00Z',closedAt:'2026-10-04T02:59:00Z',baseline:{bankVersion:previous.content.bankVersion,bankSha256:previous.content.bankSha256},publication:{status:'not_attempted',bankVersion:bank.bankVersion,bankSha256:sha(bankRaw)},candidates:[record]};
  const ledgerRaw=rawJson(ledger);
  const files=[[`data/releases/${bank.bankVersion}/bank.json`,bankRaw],['docs/rounds/round-007.json',ledgerRaw]].map(([name,raw])=>({path:name,beforeSha256:null,sha256:sha(raw),bytes:raw.length,raw}));
  const template=structuredClone(f.manifests.get(previous.artifactSha256));
  const manifest={...template,schemaVersion:2,roundId:'round-007',executionId:'round-007-offline',parentDeliverySha256:previous.artifactSha256,baseKind:'offline_delivery',offlineBase:{artifactSha256:previous.artifactSha256,roundId:previous.roundId,bankVersion:previous.content.bankVersion,bankSha256:previous.content.bankSha256},reconciliation:call(f).reconciliation[0],files:files.map(({raw,...entry})=>entry)};
  delete manifest.permissionNotifiedAt;delete manifest.permissionDeadlineAt;delete manifest.gitStoppedAt;
  const snapshot={manifest,files},artifact={sha256:sha(rawJson(manifest))};
  const receipt=createDeliveryReceipt({snapshot,artifact,status:'delivered',recordedAt:new Date(at).toISOString()});
  f.receipts.push(receipt);f.manifests.set(artifact.sha256,manifest);f.ledgers.set('round-007',ledgerRaw);f.banks.set(bank.bankVersion,bankRaw);
  return snapshot;
}
test('successive offline rounds keep all prior accepted content without waiting again',async()=>{
  const f=await fixture();await successor(f);const result=call(f);
  assert.equal(result.ok,true,JSON.stringify(result.errors));assert.equal(result.reservedLearningGoalIds.length,42);
  assert.equal(result.offlineBase.roundId,'round-007');
  assert.equal(result.reconciliation[1].firstUnresolvedAt,result.reconciliation[0].firstUnresolvedAt);
  assert.equal(result.reconciliation[1].deadlineAt,result.reconciliation[0].deadlineAt);
  assert.equal(f.receipts.every(r=>r.newlyPublishedRegular===0),true);
});
test('chained offline goal duplication, prior content mutation and predecessor loss are rejected',async()=>{
  let f=await fixture();await successor(f,{duplicateGoal:true});assert.equal(call(f).ok,false);
  f=await fixture();await successor(f,{mutatePrevious:true});assert.equal(call(f).ok,false);
  f=await fixture();await successor(f);f.receipts.shift();assert.equal(call(f).ok,false);
});
function syncFixture(){
  const baseCommit='a'.repeat(40),one='1'.repeat(64),two='2'.repeat(64),foreign='3'.repeat(64);
  const manifest={schemaVersion:1,kind:'developer_patch_not_learner_import',deliveryMode:'download_only',deliveryScope:'supporting_files',reportingEvidence:null,roundId:'policy-001',executionId:'policy-001-a',baseCommit,baseVerifiedAt:'2026-10-04T00:00:00Z',parentDeliverySha256:null,permissionNotifiedAt:'2026-10-04T00:00:00Z',permissionDeadlineAt:'2026-10-04T00:10:00Z',gitStoppedAt:'2026-10-04T00:10:00Z',gitOutcome:{refStatus:'unchanged',observedHead:baseCommit,expectedCommit:null,observedAt:'2026-10-04T00:11:00Z',refWrite:'not_submitted',objects:'unknown',cancellation:'uncertain'},newlyPublishedRegular:0,files:[{path:'README.md',beforeSha256:one,sha256:two,bytes:3}],deletions:[]};
  const receipt={artifactSha256:'f'.repeat(64),manifestSha256:sha(rawJson(manifest)),parentDeliverySha256:null,baseCommit};
  return {baseCommit,observedHead:'b'.repeat(40),baseIsAncestor:true,observedAt:new Date(at).toISOString(),now:at,refWrite:'not_submitted',remoteInventory:[{path:'README.md',sha256:one}],currentInventory:[{path:'README.md',sha256:one},{path:'external.md',sha256:foreign}],receipts:[receipt],manifests:new Map([[receipt.artifactSha256,manifest]])};
}
test('sync assesses only fresh nonconflicting ancestry and preserves foreign paths',()=>{
  const f=syncFixture(),result=assessGitSyncPlan(f);assert.equal(result.ok,true);assert.equal(result.canPublish,false);
  assert.deepEqual(result.writes.map(e=>e.path),['README.md']);
  assert.equal(assessGitSyncPlan({...f,refWrite:'pending'}).ok,false);
  assert.equal(assessGitSyncPlan({...f,baseIsAncestor:false}).ok,false);
  assert.equal(assessGitSyncPlan({...f,observedAt:'2026-10-04T03:00:00Z'}).ok,false);
  assert.equal(assessGitSyncPlan({...f,currentInventory:[{path:'README.md',sha256:'3'.repeat(64)}]}).ok,false);
  assert.equal(assessGitSyncPlan({...f,unresolvedObjectPaths:['README.md']}).ok,false);
  const applied=assessGitSyncPlan({...f,currentInventory:[{path:'README.md',sha256:'2'.repeat(64)}]});
  assert.equal(applied.ok,true);assert.equal(applied.writes.length,0);assert.deepEqual(applied.alreadyApplied,['README.md']);
  assert.equal(assessGitSyncPlan({...f,publicationState:{finalized:true}}).ok,false);
});
test('inventory fold refuses changed preimages rather than overwrite an outside edit',()=>{
  const f=syncFixture();assert.equal(foldDeliveryInventory(f.remoteInventory,f.receipts,f.manifests).get('README.md'),'2'.repeat(64));
  assert.throws(()=>foldDeliveryInventory([{path:'README.md',sha256:'3'.repeat(64)}],f.receipts,f.manifests),/collides/);
});
test('v2 download artifact uses predecessor chain without inventing a new permission wait',async t=>{
  const f=await fixture(),snapshot=await successor(f),directory=await fs.mkdtemp(path.join(os.tmpdir(),'bounded-zip-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const artifact=await writeDownloadZip(snapshot,path.join(directory,'offline.zip'),{now:at});
  const raw=await fs.readFile(artifact.path);assert.ok(raw.includes(Buffer.from('원격 기준 커밋만 준비해서는')));assert.ok(raw.includes(Buffer.from('필수 선행 적용: round-006')));assert.ok(raw.includes(Buffer.from(f.receipts[0].artifactSha256)));
  assert.ok(artifact.bytes>0);assert.equal(snapshot.manifest.schemaVersion,2);assert.equal('permissionNotifiedAt' in snapshot.manifest,false);
  await assert.rejects(writeDownloadZip(snapshot,path.join(directory,'late.zip'),{now:Date.parse('2026-10-16T15:00:00Z')}),/cutoff/);
});

test('approval expiry and later reconciliation cap remain separate terminal clocks',async()=>{
  const f=await fixture(),m=f.manifests.get(f.receipts[0].artifactSha256),result=call(f);
  assert.equal(m.permissionNotifiedAt,'2026-10-04T01:12:36Z');
  assert.equal(m.permissionDeadlineAt,'2026-10-04T01:22:36.000Z');
  assert.equal(m.gitStoppedAt,m.permissionDeadlineAt);
  assert.equal(result.reconciliation[0].firstUnresolvedAt,'2026-10-04T01:27:54.486Z');
  assert.equal(result.reconciliation[0].deadlineAt,'2026-10-04T01:37:54.486Z');
  assert.equal(m.deliveryMode,'download_only');
});
test('frozen historical evidence stays valid after cutoff while every advance is blocked',async t=>{
  const historical=await createSyntheticValidator();t.after(historical.cleanup);
  const f=await fixture(),result=historical.delivery.validateOfflineContinuation(f.receipts,{...f,now:Date.parse('2026-10-17T00:00:00Z'),publicationState:{finalized:true}});
  assert.equal(result.ok,true,JSON.stringify(result.errors));assert.equal(result.canStartNewContent,false);assert.equal(result.canPublish,false);
});
test('tampered ancestor review gates and release timestamps are caught on every delivered bank',async()=>{
  const f=await fixture(),r=f.receipts[0],m=f.manifests.get(r.artifactSha256),ledger=JSON.parse(f.ledgers.get(r.roundId));
  ledger.candidates[0].cycles.at(-1).gates.sourceCheck.result='not_run';
  const raw=rawJson(ledger);f.ledgers.set(r.roundId,raw);r.content.ledgerSha256=sha(raw);
  m.files.find(e=>e.path===r.content.ledgerPath).sha256=sha(raw);m.files.find(e=>e.path===r.content.ledgerPath).bytes=raw.length;r.manifestSha256=sha(rawJson(m));
  assert.match(call(f).errors.join(';'),/all-gates/);
  const g=await fixture(),snapshot=await successor(g),last=g.receipts.at(-1),b=JSON.parse(g.banks.get(last.content.bankVersion));
  b.releasedAt='2026-10-04T01:00:00Z';const bankRaw=rawJson(b),l=JSON.parse(g.ledgers.get(last.roundId));l.publication.bankSha256=sha(bankRaw);const ledgerRaw=rawJson(l);
  g.banks.set(b.bankVersion,bankRaw);g.ledgers.set(last.roundId,ledgerRaw);last.content.bankSha256=sha(bankRaw);last.content.ledgerSha256=sha(ledgerRaw);
  for(const entry of snapshot.manifest.files){const bytes=entry.path.endsWith('bank.json')?bankRaw:ledgerRaw;entry.sha256=sha(bytes);entry.bytes=bytes.length;}last.manifestSha256=sha(rawJson(snapshot.manifest));
  assert.match(call(g).errors.join(';'),/follow closure/);
});
test('offline continuation manifest cannot reset or forge the root uncertainty timestamp',async()=>{
  const f=await fixture();const snapshot=await successor(f),r=f.receipts.at(-1);
  snapshot.manifest.reconciliation.firstUnresolvedAt='2026-10-04T01:00:00Z';snapshot.manifest.reconciliation.deadlineAt='2026-10-04T01:10:00Z';r.manifestSha256=sha(rawJson(snapshot.manifest));
  assert.match(call(f).errors.join(';'),/original reconciliation clock/);
});


test('exact delivered006 to007 prefix preserves eighty goals and the original expired clock',async()=>{
 const f=await fixture({throughRound:'round-007',now:Date.parse('2026-10-04T07:00:00Z')}),before=rawJson(f.receipts),result=call(f);
 assert.equal(result.ok,true,JSON.stringify(result.errors));assert.equal(result.canStartNewContent,true);assert.equal(result.canPublish,false);
 assert.equal(result.offlineBase.roundId,'round-007');assert.equal(result.offlineBase.bankVersion,'2026.10.04-regular.7');
 assert.equal(result.offlineBase.bankSha256,'1b27d3e201cdaf177d1b1d353adc4e9b89b9d3f45596ee810037efd66bd00421');
 assert.equal(result.reservedLearningGoalIds.length,80);assert.equal(result.newlyPublishedRegular,0);
 for(const clock of result.reconciliation){assert.equal(clock.firstUnresolvedAt,'2026-10-04T01:27:54.486Z');assert.equal(clock.deadlineAt,'2026-10-04T01:37:54.486Z');assert.equal(clock.state,'skip_git_step');}
 assert.deepEqual(rawJson(f.receipts),before);
});

test('delivered007 prefix never accepts a missing006 ancestor or changed007 immutable ledger',async()=>{
 const opts={throughRound:'round-007',now:Date.parse('2026-10-04T07:00:00Z')};
 const missing=await fixture(opts);missing.receipts.shift();assert.equal(call(missing).ok,false);
 const changed=await fixture(opts);changed.ledgers.set('round-007',Buffer.from('{}'));assert.equal(call(changed).ok,false);
 const incomplete=await fixture(opts);incomplete.receipts.at(-1).status='prepared';assert.equal(call(incomplete).canStartNewContent,false);
});
