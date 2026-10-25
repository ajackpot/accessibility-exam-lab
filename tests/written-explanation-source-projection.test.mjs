import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {writtenExplanationFixturePath,verifyWrittenExplanationSource,projectWrittenExplanationToPracticalWritten} from './written-explanation-source-projection.mjs';
import {readWrittenExplanationSource,readSuccessor,readPracticalWrittenSource,verifyPracticalWrittenSource,projectPracticalWrittenToBaseline407,projectPracticalWrittenToEditorial005,projectEditorial005To395,projectRegistration385,writeExactFiles} from './successor-projection.mjs';
import {optionExplanationParagraphs} from '../src/domain.js';

const root=path.resolve(import.meta.dirname,'..'),source=await readWrittenExplanationSource(root);
const delta=JSON.parse(source.files.get(writtenExplanationFixturePath)),hash=value=>createHash('sha256').update(value).digest('hex');

test('the entire current source restores exact original470 and unchanged historical407/401/395/385 chains',()=>{
  const before=[...source.files].map(([p,raw])=>[p,hash(raw)]);
  const original=projectWrittenExplanationToPracticalWritten(source.files,source.directories);
  assert.equal(original.files.size,470);verifyPracticalWrittenSource(original.files,original.directories);
  assert.equal(projectPracticalWrittenToBaseline407(original.files,original.directories).size,407);
  const editorial=projectPracticalWrittenToEditorial005(original.files,original.directories);
  assert.equal(editorial.size,401);
  const dirs=JSON.parse(editorial.get('tests/fixtures/editorial005-source-delta.json')).currentDirectories;
  const successor=projectEditorial005To395(editorial,new Set(dirs));assert.equal(successor.size,395);
  assert.equal(projectRegistration385(successor).size,385);
  assert.deepEqual([...source.files].map(([p,raw])=>[p,hash(raw)]),before);
  for(const p of ['data/manifest.json','data/publication-state.json','tests/fixtures/practical-written-source-delta.json','tests/fixtures/editorial005-source-delta.json','tests/fixtures/coverage-successor-delta.json'])assert.deepEqual(original.files.get(p),source.files.get(p),p);
});

test('every changed and added current input, old history and bootstrap must match before projection',()=>{
  const paths=new Set([...delta.changes.map(item=>item.path),...delta.additions,'data/manifest.json','docs/rounds/round-041.json','tests/fixtures/practical-written-source-delta.json']);
  for(const p of paths){
    const files=new Map(source.files),raw=Buffer.from(files.get(p));assert(raw.length>0);raw[raw.length-1]^=1;files.set(p,raw);
    assert.throws(()=>verifyWrittenExplanationSource(files,source.directories),undefined,p);
  }
});

test('no missing file, extra path, case alias, unsafe entry, forged allowlist or directory can be discarded',()=>{
  for(const p of [writtenExplanationFixturePath,'tests/written-explanation-source-projection.mjs','src/domain.js','docs/analysis/2026-10-23-written-explanation-inventory.json']){
    const files=new Map(source.files);files.delete(p);assert.throws(()=>verifyWrittenExplanationSource(files,source.directories),undefined,p);
  }
  for(const p of ['unlisted.txt','SRC/app.js','../escape.js','.git/config']){
    const files=new Map(source.files);files.set(p,Buffer.from('unlisted'));assert.throws(()=>verifyWrittenExplanationSource(files,source.directories),undefined,p);
  }
  const forged=new Map(source.files);forged.set('PUBLICATION-MANIFEST.txt',Buffer.concat([forged.get('PUBLICATION-MANIFEST.txt'),Buffer.from('unlisted.txt\n')]));assert.throws(()=>verifyWrittenExplanationSource(forged,source.directories));
  const extra=new Set(source.directories);extra.add('unlisted-empty-directory');assert.throws(()=>verifyWrittenExplanationSource(source.files,extra));
  const missing=new Set(source.directories);missing.delete('src');assert.throws(()=>verifyWrittenExplanationSource(source.files,missing));
});

test('current runtime remains loaded from current source while historical readers return original bytes',async()=>{
  const original=await readPracticalWrittenSource(root);
  assert.notDeepEqual(original.files.get('src/domain.js'),source.files.get('src/domain.js'));
  assert.deepEqual(await fs.readFile(path.join(root,'src/domain.js')),source.files.get('src/domain.js'));
  assert.deepEqual(optionExplanationParagraphs({explanation:'historical option reason'},{explanationMode:'components'}),[]);
  assert.deepEqual(optionExplanationParagraphs({explanation:'historical option reason'}),[{label:null,text:'historical option reason'}]);
  assert.equal(original.files.has('tests/component-explanations.test.mjs'),false);
  assert.equal(source.files.has('tests/component-explanations.test.mjs'),true);
});

test('disk routing cannot fall back after a missing control and rejects links and nested Git metadata',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'written-explanation-source-boundary-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  await writeExactFiles(dir,source.files);
  const control=path.join(dir,writtenExplanationFixturePath);await fs.unlink(control);await assert.rejects(readSuccessor(dir));
  await fs.writeFile(control,source.files.get(writtenExplanationFixturePath));
  await fs.symlink(path.join(dir,'src/app.js'),path.join(dir,'unlisted-link'));await assert.rejects(readSuccessor(dir),/symbolic link/);await fs.unlink(path.join(dir,'unlisted-link'));
  await fs.mkdir(path.join(dir,'src/.git'));await assert.rejects(readSuccessor(dir),/unsafe fixture path/);await fs.rmdir(path.join(dir,'src/.git'));
  await fs.mkdir(path.join(dir,'unlisted-empty-directory'));await assert.rejects(readSuccessor(dir),/directories/);
});
