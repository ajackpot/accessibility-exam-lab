/** Exact selected source bytes plus synthetic structural receipt hashes/times.
 * These fixtures do not represent actual archives, native delivery or publication. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadPublicationSelections,resolvePublicationIdentity} from '../scripts/publication-selection.mjs';
import {inspectNormalBackupRootProof} from '../scripts/normal-backup-root.mjs';
import {readBankInput} from '../scripts/bank-io.mjs';
import {freezeCompleteProject} from '../scripts/complete-bundle.mjs';
const root=path.resolve(import.meta.dirname,'..'),H=b=>createHash('sha256').update(b).digest('hex'),J=v=>Buffer.from(JSON.stringify(v,null,2)+'\n'),read=p=>fs.readFile(path.join(root,p));
const registries=['docs/deliveries/release-backup-trust.json','docs/deliveries/offline-chain-trust.json','docs/deliveries/normal-backup-root-trust.json','docs/deliveries/normal-backup-chain-trust.json','docs/quarantines/trust.json','docs/release-blocks/trust.json'];
const inventory=files=>[...files].map(([path,raw])=>({path,sha256:H(raw),bytes:raw.length})).sort((a,b)=>a.path.localeCompare(b.path));
let pending;
function fixture(){return pending??=makeFixture();}
async function makeFixture(){
 const authority=await loadPublicationSelections(root),source=JSON.parse(await read('docs/rounds/round-041.json')),identity=resolvePublicationIdentity(source,authority),files=new Map();
 for(const p of (await read('PUBLICATION-MANIFEST.txt')).toString().split(/\r?\n/).filter(p=>p&&!p.startsWith('#')))files.set(p,await read(p));
 const bank=JSON.parse(files.get(`data/releases/${identity.effectiveBankVersion}/bank.json`)),baseline=JSON.parse(files.get(`data/releases/${source.baseline.bankVersion}/bank.json`));
 const oldManifest={schemaVersion:1,bankVersion:baseline.bankVersion,file:`releases/${baseline.bankVersion}/bank.json`,sha256:source.baseline.bankSha256,releasedAt:baseline.releasedAt,changeSummary:baseline.changeSummary,finalRelease:false};
 const before=new Map([['data/manifest.json',J(oldManifest)],['data/publication-state.json',files.get('data/publication-state.json')],[`data/releases/${baseline.bankVersion}/bank.json`,files.get(`data/releases/${baseline.bankVersion}/bank.json`)]]);
 before.set('PUBLICATION-MANIFEST.txt',Buffer.from([...before.keys(),'PUBLICATION-MANIFEST.txt'].sort().join('\n')+'\n'));
 const at=Date.parse(bank.releasedAt)+60000,iso=offset=>new Date(at+offset).toISOString(),oldInventory=inventory(before),index=new Map(oldInventory.map(f=>[f.path,f])),all=inventory(files);
 const anchor={baseCommit:source.baseline.sourceCommit,observedAt:source.startedAt,manifestRaw:before.get('data/manifest.json').toString(),publicationStateRaw:before.get('data/publication-state.json').toString(),allowlistRaw:before.get('PUBLICATION-MANIFEST.txt').toString(),remoteInventory:oldInventory};
 const delta={schemaVersion:1,kind:'developer_patch_not_learner_import',deliveryMode:'release_backup',roundId:source.roundId,baseCommit:source.baseline.sourceCommit,baseVerifiedAt:source.startedAt,preparedAt:iso(0),gitPublicationStatus:'not_attempted',publicationCommit:null,bankVersion:identity.effectiveBankVersion,bankSha256:identity.effectiveBankSha256,newlyPublishedByPackaging:0,prerequisiteArtifacts:[],selectionReference:identity.selectionReference,files:all.filter(f=>index.get(f.path)?.sha256!==f.sha256).map(f=>({...f,beforeSha256:index.get(f.path)?.sha256??null})),deletions:[]};
 const sourceRelease={roundId:source.roundId,deltaArtifactSha256:'a'.repeat(64),deltaManifestSha256:H(J(delta)),baseCommit:source.baseline.sourceCommit,bankVersion:identity.effectiveBankVersion,bankSha256:identity.effectiveBankSha256,ledgerPath:'docs/rounds/round-041.json',ledgerSha256:H(files.get('docs/rounds/round-041.json')),selectionReference:identity.selectionReference};
 const proof={schemaVersion:1,kind:'delivered_normal_release_root_checkpoint',roundId:source.roundId,deltaArtifactSha256:'a'.repeat(64),completeArtifactSha256:'b'.repeat(64),privateEvidence:{libraryReceiptSha256:'c'.repeat(64),attachmentReceiptSha256:'d'.repeat(64),uploadResultSha256:'e'.repeat(64),archiveAuditSha256:'f'.repeat(64),sourceCheckpointSha256:'1'.repeat(64),terminalEvidenceSha256:null},archiveVerifiedAt:iso(1000),attachmentAcceptedAt:iso(2000),verificationCompletedAt:iso(3000),newlyPublishedRegular:0,canPublish:false,userOpenOrDownloadObserved:false,sourceAnchor:anchor,continuationAnchor:structuredClone(anchor),anchorTransition:{parentCommit:source.baseline.sourceCommit,evidenceSha256:'2'.repeat(64),changedPaths:[]},priorTrustSha256:H(files.get('docs/deliveries/normal-backup-root-trust.json')),preservedRegistries:registries.map(path=>({path,raw:files.get(path).toString()})),deltaManifest:delta,completeManifest:{schemaVersion:2,archiveFormat:'7z',kind:'complete_project_not_learner_import',deliveryMode:'release_backup',newlyPublishedRegular:0,projectDirectory:'project',prerequisiteArtifacts:[],sourceRelease,frozenSourceInventory:structuredClone(all),packagingRevision:null,files:all},runtimeManifestRaw:files.get('data/manifest.json').toString(),publicationStateRaw:files.get('data/publication-state.json').toString(),sourceAllowlistRaw:files.get('PUBLICATION-MANIFEST.txt').toString(),stoppedPublisher:null};
 return {authority,source,identity,files,bank,proof,at,sourceRelease,all};
}
function rebind(proof){proof.completeManifest.sourceRelease.deltaManifestSha256=H(J(proof.deltaManifest));}

test('selected root structural proof binds original ledger and selected bank without publication claim',async()=>{
 const f=await fixture(),before=J(f.proof),base=inspectNormalBackupRootProof(f.proof,f.source,f.authority);
 assert.equal(base.bankVersion,f.identity.effectiveBankVersion);assert.equal(base.ledgerSha256,f.identity.originalLedgerSha256);assert.deepEqual(base.selectionReference,f.identity.selectionReference);assert.deepEqual(J(f.proof),before);assert.equal(f.proof.newlyPublishedRegular,0);assert.equal(f.proof.canPublish,false);
 const cases=[['selected root schema-v1 ZIP',p=>{p.completeManifest.schemaVersion=1;delete p.completeManifest.archiveFormat;}],['missing full selection',p=>delete p.completeManifest.sourceRelease.selectionReference],['missing delta selection',p=>delete p.deltaManifest.selectionReference],['wrong full selection',p=>p.completeManifest.sourceRelease.selectionReference.sha256='9'.repeat(64)],['wrong delta selection',p=>p.deltaManifest.selectionReference.path='docs/publication-selections/unreviewed.json'],['wrong original ledger',p=>p.completeManifest.sourceRelease.ledgerSha256='9'.repeat(64)],['original all3 reactivation',p=>{p.completeManifest.sourceRelease.bankVersion=f.identity.originalBankVersion;p.deltaManifest.bankVersion=f.identity.originalBankVersion;}],['wrong selected hash',p=>{p.completeManifest.sourceRelease.bankSha256='9'.repeat(64);p.deltaManifest.bankSha256='9'.repeat(64);}]];
 for(const [name,mutate]of cases){const p=structuredClone(f.proof);mutate(p);rebind(p);assert.throws(()=>inspectNormalBackupRootProof(p,f.source,f.authority),undefined,name);}
 assert.throws(()=>inspectNormalBackupRootProof(f.proof,f.source,new Map()));
 const changed=structuredClone(f.source);changed.candidates[0].decision='rejected';assert.throws(()=>inspectNormalBackupRootProof(f.proof,changed,f.authority),/ledger|projected|mutated/);
});

test('selected root cannot omit the raw selection and original all3 historical inventory dependencies',async()=>{
 const f=await fixture();
 for(const path of [f.identity.selectionReference.path,`data/releases/${f.identity.originalBankVersion}/bank.json`]){
  const p=structuredClone(f.proof);p.completeManifest.files=p.completeManifest.files.filter(x=>x.path!==path);p.completeManifest.frozenSourceInventory=structuredClone(p.completeManifest.files);p.deltaManifest.files=p.deltaManifest.files.filter(x=>x.path!==path);
  p.sourceAllowlistRaw=p.sourceAllowlistRaw.split(/\r?\n/).filter(x=>x!==path).join('\n');const bytes=Buffer.from(p.sourceAllowlistRaw),entry=p.completeManifest.files.find(x=>x.path==='PUBLICATION-MANIFEST.txt');Object.assign(entry,{sha256:H(bytes),bytes:bytes.length});Object.assign(p.completeManifest.frozenSourceInventory.find(x=>x.path===entry.path),entry);Object.assign(p.deltaManifest.files.find(x=>x.path===entry.path),entry);rebind(p);
  assert.throws(()=>inspectNormalBackupRootProof(p,f.source,f.authority),undefined,path);
 }
});

test('exact complete snapshot carries selection reference and rejects identity mismatch before archive writing',async()=>{
 const f=await fixture(),args={workRoot:root,reviewedInventory:f.all,sourceRelease:f.sourceRelease,deliveryMode:'release_backup',now:f.at};
 const snapshot=await freezeCompleteProject(args);assert.deepEqual(snapshot.manifest.sourceRelease.selectionReference,f.identity.selectionReference);assert.equal(snapshot.manifest.sourceRelease.ledgerSha256,f.identity.originalLedgerSha256);
 await assert.rejects(freezeCompleteProject({...args,deliveryMode:'download_only'}));
 await assert.rejects(freezeCompleteProject({...args,archiveFormat:'zip'}));
 for(const mutate of [s=>delete s.selectionReference,s=>s.selectionReference.sha256='9'.repeat(64),s=>s.bankSha256='9'.repeat(64),s=>s.ledgerSha256='9'.repeat(64)]){const sourceRelease=structuredClone(f.sourceRelease);mutate(sourceRelease);await assert.rejects(freezeCompleteProject({...args,sourceRelease}));}
});

test('ordinary and explicit bank inputs select retained041 and block exact original even at another path',async t=>{
 const f=await fixture(),ordinary=await readBankInput(root),explicit=await readBankInput(root,path.join(root,`data/releases/${f.identity.effectiveBankVersion}/bank.json`));
 assert.equal(ordinary.bank.bankVersion,f.identity.effectiveBankVersion);assert.deepEqual(explicit.bank,ordinary.bank);
 await assert.rejects(readBankInput(root,path.join(root,`data/releases/${f.identity.originalBankVersion}/bank.json`)),/retired original|excluded|round041/);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'selection-explicit-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const alternate=path.join(dir,'renamed-original.json');await fs.writeFile(alternate,f.files.get(`data/releases/${f.identity.originalBankVersion}/bank.json`));await assert.rejects(readBankInput(root,alternate),/retired original|excluded|round041/);
});

test('old ordinary root remains its exact eight-field source and original identity',async()=>{
 const proof=JSON.parse(await read('docs/deliveries/normal-roots/round-032.json')),source=JSON.parse(await read('docs/rounds/round-032.json')),before=J(proof),base=inspectNormalBackupRootProof(proof,source);
 assert.equal(base.bankVersion,source.publication.bankVersion);assert.equal(base.selectionReference,undefined);assert.equal(proof.completeManifest.schemaVersion,1);assert.equal(proof.completeManifest.archiveFormat,undefined);assert.deepEqual(Object.keys(proof.completeManifest.sourceRelease).sort(),['roundId','deltaArtifactSha256','deltaManifestSha256','baseCommit','bankVersion','bankSha256','ledgerPath','ledgerSha256'].sort());assert.deepEqual(J(proof),before);
 const bad=structuredClone(proof);bad.completeManifest.sourceRelease.selectionReference={path:'docs/publication-selections/round-041-selection-001.json',sha256:'9'.repeat(64)};assert.throws(()=>inspectNormalBackupRootProof(bad,source),/Unexpected selected/);
});
