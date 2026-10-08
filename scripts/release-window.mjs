import fs from 'node:fs/promises';
import path from 'node:path';
import {releaseAllowed,FREEZE_AT} from '../src/domain.js';

// This is only a fresh action-boundary check, never campaign validation or a
// reusable authorization token. The clock cannot be supplied by its caller.
export async function assertCurrentReleaseWindow(root) {
  const state=JSON.parse(await fs.readFile(path.join(root,'data/publication-state.json'),'utf8'));
  const manifest=JSON.parse(await fs.readFile(path.join(root,'data/manifest.json'),'utf8'));
  if(!state||Array.isArray(state)||typeof state!=='object'||typeof state.finalized!=='boolean'||
     !manifest||Array.isArray(manifest)||typeof manifest!=='object'||typeof manifest.finalRelease!=='boolean'||
     manifest.finalRelease||!releaseAllowed({now:Date.now(),finalized:state.finalized,releasedAt:manifest.releasedAt})) {
    throw new Error(`PUBLICATION BLOCKED. Cutoff: ${new Date(FREEZE_AT).toISOString()}; persistent freeze or current release window is invalid.`);
  }
  return manifest;
}
