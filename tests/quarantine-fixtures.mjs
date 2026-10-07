/** Test-only isolation of disposable historical copies, never live authority. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export async function retainHistoricalQuarantinePrefix(root,at) {
  const resolved=await fs.realpath(root),temporary=await fs.realpath(os.tmpdir())+path.sep;
  if(resolved===await fs.realpath(path.resolve(import.meta.dirname,'..'))||!resolved.startsWith(temporary)||!Number.isFinite(at))throw Error('Historical fixture must be a disposable temporary directory with an explicit clock');
  // Isolate future publication authority only in this already-checked disposable
  // historical fixture; later evidence cannot authenticate its synthetic sources.
  const publicationModule=path.join(resolved,'scripts/publication-sync.mjs');
  let publicationSource=await fs.readFile(publicationModule,'utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error;}),removedPublications=new Set();
  const pins=[...publicationSource.matchAll(/Object\.freeze\(\{path:'(docs\/publications\/[^']+)',\s*sha256:'([a-f0-9]{64})'\}\)/g)];
  const kept=[];
  for(const pin of pins){const raw=await fs.readFile(path.join(resolved,pin[1])).catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(!raw){kept.push(pin[0]);continue;}const event=JSON.parse(raw);if(Date.parse(event.verifiedAt)<=at)kept.push(pin[0]);else{removedPublications.add(pin[1]);removedPublications.add(pin[1].replace(/\.json$/,'.md'));}}
  if(removedPublications.size){publicationSource=publicationSource.replace(/export const PUBLICATION_SYNCHRONIZATIONS = Object.freeze\(\[[\s\S]*?\n\]\);/,'export const PUBLICATION_SYNCHRONIZATIONS = Object.freeze([\n  '+kept.join(',\n  ')+'\n]);');await fs.writeFile(publicationModule,publicationSource);for(const p of removedPublications)await fs.rm(path.join(resolved,p),{force:true});const allow=path.join(resolved,'PUBLICATION-MANIFEST.txt');await fs.writeFile(allow,(await fs.readFile(allow,'utf8')).split(/\r?\n/).filter(p=>!removedPublications.has(p.trim())).join('\n'));}
  const blockFile=path.join(resolved,'docs/release-blocks/trust.json');
  try{const blocks=JSON.parse(await fs.readFile(blockFile)),removed=blocks.events.filter(p=>Date.parse(p.recordedAt)>at),paths=new Set();for(const pin of removed){const e=JSON.parse(await fs.readFile(path.join(resolved,pin.path)));for(const p of [pin.path,e.sourceLedger.path,e.incidentReport.path])paths.add(p);}blocks.events=blocks.events.filter(p=>Date.parse(p.recordedAt)<=at);await fs.writeFile(blockFile,JSON.stringify(blocks,null,2)+'\n');for(const p of paths)await fs.rm(path.join(resolved,p),{force:true});const allow=path.join(resolved,'PUBLICATION-MANIFEST.txt');await fs.writeFile(allow,(await fs.readFile(allow,'utf8')).split(/\r?\n/).filter(p=>!paths.has(p.trim())).join('\n'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const file=path.join(resolved,'docs/quarantines/trust.json');
  let raw;try{raw=await fs.readFile(file);}catch(error){if(error.code==='ENOENT')return;throw error;}
  const registry=JSON.parse(raw),removed=registry.audits.filter(pin=>Date.parse(pin.recordedAt)>at);
  if(registry.audits.some(pin=>!Number.isFinite(Date.parse(pin.recordedAt))))throw Error('Invalid fixture audit chronology');
  registry.audits=registry.audits.filter(pin=>Date.parse(pin.recordedAt)<=at);
  const paths=new Set(removed.map(pin=>pin.path));
  if([...paths].some(p=>!/^docs\/quarantines\/[A-Za-z0-9_.-]+\.json$/.test(p)))throw Error('Unsafe fixture audit path');
  await fs.writeFile(file,JSON.stringify(registry,null,2)+'\n');
  const allow=path.join(resolved,'PUBLICATION-MANIFEST.txt');
  await fs.writeFile(allow,(await fs.readFile(allow,'utf8')).split(/\r?\n/).filter(p=>!paths.has(p.trim())).join('\n'));
  for(const relative of paths)await fs.rm(path.join(resolved,relative));
}

/** Code-only authority for wholly synthetic campaigns. It has no real approvals,
 * histories, publication claims or registry pins, and cannot touch the live tree. */
export async function createSyntheticValidator() {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'synthetic-quarantine-validator-'));
  const source=path.resolve(import.meta.dirname,'..');
  try {
    await fs.copyFile(path.join(source,'package.json'),path.join(root,'package.json'));
    for(const folder of ['scripts','src'])await fs.cp(path.join(source,folder),path.join(root,folder),{recursive:true});
    for(const file of ['docs/rounds/round-ledger.schema.json','docs/corrections/editorial-ledger.schema.json']){await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.copyFile(path.join(source,file),path.join(root,file));}
    await fs.mkdir(path.join(root,'docs/deliveries'),{recursive:true});
    await fs.writeFile(path.join(root,'docs/deliveries/offline-chain-trust.json'),JSON.stringify({schemaVersion:1,kind:'reviewed_independent_offline_chains',checkpoints:[]},null,2)+'\n');
    await fs.mkdir(path.join(root,'docs/release-blocks'),{recursive:true});
    await fs.writeFile(path.join(root,'docs/release-blocks/trust.json'),JSON.stringify({schemaVersion:1,kind:'reviewed_evidence_loss_blocks',events:[]},null,2)+'\n');
    await fs.mkdir(path.join(root,'docs/quarantines'),{recursive:true});
    await fs.writeFile(path.join(root,'docs/quarantines/trust.json'),JSON.stringify({schemaVersion:1,kind:'reviewed_prepublication_quarantines',audits:[]},null,2)+'\n');
    const {pathToFileURL}=await import('node:url');
    return {round:await import(pathToFileURL(path.join(root,'scripts/validate-round.mjs'))),delivery:await import(pathToFileURL(path.join(root,'scripts/download-fallback.mjs'))),cleanup:()=>fs.rm(root,{recursive:true,force:true})};
  }catch(error){await fs.rm(root,{recursive:true,force:true});throw error;}
}
