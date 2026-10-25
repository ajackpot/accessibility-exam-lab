// Test fixture only. Exact current bytes restore the prior 477-file public fixture.
// External run inventories bind this helper and control; neither is runtime authority.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
export const localIntegrationFixturePath='tests/fixtures/local-integration-source-delta.json';
const raw=await fs.readFile(new URL('./fixtures/local-integration-source-delta.json',import.meta.url));
const delta=JSON.parse(raw),hash=b=>createHash('sha256').update(b).digest('hex');
const safe=p=>typeof p==='string'&&/^[A-Za-z0-9._/-]+$/.test(p)&&!p.startsWith('/')&&!p.split('/').some(x=>!x||x==='.'||x==='..'||x==='.git');
const rows=values=>{const out=new Map();for(const row of values){assert.deepEqual(Object.keys(row).sort(),['path','bytes','sha256'].sort());assert(safe(row.path)&&!out.has(row.path));assert(Number.isSafeInteger(row.bytes)&&row.bytes>=0&&/^[a-f0-9]{64}$/.test(row.sha256));out.set(row.path,row);}return out;};
const directoriesFor=paths=>{const out=new Set(['']);for(const p of paths){const a=p.split('/');a.pop();while(a.length){out.add(a.join('/'));a.pop();}}return [...out].sort();};
const exact=(files,inventory)=>{assert.deepEqual([...files.keys()].sort(),[...inventory.keys()].sort());for(const [p,r]of inventory){const b=files.get(p);assert(Buffer.isBuffer(b));assert.equal(b.length,r.bytes,p);assert.equal(hash(b),r.sha256,p);}};
assert.equal(delta.kind,'test_only_exact_local_integration_projection');assert.equal(delta.schemaVersion,1);assert.equal(delta.bootstrapPath,localIntegrationFixturePath);
const before=rows(delta.baselineInventory),current=rows(delta.currentInventory);
assert.equal(before.size,477);assert(!before.has(localIntegrationFixturePath)&&!current.has(localIntegrationFixturePath));
const priorControl='tests/fixtures/written-explanation-source-delta.json';
const priorRaw=await fs.readFile(new URL('./fixtures/written-explanation-source-delta.json',import.meta.url));
assert.equal(hash(priorRaw),delta.baselineControlSha256);assert.equal(hash(priorRaw),before.get(priorControl).sha256);
const prior=JSON.parse(priorRaw),expectedBefore=new Map(prior.currentInventory.map(({path,bytes,sha256})=>[path,{path,bytes,sha256}]));
expectedBefore.set(priorControl,{path:priorControl,bytes:priorRaw.length,sha256:hash(priorRaw)});
assert.deepEqual([...before].sort(),[...expectedBefore].sort());
assert.deepEqual(delta.baselineDirectories,directoriesFor(before.keys()));
assert.deepEqual(delta.currentDirectories,directoriesFor([...current.keys(),localIntegrationFixturePath]));
const changed=new Set(),added=new Set(delta.additions);assert.equal(added.size,delta.additions.length);assert(added.has(localIntegrationFixturePath));
for(const item of delta.changes){assert.deepEqual(Object.keys(item).sort(),['originalBase64','path']);assert(before.has(item.path)&&current.has(item.path)&&!changed.has(item.path));const b=Buffer.from(item.originalBase64,'base64');assert.equal(b.toString('base64'),item.originalBase64);assert.equal(b.length,before.get(item.path).bytes);assert.equal(hash(b),before.get(item.path).sha256);assert.notEqual(current.get(item.path).sha256,before.get(item.path).sha256);changed.add(item.path);}
for(const p of added)assert(safe(p)&&!before.has(p)&&(current.has(p)||p===localIntegrationFixturePath));
assert.deepEqual([...current.keys()].sort(),[...before.keys(),...added].filter(p=>p!==localIntegrationFixturePath).sort());
for(const [p,row]of before)if(!changed.has(p))assert.deepEqual(current.get(p),row);
export function projectLocalIntegrationToPrior(files,directories){
  const control=files.get(localIntegrationFixturePath);
  assert(Buffer.isBuffer(control),'missing local fixture control');
  assert.equal(control.length,raw.length,'local fixture control byte length differs');
  assert(control.equals(raw),'local fixture control bytes differ');
  assert.deepEqual([...directories].sort(),delta.currentDirectories);
  const contents=new Map(files);contents.delete(localIntegrationFixturePath);exact(contents,current);
  for(const item of delta.changes)contents.set(item.path,Buffer.from(item.originalBase64,'base64'));
  for(const p of added)if(p!==localIntegrationFixturePath)assert(contents.delete(p));
  exact(contents,before);return {files:contents,directories:new Set(delta.baselineDirectories)};
}
