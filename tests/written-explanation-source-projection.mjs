// Test setup only. The complete external source inventory must independently
// bind this helper and its bootstrap before/after execution. No runtime gate,
// historical authority, publication decision or source allowlist is changed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';

export const writtenExplanationFixturePath='tests/fixtures/written-explanation-source-delta.json';
const raw=await fs.readFile(new URL('./fixtures/written-explanation-source-delta.json',import.meta.url));
const delta=JSON.parse(raw);
const hash=value=>createHash('sha256').update(value).digest('hex');
const blob=value=>createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${value.length}\0`),value])).digest('hex');
const safe=p=>typeof p==='string'&&/^[A-Za-z0-9._/-]+$/.test(p)&&!p.startsWith('/')&&!p.split('/').some(v=>!v||v==='.'||v==='..'||v==='.git'||v==='private');
const sameKeys=(files,keys)=>assert.deepEqual([...files.keys()].sort(),[...keys].sort(),'exact written-explanation source membership required');
function exact(value,row){
  assert(Buffer.isBuffer(value),'missing source: '+row.path);
  assert.equal(value.length,row.bytes,row.path+': byte length');
  assert.equal(hash(value),row.sha256,row.path+': SHA256');
  assert.equal(blob(value),row.gitBlob,row.path+': Git blob');
}
function rowsMap(rows){
  assert(Array.isArray(rows));const result=new Map();
  for(const row of rows){
    assert.deepEqual(Object.keys(row).sort(),['bytes','gitBlob','path','sha256']);
    assert(safe(row.path)&&!result.has(row.path));assert(Number.isSafeInteger(row.bytes)&&row.bytes>=0);
    assert(/^[a-f0-9]{64}$/.test(row.sha256)&&/^[a-f0-9]{40}$/.test(row.gitBlob));result.set(row.path,row);
  }
  assert.equal(new Set([...result.keys()].map(p=>p.toLowerCase())).size,result.size,'case-colliding source paths');return result;
}
function directoriesFor(rows,controlPath=null){
  const dirs=new Set(['']);
  for(const p of [...rows.keys(),...(controlPath?[controlPath]:[])]){
    const parts=p.split('/');parts.pop();while(parts.length){dirs.add(parts.join('/'));parts.pop();}
  }
  return [...dirs].sort();
}

assert.deepEqual(Object.keys(delta).sort(),['schemaVersion','kind','bootstrapPath','baselineCommit','baseFixturePath','baseFixtureSha256','trustBoundary','baselineInventory','baselineDirectories','currentInventory','currentDirectories','changes','additions'].sort());
assert.equal(delta.schemaVersion,1);assert.equal(delta.kind,'test_only_exact_source_projection');
assert.equal(delta.bootstrapPath,writtenExplanationFixturePath);
assert.equal(delta.baselineCommit,'55b8a16b63bf41707e33566a4d3b8a5ab00cc8f0');
assert.equal(delta.baseFixturePath,'tests/fixtures/practical-written-source-delta.json');
assert.equal(delta.baseFixtureSha256,'14566ee8836d93d3763aafd1a360bae79580ab903a34dce4fbd457833d77997c');
assert.equal(delta.trustBoundary,'Test setup only; external complete source and runtime evidence must independently bind this bootstrap and executed helper.');
const predecessorRaw=await fs.readFile(new URL('./fixtures/practical-written-source-delta.json',import.meta.url));
assert.equal(hash(predecessorRaw),delta.baseFixtureSha256,'original practical-written bootstrap changed');
const predecessor=JSON.parse(predecessorRaw),baseline=rowsMap(delta.baselineInventory),current=rowsMap(delta.currentInventory);
const expectedBaseline=rowsMap(predecessor.currentInventory);
expectedBaseline.set(delta.baseFixturePath,{path:delta.baseFixturePath,bytes:predecessorRaw.length,sha256:hash(predecessorRaw),gitBlob:blob(predecessorRaw)});
assert.equal(baseline.size,470);assert.deepEqual([...baseline].sort(),[...expectedBaseline].sort(),'baseline must be the exact original 470-file source');
assert.deepEqual(delta.baselineDirectories,predecessor.currentDirectories);
assert(!baseline.has(writtenExplanationFixturePath)&&!current.has(writtenExplanationFixturePath));
assert.deepEqual(delta.baselineDirectories,directoriesFor(baseline));
assert.deepEqual(delta.currentDirectories,directoriesFor(current,writtenExplanationFixturePath));
for(const [rows,dirs]of [[baseline,delta.baselineDirectories],[current,delta.currentDirectories]]){
  assert.equal(new Set(dirs.map(p=>p.toLowerCase())).size,dirs.length);
  for(const p of dirs)assert(!rows.has(p)&&p!==writtenExplanationFixturePath,'file/directory collision');
}
const changed=new Set(),added=new Set(delta.additions);
assert.equal(added.size,delta.additions.length);assert(delta.additions.every(safe));assert(added.has(writtenExplanationFixturePath));
for(const item of delta.changes){
  assert.deepEqual(Object.keys(item).sort(),['originalBase64','path']);
  assert(baseline.has(item.path)&&current.has(item.path)&&!changed.has(item.path));
  const original=Buffer.from(item.originalBase64,'base64');assert.equal(original.toString('base64'),item.originalBase64);
  exact(original,baseline.get(item.path));assert.notEqual(current.get(item.path).sha256,baseline.get(item.path).sha256);changed.add(item.path);
}
for(const p of added)assert(!baseline.has(p)&&(current.has(p)||p===writtenExplanationFixturePath));
sameKeys(current,[...baseline.keys(),...added].filter(p=>p!==writtenExplanationFixturePath));
for(const [p,row]of baseline)if(!changed.has(p))assert.deepEqual(current.get(p),row,'undeclared source change: '+p);

export function verifyWrittenExplanationSource(files,directories){
  assert(files instanceof Map&&directories instanceof Set);
  sameKeys(files,[...current.keys(),writtenExplanationFixturePath]);
  assert.deepEqual(files.get(writtenExplanationFixturePath),raw,'written-explanation bootstrap differs from loaded control');
  assert.deepEqual([...directories].sort(),delta.currentDirectories,'exact written-explanation directories required');
  for(const [p,row]of current)exact(files.get(p),row);
}
export function projectWrittenExplanationToPracticalWritten(files,directories){
  verifyWrittenExplanationSource(files,directories);
  const restored=new Map([...files].map(([p,value])=>[p,Buffer.from(value)]));
  for(const {path:p,originalBase64}of delta.changes)restored.set(p,Buffer.from(originalBase64,'base64'));
  for(const p of added)assert(restored.delete(p),'missing declared source addition: '+p);
  sameKeys(restored,baseline.keys());for(const [p,row]of baseline)exact(restored.get(p),row);
  return {files:restored,directories:new Set(delta.baselineDirectories)};
}
