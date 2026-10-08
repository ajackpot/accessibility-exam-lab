import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

// Conservative identity for this invocation. No result is trusted from disk,
// and no dependency selector, skip flag, cache or caller-created proof is used.
export function runtimeIdentity() {
  return {execPath:process.execPath,versions:{...process.versions},platform:process.platform,arch:process.arch};
}
export async function sourceInventory(root) {
  const inventory=[];
  async function visit(relative) {
    const absolute=path.join(root,relative);
    const entry=await fs.lstat(absolute);
    if(entry.isSymbolicLink())throw new Error(`Source snapshot contains a symbolic link: ${relative}`);
    if(entry.isDirectory()) {
      inventory.push({path:relative,kind:'directory'});
      for(const name of (await fs.readdir(absolute)).sort()) {
        // Git administrative data is not application/check input. Every other
        // path, including hidden files, dependencies and empty dirs, is bound.
        if(relative===''&&name==='.git')continue;
        await visit(relative?`${relative}/${name}`:name);
      }
    } else if(entry.isFile()) {
      const bytes=await fs.readFile(absolute);
      inventory.push({path:relative,kind:'file',bytes:bytes.length,mode:entry.mode&0o777,sha256:createHash('sha256').update(bytes).digest('hex')});
    } else throw new Error(`Unsupported source snapshot entry: ${relative}`);
  }
  await visit('');
  return inventory;
}
export function assertSameSnapshot(before,after,beforeRuntime,afterRuntime) {
  if(!Array.isArray(before)||!before.length||!Array.isArray(after)||!after.length||
     !beforeRuntime||!afterRuntime||!isDeepStrictEqual(beforeRuntime,afterRuntime)||
     !isDeepStrictEqual(before,after))throw new Error('Release validation source/runtime changed; result is invalid.');
}
