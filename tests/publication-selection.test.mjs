import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {FREEZE_AT} from '../src/domain.js';
import {withBankParsingSession} from '../scripts/prepublication-quarantine.mjs';
import {PUBLICATION_SELECTION_PATH,PUBLICATION_SELECTION_PIN,validatePublicationSelectionRecord,validatePublicationSelectionSnapshot,loadPublicationSelections,resolvePublicationIdentity,assertNoPublicationExcludedContent,assertPublicationSelectionReference,publicationSelectionFiles} from '../scripts/publication-selection.mjs';

const root=path.resolve(import.meta.dirname,'..');
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const originalPath='data/releases/2026.10.10-regular.41/bank.json';
const selectedPath='data/releases/2026.10.10-regular.41-selection.1/bank.json';
const baselinePath='data/releases/2026.10.09-regular.39/bank.json';
const ledgerPath='docs/rounds/round-041.json';
let record,ledger,original,selected,baseline,files,now;

before(async()=>{
  const paths=[PUBLICATION_SELECTION_PATH,ledgerPath,originalPath,selectedPath,baselinePath,'scripts/publication-selection.mjs','data/manifest.json'];
  files=await Promise.all(paths.map(async p=>({path:p,raw:await fs.readFile(path.join(root,p))})));
  // A deliberately minimal complete dependency snapshot binds the real immutable
  // bytes. It never substitutes fabricated ledger or publication evidence.
  files.push({path:'PUBLICATION-MANIFEST.txt',raw:Buffer.from([...paths,'PUBLICATION-MANIFEST.txt'].sort().join('\n')+'\n')});
  record=JSON.parse(rawAt(PUBLICATION_SELECTION_PATH));ledger=JSON.parse(rawAt(ledgerPath));
  original=JSON.parse(rawAt(originalPath));selected=JSON.parse(rawAt(selectedPath));baseline=JSON.parse(rawAt(baselinePath));
  now=Date.parse(record.selectedBank.releasedAt)+60_000;
});
const rawAt=(p,values=files)=>values.find(f=>f.path===p)?.raw;
const replace=(p,raw,values=files)=>values.map(f=>f.path===p?{path:p,raw}:f);
const authority=()=>validatePublicationSelectionSnapshot(files,{now});
function proposal(mutator,bankMutator) {
  const changed=structuredClone(record);let values=files;
  if(bankMutator){const bank=structuredClone(selected);bankMutator(bank);const raw=json(bank);changed.selectedBank.sha256=hash(raw);values=replace(selectedPath,raw);}
  mutator?.(changed);return validatePublicationSelectionRecord(json(changed),values,{now});
}
async function fixtureRoot(operation) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'publication-selection-'));
  try{for(const file of files){await fs.mkdir(path.dirname(path.join(directory,file.path)),{recursive:true});await fs.writeFile(path.join(directory,file.path),file.raw);}return await operation(directory);}
  finally{await fs.rm(directory,{recursive:true,force:true});}
}

test('exact reviewed selection resolves unchanged original history and one eligible candidate',()=>withBankParsingSession(root,async()=>{
  assert.match(PUBLICATION_SELECTION_PIN.sha256??'',/^[a-f0-9]{64}$/,'positive authority requires the actual independently reviewed pin; pending draft is not approval');
  assert.equal(hash(rawAt(PUBLICATION_SELECTION_PATH)),PUBLICATION_SELECTION_PIN.sha256);
  const checked=authority(),identity=resolvePublicationIdentity(ledger,checked);
  assert.equal(Object.isFrozen(checked),true);assert.equal(Object.isFrozen(checked.selections[0].retained),true);
  assert.deepEqual(identity.originalLedger,ledger);assert.equal(identity.originalLedgerSha256,hash(rawAt(ledgerPath)));
  assert.equal(ledger.counts.accepted,3);assert.equal(ledger.publication.bankVersion,original.bankVersion);
  assert.equal(identity.effectiveBankVersion,selected.bankVersion);assert.equal(identity.effectiveBankSha256,hash(rawAt(selectedPath)));
  assert.deepEqual(identity.eligibleCandidateIds,['r041-primary-s4-w01']);
  assert.deepEqual(identity.excludedReservedCandidateIds,['r041-primary-s2-w01','r041-primary-s3-w01']);
  assert.deepEqual(identity.counts,{accepted:3,quarantined:0,publicationExcluded:2,eligible:1});
  assert.equal(assertNoPublicationExcludedContent(selected,checked),selected);
  assert.equal(assertNoPublicationExcludedContent(selected,checked,rawAt(selectedPath)),selected);
  assert.equal(assertPublicationSelectionReference(identity.selectionReference,identity),identity);
  assert.equal(selected.questions.length,baseline.questions.length+1);
  assert.deepEqual(selected.questions.slice(0,baseline.questions.length),baseline.questions);
  assert.equal(hash(rawAt(ledgerPath)),'a76c5fe74e7f7b0fc1531d853962b8613d4131eb20508465a19894d362679cd6');
  assert.equal(hash(rawAt(originalPath)),'e79345d85a7a296c1405404d1773d3d953fa39a1734d6831b01317e24184d9d7');
}));

