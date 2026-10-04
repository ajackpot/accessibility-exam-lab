import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parsePublicAllowlist, main as fallbackMain} from '../scripts/download-fallback.mjs';
import {freezeCompleteProject,writeCompleteZip,writeOfflineDeliveryPair,completeInstructions,createCompleteReceipt} from '../scripts/complete-bundle.mjs';
const root=path.resolve(import.meta.dirname,'..'), now=Date.parse('2026-10-04T09:00:00Z');
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
async function reviewed() {
  const names=parsePublicAllowlist(await fs.readFile(path.join(root,'PUBLICATION-MANIFEST.txt'),'utf8'));
  return Promise.all(names.map(async p=>{const raw=await fs.readFile(path.join(root,p));return {path:p,sha256:sha(raw),bytes:raw.length};}));
}
async function fixture() {
  const reviewedInventory=await reviewed();
  const m=JSON.parse(await fs.readFile(path.join(root,'data/manifest.json')));
  let ledgerPath,roundId;for(const e of reviewedInventory.filter(e=>/^docs\/(?:rounds\/round-\d+|corrections\/editorial-\d+)\.json$/.test(e.path))) {const l=JSON.parse(await fs.readFile(path.join(root,e.path)));if(l.publication?.bankVersion===m.bankVersion){ledgerPath=e.path;roundId=l.roundId||l.correctionRoundId;}}
  const sourceRelease={roundId,deltaArtifactSha256:'f50422fb3c870d2e77f55bd76309f7e82840cb94b63eb45cbe4a4b7b95b43d55',deltaManifestSha256:'52714ed509245fa76aee25cc428b4237e7f6665f969c9b7b3874d56f2f1c1ba5',baseCommit:'d8ee1c0dc1c04145d5a6752242b74b003f0e59c5',bankVersion:m.bankVersion,bankSha256:m.sha256,ledgerPath,ledgerSha256:sha(await fs.readFile(path.join(root,ledgerPath)))};
  return {workRoot:root,reviewedInventory,sourceRelease,now};
}
async function temp(t) { const p=await fs.mkdtemp(path.join(os.tmpdir(),'complete-bundle-'));t.after(()=>fs.rm(p,{recursive:true,force:true}));return p; }
const frozen=async()=>freezeCompleteProject(await fixture());
test('complete snapshot contains the exact allowlist and has no installation predecessor',async()=>{
  const s=await frozen(); assert.deepEqual(s.manifest.prerequisiteArtifacts,[]);
  assert.equal(s.manifest.kind,'complete_project_not_learner_import'); assert.equal(s.manifest.packagingRevision,null);
  assert.deepEqual(s.manifest.files,s.manifest.frozenSourceInventory);
  assert.ok(s.files.some(f=>f.path==='data/releases/2026.10.04-regular.8/bank.json'));
  const guide=completeInstructions(s.manifest);assert.match(guide,/새 빈 폴더/);assert.match(guide,/이전 회차 ZIP.*필요가 없습니다/);assert.match(guide,/저장 데이터·학습 기록을 지우지/);assert.match(guide,/이 ZIP 자체는.*가져오기에 넣지/);
});
test('complete ZIP reconstructs all files in an empty folder with CRC, safe paths and exact hashes',async t=>{
  const dir=await temp(t),s=await frozen(),out=path.join(dir,'complete.zip');
  const artifact=await writeCompleteZip(s,out,{now});
  assert.equal(artifact.fileCount,s.files.length);assert.equal(artifact.sha256,sha(await fs.readFile(out)));
  const result=execFileSync('python3',['-c',`import zipfile,json,hashlib,pathlib,sys\nz=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None\nn=z.namelist(); assert len(n)==len(set(x.lower() for x in n)); assert all(not x.startswith('/') and '..' not in x.split('/') for x in n)\nm=json.loads(z.read('manifest.json')); assert m['prerequisiteArtifacts']==[]\nexpected={'manifest.json','APPLY-KO.txt'}|{'project/'+f['path'] for f in m['files']}; assert set(n)==expected\nz.extractall(sys.argv[2])\nfor f in m['files']:\n b=(pathlib.Path(sys.argv[2])/'project'/f['path']).read_bytes(); assert len(b)==f['bytes'] and hashlib.sha256(b).hexdigest()==f['sha256']\nprint('standalone verified')`,out,path.join(dir,'empty')],{encoding:'utf8'});
  assert.match(result,/standalone verified/);
  await assert.rejects(writeCompleteZip(s,out,{now}),/EEXIST/);
});
test('missing runtime prerequisite or omission from the complete allowlist is rejected',async()=>{
  const s=await frozen();const remove=p=>{s.files=s.files.filter(f=>f.path!==p);s.manifest.files=s.manifest.files.filter(f=>f.path!==p);s.manifest.frozenSourceInventory=s.manifest.files;};
  remove('index.html');
  const a=s.files.find(f=>f.path==='PUBLICATION-MANIFEST.txt');a.raw=Buffer.from(a.raw.toString().split('\n').filter(x=>x!=='index.html').join('\n'));a.sha256=sha(a.raw);a.bytes=a.raw.length;
  for(const e of s.manifest.files)if(e.path===a.path){e.sha256=a.sha256;e.bytes=a.bytes;}
  await assert.rejects(writeCompleteZip(s,'/unused.zip',{now}),/Incomplete standalone/);
});
test('unknown private metadata and changed bank or ledger identity are rejected',async()=>{
  const f=await fixture();f.sourceRelease.private='/private/path';await assert.rejects(freezeCompleteProject(f),/source release fields/);
  delete f.sourceRelease.private;f.sourceRelease.bankSha256='a'.repeat(64);await assert.rejects(freezeCompleteProject(f),/identity mismatch/);
});
test('mutating frozen bytes or adding unreviewed files cannot reach ZIP serialization',async()=>{
  const s=await frozen();s.files[0].raw=Buffer.from('changed');await assert.rejects(writeCompleteZip(s,'/unused.zip',{now}),/Frozen complete bytes changed/);
  const f=await fixture();f.reviewedInventory[0].sha256='b'.repeat(64);await assert.rejects(freezeCompleteProject(f),/Reviewed complete bytes mismatch/);
});
test('packaging overlay preserves all frozen data/runtime/ledger paths and exact support revision',async()=>{
  const f=await fixture(),base=structuredClone(f.reviewedInventory),entry=base.find(e=>e.path==='README.md');entry.sha256='a'.repeat(64);
  const actual=f.reviewedInventory.find(e=>e.path===entry.path);f.frozenSourceInventory=base;f.packagingRevision={revisionId:'packaging-policy-001',files:[{path:entry.path,beforeSha256:entry.sha256,sha256:actual.sha256,bytes:actual.bytes}]};
  assert.equal((await freezeCompleteProject(f)).manifest.packagingRevision.revisionId,'packaging-policy-001');
  const bank=base.find(e=>e.path===f.sourceRelease.ledgerPath);bank.sha256='c'.repeat(64);
  await assert.rejects(freezeCompleteProject(f),/only exact reviewed support/);
});
test('new packages obey both timestamp cutoff and persistent freeze',async()=>{
  const f=await fixture();await assert.rejects(freezeCompleteProject({...f,now:Date.parse('2026-10-16T15:00:00Z')}),/cutoff/);
  const s=await frozen();const e=s.files.find(f=>f.path==='data/publication-state.json');e.raw=json({finalized:true});e.sha256=sha(e.raw);e.bytes=e.raw.length;
  for(const item of s.manifest.files)if(item.path===e.path){item.sha256=e.sha256;item.bytes=e.bytes;}s.manifest.frozenSourceInventory=structuredClone(s.manifest.files);
  await assert.rejects(writeCompleteZip(s,'/unused.zip',{now}),/Persistent freeze/);
});
test('delta and full outputs cannot be the same path; CLI requires both',async()=>{
  await assert.rejects(writeOfflineDeliveryPair({deltaOutputPath:'x.zip',completeOutputPath:'x.zip'}),/must differ/);
  await assert.rejects(fallbackMain(['plan.json','only-delta.zip']),/both required/);
});
test('changed full bytes and retained delta deletion are rejected before either output is written',async t=>{
  const dir=await temp(t),f=await fixture();const paths={deltaOutputPath:path.join(dir,'delta.zip'),completeOutputPath:path.join(dir,'full.zip')};
  const stale={manifest:{files:[{path:'README.md',sha256:'a'.repeat(64),bytes:1}],deletions:[]}};
  await assert.rejects(writeOfflineDeliveryPair({...f,...paths,deltaSnapshot:stale}),/Delta and complete release bytes differ/);
  stale.manifest.files=[];stale.manifest.deletions=[{path:'README.md'}];
  await assert.rejects(writeOfflineDeliveryPair({...f,...paths,deltaSnapshot:stale}),/retains a deleted/);
  assert.deepEqual(await fs.readdir(dir),[]);
});
test('complete receipt records separate status without modifying original release provenance',async()=>{
  const s=await frozen(),before=json(s.manifest),artifact={sha256:'a'.repeat(64),manifestSha256:sha(before)};
  const r=createCompleteReceipt({snapshot:s,artifact,status:'delivered',recordedAt:'2026-10-04T09:00:00Z'});
  assert.equal(r.kind,'complete_project_delivery');assert.equal(r.sourceDeltaArtifactSha256,s.manifest.sourceRelease.deltaArtifactSha256);assert.equal(r.newlyPublishedRegular,0);assert.deepEqual(json(s.manifest),before);
  assert.throws(()=>createCompleteReceipt({snapshot:s,artifact:{...artifact,manifestSha256:'b'.repeat(64)},recordedAt:r.recordedAt}),/Invalid complete delivery receipt/);
});

