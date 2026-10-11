/** Synthetic publication authority exists only in owned disposable copies. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {PUBLICATION_SYNCHRONIZATIONS,validatePublicationSynchronizations,validatePublicationSynchronizationSemantics,requiresSynchronizationDeliveryDependencies} from '../scripts/publication-sync.mjs';
import {isNormalPublication,isNormalChainPublication,normalPublicationTree,validateNormalPublication,validateNormalBankTransition} from '../scripts/normal-publication.mjs';
import {isEditorialPublication} from '../scripts/editorial-publication.mjs';
import {validateEditorialHistorySemantics,validateEditorialTransition} from '../scripts/editorial-history-core.mjs';
import {validateCampaignJsonSchema,regularCoverage,nextScheduledRoundAt,FINAL_DECISION_AT} from '../scripts/campaign-validation-primitives.mjs';
import {validateJsonSchema,regularCoverage as wrapperCoverage,nextScheduledRoundAt as wrapperSchedule} from '../scripts/validate-round.mjs';
import {loadPublicationSelections,validatePublicationSelectionSnapshot} from '../scripts/publication-selection.mjs';
const root=path.resolve(import.meta.dirname,'..'),J=value=>Buffer.from(JSON.stringify(value,null,2)+'\n'),H=raw=>createHash('sha256').update(raw).digest('hex');
const blob=raw=>createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${raw.length}\0`),raw])).digest('hex');
const read=p=>fs.readFile(path.join(root,p));
const helpers={validateJsonSchema:validateCampaignJsonSchema,regularCoverage,nextScheduledRoundAt,FINAL_DECISION_AT};
const at=Date.parse('2026-10-11T01:00:00Z');

// Test-owned historical projection only; this never authenticates new publication
// authority. A later real editorial002 registration must not become the synthetic
// fixture's predecessor. Keep this bounded projection identical in both tests.
function projectHistoricalPublications(sourceFiles,sourcePins){
  assert(Array.isArray(sourcePins));
  const pins=sourcePins.slice(0,8),suffix=sourcePins.slice(8),files=new Map(sourceFiles),removedPaths=[];
  assert.equal(H(J(pins)),'b91fb0d6f084a4a8005e077f449d928f0615ce54892daba764e0502d8942c1a4','fixture requires the exact eight-pin historical prefix');
  assert(suffix.length<=1,'unexpected publication suffix requires an explicit fixture review');
  function authenticated(pin){const raw=sourceFiles.get(pin.path);assert(Buffer.isBuffer(raw),`missing pinned fixture event ${pin.path}`);assert.equal(H(raw),pin.sha256);const event=JSON.parse(raw);assert.deepEqual(raw,J(event));return event;}
  const events=pins.map(authenticated),eventPath='docs/publications/editorial-002.json';
  assert.equal(events.at(-1).syncId,'normal-041-selection-001');
  assert(!files.has('docs/publications/editorial-002.md'),'unexpected publication report requires an explicit fixture review');
  if(suffix.length){
    const pin=suffix[0];assert.deepEqual(Object.keys(pin).sort(),['path','sha256']);assert.equal(pin.path,eventPath);
    const event=authenticated(pin);
    assert.equal(event.syncId,'editorial-002');assert.equal(event.kind,'verified_normal_editorial_publication');
    assert.equal(event.rounds.length,1);assert.equal(event.rounds[0].kind,'editorial_frozen_ledger');assert.equal(event.rounds[0].correctionRoundId,'editorial-002');assert.equal(event.rounds[0].ledgerPath,'docs/corrections/editorial-002.json');
    assert.equal(event.previousSynchronizationSha256,pins.at(-1).sha256);
    assert(Date.parse(event.verifiedAt)>Date.parse('2026-10-11T01:00:00Z'),'real suffix must be later than both fixed synthetic fixture times');
    const code=files.get('scripts/publication-sync.mjs').toString(),appendedPin=`,\n  Object.freeze({path:'${eventPath}', sha256:'${pin.sha256}'})`;
    assert.equal(code.split(appendedPin).length,2,'only the exact registration pin append may be projected');
    files.set('scripts/publication-sync.mjs',Buffer.from(code.replace(appendedPin,'')));
    const lines=files.get('PUBLICATION-MANIFEST.txt').toString().split('\n');
    assert.equal(lines.filter(line=>line===eventPath).length,1,'only one exact suffix allowlist line may be projected');
    files.set('PUBLICATION-MANIFEST.txt',Buffer.from(lines.filter(line=>line!==eventPath).join('\n')));
    files.delete(eventPath);removedPaths.push(eventPath);
  }else assert(!files.has(eventPath),'unregistered suffix event is not fixture history');
  assert.equal(H(files.get('scripts/publication-sync.mjs')),'4cdeed574bf4fd80ea9e80e7c1067e052dca7c19a937e35d7a803ab0dcbe2e7a','projected module must equal the frozen pre-registration source');
  return {files,pins,events,removedPaths};
}

// Test-owned exact editorial002 context. Actual003 remains immutable on disk.
// Only the reviewed four003 files may be removed from this private raw map.
function projectEditorial002Context(projection){
 const files=new Map(projection.files),fixturePath='tests/fixtures/editorial002-manifest.json';
 const historicalRaw=files.get(fixturePath);assert(Buffer.isBuffer(historicalRaw),'exact historical002 manifest fixture required');
 assert.equal(H(historicalRaw),'e3e2e3f9cc551a586dca75c61034e6e89e7e17d61c935d7e138c5aac30f040d7');
 const historical=JSON.parse(historicalRaw),activeRaw=files.get('data/manifest.json');assert(Buffer.isBuffer(activeRaw));
 assert.equal(historical.bankVersion,'2026.10.11-editorial.2');assert.equal(historical.sha256,'a752fd3714ca62e0f0067af778a547f430690f60d6c2da831af4330a162c2c18');
 assert.equal(H(files.get('data/'+historical.file)),historical.sha256);
 const rows=[{"path":"docs/corrections/editorial-003.json","bytes":23410,"sha256":"3f20e644742ef546f7867a9149e2b1afdc7d0c20961842ce4db14ce18c5195e9"},{"path":"docs/corrections/editorial-003.md","bytes":1132,"sha256":"60d5b1a649dbf54d3a4e51fa9c65a7ad6bc2690f5a9ba00005a284b05f98f480"},{"path":"docs/corrections/evidence/editorial-003-cycle-1.json","bytes":11235,"sha256":"f7d3bec6e6e56533129ae4997fdecc37552f3f677b0139fa1a388fd3773984e3"},{"path":"data/releases/2026.10.11-editorial.3/bank.json","bytes":6256177,"sha256":"4a262a70eaa25bba13d4dd6b73d01896876d81913e4b19fdfbe406de0683b672"}];
 const editorialPaths=[...files.keys()].filter(p=>/^docs\/corrections\/editorial-\d+\.json$/.test(p)).sort();
 const previousPaths=['docs/corrections/editorial-001.json','docs/corrections/editorial-002.json'];
 if(H(activeRaw)===H(historicalRaw)){
  assert.deepEqual(editorialPaths,previousPaths);for(const row of rows)assert(!files.has(row.path),'unexpected003 bytes under historical manifest');
  return {...projection,files};
 }
 assert.equal(H(activeRaw),'fda7c462d90a57a75346cef169585b1e405573b20f0da9540315a25ba78e2893','only the exact actual003 active manifest may be projected');
 assert.deepEqual(editorialPaths,[...previousPaths,'docs/corrections/editorial-003.json']);
 for(const row of rows){const raw=files.get(row.path);assert(Buffer.isBuffer(raw),'missing exact003 fixture dependency '+row.path);assert.equal(raw.length,row.bytes);assert.equal(H(raw),row.sha256);}
 const ledger=JSON.parse(files.get(rows[0].path)),pkg=JSON.parse(files.get(rows[2].path)),bank=JSON.parse(files.get(rows[3].path)),active=JSON.parse(activeRaw);
 assert.equal(ledger.kind,'accepted_content_editorial');assert.equal(ledger.correctionRoundId,'editorial-003');assert.equal(ledger.status,'closed');assert.equal(ledger.closedAt,'2026-10-11T11:30:53.405Z');
 assert.equal(ledger.baseline.bankVersion,historical.bankVersion);assert.equal(ledger.baseline.bankSha256,historical.sha256);
 assert.equal(ledger.publication.bankVersion,bank.bankVersion);assert.equal(ledger.publication.bankSha256,rows[3].sha256);assert.equal(active.bankVersion,bank.bankVersion);assert.equal(active.sha256,rows[3].sha256);assert.equal(bank.editorialRoundId,'editorial-003');
 assert.deepEqual(ledger.changedQuestionIds,['r002-internet-html-w15','r016-dom-html-s3-w02']);assert.equal(ledger.counts.accepted,2);assert.equal(ledger.counts.pending,0);assert.equal(ledger.counts.newRegular,0);assert.equal(pkg.correctionRoundId,'editorial-003');assert.equal(pkg.cycle,1);
 for(const correction of ledger.corrections){assert.equal(correction.decision,'accepted');assert.equal(correction.cycles.length,1);const cycle=correction.cycles[0];assert.equal(cycle.reviewPackagePath,rows[2].path);assert.equal(cycle.reviewPackageSha256,rows[2].sha256);const item=pkg.items.find(i=>i.correctionId===correction.correctionId);assert(item);assert.deepEqual(bank.questions.find(q=>q.questionId===correction.questionId),item.question);}
 const lines=files.get('PUBLICATION-MANIFEST.txt').toString().split('\n');for(const row of rows)assert.equal(lines.filter(p=>p===row.path).length,1,'exact003 allowlist entry required');
 const removed=new Set(rows.map(row=>row.path));files.set('PUBLICATION-MANIFEST.txt',Buffer.from(lines.filter(p=>!removed.has(p)).join('\n')));for(const p of removed)files.delete(p);
 files.set('data/manifest.json',Buffer.from(historicalRaw));
 return {...projection,files,removedPaths:[...projection.removedPaths,...removed]};
}

const project={ledgers:[],ledgerSources:new Map(),editorials:[],editorialSources:new Map(),editorialReports:new Map(),reviewPackages:new Map(),banks:new Map(),deliveryCheckpointSources:new Map(),synchronizations:[],now:at};
const sourceFiles=new Map();
for(const p of (await read('PUBLICATION-MANIFEST.txt')).toString().split(/\r?\n/).filter(p=>p&&!p.startsWith('#')))sourceFiles.set(p,await read(p));
const fixtureProjection=projectEditorial002Context(projectHistoricalPublications(sourceFiles,PUBLICATION_SYNCHRONIZATIONS)),{files}=fixtureProjection;
for(const [p,raw]of files){
 if(/^docs\/rounds\/round-\d+\.json$/.test(p)){const l=JSON.parse(raw);project.ledgers.push(l);project.ledgerSources.set(l.roundId,raw);}
 if(/^docs\/corrections\/editorial-\d+\.json$/.test(p)){const e=JSON.parse(raw);project.editorials.push(e);project.editorialSources.set(e.correctionRoundId,raw);}
 if(/^data\/releases\/[^/]+\/bank\.json$/.test(p)){const b=JSON.parse(raw);project.banks.set(b.bankVersion,{raw});}
 if(/^docs\/corrections\/evidence\//.test(p))project.reviewPackages.set(p,{raw});
}
for(const e of project.editorials)for(const p of new Set([`docs/corrections/${e.correctionRoundId}.md`,...e.validation.map(v=>v.reportPath).filter(Boolean)]))project.editorialReports.set(p,files.get(p));
project.synchronizations.push(...fixtureProjection.events);
for(const event of project.synchronizations)for(const source of event.rounds)if(source.deliveryProof)project.deliveryCheckpointSources.set(source.roundId,files.get(source.deliveryProof.path));
for(const pin of JSON.parse(files.get('docs/deliveries/normal-backup-root-trust.json')).roots)project.deliveryCheckpointSources.set(pin.roundId,files.get(pin.path));
project.editorialSchema=JSON.parse(files.get('docs/corrections/editorial-ledger.schema.json'));project.publicationState=JSON.parse(files.get('data/publication-state.json'));project.availableFiles=new Set(files.keys());
const prior=project.synchronizations.at(-1),editorial=project.editorials.find(e=>e.correctionRoundId==='editorial-002');
const priorHistory=project.synchronizations.map(e=>({syncId:e.syncId,synchronizedRoundIds:e.rounds.map(s=>s.roundId),publication:{status:'verified',verifiedAt:e.verifiedAt,bankVersion:e.manifest.bankVersion,bankSha256:e.manifest.sha256,commit:e.commit,url:e.siteUrl},evidence:e}));
function refreshEvent(event,contents) {
 event.remoteInventory=[...contents].map(([path,raw])=>({path,bytes:raw.length,sha256:H(raw),gitBlob:blob(raw)}));
 event.tree=normalPublicationTree(event.remoteInventory);event.liveAssets=event.remoteInventory.map(f=>({path:f.path,url:new URL(f.path,event.siteUrl).href,http:200,bytes:f.bytes,sha256:f.sha256}));
 return event;
}
function fixture() {
 const e=structuredClone(editorial),source={kind:'editorial_frozen_ledger',correctionRoundId:e.correctionRoundId,ledgerPath:`docs/corrections/${e.correctionRoundId}.json`,originalLedgerSha256:H(project.editorialSources.get(e.correctionRoundId)),bankVersion:e.publication.bankVersion,bankSha256:e.publication.bankSha256,baseline:{sourceCommit:e.baseline.sourceCommit,bankVersion:e.baseline.bankVersion,bankSha256:e.baseline.bankSha256},originalPublicationStatus:'not_attempted',accepted:2,publishedRevisedRegular:2,newlyPublicRegular:0};
 const manifest=JSON.parse(files.get('data/manifest.json')),event={schemaVersion:1,syncId:'editorial-002',kind:'verified_normal_editorial_publication',previousSynchronizationSha256:H(J(prior)),verifiedAt:new Date(at).toISOString(),repository:prior.repository,commit:'1'.repeat(40),parent:e.baseline.sourceCommit,tree:'1'.repeat(40),commitUrl:`https://github.com/${prior.repository}/commit/${'1'.repeat(40)}`,pages:{runId:1,headSha:'1'.repeat(40),status:'completed',conclusion:'success',url:`https://github.com/${prior.repository}/actions/runs/1`},siteUrl:prior.siteUrl,manifest,manifestSha256:H(files.get('data/manifest.json')),runtimeManifestRaw:files.get('data/manifest.json').toString(),publicationStateRaw:files.get('data/publication-state.json').toString(),counts:{regular:957,written:877,practical:80,testOnly:14,total:971,newlyPublicFromAnchor:0},writtenBySubject:{...prior.writtenBySubject},rounds:[source],remoteInventory:[],liveAssets:[],limitations:['Synthetic disposable test only; never public evidence']};
 const contents=new Map(files),context={...project,editorials:project.editorials.map(v=>v.correctionRoundId===e.correctionRoundId?e:v),editorialSources:new Map(project.editorialSources),banks:new Map(project.banks),reviewPackages:new Map(project.reviewPackages),editorialReports:new Map(project.editorialReports)};
 return {e,event,contents,context};
}
function syncLedger(f) {const raw=J(f.e);f.context.editorialSources.set(f.e.correctionRoundId,raw);f.contents.set(f.event.rounds[0].ledgerPath,raw);f.event.rounds[0].originalLedgerSha256=H(raw);return refreshEvent(f.event,f.contents);}
function semantic(f){return validatePublicationSynchronizationSemantics(refreshEvent(f.event,f.contents),f.context,prior);}
function lifecycle(f){return validateEditorialHistorySemantics(f.context.editorials,{...f.context,schema:project.editorialSchema},helpers,priorHistory);}
function repin(code,event){return code.replace(/export const PUBLICATION_SYNCHRONIZATIONS = Object.freeze\(\[[\s\S]*?\n\]\);/,`export const PUBLICATION_SYNCHRONIZATIONS = Object.freeze([\n${[...project.synchronizations,event].map(e=>`  Object.freeze({path:'docs/publications/${e.syncId}.json',sha256:'${H(J(e))}'})`).join(',\n')}\n]);`);}

test('canonical primitive extraction preserves exact original predicates and wrapper behavior',async()=>{
 const text=(await read('scripts/campaign-validation-primitives.mjs')).toString(),schema=text.slice(text.indexOf('// Deliberately scoped'),text.indexOf('/** Actual published regular unique templates')).replace('export function validateCampaignJsonSchema(value, schema)','export function validateJsonSchema(value, schema = DEFAULT_SCHEMA)');
 assert.equal(H(Buffer.from(schema)),'6a6655701d04cec8e35dae55ce972a0aa92b1731df501710264cca7e5855c8aa');
 assert.equal(H(Buffer.from(text.slice(text.indexOf('/** Actual published regular unique templates')))),'6ef54ec09403b695be86d1e73b662b9ca182e528c9f68c74a488eab4c4537b46');
 const normalSource=(await read('scripts/normal-publication.mjs')).toString(),oldRegistrySelection="...(preserveNormalTrust?[['docs/deliveries/normal-backup-root-trust.json',normalRootTrust,'roots'],['docs/deliveries/normal-backup-chain-trust.json',normalChainTrust,'checkpoints']]:[])",transitiveRegistrySelection="...[['docs/deliveries/normal-backup-root-trust.json',normalRootTrust,'roots'],['docs/deliveries/normal-backup-chain-trust.json',normalChainTrust,'checkpoints']].filter(([path])=>preserveNormalTrust||previousPublication.remoteInventory.some(f=>f.path===path))";
 assert.equal(normalSource.split(transitiveRegistrySelection).length,2);
 assert.equal(H(Buffer.from(normalSource.replace(transitiveRegistrySelection,oldRegistrySelection))),'546281333498176c5dfb7b9528c4dac3934e247b902b759389804f4ef1e66f00','all original normal-publication prefix/hash and old-branch predicates remain byte-identical after reversing the per-registry inventory-presence extension');
 const core=(await read('scripts/editorial-history-core.mjs')).toString();
 assert.equal(H(Buffer.from(core.slice(core.indexOf('export const EDITORIAL_GATES'),core.indexOf('/** Pure predicates only:')))),'13e42cf8d6e13c372efe1255a30b8497cbb98866bdc2da25861156ffbfbc1649');
 assert.equal(H(Buffer.from(core.slice(core.indexOf('/** Fail-closed editorial-only changes')))),'a65f5ca101d1f5a64dc7974283e92705d7e07614a448ee4f62dd1f8696c85a34');
 const roundSchema=JSON.parse(files.get('docs/rounds/round-ledger.schema.json'));
 for(const value of [project.ledgers[0],{},null,{startedAt:'2026-02-30T00:00:00Z'}]){
  assert.deepEqual(validateJsonSchema(value),validateCampaignJsonSchema(value,roundSchema));assert.deepEqual(validateJsonSchema(value,undefined),validateJsonSchema(value));
  for(const schema of [true,false,{},null,{$ref:'#/missing'},{type:'invented'},{format:'email'},project.editorialSchema])assert.deepEqual(validateJsonSchema(value,schema),validateCampaignJsonSchema(value,schema));
 }
 for(const when of ['bad','2026-10-02T10:30:00Z','2026-10-02T15:00:00Z','2026-10-03T00:00:00+09:00','2026-10-16T11:00:00Z','2026-10-16T14:30:00Z'])assert.equal(wrapperSchedule(when),nextScheduledRoundAt(when));
 const bank=JSON.parse(project.banks.get(editorial.publication.bankVersion).raw);assert.deepEqual(wrapperCoverage(bank),regularCoverage(bank));assert.equal(regularCoverage(bank).mockEligible,true);
});

test('editorial sibling semantics preserve all source, envelope, transition and lifecycle guards',async()=>{
 project.publicationSelections=validatePublicationSelectionSnapshot([...files].map(([path,raw])=>({path,raw})),{now:at});
 const f=fixture(),pass=semantic(f);assert.deepEqual(pass,{ok:true,currentReleaseClearance:false,canStartNewContent:false});assert.equal(lifecycle(f).ok,true,lifecycle(f).errors.join('\n'));
 assert.equal(isEditorialPublication(f.event),true);assert.equal(isNormalPublication(f.event),false);assert.equal(isNormalChainPublication(f.event),false);assert.equal(requiresSynchronizationDeliveryDependencies(f.event),false);
 assert.equal(validatePublicationSynchronizations([...project.synchronizations,f.event],f.context).ok,false,'semantic success must not grant real production trust');
 for(const [name,mutate]of [
  ['wrong owner',f=>f.event.rounds[0].correctionRoundId='editorial-003'],['wrong source kind',f=>f.event.rounds[0].kind='normal_frozen_ledger'],['round alias',f=>f.event.rounds[0].roundId='editorial-002'],['duplicate source',f=>f.event.rounds.push(f.event.rounds[0])],['wrong path',f=>f.event.rounds[0].ledgerPath='docs/rounds/editorial-002.json'],
  ['fabricated delivery',f=>f.event.rounds[0].deliveryProof={path:'fake',sha256:'a'.repeat(64)}],['fabricated artifact',f=>f.event.rounds[0].artifactSha256='a'.repeat(64)],['wrong ledger hash',f=>f.event.rounds[0].originalLedgerSha256='a'.repeat(64)],['wrong bank hash',f=>f.event.rounds[0].bankSha256='a'.repeat(64)],['wrong accepted',f=>f.event.rounds[0].accepted++],['wrong revised',f=>f.event.rounds[0].publishedRevisedRegular=0],['new-question inflation',f=>f.event.rounds[0].newlyPublicRegular=2],['wrong count',f=>f.event.counts.regular++],['wrong coverage',f=>f.event.writtenBySubject.s4++],
  ['wrong parent',f=>f.event.parent='a'.repeat(40)],['wrong Pages head',f=>f.event.pages.headSha='a'.repeat(40)],['failed Pages',f=>f.event.pages.conclusion='failure'],['cutoff',f=>f.event.verifiedAt='2026-10-17T00:00:00Z'],['future closure',f=>f.event.verifiedAt=f.e.startedAt],['frozen bytes',f=>f.event.publicationStateRaw='{"finalized":true}'],['manifest mismatch',f=>f.event.manifest.bankVersion='missing'],['private extra',f=>f.event.extra=true],
  ...['verified_normal_publication','verified_normal_chain_publication','verified_reconciled_normal_chain_publication','verified_cumulative_publication',undefined].map(kind=>['event disguise '+kind,f=>f.event.kind=kind]),
  ['missing ledger raw',f=>f.context.editorialSources.delete('editorial-002')],['wrong collection',f=>{f.context.ledgers=[...f.context.ledgers,f.e];f.context.editorials=f.context.editorials.filter(e=>e!==f.e);}],['duplicate owner',f=>f.context.editorials.push(f.e)],['missing as-of predecessor',f=>f.context.editorials=f.context.editorials.filter(e=>e.correctionRoundId!=='editorial-001')],['missing report',f=>f.context.editorialReports.delete('docs/corrections/editorial-002.md')],['missing package',f=>f.context.reviewPackages.delete('docs/corrections/evidence/editorial-002-cycle-1.json')],['tampered package',f=>f.context.reviewPackages.set('docs/corrections/evidence/editorial-002-cycle-1.json',{raw:Buffer.from('{}')})],
  ['missing trust',f=>f.contents.delete('docs/quarantines/trust.json')],['missing previous event',f=>f.contents.delete(`docs/publications/${prior.syncId}.json`)]
 ]){const f=fixture();mutate(f);assert.throws(()=>semantic(f),undefined,name);}
 for(const mutate of [e=>e.status='running',e=>e.counts.pending=1,e=>e.publication.blockers=['blocked'],e=>e.publication.status='verified',e=>e.corrections[0].publishedBankVersion=e.publication.bankVersion,e=>e.startedAt=prior.verifiedAt,e=>e.startedAt='2026-10-11T02:00:00Z']){const f=fixture();mutate(f.e);syncLedger(f);assert.throws(()=>semantic(f));}
 for(const mutate of [e=>e.corrections[0].authorId=e.corrections[0].cycles[0].gates.blindSolve.reviewerId,e=>e.corrections[0].cycles[0].gates.sourceCheck.result='not_run',e=>e.corrections[0].attemptCount=4,e=>e.decisionDeadline='2026-10-11T07:00:00Z',e=>e.corrections[0].priorAcceptedRef.questionRevision++,e=>e.corrections[0].priorAcceptedRef.bankSha256='a'.repeat(64),e=>e.corrections[0].cycles[0].finishedAt='2026-10-11T07:00:00Z']){const f=fixture();mutate(f.e);assert.equal(lifecycle(f).ok,false,'full lifecycle predicate cannot be replaced by transition-only admission');}
 const baseline=JSON.parse(project.banks.get(editorial.baseline.bankVersion).raw),bank=JSON.parse(project.banks.get(editorial.publication.bankVersion).raw);
 for(const mutate of [b=>b.questions.pop(),b=>b.options.pop(),b=>b.sources[0].title+=' changed',b=>b.questions.find(q=>q.testOnly).stem+=' changed',b=>b.questions.find(q=>q.questionId===editorial.changedQuestionIds[0]).learningGoalRevision++,b=>b.questions.find(q=>q.questionId===editorial.changedQuestionIds[0]).links[0].role='distractor',b=>b.questions.find(q=>q.questionId===editorial.changedQuestionIds[1]).explanation=baseline.questions.find(q=>q.questionId===editorial.changedQuestionIds[1]).explanation,b=>b.sources.push({...b.sources[0],id:'unapproved-source'})]){const changed=structuredClone(bank),errors=[];mutate(changed);validateEditorialTransition(editorial,baseline,changed,{banks:project.banks,regularCoverage,now:at},m=>errors.push(m));assert.ok(errors.length);}
 const good=fixture();refreshEvent(good.event,good.contents);
 for(const mutate of [e=>e.tree='a'.repeat(40),e=>e.remoteInventory[0].gitBlob='a'.repeat(40),e=>e.liveAssets[0].sha256='a'.repeat(64),e=>e.liveAssets.push(e.liveAssets[0]),e=>e.liveAssets=e.liveAssets.filter(f=>f.path!=='docs/corrections/editorial-002.md'),e=>e.liveAssets=e.liveAssets.filter(f=>f.path!=='docs/corrections/evidence/editorial-002-cycle-1.json')]){const event=structuredClone(good.event);mutate(event);assert.throws(()=>validatePublicationSynchronizationSemantics(event,good.context,prior));}
});

test('only disposable pinned sibling history activates editorial identity and ignores caller authority',async t=>{
 project.publicationSelections??=validatePublicationSelectionSnapshot([...files].map(([path,raw])=>({path,raw})),{now:at});
 const f=fixture();refreshEvent(f.event,f.contents);const dir=await fs.mkdtemp(path.join(os.tmpdir(),'editorial-publication-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.cp(root,dir,{recursive:true});
 for(const p of fixtureProjection.removedPaths)await fs.rm(path.join(dir,p));
 for(const p of ['PUBLICATION-MANIFEST.txt','scripts/publication-sync.mjs','data/manifest.json'])await fs.writeFile(path.join(dir,p),files.get(p));
 const code=files.get('scripts/publication-sync.mjs').toString();await fs.writeFile(path.join(dir,'scripts/publication-sync.mjs'),repin(code,f.event));
 const api=await import(pathToFileURL(path.join(dir,'scripts/publication-sync.mjs')).href),selection=await import(pathToFileURL(path.join(dir,'scripts/publication-selection.mjs')).href);f.context.publicationSelections=await selection.loadPublicationSelections(dir,{now:at});
 const records=[...project.synchronizations,f.event],result=api.validatePublicationSynchronizations(records,f.context);assert.equal(result.ok,true,result.errors.join('\n'));
 assert.deepEqual(result.history.slice(0,-1),priorHistory,'ordinary/selected historical projections remain unchanged');
 assert.deepEqual(result.history.at(-1).synchronizedRoundIds,[]);assert.deepEqual(result.history.at(-1).synchronizedEditorialIds,['editorial-002']);assert.equal(result.history.at(-1).publication.bankVersion,editorial.publication.bankVersion);
 assert.deepEqual(project.editorialSources.get('editorial-002'),J(editorial));assert.equal(api.resolveSynchronizedArtifacts([{}],{...f.context,synchronizations:records}).resolvedArtifacts.size,0);assert.throws(()=>api.validateSynchronizationDeliveryProof(f.event,f.event.rounds[0],project.editorialSources.get('editorial-002')),/delivery proof/);
 assert.equal(api.validatePublicationSynchronizations(records,{...f.context,now:at-1}).history.some(h=>h.syncId===f.event.syncId),false);
 const tamperedProofs=new Map(f.context.deliveryCheckpointSources),proofId=priorHistory.flatMap(h=>h.evidence.rounds).find(s=>s.deliveryProof).roundId;tamperedProofs.set(proofId,Buffer.from('{}'));
 for(const context of [{...f.context,deliveryCheckpointSources:new Map()},{...f.context,deliveryCheckpointSources:tamperedProofs}])assert.equal(api.validatePublicationSynchronizations(records,context).ok,false,'missing real dependencies cannot be replaced by a prior event hash');
 for(const sequence of [records.slice(1),[...records.slice(0,-2),records.at(-1),records.at(-2)]])assert.equal(api.validatePublicationSynchronizations(sequence,{...f.context,priorHistory:result.history,verified:true,editorialHelpers:helpers,editorialSchema:true}).ok,false);
 // A synthetic re-pin may exercise the real admission code, but only in this
 // disposable module. Malicious callbacks/schema cannot bypass the canonical core.
 const bad=fixture();bad.e.corrections[0].authorId=bad.e.corrections[0].cycles[0].gates.blindSolve.reviewerId;syncLedger(bad);bad.context.publicationSelections=f.context.publicationSelections;
 const testModule=path.join(dir,'scripts/editorial-malformed-fixture.mjs');await fs.writeFile(testModule,repin(code,bad.event));const rejected=await import(pathToFileURL(testModule).href);
 const denied=rejected.validatePublicationSynchronizations([...project.synchronizations,bad.event],{...bad.context,editorialSchema:true,editorialHelpers:{validateJsonSchema:()=>[],regularCoverage:()=>editorial.coverageAfter,nextScheduledRoundAt:()=>Infinity,FINAL_DECISION_AT:Infinity},priorHistory:result.history,verified:true});assert.equal(denied.ok,false);assert.match(denied.errors.join('\n'),/reviewer|independent/);
});


test('successive ordinary normal payloads preserve editorial evidence and both normal trust prefixes',async()=>{
 // Pure envelope/transition fixture only: no synthetic registration, loader,
 // synchronization prefix replay or current-release clearance is introduced.
 project.publicationSelections??=validatePublicationSelectionSnapshot([...files].map(([path,raw])=>({path,raw})),{now:at});
 const f=fixture(),previous=refreshEvent(f.event,f.contents),baseline=JSON.parse(project.banks.get(editorial.publication.bankVersion).raw),bank=structuredClone(baseline);
 Object.assign(bank,{bankVersion:'synthetic-normal-after-editorial',releasedAt:'2026-10-11T01:03:00Z',changeSummary:'Synthetic later-normal preservation fixture only'});delete bank.editorialRoundId;
 const bankRaw=J(bank),bankPath=`data/releases/${bank.bankVersion}/bank.json`,ledger=structuredClone(project.ledgers.find(l=>l.roundId==='round-040'));
 Object.assign(ledger,{roundId:'round-042',startedAt:'2026-10-11T01:01:00Z',closedAt:'2026-10-11T01:02:00Z',decisionDeadline:'2026-10-11T02:00:00Z',candidates:[],validation:[]});
 ledger.baseline={sourceCommit:previous.commit,bankVersion:baseline.bankVersion,bankSha256:previous.manifest.sha256,regularWrittenBySubject:regularCoverage(baseline).regularWrittenBySubject,regularPractical:80};
 ledger.publication={status:'not_attempted',commit:null,bankVersion:bank.bankVersion,bankSha256:H(bankRaw),verifiedAt:null,url:null,blockers:[]};
 const ledgerPath='docs/rounds/round-042.json',ledgerRaw=J(ledger),manifest={...previous.manifest,bankVersion:bank.bankVersion,releasedAt:bank.releasedAt,file:`releases/${bank.bankVersion}/bank.json`,sha256:H(bankRaw),changeSummary:bank.changeSummary},manifestRaw=J(manifest);
 const source={kind:'normal_frozen_ledger',roundId:ledger.roundId,ledgerPath,originalLedgerSha256:H(ledgerRaw),bankVersion:bank.bankVersion,bankSha256:H(bankRaw),baseline:{sourceCommit:previous.commit,bankVersion:baseline.bankVersion,bankSha256:previous.manifest.sha256},accepted:0,originalPublicationStatus:'not_attempted',quarantined:0,eligible:0,newlyPublicRegular:0};
 const event={...structuredClone(previous),syncId:'synthetic-normal-after-editorial',kind:'verified_normal_publication',previousSynchronizationSha256:H(J(previous)),verifiedAt:'2026-10-11T01:04:00Z',commit:'2'.repeat(40),parent:previous.commit,commitUrl:`https://github.com/${previous.repository}/commit/${'2'.repeat(40)}`,pages:{runId:2,headSha:'2'.repeat(40),status:'completed',conclusion:'success',url:`https://github.com/${previous.repository}/actions/runs/2`},manifest,manifestSha256:H(manifestRaw),runtimeManifestRaw:manifestRaw.toString(),rounds:[source]};
 const contents=new Map(f.contents);contents.set(bankPath,bankRaw);contents.set(ledgerPath,ledgerRaw);contents.set('docs/rounds/round-042.md',Buffer.from('Synthetic fixture only\n'));contents.set(`docs/publications/${previous.syncId}.json`,J(previous));contents.set('data/manifest.json',manifestRaw);contents.set('PUBLICATION-MANIFEST.txt',Buffer.from([...contents.keys()].sort().join('\n')+'\n'));
 const banks=new Map(project.banks);banks.set(bank.bankVersion,{raw:bankRaw});
 function envelope(payload,{publication=event,owner=ledger,ownerRaw=ledgerRaw,predecessor=previous}={}){
  const e=refreshEvent(structuredClone(publication),payload),inventory=new Map(e.remoteInventory.map(({gitBlob,...entry})=>[entry.path,entry]));
  validateNormalPublication(e,{ledgers:[owner],ledgerSources:new Map([[owner.roundId,ownerRaw]]),banks,inventory,previousPublication:predecessor});return e;
 }
 const accepted=envelope(contents);assert.equal(isNormalPublication(accepted),true);assert.equal(isEditorialPublication(accepted),false);
 validateNormalBankTransition(accepted,ledger,bank,baseline,{eligibleCandidateIds:[]},project.publicationSelections);
 for(const [registry,key]of [['docs/deliveries/normal-backup-root-trust.json','roots'],['docs/deliveries/normal-backup-chain-trust.json','checkpoints']]){
  const original=JSON.parse(contents.get(registry));assert.ok(original[key].length>0,'rollback fixture requires an actual nonempty predecessor prefix');
  const missing=new Map(contents);missing.delete(registry);assert.throws(()=>envelope(missing),/trust prefixes/,`later normal cannot omit ${registry}`);
  const rollback=new Map(contents);rollback.set(registry,J({...original,[key]:[]}));assert.throws(()=>envelope(rollback),/trust prefixes/,`later normal cannot roll back ${registry}`);
 }
 for(const p of ['docs/corrections/editorial-002.json','docs/corrections/editorial-002.md','docs/corrections/evidence/editorial-002-cycle-1.json']){const missing=new Map(contents);missing.delete(p);assert.throws(()=>envelope(missing),/immutable prior publication history/,`later normal preserves ${p}`);}
 // A second ordinary successor must inherit each registry from the exact
 // preceding inventory, without relying on any editorial event-name heuristic.
 const secondBank=structuredClone(bank);Object.assign(secondBank,{bankVersion:'synthetic-second-normal-after-editorial',releasedAt:'2026-10-11T01:07:00Z',changeSummary:'Synthetic second normal preservation fixture only'});
 const secondBankRaw=J(secondBank),secondLedger=structuredClone(ledger);Object.assign(secondLedger,{roundId:'round-043',startedAt:'2026-10-11T01:05:00Z',closedAt:'2026-10-11T01:06:00Z'});
 secondLedger.baseline={...ledger.baseline,sourceCommit:accepted.commit,bankVersion:bank.bankVersion,bankSha256:H(bankRaw)};secondLedger.publication={...ledger.publication,bankVersion:secondBank.bankVersion,bankSha256:H(secondBankRaw)};
 const secondLedgerRaw=J(secondLedger),secondLedgerPath='docs/rounds/round-043.json',secondManifest={...manifest,bankVersion:secondBank.bankVersion,releasedAt:secondBank.releasedAt,file:`releases/${secondBank.bankVersion}/bank.json`,sha256:H(secondBankRaw),changeSummary:secondBank.changeSummary},secondManifestRaw=J(secondManifest);
 const secondSource={...source,roundId:secondLedger.roundId,ledgerPath:secondLedgerPath,originalLedgerSha256:H(secondLedgerRaw),bankVersion:secondBank.bankVersion,bankSha256:H(secondBankRaw),baseline:{sourceCommit:accepted.commit,bankVersion:bank.bankVersion,bankSha256:H(bankRaw)}};
 const secondEvent={...event,syncId:'synthetic-second-normal-after-editorial',previousSynchronizationSha256:H(J(accepted)),verifiedAt:'2026-10-11T01:08:00Z',commit:'3'.repeat(40),parent:accepted.commit,commitUrl:`https://github.com/${accepted.repository}/commit/${'3'.repeat(40)}`,pages:{runId:3,headSha:'3'.repeat(40),status:'completed',conclusion:'success',url:`https://github.com/${accepted.repository}/actions/runs/3`},manifest:secondManifest,manifestSha256:H(secondManifestRaw),runtimeManifestRaw:secondManifestRaw.toString(),rounds:[secondSource]};
 const secondContents=new Map(contents);secondContents.set(`data/releases/${secondBank.bankVersion}/bank.json`,secondBankRaw);secondContents.set(secondLedgerPath,secondLedgerRaw);secondContents.set('docs/rounds/round-043.md',Buffer.from('Synthetic fixture only\n'));secondContents.set(`docs/publications/${accepted.syncId}.json`,J(accepted));secondContents.set('data/manifest.json',secondManifestRaw);secondContents.set('PUBLICATION-MANIFEST.txt',Buffer.from([...secondContents.keys()].sort().join('\n')+'\n'));banks.set(secondBank.bankVersion,{raw:secondBankRaw});
 const secondContext={publication:secondEvent,owner:secondLedger,ownerRaw:secondLedgerRaw,predecessor:accepted},secondAccepted=envelope(secondContents,secondContext);
 assert.equal(isNormalPublication(secondAccepted),true);validateNormalBankTransition(secondAccepted,secondLedger,secondBank,bank,{eligibleCandidateIds:[]},project.publicationSelections);
 for(const [registry,key]of [['docs/deliveries/normal-backup-root-trust.json','roots'],['docs/deliveries/normal-backup-chain-trust.json','checkpoints']]){
  const original=JSON.parse(secondContents.get(registry)),missing=new Map(secondContents);missing.delete(registry);assert.throws(()=>envelope(missing,secondContext),/trust prefixes/,`second ordinary successor cannot omit ${registry}`);
  const rollback=new Map(secondContents);rollback.set(registry,J({...original,[key]:[]}));assert.throws(()=>envelope(rollback,secondContext),/trust prefixes/,`second ordinary successor cannot roll back ${registry}`);
 }
 // Synthetic historical-absence compatibility only. These altered predecessor
 // inventories are envelope inputs, never claimed to be authenticated history.
 const registryPaths=['docs/deliveries/normal-backup-root-trust.json','docs/deliveries/normal-backup-chain-trust.json'];
 for(const absent of [[registryPaths[0]],[registryPaths[1]],registryPaths]){
  const olderContents=new Map(contents);for(const p of absent)olderContents.delete(p);olderContents.set('PUBLICATION-MANIFEST.txt',Buffer.from([...olderContents.keys()].sort().join('\n')+'\n'));
  const olderPrevious=refreshEvent(structuredClone(accepted),olderContents),payload=new Map(secondContents);for(const p of absent)payload.delete(p);payload.set(`docs/publications/${olderPrevious.syncId}.json`,J(olderPrevious));payload.set('PUBLICATION-MANIFEST.txt',Buffer.from([...payload.keys()].sort().join('\n')+'\n'));
  const compatible=envelope(payload,{...secondContext,predecessor:olderPrevious,publication:{...secondEvent,previousSynchronizationSha256:H(J(olderPrevious))}});
  for(const p of registryPaths.filter(p=>!absent.includes(p)))assert.deepEqual(compatible.remoteInventory.find(f=>f.path===p),olderPrevious.remoteInventory.find(f=>f.path===p),'each still-present registry remains exact when its sibling historically did not exist');
 }
});
