import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {checkSources} from './source-checks.mjs';
const root=path.resolve(import.meta.dirname,'..');
execFileSync(process.execPath,[path.join(root,'scripts/validate-round.mjs'),'--release'],{stdio:'inherit'});
await checkSources(root);
