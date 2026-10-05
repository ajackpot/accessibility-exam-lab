import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {gitBlobSha,prepareShaOnlyTreeRequest,validateShaOnlyTreeRequest} from '../scripts/sha-only-tree.mjs';
const bytes=Buffer.from('검토된 원문\n'),file={path:'docs/reviewed.txt',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),gitBlob:gitBlobSha(bytes)};
const options={baseTree:'a'.repeat(40),reviewedChanges:[file],confirmedBlobShas:[file.gitBlob]},request={base_tree:options.baseTree,tree:[{path:file.path,mode:'100644',type:'blob',sha:file.gitBlob}]};
test('SHA-only transport accepts exact verified blob identities without claiming publication clearance',()=>{
 const result=validateShaOnlyTreeRequest(request,options);assert.equal(result.ok,true);assert.equal(result.publicationClearance,false);assert.equal(result.requestBytes,Buffer.byteLength(JSON.stringify(request)));
});
test('SHA-only transport rejects inline content, unknown or altered SHAs, duplicate paths, deletions and extra fields',()=>{
 for(const mutate of [r=>r.tree[0].content=bytes.toString(),r=>delete r.tree[0].sha,r=>r.tree[0].sha=null,r=>r.tree[0].sha='b'.repeat(40),r=>r.tree[0].mode='100755',r=>r.tree[0].type='tree',r=>r.tree.push({...r.tree[0]}),r=>r.base_tree='b'.repeat(40),r=>r.force=true]){const r=structuredClone(request);mutate(r);assert.throws(()=>validateShaOnlyTreeRequest(r,options));}
 assert.throws(()=>validateShaOnlyTreeRequest(request,{...options,confirmedBlobShas:[]}));
 for(const bad of ['../private','/private','a//b','a/../b','a\\b','a\0b'])assert.throws(()=>validateShaOnlyTreeRequest(request,{...options,reviewedChanges:[{...file,path:bad}]}));
 assert.throws(()=>validateShaOnlyTreeRequest(request,{...options,reviewedChanges:[file,file]}));
});
test('SHA-only preparation verifies actual bytes and refuses changed files or symlinks',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sha-only-tree-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'docs'));const p=path.join(root,file.path);await fs.writeFile(p,bytes);
 assert.deepEqual(await prepareShaOnlyTreeRequest({root,...options}),request);assert.deepEqual(await fs.readFile(p),bytes);
 await fs.appendFile(p,' ');await assert.rejects(prepareShaOnlyTreeRequest({root,...options}),/mismatch/);
 await fs.unlink(p);await fs.writeFile(path.join(root,'original.txt'),bytes);await fs.symlink('../original.txt',p);await assert.rejects(prepareShaOnlyTreeRequest({root,...options}),/regular files/);
});
