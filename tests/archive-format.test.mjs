/** Synthetic transport fixtures only. No receipt or publication authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {archiveSignature,completeManifestFormat,encodeSevenZip,decodeSevenZip,verifyArchiveFormat,ARCHIVE_LIMITS} from '../scripts/archive-format.mjs';
import {readDeliveredArchive,validateDeliveredArchiveEntries} from '../scripts/release-backup-continuation.mjs';
import {zipStored} from '../scripts/download-fallback.mjs';
import {inspectNormalBackupRootProof} from '../scripts/normal-backup-root.mjs';
import {normalRootFixture} from './normal-backup-chain-fixtures.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),json=o=>Buffer.from(JSON.stringify(o,null,2)+'\n');
function fixture(version=2){
 const raw=Buffer.from('Exact UTF-8 content: 한글\n'),files=[{path:'README.md',sha256:hash(raw),bytes:raw.length},{path:'.nojekyll',sha256:hash(Buffer.alloc(0)),bytes:0}];
 const manifest={schemaVersion:version,...(version===2?{archiveFormat:'7z'}:{}),kind:'complete_project_not_learner_import',deliveryMode:'release_backup',newlyPublishedRegular:0,projectDirectory:'project',prerequisiteArtifacts:[],sourceRelease:{},frozenSourceInventory:files,packagingRevision:null,files};
 return {manifest,entries:[{name:'manifest.json',raw:json(manifest)},{name:'APPLY-KO.txt',raw:Buffer.from('Synthetic instructions\n')},{name:'project/README.md',raw},{name:'project/.nojekyll',raw:Buffer.alloc(0)}]};
}
test('explicit complete schemas reject missing, unknown, contradictory and extra format metadata',()=>{
 assert.equal(completeManifestFormat(fixture(1).manifest),'zip');assert.equal(completeManifestFormat(fixture().manifest),'7z');
 for(const alter of [m=>delete m.archiveFormat,m=>m.archiveFormat='zip',m=>m.archiveFormat='tar',m=>m.schemaVersion=3,m=>m.schemaVersion=1,m=>m.privateData='x']){const m=fixture().manifest;alter(m);assert.throws(()=>completeManifestFormat(m),/Unsupported/);}
 const old=fixture(1).manifest;old.archiveFormat='zip';assert.throws(()=>completeManifestFormat(old),/Unsupported/);
});
test('real shared delivered reader decodes v2 7z and retains exact v1 ZIP route',()=>{
 for(const version of [1,2]){const f=fixture(version),raw=version===1?zipStored(f.entries,{compress:true}):encodeSevenZip(f.entries),before=hash(raw),entries=readDeliveredArchive(raw,before);assert.equal(archiveSignature(raw),version===1?'zip':'7z');validateDeliveredArchiveEntries(entries,f.manifest,'project/');for(const e of f.entries)assert.deepEqual(entries.get(e.name),e.raw);assert.equal(hash(raw),before);assert.throws(()=>readDeliveredArchive(raw,'0'.repeat(64)),/Exact delivered archive/);}
});
test('format dispatcher rejects relabeled ZIP, 7z delta, schema-v1 inside 7z and unknown signature',()=>{
 const current=fixture(),old=fixture(1);const zip=zipStored(current.entries,{compress:true});assert.throws(()=>readDeliveredArchive(zip,hash(zip)),/format mismatch/);
 const seven=encodeSevenZip(old.entries);assert.throws(()=>readDeliveredArchive(seven,hash(seven)),/format mismatch/);
 const d=[{name:'manifest.json',raw:json({schemaVersion:1,kind:'developer_patch_not_learner_import',files:[]})},{name:'APPLY-KO.txt',raw:Buffer.from('delta')}],bad=encodeSevenZip(d);assert.throws(()=>readDeliveredArchive(bad,hash(bad)),/DELTA must retain/);
 assert.throws(()=>archiveSignature(Buffer.from('not an archive')),/Unsupported archive/);
});
test('every decoder entry is bound to canonical manifest bytes, exact paths, sizes and SHA',()=>{
 const f=fixture(),decoded=decodeSevenZip(encodeSevenZip(f.entries));verifyArchiveFormat(decoded,'7z');validateDeliveredArchiveEntries(decoded,f.manifest,'project/');
 const changed=new Map(decoded);changed.set('project/README.md',Buffer.from('changed'));assert.throws(()=>validateDeliveredArchiveEntries(changed,f.manifest,'project/'),/hash/);
 const extra=new Map(decoded);extra.set('project/extra.txt',Buffer.from('extra'));assert.throws(()=>validateDeliveredArchiveEntries(extra,f.manifest,'project/'),/inventory/);
 const noncanonical=new Map(decoded);noncanonical.set('manifest.json',Buffer.from(JSON.stringify(f.manifest)));assert.throws(()=>verifyArchiveFormat(noncanonical,'7z'),/Canonical/);
});
test('7z producer rejects unsafe, private, collision, invalid payload and size-limit inputs before compression',()=>{
 const raw=Buffer.from('one');
 for(const name of ['../x','/abs','project/../x','project/a\\b','project/CON.txt','project/x.','project/private/token.txt','project/learner-records.json','project/x:y','project/\u00e9.txt','project/a b'])assert.throws(()=>encodeSevenZip([{name,raw}]));
 for(const names of [['project/A','project/a'],['project/a','project/a/b'],['project/A/x','project/a/y']])assert.throws(()=>encodeSevenZip(names.map(name=>({name,raw}))),/collision|colliding|Duplicate/);
 assert.throws(()=>encodeSevenZip([{name:'project/a',raw:'not Buffer'}]),/per-file/);
 assert.throws(()=>encodeSevenZip(Array.from({length:ARCHIVE_LIMITS.entries+1},(_,i)=>({name:'project/f'+i,raw}))),/count/);
});
test('actual normal-root proof inspector accepts explicit v2 transport with unchanged lineage and rejects spoofed discriminator',()=>{
 const {proof,source}=normalRootFixture(),before=structuredClone(proof),legacy=inspectNormalBackupRootProof(proof,source);proof.completeManifest.schemaVersion=2;proof.completeManifest.archiveFormat='7z';const current=inspectNormalBackupRootProof(proof,source);assert.deepEqual(current,legacy);assert.deepEqual(proof.deltaManifest,before.deltaManifest);assert.deepEqual(proof.completeManifest.files,before.completeManifest.files);
 proof.completeManifest.archiveFormat='zip';assert.throws(()=>inspectNormalBackupRootProof(proof,source),/Unsupported/);
});
