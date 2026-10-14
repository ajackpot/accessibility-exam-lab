import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {readSuccessor,projectRegistration385,syntheticSuccessor,writeExactFiles,assertExactFiles} from './successor-projection.mjs';
import {regularCoverage as oracleCoverage} from './fixtures/public-main-9ae76b4/scripts/campaign-validation-primitives.mjs';
import {fixture} from '../qa/fixture.mjs';

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
