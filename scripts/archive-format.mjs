/** Versioned transport only. Browser/runtime/data schemas are not involved.
 * The 7z profile uses Python 3's standard-library lzma; no installation or restore
 * script is required to open the resulting archive with a normal 7z extractor. */
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {parsePublicAllowlist} from './download-fallback.mjs';
export const ARCHIVE_LIMITS=Object.freeze({archiveBytes:128*1024*1024,fileBytes:32*1024*1024,totalBytes:512*1024*1024,entries:4096,headerBytes:2*1024*1024,dictionaryBytes:64*1024*1024});
const signature=Buffer.from('377abcaf271c','hex');
const hash=b=>createHash('sha256').update(b).digest('hex');
const fail=m=>{throw Error(m);};
const completeKeys=['schemaVersion','kind','deliveryMode','newlyPublishedRegular','projectDirectory','prerequisiteArtifacts','sourceRelease','frozenSourceInventory','packagingRevision','files'];
/** Absence is permitted only for the unchanged historical schema-v1 ZIP contract. */
export function completeManifestFormat(m){
 const format=m?.schemaVersion===1?'zip':m?.schemaVersion===2&&m.archiveFormat==='7z'?'7z':null;
 if(!format||!isDeepStrictEqual(Object.keys(m).sort(),[...completeKeys,...(format==='7z'?['archiveFormat']:[])].sort())||m.kind!=='complete_project_not_learner_import')fail('Unsupported complete manifest schema or archive format');
 return format;
}
export function archiveSignature(raw){
 if(!Buffer.isBuffer(raw)||raw.length>ARCHIVE_LIMITS.archiveBytes)fail('Invalid archive bytes or archive size limit exceeded');
 if(raw.length>=6&&raw.subarray(0,6).equals(signature))return '7z';
 if(raw.length>=4&&raw.readUInt32LE(0)===0x04034b50)return 'zip';
 fail('Unsupported archive signature');
}
function safeNames(names){
 if(!Array.isArray(names)||!names.length||names.length>ARCHIVE_LIMITS.entries)fail('Archive entry count limit exceeded');
 const seen=new Set(),components=new Map();
 for(const name of names){
  if(typeof name!=='string'||name.length>1024||!/^[\x21-\x7e]+$/.test(name)||/[<>:"|?*\\]/.test(name)||name.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))fail('Unsafe archive path');
  parsePublicAllowlist(name.replace(/^(?:files|project)\//,''));
  for(let at=1;at<=name.split('/').length;at++){const exact=name.split('/').slice(0,at).join('/'),folded=exact.toLowerCase();if(components.has(folded)&&components.get(folded)!==exact)fail('Case-colliding archive directory component');components.set(folded,exact);}
  const key=name.toLowerCase();if(seen.has(key))fail('Duplicate or case-colliding archive path');seen.add(key);
 }
 for(const name of seen){const parts=name.split('/');parts.pop();while(parts.length){if(seen.has(parts.join('/')))fail('Archive file/directory path collision');parts.pop();}}
}
function frame(entries){
 safeNames(entries.map(e=>e.name));let total=0;
 const header=Buffer.from(JSON.stringify(entries.map(e=>{if(!Buffer.isBuffer(e.raw)||e.raw.length>ARCHIVE_LIMITS.fileBytes)fail('Archive per-file size limit exceeded');total+=e.raw.length;return {name:e.name,bytes:e.raw.length,sha256:hash(e.raw)};})));
 if(total>ARCHIVE_LIMITS.totalBytes||header.length>ARCHIVE_LIMITS.headerBytes)fail('Archive total or metadata size limit exceeded');
 const length=Buffer.alloc(4);length.writeUInt32LE(header.length);return Buffer.concat([length,header,...entries.map(e=>e.raw)]);
}
function unframe(raw){
 if(!Buffer.isBuffer(raw)||raw.length<4)fail('Truncated 7z codec response');const n=raw.readUInt32LE(0);
 if(n>ARCHIVE_LIMITS.headerBytes||n>raw.length-4)fail('Invalid 7z codec metadata limit');
 const descriptors=JSON.parse(raw.subarray(4,4+n).toString('utf8'));
 if(!Array.isArray(descriptors))fail('Invalid 7z codec inventory');safeNames(descriptors.map(e=>e.name));
 let at=4+n,total=0;const entries=new Map();
 for(const e of descriptors){
  if(!isDeepStrictEqual(Object.keys(e).sort(),['bytes','name','sha256'])||!Number.isSafeInteger(e.bytes)||e.bytes<0||e.bytes>ARCHIVE_LIMITS.fileBytes||!/^[a-f0-9]{64}$/.test(e.sha256))fail('Invalid 7z codec file descriptor');
  total+=e.bytes;if(total>ARCHIVE_LIMITS.totalBytes||at+e.bytes>raw.length)fail('Invalid 7z codec decoded size');
  const b=raw.subarray(at,at+e.bytes);if(hash(b)!==e.sha256)fail('7z codec decoded file hash mismatch');entries.set(e.name,b);at+=e.bytes;
 }
 if(at!==raw.length)fail('Trailing 7z codec response bytes');return entries;
}
function codec(mode,input){
 const executable=process.platform==='win32'?'python':'python3';
 const result=spawnSync(executable,[path.join(import.meta.dirname,'sevenz-codec.py'),mode],{input,maxBuffer:ARCHIVE_LIMITS.totalBytes+ARCHIVE_LIMITS.headerBytes+4,timeout:180_000,windowsHide:true});
 if(result.error)fail(`7z tooling requires Python 3 with its standard-library lzma module: ${result.error.message}`);
 if(result.status!==0)fail(`7z ${mode} validation failed: ${(result.stderr??Buffer.alloc(0)).toString('utf8').trim().slice(0,2000)}`);
 return result.stdout;
}
export function encodeSevenZip(entries){const raw=codec('encode',frame(entries));if(archiveSignature(raw)!=='7z')fail('7z writer returned another format');return raw;}
export function decodeSevenZip(raw){if(archiveSignature(raw)!=='7z')fail('7z signature required');return unframe(codec('decode',raw));}
/** Authenticates the discriminator against actual container bytes. No fallback on error. */
export function verifyArchiveFormat(entries,format){
 const raw=entries.get('manifest.json');if(!raw)fail('Archive manifest missing');
 const m=JSON.parse(raw.toString('utf8'));
 if(!raw.equals(Buffer.from(JSON.stringify(m,null,2)+'\n')))fail('Canonical exact archive manifest required');
 if(m.kind==='complete_project_not_learner_import'){
  if(completeManifestFormat(m)!==format)fail('Complete manifest/container format mismatch');
 }else if(m.kind!=='developer_patch_not_learner_import'||format!=='zip'||Object.hasOwn(m,'archiveFormat'))fail('DELTA must retain its ZIP contract');
 safeNames([...entries.keys()]);
 return m;
}
