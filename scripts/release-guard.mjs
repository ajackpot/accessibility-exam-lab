import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {releaseAllowed,FREEZE_AT} from '../src/domain.js';
const root=path.resolve(import.meta.dirname,'..');
const args=process.argv.slice(2);const checkOnly=args.includes('--check-only');
const statePath=path.join(root,'data/publication-state.json');
let state={finalized:false};try{state=JSON.parse(await fs.readFile(statePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const manifest=JSON.parse(await fs.readFile(path.join(root,'data/manifest.json'),'utf8'));
if(args.includes('--verify-freeze-marker')){if(!state.finalized||Date.now()>=FREEZE_AT||!manifest.finalRelease||manifest.bankVersion!==state.finalBankVersion||manifest.sha256!==state.finalBankSha256)throw new Error('Invalid or late freeze-marker publication. Do not publish.');console.log('Freeze-marker-only commit allowed before cutoff. Publish only data/manifest.json and data/publication-state.json; content must stay identical.');process.exit(0);}
if(!releaseAllowed({now:Date.now(),finalized:state.finalized,releasedAt:manifest.releasedAt})){console.error(`PUBLICATION BLOCKED. Cutoff: ${new Date(FREEZE_AT).toISOString()}; finalized: ${state.finalized}. Do not add or publish cumulative content. Existing hosted final files remain usable.`);process.exit(2);}
execFileSync(process.execPath,[path.join(root,'scripts/validate-round.mjs'),'--release'],{stdio:'inherit'});
if(args.includes('--finalize')){if(checkOnly)throw new Error('Cannot combine --finalize and --check-only');await fs.writeFile(statePath,JSON.stringify({finalized:true,finalizedAt:new Date().toISOString(),finalBankVersion:manifest.bankVersion,finalBankSha256:manifest.sha256,reason:'Final pre-cutoff publication verified by operator'},null,2)+'\n');await fs.writeFile(path.join(root,'data/manifest.json'),JSON.stringify({...manifest,finalRelease:true},null,2)+'\n');console.log('Publication frozen persistently. Commit this state and cancel outstanding publication jobs.');}else console.log(`Pre-publication cutoff check passed for ${manifest.bankVersion}. Re-run immediately before the remote publication action. This command itself does not deploy.`);
