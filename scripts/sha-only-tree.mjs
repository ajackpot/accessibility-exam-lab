/** Read-only transport preflight. No Git/network writes, permission decisions,
 * unknown-outcome retries, ref updates, or publication clearance. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const sha1=/^[a-f0-9]{40}$/,sha256=/^[a-f0-9]{64}$/;
const digest=(algorithm,b)=>createHash(algorithm).update(b).digest('hex');
export const gitBlobSha=b=>digest('sha1',Buffer.concat([Buffer.from(`blob ${b.length}\0`),b]));
function safePath(value){
 if(typeof value!=='string'||!value||value.includes('\\')||/[\x00-\x1f\x7f]/.test(value)||value.split('/').some(p=>!p||p==='.'||p==='..')||value.startsWith('/'))throw Error('Unsafe reviewed public path');
 return value;
}
function expectedEntries(changes,confirmedBlobShas){
 if(!Array.isArray(changes)||!changes.length||!Array.isArray(confirmedBlobShas)||confirmedBlobShas.some(s=>!sha1.test(s)))throw Error('Exact reviewed changes and confirmed blob SHAs required');
 const confirmed=new Set(confirmedBlobShas),seen=new Set();
 return changes.map(f=>{
  safePath(f.path);
  if(seen.has(f.path))throw Error('Duplicate reviewed public path');seen.add(f.path);
  if(!Number.isSafeInteger(f.bytes)||f.bytes<0||!sha256.test(f.sha256)||!sha1.test(f.gitBlob)||!confirmed.has(f.gitBlob))throw Error('Missing reviewed metadata or confirmed Git blob');
  return {path:f.path,mode:'100644',type:'blob',sha:f.gitBlob};
 });
}
/** Confirmed SHA inputs must come from checked remote reads/create_blob results.
 * This pure shape check cannot establish whether a remote observation is true. */
export function validateShaOnlyTreeRequest(request,{baseTree,reviewedChanges,confirmedBlobShas}){
 if(!sha1.test(baseTree))throw Error('Exact base tree SHA required');
 const expected={base_tree:baseTree,tree:expectedEntries(reviewedChanges,confirmedBlobShas)};
 if(!isDeepStrictEqual(request,expected))throw Error('Tree request must contain only exact reviewed SHA-only entries; inline content, deletions and extra fields are forbidden');
 return {ok:true,entryCount:expected.tree.length,requestBytes:Buffer.byteLength(JSON.stringify(request)),publicationClearance:false};
}
/** Recheck frozen bytes immediately before constructing a SHA-only request.
 * Existing immutable bytes are never rewritten or redacted by this helper. */
export async function prepareShaOnlyTreeRequest({root,baseTree,reviewedChanges,confirmedBlobShas}){
 const request={base_tree:baseTree,tree:expectedEntries(reviewedChanges,confirmedBlobShas)};
 for(let p=path.resolve(root);;p=path.dirname(p)){if((await fs.lstat(p)).isSymbolicLink())throw Error('Source root cannot be a symlink');if(path.dirname(p)===p)break;}
 for(const f of reviewedChanges){
  let p=path.resolve(root);const parts=safePath(f.path).split('/');
  for(const [i,part] of parts.entries()){p=path.join(p,part);const st=await fs.lstat(p);if(st.isSymbolicLink()||(i===parts.length-1?!st.isFile():!st.isDirectory()))throw Error('Reviewed source requires regular files and directories');}
  const b=await fs.readFile(p);
  if(b.length!==f.bytes||digest('sha256',b)!==f.sha256||gitBlobSha(b)!==f.gitBlob)throw Error('Reviewed source byte length, SHA-256 or Git blob SHA mismatch');
 }
 validateShaOnlyTreeRequest(request,{baseTree,reviewedChanges,confirmedBlobShas});
 return request;
}
