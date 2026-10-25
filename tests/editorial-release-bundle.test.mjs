import {createLocalPublicHistoryFixture} from './local-public-history-fixtures.mjs';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';

// This exact prior public-source fixture never authorizes the current local-only bank.
const history=await createLocalPublicHistoryFixture(after);
const {resolveReleaseDeliveryOwner}=await history.module('scripts/release-bundle.mjs');
const {freezeCompleteProject}=await history.module('scripts/complete-bundle.mjs');
const {loadPublicationSelections}=await history.module('scripts/publication-selection.mjs');
const {withCurrentReleaseAuthority,currentCutoffBlocks}=await history.module('scripts/current-release-authority.mjs');
// Synthetic owner/API fixtures only. The actual pair validates the complete campaign.
const digest='a'.repeat(64),version='synthetic-editorial.998';
function fixture(editorial=true){
 const ledger={...(editorial?{kind:'accepted_content_editorial',correctionRoundId:'editorial-998'}:{roundId:'round-998'}),status:'closed',publication:{bankVersion:version,bankSha256:digest}};
 return {ledgers:editorial?[]:[ledger],editorials:editorial?[ledger]:[],manifest:{bankVersion:version,sha256:digest}};
}
test('editorial pair owner uses exact typed ledger and canonical corrections path',()=>{
 const c=fixture(),r=resolveReleaseDeliveryOwner(c,'editorial-998');
 assert.equal(r.ledger,c.editorials[0]);assert.equal(r.ledgerPath,'docs/corrections/editorial-998.json');
 assert.equal(r.identity.effectiveBankVersion,version);assert.equal(r.identity.effectiveBankSha256,digest);assert.equal(r.identity.selectionReference,null);
});
test('ordinary pair owner keeps canonical regular path',()=>{
 const c=fixture(false),r=resolveReleaseDeliveryOwner(c,'round-998');assert.equal(r.ledger,c.ledgers[0]);assert.equal(r.ledgerPath,'docs/rounds/round-998.json');
});
test('actual immutable041 owner resolves to its authenticated selected bank',async()=>{
 const root=history.root;
 await withCurrentReleaseAuthority({root},async()=>{
 const publicationSelections=await loadPublicationSelections(root,{now:Date.now()});
 const ledger=JSON.parse(await fs.readFile(path.join(root,'docs/rounds/round-041.json'),'utf8'));
 const context={ledgers:[ledger],editorials:[],publicationSelections,manifest:{bankVersion:'2026.10.10-regular.41-selection.1',sha256:'de4397ef9e0fb1d717bfc21dcc43a41c257a37b3c0f22e6c6e326544e7fca8f4'}};
 const r=resolveReleaseDeliveryOwner(context,'round-041');
 assert.equal(r.ledger,ledger);assert.equal(r.ledgerPath,'docs/rounds/round-041.json');
 assert.deepEqual(r.identity.selectionReference,{path:'docs/publication-selections/round-041-selection-001.json',sha256:'8b6a937f4af4fc6513f1366277e6f0dfddb12cf1c53c78d824cf846199db3254'});
 assert.equal(r.identity.effectiveBankVersion,context.manifest.bankVersion);assert.equal(r.identity.effectiveBankSha256,context.manifest.sha256);
 });assert.equal(currentCutoffBlocks(Date.now(),{root}),true,'current selection scope must not escape');
 await assert.rejects(loadPublicationSelections(root,{now:Date.now()}),/current time must precede final cutoff/);
});
test('wrong owner collection, kind and conflicting aliases fail closed',()=>{
 for(const mutate of [c=>{c.ledgers=c.editorials;c.editorials=[];},c=>{c.editorials[0].kind='regular';},c=>{c.editorials[0].roundId='round-998';}]){const c=fixture();mutate(c);assert.throws(()=>resolveReleaseDeliveryOwner(c,'editorial-998'),/kind or identity/);}
 const c=fixture(false);c.ledgers[0].kind='accepted_content_editorial';assert.throws(()=>resolveReleaseDeliveryOwner(c,'round-998'),/kind or identity/);
});
test('ambiguous and missing owner never choose a first match',()=>{
 const c=fixture();c.editorials.push(structuredClone(c.editorials[0]));assert.throws(()=>resolveReleaseDeliveryOwner(c,'editorial-998'),/Exactly one/);
 const cross=fixture();cross.ledgers.push({roundId:'editorial-998'});assert.throws(()=>resolveReleaseDeliveryOwner(cross,'editorial-998'),/Exactly one/);
 assert.throws(()=>resolveReleaseDeliveryOwner({...fixture(),editorials:[]},'editorial-998'),/Exactly one/);
});
test('open owner and mismatched manifest bank/hash remain blocked',()=>{
 for(const mutate of [c=>{c.editorials[0].status='running';},c=>{c.manifest.bankVersion='wrong';},c=>{c.manifest.sha256='b'.repeat(64);},c=>{delete c.manifest;}]){const c=fixture();mutate(c);assert.throws(()=>resolveReleaseDeliveryOwner(c,'editorial-998'),/Exact closed current/);}
});
test('malformed identities and owner collections fail',()=>{
 for(const id of ['editorial-','editorial-998/../x','round-x','other-998'])assert.throws(()=>resolveReleaseDeliveryOwner(fixture(),id),/Invalid release owner/);
 assert.throws(()=>resolveReleaseDeliveryOwner({...fixture(),editorials:{}},'editorial-998'),/collections/);
});
test('existing COMPLETE schema rejects editorial source with regular ledger path before archive output',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'editorial-owner-schema-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const raw=Buffer.from('fixture');await fs.writeFile(path.join(root,'fixture.txt'),raw,{flag:'wx'});
 const entry={path:'fixture.txt',bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex')};
 const sourceRelease={roundId:'editorial-998',deltaArtifactSha256:digest,deltaManifestSha256:digest,baseCommit:'a'.repeat(40),bankVersion:version,bankSha256:digest,ledgerPath:'docs/rounds/editorial-998.json',ledgerSha256:digest};
 await assert.rejects(freezeCompleteProject({workRoot:root,reviewedInventory:[entry],sourceRelease,deliveryMode:'release_backup',now:Date.parse('2026-10-11T01:00:00Z')}),/Invalid release identity/);
});
