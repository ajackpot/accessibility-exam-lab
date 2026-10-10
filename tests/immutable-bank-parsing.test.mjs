import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import {parseImmutableBank,withBankParsingSession,validateQuarantineCampaign} from '../scripts/prepublication-quarantine.mjs';
import {validateEvidenceLossCampaign} from '../scripts/evidence-loss-block.mjs';
import {validateBank} from '../src/domain.js';
const root=path.resolve(import.meta.dirname,'..');
const raw=Buffer.from('{"bankVersion":"synthetic","questions":[{"links":[]}],"options":[]}');

test('standalone parsing is complete, fresh and does not freeze caller API results',()=>{
 const a=parseImmutableBank(raw),b=parseImmutableBank(raw);
 assert.deepEqual(a,JSON.parse(raw));assert.notEqual(a,b);assert.equal(Object.isFrozen(a),false);
 assert.throws(()=>parseImmutableBank(Buffer.from('{')) ,SyntaxError);
});
test('one invocation reuses only deeply immutable exact JSON representations',async()=>{
 let first;
 await withBankParsingSession(root,async()=>{
  first=parseImmutableBank(raw);assert.equal(first,parseImmutableBank(raw));
  assert.ok(Object.isFrozen(first));assert.ok(Object.isFrozen(first.questions));assert.ok(Object.isFrozen(first.questions[0].links));
  assert.throws(()=>{first.questions[0].links.push({});},TypeError);
  assert.throws(()=>{first.bankVersion='forged';},TypeError);
  assert.deepEqual(first,JSON.parse(raw));
  await withBankParsingSession(root,()=>assert.equal(first,parseImmutableBank(raw)));
 });
 await withBankParsingSession(root,()=>assert.notEqual(first,parseImmutableBank(raw)));
});
test('Buffer mutation poisons reuse even if caller restores bytes after rejection',async()=>{
 const mutable=Buffer.from(raw),saved=Buffer.from(raw);
 await withBankParsingSession(root,()=>{
  parseImmutableBank(mutable);mutable[mutable.indexOf('synthetic')]='S'.charCodeAt(0);
  assert.throws(()=>parseImmutableBank(mutable),/bytes changed/);
  saved.copy(mutable);assert.throws(()=>parseImmutableBank(mutable),/bytes changed/);
 });
 await withBankParsingSession(root,()=>assert.deepEqual(parseImmutableBank(mutable),JSON.parse(raw)));
});
test('same version with different bytes or replacement buffers cannot hit an old representation',async()=>{
 await withBankParsingSession(root,()=>{
  const a=parseImmutableBank(raw),changed=Buffer.from(raw.toString().replace('"options":[]','"options":[1]'));
  assert.notDeepEqual(parseImmutableBank(changed),a);
  assert.notEqual(parseImmutableBank(Buffer.from(raw)),a);
  assert.throws(()=>parseImmutableBank(Buffer.from('{"bankVersion":"synthetic",')),SyntaxError);
  assert.equal(parseImmutableBank(raw),a);
 });
});
test('nested roots and parallel invocations never share representations',async()=>{
 await withBankParsingSession(root,async()=>{
  const a=parseImmutableBank(raw);
  await withBankParsingSession(path.join(root,'other'),()=>assert.notEqual(parseImmutableBank(raw),a));
  assert.equal(parseImmutableBank(raw),a);
 });
 const values=await Promise.all([1,2].map(()=>withBankParsingSession(root,async()=>{await Promise.resolve();return parseImmutableBank(raw);})));assert.notEqual(values[0],values[1]);
});
test('async descendants cannot retain a closed invocation cache',async()=>{
 let release,first;const ready=new Promise(resolve=>{release=resolve;});let late;
 await withBankParsingSession(root,()=>{
  first=parseImmutableBank(raw);late=ready.then(()=>parseImmutableBank(raw));
 });
 release();const second=await late;assert.notEqual(first,second);assert.equal(Object.isFrozen(second),false);
});
test('strings use exact value; caller objects and shared memory are never reusable authority',async()=>{
 await withBankParsingSession(root,()=>{
  const text=raw.toString();assert.equal(parseImmutableBank(text),parseImmutableBank(text));
  let count=0;const object={toString(){count++;return text;}};
  assert.notEqual(parseImmutableBank(object),parseImmutableBank(object));assert.equal(count,2);
  const shared=Buffer.from(new SharedArrayBuffer(raw.length));raw.copy(shared);
  assert.notEqual(parseImmutableBank(shared),parseImmutableBank(shared));
 });
});
test('invalid bank semantics still run after successful JSON parsing',async()=>{
 await withBankParsingSession(root,()=>{
  const parsed=parseImmutableBank(raw);assert.throws(()=>validateBank(parsed));
  assert.equal(parsed,parseImmutableBank(raw));assert.throws(()=>validateBank(parseImmutableBank(raw)));
 });
});
test('real seed parsing preserves full domain validation with identical bytes',async()=>{
 const seed=await fs.readFile(path.join(root,'data/releases/2026.10.02-seed.4/bank.json'));
 const expected=validateBank(JSON.parse(seed));
 await withBankParsingSession(root,()=>assert.deepEqual(validateBank(parseImmutableBank(seed)),expected));
});
test('quarantine/evidence-loss semantic results are recalculated for malformed banks, clocks and freeze markers',async()=>{
 const cases=[
  {banks:new Map()},
  {banks:new Map([['bad',{raw:Buffer.from('{')} ]])},
  {banks:new Map(),now:NaN},
  {banks:new Map(),now:Date.parse('2026-10-09T17:00:00Z')},
  {banks:new Map(),now:Date.parse('2026-10-17T00:00:00+09:00')},
  {banks:new Map(),manifest:{finalRelease:true},publicationState:{finalized:true},now:Date.parse('2026-10-09T17:00:00Z')}
 ];
 const expected=cases.map(options=>[validateQuarantineCampaign([],options),validateEvidenceLossCampaign([],options)]);
 await withBankParsingSession(root,()=>{
  for(let i=0;i<cases.length;i++)assert.deepEqual([validateQuarantineCampaign([],cases[i]),validateEvidenceLossCampaign([],cases[i])],expected[i]);
 });
});

