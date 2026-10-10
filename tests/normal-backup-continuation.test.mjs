import {decodeSevenZip} from '../scripts/archive-format.mjs';
import {retainHistoricalQuarantinePrefix,pruneHistoricalFixtureHistory} from './quarantine-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parsePublicAllowlist} from '../scripts/download-fallback.mjs';
import {createHash} from 'node:crypto';
import {NORMAL_BACKUP_PATH,NORMAL_BACKUP_PINS,parseNormalBackupProof,validateNormalBackupContinuation,prepareNormalBackupContinuation} from '../scripts/release-backup-continuation.mjs';
import {loadRoundContext,validateRoundLedgers,validateReleaseLedger,regularCoverage} from '../scripts/validate-round.mjs';
import {validateCampaignBaselines} from '../scripts/editorial-ledger.mjs';
import {FREEZE_AT} from '../src/domain.js';
const root=path.resolve(import.meta.dirname,'..'),hash=b=>createHash('sha256').update(b).digest('hex'),json=o=>Buffer.from(JSON.stringify(o,null,2)+'\n'),clone=structuredClone;
const raw=await fs.readFile(path.join(root,NORMAL_BACKUP_PATH)),proof=parseNormalBackupProof(raw);
const now=Math.max(Date.now(),Date.parse('2026-10-04T12:00:00Z')),loadedContext=await loadRoundContext(root,null,{release:true,now});
// The successor cases below deliberately construct historical009 + synthetic010.
// Real later rounds remain checked by the normal full-context release suite.
const context={...loadedContext,offlineBases:new Map([...loadedContext.offlineBases].filter(([,b])=>Number(b.roundId.slice(6))<=9)),ledgers:loadedContext.ledgers.filter(r=>r.roundId<='round-009')};
const withoutNormal={...context,offlineBases:new Map([...context.offlineBases].filter(([id])=>id!==NORMAL_BACKUP_PINS.delta)),now};
const normal=validateNormalBackupContinuation(proof,withoutNormal),originals=context.ledgers.map(JSON.stringify);
function failed(fn,re){assert.throws(fn,re);}
const template=JSON.parse(await fs.readFile(path.join(root,'docs/rounds/round-ledger.template.json')));
function nextRound(){
 const r=clone(template),b=normal.offlineBase,bank=JSON.parse(context.banks.get(b.bankVersion).raw),coverage=regularCoverage(bank),remote=JSON.parse(context.banks.get('2026.10.04-regular.8').raw);
 Object.assign(r,{roundId:'round-010',status:'closed',startedAt:'2026-10-04T11:00:00Z',decisionDeadline:'2026-10-04T14:30:00Z',closedAt:'2026-10-04T11:05:00Z',summary:'Synthetic zero-addition regression fixture; no real content decision.',noGapExplanation:'Synthetic validation of exact normal backup continuation and unchanged public coverage.'});
 r.baseline={sourceCommit:b.baseCommit,bankVersion:b.bankVersion,bankSha256:b.bankSha256,regularWrittenBySubject:coverage.regularWrittenBySubject,regularPractical:coverage.regularPractical,offlinePredecessor:{artifactSha256:NORMAL_BACKUP_PINS.delta,manifestSha256:b.manifestSha256,ledgerSha256:b.ledgerSha256,roundId:b.roundId}};
 r.coverageAfter=regularCoverage(remote);return r;
}
function options(extra={}){return {...context,now:Date.parse('2026-10-04T12:00:00Z'),availableFiles:new Set([...context.availableFiles,'docs/rounds/round-010.md']),...extra};}
test('exact unchanged normal release proof authorizes only local continuation after both actual clocks',()=>{
 assert.equal(normal.canStartNewContent,true);assert.equal(normal.canPublish,false);assert.equal(normal.newlyPublishedRegular,0);assert.equal(normal.reservedLearningGoalIds.length,34);assert.equal(new Set(normal.reservedLearningGoalIds).size,34);
 assert.equal(proof.deltaManifest.deliveryMode,'release_backup');assert.equal(proof.completeManifest.deliveryMode,'release_backup');
 assert.equal(proof.terminal.gitOutcome.objects,'unknown');assert.equal(proof.terminal.gitOutcome.refWrite,'not_submitted');
 assert.equal(proof.terminal.reconciliation.firstUnresolvedAt,'2026-10-04T10:02:05.215Z');assert.equal(proof.terminal.reconciliation.deadlineAt,'2026-10-04T10:12:05.215Z');
 for(const time of ['2026-10-04T10:01:06Z','2026-10-04T10:05:00Z','2026-10-04T10:12:05.214Z','2026-10-04T10:12:20Z','2026-10-04T10:12:35Z',new Date(Date.parse(proof.verifiedAt)-1).toISOString()])assert.equal(validateNormalBackupContinuation(proof,{...withoutNormal,now:Date.parse(time)}).offlineBase,null);
 assert.equal(normal.eligibleAt,proof.verifiedAt);
 assert.deepEqual(context.ledgers.map(JSON.stringify),originals);
});
test('raw or semantic proof tampering, missing terminal, incomplete delivery and changed clocks fail closed',()=>{
 failed(()=>parseNormalBackupProof(Buffer.concat([raw,Buffer.from(' ')])),/proof bytes/);
 for(const mutate of [p=>delete p.terminal,p=>p.terminal.permissionWait.state='permission_wait',p=>p.terminal.permissionWait.deadlineAt='2026-10-04T10:00:00Z',p=>p.terminal.reconciliation.firstUnresolvedAt='2026-10-04T09:51:07Z',p=>p.terminal.reconciliation.state='reconciliation_wait',p=>p.terminal.reconciliation.skippedAt=null,p=>p.terminal.gitOutcome.refWrite='unknown',p=>p.terminal.gitOutcome.objects='none',p=>p.completeArtifactSha256='a'.repeat(64),p=>p.userOpenOrDownloadObserved=true,p=>p.deltaManifest.deliveryMode='download_only',p=>p.terminal.privateId='secret']){const p=clone(proof);mutate(p);failed(()=>validateNormalBackupContinuation(p,withoutNormal),/tampered/);}
});
test('missing, duplicate, mutated or reserved original history cannot become a baseline',()=>{
 failed(()=>validateNormalBackupContinuation(proof,context),/Duplicate/);
 for(const mutate of [c=>c.ledgers.splice(c.ledgers.findIndex(r=>r.roundId==='round-009'),1),c=>c.ledgers.push(clone(c.ledgers.find(r=>r.roundId==='round-009'))),c=>c.ledgers.find(r=>r.roundId==='round-009').candidates[0].attemptCount=0,c=>c.ledgerSources.set('round-009',Buffer.from('{}')),c=>c.banks.delete('2026.10.04-regular.9'),c=>c.banks.set('2026.10.04-regular.8',{raw:Buffer.from('{}')})]){
  const c={...withoutNormal,ledgers:clone(context.ledgers),ledgerSources:new Map(context.ledgerSources),banks:new Map(context.banks)};mutate(c);
  if(!c.ledgers.some(r=>r.roundId==='round-009'))c.ledgers.push(nextRound());
  failed(()=>validateNormalBackupContinuation(proof,c),/exact|Exact|Original|immutable|campaign/);
 }
 failed(()=>validateNormalBackupContinuation(proof,{...withoutNormal,now:FREEZE_AT}),/freeze|cutoff/);
 failed(()=>validateNormalBackupContinuation(proof,{...withoutNormal,publicationState:{finalized:true}}),/freeze/);
 failed(()=>validateNormalBackupContinuation(proof,{...withoutNormal,manifest:{...context.manifest,finalRelease:true}}),/manifest freeze/);
 failed(()=>validateNormalBackupContinuation(proof,{...withoutNormal,manifest:null}),/Missing manifest/);
 failed(()=>validateNormalBackupContinuation(proof,{...withoutNormal,publicationState:null}),/Missing publication state/);
 failed(()=>validateNormalBackupContinuation(proof,{...withoutNormal,publicationState:{}}),/Missing publication state/);
});
test('round010 uses exact009 and retains actually public regular8 coverage with all existing guards',()=>{
 const r=nextRound(),all=[...context.ledgers,r],result=validateRoundLedgers(all,options());assert.equal(result.ok,true,result.errors.join('\n'));
 const stale=clone(r);delete stale.baseline.offlinePredecessor;const bad=validateCampaignBaselines([...context.ledgers,stale],options());assert.equal(bad.ok,false);assert.match(bad.errors.join('\n'),/explicit offline predecessor/);
 const future=clone(r);future.startedAt='2026-10-04T10:05:00Z';assert.equal(validateRoundLedgers([...context.ledgers,future],options()).ok,false);
 const preVerification=clone(r);preVerification.startedAt=new Date(Date.parse(proof.verifiedAt)-1).toISOString();const early=validateCampaignBaselines([...context.ledgers,preVerification],options());assert.equal(early.ok,false);assert.match(early.errors.join('\n'),/elapsed reconciliation bound/);
 const wrong=clone(r);wrong.coverageAfter=regularCoverage(JSON.parse(context.banks.get('2026.10.04-regular.9').raw));assert.equal(validateRoundLedgers([...context.ledgers,wrong],options()).ok,false);
 const dupe=clone(r);dupe.candidates=[clone(context.ledgers.find(r=>r.roundId==='round-009').candidates[0])];assert.equal(validateRoundLedgers([...context.ledgers,dupe],options()).ok,false);
});
test('default loader and explicit release context accept real010 lineage without rewriting009',async t=>{
 // This disposable synthetic010 is audited at its own historical boundary.
 // A later real cumulative publication must not make it a current release.
 const now=Date.parse('2026-10-04T12:00:00Z');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'normal-backup-next-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.cp(root,dir,{recursive:true});
 // This disposable regression is historical009 plus synthetic010, even after
 // real010 has a reviewed delivery checkpoint. Reset only the fixture authority.
 const paths=parsePublicAllowlist(await fs.readFile(path.join(dir,'PUBLICATION-MANIFEST.txt'),'utf8'));
 await pruneHistoricalFixtureHistory(dir,{temporaryRoot:dir,maxRound:9,at:now,checkpoints:'all'});
 // This disposable historical fixture predates every independent delivery.
 if(paths.includes('docs/deliveries/offline-chain-trust.json'))await fs.writeFile(path.join(dir,'docs/deliveries/offline-chain-trust.json'),json({schemaVersion:1,kind:'reviewed_independent_offline_chains',checkpoints:[]}));
 await fs.writeFile(path.join(dir,'docs/deliveries/release-backup-trust.json'),json({schemaVersion:1,rootProofSha256:hash(raw),checkpoints:[]}));
 await retainHistoricalQuarantinePrefix(dir,now);
 const fixture=await import(pathToFileURL(path.join(dir,'scripts/validate-round.mjs')));
 const r=nextRound(),bank=JSON.parse(context.banks.get(r.baseline.bankVersion).raw);bank.bankVersion='2026.10.04-regular.10';bank.roundId=r.roundId;bank.releasedAt='2026-10-04T11:06:00Z';bank.changeSummary='Synthetic zero-addition bank; never a real release.';
 const b=json(bank);Object.assign(r.publication,{bankVersion:bank.bankVersion,bankSha256:hash(b)});
 const write=async(p,raw)=>{const f=path.join(dir,p);await fs.mkdir(path.dirname(f),{recursive:true});await fs.writeFile(f,raw);};
 await write('docs/rounds/round-010.json',json(r));await write('docs/rounds/round-010.md','Synthetic regression fixture.\n');await write(`data/releases/${bank.bankVersion}/bank.json`,b);await write('data/manifest.json',json({schemaVersion:1,bankVersion:bank.bankVersion,releasedAt:bank.releasedAt,file:`releases/${bank.bankVersion}/bank.json`,sha256:hash(b),changeSummary:bank.changeSummary,finalRelease:false}));
 const c=await fixture.loadRoundContext(dir,null,{release:true,now});const release=validateReleaseLedger(c.ledgers,{...c,now});assert.equal(release.ok,true,release.errors.join('\n'));
 const explicit=await fixture.loadRoundContext(dir,path.join(dir,'docs/rounds/round-010.json'),{release:true,now});assert.equal(validateReleaseLedger(explicit.ledgers,{...explicit,now}).ok,true);
 assert.equal(hash(await fs.readFile(path.join(dir,'docs/rounds/round-009.json'))),NORMAL_BACKUP_PINS.ledger);
 // Optional independent integration uses the actual verified remote008 tree.
 // The successor remains a synthetic fixture and these temporary ZIPs are never delivered.
 if(process.env.NORMAL_BACKUP_REMOTE_BASE_ROOT){
  const {parsePublicAllowlist}=await import('../scripts/download-fallback.mjs');
  const {writeReleaseDeliveryPair}=await import(pathToFileURL(path.join(dir,'scripts/release-bundle.mjs')));
  const allowlistPath=path.join(dir,'PUBLICATION-MANIFEST.txt');
  const paths=parsePublicAllowlist(await fs.readFile(allowlistPath,'utf8'));
  await fs.writeFile(allowlistPath,[...new Set([...paths,'docs/rounds/round-010.json','docs/rounds/round-010.md','data/releases/'+bank.bankVersion+'/bank.json'])].join('\n')+'\n');
  const inventory=async folder=>Promise.all(parsePublicAllowlist(await fs.readFile(path.join(folder,'PUBLICATION-MANIFEST.txt'),'utf8')).map(async p=>{const raw=await fs.readFile(path.join(folder,p));return {path:p,sha256:hash(raw),bytes:raw.length};}));
  const pair=await writeReleaseDeliveryPair({baseRoot:process.env.NORMAL_BACKUP_REMOTE_BASE_ROOT,workRoot:dir,baseCommit:proof.deltaManifest.baseCommit,baseVerifiedAt:proof.deltaManifest.baseVerifiedAt,baseInventory:await inventory(process.env.NORMAL_BACKUP_REMOTE_BASE_ROOT),reviewedInventory:await inventory(dir),roundId:'round-010',deltaOutputPath:path.join(dir,'synthetic-changes.zip'),completeOutputPath:path.join(dir,'synthetic-complete.7z'),now});
  assert.equal(pair.deltaManifest.baseCommit,'500811b7ee226f33cfb598df42c6cb347b935d28');
  for(const version of ['2026.10.04-regular.9','2026.10.04-regular.10'])assert.ok(pair.deltaManifest.files.some(f=>f.path===`data/releases/${version}/bank.json`));
  assert.equal(pair.deltaManifest.deliveryMode,'release_backup');assert.deepEqual(pair.completeManifest.prerequisiteArtifacts,[]);assert.equal(pair.completeManifest.sourceRelease.roundId,'round-010');
  const full=decodeSevenZip(await fs.readFile(pair.complete.path)),cm=JSON.parse(full.get('manifest.json'));assert.deepEqual(cm.prerequisiteArtifacts,[]);for(const f of cm.files)assert.equal(hash(full.get('project/'+f.path)),f.sha256);
  assert.deepEqual([...full.keys()].sort(),['manifest.json','APPLY-KO.txt',...cm.files.map(f=>'project/'+f.path)].sort());const restored=path.join(dir,'empty-full');await fs.mkdir(restored);for(const [name,bytes]of full){const target=path.join(restored,name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes,{flag:'wx'});}
  const extracted=await fixture.loadRoundContext(path.join(dir,'empty-full/project'),null,{release:true,now});assert.equal(validateReleaseLedger(extracted.ledgers,{...extracted,now}).ok,true);
 }

 await fs.unlink(path.join(dir,NORMAL_BACKUP_PATH));
 // The complete allowlist guard may reject this exact missing mandatory proof
 // before the later lineage guard. Unrelated missing files are not accepted.
 await assert.rejects(loadRoundContext(dir,null,{release:true,now}),error=>/offline predecessor|latest verified/.test(error.message)||(error.code==='ENOENT'&&error.path===path.join(dir,NORMAL_BACKUP_PATH)));
});
test('private preparation rejects invented receipts before touching artifact or terminal evidence',async()=>{
 await assert.rejects(prepareNormalBackupContinuation({deltaZip:Buffer.from('fake'),completeZip:Buffer.from('fake'),libraryReceiptRaw:Buffer.from('{}'),attachmentReceiptRaw:Buffer.from('{}')}),/Exact verified Library/);
});

