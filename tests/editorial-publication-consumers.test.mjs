/** Synthetic publication authority is confined to a disposable copy. These tests
 * never register a real event or rewrite the frozen editorial source. */
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {FREEZE_AT, isPublishedQuestion, presentQuestion} from '../src/domain.js';
import {PUBLICATION_SYNCHRONIZATIONS} from '../scripts/publication-sync.mjs';
import {normalPublicationTree, isNormalPublication} from '../scripts/normal-publication.mjs';
import {isEditorialPublication} from '../scripts/editorial-publication.mjs';
import {gitBlobSha} from '../scripts/sha-only-tree.mjs';
import * as publicHelpers from '../scripts/validate-round.mjs';
import * as primitives from '../scripts/campaign-validation-primitives.mjs';

const root=path.resolve(import.meta.dirname,'..'),J=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const H=raw=>createHash('sha256').update(raw).digest('hex'),clone=structuredClone;
const read=p=>fs.readFile(path.join(root,p));
const now=Date.parse('2026-10-11T01:00:00Z');
let directory,api,validator,editorialApi,context,event,originalEditorialRaw,originalSelectedRaw,roundSchema,editorialSchema,sourceBank;

// Test-owned historical projection only; this never authenticates new publication
// authority. Require registered editorial suffixes and keep the frozen eight-pin
// predecessor. Keep this bounded projection identical in both tests.
function projectHistoricalPublications(sourceFiles,sourcePins){
  assert(sourceFiles instanceof Map);assert(Array.isArray(sourcePins));
  const pins=sourcePins.slice(0,8),suffix=sourcePins.slice(8),files=new Map(sourceFiles),removedPaths=[];
  assert.equal(H(J(pins)),'b91fb0d6f084a4a8005e077f449d928f0615ce54892daba764e0502d8942c1a4','fixture requires the exact eight-pin historical prefix');
  assert(suffix.length,'fixture requires the registered actual002 anchor');
  const safe=p=>typeof p==='string'&&/^[A-Za-z0-9._/-]+$/.test(p)&&!p.startsWith('/')&&!p.split('/').some(v=>!v||v==='.'||v==='..');
  const lines=files.get('PUBLICATION-MANIFEST.txt').toString().split('\n'),paths=lines.filter(p=>p&&!p.startsWith('#'));
  assert(paths.every(safe));assert.equal(new Set(paths).size,paths.length,'duplicate fixture allowlist path');
  assert.deepEqual([...sourceFiles.keys()].sort(),[...paths].sort(),'fixture files must equal the complete allowlist');
  function authenticated(pin){assert.deepEqual(Object.keys(pin).sort(),['path','sha256']);assert(safe(pin.path));assert(/^[a-f0-9]{64}$/.test(pin.sha256));const raw=sourceFiles.get(pin.path);assert(Buffer.isBuffer(raw),`missing pinned fixture event ${pin.path}`);assert.equal(H(raw),pin.sha256);const event=JSON.parse(raw);assert.deepEqual(raw,J(event));return event;}
  assert.equal(new Set(sourcePins.map(pin=>pin.path)).size,sourcePins.length,'duplicate publication pin');
  const events=pins.map(authenticated),suffixEvents=[],owners=new Set(events.map(event=>event.syncId));
  assert.equal(events.at(-1).syncId,'normal-041-selection-001');
  assert.deepEqual(suffix[0],{path:'docs/publications/editorial-002.json',sha256:'b873b9e8e9043e36892fe34414b4cc8edbba2a57d2ad11ed04ba9fc485df50cf'});
  let previous=events.at(-1),previousPin=pins.at(-1),code=files.get('scripts/publication-sync.mjs').toString();
  for(const pin of suffix){
    const event=authenticated(pin);
    assert.deepEqual(Object.keys(event).sort(),['schemaVersion','syncId','kind','previousSynchronizationSha256','verifiedAt','repository','commit','parent','tree','commitUrl','pages','siteUrl','manifest','manifestSha256','runtimeManifestRaw','publicationStateRaw','counts','writtenBySubject','rounds','remoteInventory','liveAssets','limitations'].sort());
    assert.equal(event.schemaVersion,1);assert.equal(event.kind,'verified_normal_editorial_publication');assert(/^editorial-\d+$/.test(event.syncId));assert.equal(pin.path,`docs/publications/${event.syncId}.json`);
    assert(!owners.has(event.syncId),'duplicate editorial suffix owner');owners.add(event.syncId);
    assert(Array.isArray(event.rounds));assert.equal(event.rounds.length,1);const source=event.rounds[0];
    assert.deepEqual(Object.keys(source).sort(),['kind','correctionRoundId','ledgerPath','originalLedgerSha256','bankVersion','bankSha256','baseline','originalPublicationStatus','accepted','publishedRevisedRegular','newlyPublicRegular'].sort());
    assert.equal(source.kind,'editorial_frozen_ledger');assert.equal(source.correctionRoundId,event.syncId);assert.equal(source.ledgerPath,`docs/corrections/${event.syncId}.json`);
    assert(typeof source.bankVersion==='string'&&/^[A-Za-z0-9._-]+$/.test(source.bankVersion)&&!['.','..'].includes(source.bankVersion),'canonical single-segment bank version required');assert.deepEqual(Object.keys(source.baseline).sort(),['bankSha256','bankVersion','sourceCommit']);
    assert.equal(event.previousSynchronizationSha256,previousPin.sha256);assert.equal(event.repository,previous.repository);assert.equal(event.siteUrl,previous.siteUrl);
    const verifiedAt=Date.parse(event.verifiedAt);assert(Number.isFinite(verifiedAt)&&verifiedAt>Date.parse(previous.verifiedAt)&&verifiedAt>Date.parse('2026-10-11T01:00:00Z'),'suffix must follow its predecessor and both fixed fixture clocks');
    const appendedPin=`,\n  Object.freeze({path:'${pin.path}', sha256:'${pin.sha256}'})`;
    assert.equal(code.split(appendedPin).length,2,'only the exact registration pin append may be projected');code=code.replace(appendedPin,'');
    assert.equal(lines.filter(p=>p===pin.path).length,1,'one exact suffix allowlist entry required');
    files.delete(pin.path);removedPaths.push(pin.path);suffixEvents.push(event);previous=event;previousPin=pin;
  }
  files.set('scripts/publication-sync.mjs',Buffer.from(code));
  assert.equal(H(files.get('scripts/publication-sync.mjs')),'4cdeed574bf4fd80ea9e80e7c1067e052dca7c19a937e35d7a803ab0dcbe2e7a','projected module must equal the frozen pre-registration source');
  const removed=new Set(removedPaths);files.set('PUBLICATION-MANIFEST.txt',Buffer.from(lines.filter(p=>!removed.has(p)).join('\n')));
  return {files,pins,events,removedPaths,suffixEvents};
}

