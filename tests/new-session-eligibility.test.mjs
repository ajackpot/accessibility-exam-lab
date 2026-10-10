import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as d from '../src/domain.js';
import * as w from '../src/workflows.js';
import {exportBackup,parseBackup,validateSession} from '../src/backup.js';
import {NEW_SESSION_ELIGIBILITY_POLICY as policy,isPriorityPoolExcluded} from '../src/new-session-eligibility.js';
import {checkNewSessionEligibilitySnapshot} from '../scripts/complete-bundle.mjs';

const H=raw=>createHash('sha256').update(raw).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const contentHash=(bank,q)=>H(JSON.stringify(canonical({question:q,options:q.links.map(l=>bank.options.find(o=>o.optionId===l.optionId))})));
const effective=Date.parse(policy.effectiveAt),beforePolicy=effective-10_000,afterPolicy=effective+10_000;
const excluded=new Set(policy.excluded.map(t=>t.questionId));
let baseline,selected,report,reportRaw,policyRaw;
before(async()=>{
  const baselineRaw=await fs.readFile(new URL('../'+policy.sourceBank.path,import.meta.url));
  assert.equal(H(baselineRaw),policy.sourceBank.sha256);baseline=JSON.parse(baselineRaw);
  selected=JSON.parse(await fs.readFile(new URL('../data/releases/2026.10.10-regular.41-selection.1/bank.json',import.meta.url)));
  reportRaw=await fs.readFile(new URL('../'+policy.sourceDecision.path,import.meta.url));report=JSON.parse(reportRaw);
  policyRaw=await fs.readFile(new URL('../src/new-session-eligibility.js',import.meta.url));
});
function clock(at,operation){const original=Date.now;Date.now=()=>at;try{return operation();}finally{Date.now=original;}}
let sequence=0;
/** Synthetic pre-policy sessions, never observations of real user history. */
function syntheticPrepared(bank,questions,mode='untimed') {
  const optionCount=[5,4].find(count=>questions.every(q=>q.supportedOptionCounts.includes(count)));
  assert.ok(optionCount,'Every requested fixture item must support one common option count.');
  const scoped={...bank,questions},config=w.practiceConfig('written',{count:questions.length,optionCount,mode,minutes:150});
  const prepared=clock(beforePolicy,()=>d.prepareSession(scoped,config,[],19,`synthetic-priority-${++sequence}`));
  assert.deepEqual(prepared.items.map(q=>q.questionId).sort(),questions.map(q=>q.questionId).sort(),'Synthetic preparation must include every requested exact item.');
  return prepared;
}
function syntheticCompleted(bank,questions,mode='untimed') {
  let session=d.startSession(syntheticPrepared(bank,questions,mode),beforePolicy+100);
  for(const item of session.items){const wrong=item.options.find(o=>o.optionId!==item.correctOptionId).optionId;session=d.setAnswer(session,item.instanceId,wrong,beforePolicy+200);if(mode==='untimed')session=d.confirmAnswer(session,item.instanceId,beforePolicy+300);}
  return d.finalize(session,'submitted',beforePolicy+400);
}

test('one frozen policy binds the terminal five exact forms and unchanged original/selected bank hashes',()=>{
  assert.deepEqual(Object.keys(policy).sort(),['schemaVersion','kind','policyId','reasonCode','decidedAt','effectiveAt','sourceDecision','sourceBank','excluded'].sort());
  assert.equal(policy.schemaVersion,1);assert.equal(policy.policyId,'existing-priority-001');
  assert.equal(H(reportRaw),policy.sourceDecision.sha256);assert.equal(H(policyRaw),'a92cc9bd407741089027cc7d3a3fd2a060bcfa3b1f4d02b84ebd36865336a6cc');
  assert.equal(excluded.size,5);assert.equal(policy.excluded.length,5);
  assert.equal(policy.decidedAt,report.completedAt);assert.ok(effective>=Date.parse(report.completedAt));
  const actual=report.decisions.filter(t=>t.terminalDecision==='exclude').map(t=>({questionId:t.questionId,revision:t.revision,itemBundleCanonicalSha256:t.itemBundleCanonicalSha256}));
  assert.deepEqual(policy.excluded,actual);
  for(const target of policy.excluded){assert.deepEqual(Object.keys(target).sort(),['questionId','revision','itemBundleCanonicalSha256'].sort());for(const bank of [baseline,selected]){const q=bank.questions.find(q=>q.questionId===target.questionId);assert.equal(q.revision,target.revision);assert.equal(contentHash(bank,q),target.itemBundleCanonicalSha256);}}
  assert.throws(()=>{policy.excluded[0].questionId='changed';},TypeError);assert.throws(()=>policy.excluded.pop(),TypeError);
  assert.equal(d.APP_VERSION,'0.2.9');assert.equal(d.SCHEMA_VERSION,1);assert.equal(d.GENERATOR_VERSION,'2');
});

