import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateBank} from '../src/domain.js';

// Frozen pre-policy releases only. A candidate, active manifest, or bankVersion
// cannot declare its own exception. New authored objects always use strict lint.
export const HISTORICAL_EXPLANATION_RELEASES = Object.freeze([
  ['2026.10.02-regular.1','3abb68de23d9b58755bd9c039df5c803775705c86df0256d59570fe3c3eea5e0'],
  ['2026.10.02-seed.4','46c18e0ed3265a1de768f1d08bbeb4e6ada571293aae9c19c0766093df973d99'],
]);
function checked(raw,version,hash) {
  if(createHash('sha256').update(raw).digest('hex')!==hash)throw new Error(`Historical explanation baseline hash mismatch: ${version}`);
  const bank=validateBank(JSON.parse(raw.toString()));
  if(bank.bankVersion!==version)throw new Error('Historical explanation baseline version mismatch.');
  return bank;
}
export function historicalExplanationBaseline(banks) {
  for(const [version,hash]of HISTORICAL_EXPLANATION_RELEASES){const entry=banks instanceof Map?banks.get(version):banks[version];if(entry?.raw)return checked(entry.raw,version,hash);}
  return null;
}
export async function readHistoricalExplanationBaseline(root) {
  for(const [version,hash]of HISTORICAL_EXPLANATION_RELEASES){let raw;try{raw=await fs.readFile(path.join(root,'data/releases',version,'bank.json'));}catch(error){if(error.code==='ENOENT')continue;throw error;}return checked(raw,version,hash);}
  return null;
}
