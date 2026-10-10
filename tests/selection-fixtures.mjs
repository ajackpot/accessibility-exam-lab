/** Explicit empty selection authority for owned synthetic/historical test copies only. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const originalStart=Date.parse('2026-10-10T11:52:01.012Z');
const removedPaths=['docs/publication-selections/round-041-selection-001.json','docs/rounds/round-041.json','docs/rounds/round-041.md','data/releases/2026.10.10-regular.41/bank.json','data/releases/2026.10.10-regular.41-selection.1/bank.json'];
async function safe(root) {
 if(!path.isAbsolute(root)||path.normalize(root)!==root)throw Error('Selection fixture requires normalized absolute root');
 for(let p=root;;p=path.dirname(p)){if((await fs.lstat(p)).isSymbolicLink())throw Error('Selection fixture symlink ancestor');if(path.dirname(p)===p)break;}
 const resolved=await fs.realpath(root),tmp=await fs.realpath(os.tmpdir());
 if(!resolved.startsWith(tmp+path.sep)||resolved===await fs.realpath(path.resolve(import.meta.dirname,'..')))throw Error('Selection fixture must be disposable and cannot be live source');
 async function walk(p){for(const e of await fs.readdir(p,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('Selection fixture target symlink');if(e.isDirectory())await walk(path.join(p,e.name));else if(!e.isFile())throw Error('Selection fixture unsupported entry');}}
 await walk(resolved);return resolved;
}
async function emptyPin(root) {
 const p=path.join(root,'scripts/publication-selection.mjs');let s;try{s=await fs.readFile(p,'utf8');}catch(e){if(e.code==='ENOENT')return;throw e;}
 const re=/export const PUBLICATION_SELECTION_PIN=Object\.freeze\(\{path:PUBLICATION_SELECTION_PATH,sha256:(?:null|'[a-f0-9]{64}'|"[a-f0-9]{64}")\}\);/g;
 if([...s.matchAll(re)].length!==1)throw Error('Exact copied selection pin declaration required');
 await fs.writeFile(p,s.replace(re,'export const PUBLICATION_SELECTION_PIN=Object.freeze({path:PUBLICATION_SELECTION_PATH,sha256:null});'));
}
export async function retainHistoricalSelectionPrefix(root,at) {
 root=await safe(root);if(!Number.isFinite(at)||at>=originalStart)throw Error('Selection historical projection requires time before original041 start');
 let names=[];try{names=await fs.readdir(path.join(root,'docs/rounds'));}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const name of names.filter(n=>/^round-\d+\.json$/.test(n)&&n!=='round-041.json')){const l=JSON.parse(await fs.readFile(path.join(root,'docs/rounds',name)));if(l.baseline?.bankVersion?.startsWith('2026.10.10-regular.41')||l.baseline?.offlinePredecessor?.roundId==='round-041'||Number(name.match(/\d+/)[0])>41)throw Error('Kept fixture depends on041 selection history');}
 // Every target and ancestor was checked before this first mutation.
 for(const p of removedPaths)await fs.rm(path.join(root,p),{force:true});
 const allow=path.join(root,'PUBLICATION-MANIFEST.txt');try{await fs.writeFile(allow,(await fs.readFile(allow,'utf8')).split(/\r?\n/).filter(p=>!removedPaths.includes(p.trim())).join('\n'));}catch(e){if(e.code!=='ENOENT')throw e;}
 await emptyPin(root);
}
export async function useEmptySyntheticSelectionPrefix(root) {
 root=await safe(root);
 for(const p of removedPaths)try{await fs.lstat(path.join(root,p));throw Error('Synthetic empty authority cannot contain actual041 history');}catch(e){if(e.code!=='ENOENT')throw e;}
 await emptyPin(root);
}
