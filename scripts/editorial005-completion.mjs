/** Approved completion of the already closed editorial-005 only.
 * This is a current-window policy, never content validation, a saved PASS,
 * publication authority, a new campaign schedule, or a process controller. */
import {AsyncLocalStorage} from 'node:async_hooks';
import {readFileSync,lstatSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {FREEZE_AT} from '../src/domain.js';

export const EDITORIAL005_COMPLETION=Object.freeze({
  roundId:'editorial-005',
  baseCommit:'5fb79453e1bd2942353c8a15f3942352aa3baa3b',
  manifestSha256:'5d16fd0e2ff104f3a57b1a8b6ff3b431599475cdb0f1589125c065f11836596f',
  ledgerPath:'docs/corrections/editorial-005.json',
  ledgerSha256:'4d756f3b9ee5d818180f80bc47fc052fbb3d4f23aee11cb72792dfe535d2faa3',
  bankVersion:'2026.10.14-editorial.5',
  bankSha256:'42c3eed6dea79a03f78226b1887b93c71f11f0d3fb6fa63b5ba3c298a823edf2'
});
const authorityRoot=path.resolve(import.meta.dirname,'..'),scope=new AsyncLocalStorage();
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const freezeOpen=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&value.finalized===false;
function readRegular(root,relative){
  root=path.resolve(root);
  for(let p=root;;p=path.dirname(p)){if(lstatSync(p).isSymbolicLink())throw Error('Completion root cannot be a symbolic link');if(p===path.dirname(p))break;}
  let p=root;
  for(const [i,part] of relative.split('/').entries()){
    p=path.join(p,part);const st=lstatSync(p);
    if(st.isSymbolicLink()||(i===relative.split('/').length-1?!st.isFile():!st.isDirectory()))throw Error('Completion requires regular source files');
  }
  return readFileSync(p);
}
function exactIdentity(read){
  const raw=read('data/manifest.json'),ledgerRaw=read(EDITORIAL005_COMPLETION.ledgerPath);
  if(!Buffer.isBuffer(raw)||!Buffer.isBuffer(ledgerRaw)||hash(raw)!==EDITORIAL005_COMPLETION.manifestSha256||hash(ledgerRaw)!==EDITORIAL005_COMPLETION.ledgerSha256)return false;
  const manifest=JSON.parse(raw),ledger=JSON.parse(ledgerRaw),state=JSON.parse(read('data/publication-state.json'));
  const bank=read(`data/releases/${EDITORIAL005_COMPLETION.bankVersion}/bank.json`);
  if(!Buffer.isBuffer(bank)||hash(bank)!==EDITORIAL005_COMPLETION.bankSha256)return false;
  return freezeOpen(state)&&manifest.finalRelease===false&&manifest.bankVersion===EDITORIAL005_COMPLETION.bankVersion&&manifest.sha256===EDITORIAL005_COMPLETION.bankSha256&&ledger.status==='closed'&&ledger.correctionRoundId===EDITORIAL005_COMPLETION.roundId&&ledger.baseline.sourceCommit===EDITORIAL005_COMPLETION.baseCommit;
}
function active(now,markers={}){
  const current=scope.getStore(),actual=Date.now();
  if(!current?.active||!Number.isFinite(now)||now<FREEZE_AT||!Number.isFinite(actual)||actual<FREEZE_AT||now>actual)return false;
  try{
    if(markers.root!==undefined&&path.resolve(markers.root)!==current.root)return false;
    if(markers.roundId!==undefined&&markers.roundId!==EDITORIAL005_COMPLETION.roundId)return false;
    if(markers.baseCommit!==undefined&&markers.baseCommit!==EDITORIAL005_COMPLETION.baseCommit)return false;
    // Re-read both roots at every boundary. No validation or identity cache.
    for(const root of new Set([authorityRoot,current.root]))if(!exactIdentity(p=>readRegular(root,p)))return false;
    if(markers.manifest!=null&&hash(json(markers.manifest))!==EDITORIAL005_COMPLETION.manifestSha256)return false;
    if(markers.publicationState!=null&&!freezeOpen(markers.publicationState))return false;
    if(markers.files&&!exactIdentity(p=>markers.files.get(p)))return false;
    return true;
  }catch{return false;}
}
/** Existing historical comparisons stay on FREEZE_AT. Only current consumers
 * may call this predicate, inside an exact completion invocation. */
export function currentCutoffBlocks(now,markers={}){
  return !Number.isFinite(now)||(now>=FREEZE_AT&&!active(now,markers));
}
/** A delivered historical chain may be read for this completion even though
 * it still cannot start new content. Never changes that returned decision. */
export function completionHistoryReadable(checked,now,markers={}){
  return active(now,markers)&&checked?.ok===true&&checked.canStartNewContent===false&&Array.isArray(checked.continuationBlockers)&&checked.continuationBlockers.length===1&&checked.continuationBlockers[0]==='Final cutoff or persistent freeze blocks offline advancement';
}
/** Explicit build/ledger inputs cannot turn completion into a new content path.
 * Historical invocations keep their original candidate validation behavior. */
export function assertEditorial005CompletionInput(input,now=Date.now()){
  if(input&&(!Number.isFinite(now)||now>=FREEZE_AT))throw Error('Current editorial-005 completion does not accept explicit candidate inputs');
}
/** The callback has no stored proof or process lifecycle. A delayed child
 * cannot retain the exception after its owning invocation has finished. */
export async function withEditorial005Completion({root,now=Date.now(),baseCommit=EDITORIAL005_COMPLETION.baseCommit,roundId=EDITORIAL005_COMPLETION.roundId},operation){
  if(!Number.isFinite(now)||typeof operation!=='function')throw Error('Invalid completion invocation');
  if(now<FREEZE_AT)return operation();
  if(baseCommit!==EDITORIAL005_COMPLETION.baseCommit||roundId!==EDITORIAL005_COMPLETION.roundId)throw Error('Completion is limited to editorial-005 and its approved public baseline');
  const current={root:path.resolve(root),active:true};
  return scope.run(current,async()=>{
    try{
      if(!active(now))throw Error('PUBLICATION BLOCKED: current cutoff completion requires exact unfrozen editorial-005 source and actual current time');
      return await operation();
    }finally{current.active=false;}
  });
}
