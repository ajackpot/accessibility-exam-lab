import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

test('separate exact publication authority preserves content, source and freeze boundaries',async t=>{
  const root=path.resolve(import.meta.dirname,'..');
  const target=await fs.mkdtemp(path.join(os.tmpdir(),'written-publication-test-'));
  t.after(()=>fs.rm(target,{recursive:true,force:true}));
  await fs.cp(root,target,{recursive:true,filter:p=>path.relative(root,p).split(path.sep)[0]!=='.git'});
  const {validateWrittenPublication,WRITTEN_PUBLICATION}=await import(pathToFileURL(path.join(target,'scripts/written-publication.mjs')));
  const mutate=async(relative,change,operation)=>{
    const file=path.join(target,relative),before=await fs.readFile(file);
    try{if(change===null)await fs.unlink(file);else await fs.writeFile(file,change(before));await operation();}
    finally{await fs.writeFile(file,before);}
  };
  await t.test('approved exact source validates without changing original local-only scope',async()=>{
    const before=await fs.readFile(path.join(target,'docs/local-integrations/written-explanation-372.json'));
    const result=validateWrittenPublication(target);
    assert.equal(result.publicReleaseAuthorized,true);assert.equal(result.deploymentPerformed,false);
    assert.equal(result.correctedQuestions,372);assert.equal(result.newQuestions,0);
    assert.equal(result.repository,'ajackpot/accessibility-exam-lab');assert.equal(result.ref,'refs/heads/main');
    assert.deepEqual(await fs.readFile(path.join(target,'docs/local-integrations/written-explanation-372.json')),before);
    assert.equal(JSON.parse(before).scope.canPublish,false);
  });
  await t.test('missing or altered approval cannot become caller authority',async()=>{
    await mutate(WRITTEN_PUBLICATION.path,null,()=>assert.throws(()=>validateWrittenPublication(target),/ENOENT/));
    await mutate(WRITTEN_PUBLICATION.path,b=>Buffer.concat([b,Buffer.from(' ')]),()=>assert.throws(()=>validateWrittenPublication(target),/approval bytes differ/));
  });
  await t.test('changed runtime, registry and manifest bytes fail exact inputs',async()=>{
    for(const p of ['src/app.js','src/domain.js','data/manifest.json','docs/local-integrations/written-explanation-372.json'])
      await mutate(p,b=>Buffer.concat([b,Buffer.from(' ')]),()=>assert.throws(()=>validateWrittenPublication(target),/verified source changed/));
  });
  await t.test('freeze and unregistered release directories remain blocked',async()=>{
    await mutate('data/publication-state.json',()=>Buffer.from('{"finalized":true}\n'),()=>assert.throws(()=>validateWrittenPublication(target),/verified source changed|persistent freeze/));
    const extra=path.join(target,'data/releases/forged-publication');await fs.mkdir(extra);
    try{assert.throws(()=>validateWrittenPublication(target),/unregistered additional bank/);}finally{await fs.rmdir(extra);}
  });
  await t.test('changed allow-list and a foreign root cannot borrow authority',async()=>{
    await mutate('PUBLICATION-MANIFEST.txt',b=>Buffer.concat([b,Buffer.from('private.txt\n')]),()=>assert.throws(()=>validateWrittenPublication(target),/verified source changed|allow-list differs/));
    const foreign=await fs.mkdtemp(path.join(os.tmpdir(),'written-publication-foreign-'));
    try{await fs.mkdir(path.join(foreign,'docs/publications'),{recursive:true});await fs.copyFile(path.join(target,WRITTEN_PUBLICATION.path),path.join(foreign,WRITTEN_PUBLICATION.path));assert.throws(()=>validateWrittenPublication(foreign),/ENOENT/);}
    finally{await fs.rm(foreign,{recursive:true,force:true});}
  });
  await t.test('public check refuses finalization and unsupported flags',()=>{
    for(const arg of ['--finalize','--skip-history']){
      const result=spawnSync(process.execPath,[path.join(target,'scripts/release-guard.mjs'),arg],{encoding:'utf8',timeout:15000});
      assert.equal(result.error,undefined);assert.notEqual(result.status,0);assert.match(result.stderr,/accepts only the exact approval check/);
    }
  });
});
