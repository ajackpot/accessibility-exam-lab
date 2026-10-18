/** Current-window completion policy only; no campaign validation or release pair. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {FREEZE_AT,releaseAllowed} from '../src/domain.js';
import {EDITORIAL005_COMPLETION as identity,withEditorial005Completion,currentCutoffBlocks,completionHistoryReadable,assertEditorial005CompletionInput} from '../scripts/editorial005-completion.mjs';
import {assertCurrentReleaseWindow} from '../scripts/release-window.mjs';
import {readBankInput} from '../scripts/bank-io.mjs';
import {loadRoundContext} from '../scripts/validate-round.mjs';
const source=path.resolve(import.meta.dirname,'..');
const paths=['data/manifest.json','data/publication-state.json',identity.ledgerPath,`data/releases/${identity.bankVersion}/bank.json`];
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'editorial005-window-')),files=new Map();
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 for(const p of paths){const raw=await fs.readFile(path.join(source,p));files.set(p,raw);await fs.mkdir(path.dirname(path.join(root,p)),{recursive:true});await fs.writeFile(path.join(root,p),raw,{flag:'wx'});}
 return {root,files};
}
test('only exact005 and the approved baseline enter the current completion window',async t=>{
 const {root,files}=await fixture(t),now=Date.now();assert.ok(now>=FREEZE_AT);
 assert.equal(currentCutoffBlocks(now),true);assert.equal(currentCutoffBlocks(FREEZE_AT-1),false);
 let calls=0;
 await withEditorial005Completion({root,now},async()=>{
  calls++;assert.equal(currentCutoffBlocks(now,{root,files,roundId:identity.roundId,baseCommit:identity.baseCommit}),false);
  assert.equal(currentCutoffBlocks(now,{root:source}),true);
  assert.equal(currentCutoffBlocks(now,{roundId:'editorial-006'}),true);
  assert.equal(currentCutoffBlocks(now,{baseCommit:'1'.repeat(40)}),true);
  assert.equal(currentCutoffBlocks(now,{manifest:{...JSON.parse(files.get('data/manifest.json')),bankVersion:'future'}}),true);
  assert.equal(currentCutoffBlocks(now,{publicationState:{finalized:true}}),true);
  assert.equal(currentCutoffBlocks(now+3_600_000),true);
  assert.equal((await assertCurrentReleaseWindow(root)).bankVersion,identity.bankVersion);
  // The original domain publication/new-content rule is not opened by this scope.
  assert.equal(releaseAllowed({now,finalized:false,releasedAt:JSON.parse(files.get('data/manifest.json')).releasedAt}),false);
 });
 assert.equal(calls,1);assert.equal(currentCutoffBlocks(Date.now()),true);
 for(const args of [{baseCommit:'1'.repeat(40)},{roundId:'round-042'},{roundId:'editorial-006'}])await assert.rejects(withEditorial005Completion({root,...args},()=>{calls++;}),/limited/);
 await assert.rejects(withEditorial005Completion({root,now:Date.now()+3_600_000},()=>{calls++;}),/actual current time/);
 assert.equal(calls,1);
});
test('fresh boundaries reject changed manifest ledger bank or either finalized marker',async t=>{
 const {root,files}=await fixture(t);
 await withEditorial005Completion({root},async()=>{
  for(const p of paths){
   const raw=files.get(p);const changed=p==='data/publication-state.json'?Buffer.from('{"finalized":true}\n'):Buffer.concat([raw,Buffer.from(' ')]);
   await fs.writeFile(path.join(root,p),changed);
   assert.equal(currentCutoffBlocks(Date.now(),{root}),true,p);
   await assert.rejects(withEditorial005Completion({root},()=>{}),/exact unfrozen/);
   await fs.writeFile(path.join(root,p),raw);
   assert.equal(currentCutoffBlocks(Date.now(),{root}),false,p);
  }
  const missing=new Map(files);missing.delete(identity.ledgerPath);assert.equal(currentCutoffBlocks(Date.now(),{files:missing}),true);
  const bankChanged=new Map(files);bankChanged.set(paths.at(-1),Buffer.from('changed'));assert.equal(currentCutoffBlocks(Date.now(),{files:bankChanged}),true);
 });
});
test('another root must authenticate independently and cannot borrow an outer scope',async t=>{
 const {root}=await fixture(t),bad=await fs.mkdtemp(path.join(os.tmpdir(),'editorial005-other-'));t.after(()=>fs.rm(bad,{recursive:true,force:true}));
 await withEditorial005Completion({root},async()=>{
  assert.equal(currentCutoffBlocks(Date.now(),{root:bad}),true);
  await assert.rejects(withEditorial005Completion({root:bad},()=>{}),/exact unfrozen/);
  assert.equal(currentCutoffBlocks(Date.now(),{root}),false);
 });
 const link=path.join(bad,'alias');await fs.symlink(root,link);
 await assert.rejects(withEditorial005Completion({root:link},()=>{}),/exact unfrozen/);
});
test('completion scope expires after success and failure including detached async work',async t=>{
 const {root}=await fixture(t);
 for(const fail of [false,true]){
  let release,late;const gate=new Promise(resolve=>{release=resolve;});
  const operation=withEditorial005Completion({root},async()=>{late=gate.then(()=>currentCutoffBlocks(Date.now()));if(fail)throw Error('expected fixture failure');});
  if(fail)await assert.rejects(operation,/expected fixture failure/);else await operation;
  release();assert.equal(await late,true);assert.equal(currentCutoffBlocks(Date.now()),true);
 }
});
test('historical read exception preserves false new-content decisions and every other blocker',async t=>{
 const {root}=await fixture(t),checked={ok:true,canStartNewContent:false,continuationBlockers:['Final cutoff or persistent freeze blocks offline advancement']},before=structuredClone(checked);
 assert.equal(completionHistoryReadable(checked,Date.now()),false);
 await withEditorial005Completion({root},async()=>{
  assert.equal(completionHistoryReadable(checked,Date.now()),true);
  assert.equal(completionHistoryReadable({...checked,ok:false},Date.now()),false);
  assert.equal(completionHistoryReadable({...checked,continuationBlockers:[...checked.continuationBlockers,'Reconciliation window has not reached its fixed ten-minute cap']},Date.now()),false);
  assert.equal(completionHistoryReadable(checked,Date.now(),{publicationState:{finalized:true}}),false);
  assert.equal(completionHistoryReadable(checked,FREEZE_AT-1),false);
 });
 assert.deepEqual(checked,before);
});
test('completion rejects all explicit candidate inputs before the bank or ledger reader',async t=>{
 const {root,files}=await fixture(t),input=path.join(root,'explicit-input.json');
 assert.throws(()=>assertEditorial005CompletionInput(input),/does not accept explicit/);
 assert.doesNotThrow(()=>assertEditorial005CompletionInput(input,FREEZE_AT-1));
 await withEditorial005Completion({root},async()=>{
  for(const [kind,p]of [['bank',paths.at(-1)],['ledger',identity.ledgerPath]]){
   for(const raw of [files.get(p),Buffer.concat([files.get(p),Buffer.from(' ')])]){
    await fs.writeFile(input,raw);
    if(kind==='bank')await assert.rejects(readBankInput(root,input),/does not accept explicit/);
    else await assert.rejects(loadRoundContext(root,input),/does not accept explicit/);
   }
  }
  await fs.unlink(input);await fs.symlink(path.join(root,identity.ledgerPath),input);
  await assert.rejects(loadRoundContext(root,input),/does not accept explicit/);
 });
});