test('warm parse reuse does not conceal authority-file changes, manifest freeze, publication freeze or clock bounds',async t=>{
 const {default:os}=await import('node:os');const {pathToFileURL}=await import('node:url');
 const isolated=await fs.mkdtemp(path.join(os.tmpdir(),'bank-parse-authority-'));
 t.after(()=>fs.rm(isolated,{recursive:true,force:true}));
 const copy=async relative=>{await fs.mkdir(path.dirname(path.join(isolated,relative)),{recursive:true});await fs.copyFile(path.join(root,relative),path.join(isolated,relative));};
 await fs.cp(path.join(root,'src'),path.join(isolated,'src'),{recursive:true});
 for(const p of ['package.json','scripts/prepublication-quarantine.mjs','scripts/evidence-loss-block.mjs','docs/quarantines/trust.json','docs/release-blocks/trust.json'])await copy(p);
 const trust=JSON.parse(await fs.readFile(path.join(root,'docs/release-blocks/trust.json')));
 for(const pin of trust.events){
  await copy(pin.path);const event=JSON.parse(await fs.readFile(path.join(root,pin.path)));
  await copy(event.sourceLedger.path);await copy(event.incidentReport.path);
 }
 const pin=trust.events[0],event=JSON.parse(await fs.readFile(path.join(root,pin.path)));
 const ledgerRaw=await fs.readFile(path.join(root,event.sourceLedger.path)),ledger=JSON.parse(ledgerRaw);
 const seed=await fs.readFile(path.join(root,'data/releases/2026.10.02-seed.4/bank.json'));
 const parser=await import(pathToFileURL(path.join(isolated,'scripts/prepublication-quarantine.mjs')));
 const api=await import(pathToFileURL(path.join(isolated,'scripts/evidence-loss-block.mjs')));
 const options={banks:new Map([['seed',{raw:seed}]]),ledgerSources:new Map([[ledger.roundId,ledgerRaw]]),now:Date.parse(event.recordedAt)+60000};
 await parser.withBankParsingSession(isolated,async()=>{
  const initial=api.validateEvidenceLossCampaign([ledger],options);assert.equal(initial.ok,true,initial.errors.join(';'));
  for(const extra of [{manifest:{finalRelease:true}},{publicationState:{finalized:true}},{now:Date.parse(event.recordedAt)-1},{now:Date.parse('2026-10-17T00:00:00+09:00')}]){
   const result=api.validateEvidenceLossCampaign([ledger],{...options,...extra});assert.equal(result.ok,false);assert.match(result.errors.join(';'),/time|freeze/);
  }
  await assert.rejects(api.loadEvidenceLossDependencies(path.join(isolated,'wrong-root'),{now:options.now}),/ENOENT/);
  const malformed=new Map([['seed',{raw:Buffer.from('{')}]]);assert.equal(api.validateEvidenceLossCampaign([ledger],{...options,banks:malformed}).ok,false);
  await fs.appendFile(path.join(isolated,pin.path),' ');
  const changed=api.validateEvidenceLossCampaign([ledger],options);assert.equal(changed.ok,false);assert.match(changed.errors.join(';'),/tampered/);
 });
});


