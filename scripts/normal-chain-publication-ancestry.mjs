/** Exact, separately reviewed transition across a delivered ancestor publication.
 * Pure structure/evidence binding only: no Git authority, receipt, pin or retry.
 * The trusted caller supplies its imported publication pins and unchanged bytes.
 * Hashes of actual raw observations require independent review before registration.
 */
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {normalPublicationTree} from './normal-publication.mjs';
import {FREEZE_AT} from '../src/domain.js';
export const ANCESTOR_PUBLICATION_TRANSITION='verified_normal_chain_ancestor_publication';
const G=b=>createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`),b])).digest('hex');
const H=b=>createHash('sha256').update(b).digest('hex'),J=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
const sha=/^(?!0{40}$)[a-f0-9]{40}$/,hex=/^(?!0{64}$)[a-f0-9]{64}$/;
const fail=m=>{throw Error('Normal-chain ancestry: '+m);};
function keys(v,expected){if(!v||Array.isArray(v)||!equal(Object.keys(v).sort(),[...expected].sort()))fail('unexpected fields');}
function time(v){const n=Date.parse(v);if(typeof v!=='string'||!Number.isFinite(n)||n>=FREEZE_AT)fail('invalid chronology or final cutoff');return n;}
const descriptors=rows=>rows.map(({path,bytes,sha256})=>({path,bytes,sha256})).sort((a,b)=>a.path.localeCompare(b.path));
function inventory(rows,tree){
 if(!Array.isArray(rows)||!rows.length)fail('complete actual commit inventory required');const seen=new Set();
 for(const f of rows){keys(f,['path','bytes','sha256','gitBlob']);if(typeof f.path!=='string'||!/^[-A-Za-z0-9_./]+$/.test(f.path)||f.path.startsWith('/')||f.path.split('/').some(v=>!v||v==='.'||v==='..')||seen.has(f.path)||!Number.isSafeInteger(f.bytes)||f.bytes<0||!hex.test(f.sha256)||!sha.test(f.gitBlob))fail('unsafe or incomplete commit inventory');seen.add(f.path);}
 if(!sha.test(tree)||normalPublicationTree(rows)!==tree)fail('commit inventory/tree mismatch');return new Map(rows.map(f=>[f.path,f]));
}
const immutable=p=>/^data\/(?:releases\/|seed-bank)/.test(p)||/^docs\/(?:rounds\/round-\d+\.(?:json|md)$|corrections\/|publications\/|deliveries\/|quarantines\/|release-blocks\/|incidents\/)/.test(p)&&!p.endsWith('trust.json')||p.startsWith('docs/analysis/');
function preserve(before,after){for(const [p,f]of before){if(!after.has(p))fail('public path deleted: '+p);if(immutable(p)&&!equal(f,after.get(p)))fail('immutable or external support path changed: '+p);}}
function support(c,previous,p,eventRef,siteUrl,headObservedAt){
 const v=c.supportVerification;keys(v,['verifiedAt','pages','liveAssets','evidenceSha256']);const at=time(v.verifiedAt),pages=v.pages;
 keys(pages,['runId','headSha','status','conclusion','url','completedAt']);
 if(!hex.test(v.evidenceSha256)||at>time(headObservedAt)||at<time(p.verifiedAt)||!Number.isSafeInteger(pages.runId)||pages.runId<=0||pages.headSha!==c.commit||pages.status!=='completed'||pages.conclusion!=='success'||pages.url!==`https://github.com/${p.repository}/actions/runs/${pages.runId}`||time(pages.completedAt)>at||time(pages.completedAt)<time(p.verifiedAt))fail('exact support Pages chronology required');
 const old=new Map(previous.remoteInventory.map(f=>[f.path,f])),inv=new Map(c.remoteInventory.map(f=>[f.path,f]));
 const changed=c.remoteInventory.filter(f=>!equal(f,old.get(f.path))).map(f=>f.path).sort(),expected=['PUBLICATION-MANIFEST.txt','scripts/publication-sync.mjs',eventRef.path].sort();
 if(previous.commit!==p.commit||!equal(changed,expected)||old.has(eventRef.path)||inv.get(eventRef.path)?.sha256!==eventRef.sha256||inv.get(eventRef.path)?.bytes!==J(p).length||inv.get(eventRef.path)?.gitBlob!==G(J(p)))fail('unreviewed external changed paths or non-publication support commit');
 if(!Array.isArray(v.liveAssets))fail('actual support live bytes required');const seen=new Set();
 for(const f of v.liveAssets){keys(f,['path','url','http','bytes','sha256','observedAt']);if(seen.has(f.path)||f.http!==200||f.url!==new URL(f.path,siteUrl).href||!equal(descriptors([f])[0],descriptors([inv.get(f.path)??{}])[0])||time(f.observedAt)<time(pages.completedAt)||time(f.observedAt)>at)fail('exact support live bytes/time required');seen.add(f.path);}
 for(const path of [...expected,'data/manifest.json','data/publication-state.json',`data/${p.manifest.file}`])if(!seen.has(path))fail('missing support live dependency');
}
/** Historical proofs and legacy same-bank transitions remain byte-for-byte valid.
 * Only publication payloads with exact imported pins and their immediate, separately
 * verified three-file registration support commits can occur along this new path. */
