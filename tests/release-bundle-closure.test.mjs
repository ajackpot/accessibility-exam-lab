import {retainHistoricalQuarantinePrefix} from './quarantine-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {parsePublicAllowlist} from '../scripts/download-fallback.mjs';
import {regularCoverage} from '../scripts/validate-round.mjs';
const root=path.resolve(import.meta.dirname,'..'),now=Date.parse('2026-10-04T09:10:00Z');
const hash=x=>createHash('sha256').update(x).digest('hex'),json=x=>JSON.stringify(x,null,2)+'\n';
const reportPath='docs/rounds/release-backup-required-report.txt';
async function inventory(root){return Promise.all(parsePublicAllowlist(await fs.readFile(path.join(root,'PUBLICATION-MANIFEST.txt'),'utf8')).map(async p=>{const b=await fs.readFile(path.join(root,p));return {path:p,bytes:b.length,sha256:hash(b)};}));}
async function write(root,p,raw){await fs.mkdir(path.dirname(path.join(root,p)),{recursive:true});await fs.writeFile(path.join(root,p),raw);}
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'release-closure-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const baseRoot=path.join(dir,'base'),workRoot=path.join(dir,'work');
 // Freeze a synthetic predecessor through 008 even when the live checkout has 009+.
 let paths=parsePublicAllowlist(await fs.readFile(path.join(root,'PUBLICATION-MANIFEST.txt'),'utf8')).filter(p=>{
  const r=/^docs\/rounds\/round-(\d+)(?:[./-]|$)/.exec(p),b=/^data\/releases\/[^/]*-regular\.(\d+)\//.exec(p);
  return !(r&&Number(r[1])>=9)&&!(b&&Number(b[1])>=9)&&!p.startsWith('docs/deliveries/checkpoints/')&&!p.startsWith('docs/deliveries/chains/');
 });
 for(const p of paths)await write(baseRoot,p,await fs.readFile(path.join(root,p)));
 // Reset only this pre-independent-delivery fixture's copied authority.
 if(paths.includes('docs/deliveries/offline-chain-trust.json'))await write(baseRoot,'docs/deliveries/offline-chain-trust.json',json({schemaVersion:1,kind:'reviewed_independent_offline_chains',checkpoints:[]}));
 // The through008 fixture predates successor deliveries. Its imported authority
 // must use the same isolated empty registry as its exact packaged bytes.
 await write(baseRoot,'docs/deliveries/release-backup-trust.json',json({schemaVersion:1,rootProofSha256:hash(await fs.readFile(path.join(baseRoot,'docs/deliveries/normal-backup-009.json'))),checkpoints:[]}));
 const bank8Raw=await fs.readFile(path.join(baseRoot,'data/releases/2026.10.04-regular.8/bank.json')),bank8=JSON.parse(bank8Raw),coverage=regularCoverage(bank8);
 const manifest8={schemaVersion:1,bankVersion:bank8.bankVersion,releasedAt:bank8.releasedAt,file:`releases/${bank8.bankVersion}/bank.json`,sha256:hash(bank8Raw),changeSummary:bank8.changeSummary,finalRelease:false};
 await write(baseRoot,'data/manifest.json',json(manifest8));await write(baseRoot,'PUBLICATION-MANIFEST.txt',paths.join('\n')+'\n');await retainHistoricalQuarantinePrefix(baseRoot,now);paths=parsePublicAllowlist(await fs.readFile(path.join(baseRoot,'PUBLICATION-MANIFEST.txt'),'utf8'));await fs.cp(baseRoot,workRoot,{recursive:true});
 const r=JSON.parse(await fs.readFile(path.join(baseRoot,'docs/rounds/round-ledger.template.json')));
 Object.assign(r,{roundId:'round-009',status:'closed',startedAt:'2026-10-04T08:54:06Z',decisionDeadline:'2026-10-04T10:30:00Z',closedAt:'2026-10-04T09:00:00Z',summary:'Synthetic regression fixture; no real acceptance, publication or delivery claim.',baseline:{sourceCommit:'50fd2807a0ff8fc2c10cbf2628f65d0ca53065c2',bankVersion:bank8.bankVersion,bankSha256:hash(bank8Raw),regularWrittenBySubject:coverage.regularWrittenBySubject,regularPractical:coverage.regularPractical},coverageAfter:coverage,noGapExplanation:'Synthetic regression examines artifact dependency closure, not real question coverage.',validation:[{check:'synthetic report dependency',result:'pass',summary:'Fixture only',reportPath}],manualStartException:{kind:'explicit_user_requested_next_round',requestedAt:'2026-10-04T08:54:06Z',previousRoundId:'round-008',previousClosedAt:'2026-10-04T07:56:30.743478+00:00',nextScheduledStart:'2026-10-04T11:00:00Z',reason:'Synthetic exact authorization fixture; no real content work.'}});
 const bank9={...bank8,bankVersion:'2026.10.04-regular.9',roundId:r.roundId,releasedAt:r.closedAt,changeSummary:'Synthetic packaging regression with no content additions.'},bank9Raw=json(bank9);
 Object.assign(r.publication,{bankVersion:bank9.bankVersion,bankSha256:hash(bank9Raw)});
 const additions={'docs/rounds/round-009.json':json(r),'docs/rounds/round-009.md':'Synthetic regression report only.\n',[`data/releases/${bank9.bankVersion}/bank.json`]:bank9Raw};
 for(const [p,raw] of Object.entries(additions))await write(workRoot,p,raw);
 await write(workRoot,'data/manifest.json',json({...manifest8,bankVersion:bank9.bankVersion,releasedAt:bank9.releasedAt,file:`releases/${bank9.bankVersion}/bank.json`,sha256:hash(bank9Raw),changeSummary:bank9.changeSummary}));
 await write(workRoot,reportPath,'Required report exists only in the mutable workspace, not the reviewed artifact.\n');
 await write(workRoot,'PUBLICATION-MANIFEST.txt',[...paths,...Object.keys(additions)].join('\n')+'\n');
 const {writeReleaseDeliveryPair}=await import(pathToFileURL(path.join(workRoot,'scripts/release-bundle.mjs')));
 return {packagePair:writeReleaseDeliveryPair,baseRoot,workRoot,baseCommit:r.baseline.sourceCommit,baseVerifiedAt:'2026-10-04T08:51:19.196Z',baseInventory:await inventory(baseRoot),reviewedInventory:await inventory(workRoot),roundId:r.roundId,deltaOutputPath:path.join(dir,'delta.zip'),completeOutputPath:path.join(dir,'complete.7z'),now};
}
async function noOutputs(f){for(const p of [f.deltaOutputPath,f.completeOutputPath])await assert.rejects(fs.stat(p),{code:'ENOENT'});}
test('normal backup cannot validate a required report outside the exact packaged inventory',async t=>{
 const f=await fixture(t);await assert.rejects(f.packagePair(f),/missing or unsafe reportPath/);await noOutputs(f);
 // The same fixture is valid once the dependency is part of the reviewed bytes.
 await fs.appendFile(path.join(f.workRoot,'PUBLICATION-MANIFEST.txt'),reportPath+'\n');f.reviewedInventory=await inventory(f.workRoot);
 const result=await f.packagePair(f);assert.equal(result.status,'prepared_not_delivered');assert.ok(result.completeManifest.files.some(e=>e.path===reportPath));
});
test('normal backup refuses an existing base manifest freeze even if its state marker is inconsistent',async t=>{
 const f=await fixture(t);await fs.appendFile(path.join(f.workRoot,'PUBLICATION-MANIFEST.txt'),reportPath+'\n');f.reviewedInventory=await inventory(f.workRoot);
 const m=JSON.parse(await fs.readFile(path.join(f.baseRoot,'data/manifest.json')));m.finalRelease=true;await write(f.baseRoot,'data/manifest.json',json(m));f.baseInventory=await inventory(f.baseRoot);
 await assert.rejects(f.packagePair(f),/freeze/i);await noOutputs(f);
});
