import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {readSuccessor,projectRegistration385,syntheticSuccessor,writeExactFiles,assertExactFiles,readEditorial005Source,projectEditorial005To395,readPracticalWrittenSource,projectPracticalWrittenToBaseline407,projectPracticalWrittenToEditorial005} from './successor-projection.mjs';
import {regularCoverage as oracleCoverage} from './fixtures/public-main-9ae76b4/scripts/campaign-validation-primitives.mjs';
import {fixture} from '../qa/fixture.mjs';
import {pruneFutureEditorialFixture} from './historical-authority-fixtures.mjs';

const root=path.resolve(import.meta.dirname,'..');
const source=await readSuccessor(root),original=projectRegistration385(source);
const hash=b=>createHash('sha256').update(b).digest('hex');
test('exact successor reverses to the entire original registration385 and preserves real event inventory384',()=>{
  assert.equal(original.size,385);
  const raw=original.get('docs/publications/editorial-004.json');
  assert.equal(hash(raw),'c2dd280a0f197ba92a5cee172d7f1a95c936946fddbfec49f8ba086f3382747a');
  assert.deepEqual(raw,source.get('docs/publications/editorial-004.json'));
  const event=JSON.parse(raw);assert.equal(event.commit,'9ae76b4359e5596367c75242e3fa2b850e19ce9b');assert.equal(event.remoteInventory.length,384);
  assert.equal(original.has('tests/successor-projection.mjs'),false);
  assert(original.get('src/domain.js').includes(Buffer.from("APP_VERSION = '0.2.9'")));
  assert(source.get('src/domain.js').includes(Buffer.from("APP_VERSION = '0.2.10'")));
});
test('changed production, documents, tests, oracle and both bootstrap controls reject mutation before rollback',()=>{
  for(const p of ['src/domain.js','scripts/campaign-validation-primitives.mjs','AGENTS.md','docs/PRD.md','tests/editorial-publication.test.mjs','tests/editorial-publication-consumers.test.mjs','tests/coverage-index-differential.test.mjs','tests/fixtures/public-main-9ae76b4/src/domain.js','tests/successor-projection.mjs','tests/fixtures/coverage-successor-delta.json']){
    const changed=new Map(source),raw=Buffer.from(source.get(p));raw[raw.length-1]^=1;changed.set(p,raw);
    assert.throws(()=>projectRegistration385(changed),undefined,p);
  }
});
test('missing files, unlisted extras, forged allowlist and unchanged historical data drift fail closed',()=>{
  for(const p of ['src/domain.js','tests/fixtures/coverage-successor-delta.json','tests/fixtures/public-main-9ae76b4/src/domain.js']){
    const missing=new Map(source);missing.delete(p);assert.throws(()=>projectRegistration385(missing),undefined,p);
  }
  const extra=new Map(source);extra.set('src/undeclared.js',Buffer.from('export{}'));assert.throws(()=>projectRegistration385(extra));
  const allowlist=new Map(source);allowlist.set('PUBLICATION-MANIFEST.txt',Buffer.concat([source.get('PUBLICATION-MANIFEST.txt'),Buffer.from('src/undeclared.js\n')]));assert.throws(()=>projectRegistration385(allowlist));
  const drift=new Map(source);drift.set('data/publication-state.json',Buffer.from('{"finalized":true}\n'));assert.throws(()=>projectRegistration385(drift));
});
test('synthetic successor disk has its exact declared map and executes the current optimized runtime',async t=>{
  const synthetic=syntheticSuccessor(original,source),dir=await fs.mkdtemp(path.join(os.tmpdir(),'successor-boundary-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));await writeExactFiles(dir,synthetic);
  const d=await import(pathToFileURL(path.join(dir,'src/domain.js')).href);
  const c=await import(pathToFileURL(path.join(dir,'scripts/campaign-validation-primitives.mjs')).href);
  assert.equal(d.APP_VERSION,'0.2.10');assert.equal(d.GENERATOR_VERSION,'2');assert.equal(typeof d.createCoveragePresenter,'function');
  const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
  const bank=freeze(fixture(1));assert.deepEqual(c.regularCoverage(bank),oracleCoverage(bank));
  await fs.writeFile(path.join(dir,'unlisted.txt'),'extra');await assert.rejects(assertExactFiles(dir,synthetic));
  await fs.rm(path.join(dir,'unlisted.txt'));await assertExactFiles(dir,synthetic);
});
test('checkout reader excludes only root Git metadata; disposable maps and other additions remain strict',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'successor-checkout-boundary-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));await writeExactFiles(dir,source);
  // Inert fixture pointer only: no Git command, repository or ref is created.
  await fs.writeFile(path.join(dir,'.git'),'gitdir: unavailable-test-fixture\n');
  assert.equal((await readSuccessor(dir)).size,source.size);
  await assert.rejects(assertExactFiles(dir,source));
  await fs.rename(path.join(dir,'.git'),path.join(dir,'unlisted.txt'));
  await assert.rejects(readSuccessor(dir));
});

// Current editorial source is authenticated separately; historical projections
// below are never evidence that the new release or its archives were published.
const editorialCurrent=await readEditorial005Source(root);
test('exact editorial005 current source reverses to historical395 without mutating any current byte',()=>{
  const before=[...editorialCurrent.files].map(([p,raw])=>[p,hash(raw)]);
  const restored=projectEditorial005To395(editorialCurrent.files,editorialCurrent.directories);
  assert.equal(editorialCurrent.files.size,401);assert.equal(restored.size,395);
  assert.deepEqual([...restored.keys()].sort(),[...source.keys()].sort());
  for(const [p,raw] of source)assert.deepEqual(restored.get(p),raw,p);
  assert.deepEqual([...editorialCurrent.files].map(([p,raw])=>[p,hash(raw)]),before);
  assert.deepEqual(projectRegistration385(restored),original);
});
test('editorial transition rejects every changed and added input plus unrelated production and historical drift',()=>{
  const control=JSON.parse(editorialCurrent.files.get('tests/fixtures/editorial005-source-delta.json'));
  const paths=new Set([...control.changes.map(x=>x.path),...control.additions,'src/domain.js','docs/rounds/round-041.json','data/releases/2026.10.12-editorial.4/bank.json','tests/fixtures/coverage-successor-delta.json','tests/fixtures/public-main-9ae76b4/src/domain.js']);
  for(const p of paths){
    const files=new Map(editorialCurrent.files),raw=Buffer.from(files.get(p));assert(raw.length>0);raw[raw.length-1]^=1;files.set(p,raw);
    assert.throws(()=>projectEditorial005To395(files,editorialCurrent.directories),undefined,p);
  }
});
test('editorial source rejects missing controls, unknown/case/unsafe entries and extra or missing directories',()=>{
  for(const p of ['tests/fixtures/editorial005-source-delta.json','tests/fixtures/coverage-successor-delta.json','src/app.js','docs/corrections/editorial-005.json']){
    const files=new Map(editorialCurrent.files);files.delete(p);assert.throws(()=>projectEditorial005To395(files,editorialCurrent.directories),undefined,p);
  }
  for(const p of ['src/undeclared.js','SRC/app.js','../escape.js','.git/config']){
    const files=new Map(editorialCurrent.files);files.set(p,Buffer.from('undeclared'));assert.throws(()=>projectEditorial005To395(files,editorialCurrent.directories),undefined,p);
  }
  const forged=new Map(editorialCurrent.files);forged.set('PUBLICATION-MANIFEST.txt',Buffer.concat([forged.get('PUBLICATION-MANIFEST.txt'),Buffer.from('src/undeclared.js\n')]));assert.throws(()=>projectEditorial005To395(forged,editorialCurrent.directories));
  const extra=new Set(editorialCurrent.directories);extra.add('unlisted-empty-directory');assert.throws(()=>projectEditorial005To395(editorialCurrent.files,extra));
  const missing=new Set(editorialCurrent.directories);missing.delete('src');assert.throws(()=>projectEditorial005To395(editorialCurrent.files,missing));
});
test('current disk routing rejects malformed or missing bootstrap and filesystem drift without legacy fallback',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'editorial005-source-boundary-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  await writeExactFiles(dir,editorialCurrent.files);assert.deepEqual(await readSuccessor(dir),source);
  const control='tests/fixtures/editorial005-source-delta.json',raw=editorialCurrent.files.get(control);
  await fs.writeFile(path.join(dir,control),Buffer.concat([raw,Buffer.from(' ')]));await assert.rejects(readSuccessor(dir));
  await fs.unlink(path.join(dir,control));await assert.rejects(readSuccessor(dir));await fs.writeFile(path.join(dir,control),raw);
  await fs.mkdir(path.join(dir,'unlisted-empty-directory'));await assert.rejects(readSuccessor(dir));await fs.rmdir(path.join(dir,'unlisted-empty-directory'));
  await fs.symlink(path.join(dir,'src/app.js'),path.join(dir,'unlisted-link'));await assert.rejects(readSuccessor(dir));await fs.unlink(path.join(dir,'unlisted-link'));
  await fs.mkdir(path.join(dir,'src/.git'));await assert.rejects(readSuccessor(dir));await fs.rmdir(path.join(dir,'src/.git'));
  assert.deepEqual(await readSuccessor(dir),source);
});