export function validateNormalChainAncestorTransition(t,{beforeAnchor,afterAnchor,chain,publicationPins,publicationRecords,source,previous,now}){
 keys(t,['kind','sourceAnchorSha256','evidence']);if(t.kind!==ANCESTOR_PUBLICATION_TRANSITION||t.sourceAnchorSha256!==H(J(beforeAnchor)))fail('explicit exact historical anchor discriminator required');
 const e=t.evidence;keys(e,['schemaVersion','kind','anchorCommit','headCommit','observedAt','headResponseSha256','commits','publications']);
 if(e.schemaVersion!==1||e.kind!=='verified_normal_chain_publication_ancestry'||e.anchorCommit!==beforeAnchor.baseCommit||e.headCommit!==afterAnchor.baseCommit||e.anchorCommit===e.headCommit||e.observedAt!==afterAnchor.observedAt||!hex.test(e.headResponseSha256)||!Array.isArray(e.commits)||e.commits.length<2||!Array.isArray(e.publications)||!e.publications.length||!Number.isFinite(now)||now>=FREEZE_AT||time(e.observedAt)>now||time(e.observedAt)<time(beforeAnchor.observedAt))fail('actual current descendant observation required');
 for(const a of [beforeAnchor,afterAnchor])if(JSON.parse(a.manifestRaw).finalRelease!==false||JSON.parse(a.publicationStateRaw).finalized!==false)fail('frozen historical or new anchor');
 if(!source||source.status!=='closed'||time(source.closedAt)<time(source.startedAt)||time(source.closedAt)>time(source.decisionDeadline)||time(source.startedAt)<time(previous.pin.eligibleAt)||time(source.closedAt)>now)fail('original candidate window or predecessor eligibility changed');
 const known=new Map();
 for(const [i,p]of publicationRecords.entries()){const pin=publicationPins[i];if(!pin||pin.path!==`docs/publications/${p.syncId}.json`||H(J(p))!==pin.sha256||i&&(p.previousSynchronizationSha256!==publicationPins[i-1].sha256||time(p.verifiedAt)<=time(publicationRecords[i-1].verifiedAt)))fail('missing, forged or reordered imported publication history');known.set(pin.sha256,p);}
 if(publicationRecords.length!==publicationPins.length)fail('complete imported publication history required');
 const seen=new Set(),observed=[];let prior=null,priorInventory=null;
 for(const [i,c]of e.commits.entries()){
  keys(c,['commit','parent','tree','remoteInventory','observedAt','requestSha256','responseSha256','supportVerification']);
  if(!sha.test(c.commit)||!sha.test(c.parent)||seen.has(c.commit)||c.commit===c.parent||!hex.test(c.requestSha256)||!hex.test(c.responseSha256)||time(c.observedAt)>time(e.observedAt)||i===0&&c.commit!==e.anchorCommit||prior&&c.parent!==prior.commit)fail('missing, interleaved or unauthenticated contiguous commit path');
  seen.add(c.commit);const inv=inventory(c.remoteInventory,c.tree);
  if(!prior){if(c.supportVerification!==null||!equal(descriptors(c.remoteInventory),descriptors(beforeAnchor.remoteInventory)))fail('original anchor inventory changed');}
  else{
   preserve(priorInventory,inv);const matches=[...known].filter(([,p])=>p.commit===c.commit);
   if(matches.length===1){
    const [digest,p]=matches[0];if(c.supportVerification!==null||p.parent!==prior.commit||p.tree!==c.tree||!equal(p.remoteInventory,c.remoteInventory)||time(p.verifiedAt)>time(e.observedAt))fail('intervening publication differs from exact pinned payload');
    observed.push({path:`docs/publications/${p.syncId}.json`,sha256:digest});
   }else{const ref=observed.at(-1),p=ref&&known.get(ref.sha256);if(matches.length||!p)fail('unreviewed interleaved commit');support(c,prior,p,ref,p.siteUrl,e.observedAt);}
  }
  prior=c;priorInventory=inv;
 }
 if(prior.commit!==e.headCommit||prior.supportVerification===null||!equal(descriptors(prior.remoteInventory),descriptors(afterAnchor.remoteInventory))||!equal(e.publications,observed))fail('forged publication links, stale parent or changed final inventory');
 for(const ref of e.publications)keys(ref,['path','sha256']);
 const tip=known.get(e.publications.at(-1).sha256),actual=JSON.parse(afterAnchor.manifestRaw);
 if(tip.runtimeManifestRaw!==afterAnchor.manifestRaw||tip.publicationStateRaw!==afterAnchor.publicationStateRaw||tip.manifest.bankVersion!==actual.bankVersion||tip.manifest.sha256!==actual.sha256)fail('new public anchor is not the exact last verified publication');
 const ancestorIds=new Set();
 for(const ref of e.publications)for(const s of known.get(ref.sha256).rounds){
  const i=chain.sources.findIndex(v=>v.roundId===s.roundId&&v.offlineBase.bankVersion===s.bankVersion&&v.offlineBase.bankSha256===s.bankSha256&&v.offlineBase.ledgerSha256===s.originalLedgerSha256);
  if(i<0||ancestorIds.has(i))fail('intervening publication is not a distinct original delivered ancestor');ancestorIds.add(i);
 }
 const tipIndex=chain.sources.findIndex(v=>v.offlineBase.bankVersion===actual.bankVersion&&v.offlineBase.bankSha256===actual.sha256);
 if(tipIndex<0||!ancestorIds.has(tipIndex)||tipIndex>chain.sources.indexOf(previous))fail('new anchor does not publish an original predecessor');
 // Both endpoint marker/allowlist descriptors must authenticate the actual raw bytes.
 for(const a of [beforeAnchor,afterAnchor])for(const [path,raw]of [['data/manifest.json',a.manifestRaw],['data/publication-state.json',a.publicationStateRaw],['PUBLICATION-MANIFEST.txt',a.allowlistRaw]]){const f=a.remoteInventory.find(f=>f.path===path),gitRow=(a===beforeAnchor?e.commits[0]:prior).remoteInventory.find(f=>f.path===path);if(typeof raw!=='string'||f?.bytes!==Buffer.byteLength(raw)||f?.sha256!==H(Buffer.from(raw))||gitRow?.gitBlob!==G(Buffer.from(raw)))fail('anchor raw marker bytes changed');}
 return {status:'validated_exact_ancestor_publication_transition',canPublish:false,headCommit:e.headCommit};
}
