/** Exact local integration only. Never grants Git, publication or release-window authority. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual as equal} from 'node:util';
import {validateBankForPublication,validateExplanationAuthoring} from '../src/domain.js';
import {PRACTICAL_WRITTEN,PRACTICAL_WRITTEN_LEDGER_SHA256,practicalWrittenHash as hash,readPracticalWrittenFile as read,validatePracticalWrittenTransition} from './practical-written-registration.mjs';
import {PRACTICAL_WRITTEN_HISTORY} from './practical-written-baseline.mjs';
import {sourceInventory,runtimeIdentity,assertSameSnapshot} from './source-snapshot.mjs';

export const LOCAL_WRITTEN=Object.freeze({
  id:'written-explanation-372',
  path:'docs/local-integrations/written-explanation-372.json',
  registrySha256:'abd9958b6f8c2e1786a47431f6709f4728e66b0e23dbad97426cc8855090ef1d',
  version:'2026.10.25-written-explanation.local.1',
  bankSha256:'5e0dd2a2cb55dfbf8e53b5d9e40abf34d317a19c65f302c3ac591dd073a715d3',
  manifestSha256:'0ea2998a5e3851f986aabd05e534b24d6b157dafa14c8b58e4e4033866025c8c'
});
const fail=message=>{throw Error('Local written integration: '+message);};
const omit=(v,keys)=>Object.fromEntries(Object.entries(v).filter(([k])=>!keys.includes(k)));
const exact=(raw,digest,label)=>{if(hash(raw)!==digest)fail(label+' hash mismatch');return raw;};

// A removed registry cannot silently route the local bank into another authority.
export function hasLocalWrittenIntegration(root){
  if(fs.existsSync(path.join(root,LOCAL_WRITTEN.path))||fs.existsSync(path.join(root,'data/releases',LOCAL_WRITTEN.version)))return true;
  try{return JSON.parse(read(root,'data/manifest.json')).bankVersion===LOCAL_WRITTEN.version;}catch(error){if(error.code==='ENOENT')return false;throw error;}
}

export function readLocalWrittenBoundary(root){
  const registryRaw=exact(read(root,LOCAL_WRITTEN.path),LOCAL_WRITTEN.registrySha256,'registered scope');
  const registry=JSON.parse(registryRaw),now=Date.now();
  if(registry.kind!=='local_only_accepted_written_correction_integration'||registry.integrationId!==LOCAL_WRITTEN.id||registry.scope.canPublish!==false||registry.scope.canPush!==false)fail('local-only scope required');
  if(!Number.isFinite(now)||now<Date.parse(registry.registeredAt)||Date.parse(registry.authorizedAt)>Date.parse(registry.registeredAt))fail('actual local registration chronology invalid');
  if(!equal(JSON.parse(read(root,'data/publication-state.json')),{finalized:false}))fail('persistent freeze blocks local integration');
  const manifestRaw=exact(read(root,'data/manifest.json'),LOCAL_WRITTEN.manifestSha256,'local manifest');
  const manifest=JSON.parse(manifestRaw);
  if(manifest.finalRelease!==false||manifest.file!==`releases/${LOCAL_WRITTEN.version}/bank.json`)fail('local manifest path or freeze invalid');
  const bankRaw=exact(read(root,'data/'+manifest.file),LOCAL_WRITTEN.bankSha256,'local bank');
  if(registry.result.bankSha256!==hash(bankRaw)||registry.result.manifestSha256!==hash(manifestRaw)||!equal(registry.result.manifest,manifest))fail('registry result differs');
  const previousManifestRaw=exact(Buffer.from(registry.baseline.manifestRaw),registry.baseline.manifestSha256,'previous manifest');
  if(!equal(JSON.parse(previousManifestRaw),registry.baseline.manifest))fail('previous manifest representation differs');
  const baselineRaw=exact(read(root,`data/${registry.baseline.manifest.file}`),registry.baseline.bankSha256,'previous immutable bank');
  return {registry,registryRaw,manifest,manifestRaw,bankRaw,baselineRaw,previousManifestRaw};
}

/** All historical source bytes are read from the current tree, never repaired from a backup. */
export function validateLocalWrittenIntegration(root,{input=null}={}){
  const b=readLocalWrittenBoundary(root),bank=JSON.parse(b.bankRaw),baseline=JSON.parse(b.baselineRaw);
  if(input){const full=path.resolve(input);const raw=read(path.dirname(full),path.basename(full));exact(raw,LOCAL_WRITTEN.bankSha256,'explicit input');}
  for(const entry of PRACTICAL_WRITTEN_HISTORY){const raw=read(root,entry.path);if(raw.length!==entry.bytes)fail('historical size changed: '+entry.path);exact(raw,entry.sha256,'historical '+entry.path);}
  const allowed=new Set(PRACTICAL_WRITTEN_HISTORY.filter(e=>e.path.startsWith('data/releases/')).map(e=>e.path.split('/')[2]));
  allowed.add(PRACTICAL_WRITTEN.bankVersion);allowed.add(LOCAL_WRITTEN.version);
  for(const version of fs.readdirSync(path.join(root,'data/releases')))if(!allowed.has(version))fail('unregistered additional bank: '+version);
  const conversion=JSON.parse(exact(read(root,PRACTICAL_WRITTEN.ledgerPath),PRACTICAL_WRITTEN_LEDGER_SHA256,'original conversion registry'));
  const oldBaseline=JSON.parse(read(root,`data/releases/${PRACTICAL_WRITTEN.baselineVersion}/bank.json`));
  // Same semantic conversion checks as the original path; exact historical bytes remain pinned.
  validatePracticalWrittenTransition(conversion,{baseline:oldBaseline,bank:baseline,read:relative=>read(root,relative),now:Date.now()});
  validateBankForPublication(bank);validateExplanationAuthoring(bank,baseline);
  if(bank.bankVersion!==b.manifest.bankVersion||bank.releasedAt!==b.manifest.releasedAt||bank.changeSummary!==b.manifest.changeSummary)fail('bank metadata differs from manifest');
  const targets=new Map(b.registry.items.map(row=>[row.questionId,row]));
  if(targets.size!==372||b.registry.items.some(row=>row.decision!=='accepted'||row.attemptCount<1||row.attemptCount>3))fail('exact accepted set required');
  const oldQuestions=new Map(baseline.questions.map(q=>[q.questionId,q]));
  if(!equal(bank.questions.map(q=>q.questionId),baseline.questions.map(q=>q.questionId)))fail('question identity/order changed');
  const changed=[];const linked=new Set();
  for(const q of bank.questions){
    const old=oldQuestions.get(q.questionId),target=targets.get(q.questionId);
    if(!target){if(!equal(q,old))fail('non-target question changed: '+q.questionId);continue;}
    if(q.type!=='written'||q.testOnly||q.revision!==target.revision||q.revision<=old.revision)fail('invalid target/revision: '+q.questionId);
    for(const key of ['questionId','templateId','learningGoalId','learningGoalRevision','subjectId','type','testOnly'])if(!equal(q[key],old[key]))fail('protected identity changed: '+q.questionId+'/'+key);
    if(!equal(q.links.map(l=>[l.optionId,l.role]),old.links.map(l=>[l.optionId,l.role])))fail('answer role changed: '+q.questionId);
    if(equal(q,old))fail('registered correction missing: '+q.questionId);
    changed.push(q.questionId);q.links.forEach(l=>linked.add(l.optionId));
  }
  if(changed.length!==372)fail('changed scope differs');
  if(!equal(bank.options.map(o=>o.optionId),baseline.options.map(o=>o.optionId)))fail('option identity/order changed');
  const oldOptions=new Map(baseline.options.map(o=>[o.optionId,o]));let optionChanges=0;
  for(const option of bank.options){const old=oldOptions.get(option.optionId);if(!equal(option,old)){if(!linked.has(option.optionId)||option.revision<=old.revision)fail('unregistered option change');optionChanges++;}}
  for(const source of baseline.sources)if(!equal(bank.sources.find(s=>s.id===source.id),source))fail('original source changed: '+source.id);
  if(!equal(omit(bank,['bankVersion','releasedAt','changeSummary','registrationId','localCorrectionId','questions','options','sources']),omit(baseline,['bankVersion','releasedAt','changeSummary','registrationId','localCorrectionId','questions','options','sources'])))fail('protected bank metadata changed');
  const practical=bank.questions.filter(q=>q.type==='practical').length,seeds=bank.questions.filter(q=>q.testOnly).length;
  if(practical!==84||seeds!==14||bank.questions.length!==1005||bank.questions.filter(q=>q.explanationMode==='components').length!==368)fail('counts differ');
  return {...b,bank,baseline,result:{ok:true,accepted:changed.length,optionChanges,unchangedQuestions:1005-changed.length,written:921,practical,seeds,canPublish:false,canPush:false}};
}