test('effective time changes new-session priority without rewriting publication validity; invalid time cannot opt out',()=>{
  for(const target of policy.excluded){
    const q=selected.questions.find(q=>q.questionId===target.questionId);
    assert.equal(isPriorityPoolExcluded(q,effective-1),false);assert.equal(isPriorityPoolExcluded(q,effective),true);assert.equal(isPriorityPoolExcluded(q,afterPolicy),true);
    assert.equal(d.isPublishedQuestion(selected,q,afterPolicy),true);assert.equal(d.isNewSessionQuestion(selected,q,effective-1),true);assert.equal(d.isNewSessionQuestion(selected,q,afterPolicy),false);
    // Conservative reserved-ID guard, not a substantive judgment of revised content.
    assert.equal(isPriorityPoolExcluded({...q,revision:q.revision+1},afterPolicy),true);
    for(const now of [NaN,Infinity,-Infinity,null,'2026-10-10']){assert.throws(()=>isPriorityPoolExcluded(q,now),/finite time/);assert.throws(()=>d.isNewSessionQuestion(selected,q,now),/finite time/);}
  }
  const ordinary=selected.questions.find(q=>!excluded.has(q.questionId)&&!q.testOnly);
  assert.equal(isPriorityPoolExcluded(ordinary,afterPolicy),false);assert.equal(d.isNewSessionQuestion(selected,ordinary,afterPolicy),true);
  const invalid={...selected,corrections:[{questionId:ordinary.questionId,revision:ordinary.revision,kind:'invalid',effectiveAt:new Date(beforePolicy).toISOString()}]};
  assert.equal(d.isPublishedQuestion(invalid,ordinary,afterPolicy),false);assert.equal(d.isNewSessionQuestion(invalid,ordinary,afterPolicy),false);
});

test('fresh all/new/wrong practice and mock exclude five from cached39 and selected041 without touching bank bytes',()=>{
  for(const bank of [baseline,selected]){
    const before=JSON.stringify(bank),questions=bank.questions.filter(q=>report.decisions.some(t=>t.questionId===q.questionId)),history=questions.map(q=>syntheticCompleted(bank,[q]));
    assert.deepEqual(history.flatMap(s=>s.items.map(q=>q.questionId)).sort(),questions.map(q=>q.questionId).sort(),'Mixed-cardinality history preserves all twelve exact items.');
    clock(afterPolicy,()=>{
      for(const pool of ['all','new','wrong'])for(const optionCount of [4,5])for(const mode of ['timed','untimed']){
        const config=w.practiceConfig('written',{pool,optionCount,mode,count:1}),available=d.eligibleQuestions(bank,config,history);
        assert.ok(available.every(q=>!excluded.has(q.questionId)),`${bank.bankVersion}/${pool}/${optionCount}/${mode}`);
        if(available.length){const session=d.prepareSession(bank,config,history,31,`fresh-${pool}-${optionCount}-${mode}`);assert.ok(session.items.every(q=>!excluded.has(q.questionId)));}
      }
      const mock=d.prepareSession(bank,w.practiceConfig('written',{kind:'mock',count:100,mode:'timed'}),[],42,'synthetic-fresh-mock');
      assert.equal(mock.items.length,100);assert.ok(mock.items.every(q=>!q.testOnly&&!excluded.has(q.questionId)));
      for(const target of report.decisions.filter(t=>t.terminalDecision==='retain'))assert.equal(d.isNewSessionQuestion(bank,bank.questions.find(q=>q.questionId===target.questionId)),true);
    });
    assert.equal(JSON.stringify(bank),before);
  }
});