test('pure proposal validation reports semantic success without creating authority',()=>withBankParsingSession(root,async()=>{
  const result=validatePublicationSelectionRecord(rawAt(PUBLICATION_SELECTION_PATH),files,{now});
  assert.deepEqual(result,{ok:true,errors:[],status:'proposal_requires_independent_pin',authorized:false});
  assert.throws(()=>resolvePublicationIdentity(ledger,result),/private selection authority/);
  for(const fake of [true,false,{},new Map(),{selections:[record]},structuredClone(authority())])assert.throws(()=>resolvePublicationIdentity(ledger,fake),/private selection authority/);
  assert.throws(()=>resolvePublicationIdentity(ledger),/validated publication selection/);
}));

test('legacy unselected identities remain ordinary but current reviewed authority cannot be omitted',()=>{
  const old={ledgerSchemaVersion:1,roundId:'round-001',baseline:{sourceCommit:'a'.repeat(40)},publication:{bankVersion:'old',bankSha256:'b'.repeat(64)},candidates:[{candidateId:'old-candidate',decision:'accepted'}]};
  const identity=resolvePublicationIdentity(old);
  assert.equal(identity.selectionReference,null);assert.equal(identity.effectiveBankVersion,'old');
  assert.deepEqual(identity.eligibleCandidateIds,['old-candidate']);
  assert.equal(assertPublicationSelectionReference(undefined,identity),identity);
  assert.throws(()=>validatePublicationSelectionSnapshot([{path:'scripts/publication-selection.mjs',raw:rawAt('scripts/publication-selection.mjs')},{path:'data/manifest.json',raw:json({bankVersion:'older',sha256:'a'.repeat(64)})}],{now}),/missing or changed reviewed selection/);
  assert.throws(()=>validatePublicationSelectionSnapshot([],{now}),/missing or changed reviewed selection/);
  assert.equal(assertNoPublicationExcludedContent(baseline,null),baseline);
  assert.throws(()=>assertPublicationSelectionReference({path:PUBLICATION_SELECTION_PATH,sha256:'a'.repeat(64)},identity),/ordinary release/);
});