/** A build of an already registered local bank is idempotent and performs no writes. */
export function buildLocalWrittenBank(root,input){
  const checked=validateLocalWrittenIntegration(root,{input});
  return {bank:checked.bank,manifest:checked.manifest};
}

/** Full historical gates run from a current-byte view with only the declared active layer removed. */
export async function validateLocalWrittenHistory(root){
  const runtime=runtimeIdentity(),before=await sourceInventory(root);
  const checked=validateLocalWrittenIntegration(root),scratch=await fsp.mkdtemp(path.join(os.tmpdir(),'written-local-history-'));
  try{
    await fsp.cp(root,scratch,{recursive:true,filter:p=>path.relative(root,p).split(path.sep)[0]!=='.git'});
    assertSameSnapshot(before,await sourceInventory(scratch),runtime,runtimeIdentity());
    readLocalWrittenBoundary(scratch);
    await fsp.writeFile(path.join(scratch,'data/manifest.json'),checked.previousManifestRaw);
    await fsp.rm(path.join(scratch,'data/releases',LOCAL_WRITTEN.version),{recursive:true});
    await fsp.unlink(path.join(scratch,LOCAL_WRITTEN.path));
    const viewBefore=await sourceInventory(scratch);
    console.log('LOCAL-ONLY: current-byte historical view; exact prior manifest; full historical gates follow.');
    execFileSync(process.execPath,[path.join(scratch,'scripts/validate-round.mjs'),'--release'],{stdio:'inherit',cwd:scratch});
    assertSameSnapshot(viewBefore,await sourceInventory(scratch),runtime,runtimeIdentity());
    assertSameSnapshot(before,await sourceInventory(root),runtime,runtimeIdentity());
    validateLocalWrittenIntegration(root);
    console.log(JSON.stringify({kind:'local_written_integration_validation',...checked.result,history:'executed_full_historical_release_gates',publicReleaseAuthorized:false}));
    return checked.result;
  }finally{await fsp.rm(scratch,{recursive:true,force:true});}
}