test('current counts distinguish cumulative objects and eligible unique mock goals',()=>{
  const expected=[{bank:baseline,regular:951,cumulative:956,subjects:[121,205,181,207,157],mock:[119,196,175,198,150]},{bank:selected,regular:952,cumulative:957,subjects:[121,205,181,208,157],mock:[119,196,175,199,150]}];
  clock(afterPolicy,()=>{
    for(const row of expected){
      const eligible=row.bank.questions.filter(q=>d.isNewSessionQuestion(row.bank,q));
      assert.equal(row.bank.questions.filter(q=>!q.testOnly).length,row.cumulative);assert.equal(eligible.filter(q=>!q.testOnly).length,row.regular);assert.equal(eligible.filter(q=>q.testOnly).length,14);
      assert.deepEqual(d.SUBJECTS.map(s=>eligible.filter(q=>q.subjectId===s.id&&!q.testOnly).length),row.subjects);
      assert.equal(eligible.filter(q=>q.type==='practical'&&!q.testOnly).length,80);
      const mock=w.mockAvailability(row.bank);assert.equal(mock.ready,true);assert.deepEqual(mock.counts.map(s=>s.count),row.mock);
      const config=w.practiceConfig('written'),selection=w.practiceSelection(row.bank,config);
      assert.ok(selection.bank.questions.every(q=>!q.testOnly&&!excluded.has(q.questionId)));assert.equal(w.availableCount(row.bank,config),new Set(selection.bank.questions.map(q=>q.templateId)).size);
      assert.ok(w.quickConfig(row.bank,'written').count>0);
    }
  });
});

test('fresh wrong-answer sessions report reserved entries unavailable while saved results remain readable',()=>{
  const targets=selected.questions.filter(q=>excluded.has(q.questionId)),retained=selected.questions.find(q=>q.questionId==='r011-dom-form-s3-w04');
  const saved=syntheticCompleted(selected,[...targets,retained]),before=JSON.stringify(saved);
  clock(afterPolicy,()=>{
    const plan=w.reviewPlan(selected,[saved],'written');
    assert.equal(plan.entries.length,6);assert.equal(plan.available,1);assert.equal(plan.unavailable.length,5);
    assert.deepEqual(new Set(plan.unavailable.map(e=>e.item.questionId)),excluded);
    assert.ok(plan.groups.every(g=>d.eligibleQuestions(g.bank,g.config).every(q=>!excluded.has(q.questionId))));
    assert.equal(d.sessionResult(saved).total,6);assert.equal(w.reviewEntries([saved]).length,6);
  });
  assert.equal(JSON.stringify(saved),before);
});

test('synthetic prepared, active and completed historical sessions retain snapshots, grades, statistics and backups',async()=>{
  const questions=selected.questions.filter(q=>excluded.has(q.questionId));
  for(const mode of ['untimed','timed']){
    const prepared=syntheticPrepared(selected,questions,mode),preparedBefore=JSON.stringify(prepared),preparedHashes=await Promise.all(prepared.items.map(d.snapshotHash));
    const active=d.startSession(prepared,afterPolicy);assert.deepEqual(active.items,prepared.items);assert.equal(JSON.stringify(prepared),preparedBefore);assert.deepEqual(await Promise.all(active.items.map(d.snapshotHash)),preparedHashes);
    assert.deepEqual(validateSession(prepared),prepared);assert.deepEqual(validateSession(active),active);
    const completed=syntheticCompleted(selected,questions,mode),before=JSON.stringify(completed),stats=clock(beforePolicy,()=>d.statistics([completed],{mode}));
    const hashes=await Promise.all(completed.items.map(d.snapshotHash)),grades=completed.items.map(item=>d.grade(item,completed.answers[item.instanceId]));
    assert.deepEqual(clock(afterPolicy,()=>d.statistics([completed],{mode})),stats);
    assert.deepEqual(completed.items.map(item=>d.grade(item,completed.answers[item.instanceId])),grades);
    // Prepared and active are successive versions of one synthetic session, so
    // validate each backup separately rather than fabricate duplicate IDs.
    for(const saved of [prepared,active,completed]){
      const savedHashes=await Promise.all(saved.items.map(d.snapshotHash));
      const restored=parseBackup(exportBackup([saved]));
      // JSON omits undefined optional properties; compare every persisted field.
      assert.deepEqual(restored.sessions,JSON.parse(JSON.stringify([saved])));
      assert.deepEqual(await Promise.all(restored.sessions[0].items.map(d.snapshotHash)),savedHashes);
    }
    assert.deepEqual(await Promise.all(completed.items.map(d.snapshotHash)),hashes);assert.equal(JSON.stringify(completed),before);
    assert.equal(d.statistics([completed],{mode}).invalidExcluded,0);
  }
  assert.equal(d.validateBank(baseline),baseline);assert.equal(d.validateBankForPublication(selected),selected);
});

