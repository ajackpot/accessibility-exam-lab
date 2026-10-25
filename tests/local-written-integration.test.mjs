import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {LOCAL_WRITTEN,hasLocalWrittenIntegration,readLocalWrittenBoundary,validateLocalWrittenIntegration} from '../scripts/local-written-integration.mjs';
import {PRACTICAL_WRITTEN,practicalWrittenHash} from '../scripts/practical-written-registration.mjs';
import {PRACTICAL_WRITTEN_HISTORY} from '../scripts/practical-written-baseline.mjs';
import {buildBank} from '../scripts/build.mjs';
import {readBankInput} from '../scripts/bank-io.mjs';
import {withCurrentReleaseAuthority,currentCutoffBlocks} from '../scripts/current-release-authority.mjs';
import {assertCurrentReleaseWindow} from '../scripts/release-window.mjs';
import {writeReleaseDeliveryPair} from '../scripts/release-bundle.mjs';
import {freezeCompleteProject} from '../scripts/complete-bundle.mjs';

const root=path.resolve(import.meta.dirname,'..');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const bankPath=`data/releases/${LOCAL_WRITTEN.version}/bank.json`;
const previousBankPath=`data/releases/${PRACTICAL_WRITTEN.bankVersion}/bank.json`;
const protectedPaths=[LOCAL_WRITTEN.path,'data/manifest.json','data/publication-state.json',bankPath,previousBankPath];

async function fixture(t){
  const target=await fs.mkdtemp(path.join(os.tmpdir(),'local-written-boundary-test-'));
  t.after(()=>fs.rm(target,{recursive:true,force:true}));
  const ledger=JSON.parse(await fs.readFile(path.join(root,PRACTICAL_WRITTEN.ledgerPath)));
  const dependencies=ledger.candidates.flatMap(candidate=>[
    ...candidate.cycles.map(cycle=>cycle.input.path),
    ...(candidate.sourceRefresh?[candidate.sourceRefresh.input.path]:[])
  ]);
  const paths=new Set([...PRACTICAL_WRITTEN_HISTORY.map(entry=>entry.path),...protectedPaths,PRACTICAL_WRITTEN.ledgerPath,...dependencies]);
  for(const relative of paths){
    const destination=path.join(target,relative);
    await fs.mkdir(path.dirname(destination),{recursive:true});
    // Independent copies: no fixture write can mutate source files via a hard link.
    await fs.copyFile(path.join(root,relative),destination);
  }
  return {target,dependencies};
}
async function replace(target,relative,changed,operation){
  const file=path.join(target,relative),original=await fs.readFile(file);
  try{
    if(changed===null)await fs.unlink(file);
    else await fs.writeFile(file,typeof changed==='function'?changed(original):changed);
    return await operation();
  }finally{await fs.writeFile(file,original);}
}
async function hashes(target){
  return Promise.all(protectedPaths.map(async relative=>[relative,practicalWrittenHash(await fs.readFile(path.join(target,relative)))]));
}