test('manifest-only freeze blocks continuation in both release and ordinary context modes',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'normal-backup-manifest-freeze-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.cp(root,dir,{recursive:true});
 const mp=path.join(dir,'data/manifest.json'),m=JSON.parse(await fs.readFile(mp));assert.equal(JSON.parse(await fs.readFile(path.join(dir,'data/publication-state.json'))).finalized,false);
 await fs.writeFile(mp,json({...m,finalRelease:true}));
 for(const release of [true,false])await assert.rejects(loadRoundContext(dir,null,{release,now}),/freeze/);
 // Both real markers false remains eligible in both modes, without altering output selection.
 await fs.writeFile(mp,json({...m,finalRelease:false}));
 for(const release of [true,false]){const c=await loadRoundContext(dir,null,{release,now});assert.ok(c.offlineBases.has(NORMAL_BACKUP_PINS.delta));if(!release)assert.equal(c.manifest,null);}
 const sp=path.join(dir,'data/publication-state.json');
 for(const state of [{finalized:true},{}]){await fs.writeFile(sp,json(state));for(const release of [true,false])await assert.rejects(loadRoundContext(dir,null,{release,now}),/freeze|publication state/);}
 await fs.writeFile(sp,json({finalized:false}));
 await fs.writeFile(mp,json({...m,finalRelease:null}));for(const release of [true,false])await assert.rejects(loadRoundContext(dir,null,{release,now}),/manifest/);
 await fs.unlink(mp);for(const release of [true,false])await assert.rejects(loadRoundContext(dir,null,{release,now}),/ENOENT/);
});
