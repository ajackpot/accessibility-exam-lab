import {retainHistoricalSelectionPrefix,useEmptySyntheticSelectionPrefix} from './selection-fixtures.mjs';
/** Test-only isolation of disposable historical copies, never live authority. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/** Enumerate the actual copied history, including files not publicly allowlisted.
 * The caller supplies its own mkdtemp container and explicit historical boundary.
 * Only these test-owned temporary prefixes may be changed. */
export async function pruneHistoricalFixtureHistory(root,{temporaryRoot,maxRound,at,checkpoints='later'}) {
  async function rejectLinkedAncestors(input) {
    if(!path.isAbsolute(input)||path.normalize(input)!==input)throw Error('Historical fixture root must be an absolute normalized path');
    for(let current=input;;current=path.dirname(current)) {
      if((await fs.lstat(current)).isSymbolicLink())throw Error('Historical fixture root or ancestor cannot be a symbolic link');
      if(path.dirname(current)===current)break;
    }
  }
  await rejectLinkedAncestors(temporaryRoot);await rejectLinkedAncestors(root);
  const temporary=await fs.realpath(os.tmpdir()),owner=await fs.realpath(temporaryRoot),resolved=await fs.realpath(root);
  if(path.dirname(owner)!==temporary||! /^(?:independent-chains-|manual011-check-|normal-backup-next-|historical-boundary-test-)[A-Za-z0-9]{6}$/.test(path.basename(owner))||
     !(resolved===owner||resolved.startsWith(owner+path.sep))||resolved===await fs.realpath(path.resolve(import.meta.dirname,'..'))||
     !Number.isInteger(maxRound)||maxRound<1||!Number.isFinite(at)||!['later','all','none'].includes(checkpoints))throw Error('Historical fixture requires an owned temporary root and explicit boundary');
  const files=[];
  async function walk(relative='') {
    for(const entry of await fs.readdir(path.join(resolved,relative),{withFileTypes:true})) {
      const name=relative?relative+'/'+entry.name:entry.name;
      if(entry.isSymbolicLink())throw Error('Historical fixture cannot contain symbolic links');
      if(entry.isDirectory())await walk(name);else if(entry.isFile())files.push(name);else throw Error('Unsupported historical fixture entry');
    }
  }
  await walk();
  const laterBanks=new Set(),keptBanks=new Set();
  for(const file of files) {
    const match=file.match(/^docs\/rounds\/round-(\d+)\.json$/);if(!match)continue;
    const ledger=JSON.parse(await fs.readFile(path.join(resolved,file)));
    if(Number(match[1])<=maxRound) {
      if(!Number.isFinite(Date.parse(ledger.startedAt))||Date.parse(ledger.startedAt)>at)throw Error('Kept fixture ledger exceeds its historical clock');
      for(const version of [ledger.baseline?.bankVersion,ledger.publication?.bankVersion])if(version)keptBanks.add(`data/releases/${version}/bank.json`);
    } else if(ledger.publication?.bankVersion)laterBanks.add(`data/releases/${ledger.publication.bankVersion}/bank.json`);
  }
  const removed=files.filter(file=>{
    const round=file.match(/^docs\/rounds\/round-(\d+)\.(?:json|md)$/),bank=file.match(/^data\/releases\/[^/]+-regular\.(\d+)\/bank\.json$/),checkpoint=file.match(/^docs\/deliveries\/checkpoints\/round-(\d+)\.json$/);
    return Boolean(round&&Number(round[1])>maxRound||!keptBanks.has(file)&&(laterBanks.has(file)||bank&&Number(bank[1])>maxRound)||
      file.startsWith('docs/deliveries/chains/')||checkpoint&&(checkpoints==='all'||checkpoints==='later'&&Number(checkpoint[1])>maxRound));
  });
  // Everything is selected and checked before any mutation. No real source paths
  // are accepted, and kept ledgers' bank dependencies are never removed.
  for(const file of removed)await fs.rm(path.join(resolved,file));
  const selected=new Set(removed),allow=path.join(resolved,'PUBLICATION-MANIFEST.txt');
  await fs.writeFile(allow,(await fs.readFile(allow,'utf8')).split(/\r?\n/).filter(file=>!selected.has(file.trim())).join('\n'));
  return removed.sort();
}

