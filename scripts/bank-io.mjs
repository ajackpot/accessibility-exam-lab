import {assertNoEvidenceLossContent,loadEvidenceLossDependencies} from './evidence-loss-block.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {validateBankForPublication,validateExplanationAuthoring,sha256} from '../src/domain.js';
import {assertNoQuarantinedContent} from './prepublication-quarantine.mjs';
import {readHistoricalExplanationBaseline} from './explanation-authoring.mjs';

/** An ordinary build validates the currently selected release, never a seed fallback. */
export async function readBankInput(root,input) {
  // The root's current evidence registry is required even for an explicit bank input.
  let validator='';try{validator=await fs.readFile(path.join(root,'scripts/validate-round.mjs'),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  let loader='',hasRegistry=false;try{loader=await fs.readFile(path.join(root,'scripts/bank-io.mjs'),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  try{await fs.lstat(path.join(root,'docs/release-blocks/trust.json'));hasRegistry=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  if(hasRegistry||validator.includes('loadEvidenceLossDependencies')||loader.includes('loadEvidenceLossDependencies'))await loadEvidenceLossDependencies(root);
  if(validator.includes('loadNormalBackupRoots')||loader.includes('validateNormalBackupRootDependencies')||await fs.stat(path.join(root,'docs/deliveries/normal-backup-root-trust.json')).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;})){const {validateNormalBackupRootDependencies}=await import('./normal-backup-root.mjs');await validateNormalBackupRootDependencies(root);}
  if(validator.includes('loadNormalBackupChains')||loader.includes('validateNormalBackupChainDependencies')||await fs.stat(path.join(root,'docs/deliveries/normal-backup-chain-trust.json')).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;})){const {validateNormalBackupChainDependencies}=await import('./normal-backup-chain.mjs');await validateNormalBackupChainDependencies(root);}
  if(input) {
    const raw=await fs.readFile(path.resolve(input),'utf8');
    const bank=assertNoEvidenceLossContent(assertNoQuarantinedContent(validateBankForPublication(JSON.parse(raw))));
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
  const bank=assertNoEvidenceLossContent(assertNoQuarantinedContent(validateBankForPublication(JSON.parse(raw))));
  if(bank.changeSummary!==manifest.changeSummary)throw new Error('Active manifest change summary mismatch.');
  if(bank.bankVersion!==manifest.bankVersion||bank.releasedAt!==manifest.releasedAt)throw new Error('Active manifest version or release time mismatch.');
  validateExplanationAuthoring(bank,await readHistoricalExplanationBaseline(root));
  return {raw,bank,manifest};
}