const conversionCurrent=await readPracticalWrittenSource(root);
test('current conversion source authenticates every new byte before exact 407, 401, 395 and 385 restoration',()=>{
  const before=[...conversionCurrent.files].map(([p,raw])=>[p,hash(raw)]);
  const baseline=projectPracticalWrittenToBaseline407(conversionCurrent.files,conversionCurrent.directories);
  const historical=projectPracticalWrittenToEditorial005(conversionCurrent.files,conversionCurrent.directories);
  assert.equal(baseline.size,407);assert.equal(historical.size,401);
  assert.equal(hash(baseline.get('data/manifest.json')),'5d16fd0e2ff104f3a57b1a8b6ff3b431599475cdb0f1589125c065f11836596f');
  assert.deepEqual(historical,editorialCurrent.files);
  assert.deepEqual(projectRegistration385(projectEditorial005To395(historical,editorialCurrent.directories)),original);
  assert.deepEqual([...conversionCurrent.files].map(([p,raw])=>[p,hash(raw)]),before);
});
test('conversion projection rejects changed source, controls, history, membership and directories before restoration',()=>{
  for(const p of ['data/manifest.json','data/releases/2026.10.22-practical-written.1/bank.json','docs/conversions/practical-written-001.json','scripts/current-release-authority.mjs','tests/build-current-bank.test.mjs','tests/successor-projection.mjs','tests/fixtures/practical-written-source-delta.json','tests/fixtures/editorial005-source-delta.json','docs/incidents/2026-10-06-round-023-evidence-loss.md']){
    const files=new Map(conversionCurrent.files),raw=Buffer.from(files.get(p));raw[raw.length-1]^=1;files.set(p,raw);
    assert.throws(()=>projectPracticalWrittenToBaseline407(files,conversionCurrent.directories),undefined,p);
  }
  const missing=new Map(conversionCurrent.files);missing.delete('tests/fixtures/practical-written-source-delta.json');assert.throws(()=>projectPracticalWrittenToBaseline407(missing,conversionCurrent.directories));
  const extra=new Map(conversionCurrent.files);extra.set('src/unknown.js',Buffer.from('unlisted'));assert.throws(()=>projectPracticalWrittenToBaseline407(extra,conversionCurrent.directories));
  const dirs=new Set(conversionCurrent.directories);dirs.add('unknown-empty-directory');assert.throws(()=>projectPracticalWrittenToBaseline407(conversionCurrent.files,dirs));
});

