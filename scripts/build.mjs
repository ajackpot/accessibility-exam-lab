import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {sha256} from '../src/domain.js';
import {readBankInput} from './bank-io.mjs';

export async function buildBank(root,input) {
  const {raw,bank,manifest:current}=await readBankInput(root,input);
  const dir=path.join(root,'data/releases',bank.bankVersion);await fs.mkdir(dir,{recursive:true});
  const file=path.join(dir,'bank.json');
  try{const previous=await fs.readFile(file,'utf8');if(previous!==raw)throw new Error('Immutable release collision. Change bankVersion before changing published bytes.');}catch(e){if(e.code!=='ENOENT')throw e;await fs.writeFile(file,raw,{flag:'wx'});}
  const manifest={schemaVersion:1,bankVersion:bank.bankVersion,releasedAt:bank.releasedAt,file:`releases/${bank.bankVersion}/bank.json`,sha256:await sha256(raw),changeSummary:bank.changeSummary,finalRelease:current?current.finalRelease:!!bank.finalRelease};
  await fs.writeFile(path.join(root,'data/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return {bank,manifest};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const {bank,manifest}=await buildBank(path.resolve(import.meta.dirname,'..'),process.argv[2]);
  console.log(`Validated ${bank.questions.length} questions; immutable release ${manifest.bankVersion}; SHA-256 ${manifest.sha256}`);
}
