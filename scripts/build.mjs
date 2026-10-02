import fs from 'node:fs/promises';
import path from 'node:path';
import {validateBankForPublication,sha256} from '../src/domain.js';
const root=path.resolve(import.meta.dirname,'..');
const input=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'data/seed-bank-v3.json');
const raw=await fs.readFile(input,'utf8');const bank=validateBankForPublication(JSON.parse(raw));
const dir=path.join(root,'data/releases',bank.bankVersion);await fs.mkdir(dir,{recursive:true});
const file=path.join(dir,'bank.json');
try{const previous=await fs.readFile(file,'utf8');if(previous!==raw)throw new Error('Immutable release collision. Change bankVersion before changing published bytes.');}catch(e){if(e.code!=='ENOENT')throw e;await fs.writeFile(file,raw);}
const manifest={schemaVersion:1,bankVersion:bank.bankVersion,releasedAt:bank.releasedAt,file:`releases/${bank.bankVersion}/bank.json`,sha256:await sha256(raw),changeSummary:bank.changeSummary,finalRelease:!!bank.finalRelease};
await fs.writeFile(path.join(root,'data/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Validated ${bank.questions.length} questions; immutable release ${manifest.bankVersion}; SHA-256 ${manifest.sha256}`);
