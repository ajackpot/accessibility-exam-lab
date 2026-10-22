import test,{after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {normalChainFixture} from './normal-backup-chain-fixtures.mjs';
import {createOwnedHistoricalSource} from './historical-authority-fixtures.mjs';
// These ZIP/legacy-owner regressions execute exact historical code and data.
// Current typed registration boundaries are tested separately at actual time.
const root=await createOwnedHistoricalSource({after});
const {parsePublicAllowlist,main:fallbackMain}=await import(pathToFileURL(path.join(root,'scripts/download-fallback.mjs')));
const {freezeCompleteProject,writeCompleteArchive,writeCompleteZip,writeOfflineDeliveryPair,completeInstructions,createCompleteReceipt}=await import(pathToFileURL(path.join(root,'scripts/complete-bundle.mjs')));
// Explicit simulated audit time follows the exact included historical chronology.
const blockPins=JSON.parse(await fs.readFile(path.join(root,'docs/release-blocks/trust.json'))).events;
const normalPins=[...JSON.parse(await fs.readFile(path.join(root,'docs/deliveries/normal-backup-root-trust.json'))).roots,...JSON.parse(await fs.readFile(path.join(root,'docs/deliveries/normal-backup-chain-trust.json'))).checkpoints];
const includedLedgerPaths=parsePublicAllowlist(await fs.readFile(path.join(root,'PUBLICATION-MANIFEST.txt'),'utf8')).filter(p=>/^docs\/(?:rounds\/round-\d+|corrections\/editorial-\d+)\.json$/.test(p));
const includedLedgers=await Promise.all(includedLedgerPaths.map(async p=>JSON.parse(await fs.readFile(path.join(root,p)))));
const ledgerActualTimes=includedLedgers.flatMap(l=>[l.startedAt,...(l.closedAt===undefined?[]:[l.closedAt])]).map(value=>{
  const time=Date.parse(value);assert.ok(Number.isFinite(time),'Included ledger actual timestamp must be finite');return time;
});
const latestIncludedStart=Math.max(...includedLedgers.map(l=>Date.parse(l.startedAt)));
const priorEvidenceTime=Math.max(Date.parse('2026-10-04T09:00:00Z'),Date.parse(JSON.parse(await fs.readFile(path.join(root,'data/manifest.json'))).releasedAt),...blockPins.map(p=>Date.parse(p.recordedAt)),...normalPins.map(p=>Date.parse(p.registeredAt)));
const now=Math.max(priorEvidenceTime,...ledgerActualTimes)+60_000;
beforeEach(t=>t.mock.timers.enable({apis:['Date'],now}));
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
const frozen=async()=>freezeCompleteProject({...await fixture(),archiveFormat:"zip"});

/** Packaging chronology fixtures are synthetic and confined to an owned temp tree.
 * Exact historical-source positives use fixture()/frozen() above. */
async function syntheticCompleteFixture(t) {
  const f=await normalChainFixture(t,{emptySyntheticSelection:true});
  const add=async(p,raw)=>{
    assert(Buffer.isBuffer(raw),`Synthetic complete requires raw bytes: ${p}`);
    if(f.files.has(p)){assert.deepEqual(raw,f.files.get(p),`Do not replace synthetic history: ${p}`);return;}
    f.files.set(p,Buffer.from(raw));await f.write(p,raw);
  };
  const addOwnedTree=async prefix=>{
    for(const entry of await fs.readdir(path.join(f.dir,prefix),{withFileTypes:true})){
      const p=prefix+'/'+entry.name;assert(!entry.isSymbolicLink(),`Synthetic module symlink: ${p}`);
      if(entry.isDirectory())await addOwnedTree(p);
      else {assert(entry.isFile(),`Synthetic module must be a regular file: ${p}`);await add(p,await fs.readFile(path.join(f.dir,p)));}
    }
  };
  // The copied selection pin has already been projected before the chain API import.
  // Read the owned tree so serialized and executed authority bytes are the same.
  for(const prefix of ['scripts','src'])await addOwnedTree(prefix);
  const support=['.nojekyll','README.md','AGENTS.md','package.json','package-lock.json','index.html','style.css',
    'docs/PRD.md','docs/OPERATIONS.md','docs/DATA-CONTRACT.md','tests/complete-bundle.test.mjs',
    'tests/archive-format.test.mjs','tests/sevenz-codec.test.mjs','qa/fixture.mjs',
    'docs/analysis/2026-10-10-existing-bank-value-terminal-decisions.json'];
  for(const p of support)await add(p,await fs.readFile(path.join(root,p)));
  for(const [p,digest] of [
    ['src/new-session-eligibility.js','a92cc9bd407741089027cc7d3a3fd2a060bcfa3b1f4d02b84ebd36865336a6cc'],
    ['docs/analysis/2026-10-10-existing-bank-value-terminal-decisions.json','c4443769d90c4b45a1d7e3a075f776744149e78733dacb6ee8493b6ceafc78f3']
  ])assert.equal(sha(f.files.get(p)),digest,'Exact current policy dependency');
  assert(f.files.get('src/domain.js').includes(Buffer.from('new-session-eligibility.js')));
  assert(f.files.get('scripts/publication-selection.mjs').includes(Buffer.from('export const PUBLICATION_SELECTION_PIN=Object.freeze({path:PUBLICATION_SELECTION_PATH,sha256:null});')));
  const latest=f.chain.sources.at(-1),sourceRelease=structuredClone(latest.proof.completeManifest.sourceRelease);
  const refresh=async()=>{
    const allow=Buffer.from([...new Set([...f.files.keys(),'PUBLICATION-MANIFEST.txt'])].sort().join('\n')+'\n');
    f.files.set('PUBLICATION-MANIFEST.txt',allow);await f.write('PUBLICATION-MANIFEST.txt',allow);
    const reviewedInventory=[...f.files].map(([path,raw])=>({path,sha256:sha(raw),bytes:raw.length})).sort((a,b)=>a.path.localeCompare(b.path));
    // A fresh complete fixture, with no retroactive packaging overlay/history rewrite.
    return {workRoot:f.dir,reviewedInventory,sourceRelease:structuredClone(sourceRelease),now:Date.parse(latest.pin.registeredAt),archiveFormat:'7z'};
  };
  const input=await refresh();
  const api=await import(pathToFileURL(path.join(f.dir,'scripts/complete-bundle.mjs')).href);
  return {...f,completeApi:api,latest,sourceRelease,input,refresh,add};
}
test('historical-source fixture follows included chronology and retains the future-start rejection',async t=>{
  assert.ok(ledgerActualTimes.every(time=>now>=time+60_000));
  const f=await syntheticCompleteFixture(t),priorEvidenceTime=Date.parse(f.latest.pin.registeredAt);
  const latestIncludedStart=priorEvidenceTime+60_000,closedAt=latestIncludedStart+1_000;
  assert.ok(latestIncludedStart-1>priorEvidenceTime,'Chronology negative must remain after prior evidence registration');
  const b=f.latest.offlineBase,p=f.latest.proof;
  const future={roundId:'round-1001',status:'closed',startedAt:new Date(latestIncludedStart).toISOString(),closedAt:new Date(closedAt).toISOString(),
    baseline:{sourceCommit:b.baseCommit,bankVersion:b.bankVersion,bankSha256:b.bankSha256,
      offlinePredecessor:{roundId:f.latest.roundId,artifactSha256:p.deltaArtifactSha256,manifestSha256:b.manifestSha256,ledgerSha256:b.ledgerSha256}},
    publication:{status:'not_attempted',commit:null,verifiedAt:null,bankVersion:null,bankSha256:null}};
  const preserved=[...f.files].filter(([p])=>p.startsWith('data/releases/')||p.startsWith('docs/')).map(([p,raw])=>[p,sha(raw)]);
  await f.add('docs/rounds/round-1001.json',json(future));const input=await f.refresh();
  await assert.rejects(f.completeApi.freezeCompleteProject({...input,now:latestIncludedStart-1}),/Normal-chain successor requires exact registered predecessor and current eligible chronology/);
  const accepted=await f.completeApi.freezeCompleteProject({...input,now:closedAt+1});
  assert.deepEqual(accepted.manifest.sourceRelease,f.sourceRelease);
  for(const [p,digest]of preserved)assert.equal(sha(f.files.get(p)),digest,'Synthetic predecessor history remains exact: '+p);
});
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
  await assert.rejects(writeCompleteZip(s,'/unused.zip',{now}),/freeze/i);
});
test('delta and full outputs cannot be the same path; CLI requires both',async()=>{
  await assert.rejects(writeOfflineDeliveryPair({deltaOutputPath:'x.zip',completeOutputPath:'x.zip'}),/must differ/);
  await assert.rejects(fallbackMain(['plan.json','only-delta.zip']),/both required/);
});
test('changed full bytes and retained delta deletion are rejected before either output is written',async t=>{
  const dir=await temp(t),f=await fixture();const paths={deltaOutputPath:path.join(dir,'delta.zip'),completeOutputPath:path.join(dir,'full.7z')};
  const stale={manifest:{files:[{path:'README.md',sha256:'a'.repeat(64),bytes:1}],deletions:[]}};
  await assert.rejects(writeOfflineDeliveryPair({...f,...paths,deltaSnapshot:stale}),/Delta and complete release bytes differ/);
  stale.manifest.files=[];stale.manifest.deletions=[{path:'README.md'}];
  await assert.rejects(writeOfflineDeliveryPair({...f,...paths,deltaSnapshot:stale}),/retains a deleted/);
  assert.deepEqual(await fs.readdir(dir),[]);
});
test('complete receipt records separate status without modifying original release provenance',async()=>{
  const s=await frozen(),before=json(s.manifest),artifact={sha256:'a'.repeat(64),manifestSha256:sha(before)};
  const r=createCompleteReceipt({snapshot:s,artifact,status:'delivered',recordedAt:new Date(now).toISOString()});
  assert.equal(r.kind,'complete_project_delivery');assert.equal(r.sourceDeltaArtifactSha256,s.manifest.sourceRelease.deltaArtifactSha256);assert.equal(r.newlyPublishedRegular,0);assert.deepEqual(json(s.manifest),before);
  assert.throws(()=>createCompleteReceipt({snapshot:s,artifact:{...artifact,manifestSha256:'b'.repeat(64)},recordedAt:r.recordedAt}),/Invalid complete delivery receipt/);
});