test('special Buffer coercion and disguised shared-memory backing never enter the cache',async()=>{
 const custom=Buffer.from(raw);custom.toString=()=>'{"custom":true}';
 const shared=Buffer.from(new SharedArrayBuffer(raw.length));raw.copy(shared);
 Object.defineProperty(shared,'buffer',{value:new ArrayBuffer(raw.length)});
 await withBankParsingSession(root,()=>{
  assert.deepEqual(parseImmutableBank(custom),{custom:true});
  assert.notEqual(parseImmutableBank(custom),parseImmutableBank(custom));
  assert.notEqual(parseImmutableBank(shared),parseImmutableBank(shared));
  assert.equal(Object.isFrozen(parseImmutableBank(shared)),false);
 });
});


test('cross-realm shared backing remains excluded from representation reuse',async()=>{
 const {runInNewContext}=await import('node:vm');
 const shared=Buffer.from(runInNewContext('new SharedArrayBuffer('+raw.length+')'));raw.copy(shared);
 await withBankParsingSession(root,()=>{
  assert.notEqual(parseImmutableBank(shared),parseImmutableBank(shared));
  assert.equal(Object.isFrozen(parseImmutableBank(shared)),false);
 });
});


test('evidence-loss preserves its original implicit JSON coercion for unusual inputs',async()=>{
 const unusual=Buffer.from('{"questions":[],"options":[]}');unusual[Symbol.toPrimitive]=()=>'{';
 const options={banks:new Map([['unusual',{raw:unusual}]]),now:null};
 const plain=validateEvidenceLossCampaign([],options);assert.equal(plain.ok,false);
 await withBankParsingSession(root,()=>assert.deepEqual(validateEvidenceLossCampaign([],options),plain));
});

test('actual historical-audit entry wrapper isolates a nested root for the entire async operation (synthetic body)',async t=>{
 const {default:os}=await import('node:os');const {pathToFileURL}=await import('node:url');
 const source=await fs.readFile(path.join(root,'scripts/validate-round.mjs'),'utf8');
 const wrapper=source.match(/export async function auditHistoricalRelease\(root\) \{[\s\S]*?\n\}/)?.[0];
 assert.ok(wrapper,'Actual historical-audit entry must exist');
 // Test the exact production entry wrapper, substituting only an explicitly
 // synthetic asynchronous body. This is not historical release clearance.
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'audit-entry-scope-'));
 t.after(()=>fs.rm(temporary,{recursive:true,force:true}));
 const file=path.join(temporary,'entry.mjs');
 await fs.writeFile(file,`import {withBankParsingSession,parseImmutableBank} from ${JSON.stringify(pathToFileURL(path.join(root,'scripts/prepublication-quarantine.mjs')).href)};
let raw,fail=false;
export function configure(input, shouldFail=false){raw=input;fail=shouldFail;}
async function auditHistoricalReleaseInSession(root){
 const first=parseImmutableBank(raw);await Promise.resolve();
 const afterFinalSemanticStep=parseImmutableBank(raw);
 if(fail)throw new Error('synthetic audit failure');
 return {first,afterFinalSemanticStep};
}
${wrapper}
`);
 const api=await import(pathToFileURL(file));api.configure(raw);
 await withBankParsingSession(root,async()=>{
  const outer=parseImmutableBank(raw);
  const inner=await api.auditHistoricalRelease(path.join(root,'historical-other'));
  assert.notEqual(inner.first,outer);assert.equal(inner.first,inner.afterFinalSemanticStep);
  assert.equal(parseImmutableBank(raw),outer);
  assert.equal((await api.auditHistoricalRelease(root)).first,outer);
  api.configure(raw,true);await assert.rejects(api.auditHistoricalRelease(path.join(root,'historical-other')),/synthetic audit failure/);
  assert.equal(parseImmutableBank(raw),outer);
  api.configure(raw);assert.notEqual((await api.auditHistoricalRelease(path.join(root,'historical-other'))).first,inner.first);
 });
});