test('local integration authenticates exact files without extending publication authority',async t=>{
  const originalSource=await hashes(root);
  const {target,dependencies}=await fixture(t);

  await t.test('all 372 accepted corrections preserve 633 other questions, 84 practical items and 14 seeds',()=>{
    const checked=validateLocalWrittenIntegration(target);
    assert.deepEqual(checked.result,{ok:true,accepted:372,optionChanges:1842,unchangedQuestions:633,written:921,practical:84,seeds:14,canPublish:false,canPush:false});
    assert.equal(practicalWrittenHash(checked.bankRaw),LOCAL_WRITTEN.bankSha256);
    assert.equal(practicalWrittenHash(checked.registryRaw),LOCAL_WRITTEN.registrySha256);
    assert.equal(practicalWrittenHash(checked.manifestRaw),LOCAL_WRITTEN.manifestSha256);
    assert.equal(checked.registry.publication.status,'not_authorized');
  });

  await t.test('ordinary build and reader select the registered bank and leave every boundary file unchanged',async()=>{
    const before=await hashes(target);
    const built=await buildBank(target),loaded=await readBankInput(target);
    assert.equal(built.bank.bankVersion,LOCAL_WRITTEN.version);
    assert.equal(loaded.manifest.bankVersion,LOCAL_WRITTEN.version);
    assert.equal(practicalWrittenHash(Buffer.from(loaded.raw)),LOCAL_WRITTEN.bankSha256);
    assert.deepEqual(await hashes(target),before);
  });

  await t.test('explicit input accepts only exact registered bank bytes',async()=>{
    const file=path.join(target,'exact-input.json');
    await fs.copyFile(path.join(target,bankPath),file);
    assert.equal(validateLocalWrittenIntegration(target,{input:file}).bank.bankVersion,LOCAL_WRITTEN.version);
    await fs.appendFile(file,' ');
    assert.throws(()=>validateLocalWrittenIntegration(target,{input:file}),/explicit input hash mismatch/);
    await fs.rm(file);
    assert.throws(()=>validateLocalWrittenIntegration(target,{input:path.join(target,previousBankPath)}),/explicit input hash mismatch/);
  });

  await t.test('a missing registry cannot fall back while the local bank or manifest remains',async()=>{
    await replace(target,LOCAL_WRITTEN.path,null,async()=>{
      assert.equal(hasLocalWrittenIntegration(target),true);
      assert.throws(()=>readLocalWrittenBoundary(target),/ENOENT/);
      await assert.rejects(buildBank(target),/ENOENT/);
      await assert.rejects(readBankInput(target),/ENOENT/);
    });
  });

  await t.test('missing bank and manifest fail instead of selecting a prior bank',async()=>{
    for(const relative of [bankPath,'data/manifest.json'])await replace(target,relative,null,()=>{
      assert.equal(hasLocalWrittenIntegration(target),true);
      assert.throws(()=>readLocalWrittenBoundary(target),/ENOENT/);
    });
  });

  await t.test('registry byte changes and forged publishing flags fail the independent pin',async()=>{
    for(const change of [raw=>Buffer.concat([raw,Buffer.from(' ')]),raw=>{
      const value=JSON.parse(raw);value.scope.canPublish=true;value.scope.canPush=true;return json(value);
    }])await replace(target,LOCAL_WRITTEN.path,change,()=>assert.throws(()=>readLocalWrittenBoundary(target),/registered scope hash mismatch/));
  });

  await t.test('manifest traversal, wrong version, forged hash and final release flag fail',async()=>{
    for(const change of [{file:'../candidate.json'},{bankVersion:PRACTICAL_WRITTEN.bankVersion},{sha256:'0'.repeat(64)},{finalRelease:true}]){
      await replace(target,'data/manifest.json',raw=>json({...JSON.parse(raw),...change}),()=>assert.throws(()=>readLocalWrittenBoundary(target),/local manifest hash mismatch/));
    }
  });

  await t.test('target, practical, seed, source and metadata mutations cannot reuse the pinned registration',async()=>{
    const mutations=[
      bank=>{bank.questions.find(q=>q.explanationMode==='components').explanation+=' changed';},
      bank=>{bank.questions.find(q=>q.type==='practical').revision++;},
      bank=>{bank.questions.find(q=>q.testOnly).revision++;},
      bank=>{bank.sources[0].title+=' changed';},
      bank=>{bank.changeSummary+=' changed';}
    ];
    for(const mutate of mutations)await replace(target,bankPath,raw=>{const bank=JSON.parse(raw);mutate(bank);return json(bank);},()=>assert.throws(()=>readLocalWrittenBoundary(target),/local bank hash mismatch/));
  });

  await t.test('persistent freeze and malformed freeze records fail even with an exact bank',async()=>{
    for(const state of [{finalized:true},{finalized:false,extra:false},{},null])await replace(target,'data/publication-state.json',json(state),()=>assert.throws(()=>readLocalWrittenBoundary(target),/persistent freeze/));
  });

  await t.test('historical bank and ledger bytes are checked from the supplied root',async()=>{
    const ledger=PRACTICAL_WRITTEN_HISTORY.find(entry=>/^docs\/rounds\/round-\d+\.json$/.test(entry.path));
    for(const relative of [PRACTICAL_WRITTEN_HISTORY.find(entry=>entry.path.startsWith('data/releases/')).path,ledger.path]){
      await replace(target,relative,raw=>Buffer.concat([raw,Buffer.from(' ')]),()=>assert.throws(()=>validateLocalWrittenIntegration(target),/historical size changed/));
    }
  });

  await t.test('original conversion bank, registry and review evidence cannot be substituted',async()=>{
    await replace(target,previousBankPath,raw=>Buffer.concat([raw,Buffer.from(' ')]),()=>assert.throws(()=>validateLocalWrittenIntegration(target),/previous immutable bank hash mismatch/));
    await replace(target,PRACTICAL_WRITTEN.ledgerPath,raw=>Buffer.concat([raw,Buffer.from(' ')]),()=>assert.throws(()=>validateLocalWrittenIntegration(target),/original conversion registry hash mismatch/));
    await replace(target,dependencies[0],raw=>Buffer.concat([raw,Buffer.from(' ')]),()=>assert.throws(()=>validateLocalWrittenIntegration(target),/Review input bytes mismatch/));
  });

  await t.test('additional release directories are rejected',async()=>{
    const extra=path.join(target,'data/releases/unregistered.local.1');await fs.mkdir(extra);
    try{assert.throws(()=>validateLocalWrittenIntegration(target),/unregistered additional bank/);}finally{await fs.rmdir(extra);}
  });

  await t.test('symlinked evidence and source roots cannot borrow matching registered bytes',async()=>{
    const file=path.join(target,bankPath),saved=file+'.saved';await fs.rename(file,saved);
    try{await fs.symlink(path.join(root,bankPath),file);assert.throws(()=>readLocalWrittenBoundary(target),/Nonregular evidence file/);}
    finally{await fs.unlink(file);await fs.rename(saved,file);}
    const alias=target+'-alias';await fs.symlink(target,alias);
    try{assert.throws(()=>readLocalWrittenBoundary(alias),/Symlink root/);}finally{await fs.unlink(alias);}
  });

  await t.test('a second root cannot borrow the first root registration or manifest',async()=>{
    const other=await fs.mkdtemp(path.join(os.tmpdir(),'local-written-foreign-root-'));
    try{
      await fs.mkdir(path.join(other,'data'),{recursive:true});
      await fs.copyFile(path.join(target,'data/manifest.json'),path.join(other,'data/manifest.json'));
      assert.equal(hasLocalWrittenIntegration(other),true);
      assert.throws(()=>readLocalWrittenBoundary(other),/ENOENT/);
      await assert.rejects(buildBank(other),/ENOENT/);
    }finally{await fs.rm(other,{recursive:true,force:true});}
  });

  await t.test('the release authority and public packaging reject the local manifest before callbacks or writes',async()=>{
    assert.equal(currentCutoffBlocks(Date.now()),true);
    let invoked=false;
    await assert.rejects(withCurrentReleaseAuthority({root:target},()=>{invoked=true;}),/Active manifest is outside this conversion/);
    assert.equal(invoked,false);
    await assert.rejects(assertCurrentReleaseWindow(target),/Active manifest is outside this conversion/);
    const delta=path.join(target,'forbidden.zip'),complete=path.join(target,'forbidden.7z');
    await assert.rejects(writeReleaseDeliveryPair({workRoot:target,registrationId:PRACTICAL_WRITTEN.id,baseCommit:PRACTICAL_WRITTEN.baselineCommit,deltaOutputPath:delta,completeOutputPath:complete}),/Active manifest is outside this conversion/);
    await assert.rejects(freezeCompleteProject({workRoot:target,sourceRelease:{registrationId:PRACTICAL_WRITTEN.id,baseCommit:PRACTICAL_WRITTEN.baselineCommit}}),/Active manifest is outside this conversion/);
    for(const file of [delta,complete])await assert.rejects(fs.access(file),/ENOENT/);
  });

  await t.test('unrequested validator modes cannot select content or publication authority',()=>{
    const result=spawnSync(process.execPath,[path.join(root,'scripts/validate-round.mjs'),'--skip-history'],{cwd:root,encoding:'utf8',timeout:15000});
    assert.equal(result.error,undefined);assert.notEqual(result.status,0);
    assert.match(result.stderr,/Local written integration accepts only --release validation/);
    assert.doesNotMatch(result.stdout,/full historical gates follow/);
  });

  assert.deepEqual(await hashes(root),originalSource,'all mutation probes must leave source boundary files unchanged');
});

test('release CLI reports explicit local-only denial without starting historical validation',async t=>{
  const originalSource=await hashes(root);
  const {target}=await fixture(t);
  // The isolated fixture has the local registration but no later publication registration.
  for(const relative of ['scripts','src','package.json'])await fs.cp(path.join(root,relative),path.join(target,relative),{recursive:true});
  const result=spawnSync(process.execPath,[path.join(target,'scripts/release-guard.mjs'),'--check-only'],{cwd:target,encoding:'utf8',timeout:15000});
  assert.equal(result.error,undefined);assert.notEqual(result.status,0);
  assert.match(result.stderr,/PUBLICATION BLOCKED: written-explanation-372 is authorized for local integration and validation only/);
  assert.doesNotMatch(result.stdout,/full historical gates follow/);
  assert.deepEqual(await hashes(root),originalSource,'the isolated CLI probe must leave source boundary files unchanged');
});
