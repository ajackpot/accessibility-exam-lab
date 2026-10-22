/** Owned code authority for historical/synthetic fixture inputs only.
 * Real quarantine, evidence-loss and delivery registries are copied byte-for-byte.
 * Only the explicit selection pin is projected before any copied module import. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {readEditorial005Source,writeExactFiles} from './successor-projection.mjs';
import {useEmptySyntheticSelectionPrefix} from './selection-fixtures.mjs';
import {loadEvidenceLossDependencies,isEvidenceLossReservedLedger} from '../scripts/evidence-loss-block.mjs';
const source=path.resolve(import.meta.dirname,'..');
const excluded=new Set(['docs/publication-selections/round-041-selection-001.json','docs/rounds/round-041.json','docs/rounds/round-041.md','docs/conversions/practical-written-001.json']);
const selectionModule='scripts/publication-selection.mjs';
const emptyDeclaration='export const PUBLICATION_SELECTION_PIN=Object.freeze({path:PUBLICATION_SELECTION_PATH,sha256:null});';
const declaration=/export const PUBLICATION_SELECTION_PIN=Object\.freeze\(\{path:PUBLICATION_SELECTION_PATH,sha256:'[a-f0-9]{64}'\}\);/g;
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
/** Exact pre-conversion source, authenticated by the test-only reverse projection.
 * Callers import their historical API from this same owned tree. */
export async function createOwnedHistoricalSource(t){
 const {files}=await readEditorial005Source(source);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'historical-source-fixture-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await writeExactFiles(root,files);return root;
}
export async function createOwnedHistoricalAuthority(t) {
 const authorityRoot=await fs.mkdtemp(path.join(os.tmpdir(),'historical-authority-fixture-'));
 const cleanup=()=>fs.rm(authorityRoot,{recursive:true,force:true});t.after(cleanup);
 try {
  for(const folder of ['scripts','src','docs'])await fs.cp(path.join(source,folder),path.join(authorityRoot,folder),{recursive:true,filter:p=>!excluded.has(path.relative(source,p))});
  await fs.copyFile(path.join(source,'package.json'),path.join(authorityRoot,'package.json'));
  const originalSelection=await fs.readFile(path.join(source,selectionModule),'utf8');
  assert.equal([...originalSelection.matchAll(declaration)].length,1,'Exactly one installed selection pin must be projected');
  await useEmptySyntheticSelectionPrefix(authorityRoot);
  async function verify(prefix='') {
   const actual=await fs.readdir(path.join(authorityRoot,prefix),{withFileTypes:true});
   const expected=prefix===''?['docs','package.json','scripts','src']:(await fs.readdir(path.join(source,prefix))).filter(n=>!excluded.has(prefix+'/'+n));
   assert.deepEqual(actual.map(e=>e.name).sort(),expected.sort(),'Exact copied authority membership: '+prefix);
   for(const entry of actual){
    const p=prefix?prefix+'/'+entry.name:entry.name;assert(!entry.isSymbolicLink(),'Copied authority has no symlinks: '+p);
    if(entry.isDirectory()){await verify(p);continue;}
    assert(entry.isFile(),'Copied authority has only regular files: '+p);
    const raw=await fs.readFile(path.join(source,p));
    const expectedRaw=p===selectionModule?Buffer.from(originalSelection.replace(declaration,emptyDeclaration)):raw;
    assert.deepEqual(await fs.readFile(path.join(authorityRoot,p)),expectedRaw,'Only the owned selection pin may differ: '+p);
   }
  }
  await verify();
  // These imports share one owned module cache; no installed authority token is reused.
  const {buildBank}=await import(pathToFileURL(path.join(authorityRoot,'scripts/build.mjs')));
  const {readBankInput}=await import(pathToFileURL(path.join(authorityRoot,'scripts/bank-io.mjs')));
  const round=await import(pathToFileURL(path.join(authorityRoot,'scripts/validate-round.mjs')));
  const editorial=await import(pathToFileURL(path.join(authorityRoot,'scripts/editorial-ledger.mjs')));
  const publication=await import(pathToFileURL(path.join(authorityRoot,'scripts/publication-sync.mjs')));
  const delivery=await import(pathToFileURL(path.join(authorityRoot,'scripts/download-fallback.mjs')));
  const selection=await import(pathToFileURL(path.join(authorityRoot,selectionModule)));
  function bindHistoricalSelection({ledgers,ledgerSources,editorials=[],editorialSources=new Map(),manifest,now}) {
   assert(Number.isFinite(now)&&now<Date.parse('2026-10-10T11:52:01.012Z'),'Explicit pre-selection simulation clock required');
   const files=[{path:'data/manifest.json',raw:json(manifest)}],seen=new Set();
   for(const [records,sources,kind,idField]of [[ledgers,ledgerSources,'rounds','roundId'],[editorials,editorialSources,'corrections','correctionRoundId']])for(const ledger of records){
    const id=ledger[idField],raw=sources.get(id),p=`docs/${kind}/${id}.json`;
    assert(typeof raw==='string'||Buffer.isBuffer(raw),'Exact fixture raw source required: '+p);
    assert(!seen.has(p),'Unique fixture raw source: '+p);seen.add(p);
    assert.deepEqual(JSON.parse(raw.toString()),ledger,'Fixture identity must bind its exact supplied raw source: '+p);
    assert(Number.isFinite(Date.parse(ledger.startedAt))&&Date.parse(ledger.startedAt)<=now,'Fixture ledger cannot start after its clock: '+p);
    files.push({path:p,raw:Buffer.from(raw)});
   }
   // This binds selection identities only. Full campaign validators below still
   // receive the original exact banks, reviews, receipts and denial registries.
   const state=selection.validatePublicationSelectionSnapshot(files,{now});
   assert.deepEqual(state.selections,[]);assert.deepEqual(state.selectionReferences,[]);return state;
  }
  return {authorityRoot,buildBank,readBankInput,round,editorial,publication,delivery,bindHistoricalSelection,bindSyntheticRoundSources:args=>bindSyntheticRoundSources(selection,args)};
 }catch(error){await cleanup();throw error;}
}