// Non-authorizing test data reconstruction. These are exact stored fields and
// the production clock formulas, not loadRoundContext-validated chain authority.
// Test-owned exact editorial002 context. Only registered later editorial-owned
// dependencies are projected out; unknown production drift fails closed.
function projectEditorial002Context(projection){
  const files=new Map(projection.files),anchor=projection.suffixEvents[0],fixturePath='tests/fixtures/editorial002-manifest.json';
  const opaque=new Set(['tests/editorial-publication.test.mjs','tests/editorial-publication-consumers.test.mjs','tests/editorial-two-bank.test.mjs','tests/editorial-three-bank.test.mjs',fixturePath]);
  const support=new Set(['tests/editorial-three-bank.test.mjs',fixturePath]),removed=new Set();
  const safe=p=>typeof p==='string'&&/^[A-Za-z0-9._/-]+$/.test(p)&&!p.startsWith('/')&&!p.split('/').some(v=>!v||v==='.'||v==='..');
  function inventory(event){assert(Array.isArray(event.remoteInventory));const rows=new Map();for(const row of event.remoteInventory){assert.deepEqual(Object.keys(row).sort(),['bytes','gitBlob','path','sha256']);assert(safe(row.path));assert(!rows.has(row.path),'duplicate publication inventory path');assert(Number.isSafeInteger(row.bytes)&&row.bytes>=0);assert(/^[a-f0-9]{64}$/.test(row.sha256));assert(/^[a-f0-9]{40}$/.test(row.gitBlob));rows.set(row.path,row);}return rows;}
  function exact(p,rows){const raw=files.get(p),row=rows.get(p);assert(Buffer.isBuffer(raw)&&row,`missing exact fixture dependency ${p}`);assert.equal(raw.length,row.bytes,p);assert.equal(H(raw),row.sha256,p);assert.equal(createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${raw.length}\0`),raw])).digest('hex'),row.gitBlob,p);return raw;}
  const historical=inventory(anchor),historicalRaw=files.get(fixturePath);assert(Buffer.isBuffer(historicalRaw),'exact historical002 manifest fixture required');
  assert.equal(H(historicalRaw),'e3e2e3f9cc551a586dca75c61034e6e89e7e17d61c935d7e138c5aac30f040d7');
  assert.deepEqual(historicalRaw,Buffer.from(anchor.runtimeManifestRaw));assert.deepEqual(JSON.parse(historicalRaw),anchor.manifest);
  assert.equal(anchor.manifest.bankVersion,'2026.10.11-editorial.2');assert.equal(anchor.manifest.sha256,'a752fd3714ca62e0f0067af778a547f430690f60d6c2da831af4330a162c2c18');
  assert.equal(H(exact('data/'+anchor.manifest.file,historical)),anchor.manifest.sha256);
  const latest=projection.suffixEvents.at(-1),latestInventory=inventory(latest),activeRaw=exact('data/manifest.json',latestInventory);
  assert.deepEqual(activeRaw,Buffer.from(latest.runtimeManifestRaw));assert.equal(H(activeRaw),latest.manifestSha256);assert.deepEqual(JSON.parse(activeRaw),latest.manifest);
  const lines=files.get('PUBLICATION-MANIFEST.txt').toString().split('\n');
  for(const p of support){assert(Buffer.isBuffer(files.get(p)),`missing required fixture support ${p}`);assert.equal(lines.filter(line=>line===p).length,1,'one exact support allowlist entry required');}
  for(const event of projection.suffixEvents.slice(1)){
    const source=event.rounds[0],id=source.correctionRoundId,rows=inventory(event),owned=new Map();
    function own(p,sha256=null){assert(safe(p));assert(!historical.has(p)&&!opaque.has(p),'later owner cannot remove historical or support bytes');assert(!removed.has(p),'duplicate ownership across editorial events');const raw=exact(p,rows);if(sha256!==null)assert.equal(H(raw),sha256,p);if(owned.has(p))assert.equal(owned.get(p),H(raw),'ambiguous owned dependency');owned.set(p,H(raw));return raw;}
    const ledgerRaw=own(source.ledgerPath,source.originalLedgerSha256),ledger=JSON.parse(ledgerRaw);assert.deepEqual(ledgerRaw,J(ledger));
    assert.equal(ledger.kind,'accepted_content_editorial');assert.equal(ledger.correctionRoundId,id);assert.equal(ledger.status,'closed');
    assert.equal(ledger.publication.bankVersion,source.bankVersion);assert.equal(ledger.publication.bankSha256,source.bankSha256);
    assert.equal(event.manifest.bankVersion,source.bankVersion);assert.equal(event.manifest.sha256,source.bankSha256);assert.equal(event.manifest.file,`releases/${source.bankVersion}/bank.json`);
    own(`data/releases/${source.bankVersion}/bank.json`,source.bankSha256);const reportPath=`docs/corrections/${id}.md`;own(reportPath);
    for(const correction of ledger.corrections)for(const cycle of correction.cycles){
      assert(Number.isSafeInteger(cycle.cycle)&&cycle.cycle>0);assert.equal(cycle.reviewPackagePath,`docs/corrections/evidence/${id}-cycle-${cycle.cycle}.json`);
      const raw=own(cycle.reviewPackagePath,cycle.reviewPackageSha256),pkg=JSON.parse(raw);assert.deepEqual(raw,J(pkg));assert.equal(pkg.evidenceSchemaVersion,1);assert.equal(pkg.purpose,'immutable_editorial_review_input');assert.equal(pkg.correctionRoundId,id);assert.equal(pkg.cycle,cycle.cycle);
    }
    for(const entry of ledger.validation)if(entry.reportPath)assert(owned.has(entry.reportPath),'unknown validation report requires explicit fixture review');
    for(const p of owned.keys()){assert.equal(lines.filter(line=>line===p).length,1,'one exact owned allowlist entry required');removed.add(p);}
  }
  for(const p of removed)files.delete(p);files.set('data/manifest.json',Buffer.from(historicalRaw));
  const projectedLines=lines.filter(p=>!removed.has(p)),historicalAllowlist=Buffer.from(projectedLines.filter(p=>!support.has(p)).join('\n'));
  files.set('PUBLICATION-MANIFEST.txt',historicalAllowlist);exact('PUBLICATION-MANIFEST.txt',historical);
  for(const p of historical.keys())if(!opaque.has(p))exact(p,historical);else assert(Buffer.isBuffer(files.get(p)),`missing opaque historical test ${p}`);
  for(const p of files.keys())assert(historical.has(p)||support.has(p),`unknown fixture addition ${p}`);
  files.set('PUBLICATION-MANIFEST.txt',Buffer.from(projectedLines.join('\n')));
  const publicPaths=projectedLines.filter(p=>p&&!p.startsWith('#')),expectedPaths=[...historical.keys(),...support];assert.equal(new Set(expectedPaths).size,expectedPaths.length);assert.deepEqual([...files.keys()].sort(),expectedPaths.sort());assert.equal(new Set(publicPaths).size,publicPaths.length);assert.deepEqual([...files.keys()].sort(),[...publicPaths].sort());
  return {...projection,files,removedPaths:[...projection.removedPaths,...removed]};
}

function fixtureOfflineBases(files,prior){
  const inventory=new Map(prior.remoteInventory.map(f=>[f.path,f])),offlineBases=new Map(),deliveryCheckpointSources=new Map(),derivation=[];
  function authenticated(p){const raw=files.get(p),entry=inventory.get(p);assert(raw&&entry,`missing actual publication dependency ${p}`);assert.equal(H(raw),entry.sha256);assert.equal(raw.length,entry.bytes);return JSON.parse(raw);}
  function maxInstant(values){assert(values.length&&values.every(v=>Number.isFinite(Date.parse(v))),'missing fixture chronology');return new Date(Math.max(...values.map(v=>Date.parse(v)))).toISOString();}
  function add(artifact,base,p,fields){
    assert(!offlineBases.has(artifact),'ambiguous fixture artifact');
    assert(/^[a-f0-9]{64}$/.test(artifact));
    for(const k of ['roundId','bankVersion','bankSha256','ledgerSha256','manifestSha256','baseCommit','recordedAt','eligibleAt'])assert(base[k],`missing ${k} in ${p}`);
    offlineBases.set(artifact,base);derivation.push({artifactSha256:artifact,path:p,sha256:H(files.get(p)),fields});
  }
  const legacyPath='docs/deliveries/offline-chain.json',legacy=authenticated(legacyPath);
  for(const receipt of legacy.receipts){
    const matches=legacy.manifests.filter(m=>H(J(m))===receipt.manifestSha256);assert.equal(matches.length,1);
    const m=matches[0],c=receipt.content,first=m.schemaVersion===2?m.reconciliation.firstUnresolvedAt:m.gitOutcome.observedAt;
    assert(Number.isFinite(Date.parse(first)));
    add(receipt.artifactSha256,{roundId:c.roundId,bankVersion:c.bankVersion,bankSha256:c.bankSha256,ledgerSha256:c.ledgerSha256,manifestSha256:receipt.manifestSha256,baseCommit:receipt.baseCommit,recordedAt:receipt.recordedAt,eligibleAt:maxInstant([receipt.recordedAt,new Date(Date.parse(first)+600000).toISOString()])},legacyPath,{identity:'receipts[].content',baseCommit:'receipts[].baseCommit',recordedAt:'receipts[].recordedAt',eligibleAt:'max(recordedAt, original manifest firstUnresolvedAt + 600000ms); download-fallback waitForManifest'});
  }
  const bootstrapPath='docs/deliveries/normal-backup-009.json',p=authenticated(bootstrapPath),s=p.completeManifest.sourceRelease,t=p.terminal;
  const times=[p.verifiedAt,p.attachmentAcceptedAt,t.permissionWait.stoppedAt,t.gitOutcome.observedAt];
  if(t.gitOutcome.objects==='unknown')times.push(t.reconciliation.deadlineAt,t.reconciliation.skippedAt);
  add(p.deltaArtifactSha256,{roundId:s.roundId,bankVersion:s.bankVersion,bankSha256:s.bankSha256,ledgerSha256:s.ledgerSha256,manifestSha256:H(J(p.deltaManifest)),baseCommit:s.baseCommit,recordedAt:p.attachmentAcceptedAt,eligibleAt:maxInstant(times)},bootstrapPath,{identity:'completeManifest.sourceRelease',manifestSha256:'SHA256(canonical deltaManifest)',recordedAt:'attachmentAcceptedAt',eligibleAt:'max(verifiedAt, attachmentAcceptedAt, terminal.permissionWait.stoppedAt, terminal.gitOutcome.observedAt, terminal.reconciliation.deadlineAt, terminal.reconciliation.skippedAt); release-backup-continuation timing'});
  deliveryCheckpointSources.set(s.roundId,files.get(bootstrapPath));
  for(const [registryPath,collection,dialect]of [['docs/deliveries/release-backup-trust.json','checkpoints','backup'],['docs/deliveries/offline-chain-trust.json','checkpoints','independent'],['docs/deliveries/normal-backup-root-trust.json','roots','root'],['docs/deliveries/normal-backup-chain-trust.json','checkpoints','chain']]){
    const registry=authenticated(registryPath);
    for(const pin of registry[collection]){
      const p=authenticated(pin.path),raw=files.get(pin.path),s=p.completeManifest.sourceRelease;assert.equal(H(raw),pin.sha256);
      let baseCommit,recordedAt,eligibleAt,fields;
      if(dialect==='backup'){baseCommit=s.baseCommit;recordedAt=p.attachmentAcceptedAt;eligibleAt=p.verifiedAt;assert.equal(eligibleAt,pin.verifiedAt);fields={baseCommit:'completeManifest.sourceRelease.baseCommit',recordedAt:'attachmentAcceptedAt',eligibleAt:'verifiedAt = trust pin verifiedAt'};}
      else if(dialect==='independent'){baseCommit=p.receipt.baseCommit;recordedAt=p.receipt.recordedAt;eligibleAt=maxInstant([p.verifiedAt,p.uncertainty.wait.skippedAt]);assert.equal(p.verifiedAt,pin.verifiedAt);fields={baseCommit:'receipt.baseCommit',recordedAt:'receipt.recordedAt',eligibleAt:'max(verifiedAt, uncertainty.wait.skippedAt)'};}
      else {const anchor=dialect==='root'?p.continuationAnchor:p.publicAnchor;assert(anchor?.baseCommit);baseCommit=anchor.baseCommit;recordedAt=p.attachmentAcceptedAt;eligibleAt=pin.eligibleAt;fields={baseCommit:dialect==='root'?'continuationAnchor.baseCommit':'publicAnchor.baseCommit',recordedAt:'attachmentAcceptedAt',eligibleAt:'trust pin eligibleAt'};}
      add(p.deltaArtifactSha256,{roundId:s.roundId,bankVersion:s.bankVersion,bankSha256:s.bankSha256,ledgerSha256:s.ledgerSha256,manifestSha256:H(J(p.deltaManifest)),baseCommit,recordedAt,eligibleAt},pin.path,{...fields,identity:'completeManifest.sourceRelease',manifestSha256:'SHA256(canonical deltaManifest)',registryPath,registrySha256:H(files.get(registryPath)),pinSha256:pin.sha256});
      deliveryCheckpointSources.set(pin.roundId,raw);
    }
  }
  return {offlineBases,deliveryCheckpointSources,fixtureDerivation:derivation};
}

before(async()=>{
  const sourceFiles=new Map();
  for(const p of (await read('PUBLICATION-MANIFEST.txt')).toString().split(/\r?\n/).map(p=>p.trim()).filter(p=>p&&!p.startsWith('#')))sourceFiles.set(p,await read(p));
  const fixtureProjection=projectEditorial002Context(projectHistoricalPublications(sourceFiles,PUBLICATION_SYNCHRONIZATIONS)),{files,pins:historicalPins,events}=fixtureProjection;
  const prior=events.at(-1),e=JSON.parse(files.get('docs/corrections/editorial-002.json'));
  originalEditorialRaw=files.get('docs/corrections/editorial-002.json');
  originalSelectedRaw=files.get(`data/releases/${e.baseline.bankVersion}/bank.json`);
  sourceBank=JSON.parse(files.get(`data/releases/${e.publication.bankVersion}/bank.json`));
  roundSchema=JSON.parse(files.get('docs/rounds/round-ledger.schema.json'));
  editorialSchema=JSON.parse(files.get('docs/corrections/editorial-ledger.schema.json'));
  const manifest=JSON.parse(files.get('data/manifest.json'));
  assert.equal(manifest.bankVersion,e.publication.bankVersion,'fixture must start at the frozen editorial002 source');
  const source={kind:'editorial_frozen_ledger',correctionRoundId:e.correctionRoundId,ledgerPath:'docs/corrections/editorial-002.json',originalLedgerSha256:H(originalEditorialRaw),bankVersion:e.publication.bankVersion,bankSha256:e.publication.bankSha256,baseline:{sourceCommit:e.baseline.sourceCommit,bankVersion:e.baseline.bankVersion,bankSha256:e.baseline.bankSha256},originalPublicationStatus:'not_attempted',accepted:e.counts.accepted,publishedRevisedRegular:e.counts.accepted,newlyPublicRegular:0};
  const inventory=[...files].map(([path,raw])=>({path,bytes:raw.length,sha256:H(raw),gitBlob:gitBlobSha(raw)}));
  event={schemaVersion:1,syncId:'synthetic-editorial-002-consumers',kind:'verified_normal_editorial_publication',previousSynchronizationSha256:H(J(prior)),verifiedAt:'2026-10-11T00:55:00Z',repository:prior.repository,commit:'a'.repeat(40),parent:e.baseline.sourceCommit,tree:normalPublicationTree(inventory),commitUrl:`https://github.com/${prior.repository}/commit/${'a'.repeat(40)}`,pages:{runId:1,headSha:'a'.repeat(40),status:'completed',conclusion:'success',url:`https://github.com/${prior.repository}/actions/runs/1`},siteUrl:prior.siteUrl,manifest,manifestSha256:H(files.get('data/manifest.json')),runtimeManifestRaw:files.get('data/manifest.json').toString(),publicationStateRaw:files.get('data/publication-state.json').toString(),counts:{...prior.counts,newlyPublicFromAnchor:0},writtenBySubject:prior.writtenBySubject,rounds:[source],remoteInventory:inventory,liveAssets:inventory.map(f=>({path:f.path,url:new URL(f.path,prior.siteUrl).href,http:200,bytes:f.bytes,sha256:f.sha256})),limitations:['Synthetic consumer fixture only; never actual publication evidence']};
  directory=await fs.mkdtemp(path.join(os.tmpdir(),'editorial-publication-consumers-'));
  await fs.cp(root,directory,{recursive:true});
  for(const p of fixtureProjection.removedPaths)await fs.rm(path.join(directory,p));
  for(const p of ['PUBLICATION-MANIFEST.txt','scripts/publication-sync.mjs','data/manifest.json'])await fs.writeFile(path.join(directory,p),files.get(p));
  const eventPath=`docs/publications/${event.syncId}.json`;
  await fs.writeFile(path.join(directory,eventPath),J(event));
  await fs.appendFile(path.join(directory,'PUBLICATION-MANIFEST.txt'),eventPath+'\n');
  const pins=[...historicalPins,{path:eventPath,sha256:H(J(event))}];
  const sourceCode=files.get('scripts/publication-sync.mjs').toString();
  const declaration=/export const PUBLICATION_SYNCHRONIZATIONS = Object.freeze\(\[[\s\S]*?\n\]\);/;
  assert.match(sourceCode,declaration,'the disposable authority patch must be exact and bounded');
  await fs.writeFile(path.join(directory,'scripts/publication-sync.mjs'),sourceCode.replace(declaration,`export const PUBLICATION_SYNCHRONIZATIONS = Object.freeze([\n${pins.map(p=>`  Object.freeze(${JSON.stringify(p)})`).join(',\n')}\n]);`));
  api=await import(pathToFileURL(path.join(directory,'scripts/publication-sync.mjs')).href);
  validator=await import(pathToFileURL(path.join(directory,'scripts/validate-round.mjs')).href);
  editorialApi=await import(pathToFileURL(path.join(directory,'scripts/editorial-ledger.mjs')).href);
  const editorialPaths=[...files.keys()].filter(p=>/^docs\/corrections\/editorial-\d+\.json$/.test(p)).map(p=>path.join(directory,p));
  const typed=await validator.readEditorialDependencies(directory,editorialPaths);
  const ledgers=[],ledgerSources=new Map(),banks=new Map();
  for(const [p,raw]of files){if(/^docs\/rounds\/round-\d+\.json$/.test(p)){const l=JSON.parse(raw);ledgers.push(l);ledgerSources.set(l.roundId,raw);}const bank=/^data\/releases\/([^/]+)\/bank\.json$/.exec(p);if(bank)banks.set(bank[1],{raw});}
  const selections=await import(pathToFileURL(path.join(directory,'scripts/publication-selection.mjs')).href);
  context={...typed,ledgers,ledgerSources,banks,schema:roundSchema,manifest,publicationState:JSON.parse(files.get('data/publication-state.json')),synchronizations:[...events,event],publicationSelections:await selections.loadPublicationSelections(directory,{now}),...fixtureOfflineBases(files,prior)};

});
after(async()=>{if(directory)await fs.rm(directory,{recursive:true,force:true});});

const checked=options=>api.validatePublicationSynchronizations(context.synchronizations,{...context,now,...options});
const history=options=>editorialApi.validateEditorialHistory(options?.editorials??context.editorials,{...context,schema:context.editorialSchema,now,...options},{validateJsonSchema:validator.validateJsonSchema,regularCoverage:validator.regularCoverage,nextScheduledRoundAt:validator.nextScheduledRoundAt,FINAL_DECISION_AT:validator.FINAL_DECISION_AT});
const expectPass=result=>assert.equal(result.ok,true,result.errors.join('\n'));
const expectFail=result=>assert.equal(result.ok,false,'invalid consumer context was accepted');

test('production dependency reader retains exact separately typed source, schema, packages and reports',()=>{
  assert.equal(isEditorialPublication(event),true);assert.equal(isNormalPublication(event),false);
  assert.deepEqual(context.editorialSources.get('editorial-002'),originalEditorialRaw);
  assert.equal(context.ledgerSources.has('editorial-002'),false);
  assert.deepEqual(context.editorialSchema,editorialSchema);
  const e=context.editorials.find(e=>e.correctionRoundId==='editorial-002');
  assert.equal(e.publication.status,'not_attempted');assert.equal(e.counts.publishedRevisedRegular,0);
  assert(e.corrections.every(c=>c.publishedBankVersion===null));
  for(const c of e.corrections)for(const cycle of c.cycles)assert.equal(H(context.reviewPackages.get(cycle.reviewPackagePath).raw),cycle.reviewPackageSha256);
  assert(context.availableFiles.has('docs/corrections/editorial-002.md'));
  assert(Buffer.isBuffer(context.editorialReports.get('docs/corrections/editorial-002.md')));
  assert.deepEqual(context.banks.get(e.baseline.bankVersion).raw,originalSelectedRaw);
});

test('dependency reader preserves external drafts, missing dependencies and canonical filename checks',async t=>{
  const externalDirectory=await fs.mkdtemp(path.join(os.tmpdir(),'editorial-external-input-'));t.after(()=>fs.rm(externalDirectory,{recursive:true,force:true}));
  const draft=JSON.parse(originalEditorialRaw);draft.correctionRoundId='editorial-external-fixture';
  for(const c of draft.corrections)for(const cycle of c.cycles)cycle.reviewPackagePath='docs/corrections/evidence/editorial-external-fixture-cycle-1.json';
  const external=path.join(externalDirectory,'draft.json');await fs.writeFile(external,J(draft));
  const read=await validator.readEditorialDependencies(directory,[external]);
  assert.deepEqual(read.editorials,[draft]);assert.equal(read.editorialSources.size,0);
  assert.equal(read.reviewPackages.size,0);assert.equal(read.editorialReports.size,0);assert.equal(read.availableFiles.size,0);
  assert.equal(Object.hasOwn(read,'ok'),false);assert.equal(Object.hasOwn(read,'history'),false);
  const duplicate=await validator.readEditorialDependencies(directory,[path.join(directory,'docs/corrections/editorial-002.json'),path.join(directory,'docs/corrections/editorial-002.json')]);
  assert.equal(duplicate.editorials.length,2,'reader must not hide duplicate owners before validation');
  const isolated=path.join(externalDirectory,'source');await fs.mkdir(path.join(isolated,'docs/corrections'),{recursive:true});
  const legacyExternal=await validator.readEditorialDependencies(isolated,[external]);
  assert.deepEqual(legacyExternal.editorials,[draft]);assert.deepEqual(legacyExternal.editorialSchema,editorialSchema);
  const wrong=path.join(isolated,'docs/corrections/editorial-wrong.json');await fs.writeFile(wrong,originalEditorialRaw);
  await assert.rejects(validator.readEditorialDependencies(isolated,[wrong]),/filename does not match correctionRoundId/);
});

test('typed self-event baseline admits the active editorial bank and rejects active rollback',()=>{
  expectPass(editorialApi.validateCampaignBaselines(context.ledgers,{...context,now,activeBankVersion:sourceBank.bankVersion}));
  expectFail(editorialApi.validateCampaignBaselines(context.ledgers,{...context,now,activeBankVersion:context.editorials.find(e=>e.correctionRoundId==='editorial-002').baseline.bankVersion}));
  assert(context.fixtureDerivation.length>0);assert(context.fixtureDerivation.every(d=>d.path&&d.sha256&&d.fields));
  assert.equal(context.deliveryCheckpointSources.has('editorial-002'),false);
  assert([...context.offlineBases.values()].every(b=>b.roundId!=='editorial-002'&&b.bankVersion!==sourceBank.bankVersion));
});

test('typed history consumers reject omitted source bytes and regular-source disguises',()=>{
  expectFail(checked({editorialSources:new Map()}));
  const e=context.editorials.find(e=>e.correctionRoundId==='editorial-002'),regularOnly=new Map(context.ledgerSources);regularOnly.set(e.correctionRoundId,originalEditorialRaw);
  expectFail(checked({editorials:context.editorials.filter(x=>x!==e),editorialSources:new Map(),ledgers:[...context.ledgers,e],ledgerSources:regularOnly}));
  const roundAlias=clone(e);roundAlias.roundId=e.correctionRoundId;delete roundAlias.correctionRoundId;
  const aliasResult=checked({editorials:context.editorials.filter(x=>x!==e),editorialSources:new Map(),ledgers:[...context.ledgers,roundAlias],ledgerSources:regularOnly});
  expectFail(aliasResult);assert.match(aliasResult.errors.join('\n'),/only in the editorial collection/);
  // A genuinely earlier subset that does not supply this owner in either
  // collection remains valid and cannot activate the later editorial event.
  const historical=checked({now:Date.parse(e.startedAt)-1,editorials:context.editorials.filter(x=>x!==e),editorialSources:new Map([...context.editorialSources].filter(([id])=>id!==e.correctionRoundId))});
  expectPass(historical);assert.equal(historical.history.some(h=>h.synchronizedEditorialIds?.includes(e.correctionRoundId)),false);
  assert.equal(historical.history.at(-1).syncId,context.synchronizations.at(-2).syncId);
});

function successor(){
  const prior=context.editorials.find(e=>e.correctionRoundId==='editorial-002'),before=sourceBank;
  const e=clone(prior),bank=clone(before),c=clone(prior.corrections[0]),q=bank.questions.find(q=>q.questionId===c.questionId);
  Object.assign(bank,{bankVersion:'synthetic-editorial-consumer.3',editorialRoundId:'editorial-003',releasedAt:'2026-10-11T03:05:00Z',changeSummary:'Synthetic later editorial consumer fixture'});
  q.revision++;q.explanation+=' 이 설명은 제시된 일반 함수 생성자 호출에 적용된다.';
  Object.assign(e,{correctionRoundId:'editorial-003',startedAt:'2026-10-11T03:00:00Z',decisionDeadline:'2026-10-11T06:00:00Z',closedAt:'2026-10-11T03:04:00Z',changedQuestionIds:[q.questionId],changedOptionIds:[],changedPracticalChoiceIds:[],corrections:[c],validation:[]});
  e.baseline={...e.baseline,sourceCommit:event.commit,bankVersion:before.bankVersion,bankSha256:H(context.banks.get(before.bankVersion).raw)};
  e.counts={registered:1,accepted:1,rejected:0,pending:0,newRegular:0,revisedRegular:1,publishedRevisedRegular:0};
  Object.assign(c,{correctionId:'e003-consumer-synthetic',issueId:'synthetic-later-defect',revision:q.revision,authorId:'synthetic-successor-author',attemptCount:1,publishedBankVersion:null,targetPaths:validator.editorialChangedPaths(before,bank,q.questionId)});
  c.priorAcceptedRef={roundId:prior.correctionRoundId,candidateId:prior.corrections[0].correctionId,ledgerPath:'docs/corrections/editorial-002.json',bankVersion:before.bankVersion,bankSha256:e.baseline.bankSha256,questionRevision:q.revision-1,contentSha256:validator.editorialContentHash(before,q.questionId)};
  const cycle=clone(c.cycles[0]);c.cycles=[cycle];
  Object.assign(cycle,{cycle:1,revision:q.revision,startedAt:'2026-10-11T03:01:00Z',finishedAt:'2026-10-11T03:03:00Z',contentSha256:validator.editorialContentHash(bank,q),blindPackageSha256:validator.editorialHash(validator.editorialBlindPackage(bank,q)),componentStates:validator.editorialComponentStates(bank,q),reviewPackagePath:'docs/corrections/evidence/editorial-003-cycle-1.json'});
  for(const gate of Object.values(cycle.gates)){gate.reviewerId='synthetic-fresh-successor-reviewer';gate.summary='Synthetic fixture gate only';}
  const packageRaw=J({evidenceSchemaVersion:1,purpose:'immutable_editorial_review_input',correctionRoundId:e.correctionRoundId,cycle:1,items:[{correctionId:c.correctionId,...validator.editorialContent(bank,q)}]});
  cycle.reviewPackageSha256=H(packageRaw);
  const raw=J(bank);e.publication={status:'not_attempted',commit:null,bankVersion:bank.bankVersion,bankSha256:H(raw),verifiedAt:null,url:null,blockers:[]};
  const manifest={...context.manifest,bankVersion:bank.bankVersion,releasedAt:bank.releasedAt,file:`releases/${bank.bankVersion}/bank.json`,sha256:H(raw),changeSummary:bank.changeSummary};
  return {...context,now:Date.parse('2026-10-11T03:10:00Z'),manifest,editorials:[...context.editorials,e],banks:new Map([...context.banks,[bank.bankVersion,{raw}]]),editorialSources:new Map([...context.editorialSources,[e.correctionRoundId,J(e)]]),reviewPackages:new Map([...context.reviewPackages,[cycle.reviewPackagePath,{raw:packageRaw}]]),availableFiles:new Set([...context.availableFiles,'docs/corrections/editorial-003.md']),editorialReports:new Map([...context.editorialReports,['docs/corrections/editorial-003.md',Buffer.from('Synthetic later report\n')]])};
}

test('later editorial resolves the revised predecessor and keeps historical source checks active',()=>{
  const next=successor();expectPass(history(next));
  const e=next.editorials.at(-1);
  for(const mutate of [x=>x.corrections[0].priorAcceptedRef.questionRevision=1,x=>x.startedAt=event.verifiedAt]){
    const changed=clone(e);mutate(changed);expectFail(history({...next,editorials:[...context.editorials,changed]}));
  }
  const packages=new Map(next.reviewPackages);packages.delete(context.editorials.find(e=>e.correctionRoundId==='editorial-002').corrections[0].cycles[0].reviewPackagePath);
  expectFail(checked({...next,reviewPackages:packages}));
});

// Frozen pre-extraction helper bodies from source365 validate-round.mjs
// SHA-256 e26b07d496a40b90548f10312cd28fe3b88e189011adccce62458f3642aea7a3.
// This independent implementation is test-only and cannot provide authority.
function originalHelpers(DEFAULT_SCHEMA) {
const SUBJECTS=['s1','s2','s3','s4','s5'],emptySubjects=()=>Object.fromEntries(SUBJECTS.map(id=>[id,0]));
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value),own=(value,key)=>Object.hasOwn(value,key);
// Deliberately scoped to the checked-in schema, not a general JSON Schema implementation.
// An unimplemented keyword, format, external reference or schema change fails closed.
const KEYWORDS = new Set(['$schema', '$defs', '$ref', 'title', 'description', 'type', 'const', 'enum',
  'properties', 'required', 'additionalProperties', 'items', 'contains', 'minItems', 'maxItems',
  'uniqueItems', 'minimum', 'maximum', 'minLength', 'pattern', 'format', 'allOf', 'anyOf', 'if', 'then', 'else']);
function inspectSchema(schema, root, at = '#', stack = new Set()) {
  if (typeof schema === 'boolean') return;
  if (!object(schema)) throw new Error(`${at}: invalid schema node`);
  for (const key of Object.keys(schema)) if (!KEYWORDS.has(key)) throw new Error(`${at}: unsupported schema keyword ${key}`);
  if (schema.$schema && schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') throw new Error(`${at}: unsupported schema dialect`);
  if (schema.format && !['date-time', 'uri'].includes(schema.format)) throw new Error(`${at}: unsupported format ${schema.format}`);
  if (schema.type && ![schema.type].flat().every(t => ['object', 'array', 'string', 'integer', 'number', 'null', 'boolean'].includes(t))) throw new Error(`${at}: unsupported type`);
  if (schema.pattern) new RegExp(schema.pattern, 'u');
  if (schema.$ref) {
    if (!/^#\/\$defs\/[^/]+$/.test(schema.$ref) || !own(root.$defs || {}, schema.$ref.slice(8))) throw new Error(`${at}: unsupported or unresolved reference ${schema.$ref}`);
    if (stack.has(schema.$ref)) throw new Error(`${at}: recursive schema references are unsupported`);
    inspectSchema(root.$defs[schema.$ref.slice(8)], root, schema.$ref, new Set([...stack, schema.$ref]));
  }
  for (const key of ['properties', '$defs']) for (const [name, child] of Object.entries(schema[key] || {})) inspectSchema(child, root, `${at}/${key}/${name}`, stack);
  for (const key of ['items', 'contains', 'if', 'then', 'else', 'additionalProperties']) if (own(schema, key)) inspectSchema(schema[key], root, `${at}/${key}`, stack);
  for (const key of ['allOf', 'anyOf']) for (const [i, child] of (schema[key] || []).entries()) inspectSchema(child, root, `${at}/${key}/${i}`, stack);
}
function validDateTime(value) {
  // Operational timestamps are ordinary RFC3339 civil instants. Leap-second spellings
  // are rejected rather than silently normalized by Date.parse.
  const m = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!m) return false;
  const [, y, month, day, hour, minute, second, , offsetHour = '0', offsetMinute = '0'] = m;
  const year = Number(y), mon = Number(month), d = Number(day);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return mon >= 1 && mon <= 12 && d >= 1 && d <= days[mon - 1] && Number(hour) < 24 && Number(minute) < 60 && Number(second) < 60 && Number(offsetHour) < 24 && Number(offsetMinute) < 60 && Number.isFinite(Date.parse(value));
}
function matchesType(value, type) {
  return type === 'null' ? value === null : type === 'object' ? object(value) : type === 'array' ? Array.isArray(value) : type === 'integer' ? Number.isInteger(value) : type === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === type;
}
function evaluate(value, schema, root, at, errors) {
  const fail = message => errors.push(`${at}: ${message}`);
  if (schema === true) return;
  if (schema === false) return fail('value is forbidden');
  if (schema.$ref) evaluate(value, root.$defs[schema.$ref.slice(8)], root, at, errors);
  if (schema.type && ![schema.type].flat().some(type => matchesType(value, type))) fail(`expected type ${[schema.type].flat().join('|')}`);
  if (own(schema, 'const') && !isDeepStrictEqual(value, schema.const)) fail(`expected constant ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some(item => isDeepStrictEqual(value, item))) fail(`expected one of ${schema.enum.join(', ')}`);
  if (typeof value === 'number') {
    if (own(schema, 'minimum') && value < schema.minimum) fail(`minimum ${schema.minimum}`);
    if (own(schema, 'maximum') && value > schema.maximum) fail(`maximum ${schema.maximum}`);
  }
  if (typeof value === 'string') {
    if (own(schema, 'minLength') && [...value].length < schema.minLength) fail(`minimum length ${schema.minLength}`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) fail(`does not match ${schema.pattern}`);
    if (schema.format === 'date-time' && !validDateTime(value)) fail('invalid RFC3339 date-time');
    if (schema.format === 'uri') {
      try { if (/\s|%(?![A-Fa-f0-9]{2})/.test(value) || !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) throw new Error(); new URL(value); }
      catch { fail('invalid absolute URI'); }
    }
  }
  if (object(value)) {
    for (const key of schema.required || []) if (!own(value, key)) fail(`missing required property ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (own(schema.properties || {}, key)) evaluate(item, schema.properties[key], root, `${at}/${key}`, errors);
      else if (own(schema, 'additionalProperties')) evaluate(item, schema.additionalProperties, root, `${at}/${key}`, errors);
    }
  }
  if (Array.isArray(value)) {
    if (own(schema, 'minItems') && value.length < schema.minItems) fail(`minimum items ${schema.minItems}`);
    if (own(schema, 'maxItems') && value.length > schema.maxItems) fail(`maximum items ${schema.maxItems}`);
    if (schema.uniqueItems && value.some((item, i) => value.slice(0, i).some(other => isDeepStrictEqual(item, other)))) fail('items must be unique');
    if (own(schema, 'items')) value.forEach((item, i) => evaluate(item, schema.items, root, `${at}/${i}`, errors));
    if (schema.contains && !value.some(item => { const e = []; evaluate(item, schema.contains, root, at, e); return e.length === 0; })) fail('no item satisfies contains');
  }
  for (const child of schema.allOf || []) evaluate(value, child, root, at, errors);
  if (schema.anyOf && !schema.anyOf.some(child => { const e = []; evaluate(value, child, root, at, e); return e.length === 0; })) fail('no anyOf branch matches');
  if (schema.if) {
    const condition = []; evaluate(value, schema.if, root, at, condition);
    const branch = condition.length ? schema.else : schema.then;
    if (branch !== undefined) evaluate(value, branch, root, at, errors);
  }
}
function validateJsonSchema(value, schema = DEFAULT_SCHEMA) {
  const errors = [];
  try { inspectSchema(schema, schema); evaluate(value, schema, schema, '$', errors); }
  catch (error) { errors.push(`schema: ${error.message}`); }
  return errors;
}

/** Actual published regular unique templates, with constructible five-choice mock eligibility. */
function regularCoverage(bank, at = Date.parse(bank.releasedAt)) {
  const written = emptySubjects(), fiveChoice = emptySubjects();
  const seen = new Set(), fiveSeen = new Set(); let practical = 0;
  for (const q of bank.questions) {
    if (q.testOnly !== false || !isPublishedQuestion(bank, q, at)) continue;
    if (!seen.has(q.templateId)) { seen.add(q.templateId); if (q.type === 'written') written[q.subjectId]++; else practical++; }
    if (q.type === 'written' && !fiveSeen.has(q.templateId) && q.supportedOptionCounts?.includes(5)) {
      try { presentQuestion(bank, q, 5, () => 0); fiveSeen.add(q.templateId); fiveChoice[q.subjectId]++; } catch { /* Not constructible, so not mock eligible. */ }
    }
  }
  return {regularWrittenBySubject: written, regularPractical: practical, mockEligible: SUBJECTS.every(id => fiveChoice[id] >= 20)};
}

/** Occurrence versions are effective-dated; do not reinterpret immutable Oct 2 history. */
const FOUR_HOUR_CADENCE_AT = Date.parse('2026-10-03T00:00:00+09:00');
const CAMPAIGN_SCHEDULE_VERSIONS = Object.freeze([
  Object.freeze({version: 'legacy-12h', effectiveFrom: Date.parse('2026-10-02T20:00:00+09:00'), effectiveUntil: FOUR_HOUR_CADENCE_AT, hours: Object.freeze([8, 20])}),
  Object.freeze({version: 'four-hour-v2', effectiveFrom: FOUR_HOUR_CADENCE_AT, effectiveUntil: FREEZE_AT, hours: Object.freeze([0, 4, 8, 12, 16, 20])})
]);
const scheduledRoundStarts = CAMPAIGN_SCHEDULE_VERSIONS.flatMap(version => {
  const starts = [];
  for (let day = 2; day <= 16; day++) for (const hour of version.hours) {
    const at = Date.parse(`2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+09:00`);
    if (at >= version.effectiveFrom && at < version.effectiveUntil) starts.push(at);
  }
  return starts;
}).sort((a, b) => a - b);
// The finalizer is a bound only, never another content-expansion occurrence.
const campaignBounds = [...scheduledRoundStarts, Date.parse('2026-10-16T23:30:00+09:00')];
function nextScheduledRoundAt(startedAt) {
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return NaN;
  return campaignBounds.find(at => at > start) ?? FREEZE_AT;
}

return {validateJsonSchema,regularCoverage,nextScheduledRoundAt,FOUR_HOUR_CADENCE_AT,CAMPAIGN_SCHEDULE_VERSIONS};
}

