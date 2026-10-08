import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {runtimeIdentity,sourceInventory,assertSameSnapshot} from '../scripts/source-snapshot.mjs';
import {assertCurrentReleaseWindow} from '../scripts/release-window.mjs';
import {FREEZE_AT} from '../src/domain.js';

async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'release-validation-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'data'));
  await fs.writeFile(path.join(root,'data/manifest.json'),JSON.stringify({releasedAt:'2026-10-01T00:00:00Z',finalRelease:false}));
  await fs.writeFile(path.join(root,'data/publication-state.json'),JSON.stringify({finalized:false}));
  return root;
}
test('snapshot binds changed hash, removed file, added glob membership and empty directories',async t=>{
  const root=await fixture(t),runtime=runtimeIdentity(),before=await sourceInventory(root);
  assert.doesNotThrow(()=>assertSameSnapshot(before,structuredClone(before),runtime,runtimeIdentity()));
  const file=path.join(root,'data/manifest.json'),raw=await fs.readFile(file);
  await fs.writeFile(file,Buffer.concat([raw,Buffer.from(' ')]));
  let after=await sourceInventory(root);
  assert.throws(()=>assertSameSnapshot(before,after,runtime,runtime),/source\/runtime changed/);
  await fs.writeFile(file,raw);await fs.unlink(path.join(root,'data/publication-state.json'));
  after=await sourceInventory(root);assert.throws(()=>assertSameSnapshot(before,after,runtime,runtime));
  await fs.writeFile(path.join(root,'data/publication-state.json'),JSON.stringify({finalized:false}));
  await fs.mkdir(path.join(root,'new-glob'));after=await sourceInventory(root);
  assert.throws(()=>assertSameSnapshot(before,after,runtime,runtime));
});
test('missing snapshot and changed runtime cannot authenticate a result',()=>{
  const snapshot=[{path:'',kind:'directory'}],runtime=runtimeIdentity();
  for(const before of [undefined,null,[],{}])assert.throws(()=>assertSameSnapshot(before,snapshot,runtime,runtime));
  assert.throws(()=>assertSameSnapshot(snapshot,snapshot,runtime,{...runtime,arch:'wrong-runtime'}));
  assert.throws(()=>assertSameSnapshot(snapshot,snapshot,undefined,runtime));
});
test('symlink source paths are rejected',async t=>{
  const root=await fixture(t);await fs.symlink('data/manifest.json',path.join(root,'alias'));
  await assert.rejects(sourceInventory(root),/symbolic link/);
});
test('both freeze markers and fresh time block after an earlier successful boundary',async t=>{
  const root=await fixture(t);t.mock.method(Date,'now',()=>FREEZE_AT-1000);
  await assertCurrentReleaseWindow(root);
  await fs.writeFile(path.join(root,'data/publication-state.json'),JSON.stringify({finalized:true}));
  await assert.rejects(assertCurrentReleaseWindow(root),/PUBLICATION BLOCKED/);
  await fs.writeFile(path.join(root,'data/publication-state.json'),JSON.stringify({finalized:false}));
  const file=path.join(root,'data/manifest.json'),manifest=JSON.parse(await fs.readFile(file));
  await fs.writeFile(file,JSON.stringify({...manifest,finalRelease:true}));
  await assert.rejects(assertCurrentReleaseWindow(root),/PUBLICATION BLOCKED/);
  await fs.writeFile(file,JSON.stringify(manifest));
  Date.now.mock.mockImplementation(()=>FREEZE_AT);
  await assert.rejects(assertCurrentReleaseWindow(root),/PUBLICATION BLOCKED/);
});
test('malformed or missing manifest is not boundary authorization',async t=>{
  const root=await fixture(t);t.mock.method(Date,'now',()=>FREEZE_AT-1000);
  await fs.writeFile(path.join(root,'data/manifest.json'),JSON.stringify({releasedAt:'2026-10-01T00:00:00Z'}));
  await assert.rejects(assertCurrentReleaseWindow(root),/PUBLICATION BLOCKED/);
  await fs.unlink(path.join(root,'data/manifest.json'));await assert.rejects(assertCurrentReleaseWindow(root),/ENOENT/);
});
test('orchestrator rejects caller skip, proof and clock inputs before loading a context',()=>{
  const script=path.resolve(import.meta.dirname,'../scripts/validate-release.mjs');
  for(const flag of ['--skip-validation','--proof=fake.json','--now=2026-10-01T00:00:00Z']) {
    const result=spawnSync(process.execPath,[script,flag],{encoding:'utf8'});
    assert.notEqual(result.status,0);assert.match(result.stderr,/no arguments or reusable proof inputs/);
  }
});

test('missing state or absent/malformed finalized marker fails closed',async t=>{
  const root=await fixture(t);t.mock.method(Date,'now',()=>FREEZE_AT-1000);
  const file=path.join(root,'data/publication-state.json');
  for(const state of [{},{finalized:'false'},{finalized:0},null,[]]) {
    await fs.writeFile(file,JSON.stringify(state));
    await assert.rejects(assertCurrentReleaseWindow(root),/PUBLICATION BLOCKED/);
  }
  await fs.unlink(file);await assert.rejects(assertCurrentReleaseWindow(root),/ENOENT/);
});
