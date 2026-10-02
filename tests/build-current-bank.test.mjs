import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {buildBank} from '../scripts/build.mjs';
import {readBankInput} from '../scripts/bank-io.mjs';
import {sha256} from '../src/domain.js';
const seedRaw=await fs.readFile(new URL('../data/seed-bank-v4.json',import.meta.url),'utf8');
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'exam-bank-build-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'data'),{recursive:true});
  await fs.writeFile(path.join(root,'data/seed-bank-v4.json'),seedRaw);
  // Historical content is carried from an integrity-checked active release.
  const bank=JSON.parse(seedRaw),file=`releases/${bank.bankVersion}/bank.json`;
  await fs.mkdir(path.join(root,'data/releases',bank.bankVersion),{recursive:true});
  await fs.writeFile(path.join(root,'data',file),seedRaw);
  await fs.writeFile(path.join(root,'data/manifest.json'),JSON.stringify({schemaVersion:1,bankVersion:bank.bankVersion,releasedAt:bank.releasedAt,file,sha256:await sha256(seedRaw),changeSummary:bank.changeSummary,finalRelease:false}));
  return root;
}
test('default build preserves the manifest-selected cumulative release and all immutable bytes',async t=>{
  const root=await fixture(t),bank=JSON.parse(seedRaw);bank.bankVersion='fixture-cumulative.1';bank.changeSummary='Synthetic regression fixture, never a public learning question.';
  const input=path.join(root,'candidate.json');await fs.writeFile(input,JSON.stringify(bank,null,2)+'\n');
  const first=await buildBank(root,input),before=await fs.readFile(path.join(root,'data',first.manifest.file),'utf8');
  const repeat=await buildBank(root);assert.equal(repeat.manifest.bankVersion,'fixture-cumulative.1');assert.deepEqual(repeat.manifest,first.manifest);
  assert.equal(await fs.readFile(path.join(root,'data',first.manifest.file),'utf8'),before);assert.equal(await fs.readFile(path.join(root,'data/seed-bank-v4.json'),'utf8'),seedRaw);
  assert.equal((await readBankInput(root)).bank.bankVersion,'fixture-cumulative.1');
});
test('default build preserves a final manifest marker without rewriting bank content',async t=>{
  const root=await fixture(t),first=await buildBank(root,path.join(root,'data/seed-bank-v4.json'));first.manifest.finalRelease=true;
  await fs.writeFile(path.join(root,'data/manifest.json'),JSON.stringify(first.manifest,null,2)+'\n');
  assert.equal((await buildBank(root)).manifest.finalRelease,true);
  assert.equal(await fs.readFile(path.join(root,'data',first.manifest.file),'utf8'),seedRaw);
});
test('missing, traversing or corrupted active manifest fails closed instead of reverting to seeds',async t=>{
  const root=await fixture(t),original=await fs.readFile(path.join(root,'data/manifest.json'),'utf8');await fs.unlink(path.join(root,'data/manifest.json'));await assert.rejects(buildBank(root),/ENOENT/);await fs.writeFile(path.join(root,'data/manifest.json'),original);
  const {manifest}=await buildBank(root,path.join(root,'data/seed-bank-v4.json'));
  await fs.writeFile(path.join(root,'data/manifest.json'),JSON.stringify({...manifest,file:'../candidate.json'}));await assert.rejects(buildBank(root),/release path/);
  await fs.writeFile(path.join(root,'data/manifest.json'),JSON.stringify({...manifest,sha256:'0'.repeat(64)}));await assert.rejects(buildBank(root),/hash mismatch/);
  await fs.writeFile(path.join(root,'data/manifest.json'),JSON.stringify({...manifest,releasedAt:'2000-01-01T00:00:00Z'}));await assert.rejects(buildBank(root),/release time mismatch/);
});
test('an explicit candidate cannot overwrite an immutable release or change the active manifest on collision',async t=>{
  const root=await fixture(t),{manifest}=await buildBank(root,path.join(root,'data/seed-bank-v4.json'));
  const input=path.join(root,'changed.json');await fs.writeFile(input,seedRaw+' ');
  await assert.rejects(buildBank(root,input),/Immutable release collision/);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,'data/manifest.json'),'utf8')),manifest);
  assert.equal(await fs.readFile(path.join(root,'data',manifest.file),'utf8'),seedRaw);
});

test('default build refuses malformed manifest envelope without changing bytes',async t=>{
  const root=await fixture(t),{manifest}=await buildBank(root,path.join(root,'data/seed-bank-v4.json'));
  for(const mutation of [{schemaVersion:2},{schemaVersion:undefined},{finalRelease:'false'},{finalRelease:undefined},{finalRelease:0},{changeSummary:null},{changeSummary:''},{changeSummary:'different summary'}]) {
    const raw=JSON.stringify({...manifest,...mutation});await fs.writeFile(path.join(root,'data/manifest.json'),raw);
    await assert.rejects(buildBank(root),/schema, summary or finalRelease|summary mismatch/);
    assert.equal(await fs.readFile(path.join(root,'data/manifest.json'),'utf8'),raw);
    assert.equal(await fs.readFile(path.join(root,'data',manifest.file),'utf8'),seedRaw);
  }
});