test('cache keys, current UI predicates and public distribution include the new policy without a schema migration',async()=>{
  const read=p=>fs.readFile(new URL('../'+p,import.meta.url),'utf8');
  const [app,domain,workflows,html,allow,checks]=await Promise.all(['src/app.js','src/domain.js','src/workflows.js','index.html','PUBLICATION-MANIFEST.txt','scripts/source-checks.mjs'].map(read));
  const suffix='?v=0.2.9&pool=priority-001';
  assert.ok(html.includes('src/app.js'+suffix));assert.ok(app.includes('domain.js'+suffix));assert.ok(app.includes('workflows.js'+suffix));assert.ok(workflows.includes('domain.js'+suffix));assert.ok(domain.includes('new-session-eligibility.js'+suffix));
  assert.match(app,/function updateContentNotice\(\).*isNewSessionQuestion/);assert.match(app,/현재 새 연습 일반 학습/);assert.match(app,/일반 학습 누적 \$\{cumulativeRegular\}문항 · 새 연습 출제 가능 \$\{selectableRegular\}문항/);
  assert.match(workflows,/function mockAvailability\(bank\)[\s\S]*?isNewSessionQuestion/);
  assert.ok(allow.split(/\r?\n/).includes('src/new-session-eligibility.js'));assert.ok(allow.split(/\r?\n/).includes(policy.sourceDecision.path));assert.ok(checks.includes("runtimeFiles.push('new-session-eligibility.js')"));
});

test('modern complete/delta dependency rejects missing, stripped or changed policy/report and preserves pre-policy branch',async()=>{
  const domainRaw=await fs.readFile(new URL('../src/domain.js',import.meta.url));
  const base=[{path:'src/domain.js',raw:domainRaw},{path:'src/new-session-eligibility.js',raw:policyRaw},{path:policy.sourceDecision.path,raw:reportRaw}];
  base.push({path:'PUBLICATION-MANIFEST.txt',raw:Buffer.from([...base.map(f=>f.path),'PUBLICATION-MANIFEST.txt'].join('\n')+'\n')});
  assert.deepEqual(checkNewSessionEligibilitySnapshot(base),{feature:'existing-priority-001'});
  for(const p of ['src/new-session-eligibility.js',policy.sourceDecision.path]){
    assert.throws(()=>checkNewSessionEligibilitySnapshot(base.filter(f=>f.path!==p)),/policy dependency/);
    assert.throws(()=>checkNewSessionEligibilitySnapshot(base.map(f=>f.path===p?{path:p,raw:Buffer.concat([f.raw,Buffer.from(' ')])}:f)),/policy dependency/);
    assert.throws(()=>checkNewSessionEligibilitySnapshot(base.map(f=>f.path==='PUBLICATION-MANIFEST.txt'?{...f,raw:Buffer.from(f.raw.toString().replace(p+'\n',''))}:f)),/policy dependency/);
  }
  const stripped=base.filter(f=>f.path!=='src/new-session-eligibility.js').map(f=>f.path==='src/domain.js'?{path:f.path,raw:Buffer.from('export const oldDomain=true;')}:f);
  for(const marker of [{path:'docs/publication-selections/round-041-selection-001.json',raw:Buffer.from('{}')},{path:'data/manifest.json',raw:Buffer.from(JSON.stringify({bankVersion:selected.bankVersion}))}])assert.throws(()=>checkNewSessionEligibilitySnapshot([...stripped,marker]),/policy dependency/);
  assert.deepEqual(checkNewSessionEligibilitySnapshot([{path:'src/domain.js',raw:Buffer.from('export const originalHistoricalDomain=true;')}]),{feature:'historical_pre_policy'});
});
