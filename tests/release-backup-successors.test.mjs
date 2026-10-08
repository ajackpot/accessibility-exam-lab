import {encodeSevenZip,decodeSevenZip,archiveSignature} from '../scripts/archive-format.mjs';
import {retainHistoricalQuarantinePrefix} from './quarantine-fixtures.mjs';
/** Synthetic future archives/receipts only. Nothing here is uploaded or delivered. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {parsePublicAllowlist,zipStored} from '../scripts/download-fallback.mjs';
import {FREEZE_AT} from '../src/domain.js';
const root=path.resolve(import.meta.dirname,'..'),hash=b=>createHash('sha256').update(b).digest('hex'),json=o=>Buffer.from(JSON.stringify(o,null,2)+'\n'),clone=structuredClone;
const trustPath='docs/deliveries/release-backup-trust.json';
const moduleAt=(dir,name)=>import(pathToFileURL(path.join(dir,`scripts/${name}.mjs`)).href);
const read=(dir,p)=>fs.readFile(path.join(dir,p));
async function write(dir,p,b){await fs.mkdir(path.dirname(path.join(dir,p)),{recursive:true});await fs.writeFile(path.join(dir,p),b);}
async function allow(dir,add=[],remove=[]){const paths=parsePublicAllowlist((await read(dir,'PUBLICATION-MANIFEST.txt')).toString());await write(dir,'PUBLICATION-MANIFEST.txt',[...new Set([...paths.filter(p=>!remove.includes(p)),...add])].join('\n')+'\n');}
async function inventory(dir){return Promise.all(parsePublicAllowlist((await read(dir,'PUBLICATION-MANIFEST.txt')).toString()).map(async p=>{const b=await read(dir,p);return {path:p,sha256:hash(b),bytes:b.length};}));}
function receiptPair(roundId,pair){
 const artifacts=['delta','complete'].map(kind=>({kind,library_file_id:`synthetic-${roundId}-${kind}`,sha256:pair[kind].sha256,bytes:pair[kind].bytes}));
 const saved={schemaVersion:1,roundId,status:'library_saved_attachment_pending',savedAt:new Date(Date.now()-60000).toISOString(),newlyPublishedByDelivery:0,artifacts};
 const attached={...saved,status:'native_attachments_accepted',attachmentAcceptedAt:new Date(Date.now()-30000).toISOString(),attachments:artifacts.map(a=>({kind:a.kind,library_file_id:a.library_file_id,messageId:'synthetic-test-only-no-message',acceptedAt:new Date(Date.now()-30000).toISOString()})),userOpenOrDownloadObserved:false,deliveryMode:'release_backup',publicationAtPreparation:'not_attempted',publicationCountsChangedByDelivery:false};
 return {libraryReceiptRaw:json(saved),attachmentReceiptRaw:json(attached)};
}
async function author(dir,n){
 const validate=await moduleAt(dir,'validate-round'),context=await validate.loadRoundContext(dir,null,{release:true,now:Date.now()});
 const [artifact,b]=[...context.offlineBases].find(([,b])=>b.roundId===`round-${String(n-1).padStart(3,'0')}`);
 const bank=JSON.parse(context.banks.get(b.bankVersion).raw),remote=JSON.parse(context.banks.get('2026.10.04-regular.8').raw);
 const r=JSON.parse(await read(dir,'docs/rounds/round-ledger.template.json')),hour=11+(n-10)*4,id=`round-${String(n).padStart(3,'0')}`,at=min=>`2026-10-04T${hour}:${String(min).padStart(2,'0')}:00Z`;
 Object.assign(r,{roundId:id,status:'closed',startedAt:at(0),decisionDeadline:`2026-10-04T${hour+3}:30:00Z`,closedAt:at(5),summary:'Synthetic zero-addition continuation fixture; never a real decision.',noGapExplanation:'Synthetic exact predecessor validation only.'});
 r.baseline={sourceCommit:b.baseCommit,bankVersion:b.bankVersion,bankSha256:b.bankSha256,regularWrittenBySubject:validate.regularCoverage(bank).regularWrittenBySubject,regularPractical:validate.regularCoverage(bank).regularPractical,offlinePredecessor:{artifactSha256:artifact,manifestSha256:b.manifestSha256,ledgerSha256:b.ledgerSha256,roundId:b.roundId}};r.coverageAfter=validate.regularCoverage(remote);
 bank.bankVersion=`2026.10.04-regular.${n}`;bank.roundId=id;bank.releasedAt=at(6);bank.changeSummary='Synthetic successor bank; not a public release.';const raw=json(bank);
 Object.assign(r.publication,{bankVersion:bank.bankVersion,bankSha256:hash(raw)});
 const bankPath=`data/releases/${bank.bankVersion}/bank.json`,ledgerPath=`docs/rounds/${id}.json`;
 await write(dir,bankPath,raw);await write(dir,ledgerPath,json(r));await write(dir,`docs/rounds/${id}.md`,'Synthetic test fixture.\n');await write(dir,'data/manifest.json',json({schemaVersion:1,bankVersion:bank.bankVersion,releasedAt:bank.releasedAt,file:`releases/${bank.bankVersion}/bank.json`,sha256:hash(raw),changeSummary:bank.changeSummary,finalRelease:false}));await allow(dir,[bankPath,ledgerPath,`docs/rounds/${id}.md`]);
 return {roundId:id,at};
}

function entries(raw){if(archiveSignature(raw)==='7z')return decodeSevenZip(raw);const out=new Map();let at=0;while(raw.readUInt32LE(at)===0x04034b50){const size=raw.readUInt32LE(at+18),nl=raw.readUInt16LE(at+26),xl=raw.readUInt16LE(at+28),start=at+30+nl+xl;out.set(raw.subarray(at+30,at+30+nl).toString(),raw.readUInt16LE(at+8)===8?inflateRawSync(raw.subarray(start,start+size)):raw.subarray(start,start+size));at=start+size;}return out;}
function alterPair(input,alter){
 const delta=entries(input.deltaZip),complete=entries(input.completeZip),d=JSON.parse(delta.get('manifest.json')),c=JSON.parse(complete.get('manifest.json'));alter(d,c,delta,complete);
 delta.set('manifest.json',json(d));const deltaZip=zipStored([...delta].map(([name,raw])=>({name,raw})),{compress:true});
 c.sourceRelease.deltaManifestSha256=hash(json(d));c.sourceRelease.deltaArtifactSha256=hash(deltaZip);complete.set('manifest.json',json(c));
 const completeZip=encodeSevenZip([...complete].map(([name,raw])=>({name,raw}))),saved=JSON.parse(input.libraryReceiptRaw),attached=JSON.parse(input.attachmentReceiptRaw);
 for(const r of [saved,attached])for(const a of r.artifacts){const b=a.kind==='delta'?deltaZip:completeZip;a.sha256=hash(b);a.bytes=b.length;}
 return {...input,deltaZip,completeZip,libraryReceiptRaw:json(saved),attachmentReceiptRaw:json(attached)};
}

async function check(dir,authority=dir){const v=await moduleAt(authority,'validate-round'),c=await v.loadRoundContext(dir,null,{release:true,now:Date.now()});const r=v.validateReleaseLedger(c.ledgers,{...c,now:Date.now()});assert.equal(r.ok,true,r.errors.join('\n'));return c;}

test('generic reviewed checkpoints carry exact010 to011 to012 without adapter edits',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-04T11:10:00Z')});
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'generic-delivery-test-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 // Isolate synthetic successors from later real campaign records and trust data.
 // Only this disposable fixture resets its registry; production history is never edited.
 const seed=path.join(temp,'historical9');await fs.cp(root,seed,{recursive:true});
 const seedPaths=parsePublicAllowlist((await read(seed,'PUBLICATION-MANIFEST.txt')).toString()),later=seedPaths.filter(p=>{const r=p.match(/^docs\/rounds\/round-(\d+)\.(?:json|md)$/),b=p.match(/^data\/releases\/[^/]+-regular\.(\d+)\//);return r&&Number(r[1])>9||b&&Number(b[1])>9||p.startsWith('docs/deliveries/checkpoints/')||p.startsWith('docs/deliveries/chains/');});
 await allow(seed,[],later);for(const p of later)await fs.rm(path.join(seed,p));
 // Clear only this historical fixture's newer independent delivery authority.
 if(seedPaths.includes('docs/deliveries/offline-chain-trust.json'))await write(seed,'docs/deliveries/offline-chain-trust.json',json({schemaVersion:1,kind:'reviewed_independent_offline_chains',checkpoints:[]}));
 await retainHistoricalQuarantinePrefix(seed,Date.now());
 const pinned=JSON.parse(await read(seed,'docs/deliveries/normal-backup-009.json'));
 await write(seed,trustPath,json({schemaVersion:1,rootProofSha256:hash(await read(seed,'docs/deliveries/normal-backup-009.json')),checkpoints:[]}));
 const b9=JSON.parse(await read(seed,'data/releases/2026.10.04-regular.9/bank.json'));
 await write(seed,'data/manifest.json',json({schemaVersion:1,bankVersion:b9.bankVersion,releasedAt:b9.releasedAt,file:`releases/${b9.bankVersion}/bank.json`,sha256:pinned.completeManifest.sourceRelease.bankSha256,changeSummary:b9.changeSummary,finalRelease:false}));
 const base=path.join(temp,'synthetic-remote8');await fs.cp(seed,base,{recursive:true});
 // Portable synthetic public8 tree, not a claim about any actual remote observation.
 const remove=parsePublicAllowlist((await read(base,'PUBLICATION-MANIFEST.txt')).toString()).filter(p=>p===trustPath||/round-0(?:09|1\d)|regular\.(?:9|1\d)\/|normal-backup-009/.test(p));
 await allow(base,[],remove);for(const p of remove)await fs.rm(path.join(base,p));
 const b8=JSON.parse(await read(base,'data/releases/2026.10.04-regular.8/bank.json'));
 await write(base,'data/manifest.json',json({schemaVersion:1,bankVersion:b8.bankVersion,releasedAt:b8.releasedAt,file:`releases/${b8.bankVersion}/bank.json`,sha256:hash(await read(base,`data/releases/${b8.bankVersion}/bank.json`)),changeSummary:b8.changeSummary,finalRelease:false}));
 const stages=[],proposals=[],inputs=[];let last=seed;
 for(const n of [10,11,12]){
  t.mock.timers.setTime(Date.parse(`2026-10-04T${11+(n-10)*4}:10:00Z`));
  const dir=path.join(temp,`stage${n}`);await fs.cp(last,dir,{recursive:true});
  if(proposals.length){const p=proposals.at(-1);await write(dir,p.trustRecord.path,p.proofRaw);await write(dir,trustPath,p.trustRegistryRaw);await allow(dir,[p.trustRecord.path]);}
  const identity=await author(dir,n);stages.push(dir);
  const c=await check(dir);assert.equal(c.manifest.bankVersion,`2026.10.04-regular.${n}`);assert.ok(c.offlineBases.has(JSON.parse(await read(dir,`docs/rounds/${identity.roundId}.json`)).baseline.offlinePredecessor.artifactSha256));
  if(n<12){
   const {writeReleaseDeliveryPair}=await moduleAt(dir,'release-bundle');
   const pair=await writeReleaseDeliveryPair({baseRoot:base,workRoot:dir,baseCommit:'500811b7ee226f33cfb598df42c6cb347b935d28',baseVerifiedAt:identity.at(7),baseInventory:await inventory(base),reviewedInventory:await inventory(dir),roundId:identity.roundId,deltaOutputPath:path.join(temp,`delta${n}.zip`),completeOutputPath:path.join(temp,`complete${n}.7z`),now:Date.parse(identity.at(8))});
   let input={deltaZip:await fs.readFile(pair.delta.path),completeZip:await fs.readFile(pair.complete.path),...receiptPair(identity.roundId,pair),now:Date.now()};
   // The disposable base includes current support-code bytes. Use the pinned root
   // manifest's historical before hashes to form the synthetic cumulative delta;
   // this is fixture construction, never a claim that a remote read occurred.
   input=alterPair(input,(d,c,delta,complete)=>{const old=new Map(pinned.deltaManifest.files.map(f=>[f.path,f])),anchor=new Map(pinned.completeManifest.files.filter(f=>!old.has(f.path)||old.get(f.path).beforeSha256!==null).map(f=>[f.path,old.has(f.path)?old.get(f.path).beforeSha256:f.sha256]));d.files=c.files.filter(f=>anchor.get(f.path)!==f.sha256).map(f=>({...f,beforeSha256:anchor.get(f.path)??null}));for(const name of [...delta.keys()])if(name.startsWith('files/'))delta.delete(name);for(const f of d.files)delta.set('files/'+f.path,complete.get('project/'+f.path));});
   const api=await moduleAt(dir,'release-backup-continuation'),proposal=await api.prepareReleaseBackupContinuation(input);proposals.push(proposal);inputs.push(input);
   assert.equal(proposal.status,'proposed_requires_independent_receipt_review');assert.equal(proposal.proof.origin.reconciliation.firstUnresolvedAt,'2026-10-04T10:02:05.215Z');assert.equal(proposal.proof.origin.reconciliation.deadlineAt,'2026-10-04T10:12:05.215Z');assert.equal(proposal.proof.origin.gitOutcome.objects,'unknown');assert.equal(proposal.proof.origin.permissionWait.roundId,'round-009');
   assert.equal(proposal.proof.deltaManifest.permissionDeadlineAt,undefined);assert.deepEqual(proposal.proof.completeManifest.prerequisiteArtifacts,[]);assert.ok(!proposal.proofRaw.toString().includes('synthetic-test-only-no-message'));assert.ok(!proposal.proofRaw.toString().includes('library_file_id'));
   assert.equal(hash(input.completeZip),proposal.proof.completeArtifactSha256);
  }
  last=dir;
 }
 const final=stages[2],authority=final,api=await moduleAt(stages[0],'release-backup-continuation');
 await t.test('ordinary and explicit context modes retain both predecessor checkpoints',async()=>{const v=await moduleAt(authority,'validate-round');for(const release of [false,true]){const c=await v.loadRoundContext(final,path.join(final,'docs/rounds/round-012.json'),{release,now:Date.now()});assert.ok(c.offlineBases.has(proposals[0].proof.deltaArtifactSha256));assert.ok(c.offlineBases.has(proposals[1].proof.deltaArtifactSha256));if(!release)assert.equal(c.manifest,null);}});
 const mutate=async(name,fn,re)=>{await t.test(name,async()=>{const dir=path.join(temp,`bad-${name.replaceAll(/[^a-z0-9]+/gi,'-')}`);await fs.cp(final,dir,{recursive:true});await fn(dir);await assert.rejects(check(dir,authority),re);});};
 await mutate('missing registry dependency',async d=>{await fs.unlink(path.join(d,trustPath));await allow(d,[],[trustPath]);},/ENOENT|dependency/);
 await mutate('unlisted registered proof',d=>allow(d,[],[proposals[0].trustRecord.path]),/dependency/);
 await mutate('missing root proof and source ledger',async d=>{await fs.unlink(path.join(d,'docs/deliveries/normal-backup-009.json'));await fs.unlink(path.join(d,'docs/rounds/round-009.json'));},/ENOENT|proof|dependency/);
 await mutate('missing prior checkpoint',d=>fs.unlink(path.join(d,proposals[0].trustRecord.path)),/ENOENT/);
 await mutate('tampered proof bytes',d=>fs.appendFile(path.join(d,proposals[0].trustRecord.path),' '),/tampered/);
 await mutate('reordered trust evidence',async d=>{const p=JSON.parse(await read(d,trustPath));p.checkpoints.reverse();await write(d,trustPath,json(p));},/Reordered/);
 await mutate('branched trust evidence',async d=>{const p=JSON.parse(await read(d,trustPath));p.checkpoints[1].predecessorProofSha256=p.rootProofSha256;await write(d,trustPath,json(p));},/branched/);
 await mutate('omitted tail trust evidence',async d=>{const p=JSON.parse(await read(d,trustPath));p.checkpoints.pop();await write(d,trustPath,json(p));},/Missing reviewed/);
 await mutate('self pinned workspace proof',async d=>{const p=JSON.parse(await read(d,trustPath));p.checkpoints[1].sha256='a'.repeat(64);await write(d,trustPath,json(p));},/Unreviewed/);
 await mutate('old unknown clock reset',async d=>{const p=JSON.parse(await read(d,'docs/deliveries/normal-backup-009.json'));p.terminal.reconciliation.firstUnresolvedAt='2026-10-04T19:00:00Z';await write(d,'docs/deliveries/normal-backup-009.json',json(p));},/tampered/);
 await mutate('original accepted review cycle reset',async d=>{const p=JSON.parse(await read(d,'docs/rounds/round-009.json'));p.candidates[0].attemptCount=0;await write(d,'docs/rounds/round-009.json',json(p));},/Original|original/);
 await mutate('historical delivered ledger changed',d=>fs.appendFile(path.join(d,'docs/rounds/round-010.json'),' '),/ledger|history/);
 await mutate('seed historical bytes changed',d=>fs.appendFile(path.join(d,'data/releases/2026.10.02-seed.1/bank.json'),' '),/history|immutable/);
 await mutate('reused accepted goal',async d=>{const p=JSON.parse(await read(d,'docs/rounds/round-012.json')),prior=JSON.parse(await read(d,'docs/rounds/round-009.json'));p.candidates=[clone(prior.candidates[0])];await write(d,'docs/rounds/round-012.json',json(p));},/campaign|duplicate|candidate|target/i);
 await mutate('reused immutable version',async d=>{const p=JSON.parse(await read(d,'docs/rounds/round-012.json'));p.publication.bankVersion='2026.10.04-regular.11';await write(d,'docs/rounds/round-012.json',json(p));},/campaign|version|bank/i);
 await mutate('wrong predecessor skips latest delivery',async d=>{const p=JSON.parse(await read(d,'docs/rounds/round-012.json')),old=JSON.parse(await read(d,'docs/rounds/round-011.json'));p.baseline=old.baseline;await write(d,'docs/rounds/round-012.json',json(p));},/latest|predecessor|campaign/i);
 for(const [p,key] of [['data/manifest.json','finalRelease'],['data/publication-state.json','finalized']])await mutate(`persistent freeze ${key}`,async d=>{const m=JSON.parse(await read(d,p));m[key]=true;await write(d,p,json(m));},/freeze/);
 await t.test('final cutoff is never bypassed',async()=>{t.mock.timers.setTime(FREEZE_AT);await assert.rejects(check(final),/cutoff|freeze/);t.mock.timers.setTime(Date.parse('2026-10-04T19:10:00Z'));});
 for(const [name,fn] of [['prepared receipt',r=>r.status='prepared'],['failed receipt',r=>r.status='delivery_failed'],['wrong pair',r=>r.artifacts[0].sha256='a'.repeat(64)],['wrong release',r=>r.roundId='round-999'],['missing native attachment',r=>delete r.attachments],['one native attachment',r=>r.attachments.pop()],['duplicate native attachment',r=>r.attachments[1]=r.attachments[0]],['mismatched native artifact',r=>r.attachments[0].library_file_id='wrong-id']])await t.test(name,async()=>{const input={...inputs[0]},r=JSON.parse(input.attachmentReceiptRaw);fn(r);input.attachmentReceiptRaw=json(r);await assert.rejects(api.prepareReleaseBackupContinuation(input),/receipt|release|pair|native|artifact/i);});
 await t.test('changed archive is rejected against actual receipt bytes',async()=>{const input={...inputs[0],deltaZip:Buffer.concat([inputs[0].deltaZip,Buffer.from('x')])};await assert.rejects(api.prepareReleaseBackupContinuation(input),/exact delivered pair/);});
 for(const [name,alter,re] of [
  ['stale public anchor',d=>d.baseVerifiedAt='2026-10-04T10:59:59Z',/fresh round public anchor/],
  ['future public anchor',d=>d.baseVerifiedAt='2026-10-04T11:09:00Z',/fresh round public anchor/],
  ['different public anchor',(d,c)=>{d.baseCommit='a'.repeat(40);c.sourceRelease.baseCommit=d.baseCommit;},/anchor mismatch/],
  ['wrong before hash',d=>d.files[0].beforeSha256='a'.repeat(64),/before\/after/],
  ['invented new timeout',d=>d.permissionDeadlineAt='2026-10-04T11:20:00Z',/Unexpected/]
 ])await t.test(name,async()=>{await assert.rejects(api.prepareReleaseBackupContinuation(alterPair(inputs[0],alter)),re);});
 await t.test('central archive corruption fails even with self-consistent receipt hashes',async()=>{const input={...inputs[0],deltaZip:Buffer.from(inputs[0].deltaZip)};input.deltaZip[input.deltaZip.length-6]^=1;const saved=JSON.parse(input.libraryReceiptRaw),attached=JSON.parse(input.attachmentReceiptRaw);for(const r of [saved,attached])r.artifacts[0].sha256=hash(input.deltaZip);input.libraryReceiptRaw=json(saved);input.attachmentReceiptRaw=json(attached);await assert.rejects(api.prepareReleaseBackupContinuation(input),/ZIP end/);});
 await t.test('live authority freeze blocks checkpoint preparation despite unfrozen archive',async()=>{for(const [file,key] of [['data/manifest.json','finalRelease'],['data/publication-state.json','finalized']]){const original=await read(stages[0],file),value=JSON.parse(original);value[key]=true;await write(stages[0],file,json(value));try{await assert.rejects(api.prepareReleaseBackupContinuation(inputs[0]),/freeze/);}finally{await write(stages[0],file,original);}}});
 await t.test('historical source may omit its own checkpoint only with exact registered decisions',async()=>{const old=path.join(temp,'historical-source10');await fs.cp(stages[0],old,{recursive:true});await check(old,authority);const source=JSON.parse(await read(old,'docs/rounds/round-010.json'));source.summary+=' Rewritten after delivery.';await write(old,'docs/rounds/round-010.json',json(source));await assert.rejects(check(old,authority),/Previously delivered/);});
 await t.test('independent authority cannot package an omitted empty registry',async()=>{const candidate=path.join(temp,'missing-empty-registry');await fs.cp(stages[0],candidate,{recursive:true});await fs.unlink(path.join(candidate,trustPath));await allow(candidate,[],[trustPath]);const {writeReleaseDeliveryPair}=await moduleAt(stages[0],'release-bundle');await assert.rejects(writeReleaseDeliveryPair({baseRoot:base,workRoot:candidate,baseCommit:'500811b7ee226f33cfb598df42c6cb347b935d28',baseVerifiedAt:'2026-10-04T11:07:00Z',baseInventory:await inventory(base),reviewedInventory:await inventory(candidate),roundId:'round-010',deltaOutputPath:path.join(temp,'forbidden-delta.zip'),completeOutputPath:path.join(temp,'forbidden-complete.7z'),now:Date.now()}),/ENOENT|dependency/);await assert.rejects(fs.stat(path.join(temp,'forbidden-delta.zip')),{code:'ENOENT'});});
 for(const [label,time] of [['saving after native acceptance','2026-10-04T11:09:59Z'],['saving before artifact preparation','2026-10-04T11:07:59Z']])await t.test(label,async()=>{const input={...inputs[0]},saved=JSON.parse(input.libraryReceiptRaw),attached=JSON.parse(input.attachmentReceiptRaw);saved.savedAt=time;attached.savedAt=time;input.libraryReceiptRaw=json(saved);input.attachmentReceiptRaw=json(attached);await assert.rejects(api.prepareReleaseBackupContinuation(input),/preparation must precede/);});
 await t.test('central directory symlinks fail even with matching receipt hashes',async()=>{const input={...inputs[0],deltaZip:Buffer.from(inputs[0].deltaZip)},offset=input.deltaZip.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));input.deltaZip.writeUInt16LE(0x0314,offset+4);input.deltaZip.writeUInt32LE((0xa1ff*65536)>>>0,offset+38);const saved=JSON.parse(input.libraryReceiptRaw),attached=JSON.parse(input.attachmentReceiptRaw);for(const r of [saved,attached])r.artifacts[0].sha256=hash(input.deltaZip);input.libraryReceiptRaw=json(saved);input.attachmentReceiptRaw=json(attached);await assert.rejects(api.prepareReleaseBackupContinuation(input),/regular nonspecial/);});
 for(const [label,modify,re] of [
  ['central Unicode-path extra',b=>{const o=b.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));b.writeUInt16LE(9,o+30);},/writer metadata/],
  ['central comment',b=>{const o=b.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));b.writeUInt16LE(1,o+32);},/writer metadata/],
  ['local extra',b=>b.writeUInt16LE(9,28),/Unsupported/],
  ['non ASCII filename',b=>b[30]=0xff,/ASCII/],
  ['unsupported flags',b=>b.writeUInt16LE(0,6),/Unsupported/]
 ])await t.test(label,async()=>{const input={...inputs[0],deltaZip:Buffer.from(inputs[0].deltaZip)};modify(input.deltaZip);const saved=JSON.parse(input.libraryReceiptRaw),attached=JSON.parse(input.attachmentReceiptRaw);for(const r of [saved,attached])r.artifacts[0].sha256=hash(input.deltaZip);input.libraryReceiptRaw=json(saved);input.attachmentReceiptRaw=json(attached);await assert.rejects(api.prepareReleaseBackupContinuation(input),re);});
 await t.test('future checkpoint remains exact but cannot activate an earlier audit predecessor',async()=>{const futureRoot=path.join(temp,'future-checkpoint-source10');await fs.cp(stages[1],futureRoot,{recursive:true});await fs.unlink(path.join(futureRoot,'docs/rounds/round-011.json'));await fs.unlink(path.join(futureRoot,'docs/rounds/round-011.md'));await allow(futureRoot,[],['docs/rounds/round-011.json','docs/rounds/round-011.md']);await write(futureRoot,'data/manifest.json',await read(stages[0],'data/manifest.json'));const pin=proposals[0].trustRecord,proof=clone(proposals[0].proof);proof.verifiedAt='2026-10-04T12:30:00Z';const raw=json(proof),trust=JSON.parse(await read(futureRoot,trustPath));trust.checkpoints[0]={...pin,sha256:hash(raw),verifiedAt:proof.verifiedAt};await write(futureRoot,pin.path,raw);await write(futureRoot,trustPath,json(trust));const v=await moduleAt(futureRoot,'validate-round'),early=await v.loadRoundContext(futureRoot,null,{release:true,now:Date.parse('2026-10-04T12:00:00Z')});assert.equal(early.offlineBases.has(proof.deltaArtifactSha256),false);const {validateCampaignBaselines}=await moduleAt(futureRoot,'editorial-ledger'),successor=JSON.parse(await read(stages[1],'docs/rounds/round-011.json'));successor.startedAt='2026-10-04T12:15:00Z';const tooEarly=validateCampaignBaselines([...early.ledgers,successor],{...early,now:Date.parse(successor.startedAt)});assert.equal(tooEarly.ok,false);assert.match(tooEarly.errors.join(' '),/offline predecessor/);const later=await v.loadRoundContext(futureRoot,null,{release:true,now:Date.parse('2026-10-04T12:30:00Z')});assert.equal(later.offlineBases.has(proof.deltaArtifactSha256),true);const changed=JSON.parse(await read(futureRoot,'docs/rounds/round-010.json'));changed.summary+=' Tampered future source.';await write(futureRoot,'docs/rounds/round-010.json',json(changed));await assert.rejects(v.loadRoundContext(futureRoot,null,{release:true,now:Date.parse('2026-10-04T12:00:00Z')}),/ledger|history/i);});
 for(const immutablePath of ['data/releases/2026.10.02-seed.2/bank.json','data/seed-bank-v2.json','docs/rounds/round-009.md','docs/deliveries/offline-chain.json','docs/publications/cumulative-006-008.md'])await t.test('preparation preserves predecessor '+immutablePath,async()=>{const input=alterPair(inputs[0],(d,c,delta,complete)=>{const changed=Buffer.concat([complete.get('project/'+immutablePath),Buffer.from(' ')]);complete.set('project/'+immutablePath,changed);if(delta.has('files/'+immutablePath)){delta.set('files/'+immutablePath,changed);for(const f of d.files)if(f.path===immutablePath){f.sha256=hash(changed);f.bytes=changed.length;}}for(const f of c.files)if(f.path===immutablePath){f.sha256=hash(changed);f.bytes=changed.length;}c.frozenSourceInventory=clone(c.files);});await assert.rejects(api.prepareReleaseBackupContinuation(input),/Immutable predecessor archive history/);});
 await t.test('proposed append alone is not trusted by earlier validator',async()=>{await assert.rejects(check(stages[1],stages[0]),/Unreviewed/);});
});
