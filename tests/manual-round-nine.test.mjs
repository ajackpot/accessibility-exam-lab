import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadRoundContext,validateRoundLedgers,regularCoverage,nextScheduledRoundAt} from '../scripts/validate-round.mjs';
const root=path.resolve(import.meta.dirname,'..'),now=Date.parse('2026-10-04T09:00:00Z');
const all=await loadRoundContext(root,null,{release:true});
// Historical scheduling fixtures stop at008; later real delivery evidence is not their source.
const context={...all,offlineBases:new Map([...all.offlineBases].filter(([,e])=>Number(e.roundId.slice(6))<=8)),ledgers:all.ledgers.filter(r=>Number(r.roundId.slice(6))<=8)};
const template=JSON.parse(await fs.readFile(path.join(root,'docs/rounds/round-ledger.template.json')));
const raw=context.banks.get('2026.10.04-regular.8').raw,coverage=regularCoverage(JSON.parse(raw));
function manual(){
 const r=structuredClone(template);Object.assign(r,{roundId:'round-009',startedAt:'2026-10-04T08:54:06Z',decisionDeadline:'2026-10-04T10:30:00Z',summary:'Exact authorized manual fixture; no content review or publication claim.',baseline:{sourceCommit:'50fd2807a0ff8fc2c10cbf2628f65d0ca53065c2',bankVersion:'2026.10.04-regular.8',bankSha256:createHash('sha256').update(raw).digest('hex'),regularWrittenBySubject:coverage.regularWrittenBySubject,regularPractical:coverage.regularPractical},coverageAfter:coverage,manualStartException:{kind:'explicit_user_requested_next_round',requestedAt:'2026-10-04T08:54:06Z',previousRoundId:'round-008',previousClosedAt:'2026-10-04T07:56:30.743478+00:00',nextScheduledStart:'2026-10-04T11:00:00Z',reason:'Explicit new user request after verified cumulative publication.'}});return r;
}
function check(r,extra={}){return validateRoundLedgers([...context.ledgers,r],{...context,now,...extra});}
function bad(r,pattern,extra={}){const x=check(r,extra);assert.equal(x.ok,false);if(pattern)assert.match(x.errors.join('\n'),pattern);}
test('exact manual009 uses actual08:54 request and separately verified008 without rewriting its historical deadline',()=>{
 const before=context.ledgers.map(JSON.stringify),r=manual(),x=check(r);assert.equal(x.ok,true,x.errors.join('\n'));assert.equal(nextScheduledRoundAt(r.startedAt),Date.parse('2026-10-04T11:00:00Z'));assert.deepEqual(context.ledgers.map(JSON.stringify),before);assert.equal(context.ledgers.at(-1).decisionDeadline,'2026-10-04T10:30:00Z');
});
test('manual exception is pinned to identity, exact request/time, original closed predecessor and cutoff',()=>{
 for(const mutate of [r=>delete r.manualStartException,r=>r.roundId='round-010',r=>r.startedAt='2026-10-04T08:55:00Z',r=>r.manualStartException.requestedAt='2026-10-04T08:55:00Z',r=>r.manualStartException.previousRoundId='round-007',r=>r.manualStartException.previousClosedAt='2026-10-04T08:53:00Z',r=>r.manualStartException.nextScheduledStart='2026-10-04T15:00:00Z',r=>r.decisionDeadline='2026-10-04T10:31:00Z']){const r=manual();mutate(r);bad(r);}
 const sources=new Map(context.ledgerSources);sources.set('round-008',Buffer.from('{}'));bad(manual(),null,{ledgerSources:sources});
 const ledgers=structuredClone(context.ledgers);ledgers.at(-1).status='running';ledgers.at(-1).closedAt=null;assert.equal(validateRoundLedgers([...ledgers,manual()],{...context,now}).ok,false);
});
test('manual allowance does not waive synchronized baseline, current time, next actual round or persistent freeze',()=>{
 bad(manual(),null,{synchronizations:[]});bad(manual(),/future/,{now:Date.parse('2026-10-04T08:53:59Z')});bad(manual(),/next round|overlapping/,{nextRoundAt:'2026-10-04T10:00:00Z'});bad(manual(),/deadline reached/,{now:Date.parse('2026-10-04T10:30:00Z')});bad(manual(),/freeze/,{publicationState:{finalized:true,finalizedAt:'2026-10-04T09:15:00Z'}});
});
test('a second manual copy cannot create another round and scheduled11 remains a separate occurrence',()=>{
 const duplicate=manual();duplicate.roundId='round-010';const result=validateRoundLedgers([...context.ledgers,manual(),duplicate],{...context,now});assert.equal(result.ok,false);
 const scheduled=manual();delete scheduled.manualStartException;scheduled.roundId='round-010';scheduled.startedAt='2026-10-04T11:00:00Z';scheduled.decisionDeadline='2026-10-04T14:30:00Z';const m=manual();m.status='closed';m.closedAt='2026-10-04T09:00:00Z';m.noGapExplanation='Synthetic scheduling fixture; no content claims.';const x=validateRoundLedgers([...context.ledgers,m,scheduled],{...context,now:Date.parse('2026-10-04T11:01:00Z'),availableFiles:new Set([...context.availableFiles,'docs/rounds/round-009.md'])});assert.equal(x.ok,true,x.errors.join('\n'));
});
