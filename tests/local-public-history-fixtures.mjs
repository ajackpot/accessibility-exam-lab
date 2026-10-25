/** Owned prior-source fixtures only. These APIs do not authorize the current local bank.
 * Every call authenticates the exact prior 477 public files and creates a fresh module owner.
 * No source, validation result, context or historical clearance is shared across calls. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readWrittenExplanationSource,writeExactFiles} from './successor-projection.mjs';

const installedRoot=path.resolve(import.meta.dirname,'..');
export async function createLocalPublicHistoryFixture(after){
  assert.equal(typeof after,'function','Owned fixture cleanup registration is required');
  const {files}=await readWrittenExplanationSource(installedRoot);
  assert.equal(files.size,477,'Only the exact prior public written-explanation source is a historical fixture');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'local-public-history-'));
  const cleanup=()=>fs.rm(root,{recursive:true,force:true});
  after(cleanup);
  try{await writeExactFiles(root,files);}catch(error){await cleanup();throw error;}
  const baseUrl=pathToFileURL(root+path.sep);
  return {
    root,baseUrl,
    module(relative){
      assert(/^(?:scripts|tests)\/[A-Za-z0-9_-]+\.mjs$/.test(relative),'Only an owned historical module can be imported');
      return import(new URL(relative,baseUrl));
    }
  };
}