export async function retainHistoricalQuarantinePrefix(root,at) {
  const resolved=await fs.realpath(root),temporary=await fs.realpath(os.tmpdir())+path.sep;
  if(resolved===await fs.realpath(path.resolve(import.meta.dirname,'..'))||!resolved.startsWith(temporary)||!Number.isFinite(at))throw Error('Historical fixture must be a disposable temporary directory with an explicit clock');
  if(at<Date.parse('2026-10-10T11:52:01.012Z'))await retainHistoricalSelectionPrefix(resolved,at);
  // Isolate future publication authority only in this already-checked disposable
  // historical fixture; later evidence cannot authenticate its synthetic sources.
  const publicationModule=path.join(resolved,'scripts/publication-sync.mjs');
  let publicationSource=await fs.readFile(publicationModule,'utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error;}),removedPublications=new Set();
  const pins=[...publicationSource.matchAll(/Object\.freeze\(\{path:'(docs\/publications\/[^']+)',\s*sha256:'([a-f0-9]{64})'\}\)/g)];
  const kept=[];
  for(const pin of pins){const raw=await fs.readFile(path.join(resolved,pin[1])).catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(!raw){kept.push(pin[0]);continue;}const event=JSON.parse(raw);if(Date.parse(event.verifiedAt)<=at)kept.push(pin[0]);else{removedPublications.add(pin[1]);removedPublications.add(pin[1].replace(/\.json$/,'.md'));}}
  if(removedPublications.size){publicationSource=publicationSource.replace(/export const PUBLICATION_SYNCHRONIZATIONS = Object.freeze\(\[[\s\S]*?\n\]\);/,'export const PUBLICATION_SYNCHRONIZATIONS = Object.freeze([\n  '+kept.join(',\n  ')+'\n]);');await fs.writeFile(publicationModule,publicationSource);for(const p of removedPublications)await fs.rm(path.join(resolved,p),{force:true});const allow=path.join(resolved,'PUBLICATION-MANIFEST.txt');await fs.writeFile(allow,(await fs.readFile(allow,'utf8')).split(/\r?\n/).filter(p=>!removedPublications.has(p.trim())).join('\n'));}
  const normalChainTrust=path.join(resolved,'docs/deliveries/normal-backup-chain-trust.json');
  try {const trust=JSON.parse(await fs.readFile(normalChainTrust)),removed=trust.checkpoints.filter(pin=>Date.parse(pin.registeredAt)>at),paths=new Set(removed.map(pin=>pin.path));trust.checkpoints=trust.checkpoints.filter(pin=>Date.parse(pin.registeredAt)<=at);await fs.writeFile(normalChainTrust,JSON.stringify(trust,null,2)+'\n');for(const file of paths)await fs.rm(path.join(resolved,file),{force:true});const allow=path.join(resolved,'PUBLICATION-MANIFEST.txt');await fs.writeFile(allow,(await fs.readFile(allow,'utf8')).split(/\r?\n/).filter(file=>!paths.has(file.trim())).join('\n'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const normalRootTrust=path.join(resolved,'docs/deliveries/normal-backup-root-trust.json');
  try {const trust=JSON.parse(await fs.readFile(normalRootTrust)),removed=trust.roots.filter(pin=>Date.parse(pin.registeredAt)>at),paths=new Set(removed.map(pin=>pin.path));trust.roots=trust.roots.filter(pin=>Date.parse(pin.registeredAt)<=at);await fs.writeFile(normalRootTrust,JSON.stringify(trust,null,2)+'\n');for(const file of paths)await fs.rm(path.join(resolved,file),{force:true});const allow=path.join(resolved,'PUBLICATION-MANIFEST.txt');await fs.writeFile(allow,(await fs.readFile(allow,'utf8')).split(/\r?\n/).filter(file=>!paths.has(file.trim())).join('\n'));}catch(e){if(e.code!=='ENOENT')throw e;}
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
    // Import dependency only: a sentinel root and no checkpoints convey no real
    // backup authority and cannot pass the production root-proof validator.
    await fs.writeFile(path.join(root,'docs/deliveries/release-backup-trust.json'),JSON.stringify({schemaVersion:1,rootProofSha256:'0'.repeat(64),checkpoints:[]},null,2)+'\n');
    await fs.writeFile(path.join(root,'docs/deliveries/offline-chain-trust.json'),JSON.stringify({schemaVersion:1,kind:'reviewed_independent_offline_chains',checkpoints:[]},null,2)+'\n');
    await fs.writeFile(path.join(root,'docs/deliveries/normal-backup-chain-trust.json'),JSON.stringify({schemaVersion:1,kind:'reviewed_normal_release_successors',checkpoints:[]},null,2)+'\n');
    await fs.writeFile(path.join(root,'docs/deliveries/normal-backup-root-trust.json'),JSON.stringify({schemaVersion:1,kind:'reviewed_normal_release_roots',roots:[]},null,2)+'\n');
    await fs.mkdir(path.join(root,'docs/release-blocks'),{recursive:true});
    await fs.writeFile(path.join(root,'docs/release-blocks/trust.json'),JSON.stringify({schemaVersion:1,kind:'reviewed_evidence_loss_blocks',events:[]},null,2)+'\n');
    await fs.mkdir(path.join(root,'docs/quarantines'),{recursive:true});
    await fs.writeFile(path.join(root,'docs/quarantines/trust.json'),JSON.stringify({schemaVersion:1,kind:'reviewed_prepublication_quarantines',audits:[]},null,2)+'\n');
    await useEmptySyntheticSelectionPrefix(root);
    const {pathToFileURL}=await import('node:url');
    return {round:await import(pathToFileURL(path.join(root,'scripts/validate-round.mjs'))),delivery:await import(pathToFileURL(path.join(root,'scripts/download-fallback.mjs'))),cleanup:()=>fs.rm(root,{recursive:true,force:true})};
  }catch(error){await fs.rm(root,{recursive:true,force:true});throw error;}
}
