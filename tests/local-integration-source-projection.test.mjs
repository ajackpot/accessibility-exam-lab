import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {localIntegrationFixturePath,projectLocalIntegrationToPrior} from './local-integration-source-projection.mjs';
import {verifyWrittenExplanationSource} from './written-explanation-source-projection.mjs';
const root=path.resolve(import.meta.dirname,'..'),files=new Map(),directories=new Set();
async function collect(dir,rel=''){directories.add(rel);for(const e of await fs.readdir(dir,{withFileTypes:true})){if(!rel&&e.name==='.git')continue;assert(!e.isSymbolicLink());const p=rel?rel+'/'+e.name:e.name;if(e.isDirectory())await collect(path.join(dir,e.name),p);else{assert(e.isFile());files.set(p,await fs.readFile(path.join(dir,e.name)));}}}
await collect(root);
test('new local integration restores the exact public prior477 without changing source or history',()=>{
  const snapshot=()=>[...files].map(([p,raw])=>[p,raw.length,createHash('sha256').update(raw).digest('hex')]);
  const original=snapshot();const restored=projectLocalIntegrationToPrior(files,directories);
  assert.equal(restored.files.size,477);verifyWrittenExplanationSource(restored.files,restored.directories);
  assert.deepEqual(snapshot(),original);
  assert.equal(JSON.parse(restored.files.get('data/manifest.json')).bankVersion,'2026.10.22-practical-written.1');
  assert.equal(JSON.parse(files.get('data/manifest.json')).bankVersion,'2026.10.25-written-explanation.local.1');
});
test('local projection rejects a missing or changed bank, registry, control, source, extra path and directory',()=>{
  for(const p of [localIntegrationFixturePath,'data/manifest.json','data/releases/2026.10.25-written-explanation.local.1/bank.json','docs/local-integrations/written-explanation-372.json','scripts/local-written-integration.mjs']){
    const absent=new Map(files);absent.delete(p);assert.throws(()=>projectLocalIntegrationToPrior(absent,directories));
    const changed=new Map(files);changed.set(p,Buffer.concat([changed.get(p),Buffer.from(' ')]));assert.throws(()=>projectLocalIntegrationToPrior(changed,directories));
  }
  const extra=new Map(files);extra.set('unlisted',Buffer.from('x'));assert.throws(()=>projectLocalIntegrationToPrior(extra,directories));
  assert.throws(()=>projectLocalIntegrationToPrior(files,new Set([...directories,'unlisted-directory'])));
});