test('extracted canonical helpers retain exact old schema defaults, chronology and coverage behavior',()=>{
  const old=originalHelpers(roundSchema),round=context.ledgers[0];
  for(const value of [round,{},null,{...round,ledgerSchemaVersion:999}]){
    assert.deepEqual(publicHelpers.validateJsonSchema(value),old.validateJsonSchema(value));
    assert.deepEqual(publicHelpers.validateJsonSchema(value,undefined),old.validateJsonSchema(value,undefined));
    for(const schema of [roundSchema,true,false,null,{},{$unknown:true},{type:'string',format:'date-time'},{type:'object',required:['x'],additionalProperties:false,properties:{x:{type:'integer',minimum:1}}}]){
      assert.deepEqual(publicHelpers.validateJsonSchema(value,schema),old.validateJsonSchema(value,schema));
      assert.deepEqual(primitives.validateCampaignJsonSchema(value,schema),old.validateJsonSchema(value,schema));
    }
  }
  assert.deepEqual(primitives.validateCampaignJsonSchema(round,undefined),['schema: #: invalid schema node']);
  for(const at of ['invalid','2026-10-02T08:00:00+09:00','2026-10-02T19:30:00+09:00','2026-10-02T20:00:00+09:00','2026-10-03T00:00:00+09:00','2026-10-16T20:00:00+09:00','2026-10-16T23:30:00+09:00','2026-10-17T00:00:00+09:00']){
    assert.equal(publicHelpers.nextScheduledRoundAt(at),old.nextScheduledRoundAt(at));
    assert.equal(primitives.nextScheduledRoundAt(at),old.nextScheduledRoundAt(at));
  }
  assert.deepEqual(publicHelpers.CAMPAIGN_SCHEDULE_VERSIONS,old.CAMPAIGN_SCHEDULE_VERSIONS);
  assert.equal(publicHelpers.FOUR_HOUR_CADENCE_AT,old.FOUR_HOUR_CADENCE_AT);
  assert.equal(publicHelpers.FINAL_DECISION_AT,Date.parse('2026-10-16T23:00:00+09:00'));
  for(const bank of [sourceBank,JSON.parse(originalSelectedRaw),{...sourceBank,questions:[]},{...sourceBank,questions:[...sourceBank.questions,sourceBank.questions[0]]}])for(const at of [undefined,Date.parse(bank.releasedAt)-1,Date.parse(bank.releasedAt),FREEZE_AT]){
    assert.deepEqual(publicHelpers.regularCoverage(bank,at),old.regularCoverage(bank,at));
    assert.deepEqual(primitives.regularCoverage(bank,at),old.regularCoverage(bank,at));
  }
});