test('future pair emits both standalone and delta artifacts tied to the same reviewed bytes',async t=>{
  const dir=await temp(t),f=await fixture(),raw=await fs.readFile(path.join(root,'README.md'));
  const entry={path:'README.md',beforeSha256:null,sha256:sha(raw),bytes:raw.length};
  const deltaSnapshot={manifest:{schemaVersion:1,kind:'developer_patch_not_learner_import',deliveryMode:'download_only',deliveryScope:'supporting_files',reportingEvidence:null,roundId:f.sourceRelease.roundId,executionId:'pair-regression',baseCommit:f.sourceRelease.baseCommit,baseVerifiedAt:'2026-10-04T08:00:00Z',parentDeliverySha256:null,permissionNotifiedAt:'2026-10-04T08:00:00Z',permissionDeadlineAt:'2026-10-04T08:10:00Z',gitStoppedAt:'2026-10-04T08:10:00Z',gitOutcome:{refStatus:'unchanged',observedHead:f.sourceRelease.baseCommit,expectedCommit:null,observedAt:'2026-10-04T08:10:01Z',refWrite:'not_submitted',objects:'none',cancellation:'not_available'},newlyPublishedRegular:0,files:[entry],deletions:[]},files:[{...entry,raw}]};
  const result=await writeOfflineDeliveryPair({...f,deltaSnapshot,deltaOutputPath:path.join(dir,'delta.zip'),completeOutputPath:path.join(dir,'full.7z')});
  assert.equal(result.status,'prepared_not_delivered');assert.equal(result.completeManifest.sourceRelease.deltaArtifactSha256,result.delta.sha256);
  assert.deepEqual(result.completeManifest.prerequisiteArtifacts,[]);assert.deepEqual((await fs.readdir(dir)).sort(),['delta.zip','full.7z']);
});
test('symlink roots and directory traversal inventories are rejected',async t=>{
  const dir=await temp(t),f=await fixture();await fs.symlink(root,path.join(dir,'linked'));
  await assert.rejects(freezeCompleteProject({...f,workRoot:path.join(dir,'linked')}),/Symlink root/);
  f.reviewedInventory.push({path:'../secret.txt',sha256:'a'.repeat(64),bytes:0});await assert.rejects(freezeCompleteProject(f),/Unsafe/);
});