test('raw selection trust rejects missing, changed, unknown, duplicate and unlisted files',()=>withBankParsingSession(root,async()=>{
  assert.throws(()=>validatePublicationSelectionSnapshot(files.filter(f=>f.path!==PUBLICATION_SELECTION_PATH),{now}),/missing or changed reviewed selection/);
  assert.throws(()=>validatePublicationSelectionSnapshot(replace(PUBLICATION_SELECTION_PATH,Buffer.concat([rawAt(PUBLICATION_SELECTION_PATH),Buffer.from(' ')])),{now}),/missing or changed reviewed selection/);
  assert.throws(()=>validatePublicationSelectionSnapshot([...files,{path:'docs/publication-selections/round-041-selection-002.json',raw:rawAt(PUBLICATION_SELECTION_PATH)}],{now}),/unknown or unreviewed/);
  assert.throws(()=>validatePublicationSelectionSnapshot([...files,files[0]],{now}),/duplicate snapshot/);
  assert.throws(()=>validatePublicationSelectionSnapshot(replace('PUBLICATION-MANIFEST.txt',Buffer.from(rawAt('PUBLICATION-MANIFEST.txt').toString().replace(PUBLICATION_SELECTION_PATH+'\n',''))),{now}),/missing or unlisted/);
  for(const p of [ledgerPath,originalPath,baselinePath,selectedPath]){
    assert.throws(()=>validatePublicationSelectionSnapshot(files.filter(f=>f.path!==p),{now}),/missing or unlisted/);
    assert.throws(()=>validatePublicationSelectionSnapshot(replace(p,Buffer.concat([rawAt(p),Buffer.from(' ')])),{now}),/missing or changed/);
  }
  assert.throws(()=>validatePublicationSelectionSnapshot([...files,{path:'../selection.json',raw:Buffer.from('{}')}],{now}),/unsafe/);
}));

test('semantic proposal negatives reach partition, target, evidence and chronology gates',()=>withBankParsingSession(root,async()=>{
  const cases=[
    ['incomplete partition',r=>{r.excluded.pop();},/retain exactly/],
    ['overlapping partition',r=>{r.excluded[0]=structuredClone(r.retained[0]);},/retain exactly/],
    ['unapproved retained identity',r=>{r.retained[0].candidateId='r041-primary-s2-w01';},/retain exactly/],
    ['changed retained revision',r=>{r.retained[0].revision++;},/revision or complete decision/],
    ['changed candidate hash',r=>{r.retained[0].candidateSha256='a'.repeat(64);},/revision or complete decision/],
    ['changed content hash',r=>{r.retained[0].contentSha256='a'.repeat(64);},/content, collision fingerprint/],
    ['changed collision hash',r=>{r.excluded[0].identityFreeSha256='a'.repeat(64);},/content, collision fingerprint/],
    ['changed option membership',r=>{r.excluded[0].exclusiveOptionIds.pop();},/content, collision fingerprint/],
    ['nonterminal publication disposition',r=>{r.excluded[0].publicationDisposition='pending';},/terminal publication selection/],
    ['invented quarantine',r=>{r.excluded[0].reasonCode='quarantined';},/terminal publication selection/],
    ['reused original bank version',r=>{r.selectedBank.version=original.bankVersion;},/unique new version/],
    ['wrong baseline commit',r=>{r.baseline.sourceCommit='a'.repeat(40);},/reviewed exact original/],
    ['backdated decision',r=>{r.decidedAt=ledger.startedAt;},/decision must follow/],
    ['late decision',r=>{r.decidedAt='2026-10-10T14:00:00.001Z';},/decision must follow/],
    ['future observation',r=>{r.nonDeliveryEvidence.checkedAt='2026-10-10T14:01:00Z';},/pre-delivery observation/],
    ['bad original producer terminal digest',r=>{r.originalProducer.terminalSha256='0'.repeat(64);},/producer completion/],
    ['incomplete registry observation',r=>{r.nonDeliveryEvidence.registrySnapshots=r.nonDeliveryEvidence.registrySnapshots.filter(v=>!v.path.endsWith('normal-backup-root-trust.json'));},/scope is incomplete/],
    ['counterfeit registry hash',r=>{r.nonDeliveryEvidence.registrySnapshots[0].sha256='a'.repeat(64);},/registry raw bytes/],
    ['original already registered',r=>{const v=r.nonDeliveryEvidence.registrySnapshots[0];v.raw=JSON.stringify({roundId:'round-041'});v.sha256=hash(v.raw);},/already present/],
    ['unexpected boolean authority',r=>{r.approved=true;},/unexpected record fields/]
  ];
  for(const [name,mutate,expected] of cases){const result=proposal(mutate);assert.equal(result.ok,false,name);assert.match(result.errors.join('; '),expected,name);assert.equal(result.authorized,false,name);}
  assert.equal(validatePublicationSelectionRecord(rawAt(PUBLICATION_SELECTION_PATH),files,{now:FREEZE_AT}).ok,false);
  assert.equal(validatePublicationSelectionRecord(rawAt(PUBLICATION_SELECTION_PATH),files,{now:Date.parse(record.decidedAt)-1}).ok,false);
}));

