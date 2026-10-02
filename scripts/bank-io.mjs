import fs from 'node:fs/promises';
import path from 'node:path';
import {validateBankForPublication,validateExplanationAuthoring,sha256} from '../src/domain.js';
import {readHistoricalExplanationBaseline} from './explanation-authoring.mjs';

/** An ordinary build validates the currently selected release, never a seed fallback. */
export async function readBankInput(root,input) {
  if(input) {
    const raw=await fs.readFile(path.resolve(input),'utf8');
    const bank=validateBankForPublication(JSON.parse(raw));
    // Only the verified active release is a carry-forward baseline. Candidates
    // cannot opt out using a bankVersion, testOnly flag or supplied metadata.
    let hasBaseline=true;
    try { await fs.access(path.join(root,'data/manifest.json')); }
    catch(error) { if(error.code==='ENOENT')hasBaseline=false;else throw error; }
    const baseline=hasBaseline?(await readBankInput(root)).bank:null;
    validateExplanationAuthoring(bank,baseline);
    return {raw,bank,manifest:null};
  }
  const manifest=JSON.parse(await fs.readFile(path.join(root,'data/manifest.json'),'utf8'));
  if(manifest.schemaVersion!==1||typeof manifest.finalRelease!=='boolean'||typeof manifest.changeSummary!=='string'||!manifest.changeSummary.trim())throw new Error('Active manifest schema, summary or finalRelease field is invalid.');
  if(typeof manifest.bankVersion!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(manifest.bankVersion)||manifest.file!==`releases/${manifest.bankVersion}/bank.json`)throw new Error('Active manifest release path is invalid.');
  const raw=await fs.readFile(path.join(root,'data',manifest.file),'utf8');
  if(await sha256(raw)!==manifest.sha256)throw new Error('Active manifest hash mismatch.');
  const bank=validateBankForPublication(JSON.parse(raw));
  if(bank.changeSummary!==manifest.changeSummary)throw new Error('Active manifest change summary mismatch.');
  if(bank.bankVersion!==manifest.bankVersion||bank.releasedAt!==manifest.releasedAt)throw new Error('Active manifest version or release time mismatch.');
  validateExplanationAuthoring(bank,await readHistoricalExplanationBaseline(root));
  return {raw,bank,manifest};
}