test('new complete packaging cannot predate an included delivered checkpoint registration',async t=>{
  const f=await syntheticCompleteFixture(t),latest=Date.parse(f.latest.pin.registeredAt);
  assert.equal(f.latest.roundId,'round-1000');assert.equal(f.latest.pin.registeredAt,f.latest.pin.eligibleAt);
  const preserved=[...f.files].map(([p,raw])=>[p,sha(raw)]);
  await assert.rejects(f.completeApi.freezeCompleteProject({...f.input,now:latest-1}),/New packaging cannot predate included normal delivery registration/);
  const accepted=await f.completeApi.freezeCompleteProject({...f.input,now:latest});
  assert.deepEqual(accepted.manifest.sourceRelease,f.sourceRelease);
  assert.equal(accepted.manifest.sourceRelease.bankSha256,f.latest.offlineBase.bankSha256);
  for(const [p,digest]of preserved)assert.equal(sha(f.files.get(p)),digest,'Synthetic complete boundary leaves bytes unchanged: '+p);
});

test('current snapshot defaults to explicit 7z and refuses legacy writer, extension confusion or overwrite',async t=>{
 const s=await freezeCompleteProject(await fixture());assert.equal(s.manifest.schemaVersion,2);assert.equal(s.manifest.archiveFormat,'7z');assert.match(completeInstructions(s.manifest),/일반 압축 해제 도구/);assert.match(completeInstructions(s.manifest),/전용 복원 스크립트나 이전 압축 파일은 필요하지/);
 await assert.rejects(writeCompleteZip(s,'/unused.zip',{now}),/Historical ZIP writer/);
 await assert.rejects(writeCompleteArchive(s,'/unused.zip',{now}),/COMPLETE requires/);
 await assert.rejects(freezeCompleteProject({...await fixture(),archiveFormat:'tar'}),/Unsupported/);
 const dir=await temp(t),output=path.join(dir,'existing.7z'),original=Buffer.from('immutable prior artifact');await fs.writeFile(output,original);await assert.rejects(writeCompleteArchive(s,output,{now}),/EEXIST/);assert.deepEqual(await fs.readFile(output),original);
 const link=path.join(dir,'linked.7z');await fs.symlink(output,link);await assert.rejects(writeCompleteArchive(s,link,{now}),/EEXIST/);assert.deepEqual(await fs.readFile(output),original);
});

