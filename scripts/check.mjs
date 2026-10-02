import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {validateBank,sha256,prepareSession} from '../src/domain.js';
const root=path.resolve(import.meta.dirname,'..');
for(const file of ['domain.js','legacy-materials.js','storage.js','backup.js','workflows.js','app.js'])execFileSync(process.execPath,['--check',path.join(root,'src',file)],{stdio:'inherit'});
const manifest=JSON.parse(await fs.readFile(path.join(root,'data/manifest.json'),'utf8'));const raw=await fs.readFile(path.join(root,'data',manifest.file),'utf8');if(await sha256(raw)!==manifest.sha256)throw new Error('Manifest hash mismatch');const bank=validateBank(JSON.parse(raw));if(manifest.bankVersion!==bank.bankVersion)throw new Error('Manifest version mismatch');
for(const type of ['written','practical'])prepareSession(bank,{type,mode:'untimed',kind:'practice',subjectId:type==='written'?'all':'practical',pool:'all',family:'all',count:type==='written'?10:4,minutes:150,optionCount:5,feedbackAfter:'confirm'},[],1,'smoke-session');
const html=await fs.readFile(path.join(root,'index.html'),'utf8');if(!html.includes('lang="ko"')||!html.includes('role="status"')||!html.includes('Content-Security-Policy'))throw new Error('Accessible shell checks missing');
for(const file of ['app.js','domain.js','legacy-materials.js','storage.js','backup.js','workflows.js']){const content=await fs.readFile(path.join(root,'src',file),'utf8');if(/\b(?:eval|new Function)\s*\(|\.innerHTML\s*=|insertAdjacentHTML/.test(content))throw new Error(`Unsafe text execution sink in ${file}`);}
console.log('Syntax, source contracts, manifest hash, prepared sessions, Korean shell and no-eval/no-innerHTML checks passed.');
