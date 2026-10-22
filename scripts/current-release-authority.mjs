/** Current scope dispatcher. Historical campaign cutoffs and the exact005 policy remain unchanged. */
import {AsyncLocalStorage} from 'node:async_hooks';
import path from 'node:path';
import {FREEZE_AT} from '../src/domain.js';
import {withEditorial005Completion,currentCutoffBlocks as editorialBlocks,completionHistoryReadable as editorialHistoryReadable,assertEditorial005CompletionInput,EDITORIAL005_COMPLETION} from './editorial005-completion.mjs';
import {PRACTICAL_WRITTEN,hasPracticalWrittenRegistration,readPracticalWrittenBoundary,assertPracticalWrittenHistory,practicalWrittenHash,readPracticalWrittenFile} from './practical-written-registration.mjs';
const authorityRoot=path.resolve(import.meta.dirname,'..'),scope=new AsyncLocalStorage();
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const open=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&value.finalized===false;
function active(now,markers={}){
  const current=scope.getStore();if(!current?.active||!Number.isFinite(now)||now<FREEZE_AT||now>Date.now())return false;
  try{
    if(markers.root!==undefined&&path.resolve(markers.root)!==current.root)return false;
    if(markers.roundId!==undefined&&![PRACTICAL_WRITTEN.id,EDITORIAL005_COMPLETION.roundId].includes(markers.roundId))return false;
    if(markers.baseCommit!==undefined&&![PRACTICAL_WRITTEN.baselineCommit,EDITORIAL005_COMPLETION.baseCommit].includes(markers.baseCommit))return false;
    for(const root of new Set([authorityRoot,current.root])){const b=readPracticalWrittenBoundary(root);if(b.ledgerSha256!==current.ledgerSha256)return false;}
    if(markers.manifest!=null&&!new Set([PRACTICAL_WRITTEN.baselineManifestSha256,current.resultManifestSha256]).has(practicalWrittenHash(json(markers.manifest))))return false;
    if(markers.publicationState!=null&&!open(markers.publicationState))return false;
    if(markers.files){const rawOf=p=>{const v=markers.files.get(p);return v?.raw??v;},manifest=rawOf('data/manifest.json'),state=rawOf('data/publication-state.json');if(!manifest||!state||!new Set([PRACTICAL_WRITTEN.baselineManifestSha256,current.resultManifestSha256]).has(practicalWrittenHash(manifest))||!open(JSON.parse(state)))return false;const m=JSON.parse(manifest),bank=rawOf(`data/${m.file}`);if(!bank||practicalWrittenHash(bank)!==m.sha256)return false;}
    return true;
  }catch{return false;}
}
export function currentCutoffBlocks(now,markers={}){return editorialBlocks(now,markers)&&!active(now,markers);}
export function completionHistoryReadable(checked,now,markers={}){
  return editorialHistoryReadable(checked,now,markers)||(active(now,markers)&&checked?.ok===true&&checked.canStartNewContent===false&&Array.isArray(checked.continuationBlockers)&&checked.continuationBlockers.length===1&&checked.continuationBlockers[0]==='Final cutoff or persistent freeze blocks offline advancement');
}
export function currentPracticalWrittenRegistration(root){const s=scope.getStore();return s?.active&&path.resolve(root)===s.root&&active(Date.now(),{root})?readPracticalWrittenBoundary(root):null;}
export function assertCurrentReleaseInput(input,now=Date.now(),root=authorityRoot){
  if(!input)return;
  const b=currentPracticalWrittenRegistration(root);if(!b)return assertEditorial005CompletionInput(input,now);
  const resolved=path.resolve(input);if(resolved===path.resolve(root,PRACTICAL_WRITTEN.ledgerPath))return;
  // The explicit bank path may be private, but only the exact registered bank bytes enter.
  const relative=path.relative(path.resolve(root),resolved);
  let raw;if(!relative.startsWith('..')&&!path.isAbsolute(relative))raw=readPracticalWrittenFile(root,relative);
  else {const parent=path.dirname(resolved);raw=readPracticalWrittenFile(parent,path.basename(resolved));}
  if(practicalWrittenHash(raw)!==b.ledger.result.bankSha256)throw Error('Explicit input is outside the exact practical-written registration');
}
export async function withCurrentReleaseAuthority(options,operation){
  const root=path.resolve(options.root),now=options.now??Date.now();
  if(!hasPracticalWrittenRegistration(root))return withEditorial005Completion(options,operation);
  if(typeof operation!=='function'||options.roundId!==undefined&&options.roundId!==PRACTICAL_WRITTEN.id||options.baseCommit!==undefined&&options.baseCommit!==PRACTICAL_WRITTEN.baselineCommit)throw Error('Current conversion invocation has a different owner or baseline');
  const b=readPracticalWrittenBoundary(root,now);
  for(const sourceRoot of new Set([authorityRoot,root])){const source=readPracticalWrittenBoundary(sourceRoot,now);if(source.ledgerSha256!==b.ledgerSha256)throw Error('Conversion root cannot borrow another registration');assertPracticalWrittenHistory(sourceRoot);}
  const current={root,active:true,ledgerSha256:b.ledgerSha256,resultManifestSha256:b.ledger.result.manifestSha256};
  return scope.run(current,async()=>{try{if(!active(now,{root}))throw Error('Current conversion boundary rejected');return await operation();}finally{current.active=false;}});
}