test('7z final write rereads live source and authority freeze markers after codec work',async t=>{
  const dir=await temp(t),source=path.join(dir,'source');await fs.cp(root,source,{recursive:true});
  const childProcess=await import('node:child_process'),{syncBuiltinESMExports}=await import('node:module'),{writeFileSync}=await import('node:fs'),{pathToFileURL}=await import('node:url');
  const isolated=await import(pathToFileURL(path.join(source,'scripts/complete-bundle.mjs')));
  for(const mode of ['source','authority']){
    // Only a disposable copied tree is changed. Transport is stubbed here to
    // isolate lifecycle timing; real encode/decode tests separately cover bytes.
    const api=mode==='source'?{freezeCompleteProject,writeCompleteArchive}:isolated;
    const f=await fixture(),s=await api.freezeCompleteProject({...f,workRoot:mode==='source'?source:root});
    const marker=path.join(source,mode==='source'?'data/publication-state.json':'data/manifest.json'),original=await fs.readFile(marker),changed=JSON.parse(original);changed[mode==='source'?'finalized':'finalRelease']=true;
    const output=path.join(dir,mode+'.7z'),realSpawn=childProcess.default.spawnSync;let framed=null,calls=[];
    t.mock.method(childProcess.default,'spawnSync',(command,args,options)=>{
      if(!args[0].endsWith('sevenz-codec.py'))return realSpawn(command,args,options);
      const operation=args.at(-1);calls.push(operation);
      if(operation==='encode'){framed=options.input;return {status:0,stdout:Buffer.from('377abcaf271c0004','hex'),stderr:Buffer.alloc(0)};}
      writeFileSync(marker,json(changed));return {status:0,stdout:framed,stderr:Buffer.alloc(0)};
    });syncBuiltinESMExports();
    try{
      await assert.rejects(api.writeCompleteArchive(s,output,{now}),/Live authority\/source freeze/);
      assert.deepEqual(calls,['encode','decode']);await assert.rejects(fs.stat(output),{code:'ENOENT'});
      // The same stale snapshot must now reject before starting codec work.
      calls=[];await assert.rejects(api.writeCompleteArchive(s,output,{now}),/Live authority\/source freeze/);assert.deepEqual(calls,[]);
    }finally{t.mock.restoreAll();syncBuiltinESMExports();await fs.writeFile(marker,original);}
  }
});
