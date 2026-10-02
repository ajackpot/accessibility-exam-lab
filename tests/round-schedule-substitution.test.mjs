import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {validateRoundLedgers,nextScheduledRoundAt} from '../scripts/validate-round.mjs';

// Deliberately synthetic fixtures; these are not content-review or publication evidence.
const template=JSON.parse(fs.readFileSync(new URL('../docs/rounds/round-ledger.template.json',import.meta.url),'utf8'));
const raw=fs.readFileSync(new URL('../data/releases/2026.10.02-seed.4/bank.json',import.meta.url),'utf8');
const bank=JSON.parse(raw),banks=new Map([[bank.bankVersion,{raw}]]);
function round(){
 const r=structuredClone(template);
 Object.assign(r,{roundId:'round-002',startedAt:'2026-10-02T10:30:00Z',decisionDeadline:'2026-10-02T14:30:00Z',summary:'Synthetic early-schedule regression fixture only.',scheduleSubstitution:{supersededStart:'2026-10-02T11:00:00Z',effectiveStart:'2026-10-02T10:30:00Z',reason:'Synthetic record of the authorized single-occurrence replacement.'}});
 Object.assign(r.baseline,{sourceCommit:'a'.repeat(40),bankVersion:bank.bankVersion,bankSha256:createHash('sha256').update(raw).digest('hex')});
 return r;
}
function result(rounds,options={}){return validateRoundLedgers(rounds,{banks,now:Date.parse('2026-10-02T10:40:00Z'),...options});}
function pass(rounds,options){const r=result(rounds,options);assert.equal(r.ok,true,r.errors.join('\n'));}
function fail(rounds,options){const r=result(rounds,options);assert.equal(r.ok,false,'invalid schedule fixture unexpectedly passed');}
function closed(){const r=round();Object.assign(r,{status:'closed',closedAt:'2026-10-02T10:50:00Z',decisionDeadline:'2026-10-02T11:00:00Z',noGapExplanation:'This zero-candidate fixture tests schedule bounds only, not actual learning coverage.'});return r;}
function subsequent(start){const r=round();delete r.scheduleSubstitution;Object.assign(r,{roundId:'round-003',startedAt:start,decisionDeadline:new Date(Date.parse(start)+4*3600000).toISOString()});return r;}

test('authorized single early occurrence retains four hours without skipping the following scheduled occurrence',()=>{
 pass([round()]);
 assert.equal(nextScheduledRoundAt('2026-10-02T10:30:00Z'),Date.parse('2026-10-02T11:00:00Z'));
 assert.equal(nextScheduledRoundAt('2026-10-02T11:00:00Z'),Date.parse('2026-10-02T15:00:00Z'));
 const r=round();delete r.scheduleSubstitution;fail([r]);
});
test('substitution is limited to the exact campaign, round, occurrence and actual start',()=>{
 for(const mutate of [r=>r.roundId='round-003',r=>r.campaignId='other-campaign',r=>r.startedAt='2026-10-02T10:29:59Z',r=>r.scheduleSubstitution.effectiveStart='2026-10-02T10:31:00Z',r=>r.scheduleSubstitution.supersededStart='2026-10-02T23:00:00Z',r=>r.scheduleSubstitution.nextScheduledAt='2026-10-03T23:00:00Z',r=>r.scheduleSubstitution.reason=' ',r=>delete r.scheduleSubstitution.reason]){const r=round();mutate(r);fail([r]);}
});
test('early substitution cannot extend four-hour, actual-next, current-clock or persistent-freeze bounds',()=>{
 const r=round();r.decisionDeadline='2026-10-02T14:30:01Z';fail([r]);
 fail([round()],{nextRoundAt:'2026-10-02T13:00:00Z'});
 fail([round()],{now:Date.parse('2026-10-02T10:29:59Z')});
 fail([round()],{now:Date.parse('2026-10-02T14:30:00Z')});
 fail([round()],{publicationState:{finalized:true,finalizedAt:'2026-10-02T13:00:00Z'}});
});
test('omitting a substitution record cannot run the superseded occurrence again after early closure',()=>{
 for(const start of ['2026-10-02T11:00:00Z','2026-10-02T11:00:01Z','2026-10-02T11:15:00Z','2026-10-02T14:59:59Z'])fail([closed(),subsequent(start)],{now:Date.parse(start)+1000});
});
test('the next nominal occurrence is available while repeated substitution is rejected',()=>{
 const start='2026-10-02T15:00:00Z';pass([closed(),subsequent(start)],{now:Date.parse(start)+1000});
 const duplicate=round();duplicate.roundId='round-forged';fail([round(),duplicate]);
});
test('historical unadjusted rounds keep their original next-occurrence bound and final-day cutoff',()=>{
 const r=round();delete r.scheduleSubstitution;Object.assign(r,{roundId:'synthetic-history',startedAt:'2026-10-02T05:40:00Z',decisionDeadline:'2026-10-02T09:40:00Z',status:'closed',closedAt:'2026-10-02T06:00:00Z',noGapExplanation:'Synthetic schedule-only fixture; no content coverage is asserted.'});pass([r]);
 r.decisionDeadline='2026-10-02T11:00:01Z';fail([r]);
 Object.assign(r,{startedAt:'2026-10-16T11:00:00Z',closedAt:'2026-10-16T12:00:00Z',decisionDeadline:'2026-10-16T14:00:00Z'});pass([r],{now:Date.parse('2026-10-16T12:01:00Z')});
 r.decisionDeadline='2026-10-16T14:00:01Z';fail([r],{now:Date.parse('2026-10-16T12:01:00Z')});
});