test('future pair emits both standalone and delta artifacts tied to the same reviewed bytes',async t=>{
  const dir=await temp(t),f=await fixture(),raw=await fs.readFile(path.join(root,'README.md'));
  const entry={path:'README.md',beforeSha256:null,sha256:sha(raw),bytes:raw.length};
  const deltaSnapshot={manifest:{schemaVersion:1,kind:'developer_patch_not_learner_import',deliveryMode:'download_only',deliveryScope:'supporting_files',reportingEvidence:null,roundId:f.sourceRelease.roundId,executionId:'pair-regression',baseCommit:f.sourceRelease.baseCommit,baseVerifiedAt:'2026-10-04T08:00:00Z',parentDeliverySha256:null,permissionNotifiedAt:'2026-10-04T08:00:00Z',permissionDeadlineAt:'2026-10-04T08:10:00Z',gitStoppedAt:'2026-10-04T08:10:00Z',gitOutcome:{refStatus:'unchanged',observedHead:f.sourceRelease.baseCommit,expectedCommit:null,observedAt:'2026-10-04T08:10:01Z',refWrite:'not_submitted',objects:'none',cancellation:'not_available'},newlyPublishedRegular:0,files:[entry],deletions:[]},files:[{...entry,raw}]};
  const result=await writeOfflineDeliveryPair({...f,deltaSnapshot,deltaOutputPath:path.join(dir,'delta.zip'),completeOutputPath:path.join(dir,'full.zip')});
  assert.equal(result.status,'prepared_not_delivered');assert.equal(result.completeManifest.sourceRelease.deltaArtifactSha256,result.delta.sha256);
  assert.deepEqual(result.completeManifest.prerequisiteArtifacts,[]);assert.deepEqual((await fs.readdir(dir)).sort(),['delta.zip','full.zip']);
});
test('symlink roots and directory traversal inventories are rejected',async t=>{
  const dir=await temp(t),f=await fixture();await fs.symlink(root,path.join(dir,'linked'));
  await assert.rejects(freezeCompleteProject({...f,workRoot:path.join(dir,'linked')}),/Symlink root/);
  f.reviewedInventory.push({path:'../secret.txt',sha256:'a'.repeat(64),bytes:0});await assert.rejects(freezeCompleteProject(f),/Unsafe/);
});
