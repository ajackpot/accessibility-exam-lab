import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const codec=path.resolve(import.meta.dirname,'../scripts/sevenz-codec.py');
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const fixture=[
  {name:'manifest.json',raw:Buffer.from('{"kind":"codec-test"}\n')},
  {name:'project/.nojekyll',raw:Buffer.alloc(0)},
  {name:'project/src/hello.js',raw:Buffer.from('export const hello="world";\n'.repeat(500))},
  {name:'project/.github/workflows/check.yml',raw:Buffer.from('name: check\n')},
  {name:'project/empty.txt',raw:Buffer.alloc(0)},
  {name:'project/binary.dat',raw:Buffer.from(Array.from({length:256},(_,i)=>i))},
];
function frame(entries) {
  const header=Buffer.from(JSON.stringify(entries.map(({name,raw})=>({name,bytes:raw.length,sha256:sha(raw)}))));
  const length=Buffer.alloc(4);length.writeUInt32LE(header.length);
  return Buffer.concat([length,header,...entries.map(e=>e.raw)]);
}
function run(mode,input) {
  return spawnSync('python3',[codec,mode],{input,maxBuffer:8*1024*1024,timeout:30_000});
}
function success(result) {
  assert.ifError(result.error);assert.equal(result.status,0,result.stderr?.toString());
  assert.equal(result.stderr.length,0);return result.stdout;
}
function reject(result) {
  assert.ifError(result.error);assert.notEqual(result.status,0);assert.equal(result.stdout.length,0);
  assert.match(result.stderr.toString(),/^7z codec: /);
}

test('stdlib 7z CLI is deterministic, solid, binary-safe and preserves empty files',()=>{
  const original=frame(fixture),archive=success(run('encode',original));
  assert.equal(archive.subarray(0,8).toString('hex'),'377abcaf271c0004');
  assert.ok(archive.length<original.length/4,'fixture must be compressed');
  assert.deepEqual(success(run('encode',original)),archive);
  const decoded=success(run('decode',archive));assert.deepEqual(decoded,original);
  const headerSize=decoded.readUInt32LE(0),entries=JSON.parse(decoded.subarray(4,4+headerSize));
  let offset=4+headerSize;
  for (const entry of entries) {
    assert.equal(sha(decoded.subarray(offset,offset+entry.bytes)),entry.sha256);offset+=entry.bytes;
  }
  assert.equal(offset,decoded.length);
  for (const entries of [[fixture[0]],[fixture[1],fixture[0]],[fixture[0],fixture[1]]])
    assert.deepEqual(success(run('decode',success(run('encode',frame(entries))))),frame(entries));
});

test('CLI reports invalid frames and damaged archives without emitting partial stdout',()=>{
  const original=frame(fixture),archive=success(run('encode',original));
  for (const input of [Buffer.alloc(0),original.subarray(0,3),original.subarray(0,-1),Buffer.concat([original,Buffer.from([0])])])
    reject(run('encode',input));
  const changed=Buffer.from(original);changed[changed.length-1]^=1;reject(run('encode',changed));
  for (const input of [Buffer.alloc(0),archive.subarray(0,31),archive.subarray(0,-1),Buffer.concat([archive,Buffer.from([0])])])
    reject(run('decode',input));
  for (const offset of [0,7,8,12,32,archive.length-3]) {
    const invalid=Buffer.from(archive);invalid[offset]^=1;reject(run('decode',invalid));
  }
  reject(run('encode',frame([])));reject(run('encode',frame([fixture[1]])));
  reject(run('unexpected-mode',original));
});

