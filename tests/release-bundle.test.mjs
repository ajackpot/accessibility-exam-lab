import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readDeliveredArchive,validateDeliveredArchiveEntries} from '../scripts/release-backup-continuation.mjs';
import {parsePublicAllowlist} from '../scripts/download-fallback.mjs';
import {writeReleaseDeliveryPair} from '../scripts/release-bundle.mjs';
import {FREEZE_AT} from '../src/domain.js';
const root=path.resolve(import.meta.dirname,'..'),hash=x=>createHash('sha256').update(x).digest('hex');
async function inventory(root){return Promise.all(parsePublicAllowlist(await fs.readFile(path.join(root,'PUBLICATION-MANIFEST.txt'),'utf8')).map(async p=>{const b=await fs.readFile(path.join(root,p));return {path:p,bytes:b.length,sha256:hash(b)};}));}
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'release-bundle-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const baseRoot=path.join(dir,'base'),workRoot=path.join(dir,'work');await fs.cp(root,baseRoot,{recursive:true});await fs.cp(root,workRoot,{recursive:true});await fs.writeFile(path.join(workRoot,'docs/RELEASE-BACKUP-TEST.txt'),'Synthetic packaging fixture, no publication claim.\n');await fs.appendFile(path.join(workRoot,'PUBLICATION-MANIFEST.txt'),'\ndocs/RELEASE-BACKUP-TEST.txt\n');
 const m=JSON.parse(await fs.readFile(path.join(root,'data/manifest.json'))),b=JSON.parse(await fs.readFile(path.join(root,'data',m.file)));
 return {baseRoot,workRoot,baseCommit:'50fd2807a0ff8fc2c10cbf2628f65d0ca53065c2',baseVerifiedAt:'2026-10-04T08:51:19.196Z',baseInventory:await inventory(baseRoot),reviewedInventory:await inventory(workRoot),roundId:b.roundId,deltaOutputPath:path.join(dir,'delta.zip'),completeOutputPath:path.join(dir,'complete.7z'),now:Date.now()};
}
test('normal release emits truthful exact delta/full pair without invented permission wait or deployment',async t=>{
 const f=await fixture(t),r=await writeReleaseDeliveryPair(f);assert.equal(r.status,'prepared_not_delivered');assert.equal(r.deliveryMode,'release_backup');assert.equal(r.completeManifest.deliveryMode,'release_backup');assert.equal(r.deltaManifest.newlyPublishedByPackaging,0);assert.deepEqual(r.completeManifest.prerequisiteArtifacts,[]);assert.equal(r.completeManifest.sourceRelease.deltaArtifactSha256,r.delta.sha256);assert.equal(r.deltaManifest.permissionDeadlineAt,undefined);assert.equal(r.deltaManifest.gitStoppedAt,undefined);
 assert.equal(r.completeManifest.schemaVersion,2);assert.equal(r.completeManifest.archiveFormat,'7z');
 for(const [artifact,prefix]of [[r.delta,'files/'],[r.complete,'project/']]){const raw=await fs.readFile(artifact.path),entries=readDeliveredArchive(raw,artifact.sha256),m=JSON.parse(entries.get('manifest.json'));validateDeliveredArchiveEntries(entries,m,prefix);assert.equal(m.deliveryMode,'release_backup');}

 await assert.rejects(writeReleaseDeliveryPair(f),/Output exists/);
});
test('normal release rejects missing or modified review inventory before writing either ZIP',async t=>{
 const f=await fixture(t);f.reviewedInventory[0].sha256='a'.repeat(64);await assert.rejects(writeReleaseDeliveryPair(f),/Reviewed bytes mismatch/);await assert.rejects(fs.stat(f.deltaOutputPath),{code:'ENOENT'});
});
test('normal release refuses changed historical banks, removed public files and symlink roots',async t=>{
 const f=await fixture(t),p='data/releases/2026.10.02-seed.1/bank.json';await fs.appendFile(path.join(f.workRoot,p),' ');f.reviewedInventory=await inventory(f.workRoot);await assert.rejects(writeReleaseDeliveryPair(f),/Immutable bank/);await fs.copyFile(path.join(f.baseRoot,p),path.join(f.workRoot,p));
 const linked=f.workRoot+'-link';await fs.symlink(f.workRoot,linked);await assert.rejects(writeReleaseDeliveryPair({...f,workRoot:linked}),/Symlink root/);
 const allow=await fs.readFile(path.join(f.workRoot,'PUBLICATION-MANIFEST.txt'),'utf8');await fs.writeFile(path.join(f.workRoot,'PUBLICATION-MANIFEST.txt'),allow.split('\n').filter(x=>x!=='style.css').join('\n'));f.reviewedInventory=await inventory(f.workRoot);await assert.rejects(writeReleaseDeliveryPair(f),/does not delete/);
});
test('normal release obeys current time, final cutoff, persistent freeze and exact release identity',async t=>{
 const f=await fixture(t);await assert.rejects(writeReleaseDeliveryPair({...f,now:FREEZE_AT}),/Invalid release/);await assert.rejects(writeReleaseDeliveryPair({...f,baseVerifiedAt:new Date(f.now+1000).toISOString()}),/Invalid release/);await assert.rejects(writeReleaseDeliveryPair({...f,roundId:'round-999'}),/Exact closed/);
 await fs.writeFile(path.join(f.workRoot,'data/publication-state.json'),'{"finalized":true}\n');f.reviewedInventory=await inventory(f.workRoot);await assert.rejects(writeReleaseDeliveryPair(f),/Persistent freeze/);
});

test('normal backup cannot clear a baseline finalRelease marker even if its state file was inconsistent',async t=>{
 const f=await fixture(t),p=path.join(f.baseRoot,'data/manifest.json'),m=JSON.parse(await fs.readFile(p));m.finalRelease=true;await fs.writeFile(p,JSON.stringify(m,null,2)+'\n');f.baseInventory=await inventory(f.baseRoot);await assert.rejects(writeReleaseDeliveryPair(f),/freeze/);await assert.rejects(fs.stat(f.deltaOutputPath),{code:'ENOENT'});
});
