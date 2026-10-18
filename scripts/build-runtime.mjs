import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {readBankInput} from './bank-io.mjs';

// A local browser preview, never the public/COMPLETE project allow-list.
export const RUNTIME_ASSETS=Object.freeze([
  'index.html','style.css','docs/NVDA-CHECKLIST.md',
  'src/app.js','src/backup.js','src/domain.js','src/legacy-materials.js',
  'src/legacy-question-display.js','src/new-session-eligibility.js',
  'src/reviewed-option-explanations.js','src/storage.js','src/workflows.js'
]);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const inside=(parent,child)=>{const relative=path.relative(parent,child);return relative===''||(!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative));};
const sameFiles=(a,b)=>a.length===b.length&&a.every((file,index)=>file.path===b[index].path&&file.raw.equals(b[index].raw));

async function directoryWithoutLinks(directory) {
  const absolute=path.resolve(directory),parsed=path.parse(absolute);let current=parsed.root;
  for(const segment of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current=path.join(current,segment);const info=await fs.lstat(current);
    if(!info.isDirectory()||info.isSymbolicLink())throw new Error(`Not a plain directory: ${current}`);
  }
  return absolute;
}
async function readRegular(root,relative) {
  if(typeof relative!=='string'||relative.includes('\\')||relative.split('/').some(part=>!part||part==='.'||part==='..')||path.posix.isAbsolute(relative))throw new Error('Unsafe runtime asset path.');
  const filename=path.join(root,...relative.split('/'));await directoryWithoutLinks(path.dirname(filename));
  const info=await fs.lstat(filename);
  if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1)throw new Error(`Runtime asset must be a plain, unlinked file: ${relative}`);
  const raw=await fs.readFile(filename);
  return {path:relative,bytes:raw.length,sha256:digest(raw),raw};
}
async function outputPaths(root,relative='') {
  const files=[];
  for(const entry of await fs.readdir(path.join(root,relative),{withFileTypes:true})) {
    const child=relative?`${relative}/${entry.name}`:entry.name;
    if(entry.isDirectory())files.push(...await outputPaths(root,child));
    else if(entry.isFile())files.push(child);
    else throw new Error(`Unexpected output entry: ${child}`);
  }
  return files.sort();
}

export async function validateRuntimeDestination(root,output) {
  root=await directoryWithoutLinks(root);
  if(typeof output!=='string'||!output.trim())throw new Error('A new output directory is required.');
  const destination=path.resolve(output);
  if(inside(root,destination)||inside(destination,root))throw new Error('Runtime output and source tree must not overlap.');
  await directoryWithoutLinks(path.dirname(destination));
  try {await fs.lstat(destination);}catch(error){if(error.code==='ENOENT')return destination;throw error;}
  throw new Error('Runtime output already exists; it will not be overwritten or removed.');
}

/** Read-only selection. Publication/build checks remain mandatory in writeRuntimeOutput. */
export async function collectRuntimeAssets(root) {
  root=await directoryWithoutLinks(root);
  const manifestFile=await readRegular(root,'data/manifest.json');
  const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(manifestFile.raw));
  if(manifest.schemaVersion!==1||typeof manifest.bankVersion!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(manifest.bankVersion)||manifest.file!==`releases/${manifest.bankVersion}/bank.json`||!/^[a-f0-9]{64}$/.test(manifest.sha256))throw new Error('Invalid active runtime manifest path or hash.');
  const bankFile=await readRegular(root,`data/${manifest.file}`);
  if(bankFile.sha256!==manifest.sha256)throw new Error('Active runtime bank hash mismatch.');
  const files=[manifestFile,bankFile];
  for(const relative of RUNTIME_ASSETS)files.push(await readRegular(root,relative));
  files.sort((a,b)=>a.path.localeCompare(b.path,'en'));
  if(new Set(files.map(file=>file.path.toLowerCase())).size!==files.length)throw new Error('Runtime asset path collision.');
  return {manifest,files};
}

export async function writeRuntimeOutput(root,output) {
  root=await directoryWithoutLinks(root);
  const destination=await validateRuntimeDestination(root,output);
  const before=await collectRuntimeAssets(root);
  // Same active-bank/trust/history/authoring gate as the unchanged ordinary build.
  const validated=await readBankInput(root);
  if(JSON.stringify(validated.manifest)!==JSON.stringify(before.manifest))throw new Error('Active manifest changed during runtime preparation.');
  const after=await collectRuntimeAssets(root);
  if(!sameFiles(before.files,after.files))throw new Error('Runtime input changed during validation.');
  await validateRuntimeDestination(root,destination);
  await fs.mkdir(destination,{mode:0o700});
  try {
    for(const file of before.files) {
      const target=path.join(destination,...file.path.split('/'));
      await fs.mkdir(path.dirname(target),{recursive:true,mode:0o755});
      await directoryWithoutLinks(path.dirname(target));
      await fs.writeFile(target,file.raw,{flag:'wx',mode:0o644});
      const restored=await readRegular(destination,file.path);
      if(!restored.raw.equals(file.raw))throw new Error(`Runtime output byte mismatch: ${file.path}`);
    }
    if(!sameFiles(before.files,(await collectRuntimeAssets(root)).files))throw new Error('Runtime input changed during output creation.');
    if(JSON.stringify(await outputPaths(destination))!==JSON.stringify(before.files.map(file=>file.path).sort()))throw new Error('Runtime output file set mismatch.');
  } catch(error) {
    throw new Error(`Runtime output failed; partial directory retained at ${destination}. ${error.message}`,{cause:error});
  }
  return {kind:'local_runtime_preview_not_complete_project',publicationReady:false,output:destination,bankVersion:before.manifest.bankVersion,fileCount:before.files.length,totalBytes:before.files.reduce((sum,file)=>sum+file.bytes,0),files:before.files.map(({raw,...file})=>file)};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const args=process.argv.slice(2);
  if(args.length!==1||args[0].startsWith('-'))throw new Error('Usage: npm run build:runtime -- <new-directory-outside-source>. Local preview only; not a COMPLETE project or approved public deployment.');
  console.log(JSON.stringify(await writeRuntimeOutput(path.resolve(import.meta.dirname,'..'),args[0]),null,2));
}
