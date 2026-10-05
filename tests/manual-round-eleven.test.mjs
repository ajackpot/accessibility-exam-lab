import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {inflateRawSync} from 'node:zlib';
import {parsePublicAllowlist,zipStored} from '../scripts/download-fallback.mjs';
import {loadRoundContext,validateRoundLedgers,regularCoverage,nextScheduledRoundAt} from '../scripts/validate-round.mjs';

const root=path.resolve(import.meta.dirname,'..');
const now=Date.parse('2026-10-04T13:10:00Z'),startedAt='2026-10-04T13:08:49Z';
const hash=b=>createHash('sha256').update(b).digest('hex');
const json=o=>Buffer.from(JSON.stringify(o,null,2)+'\n');
const all=await loadRoundContext(root,null,{release:true});
// Scheduling fixtures stop at010. Real later authoring/delivery is never a source.
const context={...all,offlineBases:new Map([...all.offlineBases].filter(([,e])=>Number(e.roundId.slice(6))<=10)),ledgers:all.ledgers.filter(r=>Number(r.roundId.slice(6))<=10)};
const template=JSON.parse(await fs.readFile(path.join(root,'docs/rounds/round-ledger.template.json')));
const raw=context.banks.get('2026.10.04-regular.10').raw;
const coverage=regularCoverage(JSON.parse(raw));
const publicCoverage=regularCoverage(JSON.parse(context.banks.get('2026.10.04-regular.8').raw));
const [artifact,prior]=[...context.offlineBases].find(([,e])=>e.roundId==='round-010');
function manual(){
 const r=structuredClone(template);
 Object.assign(r,{roundId:'round-011',startedAt,decisionDeadline:'2026-10-04T14:30:00Z',summary:'Exact authorized manual timing fixture; no review or publication claim.',baseline:{sourceCommit:'500811b7ee226f33cfb598df42c6cb347b935d28',bankVersion:'2026.10.04-regular.10',bankSha256:hash(raw),regularWrittenBySubject:coverage.regularWrittenBySubject,regularPractical:coverage.regularPractical,offlinePredecessor:{artifactSha256:artifact,manifestSha256:prior.manifestSha256,ledgerSha256:prior.ledgerSha256,roundId:'round-010'}},coverageAfter:publicCoverage,manualStartException:{kind:'explicit_user_requested_next_round',requestedAt:'2026-10-04T12:41:51Z',manualStartedAt:startedAt,previousRoundId:'round-010',previousClosedAt:'2026-10-04T11:44:42+00:00',previousLedgerSha256:'d15cbd2e5d56f79893920cecc922d8a12709b928e572fa720da8b3bb5545a63b',previousDeliveryCheckpointSha256:'a00f2b35b2a63a171097bf0535d7968584f6dc40a9411b401f432e1d884dd917',previousDeliveryVerifiedAt:'2026-10-04T12:27:05.849Z',nextScheduledStart:'2026-10-04T15:00:00Z',reason:'Explicit earlier request; actual offline start after bounded unresolved Git step was skipped. Delivery is not publication.'}});
 return r;
}
function check(r=manual(),extra={}){return validateRoundLedgers([...context.ledgers,r],{...context,now,...extra});}
function bad(r=manual(),pattern,extra={}){const x=check(r,extra);assert.equal(x.ok,false,'altered manual exception must fail');if(pattern)assert.match(x.errors.join('\n'),pattern);return x;}
const moduleAt=(dir,name)=>import(pathToFileURL(path.join(dir,`scripts/${name}.mjs`)).href);
const read=(dir,p)=>fs.readFile(path.join(dir,p));
async function write(dir,p,b){await fs.mkdir(path.dirname(path.join(dir,p)),{recursive:true});await fs.writeFile(path.join(dir,p),b);}
async function allow(dir,add=[],remove=[]){const paths=parsePublicAllowlist((await read(dir,'PUBLICATION-MANIFEST.txt')).toString());await write(dir,'PUBLICATION-MANIFEST.txt',[...new Set([...paths.filter(p=>!remove.includes(p)),...add])].join('\n')+'\n');}
async function inventory(dir){return Promise.all(parsePublicAllowlist((await read(dir,'PUBLICATION-MANIFEST.txt')).toString()).map(async p=>{const b=await read(dir,p);return {path:p,sha256:hash(b),bytes:b.length};}));}
async function historicalTen(t,sourceRoot=root){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'manual011-check-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.cp(sourceRoot,dir,{recursive:true});
 // A disposable historical authority must be internally coherent even when this
 // test runs after real011/012 delivery. Never alter the production trust prefix.
 const paths=parsePublicAllowlist((await read(dir,'PUBLICATION-MANIFEST.txt')).toString());
 const later=paths.filter(p=>{const r=p.match(/^docs\/rounds\/round-(\d+)\.(?:json|md)$/),b=p.match(/^data\/releases\/[^/]+-regular\.(\d+)\//),c=p.match(/^docs\/deliveries\/checkpoints\/round-(\d+)\.json$/);return r&&Number(r[1])>10||b&&Number(b[1])>10||c&&Number(c[1])>10;});
 await allow(dir,[],later);for(const p of later)await fs.rm(path.join(dir,p),{force:true});
 const trust=JSON.parse(await read(dir,'docs/deliveries/release-backup-trust.json'));trust.checkpoints=trust.checkpoints.filter(p=>Number(p.roundId.slice(6))<=10);await write(dir,'docs/deliveries/release-backup-trust.json',json(trust));
 const proof=JSON.parse(await read(dir,'docs/deliveries/checkpoints/round-010.json'));await write(dir,'data/manifest.json',proof.runtimeManifestRaw);
 return dir;
}
function entries(raw){const out=new Map();let at=0;while(raw.readUInt32LE(at)===0x04034b50){const size=raw.readUInt32LE(at+18),nl=raw.readUInt16LE(at+26),xl=raw.readUInt16LE(at+28),start=at+30+nl+xl;out.set(raw.subarray(at+30,at+30+nl).toString(),raw.readUInt16LE(at+8)===8?inflateRawSync(raw.subarray(start,start+size)):raw.subarray(start,start+size));at=start+size;}return out;}


test('exact manual011 separates earlier request from actual start and preserves the closed010 deadline',()=>{
 const before=context.ledgers.map(JSON.stringify),bankBefore=[...context.banks].map(([v,e])=>[v,hash(e.raw)]),ledgerBefore=[...context.ledgerSources].map(([v,b])=>[v,hash(b)]);
 const r=manual(),x=check(r);assert.equal(x.ok,true,x.errors.join('\n'));
 assert.equal(r.manualStartException.requestedAt,'2026-10-04T12:41:51Z');assert.equal(r.startedAt,startedAt);assert.equal(nextScheduledRoundAt(r.startedAt),Date.parse('2026-10-04T15:00:00Z'));
 assert.deepEqual(context.ledgers.map(JSON.stringify),before);assert.deepEqual([...context.banks].map(([v,e])=>[v,hash(e.raw)]),bankBefore);assert.deepEqual([...context.ledgerSources].map(([v,b])=>[v,hash(b)]),ledgerBefore);
 assert.equal(context.ledgers.at(-1).decisionDeadline,'2026-10-04T14:30:00Z');assert.equal(context.ledgers.at(-1).closedAt,'2026-10-04T11:44:42+00:00');
 assert.equal(Object.values(r.baseline.regularWrittenBySubject).reduce((a,b)=>a+b,0)+r.baseline.regularPractical,477);assert.equal(Object.values(r.coverageAfter.regularWrittenBySubject).reduce((a,b)=>a+b,0)+r.coverageAfter.regularPractical,403);assert.equal(r.counts.publishedRegularPractical,0);
});

test('manual011 rejects identity, request/start conflation, fake scheduled start and broader cutoffs',()=>{
 const changes=[r=>delete r.manualStartException,r=>r.roundId='round-012',r=>r.startedAt='2026-10-04T15:00:00Z',r=>r.startedAt='2026-10-04T11:00:00Z',r=>r.startedAt='2026-10-04T13:08:50Z',r=>r.manualStartException.requestedAt=startedAt,r=>r.manualStartException.manualStartedAt='2026-10-04T12:41:51Z',r=>r.manualStartException.previousRoundId='round-009',r=>r.manualStartException.previousClosedAt='2026-10-04T13:08:48Z',r=>r.manualStartException.nextScheduledStart='2026-10-04T19:00:00Z',r=>r.decisionDeadline='2026-10-04T14:30:01Z',r=>r.decisionDeadline='2026-10-04T15:00:00Z',r=>r.manualStartException.extraApproval=true];
 for(const mutate of changes){const r=manual();mutate(r);bad(r);}
});

test('manual011 needs exact prior raw ledger, loaded predecessor, bank and delivered checkpoint bytes',()=>{
 for(const key of ['previousLedgerSha256','previousDeliveryCheckpointSha256']){const r=manual();r.manualStartException[key]='f'.repeat(64);bad(r);}
 const r=manual();r.manualStartException.previousDeliveryVerifiedAt='2026-10-04T12:27:05.848Z';bad(r);
 for(const missing of ['ledgerSources','deliveryCheckpointSources','offlineBases'])bad(manual(),null,{[missing]:new Map()});
 bad(manual(),null,{deliveryCheckpointSources:new Map([['round-010',true]])});
 for(const key of ['ledgerSources','deliveryCheckpointSources']){const sources=new Map(context[key]);sources.set('round-010',Buffer.from('{}'));bad(manual(),/manual start/,{[key]:sources});}
 for(const mutate of [p=>p.status='running',p=>p.closedAt='2026-10-04T13:09:00Z',p=>p.decisionDeadline='2026-10-04T13:08:49Z',p=>p.summary+=' Altered historical declaration.']){const ledgers=structuredClone(context.ledgers);mutate(ledgers.at(-1));const x=validateRoundLedgers([...ledgers,manual()],{...context,now});assert.equal(x.ok,false);}
 const banks=new Map(context.banks);banks.set('2026.10.04-regular.10',{raw:Buffer.concat([raw,Buffer.from(' ')] )});bad(manual(),/hash mismatch/,{banks});
 const offlineBases=new Map(context.offlineBases);offlineBases.set(artifact,{...prior,eligibleAt:'2026-10-04T13:09:00Z'});bad(manual(),/manual start|earlier delivered/,{offlineBases});
 for(const mutate of [r=>delete r.baseline.offlinePredecessor,r=>r.baseline.sourceCommit='5'.repeat(40),r=>r.baseline.bankVersion='2026.10.04-regular.9',r=>r.baseline.offlinePredecessor.artifactSha256='f'.repeat(64)]){const r=manual();mutate(r);bad(r);}
});

test('manual011 retains current time, earlier actual successor, review limits and persistent/final freeze',()=>{
 bad(manual(),/future/,{now:Date.parse('2026-10-04T13:08:48Z')});bad(manual(),/next round|overlapping/,{nextRoundAt:'2026-10-04T14:00:00Z'});bad(manual(),/deadline reached/,{now:Date.parse('2026-10-04T14:30:00Z')});bad(manual(),/freeze/,{publicationState:{...context.publicationState,finalized:true,finalizedAt:'2026-10-04T13:09:00Z'}});
 for(const mutate of [r=>r.policy.maxCycles=4,r=>r.policy.maxRoundHours=5,r=>r.policy.maxLineageCycles=7,r=>r.startedAt='2026-10-16T15:00:00Z']){const r=manual();mutate(r);bad(r);}
});

test('manual011 does not consume15:00 or permit a duplicate round in the consumed11:00 slot',()=>{
 const m=manual();m.status='closed';m.closedAt='2026-10-04T13:09:00Z';m.noGapExplanation='Synthetic timing-only fixture; no candidate or public content changes.';
 const scheduled=manual();delete scheduled.manualStartException;scheduled.roundId='round-012';scheduled.startedAt='2026-10-04T15:00:00Z';scheduled.decisionDeadline='2026-10-04T18:30:00Z';
 const extra={...context,now:Date.parse('2026-10-04T15:01:00Z'),availableFiles:new Set([...context.availableFiles,'docs/rounds/round-011.md'])};
 const x=validateRoundLedgers([...context.ledgers,m,scheduled],extra);assert.equal(x.ok,true,x.errors.join('\n'));
 const duplicate=manual();duplicate.roundId='round-012';assert.equal(validateRoundLedgers([...context.ledgers,m,duplicate],extra).ok,false);
 delete duplicate.manualStartException;duplicate.startedAt='2026-10-04T13:09:00Z';const y=validateRoundLedgers([...context.ledgers,m,duplicate],extra);assert.equal(y.ok,false);assert.match(y.errors.join('\n'),/occurrence already consumed/);
});

test('the loader obtains exact checkpoint bytes and rejects missing/tampered proof or either freeze marker',async t=>{
 assert.equal(hash(context.deliveryCheckpointSources.get('round-010')),'a00f2b35b2a63a171097bf0535d7968584f6dc40a9411b401f432e1d884dd917');
 const dir=await historicalTen(t),v=await moduleAt(dir,'validate-round');
 await fs.writeFile(path.join(dir,'docs/rounds/round-011.json'),json(manual()));
 const checked=await v.loadRoundContext(dir,null,{release:true,now});assert.equal(check(checked.ledgers.find(r=>r.roundId==='round-011'),checked).ok,true);
 for(const [file,key] of [['data/manifest.json','finalRelease'],['data/publication-state.json','finalized']]){const target=path.join(dir,file),original=await fs.readFile(target),value=JSON.parse(original);value[key]=true;await fs.writeFile(target,json(value));await assert.rejects(v.loadRoundContext(dir,null,{release:true,now}),/freeze|cutoff/i);await fs.writeFile(target,original);}
 const proof=path.join(dir,'docs/deliveries/checkpoints/round-010.json'),original=await fs.readFile(proof);await fs.writeFile(proof,Buffer.concat([original,Buffer.from(' ')]));await assert.rejects(v.loadRoundContext(dir,null,{release:true,now}),/checkpoint|proof/i);await fs.rm(proof);await assert.rejects(v.loadRoundContext(dir,null,{release:true,now}),/ENOENT|checkpoint|proof/i);
});

test('exact manual011 can be checkpointed and followed by ordinary012 without another timing exception',async t=>{
 // All zero-addition banks, receipts, messages and archives in this test are
 // synthetic disposable fixtures. They are never uploaded or registered live.
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-04T13:12:00Z')});
 const dir=await historicalTen(t),parent=await fs.mkdtemp(path.join(os.tmpdir(),'manual011-successor-'));t.after(()=>fs.rm(parent,{recursive:true,force:true}));
 const base=path.join(parent,'synthetic-public8');await fs.cp(dir,base,{recursive:true});
 const remove=parsePublicAllowlist((await read(base,'PUBLICATION-MANIFEST.txt')).toString()).filter(p=>p==='docs/deliveries/release-backup-trust.json'||/round-0(?:09|1\d)|regular\.(?:9|1\d)\/|normal-backup-009/.test(p));
 await allow(base,[],remove);for(const p of remove)await fs.rm(path.join(base,p),{force:true});
 const publicBank=JSON.parse(await read(base,'data/releases/2026.10.04-regular.8/bank.json'));
 await write(base,'data/manifest.json',json({schemaVersion:1,bankVersion:publicBank.bankVersion,releasedAt:publicBank.releasedAt,file:`releases/${publicBank.bankVersion}/bank.json`,sha256:hash(await read(base,`data/releases/${publicBank.bankVersion}/bank.json`)),changeSummary:publicBank.changeSummary,finalRelease:false}));
 async function stageBank(target,r,priorBank){
  const bank=structuredClone(priorBank);bank.bankVersion=`2026.10.04-regular.${Number(r.roundId.slice(6))}`;bank.roundId=r.roundId;bank.releasedAt=r.closedAt;bank.changeSummary='Synthetic zero-addition continuation; not a real release.';const bankRaw=json(bank);
  Object.assign(r.publication,{bankVersion:bank.bankVersion,bankSha256:hash(bankRaw)});
  const bp=`data/releases/${bank.bankVersion}/bank.json`,lp=`docs/rounds/${r.roundId}.json`,mp=`docs/rounds/${r.roundId}.md`;
  await write(target,bp,bankRaw);await write(target,lp,json(r));await write(target,mp,'Synthetic timing fixture; no real content or delivery claim.\n');await allow(target,[bp,lp,mp]);
  await write(target,'data/manifest.json',json({schemaVersion:1,bankVersion:bank.bankVersion,releasedAt:bank.releasedAt,file:`releases/${bank.bankVersion}/bank.json`,sha256:hash(bankRaw),changeSummary:bank.changeSummary,finalRelease:false}));
  return bank;
 }
 const r=manual();Object.assign(r,{status:'closed',closedAt:'2026-10-04T13:09:00Z',noGapExplanation:'Synthetic timing-only fixture; no new learning goals.'});const bank11=await stageBank(dir,r,JSON.parse(raw));
 const v11=await moduleAt(dir,'validate-round'),c11=await v11.loadRoundContext(dir,null,{release:true,now:Date.now()});const result11=v11.validateReleaseLedger(c11.ledgers,{...c11,now:Date.now()});assert.equal(result11.ok,true,result11.errors.join('\n'));
 const {writeReleaseDeliveryPair}=await moduleAt(dir,'release-bundle');
 const pair=await writeReleaseDeliveryPair({baseRoot:base,workRoot:dir,baseCommit:'500811b7ee226f33cfb598df42c6cb347b935d28',baseVerifiedAt:'2026-10-04T13:09:30Z',baseInventory:await inventory(base),reviewedInventory:await inventory(dir),roundId:'round-011',deltaOutputPath:path.join(parent,'delta.zip'),completeOutputPath:path.join(parent,'complete.zip'),now:Date.parse('2026-10-04T13:10:00Z')});
 const delta=entries(await fs.readFile(pair.delta.path)),complete=entries(await fs.readFile(pair.complete.path)),d=JSON.parse(delta.get('manifest.json')),c=JSON.parse(complete.get('manifest.json'));
 // Reconstruct the fixture's cumulative before-hash list from the fixed009
 // anchor. This is fixture assembly, never an assertion of a new remote read.
 const pinned=JSON.parse(await read(dir,'docs/deliveries/normal-backup-009.json')),old=new Map(pinned.deltaManifest.files.map(f=>[f.path,f])),anchor=new Map(pinned.completeManifest.files.filter(f=>!old.has(f.path)||old.get(f.path).beforeSha256!==null).map(f=>[f.path,old.has(f.path)?old.get(f.path).beforeSha256:f.sha256]));
 d.files=c.files.filter(f=>anchor.get(f.path)!==f.sha256).map(f=>({...f,beforeSha256:anchor.get(f.path)??null}));for(const name of [...delta.keys()])if(name.startsWith('files/'))delta.delete(name);for(const f of d.files)delta.set('files/'+f.path,complete.get('project/'+f.path));delta.set('manifest.json',json(d));
 const deltaZip=zipStored([...delta].map(([name,raw])=>({name,raw})),{compress:true});c.sourceRelease.deltaArtifactSha256=hash(deltaZip);c.sourceRelease.deltaManifestSha256=hash(json(d));complete.set('manifest.json',json(c));const completeZip=zipStored([...complete].map(([name,raw])=>({name,raw})),{compress:true});
 const artifacts=[['delta',deltaZip],['complete',completeZip]].map(([kind,b])=>({kind,library_file_id:`synthetic-never-delivered-${kind}`,sha256:hash(b),bytes:b.length}));
 const saved={schemaVersion:1,roundId:'round-011',status:'library_saved_attachment_pending',savedAt:'2026-10-04T13:10:30Z',newlyPublishedByDelivery:0,artifacts};
 const attached={...saved,status:'native_attachments_accepted',attachmentAcceptedAt:'2026-10-04T13:11:00Z',attachments:artifacts.map(a=>({kind:a.kind,library_file_id:a.library_file_id,messageId:'synthetic-no-real-message',acceptedAt:'2026-10-04T13:11:00Z'})),userOpenOrDownloadObserved:false,deliveryMode:'release_backup',publicationAtPreparation:'not_attempted',publicationCountsChangedByDelivery:false};
 const api=await moduleAt(dir,'release-backup-continuation'),proposal=await api.prepareReleaseBackupContinuation({deltaZip,completeZip,libraryReceiptRaw:json(saved),attachmentReceiptRaw:json(attached),now:Date.now()});assert.equal(proposal.status,'proposed_requires_independent_receipt_review');
 assert.equal(proposal.proof.origin.reconciliation.firstUnresolvedAt,'2026-10-04T10:02:05.215Z');assert.equal(proposal.proof.origin.gitOutcome.objects,'unknown');assert.deepEqual(proposal.proof.completeManifest.prerequisiteArtifacts,[]);
 const next=path.join(parent,'synthetic12');await fs.cp(dir,next,{recursive:true});await write(next,proposal.trustRecord.path,proposal.proofRaw);await write(next,'docs/deliveries/release-backup-trust.json',proposal.trustRegistryRaw);await allow(next,[proposal.trustRecord.path]);
 t.mock.timers.setTime(Date.parse('2026-10-04T15:02:00Z'));
 const v12=await moduleAt(next,'validate-round'),before=await v12.loadRoundContext(next,null,{release:true,now:Date.now()}),[a,b]=[...before.offlineBases].find(([,e])=>e.roundId==='round-011');
 const r12=manual();delete r12.manualStartException;Object.assign(r12,{roundId:'round-012',status:'closed',startedAt:'2026-10-04T15:00:00Z',decisionDeadline:'2026-10-04T18:30:00Z',closedAt:'2026-10-04T15:01:00Z',noGapExplanation:'Synthetic ordinary next scheduled occurrence.'});r12.baseline={sourceCommit:b.baseCommit,bankVersion:b.bankVersion,bankSha256:b.bankSha256,regularWrittenBySubject:coverage.regularWrittenBySubject,regularPractical:coverage.regularPractical,offlinePredecessor:{artifactSha256:a,manifestSha256:b.manifestSha256,ledgerSha256:b.ledgerSha256,roundId:b.roundId}};await stageBank(next,r12,bank11);
 for(const release of [false,true]){const current=await v12.loadRoundContext(next,null,{release,now:Date.now()});assert.equal(hash(current.deliveryCheckpointSources.get('round-010')),'a00f2b35b2a63a171097bf0535d7968584f6dc40a9411b401f432e1d884dd917');assert.equal(hash(current.deliveryCheckpointSources.get('round-011')),proposal.trustRecord.sha256);if(release){const result=v12.validateReleaseLedger(current.ledgers,{...current,now:Date.now()});assert.equal(result.ok,true,result.errors.join('\n'));}}
 assert.equal(hash(await read(next,'docs/rounds/round-010.json')),'d15cbd2e5d56f79893920cecc922d8a12709b928e572fa720da8b3bb5545a63b');assert.equal(hash(await read(next,'docs/rounds/round-011.json')),hash(await read(dir,'docs/rounds/round-011.json')));
 // Re-run the historical loader fixture with this genuinely later synthetic tree.
 const historical=await historicalTen(t,next),vh=await moduleAt(historical,'validate-round');await write(historical,'docs/rounds/round-011.json',json(manual()));const restored=await vh.loadRoundContext(historical,null,{release:true,now});assert.equal(restored.manifest.bankVersion,'2026.10.04-regular.10');assert.equal(restored.deliveryCheckpointSources.size,1);
});