test('owned historical pruning refuses missing conversion ledger, input, bank and unknown paths before mutation',async t=>{
  const ledgerPath='docs/conversions/practical-written-001.json',ledger=JSON.parse(conversionCurrent.files.get(ledgerPath));
  const bankPath=`data/releases/${ledger.result.bankVersion}/bank.json`,inputPath=ledger.candidates[0].cycles[0].input.path;
  const paths=[ledgerPath,bankPath,'docs/conversions/practical-written-001.md','docs/conversions/practical-written-registration.schema.json'];
  for(const c of ledger.candidates){paths.push(...c.cycles.map(x=>x.input.path));if(c.sourceRefresh)paths.push(c.sourceRefresh.input.path);}
  for(const missing of [ledgerPath,inputPath,bankPath,'unknown-without-ledger','bank-only']){
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'historical-boundary-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
    const files=new Map(paths.map(p=>[p,Buffer.from(conversionCurrent.files.get(p))]));
    if(missing==='bank-only'){files.clear();files.set(bankPath,Buffer.from(conversionCurrent.files.get(bankPath)));}
    files.delete(missing==='unknown-without-ledger'?ledgerPath:missing);
    if(missing==='unknown-without-ledger')files.set('docs/conversions/unknown.json',Buffer.from('{}\n'));
    files.set('PUBLICATION-MANIFEST.txt',Buffer.from([...files.keys(),'PUBLICATION-MANIFEST.txt'].sort().join('\n')+'\n'));
    await writeExactFiles(dir,files);
    await assert.rejects(pruneFutureEditorialFixture(dir,{temporaryRoot:dir,at:Date.parse('2026-10-08T00:00:00Z')}),/Incomplete future conversion fixture|Unknown conversion fixture path/);
    await assertExactFiles(dir,files);
  }
});
