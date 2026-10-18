import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {RUNTIME_ASSETS,collectRuntimeAssets,validateRuntimeDestination,writeRuntimeOutput} from '../scripts/build-runtime.mjs';

const root=path.resolve(import.meta.dirname,'..');
async function fixture(t) {
  const parent=await fs.mkdtemp(path.join(os.tmpdir(),'runtime-output-test-'));
  t.after(()=>fs.rm(parent,{recursive:true,force:true}));
  const source=path.join(parent,'source');await fs.mkdir(source);
  const raw=Buffer.from('{"localFixture":true}\n');
  const manifest={schemaVersion:1,bankVersion:'fixture.1',file:'releases/fixture.1/bank.json',sha256:createHash('sha256').update(raw).digest('hex')};
  for(const relative of [...RUNTIME_ASSETS,'data/manifest.json',`data/${manifest.file}`]) {
    const target=path.join(source,relative);await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.writeFile(target,relative==='data/manifest.json'?JSON.stringify(manifest):relative===`data/${manifest.file}`?raw:relative);
  }
  return {parent,source,manifest};
}

test('runtime selection preserves the active manifest, bank and exact 14 functional assets',async()=>{
  const selected=await collectRuntimeAssets(root);
  assert.equal(selected.files.length,14);
  assert.deepEqual(new Set(selected.files.map(file=>file.path)),new Set([...RUNTIME_ASSETS,'data/manifest.json',`data/${selected.manifest.file}`]));
  for(const file of selected.files)assert.deepEqual(file.raw,await fs.readFile(path.join(root,file.path)));
  assert.equal(selected.files.filter(file=>file.path.startsWith('data/releases/')).length,1);
  assert(selected.files.some(file=>file.path==='docs/NVDA-CHECKLIST.md'));
});

test('selection rejects unsafe active paths, manifest identity and bank hash before output',async t=>{
  const {source,manifest}=await fixture(t);
  for(const bad of [{...manifest,file:'../../outside.json'},{...manifest,file:'/absolute.json'},{...manifest,file:'https://example.invalid/bank.json'},{...manifest,file:'releases\\fixture.1\\bank.json'},{...manifest,bankVersion:'../fixture.1'},{...manifest,sha256:'f'.repeat(64)}]) {
    await fs.writeFile(path.join(source,'data/manifest.json'),JSON.stringify(bad));
    await assert.rejects(collectRuntimeAssets(source),/Invalid active runtime manifest|bank hash mismatch/);
  }
});

test('selection rejects symlinked assets, symlinked source and hardlinked assets',async t=>{
  const {source,parent}=await fixture(t),asset=path.join(source,'style.css'),saved=path.join(parent,'style-original');
  await fs.rename(asset,saved);await fs.symlink(saved,asset);
  await assert.rejects(collectRuntimeAssets(source),/plain, unlinked file/);
  await fs.unlink(asset);await fs.link(saved,asset);
  await assert.rejects(collectRuntimeAssets(source),/plain, unlinked file/);
  const alias=path.join(parent,'source-alias');await fs.symlink(source,alias,'dir');
  await assert.rejects(collectRuntimeAssets(alias),/plain directory/);
});

test('destination rejects overlap, existing trees and symlink parents without changing them',async t=>{
  const {source,parent}=await fixture(t),existing=path.join(parent,'existing'),alias=path.join(parent,'alias');
  await fs.mkdir(existing);await fs.writeFile(path.join(existing,'keep'),'preserved');await fs.symlink(existing,alias,'dir');
  for(const output of [source,path.join(source,'dist'),parent,existing])await assert.rejects(writeRuntimeOutput(source,output),/overlap|already exists/);
  await assert.rejects(validateRuntimeDestination(source,path.join(alias,'child')),/plain directory/);
  await assert.rejects(validateRuntimeDestination(source,''),/required/);
  assert.equal(await fs.readFile(path.join(existing,'keep'),'utf8'),'preserved');
  assert.equal(await validateRuntimeDestination(source,path.join(parent,'fresh')),path.join(parent,'fresh'));
});

test('every static module import and linked local shell asset is present with original query URLs',async()=>{
  const {files}=await collectRuntimeAssets(root),paths=new Set(files.map(file=>file.path));
  const resolve=(from,specifier)=>new URL(specifier,new URL(from,'https://runtime.invalid/')).pathname.slice(1);
  for(const file of files.filter(file=>file.path.endsWith('.js'))) {
    for(const match of file.raw.toString('utf8').matchAll(/\b(?:import|export)\s+(?:[^;]*?\s+from\s+)?['"]([^'"]+)['"]/g))assert(paths.has(resolve(file.path,match[1])),`${file.path} -> ${match[1]}`);
  }
  const html=files.find(file=>file.path==='index.html').raw.toString('utf8');
  for(const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g))assert(paths.has(resolve('index.html',match[1])),match[1]);
  assert.match(html,/src\/app\.js\?v=0\.2\.10&pool=priority-001/);
  assert.match(files.find(file=>file.path==='src/app.js').raw.toString('utf8'),/docs\/NVDA-CHECKLIST\.md/);
});