test('semantic projection negatives reject changed retained content and baseline despite a recomputed proposed bank hash',()=>withBankParsingSession(root,async()=>{
  const changes=[
    ['retained stem',b=>{b.questions.at(-1).stem+=' changed';},/exact retained/],
    ['retained revision',b=>{b.questions.at(-1).revision++;},/exact retained/],
    ['retained answer',b=>{b.questions.at(-1).links[0].role='correct';},/exact retained/],
    ['retained option',b=>{b.options.at(-1).explanation+=' changed';},/exact retained/],
    ['baseline deletion',b=>{b.questions.shift();},/unchanged baseline/],
    ['baseline mutation',b=>{b.questions[0].stem+=' changed';},/unchanged baseline/],
    ['baseline metadata',b=>{b.examinerInstructions+=' changed';},/baseline metadata/],
    ['retained source mutation',b=>{b.sources.at(-1).evidence+=' changed';},/source closure/],
    ['excluded source reintroduction',b=>{b.sources.push(original.sources.find(s=>s.id==='r040-primary-src-http421'));},/source closure/],
    ['counts forged',b=>{b.contentCounts.regularWrittenBySubject.s2++;},/content counts/]
  ];
  for(const [name,mutate,expected] of changes){const result=proposal(null,mutate);assert.equal(result.ok,false,name);assert.match(result.errors.join('; '),expected,name);}
}));

test('runtime and explicit input guards reserve excluded identities, renamed questions and orphan options',()=>withBankParsingSession(root,async()=>{
  const checked=authority(),excluded=original.questions.find(q=>q.questionId==='r041-primary-s2-w01');
  assert.throws(()=>assertNoPublicationExcludedContent(original,checked),/retired original/);
  assert.throws(()=>assertNoPublicationExcludedContent(original,null),/complete selection authority/);
  assert.throws(()=>assertNoPublicationExcludedContent(selected,null),/complete selection authority/);
  const changedSelected=structuredClone(selected);changedSelected.questions.at(-1).stem+=' changed';
  assert.throws(()=>assertNoPublicationExcludedContent(changedSelected,checked),/exact reviewed content and raw identity/);
  assert.throws(()=>assertNoPublicationExcludedContent(selected,checked,Buffer.concat([rawAt(selectedPath),Buffer.from(' ')])),/exact reviewed content and raw identity/);
  for(const identityKey of ['questionId','templateId','learningGoalId']){
    const bank=structuredClone(selected);bank.bankVersion='future.candidate';bank.questions.at(-1)[identityKey]=excluded[identityKey];
    assert.throws(()=>assertNoPublicationExcludedContent(bank,checked),/reserved identity/);
  }
  const alias=structuredClone(selected),question=structuredClone(excluded);alias.bankVersion='future.candidate';alias.roundId='round-042';
  question.questionId='renamed-question';question.templateId='renamed-template';question.learningGoalId='renamed-goal';question.revision=99;question.reviewNote='unrelated metadata';
  const options=question.links.map((link,i)=>{const option=structuredClone(original.options.find(o=>o.optionId===link.optionId));option.optionId=`renamed-option-${i}`;option.revision=99;option.memberQuestionIds=[question.questionId];link.optionId=option.optionId;link.optionRevision=99;return option;});
  question.links.reverse();alias.questions.push(question);alias.options.push(...options);
  assert.throws(()=>assertNoPublicationExcludedContent(alias,checked),/renamed exact collision|renamed or reordered/);
  assert.throws(()=>assertNoPublicationExcludedContent(alias,null),/round041 bank requires|renamed exact collision|renamed or reordered/);
  for(const rename of [false,true]){const bank=structuredClone(selected),option=structuredClone(original.options.find(o=>o.optionId===excluded.links[0].optionId));bank.bankVersion='future.candidate';if(rename)option.optionId='renamed-orphan';bank.options.push(option);assert.throws(()=>assertNoPublicationExcludedContent(bank,checked),/exclusive option/);}
}));

