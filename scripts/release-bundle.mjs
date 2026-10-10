import {validatePublicationSelectionSnapshot,loadPublicationSelections,resolvePublicationIdentity,assertPublicationSelectionReference,assertNoPublicationExcludedContent} from './publication-selection.mjs';
import {assertEvidenceLossPayload,assertEvidenceLossProvenance} from './evidence-loss-block.mjs';
/** Exact reviewed normal-release backups. Never synthesizes Git waits or publication. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {FREEZE_AT} from '../src/domain.js';
import {parsePublicAllowlist,safePublicPath,zipStored} from './download-fallback.mjs';
import {freezeCompleteProject,writeCompleteArchive,checkNewSessionEligibilitySnapshot} from './complete-bundle.mjs';
import {loadRoundContext,validateReleaseLedger} from './validate-round.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex'),json=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function bytes(root,relative){
 if(!safePublicPath(relative))throw Error('Unsafe public path');
 const resolved=path.resolve(root);for(let p=resolved;;p=path.dirname(p)){if((await fs.lstat(p)).isSymbolicLink())throw Error('Symlink root forbidden');if(path.dirname(p)===p)break;}
 let p=resolved;const parts=relative.split('/');for(let i=0;i<parts.length;i++){p=path.join(p,parts[i]);const st=await fs.lstat(p);if(st.isSymbolicLink()||(i===parts.length-1?!st.isFile():!st.isDirectory()))throw Error('Nonregular public path');}
 return fs.readFile(p);
}
async function reviewedFiles(root,entries){
 if(!Array.isArray(entries)||!entries.length)throw Error('Exact reviewed inventory required');
 parsePublicAllowlist(entries.map(e=>e.path).join('\n'));
 const files=[];for(const e of entries){if(!equal(Object.keys(e).sort(),['bytes','path','sha256'])||!Number.isSafeInteger(e.bytes)||e.bytes<0||!/^[a-f0-9]{64}$/.test(e.sha256))throw Error('Invalid reviewed inventory');const raw=await bytes(root,e.path);assertEvidenceLossPayload(raw,e.path);if(raw.length!==e.bytes||sha(raw)!==e.sha256)throw Error('Reviewed bytes mismatch: '+e.path);files.push({...e,raw});}
 const allow=files.find(f=>f.path==='PUBLICATION-MANIFEST.txt');if(!allow||!equal(parsePublicAllowlist(allow.raw.toString()).sort(),files.map(f=>f.path).sort()))throw Error('Inventory must equal complete public allowlist');
 return files.sort((a,b)=>a.path.localeCompare(b.path));
}
export async function writeReleaseDeliveryPair({baseRoot,workRoot,baseCommit,baseVerifiedAt,baseInventory,reviewedInventory,roundId,deltaOutputPath,completeOutputPath,now=Date.now()}){
 if(!Number.isFinite(now)||now>=FREEZE_AT||!/^[a-f0-9]{40}$/.test(baseCommit)||/^0+$/.test(baseCommit)||!Number.isFinite(Date.parse(baseVerifiedAt))||Date.parse(baseVerifiedAt)>now||!/^round-\d+$/.test(roundId))throw Error('Invalid release baseline/time/identity');
 if(path.resolve(deltaOutputPath)===path.resolve(completeOutputPath))throw Error('Distinct artifact paths required');
 for(const p of [deltaOutputPath,completeOutputPath]){try{await fs.lstat(p);throw Error('Output exists; preserve artifacts');}catch(e){if(e.code!=='ENOENT')throw e;}}
 if(path.extname(deltaOutputPath).toLowerCase()!=='.zip'||path.extname(completeOutputPath).toLowerCase()!=='.7z')throw Error('Delivery pair requires DELTA.zip and COMPLETE.7z');
 const base=await reviewedFiles(baseRoot,baseInventory),files=await reviewedFiles(workRoot,reviewedInventory),old=new Map(base.map(f=>[f.path,f])),current=new Map(files.map(f=>[f.path,f]));
 checkNewSessionEligibilitySnapshot(files);
 for(const f of base){if(!current.has(f.path))throw Error('Normal release backup does not delete prior public paths');if((/^docs\/quarantines\/(?!trust\.json)[^/]+\.json$/.test(f.path)||f.path.startsWith('data/releases/')||f.path.startsWith('docs/publication-selections/')||/^docs\/(rounds\/round-\d+|corrections\/editorial-\d+)\.json$/.test(f.path))&&current.get(f.path).sha256!==f.sha256)throw Error('Immutable bank/closed ledger changed: '+f.path);}
 for(const snapshot of [new Map(base.map(f=>[f.path,f])),current]){
  const state=snapshot.get('data/publication-state.json'),manifest=snapshot.get('data/manifest.json');
  if(!state||!manifest||JSON.parse(state.raw).finalized!==false||JSON.parse(manifest.raw).finalRelease!==false)throw Error('Persistent freeze or inconsistent freeze markers block release backup');
 }
 // Validate only the exact bytes that the full archive will contain. Workspace-only
 // reports/evidence cannot satisfy a dependency missing from the reviewed tree.
 const frozenRoot=await fs.mkdtemp(path.join(os.tmpdir(),'release-reviewed-'));
 let context;
 try {
  for(const f of files){const target=path.join(frozenRoot,f.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,f.raw,{flag:'wx'});}
  context=await loadRoundContext(frozenRoot,null,{release:true,now});const check=validateReleaseLedger(context.ledgers,{...context,now});if(!check.ok)throw Error(check.errors.join('\n'));
 } finally {await fs.rm(frozenRoot,{recursive:true,force:true});}

 assertEvidenceLossProvenance({roundId});
 const ledger=context.ledgers.find(r=>r.roundId===roundId),m=context.manifest,identity=ledger&&resolvePublicationIdentity(ledger,context.publicationSelections);if(!ledger||ledger.status!=='closed'||identity.effectiveBankVersion!==m.bankVersion||identity.effectiveBankSha256!==m.sha256)throw Error('Exact closed current release required');
 const changed=files.filter(f=>old.get(f.path)?.sha256!==f.sha256);if(!changed.length)throw Error('No new release bytes');
 // These two legacy fields preserve the frozen ledger's historical claim;
 // a later pinned publication event is separate current-state evidence.
 const manifest={schemaVersion:1,kind:'developer_patch_not_learner_import',deliveryMode:'release_backup',roundId,baseCommit,baseVerifiedAt,preparedAt:new Date(now).toISOString(),gitPublicationStatus:ledger.publication.status,publicationCommit:ledger.publication.commit,bankVersion:m.bankVersion,bankSha256:m.sha256,newlyPublishedByPackaging:0,prerequisiteArtifacts:[],...(identity.selectionReference?{selectionReference:identity.selectionReference}:{}),files:changed.map(({raw,...f})=>({...f,beforeSha256:old.get(f.path)?.sha256??null})),deletions:[]};
 const instructions=`정규 릴리스 변경분 / ${roundId}\n\n기준 Git 커밋: ${baseCommit}\n이 ZIP 생성 자체는 Git/Pages 공개나 권한 시간 초과의 증거가 아닙니다. 동결 원 대장의 역사적 공개 상태: ${ledger.publication.status}\nmanifest.json의 gitPublicationStatus와 publicationCommit은 원 대장의 기록입니다. 실제 현재 공개 상태는 프로젝트의 별도 docs/publications 이벤트와 해당 커밋의 Pages/live 확인 증거를 함께 확인하세요.\n새 설치에는 함께 제공한 전체 7z 하나만 사용하세요. 이 변경분은 정확한 기준 커밋의 프로젝트에만 적용합니다.\n\n1. 기존 프로젝트와 앱의 학습 기록을 별도 백업합니다.\n2. manifest.json의 변경 전 SHA-256과 기준 커밋을 대조합니다. 다르면 덮어쓰지 않고 전체 7z를 새 빈 폴더에서 검사합니다.\n3. files/ 아래 파일을 같은 상대 경로에 적용하고 변경 후 SHA-256을 확인합니다. 삭제 목록은 비어 있습니다.\n4. npm run check, npm test, npm run build를 실행합니다. .git이나 브라우저 저장소를 바꾸거나 지우지 않습니다.\n5. 전체 7z를 썼다면 이 변경분을 다시 적용하지 않습니다. 이 ZIP을 앱의 학습 기록 가져오기에 넣지 않습니다.\n`;
 const deltaRaw=zipStored([{name:'manifest.json',raw:json(manifest)},{name:'APPLY-KO.txt',raw:Buffer.from(instructions)},...changed.map(f=>({name:'files/'+f.path,raw:f.raw}))],{compress:true});
 const delta={path:deltaOutputPath,sha256:sha(deltaRaw),bytes:deltaRaw.length,manifestSha256:sha(json(manifest)),fileCount:changed.length};
 const ledgerPath=`docs/rounds/${roundId}.json`,sourceRelease={roundId,deltaArtifactSha256:delta.sha256,deltaManifestSha256:delta.manifestSha256,baseCommit,bankVersion:m.bankVersion,bankSha256:m.sha256,ledgerPath,ledgerSha256:current.get(ledgerPath).sha256,...(identity.selectionReference?{selectionReference:identity.selectionReference}:{})};
 const completeSnapshot=await freezeCompleteProject({workRoot,reviewedInventory:files.map(f=>({path:f.path,sha256:f.sha256,bytes:f.bytes})),sourceRelease,deliveryMode:'release_backup',now});
 await fs.writeFile(deltaOutputPath,deltaRaw,{flag:'wx'});
 const complete=await writeCompleteArchive(completeSnapshot,completeOutputPath,{now});
 return {status:'prepared_not_delivered',deliveryMode:'release_backup',delta,complete,deltaManifest:manifest,completeManifest:completeSnapshot.manifest};
}