/** Bind fixture-owned new round raw bytes without pre-validating their semantics.
 * Deliberately invalid clocks/fields must reach the production negative guards.
 * Kept historical inputs are independently bound to their original raw bytes;
 * caller-supplied missing/tampered validation maps are never repaired. */
export function bindSyntheticRoundSources(selection,{historicalLedgers,historicalSources,syntheticLedgers,validationSources=historicalSources,at}) {
 assert(Number.isFinite(at)&&at<Date.parse('2026-10-10T11:52:01.012Z'),'Explicit pre-selection fixture boundary required');
 const files=[],seen=new Set(),ledgerSources=new Map(validationSources);
 for(const ledger of historicalLedgers){
  const id=ledger.roundId,raw=historicalSources.get(id);
  assert(typeof raw==='string'||Buffer.isBuffer(raw),'Original historical raw source required: '+id);
  assert.deepEqual(JSON.parse(raw.toString()),ledger,'Keep historical identity exact: '+id);
  assert(Number.isFinite(Date.parse(ledger.startedAt))&&Date.parse(ledger.startedAt)<=at,'Kept historical ledger must precede fixture boundary');
  assert(!seen.has(id));seen.add(id);files.push({path:`docs/rounds/${id}.json`,raw:Buffer.from(raw)});
 }
 for(const ledger of syntheticLedgers){
  const id=ledger.roundId;assert(/^round-[A-Za-z0-9_-]+$/.test(id)&&!seen.has(id),'Unique safe synthetic fixture ID required');seen.add(id);
  const raw=json(ledger);files.push({path:`docs/rounds/${id}.json`,raw});ledgerSources.set(id,raw);
 }
 const publicationSelections=selection.validatePublicationSelectionSnapshot(files,{now:at});
 assert.deepEqual(publicationSelections.selections,[]);assert.deepEqual(publicationSelections.selectionReferences,[]);
 return {publicationSelections,ledgerSources};
}

/** Extend an already explicit historical copy boundary to later editorial inputs.
 * This does not change any registry, proof, production module, or real source. */
