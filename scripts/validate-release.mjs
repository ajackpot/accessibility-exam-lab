import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {checkSources} from './source-checks.mjs';
import {assertCurrentReleaseWindow} from './release-window.mjs';
import {runtimeIdentity,sourceInventory,assertSameSnapshot} from './source-snapshot.mjs';

// One private invocation owns both inventories. There is no input proof, saved
// context, skip switch or alternate clock. Standalone validators stay complete.
if(process.argv.length!==2)throw new Error('Usage: npm run release:validate (no arguments or reusable proof inputs)');
const root=path.resolve(import.meta.dirname,'..');
const runtime=runtimeIdentity();
const before=await sourceInventory(root);
await assertCurrentReleaseWindow(root);
execFileSync(process.execPath,[path.join(root,'scripts/validate-round.mjs'),'--release'],{stdio:'inherit'});
await checkSources(root);
const after=await sourceInventory(root);
assertSameSnapshot(before,after,runtime,runtimeIdentity());
await assertCurrentReleaseWindow(root);
console.log('Consolidated release checks passed on an unchanged source/runtime snapshot. Full campaign CLI and source checks each executed once; internal historical gates remain intact. No tests, build, archive audit or remote publication are implied. Recheck at the actual action boundary.');