test('snapshot rejects active-original reactivation, alternate original path and omitted successor linkage',()=>withBankParsingSession(root,async()=>{
  const manifest=JSON.parse(rawAt('data/manifest.json'));
  const old={...manifest,bankVersion:original.bankVersion,file:`releases/${original.bankVersion}/bank.json`,sha256:hash(rawAt(originalPath)),releasedAt:original.releasedAt,changeSummary:original.changeSummary};
  assert.throws(()=>validatePublicationSelectionSnapshot(replace('data/manifest.json',json(old)),{now}),/reactivate retired/);
  assert.throws(()=>validatePublicationSelectionSnapshot([...files,{path:'data/releases/alias/bank.json',raw:rawAt(originalPath)}],{now}),/exact historical path/);
  assert.throws(()=>validatePublicationSelectionSnapshot(replace('data/manifest.json',json({...manifest,sha256:'a'.repeat(64)})),{now}),/active manifest identity mismatch/);
  assert.throws(()=>validatePublicationSelectionSnapshot([{path:'docs/rounds/round-042.json',raw:json({roundId:'round-042'})}],{now}),/missing or changed reviewed selection/);
  const changed=structuredClone(ledger);changed.publication.bankVersion=selected.bankVersion;changed.publication.bankSha256=hash(rawAt(selectedPath));
  assert.throws(()=>resolvePublicationIdentity(changed,authority()),/cannot be mutated or projected/);
  changed.roundId='renamed-round';changed.publication.bankVersion='renamed-bank';
  assert.throws(()=>resolvePublicationIdentity(changed,authority()),/cannot masquerade/);
  assert.throws(()=>resolvePublicationIdentity({roundId:'round-999',publication:{},candidates:[]},authority()),/exact original raw ledger source/);
}));

test('only exact historical inventory snapshots pass the read-only boundary; even that snapshot cannot authorize a current root',async()=>{
  // This isolated synthetic pin tests the historical inventory algorithm only.
  // Real record/bank authority is covered above; this never edits live pins and
  // cannot be represented as an actual delivery/publication verification.
  await fixtureRoot(async directory=>{
    const dependencies=['package.json','scripts/prepublication-quarantine.mjs','src/domain.js','src/new-session-eligibility.js','src/legacy-materials.js','src/legacy-question-display.js','src/reviewed-option-explanations.js','docs/quarantines/trust.json'];
    const proofPaths=record.nonDeliveryEvidence.registrySnapshots.filter(e=>e.path.startsWith('docs/deliveries/')).flatMap(e=>{const value=JSON.parse(e.raw);return (value.roots??value.checkpoints??[]).map(p=>p.path);});
    for(const p of [...dependencies,...proofPaths]){await fs.mkdir(path.dirname(path.join(directory,p)),{recursive:true});await fs.copyFile(path.join(root,p),path.join(directory,p));}
    const oldLedger={roundId:'round-001',publication:{bankVersion:'synthetic.old',bankSha256:'a'.repeat(64)},candidates:[]};
    const old=[{path:'data/manifest.json',raw:json({bankVersion:'synthetic.old'})},{path:'docs/rounds/round-001.json',raw:json(oldLedger)}];
    old.push({path:'PUBLICATION-MANIFEST.txt',raw:Buffer.from([...old.map(f=>f.path),'PUBLICATION-MANIFEST.txt'].sort().join('\n')+'\n')});
    const inventory=old.map(f=>({path:f.path,sha256:hash(f.raw),bytes:f.raw.length}));
    const evidence=json({kind:'explicitly_synthetic_historical_inventory_fixture',remoteInventory:inventory});
    const synthetic=structuredClone(record);synthetic.nonDeliveryEvidence.registrySnapshots.push({path:'docs/publications/synthetic-historical-inventory.json',sha256:hash(evidence),raw:evidence.toString()});
    const raw=json(synthetic);await fs.writeFile(path.join(directory,PUBLICATION_SELECTION_PATH),raw);
    const modulePath=path.join(directory,'scripts/publication-selection.mjs'),source=await fs.readFile(modulePath,'utf8');
    assert.equal(source.split(PUBLICATION_SELECTION_PIN.sha256).length,2,'exact single isolated pin replacement');
    await fs.writeFile(modulePath,source.replace(PUBLICATION_SELECTION_PIN.sha256,hash(raw)));
    const isolated=await import(pathToFileURL(modulePath).href);
    const historical=isolated.validatePublicationSelectionSnapshot(old,{now});
    assert.deepEqual(historical.selections,[]);assert.equal(isolated.resolvePublicationIdentity(oldLedger,historical).selectionReference,null);
    assert.throws(()=>isolated.resolvePublicationIdentity(ledger,historical),/validated publication selection/);
    assert.throws(()=>isolated.validatePublicationSelectionSnapshot([...old,{path:'extra.txt',raw:Buffer.from('extra')}],{now}),/missing or changed reviewed selection/);
    assert.throws(()=>isolated.validatePublicationSelectionSnapshot(replace('data/manifest.json',Buffer.from('{}'),old),{now}),/missing or changed reviewed selection/);
    // An exact prior archive is a historical proof, never a current-root opt-out.
    for(const file of old){await fs.mkdir(path.dirname(path.join(directory,file.path)),{recursive:true});await fs.writeFile(path.join(directory,file.path),file.raw);}
    await assert.rejects(isolated.loadPublicationSelections(directory,{now}),/omitted from allowlist/);
  });
});

