import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {validateBankForPublication,sha256,prepareSession} from '../src/domain.js';

// Lightweight source checks only. This is not release authorization.
export async function checkSources(root) {
const runtimeFiles=['domain.js','legacy-materials.js','legacy-question-display.js','reviewed-option-explanations.js','storage.js','backup.js','workflows.js','app.js'];
if((await fs.readFile(path.join(root,'src/domain.js'),'utf8')).includes('new-session-eligibility.js'))runtimeFiles.push('new-session-eligibility.js');
for(const file of runtimeFiles)execFileSync(process.execPath,['--check',path.join(root,'src',file)],{stdio:'inherit'});
const manifest=JSON.parse(await fs.readFile(path.join(root,'data/manifest.json'),'utf8'));const raw=await fs.readFile(path.join(root,'data',manifest.file),'utf8');if(await sha256(raw)!==manifest.sha256)throw new Error('Manifest hash mismatch');const bank=validateBankForPublication(JSON.parse(raw));if(manifest.bankVersion!==bank.bankVersion)throw new Error('Manifest version mismatch');
for(const type of ['written','practical'])prepareSession(bank,{type,mode:'untimed',kind:'practice',subjectId:type==='written'?'all':'practical',pool:'all',family:'all',count:type==='written'?10:4,minutes:150,optionCount:5,feedbackAfter:'confirm'},[],1,'smoke-session');
const html=await fs.readFile(path.join(root,'index.html'),'utf8');if(!html.includes('lang="ko"')||!html.includes('role="status"')||!html.includes('Content-Security-Policy'))throw new Error('Accessible shell checks missing');
for(const file of runtimeFiles){const content=await fs.readFile(path.join(root,'src',file),'utf8');if(/\b(?:eval|new Function)\s*\(|\.innerHTML\s*=|insertAdjacentHTML/.test(content))throw new Error(`Unsafe text execution sink in ${file}`);}
console.log('Syntax, source contracts, manifest hash, prepared sessions, Korean shell and no-eval/no-innerHTML checks passed.');
}