export async function pruneFutureEditorialFixture(root,{temporaryRoot,at}) {
 assert(Number.isFinite(at)&&at<Date.parse('2026-10-10T11:52:01.012Z'),'Explicit pre-selection fixture boundary required');
 for(const input of [root,temporaryRoot]){
  assert(path.isAbsolute(input)&&path.normalize(input)===input,'Normalized owned fixture root required');
  for(let p=input;;p=path.dirname(p)){assert(!(await fs.lstat(p)).isSymbolicLink(),'Owned fixture symlink ancestor');if(path.dirname(p)===p)break;}
 }
 const tmp=await fs.realpath(os.tmpdir()),owner=await fs.realpath(temporaryRoot),resolved=await fs.realpath(root);
 assert(path.dirname(owner)===tmp&&/^(?:manual011-check-|independent-chains-|normal-backup-next-|sync-independent-|historical-boundary-test-|normal-publication-|release-closure-)[A-Za-z0-9]{6}$/.test(path.basename(owner))&&(resolved===owner||resolved.startsWith(owner+path.sep))&&resolved!==await fs.realpath(source),'Owned historical fixture with an explicit registered test prefix only');
 const names=[];
 async function walk(prefix=''){for(const e of await fs.readdir(path.join(resolved,prefix),{withFileTypes:true})){const p=prefix?prefix+'/'+e.name:e.name;assert(!e.isSymbolicLink(),'Owned fixture cannot contain symlinks');if(e.isDirectory())await walk(p);else{assert(e.isFile());names.push(p);}}}
 await walk();
 const removed=new Set(),keptBanks=new Set(),preserved=new Map(),publicationLedgers=[];
 // Only the exact new registration may be projected out of an owned historical
 // fixture. Unknown conversion files, edited inputs and edited banks fail closed.
 const conversionPath='docs/conversions/practical-written-001.json',conversionBank='data/releases/2026.10.22-practical-written.1/bank.json';
 if(names.some(p=>p.startsWith('docs/conversions/'))||names.includes(conversionBank)){
  const hash=raw=>createHash('sha256').update(raw).digest('hex');
  // Derive the only permitted input set from the separately pinned real source,
  // even when the disposable fixture has lost its copy of the ledger.
  const raw=await fs.readFile(path.join(source,conversionPath));
  assert.equal(hash(raw),'06d1c11c9fa834709ae20c332402c81cc01f68d8151460e6d5333ea6729ff3b5','Exact source conversion ledger required');
  const ledger=JSON.parse(raw);assert(Date.parse(ledger.registeredAt)>at,'Only a future conversion may be projected');
  assert.equal(`data/releases/${ledger.result.bankVersion}/bank.json`,conversionBank);
  const exact=new Map([[conversionPath,hash(raw)],[conversionBank,ledger.result.bankSha256]]);
  for(const c of ledger.candidates){for(const cycle of c.cycles)exact.set(cycle.input.path,cycle.input.sha256);if(c.sourceRefresh)exact.set(c.sourceRefresh.input.path,c.sourceRefresh.input.sha256);}
  const support=new Map([
   ['docs/conversions/practical-written-001.md','58d856408e1327d04dbb6ce924bb7fdd059279d097f3f1252f1ffd01dbd29f0e'],
   ['docs/conversions/practical-written-registration.schema.json','26e23eed51e9226be3b169c2d11aab07df875b02c44da9a91ba890813e3c0017']
  ]);
  for(const p of names.filter(p=>p.startsWith('docs/conversions/')))assert(exact.has(p)||support.has(p),'Unknown conversion fixture path: '+p);
  for(const [p,digest]of support)if(names.includes(p)){assert.equal(hash(await fs.readFile(path.join(resolved,p))),digest,'Exact inert conversion support: '+p);preserved.set(p,await fs.readFile(path.join(resolved,p)));}
  // A conversion payload is an indivisible fixture input: no missing ledger,
  // missing reviewed snapshot or missing final bank is silently projected away.
  if([...exact.keys()].some(p=>names.includes(p)))for(const [p,digest]of exact){
   assert(names.includes(p),'Incomplete future conversion fixture: '+p);
   assert.equal(hash(await fs.readFile(path.join(resolved,p))),digest,'Exact future conversion bytes: '+p);removed.add(p);
  }
 }
 const keepBank=version=>{if(version)keptBanks.add(`data/releases/${version}/bank.json`);};
 for(const p of names.filter(p=>/^docs\/(?:rounds\/round-\d+|corrections\/editorial-\d+)\.json$/.test(p))){
  const raw=await fs.readFile(path.join(resolved,p)),ledger=JSON.parse(raw),started=Date.parse(ledger.startedAt);assert(Number.isFinite(started),'Exact ledger time required');
  if(p.startsWith('docs/corrections/')&&started>at){
   removed.add(p);const report=p.replace(/\.json$/,'.md');if(names.includes(report))removed.add(report);
   for(const c of ledger.corrections||[])for(const cycle of c.cycles||[]){const pkg=cycle.reviewPackagePath;if(!pkg)continue;assert(pkg.startsWith(`docs/corrections/evidence/${ledger.correctionRoundId}-cycle-`)&&/^docs\/corrections\/evidence\/editorial-\d+-cycle-[123]\.json$/.test(pkg),'Only the future editorial own package may be projected');if(names.includes(pkg))removed.add(pkg);}
  }else{
   assert(started<=at,'Round history must be pruned before editorial projection');preserved.set(p,raw);
   keepBank(ledger.baseline?.bankVersion);
   publicationLedgers.push({p,raw,ledger});
   for(const c of ledger.corrections||[])keepBank(c.priorAcceptedRef?.bankVersion);
  }
 }
 // Some preincident fixtures project their trust prefix after this helper.
 // Require full authentication only when a kept publication needs an absence
 // exception or is the exact known reservation (which must not have a bank).
 // The raw-only predicate selects work; it never grants the exception.
 const needsReservationReview=publicationLedgers.some(({p,raw,ledger})=>ledger.publication?.bankVersion&&
  (!names.includes(`data/releases/${ledger.publication.bankVersion}/bank.json`)||isEvidenceLossReservedLedger(raw,p)));
 const evidenceLoss=needsReservationReview?await loadEvidenceLossDependencies(resolved,{now:at}):null;
 for(const {p,raw,ledger}of publicationLedgers){
   const reservation=evidenceLoss?.reservations.get(ledger.roundId);
   if(reservation){
    assert(isEvidenceLossReservedLedger(raw,p),'Only the exact authenticated original ledger may reserve a publication output');
    assert.equal(reservation.releaseEligible,0);
    for(const field of ['currentExecutionProof','deliveryProof','publicationProof'])assert.equal(reservation[field],false);
    assert(!names.includes(`data/releases/${ledger.publication.bankVersion}/bank.json`),'Reserved publication bank must remain absent, including when unlisted');
   }else keepBank(ledger.publication?.bankVersion);
   // Baseline and prior-accepted dependencies were retained independently above.
 }
 for(const p of names.filter(p=>/^data\/releases\/[^/]+\/bank\.json$/.test(p))){
  const raw=await fs.readFile(path.join(resolved,p)),bank=JSON.parse(raw),released=Date.parse(bank.releasedAt);assert(Number.isFinite(released),'Exact immutable bank time required');
  if(released>at){assert(!keptBanks.has(p),'Kept history cannot depend on a projected future bank');removed.add(p);}else preserved.set(p,raw);
 }
 for(const p of keptBanks)assert(!removed.has(p)&&names.includes(p),'Kept historical bank dependency must remain present: '+p);
 // All roots, paths, times and kept dependencies were checked before mutation.
 for(const p of removed)await fs.rm(path.join(resolved,p));
 const allow=path.join(resolved,'PUBLICATION-MANIFEST.txt');await fs.writeFile(allow,(await fs.readFile(allow,'utf8')).split(/\r?\n/).filter(p=>!removed.has(p.trim())).join('\n'));
 for(const [p,raw]of preserved)assert.deepEqual(await fs.readFile(path.join(resolved,p)),raw,'Kept original historical bytes: '+p);
 return [...removed].sort();
}