test('strict metadata rejects traversal, collisions, unsupported methods, attributes and forged limits before decompression',()=>{
  const result=spawnSync('python3',['-B','-c',String.raw`
import hashlib, json, lzma, runpy, struct, sys, unittest.mock as mock
c = runpy.run_path(sys.argv[1])
ns = c['decode'].__globals__
Invalid = c['InvalidArchive']
def fail(fn, message=None):
    try:
        fn()
    except Invalid as e:
        if message is not None: assert message.lower() in str(e).lower(), (message, str(e))
        return
    raise AssertionError('malicious input was accepted')
def bridge(records):
    meta = json.dumps([{'name': n, 'bytes': len(v), 'sha256': hashlib.sha256(v).hexdigest()} for n,v in records], separators=(',', ':')).encode()
    return struct.pack('<I',len(meta)) + meta + b''.join(v for _,v in records)
def archive(header, packed):
    start = struct.pack('<QQI',len(packed),len(header),c['crc'](header))
    return c['SIGNATURE'] + c['u32'](c['crc'](start)) + start + packed + header
records = [('manifest.json', b'first stream\n'), ('project/.nojekyll', b''), ('project/b.txt', b'last stream\n')]
valid = c['encode'](bridge(records))
packed_size = struct.unpack('<Q',valid[12:20])[0]
packed = valid[32:32+packed_size]
header = valid[32+packed_size:]
def reject_header(value):
    # Any attempt to instantiate the LZMA decoder for invalid metadata fails the test.
    with mock.patch.object(lzma, 'LZMADecompressor', side_effect=AssertionError('decompressed before metadata validation')):
        fail(lambda: c['decode'](archive(value,packed)))
def replace_once(old, new):
    assert header.count(old) == 1, old
    reject_header(header.replace(old,new,1))
# Original uint encoder/decoder checked across every 7z integer-width boundary.
for value in [0,1,127,128,255,16383,16384,(1<<64)-1] + [1<<i for i in range(64)]:
    r=c['Reader'](c['uint'](value));assert r.number()==value;r.done()
fail(lambda: c['Reader'](b'\x80\x01').number(),'Nonminimal')
# Metadata paths are inspected on read as well as on write.
unsafe=['../file','/file','C:/file','a\\b','a//b','a/./b','a/../b','a/','a.','a ',' a',
        'a/ b','a/b.','a/b ','CON','con.txt','AUX','nul','COM1.txt','LPT9','a:NUL',
        'CON .txt','CONIN$','conout$.txt','CLOCK$','a\x00b','a\nb','a\tb','a\x7fb','a?b','a*b','a<b','a>b','a|b','a"b','caf\u00e9','x'*1025]
for name in unsafe:
    fail(lambda n=name:c['encode'](bridge([(n,b'x')])),'path')
    forged=c['make_header']([name,'ok.txt'],[1,1],[0,0],len(packed),c['crc'](packed))
    reject_header(forged)
for names in [['same','same'],['same','SAME'],['a','a/b'],['A/b','a'],['a/B/c','A/b'],['project/A/x.txt','project/a/y.txt']]:
    fail(lambda n=names:c['encode'](bridge([(v,b'x') for v in n])))
    reject_header(c['make_header'](names,[1]*len(names),[0]*len(names),len(packed),c['crc'](packed)))
# Coder ID, dictionary, number of folders/coders, additional streams, encryption,
# encoded headers, external data, missing CRC and every unrecognized property.
replace_once(b'\x01\x04\x06', b'\x17\x04\x06')
replace_once(b'\x01\x04\x06', b'\x01\x03\x06')
replace_once(b'\x07\x0b\x01\x00\x01\x21\x21\x01\x1c\x0c', b'\x07\x0b\x01\x00\x01\x21\x00\x01\x1c\x0c')
for prop in [0,27,29,40,255]:
    replace_once(b'\x21\x21\x01\x1c',b'\x21\x21\x01'+bytes([prop]))
for coder in [b'\x24\x06\xf1\x07\x01\x01\x1c',b'\x01\x21',b'\x31\x21\x02\x01\x01\x1c']:
    replace_once(b'\x21\x21\x01\x1c',coder)
replace_once(b'\x07\x0b\x01\x00\x01',b'\x07\x0b\x02\x00\x01')
replace_once(b'\x07\x0b\x01\x00\x01',b'\x07\x0b\x01\x01\x01')
replace_once(b'\x07\x0b\x01\x00\x01',b'\x07\x0b\x01\x00\x02')
replace_once(b'\x0e\x01\x40',b'\x0e\x01\x41') # Nonzero padding bit.
replace_once(b'\x0f\x01\x80',b'\x0f\x01\x00') # Directory, not empty file.
replace_once(b'\x15\x0e\x01\x00'+c['u32'](0x20)*3,b'\x15\x0e\x01\x00'+c['u32'](0x10)*3)
replace_once('manifest.json'.encode('utf-16le'), b'\x00\xd8'+ 'anifest.json'.encode('utf-16le'))
replace_once(b'\x15\x0e\x01\x00'+c['u32'](0x20)*3,b'\x15\x0e\x01\x00'+c['u32'](0xa1ff8020)*3)
replace_once(b'\x15\x0e\x01\x00'+c['u32'](0x20)*3,b'\x15\x0e\x01\x01'+c['u32'](0x20)*3)
replace_once(b'\x08\x0d\x02',b'\x08\x0d\x00')
replace_once(b'\x08\x0d\x02',b'\x08\x0d'+c['uint'](4097))
replace_once(b'\x00\x00\x05\x03',b'\x00\x00\x05'+c['uint'](4097))
replace_once(b'\x06\x00\x01',b'\x06\x80\x00\x01')
replace_once(b'\x06\x00\x01',b'\x06\x00\x02')
replace_once(b'\x06\x00\x01',b'\x06\x01\x01')
replace_once(b'\x0c'+c['uint'](25),b'\x0c'+c['uint'](c['MAX_TOTAL']+1))
reject_header(header[:-1]+b'\x12\x00\x00')
reject_header(header+b'\x00')
reject_header(header[:-2])
# Zero/oversized files, overlong JSON, malformed UTF-16 and duplicate JSON keys.
reject_header(c['make_header'](['big'],[c['MAX_FILE']+1],[0],len(packed),c['crc'](packed)))
fail(lambda:c['validate_sizes']([c['MAX_FILE']]*17),'total')
fail(lambda:c['validate_sizes']([-1]),'per-file')
fail(lambda:c['validate_sizes']([True]),'per-file')
fail(lambda:c['validate_names'](['x'+str(i) for i in range(4097)]),'count')
fail(lambda:c['parse_frame'](c['u32'](c['MAX_HEADER']+1)), 'header')
meta=b'[{"name":"x","name":"y","bytes":1,"sha256":"'+b'0'*64+b'"}]'
fail(lambda:c['parse_frame'](c['u32'](len(meta))+meta+b'x'),'Duplicate')
meta=b'['*5000
fail(lambda:c['parse_frame'](c['u32'](len(meta))+meta),'JSON')
# Check maximum header and archive sizes cheaply, without allocating huge files.
with mock.patch.dict(ns,{'MAX_ARCHIVE':len(valid)-1}):fail(lambda:c['decode'](valid),'size')
with mock.patch.dict(ns,{'MAX_HEADER':len(header)-1}):fail(lambda:c['decode'](valid),'header')
# Bad pack CRC, substream CRC and claimed length with repaired outer CRCs.
bad=bytearray(packed);bad[0]^=1
fail(lambda:c['decode'](archive(header,bad)),'packed-stream CRC')
wrong_crc=c['make_header']([n for n,_ in records],[len(v) for _,v in records],[0]*3,len(packed),c['crc'](packed))
fail(lambda:c['decode'](archive(wrong_crc,packed)),'file CRC')
for sizes in [[1,0,1],[14,0,13]]:
    claimed=c['make_header']([n for n,_ in records],sizes,[0]*3,len(packed),c['crc'](packed))
    fail(lambda:c['decode'](archive(claimed,packed)))
# Valid LZMA2 stream with an appended second stream / garbage is never accepted.
for extra in [b'\x00',packed,b'garbage']:
    p=packed+extra
    h=c['make_header']([n for n,_ in records],[len(v) for _,v in records],[c['crc'](v) for _,v in records],len(p),c['crc'](p))
    fail(lambda:c['decode'](archive(h,p)),'Trailing')
# A complete but truncated raw stream has valid outer CRCs, yet must fail EOF.
p=packed[:-1]
h=c['make_header']([n for n,_ in records],[len(v) for _,v in records],[c['crc'](v) for _,v in records],len(p),c['crc'](p))
fail(lambda:c['decode'](archive(h,p)),'Truncated')
# Compressed expansion is bounded to declared size+one sentinel, in <=1MiB chunks.
bomb=lzma.compress(b'a'*(2*c['CHUNK']),format=lzma.FORMAT_RAW,filters=c['FILTERS'])
h=c['make_header'](['bomb'],[1],[0],len(bomb),c['crc'](bomb))
fail(lambda:c['decode'](archive(h,bomb)),'exceeds declared')
print('strict metadata and bounded-decompression adversarial checks passed')
`,codec],{encoding:'utf8',maxBuffer:1024*1024,timeout:30_000});
  assert.ifError(result.error);assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/adversarial checks passed/);
});