test('reference schemas are strict and authority output cannot be mutated to authorize a changed record',()=>withBankParsingSession(root,async()=>{
  const checked=authority(),identity=resolvePublicationIdentity(ledger,checked),reference=identity.selectionReference;
  for(const bad of [null,{},reference.path,{...reference,sha256:'a'.repeat(64)},{...reference,approved:true}])assert.throws(()=>assertPublicationSelectionReference(bad,identity),/selection reference/);
  assert.throws(()=>assertPublicationSelectionReference(reference,structuredClone(identity)),/resolved identity/);
  assert.throws(()=>{checked.selections[0].retained[0].revision=2;},TypeError);
  assert.throws(()=>{identity.eligibleCandidateIds.push('r041-primary-s2-w01');},TypeError);
  const returned=publicationSelectionFiles(checked);returned[0].raw.fill(0);
  assert.equal(hash(publicationSelectionFiles(checked)[0].raw),PUBLICATION_SELECTION_PIN.sha256);
  const mutable=files.map(f=>({path:f.path,raw:Buffer.from(f.raw)})),fromMutable=validatePublicationSelectionSnapshot(mutable,{now});
  rawAt(PUBLICATION_SELECTION_PATH,mutable).fill(0);
  assert.equal(resolvePublicationIdentity(ledger,fromMutable).selectionReference.sha256,PUBLICATION_SELECTION_PIN.sha256);
}));

test('filesystem loader validates exact listed dependencies and refuses symlinks and hidden selection files',()=>withBankParsingSession(root,async()=>{
  await fixtureRoot(async directory=>{
    const checked=await loadPublicationSelections(directory,{now});assert.equal(resolvePublicationIdentity(ledger,checked).effectiveBankVersion,selected.bankVersion);
    await fs.writeFile(path.join(directory,'docs/publication-selections/unreviewed.json'),'{}');
    await assert.rejects(loadPublicationSelections(directory,{now}),/unknown or unlisted/);
  });
  await fixtureRoot(async directory=>{
    await fs.unlink(path.join(directory,ledgerPath));await fs.symlink(path.join(root,ledgerPath),path.join(directory,ledgerPath));
    await assert.rejects(loadPublicationSelections(directory,{now}),/regular dependency files/);
  });
  await fixtureRoot(async directory=>{
    const allow=rawAt('PUBLICATION-MANIFEST.txt').toString().replace(PUBLICATION_SELECTION_PATH+'\n','');await fs.writeFile(path.join(directory,'PUBLICATION-MANIFEST.txt'),allow);
    await assert.rejects(loadPublicationSelections(directory,{now}),/omitted from allowlist/);
  });
}));
