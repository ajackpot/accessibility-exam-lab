/** Exact, separately approved publication. Historical authorities remain unchanged. */
import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {readPracticalWrittenFile as read,practicalWrittenHash as hash} from './practical-written-registration.mjs';
import {LOCAL_WRITTEN,validateLocalWrittenIntegration} from './local-written-integration.mjs';

export const WRITTEN_PUBLICATION=Object.freeze({
  path:'docs/publications/written-explanation-372-approval.json',
  sha256:'db9e4bc64c1d8b1d51261bb25c9538ee4862b0d34a2cd2c75afc5583a6a3083e',
  repository:'ajackpot/accessibility-exam-lab',ref:'refs/heads/main',
  baseCommit:'55b8a16b63bf41707e33566a4d3b8a5ab00cc8f0',
  authorizedAt:'2026-10-25T13:14:00Z'
});
const owner=path.resolve(import.meta.dirname,'..');
const fail=message=>{throw Error('Written publication: '+message);};
export const hasWrittenPublication=root=>fs.existsSync(path.join(root,WRITTEN_PUBLICATION.path));
function readApproval(root){
  const raw=read(root,WRITTEN_PUBLICATION.path);
  if(hash(raw)!==WRITTEN_PUBLICATION.sha256)fail('approval bytes differ from reviewed pin');
  const value=JSON.parse(raw);
  if(value.kind!=='exact_verified_written_correction_publication'||value.repository!==WRITTEN_PUBLICATION.repository||value.ref!==WRITTEN_PUBLICATION.ref||value.baseCommit!==WRITTEN_PUBLICATION.baseCommit||value.authorizedAt!==WRITTEN_PUBLICATION.authorizedAt)fail('publication identity differs');
  if(!Number.isFinite(Date.parse(value.registeredAt))||Date.parse(value.registeredAt)<Date.parse(value.authorizedAt)||Date.parse(value.registeredAt)>Date.now())fail('actual approval chronology differs');
  if(!equal(value.scope,{correctedQuestions:372,newQuestions:0,practicalChanges:false,forcePush:false,newCampaign:false}))fail('publication scope differs');
  if(value.bankVersion!==LOCAL_WRITTEN.version||value.bankSha256!==LOCAL_WRITTEN.bankSha256||value.manifestSha256!==LOCAL_WRITTEN.manifestSha256||value.publicRegistrySha256!==LOCAL_WRITTEN.registrySha256)fail('verified input identity differs');
  const seen=new Set();
  for(const entry of value.inputFiles){
    if(seen.has(entry.path))fail('duplicate input');seen.add(entry.path);
    const bytes=read(root,entry.path);
    if(bytes.length!==entry.bytes||hash(bytes)!==entry.sha256)fail('verified source changed: '+entry.path);
  }
  if(!seen.has('data/manifest.json')||!seen.has('src/app.js')||!seen.has('src/domain.js')||!seen.has(LOCAL_WRITTEN.path))fail('required input absent');
  const listed=read(root,'PUBLICATION-MANIFEST.txt').toString('utf8').split(/\r?\n/).map(p=>p.trim()).filter(p=>p&&!p.startsWith('#')).sort();
  if(!equal(listed,value.publicPaths)||new Set(listed).size!==listed.length)fail('public allow-list differs');
  for(const relative of listed)read(root,relative);
  return value;
}

/** No saved PASS/context, alternate clock, caller authority flag, or Git operation. */
export function validateWrittenPublication(root){
  root=path.resolve(root);
  const approval=readApproval(root);
  // A foreign root cannot borrow the module owner's different or frozen authority.
  for(const target of new Set([owner,root])){
    readApproval(target);
    const checked=validateLocalWrittenIntegration(target);
    if(checked.result.accepted!==372||checked.result.practical!==84)fail('validated scope differs');
  }
  return {ok:true,kind:approval.kind,repository:approval.repository,ref:approval.ref,baseCommit:approval.baseCommit,bankVersion:approval.bankVersion,bankSha256:approval.bankSha256,correctedQuestions:372,newQuestions:0,publicReleaseAuthorized:true,historicalValidation:'prior_exact_input_evidence_retained',deploymentPerformed:false};
}
