// Test-owned bootstrap. The external reviewed source inventory must bind this
// module AND the delta JSON before/after a run. Reading bytes here detects map
// mutation; it is not self-authentication or publication/gate authority.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const fixturePath='tests/fixtures/coverage-successor-delta.json';
const fixtureRaw=await fs.readFile(new URL('./fixtures/coverage-successor-delta.json',import.meta.url));
const delta=JSON.parse(fixtureRaw);
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const blob=raw=>createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${raw.length}\0`),raw])).digest('hex');
const safe=p=>typeof p==='string'&&/^[A-Za-z0-9._/-]+$/.test(p)&&!p.startsWith('/')&&!p.split('/').some(v=>!v||v==='.'||v==='..'||v==='.git'||v==='private');
const sameKeys=(files,keys)=>assert.deepEqual([...files.keys()].sort(),[...keys].sort(),'exact source membership required');
function exact(raw,row){
  assert(Buffer.isBuffer(raw),`missing ${row.path}`);
  assert.equal(raw.length,row.bytes,`${row.path}: byte length`);
  assert.equal(hash(raw),row.sha256,`${row.path}: SHA256`);
  assert.equal(blob(raw),row.gitBlob,`${row.path}: Git blob`);
}
function rowsMap(rows){
  const result=new Map();
  for(const row of rows){
    assert.deepEqual(Object.keys(row).sort(),['bytes','gitBlob','path','sha256']);
    assert(safe(row.path));assert(!result.has(row.path),'duplicate fixture ownership');
    assert(Number.isSafeInteger(row.bytes)&&row.bytes>=0);
    assert(/^[a-f0-9]{64}$/.test(row.sha256));assert(/^[a-f0-9]{40}$/.test(row.gitBlob));
    result.set(row.path,row);
  }
  return result;
}
assert.equal(delta.schemaVersion,1);
assert.equal(delta.baseCommit,'9ae76b4359e5596367c75242e3fa2b850e19ce9b');
assert.equal(delta.bootstrapPath,fixturePath);
const original=rowsMap(delta.originalInventory),successor=rowsMap(delta.successorInventory);
assert.equal(original.size,385);assert(!original.has(fixturePath));assert(!successor.has(fixturePath));
const changed=new Set(),added=new Set();
for(const item of delta.changes){
  assert.deepEqual(Object.keys(item).sort(),['originalBase64','path']);
  assert(original.has(item.path)&&successor.has(item.path));assert(!changed.has(item.path));
  const raw=Buffer.from(item.originalBase64,'base64');assert.equal(raw.toString('base64'),item.originalBase64);
  exact(raw,original.get(item.path));changed.add(item.path);
}
for(const p of delta.additions){assert(safe(p)&&!original.has(p)&&!added.has(p));assert(successor.has(p)||p===fixturePath);added.add(p);}
assert(added.has(fixturePath));
sameKeys(successor,[...original.keys(),...added].filter(p=>p!==fixturePath));
for(const [p,row] of original)if(!changed.has(p))assert.deepEqual(successor.get(p),row,`undeclared change ${p}`);

function allowlist(files){
  const raw=files.get('PUBLICATION-MANIFEST.txt');assert(Buffer.isBuffer(raw));
  const paths=raw.toString().split('\n').filter(p=>p&&!p.startsWith('#'));
  assert(paths.every(safe));assert.equal(new Set(paths).size,paths.length);sameKeys(files,paths);
}
export function verifySuccessor(files){
  assert(files instanceof Map);sameKeys(files,[...successor.keys(),fixturePath]);
  assert.deepEqual(files.get(fixturePath),fixtureRaw,'fixture control bytes differ from loaded bootstrap');
  for(const [p,row] of successor)exact(files.get(p),row);
  allowlist(files);
}
export function projectRegistration385(files){
  verifySuccessor(files); // Verify every new byte BEFORE any old opaque exception.
  const restored=new Map([...files].map(([p,raw])=>[p,Buffer.from(raw)]));
  for(const {path:p,originalBase64} of delta.changes)restored.set(p,Buffer.from(originalBase64,'base64'));
  for(const p of added)assert(restored.delete(p),`missing declared addition ${p}`);
  sameKeys(restored,original.keys());
  for(const [p,row] of original)exact(restored.get(p),row);
  allowlist(restored);return restored;
}
export function syntheticSuccessor(historical,source){
  verifySuccessor(source);
  const files=new Map([...historical].map(([p,raw])=>[p,Buffer.from(raw)]));
  for(const p of [...changed,...added]){
    if(p==='PUBLICATION-MANIFEST.txt')continue;
    assert(!changed.has(p)||files.has(p),`changed path absent from historical context ${p}`);
    assert(!added.has(p)||!files.has(p),`synthetic addition collision ${p}`);
    files.set(p,Buffer.from(source.get(p)));
  }
  files.set('PUBLICATION-MANIFEST.txt',Buffer.from('# Synthetic successor test payload; never actual publication evidence.\n'+[...files.keys()].sort().join('\n')+'\n'));
  allowlist(files);return files;
}
async function collectFiles(root,allowRootGitMetadata=false){
  root=root instanceof URL?fileURLToPath(root):root;
  const files=new Map();
  async function walk(dir,prefix=''){
    for(const entry of await fs.readdir(dir,{withFileTypes:true})){
      const p=prefix+entry.name,full=path.join(dir,entry.name);
      assert(!entry.isSymbolicLink(),`symbolic link ${p}`);
      // A normal checkout may have a .git directory or worktree pointer file.
      // Only readSuccessor excludes this root metadata; disposable maps remain
      // strict, and every other unlisted file (including nested .git) fails.
      if(allowRootGitMetadata&&!prefix&&entry.name==='.git'){
        assert(entry.isDirectory()||entry.isFile());continue;
      }
      assert(safe(p),`unsafe fixture path ${p}`);
      if(entry.isDirectory())await walk(full,p+'/');
      else {assert(entry.isFile(),`non-regular file ${p}`);files.set(p,await fs.readFile(full));}
    }
  }
  await walk(root);return files;
}
export async function readExactFiles(root){return collectFiles(root);}
export async function readSuccessor(root){const files=await collectFiles(root,true);verifySuccessor(files);return files;}
export async function writeExactFiles(root,files){
  assert.equal((await fs.readdir(root)).length,0,'fixture destination must be empty');
  for(const [p,raw] of files){assert(safe(p));const full=path.join(root,p);await fs.mkdir(path.dirname(full),{recursive:true});await fs.writeFile(full,raw,{mode:0o644});}
  await assertExactFiles(root,files);
}
export async function assertExactFiles(root,expected){
  const actual=await readExactFiles(root);sameKeys(actual,expected.keys());
  for(const [p,raw] of expected)assert.deepEqual(actual.get(p),raw,`disposable disk mismatch ${p}`);
}
