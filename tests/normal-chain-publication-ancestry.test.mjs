/** Synthetic structural reconciliation only. Never a real observation or pin. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {normalPublicationTree} from '../scripts/normal-publication.mjs';
import {PUBLICATION_SYNCHRONIZATIONS} from '../scripts/publication-sync.mjs';
import {ANCESTOR_PUBLICATION_TRANSITION,validateNormalChainAncestorTransition} from '../scripts/normal-chain-publication-ancestry.mjs';
const root=path.resolve(import.meta.dirname,'..'),read=p=>fs.readFileSync(path.join(root,p)),J=x=>Buffer.from(JSON.stringify(x,null,2)+'\n'),H=b=>createHash('sha256').update(b).digest('hex'),G=b=>createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`),b])).digest('hex');
const row=(path,raw)=>({path,bytes:raw.length,sha256:H(raw),gitBlob:G(raw)}),D=rows=>rows.map(({gitBlob,...f})=>f).sort((a,b)=>a.path.localeCompare(b.path));
function fixture(){
 const pins=PUBLICATION_SYNCHRONIZATIONS,events=pins.map(p=>JSON.parse(read(p.path))),p=events.find(e=>e.syncId==='normal-032');
 const roots=JSON.parse(read('docs/deliveries/normal-backup-root-trust.json')).roots,rootPin=roots.find(p=>p.roundId==='round-032'),rp=JSON.parse(read(rootPin.path));
 const chainPins=JSON.parse(read('docs/deliveries/normal-backup-chain-trust.json')).checkpoints,sp=chainPins.find(p=>p.roundId==='round-033'),successor=JSON.parse(read(sp.path));
 const entry=(proof,pin)=>({proof,pin,roundId:proof.roundId,proofSha256:pin.sha256,offlineBase:{roundId:proof.roundId,bankVersion:proof.completeManifest.sourceRelease.bankVersion,bankSha256:proof.completeManifest.sourceRelease.bankSha256,ledgerSha256:proof.completeManifest.sourceRelease.ledgerSha256}});
 const chain={sources:[entry(rp,rootPin),entry(successor,sp)]},before=successor.publicAnchor;
 // These Git blobs/tree and times are explicitly synthetic unit-test values.
 const knownRows=new Map(p.remoteInventory.map(f=>[f.path,f]));const old=before.remoteInventory.map(f=>({...f,gitBlob:knownRows.get(f.path)?.sha256===f.sha256?knownRows.get(f.path).gitBlob:createHash('sha1').update('synthetic-anchor:'+f.path+f.sha256).digest('hex')}));
 for(const [name,raw]of [['data/manifest.json',before.manifestRaw],['data/publication-state.json',before.publicationStateRaw],['PUBLICATION-MANIFEST.txt',before.allowlistRaw]])old.find(f=>f.path===name).gitBlob=G(Buffer.from(raw));
 const eventPath=`docs/publications/${p.syncId}.json`,eventRaw=J(p),support=new Map(p.remoteInventory.map(f=>[f.path,f]));
 support.set(eventPath,row(eventPath,eventRaw));support.set('scripts/publication-sync.mjs',row('scripts/publication-sync.mjs',Buffer.from('synthetic support registration only\n')));
 support.set('PUBLICATION-MANIFEST.txt',row('PUBLICATION-MANIFEST.txt',Buffer.from([...support.keys()].sort().join('\n')+'\n')));
 const rows=[...support.values()].sort((a,b)=>a.path.localeCompare(b.path)),at='2026-10-08T14:40:00Z',head='a'.repeat(40);
 const livePaths=[eventPath,'scripts/publication-sync.mjs','PUBLICATION-MANIFEST.txt','data/manifest.json','data/publication-state.json',`data/${p.manifest.file}`];
 const v={verifiedAt:'2026-10-08T14:39:00Z',pages:{runId:1,headSha:head,status:'completed',conclusion:'success',url:`https://github.com/${p.repository}/actions/runs/1`,completedAt:'2026-10-08T14:37:00Z'},liveAssets:livePaths.map(path=>{const f=support.get(path);return {path,url:new URL(path,p.siteUrl).href,http:200,bytes:f.bytes,sha256:f.sha256,observedAt:'2026-10-08T14:38:00Z'};}),evidenceSha256:'e'.repeat(64)};
 const commit=(commit,parent,remoteInventory,supportVerification=null)=>({commit,parent,tree:normalPublicationTree(remoteInventory),remoteInventory,observedAt:at,requestSha256:'1'.repeat(64),responseSha256:'2'.repeat(64),supportVerification});
 const evidence={schemaVersion:1,kind:'verified_normal_chain_publication_ancestry',anchorCommit:before.baseCommit,headCommit:head,observedAt:at,headResponseSha256:'3'.repeat(64),commits:[commit(before.baseCommit,'b'.repeat(40),old),commit(p.commit,p.parent,p.remoteInventory),commit(head,p.commit,rows,v)],publications:[{path:eventPath,sha256:H(eventRaw)}]};
 const after={baseCommit:head,observedAt:at,manifestRaw:p.runtimeManifestRaw,publicationStateRaw:p.publicationStateRaw,allowlistRaw:[...support.keys()].sort().join('\n')+'\n',remoteInventory:D(rows)};
 return {t:{kind:ANCESTOR_PUBLICATION_TRANSITION,sourceAnchorSha256:H(J(before)),evidence},c:{beforeAnchor:before,afterAnchor:after,chain,publicationPins:pins,publicationRecords:events,source:{status:'closed',startedAt:'2026-10-08T14:00:00Z',decisionDeadline:'2026-10-08T14:35:00Z',closedAt:'2026-10-08T14:30:00Z'},previous:chain.sources.at(-1),now:Date.parse('2026-10-08T14:45:00Z')}};
}
const run=f=>validateNormalChainAncestorTransition(f.t,f.c);
test('explicit ancestry contract binds original anchor and already-published delivered ancestor without granting publication',()=>{const f=fixture(),before=J(f);const r=run(f);assert.equal(r.status,'validated_exact_ancestor_publication_transition');assert.equal(r.canPublish,false);assert.deepEqual(J(f),before);});
const cases=[
 ['wrong discriminator',f=>f.t.kind='caller_approved'],
 ['missing intermediate commit',f=>f.t.evidence.commits.splice(1,1)],
 ['interleaved parent',f=>f.t.evidence.commits[2].parent='c'.repeat(40)],
 ['duplicate commit',f=>f.t.evidence.commits.push(f.t.evidence.commits[2])],
 ['forged publication hash',f=>f.t.evidence.publications[0].sha256='f'.repeat(64)],
 ['forged imported record',f=>f.c.publicationRecords.at(-1).verifiedAt='2026-10-08T12:40:00Z'],
 ['omitted imported prefix',f=>f.c.publicationRecords.shift()],
 ['stale or wrong parent',f=>f.c.afterAnchor.baseCommit='c'.repeat(40)],
 ['future parent observation',f=>f.c.now=Date.parse('2026-10-08T14:39:00Z')],
 ['final cutoff',f=>f.c.now=Date.parse('2026-10-16T15:00:00Z')],
 ['finalized current marker',f=>f.c.afterAnchor.publicationStateRaw='{"finalized":true}\n'],
 ['changed original source start',f=>f.c.source.startedAt='2026-10-08T13:00:00Z'],
 ['late decision closure',f=>f.c.source.closedAt='2026-10-08T14:36:00Z'],
 ['changed predecessor eligibility',f=>f.c.previous.pin.eligibleAt='2026-10-08T14:10:00Z'],
 ['different immutable ledger',f=>f.c.chain.sources[0].offlineBase.ledgerSha256='f'.repeat(64)],
 ['missing delivered ancestor',f=>f.c.chain.sources.shift()],
 ['wrong support Pages head',f=>f.t.evidence.commits[2].supportVerification.pages.headSha='d'.repeat(40)],
 ['support pending Pages',f=>f.t.evidence.commits[2].supportVerification.pages.status='in_progress'],
 ['missing support live marker',f=>f.t.evidence.commits[2].supportVerification.liveAssets.pop()],
 ['changed live hash',f=>f.t.evidence.commits[2].supportVerification.liveAssets[0].sha256='f'.repeat(64)],
 ['live before Pages',f=>f.t.evidence.commits[2].supportVerification.liveAssets[0].observedAt='2026-10-08T14:36:00Z'],
 ['support Pages before payload verification',f=>f.t.evidence.commits[2].supportVerification.pages.completedAt='2026-10-08T12:00:00Z'],
 ['missing source anchor binding',f=>f.t.sourceAnchorSha256='f'.repeat(64)],
 ['changed external support path',f=>{const c=f.t.evidence.commits[2],r=c.remoteInventory.find(r=>r.path==='README.md');r.sha256='f'.repeat(64);r.gitBlob='c'.repeat(40);c.tree=normalPublicationTree(c.remoteInventory);}],
 ['changed historical bank',f=>{const c=f.t.evidence.commits[2],r=c.remoteInventory.find(r=>r.path.startsWith('data/releases/'));r.sha256='f'.repeat(64);r.gitBlob='c'.repeat(40);c.tree=normalPublicationTree(c.remoteInventory);}],
 ['deleted path',f=>{const c=f.t.evidence.commits[2];c.remoteInventory=c.remoteInventory.filter(r=>r.path!=='README.md');c.tree=normalPublicationTree(c.remoteInventory);}],
 ['forged known event Git blob',f=>{const c=f.t.evidence.commits[2];c.remoteInventory.find(r=>r.path==='docs/publications/normal-032.json').gitBlob='f'.repeat(40);c.tree=normalPublicationTree(c.remoteInventory);} ],
 ['forged endpoint marker Git blob',f=>{const c=f.t.evidence.commits[2];c.remoteInventory.find(r=>r.path==='PUBLICATION-MANIFEST.txt').gitBlob='f'.repeat(40);c.tree=normalPublicationTree(c.remoteInventory);} ],
 ['caller trusted boolean',f=>f.t.evidence.trusted=true]
];
for(const [name,mutate]of cases)test('rejects '+name,()=>{const f=fixture();mutate(f);assert.throws(()=>run(f),/Normal-chain ancestry/);});

test('successor inspector composes the explicit transition without changing its historical ledger baseline (synthetic archive descriptors only)',async()=>{
 const {inspectNormalBackupSuccessor}=await import('../scripts/normal-backup-chain.mjs'),f=fixture(),previous=f.c.previous,chain=f.c.chain,rootEntry=chain.sources[0];
 for(const e of chain.sources)Object.assign(e.offlineBase,{manifestSha256:H(J(e.proof.deltaManifest)),baseCommit:(e.proof.publicAnchor??e.proof.continuationAnchor).baseCommit});
 Object.assign(chain,{rootProofSha256:rootEntry.proofSha256,sourceAnchor:rootEntry.proof.sourceAnchor,continuationAnchor:f.c.beforeAnchor});
 const id='round-999',bankVersion='synthetic.999',bankRaw=J({bankVersion,syntheticOnly:true}),b=previous.offlineBase;
 const source={...f.c.source,roundId:id,baseline:{sourceCommit:b.baseCommit,bankVersion:b.bankVersion,bankSha256:b.bankSha256,offlinePredecessor:{artifactSha256:previous.proof.deltaArtifactSha256,manifestSha256:b.manifestSha256,ledgerSha256:b.ledgerSha256,roundId:previous.roundId}},publication:{status:'not_attempted',commit:null,verifiedAt:null,bankVersion,bankSha256:H(bankRaw)}};
 const files=new Map(read('PUBLICATION-MANIFEST.txt').toString().split(/\r?\n/).filter(p=>p&&!p.startsWith('#')).map(p=>[p,read(p)]));
 const manifest=J({bankVersion,file:`releases/${bankVersion}/bank.json`,sha256:H(bankRaw),finalRelease:false});
 files.set(`docs/rounds/${id}.json`,J(source));files.set(`data/releases/${bankVersion}/bank.json`,bankRaw);files.set('data/manifest.json',manifest);files.set('PUBLICATION-MANIFEST.txt',Buffer.from([...files.keys()].sort().join('\n')+'\n'));
 const all=D([...files].map(([path,raw])=>row(path,raw))),anchor=new Map(f.c.afterAnchor.remoteInventory.map(r=>[r.path,r])),deltaSha=H(Buffer.from('synthetic undelivered delta999')),completeSha=H(Buffer.from('synthetic undelivered complete999'));
 const d={schemaVersion:1,kind:'developer_patch_not_learner_import',deliveryMode:'release_backup',roundId:id,baseCommit:f.c.afterAnchor.baseCommit,baseVerifiedAt:f.c.afterAnchor.observedAt,preparedAt:'2026-10-08T14:41:00Z',gitPublicationStatus:'not_attempted',publicationCommit:null,bankVersion,bankSha256:H(bankRaw),newlyPublishedByPackaging:0,prerequisiteArtifacts:[],files:all.filter(r=>anchor.get(r.path)?.sha256!==r.sha256).map(r=>({...r,beforeSha256:anchor.get(r.path)?.sha256??null})),deletions:[]};
 const registryPaths=['docs/deliveries/release-backup-trust.json','docs/deliveries/offline-chain-trust.json','docs/deliveries/normal-backup-root-trust.json','docs/deliveries/normal-backup-chain-trust.json','docs/quarantines/trust.json','docs/release-blocks/trust.json'];
 const proof={schemaVersion:1,kind:'delivered_normal_release_successor_checkpoint',rootProofSha256:chain.rootProofSha256,previousProofSha256:previous.proofSha256,roundId:id,predecessor:{roundId:previous.roundId,artifactSha256:previous.proof.deltaArtifactSha256,manifestSha256:b.manifestSha256,ledgerSha256:b.ledgerSha256,proofSha256:previous.proofSha256,bankVersion:b.bankVersion,bankSha256:b.bankSha256,eligibleAt:previous.pin.eligibleAt},deltaArtifactSha256:deltaSha,completeArtifactSha256:completeSha,privateEvidence:{libraryReceiptSha256:'1'.repeat(64),attachmentReceiptSha256:'2'.repeat(64),uploadResultSha256:'3'.repeat(64),archiveAuditSha256:'4'.repeat(64),sourceCheckpointSha256:'5'.repeat(64),terminalEvidenceSha256:null},archiveVerifiedAt:'2026-10-08T14:42:00Z',attachmentAcceptedAt:'2026-10-08T14:43:00Z',verificationCompletedAt:'2026-10-08T14:45:00Z',newlyPublishedRegular:0,canPublish:false,userOpenOrDownloadObserved:false,publicAnchor:f.c.afterAnchor,anchorTransition:f.t,priorTrustSha256:H(files.get('docs/deliveries/normal-backup-chain-trust.json')),preservedRegistries:registryPaths.map(path=>({path,raw:files.get(path).toString()})),deltaManifest:d,completeManifest:{schemaVersion:2,archiveFormat:'7z',kind:'complete_project_not_learner_import',deliveryMode:'release_backup',newlyPublishedRegular:0,projectDirectory:'project',prerequisiteArtifacts:[],sourceRelease:{roundId:id,deltaArtifactSha256:deltaSha,deltaManifestSha256:H(J(d)),baseCommit:d.baseCommit,bankVersion,bankSha256:H(bankRaw),ledgerPath:`docs/rounds/${id}.json`,ledgerSha256:H(J(source))},frozenSourceInventory:all,packagingRevision:null,files:all},runtimeManifestRaw:manifest.toString(),publicationStateRaw:files.get('data/publication-state.json').toString(),sourceAllowlistRaw:files.get('PUBLICATION-MANIFEST.txt').toString(),stoppedPublisher:null};
 const result=inspectNormalBackupSuccessor(proof,previous,chain,source);assert.equal(result.baseCommit,f.c.afterAnchor.baseCommit);assert.equal(source.baseline.sourceCommit,b.baseCommit);assert.notEqual(result.baseCommit,source.baseline.sourceCommit);assert.equal(proof.canPublish,false);
 const bad=structuredClone(proof);bad.anchorTransition.kind='legacy_same_bank';assert.throws(()=>inspectNormalBackupSuccessor(bad,previous,chain,source),/same public bank|Unexpected normal-chain/);
 const changed=structuredClone(source);changed.baseline.sourceCommit=result.baseCommit;assert.throws(()=>inspectNormalBackupSuccessor(proof,previous,chain,changed),/exact registered delivered predecessor/);
});
